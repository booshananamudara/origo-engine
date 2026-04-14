"""
Run orchestrator service.

Responsibilities:
  - start_run(): create a Run row, return its id immediately
  - orchestrate_run(): fan out all prompts × all platforms concurrently,
    persist each Response, update run progress, set final status

Concurrency model:
  - One asyncio.Semaphore per platform, size = settings.max_concurrent_per_platform
  - All (prompt × platform) tasks launched with asyncio.gather(return_exceptions=True)
  - Individual task failures are logged and counted; they don't abort other tasks
  - A run is marked "failed" only if every single task failed
"""
import asyncio
import uuid
from datetime import datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.prompt import Prompt
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus
from app.platforms import all_platforms, get_adapter
from app.platforms.base import PlatformResponse

logger = structlog.get_logger()


async def start_run(client_id: uuid.UUID, db: AsyncSession) -> Run:
    """
    Create a pending Run for the given client and return it.
    The caller is responsible for committing the session.
    """
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

    run = Run(
        client_id=client_id,
        status=RunStatus.pending,
        total_prompts=total,
        completed_prompts=0,
    )
    db.add(run)
    await db.flush()  # get run.id without committing

    logger.info(
        "run_created",
        run_id=str(run.id),
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
    """
    Execute all prompt × platform tasks for a run.

    Designed to run as a FastAPI BackgroundTask — opens its own DB sessions.
    """
    log = logger.bind(run_id=str(run_id), client_id=str(client_id))
    log.info("orchestration_start")

    # ── Mark run as running ───────────────────────────────────────────────────
    async with session_factory() as db:
        async with db.begin():
            result = await db.execute(select(Run).where(Run.id == run_id))
            run = result.scalar_one()
            run.status = RunStatus.running
            run.updated_at = datetime.utcnow()

    # ── Load prompts ──────────────────────────────────────────────────────────
    async with session_factory() as db:
        result = await db.execute(
            select(Prompt).where(
                Prompt.client_id == client_id,
                Prompt.is_active.is_(True),
            )
        )
        prompts = result.scalars().all()

    platforms = all_platforms()
    semaphores: dict[Platform, asyncio.Semaphore] = {
        p: asyncio.Semaphore(settings.max_concurrent_per_platform) for p in platforms
    }

    # ── Fan out tasks ─────────────────────────────────────────────────────────
    tasks = [
        _run_task(
            prompt=prompt,
            platform=platform,
            run_id=run_id,
            client_id=client_id,
            semaphore=semaphores[platform],
            session_factory=session_factory,
            log=log,
        )
        for prompt in prompts
        for platform in platforms
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # ── Tally outcomes ────────────────────────────────────────────────────────
    failures = [r for r in results if isinstance(r, BaseException)]
    success_count = len(results) - len(failures)

    for exc in failures:
        log.error("task_failed", error=str(exc))

    # ── Finalise run status ───────────────────────────────────────────────────
    final_status = RunStatus.failed if success_count == 0 else RunStatus.completed

    async with session_factory() as db:
        async with db.begin():
            result = await db.execute(select(Run).where(Run.id == run_id))
            run = result.scalar_one()
            run.status = final_status
            run.updated_at = datetime.utcnow()
            if failures:
                run.error_message = f"{len(failures)} task(s) failed; {success_count} succeeded"

    log.info(
        "orchestration_complete",
        status=final_status.value,
        succeeded=success_count,
        failed=len(failures),
    )


async def _run_task(
    prompt: Prompt,
    platform: Platform,
    run_id: uuid.UUID,
    client_id: uuid.UUID,
    semaphore: asyncio.Semaphore,
    session_factory: async_sessionmaker,
    log,
) -> None:
    """One unit of work: call the platform adapter and persist the response."""
    adapter = get_adapter(platform)
    task_log = log.bind(
        platform=platform.value,
        prompt_id=str(prompt.id),
    )

    async with semaphore:
        task_log.debug("task_start")
        platform_resp: PlatformResponse = await adapter.complete(
            prompt_text=prompt.text,
            client_id=client_id,
        )

    # Persist response (outside semaphore — DB write doesn't count against API concurrency)
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
            )
            db.add(response)

            # Increment completed_prompts atomically
            result = await db.execute(select(Run).where(Run.id == run_id))
            run = result.scalar_one()
            run.completed_prompts += 1
            run.updated_at = datetime.utcnow()

    task_log.debug("task_complete", latency_ms=platform_resp.latency_ms)
