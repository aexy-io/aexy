"""Service for the AI-suggestion approval queue.

`ProposedChange` rows sit between AI output and the canonical
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
    CONTENT_FORMAT_DOCX,
    Document,
    ProposedEditSource,
    ProposedEditStatus,
)
from aexy.models.proposed_change import ChangeKind, ProposedChange
from aexy.services.document_service import DocumentService
from aexy.services.docx_service import get_docx_automation, resolve_ops_for_review

_SOURCE_LABELS = {
    "code_change_sync": "Code change",
    "regenerate": "Manual regenerate",
    "suggest_improvements": "Suggested improvement",
    "manual_ai_edit": "AI edit",
    "agent_docx_edit": "AI edit (Word)",
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


def current_document_sha(document: Document) -> str | None:
    """The sha a proposal's base should be compared against.

    Format-aware, and that is the whole point. Hashing a Word document's
    `content` compares the hash of `{}` against itself: every docx proposal
    would read as fresh no matter how many times the file had been saved since,
    so the merge-conflict badge would never appear on the one format where an
    unnoticed overwrite loses the most.

    Returns None for a Word document with no bytes yet, which no caller should
    treat as "fresh" — `bool(base_version)` already gates that.
    """
    if document.content_format == CONTENT_FORMAT_DOCX:
        return document.docx_content_sha
    return compute_content_sha(document.content)


def proposal_is_stale(proposal: ProposedChange, document: Document) -> bool:
    """Whether `document` has moved since `proposal` was written.

    The synchronous counterpart of `ProposedEditsService.is_stale`, for the
    queue endpoints that already hold both rows and must not issue a lookup per
    proposal.

    Reads `base_content_sha` rather than the `base_version` column behind it:
    that is the vocabulary the document code uses throughout, and one helper
    spelling it differently is how the two drift apart.
    """
    if not proposal.base_content_sha:
        return False
    return proposal.base_content_sha != current_document_sha(document)


class ProposedEditsService:
    """CRUD + transitions for a document's pending content proposals.

    Storage is `proposed_changes` — the one queue every gate writes to. This
    class keeps the vocabulary the document code has always used (proposal,
    proposed_content, base_content_sha) because that is the language of the
    feature, and translating at the boundary meant the move to a shared table
    changed no caller and no test.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Create ────────────────────────────────────────────────────

    async def create_proposal(
        self,
        document_id: str,
        source: ProposedEditSource | str,
        proposed_content: dict[str, Any] | None = None,
        proposed_by_id: str | None = None,
        diff_summary: dict[str, Any] | None = None,
        base_content_sha: str | None = None,
        trigger: dict[str, Any] | None = None,
        proposed_ops: list[dict[str, Any]] | None = None,
        notify_owner: bool = True,
        assigned_reviewer_id: str | None = None,
    ) -> ProposedChange:
        """Create a new pending proposal.

        Side effects:
          - Any older `pending` proposals on the same document are
            transitioned to `superseded` with a reason pointing at the
            new id. Prevents N stale proposals stacking on busy docs.
          - If `base_content_sha` is None and the document exists, we
            snapshot the current content SHA so stale detection has
            something to compare against later.

        ``notify_owner=False`` skips telling the document's owner. For a
        workspace that turned that off: the notification exists because usually
        nobody clicked anything, and a workspace whose documents all belong to
        one person should be able to stop it being told about its own automation.
        It never suppresses telling the person who *asked* for a draft — that is
        a different recipient and a different event.
        """
        source_val = source.value if isinstance(source, ProposedEditSource) else source

        # If caller didn't supply base_content_sha, snapshot it from
        # the current document. Done before supersede so concurrent
        # calls see consistent hash. We also hold onto the document
        # so we can notify the owner at the end without a
        # second round-trip.
        # Always loaded, not only when the sha is missing: the shared table
        # needs the workspace, and taking that from the document is the only
        # place it exists. Loading it conditionally left `workspace_id` null
        # for any caller that supplied its own sha — a NOT NULL violation that
        # depended on which argument the caller happened to pass.
        document_obj: Document | None = await self.db.get(Document, document_id)
        if document_obj is None:
            # The shared table needs the workspace, and the document is the
            # only place it exists — so a vanished document has to be refused
            # here rather than becoming a NOT NULL violation two frames later.
            raise ValueError(f"Document {document_id} no longer exists")

        # The two bodies are mutually exclusive, and so are the two proposal
        # shapes. Both refusals guard the same silent failure: a mismatched
        # proposal passes every check here — `compute_content_sha({})` is a
        # perfectly stable sha — and approving it writes the wrong kind of body
        # while the real one sits untouched. Refused at this one chokepoint
        # rather than in each caller, because this is the queue every AI write
        # path goes through, including the code-change sync that reaches it with
        # no HTTP request to guard.
        is_docx_document = document_obj.content_format == CONTENT_FORMAT_DOCX

        if is_docx_document and proposed_content is not None:
            raise ValueError(
                f"Document {document_id} is a Word document; a TipTap proposal "
                "cannot be applied to it. Send `proposed_ops` instead."
            )
        if not is_docx_document and proposed_ops is not None:
            raise ValueError(
                f"Document {document_id} is a TipTap document; an op list "
                "cannot be applied to it. Send `proposed_content` instead."
            )
        if proposed_content is None and proposed_ops is None:
            raise ValueError("A proposal needs either `proposed_content` or `proposed_ops`.")

        if is_docx_document:
            if not proposed_ops:
                raise ValueError("A Word document proposal needs at least one op.")

            # Resolve what the browser cannot: a table cell's coordinate is not
            # addressable through the editor's automation protocol, but it is
            # trivially resolvable here against the bytes this proposal is being
            # written for. Done at write time rather than at review time because
            # that is when "what the cell says now" is the thing the agent
            # actually saw.
            #
            # Best-effort: with no bytes to read, the ops are stored as written.
            # The headless path addresses cells by coordinate and is unaffected;
            # the redline path reports that it cannot locate the cell.
            ops_to_store = proposed_ops
            try:
                raw = await DocumentService(self.db).get_docx_bytes(document_id)
                if raw is not None:
                    ops_to_store = resolve_ops_for_review(raw, proposed_ops)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Could not resolve docx ops for %s; storing as written: %s",
                    document_id,
                    exc,
                )

            payload: dict[str, Any] = {"format": "docx", "ops": ops_to_store}
            # The docx counterpart of the content sha. Same role: the base the
            # redline was written against, so a proposal authored before someone
            # else's save is detected instead of replayed onto a document that
            # has moved.
            if base_content_sha is None:
                base_content_sha = document_obj.docx_content_sha
        else:
            payload = {"content": proposed_content}
            if base_content_sha is None:
                base_content_sha = compute_content_sha(document_obj.content)

        # Create the new proposal first so we have the id for the
        # supersede reason.
        new_proposal = ProposedChange(
            kind=ChangeKind.CONTENT.value,
            entity_type="document",
            entity_id=document_id,
            # Denormalised from the document so the workspace queue is one
            # indexed read rather than a join it cannot generalise.
            workspace_id=str(document_obj.workspace_id),
            payload=payload,
            source=source_val,
            base_version=base_content_sha,
            summary=diff_summary,
            # Why this exists, when something other than a person caused it.
            # Recorded here because this is the only moment the cause is known
            # — the sync service has the commit in hand and nothing downstream
            # can reconstruct it.
            trigger=trigger,
            status=ProposedEditStatus.PENDING.value,
            assigned_reviewer_id=assigned_reviewer_id,
            requested_by_id=proposed_by_id,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(new_proposal)
        await self.db.flush()

        # Supersede prior pending proposals — but only this author's.
        #
        # Superseding everything is right for AI: one draft at a time, and a
        # stale regeneration is noise. It is wrong the moment people propose,
        # because two colleagues each suggesting a change means the second
        # silently discards the first and the first author is never told. Their
        # work is gone and the queue looks tidy, which is the worst possible
        # combination.
        #
        # A proposal with no author is automation, and automation supersedes
        # its own earlier automation the way it always did.
        conditions = [
            ProposedChange.entity_type == "document",
            ProposedChange.entity_id == document_id,
            ProposedChange.status == ProposedEditStatus.PENDING.value,
            ProposedChange.id != new_proposal.id,
        ]
        if proposed_by_id:
            conditions.append(ProposedChange.requested_by_id == proposed_by_id)
        else:
            conditions.append(ProposedChange.requested_by_id.is_(None))

        await self.db.execute(
            update(ProposedChange)
            .where(and_(*conditions))
            .values(
                status=ProposedEditStatus.SUPERSEDED.value,
                reviewed_at=datetime.now(timezone.utc),
                reason=f"superseded by {new_proposal.id}",
            )
        )

        # Tell the document owner a proposal is waiting on them. Best-effort: a
        # missing document or missing owner shouldn't block proposal creation.
        if notify_owner:
            await self._notify_owner(new_proposal, document_obj)

        return new_proposal

    async def _notify_owner(
        self,
        proposal: ProposedChange,
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
    ) -> list[ProposedChange]:
        """Return all `pending` proposals for a document, newest first."""
        stmt = (
            select(ProposedChange)
            .where(
                and_(
                    ProposedChange.entity_id == document_id,
                    ProposedChange.status
                    == ProposedEditStatus.PENDING.value,
                )
            )
            .order_by(ProposedChange.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_proposal(self, proposal_id: str) -> ProposedChange | None:
        return await self.db.get(ProposedChange, proposal_id)

    async def is_stale(self, proposal: ProposedChange) -> bool:
        """A proposal is stale when the document has moved under it.

        Returns False when there's no base_content_sha (legacy rows)
        — better to not show a false-positive conflict.

        The comparison has to follow the document's format. Hashing a Word
        document's `content` would compare `compute_content_sha({})` against
        itself forever: every docx proposal would read as fresh no matter how
        many times the file had been saved since, which is the exact failure
        staleness detection exists to prevent.
        """
        if not proposal.base_content_sha:
            return False
        doc = await self.db.get(Document, proposal.document_id)
        if not doc:
            return False
        return proposal_is_stale(proposal, doc)

    # ─── Transitions ───────────────────────────────────────────────

    async def approve(
        self,
        proposal_id: str,
        reviewed_by_id: str,
    ) -> ProposedChange | None:
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

        if proposal.is_docx_proposal:
            # Nothing to write here, and that is the design rather than a gap.
            #
            # A Word proposal is reviewed as a redline: the ops are replayed into
            # the open editor in suggesting mode, the person accepts or rejects
            # each change with Word semantics, and *saving the document* is what
            # persists the outcome — through `replace_docx_bytes`, which creates
            # its own version. If this method also wrote something, the document
            # would take two uncoordinated writes for one review, and the second
            # would be a blind overwrite of the first.
            #
            # So approving records only that a human took the proposal up. The
            # unattended path is `apply_docx_proposal_headlessly`, which is
            # explicit about producing no redline.
            pass
        else:
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

    async def apply_docx_proposal_headlessly(
        self,
        proposal_id: str,
        applied_by_id: str,
    ) -> ProposedChange | None:
        """Apply a Word proposal with no human and no redline.

        For the unattended case — a scheduled job, a Temporal activity — where
        there is no browser holding the document open. The in-process backend
        writes a plain edit: `python-docx` cannot express `w:ins`/`w:del`, so
        there is nothing here for anyone to accept or reject afterwards.

        That difference is recorded on the row rather than left implicit.
        `result.redline` is false, and the UI says so, because "an AI edited this
        document and nobody looked" and "an AI proposed an edit a person
        approved" must not be indistinguishable in the history.

        Refuses a stale proposal outright. An interactive reviewer can be shown a
        conflict and decide; a background job has nobody to ask, and replaying an
        op list onto a document that has moved is how a find-and-replace lands in
        the wrong paragraph.
        """
        proposal = await self.get_proposal(proposal_id)
        if not proposal:
            return None
        if proposal.status != ProposedEditStatus.PENDING.value:
            return proposal
        if not proposal.is_docx_proposal:
            raise ValueError(
                f"Proposal {proposal_id} is not a Word document proposal."
            )
        if await self.is_stale(proposal):
            raise ValueError(
                f"Proposal {proposal_id} was written against an older version of "
                "this document; a person needs to review it."
            )

        ops = proposal.proposed_ops or []
        document_service = DocumentService(self.db)
        raw = await document_service.get_docx_bytes(str(proposal.document_id))
        if raw is None:
            raise ValueError("This document's bytes are not available")

        automation = get_docx_automation()
        edited = await automation.apply_ops(raw, ops, track_changes=False)

        await document_service.replace_docx_bytes(
            document_id=str(proposal.document_id),
            updated_by_id=applied_by_id,
            raw=edited,
            expected_sha=proposal.base_content_sha,
            change_summary="Applied an AI proposal (no redline)",
        )

        proposal.status = ProposedEditStatus.APPROVED.value
        proposal.reviewed_by_id = applied_by_id
        proposal.reviewed_at = datetime.now(timezone.utc)
        proposal.result = {"redline": False, "applied_ops": len(ops)}
        await self.db.flush()
        return proposal

    async def reject(
        self,
        proposal_id: str,
        reviewed_by_id: str,
        reason: str | None = None,
    ) -> ProposedChange | None:
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
