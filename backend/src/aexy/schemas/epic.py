"""Epic-related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Epic Types
EpicStatus = Literal["open", "in_progress", "done", "cancelled"]
EpicPriority = Literal["critical", "high", "medium", "low"]
EpicSourceType = Literal["jira", "linear", "manual"]


# ==================== Epic Schemas ====================

class EpicCreate(BaseModel):
    """Schema for creating an epic."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    status: EpicStatus = "open"
    color: str = Field(default="#6366F1", max_length=20)
    owner_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    priority: EpicPriority = "medium"
    labels: list[str] = Field(default_factory=list)
    source_type: EpicSourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None


class EpicUpdate(BaseModel):
    """Schema for updating an epic."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: EpicStatus | None = None
    color: str | None = Field(default=None, max_length=20)
    owner_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    priority: EpicPriority | None = None
    labels: list[str] | None = None


class EpicResponse(BaseModel):
    """Schema for epic response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    key: str
    title: str
    description: str | None = None
    status: EpicStatus
    color: str
    owner_id: str | None = None
    owner_name: str | None = None
    owner_avatar_url: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    completed_date: date | None = None
    priority: EpicPriority
    labels: list[str] = Field(default_factory=list)
    # Cached metrics
    total_tasks: int = 0
    completed_tasks: int = 0
    total_story_points: int = 0
    completed_story_points: int = 0
    progress_percentage: float = 0.0
    # Source info
    source_type: EpicSourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None
    # Timestamps
    created_at: datetime
    updated_at: datetime


class EpicListResponse(BaseModel):
    """Schema for epic list item (lighter weight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    key: str
    title: str
    status: EpicStatus
    color: str
    owner_id: str | None = None
    owner_name: str | None = None
    priority: EpicPriority
    target_date: date | None = None
    total_tasks: int = 0
    completed_tasks: int = 0
    progress_percentage: float = 0.0


class EpicDetailResponse(EpicResponse):
    """Schema for epic detail with tasks breakdown."""

    # Task counts by status
    tasks_by_status: dict[str, int] = Field(default_factory=dict)
    # Tasks by team
    tasks_by_team: dict[str, int] = Field(default_factory=dict)
    # Recent activity
    recent_completions: int = 0  # Tasks completed in last 7 days


# ==================== Epic Task Management ====================

class EpicAddTasksRequest(BaseModel):
    """Schema for adding tasks to an epic."""

    task_ids: list[str] = Field(..., min_length=1)


class EpicAddTasksResponse(BaseModel):
    """Schema for add tasks response."""

    added_count: int
    already_in_epic: int = 0
    task_ids: list[str]


class EpicRemoveTaskRequest(BaseModel):
    """Schema for removing a task from an epic."""

    task_id: str


# ==================== Epic Timeline ====================

class EpicTimelineSprintItem(BaseModel):
    """Schema for a sprint in the epic timeline."""

    sprint_id: str
    sprint_name: str
    team_id: str
    team_name: str
    status: str
    start_date: datetime
    end_date: datetime
    task_count: int
    completed_count: int
    story_points: int
    completed_points: int


class EpicTimelineResponse(BaseModel):
    """Schema for epic timeline view."""

    epic_id: str
    epic_title: str
    sprints: list[EpicTimelineSprintItem]
    # Overall progress
    total_sprints: int
    completed_sprints: int
    current_sprints: int
    planned_sprints: int


# ==================== Epic Metrics ====================

class EpicProgressResponse(BaseModel):
    """Schema for epic progress metrics."""

    epic_id: str
    # Task progress
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    blocked_tasks: int
    # Story points progress
    total_story_points: int
    completed_story_points: int
    remaining_story_points: int
    # Percentages
    task_completion_percentage: float
    points_completion_percentage: float
    # Trend
    tasks_completed_this_week: int
    points_completed_this_week: int
    estimated_completion_date: date | None = None


class EpicBurndownDataPoint(BaseModel):
    """Schema for epic burndown data point."""

    date: str
    remaining_points: int
    remaining_tasks: int
    scope_total: int  # Track scope changes


class EpicBurndownResponse(BaseModel):
    """Schema for epic burndown chart data."""

    epic_id: str
    data_points: list[EpicBurndownDataPoint]
    start_date: str
    target_date: str | None = None
    ideal_burndown: list[float]


# ==================== Epic Import ====================

class EpicImportFromJiraRequest(BaseModel):
    """Schema for importing epics from Jira."""

    project_key: str | None = None
    limit: int = Field(default=50, ge=1, le=100)


class EpicImportFromLinearRequest(BaseModel):
    """Schema for importing epics from Linear (projects/initiatives)."""

    team_id: str | None = None
    limit: int = Field(default=50, ge=1, le=100)


class EpicImportResponse(BaseModel):
    """Schema for epic import response."""

    imported_count: int
    updated_count: int = 0
    epics: list[EpicListResponse]
