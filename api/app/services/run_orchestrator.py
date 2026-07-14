"""
Run orchestrator service.

Responsibilities:
  - start_run(): create a Run row, return its id immediately
  - orchestrate_run(): fan out all prompts × all platforms concurrently,
    persist each Response, update run progress, set final status

Concurrency model:
  - One asyncio.Semaphore per platform, size = settings.max_concurrent_per_platform
  - All (prompt × platform) tasks launched with asyncio.gather()
  - Failed/timed-out tasks are re-run in up to settings.monitoring_retry_passes
    extra passes after the first wave (dropped calls are retried, not lost)
  - Grounded platforms get a larger per-call timeout (multi-round search loops)
  - Task failures that survive all passes are captured with platform context
    and stored as JSON in run.error_message so the UI can display them
  - A run is marked "failed" only if every single task failed
"""
import asyncio
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.client import Client
from app.models.prompt import Prompt
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus
from app.platforms import all_platforms, get_adapter
from app.platforms.base import PlatformResponse
from app.platforms.model_registry import get_model_for_client
from app.services.platform_rate_limiter import acquire_platform_token

logger = structlog.get_logger()


@dataclass
class _TaskResult:
    platform: Platform
    success: bool
    error: str | None = None
    # True when the task was never attempted because the run was cancelled —
    # not a failure: excluded from retries and from platform error reporting.
    skipped: bool = False


async def run_is_cancelled(run_id: uuid.UUID, session_factory: async_sessionmaker) -> bool:
    """Cheap kill-switch check (PK lookup) used between/inside pipeline stages.

    Polled cooperatively before every upstream call so that once an admin
    cancels a run, no NEW spend is incurred; in-flight calls finish or abort
    within their own timeout.
    """
    async with session_factory() as db:
        status = (
            await db.execute(select(Run.status).where(Run.id == run_id))
        ).scalar_one_or_none()
    return status == RunStatus.cancelled


def _is_grounded(platform: Platform) -> bool:
    """True when this platform's monitoring calls answer from the live web."""
    if platform == Platform.perplexity:
        return True  # natively web-grounded (sonar), no toggle
    if not settings.web_grounding_enabled:
        return False
    return bool(getattr(settings, f"web_grounding_{platform.value}", False))


def _call_timeout(platform: Platform) -> float:
    """Per-call timeout: grounded calls run multi-round server-side search
    loops and need more headroom than a plain completion — this was the source
    of the 'fastest platforms timing out at 90s' drops."""
    if _is_grounded(platform):
        return max(
            settings.platform_call_timeout_seconds,
            settings.platform_call_timeout_grounded_seconds,
        )
    return settings.platform_call_timeout_seconds


def _clean_error(exc: Exception) -> str:
    """Extract a human-readable message from an API exception."""

    # 1. SDK exception with a structured body dict (Anthropic, OpenAI)
    if hasattr(exc, "body") and isinstance(exc.body, dict):
        nested = exc.body.get("error", {})
        if isinstance(nested, dict) and nested.get("message"):
            msg = str(nested["message"])
            err_type = nested.get("type", "")
            # Make model-not-found errors human-readable
            if err_type in ("not_found_error", "model_not_found") or "model:" in msg:
                return f"Model not available on this account: {msg}"
            return msg[:300]

    raw = str(exc)

    # 3. JSON-style: "message": "..." or 'message': '...'
    match = re.search(r"['\"]message['\"]\s*:\s*['\"]([^'\"]{10,})['\"]", raw)
    if match:
        return match.group(1)[:300]

    # 4. Gemini REST style: "message": "..."  (double-quote only)
    match = re.search(r'"message":\s*"([^"]{10,})"', raw)
    if match:
        return match.group(1)[:300]

    # 5. Fall back: strip boilerplate prefix and return truncated raw
    raw = re.sub(r"^Error code: \d+ - ", "", raw)
    return raw[:300]


async def _generate_display_id(slug: str, ts: datetime, db: AsyncSession) -> str:
    """Generate a unique display_id in format {slug}-{YYMMDD}-{HHmm}, with collision suffix."""
    base = f"{slug}-{ts.strftime('%y%m%d-%H%M')}"
    candidate = base
    suffix = 2
    while True:
        existing = (
            await db.execute(select(Run).where(Run.display_id == candidate))
        ).scalar_one_or_none()
        if existing is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


