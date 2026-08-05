"""Organization structure Pydantic schemas (departments, membership, org chart)."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


DepartmentMemberRole = Literal["head", "manager", "member"]
PositionStatus = Literal["open", "filled"]


# ==================== Departments ====================

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=120)
    description: str | None = None
    function_key: str | None = Field(None, max_length=64)
    parent_id: str | None = None
    head_id: str | None = None
    cost_center: str | None = Field(None, max_length=64)
    budget_amount: Decimal | None = None
    budget_currency: str | None = Field(None, max_length=3)
    headcount_planned: int = Field(0, ge=0)
    location: str | None = None
    timezone: str | None = None
    position: int = 0
    settings: dict = Field(default_factory=dict)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=120)
    description: str | None = None
    function_key: str | None = Field(None, max_length=64)
    head_id: str | None = None
    cost_center: str | None = Field(None, max_length=64)
    budget_amount: Decimal | None = None
    budget_currency: str | None = Field(None, max_length=3)
    headcount_planned: int | None = Field(None, ge=0)
    location: str | None = None
    timezone: str | None = None
    position: int | None = None
    is_active: bool | None = None
    settings: dict | None = None


class DepartmentReparent(BaseModel):
    """Move a department to a new parent (None = make it a root)."""
    parent_id: str | None = None


class DepartmentAccessProfileUpdate(BaseModel):
    """Set (or clear) what people in this department can see.

    Either name a system bundle via ``profile_slug`` and let the server expand
    it, or pass an explicit ``app_config``. Passing both uses ``app_config`` and
    keeps the slug as a label, which is how "Business, tweaked" is expressed.

    Clearing it — ``profile_slug: null`` with no ``app_config`` — puts the
    department's members back on their role bundle, and switches API enforcement
    for them back off. That is deliberate: a department nobody has configured
    should not be silently enforcing a default.
    """

    profile_slug: str | None = Field(
        None,
        max_length=100,
        description="System bundle to seed from: engineering | people | business | full_access",
    )
    app_config: dict | None = Field(
        None,
        description="Explicit profile: {app_id: {enabled: bool, modules: {module_id: bool}}}",
    )
    default_persona: str | None = Field(
        None,
        max_length=32,
        description="Default sidebar view for people whose primary department this is",
    )


class DepartmentAccessProfileResponse(BaseModel):
    """A department's access profile, and how many people it decides for."""

    department_id: str
    department_name: str
    access_profile_slug: str | None = None
    app_config: dict = Field(default_factory=dict)
    default_persona: str | None = None
    # Apps the profile grants, for a one-line summary in the UI.
    enabled_app_ids: list[str] = Field(default_factory=list)
    member_count: int = 0


class MemberSummary(BaseModel):
    """A person on a department, flattened for display."""
    model_config = ConfigDict(from_attributes=True)

    id: str  # department_member id
    developer_id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    role_in_department: DepartmentMemberRole = "member"
    is_primary: bool = False
    allocation_percent: int = 100
    # Which headcount seat this person occupies, if any. Resolved from
    # `department_positions.filled_by_id` rather than stored on the membership —
    # the seat is the thing that is filled or open, so it owns the link.
    position_id: str | None = None
    position_title: str | None = None
    # Person-level reporting line, from `workspace_members.manager_id`. Carried
    # here so the org chart can nest people under whoever they report to instead
    # of listing a department as a flat count — the department tree answers "which
    # unit", this answers "who reports to whom" inside it.
    manager_id: str | None = None
    manager_name: str | None = None


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    function_key: str | None = None
    parent_id: str | None = None
    path: str = ""
    depth: int = 0
    position: int = 0
    head_id: str | None = None
    cost_center: str | None = None
    budget_amount: Decimal | None = None
    budget_currency: str | None = None
    headcount_planned: int = 0
    headcount_actual: int = 0  # derived from active members
    location: str | None = None
    timezone: str | None = None
    is_active: bool = True
    member_count: int = 0
    # Access profile. `access_profile_slug` is the label ("business"); the full
    # app_config is only returned by the access-profile endpoints, since the
    # department list is rendered in places that have no use for it.
    access_profile_slug: str | None = None
    has_access_profile: bool = False
    default_persona: str | None = None
    created_at: datetime
    updated_at: datetime


class DepartmentDetail(DepartmentResponse):
    """Department plus its members and its positions."""
    members: list[MemberSummary] = Field(default_factory=list)
    positions: list["PositionResponse"] = Field(default_factory=list)


