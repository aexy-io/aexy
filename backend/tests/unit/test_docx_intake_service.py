"""Turning a Word document into issues.

Two steps, and the split is the point: `preview` reads and proposes, `create`
writes. These rows become work a team is measured against, so a model that
mistook a heading for a deliverable must not be able to put a phantom task in
somebody's sprint without a person seeing the list first.

Both pickers belong to the run. The same document read for "unresolved comments →
tickets" and for "requirements → sprint tasks" is two different asks.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from aexy.services import docx_intake_service as intake
from aexy.services.docx_intake_service import (
    Candidate,
    CreateOptions,
    DocxIntakeError,
    DocxIntakeService,
    _as_title,
    _provenance_id,
)


@dataclass
class _Comment:
    id: str
    author: str
    text: str
    anchor_text: str = ""
    resolved: bool = False
    parent_id: str | None = None

    @property
    def is_reply(self) -> bool:
        return self.parent_id is not None


@dataclass
class _Paragraph:
    index: int
    text: str
    heading_level: int | None = None
    in_table: bool = False


class _Extract:
    def __init__(self, paragraphs):
        self.paragraphs = paragraphs


class TestMarkerSource:
    def test_it_finds_a_tagged_line_and_drops_the_tag(self, monkeypatch) -> None:
        monkeypatch.setattr(
            intake,
            "extract_structured",
            lambda raw: _Extract([_Paragraph(3, "TODO: add rate limiting")]),
        )
        [found] = DocxIntakeService(None)._from_markers(b"x")
        assert found.title == "add rate limiting"
        assert found.source == "markers"
        assert found.paragraph_index == 3

    @pytest.mark.parametrize(
        "text",
        [
            "TODO: add rate limiting",
            "TO-DO - add rate limiting",
            "todo add rate limiting",
            "FIXME: add rate limiting",
            "ACTION: add rate limiting",
            "TBD: add rate limiting",
            "Follow up: add rate limiting",
        ],
    )
    def test_it_recognises_how_people_actually_write_markers(
        self, monkeypatch, text: str
    ) -> None:
        monkeypatch.setattr(
            intake, "extract_structured", lambda raw: _Extract([_Paragraph(1, text)])
        )
        assert len(DocxIntakeService(None)._from_markers(b"x")) == 1

    def test_ai_colon_is_an_action_item(self, monkeypatch) -> None:
        # "AI:" is common shorthand in minutes.
        monkeypatch.setattr(
            intake,
            "extract_structured",
            lambda raw: _Extract([_Paragraph(1, "AI: chase the vendor")]),
        )
        [found] = DocxIntakeService(None)._from_markers(b"x")
        assert found.title == "chase the vendor"

    def test_ai_as_a_word_is_not(self, monkeypatch) -> None:
        # The reason `_BARE_AI` exists. A document about artificial intelligence
        # would otherwise turn every sentence into an action item.
        monkeypatch.setattr(
            intake,
            "extract_structured",
            lambda raw: _Extract(
                [
                    _Paragraph(1, "AI features are covered in section 4."),
                    _Paragraph(2, "The AI model is configurable."),
                ]
            ),
        )
        assert DocxIntakeService(None)._from_markers(b"x") == []

    def test_an_untagged_paragraph_is_left_alone(self, monkeypatch) -> None:
        monkeypatch.setattr(
            intake,
            "extract_structured",
            lambda raw: _Extract([_Paragraph(1, "The system shall be fast.")]),
        )
        assert DocxIntakeService(None)._from_markers(b"x") == []

    def test_an_unreadable_document_yields_nothing_rather_than_raising(
        self, monkeypatch
    ) -> None:
        # Markers are one source of several. One failing should not take the
        # whole preview down.
        from aexy.services.docx_service import DocxReadError

        def _boom(raw):
            raise DocxReadError("not a zip")

        monkeypatch.setattr(intake, "extract_structured", _boom)
        assert DocxIntakeService(None)._from_markers(b"x") == []


class TestCommentSource:
    def test_an_open_thread_becomes_a_candidate_with_its_anchor(
        self, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            intake,
            "extract_comments",
            lambda raw: [
                _Comment("1", "Priya", "Can we push this to 60 days?", "thirty (30) days")
            ],
        )
        [found] = DocxIntakeService(None)._from_comments(b"x")
        assert found.title == "Can we push this to 60 days?"
        assert "thirty (30) days" in found.detail
        assert found.origin == "Priya's comment"
        assert found.comment_id == "1"

    def test_a_resolved_thread_is_skipped(self, monkeypatch) -> None:
        # Somebody marked that conversation finished. Reopening it as a task is
        # not what they meant.
        monkeypatch.setattr(
            intake,
            "extract_comments",
            lambda raw: [_Comment("1", "Priya", "Push to 60 days", resolved=True)],
        )
        assert DocxIntakeService(None)._from_comments(b"x") == []

    def test_a_reply_is_skipped(self, monkeypatch) -> None:
        # A thread is one piece of work, and its first message is the ask.
        monkeypatch.setattr(
            intake,
            "extract_comments",
            lambda raw: [
                _Comment("1", "Priya", "Push to 60 days"),
                _Comment("2", "Sam", "Agreed", parent_id="1"),
            ],
        )
        found = DocxIntakeService(None)._from_comments(b"x")
        assert len(found) == 1
        assert found[0].comment_id == "1"

    def test_an_empty_comment_is_skipped(self, monkeypatch) -> None:
        monkeypatch.setattr(
            intake, "extract_comments", lambda raw: [_Comment("1", "Priya", "   ")]
        )
        assert DocxIntakeService(None)._from_comments(b"x") == []


class TestDeduplication:
    def test_one_row_per_piece_of_work(self) -> None:
        # A requirement somebody also commented on is one piece of work.
        found = DocxIntakeService._dedupe(
            [
                Candidate(title="Add rate limiting", source="comments"),
                Candidate(title="add  RATE limiting!", source="model"),
            ]
        )
        assert len(found) == 1

    def test_the_human_wording_wins(self) -> None:
        # Sources are appended comments-first for exactly this reason.
        found = DocxIntakeService._dedupe(
            [
                Candidate(title="Add rate limiting", source="comments"),
                Candidate(title="Add rate limiting", source="model"),
            ]
        )
        assert found[0].source == "comments"

    def test_distinct_work_survives(self) -> None:
        found = DocxIntakeService._dedupe(
            [
                Candidate(title="Add rate limiting"),
                Candidate(title="Add audit logging"),
            ]
        )
        assert len(found) == 2


class TestPreviewGuards:
    async def test_an_unknown_source_is_refused(self) -> None:
        with pytest.raises(DocxIntakeError, match="Unknown source"):
            await DocxIntakeService(None).preview("d1", ("telepathy",))  # type: ignore[arg-type]

    async def test_no_source_is_refused(self) -> None:
        # Better than silently returning nothing, which reads as "this document
        # has no work in it".
        with pytest.raises(DocxIntakeError, match="at least one"):
            await DocxIntakeService(None).preview("d1", ())


class TestCreateGuards:
    async def test_an_unknown_target_is_refused(self) -> None:
        with pytest.raises(DocxIntakeError, match="Unknown target"):
            await DocxIntakeService(None).create(
                "d1", "postcard", [Candidate(title="x")], CreateOptions()  # type: ignore[arg-type]
            )

    async def test_creating_nothing_is_refused(self) -> None:
        with pytest.raises(DocxIntakeError, match="Nothing was selected"):
            await DocxIntakeService(None).create(
                "d1", "bug", [], CreateOptions()
            )

    async def test_a_task_without_a_sprint_is_refused(self, monkeypatch) -> None:
        # A task with no sprint is a row that exists and belongs nowhere.
        service = DocxIntakeService(_FakeDb())
        with pytest.raises(DocxIntakeError, match="Choose a sprint"):
            await service.create(
                "d1", "sprint_task", [Candidate(title="x")], CreateOptions()
            )

    async def test_a_ticket_without_a_form_is_refused(self) -> None:
        # A ticket's fields, SLA and audience all come from its form.
        service = DocxIntakeService(_FakeDb())
        with pytest.raises(DocxIntakeError, match="ticket form"):
            await service.create(
                "d1", "ticket", [Candidate(title="x")], CreateOptions()
            )


class TestProvenance:
    def test_a_created_row_can_be_traced_back(self) -> None:
        # So a second run over the same document can tell what it already turned
        # into work.
        class _Doc:
            id = "doc-1"

        comment = Candidate(title="x", source="comments", comment_id="7")
        assert _provenance_id(_Doc(), comment) == "doc-1:comments:7"

        para = Candidate(title="x", source="markers", paragraph_index=12)
        assert _provenance_id(_Doc(), para) == "doc-1:markers:12"

        found = Candidate(title="x", source="model")
        assert _provenance_id(_Doc(), found) == "doc-1:model:model"


class TestTitles:
    def test_a_short_line_is_left_alone(self) -> None:
        assert _as_title("Add rate limiting") == "Add rate limiting"

    def test_whitespace_is_collapsed(self) -> None:
        assert _as_title("Add   rate\n\nlimiting") == "Add rate limiting"

    def test_a_long_line_is_cut_at_a_sentence_end(self) -> None:
        # "Add rate limiting" reads better than a truncated run-on.
        text = "Add rate limiting. " + "Then check the audit trail " * 10
        out = _as_title(text)
        assert out == "Add rate limiting"

    def test_a_long_line_with_no_sentence_end_is_elided(self) -> None:
        out = _as_title("x" * 400)
        assert len(out) <= 120
        assert out.endswith("…")

    def test_an_empty_line_stays_empty(self) -> None:
        assert _as_title("   ") == ""


class _FakeDb:
    """Enough of a session for the guard paths, which never reach a query."""

    async def get(self, _model, _id):
        class _Doc:
            id = "d1"
            title = "Contract"
            workspace_id = "w1"
            content_format = "docx"

        return _Doc()

    async def flush(self):
        return None