async def start_run(client_id: uuid.UUID, db: AsyncSession) -> Run:
    """
    Create a pending Run for the given client and return it.
    The caller is responsible for committing the session.
    """
    # Load client for slug (needed for display_id)
    client = (
        await db.execute(select(Client).where(Client.id == client_id))
    ).scalar_one_or_none()
    if client is None:
        raise ValueError(f"Client {client_id} not found")

    result = await db.execute(
        select(Prompt).where(
            Prompt.client_id == client_id,
            Prompt.is_active.is_(True),
        )
    )
    prompts = result.scalars().all()
    if not prompts:
        raise ValueError(f"No active prompts found for client {client_id}")

    platforms = all_platforms()
    total = len(prompts) * len(platforms)

    ts = datetime.now(timezone.utc)
    display_id = await _generate_display_id(client.slug, ts, db)

    run = Run(
        client_id=client_id,
        display_id=display_id,
        status=RunStatus.pending,
        total_prompts=total,
        completed_prompts=0,
    )
    db.add(run)
    await db.flush()

    logger.info(
        "run_created",
        run_id=str(run.id),
        display_id=display_id,
        client_id=str(client_id),
        total_tasks=total,
        prompts=len(prompts),
        platforms=len(platforms),
    )
    return run


async def orchestrate_run(
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    session_factory: async_sessionmaker,
) -> None:
    log = logger.bind(run_id=str(run_id), client_id=str(client_id))
    log.info("orchestration_start")

    # Load client's model config
    async with session_factory() as db:
        client = (await db.execute(select(Client).where(Client.id == client_id))).scalar_one_or_none()
        platform_model_config = client.platform_model_config if client else None

    # Mark run as running — unless the kill switch was already pulled between
    # trigger and pipeline start (never resurrect a cancelled run).
    async with session_factory() as db:
        async with db.begin():
            run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
            if run.status == RunStatus.cancelled:
                log.info("orchestration_skipped_cancelled")
                return
            run.status = RunStatus.running
            run.updated_at = datetime.utcnow()

    # Load prompts
    async with session_factory() as db:
        prompts = (
            await db.execute(
                select(Prompt).where(
                    Prompt.client_id == client_id,
                    Prompt.is_active.is_(True),
                )
            )
        ).scalars().all()

    platforms = all_platforms()
    semaphores: dict[Platform, asyncio.Semaphore] = {
        p: asyncio.Semaphore(settings.max_concurrent_per_platform) for p in platforms
    }

    async def _run_pass(specs: list[tuple[Prompt, Platform]]) -> list[_TaskResult]:
        return await asyncio.gather(*[
            _run_task(
                prompt=prompt,
                platform=platform,
                run_id=run_id,
                client_id=client_id,
                semaphore=semaphores[platform],
                session_factory=session_factory,
                log=log,
                platform_model_config=platform_model_config,
            )
            for prompt, platform in specs
        ])

    specs: list[tuple[Prompt, Platform]] = [
        (prompt, platform) for prompt in prompts for platform in platforms
    ]
    total_tasks = len(specs)

    results = await _run_pass(specs)
    skipped_count = sum(1 for res in results if res.skipped)
    failed: list[tuple[tuple[Prompt, Platform], _TaskResult]] = [
        (spec, res) for spec, res in zip(specs, results)
        if not res.success and not res.skipped
    ]

    # Retry the dropped calls in extra passes AFTER the first wave: a call that
    # timed out or errored is not silently lost anymore. Waiting for the wave
    # to finish lets transient rate-limit/load pressure subside; the adapters'
    # in-call 429/5xx retries have already been exhausted by this point.
    # Cancelled-skip results are not failures and are never retried.
    for attempt in range(1, settings.monitoring_retry_passes + 1):
        if not failed:
            break
        if await run_is_cancelled(run_id, session_factory):
            log.info("monitoring_retries_abandoned_cancelled", remaining=len(failed))
            break
        backoff = settings.monitoring_retry_backoff_seconds * attempt
        log.warning(
            "monitoring_retry_pass",
            attempt=attempt,
            retrying=len(failed),
            backoff_s=backoff,
        )
        if backoff > 0:
            await asyncio.sleep(backoff)
        retry_specs = [spec for spec, _ in failed]
        retry_results = await _run_pass(retry_specs)
        skipped_count += sum(1 for res in retry_results if res.skipped)
        failed = [
            (spec, res)
            for spec, res in zip(retry_specs, retry_results)
            if not res.success and not res.skipped
        ]

    # Collect unique error per platform (first error seen for each) from the
    # FINAL state only — a call that succeeded on retry is not an error.
    platform_errors: dict[str, str] = {}
    for _, result in failed:
        key = result.platform.value
        if key not in platform_errors and result.error:
            platform_errors[key] = result.error
            log.error("task_failed", platform=key, error=result.error)
    success_count = total_tasks - len(failed) - skipped_count

    # If every single platform task failed, mark as failed immediately.
    # Otherwise keep as "running" so the pipeline can set "completed" only
    # after analysis is also done. A cancelled run keeps its status — the
    # kill switch is terminal and orchestration must never overwrite it.
    final_status = RunStatus.failed if success_count == 0 else RunStatus.running

    async with session_factory() as db:
        async with db.begin():
            run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
            if run.status == RunStatus.cancelled:
                final_status = RunStatus.cancelled
            else:
                run.status = final_status
            run.updated_at = datetime.utcnow()
            # Store errors as JSON so the API can surface them to the UI
            run.error_message = json.dumps(platform_errors) if platform_errors else None

    log.info(
        "orchestration_complete",
        status=final_status.value,
        succeeded=success_count,
        failed=len(failed),
        skipped_cancelled=skipped_count,
        retry_passes=settings.monitoring_retry_passes,
    )


