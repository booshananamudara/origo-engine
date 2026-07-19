"""
Full run pipeline: orchestration (collect responses) → analysis (LLM citation analysis).

Designed to run as a FastAPI BackgroundTask.

Two execution modes (admin's choice at trigger time):
  - full   — monitoring → analysis → generation → finalize, in one task
             (the default; scheduler and /v1 audits always use this).
  - staged — monitoring only, then the run parks at ``responses_ready``.
             Analysis and generation are then run one click at a time via
             ``run_analysis_stage`` / ``run_generation_stage``.
"""
import asyncio
import json
import time
import uuid
from datetime import datetime

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.analysis.analyzer import AnalysisParseError, ResponseAnalyzer
from app.config import settings
from app.models.client import Client
from app.models.competitor import Competitor
from app.models.prompt import Prompt
from app.models.response import Response
from app.models.run import Run, RunStatus
from app.models.system_setting import SystemSetting
from app.services.llm_pricing import apply_pricing_overrides
from app.services.run_orchestrator import orchestrate_run, run_is_cancelled

logger = structlog.get_logger()


class RunCancelledError(Exception):
    """Raised inside an analysis task when the run's kill switch was pulled —
    not a failure: never retried, and the run keeps its cancelled status."""


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
    if current == RunStatus.cancelled:
        # Kill switch is terminal — finalization never relabels a cancelled run.
        return RunStatus.cancelled
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


# ── Shared stage building blocks ──────────────────────────────────────────────

async def _load_run_context(
    client_id: uuid.UUID, session_factory: async_sessionmaker
) -> tuple[str, dict, list[str]]:
    """Client name + model config + competitor names for a run.

    Also refreshes the LLM pricing tables from the admin-editable overrides so
    every call in the coming stage is priced at the latest stored rates (no
    deploy needed when a provider changes list prices).
    """
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

        settings_row = (
            await db.execute(select(SystemSetting).where(SystemSetting.id == 1))
        ).scalar_one_or_none()
        apply_pricing_overrides(settings_row.llm_pricing if settings_row else None)

    return client_name, client_model_config, competitor_names


async def _record_phase_timings(
    run_id: uuid.UUID, session_factory: async_sessionmaker, **ms_by_phase: int
) -> None:
    """Merge measured per-phase working durations into runs.phase_timings.

    Staged runs sit idle between clicks, so updated_at − created_at overstates
    how long the engine actually worked; the UI sums these values instead.
    """
    async with session_factory() as db:
        async with db.begin():
            run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
            run.phase_timings = {**(run.phase_timings or {}), **ms_by_phase}


async def _analysis_wave(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    *,
    client_name: str,
    client_model_config: dict,
    competitor_names: list[str],
    session_factory: async_sessionmaker,
    log,
) -> tuple[int, int, int, int]:
    """Phase 3: analyze every stored response with bounded concurrency and
    retry passes. Returns (analysis_total, analysis_ok, failures, duration_ms).
    """
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
    analysis_ok, failures, uncosted_attempts, unattributed_cost = await _run_analysis_passes(
        rows,
        run_id=run_id,
        client_id=client_id,
        client_name=client_name,
        competitor_names=competitor_names,
        analyzer=analyzer,
        semaphore=sem,
        session_factory=session_factory,
        log=log,
    )
    analysis_ms = int((time.monotonic() - analysis_start) * 1000)

    if uncosted_attempts:
        # Failed attempts were still billed by the provider; record the count
        # (and any recoverable estimate) on the run so its spend figure is a
        # labeled floor instead of a silent undercount.
        async with session_factory() as db:
            async with db.begin():
                await db.execute(
                    update(Run)
                    .where(Run.id == run_id)
                    .values(
                        uncosted_calls=Run.uncosted_calls + uncosted_attempts,
                        unattributed_cost_usd=Run.unattributed_cost_usd
                        + round(unattributed_cost, 6),
                    )
                )
        log.warning(
            "analysis_uncosted_attempts",
            count=uncosted_attempts,
            recovered_cost_usd=round(unattributed_cost, 6),
        )

    log.info(
        "pipeline_analysis_done",
        analyses_succeeded=analysis_ok,
        analyses_failed=len(failures),
        duration_ms=analysis_ms,
    )
    for exc in failures:
        log.error("analysis_task_failed", error=str(exc))

    return analysis_total, analysis_ok, len(failures), analysis_ms


async def _run_generation(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
    log,
) -> int:
    """Phase 4: generate recommendations (failure-tolerant — the run still
    completes if generation errors). Returns duration_ms."""
    generation_start = time.monotonic()
    try:
        from app.generation.orchestrator import generate_recommendations
        gen_summary = await generate_recommendations(run_id, client_id, session_factory)
        generation_ms = int((time.monotonic() - generation_start) * 1000)
        log.info("generation_phase_complete", duration_ms=generation_ms, **gen_summary)
    except Exception as gen_exc:
        generation_ms = int((time.monotonic() - generation_start) * 1000)
        log.error("generation_phase_failed", duration_ms=generation_ms, error=str(gen_exc))
    return generation_ms


