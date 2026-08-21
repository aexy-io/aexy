"""AI proposals against a Word document.

Two failure modes are pinned here, both of which look like success:

* **Staleness that never fires.** A Word document's `content` is `{}`, so
  hashing it gives the same sha forever. A proposal written against yesterday's
  document would read as perfectly fresh, and approving it would replay
  yesterday's find-and-replace onto today's paragraphs.

* **A double write on approve.** A Word proposal is applied by the browser and
  persisted by saving the bytes. If `approve` also wrote something, one review
  would produce two uncoordinated writes and the second would silently discard
  the first.
"""

import io
import uuid

import pytest

from aexy.models.developer import Developer
from aexy.models.documentation import ProposedEditSource
from aexy.services.document_service import DocumentService
from aexy.services.docx_service import (
    DocxOpUnsupported,
    extract_structured,
    validate_ops,
)
from aexy.services.proposed_edits_service import ProposedEditsService
from tests.conftest import seed_workspace

docx = pytest.importorskip("docx", reason="python-docx is required for Word support")

pytestmark = pytest.mark.asyncio


class _FakeStorage:
    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    def is_configured(self):
        return True

    def put_object(self, key, data, content_type, **_):
        self.objects[key] = (data, content_type)
        return True

    def get_object(self, key):
        return self.objects.get(key)


@pytest.fixture
def storage(mocker):
    fake = _FakeStorage()
    mocker.patch(
        "aexy.services.document_service.get_storage_service", return_value=fake
    )
    return fake


def _docx_bytes(body="Discounts above 20% need finance sign-off.") -> bytes:
    document = docx.Document()
    document.add_heading("Pricing policy", 1)
    document.add_paragraph(body)
    document.add_heading("Notes", 2)
    document.add_paragraph("Ask finance.")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


async def _developer(db) -> str:
    developer = Developer(id=str(uuid.uuid4()), name="Ada")
    db.add(developer)
    await db.flush()
    return str(developer.id)


async def _docx_document(db, storage):
    workspace_id = await seed_workspace(db)
    author = await _developer(db)
    document = await DocumentService(db).create_docx_document(
        workspace_id=workspace_id,
        created_by_id=author,
        raw=_docx_bytes(),
        title="Pricing policy",
    )
    return document, author


async def _tiptap_document(db):
    workspace_id = await seed_workspace(db)
    author = await _developer(db)
    document = await DocumentService(db).create_document(
        workspace_id=workspace_id,
        created_by_id=author,
        title="Runbook",
        content={
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Hi."}]}
            ],
        },
    )
    return document, author


_OPS = [{"kind": "replace_text", "find": "20%", "replace": "30%"}]


# ─── Shape validation ─────────────────────────────────────────────────────


class TestValidateOps:
    async def test_a_good_op_list_passes(self):
        validate_ops(_OPS)

    async def test_an_empty_list_is_refused(self):
        with pytest.raises(DocxOpUnsupported, match="at least one op"):
            validate_ops([])

    async def test_an_unknown_kind_names_its_index(self):
        """A ten-op list with one bad entry is exactly where a precise message
        saves the agent a round trip."""
        with pytest.raises(DocxOpUnsupported, match="Op 1 has kind 'teleport'"):
            validate_ops([_OPS[0], {"kind": "teleport"}])

    async def test_a_missing_required_field_names_it(self):
        with pytest.raises(DocxOpUnsupported, match="missing required field 'find'"):
            validate_ops([{"kind": "replace_text", "replace": "x"}])

    async def test_a_non_object_op_is_refused(self):
        with pytest.raises(DocxOpUnsupported, match="not an object"):
            validate_ops(["replace everything"])  # type: ignore[list-item]


# ─── Creating ─────────────────────────────────────────────────────────────


class TestCreateDocxProposal:
    async def test_ops_land_in_the_payload_envelope(self, db_session, storage):
        document, author = await _docx_document(db_session, storage)

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )

        assert proposal.is_docx_proposal is True
        assert proposal.proposed_ops == _OPS
        # Mutually exclusive with the TipTap shape: a caller that finds ops must
        # not also find content.
        assert proposal.proposed_content is None

    async def test_the_base_sha_is_the_documents_docx_sha(self, db_session, storage):
        """Not `compute_content_sha(content)`, which for a Word document is the
        hash of `{}` and identical for every document that ever existed."""
        document, author = await _docx_document(db_session, storage)

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )

        assert proposal.base_content_sha == document.docx_content_sha
        assert proposal.base_content_sha is not None

    async def test_the_document_is_untouched(self, db_session, storage):
        document, author = await _docx_document(db_session, storage)
        before = document.docx_content_sha

        await ProposedEditsService(db_session).create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )

        refreshed = await DocumentService(db_session).get_document(document.id)
        assert refreshed.docx_content_sha == before
        assert "20%" in refreshed.content_text


