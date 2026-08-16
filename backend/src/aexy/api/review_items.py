"""Everything in this workspace waiting on a person to decide.

Two gates produce work for humans, and they store it differently on purpose:
the content gate holds a *result* to diff against a page, the policy gate holds
an *intent* that has not run yet. `ProposedChange` holds both, with the
kind-specific part in its payload, so this is one query rather than a merge of
two lists in the client.

What this adds on top of the table is the *envelope* a reviewer reads: a title,
a line of plain language, and whether it needs attention — computed here rather
than stored, because staleness depends on the record as it is right now.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.documentation import Document
from aexy.models.proposed_change import ChangeKind, ChangeStatus, ProposedChange
from aexy.services.proposed_edits_service import compute_content_sha
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/review", tags=["Review"])


class ReviewItem(BaseModel):
    """One thing awaiting a decision, whichever gate produced it.

    The envelope is what the list renders: who caused it, when, why it is
    waiting, and a line of plain language. `kind` selects the detail view —
    a diff for a document, the operation and its arguments for a held action.
    """

    kind: str  # "document_proposal" | "agent_action"
    id: str
    title: str
    summary: str
    requested_by_id: str | None = None
    created_at: datetime
    # Why it is waiting. For a held action this is the policy's own words.
    reason: str | None = None
    needs_attention: bool = False

    # document_proposal only
    document_id: str | None = None
    document_icon: str | None = None
    source: str | None = None

    # agent_action only
    action: str | None = None
    method: str | None = None


class ReviewSummary(BaseModel):
    """Counts for a badge, without fetching the queue itself."""

    total: int
    document_proposals: int
    agent_actions: int


async def _require_member(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> None:
    if not await WorkspaceService(db).check_permission(
        workspace_id, developer_id, "member"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


def _describe_proposal(proposal, document) -> str:
    """A line a reviewer can act on without opening anything.

    Falls back to naming the source rather than inventing a count, because a
    confident wrong number is worse than an honest vague one.
    """
    summary = proposal.diff_summary or {}
    if isinstance(summary.get("summary"), str):
        return summary["summary"]

    added = len(summary.get("sections_added") or [])
    removed = len(summary.get("sections_removed") or [])
    changed = len(summary.get("headings_changed") or [])
    parts = []
    if added:
        parts.append(f"+{added} section{'s' if added != 1 else ''}")
    if removed:
        parts.append(f"−{removed} section{'s' if removed != 1 else ''}")
    if changed:
        parts.append(f"{changed} heading{'s' if changed != 1 else ''} changed")
    if parts:
        return ", ".join(parts)
    return "Proposed rewrite"


def _describe_action(row: ProposedChange) -> str:
    """What the agent is asking to do, in words rather than a payload.

    The document diff spent a release rendering `JSON.stringify` at reviewers;
    doing the same to a tool call would repeat the mistake in a new place.
    """
    payload = row.payload or {}
    body = (payload.get("arguments") or {}).get("body")
    target = (payload.get("action") or "").split(".")[-1].replace("_", " ")
    if isinstance(body, list):
        return f"Wants to {target} — {len(body)} items"
    if isinstance(body, dict) and body:
        fields = ", ".join(list(body)[:3])
        more = "…" if len(body) > 3 else ""
        return f"Wants to {target} — sets {fields}{more}"
    return f"Wants to {target}"


@router.get("", response_model=list[ReviewItem])
async def list_review_items(
    workspace_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Everything waiting on a decision, oldest first.

    Oldest first because the thing that has waited longest is the one most
    likely to have been forgotten — and, for a held action, an agent is
    blocked on it.
    """
    await _require_member(db, workspace_id, str(current_user.id))

    rows = (
        (
            await db.execute(
                select(ProposedChange)
                .where(ProposedChange.workspace_id == workspace_id)
                .where(ProposedChange.status == ChangeStatus.PENDING.value)
                .order_by(ProposedChange.created_at.asc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    # Documents are fetched in one go for the rows that name one, rather than
    # per row — the queue is the place most likely to hold a hundred items.
    document_ids = [
        row.entity_id
        for row in rows
        if row.entity_type == "document" and row.entity_id
    ]
    documents: dict[str, Document] = {}
    if document_ids:
        found = (
            (
                await db.execute(
                    select(Document).where(Document.id.in_(document_ids))
                )
            )
            .scalars()
            .all()
        )
        documents = {str(doc.id): doc for doc in found}

    items: list[ReviewItem] = []

    for row in rows:
        if row.kind == ChangeKind.CONTENT.value:
            document = documents.get(str(row.entity_id))
            if not document:
                # The record it concerns is gone; nothing to review against.
                continue
            items.append(
                ReviewItem(
                    kind="document_proposal",
                    id=str(row.id),
                    title=document.title,
                    summary=_describe_proposal(row, document),
                    requested_by_id=(
                        str(row.requested_by_id) if row.requested_by_id else None
                    ),
                    created_at=row.created_at,
                    # Stale means the page moved under the proposal, so
                    # approving overwrites edits it never saw.
                    needs_attention=bool(row.base_version)
                    and row.base_version != compute_content_sha(document.content),
                    document_id=str(document.id),
                    document_icon=document.icon,
                    source=row.source,
                )
            )
            continue

        payload = row.payload or {}
        items.append(
            ReviewItem(
                kind="agent_action",
                id=str(row.id),
                title=payload.get("action", "Agent action"),
                summary=_describe_action(row),
                requested_by_id=(
                    str(row.requested_by_id) if row.requested_by_id else None
                ),
                created_at=row.created_at,
                reason=row.reason,
                # An agent is stopped until somebody answers.
                needs_attention=True,
                action=payload.get("action"),
                method=(payload.get("method") or "").upper(),
            )
        )

    items.sort(key=lambda item: item.created_at)
    return items[:limit]


@router.get("/summary", response_model=ReviewSummary)
async def review_summary(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Counts only.

    Exists so a badge can be shown wherever people already look. A queue
    nobody opens is the failure this whole area keeps running into, and
    fetching the full list on every page load to render a number is the kind
    of cost that gets a badge removed later.
    """
    await _require_member(db, workspace_id, str(current_user.id))

    rows = (
        await db.execute(
            select(ProposedChange.kind, func.count(ProposedChange.id))
            .where(ProposedChange.workspace_id == workspace_id)
            .where(ProposedChange.status == ChangeStatus.PENDING.value)
            .group_by(ProposedChange.kind)
        )
    ).all()
    counts = {kind: count for kind, count in rows}

    return ReviewSummary(
        total=sum(counts.values()),
        document_proposals=counts.get(ChangeKind.CONTENT.value, 0),
        agent_actions=counts.get(ChangeKind.ACTION.value, 0),
    )
