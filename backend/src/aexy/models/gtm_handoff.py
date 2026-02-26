"""GTM CS-to-Sales Handoff models."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class GTMHandoff(Base):
    """CS-to-Sales handoff with context, SLA tracking, and deal conversion."""

    __tablename__ = "gtm_handoffs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Participants
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    assigned_to: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    # Handoff details
    handoff_type: Mapped[str] = mapped_column(String(20), nullable=False, default="expansion")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    products: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    signals: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Status flow: pending -> accepted/declined -> in_progress -> converted/lost
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Conversion
    deal_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    outcome_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SLA
    sla_accept_minutes: Mapped[int] = mapped_column(Integer, default=120, nullable=False)
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_gtm_handoffs_ws_status", "workspace_id", "status"),
        Index("ix_gtm_handoffs_ws_assigned", "workspace_id", "assigned_to"),
    )
