"""Workspace-related Pydantic schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from aexy.schemas.team import TeamMemberRoleName


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
    # Optional department placement, applied when the invite is accepted so the
    # person doesn't start out in no department at all. Left unset, the invite
    # behaves exactly as before — this is a convenience, not a requirement.
    #
    # It is also now the main thing an invite decides: the department's access
    # profile is what the person will see, so inviting someone into Sales is how
    # they end up with CRM rather than with a developer's sidebar.
    department_id: str | None = None
    role_in_department: str | None = None  # "head" | "manager" | "member"
    # Pin an access template instead of using the department's profile — for the
    # person who doesn't fit their department's shape. Left unset (the norm), the
    # department decides.
    access_template_id: str | None = None
    # Optional *team* placement — a different question from the department, with
    # different consequences. The department decides what they can see; the team
    # decides who chases them: standups, blocker escalation, compliance
    # reminders, review digests, sprint boards, leave approvals. Placed in a
    # department but no team, a joiner gets the right navigation and is then
    # silently left out of all of that.
    team_id: str | None = None
    role_in_team: TeamMemberRoleName | None = None  # "lead" | "manager" | "member"


class WorkspaceMemberAdd(BaseModel):
    """Schema for adding a member directly by developer_id."""

    developer_id: str
    role: str = Field(default="member")


class WorkspaceMemberUpdate(BaseModel):
    """Schema for updating a member's role.

    Either field may be sent on its own. ``role_id`` points at a custom role
    (Organization → Roles) and, when set, is what the permission resolver reads
    instead of the legacy template — that is how a capability like full Service
    Desk visibility is granted; sending ``role_id: null`` revokes it and falls
    back to the legacy role.
    """

    role: str | None = None  # "admin" | "member" | "viewer"
    role_id: str | None = None


class WorkspaceMemberStatusUpdate(BaseModel):
    """Schema for the admin "Mark as left" / "Restore" toggle.

    Only flips between "active" and "removed" — the other statuses
    (pending, suspended) are driven by other flows (invite acceptance,
    moderation) and shouldn't be reachable through this endpoint.
    """

    status: str  # "active" | "removed"


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
    # The custom role assigned to this member, if any. Returned so the members
    # page can show which one is in force and offer to change it.
    role_id: str | None = None
    status: str
    is_billable: bool = True
    app_permissions: dict | None = None
    invited_at: datetime | None = None
    joined_at: datetime | None = None
    created_at: datetime


class WorkspaceMemberAppPermissions(BaseModel):
    """Schema for updating a member's app permissions."""

    app_permissions: dict  # {"hiring": true, "tracking": false, etc.}


# Pending Invite Schemas
class WorkspacePendingInviteResponse(BaseModel):
    """Schema for pending invite response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    email: str
    role: str
    status: str
    app_permissions: dict | None = None
    invited_by_name: str | None = None
    expires_at: datetime | None = None
    created_at: datetime


class WorkspaceInviteResult(BaseModel):
    """Schema for invite result - can be either an existing member or pending invite."""

    type: str  # "member" | "pending_invite"
    member: WorkspaceMemberResponse | None = None
    pending_invite: WorkspacePendingInviteResponse | None = None
    message: str | None = None


class InviteInfoResponse(BaseModel):
    """Public schema for invite info - returned without authentication."""

    workspace_name: str
    workspace_slug: str
    invited_by_name: str | None = None
    invited_by_email: str | None = None
    email: str
    role: str
    expires_at: datetime | None = None
    is_expired: bool = False
    is_valid: bool = True


class AcceptInviteResponse(BaseModel):
    """Schema for accept invite response."""

    success: bool
    workspace_id: str
    workspace_name: str
    workspace_slug: str
    message: str


class MyInvitationResponse(BaseModel):
    """Schema for a user's pending invitation across workspaces."""

    token: str
    workspace_name: str
    workspace_slug: str
    invited_by_name: str | None = None
    role: str
    expires_at: datetime | None = None
    created_at: datetime


