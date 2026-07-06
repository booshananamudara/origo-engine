from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _to_asyncpg(v: str) -> str:
    """Convert any sync Postgres URL scheme to the asyncpg driver scheme."""
    if not isinstance(v, str) or not v:
        return v
    if v.startswith("postgresql+asyncpg://"):
        return v
    if v.startswith("postgresql://"):
        return v.replace("postgresql://", "postgresql+asyncpg://", 1)
    if v.startswith("postgres://"):
        return v.replace("postgres://", "postgresql+asyncpg://", 1)
    return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Service identity ──────────────────────────────────────────────────────
    # Controls which DB engines are created and which routes are mounted.
    # Values: "combined" (default, local dev) | "admin" | "client" | "worker"
    service_role: str = "combined"

    # ── Database connections ──────────────────────────────────────────────────
    # DATABASE_URL  — superuser, used for Alembic migrations (admin-api only)
    # DATABASE_URL_ADMIN — origo_admin role, BYPASSRLS (admin-api + worker)
    # DATABASE_URL_APP   — origo_app role, subject to RLS (client-api only)
    #
    # In combined/local mode, all three can be the same URL.
    # In production, each service only receives the credential it needs.
    database_url: str = "postgresql+asyncpg://origo:origo_dev@localhost:5432/origo"
    database_url_admin: str = ""  # Falls back to database_url if empty
    database_url_app: str = ""    # Falls back to database_url if empty

    # API Keys — never logged, never serialized
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    perplexity_api_key: str = ""
    gemini_api_key: str = ""

    # App config
    log_level: str = "INFO"
    # Orchestration: max simultaneous in-flight API calls per platform.
    # 25 stays within all configured per-minute rate limits for 50 prompts.
    max_concurrent_per_platform: int = 25
    # Analysis: max simultaneous gpt-4o-mini calls for citation analysis.
    # 20 concurrent × ~3 s avg = ~30 s for 200 responses (within OpenAI 500/min).
    analysis_max_concurrent: int = 20

    # Admin auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7
    redis_url: str = "redis://localhost:6379"

    # ── Audit API (/v1) auth ──────────────────────────────────────────────────
    # Per-environment API keys for the public /v1 automation surface, sent as
    # `X-API-Key: <key>`. Comma-separated list; each entry is either a bare key
    # or `label:key` (the label is logged on a successful auth, never the key).
    #
    # Multiple keys are valid at once, which is the rotation path: add the new
    # key alongside the old, migrate callers, then drop the old key — no code
    # change and no rebuild, just an update to the AUDIT_API_KEYS secret. The
    # value is read fresh from the environment on every request (see
    # app.api.v1.dependencies), so a secret update takes effect immediately.
    #
    # Empty value disables /v1 auth (all /v1 requests are rejected with 401
    # until at least one key is configured — fail closed).
    #
    #   AUDIT_API_KEYS="primary:k_live_abc123,rotating:k_live_def456"
    audit_api_keys: str = ""

    # ── CORS origins ──────────────────────────────────────────────────────────
    # Each service only allows its own frontend. In combined mode both are allowed.
    admin_frontend_url: str = "http://localhost:5174"
    client_frontend_url: str = "http://localhost:5173"
    # Extra CORS origins — comma-separated list of additional allowed origins.
    # Use this when running multiple deployments (e.g. staging + production).
    # Example: EXTRA_CORS_ORIGINS=https://staging.example.com,https://preview.example.com
    extra_cors_origins: str = ""

    @property
    def extra_cors_origins_list(self) -> list[str]:
        if not self.extra_cors_origins.strip():
            return []
        return [o.strip() for o in self.extra_cors_origins.split(",") if o.strip()]

    # ── Scheduler ─────────────────────────────────────────────────────────────
    # Set SCHEDULER_ENABLED=false to disable without redeployment.
    # In the split architecture, only the worker service has this true.
    scheduler_enabled: bool = True

    # ── Web grounding ─────────────────────────────────────────────────────────
    # When enabled, the OpenAI / Anthropic / Gemini adapters attach the provider's
    # web-search / grounding tool so they answer from the live web (like the real
    # consumer apps) instead of from frozen training data. Perplexity is always
    # web-grounded via its `sonar` model and ignores these flags.
    # Global config (not per-client) — toggle without a redeploy.
    web_grounding_enabled: bool = True            # master switch
    web_grounding_openai: bool = True
    web_grounding_anthropic: bool = True
    web_grounding_gemini: bool = True
    # Upper bound on web searches per call, to cap added cost/latency.
    web_search_max_uses: int = 5

    # ── Generation Engine ─────────────────────────────────────────────────────
    # Master on/off switch for the whole generation engine (ops toggle, checked
    # in the orchestrator). The generation MODEL is not set here — each generator
    # resolves it per-client via platform_model_config / the recommendation
    # config resolver (defaults live in model_registry.DEFAULT_RECOMMENDATION_*).
    generation_enabled: bool = True
    generation_temperature: float = 0.3
    generation_max_concurrent: int = 3
    generation_content_brief_enabled: bool = True
    generation_schema_enabled: bool = True
    generation_llms_txt_enabled: bool = True
    generation_authority_building_enabled: bool = True
    generation_dedup_days: int = 7
    generation_llms_txt_dedup_days: int = 14

    @field_validator(
        "openai_api_key",
        "anthropic_api_key",
        "perplexity_api_key",
        "gemini_api_key",
        mode="before",
    )
    @classmethod
    def clean_api_keys(cls, v: str) -> str:
        # Railway env vars sometimes carry trailing newlines or surrounding quotes
        # from copy-paste. Strip them so the raw value reaches the SDK intact.
        if isinstance(v, str):
            return v.strip().strip('"').strip("'")
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_async_driver(cls, v: str) -> str:
        return _to_asyncpg(v)

    @field_validator("database_url_admin", mode="before")
    @classmethod
    def ensure_async_driver_admin(cls, v: str) -> str:
        return _to_asyncpg(v)

    @field_validator("database_url_app", mode="before")
    @classmethod
    def ensure_async_driver_app(cls, v: str) -> str:
        return _to_asyncpg(v)

    @property
    def effective_database_url_admin(self) -> str:
        """The URL to use for the admin engine (falls back to superuser URL)."""
        return self.database_url_admin or self.database_url

    @property
    def effective_database_url_app(self) -> str:
        """The URL to use for the client engine (falls back to superuser URL)."""
        return self.database_url_app or self.database_url


settings = Settings()
