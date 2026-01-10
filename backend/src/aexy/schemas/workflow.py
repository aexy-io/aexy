"""Workflow schemas for visual automation builder."""

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# NODE TYPE LITERALS
# =============================================================================

WorkflowNodeType = Literal["trigger", "action", "condition", "wait", "agent", "branch"]

TriggerSubtype = Literal[
    "record_created", "record_updated", "record_deleted", "field_changed",
    "stage_changed", "scheduled", "webhook_received", "form_submitted",
    "email_received", "manual"
]

ActionSubtype = Literal[
    "update_record", "create_record", "delete_record", "send_email",
    "send_slack", "send_sms", "create_task", "add_to_list", "remove_from_list",
    "enroll_sequence", "unenroll_sequence", "webhook_call", "assign_owner"
]

WaitSubtype = Literal["duration", "datetime", "event"]

AgentSubtype = Literal[
    "sales_outreach", "lead_scoring", "email_drafter", "data_enrichment", "custom"
]

ConditionOperator = Literal[
    "equals", "not_equals", "contains", "not_contains",
    "starts_with", "ends_with", "is_empty", "is_not_empty",
    "gt", "gte", "lt", "lte", "in", "not_in"
]


# =============================================================================
# NODE POSITION & VIEWPORT
# =============================================================================

class NodePosition(BaseModel):
    """Position of a node on the canvas."""
    x: float
    y: float


class Viewport(BaseModel):
    """Canvas viewport settings."""
    x: float = 0
    y: float = 0
    zoom: float = 1


# =============================================================================
# NODE DATA SCHEMAS
# =============================================================================

class TriggerNodeData(BaseModel):
    """Data for trigger nodes."""
    label: str = "Trigger"
    trigger_type: TriggerSubtype
    config: dict[str, Any] = Field(default_factory=dict)
    # For record-based triggers
    object_id: str | None = None
    # For scheduled triggers
    schedule: str | None = None  # cron expression
    # For field_changed triggers
    field_slug: str | None = None
    # For webhook triggers
    webhook_path: str | None = None


class ActionNodeData(BaseModel):
    """Data for action nodes."""
    label: str = "Action"
    action_type: ActionSubtype
    config: dict[str, Any] = Field(default_factory=dict)
    # For email actions
    email_template_id: str | None = None
    email_subject: str | None = None
    email_body: str | None = None
    use_ai_personalization: bool = False
    # For record actions
    target_object_id: str | None = None
    field_mappings: dict[str, Any] | None = None
    # For slack/sms actions
    message_template: str | None = None
    channel_id: str | None = None
    phone_field: str | None = None
    # For webhook actions
    webhook_url: str | None = None
    http_method: str = "POST"
    headers: dict[str, str] | None = None
    body_template: str | None = None


class ConditionNodeData(BaseModel):
    """Data for condition (if/else) nodes."""
    label: str = "Condition"
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    # Each condition: {field: str, operator: ConditionOperator, value: Any}
    conjunction: Literal["and", "or"] = "and"


class WaitNodeData(BaseModel):
    """Data for wait/delay nodes."""
    label: str = "Wait"
    wait_type: WaitSubtype = "duration"
    # For duration waits
    duration_value: int = 1
    duration_unit: Literal["minutes", "hours", "days"] = "days"
    # For datetime waits
    wait_until: datetime | None = None
    # For event waits
    wait_for_event: str | None = None  # e.g., "email.opened", "email.clicked"
    timeout_hours: int | None = None


class AgentNodeData(BaseModel):
    """Data for AI agent nodes."""
    label: str = "AI Agent"
    agent_type: AgentSubtype
    agent_id: str | None = None  # For custom agents
    # Input/output variable mappings
    input_mapping: dict[str, str] = Field(default_factory=dict)
    output_mapping: dict[str, str] = Field(default_factory=dict)
    # Agent-specific config
    config: dict[str, Any] = Field(default_factory=dict)


class BranchNodeData(BaseModel):
    """Data for branch (multi-path split) nodes."""
    label: str = "Branch"
    branches: list[dict[str, Any]] = Field(default_factory=list)
    # Each branch: {id: str, label: str, conditions: list[dict]}


# =============================================================================
# WORKFLOW NODE & EDGE SCHEMAS
# =============================================================================

class WorkflowNodeBase(BaseModel):
    """Base schema for workflow nodes."""
    id: str
    type: WorkflowNodeType
    position: NodePosition
    data: dict[str, Any] = Field(default_factory=dict)


class WorkflowNode(WorkflowNodeBase):
    """Complete workflow node with all properties."""
    width: int | None = None
    height: int | None = None
    selected: bool = False
    dragging: bool = False


class WorkflowNodeCreate(BaseModel):
    """Schema for creating a workflow node."""
    type: WorkflowNodeType
    position: NodePosition
    data: dict[str, Any] = Field(default_factory=dict)


class WorkflowEdge(BaseModel):
    """Schema for workflow edges (connections between nodes)."""
    id: str
    source: str  # Source node ID
    target: str  # Target node ID
    source_handle: str | None = Field(default=None, alias="sourceHandle")
    target_handle: str | None = Field(default=None, alias="targetHandle")
    label: str | None = None
    type: str | None = None  # Edge type for styling
    animated: bool = False
    data: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


class WorkflowEdgeCreate(BaseModel):
    """Schema for creating a workflow edge."""
    source: str
    target: str
    source_handle: str | None = Field(default=None, alias="sourceHandle")
    target_handle: str | None = Field(default=None, alias="targetHandle")
    label: str | None = None
    type: str | None = None
    animated: bool = False
    data: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


