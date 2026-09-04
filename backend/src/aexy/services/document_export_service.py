"""Getting documents out of, and into, the knowledge base.

Export mattered for two reasons that pull in the same direction. It is an
evaluation blocker — a buyer asks "can we get our content back out" before they
put anything in — and it is the answer to the lock-in objection, which is the
one a knowledge base attracts most. Import matters because nobody adopts a
wiki by retyping the one they already have.

`markdown_to_tiptap` already existed for AI proposals; this is the other
direction, plus the tree-shaped zip that makes a whole space portable.
"""

from __future__ import annotations

import io
import json
import logging
import re
import zipfile
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.documentation import Document

logger = logging.getLogger(__name__)


class ExportError(RuntimeError):
    """The document could not be rendered in the requested format."""


# ----------------------------------------------------------------------
# TipTap → Markdown


_MARK_WRAPPERS = {
    "bold": ("**", "**"),
    "italic": ("*", "*"),
    "code": ("`", "`"),
    "strike": ("~~", "~~"),
}


def _inline(node: dict[str, Any]) -> str:
    if node.get("type") != "text":
        # Inline nodes that are not text: a hard break, a mention, an inline
        # image. Rendered by type rather than dropped, because silently losing
        # a mention makes an exported page subtly wrong rather than obviously
        # incomplete.
        if node.get("type") == "hardBreak":
            return "  \n"
        if node.get("type") == "image":
            attrs = node.get("attrs") or {}
            return f"![{attrs.get('alt', '')}]({attrs.get('src', '')})"
        return ""

    text = node.get("text", "")
    marks = node.get("marks") or []

    href: str | None = None
    for mark in marks:
        name = mark.get("type")
        if name == "link":
            href = (mark.get("attrs") or {}).get("href")
        elif name in _MARK_WRAPPERS:
            open_tag, close_tag = _MARK_WRAPPERS[name]
            text = f"{open_tag}{text}{close_tag}"

    if href:
        text = f"[{text}]({href})"
    return text


def _children_text(node: dict[str, Any]) -> str:
    return "".join(_inline(c) for c in node.get("content") or [])


