"""
Unit tests for schedule_service.compute_next_run_time and is_due_to_run.

All tests are pure / synchronous for compute_next_run_time.
is_due_to_run tests use async mocking.
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.schedule_service import compute_next_run_time, is_due_to_run


def dt(hour: int, minute: int, weekday_offset: int = 0) -> datetime:
    """Helper: create a UTC-aware datetime at a fixed date (Monday 2026-01-05)."""
    base = datetime(2026, 1, 5, hour, minute, 0, tzinfo=timezone.utc)  # Monday
    from datetime import timedelta
    return base + timedelta(days=weekday_offset)


# ── compute_next_run_time ─────────────────────────────────────────────────────

class TestComputeNextRunTime:
    def test_manual_returns_none(self):
        result = compute_next_run_time("manual", 2, 0, None, None, dt(14, 25))
        assert result is None

    def test_hourly_before_minute(self):
        # schedule_minute=30, now=14:25 → next=14:30
        result = compute_next_run_time("hourly", 0, 30, None, None, dt(14, 25))
        assert result is not None
        assert result.hour == 14
        assert result.minute == 30

    def test_hourly_after_minute(self):
        # schedule_minute=30, now=14:35 → next=15:30
        result = compute_next_run_time("hourly", 0, 30, None, None, dt(14, 35))
        assert result is not None
        assert result.hour == 15
        assert result.minute == 30

    def test_hourly_on_the_minute(self):
        # schedule_minute=30, now=14:30:00 exactly → next is 15:30 (not 14:30 again)
        now = datetime(2026, 1, 5, 14, 30, 0, tzinfo=timezone.utc)
        result = compute_next_run_time("hourly", 0, 30, None, None, now)
        assert result is not None
        assert result.hour == 15
        assert result.minute == 30

    def test_daily_before_scheduled_hour(self):
        # schedule=02:00, now=01:00 → next is today 02:00
        result = compute_next_run_time("daily", 2, 0, None, None, dt(1, 0))
        assert result is not None
        assert result.hour == 2
        assert result.minute == 0
        assert result.date() == dt(1, 0).date()

    def test_daily_after_scheduled_hour(self):
        # schedule=02:00, now=03:00 → next is tomorrow 02:00
        result = compute_next_run_time("daily", 2, 0, None, None, dt(3, 0))
        assert result is not None
        assert result.hour == 2
        from datetime import timedelta
        assert result.date() == (dt(3, 0) + timedelta(days=1)).date()

    def test_weekly_next_week(self):
        # schedule=Monday(0) 02:00, now=Tuesday 03:00 → next=following Monday 02:00
        now = dt(3, 0, weekday_offset=1)  # Tuesday
        result = compute_next_run_time("weekly", 2, 0, 0, None, now)  # 0=Monday
        assert result is not None
        assert result.weekday() == 0  # Monday
        assert result.hour == 2
        # Should be 6 days from Tuesday
        from datetime import timedelta
        assert result.date() == (now + timedelta(days=6)).date()

    def test_weekly_same_day_before_time(self):
        # schedule=Monday(0) 14:00, now=Monday 13:00 → next=today 14:00
        now = dt(13, 0)  # Monday
        result = compute_next_run_time("weekly", 14, 0, 0, None, now)
        assert result is not None
        assert result.weekday() == 0
        assert result.hour == 14
        assert result.date() == now.date()

    def test_weekly_same_day_after_time(self):
        # schedule=Monday(0) 02:00, now=Monday 14:00 → next=following Monday 02:00
        now = dt(14, 0)  # Monday
        result = compute_next_run_time("weekly", 2, 0, 0, None, now)
        assert result is not None
        assert result.weekday() == 0
        from datetime import timedelta
        assert result.date() == (now + timedelta(weeks=1)).date()

    def test_weekly_none_day_of_week_returns_none(self):
        result = compute_next_run_time("weekly", 2, 0, None, None, dt(14, 0))
        assert result is None

    def test_unknown_cadence_returns_none(self):
        result = compute_next_run_time("unknown", 2, 0, None, None, dt(14, 0))
        assert result is None

    def test_timezone_naive_now_treated_as_utc(self):
        now_naive = datetime(2026, 1, 5, 1, 0, 0)  # no tzinfo
        result = compute_next_run_time("daily", 2, 0, None, None, now_naive)
        assert result is not None
        assert result.tzinfo is not None


# ── is_due_to_run ─────────────────────────────────────────────────────────────

def _make_client(**kwargs) -> MagicMock:
    defaults = dict(
        status="active",
        schedule_enabled=True,
        schedule_cadence="daily",
        next_scheduled_run_at=datetime(2026, 1, 5, 2, 0, tzinfo=timezone.utc),
        id="client-uuid",
    )
    defaults.update(kwargs)
    m = MagicMock()
    for k, v in defaults.items():
        setattr(m, k, v)
    return m


class TestIsDueToRun:
    def _mock_db(self, prompt_count: int = 5, active_run=None):
        db = AsyncMock()

        async def execute(q):
            result = MagicMock()
            result.scalar_one.return_value = prompt_count
            result.scalar_one_or_none.return_value = active_run
            return result

        db.execute = execute
        return db

    @pytest.mark.asyncio
    async def test_returns_true_when_all_conditions_met(self):
        client = _make_client()
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)  # 1 min after scheduled
        db = self._mock_db(prompt_count=5, active_run=None)
        assert await is_due_to_run(client, now, db) is True

    @pytest.mark.asyncio
    async def test_false_when_client_paused(self):
        client = _make_client(status="paused")
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        db = self._mock_db()
        assert await is_due_to_run(client, now, db) is False

    @pytest.mark.asyncio
    async def test_false_when_schedule_disabled(self):
        client = _make_client(schedule_enabled=False)
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        db = self._mock_db()
        assert await is_due_to_run(client, now, db) is False

    @pytest.mark.asyncio
    async def test_false_when_manual_cadence(self):
        client = _make_client(schedule_cadence="manual")
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        db = self._mock_db()
        assert await is_due_to_run(client, now, db) is False

    @pytest.mark.asyncio
    async def test_false_when_no_next_scheduled(self):
        client = _make_client(next_scheduled_run_at=None)
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        db = self._mock_db()
        assert await is_due_to_run(client, now, db) is False

    @pytest.mark.asyncio
    async def test_false_when_not_yet_due(self):
        client = _make_client(
            next_scheduled_run_at=datetime(2026, 1, 5, 3, 0, tzinfo=timezone.utc)
        )
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        db = self._mock_db()
        assert await is_due_to_run(client, now, db) is False

    @pytest.mark.asyncio
    async def test_false_when_no_active_prompts(self):
        client = _make_client()
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        db = self._mock_db(prompt_count=0)
        assert await is_due_to_run(client, now, db) is False

    @pytest.mark.asyncio
    async def test_false_when_run_already_active(self):
        client = _make_client()
        now = datetime(2026, 1, 5, 2, 1, tzinfo=timezone.utc)
        active_run = MagicMock()  # simulates an in-progress run
        db = self._mock_db(prompt_count=5, active_run=active_run)
        assert await is_due_to_run(client, now, db) is False
