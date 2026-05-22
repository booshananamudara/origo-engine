"""
Cost aggregation service.

Data sources (what is actually persisted today):
  responses.tokens_used + responses.cost_usd     → monitoring phase (per platform)
  recommendations.generation_cost_usd             → generation phase (per recommendation)

Analysis phase costs are not separately tracked; breakdown shows null for that phase.
"""
import uuid
from datetime import timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recommendation import Recommendation
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus


async def get_run_cost_summary(session: AsyncSession, run_id: uuid.UUID) -> dict:
    """
    Aggregate token counts and costs for a single run.

    Returns:
    {
        "total_tokens": 58070 | None,
        "total_cost_usd": 0.0347 | None,
        "breakdown": {
            "monitoring": {"tokens": 36200, "cost_usd": 0.0122, "api_calls": 40} | None,
            "generation": {"cost_usd": 0.012, "api_calls": 5} | None,
            "analysis": None  # not tracked
        },
        "cost_by_platform": {
            "openai": {"tokens": 15000, "cost_usd": 0.0095, "api_calls": 10}, ...
        }
    }
    """
    # ── Monitoring: aggregate from responses ──────────────────────────────────
    monitoring_rows = (
        await session.execute(
            select(
                Response.platform,
                func.count(Response.id).label("api_calls"),
                func.sum(Response.tokens_used).label("tokens"),
                func.sum(Response.cost_usd).label("cost"),
            )
            .where(Response.run_id == run_id)
            .group_by(Response.platform)
        )
    ).all()

    mon_tokens = 0
    mon_cost = 0.0
    mon_calls = 0
    cost_by_platform: dict[str, dict] = {}

    for row in monitoring_rows:
        t = int(row.tokens or 0)
        c = float(row.cost or 0.0)
        a = int(row.api_calls or 0)
        mon_tokens += t
        mon_cost += c
        mon_calls += a
        cost_by_platform[row.platform.value] = {
            "tokens": t,
            "cost_usd": round(c, 6),
            "api_calls": a,
        }

    # ── Generation: aggregate from recommendations ────────────────────────────
    gen_row = (
        await session.execute(
            select(
                func.count(Recommendation.id).label("count"),
                func.sum(Recommendation.generation_cost_usd).label("cost"),
            )
            .where(Recommendation.run_id == run_id)
        )
    ).one()

    gen_cost = float(gen_row.cost or 0.0)
    gen_calls = int(gen_row.count or 0)

    # ── Totals ────────────────────────────────────────────────────────────────
    has_data = bool(monitoring_rows) or gen_cost > 0
    total_cost = mon_cost + gen_cost

    return {
        "total_tokens": mon_tokens if monitoring_rows else None,
        "total_cost_usd": round(total_cost, 6) if has_data else None,
        "breakdown": {
            "monitoring": {
                "tokens": mon_tokens,
                "cost_usd": round(mon_cost, 6),
                "api_calls": mon_calls,
            } if monitoring_rows else None,
            "generation": {
                "cost_usd": round(gen_cost, 6),
                "api_calls": gen_calls,
            } if gen_calls > 0 else None,
            "analysis": None,
        },
        "cost_by_platform": cost_by_platform,
    }


