from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://origo:origo_dev@localhost:5432/origo"

    # API Keys — never logged, never serialized
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    perplexity_api_key: str = ""

    # App config
    log_level: str = "INFO"
    max_concurrent_per_platform: int = 5


settings = Settings()
