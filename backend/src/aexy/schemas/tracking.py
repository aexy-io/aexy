"""Tracking-related Pydantic schemas for standups, work logs, time entries, and blockers."""

from datetime import date, datetime, time
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ==================== Enums ====================


class TrackingSource(str, Enum):
    """Source of tracking data."""

    SLACK_COMMAND = "slack_command"
    SLACK_CHANNEL = "slack_channel"
    WEB = "web"
    API = "api"
    INFERRED = "inferred"


class BlockerSeverity(str, Enum):
    """Severity levels for blockers."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class BlockerCategory(str, Enum):
    """Categories for blockers."""

    TECHNICAL = "technical"
    DEPENDENCY = "dependency"
    RESOURCE = "resource"
    EXTERNAL = "external"
    PROCESS = "process"
    OTHER = "other"


class BlockerStatus(str, Enum):
    """Status of a blocker."""

    ACTIVE = "active"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class WorkLogType(str, Enum):
    """Types of work logs."""

    PROGRESS = "progress"
    NOTE = "note"
    QUESTION = "question"
    DECISION = "decision"
    UPDATE = "update"


class ChannelType(str, Enum):
    """Types of monitored Slack channels."""

    STANDUP = "standup"
    TEAM = "team"
    PROJECT = "project"
    GENERAL = "general"


# ==================== Standup Schemas ====================


class StandupCreate(BaseModel):
    """Schema for creating a standup."""

    team_id: str
    sprint_id: str | None = None
    standup_date: date | None = Field(default=None, description="Defaults to today")
    yesterday_summary: str = Field(..., min_length=1, max_length=5000)
    today_plan: str = Field(..., min_length=1, max_length=5000)
    blockers_summary: str | None = Field(default=None, max_length=5000)
    source: TrackingSource = TrackingSource.WEB


class StandupUpdate(BaseModel):
    """Schema for updating a standup."""

    yesterday_summary: str | None = Field(default=None, min_length=1, max_length=5000)
    today_plan: str | None = Field(default=None, min_length=1, max_length=5000)
    blockers_summary: str | None = None


class ParsedTask(BaseModel):
    """A task reference parsed from standup text."""

    task_id: str | None = None
    task_ref: str  # The reference string (e.g., "TASK-123", "#45")
    action: str | None = None  # "completed", "working_on", "blocked_by"
    notes: str | None = None


class ParsedBlocker(BaseModel):
    """A blocker parsed from standup text."""

    description: str
    task_id: str | None = None
    task_ref: str | None = None
    severity: BlockerSeverity = BlockerSeverity.MEDIUM


class ProductivitySignals(BaseModel):
    """Productivity signals from LLM analysis."""

    focus_level: str | None = None  # "high", "medium", "low"
    confidence: float | None = None
    concerns: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)


class StandupResponse(BaseModel):
    """Schema for standup response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    team_id: str
    sprint_id: str | None = None
    workspace_id: str
    standup_date: date
    yesterday_summary: str
    today_plan: str
    blockers_summary: str | None = None
    source: str
    slack_message_ts: str | None = None
    slack_channel_id: str | None = None
    parsed_tasks: list[dict] | None = None
    parsed_blockers: list[dict] | None = None
    sentiment_score: float | None = None
    productivity_signals: dict | None = None
    submitted_at: datetime
    created_at: datetime
    updated_at: datetime

    # Nested developer info (optional)
    developer_name: str | None = None
    developer_avatar: str | None = None


class StandupListResponse(BaseModel):
    """List of standups with pagination."""

    standups: list[StandupResponse]
    total: int
    page: int
    page_size: int


# ==================== Work Log Schemas ====================


class WorkLogCreate(BaseModel):
    """Schema for creating a work log."""

    task_id: str | None = None
    external_task_ref: str | None = None
    sprint_id: str | None = None
    notes: str = Field(..., min_length=1, max_length=10000)
    log_type: WorkLogType = WorkLogType.PROGRESS
    source: TrackingSource = TrackingSource.WEB


class WorkLogUpdate(BaseModel):
    """Schema for updating a work log."""

    notes: str | None = Field(default=None, min_length=1, max_length=10000)
    log_type: WorkLogType | None = None


