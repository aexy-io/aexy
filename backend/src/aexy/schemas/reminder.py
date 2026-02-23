"""Recurring reminders Pydantic schemas."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# Enums (for schema validation)
# =============================================================================

class ReminderStatusEnum(str, Enum):
    """Status of a reminder definition."""
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class ReminderPriorityEnum(str, Enum):
    """Priority level of a reminder."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReminderFrequencyEnum(str, Enum):
    """Frequency of reminder occurrences."""
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"
    SEMI_ANNUAL = "semi_annual"


class InstanceStatusEnum(str, Enum):
    """Status of a reminder instance."""
    PENDING = "pending"
    NOTIFIED = "notified"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    ESCALATED = "escalated"
    OVERDUE = "overdue"


class EscalationLevelEnum(str, Enum):
    """Escalation levels for overdue reminders."""
    L1 = "l1"
    L2 = "l2"
    L3 = "l3"
    L4 = "l4"


class AssignmentStrategyEnum(str, Enum):
    """How owners are assigned to reminder instances."""
    FIXED = "fixed"
    ROUND_ROBIN = "round_robin"
    ON_CALL = "on_call"
    DOMAIN_MAPPING = "domain_mapping"
    CUSTOM_RULE = "custom_rule"


class ReminderCategoryEnum(str, Enum):
    """Category of reminder for grouping and filtering."""
    COMPLIANCE = "compliance"
    SECURITY = "security"
    AUDIT = "audit"
    OPERATIONAL = "operational"
    TRAINING = "training"
    REVIEW = "review"
    CUSTOM = "custom"


class SuggestionStatusEnum(str, Enum):
    """Status of a reminder suggestion."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


# =============================================================================
# Embedded/Nested Schemas
# =============================================================================

class DeveloperBrief(BaseModel):
    """Brief developer info for responses."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class TeamBrief(BaseModel):
    """Brief team info for responses."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class EscalationLevelConfig(BaseModel):
    """Configuration for a single escalation level."""
    level: EscalationLevelEnum
    delay_hours: int = Field(ge=1, le=720)  # 1 hour to 30 days
    notify_owner_id: str | None = None
    notify_team_id: str | None = None
    slack_channel: str | None = None


class EscalationConfig(BaseModel):
    """Escalation configuration for a reminder."""
    enabled: bool = False
    levels: list[EscalationLevelConfig] = Field(default_factory=list)


class NotificationConfig(BaseModel):
    """Notification configuration for a reminder."""
    channels: list[Literal["in_app", "email", "slack"]] = Field(
        default_factory=lambda: ["in_app", "email"]
    )
    notify_before_hours: list[int] = Field(
        default_factory=lambda: [24, 1]
    )  # Hours before due date
    slack_channel: str | None = None


class EvidenceLink(BaseModel):
    """Evidence link for completed reminders."""
    url: str
    title: str
    uploaded_at: datetime
    uploaded_by: str


class RuleCondition(BaseModel):
    """A single condition in an assignment rule."""
    field: Literal["category", "domain", "priority", "tags"]
    operator: Literal["equals", "contains", "in", "not_equals"]
    value: str | list[str]


class AssignmentTarget(BaseModel):
    """Target for rule-based assignment."""
    type: Literal["developer", "team"]
    id: str


class AssignmentRuleConfig(BaseModel):
    """Configuration for an assignment rule."""
    conditions: list[RuleCondition] = Field(default_factory=list, min_length=1)
    assign_to: AssignmentTarget


# =============================================================================
# Assignment Rule Schemas
# =============================================================================

class AssignmentRuleCreate(BaseModel):
    """Schema for creating an assignment rule."""
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    rule_config: AssignmentRuleConfig
    priority: int = Field(default=0, ge=0, le=1000)
    is_active: bool = True


class AssignmentRuleUpdate(BaseModel):
    """Schema for updating an assignment rule."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    rule_config: AssignmentRuleConfig | None = None
    priority: int | None = Field(default=None, ge=0, le=1000)
    is_active: bool | None = None


