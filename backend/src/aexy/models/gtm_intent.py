"""GTM Intent Signal models: Buying intent detection and tracking."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class IntentSignal(Base):
    """Individual buying intent signal detected from external sources."""

    __tablename__ = "intent_signals"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    company_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    company_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    signal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    confidence_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    intent_strength: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")

    signal_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_intent_signals_ws_type", "workspace_id", "signal_type"),
        Index("ix_intent_signals_ws_strength", "workspace_id", "intent_strength"),
    )


class IntentSignalConfig(Base):
    """Per-workspace intent signal monitoring configuration."""

    __tablename__ = "intent_signal_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )

    monitored_domains: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    job_title_keywords: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    tech_keywords: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    competitor_names: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    signal_weights: Mapped[dict] = mapped_column(
        JSONB, default=lambda: {"job_posting": 15, "tech_change": 10, "review_activity": 8, "competitor_eval": 20, "funding_event": 12},
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
