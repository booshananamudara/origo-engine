"""
Full run pipeline: orchestration (collect responses) → analysis (LLM citation analysis).

Designed to run as a FastAPI BackgroundTask.
"""
import asyncio
import json
import time
import uuid
from datetime import datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.analysis.analyzer import AnalysisParseError, ResponseAnalyzer
from app.config import settings
from app.models.client import Client
from app.models.competitor import Competitor
from app.models.prompt import Prompt
from app.models.response import Response
from app.models.run import Run, RunStatus
from app.services.run_orchestrator import orchestrate_run

logger = structlog.get_logger()


def _resolve_final_status(
    current: RunStatus,
    analysis_total: int,
    analysis_ok: int,
    min_coverage: float | None = None,
    expected_total: int | None = None,
) -> RunStatus:
    """Decide a run's terminal status after analysis.

    COMPLETED is strict (client requirement: the status label must be honest):
    every launched monitoring call stored a response (``analysis_total`` ==
    ``expected_total``) AND every stored response was analyzed. A run that
    finished with drops anywhere in the funnel is PARTIAL — results are still
    trustworthy (coverage gate passed) but the label says so on the run list,
    not three clicks deep.

    A run is FAILED when the citation-analysis coverage is too low to trust:
      - every analysis call failed (no scores at all), or
      - fewer than ``min_coverage`` of the responses were analyzed, or
      - monitoring was expected to produce responses but produced none.
    Reporting such a run as "completed" would surface a citation rate computed
    over a small, unrepresentative slice (e.g. an 11-of-119 run shipping a "0%")
    as if it were real. A genuine 0% (analyses ran, brand simply not cited) has
    full coverage and still completes normally.

    Args:
        current: status left by orchestration (failed only on total wipeout).
        analysis_total: responses stored (== monitoring calls that succeeded).
        analysis_ok: responses successfully analyzed.
        min_coverage: override for settings.analysis_min_coverage (tests).
        expected_total: monitoring calls launched (prompts × platforms). None
            preserves legacy behavior for callers that can't know it.
    """
    if current == RunStatus.failed:
        return RunStatus.failed
    if expected_total is not None and expected_total > 0 and analysis_total == 0:
        # Monitoring should have produced responses and produced none — never
        # report an empty run as anything but failed. (Orchestration normally
        # catches this; kept as a belt-and-braces guard.)
        return RunStatus.failed
    if analysis_total > 0:
        if analysis_ok == 0:
            return RunStatus.failed
        threshold = settings.analysis_min_coverage if min_coverage is None else min_coverage
        if analysis_ok / analysis_total < threshold:
            return RunStatus.failed
    monitoring_short = expected_total is not None and analysis_total < expected_total
    analysis_short = analysis_ok < analysis_total
    if monitoring_short or analysis_short:
        return RunStatus.partial
    return RunStatus.completed


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
    pipeline_start = time.monotonic()
    log.info("pipeline_start")

    # ── 1. Load client metadata ───────────────────────────────────────────────
    async with session_factory() as db:
        client_row = (
            await db.execute(select(Client).where(Client.id == client_id))
        ).scalar_one()
        client_name = client_row.name
        client_model_config = client_row.platform_model_config

        competitor_rows = (
            await db.execute(
                select(Competitor).where(Competitor.client_id == client_id)
            )
        ).scalars().all()
        competitor_names = [c.name for c in competitor_rows]

    log.info("pipeline_client_loaded", client_name=client_name, competitors=len(competitor_names))

    # ── 2. Orchestrate ────────────────────────────────────────────────────────
    orchestration_start = time.monotonic()
    await orchestrate_run(run_id, client_id, session_factory)
    orchestration_ms = int((time.monotonic() - orchestration_start) * 1000)
    log.info("pipeline_orchestration_done", duration_ms=orchestration_ms)

    # ── 3. Analyze all responses ──────────────────────────────────────────────
    async with session_factory() as db:
        rows = (
            await db.execute(
                select(Response, Prompt)
                .join(Prompt, Response.prompt_id == Prompt.id)
                .where(Response.run_id == run_id)
            )
        ).all()

    analysis_start = time.monotonic()
    log.info(
        "pipeline_analysis_start",
        response_count=len(rows),
        concurrency=settings.analysis_max_concurrent,
    )

    sem = asyncio.Semaphore(settings.analysis_max_concurrent)
    analyzer = ResponseAnalyzer(client_model_config=client_model_config)

    analysis_total = len(rows)
    analysis_ok, failures = await _run_analysis_passes(
        rows,
        client_id=client_id,
        client_name=client_name,
        competitor_names=competitor_names,
        analyzer=analyzer,
        semaphore=sem,
        session_factory=session_factory,
        log=log,
    )
    analysis_ms = int((time.monotonic() - analysis_start) * 1000)

    log.info(
        "pipeline_analysis_done",
        analyses_succeeded=analysis_ok,
        analyses_failed=len(failures),
        duration_ms=analysis_ms,
    )
    for exc in failures:
        log.error("analysis_task_failed", error=str(exc))

    # ── 4. Generate recommendations (failure-tolerant — run still completes) ──
    generation_start = time.monotonic()
    try:
        from app.generation.orchestrator import generate_recommendations
        gen_summary = await generate_recommendations(run_id, client_id, session_factory)
        generation_ms = int((time.monotonic() - generation_start) * 1000)
        log.info("generation_phase_complete", duration_ms=generation_ms, **gen_summary)
    except Exception as gen_exc:
        generation_ms = int((time.monotonic() - generation_start) * 1000)
        log.error("generation_phase_failed", duration_ms=generation_ms, error=str(gen_exc))

    # Mark the run terminal now that analysis is finished.
    # orchestrate_run intentionally leaves the status as "running" so the
    # frontend keeps polling until this point — ensuring analysis data is
    # present the moment the status flips to a terminal state.
    async with session_factory() as db:
        async with db.begin():
            run = (
                await db.execute(select(Run).where(Run.id == run_id))
            ).scalar_one()
            expected_calls = run.total_prompts
            final_status = _resolve_final_status(
                run.status,
                analysis_total,
                analysis_ok,
                expected_total=expected_calls,
            )
            run.status = final_status
            run.updated_at = datetime.utcnow()
            # When we fail purely on low coverage (not a total wipeout, and
            # monitoring left no platform errors to explain it), record a clear
            # reason so the UI shows why the run was withheld instead of a
            # misleading score. Preserve any existing monitoring error JSON.
            if (
                final_status == RunStatus.failed
                and analysis_total > 0
                and 0 < analysis_ok < analysis_total
                and not run.error_message
            ):
                pct = round(analysis_ok / analysis_total * 100)
                needed = round(settings.analysis_min_coverage * 100)
                run.error_message = (
                    f"Only {analysis_ok} of {analysis_total} responses were analyzed "
                    f"({pct}%). Results withheld — below the {needed}% coverage needed "
                    f"for a reliable score. Check the analysis model/token settings."
                )
            # A PARTIAL run must explain itself in the detail view. Platform
            # errors are already stored by orchestration; add the analysis
            # shortfall (if any) under a non-platform key — consumers that map
            # errors to engines (_failed_engines) skip unknown keys by design.
            if final_status == RunStatus.partial and analysis_ok < analysis_total:
                errors: dict = {}
                if run.error_message:
                    try:
                        parsed = json.loads(run.error_message)
                        if isinstance(parsed, dict):
                            errors = parsed
                    except ValueError:
                        pass  # legacy plain-text message — replace with JSON
                errors["analysis"] = (
                    f"{analysis_total - analysis_ok} of {analysis_total} stored "
                    f"responses could not be analyzed (excluded from all rates)."
                )
                run.error_message = json.dumps(errors)

    if final_status == RunStatus.failed:
        log.error(
            "run_failed_low_analysis_coverage",
            responses=analysis_total,
            analyses_ok=analysis_ok,
            analyses_failed=len(failures),
        )
    elif final_status == RunStatus.partial:
        log.warning(
            "run_partial",
            expected_calls=expected_calls,
            responses_stored=analysis_total,
            analyses_ok=analysis_ok,
        )

    total_ms = int((time.monotonic() - pipeline_start) * 1000)
    log.info(
        "pipeline_complete",
        total_ms=total_ms,
        orchestration_ms=orchestration_ms,
        analysis_ms=analysis_ms,
    )