# =============================================================================
# WORKFLOW DEFINITION SCHEMAS
# =============================================================================

class WorkflowDefinitionCreate(BaseModel):
    """Schema for creating a workflow definition."""
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    viewport: Viewport | None = None


class WorkflowDefinitionUpdate(BaseModel):
    """Schema for updating a workflow definition."""
    nodes: list[WorkflowNode] | None = None
    edges: list[WorkflowEdge] | None = None
    viewport: Viewport | None = None


class WorkflowDefinitionResponse(BaseModel):
    """Schema for workflow definition response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    automation_id: str
    nodes: list[dict]
    edges: list[dict]
    viewport: dict | None = None
    version: int
    is_published: bool
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# =============================================================================
# WORKFLOW EXECUTION SCHEMAS
# =============================================================================

class WorkflowExecutionContext(BaseModel):
    """Context passed between workflow nodes during execution."""
    record_id: str | None = None
    record_data: dict[str, Any] = Field(default_factory=dict)
    trigger_data: dict[str, Any] = Field(default_factory=dict)
    variables: dict[str, Any] = Field(default_factory=dict)
    # Execution state
    executed_nodes: list[str] = Field(default_factory=list)
    current_node_id: str | None = None
    branch_path: str | None = None  # For tracking which branch is being executed


class NodeExecutionResult(BaseModel):
    """Result of executing a single node."""
    node_id: str
    status: Literal["success", "failed", "skipped"]
    output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    duration_ms: int = 0
    # For condition nodes
    condition_result: bool | None = None
    # For branch nodes
    selected_branch: str | None = None


class WorkflowExecutionRequest(BaseModel):
    """Request to execute a workflow."""
    record_id: str | None = None
    trigger_data: dict[str, Any] = Field(default_factory=dict)
    variables: dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = False


class WorkflowExecutionResponse(BaseModel):
    """Response from workflow execution."""
    execution_id: str
    automation_id: str
    workflow_id: str | None = None
    status: Literal["pending", "running", "completed", "failed", "paused", "cancelled"]
    started_at: datetime
    completed_at: datetime | None = None
    paused_at: datetime | None = None
    resume_at: datetime | None = None
    current_node_id: str | None = None
    node_results: list[NodeExecutionResult] = Field(default_factory=list)
    final_context: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    error_node_id: str | None = None
    is_dry_run: bool = False


class WorkflowExecutionStepResponse(BaseModel):
    """Response for a single execution step."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    execution_id: str
    node_id: str
    node_type: str
    node_label: str | None = None
    status: Literal["pending", "running", "success", "failed", "skipped", "waiting"]
    input_data: dict[str, Any] | None = None
    output_data: dict[str, Any] | None = None
    condition_result: bool | None = None
    selected_branch: str | None = None
    error: str | None = None
    duration_ms: int | None = None
    executed_at: datetime


class WorkflowExecutionDetailResponse(BaseModel):
    """Detailed response for a workflow execution with steps."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workflow_id: str
    automation_id: str
    workspace_id: str
    record_id: str | None = None
    status: Literal["pending", "running", "completed", "failed", "paused", "cancelled"]
    current_node_id: str | None = None
    next_node_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    trigger_data: dict[str, Any] = Field(default_factory=dict)
    resume_at: datetime | None = None
    wait_event_type: str | None = None
    wait_timeout_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    paused_at: datetime | None = None
    error: str | None = None
    error_node_id: str | None = None
    is_dry_run: bool = False
    triggered_by: str | None = None
    created_at: datetime
    updated_at: datetime
    steps: list[WorkflowExecutionStepResponse] = Field(default_factory=list)


class WorkflowExecutionListResponse(BaseModel):
    """List response for workflow executions."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workflow_id: str
    automation_id: str
    record_id: str | None = None
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    is_dry_run: bool = False
    created_at: datetime


# =============================================================================
# WORKFLOW VALIDATION SCHEMAS
# =============================================================================

class WorkflowValidationError(BaseModel):
    """Single validation error in a workflow."""
    node_id: str | None = None
    edge_id: str | None = None
    error_type: str
    message: str
    severity: Literal["error", "warning"] = "error"


class WorkflowValidationResult(BaseModel):
    """Result of validating a workflow."""
    is_valid: bool
    errors: list[WorkflowValidationError] = Field(default_factory=list)
    warnings: list[WorkflowValidationError] = Field(default_factory=list)


# =============================================================================
# WORKFLOW TEMPLATE SCHEMAS
# =============================================================================

class WorkflowTemplateCreate(BaseModel):
    """Schema for creating a workflow template from current workflow."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    category: str = "custom"
    icon: str | None = None


class WorkflowTemplateResponse(BaseModel):
    """Schema for workflow template response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    category: str
    icon: str | None = None
    nodes: list[dict]
    edges: list[dict]
    viewport: dict | None = None
    is_system: bool
    is_published: bool
    use_count: int
    created_at: datetime


class WorkflowTemplateListResponse(BaseModel):
    """Schema for listing workflow templates (without full node/edge data)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    category: str
    icon: str | None = None
    is_system: bool
    use_count: int
    node_count: int = 0  # Computed field
    created_at: datetime


class WorkflowTemplateCategoryResponse(BaseModel):
    """Schema for template category."""
    id: str
    label: str
    icon: str
    template_count: int = 0
