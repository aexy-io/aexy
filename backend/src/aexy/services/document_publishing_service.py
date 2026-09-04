"""Publishing documents to the public knowledge-base portal.

`Document.is_published` and `visibility="public"` shipped on every row, were
returned in every API response, and were read by nothing: no public endpoint
existed anywhere in the codebase, so publishing a page did nothing at all.

This is what makes them mean something. It is also what
`MODULE_DEPTH_PLAN.md:101` needs — "when a customer types a question, suggest
KB articles before creating a ticket" requires a customer-facing surface, and
there was none.

The one design decision worth defending: publishing takes a **snapshot**. A
published page that silently follows its source means an accidental edit to an
internal document is instantly public, made by somebody who does not know the
page is externally visible. Republishing is deliberate, and `is_stale` is how
an admin sees that the source has moved on.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.documentation import Document, PublishedDocument

logger = logging.getLogger(__name__)

AUDIENCE_PUBLIC = "public"
AUDIENCE_WORKSPACE = "workspace"
AUDIENCES = (AUDIENCE_PUBLIC, AUDIENCE_WORKSPACE)


class PublishingError(RuntimeError):
    """The document cannot be published as asked."""


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    return slug[:180] or "untitled"


@dataclass(slots=True)
class PortalArticle:
    """What the public portal renders. Deliberately not a `Document`.

    Nothing internal leaks through this shape: no workspace id, no author, no
    space, no version history. A portal response that carried an author's email
    because the serialiser was reused would be a disclosure nobody reviewed.
    """

    slug: str
    title: str
    content: dict
    content_text: str | None
    published_at: object
    updated_at: object


class DocumentPublishingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def publish(
        self,
        document: Document,
        *,
        published_by_id: str,
        audience: str = AUDIENCE_PUBLIC,
        slug: str | None = None,
    ) -> PublishedDocument:
        if audience not in AUDIENCES:
            raise PublishingError(f"Unknown audience {audience!r}")

        if document.is_docx:
            # A Word document's body is a file. The portal renders TipTap JSON;
            # serving a download link from a public page is a different feature
            # with a different threat model.
            raise PublishingError(
                "Word documents cannot be published to the portal"
            )

        if document.deleted_at is not None:
            raise PublishingError("A document in the trash cannot be published")

        from aexy.services.proposed_edits_service import current_document_sha

        existing = (
            await self.db.execute(
                select(PublishedDocument).where(
                    PublishedDocument.document_id == str(document.id)
                )
            )
        ).scalar_one_or_none()

        if existing is not None:
            # Republishing: refresh the snapshot, keep the slug. Changing the
            # public URL because somebody renamed the page would break every
            # link anyone had shared to it.
            existing.title = document.title
            existing.content = document.content or {}
            existing.content_text = document.content_text
            existing.source_sha = current_document_sha(document)
            existing.audience = audience
            existing.published_by_id = published_by_id
            published = existing
        else:
            published = PublishedDocument(
                document_id=str(document.id),
                workspace_id=str(document.workspace_id),
                slug=await self._unique_slug(slug or slugify(document.title)),
                title=document.title,
                content=document.content or {},
                content_text=document.content_text,
                source_sha=current_document_sha(document),
                audience=audience,
                published_by_id=published_by_id,
            )
            self.db.add(published)

        # Keep the document's own flags in step, so the editor can show that
        # the page is public without a second query.
        document.is_published = True
        if published.published_at is not None:
            document.published_at = published.published_at

        await self.db.commit()
        await self.db.refresh(published)
        return published

    async def unpublish(self, document: Document) -> bool:
        row = (
            await self.db.execute(
                select(PublishedDocument).where(
                    PublishedDocument.document_id == str(document.id)
                )
            )
        ).scalar_one_or_none()
        if row is None:
            document.is_published = False
            await self.db.commit()
            return False

        await self.db.delete(row)
        document.is_published = False
        document.published_at = None
        await self.db.commit()
        return True

    async def _unique_slug(self, base: str) -> str:
        """Append a counter rather than a random suffix.

        `refund-policy-2` is a URL somebody can read out; `refund-policy-a4f9c1`
        is one they will paste wrongly.
        """
        candidate = base
        n = 1
        while True:
            taken = (
                await self.db.execute(
                    select(PublishedDocument.id).where(
                        PublishedDocument.slug == candidate
                    )
                )
            ).scalar_one_or_none()
            if taken is None:
                return candidate
            n += 1
            candidate = f"{base}-{n}"

    # ------------------------------------------------------------------
    # Portal reads

    async def get_article(
        self, slug: str, *, workspace_member_of: str | None = None
    ) -> PortalArticle | None:
        """One published article, by its public slug.

        `workspace_member_of` is the workspace the caller is a signed-in member
        of, or None for an anonymous reader. An article published to the
        `workspace` audience is invisible to anonymous readers and to members of
        a different workspace — the portal is one deployment serving many
        tenants, and the slug namespace is shared.
        """
        row = (
            await self.db.execute(
                select(PublishedDocument).where(PublishedDocument.slug == slug)
            )
        ).scalar_one_or_none()
        if row is None:
            return None

        if row.audience == AUDIENCE_WORKSPACE and (
            workspace_member_of is None
            or str(workspace_member_of) != str(row.workspace_id)
        ):
            return None

        # Counted with an UPDATE rather than a read-modify-write, so concurrent
        # readers do not lose increments to each other.
        await self.db.execute(
            PublishedDocument.__table__.update()
            .where(PublishedDocument.id == row.id)
            .values(view_count=PublishedDocument.view_count + 1)
        )
        await self.db.commit()

        return PortalArticle(
            slug=row.slug,
            title=row.title,
            content=row.content,
            content_text=row.content_text,
            published_at=row.published_at,
            updated_at=row.updated_at,
        )

    async def search_portal(
        self,
        query: str,
        *,
        workspace_id: str | None = None,
        limit: int = 10,
    ) -> list[PortalArticle]:
        """Keyword search across published articles.

        This is what the service desk's ticket-deflection surface calls: show
        the customer the article before they open a ticket. Scoped to public
        articles unless a workspace is named, and never to unpublished ones —
        the portal index is the snapshot table, not `documents`, so an internal
        page cannot appear here even by mistake.
        """
        pattern = f"%{query}%"
        stmt = select(PublishedDocument).where(
            PublishedDocument.audience == AUDIENCE_PUBLIC
        )
        if workspace_id:
            stmt = stmt.where(PublishedDocument.workspace_id == workspace_id)

        stmt = (
            stmt.where(
                func.lower(PublishedDocument.title).like(pattern.lower())
                | func.lower(func.coalesce(PublishedDocument.content_text, "")).like(
                    pattern.lower()
                )
            )
            .order_by(PublishedDocument.view_count.desc())
            .limit(limit)
        )

        rows = (await self.db.execute(stmt)).scalars().all()
        return [
            PortalArticle(
                slug=r.slug,
                title=r.title,
                content=r.content,
                content_text=r.content_text,
                published_at=r.published_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]

    async def stale_publications(self, workspace_id: str) -> list[PublishedDocument]:
        """Published pages whose source document has moved on since.

        The counterweight to the snapshot decision: a snapshot that nobody is
        told has gone stale is just an out-of-date public page.
        """
        from aexy.services.proposed_edits_service import compute_content_sha

        rows = list(
            (
                await self.db.execute(
                    select(PublishedDocument, Document)
                    .join(Document, Document.id == PublishedDocument.document_id)
                    .where(PublishedDocument.workspace_id == workspace_id)
                )
            ).all()
        )
        return [
            published
            for published, document in rows
            if published.source_sha != compute_content_sha(document.content)
        ]
