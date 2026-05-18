"""Workspace and workspace membership models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
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

    # Monotonic per-workspace counter used to assign SprintTask.task_key.
    # Always read+incremented atomically in one UPDATE ... RETURNING.
    next_task_key: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    # LLM usage counters — month-to-date totals. Reset lazily on first
    # usage of the new month via the LimitsService. The provider
    # breakdown JSONB lets the UI render "10k deepseek + 2k ollama"
    # without joining the per-call analysis cache.
    llm_tokens_used_this_month: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    llm_input_tokens_this_month: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    llm_output_tokens_this_month: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    llm_requests_this_month: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    llm_tokens_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    llm_provider_breakdown: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    # Month-to-date overage in cents — accumulated only when the
    # workspace's plan has `enable_overage_billing=True` and usage
    # crosses `free_llm_tokens_per_month`. Reset alongside the other
    # monthly counters.
    llm_overage_cost_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

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
    plan_override: Mapped["WorkspacePlanOverride | None"] = relationship(
        "WorkspacePlanOverride",
        back_populates="workspace",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="select",
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

    # Billing model for this subscription
    billing_model: Mapped[str] = mapped_column(
        String(50), nullable=False, default="per_seat"
    )  # "per_seat" | "flat_plus_usage" | "postpaid"

    # Seat-based pricing
    base_seats: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    additional_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_per_additional_seat_cents: Mapped[int] = mapped_column(
        Integer, default=1000, nullable=False  # $10 per seat default
    )

    # Flat base fee (for flat_plus_usage model)
    base_fee_monthly_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Metered usage Stripe subscription item (for flat_plus_usage and postpaid)
    usage_subscription_item_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    # Payment timing
    payment_timing: Mapped[str] = mapped_column(
        String(50), nullable=False, default="prepaid"
    )  # "prepaid" | "postpaid"

    # Postpaid tracking
    postpaid_usage_accrued_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    postpaid_last_settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Preferred payment method: "stripe" | "bank_transfer"
    preferred_payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="stripe"
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


class WorkspacePlanOverride(Base):
    """Per-workspace plan overrides. Non-null fields override the base plan."""

    __tablename__ = "workspace_plan_overrides"

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

    # Billing model override
    billing_model: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Pricing overrides (all nullable — null means use plan default)
    price_monthly_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_fee_monthly_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    per_seat_price_monthly_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    included_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Sync limit overrides
    max_repos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_commits_per_repo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_prs_per_repo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sync_history_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Storage quota override (GB; -1 = unlimited).
    max_storage_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # LLM limit overrides
    llm_requests_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_requests_per_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_tokens_per_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_provider_access: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True
    )
    free_llm_tokens_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_input_cost_per_1k_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_output_cost_per_1k_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enable_overage_billing: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Feature flag overrides
    enable_real_time_sync: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_advanced_analytics: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_exports: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_webhooks: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    enable_team_features: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Payment timing override
    payment_timing: Mapped[str | None] = mapped_column(String(50), nullable=True)
    requires_payment_method: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Stripe overrides (custom Stripe product/price for this org)
    stripe_product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Net terms and payment method
    days_until_due: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Discount
    discount_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discount_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Admin notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    configured_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

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

    # Relationship
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="plan_override",
        lazy="select",
    )
