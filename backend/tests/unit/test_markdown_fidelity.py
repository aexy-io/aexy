"""The import-side Markdown parser keeps structure.

The property that matters most is the one that was broken: **the module can
re-import its own export**. Export shipped writing tables and images to
Markdown that `markdown_to_tiptap` could not read, so a table round-tripped into
a paragraph of pipe characters and an image into the literal text
`![alt](url)`.

There are two parsers on purpose. `markdown_to_tiptap` is the write contract for
untrusted callers and stays deliberately small — an unknown node makes TipTap
render a blank page, so a bad agent write must not be able to produce one. This
one reads archives a workspace admin uploaded, where the measure is fidelity.
`test_the_strict_parser_is_still_strict` pins that they have not been merged.
"""

import pytest

from aexy.services.document_export_service import tiptap_to_markdown
from aexy.services.document_import.markdown_fidelity import (
    MarkdownError,
    import_markdown_to_tiptap,
)


def _types(document: dict) -> list[str]:
    return [node["type"] for node in document["content"]]


def _texts(node: dict) -> list[str]:
    out: list[str] = []

    def walk(n):
        if n.get("type") == "text":
            out.append(n.get("text", ""))
        for child in n.get("content") or []:
            walk(child)

    walk(node)
    return out


# ──────────────────────────────────────────────────────────────────────
# The regression


class TestRoundTrip:
    def test_a_table_survives_the_modules_own_export(self):
        original = {
            "type": "doc",
            "content": [
                {
                    "type": "table",
                    "content": [
                        {
                            "type": "tableRow",
                            "content": [
                                {
                                    "type": "tableHeader",
                                    "content": [
                                        {
                                            "type": "paragraph",
                                            "content": [
                                                {"type": "text", "text": "Env"}
                                            ],
                                        }
                                    ],
                                },
                                {
                                    "type": "tableHeader",
                                    "content": [
                                        {
                                            "type": "paragraph",
                                            "content": [
                                                {"type": "text", "text": "Host"}
                                            ],
                                        }
                                    ],
                                },
                            ],
                        },
                        {
                            "type": "tableRow",
                            "content": [
                                {
                                    "type": "tableCell",
                                    "content": [
                                        {
                                            "type": "paragraph",
                                            "content": [
                                                {"type": "text", "text": "prod"}
                                            ],
                                        }
                                    ],
                                },
                                {
                                    "type": "tableCell",
                                    "content": [
                                        {
                                            "type": "paragraph",
                                            "content": [
                                                {"type": "text", "text": "a1"}
                                            ],
                                        }
                                    ],
                                },
                            ],
                        },
                    ],
                }
            ],
        }

        back = import_markdown_to_tiptap(tiptap_to_markdown(original)).document

        assert _types(back) == ["table"]
        assert _texts(back["content"][0]) == ["Env", "Host", "prod", "a1"]

    def test_an_image_survives_the_modules_own_export(self):
        original = {
            "type": "doc",
            "content": [
                {
                    "type": "image",
                    "attrs": {"src": "https://x.test/d.png", "alt": "Diagram"},
                }
            ],
        }

        back = import_markdown_to_tiptap(tiptap_to_markdown(original)).document

        assert _types(back) == ["image"]
        assert back["content"][0]["attrs"]["src"] == "https://x.test/d.png"
        assert back["content"][0]["attrs"]["alt"] == "Diagram"

    def test_marks_survive_the_modules_own_export(self):
        original = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "plain "},
                        {"type": "text", "text": "bold", "marks": [{"type": "bold"}]},
                        {"type": "text", "text": " and "},
                        {
                            "type": "text",
                            "text": "linked",
                            "marks": [
                                {"type": "link", "attrs": {"href": "https://x.test"}}
                            ],
                        },
                    ],
                }
            ],
        }

        back = import_markdown_to_tiptap(tiptap_to_markdown(original)).document
        paragraph = back["content"][0]
        marks = {
            m["type"]
            for node in paragraph["content"]
            for m in node.get("marks", [])
        }
        assert {"bold", "link"} <= marks


# ──────────────────────────────────────────────────────────────────────
# Structure


