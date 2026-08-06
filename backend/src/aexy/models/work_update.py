"""Progress updates posted by whoever is doing the work.

Distinct from the two things that already existed, neither of which answers
"where does this work actually stand?":

* **Comments** (``TaskActivity.action == "comment"``, ``TicketResponse``) are a
  conversation. They interleave with questions, @mentions and customer replies,
  so "what is the current state of this?" means reading the whole thread and
  hoping the last relevant line is still true.
* **The activity log** (``TaskActivity``, ``EntityActivity``) is an audit trail
  of field changes. It records that status went to in_progress on Tuesday. It
  cannot record *why it is still in_progress on Friday*.

A progress update is a first-class, author-owned statement of where the work
stands. It is editable by its author (a comment thread you cannot correct
becomes a thread of corrections) and it is the thing a lead reads to find work
that has gone quiet.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer

# The entity kinds that can carry progress updates. Kept deliberately small —
# these are the two surfaces the tech team works out of. Widening it means
# teaching `_assert_entity_in_workspace` in the API about the new table too,
# otherwise updates could be posted against an id in someone else's workspace.
WORK_UPDATE_ENTITY_TYPES: frozenset[str] = frozenset({"task", "ticket"})


class WorkUpdate(Base):
    """A progress update on a sprint task or a ticket."""

    __tablename__ = "work_updates"

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

    # Polymorphic target. No FK — the referent lives in one of two tables, so
    # cleanup rides on the workspace cascade plus explicit deletes in the
    # service. `entity_type` is constrained in the app layer, not the DB, to
    # match how `entity_activities` models the same shape.
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)

    # Nullable so removing a developer preserves the update. The UI renders a
    # null author as "a former member" rather than dropping the text.
    author_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    body: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    # Set on every edit. Stays NULL for an update that was never edited, which
    # is what the "edited" marker in the UI keys off — an `updated_at` with
    # `onupdate` could not distinguish "never edited" from "edited at creation
    # time" once a backfill or a bulk touch had run over the table.
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    author: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )

    __table_args__ = (
        # The only read path that matters: newest-first for one entity.
        Index(
            "ix_work_updates_entity",
            "entity_type",
            "entity_id",
            "created_at",
        ),
        # Backs the bulk "latest update per task" lookup the board uses.
        Index("ix_work_updates_workspace_created", "workspace_id", "created_at"),
    )