async def _run_analysis_passes(
    rows: list,
    *,
    client_id: uuid.UUID,
    client_name: str,
    competitor_names: list[str],
    analyzer: ResponseAnalyzer,
    semaphore: asyncio.Semaphore,
    session_factory: async_sessionmaker,
    log,
) -> tuple[int, list[BaseException]]:
    """Analyze every (response, prompt) row with bounded concurrency, then
    re-run the failures in up to ``settings.analysis_retry_passes`` extra
    passes before counting them as drops.

    This attacks the silent analysis funnel (responses stored but never
    analyzed → excluded from every rate): a one-off timeout or a twice-
    unparseable completion gets a fresh chance instead of shrinking the
    denominator. No backoff — the per-platform rate limiter already paces
    the calls, and parse failures are model nondeterminism where an
    immediate re-ask is exactly the fix.

    Returns (analyses_ok, final_failures).
    """

    async def _pass(pass_rows: list) -> list:
        return await asyncio.gather(
            *[
                _analyze_one(
                    response_id=response.id,
                    prompt_text=prompt.text,
                    client_id=client_id,
                    client_name=client_name,
                    competitor_names=competitor_names,
                    analyzer=analyzer,
                    semaphore=semaphore,
                    session_factory=session_factory,
                    log=log,
                )
                for response, prompt in pass_rows
            ],
            return_exceptions=True,
        )

    results = await _pass(rows)
    failed = [
        (row, res) for row, res in zip(rows, results) if isinstance(res, BaseException)
    ]

    for attempt in range(1, settings.analysis_retry_passes + 1):
        if not failed:
            break
        log.warning("analysis_retry_pass", attempt=attempt, retrying=len(failed))
        retry_rows = [row for row, _ in failed]
        retry_results = await _pass(retry_rows)
        failed = [
            (row, res)
            for row, res in zip(retry_rows, retry_results)
            if isinstance(res, BaseException)
        ]

    failures = [res for _, res in failed]
    return len(rows) - len(failures), failures


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
