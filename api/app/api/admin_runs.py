"""
Admin run management endpoints.

POST  /admin/clients/{client_id}/runs/trigger  — start a new run
GET   /admin/clients/{client_id}/runs          — paginated run history
GET   /admin/clients/{client_id}/runs/{run_id} — run detail (reuses aggregator)
GET   /admin/clients/{client_id}/runs/{run_id}/prompts — per-prompt drill-down
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_dependencies import get_current_admin
from app.db import AsyncSessionLocal, get_db
from app.models.admin_user import AdminUser
from app.models.analysis import Analysis
from app.models.client import Client
from app.models.response import Response
from app.models.run import Run, RunStatus
from app.schemas.aggregator import PromptDetail, RunSummaryResponse
from app.schemas.run import RunRead
from app.services.aggregator import compute_run_summary, get_prompt_details
from app.services.audit_service import log_audit
from app.services.pipeline import run_pipeline
from app.services.run_orchestrator import start_run

router = APIRouter(
    prefix="/admin/clients/{client_id}/runs",
    tags=["admin-runs"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_client_or_404(client_id: uuid.UUID, db: AsyncSession) -> Client:
    client = (
        await db.execute(select(Client).where(Client.id == client_id))
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


async def _get_run_for_client(
    run_id: uuid.UUID, client_id: uuid.UUID, db: AsyncSession
) -> Run:
    run = (
        await db.execute(
            select(Run).where(Run.id == run_id, Run.client_id == client_id)
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


# ── Schemas ───────────────────────────────────────────────────────────────────

class RunSummaryOut(BaseModel):
    id: uuid.UUID
    status: str
    total_prompts: int
    completed_prompts: int
    created_at: datetime
    updated_at: datetime
    overall_citation_rate: float | None = None

    model_config = {"from_attributes": False}


class RunListResponse(BaseModel):
    items: list[RunSummaryOut]
    total: int
    page: int
    per_page: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/trigger", response_model=RunRead, status_code=status.HTTP_201_CREATED)
async def trigger_run(
    client_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> RunRead:
    await _get_client_or_404(client_id, db)

    try:
        run = await start_run(client_id, db)
        await db.flush()
        await log_audit(
            db,
            client_id=client_id,
            action="run_triggered",
            entity_type="run",
            entity_id=run.id,
            actor=admin.email,
            details={"total_prompts": run.total_prompts},
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    background_tasks.add_task(
        run_pipeline,
        run_id=run.id,
        client_id=run.client_id,
        session_factory=AsyncSessionLocal,
    )

    return RunRead.model_validate(run)


@router.get("", response_model=RunListResponse)
async def list_runs(
    client_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> RunListResponse:
    await _get_client_or_404(client_id, db)

    total = (
        await db.execute(
            select(func.count()).where(Run.client_id == client_id)
        )
    ).scalar_one()

    offset = (page - 1) * per_page
    runs = (
        await db.execute(
            select(Run)
            .where(Run.client_id == client_id)
            .order_by(Run.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    items: list[RunSummaryOut] = []
    for run in runs:
        # Compute citation rate for completed runs
        rate: float | None = None
        if run.status == RunStatus.completed:
            total_a = (
                await db.execute(
                    select(func.count(Analysis.id))
                    .join(Response, Analysis.response_id == Response.id)
                    .where(Response.run_id == run.id)
                )
            ).scalar_one()
            cited_a = (
                await db.execute(
                    select(func.count(Analysis.id))
                    .join(Response, Analysis.response_id == Response.id)
                    .where(Response.run_id == run.id, Analysis.client_cited.is_(True))
                )
            ).scalar_one()
            rate = round(cited_a / total_a, 4) if total_a else 0.0

        items.append(
            RunSummaryOut(
                id=run.id,
                status=run.status.value,
                total_prompts=run.total_prompts,
                completed_prompts=run.completed_prompts,
                created_at=run.created_at,
                updated_at=run.updated_at,
                overall_citation_rate=rate,
            )
        )

    return RunListResponse(items=items, total=total, page=page, per_page=per_page)


@router.get("/{run_id}", response_model=RunSummaryResponse)
async def get_run(
    client_id: uuid.UUID,
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> RunSummaryResponse:
    await _get_run_for_client(run_id, client_id, db)
    return await compute_run_summary(run_id, db)


@router.get("/{run_id}/prompts", response_model=list[PromptDetail])
async def get_run_prompts(
    client_id: uuid.UUID,
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> list[PromptDetail]:
    await _get_run_for_client(run_id, client_id, db)
    return await get_prompt_details(run_id, db)
