"""HTML in, editor document out.

The primary import path, and HTML rather than Markdown on purpose. Both Notion
and Confluence export both formats, and in both products the Markdown is the
lossier one:

* **Notion's** Markdown drops callouts, toggles and column layouts; its HTML
  keeps them as recognisable structures.
* **Confluence's** storage format is XHTML with `<ac:structured-macro>`
  elements carrying panels, code blocks, status labels and page includes. Its
  Markdown has none of that.

So one parser, with a per-source pre-pass that normalises vendor markup into
ordinary HTML before the shared conversion runs. Adding a third source is a
pre-pass, not a parser.

Uses `html.parser` from the standard library rather than adding a dependency.
That is a real constraint — it is a tolerant tokeniser, not a tree builder —
so this module builds its own tree, and the shape of the code follows from
that.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from html import unescape
from html.parser import HTMLParser
from typing import Any

logger = logging.getLogger(__name__)

#: Tags that carry no content of their own and whose children are hoisted.
_TRANSPARENT = {"div", "span", "section", "article", "main", "body", "html", "figure"}

#: Ignored entirely, contents and all.
_DROPPED = {"script", "style", "head", "meta", "link", "noscript", "svg"}

_MARK_TAGS = {
    "strong": "bold",
    "b": "bold",
    "em": "italic",
    "i": "italic",
    "code": "code",
    "s": "strike",
    "del": "strike",
    "strike": "strike",
    "u": "underline",
}

_HEADINGS = {f"h{n}": n for n in range(1, 7)}

_MAX_LIST_DEPTH = 6


@dataclass
class Converted:
    document: dict[str, Any]
    warnings: list[str] = field(default_factory=list)
    #: Every `src`/`href` seen, so the caller can rewrite links and fetch
    #: attachments without parsing the document a second time.
    references: list[str] = field(default_factory=list)


@dataclass
class _El:
    tag: str
    attrs: dict[str, str]
    children: list = field(default_factory=list)


class _TreeBuilder(HTMLParser):
    """`html.parser` is a tokeniser, so the tree is built here.

    Void elements are never pushed, and an unclosed tag is closed implicitly
    when its parent closes — exported HTML is not always well formed and
    refusing to parse it would fail the migration over somebody's stray `<br>`.
    """

    _VOID = {"br", "img", "hr", "input", "meta", "link", "source"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _El("root", {})
        self.stack: list[_El] = [self.root]
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if self.skip_depth:
            self.skip_depth += 1
            return
        if tag in _DROPPED:
            self.skip_depth = 1
            return

        element = _El(tag, {k: (v or "") for k, v in attrs})
        self.stack[-1].children.append(element)
        if tag not in self._VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        if self.skip_depth or tag in _DROPPED:
            return
        self.stack[-1].children.append(_El(tag, {k: (v or "") for k, v in attrs}))

    def handle_endtag(self, tag):
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in self._VOID:
            return

        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return
        # A close with no matching open. Ignored rather than raising: the
        # document is what matters, not its conformance.

    def handle_data(self, data):
        if self.skip_depth or not data:
            return
        self.stack[-1].children.append(data)


# ----------------------------------------------------------------------
# Conversion


class _Converter:
    def __init__(self) -> None:
        self.warnings: list[str] = []
        self.references: list[str] = []

    def _warn(self, message: str) -> None:
        if message not in self.warnings:
            self.warnings.append(message)

    # -- inline -----------------------------------------------------

    def _inline(self, node, marks: list[dict]) -> list[dict[str, Any]]:
        """Inline content, carrying marks down the tree."""
        if isinstance(node, str):
            text = re.sub(r"\s+", " ", unescape(node))
            if not text.strip():
                # Whitespace between block tags is layout, not content; inside
                # a run of text it is a real space.
                return [{"type": "text", "text": " "}] if text == " " else []
            out = {"type": "text", "text": text}
            if marks:
                out["marks"] = list(marks)
            return [out]

        tag = node.tag

        if tag == "br":
            return [{"type": "hardBreak"}]

        if tag == "img":
            src = node.attrs.get("src", "")
            if src:
                self.references.append(src)
            return [
                {
                    "type": "image",
                    "attrs": {"src": src, "alt": node.attrs.get("alt") or None},
                }
            ]

        next_marks = list(marks)
        if tag in _MARK_TAGS:
            mark = {"type": _MARK_TAGS[tag]}
            if mark not in next_marks:
                next_marks.append(mark)
        elif tag == "a":
            href = node.attrs.get("href", "")
            if href:
                self.references.append(href)
                next_marks.append({"type": "link", "attrs": {"href": href}})

        out: list[dict[str, Any]] = []
        for child in node.children:
            out.extend(self._inline(child, next_marks))
        return out

    def _inline_children(self, node) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for child in node.children:
            out.extend(self._inline(child, []))
        # Trim the layout whitespace at either end.
        while out and out[0].get("text") == " ":
            out.pop(0)
        while out and out[-1].get("text") == " ":
            out.pop()
        return out

    # -- block ------------------------------------------------------

    def blocks(self, node, depth: int = 0) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for child in node.children:
            out.extend(self._block(child, depth))
        return out

    def _block(self, node, depth: int) -> list[dict[str, Any]]:
        if isinstance(node, str):
            text = re.sub(r"\s+", " ", unescape(node)).strip()
            return [{"type": "paragraph", "content": [{"type": "text", "text": text}]}] if text else []

        tag = node.tag

        if tag in _TRANSPARENT:
            return self.blocks(node, depth)

        if tag in _HEADINGS:
            content = self._inline_children(node)
            if not content:
                return []
            return [
                {
                    "type": "heading",
                    "attrs": {"level": _HEADINGS[tag]},
                    "content": content,
                }
            ]

        if tag == "p":
            content = self._inline_children(node)
            # A paragraph whose only child is an image is a block image, which
            # is how the editor stores one.
            if len(content) == 1 and content[0].get("type") == "image":
                return [content[0]]
            return [{"type": "paragraph", "content": content}] if content else []

        if tag in ("ul", "ol"):
            return [self._list(node, depth)]

        if tag == "blockquote":
            inner = self.blocks(node, depth) or [{"type": "paragraph"}]
            return [{"type": "blockquote", "content": inner}]

        if tag == "pre":
            return [self._code(node)]

        if tag == "hr":
            return [{"type": "horizontalRule"}]

        if tag == "table":
            return self._table(node)

        if tag == "img":
            return self._inline(node, [])

        if tag in _MARK_TAGS or tag == "a":
            content = self._inline(node, [])
            return [{"type": "paragraph", "content": content}] if content else []

        # Unknown element: keep its children rather than the element. Losing a
        # wrapper is recoverable; losing the section inside it is not.
        return self.blocks(node, depth)

    def _code(self, node) -> dict[str, Any]:
        text = _text_of(node)
        language = None
        for child in node.children:
            if not isinstance(child, str) and child.tag == "code":
                classes = child.attrs.get("class", "")
                match = re.search(r"language-([\w+-]+)", classes)
                if match:
                    language = match.group(1)
        block: dict[str, Any] = {"type": "codeBlock"}
        if language:
            block["attrs"] = {"language": language}
        if text:
            block["content"] = [{"type": "text", "text": text}]
        return block

    def _list(self, node, depth: int) -> dict[str, Any]:
        if depth >= _MAX_LIST_DEPTH:
            self._warn(f"list nested deeper than {_MAX_LIST_DEPTH} levels was flattened")

        ordered = node.tag == "ol"
        items: list[dict[str, Any]] = []
        is_task_list = False

        for child in node.children:
            if isinstance(child, str) or child.tag != "li":
                continue

            checked = _checkbox_state(child)
            if checked is not None:
                is_task_list = True

            inline: list[dict[str, Any]] = []
            nested: list[dict[str, Any]] = []
            for part in child.children:
                if not isinstance(part, str) and part.tag in ("ul", "ol"):
                    if depth < _MAX_LIST_DEPTH:
                        nested.append(self._list(part, depth + 1))
                elif not isinstance(part, str) and part.tag in (
                    "p", "div", "blockquote", "pre", "table",
                ):
                    nested.extend(self._block(part, depth + 1))
                else:
                    inline.extend(self._inline(part, []))

            while inline and inline[0].get("text") == " ":
                inline.pop(0)
            while inline and inline[-1].get("text") == " ":
                inline.pop()

            # The first block of a list item must be a paragraph; TipTap's
            # schema has no way to render an item that starts with a list.
            content: list[dict[str, Any]] = [
                {"type": "paragraph", "content": inline} if inline else {"type": "paragraph"}
            ]
            content.extend(nested)

            if checked is not None:
                items.append(
                    {"type": "taskItem", "attrs": {"checked": checked}, "content": content}
                )
            else:
                items.append({"type": "listItem", "content": content})

        wrapper = "taskList" if is_task_list else ("orderedList" if ordered else "bulletList")
        return {"type": wrapper, "content": items}

    def _table(self, node) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []

        def walk(element) -> None:
            for child in element.children:
                if isinstance(child, str):
                    continue
                if child.tag in ("thead", "tbody", "tfoot"):
                    walk(child)
                elif child.tag == "tr":
                    rows.append(self._row(child))

        walk(node)
        if not rows:
            return []

        width = max(len(r["content"]) for r in rows)
        blank = {
            "type": "tableCell",
            "content": [{"type": "paragraph"}],
        }
        for row in rows:
            while len(row["content"]) < width:
                row["content"].append(dict(blank))

        return [{"type": "table", "content": rows}]

    def _row(self, node) -> dict[str, Any]:
        cells: list[dict[str, Any]] = []
        for child in node.children:
            if isinstance(child, str) or child.tag not in ("td", "th"):
                continue
            inner = self.blocks(child, 0) or [{"type": "paragraph"}]
            cell: dict[str, Any] = {
                "type": "tableHeader" if child.tag == "th" else "tableCell",
                "content": inner,
            }
            span = child.attrs.get("colspan")
            if span and span.isdigit() and int(span) > 1:
                cell["attrs"] = {"colspan": int(span)}
            cells.append(cell)
        return {"type": "tableRow", "content": cells}


def _text_of(node) -> str:
    if isinstance(node, str):
        return unescape(node)
    return "".join(_text_of(child) for child in node.children)


def _checkbox_state(item) -> bool | None:
    """Whether this `<li>` is a task item, and its state.

    Notion exports `<input type="checkbox" checked>`; Confluence uses a task
    list macro that the pre-pass normalises to the same thing.
    """
    for child in item.children:
        if isinstance(child, str):
            continue
        if child.tag == "input" and child.attrs.get("type") == "checkbox":
            return "checked" in child.attrs
    return None


def html_to_tiptap(html: str) -> Converted:
    """Convert an HTML fragment or page to a TipTap document."""
    builder = _TreeBuilder()
    builder.feed(html or "")
    builder.close()

    converter = _Converter()
    content = converter.blocks(builder.root)

    return Converted(
        document={"type": "doc", "content": content},
        warnings=converter.warnings,
        references=converter.references,
    )