class DepartmentNode(DepartmentResponse):
    """A node in the org-chart tree."""
    children: list["DepartmentNode"] = Field(default_factory=list)
    # The people in this department, each carrying their manager, so the chart can
    # draw the hierarchy rather than a member count. Previously the chart returned
    # departments only: a one-department workspace rendered as a single row reading
    # "3 members" and the reporting lines stored on `workspace_members.manager_id`
    # were visible nowhere at all.
    members: list[MemberSummary] = Field(default_factory=list)


# Resolve the self-referential forward ref in DepartmentNode.children.
DepartmentNode.model_rebuild()


# ==================== Membership ====================

class MembershipCreate(BaseModel):
    developer_id: str
    role_in_department: DepartmentMemberRole = "member"
    is_primary: bool = False
    allocation_percent: int = Field(100, ge=0, le=100)
    # Optional headcount seat in this department to place them in. Omitting it
    # leaves every seat as it was, which is the pre-existing behaviour.
    position_id: str | None = None


class MembershipUpdate(BaseModel):
    role_in_department: DepartmentMemberRole | None = None
    is_primary: bool | None = None
    allocation_percent: int | None = Field(None, ge=0, le=100)
    # Set to a seat id to place them in it, or explicitly to null to vacate the
    # seat they hold. Left unset, seats are untouched — so an unrelated role edit
    # cannot empty a seat by omission.
    position_id: str | None = None


# ==================== Positions ====================

class PositionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    status: PositionStatus = "open"
    filled_by_id: str | None = None


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    department_id: str
    title: str
    status: PositionStatus
    filled_by_id: str | None = None
    # Display name of whoever holds the seat, so "Filled" says who by. Populated
    # by the service; `from_attributes` cannot reach it through the FK.
    filled_by_name: str | None = None
    created_at: datetime


# DepartmentDetail.positions refers to PositionResponse before it is defined.
DepartmentDetail.model_rebuild()


# ==================== People ====================

class PersonDepartment(BaseModel):
    """One of a person's department memberships, flattened for display."""
    id: str
    name: str
    function_key: str | None = None
    role_in_department: DepartmentMemberRole = "member"
    is_primary: bool = False


class PersonSummary(BaseModel):
    """A workspace member seen from the Organization module's point of view.

    Deliberately keyed on ``developer_id`` rather than on a department
    membership: the whole point is to also surface the people who are in *no*
    department, who are invisible in any department-first view and are exactly
    the ones a new-joiner flow leaves behind.
    """
    developer_id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    workspace_role: str = "member"
    departments: list[PersonDepartment] = Field(default_factory=list)
    manager_id: str | None = None
    manager_name: str | None = None


# ==================== Reporting lines ====================

class ManagerAssign(BaseModel):
    manager_id: str | None = None


# ==================== Functions ====================

class FunctionOption(BaseModel):
    """One choice in the department "function" picker.

    The picker replaced a free-text box. A function key is a routing key —
    Service Desk visibility, digests and ticket auto-assignment all resolve it —
    so a typo produced an empty queue and no error, and there was nothing on
    screen to say the field mattered.
    """

    key: str
    label: str
    description: str
    # True for a workspace-specific `x_` key. Custom keys are first-class; they
    # simply have no registry description, and the UI says so rather than
    # inventing one.
    is_custom: bool = False
    # The department already holding this function in this workspace, if any.
    # `function_key` is unique per workspace, so an already-claimed option has to
    # say who has it instead of failing on save.
    claimed_by_department_id: str | None = None
    claimed_by_department_name: str | None = None
    # Service Desk stakeholder buckets in THIS workspace that route to this
    # function. Computed per workspace rather than declared in the registry: it
    # depends on the workspace's own taxonomy, which admins edit.
    routes_stakeholders: list[str] = Field(default_factory=list)


class FunctionCatalog(BaseModel):
    """Every function a department in this workspace may claim."""

    options: list[FunctionOption] = Field(default_factory=list)
    # Prefix a workspace-specific key must carry, so the UI doesn't hardcode it.
    custom_prefix: str = "x_"
    # Internal stakeholders whose function no active department claims — queues
    # whose members can currently see nothing. The one state this whole mapping
    # has no natural symptom for.
    unclaimed_stakeholder_functions: list[str] = Field(default_factory=list)


# ==================== Caller capabilities ====================

class OrganizationPermissions(BaseModel):
    """What the CALLER may do in this workspace's Organization module.

    Mirrors ``projects.py::get_my_permissions``. The Organization module has no
    settings object to hang this off (unlike Service Desk), and there is no
    workspace-level effective-permissions endpoint, so the UI needs a small
    dedicated read to know whether to offer editing controls. The server-side
    gate (``api/organization.py::require_manage_org``) remains the authority.
    """

    can_manage: bool = False