class TestCrossFormatRefusals:
    async def test_tiptap_content_against_a_word_document(self, db_session, storage):
        document, author = await _docx_document(db_session, storage)

        with pytest.raises(ValueError, match="Send `proposed_ops` instead"):
            await ProposedEditsService(db_session).create_proposal(
                document_id=document.id,
                source=ProposedEditSource.MANUAL_AI_EDIT,
                proposed_content={"type": "doc", "content": []},
                proposed_by_id=author,
            )

    async def test_ops_against_a_tiptap_document(self, db_session, storage):
        """The mirror image, and just as silent: ops replayed against a document
        with no bytes would apply to nothing at all."""
        document, author = await _tiptap_document(db_session)

        with pytest.raises(ValueError, match="Send `proposed_content` instead"):
            await ProposedEditsService(db_session).create_proposal(
                document_id=document.id,
                source=ProposedEditSource.AGENT_DOCX_EDIT,
                proposed_ops=_OPS,
                proposed_by_id=author,
            )

    async def test_neither_is_refused(self, db_session, storage):
        document, author = await _tiptap_document(db_session)

        with pytest.raises(ValueError, match="either"):
            await ProposedEditsService(db_session).create_proposal(
                document_id=document.id,
                source=ProposedEditSource.MANUAL_AI_EDIT,
                proposed_by_id=author,
            )

    async def test_an_empty_op_list_is_refused(self, db_session, storage):
        document, author = await _docx_document(db_session, storage)

        with pytest.raises(ValueError, match="at least one op"):
            await ProposedEditsService(db_session).create_proposal(
                document_id=document.id,
                source=ProposedEditSource.AGENT_DOCX_EDIT,
                proposed_ops=[],
                proposed_by_id=author,
            )


# ─── Staleness ────────────────────────────────────────────────────────────


class TestStaleness:
    async def test_a_fresh_proposal_is_not_stale(self, db_session, storage):
        document, author = await _docx_document(db_session, storage)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )

        assert await service.is_stale(proposal) is False

    async def test_a_save_makes_it_stale(self, db_session, storage):
        """The regression that matters. Comparing hashes of `content` would
        return False here forever, and the reviewer would be shown a clean
        proposal built against a document that has since changed."""
        document, author = await _docx_document(db_session, storage)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )
        assert await service.is_stale(proposal) is False

        await DocumentService(db_session).replace_docx_bytes(
            document_id=document.id,
            updated_by_id=author,
            raw=_docx_bytes(body="Somebody else rewrote this line."),
        )

        assert await service.is_stale(proposal) is True


# ─── Approving ────────────────────────────────────────────────────────────


class TestApprove:
    async def test_approve_records_the_decision_without_writing(
        self, db_session, storage
    ):
        """The browser applies the redline and saves the bytes. A write here
        would be a second, uncoordinated write for one review."""
        document, author = await _docx_document(db_session, storage)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )
        sha_before = document.docx_content_sha

        approved = await service.approve(proposal.id, reviewed_by_id=author)

        assert approved.status == "approved"
        refreshed = await DocumentService(db_session).get_document(document.id)
        # Untouched: same bytes, same text, no new version.
        assert refreshed.docx_content_sha == sha_before
        assert "20%" in refreshed.content_text
        # Only the version the document was created with.
        history = await DocumentService(db_session).get_version_history(document.id)
        assert len(history) == 1

    async def test_a_tiptap_proposal_still_applies_on_approve(self, db_session, storage):
        """The docx branch must not have changed the TipTap path."""
        document, author = await _tiptap_document(db_session)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Rewritten."}],
                    }
                ],
            },
            proposed_by_id=author,
        )
        await service.approve(proposal.id, reviewed_by_id=author)

        refreshed = await DocumentService(db_session).get_document(document.id)
        assert "Rewritten." in (refreshed.content_text or "")


