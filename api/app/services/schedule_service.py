"""
Schedule service — pure scheduling logic.

compute_next_run_time: stateless, testable, no DB access.
is_due_to_run: async, checks live DB state before confirming a client should run.
update_next_run_time: mutates the client row (caller commits).

All datetime values are TIMEZONE-NAIVE UTC to match the TIMESTAMP WITHOUT TIME ZONE
columns that SQLAlchemy infers from Mapped[datetime]. Passing timezone-aware datetimes
to asyncpg for those columns raises "can't subtract offset-naive and offset-aware
datetimes".
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.prompt import Prompt
from app.models.run import Run, RunStatus


def _naive_utc(dt: datetime) -> datetime:
    """Strip tzinfo so the value is safe to write to TIMESTAMP WITHOUT TIME ZONE."""
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def compute_next_run_time(
    cadence: str,
    schedule_hour: int,
    schedule_minute: int,
    schedule_day_of_week: Optional[int],
    now: datetime,
) -> Optional[datetime]:
    """
    Pure function: given schedule config and current time, return next UTC run datetime.
    Returns None for cadence='manual'.
    Always returns a TIMEZONE-NAIVE datetime (safe for DB storage).

    Weekday convention: 0=Monday … 6=Sunday (Python / ISO 8601).
    """
    if cadence == "manual":
        return None

    # Work with naive UTC internally — strip tzinfo if caller passed aware datetime
    now = _naive_utc(now)

    if cadence == "hourly":
        candidate = now.replace(second=0, microsecond=0, minute=schedule_minute)
        if candidate <= now:
            candidate += timedelta(hours=1)
        return candidate

    if cadence == "daily":
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
        days_ahead = schedule_day_of_week - now.weekday()
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

    # Compare as naive UTC — both now and the DB value are naive UTC
    now_cmp = _naive_utc(now)
    next_cmp = _naive_utc(client.next_scheduled_run_at)
    if next_cmp > now_cmp:
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
    Both values are stored as timezone-naive UTC.
    """
    now_naive = _naive_utc(now)
    client.last_scheduled_run_at = now_naive
    client.next_scheduled_run_at = compute_next_run_time(
        cadence=client.schedule_cadence,
        schedule_hour=client.schedule_hour,
        schedule_minute=client.schedule_minute,
        schedule_day_of_week=client.schedule_day_of_week,
        now=now_naive,
    )
