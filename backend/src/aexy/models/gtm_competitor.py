"""GTM Competitor Intelligence models: Profiles, changes, and battle cards."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class CompetitorProfile(Base):
    """Tracked competitor with page monitoring config and current snapshot."""

    __tablename__ = "competitor_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)

    # Pages to monitor: [{url, label, last_checked_at}]
    tracked_pages: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Current known state: {pricing_tiers, key_features, positioning}
    current_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "domain", name="uq_competitor_profiles_ws_domain"),
    )


class CompetitorChange(Base):
    """Detected change on a competitor's tracked page."""

    __tablename__ = "competitor_changes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    competitor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("competitor_profiles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    page_url: Mapped[str] = mapped_column(Text, nullable=False)
    page_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")

    previous_content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    diff_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_competitor_changes_ws_detected", "workspace_id", detected_at.desc()),
    )


class BattleCard(Base):
    """LLM-generated competitive battle card with win/loss analysis."""

    __tablename__ = "battle_cards"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    competitor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("competitor_profiles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)

    strengths: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    weaknesses: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    our_advantages: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # [{objection, response}]
    objection_handling: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    talk_tracks: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    pricing_comparison: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Win/loss data
    win_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_deals: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    losses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    common_loss_reasons: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    common_win_reasons: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
