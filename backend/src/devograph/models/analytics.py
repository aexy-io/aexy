"""Analytics models: custom reports, scheduled reports, export jobs, and predictive insights."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


class CustomReport(Base):
    """User-created custom report with configurable widgets."""

    __tablename__ = "custom_reports"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    creator_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    organization_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Report configuration (JSONB)
    widgets: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )  # [{type, metric, config, position}]
    filters: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {date_range, team_ids, developer_ids}
    layout: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {columns, rows, responsive}

    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    creator: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="custom_reports",
    )
    schedules: Mapped[list["ScheduledReport"]] = relationship(
        "ScheduledReport",
        back_populates="report",
        cascade="all, delete-orphan",
    )


class ScheduledReport(Base):
    """Scheduled delivery configuration for a custom report."""

    __tablename__ = "scheduled_reports"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    report_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("custom_reports.id", ondelete="CASCADE"),
        index=True,
    )

    schedule: Mapped[str] = mapped_column(String(20))  # "daily", "weekly", "monthly"
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-6 for weekly
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-31 for monthly
    time_utc: Mapped[str] = mapped_column(String(5))  # "09:00"

    recipients: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # Email addresses
    delivery_method: Mapped[str] = mapped_column(String(20))  # "email", "slack", "both"
    export_format: Mapped[str] = mapped_column(String(10))  # "pdf", "csv", "json"

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    report: Mapped["CustomReport"] = relationship(
        "CustomReport",
        back_populates="schedules",
    )


class ExportJob(Base):
    """Async export job for generating PDF, CSV, or Excel files."""

    __tablename__ = "export_jobs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    requested_by: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    export_type: Mapped[str] = mapped_column(String(50))  # "report", "developer_profile", "team_analytics"
    format: Mapped[str] = mapped_column(String(10))  # "pdf", "csv", "json", "xlsx"

    # Configuration
    config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # Export-specific settings

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
    )  # "pending", "processing", "completed", "failed"
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # S3/local path
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # Auto-cleanup

    # Relationships
    requester: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="export_jobs",
    )


class PredictiveInsight(Base):
    """LLM-generated predictive insight for developers or teams."""

    __tablename__ = "predictive_insights"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )  # Null for team-level insights
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )  # For team-level insights

    insight_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
    )  # "attrition_risk", "performance_trajectory", "burnout_risk", "team_health"

    # LLM-generated analysis (JSONB)
    risk_score: Mapped[float] = mapped_column(Float)  # 0.0 - 1.0
    confidence: Mapped[float] = mapped_column(Float)  # 0.0 - 1.0
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "low", "moderate", "high", "critical"
    factors: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )  # [{factor, weight, evidence, trend}]
    recommendations: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )
    raw_analysis: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # Full LLM response

    # Metadata
    data_window_days: Mapped[int] = mapped_column(Integer)  # Days of data analyzed
    generated_by_model: Mapped[str] = mapped_column(String(100))
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # Cache expiry

    # Relationships
    developer: Mapped["Developer | None"] = relationship(
        "Developer",
        back_populates="predictive_insights",
    )
