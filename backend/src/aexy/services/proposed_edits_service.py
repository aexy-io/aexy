"""Service for the AI-suggestion approval queue.

`DocumentProposedEdit` rows sit between AI output and the canonical
`Document.content`. The legacy regenerate flow used to overwrite
content directly; this service is the new path:

  - `create(doc_id, source, content)` records a pending proposal and
    auto-supersedes any older pending proposals on the same doc (so
    nightly batch runs don't stack N proposals).
  - `approve(pe_id)` applies the content via DocumentService, which
    bumps the version chain, then marks the proposal approved.
  - `reject(pe_id, reason)` keeps the doc untouched and records the
    reason for audit.
  - `list_pending(doc_id)` powers the FE banner; each result carries
    a computed `is_stale` flag (proposal's `base_content_sha` no
    longer matches the document's current content SHA).

The FE groups results by `source` and renders a merge-conflict UX
when `is_stale=True`.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.documentation import (
    Document,
    DocumentProposedEdit,
    ProposedEditSource,
    ProposedEditStatus,
)
from aexy.services.document_service import DocumentService

_SOURCE_LABELS = {
    "code_change_sync": "Code change",
    "regenerate": "Manual regenerate",
    "suggest_improvements": "Suggested improvement",
    "manual_ai_edit": "AI edit",
}

logger = logging.getLogger(__name__)


def compute_content_sha(content: dict[str, Any] | None) -> str:
    """SHA-256 of a TipTap document's JSON.

    Deterministic key-sorted serialization so equivalent content
    hashes the same across calls. Empty / None content hashes the
    same as an empty doc — that matches the FE's "fresh document"
    semantics.
    """
    canonical = json.dumps(content or {}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class ProposedEditsService:
    """CRUD + transitions for `DocumentProposedEdit` rows."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Create ────────────────────────────────────────────────────

    async def create_proposal(
        self,
        document_id: str,
        source: ProposedEditSource | str,
        proposed_content: dict[str, Any],
        proposed_by_id: str | None = None,
        diff_summary: dict[str, Any] | None = None,
        base_content_sha: str | None = None,
    ) -> DocumentProposedEdit:
        """Create a new pending proposal.

        Side effects:
          - Any older `pending` proposals on the same document are
            transitioned to `superseded` with a reason pointing at the
            new id. Prevents N stale proposals stacking on busy docs.
          - If `base_content_sha` is None and the document exists, we
            snapshot the current content SHA so stale detection has
            something to compare against later.
        """
        source_val = source.value if isinstance(source, ProposedEditSource) else source

        # If caller didn't supply base_content_sha, snapshot it from
        # the current document. Done before supersede so concurrent
        # calls see consistent hash. We also hold onto the document
        # so we can notify the owner at the end without a
        # second round-trip.
        document_obj: Document | None = None
        if base_content_sha is None:
            document_obj = await self.db.get(Document, document_id)
            if document_obj is not None:
                base_content_sha = compute_content_sha(document_obj.content)

        # Create the new proposal first so we have the id for the
        # supersede reason.
        new_proposal = DocumentProposedEdit(
            document_id=document_id,
            source=source_val,
            proposed_content=proposed_content,
            base_content_sha=base_content_sha,
            diff_summary=diff_summary,
            status=ProposedEditStatus.PENDING.value,
            proposed_by_id=proposed_by_id,
            proposed_at=datetime.now(timezone.utc),
        )
        self.db.add(new_proposal)
        await self.db.flush()

        # Now supersede prior pending proposals (excluding the one we
        # just created).
        stmt = (
            update(DocumentProposedEdit)
            .where(
                and_(
                    DocumentProposedEdit.document_id == document_id,
                    DocumentProposedEdit.status == ProposedEditStatus.PENDING.value,
                    DocumentProposedEdit.id != new_proposal.id,
                )
            )
            .values(
                status=ProposedEditStatus.SUPERSEDED.value,
                reviewed_at=datetime.now(timezone.utc),
                reason=f"superseded by {new_proposal.id}",
            )
        )
        await self.db.execute(stmt)

        # Tell the document owner a proposal is waiting on them. Best-effort: a
        # missing document or missing owner shouldn't block proposal creation.
        await self._notify_owner(new_proposal, document_obj)

        return new_proposal

    async def _notify_owner(
        self,
        proposal: DocumentProposedEdit,
        document: Document | None,
    ) -> None:
        """Notify the document owner that a proposal needs review.

        Goes through NotificationService rather than the old
        `document_notifications` table. That table had no email, no per-user
        preference and no presence in the main notification bell — it was read
        only by an "Inbox" panel in the docs sidebar, so a proposal generated by a
        scheduled sync waited for the owner to happen to open that panel. Nobody
        clicked anything to cause it, which is exactly why it had to go and find
        them.
        """
        from aexy.services.notification_service import notify_document_ai_proposal

        # Cheap reload if the caller didn't already have the doc.
        if document is None:
            document = await self.db.get(Document, proposal.document_id)
        if document is None or not document.created_by_id:
            return
        # Don't notify someone about their own action.
        if proposal.proposed_by_id and str(proposal.proposed_by_id) == str(
            document.created_by_id
        ):
            return

        await notify_document_ai_proposal(
            db=self.db,
            recipient_id=str(document.created_by_id),
            document_id=str(document.id),
            document_title=document.title,
            actor_label=_SOURCE_LABELS.get(proposal.source, "AI"),
            workspace_id=str(document.workspace_id) if document.workspace_id else None,
            proposed_by_id=(
                str(proposal.proposed_by_id) if proposal.proposed_by_id else None
            ),
        )

    # ─── Read ──────────────────────────────────────────────────────

    async def list_pending(
        self,
        document_id: str,
    ) -> list[DocumentProposedEdit]:
        """Return all `pending` proposals for a document, newest first."""
        stmt = (
            select(DocumentProposedEdit)
            .where(
                and_(
                    DocumentProposedEdit.document_id == document_id,
                    DocumentProposedEdit.status
                    == ProposedEditStatus.PENDING.value,
                )
            )
            .order_by(DocumentProposedEdit.proposed_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_proposal(self, proposal_id: str) -> DocumentProposedEdit | None:
        return await self.db.get(DocumentProposedEdit, proposal_id)

    async def is_stale(self, proposal: DocumentProposedEdit) -> bool:
        """A proposal is stale when the document's current content SHA
        differs from the SHA the proposal was authored against.
        Returns False when there's no base_content_sha (legacy rows)
        — better to not show a false-positive conflict.
        """
        if not proposal.base_content_sha:
            return False
        doc = await self.db.get(Document, proposal.document_id)
        if not doc:
            return False
        current_sha = compute_content_sha(doc.content)
        return current_sha != proposal.base_content_sha

    # ─── Transitions ───────────────────────────────────────────────

    async def approve(
        self,
        proposal_id: str,
        reviewed_by_id: str,
    ) -> DocumentProposedEdit | None:
        """Apply the proposal to the document and mark it approved.

        Uses `DocumentService.update_document` so the existing version-
        creation logic kicks in — every approved proposal lands as a
        new `DocumentVersion`. No special handling for stale proposals
        here; the FE is responsible for showing the conflict badge and
        the user explicitly opts into "apply anyway".
        """
        proposal = await self.get_proposal(proposal_id)
        if not proposal:
            return None
        if proposal.status != ProposedEditStatus.PENDING.value:
            # Idempotent: returning the row in whatever state it's in.
            return proposal

        doc_service = DocumentService(self.db)
        await doc_service.update_document(
            document_id=proposal.document_id,
            updated_by_id=reviewed_by_id,
            content=proposal.proposed_content,
            create_version=True,
        )

        proposal.status = ProposedEditStatus.APPROVED.value
        proposal.reviewed_by_id = reviewed_by_id
        proposal.reviewed_at = datetime.now(timezone.utc)
        await self.db.flush()
        return proposal

    async def reject(
        self,
        proposal_id: str,
        reviewed_by_id: str,
        reason: str | None = None,
    ) -> DocumentProposedEdit | None:
        proposal = await self.get_proposal(proposal_id)
        if not proposal:
            return None
        if proposal.status != ProposedEditStatus.PENDING.value:
            return proposal

        proposal.status = ProposedEditStatus.REJECTED.value
        proposal.reviewed_by_id = reviewed_by_id
        proposal.reviewed_at = datetime.now(timezone.utc)
        proposal.reason = reason
        await self.db.flush()
        return proposal
