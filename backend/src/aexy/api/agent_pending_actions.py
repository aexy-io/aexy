"""The queue of agent actions waiting on a person.

Policy at the MCP boundary is evaluated before a call runs, so a
require-approval decision has no result to show a reviewer — only the request.
These endpoints are where somebody reads that request and decides, and where an
approved one is finally replayed.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.agent_action_log import AgentActionLog
from aexy.models.proposed_change import ChangeKind, ChangeStatus, ProposedChange
from aexy.models.developer import Developer
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/agent-actions", tags=["Agent Actions"]
)

# The one part of this surface an agent may read: the status of actions it
# asked for itself. Tagged separately so the catalogue can map it to
# `platform` while the queue above stays out of MCP entirely — an agent that
# could approve the queue holding its own writes would not be gated at all,
# but an agent that cannot see whether its own request was approved cannot
# finish the job it was asked to do.
self_router = APIRouter(
    prefix="/workspaces/{workspace_id}/agent-actions", tags=["Agent Actions Self"]
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


class AgentActivityResponse(BaseModel):
    """One row of the ledger: a mutating call an agent made in this workspace."""

    id: str
    workspace_id: str
    actor_kind: str
    actor_developer_id: str | None = None
    principal_id: str | None = None
    tool_name: str
    action: str
    method: str
    path: str
    resolved_path: str | None = None
    arguments: dict
    status_code: int | None = None
    is_error: bool
    duration_ms: int | None = None
    pending_action_id: str | None = None
    created_at: datetime


def _activity_response(row: AgentActionLog) -> AgentActivityResponse:
    return AgentActivityResponse(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        actor_kind=row.actor_kind,
        actor_developer_id=str(row.actor_developer_id) if row.actor_developer_id else None,
        principal_id=str(row.principal_id) if getattr(row, "principal_id", None) else None,
        tool_name=row.tool_name,
        action=row.action,
        method=row.method,
        path=row.path,
        resolved_path=row.resolved_path,
        arguments=row.arguments or {},
        status_code=row.status_code,
        is_error=row.is_error,
        duration_ms=row.duration_ms,
        pending_action_id=str(row.pending_action_id) if row.pending_action_id else None,
        created_at=row.created_at,
    )


async def _notify_requester(
    db: AsyncSession,
    row: ProposedChange,
    *,
    decided_by: Developer,
    approved: bool,
) -> None:
    """Tell the person whose grant the agent ran under what was decided.

    Best effort: a notification that cannot be sent must not undo a decision
    that has already been recorded.
    """
    if not row.requested_by_id or str(row.requested_by_id) == str(decided_by.id):
        return
    try:
        # A principal's synthetic developer has no inbox to read; the agent
        # learns the outcome by polling `agent-actions/mine` instead.
        requester = await db.get(Developer, str(row.requested_by_id))
        if requester is None or requester.account_type == "agent":
            return
        from aexy.models.notification import NotificationEventType
        from aexy.services.notification_service import NotificationService

        action = (row.payload or {}).get("action", "an action")
        outcome = "approved" if approved else "rejected"
        detail = ""
        if approved and row.result and row.result.get("is_error"):
            detail = " It ran, but the call failed — see the review queue for the response."
        elif not approved and row.reason:
            detail = f" Note: {row.reason}"
        await NotificationService(db).create_notification(
            recipient_id=str(row.requested_by_id),
            event_type=NotificationEventType.AGENT_ACTION_DECIDED,
            title=f"Agent action {outcome}: {action}",
            body=f"{decided_by.name or 'An admin'} {outcome} `{action}`.{detail}",
            context={
                "pending_action_id": str(row.id),
                "tool_name": action,
                "decision": outcome,
                "workspace_id": str(row.workspace_id),
                "action_url": "/review",
            },
        )
    except Exception:
        logger.warning("Could not notify requester of decision on %s", row.id, exc_info=True)


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
    # The consent the call was originally made under, not everything the
    # catalogue offers today. Granting the full set here would let an action
    # queued while a connector had CRM access still run after that access was
    # narrowed or withdrawn — approving is permission to proceed, not a
    # re-grant. Rows held before this was recorded fall back to the capability
    # the action itself belongs to, which is the narrowest honest answer.
    stored = (row.payload or {}).get("granted")
    if stored:
        granted = set(stored)
    else:
        action = (row.payload or {}).get("action", "")
        granted = {
            group["capability"]
            for group in catalog["capabilities"]
            for op in group["operations"]
            if op["action"] == action
        }
    # Policy is off: it already ran, and a second evaluation would queue the
    # approved action behind itself forever. The session is passed so the
    # replay is written to the ledger like any other agent write, linked to
    # this queue entry.
    # Replayed under the identity that asked, so the ledger row for the
    # approved run names the same principal as the row for the held attempt.
    payload = row.payload or {}
    principal_id = payload.get("principal_id")
    if principal_id is None and row.requested_by_id:
        from aexy.models.agent_principal import AgentPrincipal

        principal_id = (
            await db.execute(
                select(AgentPrincipal.id).where(
                    AgentPrincipal.developer_id == str(row.requested_by_id)
                )
            )
        ).scalar_one_or_none()
    executor = McpToolExecutor(
        request.app,
        catalog,
        granted,
        db=db,
        review_policy=False,
        principal_id=str(principal_id) if principal_id else None,
        actor_kind=payload.get("actor_kind") or ("principal" if principal_id else "mcp"),
    )
    outcome = await executor.call(
        tool_name=row.payload.get("tool_name", ""),
        arguments={**(row.payload.get("arguments") or {}), "action": row.payload.get("action")},
        developer_id=str(row.requested_by_id or current_user.id),
        workspace_id=workspace_id,
        pending_action_id=str(row.id),
    )

    # Recorded whether or not it worked: an approval that then failed is a
    # thing the queue must be able to show, rather than implying every
    # approved action succeeded.
    row.result = {"is_error": outcome.is_error, "content": outcome.content[:4000]}
    await _notify_requester(db, row, decided_by=current_user, approved=True)
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
    await _notify_requester(db, row, decided_by=current_user, approved=False)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.get("/activity", response_model=list[AgentActivityResponse])
async def list_agent_activity(
    workspace_id: str,
    actor_developer_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    errors_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """What agents have done in this workspace, newest first.

    The ledger of allowed writes — the counterpart to the queue of held ones.
    Reads are not here because they are never recorded.
    """
    await _require_member(db, workspace_id, str(current_user.id))

    stmt = select(AgentActionLog).where(AgentActionLog.workspace_id == workspace_id)
    if actor_developer_id:
        stmt = stmt.where(AgentActionLog.actor_developer_id == actor_developer_id)
    if action:
        stmt = stmt.where(AgentActionLog.action == action)
    if errors_only:
        stmt = stmt.where(AgentActionLog.is_error.is_(True))
    stmt = stmt.order_by(AgentActionLog.created_at.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    return [_activity_response(row) for row in rows]


@self_router.get("/mine", response_model=list[PendingActionResponse])
async def list_my_agent_actions(
    workspace_id: str,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """The held actions requested under the caller's own grant, newest first.

    Reachable over MCP (capability `platform`), unlike the rest of the queue:
    an agent told "this is waiting for approval" needs a way to find out that
    it was approved and carry on, and nothing here lets it decide anything —
    it sees only its own requests and their outcomes.
    """
    await _require_member(db, workspace_id, str(current_user.id))

    stmt = (
        select(ProposedChange)
        .where(ProposedChange.workspace_id == workspace_id)
        .where(ProposedChange.kind == ChangeKind.ACTION.value)
        .where(ProposedChange.requested_by_id == str(current_user.id))
    )
    if status_filter and status_filter != "all":
        stmt = stmt.where(ProposedChange.status == status_filter)
    stmt = stmt.order_by(ProposedChange.created_at.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    return [_to_response(row) for row in rows]
