"""What happens when an agent writes a document rather than a person.

An agent has no way to know which sentences a human wrote and cared about. A
silent overwrite leaves nothing to compare against — version history records
what changed, never that anyone would have disagreed.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from aexy.api import documents as documents_api
from aexy.models.documentation import ProposedEditSource
from aexy.schemas.document import DocumentUpdate, ProposeMarkdownRequest
from aexy.api.developers import AGENT_ACTOR

pytestmark = pytest.mark.asyncio

WORKSPACE = "11111111-1111-4111-8111-111111111111"
DOC = "22222222-2222-4222-8222-222222222222"
EXISTING = {"type": "doc", "content": [{"type": "paragraph"}]}
NEW = {"type": "doc", "content": [{"type": "paragraph", "attrs": {"n": 2}}]}


def document(content=EXISTING):
    return SimpleNamespace(
        id=DOC,
        workspace_id=WORKSPACE,
        parent_id=None,
        title="Session service",
        content=content,
        content_text=None,
        icon=None,
        cover_image=None,
        is_template=False,
        is_published=False,
        published_at=None,
        visibility="workspace",
        generation_status="draft",
        last_generated_at=None,
        created_by_id="dev-1",
        created_by=None,
        last_edited_by_id="dev-1",
        last_edited_by=None,
        position=0,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


def request(*, from_agent: bool):
    """A request as the auth dependency leaves it.

    The agent marker is the verified token's `actor` claim, recorded on
    `request.state` by `get_current_developer_id`. It used to be a request
    header — which the caller sets, so an agent holding an ordinary token and
    calling this API directly wrote straight through, and the contract these
    tests describe was opt-in by the agent.
    """
    actor = AGENT_ACTOR if from_agent else None
    return SimpleNamespace(state=SimpleNamespace(token_actor=actor), headers={})


@pytest.fixture(autouse=True)
def _wired(monkeypatch):
    async def permitted(*_args, **_kwargs):
        return None

    monkeypatch.setattr(documents_api, "check_workspace_permission", permitted)

    async def enabled(*_args, **_kwargs):
        return None

    monkeypatch.setattr(documents_api, "ensure_app_enabled", enabled)

    service = MagicMock()
    service.get_document = AsyncMock(return_value=document())
    service.update_document = AsyncMock(return_value=document(NEW))
    monkeypatch.setattr(documents_api, "DocumentService", lambda db: service)

    proposals = MagicMock()
    proposals.create_proposal = AsyncMock(
        return_value=SimpleNamespace(
            id="prop-1",
            document_id=DOC,
            source=ProposedEditSource.MANUAL_AI_EDIT.value,
            proposed_content=NEW,
            base_content_sha=None,
            diff_summary=None,
            status="pending",
            proposed_by_id="dev-1",
            proposed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            reviewed_by_id=None,
            reviewed_at=None,
            reason=None,
        )
    )
    monkeypatch.setattr(documents_api, "ProposedEditsService", lambda db: proposals)

    return SimpleNamespace(service=service, proposals=proposals)


class TestAgentContentWritesAreProposed:
    async def test_an_agent_rewrite_does_not_touch_the_document(self, _wired):
        await documents_api.update_document(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=DocumentUpdate(content=NEW),
            request=request(from_agent=True),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        _wired.service.update_document.assert_not_awaited()
        _wired.proposals.create_proposal.assert_awaited_once()

    async def test_the_agent_is_not_told_its_text_landed(self, _wired):
        """Returning the proposed content would have an agent read back its own
        write, see its text, and report success for a change nobody approved."""
        result = await documents_api.update_document(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=DocumentUpdate(content=NEW),
            request=request(from_agent=True),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        assert result.content == EXISTING

    async def test_the_proposal_is_attributed_to_the_human_behind_the_agent(
        self, _wired
    ):
        await documents_api.update_document(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=DocumentUpdate(content=NEW),
            request=request(from_agent=True),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        kwargs = _wired.proposals.create_proposal.await_args.kwargs
        assert kwargs["proposed_by_id"] == "dev-1"
        assert kwargs["source"] == ProposedEditSource.MANUAL_AI_EDIT

    async def test_a_person_writes_straight_through(self, _wired):
        await documents_api.update_document(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=DocumentUpdate(content=NEW),
            request=request(from_agent=False),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        _wired.service.update_document.assert_awaited_once()
        _wired.proposals.create_proposal.assert_not_awaited()

    async def test_an_agent_may_write_a_first_draft_directly(self, _wired):
        """Nothing to overwrite means nothing to protect, and asking someone to
        approve filling in a blank page is friction with no purpose."""
        _wired.service.get_document = AsyncMock(
            return_value=document({"type": "doc", "content": []})
        )

        await documents_api.update_document(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=DocumentUpdate(content=NEW),
            request=request(from_agent=True),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        _wired.service.update_document.assert_awaited_once()

    async def test_an_agent_may_rename_directly(self, _wired):
        """Small, obvious, reversible. Making someone approve a rename is how a
        gate earns its way into being switched off."""
        await documents_api.update_document(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=DocumentUpdate(title="Better name"),
            request=request(from_agent=True),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        _wired.service.update_document.assert_awaited_once()
        _wired.proposals.create_proposal.assert_not_awaited()


class TestTheMarkdownContract:
    async def test_markdown_becomes_a_document_the_editor_can_render(self, _wired):
        await documents_api.propose_document_update(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=ProposeMarkdownRequest(markdown="# Title\n\nBody text."),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        content = _wired.proposals.create_proposal.await_args.kwargs["proposed_content"]
        assert content["type"] == "doc"
        assert [n["type"] for n in content["content"]] == ["heading", "paragraph"]

    async def test_nothing_is_applied(self, _wired):
        await documents_api.propose_document_update(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=ProposeMarkdownRequest(markdown="# Title\n\nBody."),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        _wired.service.update_document.assert_not_awaited()

    async def test_a_summary_reaches_the_reviewer(self, _wired):
        await documents_api.propose_document_update(
            workspace_id=WORKSPACE,
            document_id=DOC,
            data=ProposeMarkdownRequest(
                markdown="# Title\n\nBody.", summary="Rewrote the auth section"
            ),
            current_user=SimpleNamespace(id="dev-1"),
            db=AsyncMock(),
        )

        kwargs = _wired.proposals.create_proposal.await_args.kwargs
        assert kwargs["diff_summary"] == {"summary": "Rewrote the auth section"}

    async def test_markdown_that_would_produce_nothing_is_refused(self, _wired):
        """Refused at the boundary rather than saved and discovered later as a
        page that renders blank."""
        with pytest.raises(HTTPException) as excinfo:
            await documents_api.propose_document_update(
                workspace_id=WORKSPACE,
                document_id=DOC,
                data=ProposeMarkdownRequest(markdown="   \n\n  "),
                current_user=SimpleNamespace(id="dev-1"),
                db=AsyncMock(),
            )

        assert excinfo.value.status_code == 422
        _wired.proposals.create_proposal.assert_not_awaited()

    async def test_a_missing_document_is_not_proposed_against(self, _wired):
        _wired.service.get_document = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as excinfo:
            await documents_api.propose_document_update(
                workspace_id=WORKSPACE,
                document_id=DOC,
                data=ProposeMarkdownRequest(markdown="# Title"),
                current_user=SimpleNamespace(id="dev-1"),
                db=AsyncMock(),
            )

        assert excinfo.value.status_code == 404


class TestTheExecutorDeclaresItself:
    def test_agent_traffic_is_labelled_on_re_entry(self):
        """Without the claim every endpoint sees an ordinary request and the
        contract silently does not apply — and no behavioural test would
        notice, because the write would simply succeed."""
        import inspect

        from aexy.services import mcp_tool_executor

        source = inspect.getsource(mcp_tool_executor)
        assert "actor=AGENT_ACTOR" in source

    def test_a_header_from_outside_decides_nothing(self):
        """It used to be the whole signal. A forged one could only ever restrict
        the forger — but the converse was the hole: omitting it routed an agent
        around review entirely. The claim is inside the signature, so setting it
        needs the secret."""
        from aexy.services.mcp_tool_executor import AGENT_ACTOR_HEADER

        forged = SimpleNamespace(
            state=SimpleNamespace(token_actor=None),
            headers={AGENT_ACTOR_HEADER: "mcp"},
        )
        assert documents_api.is_agent_request(forged) is False

        assert documents_api.is_agent_request(request(from_agent=True)) is True
        assert documents_api.is_agent_request(request(from_agent=False)) is False
