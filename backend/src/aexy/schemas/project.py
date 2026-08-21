"""Pydantic schemas for Project management."""

from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator
from enum import Enum
from aexy.schemas.role import RoleSummary


class ProjectCreate(BaseModel):
    """Schema for creating a project."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    color: str = Field(default="#3b82f6", max_length=50)
    icon: str = Field(default="FolderGit2", max_length=50)
    settings: dict = Field(default_factory=dict)
    # Which department owns the board this project creates. Optional, but asked
    # for up front: a board with no department is one the Service Desk cannot
    # hand a ticket to.
    department_id: str | None = None


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(default=None, max_length=50)
    icon: str | None = Field(default=None, max_length=50)
    settings: dict | None = None
    status: str | None = Field(
        default=None,
        pattern="^(active|archived|on_hold)$"
    )
    # Nullable *and* meaningful when null — omit the field to leave it alone,
    # send null to clear it. The service tells the two apart.
    department_id: str | None = None
    desk_stakeholder_slug: str | None = None


class ProjectResponse(BaseModel):
    """Response schema for a project."""

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    color: str
    icon: str
    settings: dict
    status: str
    is_active: bool
    is_public: bool
    public_slug: str | None
    member_count: int
    team_count: int
    created_at: datetime
    updated_at: datetime

    # ------------------------------------------------------------ board routing
    #
    # A board's org rollup, and what the Service Desk resolves it to. All four
    # are computed from the *board* (`Team`) sharing this project's id; the
    # project row holds none of them. `desk_routing_reason` is returned even on
    # success, so the UI can say "via Engineering" rather than only showing a
    # name — and can explain a blank instead of rendering nothing.
    department_id: str | None = None
    department_name: str | None = None
    desk_stakeholder_slug: str | None = None
    desk_routing_reason: str | None = None

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """Response schema for project list item."""

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    color: str
    icon: str
    status: str
    is_active: bool
    member_count: int
    team_count: int
    is_public: bool
    public_slug: str | None

    # ------------------------------------------------------------ board routing
    #
    # A board's org rollup, and what the Service Desk resolves it to. All four
    # are computed from the *board* (`Team`) sharing this project's id; the
    # project row holds none of them. `desk_routing_reason` is returned even on
    # success, so the UI can say "via Engineering" rather than only showing a
    # name — and can explain a blank instead of rendering nothing.
    department_id: str | None = None
    department_name: str | None = None
    desk_stakeholder_slug: str | None = None
    desk_routing_reason: str | None = None

    class Config:
        from_attributes = True


class ProjectsListWrapper(BaseModel):
    """Wrapper for projects list response."""

    projects: list[ProjectListResponse]


class ProjectMembersListWrapper(BaseModel):
    """Wrapper for project members list response."""

    members: list["ProjectMemberListResponse"]


class ProjectTeamsListWrapper(BaseModel):
    """Wrapper for project teams list response."""

    teams: list["ProjectTeamResponse"]


class ProjectMemberAdd(BaseModel):
    """Schema for adding a member to a project."""

    developer_id: str = Field(..., description="Developer ID to add")
    role_id: str | None = Field(
        default=None,
        description="Custom role ID (null = use workspace role)"
    )
    permission_overrides: dict[str, bool] | None = Field(
        default=None,
        description="Permission overrides {permission_id: true/false}"
    )


class ProjectMemberUpdate(BaseModel):
    """Schema for updating a project member."""

    role_id: str | None = Field(
        default=None,
        description="Custom role ID (null = use workspace role)"
    )
    permission_overrides: dict[str, bool] | None = Field(
        default=None,
        description="Permission overrides {permission_id: true/false}"
    )
    status: str | None = Field(
        default=None,
        pattern="^(active|pending|removed)$"
    )


class ProjectMemberResponse(BaseModel):
    """Response schema for a project member."""

    id: str
    project_id: str
    developer_id: str
    developer_name: str | None
    developer_email: str | None
    developer_avatar_url: str | None
    role_id: str | None
    role: RoleSummary | None
    permission_overrides: dict[str, bool] | None
    status: str
    invited_by_id: str | None
    invited_by_name: str | None
    invited_at: datetime | None
    joined_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectMemberListResponse(BaseModel):
    """Response schema for project member list item."""

    id: str
    project_id: str
    developer_id: str
    developer_name: str | None
    developer_email: str | None
    developer_avatar_url: str | None
    role_id: str | None
    role_name: str | None
    status: str
    joined_at: datetime | None

    class Config:
        from_attributes = True


class ProjectTeamAdd(BaseModel):
    """Schema for adding a team to a project."""

    team_id: str = Field(..., description="Team ID to add")


class ProjectTeamResponse(BaseModel):
    """Response schema for project-team association."""

    id: str
    project_id: str
    team_id: str
    team_name: str
    team_slug: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectInviteRequest(BaseModel):
    """Schema for inviting members to a project."""

    emails: list[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="List of email addresses to invite"
    )
    role_id: str | None = Field(
        default=None,
        description="Role to assign to all invitees"
    )


class ProjectInviteResult(BaseModel):
    """Result of project invitation."""

    invited: list[str]
    already_members: list[str]
    pending_invites: list[str]
    failed: list[dict]


class MyProjectPermissionsResponse(BaseModel):
    """Response for current user's permissions in a project."""

    permissions: list[str]
    workspace_id: str
    project_id: str
    role_id: str | None
    role_name: str | None
    has_project_override: bool


