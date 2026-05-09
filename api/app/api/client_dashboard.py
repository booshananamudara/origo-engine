"""
Client dashboard endpoints — read-only, tenant-scoped to the JWT client_id.

ALL queries filter by client_id from the JWT. The client_id is NEVER taken
from URL parameters or the request body. Returning 404 (not 403) when a
run_id belongs to a different client prevents cross-tenant existence leakage.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.client_dependencies import get_client_id_from_token, get_current_client_user
from app.db import get_db
from app.models.analysis import Analysis, Prominence, Sentiment
from app.models.client import Client
from app.models.competitor import Competitor
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus
from app.schemas.aggregator import PromptDetail, RunSummaryResponse
from app.services.aggregator import compute_run_summary, get_prompt_details

router = APIRouter(prefix="/client/dashboard", tags=["client-dashboard"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_run(
    run_id_str: str, client_id: str, db: AsyncSession
) -> Run:
    """Fetch run, validate it belongs to this client. Returns 404 either way."""
    try:
        run_id = uuid.UUID(run_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    run = (
        await db.execute(select(Run).where(Run.id == run_id))
    ).scalar_one_or_none()

    if run is None or str(run.client_id) != client_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    return run


# ── Schemas ───────────────────────────────────────────────────────────────────

class RunTrendPoint(BaseModel):
    run_id: uuid.UUID
    date: datetime
    citation_rate: float


class DashboardSummary(BaseModel):
    client_name: str
    latest_run_id: uuid.UUID | None
    latest_run_status: str | None
    latest_run_date: datetime | None
    latest_citation_rate: float | None
    visibility_score: float | None
    citation_rate_trend: list[RunTrendPoint]
    total_prompts: int
    total_runs: int
    # Schedule info
    schedule_enabled: bool
    schedule_cadence: str
    next_scheduled_run_at: datetime | None


class RunListItem(BaseModel):
    id: uuid.UUID
    status: str
    total_prompts: int
    completed_prompts: int
    created_at: datetime
    overall_citation_rate: float | None


class RunListResponse(BaseModel):
    runs: list[RunListItem]
    total: int
    page: int
    per_page: int


class CompetitorOut(BaseModel):
    id: uuid.UUID
    name: str


# ── Visibility score computation ──────────────────────────────────────────────

async def _compute_visibility(run_id: uuid.UUID, db: AsyncSession) -> float | None:
    """
    Visibility score = (
        0.40 * overall_citation_rate +
        0.25 * primary_citation_rate +
        0.20 * positive_sentiment_rate +
        0.15 * platform_coverage_rate
    ) * 100
    """
    rows = (
        await db.execute(
            select(Analysis, Response)
            .join(Response, Analysis.response_id == Response.id)
            .where(Response.run_id == run_id)
        )
    ).all()

    if not rows:
        return None

    total = len(rows)
    cited_rows = [a for a, _ in rows if a.client_cited]
    cited = len(cited_rows)

    overall_rate = cited / total
    primary_rate = sum(1 for a, _ in rows if a.client_prominence == Prominence.primary) / total
    positive_rate = (
        sum(1 for a in cited_rows if a.client_sentiment == Sentiment.positive) / cited
        if cited else 0.0
    )
    platforms_with_citation = {
        r.platform for a, r in rows if a.client_cited
    }
    platform_coverage = len(platforms_with_citation) / len(Platform)

    score = (
        0.40 * overall_rate
        + 0.25 * primary_rate
        + 0.20 * positive_rate
        + 0.15 * platform_coverage
    ) * 100

    return round(score, 1)


async def _citation_rate_for_run(run_id: uuid.UUID, db: AsyncSession) -> float:
    total = (
        await db.execute(
            select(func.count(Analysis.id))
            .join(Response, Analysis.response_id == Response.id)
            .where(Response.run_id == run_id)
        )
    ).scalar_one()

    if total == 0:
        return 0.0

    cited = (
        await db.execute(
            select(func.count(Analysis.id))
            .join(Response, Analysis.response_id == Response.id)
            .where(Response.run_id == run_id, Analysis.client_cited.is_(True))
        )
    ).scalar_one()

    return round(cited / total, 4)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    request: Request,
    _user: "ClientUser" = Depends(get_current_client_user),
    client_id: str = Depends(get_client_id_from_token),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    from app.models.prompt import Prompt

    client_id_uuid = uuid.UUID(client_id)

    # Client schedule fields
    client_row = (
        await db.execute(select(Client).where(Client.id == client_id_uuid))
    ).scalar_one_or_none()
    schedule_enabled = client_row.schedule_enabled if client_row else False
    schedule_cadence = client_row.schedule_cadence if client_row else "manual"
    next_scheduled_run_at = client_row.next_scheduled_run_at if client_row else None

    # Total prompts
    total_prompts = (
        await db.execute(
            select(func.count()).where(Prompt.client_id == client_id_uuid)
        )
    ).scalar_one()

    # Total runs
    total_runs = (
        await db.execute(
            select(func.count()).where(Run.client_id == client_id_uuid)
        )
    ).scalar_one()

    # Latest completed run
    latest_run = (
        await db.execute(
            select(Run)
            .where(Run.client_id == client_id_uuid, Run.status == RunStatus.completed)
            .order_by(Run.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    latest_citation_rate = None
    visibility_score = None
    if latest_run:
        latest_citation_rate = await _citation_rate_for_run(latest_run.id, db)
        visibility_score = await _compute_visibility(latest_run.id, db)

    # Trend: last 10 completed runs
    trend_runs = (
        await db.execute(
            select(Run)
            .where(Run.client_id == client_id_uuid, Run.status == RunStatus.completed)
            .order_by(Run.created_at.desc())
            .limit(10)
        )
    ).scalars().all()

    trend: list[RunTrendPoint] = []
    for r in reversed(trend_runs):
        rate = await _citation_rate_for_run(r.id, db)
        trend.append(RunTrendPoint(run_id=r.id, date=r.created_at, citation_rate=rate))

    client_name = getattr(request.state, "client_name", "")

    return DashboardSummary(
        client_name=client_name,
        latest_run_id=latest_run.id if latest_run else None,
        latest_run_status=latest_run.status.value if latest_run else None,
        latest_run_date=latest_run.created_at if latest_run else None,
        latest_citation_rate=latest_citation_rate,
        visibility_score=visibility_score,
        citation_rate_trend=trend,
        total_prompts=total_prompts,
        total_runs=total_runs,
        schedule_enabled=schedule_enabled,
        schedule_cadence=schedule_cadence,
        next_scheduled_run_at=next_scheduled_run_at,
    )


@router.get("/runs", response_model=RunListResponse)
async def get_client_runs(
    _user=Depends(get_current_client_user),
    client_id: str = Depends(get_client_id_from_token),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> RunListResponse:
    client_id_uuid = uuid.UUID(client_id)

    total = (
        await db.execute(
            select(func.count()).where(Run.client_id == client_id_uuid)
        )
    ).scalar_one()

    offset = (page - 1) * per_page
    runs = (
        await db.execute(
            select(Run)
            .where(Run.client_id == client_id_uuid)
            .order_by(Run.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    items: list[RunListItem] = []
    for run in runs:
        rate = None
        if run.status == RunStatus.completed:
            rate = await _citation_rate_for_run(run.id, db)
        items.append(
            RunListItem(
                id=run.id,
                status=run.status.value,
                total_prompts=run.total_prompts,
                completed_prompts=run.completed_prompts,
                created_at=run.created_at,
                overall_citation_rate=rate,
            )
        )

    return RunListResponse(runs=items, total=total, page=page, per_page=per_page)


@router.get("/runs/latest")
async def get_latest_run(
    _user=Depends(get_current_client_user),
    client_id: str = Depends(get_client_id_from_token),
    db: AsyncSession = Depends(get_db),
) -> RunSummaryResponse | None:
    client_id_uuid = uuid.UUID(client_id)

    run = (
        await db.execute(
            select(Run)
            .where(Run.client_id == client_id_uuid, Run.status == RunStatus.completed)
            .order_by(Run.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if run is None:
        return None

    return await compute_run_summary(run.id, db)


@router.get("/runs/{run_id}", response_model=RunSummaryResponse)
async def get_run_detail(
    run_id: str,
    _user=Depends(get_current_client_user),
    client_id: str = Depends(get_client_id_from_token),
    db: AsyncSession = Depends(get_db),
) -> RunSummaryResponse:
    await _require_run(run_id, client_id, db)
    return await compute_run_summary(uuid.UUID(run_id), db)


@router.get("/runs/{run_id}/prompts", response_model=list[PromptDetail])
async def get_run_prompts(
    run_id: str,
    _user=Depends(get_current_client_user),
    client_id: str = Depends(get_client_id_from_token),
    db: AsyncSession = Depends(get_db),
) -> list[PromptDetail]:
    await _require_run(run_id, client_id, db)
    return await get_prompt_details(uuid.UUID(run_id), db)


@router.get("/competitors", response_model=list[CompetitorOut])
async def get_client_competitors(
    _user=Depends(get_current_client_user),
    client_id: str = Depends(get_client_id_from_token),
    db: AsyncSession = Depends(get_db),
) -> list[CompetitorOut]:
    client_id_uuid = uuid.UUID(client_id)
    rows = (
        await db.execute(
            select(Competitor)
            .where(Competitor.client_id == client_id_uuid)
            .order_by(Competitor.name)
        )
    ).scalars().all()
    return [CompetitorOut(id=r.id, name=r.name) for r in rows]
