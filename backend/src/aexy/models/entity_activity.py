"""Entity activity model for tracking timeline/history across different entities."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class EntityActivity(Base):
    """Track activities/changes across different entity types.

    Supports: goals, tasks, backlogs, stories, releases, roadmaps, epics, bugs

    Activity types:
    - created: Entity was created
    - updated: Entity fields were updated
    - comment: A comment was added
    - status_changed: Status was changed
    - assigned: Entity was assigned to someone
    - progress_updated: Progress was updated
    - linked: Entity was linked to another entity
    - unlinked: Entity was unlinked from another entity
    """

    __tablename__ = "entity_activities"

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

    # Entity reference (polymorphic)
    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # "goal" | "task" | "backlog" | "story" | "release" | "roadmap" | "epic" | "bug"
    entity_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), nullable=False, index=True
    )

    # Activity details
    activity_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # "created" | "updated" | "comment" | "status_changed" | "assigned" | "progress_updated" | "linked" | "unlinked"

    # Who performed the action
    actor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Activity content
    title: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # Short summary like "changed status from Draft to Active"
    content: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Comment text or detailed description

    # Change details (for updates)
    changes: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # {"field": {"old": "value", "new": "value"}}

    # Additional context
    activity_metadata: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # Additional context like linked entity info

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    actor: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_entity_activities_entity", "entity_type", "entity_id"),
        Index("ix_entity_activities_workspace_created", "workspace_id", "created_at"),
    )
