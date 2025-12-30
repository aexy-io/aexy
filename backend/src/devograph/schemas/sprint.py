"""Sprint-related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Sprint Status Types
SprintStatus = Literal["planning", "active", "review", "retrospective", "completed"]
TaskStatus = Literal["backlog", "todo", "in_progress", "review", "done"]
TaskPriority = Literal["critical", "high", "medium", "low"]
TaskSourceType = Literal["github_issue", "jira", "linear", "manual"]


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
    story_points: int | None = Field(None, ge=0)
    priority: TaskPriority = "medium"
    labels: list[str] = Field(default_factory=list)
    assignee_id: str | None = None
    status: TaskStatus = "backlog"


class SprintTaskUpdate(BaseModel):
    """Schema for updating a sprint task."""

    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    story_points: int | None = Field(None, ge=0)
    priority: TaskPriority | None = None
    labels: list[str] | None = None


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


class SprintTaskResponse(BaseModel):
    """Schema for sprint task response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    sprint_id: str
    source_type: TaskSourceType
    source_id: str
    source_url: str | None = None
    title: str
    description: str | None = None
    story_points: int | None = None
    priority: TaskPriority
    labels: list[str] = Field(default_factory=list)
    assignee_id: str | None = None
    assignee_name: str | None = None
    assignee_avatar_url: str | None = None
    assignment_reason: str | None = None
    assignment_confidence: float | None = None
    status: TaskStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None
    carried_over_from_sprint_id: str | None = None
    created_at: datetime
    updated_at: datetime


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