class AssignmentRuleResponse(BaseModel):
    """Schema for assignment rule response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    rule_config: dict
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Reminder CRUD Schemas
# =============================================================================

class ReminderCreate(BaseModel):
    """Schema for creating a reminder."""
    title: str = Field(max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    category: ReminderCategoryEnum = ReminderCategoryEnum.CUSTOM
    priority: ReminderPriorityEnum = ReminderPriorityEnum.MEDIUM

    # Schedule
    frequency: ReminderFrequencyEnum = ReminderFrequencyEnum.MONTHLY
    cron_expression: str | None = Field(
        default=None,
        max_length=100,
        description="Required when frequency is 'custom'"
    )
    timezone: str = Field(default="UTC", max_length=100)
    start_date: datetime
    end_date: datetime | None = None

    # Assignment
    assignment_strategy: AssignmentStrategyEnum = AssignmentStrategyEnum.FIXED
    default_owner_id: str | None = None
    default_team_id: str | None = None
    domain: str | None = Field(default=None, max_length=255)

    # Configuration
    escalation_config: EscalationConfig = Field(default_factory=EscalationConfig)
    notification_config: NotificationConfig = Field(default_factory=NotificationConfig)
    requires_acknowledgment: bool = True
    requires_evidence: bool = False

    # Source tracking
    source_type: str | None = Field(default=None, max_length=100)
    source_id: str | None = None
    source_question_id: str | None = None

    # Extra data (tags, custom fields)
    extra_data: dict = Field(default_factory=dict)


class ReminderUpdate(BaseModel):
    """Schema for updating a reminder."""
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    category: ReminderCategoryEnum | None = None
    priority: ReminderPriorityEnum | None = None
    status: ReminderStatusEnum | None = None

    # Schedule
    frequency: ReminderFrequencyEnum | None = None
    cron_expression: str | None = None
    timezone: str | None = Field(default=None, max_length=100)
    start_date: datetime | None = None
    end_date: datetime | None = None

    # Assignment
    assignment_strategy: AssignmentStrategyEnum | None = None
    default_owner_id: str | None = None
    default_team_id: str | None = None
    domain: str | None = None

    # Configuration
    escalation_config: EscalationConfig | None = None
    notification_config: NotificationConfig | None = None
    requires_acknowledgment: bool | None = None
    requires_evidence: bool | None = None

    # Extra data
    extra_data: dict | None = None


class ReminderResponse(BaseModel):
    """Schema for reminder response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: str
    description: str | None
    category: str
    priority: str
    status: str

    # Schedule
    frequency: str
    cron_expression: str | None
    timezone: str
    start_date: datetime
    end_date: datetime | None
    next_occurrence: datetime | None

    # Assignment
    assignment_strategy: str
    default_owner_id: str | None
    default_owner: DeveloperBrief | None = None
    default_team_id: str | None
    default_team: TeamBrief | None = None
    domain: str | None

    # Configuration
    escalation_config: dict
    notification_config: dict
    requires_acknowledgment: bool
    requires_evidence: bool

    # Source tracking
    source_type: str | None
    source_id: str | None
    source_question_id: str | None

    # Extra data
    extra_data: dict

    # Audit
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime

    # Optional: instance counts (populated by service)
    pending_instances: int | None = None
    overdue_instances: int | None = None


class ReminderListResponse(BaseModel):
    """Schema for paginated reminder list."""
    reminders: list[ReminderResponse]
    total: int
    page: int
    page_size: int


class ReminderFilters(BaseModel):
    """Schema for filtering reminders."""
    status: list[ReminderStatusEnum] | None = None
    category: list[ReminderCategoryEnum] | None = None
    priority: list[ReminderPriorityEnum] | None = None
    assignment_strategy: list[AssignmentStrategyEnum] | None = None
    domain: str | None = None
    owner_id: str | None = None
    team_id: str | None = None
    search: str | None = Field(default=None, max_length=200)


# =============================================================================
# Reminder Instance Schemas
# =============================================================================

class InstanceAcknowledge(BaseModel):
    """Schema for acknowledging an instance."""
    notes: str | None = Field(default=None, max_length=2000)


