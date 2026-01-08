"""CRM-related Pydantic schemas."""

from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# TYPE LITERALS
# =============================================================================

CRMObjectType = Literal["company", "person", "deal", "project", "custom"]

CRMAttributeType = Literal[
    "text", "textarea", "number", "currency", "date", "timestamp",
    "checkbox", "select", "multi_select", "status", "email", "phone",
    "url", "location", "person_name", "rating", "record_reference",
    "file", "ai_computed"
]

CRMListViewType = Literal["table", "kanban", "calendar", "timeline", "gallery"]

CRMActivityType = Literal[
    # Communication
    "email.sent", "email.received", "email.opened", "email.clicked", "email.bounced",
    "call.made", "call.received", "call.missed",
    "meeting.scheduled", "meeting.completed", "meeting.cancelled",
    # Record
    "record.created", "record.updated", "record.deleted", "record.viewed",
    "note.added", "task.created", "task.completed", "stage.changed",
    # Engagement
    "page.viewed", "form.submitted", "file.downloaded", "link.clicked",
    # System
    "automation.triggered", "sequence.enrolled", "sequence.completed", "enrichment.completed"
]

CRMAutomationTriggerType = Literal[
    "record.created", "record.updated", "record.deleted", "field.changed",
    "list_entry.added", "list_entry.removed", "status.changed",
    "schedule.daily", "schedule.weekly", "date.approaching", "date.passed",
    "webhook.received", "form.submitted",
    "email.opened", "email.clicked", "email.replied"
]

CRMAutomationActionType = Literal[
    "create_record", "update_record", "delete_record", "link_records",
    "send_email", "send_slack", "send_sms",
    "create_task", "notify_user", "notify_team",
    "enroll_in_sequence", "remove_from_sequence",
    "add_to_list", "remove_from_list",
    "webhook_call", "api_request",
    "enrich_record", "classify_record", "generate_summary"
]

CRMSequenceStepType = Literal["email", "task", "wait", "condition", "action"]

CRMSequenceEnrollmentStatus = Literal["active", "paused", "completed", "exited", "failed"]

FilterOperator = Literal[
    "equals", "not_equals", "contains", "not_contains",
    "starts_with", "ends_with",
    "gt", "gte", "lt", "lte", "between",
    "is_empty", "is_not_empty",
    "in", "not_in"
]

SortDirection = Literal["asc", "desc"]
NullsPosition = Literal["first", "last"]


# =============================================================================
# ATTRIBUTE CONFIGURATION SCHEMAS
# =============================================================================

class SelectOption(BaseModel):
    """Option for select/multi_select/status fields."""
    value: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=20)


class AttributeConfig(BaseModel):
    """Type-specific configuration for attributes."""
    # Text
    max_length: int | None = None
    placeholder: str | None = None
    # Number
    min_value: float | None = None
    max_value: float | None = None
    precision: int | None = None
    format: str | None = None  # "integer", "decimal", "percentage"
    # Currency
    currency_code: str | None = Field(default="USD", max_length=3)
    # Date
    date_format: str | None = None
    allow_past: bool = True
    allow_future: bool = True
    # Select/Multi-select/Status
    options: list[SelectOption] | None = None
    allow_other: bool = False
    max_selections: int | None = None
    # Record Reference
    target_object_id: str | None = None
    allow_multiple: bool = False
    # Rating
    max_rating: int = 5
    rating_icon: str | None = None  # "star", "heart", etc.
    # AI Computed
    prompt: str | None = None
    input_attributes: list[str] | None = None
    model: str | None = None  # "fast", "standard", "advanced"
    refresh_trigger: str | None = None  # "manual", "on_update", "scheduled"
    # File
    allowed_file_types: list[str] | None = None
    max_file_size_mb: int | None = None


# =============================================================================
# CRM OBJECT SCHEMAS
# =============================================================================

class CRMObjectCreate(BaseModel):
    """Schema for creating a CRM object."""
    name: str = Field(..., min_length=1, max_length=255)
    plural_name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    object_type: CRMObjectType = "custom"
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    settings: dict | None = None


