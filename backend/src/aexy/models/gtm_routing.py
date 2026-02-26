"""GTM Lead Routing models: Routing rules, lead assignments, and SLA tracking."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class GTMRoutingRule(Base):
    """Rule-based lead routing with assignment strategies and SLA definitions."""

    __tablename__ = "gtm_routing_rules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Match conditions: [{field, op, value}]
    conditions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Assignment strategy
    strategy: Mapped[str] = mapped_column(String(30), nullable=False, default="round_robin")
    # [{developer_id, weight, max_active}]
    assignee_pool: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # SLA configuration (minutes)
    sla_first_response_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sla_follow_up_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    assignments: Mapped[list["GTMLeadAssignment"]] = relationship(
        "GTMLeadAssignment", back_populates="routing_rule", lazy="noload",
    )

    # Fallback
    fallback_assignee_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )


class GTMLeadAssignment(Base):
    """Individual lead assignment with SLA tracking."""

    __tablename__ = "gtm_lead_assignments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    record_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    routing_rule_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("gtm_routing_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    assignee_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    # Relationships
    routing_rule: Mapped["GTMRoutingRule | None"] = relationship(
        "GTMRoutingRule", back_populates="assignments", lazy="selectin",
    )

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # SLA
    sla_first_response_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sla_breach_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_gtm_lead_assignments_ws_status", "workspace_id", "status"),
        Index("ix_gtm_lead_assignments_ws_assignee", "workspace_id", "assignee_id"),
    )
