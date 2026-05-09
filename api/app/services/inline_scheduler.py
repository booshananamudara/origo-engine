"""
Inline scheduler — runs inside the FastAPI/uvicorn process.

An alternative to the standalone arq worker (Dockerfile.worker) for deployments
where a separate service is not available (e.g. Railway free tier).

Architecture:
  - FastAPI lifespan starts run_scheduler_loop() as an asyncio background task
  - Loop fires every 60 seconds
  - A Redis SET NX lock (55s TTL) ensures only ONE uvicorn worker executes
    the tick when --workers > 1 is used
  - The SELECT FOR UPDATE SKIP LOCKED inside the tick is a second safety layer
    that prevents the same client being double-enqueued even if two ticks overlap
  - Each run is fired via asyncio.create_task() — pipelines run concurrently
    inside the same event loop without blocking the tick or HTTP requests
"""
import asyncio
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models.client import Client
from app.models.scheduler_health import SchedulerHealth
from app.models.scheduler_run import SchedulerRun
from app.services.audit_service import log_audit
from app.services.pipeline import run_pipeline
from app.services.run_orchestrator import start_run
from app.services.schedule_service import is_due_to_run, update_next_run_time
from app.services.scheduler_alerts import check_and_alert_on_failures, check_stale_clients

logger = structlog.get_logger()

_LOCK_KEY = "origo:scheduler_lock"
_LOCK_TTL = 55  # seconds — expires before the next 60s tick so the lock is renewable


async def _acquire_tick_lock() -> bool:
    """
    Acquire a Redis NX lock so only one uvicorn worker runs the tick.
    Returns True (proceed) if acquired or if Redis is unavailable.
    """
    try:
        from app.services.platform_rate_limiter import _get_async_redis
        r = _get_async_redis()
        if r is None:
            return True
        acquired = await r.set(_LOCK_KEY, "1", nx=True, ex=_LOCK_TTL)
        return bool(acquired)
    except Exception:
        return True  # fail open — better to double-tick than to skip entirely


async def _execute_scheduled_run(client_id: uuid.UUID, sr_id: uuid.UUID) -> None:
    """
    Run the full pipeline for one scheduled client.
    Mirrors the arq execute_scheduled_run job, but uses asyncio.sleep for retries
    instead of arq's Retry exception.
    """
    log = logger.bind(client_id=str(client_id), scheduler_run_id=str(sr_id))
    run_id: uuid.UUID | None = None

    # ── Phase 1: create the Run row ───────────────────────────────────────────
    async with AsyncSessionLocal() as db:
        sr = (
            await db.execute(select(SchedulerRun).where(SchedulerRun.id == sr_id))
        ).scalar_one_or_none()
        if sr is None:
            return

        sr.status = "started"
        sr.updated_at = datetime.utcnow()

        try:
            run = await start_run(client_id, db)
            sr.run_id = run.id
            run_id = run.id
            await log_audit(
                db, client_id=client_id, action="scheduled_run_started",
                entity_type="run", entity_id=run.id, actor="scheduler",
                details={"cadence": sr.cadence},
            )
            await db.commit()
        except ValueError as exc:
            sr.status = "failed"
            sr.error_message = str(exc)
            sr.updated_at = datetime.utcnow()
            await db.commit()
            log.error("scheduled_run_no_prompts", error=str(exc))
            return
        except Exception as exc:
            sr.status = "failed"
            sr.error_message = f"Setup failed: {str(exc)[:300]}"
            sr.updated_at = datetime.utcnow()
            await db.commit()
            log.error("scheduled_run_setup_failed", error=str(exc))
            return

    if run_id is None:
        return

    # ── Phase 2: execute pipeline with up to 3 attempts ──────────────────────
    for attempt in range(3):
        try:
            await run_pipeline(run_id, client_id, AsyncSessionLocal)

            async with AsyncSessionLocal() as db:
                async with db.begin():
                    sr = (
                        await db.execute(select(SchedulerRun).where(SchedulerRun.id == sr_id))
                    ).scalar_one()
                    sr.status = "completed"
                    sr.updated_at = datetime.utcnow()
                    await log_audit(
                        db, client_id=client_id, action="scheduled_run_completed",
                        entity_type="run", entity_id=run_id, actor="scheduler",
                    )
            log.info("scheduled_run_completed", run_id=str(run_id))
            return

        except Exception as exc:
            retry_count = attempt + 1
            log.error("scheduled_run_pipeline_failed", attempt=attempt, error=str(exc))

            async with AsyncSessionLocal() as db:
                async with db.begin():
                    sr = (
                        await db.execute(select(SchedulerRun).where(SchedulerRun.id == sr_id))
                    ).scalar_one()
                    sr.retry_count = retry_count
                    sr.updated_at = datetime.utcnow()
                    if retry_count >= 3:
                        sr.status = "failed"
                        sr.error_message = str(exc)[:500]
                        await log_audit(
                            db, client_id=client_id, action="scheduled_run_failed",
                            entity_type="run", entity_id=run_id, actor="scheduler",
                            details={"error": str(exc)[:200], "retry_count": retry_count},
                        )
                    else:
                        sr.status = "enqueued"

            if retry_count < 3:
                await asyncio.sleep(300 * (2 ** (retry_count - 1)))  # 5 min, 10 min
            # attempt 3 exhausted — loop exits, run stays as "failed"