class InstanceComplete(BaseModel):
    """Schema for completing an instance."""
    notes: str | None = Field(default=None, max_length=2000)
    evidence_links: list[EvidenceLink] | None = None


class InstanceSkip(BaseModel):
    """Schema for skipping an instance."""
    reason: str = Field(max_length=2000)


class InstanceReassign(BaseModel):
    """Schema for reassigning an instance."""
    new_owner_id: str | None = None
    new_team_id: str | None = None


class ReminderInstanceResponse(BaseModel):
    """Schema for reminder instance response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    reminder_id: str
    due_date: datetime
    status: str
    current_escalation_level: str | None

    # Assignment
    assigned_owner_id: str | None
    assigned_owner: DeveloperBrief | None = None
    assigned_team_id: str | None
    assigned_team: TeamBrief | None = None

    # Notification tracking
    initial_notified_at: datetime | None
    last_notified_at: datetime | None
    notification_count: int

    # Acknowledgment
    acknowledged_at: datetime | None
    acknowledged_by_id: str | None
    acknowledged_by: DeveloperBrief | None = None
    acknowledgment_notes: str | None

    # Completion
    completed_at: datetime | None
    completed_by_id: str | None
    completed_by: DeveloperBrief | None = None
    completion_notes: str | None

    # Skip
    skipped_at: datetime | None
    skipped_by_id: str | None
    skipped_by: DeveloperBrief | None = None
    skip_reason: str | None

    # Evidence
    evidence_links: list[dict]

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Optional: parent reminder info
    reminder: "ReminderBrief | None" = None


class ReminderBrief(BaseModel):
    """Brief reminder info for instance responses."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    category: str
    priority: str


class InstanceListResponse(BaseModel):
    """Schema for paginated instance list."""
    instances: list[ReminderInstanceResponse]
    total: int
    page: int
    page_size: int


class InstanceFilters(BaseModel):
    """Schema for filtering instances."""
    status: list[InstanceStatusEnum] | None = None
    assigned_owner_id: str | None = None
    assigned_team_id: str | None = None
    due_before: datetime | None = None
    due_after: datetime | None = None


# =============================================================================
# Escalation Schemas
# =============================================================================

class ReminderEscalationResponse(BaseModel):
    """Schema for escalation response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    instance_id: str
    level: str
    escalated_to_id: str | None
    escalated_to: DeveloperBrief | None = None
    escalated_to_team_id: str | None
    escalated_to_team: TeamBrief | None = None
    notified_at: datetime
    notification_channels: dict
    responded_at: datetime | None
    response_notes: str | None
    created_at: datetime


# =============================================================================
# Control Owner Schemas
# =============================================================================

class ControlOwnerCreate(BaseModel):
    """Schema for creating a control owner mapping."""
    control_id: str | None = Field(default=None, max_length=255)
    control_name: str = Field(max_length=500)
    domain: str = Field(max_length=255)
    primary_owner_id: str | None = None
    backup_owner_id: str | None = None
    team_id: str | None = None


class ControlOwnerUpdate(BaseModel):
    """Schema for updating a control owner mapping."""
    control_id: str | None = None
    control_name: str | None = Field(default=None, max_length=500)
    domain: str | None = Field(default=None, max_length=255)
    primary_owner_id: str | None = None
    backup_owner_id: str | None = None
    team_id: str | None = None


class ControlOwnerResponse(BaseModel):
    """Schema for control owner response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    control_id: str | None
    control_name: str
    domain: str
    primary_owner_id: str | None
    primary_owner: DeveloperBrief | None = None
    backup_owner_id: str | None
    backup_owner: DeveloperBrief | None = None
    team_id: str | None
    team: TeamBrief | None = None
    created_at: datetime
    updated_at: datetime


class ControlOwnerListResponse(BaseModel):
    """Schema for paginated control owner list."""
    control_owners: list[ControlOwnerResponse]
    total: int


# =============================================================================
# Domain Team Mapping Schemas
# =============================================================================

