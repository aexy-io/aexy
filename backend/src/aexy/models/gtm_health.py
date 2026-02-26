"""GTM Customer Health Scoring models."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class GTMHealthScore(Base):
    """Customer health score with multi-factor breakdown and trend tracking."""

    __tablename__ = "gtm_health_scores"

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

    # Score breakdown (0-100)
    total_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    engagement_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    usage_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    support_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nps_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    payment_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Derived status
    health_status: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    trend: Mapped[str] = mapped_column(String(20), nullable=False, default="stable")
    previous_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # History
    scoring_factors: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    score_history: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    last_scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "record_id", name="uq_health_scores_ws_record"),
        Index("ix_gtm_health_scores_ws_status", "workspace_id", "health_status"),
    )


class GTMHealthConfig(Base):
    """Per-workspace health scoring configuration."""

    __tablename__ = "gtm_health_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Weights (should sum to 100)
    weights: Mapped[dict] = mapped_column(
        JSONB, default=lambda: {"engagement": 25, "usage": 30, "support": 20, "nps": 15, "payment": 10},
        nullable=False,
    )

    # Thresholds
    healthy_threshold: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    at_risk_threshold: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    critical_threshold: Mapped[int] = mapped_column(Integer, default=20, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
