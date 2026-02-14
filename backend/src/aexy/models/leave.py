"""Leave management models for team calendar and leave tracking.

This module provides models for:
- LeaveType: Configurable leave categories (Vacation, Sick, etc.)
- LeavePolicy: Annual quotas and accrual rules per leave type
- LeaveRequest: Individual leave requests with approval workflow
- LeaveBalance: Denormalized yearly balances for fast lookups
- Holiday: Company/public holidays
"""

from datetime import date, datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class LeaveRequestStatus(str, Enum):
    """Status of a leave request."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    WITHDRAWN = "withdrawn"


class AccrualType(str, Enum):
    """How leave balance is accrued."""

    UPFRONT = "upfront"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class LeaveType(Base):
    """Configurable leave category.

    Defines leave types like Vacation, Sick Leave, Personal, WFH, Comp Off.
    Each workspace can customize their leave types.
    """

    __tablename__ = "leave_types"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_leave_type_workspace_slug"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6", nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    min_notice_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    allows_half_day: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Display order
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    policies: Mapped[list["LeavePolicy"]] = relationship(
        "LeavePolicy",
        back_populates="leave_type",
        cascade="all, delete-orphan",
    )


class LeavePolicy(Base):
    """Annual quotas and accrual rules for a leave type.

    Defines how many days of each leave type are allocated per year,
    with options for carry-forward and role/team scoping.
    """

    __tablename__ = "leave_policies"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "leave_type_id", name="uq_leave_policy_workspace_type"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("leave_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Quota
    annual_quota: Mapped[float] = mapped_column(Float, default=0, nullable=False)

    # Accrual
    accrual_type: Mapped[str] = mapped_column(
        String(20),
        default=AccrualType.UPFRONT.value,
        nullable=False,
    )

    # Carry forward
    carry_forward_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    max_carry_forward_days: Mapped[float] = mapped_column(
        Float, default=0, nullable=False
    )

    # Scoping: which roles and teams this policy applies to
    # Empty means applies to all
    applicable_roles: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    applicable_team_ids: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    leave_type: Mapped["LeaveType"] = relationship(
        "LeaveType",
        back_populates="policies",
        lazy="selectin",
    )


class LeaveRequest(Base):
    """Individual leave request with approval workflow.

    Represents a request from a developer to take leave.
    Flows: pending -> approved/rejected, or pending -> withdrawn, or approved -> cancelled.
    """

    __tablename__ = "leave_requests"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("leave_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Dates
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    is_half_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    half_day_period: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # "first_half" or "second_half"
    total_days: Mapped[float] = mapped_column(Float, nullable=False)

    # Request details
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default=LeaveRequestStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Approval
    approver_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Calendar integration
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
        lazy="selectin",
    )
    leave_type: Mapped["LeaveType"] = relationship("LeaveType", lazy="selectin")
    approver: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[approver_id],
        lazy="selectin",
    )


class LeaveBalance(Base):
    """Denormalized yearly leave balance for fast dashboard lookups.

    Updated transactionally with request state changes.
    Provides constant-time balance lookups instead of computing on-the-fly.
    """

    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint(
            "developer_id",
            "leave_type_id",
            "year",
            name="uq_leave_balance_dev_type_year",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("leave_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    year: Mapped[int] = mapped_column(Integer, nullable=False)

    total_allocated: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    used: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    pending: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    carried_forward: Mapped[float] = mapped_column(Float, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    leave_type: Mapped["LeaveType"] = relationship("LeaveType", lazy="selectin")

    @property
    def available(self) -> float:
        """Calculate available balance."""
        return self.total_allocated + self.carried_forward - self.used - self.pending


class Holiday(Base):
    """Company or public holiday.

    Represents holidays that affect the whole workspace or specific teams.
    Used in business day calculations and calendar display.
    """

    __tablename__ = "holidays"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_optional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Team scoping: empty means all teams
    applicable_team_ids: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")


# Default leave types to seed for new workspaces
DEFAULT_LEAVE_TYPES = [
    {
        "name": "Vacation",
        "slug": "vacation",
        "color": "#3b82f6",
        "icon": "Palmtree",
        "is_paid": True,
        "requires_approval": True,
        "min_notice_days": 3,
        "allows_half_day": True,
        "sort_order": 0,
    },
    {
        "name": "Sick Leave",
        "slug": "sick",
        "color": "#ef4444",
        "icon": "Heart",
        "is_paid": True,
        "requires_approval": False,
        "min_notice_days": 0,
        "allows_half_day": True,
        "sort_order": 1,
    },
    {
        "name": "Personal",
        "slug": "personal",
        "color": "#8b5cf6",
        "icon": "User",
        "is_paid": True,
        "requires_approval": True,
        "min_notice_days": 1,
        "allows_half_day": True,
        "sort_order": 2,
    },
    {
        "name": "Work From Home",
        "slug": "wfh",
        "color": "#10b981",
        "icon": "Home",
        "is_paid": True,
        "requires_approval": False,
        "min_notice_days": 0,
        "allows_half_day": False,
        "sort_order": 3,
    },
    {
        "name": "Comp Off",
        "slug": "comp-off",
        "color": "#f59e0b",
        "icon": "Clock",
        "is_paid": True,
        "requires_approval": True,
        "min_notice_days": 1,
        "allows_half_day": True,
        "sort_order": 4,
    },
]
