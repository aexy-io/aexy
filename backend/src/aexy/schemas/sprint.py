"""Sprint-related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Sprint Status Types
SprintStatus = Literal["planning", "active", "review", "retrospective", "completed"]
TaskStatus = Literal["backlog", "todo", "in_progress", "review", "done"]
TaskPriority = Literal["critical", "high", "medium", "low"]
TaskSourceType = Literal["github_issue", "jira", "linear", "manual", "ticket"]
StatusCategory = Literal["todo", "in_progress", "done"]
CustomFieldType = Literal["text", "number", "select", "multiselect", "date", "url"]


# ==================== Custom Task Status Schemas ====================

class TaskStatusCreate(BaseModel):
    """Schema for creating a custom task status."""

    name: str = Field(..., min_length=1, max_length=100)
    category: StatusCategory = "todo"
    color: str = Field(default="#6B7280", max_length=20)
    icon: str | None = Field(default=None, max_length=50)
    is_default: bool = False


class TaskStatusUpdate(BaseModel):
    """Schema for updating a custom task status."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: StatusCategory | None = None
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=50)
    is_default: bool | None = None


class TaskStatusResponse(BaseModel):
    """Schema for custom task status response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    category: StatusCategory
    color: str
    icon: str | None = None
    position: int
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaskStatusReorder(BaseModel):
    """Schema for reordering statuses."""

    status_ids: list[str] = Field(..., min_length=1)


# ==================== Custom Field Schemas ====================

class CustomFieldOptionCreate(BaseModel):
    """Schema for custom field option (select/multiselect)."""

    value: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=20)


class CustomFieldCreate(BaseModel):
    """Schema for creating a custom field."""

    name: str = Field(..., min_length=1, max_length=100)
    field_type: CustomFieldType
    options: list[CustomFieldOptionCreate] | None = None  # For select/multiselect
    is_required: bool = False
    default_value: str | None = Field(default=None, max_length=500)


class CustomFieldUpdate(BaseModel):
    """Schema for updating a custom field."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    options: list[CustomFieldOptionCreate] | None = None
    is_required: bool | None = None
    default_value: str | None = Field(default=None, max_length=500)


class CustomFieldResponse(BaseModel):
    """Schema for custom field response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    field_type: CustomFieldType
    options: list[dict] | None = None
    is_required: bool
    default_value: str | None = None
    position: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomFieldReorder(BaseModel):
    """Schema for reordering custom fields."""

    field_ids: list[str] = Field(..., min_length=1)


# Sprint Schemas
class SprintCreate(BaseModel):
    """Schema for creating a sprint."""

    name: str = Field(..., min_length=1, max_length=255)
    goal: str | None = None
    start_date: datetime
    end_date: datetime
    capacity_hours: int | None = None
    velocity_commitment: int | None = None
    settings: dict | None = None


class SprintUpdate(BaseModel):
    """Schema for updating a sprint."""

    name: str | None = None
    goal: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    capacity_hours: int | None = None
    velocity_commitment: int | None = None
    settings: dict | None = None


class SprintResponse(BaseModel):
    """Schema for sprint response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    workspace_id: str
    name: str
    goal: str | None = None
    status: SprintStatus
    start_date: datetime
    end_date: datetime
    capacity_hours: int | None = None
    velocity_commitment: int | None = None
    settings: dict = Field(default_factory=dict)
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime

    # Computed fields
    tasks_count: int = 0
    completed_count: int = 0
    total_points: int = 0
    completed_points: int = 0


class SprintListResponse(BaseModel):
    """Schema for sprint list item."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    name: str
    goal: str | None = None
    status: SprintStatus
    start_date: datetime
    end_date: datetime
    tasks_count: int = 0
    completed_count: int = 0
    total_points: int = 0
    completed_points: int = 0


# Sprint Task Schemas
class SprintTaskCreate(BaseModel):
    """Schema for creating a sprint task."""

    title: str = Field(..., min_length=1, max_length=500)
    source_type: TaskSourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None
    description: str | None = None
    description_json: dict | None = None  # TipTap JSON for rich text
    story_points: int | None = Field(None, ge=0)
    priority: TaskPriority = "medium"
    labels: list[str] = Field(default_factory=list)
    assignee_id: str | None = None
    status: TaskStatus = "backlog"
    epic_id: str | None = None
    parent_task_id: str | None = None
    mentioned_user_ids: list[str] = Field(default_factory=list)  # @mentions
    mentioned_file_paths: list[str] = Field(default_factory=list)  # #mentions


class ProjectTaskCreate(BaseModel):
    """Schema for creating a project-level task (without sprint)."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    description_json: dict | None = None  # TipTap JSON for rich text
    story_points: int | None = Field(None, ge=0)
    priority: TaskPriority = "medium"
    labels: list[str] = Field(default_factory=list)
    assignee_id: str | None = None
    status: TaskStatus = "backlog"
    epic_id: str | None = None
    sprint_id: str | None = None  # Optional - can assign to sprint later
    mentioned_user_ids: list[str] = Field(default_factory=list)  # @mentions
    mentioned_file_paths: list[str] = Field(default_factory=list)  # #mentions


