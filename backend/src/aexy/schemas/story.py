"""User Story related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Story Types
StoryStatus = Literal["draft", "ready", "in_progress", "review", "accepted", "rejected"]
StoryPriority = Literal["critical", "high", "medium", "low"]
StorySourceType = Literal["jira", "linear", "manual"]


# ==================== Acceptance Criteria ====================

class AcceptanceCriterion(BaseModel):
    """Schema for an acceptance criterion."""

    id: str
    description: str
    completed: bool = False
    completed_at: datetime | None = None
    completed_by: str | None = None


class AcceptanceCriterionCreate(BaseModel):
    """Schema for creating an acceptance criterion."""

    description: str = Field(..., min_length=1, max_length=1000)


class AcceptanceCriterionUpdate(BaseModel):
    """Schema for updating an acceptance criterion."""

    description: str | None = Field(default=None, min_length=1, max_length=1000)
    completed: bool | None = None


# ==================== Design/Spec Links ====================

class DesignLink(BaseModel):
    """Schema for a design link (Figma, Sketch, etc.)."""

    id: str
    url: str
    title: str
    type: str | None = None  # "figma" | "sketch" | "xd" | "other"


class SpecLink(BaseModel):
    """Schema for a spec/documentation link."""

    id: str
    url: str
    title: str


# ==================== Story Schemas ====================

class StoryCreate(BaseModel):
    """Schema for creating a user story."""

    title: str = Field(..., min_length=1, max_length=500)
    as_a: str = Field(..., min_length=1, max_length=255, description="As a <user type>")
    i_want: str = Field(..., min_length=1, max_length=1000, description="I want <goal>")
    so_that: str | None = Field(default=None, max_length=1000, description="So that <benefit>")
    description: str | None = None
    description_json: dict | None = None
    acceptance_criteria: list[AcceptanceCriterionCreate] = Field(default_factory=list)
    story_points: int | None = Field(default=None, ge=0, le=100)
    estimated_hours: float | None = Field(default=None, ge=0)
    status: StoryStatus = "draft"
    priority: StoryPriority = "medium"
    color: str = Field(default="#8B5CF6", max_length=20)
    epic_id: str | None = None
    release_id: str | None = None
    owner_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    labels: list[str] = Field(default_factory=list)
    design_links: list[DesignLink] = Field(default_factory=list)
    spec_links: list[SpecLink] = Field(default_factory=list)
    source_type: StorySourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None


class StoryUpdate(BaseModel):
    """Schema for updating a user story."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    as_a: str | None = Field(default=None, min_length=1, max_length=255)
    i_want: str | None = Field(default=None, min_length=1, max_length=1000)
    so_that: str | None = None
    description: str | None = None
    description_json: dict | None = None
    story_points: int | None = Field(default=None, ge=0, le=100)
    estimated_hours: float | None = Field(default=None, ge=0)
    status: StoryStatus | None = None
    priority: StoryPriority | None = None
    color: str | None = Field(default=None, max_length=20)
    epic_id: str | None = None
    release_id: str | None = None
    owner_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    labels: list[str] | None = None
    design_links: list[DesignLink] | None = None
    spec_links: list[SpecLink] | None = None
    position: int | None = None


class StoryResponse(BaseModel):
    """Schema for story response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    key: str
    title: str
    as_a: str
    i_want: str
    so_that: str | None = None
    description: str | None = None
    description_json: dict | None = None
    acceptance_criteria: list[AcceptanceCriterion] = Field(default_factory=list)
    story_points: int | None = None
    estimated_hours: float | None = None
    status: StoryStatus
    priority: StoryPriority
    position: int = 0
    color: str
    # Related entities
    epic_id: str | None = None
    epic_key: str | None = None
    epic_title: str | None = None
    release_id: str | None = None
    release_name: str | None = None
    # Ownership
    reporter_id: str | None = None
    reporter_name: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    owner_avatar_url: str | None = None
    # Labels and links
    labels: list[str] = Field(default_factory=list)
    design_links: list[DesignLink] = Field(default_factory=list)
    spec_links: list[SpecLink] = Field(default_factory=list)
    # Cached metrics
    total_tasks: int = 0
    completed_tasks: int = 0
    total_story_points: int = 0
    completed_story_points: int = 0
    progress_percentage: float = 0.0
    # Timeline
    start_date: date | None = None
    target_date: date | None = None
    accepted_at: datetime | None = None
    # Source info
    source_type: StorySourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None
    # Timestamps
    created_at: datetime
    updated_at: datetime


class StoryListResponse(BaseModel):
    """Schema for story list item (lighter weight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    key: str
    title: str
    as_a: str
    i_want: str
    status: StoryStatus
    priority: StoryPriority
    color: str
    story_points: int | None = None
    epic_id: str | None = None
    epic_key: str | None = None
    release_id: str | None = None
    release_name: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    target_date: date | None = None
    total_tasks: int = 0
    completed_tasks: int = 0
    progress_percentage: float = 0.0
    acceptance_criteria_count: int = 0
    acceptance_criteria_completed: int = 0


class StoryDetailResponse(StoryResponse):
    """Schema for story detail with tasks breakdown."""

    # Task counts by status
    tasks_by_status: dict[str, int] = Field(default_factory=dict)
    # Task list (brief)
    tasks: list["TaskBriefResponse"] = Field(default_factory=list)
    # Activity count
    activity_count: int = 0
    # Dependencies
    blocked_by_count: int = 0
    blocking_count: int = 0


# ==================== Story Status Transitions ====================

class StoryReadyRequest(BaseModel):
    """Schema for marking a story as ready for development."""

    notes: str | None = None


class StoryAcceptRequest(BaseModel):
    """Schema for accepting a story."""

    notes: str | None = None


class StoryRejectRequest(BaseModel):
    """Schema for rejecting a story."""

    reason: str = Field(..., min_length=1, max_length=1000)


# ==================== Story Task Management ====================

class StoryAddTasksRequest(BaseModel):
    """Schema for adding tasks to a story."""

    task_ids: list[str] = Field(..., min_length=1)


class StoryAddTasksResponse(BaseModel):
    """Schema for add tasks response."""

    added_count: int
    already_in_story: int = 0
    task_ids: list[str]


# ==================== Story Progress ====================

class StoryProgressResponse(BaseModel):
    """Schema for story progress metrics."""

    story_id: str
    # Task progress
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    blocked_tasks: int
    # Story points progress
    total_story_points: int
    completed_story_points: int
    remaining_story_points: int
    # Acceptance criteria
    total_criteria: int
    completed_criteria: int
    # Percentages
    task_completion_percentage: float
    criteria_completion_percentage: float


# ==================== Brief Task Response (avoid circular import) ====================

class TaskBriefResponse(BaseModel):
    """Brief task response for story detail."""

    id: str
    title: str
    status: str
    priority: str
    story_points: int | None = None
    assignee_id: str | None = None
    assignee_name: str | None = None


# Rebuild model to resolve forward references
StoryDetailResponse.model_rebuild()