class CRMObjectUpdate(BaseModel):
    """Schema for updating a CRM object."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    plural_name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    primary_attribute_id: str | None = None
    settings: dict | None = None
    is_active: bool | None = None


class CRMObjectResponse(BaseModel):
    """Schema for CRM object response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    plural_name: str
    description: str | None = None
    object_type: CRMObjectType
    icon: str | None = None
    color: str | None = None
    primary_attribute_id: str | None = None
    settings: dict
    record_count: int
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CRMObjectWithAttributesResponse(CRMObjectResponse):
    """Schema for CRM object with attributes."""
    attributes: list["CRMAttributeResponse"] = []


# =============================================================================
# CRM ATTRIBUTE SCHEMAS
# =============================================================================

class CRMAttributeCreate(BaseModel):
    """Schema for creating a CRM attribute."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z_][a-z0-9_]*$")
    description: str | None = None
    attribute_type: CRMAttributeType = "text"
    config: AttributeConfig | None = None
    is_required: bool = False
    is_unique: bool = False
    default_value: str | None = None
    position: int | None = None
    is_visible: bool = True
    is_filterable: bool = True
    is_sortable: bool = True
    column_width: int | None = None


class CRMAttributeUpdate(BaseModel):
    """Schema for updating a CRM attribute."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    config: AttributeConfig | None = None
    is_required: bool | None = None
    default_value: str | None = None
    position: int | None = None
    is_visible: bool | None = None
    is_filterable: bool | None = None
    is_sortable: bool | None = None
    column_width: int | None = None


class CRMAttributeResponse(BaseModel):
    """Schema for CRM attribute response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    object_id: str
    name: str
    slug: str
    description: str | None = None
    attribute_type: CRMAttributeType
    config: dict
    is_required: bool
    is_unique: bool
    default_value: str | None = None
    position: int
    is_visible: bool
    is_filterable: bool
    is_sortable: bool
    column_width: int | None = None
    is_system: bool
    created_at: datetime
    updated_at: datetime


class AttributeReorder(BaseModel):
    """Schema for reordering attributes."""
    attribute_ids: list[str] = Field(..., min_length=1)


# =============================================================================
# CRM RECORD SCHEMAS
# =============================================================================

class CRMRecordCreate(BaseModel):
    """Schema for creating a CRM record."""
    values: dict[str, Any] = Field(default_factory=dict)
    owner_id: str | None = None


class CRMRecordUpdate(BaseModel):
    """Schema for updating a CRM record."""
    values: dict[str, Any] | None = None
    owner_id: str | None = None


class CRMRecordResponse(BaseModel):
    """Schema for CRM record response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    object_id: str
    values: dict
    display_name: str | None = None
    owner_id: str | None = None
    created_by_id: str | None = None
    is_archived: bool
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Expanded
    owner_name: str | None = None
    created_by_name: str | None = None


class CRMRecordListResponse(BaseModel):
    """Schema for listing CRM records."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    object_id: str
    values: dict
    display_name: str | None = None
    owner_id: str | None = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class CRMRecordBulkCreate(BaseModel):
    """Schema for bulk creating records."""
    records: list[CRMRecordCreate] = Field(..., min_length=1, max_length=100)


class CRMRecordBulkUpdate(BaseModel):
    """Schema for bulk updating records."""
    record_ids: list[str] = Field(..., min_length=1, max_length=100)
    values: dict[str, Any]


class CRMRecordBulkDelete(BaseModel):
    """Schema for bulk deleting records."""
    record_ids: list[str] = Field(..., min_length=1, max_length=100)
    permanent: bool = False  # If false, archive instead


# =============================================================================
# CRM RECORD RELATION SCHEMAS
# =============================================================================

class CRMRecordRelationCreate(BaseModel):
    """Schema for creating a record relation."""
    target_record_id: str
    relation_type: str | None = None
    metadata: dict | None = None


class CRMRecordRelationResponse(BaseModel):
    """Schema for record relation response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_record_id: str
    target_record_id: str
    relation_type: str | None = None
    metadata: dict
    created_at: datetime
    # Expanded
    target_display_name: str | None = None
    target_object_name: str | None = None


