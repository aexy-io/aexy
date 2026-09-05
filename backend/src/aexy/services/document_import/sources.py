"""Recognising an archive, and normalising what each product exports.

Three jobs, one per function group:

* **detect** — what produced this zip, so the operator does not have to say.
* **normalise** — turn vendor markup into ordinary HTML before the shared
  parser runs. Adding a fourth source is a normaliser, not a parser.
* **identify** — pull the source page id out of a filename or attribute, which
  is what makes the two-pass link rewriting possible.

The identifiers matter more than they look. Notion names files
`Page Title abc123def456….md` with the page id appended, and internal links
point at exactly those paths; Confluence uses numeric page ids in
`ri:content-entity-ref`. A migrated wiki whose internal links 404 is worse than
no migration, because people check three pages, find two broken, and stop
trusting the whole thing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class Source(str, Enum):
    NOTION = "notion"
    CONFLUENCE = "confluence"
    MARKDOWN = "markdown"


#: Notion appends a 32-hex page id to every exported filename, usually after a
#: space. `Runbook abc123…def.md`, and its links point at that literal path.
_NOTION_ID = re.compile(r"[ _-]([0-9a-f]{32})(?:\.|$)")

#: Confluence's HTML export names each page file by its numeric id. Anchored so
#: the *whole* stem must be digits — that is what distinguishes an id from a
#: page someone titled "2024". Three digits rather than five: a small instance
#: really does have three-digit page ids, and missing them means every internal
#: link in that export stays broken.
_CONFLUENCE_ID = re.compile(r"(?:^|/)(\d{3,})\.html?$", re.IGNORECASE)


@dataclass(slots=True)
class PageRef:
    """A page inside an archive, before it becomes a document."""

    path: str
    title: str
    source_id: str | None
    is_html: bool


# ----------------------------------------------------------------------
# Detection


def detect_source(names: list[str]) -> Source:
    """Guess the exporter from the archive's file list.

    Guessed rather than asked because the person doing a migration has an
    export and a login, not necessarily knowledge of which of two HTML dialects
    it is. Falls back to `MARKDOWN`, which is the format with the fewest
    assumptions.
    """
    lowered = [n.lower() for n in names]

    if any(_NOTION_ID.search(n) for n in lowered):
        return Source.NOTION
    if any("index.html" in n for n in lowered) and any(
        _CONFLUENCE_ID.search(n) for n in lowered
    ):
        return Source.CONFLUENCE
    if any(n.endswith((".html", ".htm")) for n in lowered):
        # HTML with no vendor fingerprint. Treated as Confluence-shaped because
        # its normaliser is a no-op on plain HTML, whereas Notion's rewrites
        # callout divs it would not find.
        return Source.CONFLUENCE
    return Source.MARKDOWN


def page_id_for(path: str, source: Source) -> str | None:
    """The exporter's own id for this page, if the filename carries one."""
    if source is Source.NOTION:
        match = _NOTION_ID.search(path.lower())
        return match.group(1) if match else None
    if source is Source.CONFLUENCE:
        match = _CONFLUENCE_ID.search(path)
        return match.group(1) if match else None
    return None


def title_for(path: str, source: Source, html: str | None = None) -> str:
    """A human title for the page.

    Notion's filename *is* the title with an id glued on, so stripping the id
    gives the right answer. Confluence's filename is the id, so the title has
    to come out of the document.
    """
    import os

    stem = os.path.splitext(os.path.basename(path))[0]

    if source is Source.NOTION:
        return _NOTION_ID.sub("", f"{stem}.").rstrip(". ").strip() or stem

    if html:
        for pattern in (
            r"<title[^>]*>(.*?)</title>",
            r'<h1[^>]*id=["\']title-heading["\'][^>]*>(.*?)</h1>',
            r"<h1[^>]*>(.*?)</h1>",
        ):
            match = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
            if match:
                from html import unescape

                title = unescape(re.sub(r"<[^>]+>", "", match.group(1))).strip()
                if title:
                    return title

    return stem


# ----------------------------------------------------------------------
# Normalisation


def normalise(html: str, source: Source) -> str:
    if source is Source.NOTION:
        return _normalise_notion(html)
    if source is Source.CONFLUENCE:
        return _normalise_confluence(html)
    return html


