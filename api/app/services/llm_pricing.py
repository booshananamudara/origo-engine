"""
Shared LLM cost estimation for the analysis and generation phases.

Previously every phase hardcoded gpt-4o-mini rates ($0.15/$0.60 per 1M) no
matter which model actually ran — so a client configured to analyze with a
Gemini Pro model had its analysis spend billed at 4o-mini prices. This module
prices a call by the PLATFORM's list rates (the same constants the monitoring
adapters use), refined by a per-model override table.

Honesty note: the override table only contains rates that are actually known
and used elsewhere in this codebase. Unknown/preview models fall back to
their platform's base rate — a documented approximation, not a fabricated
per-model price. Add real rates to MODEL_RATES as they are confirmed.

All rates are USD per token (per-1M rate / 1_000_000).
"""

# (input $/token, output $/token) — platform base rates, mirroring the
# monitoring adapters' constants for their default models.
PLATFORM_RATES: dict[str, tuple[float, float]] = {
    "openai": (2.50 / 1_000_000, 10.00 / 1_000_000),       # gpt-4o class
    "anthropic": (0.80 / 1_000_000, 4.00 / 1_000_000),     # claude-haiku-4-5
    "gemini": (1.25 / 1_000_000, 10.00 / 1_000_000),       # gemini-2.5 class
    "perplexity": (1.00 / 1_000_000, 1.00 / 1_000_000),    # sonar flat rate
}

# Per-model overrides, matched by prefix so dated/suffixed ids resolve
# (e.g. "claude-haiku-4-5-20251001", "gpt-4o-mini-2024-07-18").
MODEL_RATES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15 / 1_000_000, 0.60 / 1_000_000),
    "gpt-4o": (2.50 / 1_000_000, 10.00 / 1_000_000),
    "claude-haiku-4-5": (0.80 / 1_000_000, 4.00 / 1_000_000),
    "gemini-2.5-flash": (1.25 / 1_000_000, 10.00 / 1_000_000),
    "sonar": (1.00 / 1_000_000, 1.00 / 1_000_000),
}

_DEFAULT_RATE = (2.50 / 1_000_000, 10.00 / 1_000_000)


def _rates_for(platform: str, model: str | None) -> tuple[float, float]:
    if model:
        # Longest-prefix match so "gpt-4o-mini" wins over "gpt-4o".
        best_key = ""
        for key in MODEL_RATES:
            if model.startswith(key) and len(key) > len(best_key):
                best_key = key
        if best_key:
            return MODEL_RATES[best_key]
    return PLATFORM_RATES.get(platform, _DEFAULT_RATE)


def estimate_cost(
    platform: str,
    model: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
) -> float | None:
    """Estimated USD cost of one call; None when no usage was reported."""
    if input_tokens is None and output_tokens is None:
        return None
    in_rate, out_rate = _rates_for(platform, model)
    return (input_tokens or 0) * in_rate + (output_tokens or 0) * out_rate
