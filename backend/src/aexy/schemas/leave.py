"""Leave management schemas for API request/response validation."""
from __future__ import annotations
import datetime as _dt


from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# === Leave Type Schemas ===


class LeaveTypeCreate(BaseModel):
    """Schema for creating a leave type."""

    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: str = Field(default="#3b82f6", max_length=20)
    icon: str | None = Field(default=None, max_length=50)
    is_paid: bool = True
    requires_approval: bool = True
    min_notice_days: int = Field(default=0, ge=0)
    allows_half_day: bool = True
    sort_order: int = 0


class LeaveTypeUpdate(BaseModel):
    """Schema for updating a leave type."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=50)
    is_paid: bool | None = None
    requires_approval: bool | None = None
    min_notice_days: int | None = Field(default=None, ge=0)
    allows_half_day: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class LeaveTypeResponse(BaseModel):
    """Schema for leave type response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    color: str
    icon: str | None = None
    is_paid: bool
    requires_approval: bool
    min_notice_days: int
    allows_half_day: bool
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


# === Leave Policy Schemas ===


class LeavePolicyCreate(BaseModel):
    """Schema for creating a leave policy."""

    leave_type_id: str
    annual_quota: float = Field(default=0, ge=0)
    accrual_type: str = Field(default="upfront")
    carry_forward_enabled: bool = False
    max_carry_forward_days: float = Field(default=0, ge=0)
    applicable_roles: list[str] = Field(default_factory=list)
    applicable_team_ids: list[str] = Field(default_factory=list)


class LeavePolicyUpdate(BaseModel):
    """Schema for updating a leave policy."""

    annual_quota: float | None = Field(default=None, ge=0)
    accrual_type: str | None = None
    carry_forward_enabled: bool | None = None
    max_carry_forward_days: float | None = Field(default=None, ge=0)
    applicable_roles: list[str] | None = None
    applicable_team_ids: list[str] | None = None
    is_active: bool | None = None


class LeavePolicyResponse(BaseModel):
    """Schema for leave policy response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    leave_type_id: str
    leave_type: LeaveTypeResponse | None = None
    annual_quota: float
    accrual_type: str
    carry_forward_enabled: bool
    max_carry_forward_days: float
    applicable_roles: list[str]
    applicable_team_ids: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


# === Leave Request Schemas ===


class DeveloperBrief(BaseModel):
    """Brief developer info for leave responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class LeaveRequestCreate(BaseModel):
    """Schema for submitting a leave request."""

    leave_type_id: str
    start_date: date
    end_date: date
    is_half_day: bool = False
    half_day_period: str | None = None  # "first_half" or "second_half"
    reason: str | None = None


class LeaveRequestResponse(BaseModel):
    """Schema for leave request response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    leave_type_id: str
    developer: DeveloperBrief | None = None
    leave_type: LeaveTypeResponse | None = None
    approver: DeveloperBrief | None = None
    start_date: date
    end_date: date
    is_half_day: bool
    half_day_period: str | None = None
    total_days: float
    reason: str | None = None
    status: str
    approver_id: str | None = None
    approved_at: datetime | None = None
    rejection_reason: str | None = None
    calendar_event_id: str | None = None
    created_at: datetime
    updated_at: datetime


class LeaveRequestActionRequest(BaseModel):
    """Schema for approve/reject actions."""

    reason: str | None = None


# === Leave Balance Schemas ===


class LeaveBalanceResponse(BaseModel):
    """Schema for leave balance response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    leave_type_id: str
    leave_type: LeaveTypeResponse | None = None
    year: int
    total_allocated: float
    used: float
    pending: float
    carried_forward: float
    available: float


# === Holiday Schemas ===


class HolidayCreate(BaseModel):
    """Schema for creating a holiday."""

    name: str = Field(..., min_length=1, max_length=255)
    date: date
    description: str | None = None
    is_optional: bool = False
    applicable_team_ids: list[str] = Field(default_factory=list)


class HolidayUpdate(BaseModel):
    """Schema for updating a holiday."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    date: _dt.date | None = None
    description: str | None = None
    is_optional: bool | None = None
    applicable_team_ids: list[str] | None = None


class HolidayResponse(BaseModel):
    """Schema for holiday response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    date: date
    description: str | None = None
    is_optional: bool
    applicable_team_ids: list[str]
    created_at: datetime
    updated_at: datetime
