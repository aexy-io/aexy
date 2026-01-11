"""Goal/OKR model for strategic alignment and objective tracking."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.project import Project
    from aexy.models.epic import Epic


class Goal(Base):
    """Workspace-level Goal/OKR for strategic alignment.

    Goals can be:
    - Objectives (high-level goals)
    - Key Results (measurable outcomes under objectives)
    - Initiatives (large efforts that support goals)

    Goals link to projects and epics for tracking alignment.
    """

    __tablename__ = "goals"

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

    # Goal identification
    key: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # Auto-generated: "GOAL-001", "OKR-001", etc.
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Goal type
    goal_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="objective"
    )  # "objective" | "key_result" | "initiative"

    # Hierarchy (Key Results belong to Objectives)
    parent_goal_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Time-boxing
    period_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="quarter"
    )  # "quarter" | "year" | "half" | "custom"
    period_label: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "Q1 2024", "FY 2024", etc.
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Progress tracking (for measurable KRs)
    metric_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="percentage"
    )  # "percentage" | "number" | "currency" | "boolean"
    target_value: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )  # Target for KRs
    current_value: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )  # Current progress
    starting_value: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )  # Baseline value
    unit: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "users", "$", "%", etc.

    # Calculated progress
    progress_percentage: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="not_started"
    )  # "not_started" | "on_track" | "at_risk" | "behind" | "achieved" | "missed" | "cancelled"

    # Confidence scoring (team's belief in achieving)
    confidence_level: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 1-10 scale
    confidence_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Visual configuration
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#F59E0B"
    )  # Default amber

    # Ownership
    owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Visibility
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )  # Visible to all workspace members

    # Weight (importance relative to siblings)
    weight: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0
    )  # For weighted progress calculation

    # Labels
    labels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Check-in history
    check_ins: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, date, value, notes, by_id}]

    # Archive support
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    owner: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
    parent_goal: Mapped["Goal | None"] = relationship(
        "Goal",
        remote_side="Goal.id",
        foreign_keys=[parent_goal_id],
        back_populates="key_results",
        lazy="selectin",
    )
    key_results: Mapped[list["Goal"]] = relationship(
        "Goal",
        foreign_keys="Goal.parent_goal_id",
        back_populates="parent_goal",
        lazy="selectin",
    )
    linked_projects: Mapped[list["GoalProject"]] = relationship(
        "GoalProject",
        back_populates="goal",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    linked_epics: Mapped[list["GoalEpic"]] = relationship(
        "GoalEpic",
        back_populates="goal",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class GoalProject(Base):
    """Junction table linking goals to projects."""

    __tablename__ = "goal_projects"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    goal_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Contribution weight
    contribution_weight: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    goal: Mapped["Goal"] = relationship(
        "Goal",
        back_populates="linked_projects",
        lazy="selectin",
    )
    project: Mapped["Project"] = relationship(
        "Project",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("goal_id", "project_id", name="uq_goal_project"),
    )


class GoalEpic(Base):
    """Junction table linking goals to epics."""

    __tablename__ = "goal_epics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    goal_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    epic_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("epics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Contribution weight
    contribution_weight: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    goal: Mapped["Goal"] = relationship(
        "Goal",
        back_populates="linked_epics",
        lazy="selectin",
    )
    epic: Mapped["Epic"] = relationship(
        "Epic",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("goal_id", "epic_id", name="uq_goal_epic"),
    )
