"""Application configuration settings."""

from enum import Enum
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProcessingMode(str, Enum):
    """LLM processing modes."""

    BATCH = "batch"
    REAL_TIME = "real_time"
    ON_DEMAND = "on_demand"


class LLMSettings(BaseSettings):
    """LLM provider settings."""

    model_config = SettingsConfigDict(
        env_prefix="LLM_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Provider selection (switchable)
    llm_provider: str = Field(
        default="claude",
        description="LLM provider: claude, ollama, openai",
    )
    llm_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model identifier",
    )

    # Claude/Anthropic settings
    anthropic_api_key: str = Field(
        default="",
        description="Anthropic API key for Claude",
    )

    # Ollama settings (for OSS models)
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        description="Ollama server URL",
    )
    ollama_model: str = Field(
        default="codellama:13b",
        description="Ollama model name",
    )

    # Processing mode (configurable per billing plan)
    processing_mode: ProcessingMode = Field(
        default=ProcessingMode.BATCH,
        description="Processing mode: batch, real_time, on_demand",
    )

    # Cost controls
    max_tokens_per_request: int = Field(
        default=4096,
        description="Maximum tokens per LLM request",
    )
    max_requests_per_hour: int = Field(
        default=100,
        description="Rate limit for LLM requests",
    )
    enable_caching: bool = Field(
        default=True,
        description="Enable LLM response caching",
    )
    cache_ttl_hours: int = Field(
        default=24,
        description="Cache TTL in hours",
    )

    # Feature flags
    enable_code_analysis: bool = Field(
        default=True,
        description="Enable LLM code analysis",
    )
    enable_soft_skills: bool = Field(
        default=True,
        description="Enable soft skills analysis",
    )
    enable_task_matching: bool = Field(
        default=False,
        description="Enable task matching (Phase 2)",
    )


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Gitraki"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/gitraki"
    database_echo: bool = False

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/v1/auth/github/callback"

    # JWT
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # GitHub API
    github_api_base_url: str = "https://api.github.com"
    github_oauth_url: str = "https://github.com/login/oauth"

    # GitHub Webhook
    github_webhook_secret: str = ""

    # Redis (for caching and job queue)
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )

    # Celery (for background processing)
    celery_broker_url: str = Field(
        default="redis://localhost:6379/1",
        description="Celery broker URL",
    )
    celery_result_backend: str = Field(
        default="redis://localhost:6379/1",
        description="Celery result backend URL",
    )

    # LLM Configuration
    llm: LLMSettings = Field(default_factory=LLMSettings)


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
