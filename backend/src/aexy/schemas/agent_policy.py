"""Pydantic schemas for agent policy engine."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AgentPolicyCreate(BaseModel):
    """Schema for creating an agent policy."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    agent_id: str | None = None
    policy_type: Literal[
        "tool_block",
        "tool_require_approval",
        "field_restriction",
        "rate_limit",
        "token_budget",
    ]
    config: dict = Field(default_factory=dict)
    priority: int = Field(default=100, ge=0)
    is_active: bool = True


class AgentPolicyUpdate(BaseModel):
    """Schema for updating an agent policy."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    agent_id: str | None = None
    policy_type: Literal[
        "tool_block",
        "tool_require_approval",
        "field_restriction",
        "rate_limit",
        "token_budget",
    ] | None = None
    config: dict | None = None
    priority: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class AgentPolicyResponse(BaseModel):
    """Schema for agent policy responses."""
    model_config = {"from_attributes": True}

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    agent_id: str | None = None
    policy_type: str
    config: dict
    priority: int
    is_active: bool
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PolicyDecisionResponse(BaseModel):
    """Schema for policy decision audit log entries."""
    model_config = {"from_attributes": True}

    id: str
    execution_id: str
    policy_id: str | None = None
    tool_name: str
    tool_args: dict
    decision: str
    reason: str | None = None
    confidence_score: float | None = None
    confidence_threshold: float | None = None
    approval_status: str | None = None
    approved_by_id: str | None = None
    approved_at: datetime | None = None
    created_at: datetime


class ConfigAuditResponse(BaseModel):
    """Schema for agent config audit log entries."""
    model_config = {"from_attributes": True}

    id: str
    agent_id: str
    changed_by_id: str | None = None
    change_type: str
    field_changes: dict
    created_at: datetime