# =============================================================================
# CRM NOTE SCHEMAS
# =============================================================================

class CRMNoteCreate(BaseModel):
    """Schema for creating a note."""
    content: str = Field(..., min_length=1)
    is_pinned: bool = False


class CRMNoteUpdate(BaseModel):
    """Schema for updating a note."""
    content: str | None = Field(default=None, min_length=1)
    is_pinned: bool | None = None


class CRMNoteResponse(BaseModel):
    """Schema for note response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    record_id: str
    content: str
    author_id: str | None = None
    is_pinned: bool
    created_at: datetime
    updated_at: datetime
    # Expanded
    author_name: str | None = None


# =============================================================================
# CRM LIST SCHEMAS
# =============================================================================

class FilterCondition(BaseModel):
    """Filter condition for list views."""
    attribute: str
    operator: FilterOperator
    value: Any = None
    conjunction: Literal["and", "or"] = "and"


class SortCondition(BaseModel):
    """Sort condition for list views."""
    attribute: str
    direction: SortDirection = "asc"
    nulls: NullsPosition = "last"


class KanbanSettings(BaseModel):
    """Kanban-specific settings."""
    show_empty_columns: bool = True
    column_order: list[str] | None = None
    wip_limits: dict[str, int] | None = None


class CRMListCreate(BaseModel):
    """Schema for creating a CRM list."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    view_type: CRMListViewType = "table"
    filters: list[FilterCondition] | None = None
    sorts: list[SortCondition] | None = None
    visible_attributes: list[str] | None = None
    group_by_attribute: str | None = None
    kanban_settings: KanbanSettings | None = None
    date_attribute: str | None = None
    end_date_attribute: str | None = None
    is_private: bool = False


class CRMListUpdate(BaseModel):
    """Schema for updating a CRM list."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    view_type: CRMListViewType | None = None
    filters: list[FilterCondition] | None = None
    sorts: list[SortCondition] | None = None
    visible_attributes: list[str] | None = None
    group_by_attribute: str | None = None
    kanban_settings: KanbanSettings | None = None
    date_attribute: str | None = None
    end_date_attribute: str | None = None
    is_private: bool | None = None


class CRMListResponse(BaseModel):
    """Schema for CRM list response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    object_id: str
    name: str
    slug: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    view_type: CRMListViewType
    filters: list[dict]
    sorts: list[dict]
    visible_attributes: list[str]
    group_by_attribute: str | None = None
    kanban_settings: dict
    date_attribute: str | None = None
    end_date_attribute: str | None = None
    is_private: bool
    owner_id: str | None = None
    entry_count: int
    created_at: datetime
    updated_at: datetime


class CRMListEntryCreate(BaseModel):
    """Schema for adding a record to a list."""
    record_id: str
    position: int | None = None
    list_values: dict | None = None


class CRMListEntryUpdate(BaseModel):
    """Schema for updating a list entry."""
    position: int | None = None
    list_values: dict | None = None


class CRMListEntryResponse(BaseModel):
    """Schema for list entry response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    list_id: str
    record_id: str
    position: int
    list_values: dict
    added_by_id: str | None = None
    created_at: datetime


# =============================================================================
# CRM ACTIVITY SCHEMAS
# =============================================================================

class CRMActivityCreate(BaseModel):
    """Schema for creating an activity."""
    activity_type: CRMActivityType
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    metadata: dict | None = None
    occurred_at: datetime | None = None


class CRMActivityResponse(BaseModel):
    """Schema for activity response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str
    activity_type: CRMActivityType
    actor_type: str
    actor_id: str | None = None
    actor_name: str | None = None
    title: str | None = None
    description: str | None = None
    metadata: dict
    occurred_at: datetime
    created_at: datetime


