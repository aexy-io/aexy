"""GTM Account-Based Marketing models: Target lists and account tracking."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class ABMTargetList(Base):
    """Target account list with optional dynamic criteria."""

    __tablename__ = "abm_target_lists"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Dynamic list criteria: {industries, employee_ranges, revenue_ranges, locations}
    criteria: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_dynamic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    account_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Relationships
    accounts: Mapped[list["ABMAccount"]] = relationship(
        "ABMAccount", back_populates="target_list", lazy="noload",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )


class ABMAccount(Base):
    """Individual account in a target list with engagement tracking."""

    __tablename__ = "abm_accounts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    target_list_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("abm_target_lists.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Relationships
    target_list: Mapped["ABMTargetList"] = relationship(
        "ABMTargetList", back_populates="accounts", lazy="selectin",
    )

    tier: Mapped[str] = mapped_column(String(10), nullable=False, default="tier_2")
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="unaware")
    owner_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    engagement_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Contact metrics
    total_contacts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    identified_contacts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    decision_makers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Activity metrics
    contacts_in_sequences: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    emails_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    emails_replied: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    meetings_booked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deals_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    assigned_campaigns: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    stage_history: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("target_list_id", "record_id", name="uq_abm_accounts_list_record"),
        Index("ix_abm_accounts_ws_stage", "workspace_id", "stage"),
        Index("ix_abm_accounts_ws_tier", "workspace_id", "tier"),
    )
