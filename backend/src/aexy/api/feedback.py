"""Product feedback: the board anyone can read, and the queue we triage.

Two routers, because the two audiences are different systems of authority. The
member router is workspace-scoped and shows a board with no authors on it. The
admin router is platform-scoped, guarded by ``get_platform_admin``, and shows
everything — who asked, from which workspace, with what context.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.api.platform_admin import get_platform_admin
from aexy.core.database import get_db
from aexy.core.workspace_auth import assert_active_member
from aexy.models.developer import Developer
from aexy.schemas.feedback import (
    FeedbackAdminItem,
    FeedbackAdminListResponse,
    FeedbackBoardItem,
    FeedbackCreate,
    FeedbackListResponse,
    FeedbackReview,
    FeedbackVoteResponse,
)
from aexy.services.feedback_service import FeedbackRateLimited, FeedbackService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/feedback", tags=["Feedback"])
admin_router = APIRouter(prefix="/platform-admin/feedback", tags=["Feedback (Admin)"])


@router.post("", response_model=FeedbackBoardItem, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    workspace_id: str,
    data: FeedbackCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """File a suggestion, a problem, a question, or a request for a gated app."""
    await assert_active_member(db, workspace_id, str(current_user.id))

    service = FeedbackService(db)
    try:
        item = await service.create(
            workspace_id=workspace_id,
            developer_id=str(current_user.id),
            kind=data.kind,
            subject=data.subject,
            body=data.body,
            context=data.context,
        )
    except FeedbackRateLimited as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e)
        ) from e

    await service.notify_admins(item)

    return FeedbackBoardItem(
        id=item.id,
        kind=item.kind,
        subject=item.subject,
        body=item.body,
        status=item.status,
        vote_count=item.vote_count,
        created_at=item.created_at,
        voted=True,
        mine=True,
    )


@router.get("", response_model=FeedbackListResponse)
async def list_board(
    workspace_id: str,
    kind: str | None = None,
    item_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """The shared board.

    Deliberately not scoped to the caller's workspace: the point of voting is
    that ten teams asking for one thing shows up as one item with a count. The
    rows carry no author and no workspace, so wanting something does not
    disclose who wants it. Membership of the workspace in the path is still
    required — this is not a public page.
    """
    await assert_active_member(db, workspace_id, str(current_user.id))

    items, total = await FeedbackService(db).list_board(
        developer_id=str(current_user.id),
        kind=kind,
        status=item_status,
        limit=limit,
        offset=offset,
    )
    return FeedbackListResponse(
        items=[FeedbackBoardItem(**item) for item in items], total=total
    )


@router.get("/mine", response_model=FeedbackListResponse)
async def list_my_feedback(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """What I have sent, and what came of it."""
    await assert_active_member(db, workspace_id, str(current_user.id))

    items = await FeedbackService(db).list_mine(str(current_user.id))
    return FeedbackListResponse(
        items=[FeedbackBoardItem(**item) for item in items], total=len(items)
    )


@router.post("/{feedback_id}/vote", response_model=FeedbackVoteResponse)
async def vote_for_feedback(
    workspace_id: str,
    feedback_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await assert_active_member(db, workspace_id, str(current_user.id))
    try:
        voted, count = await FeedbackService(db).vote(feedback_id, str(current_user.id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return FeedbackVoteResponse(feedback_id=feedback_id, voted=voted, vote_count=count)


@router.delete("/{feedback_id}/vote", response_model=FeedbackVoteResponse)
async def withdraw_vote(
    workspace_id: str,
    feedback_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await assert_active_member(db, workspace_id, str(current_user.id))
    voted, count = await FeedbackService(db).unvote(feedback_id, str(current_user.id))
    return FeedbackVoteResponse(feedback_id=feedback_id, voted=voted, vote_count=count)


# ============================== platform admin ==============================


@admin_router.get("", response_model=FeedbackAdminListResponse)
async def list_all_feedback(
    kind: str | None = None,
    item_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Everything, newest first, with the author and workspace attached."""
    items, total = await FeedbackService(db).list_for_admin(
        kind=kind, status=item_status, limit=limit, offset=offset
    )
    return FeedbackAdminListResponse(
        items=[FeedbackAdminItem(**item) for item in items], total=total
    )


@admin_router.patch("/{feedback_id}", response_model=FeedbackAdminItem)
async def review_feedback(
    feedback_id: str,
    data: FeedbackReview,
    current_user: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Set a status, leave a note, or both.

    A status change notifies whoever wrote it — including "declined", because an
    answer of no that is never delivered is indistinguishable from being ignored.
    """
    service = FeedbackService(db)
    try:
        item = await service.review(
            feedback_id=feedback_id,
            reviewer_id=str(current_user.id),
            status=data.status,
            admin_note=data.admin_note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    items, _total = await service.list_for_admin(limit=1, offset=0)
    detailed = next((i for i in items if i["id"] == item.id), None)
    if detailed:
        return FeedbackAdminItem(**detailed)
    # Fall back to the row itself if it has dropped off the first page.
    return FeedbackAdminItem(
        id=item.id,
        kind=item.kind,
        subject=item.subject,
        body=item.body,
        status=item.status,
        vote_count=item.vote_count,
        created_at=item.created_at,
        updated_at=item.updated_at,
        workspace_id=item.workspace_id,
        developer_id=item.developer_id,
        context=item.context or {},
        admin_note=item.admin_note,
        reviewed_by_id=item.reviewed_by_id,
        reviewed_at=item.reviewed_at,
    )
