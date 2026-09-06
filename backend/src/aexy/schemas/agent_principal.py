"""Schemas for agent principals and their tokens."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgentPrincipalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    capabilities: list[str] = Field(
        default_factory=list,
        description="Capabilities this principal may use, e.g. ['mcp.service_desk'].",
    )


class AgentPrincipalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    capabilities: list[str] | None = None
    is_active: bool | None = None


class AgentPrincipalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    name: str
    description: str | None = None
    capabilities: list[str]
    is_active: bool
    created_by_id: str | None = None
    last_used_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # How many tokens are live for it. Zero means nothing can act as it.
    active_token_count: int = 0


class PrincipalTokenCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class PrincipalTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    token_prefix: str
    expires_at: datetime | None
    last_used_at: datetime | None
    is_active: bool
    created_at: datetime


class PrincipalTokenCreatedResponse(PrincipalTokenResponse):
    token: str
