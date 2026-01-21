"""Ticketing-related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr


# Type literals
TicketFormAuthMode = Literal["anonymous", "email_verification"]
TicketFormTemplateType = Literal["bug_report", "feature_request", "support"]
TicketStatus = Literal["new", "acknowledged", "in_progress", "waiting_on_submitter", "resolved", "closed"]
TicketPriority = Literal["low", "medium", "high", "urgent"]
TicketSeverity = Literal["critical", "high", "medium", "low"]
TicketFieldType = Literal["text", "textarea", "email", "select", "multiselect", "checkbox", "file", "date"]
EscalationLevel = Literal["level_1", "level_2", "level_3", "level_4"]
NotificationChannel = Literal["email", "slack", "in_app"]


# ==================== Form Field Schemas ====================

class FieldOptionCreate(BaseModel):
    """Option for select/multiselect fields."""
    value: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=100)


class ValidationRules(BaseModel):
    """Validation rules for form fields."""
    min_length: int | None = None
    max_length: int | None = None
    pattern: str | None = None
    allowed_file_types: list[str] | None = None
    max_file_size_mb: int | None = None


class ExternalMappings(BaseModel):
    """Field mapping to external platforms."""
    github: str | None = None  # "title", "body", "labels"
    jira: str | None = None  # "summary", "description", "labels"
    linear: str | None = None  # "title", "description", "labels"


class TicketFormFieldCreate(BaseModel):
    """Schema for creating a form field."""
    name: str = Field(..., min_length=1, max_length=255)
    field_key: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z_][a-z0-9_]*$")
    field_type: TicketFieldType = "text"
    placeholder: str | None = Field(default=None, max_length=255)
    default_value: str | None = None
    help_text: str | None = None
    is_required: bool = False
    validation_rules: ValidationRules | None = None
    options: list[FieldOptionCreate] | None = None
    position: int | None = None
    is_visible: bool = True
    external_mappings: ExternalMappings | None = None


class TicketFormFieldUpdate(BaseModel):
    """Schema for updating a form field."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    placeholder: str | None = Field(default=None, max_length=255)
    default_value: str | None = None
    help_text: str | None = None
    is_required: bool | None = None
    validation_rules: ValidationRules | None = None
    options: list[FieldOptionCreate] | None = None
    position: int | None = None
    is_visible: bool | None = None
    external_mappings: ExternalMappings | None = None


class TicketFormFieldResponse(BaseModel):
    """Schema for form field response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    name: str
    field_key: str
    field_type: TicketFieldType
    placeholder: str | None = None
    default_value: str | None = None
    help_text: str | None = None
    is_required: bool
    validation_rules: dict
    options: list[dict] | None = None
    position: int
    is_visible: bool
    external_mappings: dict
    created_at: datetime
    updated_at: datetime


class FieldReorder(BaseModel):
    """Schema for reordering fields."""
    field_ids: list[str] = Field(..., min_length=1)


# ==================== Form Destination Schemas ====================

class FormDestinationConfig(BaseModel):
    """Configuration for a form destination."""
    type: Literal["github", "jira", "linear"]
    enabled: bool = True
    # GitHub specific
    repository_id: str | None = None
    labels: list[str] | None = None
    # Jira specific
    project_key: str | None = None
    issue_type: str | None = None
    # Linear specific
    team_id: str | None = None


class ConditionalRule(BaseModel):
    """Conditional logic rule for showing/hiding fields."""
    field_id: str
    condition: Literal["equals", "not_equals", "contains", "is_empty", "is_not_empty"]
    value: str | None = None
    target_field_id: str
    action: Literal["show", "hide", "require"]


class FormTheme(BaseModel):
    """Theme customization for the form."""
    primary_color: str | None = Field(default=None, max_length=20)
    logo_url: str | None = Field(default=None, max_length=500)
    custom_css: str | None = None
    header_text: str | None = None


# ==================== Ticket Form Schemas ====================

class TicketFormCreate(BaseModel):
    """Schema for creating a ticket form."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    template_type: TicketFormTemplateType | None = None
    auth_mode: TicketFormAuthMode = "anonymous"
    require_email: bool = True
    theme: FormTheme | None = None
    success_message: str | None = None
    redirect_url: str | None = Field(default=None, max_length=500)
    destinations: list[FormDestinationConfig] | None = None
    auto_create_task: bool = False
    default_team_id: str | None = None
    auto_assign_oncall: bool = False
    default_severity: TicketSeverity | None = None
    default_priority: TicketPriority | None = None
    conditional_rules: list[ConditionalRule] | None = None


