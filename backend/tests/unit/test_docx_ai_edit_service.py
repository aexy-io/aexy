"""Drafting an edit to a Word document with a model.

What is worth pinning here is not the happy path — it is every way a model's
answer can be wrong, because each one fails *silently* downstream. A `find` the
document does not contain produces a redline missing a change nobody mentions;
forty ops past a cap of twenty-five produces a proposal that is not the
proposal. Both are refused here, while there is still somebody to tell.
"""

from __future__ import annotations

import io
import json
from typing import Any

import pytest

from aexy.models.documentation import (
    CONTENT_FORMAT_DOCX,
    CONTENT_FORMAT_TIPTAP,
    ProposedEditSource,
)
from aexy.models.workspace import Workspace
from aexy.services import docx_ai_edit_service as svc
from aexy.services.docx_ai_edit_service import (
    DocxAiDisabledError,
    DocxAiEditError,
    DocxAiEditService,
    DraftRequest,
)
from tests.unit import docx_fixtures

docx = pytest.importorskip("docx", reason="python-docx is required for Word support")

WORKSPACE_ID = "11111111-1111-1111-1111-111111111111"
DOCUMENT_ID = "22222222-2222-2222-2222-222222222222"
USER_ID = "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def raw_docx() -> bytes:
    document = docx.Document()
    document.add_heading("Pricing", 1)
    document.add_paragraph("The platform costs $50k per year for the enterprise tier.")
    document.add_paragraph("Support is best effort during business hours.")
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Tier"
    table.cell(0, 1).text = "Price"
    table.cell(1, 0).text = "Enterprise"
    table.cell(1, 1).text = "50000"
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


class _Doc:
    """Just the fields the service reads."""

    def __init__(self, content_format: str = CONTENT_FORMAT_DOCX) -> None:
        self.id = DOCUMENT_ID
        self.content_format = content_format
        self.workspace_id = WORKSPACE_ID
        self.title = "Pricing"


class _FakeDb:
    """Answers `get` for the two models the service and its settings reader ask for."""

    def __init__(self, document: _Doc | None, docx_ai: dict[str, Any] | None) -> None:
        self._document = document
        workspace = Workspace(name="Acme", slug="acme")
        workspace.settings = {"docx_ai": docx_ai} if docx_ai else {}
        self._workspace = workspace

    async def get(self, model: Any, _id: str) -> Any:
        if model is Workspace:
            return self._workspace
        return self._document


class _StubGateway:
    """Stand-in for `LLMGateway`, returning a canned response."""

    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.last_user_prompt: str | None = None
        self.last_kwargs: dict[str, Any] = {}

    async def call_llm(self, *, system_prompt: str, user_prompt: str, **kwargs: Any):
        self.last_user_prompt = user_prompt
        self.last_kwargs = kwargs
        return (self.response_text, 100, 60, 40)


