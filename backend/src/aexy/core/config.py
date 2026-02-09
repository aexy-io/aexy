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


class ProviderRateLimitSettings(BaseSettings):
    """Rate limit settings for a single LLM provider."""

    model_config = SettingsConfigDict(extra="ignore")

    requests_per_minute: int = Field(
        default=60,
        description="Maximum requests per minute (-1 for unlimited)",
    )
    requests_per_day: int = Field(
        default=1500,
        description="Maximum requests per day (-1 for unlimited)",
    )
    tokens_per_minute: int = Field(
        default=-1,
        description="Maximum tokens per minute (-1 for unlimited)",
    )
    burst_size: int = Field(
        default=10,
        description="Maximum burst requests allowed",
    )
    retry_after_seconds: int = Field(
        default=60,
        description="Default wait time when rate limited",
    )


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

    # Provider-specific rate limits
    claude_requests_per_minute: int = Field(
        default=60,
        description="Claude requests per minute",
        validation_alias="CLAUDE_REQUESTS_PER_MINUTE",
    )
    claude_requests_per_day: int = Field(
        default=-1,
        description="Claude requests per day (-1 = unlimited)",
        validation_alias="CLAUDE_REQUESTS_PER_DAY",
    )
    claude_tokens_per_minute: int = Field(
        default=100000,
        description="Claude tokens per minute",
        validation_alias="CLAUDE_TOKENS_PER_MINUTE",
    )

    gemini_requests_per_minute: int = Field(
        default=60,
        description="Gemini requests per minute",
        validation_alias="GEMINI_REQUESTS_PER_MINUTE",
    )
    gemini_requests_per_day: int = Field(
        default=1500,
        description="Gemini requests per day (free tier)",
        validation_alias="GEMINI_REQUESTS_PER_DAY",
    )
    gemini_tokens_per_minute: int = Field(
        default=-1,
        description="Gemini tokens per minute (-1 = unlimited)",
        validation_alias="GEMINI_TOKENS_PER_MINUTE",
    )

    ollama_requests_per_minute: int = Field(
        default=-1,
        description="Ollama requests per minute (-1 = unlimited, self-hosted)",
        validation_alias="OLLAMA_REQUESTS_PER_MINUTE",
    )
    ollama_requests_per_day: int = Field(
        default=-1,
        description="Ollama requests per day (-1 = unlimited)",
        validation_alias="OLLAMA_REQUESTS_PER_DAY",
    )
    ollama_tokens_per_minute: int = Field(
        default=-1,
        description="Ollama tokens per minute (-1 = unlimited)",
        validation_alias="OLLAMA_TOKENS_PER_MINUTE",
    )

    # Global rate limiting settings
    rate_limit_enabled: bool = Field(
        default=True,
        description="Enable/disable rate limiting globally",
        validation_alias="RATE_LIMIT_ENABLED",
    )
    rate_limit_redis_prefix: str = Field(
        default="llm:ratelimit:",
        description="Redis key prefix for rate limit data",
        validation_alias="RATE_LIMIT_REDIS_PREFIX",
    )

    def get_provider_rate_limits(self, provider: str) -> ProviderRateLimitSettings:
        """Get rate limit settings for a specific provider."""
        limits_map = {
            "claude": ProviderRateLimitSettings(
                requests_per_minute=self.claude_requests_per_minute,
                requests_per_day=self.claude_requests_per_day,
                tokens_per_minute=self.claude_tokens_per_minute,
            ),
            "gemini": ProviderRateLimitSettings(
                requests_per_minute=self.gemini_requests_per_minute,
                requests_per_day=self.gemini_requests_per_day,
                tokens_per_minute=self.gemini_tokens_per_minute,
            ),
            "ollama": ProviderRateLimitSettings(
                requests_per_minute=self.ollama_requests_per_minute,
                requests_per_day=self.ollama_requests_per_day,
                tokens_per_minute=self.ollama_tokens_per_minute,
            ),
        }
        return limits_map.get(provider, ProviderRateLimitSettings())


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
    backend_url: str = "http://localhost:8000"
    mailagent_url: str = "http://localhost:8001"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aexy"
    database_sync_url:str='postgresql+psycopg2://postgres:postgres@localhost:5432/aexy'
    database_echo: bool = False

    # GitHub App (for OAuth and installations)
    github_app_id: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    github_private_key: str = ""  # PEM format, can use \n for newlines
    github_private_key_path: str = ""  # Alternative: path to PEM file
    github_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/auth/github/callback",
        validation_alias="GITHUB_REDIRECT_URI",
    )
    github_app_install_url: str = Field(
        default="https://github.com/apps/devograph/installations/new",
        validation_alias="GITHUB_APP_INSTALL_URL",
    )

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

    # Temporal (for workflow and task execution)
    temporal_address: str = Field(
        default="localhost:7233",
        description="Temporal server gRPC address",
        validation_alias="TEMPORAL_ADDRESS",
    )
    temporal_namespace: str = Field(
        default="default",
        description="Temporal namespace",
        validation_alias="TEMPORAL_NAMESPACE",
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
    email_provider: str = Field(
        default="ses",
        description="Email provider to use: 'ses' for AWS SES or 'smtp' for SMTP",
        validation_alias="EMAIL_PROVIDER",
    )

    # SMTP Settings (used when email_provider='smtp')
    smtp_host: str = Field(
        default="",
        description="SMTP server hostname",
        validation_alias="SMTP_HOST",
    )
    smtp_port: int = Field(
        default=587,
        description="SMTP server port (587 for TLS, 465 for SSL, 25 for plain)",
        validation_alias="SMTP_PORT",
    )
    smtp_username: str = Field(
        default="",
        description="SMTP authentication username",
        validation_alias="SMTP_USERNAME",
    )
    smtp_password: str = Field(
        default="",
        description="SMTP authentication password",
        validation_alias="SMTP_PASSWORD",
    )
    smtp_use_tls: bool = Field(
        default=True,
        description="Use STARTTLS for SMTP connection",
        validation_alias="SMTP_USE_TLS",
    )
    smtp_use_ssl: bool = Field(
        default=False,
        description="Use SSL/TLS for SMTP connection (mutually exclusive with smtp_use_tls)",
        validation_alias="SMTP_USE_SSL",
    )
    smtp_sender_email: str = Field(
        default="",
        description="Sender email address for SMTP (defaults to ses_sender_email if not set)",
        validation_alias="SMTP_SENDER_EMAIL",
    )
    smtp_sender_name: str = Field(
        default="",
        description="Sender display name for SMTP (defaults to ses_sender_name if not set)",
        validation_alias="SMTP_SENDER_NAME",
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
        default="http://localhost:8000/api/v1/integrations/google/callback",
        description="Google OAuth redirect URI for Google integration",
    )

    # Microsoft OAuth (for calendar integration)
    microsoft_client_id: str = Field(
        default="",
        description="Microsoft Azure AD App Client ID",
    )
    microsoft_client_secret: str = Field(
        default="",
        description="Microsoft Azure AD App Client Secret",
    )
    microsoft_tenant_id: str = Field(
        default="common",
        description="Microsoft Azure AD Tenant ID (use 'common' for multi-tenant)",
    )
    microsoft_redirect_uri: str = Field(
        default="http://localhost:8000/api/v1/integrations/microsoft/callback",
        description="Microsoft OAuth redirect URI for calendar integration",
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

    # Twilio SMS Integration
    twilio_account_sid: str = Field(
        default="",
        description="Twilio Account SID",
    )
    twilio_auth_token: str = Field(
        default="",
        description="Twilio Auth Token",
    )
    twilio_phone_number: str = Field(
        default="",
        description="Default Twilio phone number for sending SMS",
    )

    # Anthropic (for AI Agents and Email generation)
    anthropic_api_key: str = Field(
        default="",
        description="Anthropic API key for Claude (used by AI agents)",
    )

    # Platform Admin Configuration
    admin_emails: str = Field(
        default="",
        description="Comma-separated list of platform admin emails",
        validation_alias="ADMIN_EMAILS",
    )

    @property
    def admin_email_list(self) -> list[str]:
        """Parse admin emails from comma-separated string."""
        if not self.admin_emails:
            return []
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    # Email Tracking
    email_tracking_enabled: bool = Field(
        default=True,
        description="Enable email open and click tracking",
    )
    email_tracking_domain: str = Field(
        default="",
        description="Domain for tracking URLs (e.g., track.example.com). If empty, uses backend_url.",
    )
    email_image_cdn_url: str = Field(
        default="",
        description="CDN URL for hosted images. If empty, uses backend_url.",
    )

    def get_tracking_base_url(self) -> str:
        """Get the base URL for tracking endpoints."""
        if self.email_tracking_domain:
            return f"https://{self.email_tracking_domain}"
        return self.backend_url

    # Cloudflare R2 Storage (for video recordings)
    r2_access_key_id: str = Field(
        default="",
        description="Cloudflare R2 Access Key ID",
        validation_alias="R2_ACCESS_KEY_ID",
    )
    r2_secret_access_key: str = Field(
        default="",
        description="Cloudflare R2 Secret Access Key",
        validation_alias="R2_SECRET_ACCESS_KEY",
    )
    r2_account_id: str = Field(
        default="",
        description="Cloudflare Account ID for R2",
        validation_alias="R2_ACCOUNT_ID",
    )
    r2_bucket_name: str = Field(
        default="",
        description="R2 bucket name for assessment recordings",
        validation_alias="R2_BUCKET_NAME",
    )
    r2_recordings_prefix: str = Field(
        default="assessment-recordings",
        description="R2 key prefix for assessment recordings",
        validation_alias="R2_RECORDINGS_PREFIX",
    )

    @property
    def r2_endpoint_url(self) -> str:
        """Get the R2 endpoint URL based on account ID."""
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return ""

    # LLM Configuration
    llm: LLMSettings = Field(default_factory=LLMSettings)


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()


# Convenience singleton for direct imports
settings = get_settings()
