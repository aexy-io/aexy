"""Workspace and workspace membership models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.google_integration import GoogleIntegration
    from aexy.models.plan import Plan
    from aexy.models.repository import Organization
    from aexy.models.review import ReviewCycle, WorkGoal
    from aexy.models.role import CustomRole
    from aexy.models.team import Team


class Workspace(Base):
    """Workspace model - represents an organization/company workspace."""

    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="internal"
    )  # "internal" | "github_linked"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # GitHub linking (optional - only for github_linked type)
    github_org_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Owner (the paying member)
    owner_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Subscription plan
    plan_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Settings (JSONB for flexibility)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timestamps
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
    owner: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[owner_id],
        lazy="selectin",
    )
    github_org: Mapped["Organization | None"] = relationship(
        "Organization",
        foreign_keys=[github_org_id],
        lazy="selectin",
    )
    plan: Mapped["Plan | None"] = relationship(
        "Plan",
        foreign_keys=[plan_id],
        lazy="selectin",
    )
    members: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember",
        back_populates="workspace",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    teams: Mapped[list["Team"]] = relationship(
        "Team",
        back_populates="workspace",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    subscription: Mapped["WorkspaceSubscription | None"] = relationship(
        "WorkspaceSubscription",
        back_populates="workspace",
        uselist=False,
        lazy="selectin",
    )
    pending_invites: Mapped[list["WorkspacePendingInvite"]] = relationship(
        "WorkspacePendingInvite",
        back_populates="workspace",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    review_cycles: Mapped[list["ReviewCycle"]] = relationship(
        "ReviewCycle",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    work_goals: Mapped[list["WorkGoal"]] = relationship(
        "WorkGoal",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    google_integration: Mapped["GoogleIntegration | None"] = relationship(
        "GoogleIntegration",
        back_populates="workspace",
        uselist=False,
        cascade="all, delete-orphan",
    )


class WorkspaceMember(Base):
    """Workspace membership model - tracks who belongs to a workspace."""

    __tablename__ = "workspace_members"

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

    # Legacy role within workspace (kept for backwards compatibility)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member"
    )  # "owner" | "admin" | "member" | "viewer"

    # Custom role reference (new - takes precedence over legacy role)
    role_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("custom_roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Permission overrides at org level (beyond role permissions)
    # Example: {"can_manage_crm": true, "can_view_billing": false}
    permission_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Invitation state
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # "pending" | "active" | "suspended" | "removed"

    invited_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    invited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Billing
    is_billable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    billing_start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # App permissions for this member (overrides workspace defaults)
    # Example: {"hiring": true, "tracking": false, "oncall": true}
    app_permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Timestamps
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="members",
        lazy="selectin",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
        lazy="selectin",
    )
    invited_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[invited_by_id],
        lazy="selectin",
    )
    custom_role: Mapped["CustomRole | None"] = relationship(
        "CustomRole",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "developer_id", name="uq_workspace_member"),
    )


class WorkspaceSubscription(Base):
    """Workspace subscription model - per-seat billing for workspaces."""

    __tablename__ = "workspace_subscriptions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Stripe info
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Seat-based pricing
    base_seats: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    additional_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_per_additional_seat_cents: Mapped[int] = mapped_column(
        Integer, default=1000, nullable=False  # $10 per seat default
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # "active" | "past_due" | "canceled" | "trialing"

    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="subscription",
        lazy="selectin",
    )


class WorkspacePendingInvite(Base):
    """Pending workspace invitations for users who haven't signed up yet."""

    __tablename__ = "workspace_pending_invites"

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
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member"
    )  # "admin" | "member" | "viewer"

    # Invitation token for accepting
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # Who invited them
    invited_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # App permissions to apply when they join
    app_permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # "pending" | "accepted" | "expired" | "revoked"

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="pending_invites",
        lazy="selectin",
    )
    invited_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[invited_by_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "email", name="uq_workspace_pending_invite"),
    )