class SprintTaskUpdate(BaseModel):
    """Schema for updating a sprint task."""

    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    description_json: dict | None = None  # TipTap JSON for rich text
    story_points: int | None = Field(None, ge=0)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    labels: list[str] | None = None
    epic_id: str | None = None
    sprint_id: str | None = None  # For moving tasks between sprints
    mentioned_user_ids: list[str] | None = None  # @mentions
    mentioned_file_paths: list[str] | None = None  # #mentions


class SprintTaskStatusUpdate(BaseModel):
    """Schema for updating task status."""

    status: TaskStatus


class SprintTaskAssign(BaseModel):
    """Schema for assigning a task."""

    developer_id: str
    reason: str | None = None
    confidence: float | None = Field(None, ge=0, le=1)


class SprintTaskBulkAssign(BaseModel):
    """Schema for bulk task assignment."""

    assignments: list[dict] = Field(
        ...,
        description="List of {task_id, developer_id, reason?, confidence?}",
    )


class SprintTaskBulkStatusUpdate(BaseModel):
    """Schema for bulk task status update."""

    task_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of task IDs to update",
    )
    status: TaskStatus = Field(..., description="New status for all tasks")


class SprintTaskBulkMove(BaseModel):
    """Schema for bulk moving tasks to another sprint."""

    task_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of task IDs to move",
    )
    target_sprint_id: str = Field(..., description="Target sprint ID")


class SprintTaskReorder(BaseModel):
    """Schema for reordering tasks (drag-and-drop)."""

    task_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=200,
        description="List of task IDs in the desired order",
    )


class SprintTaskResponse(BaseModel):
    """Schema for sprint task response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sprint_id: str | None = None  # Can be null for project-level tasks
    team_id: str | None = None  # Set for project-level tasks
    workspace_id: str | None = None
    source_type: TaskSourceType
    source_id: str
    source_url: str | None = None
    title: str
    description: str | None = None
    description_json: dict | None = None  # TipTap JSON for rich text
    story_points: int | None = None
    priority: TaskPriority
    labels: list[str] = Field(default_factory=list)
    assignee_id: str | None = None
    assignee_name: str | None = None
    assignee_avatar_url: str | None = None
    assignment_reason: str | None = None
    assignment_confidence: float | None = None
    status: TaskStatus
    status_id: str | None = None  # Custom status reference
    custom_fields: dict = Field(default_factory=dict)  # Custom field values
    epic_id: str | None = None
    parent_task_id: str | None = None
    subtasks_count: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    carried_over_from_sprint_id: str | None = None
    mentioned_user_ids: list[str] = Field(default_factory=list)
    mentioned_file_paths: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SubtaskResponse(BaseModel):
    """Schema for subtask summary in parent task."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: TaskStatus
    assignee_id: str | None = None
    assignee_name: str | None = None


# Import Schemas
class GitHubImportRequest(BaseModel):
    """Schema for importing GitHub issues."""

    owner: str
    repo: str
    api_token: str | None = None
    labels: list[str] | None = None
    limit: int = Field(default=50, ge=1, le=100)


class JiraImportRequest(BaseModel):
    """Schema for importing Jira issues."""

    api_url: str
    api_key: str
    project_key: str
    jql_filter: str | None = None
    limit: int = Field(default=50, ge=1, le=100)


class LinearImportRequest(BaseModel):
    """Schema for importing Linear issues."""

    api_key: str
    team_id: str | None = None
    labels: list[str] | None = None
    limit: int = Field(default=50, ge=1, le=100)


class TaskImportRequest(BaseModel):
    """Unified import request schema."""

    source: TaskSourceType
    github: GitHubImportRequest | None = None
    jira: JiraImportRequest | None = None
    linear: LinearImportRequest | None = None


class TaskImportResponse(BaseModel):
    """Schema for import response."""

    imported_count: int
    tasks: list[SprintTaskResponse]


# Sprint Stats
class SprintStatsResponse(BaseModel):
    """Schema for sprint statistics."""

    total_tasks: int = 0
    completed_tasks: int = 0
    in_progress_tasks: int = 0
    todo_tasks: int = 0
    total_points: int = 0
    completed_points: int = 0
    remaining_points: int = 0
    completion_percentage: float = 0.0


