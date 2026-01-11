"""Release/Milestone related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Release Types
ReleaseStatus = Literal["planning", "in_progress", "code_freeze", "testing", "released", "cancelled"]
ReleaseRiskLevel = Literal["low", "medium", "high", "critical"]


# ==================== Readiness Checklist ====================

class ReadinessChecklistItem(BaseModel):
    """Schema for a readiness checklist item."""

    id: str
    item: str
    completed: bool = False
    required: bool = True
    completed_at: datetime | None = None
    completed_by: str | None = None


class ReadinessChecklistItemCreate(BaseModel):
    """Schema for creating a readiness checklist item."""

    item: str = Field(..., min_length=1, max_length=500)
    required: bool = True


# ==================== Release Schemas ====================

class ReleaseCreate(BaseModel):
    """Schema for creating a release."""

    name: str = Field(..., min_length=1, max_length=255)
    version: str | None = Field(default=None, max_length=50)
    codename: str | None = Field(default=None, max_length=100)
    description: str | None = None
    color: str = Field(default="#10B981", max_length=20)
    project_id: str | None = None
    start_date: date | None = None
    target_date: date
    code_freeze_date: date | None = None
    status: ReleaseStatus = "planning"
    risk_level: ReleaseRiskLevel = "low"
    risk_notes: str | None = None
    readiness_checklist: list[ReadinessChecklistItemCreate] = Field(default_factory=list)
    owner_id: str | None = None
    labels: list[str] = Field(default_factory=list)


class ReleaseUpdate(BaseModel):
    """Schema for updating a release."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    version: str | None = Field(default=None, max_length=50)
    codename: str | None = Field(default=None, max_length=100)
    description: str | None = None
    color: str | None = Field(default=None, max_length=20)
    project_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    code_freeze_date: date | None = None
    status: ReleaseStatus | None = None
    risk_level: ReleaseRiskLevel | None = None
    risk_notes: str | None = None
    owner_id: str | None = None
    labels: list[str] | None = None
    release_notes: str | None = None
    release_notes_json: dict | None = None


class ReleaseResponse(BaseModel):
    """Schema for release response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    project_id: str | None = None
    project_name: str | None = None
    name: str
    version: str | None = None
    codename: str | None = None
    description: str | None = None
    color: str
    # Timeline
    start_date: date | None = None
    target_date: date
    code_freeze_date: date | None = None
    actual_release_date: date | None = None
    # Status
    status: ReleaseStatus
    risk_level: ReleaseRiskLevel
    risk_notes: str | None = None
    # Checklist
    readiness_checklist: list[ReadinessChecklistItem] = Field(default_factory=list)
    # Release notes
    release_notes: str | None = None
    release_notes_json: dict | None = None
    # Ownership
    owner_id: str | None = None
    owner_name: str | None = None
    owner_avatar_url: str | None = None
    # Labels
    labels: list[str] = Field(default_factory=list)
    # Cached metrics
    total_stories: int = 0
    completed_stories: int = 0
    total_story_points: int = 0
    completed_story_points: int = 0
    total_tasks: int = 0
    completed_tasks: int = 0
    progress_percentage: float = 0.0
    open_bugs: int = 0
    critical_bugs: int = 0
    # Timestamps
    created_at: datetime
    updated_at: datetime


class ReleaseListResponse(BaseModel):
    """Schema for release list item (lighter weight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    project_id: str | None = None
    project_name: str | None = None
    name: str
    version: str | None = None
    status: ReleaseStatus
    risk_level: ReleaseRiskLevel
    color: str
    target_date: date
    actual_release_date: date | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    total_stories: int = 0
    completed_stories: int = 0
    progress_percentage: float = 0.0
    open_bugs: int = 0
    critical_bugs: int = 0


class ReleaseDetailResponse(ReleaseResponse):
    """Schema for release detail with stories and sprints."""

    # Sprint info
    sprints: list["ReleaseSprintInfo"] = Field(default_factory=list)
    # Story breakdown
    stories_by_status: dict[str, int] = Field(default_factory=dict)
    # Days remaining
    days_until_target: int | None = None
    days_until_code_freeze: int | None = None


# ==================== Release Sprint Management ====================

class ReleaseSprintInfo(BaseModel):
    """Schema for sprint info in a release."""

    sprint_id: str
    sprint_name: str
    team_id: str
    team_name: str
    status: str
    start_date: datetime
    end_date: datetime
    task_count: int = 0
    completed_count: int = 0


class ReleaseAddSprintRequest(BaseModel):
    """Schema for adding a sprint to a release."""

    sprint_id: str


class ReleaseAddStoriesRequest(BaseModel):
    """Schema for adding stories to a release."""

    story_ids: list[str] = Field(..., min_length=1)


class ReleaseAddStoriesResponse(BaseModel):
    """Schema for add stories response."""

    added_count: int
    already_in_release: int = 0
    story_ids: list[str]


# ==================== Release Lifecycle ====================

class ReleaseFreezeRequest(BaseModel):
    """Schema for entering code freeze."""

    notes: str | None = None


class ReleasePublishRequest(BaseModel):
    """Schema for marking a release as published."""

    actual_release_date: date | None = None
    release_notes: str | None = None


# ==================== Release Readiness ====================

class ReleaseReadinessResponse(BaseModel):
    """Schema for release readiness status."""

    release_id: str
    status: ReleaseStatus
    risk_level: ReleaseRiskLevel
    # Checklist progress
    total_items: int
    completed_items: int
    required_items: int
    required_completed: int
    checklist_percentage: float
    # Story/task progress
    stories_ready: int
    stories_not_ready: int
    story_readiness_percentage: float
    # Bug status
    open_bugs: int
    critical_bugs: int
    blocker_bugs: int
    # Overall readiness
    is_ready: bool
    blocking_issues: list[str] = Field(default_factory=list)


class ReleaseChecklistToggleRequest(BaseModel):
    """Schema for toggling a checklist item."""

    item_id: str
    completed: bool


# ==================== Release Burndown ====================

class ReleaseBurndownDataPoint(BaseModel):
    """Schema for release burndown data point."""

    date: str
    remaining_points: int
    remaining_stories: int
    scope_total: int


class ReleaseBurndownResponse(BaseModel):
    """Schema for release burndown chart data."""

    release_id: str
    data_points: list[ReleaseBurndownDataPoint]
    start_date: str
    target_date: str
    ideal_burndown: list[float]


# Rebuild model to resolve forward references
ReleaseDetailResponse.model_rebuild()
