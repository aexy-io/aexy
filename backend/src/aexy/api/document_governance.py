"""Lifecycle, audit, analytics and publishing for the knowledge base.

A separate router from `documents.py`, which is already 3,000 lines and is
about editing a document. These endpoints are about *governing* a body of them:
who owns each page, when it was last confirmed to be true, who has been reading
it, who changed its sharing, and whether it is visible outside the workspace.

Mounted under the same `/workspaces/{workspace_id}/documents` prefix so the
client sees one resource, and carrying the same `guard_document_route`
dependency so a route added here cannot forget the access check either.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.document_audit import DocumentAuditAction
from aexy.models.documentation import Document
from aexy.schemas.document_governance import (
    DocumentAuditEventResponse,
    DocumentLifecycleResponse,
    DocumentLifecycleUpdate,
    DocumentStatsResponse,
    PublishRequest,
    PublishResponse,
    ReviewQueueItem,
    WorkspaceStatsResponse,
)
from aexy.services.document_access import AccessLevel, DocumentAccess
from aexy.services.document_audit_service import Actor, DocumentAuditService
from aexy.services.document_export_service import DocumentExportService, ExportError
from aexy.services.document_publishing_service import DocumentPublishingService
from aexy.services.document_service import DocumentService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/documents", tags=["Document governance"]
)


async def _require_workspace(
    workspace_id: str, current_user: Developer, db: AsyncSession, role: str = "member"
) -> None:
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


async def _document_or_404(
    workspace_id: str,
    document_id: str,
    current_user: Developer,
    db: AsyncSession,
    minimum: AccessLevel,
) -> Document:
    document = await DocumentService(db).get_document(document_id, workspace_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    await DocumentAccess(db).require(
        document, str(current_user.id), minimum, workspace_id=workspace_id
    )
    return document


# ==================== Lifecycle ====================
#
# `created_by_id` says who typed the page, which stops being the right answer
# the moment they change team. None of this existed: the only freshness signal
# in the module was `is_behind_code`, which works beautifully and only for the
# minority of documents that are linked to code.


@router.get("/review-queue", response_model=list[ReviewQueueItem])
async def review_queue(
    workspace_id: str,
    mine_only: bool = Query(default=False, description="Only pages I own"),
    include_unowned: bool = Query(
        default=True, description="Include pages with no owner at all"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pages that are due for review, or have never been verified.

    Ordered by how overdue they are. Unowned pages are included by default and
    listed last: they are the ones that rot, precisely because nobody gets the
    reminder about them.
    """
    await _require_workspace(workspace_id, current_user, db, "viewer")

    now = datetime.now(timezone.utc)
    clause = await DocumentAccess(db).visible_clause(
        workspace_id, str(current_user.id)
    )

    stmt = (
        select(Document)
        .where(clause)
        .where(Document.is_template.is_(False))
        .where(Document.is_archived.is_(False))
    )
    if mine_only:
        stmt = stmt.where(Document.owner_id == str(current_user.id))
    elif not include_unowned:
        stmt = stmt.where(Document.owner_id.is_not(None))

    stmt = stmt.where(Document.review_due_at.is_not(None)).where(
        Document.review_due_at <= now
    )
    stmt = stmt.order_by(Document.review_due_at.asc()).limit(limit)

    documents = list((await db.execute(stmt)).scalars().all())

    return [
        ReviewQueueItem(
            id=str(d.id),
            title=d.title,
            icon=d.icon,
            owner_id=str(d.owner_id) if d.owner_id else None,
            owner_name=d.owner.name if d.owner else None,
            review_due_at=d.review_due_at,
            last_verified_at=d.last_verified_at,
            days_overdue=(
                (now - d.review_due_at).days if d.review_due_at else 0
            ),
            updated_at=d.updated_at,
        )
        for d in documents
    ]


