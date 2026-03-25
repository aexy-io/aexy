"""Schemas for AI Agents."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class AgentToolInfo(BaseModel):
    """Tool information for agent configuration."""

    name: str
    description: str
    category: str


class WorkingHoursConfig(BaseModel):
    """Working hours configuration."""

    enabled: bool = False
    timezone: str = "UTC"
    start: str = "09:00"
    end: str = "17:00"
    days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])  # Mon-Fri


class AgentCreate(BaseModel):
    """Schema for creating an agent."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    agent_type: str = Field(default="custom")
    mention_handle: str | None = Field(default=None, max_length=50)
    goal: str | None = None
    system_prompt: str | None = None
    custom_instructions: str | None = None
    tools: list[str] = Field(default_factory=list)

    # LLM configuration
    llm_provider: Literal["claude", "gemini", "ollama", "openrouter"] = "claude"
    model: str = Field(default="claude-3-sonnet-20240229")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=100000)

    # LangGraph configuration
    max_iterations: int = Field(default=10, ge=1, le=50)
    timeout_seconds: int = Field(default=300, ge=30, le=1800)

    # Behavior configuration
    confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    require_approval_below: float = Field(default=0.5, ge=0.0, le=1.0)
    max_daily_responses: int | None = Field(default=None, ge=1)
    response_delay_minutes: int = Field(default=0, ge=0, le=60)

    # Working hours
    working_hours: WorkingHoursConfig | None = None

    # Escalation
    escalation_email: str | None = Field(default=None, max_length=255)
    escalation_slack_channel: str | None = Field(default=None, max_length=100)


