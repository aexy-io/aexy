"""The queue of agent actions waiting on a person.

Policy at the MCP boundary is evaluated before a call runs, so a
require-approval decision has no result to show a reviewer — only the request.
These endpoints are where somebody reads that request and decides, and where an
approved one is finally replayed.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.proposed_change import ChangeKind, ChangeStatus, ProposedChange
from aexy.models.developer import Developer
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/agent-actions", tags=["Agent Actions"]
)


class PendingActionResponse(BaseModel):
    id: str
    workspace_id: str
    requested_by_id: str | None = None
    tool_name: str
    action: str
    method: str
    path: str
    arguments: dict
    reason: str | None = None
    status: str
    reviewed_by_id: str | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None
    result: dict | None = None
    created_at: datetime


class RejectRequest(BaseModel):
    note: str | None = None


def _to_response(row: ProposedChange) -> PendingActionResponse:
    return PendingActionResponse(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        requested_by_id=str(row.requested_by_id) if row.requested_by_id else None,
        tool_name=row.payload.get("tool_name", ""),
        action=row.payload.get("action", ""),
        method=row.payload.get("method", ""),
        path=row.payload.get("path", ""),
        arguments=row.payload.get("arguments") or {},
        reason=row.reason,
        status=row.status,
        reviewed_by_id=str(row.reviewed_by_id) if row.reviewed_by_id else None,
        reviewed_at=row.reviewed_at,
        review_note=row.reason,
        result=row.result,
        created_at=row.created_at,
    )


async def _require_member(
    db: AsyncSession, workspace_id: str, developer_id: str, role: str = "member"
) -> None:
    if not await WorkspaceService(db).check_permission(
        workspace_id, developer_id, role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


async def _load(
    db: AsyncSession, workspace_id: str, action_id: str
) -> ProposedChange:
    row = (
        await db.execute(
            select(ProposedChange)
            .where(ProposedChange.id == action_id)
            .where(ProposedChange.workspace_id == workspace_id)
            .where(ProposedChange.kind == ChangeKind.ACTION.value)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Action not found"
        )
    return row


@router.get("", response_model=list[PendingActionResponse])
async def list_pending_actions(
    workspace_id: str,
    status_filter: str | None = Query(default="pending", alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Agent actions this workspace has not yet decided on.

    Oldest first: an agent is waiting on each of these, and the one that has
    waited longest is the one most likely to have been forgotten.
    """
    await _require_member(db, workspace_id, str(current_user.id))

    stmt = (
        select(ProposedChange)
        .where(ProposedChange.workspace_id == workspace_id)
        .where(ProposedChange.kind == ChangeKind.ACTION.value)
    )
    if status_filter and status_filter != "all":
        stmt = stmt.where(ProposedChange.status == status_filter)
    stmt = stmt.order_by(ProposedChange.created_at.asc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    return [_to_response(row) for row in rows]


@router.post("/{action_id}/approve", response_model=PendingActionResponse)
async def approve_pending_action(
    workspace_id: str,
    action_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Approve the action and run it.

    Replayed as the developer who *requested* it, not the approver. Approving
    is permission to proceed, not a way to lend someone your access — running
    it as the reviewer would let an agent reach anything its approver can
    reach, which is a larger grant than anyone agreed to.

    Requires admin: a member being able to approve their own agent's held
    action would make the gate a formality.
    """
    await _require_member(db, workspace_id, str(current_user.id), role="admin")
    row = await _load(db, workspace_id, action_id)

    if row.status != ChangeStatus.PENDING.value:
        # Idempotent: a double-click must not run the call twice.
        return _to_response(row)

    row.status = ChangeStatus.APPROVED.value
    row.reviewed_by_id = str(current_user.id)
    row.reviewed_at = datetime.now(timezone.utc)

    from aexy.services.mcp_catalog import build_catalog
    from aexy.services.mcp_tool_executor import McpToolExecutor

    catalog = build_catalog(request.app.openapi())
    granted = {
        group["capability"] for group in catalog["capabilities"]
    }
    # No `db` passed: policy already ran, and a second evaluation would queue
    # the approved action behind itself forever.
    executor = McpToolExecutor(request.app, catalog, granted)
    outcome = await executor.call(
        tool_name=row.payload.get("tool_name", ""),
        arguments={**(row.payload.get("arguments") or {}), "action": row.payload.get("action")},
        developer_id=str(row.requested_by_id or current_user.id),
        workspace_id=workspace_id,
    )

    # Recorded whether or not it worked: an approval that then failed is a
    # thing the queue must be able to show, rather than implying every
    # approved action succeeded.
    row.result = {"is_error": outcome.is_error, "content": outcome.content[:4000]}
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.post("/{action_id}/reject", response_model=PendingActionResponse)
async def reject_pending_action(
    workspace_id: str,
    action_id: str,
    data: RejectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Decline the action. Nothing runs, and the reason is kept."""
    await _require_member(db, workspace_id, str(current_user.id), role="admin")
    row = await _load(db, workspace_id, action_id)

    if row.status != ChangeStatus.PENDING.value:
        return _to_response(row)

    row.status = ChangeStatus.REJECTED.value
    row.reviewed_by_id = str(current_user.id)
    row.reviewed_at = datetime.now(timezone.utc)
    row.reason = data.note
    await db.commit()
    await db.refresh(row)
    return _to_response(row)
