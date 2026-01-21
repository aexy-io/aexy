"""Goal/OKR related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Goal Types
GoalType = Literal["objective", "key_result", "initiative"]
GoalStatus = Literal["not_started", "on_track", "at_risk", "behind", "achieved", "missed", "cancelled"]
GoalPeriodType = Literal["quarter", "year", "half", "custom"]
GoalMetricType = Literal["percentage", "number", "currency", "boolean"]


# ==================== Check-in Schemas ====================

class GoalCheckIn(BaseModel):
    """Schema for a goal check-in entry."""

    id: str
    date: date
    value: float | None = None
    notes: str | None = None
    by_id: str | None = None
    by_name: str | None = None


class GoalCheckInCreate(BaseModel):
    """Schema for creating a goal check-in."""

    value: float | None = None
    notes: str | None = None


# ==================== Goal Schemas ====================

class GoalCreate(BaseModel):
    """Schema for creating a goal/OKR."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    goal_type: GoalType = "objective"
    parent_goal_id: str | None = None  # For key results
    period_type: GoalPeriodType = "quarter"
    period_label: str | None = Field(default=None, max_length=50)
    start_date: date
    end_date: date
    metric_type: GoalMetricType = "percentage"
    target_value: float | None = None
    starting_value: float | None = None
    current_value: float | None = None
    unit: str | None = Field(default=None, max_length=50)
    status: GoalStatus = "not_started"
    confidence_level: int | None = Field(default=None, ge=1, le=10)
    confidence_notes: str | None = None
    color: str = Field(default="#F59E0B", max_length=20)
    owner_id: str | None = None
    is_public: bool = True
    weight: float = Field(default=1.0, ge=0)
    labels: list[str] = Field(default_factory=list)


class GoalUpdate(BaseModel):
    """Schema for updating a goal/OKR."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    period_type: GoalPeriodType | None = None
    period_label: str | None = Field(default=None, max_length=50)
    start_date: date | None = None
    end_date: date | None = None
    metric_type: GoalMetricType | None = None
    target_value: float | None = None
    starting_value: float | None = None
    current_value: float | None = None
    unit: str | None = Field(default=None, max_length=50)
    status: GoalStatus | None = None
    confidence_level: int | None = Field(default=None, ge=1, le=10)
    confidence_notes: str | None = None
    color: str | None = Field(default=None, max_length=20)
    owner_id: str | None = None
    is_public: bool | None = None
    weight: float | None = Field(default=None, ge=0)
    labels: list[str] | None = None
    # Optional comment for the activity timeline
    comment: str | None = Field(default=None, max_length=10000)


class GoalResponse(BaseModel):
    """Schema for goal response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    key: str
    title: str
    description: str | None = None
    goal_type: GoalType
    parent_goal_id: str | None = None
    parent_goal_title: str | None = None
    # Period
    period_type: GoalPeriodType
    period_label: str | None = None
    start_date: date
    end_date: date
    # Progress
    metric_type: GoalMetricType
    target_value: float | None = None
    starting_value: float | None = None
    current_value: float | None = None
    unit: str | None = None
    progress_percentage: float = 0.0
    # Status
    status: GoalStatus
    confidence_level: int | None = None
    confidence_notes: str | None = None
    # Visual
    color: str
    # Ownership
    owner_id: str | None = None
    owner_name: str | None = None
    owner_avatar_url: str | None = None
    # Settings
    is_public: bool = True
    weight: float = 1.0
    # Labels
    labels: list[str] = Field(default_factory=list)
    # Check-ins
    check_ins: list[GoalCheckIn] = Field(default_factory=list)
    # Linked counts
    key_results_count: int = 0
    linked_projects_count: int = 0
    linked_epics_count: int = 0
    # Timestamps
    created_at: datetime
    updated_at: datetime


class GoalListResponse(BaseModel):
    """Schema for goal list item (lighter weight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    key: str
    title: str
    goal_type: GoalType
    parent_goal_id: str | None = None
    status: GoalStatus
    color: str
    progress_percentage: float = 0.0
    confidence_level: int | None = None
    period_label: str | None = None
    start_date: date
    end_date: date
    owner_id: str | None = None
    owner_name: str | None = None
    key_results_count: int = 0


class GoalDetailResponse(GoalResponse):
    """Schema for goal detail with key results and links."""

    # Key results (child goals)
    key_results: list["GoalListResponse"] = Field(default_factory=list)
    # Linked projects
    linked_projects: list["LinkedProjectInfo"] = Field(default_factory=list)
    # Linked epics
    linked_epics: list["LinkedEpicInfo"] = Field(default_factory=list)
    # Days remaining
    days_remaining: int | None = None
    is_overdue: bool = False


# ==================== Goal Progress ====================

class GoalProgressUpdateRequest(BaseModel):
    """Schema for updating goal progress."""

    current_value: float
    notes: str | None = None


class GoalConfidenceUpdateRequest(BaseModel):
    """Schema for updating goal confidence."""

    confidence_level: int = Field(..., ge=1, le=10)
    notes: str | None = None


# ==================== Goal Linking ====================

class LinkedProjectInfo(BaseModel):
    """Schema for linked project info."""

    project_id: str
    project_name: str
    contribution_weight: float = 1.0


class LinkedEpicInfo(BaseModel):
    """Schema for linked epic info."""

    epic_id: str
    epic_key: str
    epic_title: str
    contribution_weight: float = 1.0
    progress_percentage: float = 0.0


class GoalLinkProjectRequest(BaseModel):
    """Schema for linking a project to a goal."""

    project_id: str
    contribution_weight: float = Field(default=1.0, ge=0)


class GoalLinkEpicRequest(BaseModel):
    """Schema for linking an epic to a goal."""

    epic_id: str
    contribution_weight: float = Field(default=1.0, ge=0)


# ==================== Key Results ====================

class KeyResultCreate(BaseModel):
    """Schema for creating a key result under an objective."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    metric_type: GoalMetricType = "percentage"
    target_value: float | None = None
    starting_value: float | None = None
    current_value: float | None = None
    unit: str | None = Field(default=None, max_length=50)
    owner_id: str | None = None
    weight: float = Field(default=1.0, ge=0)


# ==================== Goal Dashboard ====================

class GoalDashboardResponse(BaseModel):
    """Schema for goal dashboard overview."""

    workspace_id: str
    period_label: str | None = None
    # Counts
    total_objectives: int = 0
    total_key_results: int = 0
    # Status breakdown
    on_track_count: int = 0
    at_risk_count: int = 0
    behind_count: int = 0
    achieved_count: int = 0
    # Average progress
    avg_progress: float = 0.0
    avg_confidence: float | None = None
    # Top level objectives
    objectives: list[GoalListResponse] = Field(default_factory=list)


# Rebuild models to resolve forward references
GoalDetailResponse.model_rebuild()
