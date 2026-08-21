"""Reading, writing, and editing Word documents.

The extraction tests are regression tests for a real bug: the file pipeline
read ``doc.paragraphs``, which walks only the body's top-level paragraphs, so
**every table in every uploaded document extracted to nothing**. A pricing grid
or a requirements matrix was summarised, tagged, and embedded as though it were
not in the file. Anything here that asserts a table cell survived is guarding
that, and should not be relaxed.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from aexy.services.docx_service import (
    BROWSER_ONLY_OPS,
    PROPOSABLE_OPS,
    DocxOpUnsupported,
    DocxReadError,
    DocxRenderError,
    PythonDocxAutomation,
    extract_comments,
    extract_structured,
    render_docx,
    resolve_ops_for_review,
    validate_ops,
)
from tests.unit import docx_fixtures

docx = pytest.importorskip("docx", reason="python-docx is required for Word support")


@pytest.fixture
def sample_docx() -> bytes:
    """A document with every structure the extractor is supposed to keep."""
    document = docx.Document()

    document.add_heading("Product Requirements", 1)
    paragraph = document.add_paragraph("This document describes the ")
    paragraph.add_run("billing rewrite").bold = True
    paragraph.add_run(" for Q3.")

    document.add_heading("Scope", 2)
    document.add_paragraph("Invoicing", style="List Bullet")
    document.add_paragraph("Dunning", style="List Bullet")
    document.add_paragraph("First step", style="List Number")
    document.add_paragraph("Second step", style="List Number")
    document.add_paragraph("Third step", style="List Number")

    document.add_heading("Pricing tiers", 2)
    table = document.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    rows = [
        ["Tier", "Seats", "Price"],
        ["Starter", "5", "$50k"],
        ["Growth", "25", "$120k"],
    ]
    for row_index, row in enumerate(rows):
        for column_index, value in enumerate(row):
            table.rows[row_index].cells[column_index].text = value

    document.add_heading("Notes", 2)
    document.add_paragraph("Contact finance before signing.")

    document.sections[0].header.paragraphs[0].text = "ACME CONFIDENTIAL - Rev 4"

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# ─── Extraction ───────────────────────────────────────────────────────────


class TestExtractStructured:
    def test_table_cells_survive(self, sample_docx: bytes) -> None:
        """The bug this module exists to fix.

        ``doc.paragraphs`` returned nothing for any of these values.
        """
        extract = extract_structured(sample_docx)

        assert "$50k" in extract.markdown
        assert "$120k" in extract.markdown
        assert "Starter" in extract.markdown
        assert "| Tier | Seats | Price |" in extract.markdown
        assert "| --- | --- | --- |" in extract.markdown

    def test_tables_are_addressable(self, sample_docx: bytes) -> None:
        extract = extract_structured(sample_docx)

        assert len(extract.tables) == 1
        assert extract.tables[0].header == ["Tier", "Seats", "Price"]
        assert extract.tables[0].rows[2] == ["Growth", "25", "$120k"]

    def test_document_order_is_preserved(self, sample_docx: bytes) -> None:
        """A table must land between the headings it sits between.

        Extracting paragraphs and tables separately would put every table at
        one end, which silently reattributes content to the wrong section.
        """
        markdown = extract_structured(sample_docx).markdown

        assert markdown.index("## Scope") < markdown.index("## Pricing tiers")
        assert markdown.index("## Pricing tiers") < markdown.index("| Tier")
        assert markdown.index("| Tier") < markdown.index("## Notes")

    def test_heading_levels_become_markdown_headings(self, sample_docx: bytes) -> None:
        markdown = extract_structured(sample_docx).markdown

        assert "# Product Requirements" in markdown
        assert "## Scope" in markdown

    def test_outline_is_reported(self, sample_docx: bytes) -> None:
        outline = extract_structured(sample_docx).outline

        assert [heading.level for heading in outline] == [1, 2, 2, 2]
        assert [heading.text for heading in outline] == [
            "Product Requirements",
            "Scope",
            "Pricing tiers",
            "Notes",
        ]

    def test_bullets_and_numbers_are_distinguished(self, sample_docx: bytes) -> None:
        """Numbered steps extracted as bullets lose that they are a sequence."""
        markdown = extract_structured(sample_docx).markdown

        assert "- Invoicing" in markdown
        assert "- Dunning" in markdown
        assert "1. First step" in markdown
        assert "2. Second step" in markdown
        assert "3. Third step" in markdown

    def test_inline_formatting_survives(self, sample_docx: bytes) -> None:
        markdown = extract_structured(sample_docx).markdown

        assert "**billing rewrite**" in markdown
        # The marks must not swallow the surrounding words.
        assert "This document describes the **billing rewrite** for Q3." in markdown

    def test_header_furniture_is_kept_out_of_the_body(self, sample_docx: bytes) -> None:
        """Revision codes and confidentiality markings are often the only
        provenance a document carries, but they must not interleave."""
        markdown = extract_structured(sample_docx).markdown

        assert "ACME CONFIDENTIAL - Rev 4" in markdown
        assert markdown.index("# Product Requirements") < markdown.index("Rev 4")

    def test_plain_text_has_no_markup(self, sample_docx: bytes) -> None:
        extract = extract_structured(sample_docx)

        assert "**" not in extract.plain_text
        assert "|" not in extract.plain_text
        assert "billing rewrite" in extract.plain_text
        assert "$120k" in extract.plain_text
        assert extract.word_count > 0

    def test_hyperlink_labels_and_targets_survive(self) -> None:
        """``paragraph.text`` skips runs inside ``w:hyperlink`` entirely, so a
        line that is only a link reads as an empty paragraph."""
        source = render_docx("See [the spec](https://example.com/spec) first.")

        markdown = extract_structured(source).markdown
        assert "[the spec](https://example.com/spec)" in markdown
        assert "the spec" in extract_structured(source).plain_text

    def test_bad_bytes_raise(self) -> None:
        with pytest.raises(DocxReadError):
            extract_structured(b"this is not a docx")

    def test_empty_document_extracts_to_empty_string(self) -> None:
        document = docx.Document()
        buffer = io.BytesIO()
        document.save(buffer)

        extract = extract_structured(buffer.getvalue())
        assert extract.markdown == ""
        assert extract.word_count == 0


# ─── Rendering ────────────────────────────────────────────────────────────


class TestRenderDocx:
    def test_produces_a_docx_package(self) -> None:
        out = render_docx("# Title\n\nBody.")
        assert out[:2] == b"PK"  # a docx is a zip

    def test_markdown_round_trip(self) -> None:
        """Everything the Markdown subset supports must come back out.

        Round-tripping through the file format is the only check that catches
        a renderer writing something Word accepts but the extractor cannot
        recognise — a heading rendered as bold body text, for instance.
        """
        markdown = (
            "# Title\n\n"
            "Some **bold** and *italic* text and [a link](https://example.com).\n\n"
            "- one\n"
            "- two\n\n"
            "1. first\n"
            "2. second\n\n"
            "> quoted\n\n"
            "```python\n"
            "print(1)\n"
            "```\n\n"
            "---\n\n"
            "Tail paragraph."
        )

        back = extract_structured(render_docx(markdown)).markdown

        for expected in (
            "# Title",
            "**bold**",
            "*italic*",
            "[a link](https://example.com)",
            "- one",
            "- two",
            "1. first",
            "2. second",
            "> quoted",
            "print(1)",
            "---",
            "Tail paragraph.",
        ):
            assert expected in back, f"round-trip lost {expected!r}\n\n{back}"

    def test_renders_a_tiptap_document(self) -> None:
        """Documents come from the editor as TipTap JSON, not Markdown."""
        tree = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Findings"}],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "critical",
                            "marks": [{"type": "bold"}],
                        }
                    ],
                },
            ],
        }

        back = extract_structured(render_docx(tree)).markdown
        assert "## Findings" in back
        assert "**critical**" in back

    def test_renders_tiptap_tables(self) -> None:
        """`markdown_to_tiptap` has no tables, but the editor does."""
        def cell(kind: str, text: str) -> dict:
            return {
                "type": kind,
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": text}]}
                ],
            }

        tree = {
            "type": "doc",
            "content": [
                {
                    "type": "table",
                    "content": [
                        {
                            "type": "tableRow",
                            "content": [
                                cell("tableHeader", "Metric"),
                                cell("tableHeader", "Value"),
                            ],
                        },
                        {
                            "type": "tableRow",
                            "content": [
                                cell("tableCell", "Velocity"),
                                cell("tableCell", "42"),
                            ],
                        },
                    ],
                }
            ],
        }

        back = extract_structured(render_docx(tree)).markdown
        assert "| Metric | Value |" in back
        assert "| Velocity | 42 |" in back

    def test_markdown_pipe_tables_become_real_tables(self) -> None:
        """`markdown_to_tiptap` folds a pipe table into one run-together
        paragraph, because it deliberately has no table node. Extraction emits
        pipe tables and agents write them, so `render_docx` has to handle them
        or a document cannot survive its own round trip.
        """
        markdown = (
            "## Pricing\n\n"
            "| Tier | Price |\n"
            "| --- | --- |\n"
            "| Starter | $50k |\n"
            "| Growth | $120k |\n\n"
            "Signed after review."
        )

        extract = extract_structured(render_docx(markdown))

        assert len(extract.tables) == 1
        assert extract.tables[0].header == ["Tier", "Price"]
        assert ["Growth", "$120k"] in extract.tables[0].rows
        # The prose either side must stay prose, and stay in order.
        assert "## Pricing" in extract.markdown
        assert "Signed after review." in extract.markdown
        assert extract.markdown.index("## Pricing") < extract.markdown.index("| Tier")
        assert extract.markdown.index("| Tier") < extract.markdown.index("Signed after")

    def test_round_trip_is_idempotent(self) -> None:
        """Markdown must survive two round trips unchanged.

        A renderer that expressed "header row" by bolding the runs would report
        ``**Tier**`` on the way back out, so a stored document's searchable
        text would drift on every save.
        """
        markdown = (
            "# Report\n\n"
            "Intro line.\n\n"
            "| Tier | Price |\n"
            "| --- | --- |\n"
            "| Starter | $50k |\n\n"
            "- one\n"
            "- two"
        )

        once = extract_structured(render_docx(markdown)).markdown
        twice = extract_structured(render_docx(once)).markdown

        assert once == twice, f"drifted:\n{once!r}\n{twice!r}"

    def test_escaped_pipes_in_cells_survive(self) -> None:
        """Extraction escapes pipes so they cannot break the table; rendering
        has to unescape them or the character mutates on every round trip."""
        markdown = "| Expression | Meaning |\n| --- | --- |\n| a \\| b | either |"

        extract = extract_structured(render_docx(markdown))

        assert extract.tables[0].rows[1] == ["a | b", "either"]

    def test_aligned_table_dividers_are_accepted(self) -> None:
        """A model writing Markdown reaches for `:---:` alignment freely."""
        markdown = "| Left | Mid | Right |\n|:--- |:---:| ---:|\n| a | b | c |"

        extract = extract_structured(render_docx(markdown))

        assert extract.tables[0].rows[1] == ["a", "b", "c"]

    def test_table_cell_marks_survive(self) -> None:
        markdown = "| Field | Note |\n| --- | --- |\n| **id** | required |"

        markdown_out = extract_structured(render_docx(markdown)).markdown
        assert "**id**" in markdown_out

    def test_unknown_block_keeps_its_text(self) -> None:
        """Losing a section outright is worse than losing its styling."""
        tree = {
            "type": "doc",
            "content": [
                {
                    "type": "someFutureNode",
                    "content": [{"type": "text", "text": "still important"}],
                }
            ],
        }

        assert "still important" in extract_structured(render_docx(tree)).markdown

    def test_empty_content_raises(self) -> None:
        with pytest.raises(DocxRenderError):
            render_docx({"type": "doc", "content": []})

    def test_wrong_type_raises(self) -> None:
        with pytest.raises(DocxRenderError):
            render_docx(42)  # type: ignore[arg-type]

    def test_unknown_template_raises(self) -> None:
        """Silently dropping the letterhead is only noticed after it ships."""
        with pytest.raises(DocxRenderError, match="template"):
            render_docx("# Hi", template_key="acme-letterhead")


# ─── Automation ───────────────────────────────────────────────────────────


@pytest.fixture
def automation() -> PythonDocxAutomation:
    return PythonDocxAutomation()


class TestApplyOps:
    @pytest.mark.asyncio
    async def test_replace_text_inside_a_table_cell(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        edited = await automation.apply_ops(
            sample_docx, [{"kind": "replace_text", "find": "$50k", "replace": "$65k"}]
        )

        markdown = extract_structured(edited).markdown
        assert "$65k" in markdown
        assert "$50k" not in markdown

    @pytest.mark.asyncio
    async def test_replace_text_spanning_runs_keeps_formatting(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        """A phrase is routinely split across runs by Word.

        Matching run by run would miss this entirely; distributing the result
        by original run *length* would corrupt the boundary whenever the
        replacement is a different length, which is the common case.
        """
        edited = await automation.apply_ops(
            sample_docx,
            [{"kind": "replace_text", "find": "billing rewrite", "replace": "payments rebuild"}],
        )

        markdown = extract_structured(edited).markdown
        assert "This document describes the **payments rebuild** for Q3." in markdown
        assert "billing rewrite" not in markdown

    @pytest.mark.asyncio
    async def test_set_table_cell(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        edited = await automation.apply_ops(
            sample_docx,
            [{"kind": "set_table_cell", "table_index": 0, "row": 2, "column": 2, "text": "$999k"}],
        )

        table = extract_structured(edited).tables[0]
        assert table.rows[2] == ["Growth", "25", "$999k"]

    @pytest.mark.asyncio
    async def test_append_section_lands_at_the_end(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        edited = await automation.apply_ops(
            sample_docx,
            [
                {
                    "kind": "append_section",
                    "heading": "Risks",
                    "level": 2,
                    "markdown": "- Migration window\n- Data backfill",
                }
            ],
        )

        markdown = extract_structured(edited).markdown
        assert "## Risks" in markdown
        assert "- Migration window" in markdown
        assert markdown.index("## Notes") < markdown.index("## Risks")

    @pytest.mark.asyncio
    async def test_append_section_can_carry_a_table(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        """An agent writing a section reaches for a table as soon as it has
        columns, so the op has to render one."""
        edited = await automation.apply_ops(
            sample_docx,
            [
                {
                    "kind": "append_section",
                    "heading": "Owners",
                    "level": 2,
                    "markdown": "| Area | Owner |\n| --- | --- |\n| Billing | ana |",
                }
            ],
        )

        extract = extract_structured(edited)
        assert "## Owners" in extract.markdown
        # The document's original table plus the appended one.
        assert len(extract.tables) == 2
        assert extract.tables[1].rows[1] == ["Billing", "ana"]

    @pytest.mark.asyncio
    async def test_replace_section_body_leaves_neighbours_alone(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        """The blast radius is one section, not everything after the heading."""
        edited = await automation.apply_ops(
            sample_docx,
            [
                {
                    "kind": "replace_section_body",
                    "heading": "Notes",
                    "markdown": "Escalate to legal instead.",
                }
            ],
        )

        markdown = extract_structured(edited).markdown
        assert "## Notes" in markdown
        assert "Escalate to legal instead." in markdown
        assert "Contact finance before signing." not in markdown
        # The preceding table and headings must be untouched.
        assert "| Tier | Seats | Price |" in markdown
        assert "## Scope" in markdown
        assert "- Invoicing" in markdown

    @pytest.mark.asyncio
    async def test_replace_section_body_stops_at_the_next_sibling_heading(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        edited = await automation.apply_ops(
            sample_docx,
            [{"kind": "replace_section_body", "heading": "Scope", "markdown": "Narrowed."}],
        )

        markdown = extract_structured(edited).markdown
        assert "Narrowed." in markdown
        assert "- Invoicing" not in markdown
        # "Pricing tiers" is the next heading at the same level, so it and
        # everything under it survive.
        assert "## Pricing tiers" in markdown
        assert "| Tier | Seats | Price |" in markdown
        assert "## Notes" in markdown

    @pytest.mark.asyncio
    async def test_ops_apply_in_order(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        edited = await automation.apply_ops(
            sample_docx,
            [
                {"kind": "replace_text", "find": "$50k", "replace": "$60k"},
                {"kind": "replace_text", "find": "$60k", "replace": "$70k"},
            ],
        )

        markdown = extract_structured(edited).markdown
        assert "$70k" in markdown
        assert "$50k" not in markdown and "$60k" not in markdown


class TestApplyOpsRefusals:
    """Every refusal is a deliberate choice not to approximate an edit.

    A partially-applied or best-effort edit to a contract is worse than a
    refusal, because the caller has no way to tell which it got.
    """

    @pytest.mark.asyncio
    async def test_tracked_changes_are_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        with pytest.raises(DocxOpUnsupported, match="tracked changes"):
            await automation.apply_ops(sample_docx, [], track_changes=True)

    @pytest.mark.asyncio
    async def test_unknown_op_is_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        with pytest.raises(DocxOpUnsupported):
            await automation.apply_ops(
                sample_docx, [{"kind": "insert_image", "path": "logo.png"}]
            )

    @pytest.mark.asyncio
    async def test_replace_that_would_match_nothing_is_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        """A no-op edit reported as success is how a stale agent proposal gets
        recorded as applied."""
        with pytest.raises(DocxOpUnsupported, match="no-op"):
            await automation.apply_ops(
                sample_docx,
                [{"kind": "replace_text", "find": "not in this document", "replace": "x"}],
            )

    @pytest.mark.asyncio
    async def test_occurrence_count_mismatch_is_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        """An op that expected three matches and found one is operating on a
        different document than the one it was written against."""
        with pytest.raises(DocxOpUnsupported, match="expected 3"):
            await automation.apply_ops(
                sample_docx,
                [{"kind": "replace_text", "find": "$50k", "replace": "x", "count": 3}],
            )

    @pytest.mark.asyncio
    async def test_out_of_range_table_coordinates_are_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        for op in (
            {"kind": "set_table_cell", "table_index": 9, "row": 0, "column": 0, "text": "x"},
            {"kind": "set_table_cell", "table_index": 0, "row": 99, "column": 0, "text": "x"},
            {"kind": "set_table_cell", "table_index": 0, "row": 0, "column": 99, "text": "x"},
        ):
            with pytest.raises(DocxOpUnsupported, match="out of range"):
                await automation.apply_ops(sample_docx, [op])

    @pytest.mark.asyncio
    async def test_missing_section_heading_is_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        with pytest.raises(DocxOpUnsupported, match="no heading titled"):
            await automation.apply_ops(
                sample_docx,
                [{"kind": "replace_section_body", "heading": "Nonexistent", "markdown": "x"}],
            )

    @pytest.mark.asyncio
    async def test_missing_required_field_is_refused(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        with pytest.raises(DocxOpUnsupported, match="find"):
            await automation.apply_ops(sample_docx, [{"kind": "replace_text"}])

    @pytest.mark.asyncio
    async def test_declares_no_tracked_change_support(
        self, automation: PythonDocxAutomation
    ) -> None:
        """Callers branch on this to decide whether an edit can be reviewed as
        a redline or only as a new version."""
        assert automation.supports_tracked_changes is False


# ─── Comments ─────────────────────────────────────────────────────────────


@pytest.fixture
def commented_docx() -> bytes:
    """A document carrying a resolved thread with a reply, plus an open remark."""
    return docx_fixtures.commented_docx()


class TestExtractComments:
    def test_a_document_with_no_comments_part_reads_as_empty(
        self, sample_docx: bytes
    ) -> None:
        # An absence, not a failure: most documents have no comments and the
        # caller must not have to distinguish that from an error.
        assert extract_comments(sample_docx) == []

    def test_bytes_that_are_not_a_document_are_refused(self) -> None:
        with pytest.raises(DocxReadError):
            extract_comments(b"not a zip")

    def test_every_comment_is_read_with_its_author(self, commented_docx: bytes) -> None:
        comments = extract_comments(commented_docx)
        assert [c.id for c in comments] == ["0", "1", "2"]
        assert [c.author for c in comments] == [
            "Priya Raman",
            "Sam Okafor",
            "Priya Raman",
        ]
        assert comments[0].initials == "PR"
        assert comments[0].text == "Is this still the enterprise price?"

    def test_the_anchor_text_is_recovered(self, commented_docx: bytes) -> None:
        # The whole point of walking the ranges. Without this a model reads
        # "Tighten this sentence" and has nothing to tighten.
        by_id = {c.id: c for c in extract_comments(commented_docx)}
        assert by_id["0"].anchor_text == "$50k"
        assert by_id["2"].anchor_text == "best effort"

    def test_replies_are_threaded_to_their_parent(self, commented_docx: bytes) -> None:
        by_id = {c.id: c for c in extract_comments(commented_docx)}
        assert by_id["1"].parent_id == "0"
        assert by_id["1"].is_reply
        assert by_id["0"].parent_id is None
        assert not by_id["0"].is_reply

    def test_resolved_state_comes_from_the_extended_part(
        self, commented_docx: bytes
    ) -> None:
        by_id = {c.id: c for c in extract_comments(commented_docx)}
        assert by_id["0"].resolved
        assert by_id["1"].resolved
        assert not by_id["2"].resolved

    def test_a_missing_extended_part_reads_as_unresolved(
        self, commented_docx: bytes
    ) -> None:
        # An older Word could not mark a thread done, so "no extended part"
        # means nothing is resolved rather than that the file is broken.
        source = zipfile.ZipFile(io.BytesIO(commented_docx))
        out = io.BytesIO()
        with source, zipfile.ZipFile(out, "w") as target:
            for item in source.infolist():
                if item.filename == "word/commentsExtended.xml":
                    continue
                target.writestr(item, source.read(item.filename))

        comments = extract_comments(out.getvalue())
        assert len(comments) == 3
        assert not any(c.resolved for c in comments)
        assert all(c.parent_id is None for c in comments)


class TestAddressableParagraphs:
    def test_paragraph_text_is_what_an_op_would_match(
        self, sample_docx: bytes
    ) -> None:
        # The reason this list exists. `markdown` renders the bolded phrase as
        # `**billing rewrite**`, and a model prompted with that writes a `find`
        # containing asterisks the document does not contain.
        extract = extract_structured(sample_docx)
        assert "**billing rewrite**" in extract.markdown

        prose = next(
            p for p in extract.paragraphs if "billing rewrite" in p.text
        )
        assert "*" not in prose.text
        assert prose.text == "This document describes the billing rewrite for Q3."

    def test_every_find_a_model_could_read_off_is_replaceable(
        self, sample_docx: bytes, automation: PythonDocxAutomation
    ) -> None:
        # The contract in one test: any paragraph text from this list is a
        # string `replace_text` can locate.
        import asyncio

        for paragraph in extract_structured(sample_docx).paragraphs:
            edited = asyncio.run(
                automation.apply_ops(
                    sample_docx,
                    [{"kind": "replace_text", "find": paragraph.text, "replace": "X"}],
                )
            )
            assert b"X" in edited

    def test_headings_carry_their_level(self, sample_docx: bytes) -> None:
        paragraphs = extract_structured(sample_docx).paragraphs
        headings = {p.text: p.heading_level for p in paragraphs if p.heading_level}
        assert headings["Product Requirements"] == 1
        assert headings["Scope"] == 2

    def test_table_cells_are_marked_as_such(self, sample_docx: bytes) -> None:
        paragraphs = extract_structured(sample_docx).paragraphs
        assert any(p.in_table for p in paragraphs)
        assert all(p.heading_level is None for p in paragraphs if p.in_table)

    def test_empty_paragraphs_are_left_out(self, sample_docx: bytes) -> None:
        assert all(p.text for p in extract_structured(sample_docx).paragraphs)

    def test_indexes_are_contiguous_and_in_document_order(
        self, sample_docx: bytes
    ) -> None:
        paragraphs = extract_structured(sample_docx).paragraphs
        assert [p.index for p in paragraphs] == list(range(len(paragraphs)))
        assert paragraphs[0].text == "Product Requirements"


class TestOpSetSplit:
    def test_the_comment_ops_may_be_proposed(self) -> None:
        for kind in ("add_comment", "reply_to_comment", "resolve_comment"):
            assert kind in PROPOSABLE_OPS

    def test_the_comment_ops_are_the_browser_only_ones(self) -> None:
        assert BROWSER_ONLY_OPS == {
            "add_comment",
            "reply_to_comment",
            "resolve_comment",
        }

    def test_validate_accepts_a_well_formed_comment_op(self) -> None:
        validate_ops(
            [
                {"kind": "add_comment", "anchor_find": "$50k", "text": "Confirm?"},
                {"kind": "reply_to_comment", "comment_id": "0", "text": "Done."},
                {"kind": "resolve_comment", "comment_id": "0"},
            ]
        )

    @pytest.mark.parametrize(
        ("op", "missing"),
        [
            ({"kind": "add_comment", "text": "hi"}, "anchor_find"),
            ({"kind": "add_comment", "anchor_find": "x"}, "text"),
            ({"kind": "reply_to_comment", "text": "hi"}, "comment_id"),
            ({"kind": "resolve_comment"}, "comment_id"),
        ],
    )
    def test_validate_names_the_missing_field(
        self, op: dict[str, object], missing: str
    ) -> None:
        with pytest.raises(DocxOpUnsupported, match=missing):
            validate_ops([op])

    async def test_the_headless_backend_refuses_a_comment_op(
        self, automation: PythonDocxAutomation, sample_docx: bytes
    ) -> None:
        # It refuses rather than skipping. A proposal half-applied without its
        # comments is a document that looks reviewed and is not.
        with pytest.raises(DocxOpUnsupported, match="python-docx cannot write comments"):
            await automation.apply_ops(
                sample_docx,
                [
                    {"kind": "replace_text", "find": "Q3", "replace": "Q4"},
                    {"kind": "add_comment", "anchor_find": "Q4", "text": "Check?"},
                ],
            )


class TestResolveCommentOps:
    def test_a_reply_target_is_stamped_with_what_it_said(
        self, commented_docx: bytes
    ) -> None:
        # Same discipline as `expected_current` on a table cell: a `w:id` is
        # reused once its comment is deleted, so the browser needs to be able to
        # tell it is answering the remark the AI actually read.
        [op] = resolve_ops_for_review(
            commented_docx, [{"kind": "reply_to_comment", "comment_id": "0", "text": "Yes."}]
        )
        assert op["expected_comment_author"] == "Priya Raman"
        assert op["expected_comment_text"] == "Is this still the enterprise price?"
        assert "unresolvable" not in op

    def test_a_comment_that_is_gone_is_marked_unresolvable(
        self, commented_docx: bytes
    ) -> None:
        [op] = resolve_ops_for_review(
            commented_docx, [{"kind": "resolve_comment", "comment_id": "99"}]
        )
        assert "no longer in this document" in op["unresolvable"]

    def test_the_label_quotes_the_comment_a_reader_can_see(
        self, commented_docx: bytes
    ) -> None:
        [op] = resolve_ops_for_review(
            commented_docx, [{"kind": "resolve_comment", "comment_id": "2"}]
        )
        assert "Priya Raman" in op["cell_label"]
        assert "Tighten this sentence" in op["cell_label"]

    def test_an_anchor_that_is_not_in_the_document_is_refused(
        self, commented_docx: bytes
    ) -> None:
        [op] = resolve_ops_for_review(
            commented_docx,
            [{"kind": "add_comment", "anchor_find": "$70k", "text": "Check?"}],
        )
        assert "not in this document" in op["unresolvable"]

    def test_an_anchor_that_is_present_passes_through(
        self, commented_docx: bytes
    ) -> None:
        [op] = resolve_ops_for_review(
            commented_docx,
            [{"kind": "add_comment", "anchor_find": "$50k", "text": "Check?"}],
        )
        assert "unresolvable" not in op

    def test_ops_are_never_mutated_in_place(self, commented_docx: bytes) -> None:
        original = {"kind": "resolve_comment", "comment_id": "0"}
        resolve_ops_for_review(commented_docx, [original])
        assert original == {"kind": "resolve_comment", "comment_id": "0"}