def tiptap_to_markdown(content: dict[str, Any]) -> str:
    """Render a TipTap document as Markdown.

    Handles what the editor can actually produce — headings, lists, quotes,
    code blocks, tables, task lists, rules, images. An unrecognised block type
    falls through to its text rather than disappearing: an export that silently
    drops content is worse than one that loses formatting.
    """
    lines: list[str] = []

    def render(node: dict[str, Any], depth: int = 0, list_prefix: str | None = None):
        node_type = node.get("type")
        indent = "  " * depth

        if node_type in ("doc", None):
            for child in node.get("content") or []:
                render(child, depth)
            return

        if node_type == "paragraph":
            text = _children_text(node)
            lines.append(f"{indent}{text}" if text else "")
            return

        if node_type == "heading":
            level = int((node.get("attrs") or {}).get("level", 1))
            lines.append(f"{'#' * max(1, min(6, level))} {_children_text(node)}")
            lines.append("")
            return

        if node_type in ("bulletList", "orderedList"):
            ordered = node_type == "orderedList"
            for index, item in enumerate(node.get("content") or [], start=1):
                render(item, depth, f"{index}." if ordered else "-")
            if depth == 0:
                lines.append("")
            return

        if node_type in ("listItem", "taskItem"):
            marker = list_prefix or "-"
            if node_type == "taskItem":
                checked = (node.get("attrs") or {}).get("checked")
                marker = f"- [{'x' if checked else ' '}]"

            children = node.get("content") or []
            first = children[0] if children else {}
            lines.append(f"{indent}{marker} {_children_text(first)}".rstrip())
            for child in children[1:]:
                render(child, depth + 1)
            return

        if node_type == "taskList":
            for item in node.get("content") or []:
                render(item, depth)
            if depth == 0:
                lines.append("")
            return

        if node_type == "blockquote":
            for child in node.get("content") or []:
                lines.append(f"> {_children_text(child)}")
            lines.append("")
            return

        if node_type == "codeBlock":
            language = (node.get("attrs") or {}).get("language") or ""
            lines.append(f"```{language}")
            lines.append(_children_text(node))
            lines.append("```")
            lines.append("")
            return

        if node_type == "horizontalRule":
            lines.append("---")
            lines.append("")
            return

        if node_type == "image":
            attrs = node.get("attrs") or {}
            lines.append(f"![{attrs.get('alt', '')}]({attrs.get('src', '')})")
            lines.append("")
            return

        if node_type == "table":
            _render_table(node, lines)
            return

        # Unknown block: keep the words.
        text = _children_text(node)
        if text:
            lines.append(f"{indent}{text}")
        for child in node.get("content") or []:
            if child.get("type") not in ("text",):
                render(child, depth)

    def _render_table(node: dict[str, Any], out: list[str]) -> None:
        rows = node.get("content") or []
        if not rows:
            return
        rendered: list[list[str]] = []
        for row in rows:
            cells = []
            for cell in row.get("content") or []:
                # A cell holds blocks; flatten them to one line, because a
                # Markdown table cell cannot contain a line break.
                cells.append(
                    " ".join(
                        _children_text(block).strip()
                        for block in cell.get("content") or []
                    ).strip()
                    or " "
                )
            rendered.append(cells)

        width = max(len(r) for r in rendered)
        for row in rendered:
            row.extend([" "] * (width - len(row)))

        out.append("| " + " | ".join(rendered[0]) + " |")
        out.append("|" + "|".join([" --- "] * width) + "|")
        for row in rendered[1:]:
            out.append("| " + " | ".join(row) + " |")
        out.append("")

    render(content or {})

    # Collapse runs of blank lines; the block renderers each append their own
    # trailing blank and nested ones stack up.
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def tiptap_to_html(content: dict[str, Any], title: str) -> str:
    """A standalone HTML page.

    Self-contained rather than a fragment: the point of an HTML export is that
    somebody can open the file.
    """
    from html import escape

    def render(node: dict[str, Any]) -> str:
        node_type = node.get("type")

        if node_type == "text":
            text = escape(node.get("text", ""))
            for mark in node.get("marks") or []:
                name = mark.get("type")
                if name == "bold":
                    text = f"<strong>{text}</strong>"
                elif name == "italic":
                    text = f"<em>{text}</em>"
                elif name == "code":
                    text = f"<code>{text}</code>"
                elif name == "strike":
                    text = f"<s>{text}</s>"
                elif name == "link":
                    href = escape((mark.get("attrs") or {}).get("href", ""))
                    text = f'<a href="{href}">{text}</a>'
            return text

        inner = "".join(render(c) for c in node.get("content") or [])

        tags = {
            "paragraph": "p",
            "bulletList": "ul",
            "orderedList": "ol",
            "listItem": "li",
            "blockquote": "blockquote",
            "codeBlock": "pre",
            "table": "table",
            "tableRow": "tr",
            "tableCell": "td",
            "tableHeader": "th",
        }
        if node_type == "heading":
            level = max(1, min(6, int((node.get("attrs") or {}).get("level", 1))))
            return f"<h{level}>{inner}</h{level}>"
        if node_type == "horizontalRule":
            return "<hr>"
        if node_type == "image":
            attrs = node.get("attrs") or {}
            return (
                f'<img src="{escape(attrs.get("src", ""))}" '
                f'alt="{escape(attrs.get("alt", "") or "")}">'
            )
        if node_type in tags:
            return f"<{tags[node_type]}>{inner}</{tags[node_type]}>"
        return inner

    body = render(content or {})
    return (
        "<!doctype html>\n<html><head><meta charset='utf-8'>"
        f"<title>{escape(title)}</title>"
        "<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;"
        "margin:3rem auto;padding:0 1rem}pre{background:#f4f4f5;padding:1rem;"
        "overflow-x:auto}table{border-collapse:collapse}td,th{border:1px solid "
        "#d4d4d8;padding:.4rem .6rem}</style></head><body>"
        f"<h1>{escape(title)}</h1>{body}</body></html>"
    )


# ----------------------------------------------------------------------
# Space export


@dataclass
class ExportedTree:
    archive: bytes
    file_count: int
    titles: list[str] = field(default_factory=list)


