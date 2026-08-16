"""One record for anything waiting on a human to approve it.

Two gates produce this work. The **content gate** holds a result — prose an
AI wrote, to be diffed against the page it would replace. The **policy gate**
holds an intent — a tool call stopped before it ran, because running it to see
what it would do is what the gate exists to prevent.

Those are genuinely different things, and an earlier draft of this argued they
should stay in separate tables on the strength of that. The objection was to a
specific bad shape: eighteen columns that only apply to one kind, half of them
null on every row, with a discriminator telling you which half to ignore.

Putting the kind-specific part in one JSONB `payload` removes that objection
entirely. What is left is genuinely common — who asked, when, what for, what
was decided — and a single table means one queue, one lifecycle, one place to
add a third kind, and a review inbox that is a query rather than a merge of
two lists in the client.
"""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class ChangeKind(str, Enum):
    """What sort of thing is waiting, and therefore how to review it."""

    # An AI wrote content for an existing record. Reviewed as a diff.
    CONTENT = "content"
    # An agent asked to perform an operation. Reviewed as an intent, and
    # replayed verbatim if approved.
    ACTION = "action"


class ChangeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class ProposedChange(Base):
    """A pending change of any kind, in any module."""

    __tablename__ = "proposed_changes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )

    kind: Mapped[str] = mapped_column(String(20), nullable=False)

    # What it concerns. `entity_id` is null for an action, because the point of
    # stopping a call before it runs is that we do not yet know what it would
    # have touched.
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True, index=True
    )
    # Denormalised so the review queue is one indexed query rather than a join
    # per entity type — the join differs for every module, which is exactly the
    # thing a generic queue cannot express.
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The kind-specific part, and the reason this table works at all.
    #   content: {"content": <editor document>}
    #   action:  {"tool_name", "action", "method", "path", "arguments"}
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # What produced it — `ProposedEditSource` for content, a policy id for an
    # action. Free-form because a third kind will have its own vocabulary.
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # The version this was written against. A mismatch at approve time means
    # the record moved underneath it, and approving would overwrite edits the
    # proposal never saw.
    base_version: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Whatever the reviewer's list should show without opening the item.
    summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), default=ChangeStatus.PENDING.value, nullable=False
    )

    requested_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Rejections carry the reviewer's words; supersessions carry the system's.
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What happened when an approved action was replayed. Kept so the queue can
    # show an approval that then failed, rather than implying every approved
    # item succeeded.
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ------------------------------------------------------------------
    # Names the document code has always used. Kept as read aliases so the
    # response builders and templates that predate this table keep working —
    # renaming them everywhere would have been a much larger diff for no
    # behavioural gain.

    @property
    def document_id(self) -> str | None:
        return self.entity_id

    @property
    def proposed_content(self) -> Any:
        return (self.payload or {}).get("content")

    @property
    def base_content_sha(self) -> str | None:
        return self.base_version

    @property
    def diff_summary(self) -> dict | None:
        return self.summary

    @property
    def proposed_by_id(self) -> str | None:
        return self.requested_by_id

    @property
    def proposed_at(self) -> datetime:
        return self.created_at

    __table_args__ = (
        # The queue asks one question far more than any other: what is waiting
        # in this workspace? Partial, because resolved rows outnumber pending
        # ones permanently and indexing them buys nothing.
        Index(
            "ix_proposed_changes_workspace_pending",
            "workspace_id",
            "created_at",
            postgresql_where=text("status = 'pending'"),
        ),
        # Per-entity lookup: "does this document have anything pending?"
        Index("ix_proposed_changes_entity", "entity_type", "entity_id", "status"),
    )
