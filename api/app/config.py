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
    # Analysis: max output tokens per citation-analysis call. Must be generous
    # enough for reasoning ("thinking") models — they spend part of this budget
    # on internal reasoning before emitting the JSON, so a low cap makes them
    # return an empty completion and the analysis fails. Configurable so ops can
    # raise it for heavier thinking models without a redeploy.
    analysis_max_tokens: int = 4096
    # Hard per-call ceiling for any single upstream LLM request (monitoring OR
    # analysis). One hung/slow call must not stall an entire run, so the call is
    # abandoned and counted as failed once this elapses.
    platform_call_timeout_seconds: float = 90.0
    # Ceiling for WEB-GROUNDED monitoring calls. Grounded OpenAI/Anthropic calls
    # run a multi-round server-side search loop (and Perplexity sonar is always
    # web-grounded), so they are the SLOW platforms, not the fast ones — a large
    # share of the "dropped calls in every run" were grounded calls hitting the
    # plain 90s ceiling. The effective timeout for a grounded call is
    # max(platform_call_timeout_seconds, this value). Ungrounded calls and
    # citation-analysis calls (single-shot JSON, never grounded) keep the plain
    # ceiling above.
    platform_call_timeout_grounded_seconds: float = 240.0
    # ── Dropped-call retries ──────────────────────────────────────────────────
    # A monitoring call that times out or errors is no longer silently dropped:
    # after the first wave finishes, the failed (prompt × platform) pairs are
    # re-run in up to this many extra passes. Retrying AFTER the wave (rather
    # than inline) lets transient rate-limit/load pressure subside first and
    # never extends the per-call timeout. 0 disables retries. Note the adapters
    # additionally retry 429/5xx per call (app.platforms.retry) — these passes
    # cover what that cannot: timeouts and exhausted in-call retries.
    monitoring_retry_passes: int = 2
    # Delay before retry pass N is N × this value (10s, then 20s). Kept modest:
    # the per-platform rate limiter already paces individual calls.
    monitoring_retry_backoff_seconds: float = 10.0
    # Same idea for the citation-analysis phase: responses whose analysis call
    # failed (timeout / unparseable twice) get this many extra passes before
    # being counted as analysis drops. This attacks the "386 stored but only
    # 361 analyzed" gap. 0 disables.
    analysis_retry_passes: int = 1
    # Minimum fraction of monitoring responses that must be successfully analyzed
    # for a run to count as "completed". Below this the run is marked failed, so a
    # badly under-analyzed run never ships a misleading citation rate as if real.
    analysis_min_coverage: float = 0.9

    # ── Per-platform rate limits (requests / minute) ──────────────────────────
    # Paces every upstream call (monitoring AND analysis) so a run cannot burst
    # past a provider's per-minute cap. These defaults are deliberately
    # conservative — set the real per-tier ceilings via env to pace closer to the
    # provider limit without a redeploy, e.g. PLATFORM_RATE_LIMIT_PERPLEXITY=100.
    # A value <= 0 disables limiting for that platform.
    platform_rate_limit_openai: int = 500
    platform_rate_limit_anthropic: int = 500
    platform_rate_limit_perplexity: int = 50
    platform_rate_limit_gemini: int = 60
    # Longest a single call will wait for a rate-limit slot before proceeding
    # anyway (fail-open). Generous on purpose: a compliant 100-prompt run's
    # slowest call waits only ~1-2 windows; this only guards against a
    # misconfigured (e.g. accidentally tiny) limit hanging the run forever.
    platform_rate_limit_max_wait_seconds: float = 300.0

    @property
    def platform_rate_limits(self) -> dict[str, int]:
        """Per-platform requests-per-minute ceilings, keyed by platform value."""
        return {
            "openai": self.platform_rate_limit_openai,
            "anthropic": self.platform_rate_limit_anthropic,
            "perplexity": self.platform_rate_limit_perplexity,
            "gemini": self.platform_rate_limit_gemini,
        }

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
