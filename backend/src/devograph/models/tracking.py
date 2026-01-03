"""Tracking models: Standups, work logs, time entries, blockers, and activity patterns."""

from datetime import date, datetime, time
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devograph.core.database import Base

if TYPE_CHECKING:
    from devograph.models.developer import Developer
    from devograph.models.integrations import SlackIntegration
    from devograph.models.sprint import Sprint, SprintTask
    from devograph.models.team import Team
    from devograph.models.workspace import Workspace


class TrackingSource(str, Enum):
    """Source of tracking data."""

    SLACK_COMMAND = "slack_command"
    SLACK_CHANNEL = "slack_channel"
    WEB = "web"
    API = "api"
    INFERRED = "inferred"


class BlockerSeverity(str, Enum):
    """Severity levels for blockers."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class BlockerCategory(str, Enum):
    """Categories for blockers."""

    TECHNICAL = "technical"
    DEPENDENCY = "dependency"
    RESOURCE = "resource"
    EXTERNAL = "external"
    PROCESS = "process"
    OTHER = "other"


class BlockerStatus(str, Enum):
    """Status of a blocker."""

    ACTIVE = "active"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class WorkLogType(str, Enum):
    """Types of work logs."""

    PROGRESS = "progress"
    NOTE = "note"
    QUESTION = "question"
    DECISION = "decision"
    UPDATE = "update"


class ChannelType(str, Enum):
    """Types of monitored Slack channels."""

    STANDUP = "standup"
    TEAM = "team"
    PROJECT = "project"
    GENERAL = "general"


class DeveloperStandup(Base):
    """Daily standup records from developers."""

    __tablename__ = "developer_standups"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Standup content
    standup_date: Mapped[date] = mapped_column(Date, nullable=False)
    yesterday_summary: Mapped[str] = mapped_column(Text, nullable=False)
    today_plan: Mapped[str] = mapped_column(Text, nullable=False)
    blockers_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Source tracking
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default=TrackingSource.WEB.value
    )
    slack_message_ts: Mapped[str | None] = mapped_column(String(50), nullable=True)
    slack_channel_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Parsed data (from LLM or regex)
    parsed_tasks: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # [{task_id, task_ref, action, notes}]
    parsed_blockers: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # [{description, task_id?, severity}]

    # LLM analysis results
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    productivity_signals: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # {focus_level, confidence, concerns}

    # Timestamps
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    team: Mapped["Team"] = relationship("Team", lazy="selectin")
    sprint: Mapped["Sprint | None"] = relationship("Sprint", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "developer_id", "standup_date", name="uq_developer_standup_date"
        ),
        Index("ix_standups_workspace_date", "workspace_id", "standup_date"),
        Index("ix_standups_team_date", "team_id", "standup_date"),
    )


class WorkLog(Base):
    """Work logs/notes for tasks from Slack or web."""

    __tablename__ = "work_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Log content
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    log_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=WorkLogType.PROGRESS.value
    )

    # Source tracking
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default=TrackingSource.WEB.value
    )
    slack_message_ts: Mapped[str | None] = mapped_column(String(50), nullable=True)
    slack_channel_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # External task reference (if task not in system)
    external_task_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    task: Mapped["SprintTask | None"] = relationship("SprintTask", lazy="selectin")
    sprint: Mapped["Sprint | None"] = relationship("Sprint", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        Index("ix_work_logs_task_logged", "task_id", "logged_at"),
        Index("ix_work_logs_developer_logged", "developer_id", "logged_at"),
    )


class TimeEntry(Base):
    """Time tracking entries."""

    __tablename__ = "time_entries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Time data
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Optional start/end for more precise tracking
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Source tracking
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default=TrackingSource.WEB.value
    )
    slack_message_ts: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Inferred time (from activity patterns)
    is_inferred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    inference_metadata: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # {method, signals_used, source_messages}

    # External task reference
    external_task_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    task: Mapped["SprintTask | None"] = relationship("SprintTask", lazy="selectin")
    sprint: Mapped["Sprint | None"] = relationship("Sprint", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        Index("ix_time_entries_developer_date", "developer_id", "entry_date"),
        Index("ix_time_entries_task_date", "task_id", "entry_date"),
        Index("ix_time_entries_sprint_date", "sprint_id", "entry_date"),
    )


class Blocker(Base):
    """Blockers/impediments tracking."""

    __tablename__ = "blockers"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Blocker details
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BlockerSeverity.MEDIUM.value
    )
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, default=BlockerCategory.OTHER.value
    )

    # Status tracking
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BlockerStatus.ACTIVE.value
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Source tracking
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default=TrackingSource.WEB.value
    )
    slack_message_ts: Mapped[str | None] = mapped_column(String(50), nullable=True)
    slack_channel_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Link to standup if from standup
    standup_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developer_standups.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Escalation tracking
    escalated_to_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    escalated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    escalation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # External task reference
    external_task_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer", foreign_keys=[developer_id], lazy="selectin"
    )
    resolved_by: Mapped["Developer | None"] = relationship(
        "Developer", foreign_keys=[resolved_by_id], lazy="selectin"
    )
    escalated_to: Mapped["Developer | None"] = relationship(
        "Developer", foreign_keys=[escalated_to_id], lazy="selectin"
    )
    task: Mapped["SprintTask | None"] = relationship("SprintTask", lazy="selectin")
    sprint: Mapped["Sprint | None"] = relationship("Sprint", lazy="selectin")
    team: Mapped["Team"] = relationship("Team", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    standup: Mapped["DeveloperStandup | None"] = relationship(
        "DeveloperStandup", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_blockers_team_status", "team_id", "status"),
        Index("ix_blockers_workspace_status", "workspace_id", "status"),
        Index("ix_blockers_developer_status", "developer_id", "status"),
    )


class SlackChannelConfig(Base):
    """Configuration for monitored Slack channels."""

    __tablename__ = "slack_channel_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("slack_integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Channel info
    channel_id: Mapped[str] = mapped_column(String(50), nullable=False)
    channel_name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ChannelType.TEAM.value
    )

    # Parsing settings
    auto_parse_standups: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_parse_task_refs: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_parse_blockers: Mapped[bool] = mapped_column(Boolean, default=True)

    # Standup configuration
    standup_prompt_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    standup_format_hint: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Expected format guidance

    # Active status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    integration: Mapped["SlackIntegration"] = relationship(
        "SlackIntegration", lazy="selectin"
    )
    team: Mapped["Team"] = relationship("Team", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "integration_id", "channel_id", name="uq_slack_channel_integration"
        ),
        Index("ix_channel_configs_workspace", "workspace_id", "is_active"),
    )


class DeveloperActivityPattern(Base):
    """Aggregated activity patterns per developer."""

    __tablename__ = "developer_activity_patterns"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Standup patterns
    avg_standup_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    standup_consistency_score: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )  # 0-1
    standup_streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Work log patterns
    avg_work_logs_per_day: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    avg_time_logged_per_day: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )  # minutes

    # Blocker patterns
    blocker_frequency: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )  # blockers per week
    avg_blocker_resolution_hours: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    # Activity windows
    most_active_hours: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # [hour1, hour2, ...]
    most_active_days: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # [day_of_week, ...]

    # Slack activity signals
    avg_messages_per_day: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    response_time_avg_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Analysis period
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    sprint: Mapped["Sprint | None"] = relationship("Sprint", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        Index("ix_activity_patterns_developer_period", "developer_id", "period_start"),
        Index("ix_activity_patterns_sprint", "sprint_id"),
    )


class StandupSummary(Base):
    """Aggregated standup summary for sprints/teams."""

    __tablename__ = "standup_summaries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Summary date
    summary_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Participation metrics
    total_team_members: Mapped[int] = mapped_column(Integer, nullable=False)
    standups_submitted: Mapped[int] = mapped_column(Integer, nullable=False)
    participation_rate: Mapped[float] = mapped_column(Float, nullable=False)  # 0-1

    # Content aggregation
    combined_yesterday: Mapped[str | None] = mapped_column(Text, nullable=True)
    combined_today: Mapped[str | None] = mapped_column(Text, nullable=True)
    combined_blockers: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Task references found
    tasks_mentioned: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, default=None
    )  # [{task_id, count, context}]

    # Blocker summary
    active_blockers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_blockers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Sentiment analysis
    avg_sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    team_mood: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # positive, neutral, concerned

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    sprint: Mapped["Sprint | None"] = relationship("Sprint", lazy="selectin")
    team: Mapped["Team"] = relationship("Team", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("team_id", "summary_date", name="uq_standup_summary_team_date"),
        Index("ix_standup_summaries_sprint_date", "sprint_id", "summary_date"),
    )
