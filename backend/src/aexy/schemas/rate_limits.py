"""Pydantic schemas for rate limit configuration."""

from datetime import datetime
from pydantic import BaseModel, Field


class ProviderRateLimitOverride(BaseModel):
    """Override settings for a specific LLM provider."""

    requests_per_minute: int | None = Field(
        default=None,
        description="Max requests per minute for this provider (-1 for unlimited)",
    )
    requests_per_day: int | None = Field(
        default=None,
        description="Max requests per day for this provider (-1 for unlimited)",
    )
    tokens_per_minute: int | None = Field(
        default=None,
        description="Max tokens per minute for this provider (-1 for unlimited)",
    )


class WorkspaceRateLimitOverrides(BaseModel):
    """Workspace-level rate limit overrides stored in Workspace.settings."""

    llm_requests_per_day: int | None = Field(
        default=None,
        description="Override for daily LLM request limit",
    )
    llm_requests_per_minute: int | None = Field(
        default=None,
        description="Override for per-minute LLM request limit",
    )
    llm_tokens_per_minute: int | None = Field(
        default=None,
        description="Override for per-minute token limit",
    )
    provider_overrides: dict[str, ProviderRateLimitOverride] | None = Field(
        default=None,
        description="Provider-specific overrides (e.g., {'claude': {...}})",
    )


class EffectiveRateLimits(BaseModel):
    """Resolved effective rate limits after applying hierarchy."""

    requests_per_minute: int = Field(
        description="Effective requests per minute limit",
    )
    requests_per_day: int = Field(
        description="Effective requests per day limit",
    )
    tokens_per_minute: int = Field(
        description="Effective tokens per minute limit",
    )
    provider: str = Field(
        description="LLM provider these limits apply to",
    )
    source: str = Field(
        description="Source of limits: 'global', 'plan', or 'workspace_override'",
    )


class EffectiveRateLimitsResponse(BaseModel):
    """API response for effective rate limits with usage info."""

    requests_per_minute: int = Field(
        description="Effective requests per minute limit",
    )
    requests_per_day: int = Field(
        description="Effective requests per day limit",
    )
    tokens_per_minute: int = Field(
        description="Effective tokens per minute limit",
    )
    provider: str = Field(
        description="LLM provider these limits apply to",
    )
    source: str = Field(
        description="Source of limits: 'global', 'plan', or 'workspace_override'",
    )
    usage_today: int = Field(
        default=0,
        description="Requests made today",
    )
    remaining_today: int = Field(
        default=0,
        description="Requests remaining today (-1 if unlimited)",
    )
    usage_this_minute: int = Field(
        default=0,
        description="Requests made in current minute window",
    )
    remaining_this_minute: int = Field(
        default=0,
        description="Requests remaining this minute (-1 if unlimited)",
    )


class RateLimitStatusResponse(BaseModel):
    """Full rate limit status for a workspace."""

    workspace_id: str
    workspace_name: str
    plan_name: str | None = None
    plan_tier: str | None = None
    has_overrides: bool = False
    effective_limits: EffectiveRateLimitsResponse
    overrides: WorkspaceRateLimitOverrides | None = None


class SetWorkspaceRateLimitOverridesRequest(BaseModel):
    """Request to set workspace rate limit overrides."""

    llm_requests_per_day: int | None = Field(
        default=None,
        ge=-1,
        description="Override for daily LLM request limit (-1 for unlimited)",
    )
    llm_requests_per_minute: int | None = Field(
        default=None,
        ge=-1,
        description="Override for per-minute LLM request limit (-1 for unlimited)",
    )
    llm_tokens_per_minute: int | None = Field(
        default=None,
        ge=-1,
        description="Override for per-minute token limit (-1 for unlimited)",
    )
    provider_overrides: dict[str, ProviderRateLimitOverride] | None = Field(
        default=None,
        description="Provider-specific overrides",
    )
