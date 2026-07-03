"""
Tests for the run's terminal-status resolution.

The key safety property (client feedback): when every citation-analysis call
fails, the run must be FAILED, not COMPLETED — otherwise the audit surfaces a
false 0% citation rate ("you're invisible") even when the brand is cited.
"""
from app.models.run import RunStatus
from app.services.pipeline import _resolve_final_status


def test_already_failed_stays_failed():
    # Orchestration already failed (all monitoring calls errored) — stays failed.
    assert _resolve_final_status(RunStatus.failed, 30, 30) == RunStatus.failed


def test_all_analysis_failed_marks_failed():
    # 30 responses, 0 scored -> failed (never a false 0%).
    assert _resolve_final_status(RunStatus.running, 30, 0) == RunStatus.failed


def test_partial_analysis_completes():
    # Some analyses failed but real scores exist -> complete over the real subset.
    assert _resolve_final_status(RunStatus.running, 30, 25) == RunStatus.completed


def test_all_analysis_ok_completes():
    assert _resolve_final_status(RunStatus.running, 30, 30) == RunStatus.completed


def test_genuine_zero_percent_still_completes():
    # Analyses ran and the brand simply wasn't cited: this is a real 0%, not a
    # failure. analysis_ok > 0 so the run completes and shows the true rate.
    assert _resolve_final_status(RunStatus.running, 30, 30) == RunStatus.completed


def test_no_responses_completes():
    # No responses to analyze (edge) — not treated as an analysis failure here;
    # the all-monitoring-failed case is handled upstream in orchestration.
    assert _resolve_final_status(RunStatus.running, 0, 0) == RunStatus.completed
