"""
Full run pipeline: orchestration (collect responses) → analysis (LLM citation analysis).

Designed to run as a FastAPI BackgroundTask.
"""
import asyncio
import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.analysis.analyzer import AnalysisParseError, ResponseAnalyzer
from app.config import settings
from app.models.client import Client
from app.models.competitor import Competitor
from app.models.prompt import Prompt
from app.models.response import Response
from app.services.run_orchestrator import orchestrate_run

logger = structlog.get_logger()

_ANALYSIS_CONCURRENCY = 5  # max simultaneous gpt-4o-mini calls


async def run_pipeline(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
) -> None:
    """
    Full pipeline for a single run:
      1. Load client brand + competitor names
      2. Orchestrate: fan-out prompts × platforms, persist responses
      3. Analyze: call gpt-4o-mini on every response, persist analyses
    """
    log = logger.bind(run_id=str(run_id), client_id=str(client_id))
    log.info("pipeline_start")

    # ── 1. Load client metadata ───────────────────────────────────────────────
    async with session_factory() as db:
        client_row = (
            await db.execute(select(Client).where(Client.id == client_id))
        ).scalar_one()
        client_name = client_row.name

        competitor_rows = (
            await db.execute(
                select(Competitor).where(Competitor.client_id == client_id)
            )
        ).scalars().all()
        competitor_names = [c.name for c in competitor_rows]

    log.info("pipeline_client_loaded", client_name=client_name, competitors=len(competitor_names))

    # ── 2. Orchestrate ────────────────────────────────────────────────────────
    await orchestrate_run(run_id, client_id, session_factory)

    # ── 3. Analyze all responses ──────────────────────────────────────────────
    async with session_factory() as db:
        rows = (
            await db.execute(
                select(Response, Prompt)
                .join(Prompt, Response.prompt_id == Prompt.id)
                .where(Response.run_id == run_id)
            )
        ).all()

    log.info("pipeline_analysis_start", response_count=len(rows))

    sem = asyncio.Semaphore(_ANALYSIS_CONCURRENCY)
    analyzer = ResponseAnalyzer()

    tasks = [
        _analyze_one(
            response_id=response.id,
            prompt_text=prompt.text,
            client_id=client_id,
            client_name=client_name,
            competitor_names=competitor_names,
            analyzer=analyzer,
            semaphore=sem,
            session_factory=session_factory,
            log=log,
        )
        for response, prompt in rows
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    failures = [r for r in results if isinstance(r, BaseException)]

    log.info(
        "pipeline_complete",
        analyses_succeeded=len(results) - len(failures),
        analyses_failed=len(failures),
    )
    for exc in failures:
        log.error("analysis_task_failed", error=str(exc))


async def _analyze_one(
    response_id: uuid.UUID,
    prompt_text: str,
    client_id: uuid.UUID,
    client_name: str,
    competitor_names: list[str],
    analyzer: ResponseAnalyzer,
    semaphore: asyncio.Semaphore,
    session_factory: async_sessionmaker,
    log,
) -> None:
    async with semaphore:
        async with session_factory() as db:
            async with db.begin():
                response = (
                    await db.execute(
                        select(Response).where(Response.id == response_id)
                    )
                ).scalar_one()
                try:
                    await analyzer.analyze_and_persist(
                        response=response,
                        client_brand=client_name,
                        competitor_names=competitor_names,
                        prompt_text=prompt_text,
                        db=db,
                    )
                except AnalysisParseError as exc:
                    log.error(
                        "analysis_parse_error",
                        response_id=str(response_id),
                        error=str(exc),
                    )
                    raise
