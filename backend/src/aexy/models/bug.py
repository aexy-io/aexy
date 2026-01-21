"""Bug/Defect model for quality tracking."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.story import UserStory
    from aexy.models.release import Release
    from aexy.models.sprint import SprintTask
    from aexy.models.project import Project


class Bug(Base):
    """Bug/Defect tracking with severity and reproduction steps.

    Bugs are separate from tasks to allow specialized tracking
    of defects including severity, reproduction steps, and
    verification workflows.
    """

    __tablename__ = "bugs"

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
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Bug identification
    key: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # Auto-generated: "BUG-001", "BUG-002", etc.
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_json: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # TipTap JSON for rich text

    # Reproduction information
    steps_to_reproduce: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{step_number, description}]
    expected_behavior: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_behavior: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Classification
    severity: Mapped[str] = mapped_column(
        String(50), nullable=False, default="major"
    )  # "blocker" | "critical" | "major" | "minor" | "trivial"
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="medium"
    )  # "critical" | "high" | "medium" | "low"
    bug_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="functional"
    )  # "functional" | "performance" | "security" | "ui" | "data" | "crash" | "usability"

    # Environment information
    environment: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "production" | "staging" | "development" | "testing"
    affected_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fixed_in_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    browser: Mapped[str | None] = mapped_column(String(100), nullable=True)
    os: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="new"
    )  # "new" | "confirmed" | "in_progress" | "fixed" | "verified" | "closed" | "wont_fix" | "duplicate" | "cannot_reproduce"

    # Linking to other entities
    story_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("user_stories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    release_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("releases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    fix_task_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )  # The task that fixes this bug

    # Duplicate tracking
    duplicate_of_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("bugs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Regression tracking
    is_regression: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    regressed_from_release_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("releases.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Assignment
    reporter_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assignee_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    verified_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Attachments (screenshots, logs, etc.)
    attachments: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )  # [{id, url, filename, type, size}]

    # Labels
    labels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Root cause analysis
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Time tracking
    time_to_fix_hours: Mapped[float | None] = mapped_column(Integer, nullable=True)

    # External source tracking (for Jira/Linear sync)
    source_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "jira" | "linear" | "github" | null for manual
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Status timestamps
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fixed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
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
    project: Mapped["Project | None"] = relationship(
        "Project",
        lazy="selectin",
        foreign_keys=[project_id],
    )
    story: Mapped["UserStory | None"] = relationship(
        "UserStory",
        lazy="selectin",
        foreign_keys=[story_id],
    )
    release: Mapped["Release | None"] = relationship(
        "Release",
        lazy="selectin",
        foreign_keys=[release_id],
    )
    fix_task: Mapped["SprintTask | None"] = relationship(
        "SprintTask",
        lazy="selectin",
        foreign_keys=[fix_task_id],
    )
    reporter: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[reporter_id],
        lazy="selectin",
    )
    assignee: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[assignee_id],
        lazy="selectin",
    )
    verified_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[verified_by_id],
        lazy="selectin",
    )
    duplicate_of: Mapped["Bug | None"] = relationship(
        "Bug",
        remote_side="Bug.id",
        foreign_keys=[duplicate_of_id],
        lazy="selectin",
    )
    regressed_from_release: Mapped["Release | None"] = relationship(
        "Release",
        foreign_keys=[regressed_from_release_id],
        lazy="selectin",
    )


class BugActivity(Base):
    """Bug activity log - tracks all changes and actions on a bug."""

    __tablename__ = "bug_activities"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    bug_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("bugs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Activity type
    action: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "created" | "updated" | "status_changed" | "assigned" | "comment" | "verified" | "reopened"

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

    # Metadata
    activity_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    bug: Mapped["Bug"] = relationship(
        "Bug",
        lazy="selectin",
    )
    actor: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
