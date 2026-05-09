"""
Schedule service — pure scheduling logic.

compute_next_run_time: stateless, testable, no DB access.
is_due_to_run: async, checks live DB state before confirming a client should run.
update_next_run_time: mutates the client row (caller commits).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.prompt import Prompt
from app.models.run import Run, RunStatus


def compute_next_run_time(
    cadence: str,
    schedule_hour: int,
    schedule_minute: int,
    schedule_day_of_week: Optional[int],
    last_run_at: Optional[datetime],
    now: datetime,
) -> Optional[datetime]:
    """
    Pure function: given schedule config and current time, return next UTC run datetime.
    Returns None for cadence='manual'.

    Weekday convention: 0=Monday … 6=Sunday (Python / ISO 8601).
    """
    if cadence == "manual":
        return None

    # Normalise to UTC-aware
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if cadence == "hourly":
        # Next :MM minute mark
        candidate = now.replace(second=0, microsecond=0, minute=schedule_minute)
        if candidate <= now:
            candidate += timedelta(hours=1)
        return candidate

    if cadence == "daily":
        # Next HH:MM UTC
        candidate = now.replace(
            second=0, microsecond=0,
            hour=schedule_hour, minute=schedule_minute,
        )
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    if cadence == "weekly":
        if schedule_day_of_week is None:
            return None
        current_weekday = now.weekday()
        days_ahead = schedule_day_of_week - current_weekday
        if days_ahead < 0:
            days_ahead += 7
        candidate = (now + timedelta(days=days_ahead)).replace(
            second=0, microsecond=0,
            hour=schedule_hour, minute=schedule_minute,
        )
        if candidate <= now:
            candidate += timedelta(weeks=1)
        return candidate

    return None


async def is_due_to_run(client: Client, now: datetime, db: AsyncSession) -> bool:
    """
    Returns True only when all conditions for an automated run are met:
    1. Client is active
    2. Schedule is enabled with a non-manual cadence
    3. next_scheduled_run_at has passed
    4. At least one active prompt exists
    5. No run is currently pending or running for this client
    """
    if client.status != "active":
        return False
    if not client.schedule_enabled:
        return False
    if client.schedule_cadence == "manual":
        return False
    if client.next_scheduled_run_at is None:
        return False

    # Timezone-aware comparison
    next_run = client.next_scheduled_run_at
    if next_run.tzinfo is None:
        next_run = next_run.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if next_run > now:
        return False

    # Need at least one active prompt
    prompt_count = (
        await db.execute(
            select(func.count()).where(
                Prompt.client_id == client.id,
                Prompt.is_active.is_(True),
            )
        )
    ).scalar_one()
    if prompt_count == 0:
        return False

    # Block if a run is already in flight
    active_run = (
        await db.execute(
            select(Run).where(
                Run.client_id == client.id,
                Run.status.in_([RunStatus.pending, RunStatus.running]),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if active_run is not None:
        return False

    return True


async def update_next_run_time(
    client: Client, now: datetime, db: AsyncSession
) -> None:
    """
    Stamp last_scheduled_run_at = now and advance next_scheduled_run_at.
    Caller is responsible for committing the session.
    """
    client.last_scheduled_run_at = now
    client.next_scheduled_run_at = compute_next_run_time(
        cadence=client.schedule_cadence,
        schedule_hour=client.schedule_hour,
        schedule_minute=client.schedule_minute,
        schedule_day_of_week=client.schedule_day_of_week,
        last_run_at=now,
        now=now,
    )
