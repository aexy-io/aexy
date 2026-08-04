"""Schemas for workspace AI governance (kill switch + bring-your-own provider)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from aexy.models.workspace_ai_settings import (
    AI_PROVIDERS_REQUIRING_KEY,
    SUPPORTED_AI_PROVIDERS,
)

AIProvider = Literal["claude", "gemini", "openrouter", "deepseek", "ollama", "lmstudio"]


class AISettingsResponse(BaseModel):
    """What the settings page needs. Never carries the credential itself."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: str
    ai_enabled: bool = True
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    allow_platform_fallback: bool = False

    # Presence + identity of the installed key, without the key.
    has_api_key: bool = False
    key_hint: str | None = None
    key_set_at: datetime | None = None

    disabled_reason: str | None = None
    disabled_at: datetime | None = None
    updated_at: datetime | None = None

    # Capability flags so the page can explain itself instead of only 403ing.
    can_manage: bool = False
    plan_allows: bool = False
    plan_tier: str | None = None
    # Which provider is actually serving this workspace right now —
    # "workspace" (their own key) or "platform" (the deployment default).
    effective_source: Literal["workspace", "platform", "disabled"] = "platform"
    supported_providers: list[str] = Field(default_factory=lambda: list(SUPPORTED_AI_PROVIDERS))


class AISettingsUpdate(BaseModel):
    """PATCH semantics — only the fields supplied are touched.

    ``api_key`` is write-only. Sending ``""`` clears the stored credential;
    omitting it leaves the existing one alone, so an admin can change the model
    without re-pasting the key.
    """

    ai_enabled: bool | None = None
    disabled_reason: str | None = Field(None, max_length=2000)

    provider: AIProvider | None = None
    model: str | None = Field(None, max_length=120)
    base_url: str | None = Field(None, max_length=512)
    api_key: str | None = Field(None, max_length=512)
    allow_platform_fallback: bool | None = None

    # Explicitly hand the workspace back to the platform default.
    clear_provider: bool = False

    @model_validator(mode="after")
    def _coherent(self):
        if self.clear_provider and self.provider:
            raise ValueError("Cannot set a provider and clear it in the same request")
        if self.base_url and not self.base_url.startswith(("http://", "https://")):
            raise ValueError("base_url must be an http(s) URL")
        # A self-hosted provider (ollama/lmstudio) with no base_url is allowed:
        # the deployment's own endpoint is used. Whether a *key* is required is
        # checked in the service, which can see the already-stored credential —
        # this schema only sees the fields in this request.
        return self


class AIConnectionTestResult(BaseModel):
    """Outcome of a live probe against the workspace's configured provider."""

    ok: bool
    provider: str | None = None
    model: str | None = None
    # Provider-side message on failure, truncated — it is the only useful signal
    # for "wrong key" vs "wrong model name" vs "endpoint unreachable".
    detail: str | None = None