class AgentUpdate(BaseModel):
    """Schema for updating an agent."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    mention_handle: str | None = Field(default=None, max_length=50)
    goal: str | None = None
    system_prompt: str | None = None
    custom_instructions: str | None = None
    tools: list[str] | None = None

    # LLM configuration
    llm_provider: Literal["claude", "gemini", "ollama", "openrouter"] | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=100000)

    # LangGraph configuration
    max_iterations: int | None = Field(default=None, ge=1, le=50)
    timeout_seconds: int | None = Field(default=None, ge=30, le=1800)

    # Behavior configuration
    confidence_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    require_approval_below: float | None = Field(default=None, ge=0.0, le=1.0)
    max_daily_responses: int | None = Field(default=None, ge=1)
    response_delay_minutes: int | None = Field(default=None, ge=0, le=60)

    # Working hours
    working_hours: WorkingHoursConfig | None = None

    # Escalation
    escalation_email: str | None = Field(default=None, max_length=255)
    escalation_slack_channel: str | None = Field(default=None, max_length=100)

    # Email integration
    email_enabled: bool | None = None
    auto_reply_enabled: bool | None = None
    email_signature: str | None = None

    is_active: bool | None = None


class AgentResponse(BaseModel):
    """Schema for agent response."""

    id: str
    workspace_id: str
    name: str
    description: str | None
    agent_type: str
    mention_handle: str | None
    is_system: bool
    goal: str | None
    system_prompt: str | None
    custom_instructions: str | None
    tools: list[str]

    # LLM configuration
    llm_provider: str
    model: str
    temperature: float
    max_tokens: int

    # LangGraph configuration
    max_iterations: int
    timeout_seconds: int

    # Behavior configuration
    confidence_threshold: float
    require_approval_below: float
    max_daily_responses: int | None
    response_delay_minutes: int

    # Working hours
    working_hours: dict | None

    # Escalation
    escalation_email: str | None
    escalation_slack_channel: str | None

    # Email integration
    email_address: str | None = None
    email_enabled: bool = False
    auto_reply_enabled: bool = True
    email_signature: str | None = None

    is_active: bool
    created_by_id: str | None
    total_executions: int
    successful_executions: int
    failed_executions: int
    avg_duration_ms: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HandleAvailabilityResponse(BaseModel):
    """Response for handle availability check."""

    available: bool
    handle: str
    message: str | None = None


class AgentMetricsResponse(BaseModel):
    """Response for agent metrics."""

    total_runs: int
    successful_runs: int
    failed_runs: int
    success_rate: float
    avg_duration_ms: int
    avg_confidence: float
    runs_today: int
    runs_this_week: int
    recent_executions: list["AgentExecutionResponse"]


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


# =============================================================================
# CONVERSATION SCHEMAS
# =============================================================================


class ConversationCreate(BaseModel):
    """Schema for creating a conversation."""

    message: str = Field(..., min_length=1)
    record_id: str | None = None
    title: str | None = None


class ConversationUpdate(BaseModel):
    """Schema for updating a conversation."""

    title: str | None = None
    status: Literal["active", "completed", "archived"] | None = None


class MessageCreate(BaseModel):
    """Schema for sending a message in a conversation."""

    content: str = Field(..., min_length=1)


class ToolCallInfo(BaseModel):
    """Schema for tool call information."""

    id: str
    name: str
    args: dict


class MessageResponse(BaseModel):
    """Schema for a conversation message."""

    id: str
    conversation_id: str
    execution_id: str | None
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    tool_calls: list[ToolCallInfo] | None = None
    tool_name: str | None = None
    tool_output: dict | None = None
    message_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    """Schema for a conversation."""

    id: str
    workspace_id: str
    agent_id: str
    record_id: str | None
    title: str | None
    status: str
    conversation_metadata: dict = {}
    created_at: datetime
    updated_at: datetime
    ended_at: datetime | None
    message_count: int = 0

    model_config = {"from_attributes": True}


class ConversationWithMessagesResponse(ConversationResponse):
    """Schema for a conversation with messages."""

    messages: list[MessageResponse] = []

    model_config = {"from_attributes": True}


# =============================================================================
# EMAIL/INBOX SCHEMAS
# =============================================================================


class EmailDomainResponse(BaseModel):
    """Schema for an available email domain."""

    domain: str
    is_default: bool = False
    is_verified: bool = True
    display_name: str | None = None


class EmailDomainsListResponse(BaseModel):
    """Schema for list of available email domains."""

    domains: list[EmailDomainResponse]
    default_domain: str


class EmailEnableRequest(BaseModel):
    """Schema for enabling email on an agent."""

    preferred_handle: str | None = Field(default=None, max_length=50)
    domain: str | None = Field(default=None, description="Domain to use for email address")


class EmailEnableResponse(BaseModel):
    """Schema for email enable response."""

    email_address: str
    domain: str
    enabled: bool = True


class InboxMessageClassification(BaseModel):
    """Classification results from AI processing."""

    intent: str | None = None
    sentiment: str | None = None  # positive, neutral, negative
    urgency: str | None = None  # low, normal, high, urgent
    topics: list[str] = []


class InboxMessageResponse(BaseModel):
    """Schema for inbox message response."""

    id: str
    agent_id: str
    workspace_id: str
    message_id: str
    thread_id: str | None
    from_email: str
    from_name: str | None
    to_email: str
    subject: str | None
    body_text: str | None
    body_html: str | None
    status: str
    priority: str
    classification: dict | None
    summary: str | None
    suggested_response: str | None
    confidence_score: float | None
    response_id: str | None
    responded_at: datetime | None
    escalated_to: str | None
    escalated_at: datetime | None
    attachments: list | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InboxReplyRequest(BaseModel):
    """Schema for replying to an inbox message."""

    body: str = Field(..., min_length=1)
    use_suggested: bool = False  # Use AI-suggested response
    subject: str | None = None  # Override subject


class InboxEscalateRequest(BaseModel):
    """Schema for escalating an inbox message."""

    escalate_to: str = Field(..., description="Developer ID to escalate to")
    note: str | None = None  # Optional note for the escalation


class InboxActionResponse(BaseModel):
    """Generic response for inbox actions."""

    success: bool
    message: str
    inbox_message_id: str


class EmailRoutingRuleCreate(BaseModel):
    """Schema for creating an email routing rule."""

    rule_type: Literal["domain", "sender", "subject_contains", "keyword"]
    rule_value: str = Field(..., min_length=1)
    priority: int = Field(default=0, ge=0, le=100)


class EmailRoutingRuleResponse(BaseModel):
    """Schema for email routing rule response."""

    id: str
    workspace_id: str
    agent_id: str
    rule_type: str
    rule_value: str
    priority: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
