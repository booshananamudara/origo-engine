"""
Global (system-wide) admin settings.

GET /admin/settings/model-config   — read the global AI model + engine config
                                     (any admin)
PUT /admin/settings/model-config   — update it and apply it to every client
                                     (super_admin only)

The global config lives in the singleton `system_settings` table and has the
same shape as a client's platform_model_config. Saving it overwrites every
client's platform_model_config with the global config — one client-scoped write
per client — and new clients inherit it. The per-client endpoint is untouched.
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_dependencies import get_current_admin, require_role
from app.db import get_db
from app.models.admin_user import AdminUser
from app.models.client import Client
from app.models.system_setting import SystemSetting
from app.platforms.model_registry import resolve_model_config, validate_model_config
from app.services.audit_service import log_audit

logger = structlog.get_logger()

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_settings(db: AsyncSession) -> SystemSetting:
    """Return the singleton settings row, creating it (empty config = system
    defaults) if it does not exist yet."""
    row = (
        await db.execute(select(SystemSetting).where(SystemSetting.id == 1))
    ).scalar_one_or_none()
    if row is None:
        row = SystemSetting(id=1, default_model_config={})
        db.add(row)
        await db.flush()
    return row


# ── Schemas ───────────────────────────────────────────────────────────────────

class ModelConfig(BaseModel):
    config: dict[str, str]


class UpdateModelConfigResponse(BaseModel):
    config: dict[str, str]
    clients_updated: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/model-config", response_model=ModelConfig)
async def get_global_model_config(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> ModelConfig:
    row = await _get_or_create_settings(db)
    await db.commit()
    return ModelConfig(config=resolve_model_config(row.default_model_config))


@router.put("/model-config", response_model=UpdateModelConfigResponse)
async def update_global_model_config(
    body: ModelConfig,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role("super_admin")),
) -> UpdateModelConfigResponse:
    errors = validate_model_config(body.config)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="; ".join(errors),
        )

    # Persist the new global config.
    row = await _get_or_create_settings(db)
    row.default_model_config = body.config

    # Apply it to every client by overwriting each client's per-client model
    # field. Each write is scoped to that single client.
    clients = (await db.execute(select(Client))).scalars().all()
    for client in clients:
        client.platform_model_config = dict(body.config)
        await log_audit(
            db,
            client_id=client.id,
            action="platform_config_updated",
            entity_type="client",
            entity_id=client.id,
            actor=admin.email,
            details={"source": "global_model_config"},
        )

    await db.commit()
    logger.info(
        "global_model_config_updated",
        actor=admin.email,
        clients_updated=len(clients),
    )
    return UpdateModelConfigResponse(config=body.config, clients_updated=len(clients))
