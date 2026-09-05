"""The public knowledge-base portal.

Unauthenticated by design, and the only unauthenticated document surface in the
module — which is exactly why it reads from `published_documents` and never
from `documents`. A snapshot table is a boundary you can reason about: an
internal page cannot appear here through a forgotten filter, because it is not
in the table this router queries.

That distinction is the lesson from what this replaces. The old collaboration
WebSocket was also unauthenticated, but it read `documents` directly, so
"unauthenticated" and "public" collapsed into the same thing and every document
in every workspace was reachable.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_optional_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.document_governance import (
    PortalArticleResponse,
    PortalSearchResult,
)
from aexy.services.document_publishing_service import DocumentPublishingService

router = APIRouter(prefix="/kb", tags=["Knowledge base portal"])


async def _member_workspace(
    developer: Developer | None, db: AsyncSession, workspace_id: str | None
) -> str | None:
    """The workspace the caller is actually a member of, or None.

    Taken from membership rather than from a query parameter. An article
    published to the `workspace` audience is gated on this, and trusting a
    `?workspace_id=` the reader supplies would make that gate decorative.
    """
    if developer is None or not workspace_id:
        return None

    from aexy.services.workspace_service import WorkspaceService

    if await WorkspaceService(db).check_permission(
        workspace_id, str(developer.id), "viewer"
    ):
        return workspace_id
    return None


@router.get("/articles/{slug}", response_model=PortalArticleResponse)
async def get_article(
    slug: str,
    request: Request,
    workspace_id: str | None = Query(
        default=None,
        description=(
            "Required only to read an article published to a workspace "
            "audience; membership is verified server-side."
        ),
    ),
    developer: Developer | None = Depends(get_optional_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """One published article."""
    scope = await _member_workspace(developer, db, workspace_id)

    article = await DocumentPublishingService(db).get_article(
        slug, workspace_member_of=scope
    )
    if article is None:
        # 404 for "not published", "withdrawn" and "you may not read this
        # audience" alike. Distinguishing them would let an anonymous caller
        # enumerate which internal pages exist.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Article not found"
        )

    return PortalArticleResponse(
        slug=article.slug,
        title=article.title,
        content=article.content,
        published_at=article.published_at,
        updated_at=article.updated_at,
    )


@router.get("/search", response_model=list[PortalSearchResult])
async def search_articles(
    q: str = Query(..., min_length=2, max_length=200),
    workspace_id: str | None = None,
    limit: int = Query(default=10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
):
    """Search published articles.

    This is the surface the service desk's ticket deflection calls: show the
    customer the article before they open a ticket
    (`MODULE_DEPTH_PLAN.md:101`). Public articles only — a workspace-audience
    article is readable by its members at `/kb/articles/{slug}` but is
    deliberately not in an index anyone can query.
    """
    articles = await DocumentPublishingService(db).search_portal(
        q, workspace_id=workspace_id, limit=limit
    )
    return [
        PortalSearchResult(
            slug=a.slug,
            title=a.title,
            snippet=_snippet(a.content_text, q),
        )
        for a in articles
    ]


def _snippet(text: str | None, query: str, width: int = 200) -> str | None:
    if not text:
        return None
    index = text.lower().find(query.lower())
    if index < 0:
        return text[:width].strip() or None
    start = max(0, index - width // 3)
    end = min(len(text), index + len(query) + width // 2)
    return (
        f"{'…' if start else ''}{text[start:end].strip()}"
        f"{'…' if end < len(text) else ''}"
    )