def _normalise_notion(html: str) -> str:
    """Notion's export markup into ordinary HTML.

    Its callouts and toggles are `div`s with recognisable classes, which the
    shared parser would otherwise flatten into bare paragraphs — losing the
    fact that the text was set apart, which for a callout is most of its
    meaning.
    """
    # A callout is a bordered aside; a blockquote is the closest thing the
    # editor has, and reads correctly.
    html = re.sub(
        r'<div[^>]*class="[^"]*\bcallout\b[^"]*"[^>]*>(.*?)</div>',
        r"<blockquote>\1</blockquote>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # A toggle is a `details`/`summary` pair. The summary becomes a heading and
    # the body follows it, because a collapsed section whose title vanished is
    # a paragraph that starts mid-thought.
    html = re.sub(
        r"<summary[^>]*>(.*?)</summary>",
        r"<h3>\1</h3>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    html = re.sub(r"</?details[^>]*>", "", html, flags=re.IGNORECASE)
    # Notion wraps the page in a header block that repeats the title; the
    # importer sets the title itself, so leaving it produces every page with
    # its own name as the first line.
    html = re.sub(
        r'<header[^>]*>.*?</header>', "", html, flags=re.IGNORECASE | re.DOTALL
    )
    return html


def _normalise_confluence(html: str) -> str:
    """Confluence storage-format macros into ordinary HTML.

    `<ac:structured-macro ac:name="code">` and friends are the whole reason
    Confluence's HTML beats its Markdown, and also the reason it cannot be fed
    to a parser unmodified.
    """
    # Code macro: the body is in a CDATA-wrapped plain-text-body.
    def code_macro(match: re.Match) -> str:
        block = match.group(0)
        language = ""
        language_match = re.search(
            r'<ac:parameter\s+ac:name="language">(.*?)</ac:parameter>',
            block,
            re.IGNORECASE | re.DOTALL,
        )
        if language_match:
            language = language_match.group(1).strip()

        body_match = re.search(
            r"<ac:plain-text-body>(.*?)</ac:plain-text-body>",
            block,
            re.IGNORECASE | re.DOTALL,
        )
        body = body_match.group(1) if body_match else ""
        body = re.sub(r"^\s*<!\[CDATA\[", "", body)
        body = re.sub(r"\]\]>\s*$", "", body)

        klass = f' class="language-{language}"' if language else ""
        return f"<pre><code{klass}>{body}</code></pre>"

    html = re.sub(
        r'<ac:structured-macro[^>]*ac:name="code".*?</ac:structured-macro>',
        code_macro,
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Info / note / warning / tip panels read as asides.
    html = re.sub(
        r'<ac:structured-macro[^>]*ac:name="(?:info|note|warning|tip|panel)".*?'
        r"<ac:rich-text-body>(.*?)</ac:rich-text-body>.*?</ac:structured-macro>",
        r"<blockquote>\1</blockquote>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Task lists become checkbox items the shared parser already understands.
    html = re.sub(
        r"<ac:task-status>complete</ac:task-status>",
        '<input type="checkbox" checked>',
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(
        r"<ac:task-status>incomplete</ac:task-status>",
        '<input type="checkbox">',
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(r"</?ac:task-list>", "<ul>", html, count=1, flags=re.IGNORECASE)
    html = re.sub(r"<ac:task>", "<li>", html, flags=re.IGNORECASE)
    html = re.sub(r"</ac:task>", "</li>", html, flags=re.IGNORECASE)
    html = re.sub(r"</?ac:task-id>.*?(?=<)", "", html, flags=re.IGNORECASE)
    html = re.sub(r"</?ac:task-body>", "", html, flags=re.IGNORECASE)

    # Internal page links: turn the macro into an anchor the rewriter can see.
    html = re.sub(
        r'<ac:link[^>]*>.*?<ri:page[^>]*ri:content-title="([^"]*)"[^>]*/?>.*?</ac:link>',
        r'<a href="confluence-page:\1">\1</a>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Attachments referenced by filename.
    html = re.sub(
        r'<ac:image[^>]*>.*?<ri:attachment[^>]*ri:filename="([^"]*)"[^>]*/?>.*?</ac:image>',
        r'<img src="attachments/\1" alt="\1">',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Anything left is a macro this importer does not know. Its rich-text body
    # is kept and the wrapper dropped — losing a panel style is recoverable,
    # losing the paragraphs inside it is not.
    html = re.sub(
        r"<ac:structured-macro[^>]*>(.*?)</ac:structured-macro>",
        r"\1",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    html = re.sub(r"</?ac:[^>]*>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"</?ri:[^>]*>", "", html, flags=re.IGNORECASE)

    return html
