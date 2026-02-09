"""Developer Insights models - metrics snapshots for developer and team performance."""

import enum
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class PeriodType(str, enum.Enum):
    """Period type for metrics snapshots."""

    daily = "daily"
    weekly = "weekly"
    sprint = "sprint"
    monthly = "monthly"


class AlertSeverity(str, enum.Enum):
    """Severity levels for insight alerts."""

    info = "info"
    warning = "warning"
    critical = "critical"


class AlertStatus(str, enum.Enum):
    """Status of an alert instance."""

    triggered = "triggered"
    acknowledged = "acknowledged"
    resolved = "resolved"
    snoozed = "snoozed"


class ScheduleFrequency(str, enum.Enum):
    """Frequency for scheduled reports."""

    daily = "daily"
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"


class DeveloperMetricsSnapshot(Base):
    """Snapshot of computed developer metrics for a given period."""

    __tablename__ = "developer_metrics_snapshots"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Period definition
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_type: Mapped[PeriodType] = mapped_column(
        Enum(PeriodType, name="period_type_enum", create_constraint=False),
        default=PeriodType.weekly,
    )

    # Metric categories (JSONB for flexible schema evolution)
    velocity_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True, server_default=text("'{}'"))
    efficiency_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True, server_default=text("'{}'"))
    quality_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True, server_default=text("'{}'"))
    sustainability_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True, server_default=text("'{}'"))
    collaboration_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True, server_default=text("'{}'"))

    # Raw counts for debugging/auditing
    raw_counts: Mapped[dict | None] = mapped_column(JSONB, nullable=True, server_default=text("'{}'"))

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "developer_id",
            "workspace_id",
            "period_type",
            "period_start",
            name="uq_developer_metrics_snapshot",
        ),
    )


class TeamMetricsSnapshot(Base):
    """Snapshot of computed team-level metrics for a given period."""

    __tablename__ = "team_metrics_snapshots"

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
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Period definition
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_type: Mapped[PeriodType] = mapped_column(
        Enum(PeriodType, name="period_type_enum", create_constraint=False),
        default=PeriodType.weekly,
    )

    # Team-level aggregated metrics
    aggregate_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    distribution_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    member_count: Mapped[int] = mapped_column(Integer, default=0)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "team_id",
            "period_type",
            "period_start",
            name="uq_team_metrics_snapshot",
        ),
    )


class InsightSettings(Base):
    """Workspace-level or team-level insights configuration."""

    __tablename__ = "insight_settings"

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
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Working hours config
    working_hours: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="start_hour, end_hour, timezone, late_night_threshold_hour",
    )

    # Health score weights
    health_score_weights: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="velocity, efficiency, quality, sustainability, collaboration weights (sum to 1.0)",
    )

    # Bottleneck detection config
    bottleneck_multiplier: Mapped[float] = mapped_column(Float, default=2.0)

    # Snapshot generation config
    auto_generate_snapshots: Mapped[bool] = mapped_column(Boolean, default=False)
    snapshot_frequency: Mapped[str] = mapped_column(String(20), default="daily")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "team_id",
            name="uq_insight_settings_workspace_team",
        ),
    )


class DeveloperWorkingSchedule(Base):
    """Per-developer working schedule for timezone-aware metrics."""

    __tablename__ = "developer_working_schedules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    start_hour: Mapped[int] = mapped_column(Integer, default=9)
    end_hour: Mapped[int] = mapped_column(Integer, default=18)
    working_days: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Array of day numbers [0=Mon..6=Sun], default [0,1,2,3,4]",
    )
    late_night_threshold_hour: Mapped[int] = mapped_column(Integer, default=22)

    # Engineering role for role-based benchmarking
    # e.g. "junior", "mid", "senior", "staff", "principal", "lead", "architect"
    engineering_role: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "developer_id",
            "workspace_id",
            name="uq_developer_working_schedule",
        ),
    )


class InsightAlertRule(Base):
    """Configurable alert rules for insight metrics."""

    __tablename__ = "insight_alert_rules"

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
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What metric to monitor
    metric_category: Mapped[str] = mapped_column(
        String(50),
        comment="velocity, efficiency, quality, sustainability, collaboration, team",
    )
    metric_name: Mapped[str] = mapped_column(
        String(100),
        comment="Specific metric field name e.g. weekend_commit_ratio",
    )

    # Condition
    condition_operator: Mapped[str] = mapped_column(
        String(10),
        comment="gt, lt, gte, lte, eq, change_pct",
    )
    condition_value: Mapped[float] = mapped_column(Float)

    # Scope
    scope_type: Mapped[str] = mapped_column(
        String(20),
        default="team",
        comment="team, developer, workspace",
    )
    scope_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        comment="team_id or developer_id depending on scope_type",
    )

    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity_enum", create_constraint=False),
        default=AlertSeverity.warning,
    )

    # Notification channels (JSONB list)
    notification_channels: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment='["in_app", "email", "slack"]',
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class InsightAlertHistory(Base):
    """History of triggered insight alerts."""

    __tablename__ = "insight_alert_history"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    rule_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("insight_alert_rules.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Who/what triggered it
    developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Alert details
    metric_value: Mapped[float] = mapped_column(Float)
    threshold_value: Mapped[float] = mapped_column(Float)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity_enum", create_constraint=False),
        default=AlertSeverity.warning,
    )
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus, name="alert_status_enum", create_constraint=False),
        default=AlertStatus.triggered,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Acknowledgement
    acknowledged_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class InsightReportSchedule(Base):
    """Scheduled insight report definitions."""

    __tablename__ = "insight_report_schedules"

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
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Report config
    report_type: Mapped[str] = mapped_column(
        String(50),
        default="team_weekly",
        comment="team_weekly, developer_monthly, executive_monthly, custom",
    )
    config: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="metrics, filters, sections, team_ids, developer_ids",
    )

    # Schedule
    frequency: Mapped[ScheduleFrequency] = mapped_column(
        Enum(ScheduleFrequency, name="insight_schedule_freq_enum", create_constraint=False),
        default=ScheduleFrequency.weekly,
    )
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="0=Mon..6=Sun")
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="1-31")
    time_utc: Mapped[str] = mapped_column(String(5), default="09:00", comment="HH:MM")

    # Delivery
    recipients: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="List of email addresses",
    )
    export_format: Mapped[str] = mapped_column(String(10), default="pdf")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class SavedInsightDashboard(Base):
    """Saved/customized insight dashboard configurations."""

    __tablename__ = "saved_insight_dashboards"

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
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Dashboard layout
    layout: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Widget positions, sizes, grid config",
    )
    widgets: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="List of widget configs: type, metric, filters, visualization",
    )

    # Filters
    default_period_type: Mapped[str] = mapped_column(String(20), default="weekly")
    default_team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
