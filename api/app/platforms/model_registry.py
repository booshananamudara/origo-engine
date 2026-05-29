"""
Model registry for per-client AI model configuration.

Each platform has a list of available models and a default.
Clients can override via platform_model_config JSONB column on the Client table.
"""

AVAILABLE_MODELS: dict[str, list[str]] = {
    "openai": [
        # GPT-5.x family (latest generation)
        "gpt-5.5-pro",
        "gpt-5.5",
        "gpt-5.4-pro",
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5.2-pro",
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5-pro",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
        # GPT-4.1 family
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        # GPT-4o family
        "gpt-4o",
        "gpt-4o-mini",
        # Reasoning models
        "o4-mini",
        "o3",
        "o3-mini",
        "o1-pro",
        "o1",
        "o1-mini",
        # Legacy
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
    ],
    "anthropic": [
        # Claude 4.x (current generation)
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
        # Claude 3.5
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
    ],
    "perplexity": [
        # Sonar — prefixed IDs as returned by Perplexity's /v1/models endpoint
        "perplexity/sonar",
        "perplexity/sonar-pro",
    ],
    "gemini": [
        # Gemini 3.5
        "gemini-3.5-flash",
        # Gemini 3.1
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite",
        "gemini-3.1-flash-lite-preview",
        # Gemini 3
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
        # Gemini 2.5
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        # Gemini 2.0
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ],
}

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o",
    "anthropic": "claude-haiku-4-5-20251001",
    "perplexity": "perplexity/sonar",
    "gemini": "gemini-2.5-flash",
}


# In-memory live models — populated from DB cache at startup.
# Falls back to AVAILABLE_MODELS when empty (e.g. first boot before any fetch).
_live_models: dict[str, list[str]] = {}


def get_live_models() -> dict[str, list[str]]:
    """Return fetched model lists if available, otherwise the hardcoded fallback."""
    return _live_models if _live_models else AVAILABLE_MODELS


def set_live_models(data: dict[str, list[str]]) -> None:
    """Overwrite the in-memory live model lists (called by model_fetcher at startup)."""
    _live_models.clear()
    _live_models.update(data)


DEFAULT_ANALYSIS_PLATFORM = "openai"
DEFAULT_ANALYSIS_MODEL = "gpt-4o-mini"
DEFAULT_RECOMMENDATION_PLATFORM = "openai"
DEFAULT_RECOMMENDATION_MODEL = "gpt-4o-mini"

# Keys stored inside platform_model_config for engine overrides
ENGINE_CONFIG_KEYS = {
    "analysis_platform", "analysis_model",
    "recommendation_platform", "recommendation_model",
}


def get_model_for_client(platform: str, client_config: dict | None) -> str:
    """Return the model to use for a platform, respecting client overrides."""
    if client_config and platform in client_config:
        override = client_config[platform]
        allowed = get_live_models().get(platform, [])
        if override in allowed:
            return override
    return DEFAULT_MODELS.get(platform, "")


def get_analysis_config_for_client(client_config: dict | None) -> tuple[str, str]:
    """Return (platform, model) for the analysis engine."""
    live = get_live_models()
    cfg = client_config or {}
    platform = cfg.get("analysis_platform", DEFAULT_ANALYSIS_PLATFORM)
    if platform not in live:
        platform = DEFAULT_ANALYSIS_PLATFORM
    model = cfg.get("analysis_model", DEFAULT_ANALYSIS_MODEL)
    if model not in live.get(platform, []):
        model = DEFAULT_MODELS.get(platform, DEFAULT_ANALYSIS_MODEL)
    return platform, model


def get_recommendation_config_for_client(client_config: dict | None) -> tuple[str, str]:
    """Return (platform, model) for the recommendation/generation engine."""
    live = get_live_models()
    cfg = client_config or {}
    platform = cfg.get("recommendation_platform", DEFAULT_RECOMMENDATION_PLATFORM)
    if platform not in live:
        platform = DEFAULT_RECOMMENDATION_PLATFORM
    model = cfg.get("recommendation_model", DEFAULT_RECOMMENDATION_MODEL)
    if model not in live.get(platform, []):
        model = DEFAULT_MODELS.get(platform, DEFAULT_RECOMMENDATION_MODEL)
    return platform, model


def get_available_models_for_platform(platform: str) -> list[str]:
    return get_live_models().get(platform, [])
