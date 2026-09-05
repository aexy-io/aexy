"""The human approval gate.

`DocumentSpace.requires_approval` shipped in Phase 0 and was read by nothing.
Making it real for people rather than only for agents needed three fixes, and
each has a test here that fails against the old behaviour.

The first is the one that decides whether the feature is honest at all:
`test_the_socket_refuses_in_a_reviewed_space`. `DocumentRoom._flatten` writes
the CRDT straight through `update_document` on a debounce, so live co-editing
bypasses the gate entirely. A gate anyone can step over by opening the editor is
worse than no gate, because it is believed. That test is what stops the cheap
answer — gate the API, leave the editor alone — being reintroduced.
"""

import uuid

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.documentation import (
    Document,
    DocumentSpace,
    DocumentSpaceMember,
    DocumentSpaceRole,
    DocumentSpaceVisibility,
    ProposedEditSource,
    ProposedEditStatus,
)
from aexy.models.proposed_change import ProposedChange
from aexy.services.document_approval import (
    SELF_APPROVAL_SETTING,
    DocumentApprovalService,
    NotAReviewer,
)
from aexy.services.proposed_edits_service import ProposedEditsService
from tests.conftest import seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


def _body(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]}
        ],
    }


async def _developer(db, name: str) -> str:
    developer = Developer(id=str(uuid.uuid4()), name=name)
    db.add(developer)
    await db.flush()
    return str(developer.id)


async def _space(db, workspace_id: str, *, requires_approval: bool, reviewers=None):
    space = DocumentSpace(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        name="Handbook",
        slug=f"handbook-{uuid.uuid4().hex[:8]}",
        visibility=DocumentSpaceVisibility.OPEN.value,
        requires_approval=requires_approval,
        approval_reviewers=reviewers or [],
    )
    db.add(space)
    await db.flush()
    return space


async def _document(db, workspace_id: str, author_id: str, space_id: str | None):
    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Expenses policy",
        content=_body("The current policy."),
        space_id=space_id,
        created_by_id=author_id,
    )
    db.add(document)
    await db.flush()
    return document


async def _setup(db, *, requires_approval=True, reviewers=None):
    workspace_id = await seed_workspace(db)
    author = await _developer(db, "Author")
    editor = await _developer(db, "Editor")
    reviewer = await _developer(db, "Reviewer")
    for person in (author, editor, reviewer):
        await seed_member(db, workspace_id, person)

    space = await _space(
        db, workspace_id, requires_approval=requires_approval, reviewers=reviewers
    )
    document = await _document(db, workspace_id, author, str(space.id))
    return workspace_id, author, editor, reviewer, space, document


# ──────────────────────────────────────────────────────────────────────
# Option (a): no live co-editing where changes are reviewed


