"""GTM Expansion Playbook models: Upsell/cross-sell automation."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class GTMExpansionPlaybook(Base):
    """Automated expansion playbook with trigger conditions and step sequences."""

    __tablename__ = "gtm_expansion_playbooks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    playbook_type: Mapped[str] = mapped_column(String(20), nullable=False, default="upsell")
    trigger_conditions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    target_product: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Steps: [{step_index, type, delay_days, config}]
    steps: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    enrollments: Mapped[list["GTMExpansionEnrollment"]] = relationship(
        "GTMExpansionEnrollment", back_populates="playbook", lazy="noload",
    )

    # Aggregate metrics
    total_enrollments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conversion_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_revenue_generated: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

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


class GTMExpansionEnrollment(Base):
    """Customer enrollment in an expansion playbook."""

    __tablename__ = "gtm_expansion_enrollments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    playbook_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("gtm_expansion_playbooks.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    record_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    # Relationships
    playbook: Mapped["GTMExpansionPlaybook"] = relationship(
        "GTMExpansionPlaybook", back_populates="enrollments", lazy="selectin",
    )

    assigned_to: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    current_step_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    trigger_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    outcome: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_gtm_expansion_enrollments_ws_status", "workspace_id", "status"),
    )