async def _finalize_run(
    run_id: uuid.UUID,
    analysis_total: int,
    analysis_ok: int,
    analysis_failures: int,
    session_factory: async_sessionmaker,
    log,
) -> RunStatus:
    """Phase 5: resolve and persist the run's terminal status, with the
    explanatory error messages a FAILED/PARTIAL run must carry."""
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
            analyses_failed=analysis_failures,
        )
    elif final_status == RunStatus.partial:
        log.warning(
            "run_partial",
            expected_calls=expected_calls,
            responses_stored=analysis_total,
            analyses_ok=analysis_ok,
        )

    return final_status


# ── Entry points ──────────────────────────────────────────────────────────────

async def run_pipeline(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
    mode: str = "full",
) -> None:
    """
    Pipeline for a single run:
      1. Load client brand + competitor names (+ refresh pricing overrides)
      2. Orchestrate: fan-out prompts × platforms, persist responses
      3. Analyze: LLM citation analysis on every stored response
      4. Generate recommendations
      5. Finalize the run's terminal status

    ``mode="staged"`` stops after step 2 and parks the run at
    ``responses_ready``; steps 3–5 then run via ``run_analysis_stage`` and
    step 4 via ``run_generation_stage``, one admin click each.
    """
    log = logger.bind(run_id=str(run_id), client_id=str(client_id), mode=mode)
    pipeline_start = time.monotonic()
    log.info("pipeline_start")

    # ── 1. Load client metadata ───────────────────────────────────────────────
    client_name, client_model_config, competitor_names = await _load_run_context(
        client_id, session_factory
    )
    log.info("pipeline_client_loaded", client_name=client_name, competitors=len(competitor_names))

    # ── 2. Orchestrate ────────────────────────────────────────────────────────
    orchestration_start = time.monotonic()
    await orchestrate_run(run_id, client_id, session_factory)
    orchestration_ms = int((time.monotonic() - orchestration_start) * 1000)
    log.info("pipeline_orchestration_done", duration_ms=orchestration_ms)
    await _record_phase_timings(run_id, session_factory, monitoring_ms=orchestration_ms)

    # Kill switch: if the run was cancelled during monitoring, stop here —
    # no analysis, no generation, no further spend. Status stays cancelled.
    if await run_is_cancelled(run_id, session_factory):
        log.info("pipeline_stopped_cancelled", stage="after_orchestration")
        return

    if mode == "staged":
        # Park the run: responses collected, analysis awaits an explicit
        # click. Orchestration leaves "running" on success and "failed" on a
        # total wipeout — only the former parks (a wiped-out run has nothing
        # to analyze and keeps its honest failed status). The status guard
        # also protects against a cancel racing this write.
        async with session_factory() as db:
            async with db.begin():
                run = (
                    await db.execute(select(Run).where(Run.id == run_id))
                ).scalar_one()
                parked = run.status == RunStatus.running
                if parked:
                    run.status = RunStatus.responses_ready
                    run.updated_at = datetime.utcnow()
        log.info(
            "pipeline_staged_parked" if parked else "pipeline_staged_park_skipped",
            orchestration_ms=orchestration_ms,
        )
        return

    # ── 3. Analyze all responses ──────────────────────────────────────────────
    analysis_total, analysis_ok, analysis_failures, analysis_ms = await _analysis_wave(
        run_id,
        client_id,
        client_name=client_name,
        client_model_config=client_model_config,
        competitor_names=competitor_names,
        session_factory=session_factory,
        log=log,
    )
    await _record_phase_timings(run_id, session_factory, analysis_ms=analysis_ms)

    # Kill switch: cancelled during analysis — skip generation, keep status.
    if await run_is_cancelled(run_id, session_factory):
        log.info("pipeline_stopped_cancelled", stage="before_generation")
        return

    # ── 4. Generate recommendations (failure-tolerant — run still completes) ──
    generation_ms = await _run_generation(run_id, client_id, session_factory, log)
    await _record_phase_timings(run_id, session_factory, generation_ms=generation_ms)

    # ── 5. Finalize ───────────────────────────────────────────────────────────
    # Mark the run terminal now that analysis is finished.
    # orchestrate_run intentionally leaves the status as "running" so the
    # frontend keeps polling until this point — ensuring analysis data is
    # present the moment the status flips to a terminal state.
    await _finalize_run(
        run_id, analysis_total, analysis_ok, analysis_failures, session_factory, log
    )

    total_ms = int((time.monotonic() - pipeline_start) * 1000)
    log.info(
        "pipeline_complete",
        total_ms=total_ms,
        orchestration_ms=orchestration_ms,
        analysis_ms=analysis_ms,
    )


