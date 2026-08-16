"""Markdown in, editor document out.

The write contract for anything that is not the editor itself. Clients — an
agent over MCP, most of all — send Markdown and the server decides what the
document becomes. Accepting raw TipTap JSON would mean trusting an outside
writer to know a schema it cannot see, and the failure is silent: an invalid
node makes the editor warn to the console and render an entirely blank page,
so a bad write looks like an empty document rather than an error.

A deliberately small subset, matching what the editor actually renders:
headings, paragraphs, bullet and ordered lists, code blocks, blockquotes,
horizontal rules, and inline code / bold / italic / links. Anything else
degrades to plain text rather than being dropped — a paragraph that reads
oddly is recoverable, a silently missing section is not.

Lists are one level deep. Nested Markdown lists flatten into their parent
item's text rather than being reshaped into something approximate; said here
because a converter that quietly restructures content is worse than one with
a stated limit.
"""

from __future__ import annotations

import re
from typing import Any

# Inline patterns, applied in this order. Code first: backticks win over every
# other marker, so `**not bold**` inside code stays literal.
_INLINE = [
    ("code", re.compile(r"`([^`]+)`")),
    ("link", re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")),
    ("bold", re.compile(r"\*\*([^*]+)\*\*")),
    ("italic", re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")),
]

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_BULLET = re.compile(r"^\s*[-*+]\s+(.*)$")
_ORDERED = re.compile(r"^\s*\d+[.)]\s+(.*)$")
_QUOTE = re.compile(r"^>\s?(.*)$")
_RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_FENCE = re.compile(r"^\s*```\s*([\w+-]*)\s*$")


class MarkdownError(ValueError):
    """The input could not become a document worth saving."""


def _text_node(value: str, marks: list[dict] | None = None) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": value}
    if marks:
        node["marks"] = marks
    return node


def _inline(text: str) -> list[dict[str, Any]]:
    """Split a line into text nodes, carrying marks.

    Empty strings are never emitted. ProseMirror's schema forbids an empty
    text node — `RangeError: Empty text nodes are not allowed` — and TipTap's
    response to invalid content is to render nothing at all.
    """
    if not text:
        return []

    for mark_type, pattern in _INLINE:
        match = pattern.search(text)
        if not match:
            continue

        before = text[: match.start()]
        after = text[match.end() :]

        if mark_type == "link":
            label, href = match.group(1), match.group(2)
            marked = _text_node(label, [{"type": "link", "attrs": {"href": href}}])
        else:
            marked = _text_node(match.group(1), [{"type": mark_type}])

        return [*_inline(before), marked, *_inline(after)]

    return [_text_node(text)]


def _paragraph(text: str) -> dict[str, Any]:
    content = _inline(text.strip())
    # A paragraph with no content is valid; a paragraph containing an empty
    # text node is not.
    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}


def _list_item(text: str) -> dict[str, Any]:
    return {"type": "listItem", "content": [_paragraph(text)]}


def markdown_to_tiptap(markdown: str) -> dict[str, Any]:
    """Convert Markdown to a TipTap document.

    Raises `MarkdownError` when the input has no content — an empty document
    is the one outcome a caller must be told about rather than handed, since
    it is indistinguishable from a save that silently lost everything.
    """
    if not isinstance(markdown, str):
        raise MarkdownError("Expected Markdown text.")

    lines = markdown.replace("\r\n", "\n").split("\n")
    nodes: list[dict[str, Any]] = []
    paragraph: list[str] = []
    index = 0

    def flush_paragraph() -> None:
        if paragraph:
            nodes.append(_paragraph(" ".join(paragraph)))
            paragraph.clear()

    while index < len(lines):
        line = lines[index]

        fence = _FENCE.match(line)
        if fence:
            flush_paragraph()
            language = fence.group(1) or None
            body: list[str] = []
            index += 1
            while index < len(lines) and not _FENCE.match(lines[index]):
                body.append(lines[index])
                index += 1
            index += 1  # closing fence, or the end of the input
            code = "\n".join(body)
            node: dict[str, Any] = {"type": "codeBlock"}
            if language:
                node["attrs"] = {"language": language}
            if code:
                node["content"] = [_text_node(code)]
            nodes.append(node)
            continue

        if not line.strip():
            flush_paragraph()
            index += 1
            continue

        if _RULE.match(line):
            flush_paragraph()
            nodes.append({"type": "horizontalRule"})
            index += 1
            continue

        heading = _HEADING.match(line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            content = _inline(heading.group(2).strip())
            nodes.append(
                {
                    "type": "heading",
                    "attrs": {"level": level},
                    # A heading with no text would be an invisible node the
                    # author cannot select or delete.
                    "content": content or [_text_node(" ")],
                }
            )
            index += 1
            continue

        if _BULLET.match(line) or _ORDERED.match(line):
            flush_paragraph()
            ordered = bool(_ORDERED.match(line))
            pattern = _ORDERED if ordered else _BULLET
            items: list[dict[str, Any]] = []
            while index < len(lines):
                match = pattern.match(lines[index])
                if not match:
                    break
                items.append(_list_item(match.group(1)))
                index += 1
            nodes.append(
                {
                    "type": "orderedList" if ordered else "bulletList",
                    "content": items,
                }
            )
            continue

        quote = _QUOTE.match(line)
        if quote:
            flush_paragraph()
            body = [quote.group(1)]
            index += 1
            while index < len(lines) and _QUOTE.match(lines[index]):
                body.append(_QUOTE.match(lines[index]).group(1))
                index += 1
            nodes.append(
                {
                    "type": "blockquote",
                    "content": [_paragraph(" ".join(body).strip())],
                }
            )
            continue

        paragraph.append(line.strip())
        index += 1

    flush_paragraph()

    if not nodes:
        raise MarkdownError(
            "That Markdown produced an empty document. Nothing was saved."
        )

    return {"type": "doc", "content": nodes}
