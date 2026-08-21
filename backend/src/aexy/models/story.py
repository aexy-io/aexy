"""User Story model for requirement tracking between Epic and Task."""

from datetime import date, datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    event,
    func,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.epic import Epic
    from aexy.models.release import Release
    from aexy.models.sprint import SprintTask
    from aexy.models.workspace import Workspace


class UserStory(Base):
    """User Story model - bridges Epic and Tasks with user-centric requirements.

    User Stories follow the format:
    "As a <user type>, I want <goal>, so that <benefit>"

    Stories aggregate multiple tasks and track acceptance criteria.
    """

    __tablename__ = "user_stories"

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

    # Story identification
    key: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # Auto-generated: "STORY-001", "STORY-002", etc.
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # User story format fields
    as_a: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # "As a <user type>"
    i_want: Mapped[str] = mapped_column(
        String(1000), nullable=False
    )  # "I want <goal>"
    so_that: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )  # "So that <benefit>"

    # Rich description
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_json: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # TipTap JSON for rich text

    # Acceptance criteria as structured list
    acceptance_criteria: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, description, completed, completed_at, completed_by}]

    # Estimation
    story_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Story status (separate from task status)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )  # "draft" | "ready" | "in_progress" | "review" | "accepted" | "rejected"

    # Priority and ordering
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="medium"
    )  # "critical" | "high" | "medium" | "low"
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )  # For backlog ordering

    # Visual configuration
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#8B5CF6"
    )  # Default purple

    # Linked resources
    design_links: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, url, title, type}] - Figma, Sketch, etc.
    spec_links: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, url, title}] - Specs, docs
    attachments: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, url, filename, type, size}]

    # Parent references
    epic_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("epics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    release_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("releases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Ownership
    reporter_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )  # Product Owner or responsible person

    # Labels for filtering/categorization
    labels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # External source tracking (for Jira/Linear sync)
    source_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "jira" | "linear" | null for manual
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Cached metrics (updated when tasks change)
    total_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_story_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Timeline
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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
    epic: Mapped["Epic | None"] = relationship(
        "Epic",
        lazy="selectin",
    )
    release: Mapped["Release | None"] = relationship(
        "Release",
        back_populates="stories",
        lazy="selectin",
    )
    reporter: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[reporter_id],
        lazy="selectin",
    )
    owner: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[owner_id],
        lazy="selectin",
    )
    tasks: Mapped[list["SprintTask"]] = relationship(
        "SprintTask",
        back_populates="story",
        lazy="selectin",
    )


class StoryActivity(Base):
    """Story activity log - tracks all changes and actions on a story."""

    __tablename__ = "story_activities"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    story_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("user_stories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Activity type
    action: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "created" | "updated" | "status_changed" | "accepted" | "rejected" | "comment" | "criteria_added" | "criteria_completed"

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
    story: Mapped["UserStory"] = relationship(
        "UserStory",
        lazy="selectin",
    )
    actor: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )


# Atomic per-workspace key assignment, the same mechanism `SprintTask` uses (see
# `_assign_task_key` in models/sprint.py) and for the same reason: the
# UPDATE...RETURNING locks the workspace row, so concurrent inserts serialize on
# it and get distinct keys. It rolls back with the surrounding transaction.
#
# A `before_insert` listener rather than a helper, because it then covers every
# creation path — the API route, the intake service, a future importer — without
# each one having to remember. The previous helper read `count(*) + 1` in one
# statement and wrote in another, so two concurrent creates took the same number,
# and with no unique constraint the duplicate was silent.
#
# `next_story_key` holds the value to assign NEXT, so a fresh workspace at 1
# produces STORY-001 and leaves the counter at 2.
@event.listens_for(UserStory, "before_insert")
def _assign_story_key(mapper: Any, connection: Any, target: Any) -> None:
    if target.key is not None or target.workspace_id is None:
        return
    from aexy.models.workspace import Workspace

    row = connection.execute(
        update(Workspace)
        .where(Workspace.id == target.workspace_id)
        .values(next_story_key=Workspace.next_story_key + 1)
        .returning(Workspace.next_story_key)
    ).fetchone()
    if row is not None:
        target.key = f"STORY-{row[0] - 1:03d}"