class WorkLogResponse(BaseModel):
    """Schema for work log response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    task_id: str | None = None
    sprint_id: str | None = None
    workspace_id: str
    notes: str
    log_type: str
    source: str
    slack_message_ts: str | None = None
    slack_channel_id: str | None = None
    external_task_ref: str | None = None
    logged_at: datetime
    created_at: datetime

    # Nested info (optional)
    developer_name: str | None = None
    task_title: str | None = None


class WorkLogListResponse(BaseModel):
    """List of work logs with pagination."""

    logs: list[WorkLogResponse]
    total: int
    page: int
    page_size: int


# ==================== Time Entry Schemas ====================


class TimeEntryCreate(BaseModel):
    """Schema for creating a time entry."""

    task_id: str | None = None
    external_task_ref: str | None = None
    sprint_id: str | None = None
    duration_minutes: int = Field(..., gt=0, le=1440)  # Max 24 hours
    description: str | None = Field(default=None, max_length=1000)
    entry_date: date | None = Field(default=None, description="Defaults to today")
    started_at: datetime | None = None
    ended_at: datetime | None = None
    source: TrackingSource = TrackingSource.WEB


class TimeEntryUpdate(BaseModel):
    """Schema for updating a time entry."""

    duration_minutes: int | None = Field(default=None, gt=0, le=1440)
    description: str | None = None
    entry_date: date | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None


class TimeEntryResponse(BaseModel):
    """Schema for time entry response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    task_id: str | None = None
    sprint_id: str | None = None
    workspace_id: str
    duration_minutes: int
    description: str | None = None
    entry_date: date
    started_at: datetime | None = None
    ended_at: datetime | None = None
    source: str
    slack_message_ts: str | None = None
    is_inferred: bool
    confidence_score: float | None = None
    inference_metadata: dict | None = None
    external_task_ref: str | None = None
    created_at: datetime
    updated_at: datetime

    # Nested info (optional)
    developer_name: str | None = None
    task_title: str | None = None


class TimeEntryListResponse(BaseModel):
    """List of time entries with pagination."""

    entries: list[TimeEntryResponse]
    total: int
    total_minutes: int
    page: int
    page_size: int


class TaskTimeReport(BaseModel):
    """Time report for a single task."""

    task_id: str
    task_title: str | None = None
    total_minutes: int
    entry_count: int
    developers: list[dict]  # [{developer_id, developer_name, minutes}]
    entries: list[TimeEntryResponse]


class DeveloperTimeReport(BaseModel):
    """Time report for a developer."""

    developer_id: str
    developer_name: str | None = None
    period_start: date
    period_end: date
    total_minutes: int
    by_task: list[dict]  # [{task_id, task_title, minutes}]
    by_date: list[dict]  # [{date, minutes}]


class SprintTimeReport(BaseModel):
    """Time report for an entire sprint."""

    sprint_id: str
    sprint_name: str | None = None
    total_minutes: int
    by_developer: list[DeveloperTimeReport]
    by_task: list[TaskTimeReport]


# ==================== Blocker Schemas ====================


class BlockerCreate(BaseModel):
    """Schema for creating a blocker."""

    team_id: str
    task_id: str | None = None
    external_task_ref: str | None = None
    sprint_id: str | None = None
    description: str = Field(..., min_length=1, max_length=5000)
    severity: BlockerSeverity = BlockerSeverity.MEDIUM
    category: BlockerCategory = BlockerCategory.OTHER
    source: TrackingSource = TrackingSource.WEB


class BlockerUpdate(BaseModel):
    """Schema for updating a blocker."""

    description: str | None = Field(default=None, min_length=1, max_length=5000)
    severity: BlockerSeverity | None = None
    category: BlockerCategory | None = None


class BlockerResolution(BaseModel):
    """Schema for resolving a blocker."""

    resolution_notes: str | None = Field(default=None, max_length=5000)


class BlockerEscalation(BaseModel):
    """Schema for escalating a blocker."""

    escalate_to_id: str
    escalation_notes: str | None = Field(default=None, max_length=2000)


