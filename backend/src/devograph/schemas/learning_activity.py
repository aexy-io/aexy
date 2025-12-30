"""Learning activity tracking Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# Enums
class ActivityType(str, Enum):
    """Types of learning activities."""

    COURSE = "course"
    TASK = "task"
    READING = "reading"
    PROJECT = "project"
    PAIRING = "pairing"
    VIDEO = "video"


class ActivitySource(str, Enum):
    """Source of learning activities."""

    YOUTUBE = "youtube"
    COURSERA = "coursera"
    UDEMY = "udemy"
    PLURALSIGHT = "pluralsight"
    INTERNAL = "internal"
    MANUAL = "manual"


class ActivityStatus(str, Enum):
    """Activity completion status."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


# Time Session schemas
class TimeSessionBase(BaseModel):
    """Base time session schema."""

    notes: str | None = None


class TimeSessionCreate(TimeSessionBase):
    """Schema for starting a time session."""

    pass


class TimeSessionEnd(BaseModel):
    """Schema for ending a time session."""

    notes: str | None = None


class TimeSessionResponse(TimeSessionBase):
    """Time session response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    activity_log_id: str
    developer_id: str
    started_at: datetime
    ended_at: datetime | None = None
    duration_minutes: int
    created_at: datetime


# Activity Log schemas
class ActivityLogBase(BaseModel):
    """Base activity log schema."""

    activity_type: ActivityType
    title: str = Field(max_length=500)
    description: str | None = None
    source: ActivitySource
    external_id: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    estimated_duration_minutes: int | None = None
    tags: list[str] = []
    skill_tags: list[str] = []


class ActivityLogCreate(ActivityLogBase):
    """Schema for creating an activity log."""

    learning_path_id: str | None = None
    milestone_id: str | None = None
    extra_data: dict = {}


class ActivityLogUpdate(BaseModel):
    """Schema for updating an activity log."""

    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    status: ActivityStatus | None = None
    progress_percentage: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    tags: list[str] | None = None
    skill_tags: list[str] | None = None


class ActivityProgressUpdate(BaseModel):
    """Schema for updating activity progress."""

    progress_percentage: int = Field(ge=0, le=100)
    notes: str | None = None


class ActivityCompleteRequest(BaseModel):
    """Schema for completing an activity."""

    rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None


class ActivityLogResponse(ActivityLogBase):
    """Activity log response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    learning_path_id: str | None = None
    milestone_id: str | None = None
    status: ActivityStatus
    progress_percentage: int
    actual_time_spent_minutes: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    points_earned: int
    notes: str | None = None
    rating: int | None = None
    extra_data: dict = {}
    created_at: datetime
    updated_at: datetime


class ActivityLogWithSessions(ActivityLogResponse):
    """Activity log response with time sessions."""

    time_sessions: list[TimeSessionResponse] = []


# Activity Stats schemas
class ActivityStats(BaseModel):
    """Aggregate activity statistics."""

    total_activities: int
    completed_activities: int
    in_progress_activities: int
    total_time_spent_minutes: int
    total_points_earned: int
    average_rating: float | None = None
    activities_by_type: dict[str, int] = {}
    activities_by_source: dict[str, int] = {}
    completion_rate: float = Field(ge=0, le=1)


class ActivityStreak(BaseModel):
    """Activity streak information."""

    current_streak_days: int
    longest_streak_days: int
    last_activity_date: datetime | None = None


class DailyActivitySummary(BaseModel):
    """Daily activity summary for calendar view."""

    date: str  # ISO date string
    activities_count: int
    time_spent_minutes: int
    points_earned: int


class ActivityHistory(BaseModel):
    """Activity history response with pagination."""

    activities: list[ActivityLogResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# Filter schemas
class ActivityFilter(BaseModel):
    """Filter options for activity queries."""

    activity_type: ActivityType | None = None
    source: ActivitySource | None = None
    status: ActivityStatus | None = None
    learning_path_id: str | None = None
    milestone_id: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    skill_tags: list[str] | None = None