class DocumentExportService:
    def __init__(self, db: AsyncSession):
        self.db = db
        #: Set by the last `export_document` call. Non-fatal problems — a font
        #: that cannot draw a script, an image that would not fetch — that the
        #: caller should surface without failing the download.
        self.last_warnings: list[str] = []

    async def export_document(
        self, document: Document, fmt: str = "markdown"
    ) -> tuple[bytes, str, str]:
        """Returns `(bytes, filename, content_type)`."""
        if document.is_docx:
            raise ExportError(
                "A Word document is already a file; download it directly"
            )

        safe = re.sub(r"[^\w\- ]", "", document.title or "document").strip() or "document"

        if fmt == "markdown":
            body = f"# {document.title}\n\n{tiptap_to_markdown(document.content or {})}"
            return body.encode("utf-8"), f"{safe}.md", "text/markdown; charset=utf-8"
        if fmt == "html":
            body = tiptap_to_html(document.content or {}, document.title)
            return body.encode("utf-8"), f"{safe}.html", "text/html; charset=utf-8"
        if fmt == "pdf":
            from aexy.services.document_pdf import tiptap_to_pdf

            result = tiptap_to_pdf(
                document.content or {},
                document.title,
                owner_name=document.owner.name if document.owner else None,
                last_verified_at=document.last_verified_at,
            )
            # Warnings are attached to the service rather than raised: a font
            # that cannot draw a script produces a real PDF with blank glyphs,
            # and the caller has to be able to say so *and* still hand over the
            # file. Refusing would be worse for the person who just wants the
            # Latin half.
            self.last_warnings = result.warnings
            return result.pdf, f"{safe}.pdf", "application/pdf"

        if fmt == "json":
            body = json.dumps(
                {
                    "title": document.title,
                    "icon": document.icon,
                    "content": document.content,
                },
                indent=2,
            )
            return body.encode("utf-8"), f"{safe}.json", "application/json"

        raise ExportError(f"Unknown export format {fmt!r}")

    async def export_tree(
        self,
        workspace_id: str,
        *,
        access_clause: Any,
        space_id: str | None = None,
        root_id: str | None = None,
        fmt: str = "markdown",
    ) -> ExportedTree:
        """A zip mirroring the document hierarchy as folders.

        Access-filtered like every other listing: an export is a read of every
        document it contains, and an export endpoint that skipped the predicate
        would be the most efficient version of the original leak.
        """
        stmt = (
            select(Document)
            .where(Document.workspace_id == workspace_id)
            .where(Document.deleted_at.is_(None))
            .where(Document.is_template.is_(False))
            .where(access_clause)
        )
        if space_id:
            stmt = stmt.where(Document.space_id == space_id)

        documents = list((await self.db.execute(stmt)).scalars().all())
        by_id = {str(d.id): d for d in documents}

        if root_id:
            keep = {root_id}
            changed = True
            while changed:
                changed = False
                for doc_id, doc in by_id.items():
                    if doc_id not in keep and str(doc.parent_id or "") in keep:
                        keep.add(doc_id)
                        changed = True
            documents = [d for d in documents if str(d.id) in keep]

        extension = {
            "markdown": "md",
            "html": "html",
            "json": "json",
            "pdf": "pdf",
        }[fmt]

        buffer = io.BytesIO()
        titles: list[str] = []
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for document in documents:
                if document.is_docx:
                    # Its body is a file in object storage, not TipTap JSON.
                    # Included as a marker rather than silently missing, so the
                    # export is honest about what it does not contain.
                    archive.writestr(
                        f"{self._path(document, by_id)}.README.txt",
                        "This page is a Word document; download it from the app.",
                    )
                    continue
                payload, _, _ = await self.export_document(document, fmt)
                archive.writestr(f"{self._path(document, by_id)}.{extension}", payload)
                titles.append(document.title)

        return ExportedTree(
            archive=buffer.getvalue(), file_count=len(titles), titles=titles
        )

    def _path(self, document: Document, by_id: dict[str, Document]) -> str:
        """Folder path mirroring the ancestry.

        Bounded, and the bound is not paranoia: `move_document` shipped without
        a descendant check, so parent cycles exist in deployed databases and an
        unbounded ancestry walk is exactly what hangs on one.
        """
        parts: list[str] = []
        seen: set[str] = set()
        current: Document | None = document
        depth = 0

        while current is not None and depth < 50:
            key = str(current.id)
            if key in seen:
                break
            seen.add(key)
            parts.append(
                re.sub(r"[^\w\- ]", "", current.title or "untitled").strip()
                or "untitled"
            )
            current = by_id.get(str(current.parent_id or ""))
            depth += 1

        return "/".join(reversed(parts))
