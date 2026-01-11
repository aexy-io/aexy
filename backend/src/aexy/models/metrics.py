"""Advanced metrics models for flow and predictability tracking."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.workspace import Workspace
    from aexy.models.team import Team
    from aexy.models.sprint import Sprint


class WorkItemMetrics(Base):
    """Daily metrics snapshot for cycle time, lead time, and throughput tracking.

    Aggregated daily to enable trend analysis and CFD (Cumulative Flow Diagram).
    """

    __tablename__ = "work_item_metrics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Throughput (items completed on this day)
    stories_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tasks_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bugs_closed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    story_points_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Items in each status category (for CFD)
    stories_backlog: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stories_in_progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stories_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tasks_backlog: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tasks_in_progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tasks_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Average cycle time (time from work started to done) - in hours
    avg_story_cycle_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_task_cycle_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Average lead time (time from created to done) - in hours
    avg_story_lead_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_task_lead_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # WIP (Work In Progress) at snapshot time
    wip_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wip_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wip_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Scope changes (for scope creep tracking)
    stories_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stories_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scope_added_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scope_removed_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Blocked items
    blocked_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocked_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Bug metrics
    bugs_opened: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    open_bugs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    critical_bugs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    team: Mapped["Team | None"] = relationship(
        "Team",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "team_id", "snapshot_date",
            name="uq_work_item_metrics_date"
        ),
    )


class SprintPredictability(Base):
    """Tracks sprint predictability metrics for completed sprints.

    Measures how well teams estimate and deliver on commitments.
    """

    __tablename__ = "sprint_predictability"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sprint_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Commitment vs delivery
    committed_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivered_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    committed_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivered_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Predictability scores (0-100)
    story_predictability: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )  # (delivered_stories / committed_stories) * 100
    points_predictability: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )  # (delivered_points / committed_points) * 100

    # Scope change analysis
    stories_added_mid_sprint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stories_removed_mid_sprint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_added_mid_sprint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_removed_mid_sprint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scope_change_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Carry-over analysis
    carry_over_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    carry_over_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    carry_over_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Cycle time stats for the sprint
    avg_cycle_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_cycle_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_cycle_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Lead time stats for the sprint
    avg_lead_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Bug metrics
    bugs_found_in_sprint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bugs_fixed_in_sprint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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
    team: Mapped["Team"] = relationship(
        "Team",
        lazy="selectin",
    )
    sprint: Mapped["Sprint"] = relationship(
        "Sprint",
        lazy="selectin",
    )


class CycleTimePercentiles(Base):
    """Weekly/monthly percentile calculations for cycle time.

    Used for setting realistic SLAs and identifying outliers.
    """

    __tablename__ = "cycle_time_percentiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Period
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    period_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "week" | "month" | "quarter"

    # Item type
    item_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "story" | "task" | "bug"

    # Sample size
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Percentile values (in hours)
    p50_hours: Mapped[float | None] = mapped_column(Float, nullable=True)  # Median
    p75_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    p85_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    p95_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    p99_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Stats
    avg_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    std_dev_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    team: Mapped["Team | None"] = relationship(
        "Team",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "team_id", "period_start", "period_end", "item_type",
            name="uq_cycle_time_percentiles"
        ),
    )


class FlowEfficiency(Base):
    """Tracks flow efficiency (active time vs wait time) over time."""

    __tablename__ = "flow_efficiency"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Period
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Flow efficiency = active_time / total_time * 100
    avg_flow_efficiency: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Breakdown by status category
    avg_backlog_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_todo_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_in_progress_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_review_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_blocked_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Sample size
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    team: Mapped["Team | None"] = relationship(
        "Team",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "team_id", "period_start", "period_end",
            name="uq_flow_efficiency"
        ),
    )
