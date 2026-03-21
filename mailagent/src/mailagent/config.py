"""Configuration settings for mailagent service."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Service
    service_name: str = "mailagent"
    debug: bool = False
    environment: str = "development"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/aexy"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # AWS SES (optional)
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "us-east-1"

    # Postmark (optional)
    postmark_server_token: str | None = None

    # SMTP fallback
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True

    # Rate limiting
    rate_limit_enabled: bool = True
    default_requests_per_minute: int = 60
    default_requests_per_day: int = 10000

    # Domain warming
    default_warming_schedule: str = "moderate"  # conservative, moderate, aggressive

    # API
    api_prefix: str = "/api/v1"

    # Integration with Aexy backend
    backend_url: str = "http://localhost:8000"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