async def _run_task(
    prompt: Prompt,
    platform: Platform,
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    semaphore: asyncio.Semaphore,
    session_factory: async_sessionmaker,
    log,
    platform_model_config: dict | None = None,
) -> _TaskResult:
    """One unit of work: call the platform adapter and persist the response."""
    adapter = get_adapter(platform)
    task_log = log.bind(platform=platform.value, prompt_id=str(prompt.id))
    model_override = get_model_for_client(platform.value, platform_model_config)

    timeout_s = _call_timeout(platform)
    try:
        async with semaphore:
            # Kill switch: checked AFTER the semaphore wait so a cancel issued
            # while this task queued stops it before any money is spent.
            if await run_is_cancelled(run_id, session_factory):
                task_log.debug("task_skipped_cancelled")
                return _TaskResult(platform=platform, success=False, skipped=True)
            task_log.debug("task_start")
            await acquire_platform_token(platform.value)
            # Bound every platform call: without this, a single hung/slow call
            # holds the whole asyncio.gather and stalls the entire run.
            # Grounded calls get extra headroom (see _call_timeout).
            platform_resp: PlatformResponse = await asyncio.wait_for(
                adapter.complete(
                    prompt_text=prompt.text,
                    client_id=client_id,
                    model=model_override or None,
                ),
                timeout=timeout_s,
            )
    except TimeoutError:
        msg = f"No response within {timeout_s:g}s (call timed out)"
        task_log.error("task_timeout", timeout_s=timeout_s)
        return _TaskResult(platform=platform, success=False, error=msg)
    except Exception as exc:
        task_log.error("task_failed", error=str(exc)[:300])
        return _TaskResult(platform=platform, success=False, error=_clean_error(exc))

    # Persist response
    try:
        async with session_factory() as db:
            async with db.begin():
                response = Response(
                    client_id=client_id,
                    run_id=run_id,
                    prompt_id=prompt.id,
                    platform=platform,
                    raw_response=platform_resp.raw_response,
                    model_used=platform_resp.model_used,
                    latency_ms=platform_resp.latency_ms,
                    tokens_used=platform_resp.tokens_used,
                    cost_usd=platform_resp.cost_usd,
                    sources=platform_resp.sources,
                )
                db.add(response)

                # Atomic increment in SQL. A read-then-write on the ORM object
                # (SELECT → += 1 → UPDATE) races across the concurrent tasks,
                # each in its own session, and silently loses increments when
                # calls finish together — the source of the "118/120" undercount.
                await db.execute(
                    update(Run)
                    .where(Run.id == run_id)
                    .values(
                        completed_prompts=Run.completed_prompts + 1,
                        updated_at=datetime.utcnow(),
                    )
                )
    except Exception as exc:
        task_log.error("task_persist_failed", error=str(exc)[:300])
        return _TaskResult(platform=platform, success=False, error=_clean_error(exc))

    task_log.debug("task_complete", latency_ms=platform_resp.latency_ms)
    return _TaskResult(platform=platform, success=True)
