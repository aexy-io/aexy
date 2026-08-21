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


class TestStoryForm:
    """A story needs somebody it is for, and we never invent one.

    This used to write "someone reading this document" into every imported story
    — a fake stakeholder on a backlog, saying the same meaningless thing on every
    row. Now: parsed where the document says so, asked for where it does not.
    """

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            (
                "As a finance manager, I want to export the ledger, so that I can reconcile.",
                {
                    "as_a": "finance manager",
                    "i_want": "export the ledger",
                    "so_that": "I can reconcile",
                },
            ),
            # "an" as well as "a", and no punctuation at all.
            (
                "As an admin I need to revoke a token",
                {"as_a": "admin", "i_want": "revoke a token"},
            ),
            # How people actually write it.
            (
                "As a reviewer, I'd like to see the redline",
                {"as_a": "reviewer", "i_want": "see the redline"},
            ),
            (
                "As a customer; I would like a receipt",
                {"as_a": "customer", "i_want": "a receipt"},
            ),
            # Case is theirs to choose.
            (
                "AS A TESTER, I WANT REPEATABLE FIXTURES",
                {"as_a": "TESTER", "i_want": "REPEATABLE FIXTURES"},
            ),
        ],
    )
    def test_it_reads_a_story_the_document_already_wrote(
        self, text: str, expected: dict
    ) -> None:
        assert intake.parse_story_form(text) == expected

    @pytest.mark.parametrize(
        "text",
        [
            "The system shall support CSV export.",
            "Export the ledger before the audit.",
            "",
            "   ",
            # Half a story is not a story: no persona to attribute it to.
            "I want to export the ledger",
            # And no want to attribute.
            "As a finance manager",
        ],
    )
    def test_it_returns_nothing_rather_than_guessing(self, text: str) -> None:
        # The common case, and not a failure. A requirement with no persona in it
        # has no persona, and inferring one puts words in a stakeholder's mouth.
        assert intake.parse_story_form(text) is None

    def test_the_parts_are_filled_from_the_detail(self) -> None:
        # The title is shortened and may have cut the "so that" clause off, so
        # the detail is read first.
        [found] = DocxIntakeService._with_story_parts(
            [
                Candidate(
                    title="Export the ledger",
                    detail="As a finance manager, I want to export the ledger, so that I can reconcile.",
                )
            ]
        )
        assert found.as_a == "finance manager"
        assert found.so_that == "I can reconcile"

    def test_the_title_is_a_fallback(self) -> None:
        [found] = DocxIntakeService._with_story_parts(
            [Candidate(title="As an admin I want to revoke a token", detail="")]
        )
        assert found.as_a == "admin"

    def test_a_plain_requirement_is_left_unattributed(self) -> None:
        [found] = DocxIntakeService._with_story_parts(
            [Candidate(title="Support CSV export", detail="Section 4 says so")]
        )
        assert found.as_a is None

    def test_it_applies_to_every_source_not_just_the_model(self) -> None:
        # A story sentence is a story sentence whether somebody typed it in a
        # comment, tagged it with TODO, or the model repeated it back.
        found = DocxIntakeService._with_story_parts(
            [
                Candidate(title="x", detail="As a reviewer, I want the redline", source="comments"),
                Candidate(title="y", detail="As an admin, I want an audit log", source="markers"),
                Candidate(title="z", detail="As a user, I want dark mode", source="model"),
            ]
        )
        assert [c.as_a for c in found] == ["reviewer", "admin", "user"]

    def test_an_already_parsed_candidate_is_left_alone(self) -> None:
        # The client sends the parts back on create; re-deriving them would let a
        # shortened title override what the document actually said.
        [found] = DocxIntakeService._with_story_parts(
            [Candidate(title="As a nobody, I want nothing", as_a="finance manager", i_want="export")]
        )
        assert found.as_a == "finance manager"


class TestStoryCreationRefusesToInvent:
    async def test_it_refuses_when_nobody_is_named(self) -> None:
        # The fix. A placeholder here is a fake stakeholder on somebody's backlog.
        service = DocxIntakeService(_FakeDb())
        with pytest.raises(DocxIntakeError, match="do not say who they are for"):
            await service.create(
                "d1",
                "user_story",
                [Candidate(title="Support CSV export")],
                CreateOptions(),
            )

    async def test_the_refusal_names_one_so_it_can_be_found(self) -> None:
        # "3 of these do not say who they are for" is not actionable on its own.
        service = DocxIntakeService(_FakeDb())
        with pytest.raises(DocxIntakeError, match="Support CSV export"):
            await service.create(
                "d1",
                "user_story",
                [Candidate(title="Support CSV export")],
                CreateOptions(),
            )

    async def test_a_supplied_persona_satisfies_it(self, monkeypatch) -> None:
        made: list = []

        class _Db(_FakeDb):
            def add(self, row):
                made.append(row)

            async def execute(self, _q):
                import types

                return types.SimpleNamespace(scalar=lambda: 0)

        service = DocxIntakeService(_Db())
        await service.create(
            "d1",
            "user_story",
            [Candidate(title="Support CSV export")],
            CreateOptions(default_persona="finance manager"),
        )
        assert made[0].as_a == "finance manager"
        assert made[0].i_want == "Support CSV export"

    async def test_a_parsed_story_needs_no_persona_asked_for(self) -> None:
        # A document written in story form should not ask a question it already
        # answered.
        made: list = []

        class _Db(_FakeDb):
            def add(self, row):
                made.append(row)

            async def execute(self, _q):
                import types

                return types.SimpleNamespace(scalar=lambda: 0)

        service = DocxIntakeService(_Db())
        await service.create(
            "d1",
            "user_story",
            [
                Candidate(
                    title="Export the ledger",
                    as_a="finance manager",
                    i_want="export the ledger",
                    so_that="I can reconcile",
                )
            ],
            CreateOptions(),
        )
        assert made[0].as_a == "finance manager"
        assert made[0].so_that == "I can reconcile"

    async def test_a_mixed_batch_uses_each_where_it_applies(self) -> None:
        # The parsed one keeps its own persona; the bare one takes the supplied.
        made: list = []

        class _Db(_FakeDb):
            def add(self, row):
                made.append(row)

            async def execute(self, _q):
                import types

                return types.SimpleNamespace(scalar=lambda: 0)

        service = DocxIntakeService(_Db())
        await service.create(
            "d1",
            "user_story",
            [
                Candidate(title="Export", as_a="finance manager", i_want="export"),
                Candidate(title="Support CSV export"),
            ],
            CreateOptions(default_persona="admin"),
        )
        assert [row.as_a for row in made] == ["finance manager", "admin"]

    async def test_no_story_ever_gets_a_placeholder(self) -> None:
        # The regression guard, stated as the thing that must never appear.
        service = DocxIntakeService(_FakeDb())
        for options in (CreateOptions(), CreateOptions(default_persona="")):
            with pytest.raises(DocxIntakeError):
                await service.create(
                    "d1", "user_story", [Candidate(title="x")], options
                )
