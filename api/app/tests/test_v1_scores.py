"""
Unit tests for citation_rate_by_category — the M2 net-new scoring output.

Rate per prompt category, derived from prompt.category + client_cited over the
per-prompt-per-engine results. All four category keys are always present; a
category with no analysed rows is null (unknown), never 0.0.
"""
from app.api.v1.service import compute_citation_rate_by_category

_CATEGORIES = {"awareness", "evaluation", "comparison", "recommendation"}


def _r(category, client_cited, *, engine="chatgpt"):
    return {
        "prompt": {"text": "q", "category": category},
        "engine": engine,
        "client_cited": client_cited,
    }


def test_all_four_keys_always_present():
    out = compute_citation_rate_by_category([])
    assert set(out.keys()) == _CATEGORIES
    assert all(v is None for v in out.values())


def test_rate_per_category():
    results = [
        _r("evaluation", True),
        _r("evaluation", False),   # evaluation: 1/2 = 0.5
        _r("comparison", True),
        _r("comparison", True),    # comparison: 2/2 = 1.0
        _r("awareness", False),    # awareness: 0/1 = 0.0
    ]
    out = compute_citation_rate_by_category(results)
    assert out["evaluation"] == 0.5
    assert out["comparison"] == 1.0
    assert out["awareness"] == 0.0
    assert out["recommendation"] is None  # no rows → unknown


def test_none_client_cited_excluded_from_denominator():
    """Analysis not yet available (client_cited None) must not count."""
    results = [
        _r("evaluation", None),   # excluded
        _r("evaluation", True),   # 1/1 = 1.0
    ]
    out = compute_citation_rate_by_category(results)
    assert out["evaluation"] == 1.0


def test_category_with_only_none_is_null_not_zero():
    results = [_r("comparison", None), _r("comparison", None)]
    out = compute_citation_rate_by_category(results)
    assert out["comparison"] is None


def test_unknown_categories_ignored():
    results = [_r("purchase", True), _r("", False), _r(None, True)]
    out = compute_citation_rate_by_category(results)
    assert out == {
        "awareness": None,
        "evaluation": None,
        "comparison": None,
        "recommendation": None,
    }


def test_rounding_to_four_dp():
    # 1 cited / 3 total = 0.3333...
    results = [_r("awareness", True), _r("awareness", False), _r("awareness", False)]
    out = compute_citation_rate_by_category(results)
    assert out["awareness"] == 0.3333


def test_rate_aggregates_across_engines():
    results = [
        _r("evaluation", True, engine="chatgpt"),
        _r("evaluation", False, engine="claude"),
        _r("evaluation", True, engine="gemini"),
        _r("evaluation", True, engine="perplexity"),
    ]
    out = compute_citation_rate_by_category(results)
    assert out["evaluation"] == 0.75  # 3/4 across all engines