class TicketFormUpdate(BaseModel):
    """Schema for updating a ticket form."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    auth_mode: TicketFormAuthMode | None = None
    require_email: bool | None = None
    theme: FormTheme | None = None
    success_message: str | None = None
    redirect_url: str | None = Field(default=None, max_length=500)
    destinations: list[FormDestinationConfig] | None = None
    auto_create_task: bool | None = None
    default_team_id: str | None = None
    auto_assign_oncall: bool | None = None
    default_severity: TicketSeverity | None = None
    default_priority: TicketPriority | None = None
    conditional_rules: list[ConditionalRule] | None = None


class TicketFormResponse(BaseModel):
    """Schema for ticket form response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    template_type: str | None = None
    public_url_token: str
    is_active: bool
    auth_mode: TicketFormAuthMode
    require_email: bool
    theme: dict
    success_message: str | None = None
    redirect_url: str | None = None
    destinations: list[dict]
    auto_create_task: bool
    default_team_id: str | None = None
    auto_assign_oncall: bool = False
    default_severity: TicketSeverity | None = None
    default_priority: TicketPriority | None = None
    conditional_rules: list[dict]
    submission_count: int
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime
    fields: list[TicketFormFieldResponse] | None = None


class TicketFormListResponse(BaseModel):
    """Schema for listing ticket forms (without fields)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    template_type: str | None = None
    public_url_token: str
    is_active: bool
    auth_mode: TicketFormAuthMode
    submission_count: int
    created_at: datetime
    updated_at: datetime


# ==================== Public Form Schemas ====================

class PublicFormResponse(BaseModel):
    """Schema for public form (no sensitive data)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    auth_mode: TicketFormAuthMode
    require_email: bool
    theme: dict
    fields: list[TicketFormFieldResponse]
    conditional_rules: list[dict]


class PublicTicketSubmission(BaseModel):
    """Schema for submitting a ticket through public form."""
    submitter_email: EmailStr | None = None
    submitter_name: str | None = Field(default=None, max_length=255)
    field_values: dict[str, Any]


class PublicSubmissionResponse(BaseModel):
    """Response after submitting a ticket."""
    ticket_id: str
    ticket_number: int
    success_message: str | None = None
    redirect_url: str | None = None
    requires_email_verification: bool = False


class EmailVerificationRequest(BaseModel):
    """Request to verify email."""
    token: str


# ==================== Ticket Schemas ====================

class TicketAttachment(BaseModel):
    """Attachment on a ticket."""
    filename: str
    url: str
    size: int
    type: str


class ExternalIssue(BaseModel):
    """External issue link."""
    platform: Literal["github", "jira", "linear"]
    issue_id: str
    issue_url: str
    synced_at: datetime


class TicketCreate(BaseModel):
    """Schema for creating a ticket (internal use)."""
    form_id: str
    submitter_email: EmailStr | None = None
    submitter_name: str | None = Field(default=None, max_length=255)
    field_values: dict[str, Any]
    attachments: list[TicketAttachment] | None = None
    priority: TicketPriority | None = None
    assignee_id: str | None = None
    team_id: str | None = None


