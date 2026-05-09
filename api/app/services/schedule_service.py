"""
Schedule service — pure scheduling logic.

All schedule times (schedule_hour, schedule_minute) are stored in the CLIENT'S
local timezone. compute_next_run_time converts them to naive UTC for DB storage.

This means "daily at 02:00" means 02:00 in the client's timezone — not 02:00 UTC.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession  # used by is_due_to_run

from app.models.client import Client
from app.models.prompt import Prompt
from app.models.run import Run, RunStatus


def _naive_utc(dt: datetime) -> datetime:
    """Strip tzinfo — safe to write to TIMESTAMP WITHOUT TIME ZONE."""
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _get_tz(timezone_str: str) -> ZoneInfo:
    """Return ZoneInfo for the given IANA name, falling back to UTC."""
    try:
        return ZoneInfo(timezone_str)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def compute_next_run_time(
    cadence: str,
    schedule_hour: int,
    schedule_minute: int,
    schedule_day_of_week: Optional[int],
    now: datetime,
    timezone_str: str = "UTC",
) -> Optional[datetime]:
    """
    Return the next UTC run datetime (timezone-naive) given the schedule config.

    schedule_hour / schedule_minute are expressed in the client's local timezone
    (timezone_str). The returned value is always naive UTC for DB storage.

    Returns None for cadence='manual'.
    Weekday convention: 0=Monday … 6=Sunday.
    """
    if cadence == "manual":
        return None

    tz = _get_tz(timezone_str)
    utc = ZoneInfo("UTC")

    # Convert now to UTC-aware, then to client's local timezone
    now_naive = _naive_utc(now)
    now_utc = now_naive.replace(tzinfo=utc)
    now_local = now_utc.astimezone(tz)

    if cadence == "hourly":
        candidate = now_local.replace(second=0, microsecond=0, minute=schedule_minute)
        if candidate <= now_local:
            candidate += timedelta(hours=1)

    elif cadence == "daily":
        candidate = now_local.replace(
            second=0, microsecond=0,
            hour=schedule_hour, minute=schedule_minute,
        )
        if candidate <= now_local:
            candidate += timedelta(days=1)

    elif cadence == "weekly":
        if schedule_day_of_week is None:
            return None
        days_ahead = schedule_day_of_week - now_local.weekday()
        if days_ahead < 0:
            days_ahead += 7
        candidate = (now_local + timedelta(days=days_ahead)).replace(
            second=0, microsecond=0,
            hour=schedule_hour, minute=schedule_minute,
        )
        if candidate <= now_local:
            candidate += timedelta(weeks=1)

    else:
        return None

    # Convert the local candidate back to naive UTC for DB storage
    return _naive_utc(candidate.astimezone(utc))


async def is_due_to_run(client: Client, now: datetime, db: AsyncSession) -> bool:
    """
    Returns True only when all conditions for an automated run are met.
    Comparison is always in UTC (both next_scheduled_run_at and now are naive UTC).
    """
    if client.status != "active":
        return False
    if not client.schedule_enabled:
        return False
    if client.schedule_cadence == "manual":
        return False
    if client.next_scheduled_run_at is None:
        return False

    now_cmp = _naive_utc(now)
    next_cmp = _naive_utc(client.next_scheduled_run_at)
    if next_cmp > now_cmp:
        return False

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


def update_next_run_time(client: Client, now: datetime) -> None:
    """
    Stamp last_scheduled_run_at and advance next_scheduled_run_at.
    Uses the client's timezone so the next run is in their local time.
    Synchronous — caller owns the DB session and commits after calling this.
    """
    now_naive = _naive_utc(now)
    client.last_scheduled_run_at = now_naive
    client.next_scheduled_run_at = compute_next_run_time(
        cadence=client.schedule_cadence,
        schedule_hour=client.schedule_hour,
        schedule_minute=client.schedule_minute,
        schedule_day_of_week=client.schedule_day_of_week,
        now=now_naive,
        timezone_str=client.timezone,
    )
