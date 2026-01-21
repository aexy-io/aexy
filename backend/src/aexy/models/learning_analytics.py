"""Learning analytics and reporting models."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class SnapshotType(str, Enum):
    """Types of analytics snapshots."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class ReportType(str, Enum):
    """Types of learning reports."""
    EXECUTIVE_SUMMARY = "executive_summary"
    TEAM_PROGRESS = "team_progress"
    INDIVIDUAL_PROGRESS = "individual_progress"
    COMPLIANCE_STATUS = "compliance_status"
    BUDGET_UTILIZATION = "budget_utilization"
    SKILL_GAP_ANALYSIS = "skill_gap_analysis"
    ROI_ANALYSIS = "roi_analysis"
    CERTIFICATION_TRACKING = "certification_tracking"
    CUSTOM = "custom"


class ReportScheduleFrequency(str, Enum):
    """Report schedule frequencies."""
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class ReportRunStatus(str, Enum):
    """Report run status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class LearningAnalyticsSnapshot(Base):
    """Pre-computed metrics snapshots for performance.

    Stores aggregated analytics data at regular intervals
    to enable fast dashboard loading and trend analysis.
    """

    __tablename__ = "learning_analytics_snapshots"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Snapshot details
    snapshot_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )
    snapshot_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
    )  # "daily", "weekly", "monthly", "quarterly", "yearly"

    # Scope (optional - can be workspace-wide, team, or individual)
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Aggregated metrics (stored as JSON for flexibility)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example metrics structure:
    # {
    #   "learning_hours": 150.5,
    #   "courses_completed": 25,
    #   "certifications_earned": 5,
    #   "active_learners": 45,
    #   "goal_completion_rate": 78.5,
    #   "compliance_rate": 95.2,
    #   "budget_utilization": 65.0,
    #   "avg_progress_percentage": 42.3,
    #   "overdue_goals": 3,
    #   "pending_approvals": 8,
    #   "skill_distribution": {"python": 30, "aws": 25, "kubernetes": 15},
    #   "completion_by_type": {"course": 20, "certification": 5},
    # }

    # Comparison metrics (vs previous period)
    comparison_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Example:
    # {
    #   "learning_hours_change": 15.2,  # percentage change
    #   "courses_completed_change": 25.0,
    #   "compliance_rate_change": 2.1,
    # }

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")


class LearningReportDefinition(Base):
    """Saved report definitions.

    Allows users to save report configurations for reuse
    and schedule automated report generation.
    """

    __tablename__ = "learning_report_definitions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    created_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Report details
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_type: Mapped[str] = mapped_column(String(50))

    # Report configuration
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example config:
    # {
    #   "date_range": {"type": "last_30_days"},
    #   "filters": {"team_ids": [...], "developer_ids": [...]},
    #   "metrics": ["learning_hours", "courses_completed", "compliance_rate"],
    #   "group_by": "team",
    #   "include_charts": true,
    #   "include_raw_data": false,
    # }

    # Scheduling
    is_scheduled: Mapped[bool] = mapped_column(Boolean, default=False)
    schedule_frequency: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )  # "daily", "weekly", "biweekly", "monthly", "quarterly"
    schedule_day: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # Day of week (0-6) or day of month (1-31)
    schedule_time: Mapped[str | None] = mapped_column(
        String(5),
        nullable=True,
    )  # HH:MM format
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Recipients for scheduled reports
    recipients: Mapped[list[str]] = mapped_column(
        ARRAY(String(255)),
        default=list,
    )  # Email addresses

    # Export settings
    export_format: Mapped[str] = mapped_column(
        String(10),
        default="pdf",
    )  # "pdf", "csv", "xlsx"

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Metadata
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)

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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    created_by: Mapped["Developer | None"] = relationship("Developer")
    runs: Mapped[list["LearningReportRun"]] = relationship(
        "LearningReportRun",
        back_populates="report_definition",
        cascade="all, delete-orphan",
    )


class LearningReportRun(Base):
    """Report run history and results.

    Tracks each execution of a report with results and metrics.
    """

    __tablename__ = "learning_report_runs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    report_definition_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_report_definitions.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Run details
    status: Mapped[str] = mapped_column(
        String(50),
        default=ReportRunStatus.PENDING.value,
        index=True,
    )
    triggered_by: Mapped[str] = mapped_column(
        String(50),
        default="manual",
    )  # "manual", "scheduled", "api"

    # Execution timing
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Results
    result_file_path: Mapped[str | None] = mapped_column(
        String(2048),
        nullable=True,
    )  # S3/storage path
    result_file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_file_format: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Summary metrics from the report
    metrics_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Example:
    # {
    #   "total_records": 150,
    #   "date_range": {"start": "...", "end": "..."},
    #   "key_metrics": {"learning_hours": 500, "courses_completed": 45},
    # }

    # Error handling
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    report_definition: Mapped["LearningReportDefinition"] = relationship(
        "LearningReportDefinition",
        back_populates="runs",
    )
    workspace: Mapped["Workspace"] = relationship("Workspace")