async def inline_scheduler_tick() -> dict:
    """
    One tick: evaluate all schedule-enabled active clients, enqueue tasks for those due.
    Identical logic to arq scheduler_tick but fires asyncio.create_task instead of
    enqueueing an arq job.
    """
    start_time = datetime.now(timezone.utc)
    log = logger.bind(tick_id=str(uuid.uuid4())[:8])
    log.info("scheduler_tick_start", mode="inline")

    clients_evaluated = 0
    runs_enqueued = 0

    try:
        async with AsyncSessionLocal() as db:
            candidates = (
                await db.execute(
                    select(Client).where(
                        Client.schedule_enabled.is_(True),
                        Client.status == "active",
                    )
                )
            ).scalars().all()

        for client in candidates:
            clients_evaluated += 1
            try:
                sr_id: uuid.UUID | None = None

                async with AsyncSessionLocal() as db:
                    async with db.begin():
                        locked = (
                            await db.execute(
                                select(Client)
                                .where(Client.id == client.id)
                                .with_for_update(skip_locked=True)
                            )
                        ).scalar_one_or_none()

                        if locked is None:
                            continue

                        if not await is_due_to_run(locked, start_time, db):
                            continue

                        sr = SchedulerRun(
                            client_id=locked.id,
                            cadence=locked.schedule_cadence,
                            status="enqueued",
                            triggered_at=start_time,
                        )
                        db.add(sr)
                        sr_id = sr.id
                        await update_next_run_time(locked, start_time, db)

                if sr_id is None:
                    continue

                # Fire-and-forget — does not block the tick
                asyncio.create_task(
                    _execute_scheduled_run(client.id, sr_id),
                    name=f"sched-{str(client.id)[:8]}",
                )
                runs_enqueued += 1
                log.info("run_enqueued", client_id=str(client.id), cadence=client.schedule_cadence)

            except Exception as exc:
                log.error("tick_client_error", client_id=str(client.id), error=str(exc))

        # Stale-client alerting (best-effort)
        try:
            async with AsyncSessionLocal() as db:
                await check_stale_clients(db, start_time)
        except Exception:
            pass

        # Update health heartbeat
        duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        async with AsyncSessionLocal() as db:
            async with db.begin():
                health = (
                    await db.execute(
                        select(SchedulerHealth).where(SchedulerHealth.id == 1)
                    )
                ).scalar_one_or_none()
                if health:
                    health.last_tick_at = start_time
                    health.last_tick_duration_ms = duration_ms
                    health.last_tick_clients_evaluated = clients_evaluated
                    health.last_tick_runs_enqueued = runs_enqueued
                    health.consecutive_failures = 0
                    health.last_error = None
                    health.updated_at = datetime.utcnow()

        log.info(
            "scheduler_tick_complete",
            clients_evaluated=clients_evaluated,
            runs_enqueued=runs_enqueued,
            duration_ms=duration_ms,
        )
        return {"clients_evaluated": clients_evaluated, "runs_enqueued": runs_enqueued}

    except Exception as exc:
        log.error("scheduler_tick_failed", error=str(exc))
        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    health = (
                        await db.execute(
                            select(SchedulerHealth).where(SchedulerHealth.id == 1)
                        )
                    ).scalar_one_or_none()
                    if health:
                        health.consecutive_failures = (health.consecutive_failures or 0) + 1
                        health.last_error = str(exc)[:500]
                        health.updated_at = datetime.utcnow()
        except Exception:
            pass
        await check_and_alert_on_failures()
        return {"error": str(exc)}


async def run_scheduler_loop() -> None:
    """
    Infinite loop started as a background asyncio task in FastAPI's lifespan.
    Sleeps 60 seconds between ticks. Uses a Redis NX lock to ensure only one
    uvicorn worker runs the tick when the API is deployed with multiple workers.
    """
    logger.info("inline_scheduler_loop_started")
    # Brief startup delay so the DB is fully ready and other workers have
    # time to claim the lock first, reducing churn on startup
    await asyncio.sleep(5)

    while True:
        try:
            if await _acquire_tick_lock():
                await inline_scheduler_tick()
        except asyncio.CancelledError:
            logger.info("inline_scheduler_loop_stopped")
            raise
        except Exception as exc:
            logger.error("scheduler_loop_unhandled_error", error=str(exc))

        await asyncio.sleep(60)
