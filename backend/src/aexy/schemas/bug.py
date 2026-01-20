"""Bug/Defect related Pydantic schemas."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Bug Types
BugSeverity = Literal["blocker", "critical", "major", "minor", "trivial"]
BugPriority = Literal["critical", "high", "medium", "low"]
BugType = Literal["functional", "performance", "security", "ui", "data", "crash", "usability"]
BugStatus = Literal[
    "new", "confirmed", "in_progress", "fixed", "verified", "closed",
    "wont_fix", "duplicate", "cannot_reproduce"
]
BugEnvironment = Literal["production", "staging", "development", "testing"]
BugSourceType = Literal["jira", "linear", "github", "manual"]


# ==================== Reproduction Steps ====================

class ReproductionStep(BaseModel):
    """Schema for a reproduction step."""

    step_number: int
    description: str


class ReproductionStepCreate(BaseModel):
    """Schema for creating a reproduction step."""

    description: str = Field(..., min_length=1, max_length=1000)


# ==================== Attachment Schemas ====================

class BugAttachment(BaseModel):
    """Schema for a bug attachment."""

    id: str
    url: str
    filename: str
    type: str | None = None  # "image" | "video" | "log" | "other"
    size: int | None = None


# ==================== Bug Schemas ====================

class BugCreate(BaseModel):
    """Schema for creating a bug."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    description_json: dict | None = None
    steps_to_reproduce: list[ReproductionStepCreate] = Field(default_factory=list)
    expected_behavior: str | None = None
    actual_behavior: str | None = None
    severity: BugSeverity = "major"
    priority: BugPriority = "medium"
    bug_type: BugType = "functional"
    environment: BugEnvironment | None = None
    affected_version: str | None = Field(default=None, max_length=50)
    browser: str | None = Field(default=None, max_length=100)
    os: str | None = Field(default=None, max_length=100)
    device: str | None = Field(default=None, max_length=100)
    project_id: str | None = None
    story_id: str | None = None
    release_id: str | None = None
    assignee_id: str | None = None
    labels: list[str] = Field(default_factory=list)
    source_type: BugSourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None
    is_regression: bool = False


class BugUpdate(BaseModel):
    """Schema for updating a bug."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    description_json: dict | None = None
    steps_to_reproduce: list[ReproductionStepCreate] | None = None
    expected_behavior: str | None = None
    actual_behavior: str | None = None
    severity: BugSeverity | None = None
    priority: BugPriority | None = None
    bug_type: BugType | None = None
    environment: BugEnvironment | None = None
    affected_version: str | None = Field(default=None, max_length=50)
    fixed_in_version: str | None = Field(default=None, max_length=50)
    browser: str | None = Field(default=None, max_length=100)
    os: str | None = Field(default=None, max_length=100)
    device: str | None = Field(default=None, max_length=100)
    project_id: str | None = None
    story_id: str | None = None
    release_id: str | None = None
    assignee_id: str | None = None
    labels: list[str] | None = None
    root_cause: str | None = None
    resolution_notes: str | None = None


class BugResponse(BaseModel):
    """Schema for bug response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    project_id: str | None = None
    project_name: str | None = None
    key: str
    title: str
    description: str | None = None
    description_json: dict | None = None
    steps_to_reproduce: list[ReproductionStep] = Field(default_factory=list)
    expected_behavior: str | None = None
    actual_behavior: str | None = None
    # Classification
    severity: BugSeverity
    priority: BugPriority
    bug_type: BugType
    status: BugStatus
    # Environment
    environment: BugEnvironment | None = None
    affected_version: str | None = None
    fixed_in_version: str | None = None
    browser: str | None = None
    os: str | None = None
    device: str | None = None
    # Links
    story_id: str | None = None
    story_key: str | None = None
    story_title: str | None = None
    release_id: str | None = None
    release_name: str | None = None
    fix_task_id: str | None = None
    fix_task_title: str | None = None
    duplicate_of_id: str | None = None
    duplicate_of_key: str | None = None
    # Regression
    is_regression: bool = False
    regressed_from_release_id: str | None = None
    regressed_from_release_name: str | None = None
    # People
    reporter_id: str | None = None
    reporter_name: str | None = None
    assignee_id: str | None = None
    assignee_name: str | None = None
    assignee_avatar_url: str | None = None
    verified_by_id: str | None = None
    verified_by_name: str | None = None
    # Attachments
    attachments: list[BugAttachment] = Field(default_factory=list)
    # Labels
    labels: list[str] = Field(default_factory=list)
    # Resolution
    root_cause: str | None = None
    resolution_notes: str | None = None
    time_to_fix_hours: float | None = None
    # Source info
    source_type: BugSourceType = "manual"
    source_id: str | None = None
    source_url: str | None = None
    # Status timestamps
    confirmed_at: datetime | None = None
    fixed_at: datetime | None = None
    verified_at: datetime | None = None
    closed_at: datetime | None = None
    # Timestamps
    created_at: datetime
    updated_at: datetime