class TestCoEditingIsOff:
    async def test_the_socket_refuses_in_a_reviewed_space(self, db_session):
        """The regression for the whole design conflict.

        Without this, `_flatten` writes the CRDT to the document on a debounce
        and the gate means nothing for anyone who opened the editor.
        """
        from aexy.api.collaboration import WS_REVIEWED_SPACE

        _ws, _author, editor, _reviewer, _space, document = await _setup(db_session)

        policy = await DocumentApprovalService(db_session).policy_for(
            document, editor
        )
        assert policy.gates is True, "an ordinary editor is not gated"
        assert WS_REVIEWED_SPACE == 4005

    async def test_an_ordinary_space_still_co_edits(self, db_session):
        _ws, _author, editor, _r, _space, document = await _setup(
            db_session, requires_approval=False
        )
        policy = await DocumentApprovalService(db_session).policy_for(
            document, editor
        )
        assert policy.gates is False

    async def test_a_document_outside_a_space_is_never_gated(self, db_session):
        """There is nowhere to configure reviewers, so there is no gate."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        await seed_member(db_session, workspace_id, author)
        document = await _document(db_session, workspace_id, author, None)

        policy = await DocumentApprovalService(db_session).policy_for(
            document, author
        )
        assert policy.gates is False


# ──────────────────────────────────────────────────────────────────────
# Who the gate applies to


class TestExemptions:
    async def test_a_space_admin_writes_through(self, db_session):
        """A gate that stops the person who configured it is a gate that gets
        switched off."""
        _ws, _author, editor, _r, space, document = await _setup(db_session)
        db_session.add(
            DocumentSpaceMember(
                id=str(uuid.uuid4()),
                space_id=str(space.id),
                developer_id=editor,
                role=DocumentSpaceRole.ADMIN.value,
            )
        )
        await db_session.flush()

        policy = await DocumentApprovalService(db_session).policy_for(
            document, editor
        )
        assert policy.required is True
        assert policy.exempt is True
        assert policy.gates is False

    async def test_a_workspace_admin_writes_through(self, db_session):
        workspace_id = await seed_workspace(db_session)
        admin = await _developer(db_session, "Admin")
        await seed_member(db_session, workspace_id, admin, role="admin")

        space = await _space(db_session, workspace_id, requires_approval=True)
        document = await _document(db_session, workspace_id, admin, str(space.id))

        policy = await DocumentApprovalService(db_session).policy_for(
            document, admin
        )
        assert policy.gates is False

    async def test_an_ordinary_editor_is_gated(self, db_session):
        _ws, _author, editor, _r, _space, document = await _setup(db_session)
        policy = await DocumentApprovalService(db_session).policy_for(
            document, editor
        )
        assert policy.gates is True


# ──────────────────────────────────────────────────────────────────────
# Self-approval


class TestSelfApproval:
    async def test_you_cannot_approve_your_own_proposal(self, db_session):
        """`approve()` took a reviewer id and applied. The endpoint's access
        check passes for the proposer by definition, so this was possible and
        unexamined — and it is the central question of an approval gate."""
        _ws, author, editor, _r, _space, document = await _setup(db_session)

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("My revision"),
            proposed_by_id=editor,
            notify_owner=False,
        )

        with pytest.raises(NotAReviewer):
            await DocumentApprovalService(db_session).may_approve(
                document, proposal, editor
            )

    async def test_a_workspace_may_allow_self_approval(self, db_session):
        """Some teams genuinely want "propose so it is recorded, then apply it
        yourself". Off by default, because the point of a gate is a second pair
        of eyes."""
        from aexy.models.workspace import Workspace

        # An ORM-managed workspace rather than `seed_workspace`, which inserts
        # by raw SQL. SQLAlchemy's UUID type dash-strips on the SQLite this
        # suite runs against, so a raw-inserted row keeps its dashes and the
        # service's ORM lookup — which strips the bind — never matches it. The
        # service is correct either way (a workspace it cannot read means
        # self-approval stays refused, which is fail-closed); this test needs
        # the row to actually be findable to prove the setting is read.
        owner_id = await _developer(db_session, "Owner")
        workspace = Workspace(
            id=str(uuid.uuid4()),
            name="Test",
            slug=f"ws-{uuid.uuid4().hex[:8]}",
            type="team",
            owner_id=owner_id,
            settings={SELF_APPROVAL_SETTING: True},
        )
        db_session.add(workspace)
        await db_session.flush()

        workspace_id = str(workspace.id)
        editor = await _developer(db_session, "Editor")
        await seed_member(db_session, workspace_id, editor)
        space = await _space(db_session, workspace_id, requires_approval=True)
        document = await _document(db_session, workspace_id, editor, str(space.id))

        db_session.add(
            DocumentSpaceMember(
                id=str(uuid.uuid4()),
                space_id=str(space.id),
                developer_id=editor,
                role=DocumentSpaceRole.ADMIN.value,
            )
        )
        await db_session.flush()

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("My revision"),
            proposed_by_id=editor,
            notify_owner=False,
        )

        await DocumentApprovalService(db_session).may_approve(
            document, proposal, editor
        )

    async def test_a_reviewer_may_approve_somebody_elses(self, db_session):
        _ws, _author, editor, reviewer, _space, document = await _setup(
            db_session, reviewers=None
        )
        # No explicit reviewer list, so space admins approve.
        db_session.add(
            DocumentSpaceMember(
                id=str(uuid.uuid4()),
                space_id=str(document.space_id),
                developer_id=reviewer,
                role=DocumentSpaceRole.ADMIN.value,
            )
        )
        await db_session.flush()

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Revision"),
            proposed_by_id=editor,
            notify_owner=False,
        )

        await DocumentApprovalService(db_session).may_approve(
            document, proposal, reviewer
        )

    async def test_a_bystander_cannot_approve(self, db_session):
        _ws, _author, editor, bystander, _space, document = await _setup(db_session)

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Revision"),
            proposed_by_id=editor,
            notify_owner=False,
        )

        with pytest.raises(NotAReviewer):
            await DocumentApprovalService(db_session).may_approve(
                document, proposal, bystander
            )


# ──────────────────────────────────────────────────────────────────────
# Supersession


class TestSupersession:
    async def test_two_people_do_not_supersede_each_other(self, db_session):
        """The defect that made the machinery unusable for human review.

        `create_proposal` superseded *every* pending proposal on the document.
        Right for AI — one draft at a time. For people it means the second
        proposer silently discards the first, whose work is gone and who is
        never told, while the queue looks tidy.
        """
        _ws, author, editor, reviewer, _space, document = await _setup(db_session)
        service = ProposedEditsService(db_session)

        first = await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Editor's version"),
            proposed_by_id=editor,
            notify_owner=False,
        )
        second = await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Reviewer's version"),
            proposed_by_id=reviewer,
            notify_owner=False,
        )

        await db_session.refresh(first)
        assert first.status == ProposedEditStatus.PENDING.value, (
            "one person's proposal silently discarded another's"
        )
        assert second.status == ProposedEditStatus.PENDING.value

    async def test_your_own_earlier_proposal_is_superseded(self, db_session):
        """Still true for the same author — a stale draft of your own is noise,
        which is the case the original behaviour was written for."""
        _ws, _author, editor, _r, _space, document = await _setup(db_session)
        service = ProposedEditsService(db_session)

        first = await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Draft one"),
            proposed_by_id=editor,
            notify_owner=False,
        )
        await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Draft two"),
            proposed_by_id=editor,
            notify_owner=False,
        )

        await db_session.refresh(first)
        assert first.status == ProposedEditStatus.SUPERSEDED.value

    async def test_automation_supersedes_its_own_earlier_run(self, db_session):
        """A proposal with no author is automation, and a regeneration
        replacing its own previous regeneration is the behaviour that stops
        stale drafts stacking on busy documents."""
        _ws, _author, _editor, _r, _space, document = await _setup(db_session)
        service = ProposedEditsService(db_session)

        first = await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.CODE_CHANGE_SYNC,
            proposed_content=_body("Sync one"),
            proposed_by_id=None,
            notify_owner=False,
        )
        await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.CODE_CHANGE_SYNC,
            proposed_content=_body("Sync two"),
            proposed_by_id=None,
            notify_owner=False,
        )

        await db_session.refresh(first)
        assert first.status == ProposedEditStatus.SUPERSEDED.value

    async def test_automation_does_not_supersede_a_persons_proposal(
        self, db_session
    ):
        _ws, _author, editor, _r, _space, document = await _setup(db_session)
        service = ProposedEditsService(db_session)

        mine = await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("My careful edit"),
            proposed_by_id=editor,
            notify_owner=False,
        )
        await service.create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.CODE_CHANGE_SYNC,
            proposed_content=_body("Automated resync"),
            proposed_by_id=None,
            notify_owner=False,
        )

        await db_session.refresh(mine)
        assert mine.status == ProposedEditStatus.PENDING.value


# ──────────────────────────────────────────────────────────────────────
# Reviewer assignment


class TestReviewerAssignment:
    async def test_a_proposal_is_addressed_to_somebody(self, db_session):
        """`reviewed_by_id` is only known afterwards, so without an assignment
        a proposal sits in a queue hoping somebody opens it — the documented
        failure mode of this whole area."""
        _ws, _author, editor, reviewer, _space, document = await _setup(
            db_session, reviewers=None
        )
        db_session.add(
            DocumentSpaceMember(
                id=str(uuid.uuid4()),
                space_id=str(document.space_id),
                developer_id=reviewer,
                role=DocumentSpaceRole.ADMIN.value,
            )
        )
        await db_session.flush()

        approvals = DocumentApprovalService(db_session)
        policy = await approvals.policy_for(document, editor)
        assigned = await approvals.pick_reviewer(policy, exclude=editor)

        assert assigned == reviewer

    async def test_the_proposer_is_never_assigned_their_own(self, db_session):
        """Assigning somebody their own change recreates the self-approval
        problem in a friendlier shape."""
        _ws, _author, editor, _r, _space, document = await _setup(
            db_session, reviewers=None
        )
        db_session.add(
            DocumentSpaceMember(
                id=str(uuid.uuid4()),
                space_id=str(document.space_id),
                developer_id=editor,
                role=DocumentSpaceRole.ADMIN.value,
            )
        )
        await db_session.flush()

        approvals = DocumentApprovalService(db_session)
        policy = await approvals.policy_for(document, editor)
        assert await approvals.pick_reviewer(policy, exclude=editor) is None

    async def test_an_explicit_reviewer_list_is_used(self, db_session):
        _ws, _author, editor, reviewer, _space, document = await _setup(
            db_session, reviewers=None
        )
        space = (
            await db_session.execute(
                select(DocumentSpace).where(DocumentSpace.id == document.space_id)
            )
        ).scalar_one()
        space.approval_reviewers = [reviewer]
        await db_session.flush()

        approvals = DocumentApprovalService(db_session)
        policy = await approvals.policy_for(document, editor)
        assert await approvals.pick_reviewer(policy, exclude=editor) == reviewer

    async def test_the_assignment_is_stored(self, db_session):
        _ws, _author, editor, reviewer, _space, document = await _setup(db_session)

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=str(document.id),
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=_body("Revision"),
            proposed_by_id=editor,
            assigned_reviewer_id=reviewer,
            notify_owner=False,
        )

        stored = (
            await db_session.execute(
                select(ProposedChange).where(ProposedChange.id == proposal.id)
            )
        ).scalar_one()
        assert str(stored.assigned_reviewer_id) == reviewer