# ─── Headless apply ───────────────────────────────────────────────────────


class TestHeadlessApply:
    async def test_it_applies_and_records_that_there_is_no_redline(
        self, db_session, storage
    ):
        """"An AI edited this and nobody looked" and "an AI proposed an edit a
        person approved" must be distinguishable in the history."""
        document, author = await _docx_document(db_session, storage)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )

        applied = await service.apply_docx_proposal_headlessly(
            proposal.id, applied_by_id=author
        )

        assert applied.status == "approved"
        assert applied.result == {"redline": False, "applied_ops": 1}

        refreshed = await DocumentService(db_session).get_document(document.id)
        assert "30%" in refreshed.content_text
        assert "20%" not in refreshed.content_text
        # A real save, so a real version.
        history = await DocumentService(db_session).get_version_history(document.id)
        assert [v.version_number for v in history] == [2, 1]

    async def test_the_saved_bytes_carry_no_tracked_changes(
        self, db_session, storage
    ):
        """Stated as a test because it is the cost of this path: python-docx
        cannot write `w:ins`/`w:del`, so there is nothing to review afterwards."""
        document, author = await _docx_document(db_session, storage)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )
        await service.apply_docx_proposal_headlessly(proposal.id, applied_by_id=author)

        raw = await DocumentService(db_session).get_docx_bytes(document.id)
        import zipfile

        with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
            body = bundle.read("word/document.xml").decode()
        assert "<w:ins" not in body
        assert "<w:del" not in body
        # And the edit really did land.
        assert "30%" in extract_structured(raw).markdown

    async def test_a_stale_proposal_is_refused(self, db_session, storage):
        """An interactive reviewer can be shown a conflict and decide. A
        background job has nobody to ask, and replaying an op list onto a moved
        document is how a find-and-replace lands in the wrong paragraph."""
        document, author = await _docx_document(db_session, storage)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=_OPS,
            proposed_by_id=author,
        )
        await DocumentService(db_session).replace_docx_bytes(
            document_id=document.id,
            updated_by_id=author,
            raw=_docx_bytes(body="Rewritten by someone else."),
        )

        with pytest.raises(ValueError, match="older version"):
            await service.apply_docx_proposal_headlessly(
                proposal.id, applied_by_id=author
            )

    async def test_a_tiptap_proposal_is_refused(self, db_session, storage):
        document, author = await _tiptap_document(db_session)
        service = ProposedEditsService(db_session)

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content={"type": "doc", "content": []},
            proposed_by_id=author,
        )

        with pytest.raises(ValueError, match="not a Word document proposal"):
            await service.apply_docx_proposal_headlessly(
                proposal.id, applied_by_id=author
            )


# ─── Resolving table coordinates for the browser ──────────────────────────


def _table_docx() -> bytes:
    document = docx.Document()
    document.add_heading("Pricing", 1)
    table = document.add_table(rows=3, cols=3)
    rows = [
        ["Tier", "Seats", "Price"],
        ["Starter", "5", "$50k"],
        ["Growth", "25", "$120k"],
    ]
    for row_index, row in enumerate(rows):
        for column, value in enumerate(row):
            table.rows[row_index].cells[column].text = value
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


