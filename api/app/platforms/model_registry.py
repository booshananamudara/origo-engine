"""
Model registry for per-client AI model configuration.

Each platform has a list of available models and a default.
Clients can override via platform_model_config JSONB column on the Client table.
"""

AVAILABLE_MODELS: dict[str, list[str]] = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    "anthropic": ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    "perplexity": ["sonar", "sonar-pro"],
    "gemini": ["gemini-2.5-pro", "gemini-2.0-flash"],
}

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o",
    "anthropic": "claude-haiku-4-5-20251001",
    "perplexity": "sonar",
    "gemini": "gemini-2.5-pro",
}


def get_model_for_client(platform: str, client_config: dict | None) -> str:
    """Return the model to use for a platform, respecting client overrides."""
    if client_config and platform in client_config:
        override = client_config[platform]
        allowed = AVAILABLE_MODELS.get(platform, [])
        if override in allowed:
            return override
    return DEFAULT_MODELS.get(platform, "")


def get_available_models_for_platform(platform: str) -> list[str]:
    return AVAILABLE_MODELS.get(platform, [])
