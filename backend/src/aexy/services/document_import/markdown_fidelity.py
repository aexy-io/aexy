"""Markdown in, editor document out — for archives, not for callers.

The second Markdown parser, and the separation is deliberate.

``services/markdown_to_tiptap.py`` is the **write contract for outside
callers** — an agent over MCP above all. Its docstring is explicit that it
accepts "a deliberately small subset", because an unknown node makes TipTap warn
to the console and render an entirely blank page, so a bad write from an
untrusted writer looks like an empty document rather than an error. Widening it
widens that surface.

This module has the opposite requirement. Its input is an archive a workspace
admin uploaded, and the measure is **fidelity**: a Confluence space whose tables
became paragraphs of pipe characters is a migration people stop trusting after
the first page they check.

That was not hypothetical. Export shipped writing tables and images to Markdown
that `markdown_to_tiptap` cannot read, so the module could not re-import its own
export:

    original node types: ['paragraph', 'table', 'image']
    re-imported types:   ['paragraph', 'paragraph']

Anything this parser cannot represent is recorded as a warning on the import
job rather than silently degraded, which is the other half of the difference: a
lossy conversion the operator can see is a decision, and one they cannot is a
bug they find months later.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# Inline patterns, applied in this order. Code first: backticks win over every
# other marker, so `**not bold**` inside code stays literal. Image before link,
# because `![alt](src)` also matches the link pattern and would otherwise
# become a link whose label starts with an exclamation mark.
_INLINE = [
    ("code", re.compile(r"`([^`]+)`")),
    ("image", re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")),
    ("link", re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")),
    ("bold", re.compile(r"\*\*([^*]+)\*\*")),
    ("strike", re.compile(r"~~([^~]+)~~")),
    ("italic", re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")),
]

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_BULLET = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_ORDERED = re.compile(r"^(\s*)\d{1,3}[.)]\s+(.*)$")
_TASK = re.compile(r"^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$")
_QUOTE = re.compile(r"^>\s?(.*)$")
_RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_FENCE = re.compile(r"^\s*```\s*([\w+-]*)\s*$")
_TABLE_ROW = re.compile(r"^\s*\|(.+)\|\s*$")
_TABLE_DIVIDER = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]*$")

#: Two spaces per level is the CommonMark convention and what every exporter
#: this module reads actually emits.
_INDENT_UNIT = 2

#: A list nested deeper than this is either generated or pathological, and the
#: editor renders neither usefully.
_MAX_LIST_DEPTH = 6


class MarkdownError(ValueError):
    """The input could not become a document worth saving."""


@dataclass
class Converted:
    """A document, and everything the conversion could not do faithfully.

    The warnings are the point. A converter that returns only the document
    makes every lossy page indistinguishable from a clean one.
    """

    document: dict[str, Any]
    warnings: list[str] = field(default_factory=list)


# ----------------------------------------------------------------------
# Inline


def _text_node(value: str, marks: list[dict] | None = None) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": value}
    if marks:
        node["marks"] = marks
    return node


def _inline(text: str) -> list[dict[str, Any]]:
    """Split a line into inline nodes, carrying marks.

    Empty strings are never emitted: ProseMirror's schema forbids an empty text
    node (`RangeError: Empty text nodes are not allowed`) and TipTap's response
    to invalid content is to render nothing at all.
    """
    if not text:
        return []

    for kind, pattern in _INLINE:
        match = pattern.search(text)
        if not match:
            continue

        before = text[: match.start()]
        after = text[match.end() :]

        if kind == "image":
            alt, src = match.group(1), match.group(2)
            node = {"type": "image", "attrs": {"src": src, "alt": alt or None}}
        elif kind == "link":
            label, href = match.group(1), match.group(2)
            node = _text_node(label, [{"type": "link", "attrs": {"href": href}}])
        else:
            node = _text_node(match.group(1), [{"type": kind}])

        return [*_inline(before), node, *_inline(after)]

    return [_text_node(text)]


def _paragraph(text: str) -> dict[str, Any]:
    content = _inline(text.strip())
    return (
        {"type": "paragraph", "content": content}
        if content
        else {"type": "paragraph"}
    )


# ----------------------------------------------------------------------
# Block


class _Converter:
    def __init__(self, markdown: str):
        self.lines = markdown.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        self.i = 0
        self.warnings: list[str] = []
        self.out: list[dict[str, Any]] = []

    # -- helpers ----------------------------------------------------

    def _peek(self, offset: int = 0) -> str | None:
        index = self.i + offset
        return self.lines[index] if index < len(self.lines) else None

    def _warn(self, message: str) -> None:
        if message not in self.warnings:
            self.warnings.append(message)

    # -- entry ------------------------------------------------------

    def run(self) -> Converted:
        while self.i < len(self.lines):
            line = self.lines[self.i]

            if not line.strip():
                self.i += 1
                continue

            for handler in (
                self._fence,
                self._table,
                self._heading,
                self._rule,
                self._quote,
                self._list,
            ):
                if handler():
                    break
            else:
                self._paragraph_run()

        return Converted(
            document={"type": "doc", "content": self.out}, warnings=self.warnings
        )

    # -- blocks -----------------------------------------------------

    def _heading(self) -> bool:
        match = _HEADING.match(self.lines[self.i])
        if not match:
            return False
        self.i += 1

        level = len(match.group(1))
        content = _inline(match.group(2).strip())
        if not content:
            # A heading with no text is an invisible node the editor cannot
            # place a cursor in.
            return True

        self.out.append(
            {"type": "heading", "attrs": {"level": level}, "content": content}
        )
        return True

    def _rule(self) -> bool:
        if not _RULE.match(self.lines[self.i]):
            return False
        self.i += 1
        self.out.append({"type": "horizontalRule"})
        return True

    def _fence(self) -> bool:
        match = _FENCE.match(self.lines[self.i])
        if not match:
            return False

        language = match.group(1) or None
        self.i += 1
        body: list[str] = []
        while self.i < len(self.lines) and not _FENCE.match(self.lines[self.i]):
            body.append(self.lines[self.i])
            self.i += 1
        # Consume the closing fence if there is one. An unterminated fence at
        # end of file is treated as closing there rather than discarded — the
        # content is what matters, and dropping it to punish bad syntax loses
        # the page.
        if self.i < len(self.lines):
            self.i += 1

        # Trailing blank lines are an artefact of splitting, not content —
        # most visibly for an unterminated fence at end of file, where the
        # split leaves an empty final element.
        while body and not body[-1].strip():
            body.pop()

        text = "\n".join(body)
        node: dict[str, Any] = {"type": "codeBlock"}
        if language:
            node["attrs"] = {"language": language}
        if text:
            node["content"] = [_text_node(text)]
        self.out.append(node)
        return True

    def _quote(self) -> bool:
        if not _QUOTE.match(self.lines[self.i]):
            return False

        collected: list[str] = []
        while self.i < len(self.lines):
            match = _QUOTE.match(self.lines[self.i])
            if not match:
                break
            collected.append(match.group(1))
            self.i += 1

        # Blank lines inside a quote separate paragraphs within it.
        paragraphs: list[dict[str, Any]] = []
        buffer: list[str] = []
        for line in [*collected, ""]:
            if line.strip():
                buffer.append(line.strip())
            elif buffer:
                paragraphs.append(_paragraph(" ".join(buffer)))
                buffer = []

        self.out.append(
            {"type": "blockquote", "content": paragraphs or [{"type": "paragraph"}]}
        )
        return True

    def _table(self) -> bool:
        """A GitHub-flavoured pipe table.

        Requires the divider row on line two, which is what distinguishes a
        table from prose that happens to contain pipes — a shell command in a
        paragraph, most often.
        """
        first = self.lines[self.i]
        second = self._peek(1)
        if not _TABLE_ROW.match(first) or not second or not _TABLE_DIVIDER.match(second):
            return False

        def cells(line: str) -> list[str]:
            inner = _TABLE_ROW.match(line).group(1)
            return [c.strip() for c in inner.split("|")]

        header = cells(first)
        self.i += 2  # header + divider

        rows: list[list[str]] = []
        while self.i < len(self.lines) and _TABLE_ROW.match(self.lines[self.i]):
            rows.append(cells(self.lines[self.i]))
            self.i += 1

        width = max([len(header), *(len(r) for r in rows)] or [0])

        def cell_node(text: str, header_cell: bool) -> dict[str, Any]:
            return {
                "type": "tableHeader" if header_cell else "tableCell",
                "content": [_paragraph(text)],
            }

        def row_node(values: list[str], header_row: bool) -> dict[str, Any]:
            padded = [*values, *([""] * (width - len(values)))]
            return {
                "type": "tableRow",
                "content": [cell_node(v, header_row) for v in padded],
            }

        table = {"type": "table", "content": [row_node(header, True)]}
        table["content"].extend(row_node(r, False) for r in rows)
        self.out.append(table)
        return True

    def _list(self) -> bool:
        if not (
            _TASK.match(self.lines[self.i])
            or _BULLET.match(self.lines[self.i])
            or _ORDERED.match(self.lines[self.i])
        ):
            return False

        items = self._collect_list_lines()
        self.out.append(self._build_list(items, depth=0))
        return True

    def _collect_list_lines(self) -> list[tuple[int, str, str, bool | None]]:
        """`(indent, kind, text, checked)` for one contiguous list block.

        A blank line followed by more list lines stays in the same list; a
        blank line followed by anything else ends it. Exporters emit both
        spacings and treating them differently splits one list into several.
        """
        items: list[tuple[int, str, str, bool | None]] = []

        while self.i < len(self.lines):
            line = self.lines[self.i]

            if not line.strip():
                nxt = self._peek(1)
                if nxt and (
                    _TASK.match(nxt) or _BULLET.match(nxt) or _ORDERED.match(nxt)
                ):
                    self.i += 1
                    continue
                break

            task = _TASK.match(line)
            if task:
                indent = len(task.group(1)) // _INDENT_UNIT
                items.append((indent, "task", task.group(3), task.group(2).lower() == "x"))
                self.i += 1
                continue

            bullet = _BULLET.match(line)
            if bullet:
                indent = len(bullet.group(1)) // _INDENT_UNIT
                items.append((indent, "bullet", bullet.group(2), None))
                self.i += 1
                continue

            ordered = _ORDERED.match(line)
            if ordered:
                indent = len(ordered.group(1)) // _INDENT_UNIT
                items.append((indent, "ordered", ordered.group(2), None))
                self.i += 1
                continue

            # An indented continuation line belongs to the item above it.
            if line.startswith(" ") and items:
                indent, kind, text, checked = items[-1]
                items[-1] = (indent, kind, f"{text} {line.strip()}", checked)
                self.i += 1
                continue

            break

        return items

    def _build_list(
        self, items: list[tuple[int, str, str, bool | None]], depth: int
    ) -> dict[str, Any]:
        """Nest by indentation.

        `markdown_to_tiptap` flattens nested lists into their parent's text and
        says so — the right call for a converter whose job is not to guess.
        Here nesting is the requirement: an imported runbook is mostly nested
        lists, and flattening one is the change a reader notices first.
        """
        if depth >= _MAX_LIST_DEPTH:
            self._warn(
                f"list nested deeper than {_MAX_LIST_DEPTH} levels was flattened"
            )
            items = [(items[0][0], k, t, c) for _i, k, t, c in items]

        base = items[0][0]
        kind = items[0][1]
        wrapper = {
            "task": "taskList",
            "ordered": "orderedList",
            "bullet": "bulletList",
        }[kind]

        children: list[dict[str, Any]] = []
        index = 0
        while index < len(items):
            indent, item_kind, text, checked = items[index]

            if indent > base:
                # Deeper run: belongs inside the previous item.
                run_end = index
                while run_end < len(items) and items[run_end][0] > base:
                    run_end += 1
                nested = self._build_list(items[index:run_end], depth + 1)
                if children:
                    children[-1].setdefault("content", []).append(nested)
                else:
                    # Nothing to attach to — a list that starts indented.
                    children.append(
                        {"type": "listItem", "content": [{"type": "paragraph"}, nested]}
                    )
                index = run_end
                continue

            if item_kind == "task":
                node = {
                    "type": "taskItem",
                    "attrs": {"checked": bool(checked)},
                    "content": [_paragraph(text)],
                }
            else:
                node = {"type": "listItem", "content": [_paragraph(text)]}

            children.append(node)
            index += 1

        return {"type": wrapper, "content": children}

    def _paragraph_run(self) -> None:
        """Consecutive non-blank lines are one paragraph.

        A lone image on its own line becomes a block image rather than a
        paragraph wrapping one, which is how the editor represents it and what
        the export writes.
        """
        buffer: list[str] = []
        while self.i < len(self.lines) and self.lines[self.i].strip():
            line = self.lines[self.i]
            if (
                _HEADING.match(line)
                or _RULE.match(line)
                or _FENCE.match(line)
                or _QUOTE.match(line)
                or _BULLET.match(line)
                or _ORDERED.match(line)
                or _TABLE_ROW.match(line)
            ):
                break
            buffer.append(line.strip())
            self.i += 1

        if not buffer:
            # Nothing consumed and nothing matched: skip the line rather than
            # loop on it forever.
            self.i += 1
            return

        text = " ".join(buffer)
        nodes = _inline(text)
        if len(nodes) == 1 and nodes[0].get("type") == "image":
            self.out.append(nodes[0])
            return

        self.out.append(
            {"type": "paragraph", "content": nodes} if nodes else {"type": "paragraph"}
        )


def import_markdown_to_tiptap(markdown: str) -> Converted:
    """Convert Markdown to a TipTap document, keeping structure.

    Returns the document *and* its conversion warnings — see `Converted`.
    """
    if markdown is None:
        raise MarkdownError("No content to convert")

    converted = _Converter(markdown).run()
    if not converted.document["content"]:
        raise MarkdownError("The content converted to an empty document")
    return converted
