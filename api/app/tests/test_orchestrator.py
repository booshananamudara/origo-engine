"""
End-to-end tests for the run orchestrator.

All external platform calls and DB sessions are mocked.
Tests verify:
  - Response rows are persisted for every (prompt × platform) pair
  - Run transitions: pending → running → completed
  - Partial failures: some tasks fail, run still completes with error note
  - Total failure: all tasks fail, run marked as failed
  - Bounded concurrency: peak concurrent calls ≤ max_concurrent_per_platform
"""
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.prompt import Prompt
from app.models.response import Platform, Response
from app.models.run import Run, RunStatus
from app.platforms.base import PlatformResponse
from app.services.run_orchestrator import orchestrate_run, start_run

# ── Fixtures ──────────────────────────────────────────────────────────────────

CLIENT_ID = uuid.uuid4()
RUN_ID = uuid.uuid4()

PROMPTS = [
    Prompt(
        id=uuid.uuid4(),
        client_id=CLIENT_ID,
        text=f"Prompt {i}",
        category="test",
        is_active=True,
    )
    for i in range(3)
]


def _make_platform_response(platform: Platform) -> PlatformResponse:
    return PlatformResponse(
        platform=platform,
        raw_response=f"Response from {platform.value}",
        model_used="test-model",
        latency_ms=100,
        tokens_used=50,
        cost_usd=0.0001,
    )


def _make_run(status: RunStatus = RunStatus.pending) -> Run:
    run = Run(
        client_id=CLIENT_ID,
        status=status,
        total_prompts=len(PROMPTS) * 3,
        completed_prompts=0,
    )
    run.id = RUN_ID
    run.updated_at = datetime.utcnow()
    return run


# ── Session factory helpers ───────────────────────────────────────────────────

class _RunResult:
    """Explicit scalar result that returns the exact run object — no MagicMock magic."""

    def __init__(self, run: Run) -> None:
        self._run = run

    def scalar_one(self) -> Run:
        return self._run


class _PromptsResult:
    """Explicit scalars result that returns the prompts list."""

    def __init__(self, prompts: list[Prompt]) -> None:
        self._prompts = prompts

    def scalars(self):
        prompts = self._prompts

        class _Scalars:
            def all(self_inner):
                return prompts

        return _Scalars()


class _FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


class _FakeSession:
    """
    Minimal async session mock that tracks added objects and supports
    execute() returning either a Run or list of Prompts.
    """

    def __init__(self, run: Run, prompts: list[Prompt]) -> None:
        self._run = run
        self._prompts = prompts
        self.added: list = []

    async def execute(self, stmt):
        # Match on "from prompts" to avoid false-positive on "total_prompts" / "completed_prompts"
        stmt_str = str(stmt).lower()
        if "from prompts" in stmt_str:
            return _PromptsResult(self._prompts)
        return _RunResult(self._run)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    def begin(self):
        return _FakeTransaction()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


def _make_session_factory(run: Run, prompts: list[Prompt]):
    """Return a callable that behaves like async_sessionmaker."""
    session = _FakeSession(run=run, prompts=prompts)

    @asynccontextmanager
    async def factory():
        yield session

    return factory, session


# ── start_run() ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_run_creates_run():
    db = MagicMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = PROMPTS
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()

    with patch("app.platforms.all_platforms", return_value=list(Platform)):
        run = await start_run(CLIENT_ID, db)

    assert run.client_id == CLIENT_ID
    assert run.status == RunStatus.pending
    assert run.total_prompts == len(PROMPTS) * len(list(Platform))
    assert run.completed_prompts == 0
    db.flush.assert_called_once()


@pytest.mark.asyncio
async def test_start_run_raises_if_no_prompts():
    db = MagicMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    with pytest.raises(ValueError, match="No active prompts"):
        await start_run(CLIENT_ID, db)


# ── orchestrate_run() — happy path ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrate_run_persists_all_responses():
    """3 prompts × 3 platforms = 9 Response objects added."""
    run = _make_run()
    factory, session = _make_session_factory(run=run, prompts=PROMPTS)

    def mock_get_adapter(platform):
        adapter = MagicMock()
        adapter.complete = AsyncMock(return_value=_make_platform_response(platform))
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=list(Platform)):
            await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    responses = [obj for obj in session.added if isinstance(obj, Response)]
    assert len(responses) == len(PROMPTS) * len(list(Platform))  # 9


@pytest.mark.asyncio
async def test_orchestrate_run_transitions_to_completed():
    run = _make_run()
    factory, session = _make_session_factory(run=run, prompts=PROMPTS)

    def mock_get_adapter(platform):
        adapter = MagicMock()
        adapter.complete = AsyncMock(return_value=_make_platform_response(platform))
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=list(Platform)):
            await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    assert run.status == RunStatus.completed


