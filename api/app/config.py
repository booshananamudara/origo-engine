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
    max_concurrent_per_platform: int = 5

    # Admin auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7
    redis_url: str = "redis://localhost:6379"

    # ── CORS origins ──────────────────────────────────────────────────────────
    # Each service only allows its own frontend. In combined mode both are allowed.
    admin_frontend_url: str = "http://localhost:5174"
    client_frontend_url: str = "http://localhost:5173"

    # ── Scheduler ─────────────────────────────────────────────────────────────
    # Set SCHEDULER_ENABLED=false to disable without redeployment.
    # In the split architecture, only the worker service has this true.
    scheduler_enabled: bool = True

    # ── Generation Engine ─────────────────────────────────────────────────────
    generation_enabled: bool = True
    generation_model: str = "gpt-4o-mini"
    generation_temperature: float = 0.3
    generation_max_concurrent: int = 3
    generation_content_brief_enabled: bool = True
    generation_schema_enabled: bool = True
    generation_llms_txt_enabled: bool = True
    generation_dedup_days: int = 7
    generation_llms_txt_dedup_days: int = 14

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
