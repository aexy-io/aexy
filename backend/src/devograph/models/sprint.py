"""Sprint and sprint-related models."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4
import re

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devograph.core.database import Base

if TYPE_CHECKING:
    from devograph.models.developer import Developer
    from devograph.models.team import Team
    from devograph.models.workspace import Workspace
    from devograph.models.activity import Commit, PullRequest
    from devograph.models.epic import Epic


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '_', text)
    return text.strip('_')


class WorkspaceTaskStatus(Base):
    """Custom task statuses per workspace."""

    __tablename__ = "workspace_task_statuses"

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

    # Status info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, default="todo"
    )  # "todo" | "in_progress" | "done" - for burndown calculations
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6B7280")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Ordering and defaults
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_workspace_task_status_slug"),
    )


class WorkspaceCustomField(Base):
    """Custom fields for tasks per workspace."""

    __tablename__ = "workspace_custom_fields"

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

    # Field info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "text" | "number" | "select" | "multiselect" | "date" | "url"
    options: Mapped[list | None] = mapped_column(
        JSONB, nullable=True
    )  # For select/multiselect: [{value, label, color}]

    # Configuration
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_value: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Ordering
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_workspace_custom_field_slug"),
    )


class Sprint(Base):
    """Sprint model - represents a time-boxed iteration for a team."""

    __tablename__ = "sprints"

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
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Sprint info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sprint status lifecycle
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="planning"
    )  # "planning" | "active" | "review" | "retrospective" | "completed"

    # Sprint dates
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Capacity and commitment
    capacity_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    velocity_commitment: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Settings (JSONB for flexibility)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Created by
    created_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
    tasks: Mapped[list["SprintTask"]] = relationship(
        "SprintTask",
        back_populates="sprint",
        cascade="all, delete-orphan",
        lazy="selectin",
        foreign_keys="SprintTask.sprint_id",
    )
    metrics: Mapped[list["SprintMetrics"]] = relationship(
        "SprintMetrics",
        back_populates="sprint",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    retrospective: Mapped["SprintRetrospective | None"] = relationship(
        "SprintRetrospective",
        back_populates="sprint",
        uselist=False,
        lazy="selectin",
    )
    planning_sessions: Mapped[list["SprintPlanningSession"]] = relationship(
        "SprintPlanningSession",
        back_populates="sprint",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SprintTask(Base):
    """Sprint task model - represents a task/issue within a sprint."""

    __tablename__ = "sprint_tasks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sprint_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Task source reference
    source_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual"
    )  # "github_issue" | "jira" | "linear" | "manual"
    source_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Task data (cached from source)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    story_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="medium"
    )  # "critical" | "high" | "medium" | "low"
    labels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Assignment
    assignee_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assignment_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignment_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status tracking (legacy status field kept for backwards compatibility)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="backlog"
    )  # "backlog" | "todo" | "in_progress" | "review" | "done"

    # Custom status reference (for custom workspace statuses)
    status_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspace_task_statuses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Custom field values (JSONB for flexibility)
    custom_fields: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False
    )  # {field_slug: value}

    # Epic reference (for grouping tasks across sprints)
    epic_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("epics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # External sync tracking
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # Last sync with external source (Jira/Linear/GitHub)
    external_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # Last update time from external source
    sync_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="synced"
    )  # "synced" | "pending" | "conflict"

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Carry-over tracking
    carried_over_from_sprint_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Subtask support
    parent_task_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

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
    sprint: Mapped["Sprint"] = relationship(
        "Sprint",
        back_populates="tasks",
        foreign_keys=[sprint_id],
        lazy="selectin",
    )
    assignee: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
    carried_over_from: Mapped["Sprint | None"] = relationship(
        "Sprint",
        foreign_keys=[carried_over_from_sprint_id],
        lazy="selectin",
    )
    custom_status: Mapped["WorkspaceTaskStatus | None"] = relationship(
        "WorkspaceTaskStatus",
        lazy="selectin",
    )
    epic: Mapped["Epic | None"] = relationship(
        "Epic",
        back_populates="tasks",
        lazy="selectin",
    )
    github_links: Mapped[list["TaskGitHubLink"]] = relationship(
        "TaskGitHubLink",
        back_populates="task",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    parent_task: Mapped["SprintTask | None"] = relationship(
        "SprintTask",
        remote_side="SprintTask.id",
        foreign_keys=[parent_task_id],
        back_populates="subtasks",
        lazy="selectin",
    )
    subtasks: Mapped[list["SprintTask"]] = relationship(
        "SprintTask",
        foreign_keys="SprintTask.parent_task_id",
        back_populates="parent_task",
        lazy="selectin",
    )
    activities: Mapped[list["TaskActivity"]] = relationship(
        "TaskActivity",
        back_populates="task",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TaskActivity.created_at.desc()",
    )

    __table_args__ = (
        UniqueConstraint("sprint_id", "source_type", "source_id", name="uq_sprint_task_source"),
    )


class SprintMetrics(Base):
    """Sprint metrics model - daily snapshot of sprint progress."""

    __tablename__ = "sprint_metrics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sprint_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Point metrics
    total_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    remaining_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Task count metrics
    total_tasks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_tasks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    in_progress_tasks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    blocked_tasks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Burndown values
    ideal_burndown: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    actual_burndown: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    sprint: Mapped["Sprint"] = relationship(
        "Sprint",
        back_populates="metrics",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("sprint_id", "snapshot_date", name="uq_sprint_metrics_date"),
    )


class TeamVelocity(Base):
    """Team velocity model - historical velocity tracking per sprint."""

    __tablename__ = "team_velocity"

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
        index=True,
    )

    # Velocity metrics
    committed_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    carry_over_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Derived metrics
    completion_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    focus_factor: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", lazy="selectin")
    sprint: Mapped["Sprint"] = relationship("Sprint", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("team_id", "sprint_id", name="uq_team_velocity_sprint"),
    )


class SprintPlanningSession(Base):
    """Sprint planning session model - for real-time collaboration tracking."""

    __tablename__ = "sprint_planning_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sprint_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Session status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # "active" | "paused" | "completed"

    # Session timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Participants and decisions (JSONB for flexibility)
    participants: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{developer_id, joined_at, role}]
    decisions_log: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{action, by, at, details}]

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
    sprint: Mapped["Sprint"] = relationship(
        "Sprint",
        back_populates="planning_sessions",
        lazy="selectin",
    )


class SprintRetrospective(Base):
    """Sprint retrospective model - captures team reflections."""

    __tablename__ = "sprint_retrospectives"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sprint_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Retrospective content
    went_well: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, content, author_id, votes}]
    to_improve: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, content, author_id, votes}]
    action_items: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, item, assignee_id, status, due_date}]

    # Team mood
    team_mood_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 1-5 scale

    # Additional notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    sprint: Mapped["Sprint"] = relationship(
        "Sprint",
        back_populates="retrospective",
        lazy="selectin",
    )


class TaskGitHubLink(Base):
    """Links between sprint tasks and GitHub activity (commits, PRs).

    This junction table enables tracking which commits and PRs are related
    to a task, either through automatic reference parsing or manual linking.
    """

    __tablename__ = "task_github_links"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    task_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Link type and references
    link_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "commit" | "pull_request"

    commit_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("commits.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    pull_request_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("pull_requests.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Reference parsing metadata
    reference_text: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # The matched text, e.g., "Fixes #123"
    reference_pattern: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # Pattern type: "fixes", "closes", "refs", etc.

    # Linking method
    is_auto_linked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )  # True if auto-detected, False if manually linked

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    task: Mapped["SprintTask"] = relationship(
        "SprintTask",
        back_populates="github_links",
        lazy="selectin",
    )
    commit: Mapped["Commit | None"] = relationship(
        "Commit",
        lazy="selectin",
    )
    pull_request: Mapped["PullRequest | None"] = relationship(
        "PullRequest",
        lazy="selectin",
    )

    __table_args__ = (
        # Prevent duplicate links
        UniqueConstraint("task_id", "commit_id", name="uq_task_commit_link"),
        UniqueConstraint("task_id", "pull_request_id", name="uq_task_pr_link"),
    )


class TaskActivity(Base):
    """Task activity log - tracks all changes and actions on a task."""

    __tablename__ = "task_activities"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    task_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Activity type
    action: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "created" | "updated" | "status_changed" | "assigned" | "unassigned" | "comment" | "priority_changed" | "points_changed"

    # Who performed the action
    actor_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Field that changed (for updates)
    field_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Change details
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    # For comments
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata (for any extra info)
    activity_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    task: Mapped["SprintTask"] = relationship(
        "SprintTask",
        back_populates="activities",
        lazy="selectin",
    )
    actor: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