class TestStructure:
    def test_nested_lists_nest(self):
        """`markdown_to_tiptap` flattens these into the parent's text and says
        so. Here nesting is the requirement — an imported runbook is mostly
        nested lists, and flattening one is the change a reader notices
        first."""
        document = import_markdown_to_tiptap(
            "- one\n  - one a\n  - one b\n- two\n"
        ).document

        assert _types(document) == ["bulletList"]
        first_item = document["content"][0]["content"][0]
        nested = [c for c in first_item["content"] if c["type"] == "bulletList"]
        assert nested, "the nested list was flattened"
        assert _texts(nested[0]) == ["one a", "one b"]

    def test_task_lists_keep_their_checkboxes(self):
        document = import_markdown_to_tiptap("- [x] done\n- [ ] todo\n").document

        assert _types(document) == ["taskList"]
        items = document["content"][0]["content"]
        assert [i["attrs"]["checked"] for i in items] == [True, False]

    def test_ordered_lists_are_ordered(self):
        document = import_markdown_to_tiptap("1. first\n2. second\n").document
        assert _types(document) == ["orderedList"]

    def test_code_blocks_keep_their_language_and_body(self):
        document = import_markdown_to_tiptap(
            "```python\nx = 1\ny = 2\n```\n"
        ).document

        block = document["content"][0]
        assert block["type"] == "codeBlock"
        assert block["attrs"]["language"] == "python"
        assert _texts(block) == ["x = 1\ny = 2"]

    def test_an_unterminated_fence_keeps_its_content(self):
        """Dropping the content to punish bad syntax loses the page."""
        document = import_markdown_to_tiptap("```\nstill here\n").document
        assert _texts(document["content"][0]) == ["still here"]

    def test_headings_keep_their_level(self):
        document = import_markdown_to_tiptap("### Third\n").document
        assert document["content"][0]["attrs"]["level"] == 3

    def test_a_quote_with_two_paragraphs_keeps_both(self):
        document = import_markdown_to_tiptap("> one\n>\n> two\n").document
        quote = document["content"][0]
        assert quote["type"] == "blockquote"
        assert len(quote["content"]) == 2

    def test_prose_containing_pipes_is_not_a_table(self):
        """The divider row is what distinguishes a table from a shell command
        in a paragraph."""
        document = import_markdown_to_tiptap(
            "Run | grep foo | wc -l to count them.\n"
        ).document
        assert _types(document) == ["paragraph"]

    def test_a_ragged_table_is_padded_not_dropped(self):
        document = import_markdown_to_tiptap(
            "| a | b | c |\n| --- | --- | --- |\n| 1 |\n"
        ).document

        table = document["content"][0]
        assert table["type"] == "table"
        widths = {len(row["content"]) for row in table["content"]}
        assert widths == {3}


# ──────────────────────────────────────────────────────────────────────
# Contract


class TestContract:
    def test_empty_input_is_refused(self):
        with pytest.raises(MarkdownError):
            import_markdown_to_tiptap("   \n\n  ")

    def test_deep_nesting_is_flattened_with_a_warning(self):
        """A lossy conversion the operator can see is a decision; one they
        cannot is a bug they find months later."""
        markdown = "".join(
            f"{'  ' * level}- level {level}\n" for level in range(10)
        )
        converted = import_markdown_to_tiptap(markdown)
        assert converted.warnings, "deep nesting was flattened silently"

    def test_a_clean_document_warns_about_nothing(self):
        converted = import_markdown_to_tiptap("# Title\n\nA paragraph.\n")
        assert converted.warnings == []

    def test_the_strict_parser_is_still_strict(self):
        """The two parsers exist for opposite reasons and must not converge.

        `markdown_to_tiptap` is the write contract for untrusted callers; its
        narrowness is a security property, not an oversight.
        """
        from aexy.services.markdown_to_tiptap import markdown_to_tiptap

        table = "| a | b |\n| --- | --- |\n| 1 | 2 |\n"

        strict = markdown_to_tiptap(table)
        fidelity = import_markdown_to_tiptap(table).document

        assert "table" not in _types(strict)
        assert "table" in _types(fidelity)
