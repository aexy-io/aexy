"""Epic model for workspace-level task grouping across sprints."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.sprint import SprintTask


class Epic(Base):
    """Workspace-level epic for grouping related tasks across teams and sprints.

    Epics represent large features or initiatives that span multiple sprints.
    Tasks from any team can belong to an epic, and progress is automatically
    calculated from child tasks.
    """

    __tablename__ = "epics"

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

    # Epic identification
    key: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # Auto-generated: "EPIC-001", "EPIC-002", etc.
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status and lifecycle
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="open"
    )  # "open" | "in_progress" | "done" | "cancelled"

    # Visual configuration
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#6366F1"
    )  # Default indigo

    # Ownership
    owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Timeline
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Priority
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="medium"
    )  # "critical" | "high" | "medium" | "low"

    # Cached metrics (updated when tasks change)
    total_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Labels for filtering/categorization
    labels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # External source tracking (for Jira/Linear epics)
    source_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "jira" | "linear" | null for manual
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
    tasks: Mapped[list["SprintTask"]] = relationship(
        "SprintTask",
        back_populates="epic",
        lazy="selectin",
    )
