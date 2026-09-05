"""Audit and analytics for the knowledge base.

Deliberately separate from `EntityActivity`, which the documents module already
writes to. That table is a *product feed*: it is mutable, carries no actor IP or
user agent, records no reads, records no permission changes, and has no
retention policy or export. It answers "what happened to this page lately" for
a colleague. It does not answer "who opened this document, from where, and who
changed its sharing" for a security review, and stretching it to try would make
the feed unreadable and the audit trail untrustworthy at the same time.

Two tables rather than one, because the two have opposite shapes:

`DocumentAuditEvent` is append-only, low-volume, kept for a long time, and read
by an administrator. `DocumentView` is high-volume, aggregated, and read by the
freshness and analytics surfaces — a read event belongs in the audit log when
somebody is investigating, and in a counter the rest of the time.
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from aexy.core.database import Base


class DocumentAuditAction(str, Enum):
    """What was done.

    Reads are in here because enterprise buyers ask who opened a document, and
    an audit log that records only writes cannot answer the question that
    actually gets asked after an incident.
    """

    VIEWED = "viewed"
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    RESTORED = "restored"
    PURGED = "purged"
    MOVED = "moved"
    DUPLICATED = "duplicated"
    EXPORTED = "exported"
    DOWNLOADED = "downloaded"

    # The ones a security review is really looking for.
    VISIBILITY_CHANGED = "visibility_changed"
    COLLABORATOR_ADDED = "collaborator_added"
    COLLABORATOR_REMOVED = "collaborator_removed"
    COLLABORATOR_CHANGED = "collaborator_changed"
    SPACE_VISIBILITY_CHANGED = "space_visibility_changed"
    SPACE_MEMBER_ADDED = "space_member_added"
    SPACE_MEMBER_REMOVED = "space_member_removed"
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"

    # Refusals. A log of only successful access tells you nothing about
    # somebody working through document ids.
    ACCESS_DENIED = "access_denied"


class DocumentAuditEvent(Base):
    """One append-only record of something that happened to a document.

    Append-only is enforced at the database role level by the migration, not
    only by convention here: an audit trail the application can rewrite is
    evidence of nothing.
    """

    __tablename__ = "document_audit_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Not a foreign key, and that is the point: purging a document must not
    # erase the record that it existed and who read it. The title is
    # denormalised for the same reason — after a purge it is the only thing
    # left that says what the row was about.
    document_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True, index=True
    )
    document_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    space_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Likewise not a foreign key. A departed employee's audit trail outlives
    # their row.
    actor_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True, index=True
    )
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    # 'user' | 'agent' | 'system' — from the token's verified `actor` claim, so
    # an agent's action is distinguishable from the person it acted for.
    actor_kind: Mapped[str] = mapped_column(
        String(20), default="user", server_default="user", nullable=False
    )

    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Before/after for the changes worth diffing — a visibility flip, a
    # collaborator's grade. Not document content: an audit log is not a second
    # copy of the knowledge base, and storing bodies here would make retention
    # and erasure requests intractable.
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_document_audit_workspace_time", "workspace_id", "created_at"),
        Index("ix_document_audit_document_time", "document_id", "created_at"),
        Index("ix_document_audit_actor_time", "actor_id", "created_at"),
        Index("ix_document_audit_action_time", "action", "created_at"),
    )


class DocumentView(Base):
    """One person's reading of one document, aggregated per day.

    Per day rather than per open: somebody with a document pinned in a tab
    would otherwise generate thousands of rows and drown both the analytics and
    the table. `view_count` and `total_dwell_seconds` keep the detail that
    matters — how often, and for how long — without the row per event.

    The audit log records individual reads separately when they are being
    investigated; this is the counter that answers "is anyone using this
    knowledge base" and feeds the staleness signals.
    """

    __tablename__ = "document_views"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    viewer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # The UTC date this row aggregates, as a plain string so the unique
    # constraint works identically on SQLite and PostgreSQL.
    view_date: Mapped[str] = mapped_column(String(10), nullable=False)

    view_count: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    total_dwell_seconds: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )

    first_viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "uq_document_view_day",
            "document_id",
            "viewer_id",
            "view_date",
            unique=True,
        ),
        Index("ix_document_views_workspace_date", "workspace_id", "view_date"),
    )