class CRMActivityFilters(BaseModel):
    """Filters for listing activities."""
    activity_types: list[CRMActivityType] | None = None
    actor_type: str | None = None
    occurred_after: datetime | None = None
    occurred_before: datetime | None = None


# =============================================================================
# CRM AUTOMATION SCHEMAS
# =============================================================================

class AutomationCondition(BaseModel):
    """Condition for automation filtering."""
    attribute: str
    operator: FilterOperator
    value: Any = None
    conjunction: Literal["and", "or"] = "and"


class AutomationAction(BaseModel):
    """Action to perform in automation."""
    type: CRMAutomationActionType
    config: dict = Field(default_factory=dict)
    order: int = 0


class CRMAutomationCreate(BaseModel):
    """Schema for creating an automation."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    object_id: str | None = None
    trigger_type: CRMAutomationTriggerType
    trigger_config: dict = Field(default_factory=dict)
    conditions: list[AutomationCondition] | None = None
    actions: list[AutomationAction] = Field(..., min_length=1)
    error_handling: Literal["stop", "continue", "retry"] = "stop"
    run_limit_per_month: int | None = None
    is_active: bool = True


class CRMAutomationUpdate(BaseModel):
    """Schema for updating an automation."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    trigger_config: dict | None = None
    conditions: list[AutomationCondition] | None = None
    actions: list[AutomationAction] | None = None
    error_handling: Literal["stop", "continue", "retry"] | None = None
    run_limit_per_month: int | None = None
    is_active: bool | None = None


class CRMAutomationResponse(BaseModel):
    """Schema for automation response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    object_id: str | None = None
    trigger_type: CRMAutomationTriggerType
    trigger_config: dict
    conditions: list[dict]
    actions: list[dict]
    error_handling: str
    is_active: bool
    run_limit_per_month: int | None = None
    runs_this_month: int
    total_runs: int
    successful_runs: int
    failed_runs: int
    last_run_at: datetime | None = None
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class CRMAutomationRunResponse(BaseModel):
    """Schema for automation run response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    automation_id: str
    record_id: str | None = None
    trigger_data: dict
    status: str
    steps_executed: list[dict]
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    created_at: datetime


# =============================================================================
# CRM SEQUENCE SCHEMAS
# =============================================================================

class ExitCondition(BaseModel):
    """Exit condition for sequences."""
    type: Literal["reply_received", "meeting_booked", "deal_created", "manual", "custom"]
    config: dict | None = None


class SequenceSettings(BaseModel):
    """Settings for sequence execution."""
    send_window: dict | None = None  # {start: "09:00", end: "17:00"}
    send_days: list[str] | None = None  # ["mon", "tue", ...]
    timezone: str = "UTC"
    skip_holidays: bool = False


class CRMSequenceCreate(BaseModel):
    """Schema for creating a sequence."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    object_id: str
    exit_conditions: list[ExitCondition] | None = None
    settings: SequenceSettings | None = None
    is_active: bool = True


class CRMSequenceUpdate(BaseModel):
    """Schema for updating a sequence."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    exit_conditions: list[ExitCondition] | None = None
    settings: SequenceSettings | None = None
    is_active: bool | None = None


class CRMSequenceResponse(BaseModel):
    """Schema for sequence response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    object_id: str
    exit_conditions: list[dict]
    settings: dict
    is_active: bool
    created_by_id: str | None = None
    total_enrollments: int
    active_enrollments: int
    completed_enrollments: int
    created_at: datetime
    updated_at: datetime


class CRMSequenceStepCreate(BaseModel):
    """Schema for creating a sequence step."""
    step_type: CRMSequenceStepType
    config: dict = Field(default_factory=dict)
    delay_value: int = 0
    delay_unit: Literal["minutes", "hours", "days"] = "days"
    position: int | None = None


class CRMSequenceStepUpdate(BaseModel):
    """Schema for updating a sequence step."""
    config: dict | None = None
    delay_value: int | None = None
    delay_unit: Literal["minutes", "hours", "days"] | None = None
    position: int | None = None


class CRMSequenceStepResponse(BaseModel):
    """Schema for sequence step response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence_id: str
    step_type: CRMSequenceStepType
    position: int
    config: dict
    delay_value: int
    delay_unit: str
    total_executions: int
    successful_executions: int
    created_at: datetime
    updated_at: datetime


