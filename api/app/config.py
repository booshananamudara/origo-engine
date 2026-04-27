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

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_async_driver(cls, v: str) -> str:
        """Railway injects postgresql:// — convert to asyncpg format."""
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v


settings = Settings()
