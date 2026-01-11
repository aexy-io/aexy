"""Release/Milestone model for version planning and tracking."""

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
    from aexy.models.sprint import Sprint
    from aexy.models.story import UserStory


class Release(Base):
    """Release/Milestone for grouping sprints and tracking versions.

    Releases represent a version or milestone that groups related sprints
    and stories together for delivery tracking.
    """

    __tablename__ = "releases"

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
    project_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Release identification
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # "v2.0.0" or "Q1 2024 Release"
    version: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # Semantic version: "2.0.0"
    codename: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # Optional friendly name: "Phoenix"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Visual configuration
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#10B981"
    )  # Default emerald

    # Timeline
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    code_freeze_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_release_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Status lifecycle
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="planning"
    )  # "planning" | "in_progress" | "code_freeze" | "testing" | "released" | "cancelled"

    # Risk tracking
    risk_level: Mapped[str] = mapped_column(
        String(50), nullable=False, default="low"
    )  # "low" | "medium" | "high" | "critical"
    risk_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Readiness checklist as structured list
    readiness_checklist: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, item, completed, required, completed_at, completed_by}]

    # Release notes
    release_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    release_notes_json: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # TipTap JSON

    # Ownership
    owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Labels
    labels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Cached metrics (updated when stories/tasks change)
    total_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Bug tracking for release
    open_bugs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    critical_bugs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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
    project: Mapped["Project | None"] = relationship(
        "Project",
        lazy="selectin",
    )
    owner: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
    stories: Mapped[list["UserStory"]] = relationship(
        "UserStory",
        back_populates="release",
        lazy="selectin",
    )
    sprints: Mapped[list["ReleaseSprint"]] = relationship(
        "ReleaseSprint",
        back_populates="release",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ReleaseSprint(Base):
    """Junction table linking releases to sprints (many-to-many)."""

    __tablename__ = "release_sprints"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    release_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("releases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sprint_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Order within release
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    release: Mapped["Release"] = relationship(
        "Release",
        back_populates="sprints",
        lazy="selectin",
    )
    sprint: Mapped["Sprint"] = relationship(
        "Sprint",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("release_id", "sprint_id", name="uq_release_sprint"),
    )