class TicketUpdate(BaseModel):
    """Schema for updating a ticket."""
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    severity: TicketSeverity | None = None
    assignee_id: str | None = None
    team_id: str | None = None
    linked_task_id: str | None = None


class TicketAssign(BaseModel):
    """Schema for assigning a ticket."""
    assignee_id: str | None = None
    team_id: str | None = None


class TicketResponse(BaseModel):
    """Schema for ticket response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    workspace_id: str
    ticket_number: int
    submitter_email: str | None = None
    submitter_name: str | None = None
    email_verified: bool
    field_values: dict
    attachments: list[dict]
    status: TicketStatus
    priority: TicketPriority | None = None
    severity: TicketSeverity | None = None
    assignee_id: str | None = None
    team_id: str | None = None
    external_issues: list[dict]
    linked_task_id: str | None = None
    first_response_at: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    sla_due_at: datetime | None = None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    # Expanded relations (optional)
    form_name: str | None = None
    assignee_name: str | None = None
    team_name: str | None = None


class TicketListResponse(BaseModel):
    """Schema for listing tickets."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    ticket_number: int
    submitter_email: str | None = None
    submitter_name: str | None = None
    status: TicketStatus
    priority: TicketPriority | None = None
    severity: TicketSeverity | None = None
    assignee_id: str | None = None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    form_name: str | None = None
    assignee_name: str | None = None


class TicketFilters(BaseModel):
    """Filters for listing tickets."""
    form_id: str | None = None
    status: list[TicketStatus] | None = None
    priority: list[TicketPriority] | None = None
    severity: list[TicketSeverity] | None = None
    assignee_id: str | None = None
    team_id: str | None = None
    submitter_email: str | None = None
    sla_breached: bool | None = None
    created_after: datetime | None = None
    created_before: datetime | None = None


# ==================== Ticket Response (Comment) Schemas ====================

class TicketCommentCreate(BaseModel):
    """Schema for creating a ticket response/comment."""
    content: str = Field(..., min_length=1)
    is_internal: bool = False
    new_status: TicketStatus | None = None
    attachments: list[TicketAttachment] | None = None


class TicketCommentResponse(BaseModel):
    """Schema for ticket comment response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    ticket_id: str
    author_id: str | None = None
    author_email: str | None = None
    is_internal: bool
    content: str
    attachments: list[dict]
    old_status: str | None = None
    new_status: str | None = None
    created_at: datetime
    # Expanded
    author_name: str | None = None


# ==================== SLA Policy Schemas ====================

class BusinessHours(BaseModel):
    """Business hours configuration."""
    timezone: str = "UTC"
    days: list[int] = Field(default=[1, 2, 3, 4, 5])  # Monday-Friday
    start_hour: int = Field(default=9, ge=0, le=23)
    end_hour: int = Field(default=17, ge=0, le=23)


class SLAConditions(BaseModel):
    """Conditions for when SLA applies."""
    form_ids: list[str] | None = None
    priorities: list[TicketPriority] | None = None
    team_ids: list[str] | None = None


class SLAPolicyCreate(BaseModel):
    """Schema for creating an SLA policy."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    conditions: SLAConditions | None = None
    first_response_target_minutes: int | None = Field(default=None, ge=1)
    resolution_target_minutes: int | None = Field(default=None, ge=1)
    business_hours: BusinessHours | None = None
    priority_order: int = 100


class SLAPolicyUpdate(BaseModel):
    """Schema for updating an SLA policy."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    conditions: SLAConditions | None = None
    first_response_target_minutes: int | None = Field(default=None, ge=1)
    resolution_target_minutes: int | None = Field(default=None, ge=1)
    business_hours: BusinessHours | None = None
    priority_order: int | None = None
    is_active: bool | None = None


class SLAPolicyResponse(BaseModel):
    """Schema for SLA policy response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    conditions: dict
    first_response_target_minutes: int | None = None
    resolution_target_minutes: int | None = None
    business_hours: dict | None = None
    priority_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ==================== Analytics Schemas ====================