async def get_client_cost_averages(session: AsyncSession, client_id: uuid.UUID) -> dict:
    """
    Compute average token count and cost per run across completed runs.

    Returns:
    {
        "total_runs": 24,
        "avg_tokens_per_run": 57500 | None,
        "avg_cost_per_run_usd": 0.034 | None,
        "total_cost_all_time_usd": 0.82,
        "cost_trend": [{"run_id": "...", "date": "2026-05-20", "cost_usd": 0.035, "tokens": 58000}]
    }
    """
    # Last 20 completed runs for trend
    trend_runs = (
        await session.execute(
            select(Run.id, Run.created_at)
            .where(Run.client_id == client_id, Run.status == RunStatus.completed)
            .order_by(Run.created_at.desc())
            .limit(20)
        )
    ).all()

    total_runs_count = (
        await session.execute(
            select(func.count(Run.id))
            .where(Run.client_id == client_id, Run.status == RunStatus.completed)
        )
    ).scalar_one()

    if not trend_runs:
        return {
            "total_runs": total_runs_count,
            "avg_tokens_per_run": None,
            "avg_cost_per_run_usd": None,
            "total_cost_all_time_usd": None,
            "cost_trend": [],
        }

    trend_run_ids = [r.id for r in trend_runs]

    # Monitoring costs for trend window
    mon_by_run_rows = (
        await session.execute(
            select(
                Response.run_id,
                func.sum(Response.tokens_used).label("tokens"),
                func.sum(Response.cost_usd).label("cost"),
            )
            .where(Response.run_id.in_(trend_run_ids))
            .group_by(Response.run_id)
        )
    ).all()
    mon_map: dict[uuid.UUID, tuple[int, float]] = {
        r.run_id: (int(r.tokens or 0), float(r.cost or 0.0))
        for r in mon_by_run_rows
    }

    # Generation costs for trend window
    gen_by_run_rows = (
        await session.execute(
            select(
                Recommendation.run_id,
                func.sum(Recommendation.generation_cost_usd).label("cost"),
            )
            .where(Recommendation.run_id.in_(trend_run_ids))
            .group_by(Recommendation.run_id)
        )
    ).all()
    gen_map: dict[uuid.UUID, float] = {
        r.run_id: float(r.cost or 0.0)
        for r in gen_by_run_rows
    }

    # All-time monitoring cost
    all_mon = (
        await session.execute(
            select(func.sum(Response.cost_usd))
            .join(Run, Response.run_id == Run.id)
            .where(Run.client_id == client_id, Run.status == RunStatus.completed)
        )
    ).scalar_one() or 0.0

    # All-time generation cost
    all_gen = (
        await session.execute(
            select(func.sum(Recommendation.generation_cost_usd))
            .where(Recommendation.client_id == client_id)
        )
    ).scalar_one() or 0.0

    total_cost_all_time = float(all_mon) + float(all_gen)

    # Build trend (reverse to chronological order)
    cost_trend = []
    for run in reversed(trend_runs):
        mon_tokens, mon_cost = mon_map.get(run.id, (0, 0.0))
        gen_cost = gen_map.get(run.id, 0.0)
        run_date = run.created_at
        if run_date.tzinfo is None:
            run_date = run_date.replace(tzinfo=timezone.utc)
        cost_trend.append({
            "run_id": str(run.id),
            "date": run_date.date().isoformat(),
            "cost_usd": round(mon_cost + gen_cost, 6),
            "tokens": mon_tokens,
        })

    n = len(trend_runs)
    avg_tokens = sum(t["tokens"] for t in cost_trend) / n if n else None
    avg_cost = sum(t["cost_usd"] for t in cost_trend) / n if n else None

    return {
        "total_runs": total_runs_count,
        "avg_tokens_per_run": round(avg_tokens) if avg_tokens is not None else None,
        "avg_cost_per_run_usd": round(avg_cost, 4) if avg_cost is not None else None,
        "total_cost_all_time_usd": round(total_cost_all_time, 4) if total_cost_all_time else None,
        "cost_trend": cost_trend,
    }


async def batch_run_costs(
    session: AsyncSession, run_ids: list[uuid.UUID]
) -> dict[uuid.UUID, float | None]:
    """
    Return total cost per run (monitoring + generation) for a list of runs.
    Used to populate cost_usd in run list responses without N+1 queries.
    """
    if not run_ids:
        return {}

    mon_rows = (
        await session.execute(
            select(Response.run_id, func.sum(Response.cost_usd).label("cost"))
            .where(Response.run_id.in_(run_ids))
            .group_by(Response.run_id)
        )
    ).all()
    mon_map = {r.run_id: float(r.cost or 0.0) for r in mon_rows}

    gen_rows = (
        await session.execute(
            select(
                Recommendation.run_id,
                func.sum(Recommendation.generation_cost_usd).label("cost"),
            )
            .where(Recommendation.run_id.in_(run_ids))
            .group_by(Recommendation.run_id)
        )
    ).all()
    gen_map = {r.run_id: float(r.cost or 0.0) for r in gen_rows}

    result: dict[uuid.UUID, float | None] = {}
    for rid in run_ids:
        mon = mon_map.get(rid)
        gen = gen_map.get(rid, 0.0)
        if mon is None and gen == 0.0:
            result[rid] = None
        else:
            result[rid] = round((mon or 0.0) + gen, 6)
    return result
