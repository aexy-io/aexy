"""Whether a write to this document needs somebody's approval, and whose.

`DocumentSpace.requires_approval` has existed and been migrated since Phase 0
and was read by nothing. The state machine it needs — `ProposedChange` and
`ProposedEditsService` — already worked, for agents. Making it work for people
took three fixes, and they are the substance of this module.

**Co-editing is off in an approval space.** `DocumentRoom._flatten` writes the
CRDT straight through `update_document` on a debounce, so live collaboration
bypasses the gate completely. The alternatives were to keep a draft body
separate from an approved one — the right product answer and a quarter of work —
or to gate API writes and not editor writes, which is a gate anyone can walk
around by opening the editor. A gate people believe in and can step over is
worse than none, so: an approval space refuses the socket and uses single-writer
saves, which become proposals. `api/collaboration.py` enforces it.

**Proposals no longer blindly supersede each other.** `create_proposal`
transitions every older pending proposal on the same document to `superseded`.
Correct for AI — one draft at a time, and a stale regeneration is noise.
Catastrophic for human review: two colleagues proposing changes means the second
silently discards the first, and the first author is never told. Supersession is
now conditional on authorship.

**You cannot approve your own proposal.** `approve()` took a `reviewed_by_id`
and applied. The endpoint checks document access, which the proposer has by
definition — so self-approval was possible and unexamined, which is the central
question of an approval gate. It is now refused, with a workspace setting for
teams that genuinely want "propose so it is recorded, then apply it yourself".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.documentation import (
    Document,
    DocumentSpace,
    DocumentSpaceMember,
    DocumentSpaceRole,
)
from aexy.services.document_access import AccessLevel, DocumentAccess

logger = logging.getLogger(__name__)

#: Workspace setting. Default false — the point of a gate is a second pair of
#: eyes, and a workspace that wants the record without the review has to say so.
SELF_APPROVAL_SETTING = "documents.allow_self_approval"


class ApprovalRequired(Exception):
    """The write became a proposal instead of landing."""

    def __init__(self, proposal_id: str) -> None:
        self.proposal_id = proposal_id
        super().__init__("This space reviews changes before they are published")


class NotAReviewer(PermissionError):
    """This person may not approve this proposal."""


@dataclass(slots=True)
class Policy:
    """What the space asks of this person."""

    required: bool
    #: True when the caller writes straight through anyway — a space or
    #: workspace admin. A gate that stops the person who configured it is a
    #: gate that gets switched off.
    exempt: bool
    space_id: str | None
    reviewers: list[str]

    @property
    def gates(self) -> bool:
        return self.required and not self.exempt


class DocumentApprovalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------

    async def policy_for(
        self, document: Document, developer_id: str
    ) -> Policy:
        """Whether this person's write to this document needs review."""
        if not document.space_id:
            # A document outside a space has no reviewers and nowhere to
            # configure them.
            return Policy(False, True, None, [])

        space = (
            await self.db.execute(
                select(DocumentSpace).where(DocumentSpace.id == document.space_id)
            )
        ).scalar_one_or_none()

        if space is None or not space.requires_approval:
            return Policy(False, True, str(document.space_id), [])

        reviewers = [str(r) for r in (space.approval_reviewers or [])]
        exempt = await self._is_exempt(document, space, developer_id)

        return Policy(True, exempt, str(space.id), reviewers)

    async def _is_exempt(
        self, document: Document, space: DocumentSpace, developer_id: str
    ) -> bool:
        access = DocumentAccess(self.db)

        # A workspace admin resolves to ADMIN on every document, so this covers
        # them as well as document-level admins.
        level = await access.resolve(
            document, developer_id, workspace_id=str(document.workspace_id)
        )
        if level >= AccessLevel.ADMIN:
            return True

        role = (
            await self.db.execute(
                select(DocumentSpaceMember.role).where(
                    DocumentSpaceMember.space_id == str(space.id),
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()
        return role == DocumentSpaceRole.ADMIN.value

    # ------------------------------------------------------------------

    async def may_approve(
        self,
        document: Document,
        proposal,
        developer_id: str,
    ) -> None:
        """Raise `NotAReviewer` unless this person may approve this proposal."""
        proposer = str(proposal.requested_by_id or "")
        if proposer and proposer == str(developer_id):
            if not await self._self_approval_allowed(str(document.workspace_id)):
                raise NotAReviewer(
                    "You proposed this change, so somebody else has to approve it"
                )

        policy = await self.policy_for(document, developer_id)

        # Outside an approval space the reviewer set is not configured, so the
        # question is only "may you edit this document" — which the endpoint
        # has already answered. Nothing further to check.
        if not policy.required:
            return

        if policy.reviewers:
            if str(developer_id) in policy.reviewers or policy.exempt:
                return
            raise NotAReviewer("You are not a reviewer for this space")

        # No explicit reviewer list: space admins, which `exempt` already means.
        if policy.exempt:
            return
        raise NotAReviewer("Only a space admin can approve changes here")

    async def _self_approval_allowed(self, workspace_id: str) -> bool:
        from aexy.models.workspace import Workspace

        workspace = (
            await self.db.execute(
                select(Workspace).where(Workspace.id == workspace_id)
            )
        ).scalar_one_or_none()
        settings = (workspace.settings or {}) if workspace else {}
        return bool(settings.get(SELF_APPROVAL_SETTING, False))

    # ------------------------------------------------------------------

    async def pick_reviewer(
        self, policy: Policy, exclude: str | None = None
    ) -> str | None:
        """Who to address a new proposal to.

        The proposer is excluded, because assigning somebody their own change
        recreates the self-approval problem in a friendlier shape. Returns None
        when there is nobody else, which the caller records rather than
        blocking on — an unassigned proposal in the queue is worse than no
        proposal, but refusing the edit outright is worse than both.
        """
        candidates = [r for r in policy.reviewers if r != str(exclude or "")]
        if candidates:
            return candidates[0]

        if not policy.space_id:
            return None

        admins = (
            (
                await self.db.execute(
                    select(DocumentSpaceMember.developer_id).where(
                        DocumentSpaceMember.space_id == policy.space_id,
                        DocumentSpaceMember.role == DocumentSpaceRole.ADMIN.value,
                    )
                )
            )
            .scalars()
            .all()
        )
        for admin in admins:
            if str(admin) != str(exclude or ""):
                return str(admin)
        return None
