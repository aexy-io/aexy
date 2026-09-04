"""TipTap document to PDF.

Two constraints shape this module, and neither is obvious from the outside.

**Fonts.** reportlab's built-in faces are Latin-1, and the only TTFs it bundles
are Vera — 283 glyphs, no Devanagari. The product ships Hindi
(`frontend/messages/hi/`), so a Hindi document exported with the default font
renders as empty boxes, silently and for exactly the users that locale was added
for. The registry below loads any TTF an operator provides, and — more
importantly — **checks glyph coverage and reports what the font cannot draw**,
so an unrenderable document produces a visible warning instead of a page of
rectangles.

**Images.** A document's images are URLs, some of them pasted by users. Fetching
them server-side is a server-side request forgery primitive unless it goes
through `core.url_validation.validate_url_for_fetch`, which this codebase
already has. An image that fails validation, fetch, or decode renders as its alt
text rather than aborting the export — losing a picture is recoverable, losing
the document is not.

The reportlab idiom (SimpleDocTemplate / Paragraph / Table) matches
`services/export_service.py`, so the two PDFs look like they came from the same
product. That module is not reused directly: it renders analytics widgets to a
local directory, and this one renders prose to bytes.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import escape
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

#: Where an operator drops TTFs to widen script coverage. A directory rather
#: than a fixed filename so adding Devanagari does not mean replacing Latin.
FONT_DIR_ENV = "AEXY_PDF_FONT_DIR"

#: Registered family name. reportlab needs the four faces registered together
#: for `<b>`/`<i>` markup to resolve.
FAMILY = "AexyDoc"

_MAX_IMAGE_BYTES = 10 * 1024 * 1024
_IMAGE_TIMEOUT_SECONDS = 5

#: Past this a table stops being readable in a fixed-width page and is better
#: served by the source document.
_MAX_TABLE_COLUMNS = 12


@dataclass
class PdfResult:
    pdf: bytes
    warnings: list[str] = field(default_factory=list)


# ----------------------------------------------------------------------
# Fonts


@dataclass
class _Fonts:
    regular: str
    bold: str
    italic: str
    bold_italic: str
    mono: str = "Courier"
    #: None when the active face is a built-in Type1, whose coverage is
    #: Latin-1 and which exposes no cmap to inspect.
    cmap: set[int] | None = None


_fonts: _Fonts | None = None


def _register_fonts() -> _Fonts:
    """Register the best faces available, preferring operator-provided TTFs.

    Falls back to Helvetica rather than failing: a Latin document must export
    on a machine with no extra fonts installed, which is every default
    deployment.
    """
    global _fonts
    if _fonts is not None:
        return _fonts

    font_dir = os.environ.get(FONT_DIR_ENV)
    if font_dir and os.path.isdir(font_dir):
        try:
            faces = _load_family(font_dir)
            if faces is not None:
                _fonts = faces
                return _fonts
        except Exception:
            logger.warning(
                "could not register fonts from %s; falling back", font_dir,
                exc_info=True,
            )

    _fonts = _Fonts(
        regular="Helvetica",
        bold="Helvetica-Bold",
        italic="Helvetica-Oblique",
        bold_italic="Helvetica-BoldOblique",
    )
    return _fonts


def _load_family(font_dir: str) -> _Fonts | None:
    """Find a regular/bold/italic set in `font_dir` and register it."""
    by_name = {f.lower(): f for f in os.listdir(font_dir) if f.lower().endswith(".ttf")}
    if not by_name:
        return None

    def find(*needles: str) -> str | None:
        for lowered, actual in by_name.items():
            if all(n in lowered for n in needles):
                return os.path.join(font_dir, actual)
        return None

    regular = (
        find("regular")
        or find("-r")
        or next(
            (
                os.path.join(font_dir, f)
                for lowered, f in by_name.items()
                if not any(x in lowered for x in ("bold", "italic", "oblique"))
            ),
            None,
        )
    )
    if regular is None:
        return None

    bold = find("bold") or regular
    italic = find("italic") or find("oblique") or regular
    bold_italic = find("bold", "italic") or bold

    names = {}
    for suffix, path in (
        ("", regular),
        ("-Bold", bold),
        ("-Italic", italic),
        ("-BoldItalic", bold_italic),
    ):
        name = f"{FAMILY}{suffix}"
        pdfmetrics.registerFont(TTFont(name, path))
        names[suffix] = name

    pdfmetrics.registerFontFamily(
        FAMILY,
        normal=names[""],
        bold=names["-Bold"],
        italic=names["-Italic"],
        boldItalic=names["-BoldItalic"],
    )

    cmap = set(pdfmetrics.getFont(names[""]).face.charToGlyph.keys())
    logger.info("registered PDF font family from %s (%d glyphs)", font_dir, len(cmap))

    return _Fonts(
        regular=names[""],
        bold=names["-Bold"],
        italic=names["-Italic"],
        bold_italic=names["-BoldItalic"],
        cmap=cmap,
    )


def _unrenderable(text: str, fonts: _Fonts) -> set[str]:
    """Characters the active face cannot draw.

    This is the check that turns a page of boxes into a warning. Without it the
    Hindi case fails silently, which is the worst way for it to fail: the export
    succeeds, the file opens, and the content is gone.
    """
    missing: set[str] = set()
    for char in text:
        if char.isspace():
            continue
        if fonts.cmap is not None:
            if ord(char) not in fonts.cmap:
                missing.add(char)
        else:
            try:
                char.encode("latin-1")
            except UnicodeEncodeError:
                missing.add(char)
    return missing


# ----------------------------------------------------------------------
# Inline rendering


def _inline(nodes: list[dict[str, Any]] | None) -> str:
    """Inline nodes as reportlab's mini-markup.

    Escaped first: a document containing `<b>` as literal text must not become
    bold, and reportlab's parser raises on malformed markup, which would fail
    the export over a stray angle bracket in someone's prose.
    """
    out: list[str] = []
    for node in nodes or []:
        if node.get("type") == "hardBreak":
            out.append("<br/>")
            continue
        if node.get("type") != "text":
            continue

        text = escape(node.get("text", ""))
        href: str | None = None

        for mark in node.get("marks") or []:
            kind = mark.get("type")
            if kind == "bold":
                text = f"<b>{text}</b>"
            elif kind == "italic":
                text = f"<i>{text}</i>"
            elif kind == "strike":
                text = f"<strike>{text}</strike>"
            elif kind == "underline":
                text = f"<u>{text}</u>"
            elif kind == "code":
                text = f'<font face="Courier">{text}</font>'
            elif kind == "link":
                href = (mark.get("attrs") or {}).get("href")

        if href:
            text = f'<link href="{escape(href, quote=True)}" color="blue">{text}</link>'

        out.append(text)

    return "".join(out)


def _plain(node: dict[str, Any]) -> str:
    parts: list[str] = []

    def walk(n: dict[str, Any]) -> None:
        if n.get("type") == "text":
            parts.append(n.get("text", ""))
        for child in n.get("content") or []:
            walk(child)

    walk(node)
    return "".join(parts)


# ----------------------------------------------------------------------
# Document rendering


class _Renderer:
    def __init__(self, title: str, fonts: _Fonts):
        self.fonts = fonts
        self.title = title
        self.warnings: list[str] = []
        #: Every character the active face cannot draw, accumulated across the
        #: whole document so the reader gets one actionable warning rather than
        #: one per paragraph that happened to contain a different letter.
        self.missing_chars: set[str] = set()
        self.headings: list[tuple[int, str]] = []
        self.styles = self._build_styles()

    def _build_styles(self) -> dict[str, ParagraphStyle]:
        base = getSampleStyleSheet()
        f = self.fonts

        body = ParagraphStyle(
            "DocBody",
            parent=base["Normal"],
            fontName=f.regular,
            fontSize=10.5,
            leading=15,
            spaceAfter=8,
            alignment=TA_LEFT,
        )
        return {
            "body": body,
            "title": ParagraphStyle(
                "DocTitle", parent=body, fontName=f.bold, fontSize=24, leading=30,
                spaceAfter=6,
            ),
            "subtitle": ParagraphStyle(
                "DocSubtitle", parent=body, fontSize=10, textColor=colors.HexColor("#6b7280"),
            ),
            "h1": ParagraphStyle("DocH1", parent=body, fontName=f.bold, fontSize=18, leading=24, spaceBefore=16, spaceAfter=8),
            "h2": ParagraphStyle("DocH2", parent=body, fontName=f.bold, fontSize=15, leading=20, spaceBefore=14, spaceAfter=6),
            "h3": ParagraphStyle("DocH3", parent=body, fontName=f.bold, fontSize=12.5, leading=18, spaceBefore=12, spaceAfter=5),
            "quote": ParagraphStyle(
                "DocQuote", parent=body, leftIndent=12, fontName=f.italic,
                textColor=colors.HexColor("#4b5563"), borderPadding=4,
            ),
            "code": ParagraphStyle(
                "DocCode", parent=body, fontName=f.mono, fontSize=9, leading=12,
                backColor=colors.HexColor("#f4f4f5"), borderPadding=6, spaceAfter=10,
            ),
            "cell": ParagraphStyle("DocCell", parent=body, fontSize=9.5, leading=13, spaceAfter=0),
            "toc": ParagraphStyle("DocToc", parent=body, spaceAfter=3),
        }

    # -- coverage ---------------------------------------------------

    def _check(self, text: str) -> None:
        self.missing_chars |= _unrenderable(text, self.fonts)

    def _para(self, markup: str, style: str = "body") -> Paragraph:
        return Paragraph(markup or "&nbsp;", self.styles[style])

    # -- nodes ------------------------------------------------------

    def render(self, content: dict[str, Any]) -> list[Any]:
        flow: list[Any] = []
        for node in (content or {}).get("content") or []:
            flow.extend(self._node(node))
        return flow

    def _node(self, node: dict[str, Any], depth: int = 0) -> list[Any]:
        kind = node.get("type")
        handler = getattr(self, f"_render_{kind}", None)
        if handler is None:
            # Unknown block: keep its words. An export that silently drops
            # content is worse than one that loses formatting.
            text = _plain(node)
            if text.strip():
                self._check(text)
                return [self._para(escape(text))]
            return []
        return handler(node, depth)

    def _render_paragraph(self, node, depth) -> list[Any]:
        text = _plain(node)
        if not text.strip():
            return [Spacer(1, 6)]
        self._check(text)
        style = "body"
        para = Paragraph(_inline(node.get("content")), self.styles[style])
        if depth:
            para.style = ParagraphStyle(
                f"Indent{depth}", parent=self.styles[style], leftIndent=14 * depth
            )
        return [para]

    def _render_heading(self, node, depth) -> list[Any]:
        level = int((node.get("attrs") or {}).get("level", 1))
        text = _plain(node)
        self._check(text)
        self.headings.append((min(level, 3), text))
        style = {1: "h1", 2: "h2"}.get(level, "h3")
        return [self._para(_inline(node.get("content")), style)]

    def _render_bulletList(self, node, depth) -> list[Any]:
        return self._list(node, depth, ordered=False)

    def _render_orderedList(self, node, depth) -> list[Any]:
        return self._list(node, depth, ordered=True)

    def _render_taskList(self, node, depth) -> list[Any]:
        flow: list[Any] = []
        for item in node.get("content") or []:
            checked = (item.get("attrs") or {}).get("checked")
            flow.extend(self._item(item, depth, "☑" if checked else "☐"))
        return flow

    def _list(self, node, depth, *, ordered: bool) -> list[Any]:
        flow: list[Any] = []
        for index, item in enumerate(node.get("content") or [], start=1):
            marker = f"{index}." if ordered else "•"
            flow.extend(self._item(item, depth, marker))
        return flow

    def _item(self, item, depth, marker: str) -> list[Any]:
        flow: list[Any] = []
        children = item.get("content") or []
        first = children[0] if children else {}

        text = _plain(first)
        self._check(text)
        # The marker glyph itself has to be drawable — ☐ is outside Latin-1, so
        # a built-in face falls back to a hyphen rather than a black box.
        safe_marker = marker if not _unrenderable(marker, self.fonts) else "-"

        style = ParagraphStyle(
            f"Item{depth}",
            parent=self.styles["body"],
            leftIndent=14 * (depth + 1),
            bulletIndent=14 * depth,
            spaceAfter=3,
        )
        flow.append(
            Paragraph(
                f"{escape(safe_marker)} {_inline(first.get('content'))}", style
            )
        )

        for child in children[1:]:
            flow.extend(self._node(child, depth + 1))
        return flow

    def _render_blockquote(self, node, depth) -> list[Any]:
        flow: list[Any] = []
        for child in node.get("content") or []:
            text = _plain(child)
            self._check(text)
            flow.append(self._para(_inline(child.get("content")), "quote"))
        return flow

    def _render_codeBlock(self, node, depth) -> list[Any]:
        text = _plain(node)
        # Not checked against the body font: code renders in Courier, and a
        # warning about the body face would point at the wrong thing.
        lines = escape(text).split("\n")
        return [
            KeepTogether(
                [Paragraph("<br/>".join(lines) or "&nbsp;", self.styles["code"])]
            )
        ]

    def _render_horizontalRule(self, node, depth) -> list[Any]:
        rule = Table([[""]], colWidths=["100%"], rowHeights=[1])
        rule.setStyle(
            TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#d4d4d8"))])
        )
        return [Spacer(1, 8), rule, Spacer(1, 8)]

    def _render_table(self, node, depth) -> list[Any]:
        rows = node.get("content") or []
        if not rows:
            return []

        data: list[list[Paragraph]] = []
        header_row = False
        for row_index, row in enumerate(rows):
            cells = row.get("content") or []
            if row_index == 0:
                header_row = any(c.get("type") == "tableHeader" for c in cells)
            rendered = []
            for cell in cells:
                text = _plain(cell)
                self._check(text)
                markup = "<br/>".join(
                    _inline(block.get("content")) for block in cell.get("content") or []
                )
                rendered.append(Paragraph(markup or "&nbsp;", self.styles["cell"]))
            data.append(rendered)

        width = max(len(r) for r in data)
        if width > _MAX_TABLE_COLUMNS:
            self.warnings.append(
                f"a table with {width} columns was rendered narrow; wide tables "
                "read better in the source document"
            )
        for row in data:
            row.extend([Paragraph("&nbsp;", self.styles["cell"])] * (width - len(row)))

        table = Table(data, colWidths=[f"{100 / width}%"] * width, repeatRows=1 if header_row else 0)
        style = [
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d4d4d8")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if header_row:
            style.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4f4f5")))
        table.setStyle(TableStyle(style))
        return [Spacer(1, 6), table, Spacer(1, 10)]

    def _render_image(self, node, depth) -> list[Any]:
        attrs = node.get("attrs") or {}
        src = attrs.get("src") or ""
        alt = attrs.get("alt") or "image"

        data = _fetch_image(src)
        if data is None:
            self.warnings.append(f"image could not be embedded: {src[:120]}")
            return [self._para(f"<i>[{escape(alt)}]</i>")]

        try:
            image = Image(io.BytesIO(data))
            max_width = 160 * mm
            if image.drawWidth > max_width:
                scale = max_width / image.drawWidth
                image.drawWidth *= scale
                image.drawHeight *= scale
            return [Spacer(1, 6), image, Spacer(1, 8)]
        except Exception:
            self.warnings.append(f"image could not be decoded: {src[:120]}")
            return [self._para(f"<i>[{escape(alt)}]</i>")]


def _fetch_image(src: str) -> bytes | None:
    """Fetch an image for embedding, or None.

    Through `validate_url_for_fetch`, because "download every URL in this
    document" is otherwise a server-side request forgery primitive with a
    friendly name — and a document is user-supplied input.
    """
    if not src or src.startswith("data:"):
        return _decode_data_uri(src)

    try:
        import httpx

        from aexy.core.url_validation import validate_url_for_fetch

        safe = validate_url_for_fetch(src)
        with httpx.Client(timeout=_IMAGE_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = client.get(safe)
            response.raise_for_status()
            if len(response.content) > _MAX_IMAGE_BYTES:
                return None
            return response.content
    except Exception:
        logger.debug("could not fetch image %s", src[:120], exc_info=True)
        return None


def _decode_data_uri(src: str) -> bytes | None:
    import base64

    try:
        header, _, payload = src.partition(",")
        if "base64" not in header:
            return None
        raw = base64.b64decode(payload)
        return raw if len(raw) <= _MAX_IMAGE_BYTES else None
    except Exception:
        return None


# ----------------------------------------------------------------------
# Page furniture


def _page_furniture(title: str, fonts: _Fonts):
    """Page number and provenance footer.

    A printed copy leaves the product, so it carries where it came from and
    when — otherwise a page found on a desk in six months has no way to say
    whether it is current.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont(fonts.regular, 8)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        canvas.drawString(20 * mm, 12 * mm, f"{title} · exported {stamp}")
        canvas.drawRightString(
            doc.pagesize[0] - 20 * mm, 12 * mm, f"Page {canvas.getPageNumber()}"
        )
        canvas.restoreState()

    return draw


