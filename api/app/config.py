from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database — Railway provides postgresql://, asyncpg needs postgresql+asyncpg://
    database_url: str = "postgresql+asyncpg://origo:origo_dev@localhost:5432/origo"

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

    # Scheduler — set SCHEDULER_ENABLED=false to disable without redeployment
    scheduler_enabled: bool = True

    # Generation Engine — set GENERATION_ENABLED=false to disable all recommendation generation
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
        """Convert any sync Postgres URL scheme to the asyncpg driver scheme."""
        if not isinstance(v, str):
            return v
        if v.startswith("postgresql+asyncpg://"):
            return v  # already correct
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v


settings = Settings()