class DomainTeamMappingCreate(BaseModel):
    """Schema for creating a domain team mapping."""
    domain: str = Field(max_length=255)
    team_id: str
    priority: int = Field(default=0, ge=0, le=1000)


class DomainTeamMappingUpdate(BaseModel):
    """Schema for updating a domain team mapping."""
    domain: str | None = Field(default=None, max_length=255)
    team_id: str | None = None
    priority: int | None = Field(default=None, ge=0, le=1000)


class DomainTeamMappingResponse(BaseModel):
    """Schema for domain team mapping response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    domain: str
    team_id: str
    team: TeamBrief | None = None
    priority: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Suggestion Schemas
# =============================================================================

class ReminderSuggestionResponse(BaseModel):
    """Schema for reminder suggestion response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    questionnaire_response_id: str | None
    question_id: str | None
    answer_text: str | None
    suggested_title: str
    suggested_description: str | None
    suggested_category: str
    suggested_frequency: str
    suggested_domain: str | None
    confidence_score: float
    status: str
    created_reminder_id: str | None
    reviewed_at: datetime | None
    reviewed_by_id: str | None
    reviewed_by: DeveloperBrief | None = None
    rejection_reason: str | None
    created_at: datetime


class SuggestionAccept(BaseModel):
    """Schema for accepting a suggestion with optional overrides."""
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    category: ReminderCategoryEnum | None = None
    frequency: ReminderFrequencyEnum | None = None
    priority: ReminderPriorityEnum = ReminderPriorityEnum.MEDIUM
    start_date: datetime | None = None
    default_owner_id: str | None = None
    default_team_id: str | None = None


class SuggestionReject(BaseModel):
    """Schema for rejecting a suggestion."""
    reason: str | None = Field(default=None, max_length=1000)


class SuggestionListResponse(BaseModel):
    """Schema for paginated suggestion list."""
    suggestions: list[ReminderSuggestionResponse]
    total: int


# =============================================================================
# Dashboard Schemas
# =============================================================================

class CategoryStats(BaseModel):
    """Stats for a single category."""
    category: str
    total: int
    pending: int
    completed: int
    overdue: int


class ReminderDashboardStats(BaseModel):
    """Schema for reminder dashboard statistics."""
    total_reminders: int
    active_reminders: int
    paused_reminders: int
    archived_reminders: int

    # Instance stats
    total_pending_instances: int
    total_overdue_instances: int
    completed_this_week: int
    completed_this_month: int

    # By category
    by_category: list[CategoryStats]

    # By priority
    critical_overdue: int
    high_overdue: int


class MyRemindersResponse(BaseModel):
    """Schema for my reminders response."""
    assigned_to_me: list[ReminderInstanceResponse]
    my_team_reminders: list[ReminderInstanceResponse]
    overdue: list[ReminderInstanceResponse]
    due_today: list[ReminderInstanceResponse]
    due_this_week: list[ReminderInstanceResponse]


# =============================================================================
# Calendar View Schemas
# =============================================================================

class CalendarEvent(BaseModel):
    """Schema for a calendar event."""
    id: str
    reminder_id: str
    title: str
    category: str
    priority: str
    due_date: datetime
    status: str
    assigned_owner: DeveloperBrief | None = None
    assigned_team: TeamBrief | None = None


class ReminderCalendarResponse(BaseModel):
    """Schema for calendar view response."""
    events: list[CalendarEvent]
    start_date: datetime
    end_date: datetime


# =============================================================================
# Bulk Operation Schemas
# =============================================================================

class BulkAssign(BaseModel):
    """Schema for bulk assigning reminders."""
    instance_ids: list[str] = Field(min_length=1, max_length=100)
    owner_id: str | None = None
    team_id: str | None = None


class BulkComplete(BaseModel):
    """Schema for bulk completing reminders."""
    instance_ids: list[str] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=2000)


class BulkOperationResult(BaseModel):
    """Schema for bulk operation result."""
    success_count: int
    failed_count: int
    failed_ids: list[str]
    errors: dict[str, str]  # id -> error message


# Update forward references
ReminderInstanceResponse.model_rebuild()