class _CapturedProposals:
    """Captures `create_proposal` instead of touching the database."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def __call__(self, _db: Any) -> _CapturedProposals:
        return self

    async def create_proposal(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        return object()


@pytest.fixture
def harness(monkeypatch, raw_docx: bytes):
    """Wire the service up with a canned model answer and no database."""

    def build(
        response: str | dict[str, Any],
        *,
        docx_ai: dict[str, Any] | None = None,
        document: _Doc | None = None,
        raw: bytes | None = raw_docx,
    ):
        text = response if isinstance(response, str) else json.dumps(response)
        gateway = _StubGateway(text)
        proposals = _CapturedProposals()
        monkeypatch.setattr(svc, "get_llm_gateway", lambda: gateway)
        monkeypatch.setattr(svc, "ProposedEditsService", proposals)

        service = DocxAiEditService(
            _FakeDb(_Doc() if document is None else document, docx_ai)  # type: ignore[arg-type]
        )

        async def _bytes(_document_id: str) -> bytes:
            if raw is None:
                raise DocxAiEditError("This document's file could not be loaded.")
            return raw

        monkeypatch.setattr(service, "_load_bytes", _bytes)
        return service, gateway, proposals

    return build


def _answer(*ops: dict[str, Any], summary: str = "Update the price.") -> dict[str, Any]:
    return {"summary": summary, "ops": list(ops)}


_REPLACE = {"kind": "replace_text", "find": "$50k", "replace": "$60k"}


class TestHappyPath:
    async def test_a_valid_answer_becomes_a_pending_proposal(self, harness) -> None:
        service, _, proposals = harness(_answer(_REPLACE))

        await service.draft_edit(
            DraftRequest(
                document_id=DOCUMENT_ID,
                requested_by_id=USER_ID,
                instruction="Raise the enterprise price to $60k.",
            )
        )

        [call] = proposals.calls
        assert call["source"] is ProposedEditSource.AGENT_DOCX_EDIT
        assert call["proposed_ops"] == [_REPLACE]
        assert call["proposed_by_id"] == USER_ID
        assert call["diff_summary"] == {"summary": "Update the price.", "op_count": 1}

    async def test_a_fenced_answer_is_still_read(self, harness) -> None:
        # Models wrap JSON in ``` despite being told not to.
        service, _, proposals = harness(
            "```json\n" + json.dumps(_answer(_REPLACE)) + "\n```"
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
        )
        assert len(proposals.calls) == 1

    async def test_the_workspace_is_passed_to_the_gateway(self, harness) -> None:
        # This is what applies the workspace AI kill switch and a BYO provider
        # key. Four of five DocumentGenerationService methods omit it and
        # silently bypass both; this test is here so this one cannot join them.
        service, gateway, _ = harness(_answer(_REPLACE))
        await service.draft_edit(
            DraftRequest(
                document_id=DOCUMENT_ID, requested_by_id=USER_ID, instruction="Raise it."
            )
        )
        assert gateway.last_kwargs["workspace_id"] == WORKSPACE_ID
        assert gateway.last_kwargs["developer_id"] == USER_ID


class TestPromptContents:
    async def test_the_prompt_carries_plain_paragraph_text_not_markdown(
        self, harness
    ) -> None:
        # The reason `DocxExtract.paragraphs` exists. A model shown `**Tier**`
        # writes a `find` with asterisks in it and matches nothing.
        service, gateway, _ = harness(_answer(_REPLACE))
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
        )
        prompt = gateway.last_user_prompt or ""
        assert "The platform costs $50k per year for the enterprise tier." in prompt
        assert "**" not in prompt

    async def test_table_coordinates_are_given(self, harness) -> None:
        # The automation protocol has no table ops, so a cell is reachable only
        # by (table_index, row, column) — which the model has to be told.
        service, gateway, _ = harness(_answer(_REPLACE))
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
        )
        prompt = gateway.last_user_prompt or ""
        assert "Table 0:" in prompt
        assert "[col 1] Price" in prompt

    async def test_a_selection_is_quoted_and_fenced_off(self, harness) -> None:
        service, gateway, _ = harness(_answer(_REPLACE))
        await service.draft_edit(
            DraftRequest(
                document_id=DOCUMENT_ID,
                instruction="Tighten this.",
                selection_text="Support is best effort during business hours.",
                scope="selection",
            )
        )
        prompt = gateway.last_user_prompt or ""
        assert "Change nothing outside it" in prompt
        assert "Support is best effort during business hours." in prompt


class TestRefusals:
    async def test_a_tiptap_document_is_refused(self, harness) -> None:
        service, _, _ = harness(
            _answer(_REPLACE), document=_Doc(CONTENT_FORMAT_TIPTAP)
        )
        with pytest.raises(DocxAiEditError, match="not a Word document"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )

    async def test_a_missing_document_is_refused(self, harness) -> None:
        service, _, _ = harness(_answer(_REPLACE))
        service.db = _FakeDb(None, None)  # type: ignore[assignment]
        with pytest.raises(DocxAiEditError, match="no longer exists"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )

    async def test_a_workspace_with_the_feature_off_is_refused(self, harness) -> None:
        # Refused in the service, not only at the route, so the background
        # activity and the mention scan are covered by the same rule.
        service, gateway, proposals = harness(
            _answer(_REPLACE), docx_ai={"mode": "off"}
        )
        with pytest.raises(DocxAiDisabledError):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )
        # And the model was never called, so a disabled workspace costs nothing.
        assert gateway.last_user_prompt is None
        assert proposals.calls == []

    async def test_an_empty_request_is_refused(self, harness) -> None:
        service, _, _ = harness(_answer(_REPLACE))
        with pytest.raises(DocxAiEditError, match="what the AI should change"):
            await service.draft_edit(DraftRequest(document_id=DOCUMENT_ID))

    async def test_an_unreadable_answer_is_refused(self, harness) -> None:
        service, _, _ = harness("I would be happy to help with that!")
        with pytest.raises(DocxAiEditError, match="could not be read"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )

    async def test_an_answer_with_no_summary_is_refused(self, harness) -> None:
        # The summary is what a reviewer reads before opening the redline.
        service, _, _ = harness({"ops": [_REPLACE]})
        with pytest.raises(DocxAiEditError, match="did not say what its edit changes"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )

    async def test_an_answer_with_no_ops_is_refused(self, harness) -> None:
        service, _, _ = harness({"summary": "Nothing to do.", "ops": []})
        with pytest.raises(DocxAiEditError, match="proposed no edits"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )

    async def test_a_malformed_op_is_refused_by_shape(self, harness) -> None:
        service, _, _ = harness(_answer({"kind": "replace_text"}))
        with pytest.raises(DocxAiEditError, match="find"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )

    async def test_an_unknown_op_kind_is_refused(self, harness) -> None:
        service, _, _ = harness(_answer({"kind": "delete_everything"}))
        with pytest.raises(DocxAiEditError, match="delete_everything"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )


class TestOpsAreCheckedAgainstTheDocument:
    async def test_a_find_that_is_not_in_the_document_is_refused(
        self, harness
    ) -> None:
        # The single most common way a model's edit fails, and it fails silently
        # downstream: the browser skips the op and the reviewer sees a redline
        # missing a change nobody told them about.
        service, _, proposals = harness(
            _answer({"kind": "replace_text", "find": "$70k", "replace": "$80k"})
        )
        with pytest.raises(DocxAiEditError, match="does not contain"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )
        assert proposals.calls == []

    async def test_a_find_invented_from_markdown_is_refused(self, harness) -> None:
        service, _, _ = harness(
            _answer({"kind": "replace_text", "find": "**Tier**", "replace": "Plan"})
        )
        with pytest.raises(DocxAiEditError, match="does not contain"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Rename it.")
            )

    async def test_a_comment_anchor_that_is_absent_is_refused(self, harness) -> None:
        service, _, _ = harness(
            _answer({"kind": "add_comment", "anchor_find": "$70k", "text": "Check?"})
        )
        with pytest.raises(DocxAiEditError, match="does not contain"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Flag the price.")
            )

    async def test_text_inside_a_table_cell_is_addressable(self, harness) -> None:
        # Table-cell paragraphs are in the addressable list, so a `find` the
        # model read off a cell must not be rejected as absent.
        service, _, proposals = harness(
            _answer({"kind": "replace_text", "find": "Enterprise", "replace": "Scale"})
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Rename the tier.")
        )
        assert len(proposals.calls) == 1

    async def test_answering_a_comment_that_does_not_exist_is_refused(
        self, harness
    ) -> None:
        service, _, _ = harness(
            _answer({"kind": "reply_to_comment", "comment_id": "4", "text": "Done."})
        )
        with pytest.raises(DocxAiEditError, match="not in this document"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Answer it.")
            )


class TestWorkspacePolicy:
    async def test_more_ops_than_the_cap_is_refused_not_truncated(
        self, harness
    ) -> None:
        # Keeping the first N of a longer list hands a reviewer a redline that is
        # not the proposal, which is worse than refusing.
        many = [_REPLACE] * 4
        service, _, proposals = harness(_answer(*many), docx_ai={"max_ops": 2})
        with pytest.raises(DocxAiEditError, match="limit of 2"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
            )
        assert proposals.calls == []

    async def test_comments_are_dropped_when_the_workspace_disallows_them(
        self, harness
    ) -> None:
        # Dropped rather than refused: the model chose to raise a concern
        # instead of rewriting, and losing the remark is a smaller harm than
        # losing the edits that came with it.
        service, _, proposals = harness(
            _answer(
                _REPLACE,
                {"kind": "add_comment", "anchor_find": "$50k", "text": "Sure?"},
            ),
            docx_ai={"allow_ai_comments": False},
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
        )
        [call] = proposals.calls
        assert call["proposed_ops"] == [_REPLACE]

    async def test_an_answer_that_was_only_comments_is_refused_when_disallowed(
        self, harness
    ) -> None:
        service, _, _ = harness(
            _answer({"kind": "add_comment", "anchor_find": "$50k", "text": "Sure?"}),
            docx_ai={"allow_ai_comments": False},
        )
        with pytest.raises(DocxAiEditError, match="comments are switched off"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, instruction="Look at the price.")
            )

    async def test_comments_survive_when_the_workspace_allows_them(
        self, harness
    ) -> None:
        comment = {"kind": "add_comment", "anchor_find": "$50k", "text": "Sure?"}
        service, _, proposals = harness(_answer(_REPLACE, comment))
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
        )
        [call] = proposals.calls
        assert call["proposed_ops"] == [_REPLACE, comment]

    async def test_the_owner_notification_follows_the_setting(self, harness) -> None:
        service, _, proposals = harness(
            _answer(_REPLACE), docx_ai={"notify_owner": False}
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, instruction="Raise it.")
        )
        assert proposals.calls[0]["notify_owner"] is False


class TestAddressingComments:
    async def test_a_document_with_no_comments_says_so(self, harness) -> None:
        service, _, _ = harness(_answer(_REPLACE))
        with pytest.raises(DocxAiEditError, match="no comments to answer"):
            await service.draft_edit(
                DraftRequest(document_id=DOCUMENT_ID, address_comments=True)
            )

    async def test_open_comments_reach_the_prompt_with_the_text_they_are_about(
        self, harness
    ) -> None:
        # A comment carries no copy of the words it points at, so without the
        # anchor the model reads "Tighten this sentence" and has nothing to
        # tighten.
        service, gateway, _ = harness(
            _answer(_REPLACE), raw=docx_fixtures.commented_docx()
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, address_comments=True)
        )
        prompt = gateway.last_user_prompt or ""
        assert "[comment 2]" in prompt
        assert 'about "best effort"' in prompt
        assert "Tighten this sentence." in prompt

    async def test_resolved_threads_are_left_out(self, harness) -> None:
        # They have been dealt with, and offering them invites the model to
        # reopen a settled argument.
        service, gateway, _ = harness(
            _answer(_REPLACE), raw=docx_fixtures.commented_docx()
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, address_comments=True)
        )
        prompt = gateway.last_user_prompt or ""
        assert "Is this still the enterprise price?" not in prompt
        assert "Checking with finance." not in prompt

    async def test_a_mention_trigger_narrows_to_the_comments_it_names(
        self, harness
    ) -> None:
        service, gateway, _ = harness(
            _answer(_REPLACE), raw=docx_fixtures.commented_docx()
        )
        await service.draft_edit(
            DraftRequest(
                document_id=DOCUMENT_ID, address_comments=True, comment_ids=("2",)
            )
        )
        prompt = gateway.last_user_prompt or ""
        assert "Answer these comments and nothing else: 2" in prompt

    async def test_answering_a_real_comment_is_accepted(self, harness) -> None:
        reply = {"kind": "reply_to_comment", "comment_id": "2", "text": "Tightened."}
        service, _, proposals = harness(
            _answer(_REPLACE, reply), raw=docx_fixtures.commented_docx()
        )
        await service.draft_edit(
            DraftRequest(document_id=DOCUMENT_ID, address_comments=True)
        )
        [call] = proposals.calls
        assert reply in call["proposed_ops"]

    async def test_answering_a_resolved_comment_is_still_allowed(
        self, harness
    ) -> None:
        # The prompt hides resolved threads, but a model asked about a specific
        # id must not be refused for it — reopening is a decision, not a bug,
        # and the reviewer sees it either way.
        reply = {"kind": "reply_to_comment", "comment_id": "0", "text": "Still $50k."}
        service, _, proposals = harness(
            _answer(reply), raw=docx_fixtures.commented_docx()
        )
        await service.draft_edit(
            DraftRequest(
                document_id=DOCUMENT_ID, address_comments=True, comment_ids=("0",)
            )
        )
        assert len(proposals.calls) == 1
