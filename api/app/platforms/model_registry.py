"""
Model registry for per-client AI model configuration.

Each platform has a list of available models and a default.
Clients can override via platform_model_config JSONB column on the Client table.
"""

AVAILABLE_MODELS: dict[str, list[str]] = {
    "openai": [
        # GPT-4.1 family (latest)
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
        "o1",
        "o1-mini",
        # Legacy
        "gpt-4-turbo",
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
        # Sonar (web-grounded)
        "sonar-deep-research",
        "sonar-reasoning-pro",
        "sonar-reasoning",
        "sonar-pro",
        "sonar",
    ],
    "gemini": [
        # Gemini 2.5
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        # Gemini 2.0
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        # Gemini 1.5
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ],
}

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o",
    "anthropic": "claude-haiku-4-5-20251001",
    "perplexity": "sonar",
    "gemini": "gemini-2.5-flash",
}


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
        allowed = AVAILABLE_MODELS.get(platform, [])
        if override in allowed:
            return override
    return DEFAULT_MODELS.get(platform, "")


def get_analysis_config_for_client(client_config: dict | None) -> tuple[str, str]:
    """Return (platform, model) for the analysis engine."""
    cfg = client_config or {}
    platform = cfg.get("analysis_platform", DEFAULT_ANALYSIS_PLATFORM)
    if platform not in AVAILABLE_MODELS:
        platform = DEFAULT_ANALYSIS_PLATFORM
    model = cfg.get("analysis_model", DEFAULT_ANALYSIS_MODEL)
    if model not in AVAILABLE_MODELS.get(platform, []):
        model = DEFAULT_MODELS.get(platform, DEFAULT_ANALYSIS_MODEL)
    return platform, model


def get_recommendation_config_for_client(client_config: dict | None) -> tuple[str, str]:
    """Return (platform, model) for the recommendation/generation engine."""
    cfg = client_config or {}
    platform = cfg.get("recommendation_platform", DEFAULT_RECOMMENDATION_PLATFORM)
    if platform not in AVAILABLE_MODELS:
        platform = DEFAULT_RECOMMENDATION_PLATFORM
    model = cfg.get("recommendation_model", DEFAULT_RECOMMENDATION_MODEL)
    if model not in AVAILABLE_MODELS.get(platform, []):
        model = DEFAULT_MODELS.get(platform, DEFAULT_RECOMMENDATION_MODEL)
    return platform, model


def get_available_models_for_platform(platform: str) -> list[str]:
    return AVAILABLE_MODELS.get(platform, [])