class TicketMetricsResponse(BaseModel):
    """Schema for ticket metrics snapshot."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    form_id: str | None = None
    team_id: str | None = None
    snapshot_date: date
    tickets_created: int
    tickets_resolved: int
    tickets_closed: int
    tickets_reopened: int
    avg_first_response_minutes: float | None = None
    median_first_response_minutes: float | None = None
    p90_first_response_minutes: float | None = None
    avg_resolution_minutes: float | None = None
    median_resolution_minutes: float | None = None
    p90_resolution_minutes: float | None = None
    sla_met_count: int
    sla_breached_count: int
    status_counts: dict
    priority_counts: dict


class AnalyticsOverview(BaseModel):
    """Overview analytics for dashboard."""
    total_tickets: int
    open_tickets: int
    resolved_today: int
    avg_response_time_minutes: float | None = None
    avg_resolution_time_minutes: float | None = None
    sla_compliance_percentage: float | None = None
    tickets_by_status: dict[str, int]
    tickets_by_priority: dict[str, int]


class VolumeMetrics(BaseModel):
    """Volume metrics over time."""
    date: date
    created: int
    resolved: int
    closed: int


class ResponseTimeMetrics(BaseModel):
    """Response time metrics."""
    date: date
    avg_minutes: float | None = None
    median_minutes: float | None = None
    p90_minutes: float | None = None


# ==================== File Upload Schemas ====================

class FileUploadResponse(BaseModel):
    """Response after uploading a file."""
    filename: str
    url: str
    size: int
    type: str


# ==================== Template Schemas ====================

class FormTemplate(BaseModel):
    """Pre-built form template."""
    type: TicketFormTemplateType
    name: str
    description: str
    fields: list[TicketFormFieldCreate]


# ==================== Escalation Matrix Schemas ====================

class EscalationRuleCreate(BaseModel):
    """Individual escalation rule."""
    level: EscalationLevel
    delay_minutes: int = Field(..., ge=0)  # 0 = immediate
    notify_users: list[str] | None = None  # User IDs
    notify_teams: list[str] | None = None  # Team IDs
    notify_oncall: bool = False
    channels: list[NotificationChannel] = ["email", "in_app"]


class EscalationMatrixCreate(BaseModel):
    """Schema for creating an escalation matrix."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    severity_levels: list[TicketSeverity] = Field(..., min_length=1)
    rules: list[EscalationRuleCreate] = Field(..., min_length=1)
    form_ids: list[str] | None = None
    team_ids: list[str] | None = None
    priority_order: int = 100


class EscalationMatrixUpdate(BaseModel):
    """Schema for updating an escalation matrix."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    severity_levels: list[TicketSeverity] | None = None
    rules: list[EscalationRuleCreate] | None = None
    form_ids: list[str] | None = None
    team_ids: list[str] | None = None
    priority_order: int | None = None
    is_active: bool | None = None


class EscalationMatrixResponse(BaseModel):
    """Schema for escalation matrix response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    severity_levels: list[str]
    rules: list[dict]
    form_ids: list[str] | None = None
    team_ids: list[str] | None = None
    priority_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TicketEscalationResponse(BaseModel):
    """Schema for ticket escalation history."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    ticket_id: str
    escalation_matrix_id: str | None = None
    level: str
    triggered_at: datetime
    notified_users: list[str]
    notified_channels: list[str]
    acknowledged_at: datetime | None = None
    acknowledged_by_id: str | None = None


# ==================== Ticket Stats (for tracking dashboard) ====================

class TicketStats(BaseModel):
    """Statistics for tickets."""
    total_tickets: int = 0
    open_tickets: int = 0
    sla_breached: int = 0
    assigned_to_me: int = 0
    unassigned: int = 0
    by_severity: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_status: dict[str, int] = {}
