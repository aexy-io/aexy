"""Schemas for AI Agents."""

from datetime import datetime
from pydantic import BaseModel, Field


class AgentToolInfo(BaseModel):
    """Tool information for agent configuration."""

    name: str
    description: str
    category: str


class AgentCreate(BaseModel):
    """Schema for creating an agent."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    agent_type: str = Field(default="custom")
    goal: str | None = None
    system_prompt: str | None = None
    tools: list[str] = Field(default_factory=list)
    max_iterations: int = Field(default=10, ge=1, le=50)
    timeout_seconds: int = Field(default=300, ge=30, le=1800)
    model: str = Field(default="claude-3-sonnet-20240229")


class AgentUpdate(BaseModel):
    """Schema for updating an agent."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    goal: str | None = None
    system_prompt: str | None = None
    tools: list[str] | None = None
    max_iterations: int | None = Field(default=None, ge=1, le=50)
    timeout_seconds: int | None = Field(default=None, ge=30, le=1800)
    model: str | None = None
    is_active: bool | None = None


class AgentResponse(BaseModel):
    """Schema for agent response."""

    id: str
    workspace_id: str
    name: str
    description: str | None
    agent_type: str
    is_system: bool
    goal: str | None
    system_prompt: str | None
    tools: list[str]
    max_iterations: int
    timeout_seconds: int
    model: str
    is_active: bool
    created_by_id: str | None
    total_executions: int
    successful_executions: int
    failed_executions: int
    avg_duration_ms: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentExecuteRequest(BaseModel):
    """Schema for executing an agent."""

    record_id: str | None = None
    context: dict = Field(default_factory=dict)


class AgentExecutionStep(BaseModel):
    """Schema for an execution step."""

    step_number: int
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_output: str | None = None
    thought: str | None = None
    timestamp: datetime | None = None


class AgentExecutionResponse(BaseModel):
    """Schema for agent execution response."""

    id: str
    agent_id: str
    record_id: str | None
    triggered_by: str | None
    trigger_id: str | None
    input_context: dict
    output_result: dict | None
    steps: list[dict]
    status: str
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    input_tokens: int
    output_tokens: int
    created_at: datetime

    model_config = {"from_attributes": True}


class WritingStyleResponse(BaseModel):
    """Schema for writing style response."""

    id: str
    developer_id: str
    workspace_id: str
    style_profile: dict
    samples_analyzed: int
    is_trained: bool
    last_trained_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateEmailRequest(BaseModel):
    """Schema for generating an email."""

    recipient_name: str = Field(..., min_length=1)
    purpose: str = Field(..., min_length=1)
    key_points: list[str] = Field(default_factory=list)
    tone_override: str | None = None


class GenerateEmailResponse(BaseModel):
    """Schema for generated email response."""

    subject: str
    body: str
    style_applied: str