class BugListResponse(BaseModel):
    """Schema for bug list item (lighter weight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    project_id: str | None = None
    project_name: str | None = None
    key: str
    title: str
    severity: BugSeverity
    priority: BugPriority
    bug_type: BugType
    status: BugStatus
    environment: BugEnvironment | None = None
    affected_version: str | None = None
    reporter_id: str | None = None
    reporter_name: str | None = None
    assignee_id: str | None = None
    assignee_name: str | None = None
    is_regression: bool = False
    release_id: str | None = None
    release_name: str | None = None
    created_at: datetime


class BugDetailResponse(BugResponse):
    """Schema for bug detail with activity."""

    # Activity count
    activity_count: int = 0
    # Related bugs
    duplicate_bugs: list["BugListResponse"] = Field(default_factory=list)


# ==================== Bug Status Transitions ====================

class BugConfirmRequest(BaseModel):
    """Schema for confirming a bug."""

    notes: str | None = None


class BugFixRequest(BaseModel):
    """Schema for marking a bug as fixed."""

    fixed_in_version: str | None = Field(default=None, max_length=50)
    fix_task_id: str | None = None
    root_cause: str | None = None
    resolution_notes: str | None = None


class BugVerifyRequest(BaseModel):
    """Schema for verifying a bug fix."""

    notes: str | None = None


class BugCloseRequest(BaseModel):
    """Schema for closing a bug."""

    resolution: Literal["fixed", "wont_fix", "duplicate", "cannot_reproduce"] = "fixed"
    notes: str | None = None
    duplicate_of_id: str | None = None  # For duplicate resolution


class BugReopenRequest(BaseModel):
    """Schema for reopening a bug."""

    reason: str = Field(..., min_length=1, max_length=1000)


# ==================== Bug Linking ====================

class BugLinkStoryRequest(BaseModel):
    """Schema for linking a bug to a story."""

    story_id: str


class BugLinkTaskRequest(BaseModel):
    """Schema for linking a bug to a fix task."""

    task_id: str


# ==================== Bug Statistics ====================

class BugStatsResponse(BaseModel):
    """Schema for bug statistics."""

    workspace_id: str
    # Counts
    total_bugs: int = 0
    open_bugs: int = 0
    closed_bugs: int = 0
    # By status
    new_bugs: int = 0
    confirmed_bugs: int = 0
    in_progress_bugs: int = 0
    fixed_bugs: int = 0
    verified_bugs: int = 0
    # By severity
    blocker_bugs: int = 0
    critical_bugs: int = 0
    major_bugs: int = 0
    minor_bugs: int = 0
    trivial_bugs: int = 0
    # By type
    bugs_by_type: dict[str, int] = Field(default_factory=dict)
    # Trends
    opened_this_week: int = 0
    closed_this_week: int = 0
    # Averages
    avg_time_to_fix_hours: float | None = None
    avg_time_to_verify_hours: float | None = None
    # Regression stats
    regression_count: int = 0


class BugsBySeverityResponse(BaseModel):
    """Schema for bugs grouped by severity."""

    severity: BugSeverity
    count: int
    bugs: list[BugListResponse] = Field(default_factory=list)


# Rebuild model to resolve forward references
BugDetailResponse.model_rebuild()
