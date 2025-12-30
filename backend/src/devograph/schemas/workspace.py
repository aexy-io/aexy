"""Workspace-related Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# Workspace Schemas
class WorkspaceCreate(BaseModel):
    """Schema for creating a workspace."""

    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default="internal")  # "internal" | "github_linked"
    github_org_id: str | None = None
    description: str | None = None


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""

    name: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    settings: dict | None = None


class WorkspaceResponse(BaseModel):
    """Schema for workspace response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    type: str
    description: str | None = None
    avatar_url: str | None = None
    github_org_id: str | None = None
    owner_id: str
    member_count: int = 0
    team_count: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class WorkspaceListResponse(BaseModel):
    """Schema for workspace list item."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    type: str
    avatar_url: str | None = None
    owner_id: str
    member_count: int = 0
    team_count: int = 0
    is_active: bool = True


# Member Schemas
class WorkspaceMemberInvite(BaseModel):
    """Schema for inviting a member to workspace."""

    email: str
    role: str = Field(default="member")  # "admin" | "member" | "viewer"


class WorkspaceMemberAdd(BaseModel):
    """Schema for adding a member directly by developer_id."""

    developer_id: str
    role: str = Field(default="member")


class WorkspaceMemberUpdate(BaseModel):
    """Schema for updating a member's role."""

    role: str  # "admin" | "member" | "viewer"


class WorkspaceMemberResponse(BaseModel):
    """Schema for workspace member response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    developer_name: str | None = None
    developer_email: str | None = None
    developer_avatar_url: str | None = None
    role: str
    status: str
    is_billable: bool = True
    invited_at: datetime | None = None
    joined_at: datetime | None = None
    created_at: datetime


# Billing Schemas
class WorkspaceBillingStatus(BaseModel):
    """Schema for workspace billing status."""

    workspace_id: str
    has_subscription: bool = False
    current_plan: str | None = None
    status: str | None = None
    total_seats: int = 5
    used_seats: int = 0
    available_seats: int = 5
    price_per_seat_cents: int = 1000
    next_billing_date: datetime | None = None


class WorkspaceSeatUpdate(BaseModel):
    """Schema for updating seat count."""

    additional_seats: int = Field(..., ge=0)


# GitHub Linking Schemas
class GitHubOrgLink(BaseModel):
    """Schema for linking a GitHub org."""

    github_org_id: str