class BlockerResponse(BaseModel):
    """Schema for blocker response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    task_id: str | None = None
    sprint_id: str | None = None
    team_id: str
    workspace_id: str
    description: str
    severity: str
    category: str
    status: str
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    resolved_by_id: str | None = None
    source: str
    slack_message_ts: str | None = None
    slack_channel_id: str | None = None
    standup_id: str | None = None
    escalated_to_id: str | None = None
    escalated_at: datetime | None = None
    escalation_notes: str | None = None
    external_task_ref: str | None = None
    reported_at: datetime
    created_at: datetime
    updated_at: datetime

    # Nested info (optional)
    developer_name: str | None = None
    resolved_by_name: str | None = None
    escalated_to_name: str | None = None
    task_title: str | None = None


class BlockerListResponse(BaseModel):
    """List of blockers with pagination."""

    blockers: list[BlockerResponse]
    total: int
    active_count: int
    resolved_count: int
    escalated_count: int
    page: int
    page_size: int


# ==================== Channel Config Schemas ====================


class SlackChannelConfigCreate(BaseModel):
    """Schema for creating a Slack channel config."""

    integration_id: str
    team_id: str
    channel_id: str
    channel_name: str
    channel_type: ChannelType = ChannelType.TEAM
    auto_parse_standups: bool = True
    auto_parse_task_refs: bool = True
    auto_parse_blockers: bool = True
    standup_prompt_time: time | None = None
    standup_format_hint: str | None = None


class SlackChannelConfigUpdate(BaseModel):
    """Schema for updating a Slack channel config."""

    channel_name: str | None = None
    channel_type: ChannelType | None = None
    auto_parse_standups: bool | None = None
    auto_parse_task_refs: bool | None = None
    auto_parse_blockers: bool | None = None
    standup_prompt_time: time | None = None
    standup_format_hint: str | None = None
    is_active: bool | None = None


class SlackChannelConfigResponse(BaseModel):
    """Schema for Slack channel config response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    integration_id: str
    team_id: str
    workspace_id: str
    channel_id: str
    channel_name: str
    channel_type: str
    auto_parse_standups: bool
    auto_parse_task_refs: bool
    auto_parse_blockers: bool
    standup_prompt_time: time | None = None
    standup_format_hint: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ==================== Activity Pattern Schemas ====================


class DeveloperActivityPatternResponse(BaseModel):
    """Schema for developer activity pattern response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    sprint_id: str | None = None
    workspace_id: str
    avg_standup_time: time | None = None
    standup_consistency_score: float
    standup_streak_days: int
    avg_work_logs_per_day: float
    avg_time_logged_per_day: int
    blocker_frequency: float
    avg_blocker_resolution_hours: float | None = None
    most_active_hours: list[int] | None = None
    most_active_days: list[str] | None = None
    avg_messages_per_day: float
    response_time_avg_minutes: float | None = None
    period_start: date
    period_end: date
    created_at: datetime
    updated_at: datetime


class TeamActivityPatterns(BaseModel):
    """Aggregated activity patterns for a team."""

    team_id: str
    team_name: str | None = None
    avg_standup_participation: float  # 0-1
    avg_standup_time: time | None = None
    total_time_logged_this_sprint: int  # minutes
    active_blockers_count: int
    avg_blocker_resolution_hours: float | None = None
    most_active_hours: list[int] | None = None
    patterns_by_developer: list[DeveloperActivityPatternResponse]


# ==================== Standup Summary Schemas ====================


class StandupSummaryResponse(BaseModel):
    """Schema for standup summary response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sprint_id: str | None = None
    team_id: str
    workspace_id: str
    summary_date: date
    total_team_members: int
    standups_submitted: int
    participation_rate: float
    combined_yesterday: str | None = None
    combined_today: str | None = None
    combined_blockers: str | None = None
    tasks_mentioned: list[dict] | None = None
    active_blockers_count: int
    new_blockers_count: int
    avg_sentiment_score: float | None = None
    team_mood: str | None = None
    created_at: datetime


class SprintStandupSummary(BaseModel):
    """Aggregated standup summary for a sprint."""

    sprint_id: str
    sprint_name: str | None = None
    total_standups: int
    avg_participation_rate: float
    daily_summaries: list[StandupSummaryResponse]
    total_blockers_reported: int
    total_blockers_resolved: int


