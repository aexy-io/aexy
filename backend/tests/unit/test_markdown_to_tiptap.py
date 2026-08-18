"""The write contract: Markdown in, a document the editor can render out.

Accepting raw editor JSON from a client would mean trusting an outside writer
to know a schema it cannot see, and the failure is silent — an invalid node
makes TipTap render an entirely blank page, so a bad write looks like an empty
document rather than an error.
"""

import pytest

from aexy.services.document_generation_service import DocumentGenerationService
from aexy.services.markdown_to_tiptap import MarkdownError, markdown_to_tiptap


def convert(markdown: str) -> dict:
    doc = markdown_to_tiptap(markdown)
    # Everything this produces must survive the same check the generation path
    # applies, or the contract only moves the failure.
    assert DocumentGenerationService.is_renderable_document(doc)
    return doc


def texts(node) -> list[str]:
    """Every text string in a node, in order."""
    if isinstance(node, dict):
        if node.get("type") == "text":
            return [node["text"]]
        return [t for child in node.get("content", []) for t in texts(child)]
    return []


class TestBlocks:
    def test_headings_keep_their_level(self):
        doc = convert("# One\n\n### Three")

        assert [n["type"] for n in doc["content"]] == ["heading", "heading"]
        assert doc["content"][0]["attrs"]["level"] == 1
        assert doc["content"][1]["attrs"]["level"] == 3

    def test_consecutive_lines_are_one_paragraph(self):
        """A hard-wrapped sentence is one thought, not three."""
        doc = convert("The auth flow\nsigns a token\nand returns it.")

        assert len(doc["content"]) == 1
        assert texts(doc["content"][0]) == ["The auth flow signs a token and returns it."]

    def test_a_blank_line_starts_a_new_paragraph(self):
        doc = convert("First.\n\nSecond.")

        assert [n["type"] for n in doc["content"]] == ["paragraph", "paragraph"]

    def test_bullet_lists(self):
        doc = convert("- one\n- two")

        [node] = doc["content"]
        assert node["type"] == "bulletList"
        assert len(node["content"]) == 2
        assert texts(node) == ["one", "two"]

    def test_ordered_lists(self):
        doc = convert("1. first\n2. second")

        [node] = doc["content"]
        assert node["type"] == "orderedList"
        assert texts(node) == ["first", "second"]

    def test_code_blocks_keep_their_language_and_whitespace(self):
        doc = convert("```python\ndef f():\n    return 1\n```")

        [node] = doc["content"]
        assert node["type"] == "codeBlock"
        assert node["attrs"]["language"] == "python"
        assert texts(node) == ["def f():\n    return 1"]

    def test_markdown_inside_a_code_block_stays_literal(self):
        """The one place formatting markers must not be interpreted."""
        doc = convert("```\n**not bold** and `not code`\n```")

        assert texts(doc["content"][0]) == ["**not bold** and `not code`"]

    def test_blockquotes(self):
        doc = convert("> a warning\n> continued")

        [node] = doc["content"]
        assert node["type"] == "blockquote"
        assert texts(node) == ["a warning continued"]

    def test_horizontal_rules(self):
        doc = convert("above\n\n---\n\nbelow")

        assert [n["type"] for n in doc["content"]] == [
            "paragraph",
            "horizontalRule",
            "paragraph",
        ]

    def test_an_unclosed_fence_still_produces_a_document(self):
        """Models truncate. Losing the tail is survivable; losing everything,
        or raising on a document that is 95% fine, is not."""
        doc = convert("# Title\n\n```python\ndef f():")

        assert [n["type"] for n in doc["content"]] == ["heading", "codeBlock"]


class TestInline:
    def test_bold_italic_and_code(self):
        doc = convert("**b** and *i* and `c`")

        marks = [
            m["type"]
            for node in doc["content"][0]["content"]
            for m in node.get("marks", [])
        ]
        assert marks == ["bold", "italic", "code"]

    def test_links_carry_their_href(self):
        doc = convert("see [the guide](https://example.com/g)")

        linked = [
            n for n in doc["content"][0]["content"] if n.get("marks")
        ]
        assert linked[0]["text"] == "the guide"
        assert linked[0]["marks"][0]["attrs"]["href"] == "https://example.com/g"

    def test_code_wins_over_other_markers(self):
        """Otherwise a documented format string reads as formatting."""
        doc = convert("call `format(**kwargs)` here")

        code = [n for n in doc["content"][0]["content"] if n.get("marks")][0]
        assert code["text"] == "format(**kwargs)"
        assert code["marks"][0]["type"] == "code"

    def test_surrounding_text_survives_a_mark(self):
        doc = convert("before **middle** after")

        assert texts(doc["content"][0]) == ["before ", "middle", " after"]

    def test_an_asterisk_in_prose_is_not_italic(self):
        doc = convert("2 * 3 = 6")

        assert texts(doc["content"][0]) == ["2 * 3 = 6"]


class TestNothingInvalidIsProduced:
    """#258 established the cost: an empty text node raises
    `RangeError: Empty text nodes are not allowed`, and TipTap answers invalid
    content by rendering a blank page."""

    @pytest.mark.parametrize(
        "markdown",
        [
            "# Title\n\n\n\nBody",
            "- \n- item",
            "```\n\n```",
            "> \n> quote",
            "**bold**",
            "text\n\n\n",
        ],
    )
    def test_no_empty_text_nodes_anywhere(self, markdown):
        doc = markdown_to_tiptap(markdown)

        def walk(node):
            if isinstance(node, dict):
                if node.get("type") == "text":
                    assert node["text"] != "", f"empty text node in {markdown!r}"
                for child in node.get("content", []):
                    walk(child)

        walk(doc)

    def test_a_heading_is_never_empty(self):
        """An empty heading is a node the author can neither see nor delete."""
        doc = markdown_to_tiptap("#\n\nbody")

        heading = doc["content"][0]
        assert heading["content"]
        assert heading["content"][0]["text"] != ""


class TestRefusals:
    @pytest.mark.parametrize("markdown", ["", "   ", "\n\n\n"])
    def test_empty_input_is_refused_rather_than_saved(self, markdown):
        """The one outcome a caller must be told about: an empty document is
        indistinguishable from a save that lost everything."""
        with pytest.raises(MarkdownError):
            markdown_to_tiptap(markdown)

    def test_non_text_input_is_refused(self):
        with pytest.raises(MarkdownError):
            markdown_to_tiptap({"type": "doc"})


class TestARealDocument:
    def test_a_generated_page_round_trips_into_something_renderable(self):
        doc = convert(
            "\n".join(
                [
                    "# Session service",
                    "",
                    "Signs users in and out. See `session.py`.",
                    "",
                    "## Usage",
                    "",
                    "1. Call **login()**",
                    "2. Store the token",
                    "",
                    "```python",
                    "session.login(user)",
                    "```",
                    "",
                    "> Tokens expire after 24h.",
                ]
            )
        )

        assert [n["type"] for n in doc["content"]] == [
            "heading",
            "paragraph",
            "heading",
            "orderedList",
            "codeBlock",
            "blockquote",
        ]


class TestProseThatLooksLikeMarkup:
    def test_a_year_starting_a_sentence_is_not_a_list(self):
        """"2024. Revenue doubled." is prose. Reading it as an ordered list
        silently restructures a paragraph into a numbered item."""
        doc = convert("2024. Revenue doubled.")

        assert doc["content"][0]["type"] == "paragraph"

    def test_a_genuine_ordered_list_still_works(self):
        doc = convert("1. first\n2. second")

        assert doc["content"][0]["type"] == "orderedList"
