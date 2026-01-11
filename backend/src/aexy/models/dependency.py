"""Dependency models for tracking blocking relationships."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.story import UserStory
    from aexy.models.sprint import SprintTask


class StoryDependency(Base):
    """Tracks dependencies between user stories (blocking relationships).

    Enables visualization of story dependencies and identification
    of blocking issues in the workflow.
    """

    __tablename__ = "story_dependencies"

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

    # The story that depends on another (is blocked by)
    dependent_story_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("user_stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The story being depended upon (blocks the dependent)
    blocking_story_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("user_stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Dependency type
    dependency_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="blocks"
    )  # "blocks" | "is_blocked_by" | "relates_to" | "duplicates" | "is_child_of" | "is_parent_of"

    # Cross-project dependency flag
    is_cross_project: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # External dependency (outside the system)
    is_external: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    external_description: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Description if external dependency
    external_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # Link to external dependency

    # Status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # "active" | "resolved"
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Created by
    created_by_id: Mapped[str | None] = mapped_column(
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    dependent_story: Mapped["UserStory"] = relationship(
        "UserStory",
        foreign_keys=[dependent_story_id],
        lazy="selectin",
    )
    blocking_story: Mapped["UserStory"] = relationship(
        "UserStory",
        foreign_keys=[blocking_story_id],
        lazy="selectin",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )
    resolved_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[resolved_by_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "dependent_story_id", "blocking_story_id", "dependency_type",
            name="uq_story_dependency"
        ),
    )


class TaskDependency(Base):
    """Tracks dependencies between tasks (blocking relationships).

    Similar to StoryDependency but at the task level for more
    granular dependency tracking.
    """

    __tablename__ = "task_dependencies"

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

    # The task that depends on another (is blocked by)
    dependent_task_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The task being depended upon (blocks the dependent)
    blocking_task_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Dependency type
    dependency_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="blocks"
    )  # "blocks" | "is_blocked_by" | "relates_to" | "duplicates"

    # Cross-sprint dependency flag
    is_cross_sprint: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # External dependency
    is_external: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    external_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # "active" | "resolved"
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Created by
    created_by_id: Mapped[str | None] = mapped_column(
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    dependent_task: Mapped["SprintTask"] = relationship(
        "SprintTask",
        foreign_keys=[dependent_task_id],
        lazy="selectin",
    )
    blocking_task: Mapped["SprintTask"] = relationship(
        "SprintTask",
        foreign_keys=[blocking_task_id],
        lazy="selectin",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "dependent_task_id", "blocking_task_id", "dependency_type",
            name="uq_task_dependency"
        ),
    )