# App Permissions Schemas
class WorkspaceAppSettings(BaseModel):
    """Schema for workspace-level app settings."""

    apps: dict[str, bool] = Field(
        default_factory=lambda: {
            "hiring": True,
            "tracking": True,
            "oncall": True,
            "sprints": True,
            "documents": True,
            "ticketing": True,
        }
    )


class WorkspaceAppSettingsUpdate(BaseModel):
    """Schema for updating workspace app settings."""

    apps: dict[str, bool]  # {"hiring": true, "tracking": false}


# How teams should start life in a new workspace.
#
# A *department* decides what a person can see; a *team* decides who chases them —
# standup prompts, blocker escalation, review digests, sprint boards and leave
# approvals all resolve through team membership. Onboarding seeded departments and
# no teams, so a founder finished setup with everybody navigating correctly and
# nobody wired into any of that, and the team field on an invite opened onto an
# empty dropdown.
#
# Asked rather than assumed, because a team boundary is a real decision: one team
# per department suits an org that already works that way, and a single team is
# honest for the ten-person company that does not.
TeamStrategy = Literal["per_department", "single", "none"]


class OnboardingUseCasesApply(BaseModel):
    """The use cases picked during onboarding."""

    use_cases: list[str] = Field(default_factory=list)
    team_strategy: TeamStrategy = "per_department"


class OnboardingSeededDepartment(BaseModel):
    """A department onboarding created or configured."""

    id: str
    name: str
    function_key: str | None = None
    access_profile_slug: str | None = None
    default_persona: str | None = None


class OnboardingSeededTeam(BaseModel):
    """A delivery team onboarding created."""

    id: str
    name: str
    department_id: str | None = None


class OnboardingUseCasesResult(BaseModel):
    """What applying the use cases actually did.

    Returned in full so the onboarding screen can show it rather than claim it:
    the founder should be able to see that picking "CRM & Sales" created a Sales
    department with the Business profile.
    """

    enabled_app_ids: list[str] = Field(default_factory=list)
    disabled_app_ids: list[str] = Field(default_factory=list)
    departments: list[OnboardingSeededDepartment] = Field(default_factory=list)
    teams: list[OnboardingSeededTeam] = Field(default_factory=list)
    # True when the workspace already had teams, so none were seeded. Reported
    # rather than silent: "we made you no teams" and "you already had teams" look
    # identical in an empty list, and only one of them is worth acting on.
    teams_already_existed: bool = False


# Billing Schemas
class WorkspaceBillingStatus(BaseModel):
    """Schema for workspace billing status."""

    workspace_id: str
    has_subscription: bool = False
    current_plan: str | None = None
    status: str | None = None
    # Seat counts of -1 mean unlimited (mirrors Plan.included_seats).
    total_seats: int = 0
    used_seats: int = 0
    available_seats: int = 0
    price_per_seat_cents: int = 0
    next_billing_date: datetime | None = None


class WorkspaceSeatUpdate(BaseModel):
    """Schema for updating seat count."""

    additional_seats: int = Field(..., ge=0)


# GitHub Linking Schemas
class GitHubOrgLink(BaseModel):
    """Schema for linking a GitHub org."""

    github_org_id: str


class MyWorkspacePermissionsResponse(BaseModel):
    """The caller's effective permissions in a workspace.

    The workspace-level counterpart to `MyProjectPermissionsResponse`. The
    frontend had no way to ask this question — `usePermissions` returned `false`
    for every workspace-level check with a comment saying it needed an endpoint —
    so settings pages fell back to guessing from a role string.

    `is_owner` is reported separately from the permission list because some
    actions are the owner's by default (see `OWNER_ONLY_PERMISSIONS`) and the UI
    needs to explain *why* a control is unavailable, not just hide it.
    """

    permissions: list[str]
    workspace_id: str
    role_name: str | None = None
    is_owner: bool = False