async def run_analysis_stage(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
) -> None:
    """Analysis stage for a staged run (POST /runs/{id}/analyze).

    The endpoint has already flipped ``responses_ready`` → ``running``
    atomically, so a double click cannot start two waves. Ends by resolving
    the run's terminal status — exactly the same coverage rules as full mode.
    """
    log = logger.bind(run_id=str(run_id), client_id=str(client_id), stage="analysis")
    log.info("analysis_stage_start")

    client_name, client_model_config, competitor_names = await _load_run_context(
        client_id, session_factory
    )

    analysis_total, analysis_ok, analysis_failures, analysis_ms = await _analysis_wave(
        run_id,
        client_id,
        client_name=client_name,
        client_model_config=client_model_config,
        competitor_names=competitor_names,
        session_factory=session_factory,
        log=log,
    )
    await _record_phase_timings(run_id, session_factory, analysis_ms=analysis_ms)

    # Kill switch: cancelled during analysis — keep the cancelled status.
    if await run_is_cancelled(run_id, session_factory):
        log.info("pipeline_stopped_cancelled", stage="staged_analysis")
        return

    final_status = await _finalize_run(
        run_id, analysis_total, analysis_ok, analysis_failures, session_factory, log
    )
    log.info("analysis_stage_complete", final_status=final_status.value, duration_ms=analysis_ms)


async def run_generation_stage(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
) -> None:
    """Generation stage (POST /runs/{id}/generate) for a completed/partial
    run whose recommendations haven't been generated yet.

    ``generate_recommendations`` manages generation_status itself
    (running → completed/failed/skipped); the run's own status never changes.
    """
    log = logger.bind(run_id=str(run_id), client_id=str(client_id), stage="generation")
    log.info("generation_stage_start")

    # Loads client context only for the pricing-override refresh — the
    # generation orchestrator fetches its own client + knowledge base.
    await _load_run_context(client_id, session_factory)

    generation_ms = await _run_generation(run_id, client_id, session_factory, log)
    await _record_phase_timings(run_id, session_factory, generation_ms=generation_ms)
    log.info("generation_stage_complete", duration_ms=generation_ms)


async def _run_analysis_passes(
    rows: list,
    *,
    run_id: uuid.UUID,
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

    Returns (analyses_ok, final_failures, uncosted_attempts,
    unattributed_cost_usd) — the last two are the failed-attempt spend
    bookkeeping the caller persists on the run (pure function, no DB writes
    here).
    """

    async def _pass(pass_rows: list) -> list:
        return await asyncio.gather(
            *[
                _analyze_one(
                    response_id=response.id,
                    prompt_text=prompt.text,
                    run_id=run_id,
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

    def _split(pairs: list) -> tuple[list, int, bool]:
        """(still_failed, cancelled_skips, saw_cancel) from (row, result) pairs."""
        still_failed, skips = [], 0
        for row, res in pairs:
            if isinstance(res, RunCancelledError):
                skips += 1
            elif isinstance(res, BaseException):
                still_failed.append((row, res))
        return still_failed, skips, skips > 0

    # Every failed attempt was a billed LLM call (or two — the analyzer's
    # in-call parse retry) with no Analysis row to carry its cost. Count them,
    # and recover the estimate where the exception carries reported usage, so
    # run spend is a labeled floor rather than a silent one.
    uncosted_attempts = 0
    unattributed_cost = 0.0

    def _tally_uncosted(failed_now: list) -> None:
        nonlocal uncosted_attempts, unattributed_cost
        for _, res in failed_now:
            uncosted_attempts += 1
            cost = getattr(res, "cost_usd", None)
            if cost:
                unattributed_cost += cost

    results = await _pass(rows)
    failed, cancelled_skips, saw_cancel = _split(list(zip(rows, results)))
    _tally_uncosted(failed)

    for attempt in range(1, settings.analysis_retry_passes + 1):
        if not failed or saw_cancel:
            break
        log.warning("analysis_retry_pass", attempt=attempt, retrying=len(failed))
        retry_rows = [row for row, _ in failed]
        retry_results = await _pass(retry_rows)
        failed, skips, saw_cancel = _split(list(zip(retry_rows, retry_results)))
        cancelled_skips += skips
        _tally_uncosted(failed)

    if cancelled_skips:
        log.info("analysis_abandoned_cancelled", skipped=cancelled_skips)
    failures = [res for _, res in failed]
    ok_count = len(rows) - len(failures) - cancelled_skips
    return ok_count, failures, uncosted_attempts, unattributed_cost


async def _analyze_one(
    response_id: uuid.UUID,
    prompt_text: str,
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    client_name: str,
    competitor_names: list[str],
    analyzer: ResponseAnalyzer,
    semaphore: asyncio.Semaphore,
    session_factory: async_sessionmaker,
    log,
) -> None:
    async with semaphore:
        # Kill switch: checked AFTER the semaphore wait so a cancel issued
        # while this analysis queued stops it before the LLM call is made.
        if await run_is_cancelled(run_id, session_factory):
            raise RunCancelledError(str(response_id))
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
