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
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Provider selection (switchable)
    llm_provider: str = Field(
        default="claude",
        description="LLM provider: claude, ollama, openai",
        validation_alias="LLM_PROVIDER",
    )
    llm_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model identifier",
        validation_alias="LLM_MODEL",
    )

    # Claude/Anthropic settings
    anthropic_api_key: str = Field(
        default="",
        description="Anthropic API key for Claude",
        validation_alias="ANTHROPIC_API_KEY",
    )

    # Ollama settings (for OSS models)
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        description="Ollama server URL",
        validation_alias="OLLAMA_BASE_URL",
    )
    ollama_model: str = Field(
        default="codellama:13b",
        description="Ollama model name",
        validation_alias="OLLAMA_MODEL",
    )

    # Gemini/Google settings
    gemini_api_key: str = Field(
        default="",
        description="Google Gemini API key",
        validation_alias="GEMINI_API_KEY",
    )
    gemini_model: str = Field(
        default="gemini-2.0-flash",
        description="Gemini model name",
        validation_alias="GEMINI_MODEL",
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
        extra="ignore",
    )

    # Application
    app_name: str = "Aexy"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    frontend_url: str = "http://localhost:3000"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aexy"
    database_echo: bool = False

    # GitHub App (for OAuth and installations)
    github_app_id: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    github_private_key: str = ""  # PEM format, can use \n for newlines
    github_private_key_path: str = ""  # Alternative: path to PEM file
    github_redirect_uri: str = "http://localhost:8000/api/v1/auth/github/callback"
    github_app_install_url: str = ""  # e.g., https://github.com/apps/your-app/installations/new

    def get_github_private_key(self) -> str:
        """Get the GitHub private key, either from env var or file."""
        if self.github_private_key_path:
            try:
                with open(self.github_private_key_path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                pass
        # Handle escaped newlines in env var
        return self.github_private_key.replace("\\n", "\n")

    # JWT
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days for development

    # GitHub API
    github_api_base_url: str = "https://api.github.com"
    github_oauth_url: str = "https://github.com/login/oauth"

    # GitHub Webhook
    github_webhook_secret: str = ""

    # Stripe Configuration
    stripe_secret_key: str = Field(
        default="",
        description="Stripe secret API key",
    )
    stripe_publishable_key: str = Field(
        default="",
        description="Stripe publishable API key",
    )
    stripe_webhook_secret: str = Field(
        default="",
        description="Stripe webhook signing secret",
    )

    # Pricing Configuration (margin applied to token costs)
    token_margin_percent: float = Field(
        default=30.0,
        description="Margin percentage to add on top of LLM token costs",
    )

    # Base token prices (in cents per 1M tokens) - can be overridden per provider
    claude_input_price_per_million: float = Field(
        default=300.0,  # $3.00 per 1M input tokens for Claude Sonnet
        description="Claude input token price per million tokens (cents)",
    )
    claude_output_price_per_million: float = Field(
        default=1500.0,  # $15.00 per 1M output tokens for Claude Sonnet
        description="Claude output token price per million tokens (cents)",
    )
    gemini_input_price_per_million: float = Field(
        default=7.5,  # $0.075 per 1M input tokens for Gemini Flash
        description="Gemini input token price per million tokens (cents)",
    )
    gemini_output_price_per_million: float = Field(
        default=30.0,  # $0.30 per 1M output tokens for Gemini Flash
        description="Gemini output token price per million tokens (cents)",
    )

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

    # AWS SES (for email notifications)
    aws_access_key_id: str = Field(
        default="",
        description="AWS access key ID for SES",
    )
    aws_secret_access_key: str = Field(
        default="",
        description="AWS secret access key for SES",
    )
    aws_ses_region: str = Field(
        default="us-east-1",
        description="AWS region for SES",
    )
    ses_sender_email: str = Field(
        default="noreply@aexy.io",
        description="Email address to send notifications from",
    )
    ses_sender_name: str = Field(
        default="Aexy",
        description="Display name for notification emails",
    )
    email_notifications_enabled: bool = Field(
        default=True,
        description="Enable/disable email notifications",
    )

    # Google OAuth (for authentication and integrations)
    google_client_id: str = Field(
        default="",
        description="Google OAuth Client ID",
    )
    google_client_secret: str = Field(
        default="",
        description="Google OAuth Client Secret",
    )
    google_auth_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/auth/google/callback",
        description="Google OAuth redirect URI for authentication",
    )
    google_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/integrations/google-calendar/callback",
        description="Google OAuth redirect URI for calendar integration",
    )

    # Slack Integration
    slack_client_id: str = Field(
        default="",
        description="Slack App Client ID",
    )
    slack_client_secret: str = Field(
        default="",
        description="Slack App Client Secret",
    )
    slack_signing_secret: str = Field(
        default="",
        description="Slack App Signing Secret for request verification",
    )
    slack_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/slack/callback",
        description="Slack OAuth redirect URI",
    )

    # LLM Configuration
    llm: LLMSettings = Field(default_factory=LLMSettings)


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()


# Convenience singleton for direct imports
settings = get_settings()