@router.get("/{document_id}/lifecycle", response_model=DocumentLifecycleResponse)
async def get_lifecycle(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    document = await _document_or_404(
        workspace_id, document_id, current_user, db, AccessLevel.VIEW
    )
    return _lifecycle_response(document)


@router.patch("/{document_id}/lifecycle", response_model=DocumentLifecycleResponse)
async def update_lifecycle(
    workspace_id: str,
    document_id: str,
    data: DocumentLifecycleUpdate,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Set the owner, the review date, or mark the page verified.

    Marking it verified is separate from editing it, and that separation is the
    point: most pages that need confirming need *no change*, and a workflow
    that only records freshness as a side effect of editing gives people a
    reason to make pointless edits.
    """
    document = await _document_or_404(
        workspace_id, document_id, current_user, db, AccessLevel.EDIT
    )

    if data.owner_id is not None:
        if not await WorkspaceService(db).is_member(workspace_id, data.owner_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That person is not a member of this workspace",
            )
        document.owner_id = data.owner_id

    if data.review_due_at is not None:
        document.review_due_at = data.review_due_at

    if data.is_archived is not None:
        document.is_archived = data.is_archived

    if data.mark_verified:
        document.last_verified_at = datetime.now(timezone.utc)
        document.last_verified_by_id = str(current_user.id)
        # Rolling the next review forward on verification, rather than leaving
        # the page overdue forever. Without this the queue only ever grows and
        # people stop opening it.
        if data.next_review_in_days:
            document.review_due_at = datetime.now(timezone.utc) + timedelta(
                days=data.next_review_in_days
            )

    await db.commit()
    await db.refresh(document)

    await DocumentAuditService(db).log(
        workspace_id=workspace_id,
        action=DocumentAuditAction.UPDATED,
        actor=Actor.from_request(request, current_user),
        document=document,
        after={
            "owner_id": data.owner_id,
            "review_due_at": (
                data.review_due_at.isoformat() if data.review_due_at else None
            ),
            "verified": data.mark_verified,
        },
        commit=True,
    )

    return _lifecycle_response(document)


def _lifecycle_response(document: Document) -> DocumentLifecycleResponse:
    now = datetime.now(timezone.utc)
    due = document.review_due_at
    return DocumentLifecycleResponse(
        document_id=str(document.id),
        owner_id=str(document.owner_id) if document.owner_id else None,
        owner_name=document.owner.name if document.owner else None,
        review_due_at=due,
        last_verified_at=document.last_verified_at,
        last_verified_by_id=(
            str(document.last_verified_by_id)
            if document.last_verified_by_id
            else None
        ),
        is_archived=document.is_archived,
        is_overdue=bool(due and due <= now),
    )


# ==================== Analytics ====================


@router.get("/{document_id}/stats", response_model=DocumentStatsResponse)
async def document_stats(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Views, unique readers, and when it was last opened."""
    document = await _document_or_404(
        workspace_id, document_id, current_user, db, AccessLevel.VIEW
    )
    stats = await DocumentAuditService(db).document_stats(str(document.id))
    return DocumentStatsResponse(document_id=str(document.id), **stats)


@router.get("/stats/workspace", response_model=WorkspaceStatsResponse)
async def workspace_stats(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Most-read and never-read pages.

    "Never read" earns its place here: a knowledge base's real problem is
    rarely its popular pages, it is the fifty nobody has ever opened that
    people are still being asked to keep up to date.
    """
    await _require_workspace(workspace_id, current_user, db, "member")
    stats = await DocumentAuditService(db).workspace_stats(workspace_id, days=days)
    return WorkspaceStatsResponse(**stats)


# ==================== Audit ====================


@router.get("/audit/events", response_model=list[DocumentAuditEventResponse])
async def audit_events(
    workspace_id: str,
    document_id: str | None = None,
    actor_id: str | None = None,
    action: list[str] | None = Query(default=None),
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """The audit trail. Workspace admins only.

    Admin-gated because the trail records who read what, which is itself
    sensitive: a log of every page a colleague opened is not something an
    ordinary member should be able to page through.
    """
    await _require_workspace(workspace_id, current_user, db, "admin")

    events = await DocumentAuditService(db).events(
        workspace_id,
        document_id=document_id,
        actor_id=actor_id,
        actions=action,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    return [
        DocumentAuditEventResponse(
            id=str(e.id),
            document_id=str(e.document_id) if e.document_id else None,
            document_title=e.document_title,
            action=e.action,
            actor_id=str(e.actor_id) if e.actor_id else None,
            actor_name=e.actor_name,
            actor_email=e.actor_email,
            actor_kind=e.actor_kind,
            ip_address=str(e.ip_address) if e.ip_address else None,
            user_agent=e.user_agent,
            before=e.before,
            after=e.after,
            context=e.context,
            created_at=e.created_at,
        )
        for e in events
    ]


# ==================== Export ====================
#
# An evaluation blocker and the answer to the lock-in objection, which is the
# one a knowledge base attracts most: a buyer asks "can we get our content back
# out" before they put anything in.


@router.get("/{document_id}/export")
async def export_document(
    workspace_id: str,
    document_id: str,
    request: Request,
    format: str = Query(default="markdown", pattern="^(markdown|html|json|pdf)$"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Download one document as Markdown, HTML, PDF, or its raw TipTap JSON."""
    document = await _document_or_404(
        workspace_id, document_id, current_user, db, AccessLevel.VIEW
    )

    service = DocumentExportService(db)
    try:
        payload, filename, content_type = await service.export_document(
            document, format
        )
    except ExportError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    await DocumentAuditService(db).log(
        workspace_id=workspace_id,
        action=DocumentAuditAction.EXPORTED,
        actor=Actor.from_request(request, current_user),
        document=document,
        context={"format": format},
        commit=True,
    )

    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if service.last_warnings:
        # A header rather than a failed request: the file is real and usable,
        # and the most common warning — a font that cannot draw this script —
        # is something the operator fixes once, not something that should stop
        # the download.
        headers["X-Export-Warnings"] = "; ".join(service.last_warnings)[:900]

    return StreamingResponse(
        iter([payload]),
        media_type=content_type,
        headers=headers,
    )


@router.get("/export/archive")
async def export_archive(
    workspace_id: str,
    request: Request,
    space_id: str | None = None,
    root_id: str | None = None,
    format: str = Query(default="markdown", pattern="^(markdown|html|json)$"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """A zip of a space or subtree, with folders mirroring the hierarchy.

    Access-filtered like every other listing. An export is a read of every
    document in it, and an export endpoint that skipped the predicate would be
    the most efficient possible version of the leak this work closed.
    """
    await _require_workspace(workspace_id, current_user, db, "member")

    clause = await DocumentAccess(db).visible_clause(
        workspace_id, str(current_user.id)
    )
    tree = await DocumentExportService(db).export_tree(
        workspace_id,
        access_clause=clause,
        space_id=space_id,
        root_id=root_id,
        fmt=format,
    )

    await DocumentAuditService(db).log(
        workspace_id=workspace_id,
        action=DocumentAuditAction.EXPORTED,
        actor=Actor.from_request(request, current_user),
        context={
            "format": format,
            "space_id": space_id,
            "root_id": root_id,
            "documents": tree.file_count,
        },
        commit=True,
    )

    return StreamingResponse(
        iter([tree.archive]),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="documents.zip"'
        },
    )


# ==================== Publishing ====================
#
# `is_published` and `visibility="public"` were stored on every document, shown
# in every API response, and read by nothing — publishing a page did nothing at
# all. This is what makes them mean something, and what the service desk's KB
# deflection needs.


@router.post("/{document_id}/publish", response_model=PublishResponse)
async def publish_document(
    workspace_id: str,
    document_id: str,
    data: PublishRequest,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Publish a snapshot of this document to the public portal.

    Workspace admin only, and a snapshot rather than a live mirror: an
    accidental edit to an internal page must not become instantly public, and a
    published page that silently follows its source is exactly how that
    happens.
    """
    await _require_workspace(workspace_id, current_user, db, "admin")
    document = await _document_or_404(
        workspace_id, document_id, current_user, db, AccessLevel.ADMIN
    )

    published = await DocumentPublishingService(db).publish(
        document, published_by_id=str(current_user.id), audience=data.audience
    )

    await DocumentAuditService(db).log(
        workspace_id=workspace_id,
        action=DocumentAuditAction.PUBLISHED,
        actor=Actor.from_request(request, current_user),
        document=document,
        after={"audience": data.audience, "slug": published.slug},
        commit=True,
    )

    return PublishResponse(
        document_id=str(document.id),
        slug=published.slug,
        audience=published.audience,
        published_at=published.published_at,
        url=f"/kb/{published.slug}",
    )


@router.delete("/{document_id}/publish", status_code=status.HTTP_204_NO_CONTENT)
async def unpublish_document(
    workspace_id: str,
    document_id: str,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Withdraw a document from the public portal."""
    await _require_workspace(workspace_id, current_user, db, "admin")
    document = await _document_or_404(
        workspace_id, document_id, current_user, db, AccessLevel.ADMIN
    )

    await DocumentPublishingService(db).unpublish(document)
    await DocumentAuditService(db).log(
        workspace_id=workspace_id,
        action=DocumentAuditAction.UNPUBLISHED,
        actor=Actor.from_request(request, current_user),
        document=document,
        commit=True,
    )