# ----------------------------------------------------------------------
# Entry point


def tiptap_to_pdf(
    content: dict[str, Any],
    title: str,
    *,
    owner_name: str | None = None,
    last_verified_at: datetime | None = None,
    include_toc: bool = True,
) -> PdfResult:
    """Render a TipTap document as a PDF."""
    fonts = _register_fonts()
    renderer = _Renderer(title, fonts)

    body = renderer.render(content)
    renderer._check(title)

    flow: list[Any] = [
        renderer._para(escape(title), "title"),
    ]

    provenance: list[str] = []
    if owner_name:
        provenance.append(f"Owner: {escape(owner_name)}")
    if last_verified_at:
        provenance.append(
            f"Last verified {last_verified_at.strftime('%-d %B %Y')}"
        )
    if provenance:
        flow.append(renderer._para(" · ".join(provenance), "subtitle"))
    flow.append(Spacer(1, 14))

    # A contents page only once there is enough document to get lost in.
    if include_toc and len(renderer.headings) >= 4:
        flow.append(renderer._para("<b>Contents</b>", "h2"))
        for level, text in renderer.headings:
            flow.append(
                Paragraph(
                    f"{'&nbsp;' * (4 * (level - 1))}{escape(text)}",
                    renderer.styles["toc"],
                )
            )
        flow.append(PageBreak())

    flow.extend(body)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title=title,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
    )
    furniture = _page_furniture(title, fonts)
    doc.build(flow, onFirstPage=furniture, onLaterPages=furniture)

    warnings = list(renderer.warnings)
    if renderer.missing_chars:
        sample = "".join(sorted(renderer.missing_chars)[:12])
        warnings.insert(
            0,
            f"{len(renderer.missing_chars)} character(s) in this document cannot "
            f"be drawn by the export font and will appear blank (for example: "
            f"{sample}). Set {FONT_DIR_ENV} to a directory containing a font "
            f"that covers this script.",
        )

    return PdfResult(pdf=buffer.getvalue(), warnings=warnings)
