"""
Tests for the analysis retry passes (_run_analysis_passes).

The silent analysis funnel — responses stored but never analyzed, so they
vanish from every rate's denominator (the "386 stored / 361 analyzed" gap) —
is attacked by re-running failed analyses in extra passes before counting
them as drops.

_analyze_one is patched out: these are pure unit tests of the pass/retry
bookkeeping (who gets retried, what survives, what the counts are).
"""
import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.analysis.analyzer import AnalysisParseError
from app.config import settings
from app.services.pipeline import _run_analysis_passes


def _rows(n: int) -> list:
    return [
        (SimpleNamespace(id=uuid.uuid4()), SimpleNamespace(text=f"prompt {i}"))
        for i in range(n)
    ]


def _common_kwargs() -> dict:
    return dict(
        client_id=uuid.uuid4(),
        client_name="Acme",
        competitor_names=["Rival"],
        analyzer=None,  # unused — _analyze_one is patched
        semaphore=asyncio.Semaphore(5),
        session_factory=None,  # unused — _analyze_one is patched
        log=SimpleNamespace(warning=lambda *a, **k: None),
    )


@pytest.mark.asyncio
async def test_all_succeed_first_pass():
    rows = _rows(3)
    calls: list[uuid.UUID] = []

    async def ok(response_id, **kwargs):
        calls.append(response_id)

    with patch("app.services.pipeline._analyze_one", side_effect=ok):
        ok_count, failures = await _run_analysis_passes(rows, **_common_kwargs())

    assert (ok_count, failures) == (3, [])
    assert len(calls) == 3  # no retry pass ran


@pytest.mark.asyncio
async def test_transient_analysis_failure_recovers_on_retry():
    """A response whose analysis fails once (timeout / unparseable) is retried
    and, on success, counts as analyzed — it no longer shrinks the denominator."""
    rows = _rows(3)
    flaky_id = rows[1][0].id
    calls: list[uuid.UUID] = []

    async def flaky(response_id, **kwargs):
        calls.append(response_id)
        if response_id == flaky_id and calls.count(response_id) == 1:
            raise AnalysisParseError("LLM output unparseable after 2 attempts")

    with patch("app.services.pipeline._analyze_one", side_effect=flaky):
        ok_count, failures = await _run_analysis_passes(rows, **_common_kwargs())

    assert (ok_count, failures) == (3, [])
    assert calls.count(flaky_id) == 2      # failed once, retried once
    assert len(calls) == 4                 # only the failure was retried


@pytest.mark.asyncio
async def test_persistent_analysis_failure_counted_after_retries():
    rows = _rows(3)
    doomed_id = rows[2][0].id
    calls: list[uuid.UUID] = []

    async def doomed(response_id, **kwargs):
        calls.append(response_id)
        if response_id == doomed_id:
            raise AnalysisParseError("still unparseable")

    with patch("app.services.pipeline._analyze_one", side_effect=doomed):
        ok_count, failures = await _run_analysis_passes(rows, **_common_kwargs())

    assert ok_count == 2
    assert len(failures) == 1
    assert isinstance(failures[0], AnalysisParseError)
    # Original attempt + settings.analysis_retry_passes extra attempts.
    assert calls.count(doomed_id) == 1 + settings.analysis_retry_passes


@pytest.mark.asyncio
async def test_zero_retry_passes_disables_retry():
    rows = _rows(2)
    flaky_id = rows[0][0].id
    calls: list[uuid.UUID] = []

    async def flaky(response_id, **kwargs):
        calls.append(response_id)
        if response_id == flaky_id and calls.count(response_id) == 1:
            raise AnalysisParseError("boom")

    with patch("app.services.pipeline._analyze_one", side_effect=flaky), \
         patch.object(settings, "analysis_retry_passes", 0):
        ok_count, failures = await _run_analysis_passes(rows, **_common_kwargs())

    assert ok_count == 1
    assert len(failures) == 1
    assert calls.count(flaky_id) == 1  # never retried