# Sprint Metrics / Burndown
class SprintMetricsResponse(BaseModel):
    """Schema for sprint metrics."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sprint_id: str
    snapshot_date: date
    total_points: int
    completed_points: int
    remaining_points: int
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    blocked_tasks: int
    ideal_burndown: float
    actual_burndown: float


class BurndownDataResponse(BaseModel):
    """Schema for burndown chart data."""

    dates: list[str]
    ideal: list[float]
    actual: list[float]
    scope_changes: list[dict] = Field(default_factory=list)


# Velocity
class VelocityDataPoint(BaseModel):
    """Schema for a single velocity data point."""

    sprint_id: str
    sprint_name: str
    committed: int
    completed: int
    carry_over: int
    completion_rate: float


class VelocityTrendResponse(BaseModel):
    """Schema for velocity trend data."""

    sprints: list[VelocityDataPoint]
    average_velocity: float
    trend: Literal["improving", "stable", "declining"]


# Retrospective Schemas
class RetroItem(BaseModel):
    """Schema for a retrospective item."""

    id: str | None = None
    content: str
    author_id: str | None = None
    votes: int = 0


class RetroActionItem(BaseModel):
    """Schema for a retrospective action item."""

    id: str | None = None
    item: str
    assignee_id: str | None = None
    status: Literal["pending", "in_progress", "done"] = "pending"
    due_date: datetime | None = None


class SprintRetrospectiveCreate(BaseModel):
    """Schema for creating/updating retrospective."""

    went_well: list[RetroItem] = Field(default_factory=list)
    to_improve: list[RetroItem] = Field(default_factory=list)
    action_items: list[RetroActionItem] = Field(default_factory=list)
    team_mood_score: float | None = Field(None, ge=1, le=5)
    notes: str | None = None


class SprintRetrospectiveResponse(BaseModel):
    """Schema for retrospective response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sprint_id: str
    went_well: list[dict]
    to_improve: list[dict]
    action_items: list[dict]
    team_mood_score: float | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# Planning Session
class SprintPlanningSessionResponse(BaseModel):
    """Schema for planning session response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sprint_id: str
    status: Literal["active", "paused", "completed"]
    started_at: datetime
    ended_at: datetime | None = None
    participants: list[dict]
    decisions_log: list[dict]


# Carry Over
class CarryOverRequest(BaseModel):
    """Schema for carrying over tasks."""

    task_ids: list[str]


class CarryOverResponse(BaseModel):
    """Schema for carry over response."""

    carried_count: int
    tasks: list[SprintTaskResponse]


# Task Activity Schemas
TaskActivityAction = Literal[
    "created", "updated", "status_changed", "assigned", "unassigned",
    "comment", "priority_changed", "points_changed", "epic_changed"
]


class TaskActivityCreate(BaseModel):
    """Schema for creating a task activity (comment)."""

    comment: str = Field(..., min_length=1, max_length=5000)


class TaskActivityResponse(BaseModel):
    """Schema for task activity response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    action: TaskActivityAction
    actor_id: str | None = None
    actor_name: str | None = None
    actor_avatar_url: str | None = None
    field_name: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    comment: str | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class TaskActivityListResponse(BaseModel):
    """Schema for task activity list."""

    activities: list[TaskActivityResponse]
    total: int


# ==================== Task Template Schemas ====================

class TaskTemplateCreate(BaseModel):
    """Schema for creating a task template."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    title_template: str = Field(..., min_length=1, max_length=500)
    description_template: str | None = None
    default_priority: TaskPriority = "medium"
    default_story_points: int | None = Field(default=None, ge=0, le=100)
    default_labels: list[str] = Field(default_factory=list)
    subtasks: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)


class TaskTemplateUpdate(BaseModel):
    """Schema for updating a task template."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    title_template: str | None = Field(default=None, min_length=1, max_length=500)
    description_template: str | None = None
    default_priority: TaskPriority | None = None
    default_story_points: int | None = Field(default=None, ge=0, le=100)
    default_labels: list[str] | None = None
    subtasks: list[str] | None = None
    checklist: list[str] | None = None
    is_active: bool | None = None


class TaskTemplateResponse(BaseModel):
    """Schema for task template response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    category: str | None = None
    is_active: bool
    title_template: str
    description_template: str | None = None
    default_priority: str
    default_story_points: int | None = None
    default_labels: list[str] = Field(default_factory=list)
    subtasks: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    usage_count: int
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TaskTemplateListResponse(BaseModel):
    """Schema for task template list."""

    items: list[TaskTemplateResponse]
    total: int


class TaskFromTemplateCreate(BaseModel):
    """Schema for creating a task from a template."""

    template_id: str
    title_variables: dict[str, str] = Field(default_factory=dict)  # Variables to substitute in title
    sprint_id: str | None = None
    assignee_id: str | None = None
    override_priority: TaskPriority | None = None
    override_story_points: int | None = None
    additional_labels: list[str] = Field(default_factory=list)
    create_subtasks: bool = True
