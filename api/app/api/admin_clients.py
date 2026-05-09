"""
Admin client management endpoints.

POST   /admin/clients                       — create client
GET    /admin/clients                       — list clients (with computed fields)
GET    /admin/clients/{client_id}           — client detail
PUT    /admin/clients/{client_id}           — partial update
PATCH  /admin/clients/{client_id}/status   — change status
"""
import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_dependencies import get_current_admin
from app.db import get_db
from app.models.admin_user import AdminUser
from app.models.client import Client
from app.models.client_knowledge_base import ClientKnowledgeBase
from app.models.competitor import Competitor
from app.models.prompt import Prompt
from app.models.run import Run, RunStatus
from app.services.audit_service import log_audit

router = APIRouter(prefix="/admin/clients", tags=["admin-clients"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:100]


async def _get_client_or_404(client_id: uuid.UUID, db: AsyncSession) -> Client:
    client = (
        await db.execute(select(Client).where(Client.id == client_id))
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


# ── Schemas ───────────────────────────────────────────────────────────────────

class ClientCreateRequest(BaseModel):
    name: str
    slug: str | None = None
    industry: str | None = None
    website: str | None = None
    config: dict[str, Any] = {}


class ClientUpdateRequest(BaseModel):
    name: str | None = None
    industry: str | None = None
    website: str | None = None
    config: dict[str, Any] | None = None
    timezone: str | None = None


class StatusUpdateRequest(BaseModel):
    status: str


class KnowledgeBaseOut(BaseModel):
    brand_profile: dict
    target_audience: dict
    brand_voice: dict
    industry_context: dict
    version: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    industry: str | None
    website: str | None
    status: str
    config: dict
    created_at: datetime
    updated_at: datetime
    # Timezone
    timezone: str = "UTC"
    # Schedule fields — always included so overview/detail can read them
    schedule_enabled: bool = False
    schedule_cadence: str = "manual"
    schedule_hour: int = 2
    schedule_minute: int = 0
    schedule_day_of_week: int | None = None
    next_scheduled_run_at: datetime | None = None
    last_scheduled_run_at: datetime | None = None

    model_config = {"from_attributes": True}


class ClientSummaryOut(ClientOut):
    total_prompts: int = 0
    total_competitors: int = 0
    last_run_at: datetime | None = None
    last_run_status: str | None = None
    latest_citation_rate: float | None = None


class ClientDetailOut(ClientOut):
    knowledge_base: KnowledgeBaseOut | None = None
    total_prompts: int = 0
    total_competitors: int = 0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> ClientOut:
    slug = body.slug or _slugify(body.name)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not generate a valid slug from the provided name",
        )

    existing = (
        await db.execute(select(Client).where(Client.slug == slug))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A client with slug '{slug}' already exists",
        )

    client = Client(
        name=body.name,
        slug=slug,
        industry=body.industry,
        website=body.website,
        status="active",
        config=body.config or {},
        created_by=admin.id,
    )
    db.add(client)
    await db.flush()

    # Always create an empty knowledge base row alongside the client
    kb = ClientKnowledgeBase(client_id=client.id)
    db.add(kb)

    await log_audit(
        db,
        client_id=client.id,
        action="client_created",
        entity_type="client",
        entity_id=client.id,
        actor=admin.email,
        details={"name": body.name, "slug": slug},
    )

    await db.commit()
    await db.refresh(client)
    return ClientOut.model_validate(client)


@router.get("", response_model=list[ClientSummaryOut])
async def list_clients(
    status_filter: str | None = Query(default="active", alias="status"),
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> list[ClientSummaryOut]:
    q = select(Client).order_by(Client.name)
    if status_filter:
        q = q.where(Client.status == status_filter)
    clients = (await db.execute(q)).scalars().all()

    result: list[ClientSummaryOut] = []
    for c in clients:
        prompt_count = (
            await db.execute(
                select(func.count()).where(Prompt.client_id == c.id)
            )
        ).scalar_one()

        competitor_count = (
            await db.execute(
                select(func.count()).where(Competitor.client_id == c.id)
            )
        ).scalar_one()

        latest_run = (
            await db.execute(
                select(Run)
                .where(Run.client_id == c.id)
                .order_by(Run.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        result.append(
            ClientSummaryOut(
                **ClientOut.model_validate(c).model_dump(),
                total_prompts=prompt_count,
                total_competitors=competitor_count,
                last_run_at=latest_run.created_at if latest_run else None,
                last_run_status=latest_run.status.value if latest_run else None,
            )
        )

    return result


@router.get("/{client_id}", response_model=ClientDetailOut)
async def get_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> ClientDetailOut:
    client = await _get_client_or_404(client_id, db)

    prompt_count = (
        await db.execute(select(func.count()).where(Prompt.client_id == client_id))
    ).scalar_one()
    competitor_count = (
        await db.execute(select(func.count()).where(Competitor.client_id == client_id))
    ).scalar_one()

    kb = (
        await db.execute(
            select(ClientKnowledgeBase).where(ClientKnowledgeBase.client_id == client_id)
        )
    ).scalar_one_or_none()

    return ClientDetailOut(
        **ClientOut.model_validate(client).model_dump(),
        knowledge_base=KnowledgeBaseOut.model_validate(kb) if kb else None,
        total_prompts=prompt_count,
        total_competitors=competitor_count,
    )


@router.put("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: uuid.UUID,
    body: ClientUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> ClientOut:
    client = await _get_client_or_404(client_id, db)

    changes: dict = {}
    for field, new_val in body.model_dump(exclude_none=True).items():
        old_val = getattr(client, field)
        if old_val != new_val:
            changes[field] = {"old": old_val, "new": new_val}
            setattr(client, field, new_val)

    if changes:
        await log_audit(
            db,
            client_id=client_id,
            action="client_updated",
            entity_type="client",
            entity_id=client_id,
            actor=admin.email,
            details={"changes": changes},
        )
        await db.commit()
        await db.refresh(client)

    return ClientOut.model_validate(client)


@router.patch("/{client_id}/status", response_model=ClientOut)
async def update_status(
    client_id: uuid.UUID,
    body: StatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> ClientOut:
    if body.status not in ("active", "paused", "archived"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be one of: active, paused, archived",
        )

    client = await _get_client_or_404(client_id, db)
    old_status = client.status
    client.status = body.status

    await log_audit(
        db,
        client_id=client_id,
        action="client_status_changed",
        entity_type="client",
        entity_id=client_id,
        actor=admin.email,
        details={"old_status": old_status, "new_status": body.status},
    )
    await db.commit()
    await db.refresh(client)
    return ClientOut.model_validate(client)
