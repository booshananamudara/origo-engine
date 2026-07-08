"""
Tests for the run's terminal-status resolution.

The key safety property (client feedback): a run must not be reported as
COMPLETED when its citation-analysis coverage is too low to trust — otherwise
the audit surfaces a misleading citation rate (e.g. an 11-of-119 run shipping a
"0%") as if it were real. Coverage below settings.analysis_min_coverage (and the
all-failed case) resolves to FAILED instead.
"""
from app.config import settings
from app.models.run import RunStatus
from app.services.pipeline import _resolve_final_status


def test_already_failed_stays_failed():
    # Orchestration already failed (all monitoring calls errored) — stays failed.
    assert _resolve_final_status(RunStatus.failed, 30, 30) == RunStatus.failed


def test_all_analysis_failed_marks_failed():
    # 30 responses, 0 scored -> failed (never a false 0%).
    assert _resolve_final_status(RunStatus.running, 30, 0) == RunStatus.failed


def test_coverage_above_threshold_completes():
    # 28/30 = 93% >= 90% default threshold -> complete over the real subset.
    assert _resolve_final_status(RunStatus.running, 30, 28) == RunStatus.completed


def test_coverage_below_threshold_fails():
    # 25/30 = 83% < 90% -> failed: too few responses analyzed to trust the score.
    assert _resolve_final_status(RunStatus.running, 30, 25) == RunStatus.failed


def test_pro_model_low_coverage_fails():
    # The exact client scenario: a thinking model whose calls mostly returned
    # empty, so only 11 of 119 responses were analyzed (9%). Must NOT complete.
    assert _resolve_final_status(RunStatus.running, 119, 11) == RunStatus.failed


def test_coverage_exactly_at_threshold_completes():
    # 9/10 = exactly 90% -> meets the threshold (not below it) -> completed.
    assert _resolve_final_status(RunStatus.running, 10, 9) == RunStatus.completed


def test_all_analysis_ok_completes():
    assert _resolve_final_status(RunStatus.running, 30, 30) == RunStatus.completed


def test_genuine_zero_percent_still_completes():
    # Analyses ran for every response and the brand simply wasn't cited: this is
    # a real 0%, not a failure. Coverage is 100% so the run completes and shows
    # the true rate.
    assert _resolve_final_status(RunStatus.running, 30, 30) == RunStatus.completed


def test_no_responses_completes():
    # No responses to analyze (edge) — not treated as an analysis failure here;
    # the all-monitoring-failed case is handled upstream in orchestration.
    assert _resolve_final_status(RunStatus.running, 0, 0) == RunStatus.completed


def test_threshold_is_configurable():
    # An explicit min_coverage override wins over the default setting.
    assert _resolve_final_status(RunStatus.running, 30, 25, min_coverage=0.5) == RunStatus.completed
    assert _resolve_final_status(RunStatus.running, 30, 29, min_coverage=1.0) == RunStatus.failed


def test_default_threshold_matches_settings():
    # Guard against the default drifting away from the configured coverage gate.
    total = 100
    ok = int(settings.analysis_min_coverage * total)
    assert _resolve_final_status(RunStatus.running, total, ok) == RunStatus.completed
    assert _resolve_final_status(RunStatus.running, total, ok - 1) == RunStatus.failed
