"""Pydantic schemas for Project management."""

from datetime import datetime
from pydantic import BaseModel, Field

from aexy.schemas.role import RoleSummary


class ProjectCreate(BaseModel):
    """Schema for creating a project."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    color: str = Field(default="#3b82f6", max_length=50)
    icon: str = Field(default="FolderGit2", max_length=50)
    settings: dict = Field(default_factory=dict)


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
    member_count: int
    team_count: int
    created_at: datetime
    updated_at: datetime

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