@pytest.mark.asyncio
async def test_orchestrate_run_covers_all_prompt_platform_pairs():
    """Every (prompt_id, platform) combination appears in persisted responses."""
    run = _make_run()
    factory, session = _make_session_factory(run=run, prompts=PROMPTS)

    def mock_get_adapter(platform):
        adapter = MagicMock()
        adapter.complete = AsyncMock(return_value=_make_platform_response(platform))
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=list(Platform)):
            await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    responses = [obj for obj in session.added if isinstance(obj, Response)]
    pairs = {(str(r.prompt_id), r.platform) for r in responses}
    expected = {
        (str(p.id), plat)
        for p in PROMPTS
        for plat in Platform
    }
    assert pairs == expected


# ── Partial failure tolerance ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrate_run_tolerates_partial_failure():
    """If some tasks fail, the run completes with error_message set."""
    run = _make_run()
    factory, session = _make_session_factory(run=run, prompts=PROMPTS)

    call_count = 0

    def mock_get_adapter(platform):
        adapter = MagicMock()

        async def flaky_complete(prompt_text, client_id):
            nonlocal call_count
            call_count += 1
            # Fail every third call
            if call_count % 3 == 0:
                raise RuntimeError("Simulated platform error")
            return _make_platform_response(platform)

        adapter.complete = flaky_complete
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=list(Platform)):
            await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    # Run should complete (not fail) because some tasks succeeded
    import json
    assert run.status == RunStatus.completed
    assert run.error_message is not None
    # error_message is now a JSON dict of {platform: error_message}
    errors = json.loads(run.error_message)
    assert len(errors) > 0
    assert all(isinstance(v, str) for v in errors.values())


@pytest.mark.asyncio
async def test_orchestrate_run_marks_failed_when_all_tasks_fail():
    """If every single task fails, the run status is 'failed'."""
    run = _make_run()
    factory, session = _make_session_factory(run=run, prompts=PROMPTS)

    def mock_get_adapter(platform):
        adapter = MagicMock()
        adapter.complete = AsyncMock(side_effect=RuntimeError("All broken"))
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=list(Platform)):
            await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    assert run.status == RunStatus.failed


# ── Bounded concurrency ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bounded_concurrency_per_platform():
    """
    Peak concurrent adapter.complete() calls for a single platform must not
    exceed settings.max_concurrent_per_platform.
    """
    max_allowed = 2

    # Use enough prompts to exceed the limit if concurrency is unbounded
    many_prompts = [
        Prompt(
            id=uuid.uuid4(),
            client_id=CLIENT_ID,
            text=f"Prompt {i}",
            category="test",
            is_active=True,
        )
        for i in range(6)
    ]
    run = Run(
        client_id=CLIENT_ID,
        status=RunStatus.pending,
        total_prompts=len(many_prompts),
        completed_prompts=0,
    )
    run.id = RUN_ID
    run.updated_at = datetime.utcnow()

    factory, session = _make_session_factory(run=run, prompts=many_prompts)

    peak_concurrent: dict[Platform, int] = {p: 0 for p in Platform}
    current_concurrent: dict[Platform, int] = {p: 0 for p in Platform}

    def mock_get_adapter(platform):
        adapter = MagicMock()

        async def instrumented_complete(prompt_text, client_id):
            current_concurrent[platform] += 1
            peak_concurrent[platform] = max(
                peak_concurrent[platform], current_concurrent[platform]
            )
            await asyncio.sleep(0)  # yield to event loop
            current_concurrent[platform] -= 1
            return _make_platform_response(platform)

        adapter.complete = instrumented_complete
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=list(Platform)):
            with patch("app.config.settings.max_concurrent_per_platform", max_allowed):
                await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    for platform in Platform:
        assert peak_concurrent[platform] <= max_allowed, (
            f"{platform.value}: peak={peak_concurrent[platform]} exceeded max={max_allowed}"
        )


# ── Response field mapping ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_response_fields_mapped_correctly():
    """Verify all PlatformResponse fields are written to the Response ORM object."""
    run = _make_run()
    single_prompt = [PROMPTS[0]]
    factory, session = _make_session_factory(run=run, prompts=single_prompt)

    expected_resp = PlatformResponse(
        platform=Platform.openai,
        raw_response="Test raw content",
        model_used="gpt-4o",
        latency_ms=250,
        tokens_used=123,
        cost_usd=0.0025,
    )

    def mock_get_adapter(platform):
        adapter = MagicMock()
        adapter.complete = AsyncMock(return_value=expected_resp)
        return adapter

    with patch("app.services.run_orchestrator.get_adapter", side_effect=mock_get_adapter):
        with patch("app.services.run_orchestrator.all_platforms", return_value=[Platform.openai]):
            await orchestrate_run(RUN_ID, CLIENT_ID, factory)

    responses = [obj for obj in session.added if isinstance(obj, Response)]
    assert len(responses) == 1
    r = responses[0]
    assert r.raw_response == "Test raw content"
    assert r.model_used == "gpt-4o"
    assert r.latency_ms == 250
    assert r.tokens_used == 123
    assert r.cost_usd == 0.0025
    assert r.run_id == RUN_ID
    assert r.client_id == CLIENT_ID
    assert r.prompt_id == single_prompt[0].id