# ==================== Dashboard Schemas ====================


class TodayStandupStatus(BaseModel):
    """Status of today's standup."""

    submitted: bool
    standup_id: str | None = None
    submitted_at: datetime | None = None


class ActiveTaskSummary(BaseModel):
    """Summary of a task the developer is working on."""

    task_id: str
    task_title: str
    status: str
    time_logged_today: int  # minutes
    total_time_logged: int  # minutes
    last_activity: datetime | None = None


class WeeklySummary(BaseModel):
    """Weekly activity summary."""

    standups_submitted: int
    standups_expected: int
    total_time_logged: int  # minutes
    work_logs_count: int
    blockers_reported: int
    blockers_resolved: int


class IndividualDashboard(BaseModel):
    """Individual developer tracking dashboard."""

    developer_id: str
    developer_name: str | None = None
    today_standup: TodayStandupStatus
    active_tasks: list[ActiveTaskSummary]
    active_blockers: list[BlockerResponse]
    time_logged_today: int  # minutes
    weekly_summary: WeeklySummary
    activity_pattern: DeveloperActivityPatternResponse | None = None
    standup_streak: int = 0
    has_standup_today: bool = False
    time_entries: list[TimeEntryResponse] = []
    resolved_blockers_count: int = 0
    recent_standups: list[StandupResponse] = []
    work_logs: list[WorkLogResponse] = []


class TeamMemberStandupStatus(BaseModel):
    """Standup status for a team member."""

    developer_id: str
    developer_name: str
    developer_avatar: str | None = None
    submitted: bool
    submitted_at: datetime | None = None


class TeamDashboard(BaseModel):
    """Team tracking dashboard."""

    team_id: str
    team_name: str | None = None
    today_date: date
    standup_completion: list[TeamMemberStandupStatus]
    participation_rate: float  # 0-1
    active_blockers: list[BlockerResponse]
    blockers_by_severity: dict[str, int]  # {severity: count}
    sprint_progress: dict | None = None  # If sprint is active
    total_time_logged_today: int  # minutes
    recent_work_logs: list[WorkLogResponse]


# ==================== Slack Command Schemas ====================


class SlackStandupInput(BaseModel):
    """Parsed standup input from Slack command."""

    yesterday: str
    today: str
    blockers: str | None = None


class SlackTaskUpdateInput(BaseModel):
    """Parsed task update from Slack command."""

    task_ref: str
    status: str | None = None
    notes: str | None = None


class SlackBlockerInput(BaseModel):
    """Parsed blocker from Slack command."""

    description: str
    task_ref: str | None = None
    severity: BlockerSeverity = BlockerSeverity.MEDIUM


class SlackTimeLogInput(BaseModel):
    """Parsed time log from Slack command."""

    task_ref: str
    duration_str: str  # "2h", "30m", "1h30m"
    duration_minutes: int
    description: str | None = None


class SlackWorkLogInput(BaseModel):
    """Parsed work log from Slack command."""

    task_ref: str
    notes: str


# ==================== Message Parsing Schemas ====================


class TaskReference(BaseModel):
    """A task reference found in a message."""

    ref_type: str  # "github_issue", "jira", "linear", "internal", "generic"
    ref_string: str  # The original reference string
    task_id: str | None = None  # Resolved task ID if found
    project_key: str | None = None  # For Jira/Linear
    issue_number: int | None = None  # For GitHub issues


class ParsedMessage(BaseModel):
    """Result of parsing a Slack message."""

    is_standup: bool = False
    standup_content: SlackStandupInput | None = None
    task_references: list[TaskReference] = Field(default_factory=list)
    blocker_mentions: list[ParsedBlocker] = Field(default_factory=list)
    sentiment: str | None = None  # "positive", "neutral", "negative"
    classification: str | None = None  # "standup", "update", "question", "general"
    confidence: float | None = None


class MessageClassification(BaseModel):
    """LLM classification result for a message."""

    message_type: str  # "standup", "update", "blocker", "question", "general"
    confidence: float
    extracted_data: dict | None = None
    should_create_standup: bool = False
    should_create_blocker: bool = False
    should_log_work: bool = False
