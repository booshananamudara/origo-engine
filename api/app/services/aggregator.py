"""
Aggregator service: computes summary metrics from persisted analyses.

All aggregation is done in Python after a single DB fetch per call —
simpler than complex SQL for a POC with small datasets.
"""
import uuid
from collections import Counter, defaultdict

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import Analysis
from app.models.prompt import Prompt
from app.models.response import Platform, Response
from app.models.run import Run
from app.schemas.aggregator import (
    CompetitorStats,
    PlatformStats,
    PromptAnalysisItem,
    PromptDetail,
    RunSummaryResponse,
)
from app.schemas.run import RunRead

logger = structlog.get_logger()


async def compute_run_summary(
    run_id: uuid.UUID, db: AsyncSession
) -> RunSummaryResponse:
    """
    Fetch all analyses for a run and compute:
      - per-platform citation rate + prominence breakdown
      - competitor share of voice (ordered by mention count)
      - overall citation rate
    """
    run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one_or_none()
    if run is None:
        raise ValueError(f"Run {run_id} not found")

    # Single join: analyses → responses (gives us platform per analysis)
    rows = (
        await db.execute(
            select(Analysis, Response)
            .join(Response, Analysis.response_id == Response.id)
            .where(Response.run_id == run_id)
        )
    ).all()

    total_analyses = len(rows)

    # ── Per-platform stats ────────────────────────────────────────────────────
    platform_analyses: dict[Platform, list[Analysis]] = defaultdict(list)
    for analysis, response in rows:
        platform_analyses[response.platform].append(analysis)

    platform_stats: list[PlatformStats] = []
    for platform in Platform:
        analyses = platform_analyses.get(platform, [])
        if not analyses:
            continue
        total = len(analyses)
        cited = sum(1 for a in analyses if a.client_cited)
        prominence_breakdown = dict(
            Counter(a.client_prominence.value for a in analyses)
        )
        platform_stats.append(
            PlatformStats(
                platform=platform,
                total_responses=total,
                cited_count=cited,
                citation_rate=round(cited / total, 4) if total else 0.0,
                prominence_breakdown=prominence_breakdown,
            )
        )

    # ── Competitor share of voice ─────────────────────────────────────────────
    competitor_counts: Counter[str] = Counter()
    for analysis, _ in rows:
        for comp in analysis.competitors_cited:
            brand = comp.get("brand") if isinstance(comp, dict) else str(comp)
            if brand:
                competitor_counts[brand] += 1

    competitor_stats: list[CompetitorStats] = [
        CompetitorStats(
            brand=brand,
            cited_count=count,
            share_of_voice=round(count / total_analyses, 4) if total_analyses else 0.0,
        )
        for brand, count in competitor_counts.most_common()
    ]

    # ── Overall rate ──────────────────────────────────────────────────────────
    overall_cited = sum(1 for a, _ in rows if a.client_cited)
    overall_rate = round(overall_cited / total_analyses, 4) if total_analyses else 0.0

    logger.info(
        "aggregation_complete",
        run_id=str(run_id),
        total_analyses=total_analyses,
        overall_citation_rate=overall_rate,
    )

    return RunSummaryResponse(
        run=RunRead.model_validate(run),
        total_analyses=total_analyses,
        overall_citation_rate=overall_rate,
        platform_stats=platform_stats,
        competitor_stats=competitor_stats,
    )


async def get_prompt_details(
    run_id: uuid.UUID, db: AsyncSession
) -> list[PromptDetail]:
    """
    Return per-prompt drill-down: for each prompt, each platform's raw
    response + its analysis side by side.
    """
    rows = (
        await db.execute(
            select(Response, Prompt, Analysis)
            .join(Prompt, Response.prompt_id == Prompt.id)
            .outerjoin(Analysis, Analysis.response_id == Response.id)
            .where(Response.run_id == run_id)
            .order_by(Prompt.text, Response.platform)
        )
    ).all()

    # Group by prompt
    prompt_map: dict[uuid.UUID, tuple[Prompt, list[PromptAnalysisItem]]] = {}
    for response, prompt, analysis in rows:
        if prompt.id not in prompt_map:
            prompt_map[prompt.id] = (prompt, [])

        item = PromptAnalysisItem(
            platform=response.platform,
            response_id=response.id,
            raw_response=response.raw_response,
            model_used=response.model_used,
            latency_ms=response.latency_ms,
            cost_usd=response.cost_usd,
        )

        if analysis is not None:
            item.client_cited = analysis.client_cited
            item.client_prominence = analysis.client_prominence.value
            item.client_sentiment = analysis.client_sentiment.value
            item.client_characterization = analysis.client_characterization
            item.competitors_cited = analysis.competitors_cited
            item.content_gaps = analysis.content_gaps
            item.citation_opportunity = analysis.citation_opportunity.value
            item.reasoning = analysis.reasoning

        prompt_map[prompt.id][1].append(item)

    return [
        PromptDetail(
            prompt_id=prompt.id,
            prompt_text=prompt.text,
            category=prompt.category,
            results=items,
        )
        for prompt, items in prompt_map.values()
    ]
