"""
Generation orchestrator — coordinates all generators after a run's analysis is complete.

Called by the pipeline after analyze_responses completes. Failure is non-fatal:
if generation errors, the run still completes.
"""
import asyncio
import uuid
from datetime import datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.analysis import Analysis, CitationOpportunity
from app.models.client import Client
from app.models.client_knowledge_base import ClientKnowledgeBase
from app.models.prompt import Prompt
from app.models.recommendation import RecommendationHistory, RecommendationStatus
from app.models.response import Response
from app.models.run import GenerationStatus, Run

logger = structlog.get_logger()


async def generate_recommendations(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
) -> dict:
    """
    Top-level entry point called after analysis completes.

    Returns summary: {content_briefs, schema_recs, llms_txt_recs, skipped, errors}
    """
    log = logger.bind(run_id=str(run_id), client_id=str(client_id))
    log.info("generation_start")

    summary = {
        "content_briefs": 0,
        "schema_recs": 0,
        "llms_txt_recs": 0,
        "skipped": 0,
        "errors": 0,
    }

    if not settings.generation_enabled:
        log.info("generation_disabled_by_config")
        async with session_factory() as db:
            async with db.begin():
                run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
                run.generation_status = GenerationStatus.skipped
        summary["skipped"] = 1
        return summary

    # ── Mark generation as running ────────────────────────────────────────────
    async with session_factory() as db:
        async with db.begin():
            run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
            run.generation_status = GenerationStatus.running

    try:
        # ── Load all analyses for this run (with eager-loaded response + prompt) ─
        async with session_factory() as db:
            rows = (
                await db.execute(
                    select(Analysis, Response, Prompt)
                    .join(Response, Analysis.response_id == Response.id)
                    .join(Prompt, Response.prompt_id == Prompt.id)
                    .where(Response.run_id == run_id)
                )
            ).all()

        if not rows:
            log.info("generation_no_analyses")
            async with session_factory() as db:
                async with db.begin():
                    run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
                    run.generation_status = GenerationStatus.skipped
            return summary

        # ── Load client + knowledge base ──────────────────────────────────────
        async with session_factory() as db:
            client = (await db.execute(select(Client).where(Client.id == client_id))).scalar_one()
            kb = (
                await db.execute(
                    select(ClientKnowledgeBase).where(ClientKnowledgeBase.client_id == client_id)
                )
            ).scalar_one_or_none()

        # ── Fan-out content briefs + schema recs per analysis ─────────────────
        sem = asyncio.Semaphore(settings.generation_max_concurrent)

        async def _generate_for_analysis(
            analysis: Analysis,
            response: Response,
            prompt: Prompt,
        ) -> tuple[int, int, int]:
            cb = sr = 0
            async with sem:
                async with session_factory() as db:
                    async with db.begin():
                        # Reload fresh ORM objects in this session
                        fresh_analysis = (
                            await db.execute(select(Analysis).where(Analysis.id == analysis.id))
                        ).scalar_one()
                        fresh_response = (
                            await db.execute(select(Response).where(Response.id == response.id))
                        ).scalar_one()
                        # Attach response to analysis for relationship access
                        fresh_analysis.response = fresh_response

                        platform = fresh_response.platform.value

                        if settings.generation_content_brief_enabled:
                            from app.generation.content_brief_generator import generate_content_brief
                            try:
                                rec = await generate_content_brief(
                                    session=db,
                                    analysis=fresh_analysis,
                                    client=client,
                                    kb=kb,
                                    prompt_text=prompt.text,
                                    raw_response=fresh_response.raw_response,
                                    platform=platform,
                                    client_model_config=client.platform_model_config,
                                )
                                if rec:
                                    await db.flush()
                                    await _add_history(db, rec, old_status=None, actor="system")
                                    cb = 1
                            except Exception as exc:
                                log.error(
                                    "content_brief_generation_failed",
                                    analysis_id=str(analysis.id),
                                    error=str(exc),
                                )

                        if settings.generation_schema_enabled:
                            from app.generation.schema_generator import generate_schema_recommendation
                            try:
                                rec = await generate_schema_recommendation(
                                    session=db,
                                    analysis=fresh_analysis,
                                    client=client,
                                    kb=kb,
                                    prompt_text=prompt.text,
                                    platform=platform,
                                )
                                if rec:
                                    await db.flush()
                                    await _add_history(db, rec, old_status=None, actor="system")
                                    sr = 1
                            except Exception as exc:
                                log.error(
                                    "schema_generation_failed",
                                    analysis_id=str(analysis.id),
                                    error=str(exc),
                                )
            return cb, sr, 0

        tasks = [_generate_for_analysis(a, r, p) for a, r, p in rows]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, BaseException):
                summary["errors"] += 1
                log.error("analysis_generation_task_failed", error=str(r))
            else:
                cb, sr, _ = r
                summary["content_briefs"] += cb
                summary["schema_recs"] += sr

        # ── llms.txt: once per run ────────────────────────────────────────────
        if settings.generation_llms_txt_enabled:
            async with session_factory() as db:
                async with db.begin():
                    analyses_only = [a for a, _, _ in rows]
                    # Reload with response relationship
                    fresh_analyses = []
                    for a in analyses_only:
                        fa = (await db.execute(select(Analysis).where(Analysis.id == a.id))).scalar_one()
                        fr = (await db.execute(select(Response).where(Response.id == a.response_id))).scalar_one()
                        fa.response = fr
                        fresh_analyses.append(fa)

                    from app.generation.llms_txt_generator import generate_llms_txt_recommendation
                    try:
                        rec = await generate_llms_txt_recommendation(
                            session=db,
                            run_id=run_id,
                            client=client,
                            kb=kb,
                            analyses=fresh_analyses,
                        )
                        if rec:
                            await db.flush()
                            await _add_history(db, rec, old_status=None, actor="system")
                            summary["llms_txt_recs"] = 1
                    except Exception as exc:
                        log.error("llms_txt_generation_failed", error=str(exc))
                        summary["errors"] += 1

        # ── Mark generation as completed ──────────────────────────────────────
        async with session_factory() as db:
            async with db.begin():
                run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
                run.generation_status = GenerationStatus.completed

        log.info("generation_complete", **summary)

    except Exception as exc:
        log.error("generation_fatal_error", error=str(exc))
        summary["errors"] += 1
        async with session_factory() as db:
            async with db.begin():
                run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
                run.generation_status = GenerationStatus.failed

    return summary


async def _add_history(db: AsyncSession, rec, old_status, actor: str, notes: str | None = None) -> None:
    """Add initial history entry for a newly created recommendation."""
    entry = RecommendationHistory(
        recommendation_id=rec.id,
        client_id=rec.client_id,
        old_status=old_status,
        new_status=rec.status.value,
        actor=actor,
        notes=notes,
    )
    db.add(entry)