class AccessibleWidgetsResponse(BaseModel):
    """Response containing widgets accessible to the user."""

    widgets: list[str]
    workspace_id: str
    project_id: str | None


class PublicProjectResponse(BaseModel):
    """Response schema for a public project (limited data, no auth required)."""

    id: str
    name: str
    slug: str
    public_slug: str | None
    description: str | None
    color: str
    icon: str
    status: str
    member_count: int
    team_count: int
    public_tabs: list[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PublicTabsConfig(BaseModel):
    """Configuration for public project page tabs."""

    enabled_tabs: list[str] = Field(
        default_factory=lambda: ["overview"],
        description="List of enabled tab IDs: overview, backlog, board, bugs, goals, releases, roadmap, stories"
    )


class PublicTabsUpdate(BaseModel):
    """Schema for updating public tabs configuration."""

    enabled_tabs: list[str] = Field(
        ...,
        description="List of tab IDs to enable"
    )


# Public data response schemas (simplified for public access)
class PublicTaskItem(BaseModel):
    """Public task item (simplified)."""

    id: str
    title: str
    description: str | None
    priority: str
    status: str
    labels: list[str]
    story_points: int | None
    created_at: datetime


class PublicStoryItem(BaseModel):
    """Public story item (simplified)."""

    id: str
    key: str
    title: str
    as_a: str
    i_want: str
    so_that: str | None
    priority: str
    status: str
    story_points: int | None
    labels: list[str]
    created_at: datetime


class PublicBugItem(BaseModel):
    """Public bug item (simplified)."""

    id: str
    key: str
    title: str
    severity: str
    priority: str
    bug_type: str
    status: str
    is_regression: bool
    labels: list[str]
    created_at: datetime


class PublicGoalItem(BaseModel):
    """Public goal item (simplified)."""

    id: str
    key: str
    title: str
    description: str | None
    goal_type: str
    status: str
    progress_percentage: float
    target_value: float | None
    current_value: float | None
    start_date: date | None
    end_date: date | None


class PublicReleaseItem(BaseModel):
    """Public release item (simplified)."""

    id: str
    name: str
    version: str | None
    description: str | None
    status: str
    risk_level: str
    target_date: datetime | None
    actual_release_date: datetime | None
    created_at: datetime


class PublicRoadmapItem(BaseModel):
    """Public roadmap item (sprint, simplified)."""

    id: str
    name: str
    goal: str | None
    status: str
    start_date: datetime
    end_date: datetime
    tasks_count: int
    completed_count: int
    total_points: int
    completed_points: int


class PublicSprintItem(BaseModel):
    """Public sprint item (simplified)."""

    id: str
    name: str
    goal: str | None
    status: str
    start_date: datetime
    end_date: datetime
    tasks_count: int
    completed_count: int
    total_points: int
    completed_points: int


# Roadmap Voting Schemas
class RoadmapRequestAuthor(BaseModel):
    """Author info for roadmap requests."""

    id: str
    name: str | None
    avatar_url: str | None


class RoadmapCommentResponse(BaseModel):
    """Response schema for roadmap comments."""

    id: str
    content: str
    author: RoadmapRequestAuthor
    is_admin_response: bool
    created_at: datetime


class RoadmapRequestResponse(BaseModel):
    """Response schema for roadmap requests."""

    id: str
    title: str
    description: str | None
    category: str
    status: str
    vote_count: int
    comment_count: int
    submitted_by: RoadmapRequestAuthor
    admin_response: str | None
    responded_at: datetime | None
    created_at: datetime
    updated_at: datetime
    has_voted: bool = False  # Whether current user has voted


class RoadmapCategory(str, Enum):
    feature = "feature"
    bug_fix = "bug_fix"
    improvement = "improvement"
    integration = "integration"
    other = "other"


class RoadmapRequestCreate(BaseModel):
    """Schema for creating a roadmap request."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Title of the roadmap request",
    )

    category: RoadmapCategory = Field(
        ...,
        description="Category of the roadmap request",
    )

    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Optional description",
    )

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be empty")
        return value

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class RoadmapRequestUpdate(BaseModel):
    """Schema for updating a roadmap request (admin only)."""

    status: str | None = None
    admin_response: str | None = None


class RoadmapCommentCreate(BaseModel):
    """Schema for creating a comment on a roadmap request."""

    content: str


class RoadmapVoteResponse(BaseModel):
    """Response schema for vote action."""

    success: bool
    vote_count: int
    has_voted: bool


class PaginatedRoadmapRequestsResponse(BaseModel):
    """Paginated response for roadmap requests."""

    items: list[RoadmapRequestResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
