"""Writing and reading the knowledge base's audit trail.

Two rules shape this module.

**Recording must never break the thing being recorded.** Every write is
best-effort and swallows its own failures. An audit log that can 500 a
document read is an availability problem wearing a compliance badge, and the
first incident teaches everyone to switch it off. Where a failure genuinely
matters — a purge, a visibility change — the caller commits the audit row in
the same transaction as the change, so the two land together or not at all.

**Reads are recorded, but not one row per keystroke.** `record_view` upserts a
per-person-per-day counter; `log` writes an audit event. A document open does
both, because "how often is this read" and "who read it on the 14th" are
different questions and one table cannot answer both without being bad at one.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.document_audit import (
    DocumentAuditAction,
    DocumentAuditEvent,
    DocumentView,
)
from aexy.models.documentation import Document

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Actor:
    """Who did it, flattened at write time.

    Denormalised rather than joined because the audit trail has to outlive the
    row: a departed employee's `developers` record may be gone, and an audit
    event that renders as "someone" is not evidence.
    """

    id: str | None
    name: str | None = None
    email: str | None = None
    kind: str = "user"
    ip: str | None = None
    user_agent: str | None = None

    @classmethod
    def from_request(cls, request: Request | None, developer: Any | None) -> "Actor":
        ip = None
        user_agent = None
        kind = "user"

        if request is not None:
            # `X-Forwarded-For` first, because the app runs behind nginx and
            # `request.client.host` would otherwise record the proxy for every
            # event in the system.
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                ip = forwarded.split(",")[0].strip()
            elif request.client:
                ip = request.client.host
            user_agent = request.headers.get("user-agent")

            from aexy.api.developers import AGENT_ACTOR

            if getattr(request.state, "token_actor", None) == AGENT_ACTOR:
                kind = "agent"

        return cls(
            id=str(developer.id) if developer is not None else None,
            name=getattr(developer, "name", None),
            email=getattr(developer, "email", None),
            kind=kind,
            ip=ip,
            user_agent=user_agent,
        )


class DocumentAuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Writing

    async def log(
        self,
        *,
        workspace_id: str,
        action: DocumentAuditAction,
        actor: Actor,
        document: Document | None = None,
        document_id: str | None = None,
        document_title: str | None = None,
        before: dict | None = None,
        after: dict | None = None,
        context: dict | None = None,
        commit: bool = False,
    ) -> None:
        """Record one event.

        `commit=False` by default: most callers are inside a request whose
        session commits at the end, and committing here would split their
        transaction. Pass `commit=True` from a background job that owns its own
        session, or where the event must land even if the surrounding work
        rolls back — a denied access, for instance, has no surrounding work to
        wait for.
        """
        try:
            # A SAVEPOINT, not a bare try/except. Swallowing the exception is
            # not enough: a failed `flush` poisons the session, so the caller's
            # *next* statement raises PendingRollbackError and the audit log
            # breaks the document read anyway — the exact failure this method
            # promises not to cause. The savepoint rolls back only the audit
            # insert and leaves the surrounding transaction usable.
            #
            # Invisible on SQLite, which does not enforce foreign keys by
            # default: a test on the default suite reports the broken version
            # as working.
            async with self.db.begin_nested():
                self.db.add(
                    DocumentAuditEvent(
                        workspace_id=workspace_id,
                        document_id=(
                            str(document.id) if document is not None else document_id
                        ),
                        document_title=(
                            document.title if document is not None else document_title
                        ),
                        space_id=(
                            str(document.space_id)
                            if document is not None and document.space_id
                            else None
                        ),
                        action=action.value,
                        actor_id=actor.id,
                        actor_name=actor.name,
                        actor_email=actor.email,
                        actor_kind=actor.kind,
                        ip_address=actor.ip,
                        user_agent=actor.user_agent,
                        before=before,
                        after=after,
                        context=context,
                    )
                )
                await self.db.flush()

            if commit:
                await self.db.commit()
        except Exception:
            # Never propagate. See the module docstring: an audit log that can
            # fail a document read is an availability problem, and the first
            # incident teaches everyone to disable it.
            logger.warning(
                "could not record document audit event %s", action.value, exc_info=True
            )

    async def record_view(
        self,
        *,
        document: Document,
        viewer_id: str | None,
        dwell_seconds: int = 0,
    ) -> None:
        """Count one read, aggregated per person per day.

        Per day rather than per open, because a document left pinned in a
        browser tab would otherwise write thousands of rows and make both the
        table and the analytics useless.
        """
        try:
            async with self.db.begin_nested():  # savepoint; see `log`
                today = datetime.now(timezone.utc).date().isoformat()
                now = datetime.now(timezone.utc)

                row = (
                    await self.db.execute(
                        select(DocumentView).where(
                            DocumentView.document_id == str(document.id),
                            DocumentView.viewer_id == viewer_id,
                            DocumentView.view_date == today,
                        )
                    )
                ).scalar_one_or_none()

                if row is None:
                    self.db.add(
                        DocumentView(
                            document_id=str(document.id),
                            workspace_id=str(document.workspace_id),
                            viewer_id=viewer_id,
                            view_date=today,
                            view_count=1,
                            total_dwell_seconds=max(0, dwell_seconds),
                            first_viewed_at=now,
                            last_viewed_at=now,
                        )
                    )
                else:
                    row.view_count += 1
                    row.total_dwell_seconds += max(0, dwell_seconds)
                    row.last_viewed_at = now
                await self.db.flush()
        except Exception:
            logger.debug("could not record document view", exc_info=True)

    # ------------------------------------------------------------------
    # Reading

    async def events(
        self,
        workspace_id: str,
        *,
        document_id: str | None = None,
        actor_id: str | None = None,
        actions: list[str] | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DocumentAuditEvent]:
        stmt = select(DocumentAuditEvent).where(
            DocumentAuditEvent.workspace_id == workspace_id
        )
        if document_id:
            stmt = stmt.where(DocumentAuditEvent.document_id == document_id)
        if actor_id:
            stmt = stmt.where(DocumentAuditEvent.actor_id == actor_id)
        if actions:
            stmt = stmt.where(DocumentAuditEvent.action.in_(actions))
        if since:
            stmt = stmt.where(DocumentAuditEvent.created_at >= since)
        if until:
            stmt = stmt.where(DocumentAuditEvent.created_at <= until)

        stmt = (
            stmt.order_by(DocumentAuditEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def document_stats(self, document_id: str) -> dict[str, Any]:
        """Views, unique readers and last-read, for one document."""
        row = (
            await self.db.execute(
                select(
                    func.coalesce(func.sum(DocumentView.view_count), 0),
                    func.count(func.distinct(DocumentView.viewer_id)),
                    func.max(DocumentView.last_viewed_at),
                    func.coalesce(func.sum(DocumentView.total_dwell_seconds), 0),
                ).where(DocumentView.document_id == document_id)
            )
        ).one()

        return {
            "views": int(row[0] or 0),
            "unique_readers": int(row[1] or 0),
            "last_viewed_at": row[2],
            "total_dwell_seconds": int(row[3] or 0),
        }

    async def workspace_stats(
        self, workspace_id: str, *, days: int = 30, limit: int = 20
    ) -> dict[str, Any]:
        """Most-read and never-read, which are the two questions worth asking.

        "Never read" is the one that earns its place: a knowledge base's real
        problem is rarely the popular pages, it is the fifty nobody has ever
        opened that people still keep updating.
        """
        since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

        most_read = (
            await self.db.execute(
                select(
                    DocumentView.document_id,
                    Document.title,
                    func.sum(DocumentView.view_count).label("views"),
                    func.count(func.distinct(DocumentView.viewer_id)).label("readers"),
                )
                .join(Document, Document.id == DocumentView.document_id)
                .where(
                    DocumentView.workspace_id == workspace_id,
                    DocumentView.view_date >= since,
                    Document.deleted_at.is_(None),
                )
                .group_by(DocumentView.document_id, Document.title)
                .order_by(func.sum(DocumentView.view_count).desc())
                .limit(limit)
            )
        ).all()

        never_read = (
            await self.db.execute(
                select(Document.id, Document.title, Document.updated_at)
                .where(
                    Document.workspace_id == workspace_id,
                    Document.deleted_at.is_(None),
                    Document.is_template.is_(False),
                    ~select(DocumentView.id)
                    .where(DocumentView.document_id == Document.id)
                    .exists(),
                )
                .order_by(Document.updated_at.desc())
                .limit(limit)
            )
        ).all()

        return {
            "period_days": days,
            "most_read": [
                {
                    "document_id": str(r[0]),
                    "title": r[1],
                    "views": int(r[2]),
                    "readers": int(r[3]),
                }
                for r in most_read
            ],
            "never_read": [
                {
                    "document_id": str(r[0]),
                    "title": r[1],
                    "updated_at": r[2],
                }
                for r in never_read
            ],
        }