class CRMSequenceEnrollmentCreate(BaseModel):
    """Schema for enrolling a record in a sequence."""
    record_id: str


class CRMSequenceEnrollmentResponse(BaseModel):
    """Schema for sequence enrollment response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence_id: str
    record_id: str
    status: CRMSequenceEnrollmentStatus
    current_step_id: str | None = None
    next_step_scheduled_at: datetime | None = None
    exit_reason: str | None = None
    steps_completed: list[dict]
    enrolled_by_id: str | None = None
    enrolled_by_automation_id: str | None = None
    enrolled_at: datetime
    completed_at: datetime | None = None
    exited_at: datetime | None = None


# =============================================================================
# CRM WEBHOOK SCHEMAS
# =============================================================================

class WebhookRetryConfig(BaseModel):
    """Retry configuration for webhooks."""
    max_attempts: int = 3
    backoff_multiplier: float = 2.0


class CRMWebhookCreate(BaseModel):
    """Schema for creating a webhook."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    url: str = Field(..., max_length=2000)
    events: list[str] = Field(..., min_length=1)
    headers: dict | None = None
    retry_config: WebhookRetryConfig | None = None
    is_active: bool = True


class CRMWebhookUpdate(BaseModel):
    """Schema for updating a webhook."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    url: str | None = Field(default=None, max_length=2000)
    events: list[str] | None = None
    headers: dict | None = None
    retry_config: WebhookRetryConfig | None = None
    is_active: bool | None = None


class CRMWebhookResponse(BaseModel):
    """Schema for webhook response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    url: str
    events: list[str]
    headers: dict
    retry_config: dict
    is_active: bool
    total_deliveries: int
    successful_deliveries: int
    failed_deliveries: int
    last_delivery_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CRMWebhookDeliveryResponse(BaseModel):
    """Schema for webhook delivery response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    webhook_id: str
    event_type: str
    payload: dict
    status: str
    response_status_code: int | None = None
    response_body: str | None = None
    error_message: str | None = None
    attempt_number: int
    next_retry_at: datetime | None = None
    duration_ms: int | None = None
    created_at: datetime
    delivered_at: datetime | None = None


# =============================================================================
# PAGINATION & SEARCH SCHEMAS
# =============================================================================

class PaginationParams(BaseModel):
    """Pagination parameters."""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)


class SearchParams(BaseModel):
    """Search parameters."""
    query: str | None = None
    filters: list[FilterCondition] | None = None
    sorts: list[SortCondition] | None = None


class PaginatedResponse(BaseModel):
    """Paginated response wrapper."""
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


# =============================================================================
# STANDARD OBJECT TEMPLATES
# =============================================================================

class CompanyCreate(BaseModel):
    """Convenience schema for creating a company."""
    name: str = Field(..., min_length=1, max_length=255)
    website: str | None = Field(default=None, max_length=500)
    industry: str | None = Field(default=None, max_length=100)
    size: str | None = None  # "1-10", "11-50", etc.
    description: str | None = None
    owner_id: str | None = None


class PersonCreate(BaseModel):
    """Convenience schema for creating a person."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    title: str | None = Field(default=None, max_length=255)
    company_id: str | None = None
    owner_id: str | None = None


class DealCreate(BaseModel):
    """Convenience schema for creating a deal."""
    name: str = Field(..., min_length=1, max_length=255)
    value: float | None = None
    currency: str = "USD"
    stage: str | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    close_date: datetime | None = None
    company_id: str | None = None
    owner_id: str | None = None


# Update forward references
CRMObjectWithAttributesResponse.model_rebuild()