class TestResolveOpsForReview:
    """A table cell's coordinate is unaddressable in the browser.

    The editor's automation protocol has no table operations at all, so
    `(table_index, row, column)` cannot be resolved there. It is trivially
    resolvable here, and stamping the cell's current text onto the op is what
    makes the edit both locatable and staleness-checked.
    """

    async def test_a_cell_gains_its_current_text_and_a_label(self):
        from aexy.services.docx_service import resolve_ops_for_review

        resolved = resolve_ops_for_review(
            _table_docx(),
            [{"kind": "set_table_cell", "table_index": 0, "row": 2, "column": 2, "text": "$150k"}],
        )

        assert resolved[0]["expected_current"] == "$120k"
        assert resolved[0]["cell_label"] == "Price, row 3"

    async def test_other_op_kinds_pass_through_untouched(self):
        from aexy.services.docx_service import resolve_ops_for_review

        ops = [{"kind": "replace_text", "find": "a", "replace": "b"}]
        assert resolve_ops_for_review(_table_docx(), ops) == ops

    async def test_the_input_is_not_mutated(self):
        """The resolution is only valid against the bytes it was computed from,
        so it must not leak back into the caller's list."""
        from aexy.services.docx_service import resolve_ops_for_review

        ops = [{"kind": "set_table_cell", "table_index": 0, "row": 1, "column": 2, "text": "x"}]
        resolve_ops_for_review(_table_docx(), ops)

        assert "expected_current" not in ops[0]

    async def test_an_out_of_range_coordinate_is_left_unresolved(self):
        """Not guessed. The headless path still applies it by coordinate; only
        the redline path needs the text, and it says why it cannot."""
        from aexy.services.docx_service import resolve_ops_for_review

        resolved = resolve_ops_for_review(
            _table_docx(),
            [{"kind": "set_table_cell", "table_index": 9, "row": 0, "column": 0, "text": "x"}],
        )

        assert "expected_current" not in resolved[0]
        assert resolved[0]["unresolvable"] == (
            "that cell coordinate is not in this document"
        )

    async def test_a_multi_paragraph_cell_says_why_it_cannot_be_located(self):
        """Its text spans a paragraph break, which a document-text search cannot
        match. Reporting "no longer says X" would blame the content for a shape
        that was never supported."""
        from aexy.services.docx_service import resolve_ops_for_review

        document = docx.Document()
        table = document.add_table(rows=2, cols=1)
        table.rows[1].cells[0].text = "first line"
        table.rows[1].cells[0].add_paragraph("second line")
        buffer = io.BytesIO()
        document.save(buffer)

        resolved = resolve_ops_for_review(
            buffer.getvalue(),
            [{"kind": "set_table_cell", "table_index": 0, "row": 1, "column": 0, "text": "x"}],
        )

        assert "expected_current" not in resolved[0]
        assert "more than one paragraph" in resolved[0]["unresolvable"]

    async def test_a_single_paragraph_cell_resolves_to_that_paragraph(self):
        from aexy.services.docx_service import resolve_ops_for_review

        resolved = resolve_ops_for_review(
            _table_docx(),
            [{"kind": "set_table_cell", "table_index": 0, "row": 1, "column": 1, "text": "9"}],
        )

        assert resolved[0]["expected_current"] == "5"
        assert "unresolvable" not in resolved[0]

    async def test_a_column_with_no_header_still_gets_a_label(self):
        from aexy.services.docx_service import resolve_ops_for_review

        document = docx.Document()
        table = document.add_table(rows=2, cols=2)
        table.rows[1].cells[0].text = "value"
        buffer = io.BytesIO()
        document.save(buffer)

        resolved = resolve_ops_for_review(
            buffer.getvalue(),
            [{"kind": "set_table_cell", "table_index": 0, "row": 1, "column": 0, "text": "x"}],
        )

        assert resolved[0]["cell_label"] == "column 1, row 2"


class TestProposalResolvesCells:
    async def test_creating_a_proposal_stamps_the_cell_text(self, db_session, storage):
        """Resolved at write time, not review time: "what the cell says now" is
        what the agent actually saw."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_table_docx(),
            title="Pricing",
        )

        proposal = await ProposedEditsService(db_session).create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=[
                {"kind": "set_table_cell", "table_index": 0, "row": 2, "column": 2, "text": "$150k"}
            ],
            proposed_by_id=author,
        )

        stored = proposal.proposed_ops[0]
        assert stored["expected_current"] == "$120k"
        assert stored["cell_label"] == "Price, row 3"
        # The coordinate survives too — the headless path addresses by it.
        assert stored["table_index"] == 0
        assert stored["row"] == 2
        assert stored["column"] == 2

    async def test_the_headless_path_still_applies_a_resolved_cell_op(
        self, db_session, storage
    ):
        """Resolution adds fields; it must not change what the op does."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = ProposedEditsService(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_table_docx(),
            title="Pricing",
        )

        proposal = await service.create_proposal(
            document_id=document.id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=[
                {"kind": "set_table_cell", "table_index": 0, "row": 2, "column": 2, "text": "$150k"}
            ],
            proposed_by_id=author,
        )
        await service.apply_docx_proposal_headlessly(proposal.id, applied_by_id=author)

        raw = await DocumentService(db_session).get_docx_bytes(document.id)
        assert extract_structured(raw).tables[0].rows[2] == ["Growth", "25", "$150k"]
