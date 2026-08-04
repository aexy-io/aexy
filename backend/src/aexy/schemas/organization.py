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


class MembershipUpdate(BaseModel):
    role_in_department: DepartmentMemberRole | None = None
    is_primary: bool | None = None
    allocation_percent: int | None = Field(None, ge=0, le=100)


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
