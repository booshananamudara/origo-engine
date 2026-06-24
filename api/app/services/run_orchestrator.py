"""
Run orchestrator service.

Responsibilities:
  - start_run(): create a Run row, return its id immediately
  - orchestrate_run(): fan out all prompts × all platforms concurrently,
    persist each Response, update run progress, set final status

Concurrency model:
  - One asyncio.Semaphore per platform, size = settings.max_concurrent_per_platform
  - All (prompt × platform) tasks launched with asyncio.gather()
  - Individual task failures are captured with full platform context and stored
    as JSON in run.error_message so the UI can display them
  - A run is marked "failed" only if every single task failed
"""
import asyncio
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
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

    # Mark run as running
    async with session_factory() as db:
        async with db.begin():
            run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
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

    tasks = [
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
        for prompt in prompts
        for platform in platforms
    ]

    results: list[_TaskResult] = await asyncio.gather(*tasks)

    # Collect unique error per platform (first error seen for each)
    platform_errors: dict[str, str] = {}
    success_count = 0
    for result in results:
        if result.success:
            success_count += 1
        else:
            key = result.platform.value
            if key not in platform_errors and result.error:
                platform_errors[key] = result.error
                log.error("task_failed", platform=key, error=result.error)

    # If every single platform task failed, mark as failed immediately.
    # Otherwise keep as "running" so the pipeline can set "completed" only
    # after analysis is also done.
    final_status = RunStatus.failed if success_count == 0 else RunStatus.running

    async with session_factory() as db:
        async with db.begin():
            run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
            run.status = final_status
            run.updated_at = datetime.utcnow()
            # Store errors as JSON so the API can surface them to the UI
            run.error_message = json.dumps(platform_errors) if platform_errors else None

    log.info(
        "orchestration_complete",
        status=final_status.value,
        succeeded=success_count,
        failed=len(results) - success_count,
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

    try:
        async with semaphore:
            task_log.debug("task_start")
            await acquire_platform_token(platform.value)
            platform_resp: PlatformResponse = await adapter.complete(
                prompt_text=prompt.text,
                client_id=client_id,
                model=model_override or None,
            )
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

                run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
                run.completed_prompts += 1
                run.updated_at = datetime.utcnow()
    except Exception as exc:
        task_log.error("task_persist_failed", error=str(exc)[:300])
        return _TaskResult(platform=platform, success=False, error=_clean_error(exc))

    task_log.debug("task_complete", latency_ms=platform_resp.latency_ms)
    return _TaskResult(platform=platform, success=True)
