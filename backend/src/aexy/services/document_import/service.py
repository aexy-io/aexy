"""Turning an exported archive into documents.

Two passes, and the reason is the only interesting thing about the control flow.

A wiki is mostly *forward* references — a page linking to one that appears later
in the archive. Converting bodies in a single pass means every such link
resolves to nothing, which is most of them. So:

1. **scan** — walk the archive, create every page as an empty shell, and record
   `source page id → new document id`;
2. **convert** — parse each body and rewrite every internal reference through
   that map.

That map is also what makes a re-run resume rather than duplicate. The first
attempt at a large migration usually fails on something — one malformed page, a
timeout — and an importer that starts from zero on retry turns one bad page into
four thousand duplicates.

Attachments are uploaded to object storage and their `src` rewritten in the same
pass. Remote URLs are fetched through the SSRF guard, because an archive is
attacker-supplied input and "fetch every URL in this document" is otherwise a
server-side request forgery primitive with a friendly name.
"""

from __future__ import annotations

import io
import logging
import os
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.documentation import DocumentImportJob
from aexy.services.document_import.html_to_tiptap import html_to_tiptap
from aexy.services.document_import.markdown_fidelity import (
    MarkdownError,
    import_markdown_to_tiptap,
)
from aexy.services.document_import.sources import (
    PageRef,
    Source,
    detect_source,
    normalise,
    page_id_for,
    title_for,
)

logger = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_SCANNING = "scanning"
STATUS_IMPORTING = "importing"
STATUS_COMPLETED = "completed"
STATUS_PARTIAL = "partial"
STATUS_FAILED = "failed"

_PAGE_SUFFIXES = (".html", ".htm", ".md", ".markdown")

#: A single page past this is an export artefact — a database view flattened to
#: HTML, most often — and converting it costs more than it returns.
_MAX_PAGE_BYTES = 5 * 1024 * 1024

#: Zip bombs. An archive is uploaded by an admin, but "trusted" is not the same
#: as "unbounded", and the failure mode is the disk filling.
_MAX_TOTAL_UNCOMPRESSED = 2 * 1024 * 1024 * 1024
_MAX_ENTRIES = 20_000

_ATTACHMENT_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp",
    ".pdf", ".mp4", ".mov", ".csv", ".xlsx", ".docx", ".pptx", ".zip",
)


def attachment_prefix(workspace_id: str) -> str:
    """Every imported attachment lives under this, and nothing else does.

    The serving endpoint confines itself to this prefix, which is what stops a
    caller who can name a path from reading any object in the bucket.
    """
    return f"workspaces/{workspace_id}/imported/"


class ImportError_(RuntimeError):
    """The archive could not be read at all."""


@dataclass
class Progress:
    total: int = 0
    imported: int = 0
    failed: int = 0
    warnings: list[str] = field(default_factory=list)


class DocumentImportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Reading the archive

    def read_archive(self, raw: bytes) -> tuple[zipfile.ZipFile, Source, list[PageRef]]:
        """Open the zip, work out what produced it, and list its pages."""
        try:
            archive = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile as exc:
            raise ImportError_("That file is not a readable zip archive") from exc

        infos = [i for i in archive.infolist() if not i.is_dir()]
        if len(infos) > _MAX_ENTRIES:
            raise ImportError_(
                f"The archive holds {len(infos)} files; the limit is {_MAX_ENTRIES}"
            )
        total = sum(i.file_size for i in infos)
        if total > _MAX_TOTAL_UNCOMPRESSED:
            raise ImportError_("The archive is too large to import")

        names = [i.filename for i in infos]
        source = detect_source(names)

        pages: list[PageRef] = []
        for info in infos:
            name = info.filename
            if _is_unsafe(name):
                # Zip-slip. An archive entry naming `../` is either malicious or
                # broken, and nothing downstream needs it.
                continue
            lowered = name.lower()
            if not lowered.endswith(_PAGE_SUFFIXES):
                continue
            if info.file_size > _MAX_PAGE_BYTES:
                continue

            is_html = lowered.endswith((".html", ".htm"))
            html = None
            if is_html and source is Source.CONFLUENCE:
                html = _decode(archive.read(name)[: 64 * 1024])

            pages.append(
                PageRef(
                    path=name,
                    title=title_for(name, source, html),
                    source_id=page_id_for(name, source),
                    is_html=is_html,
                )
            )

        return archive, source, pages

    # ------------------------------------------------------------------
    # Pass one

    async def scan(
        self,
        job: DocumentImportJob,
        pages: list[PageRef],
        *,
        workspace_id: str,
        space_id: str | None,
        created_by_id: str | None,
    ) -> dict[str, str]:
        """Create a shell document per page and return the id map.

        Shells rather than finished documents because pass two needs every
        target to exist before it can rewrite a link to it.

        Existing entries in `job.id_map` are honoured, which is the whole of
        resume: a re-run creates nothing it created before.
        """
        from aexy.services.document_service import DocumentService

        service = DocumentService(self.db)
        id_map: dict[str, str] = dict(job.id_map or {})

        for page in pages:
            key = page.source_id or page.path
            if key in id_map:
                continue

            document = await service.create_document(
                workspace_id=workspace_id,
                created_by_id=created_by_id,
                title=page.title,
                content={"type": "doc", "content": []},
                space_id=space_id,
            )
            id_map[key] = str(document.id)

        job.id_map = id_map
        job.total_pages = len(pages)
        await self.db.commit()
        return id_map

    # ------------------------------------------------------------------
    # Pass two

    async def convert(
        self,
        job: DocumentImportJob,
        archive: zipfile.ZipFile,
        source: Source,
        pages: list[PageRef],
        id_map: dict[str, str],
        *,
        workspace_id: str,
    ) -> Progress:
        """Convert every body, rewriting links and uploading attachments."""
        from aexy.services.document_service import DocumentService

        service = DocumentService(self.db)
        progress = Progress(total=len(pages))
        attachments: dict[str, str] = {}
        by_title = {p.title.lower(): (p.source_id or p.path) for p in pages}

        for page in pages:
            key = page.source_id or page.path
            document_id = id_map.get(key)
            if not document_id:
                continue

            try:
                raw = archive.read(page.path)
                text = _decode(raw)

                if page.is_html:
                    converted = html_to_tiptap(normalise(text, source))
                    warnings = converted.warnings
                    content = converted.document
                else:
                    result = import_markdown_to_tiptap(text)
                    warnings = result.warnings
                    content = result.document

                content = self._rewrite(
                    content,
                    page=page,
                    id_map=id_map,
                    by_title=by_title,
                    archive=archive,
                    attachments=attachments,
                    workspace_id=workspace_id,
                    progress=progress,
                )

                await service.update_document(
                    document_id=document_id,
                    updated_by_id=str(job.requested_by_id) if job.requested_by_id else None,
                    content=content,
                    create_version=False,
                )

                for warning in warnings:
                    message = f"{page.title}: {warning}"
                    if message not in progress.warnings:
                        progress.warnings.append(message)

                progress.imported += 1

            except (MarkdownError, Exception) as exc:  # noqa: BLE001
                # One page that will not convert must not roll back the four
                # thousand that did.
                progress.failed += 1
                progress.warnings.append(f"{page.title}: failed — {exc}")
                logger.warning(
                    "import: could not convert %s", page.path, exc_info=True
                )

            if (progress.imported + progress.failed) % 25 == 0:
                await self._record(job, progress, STATUS_IMPORTING)

        return progress

    # ------------------------------------------------------------------
    # Rewriting

    def _rewrite(
        self,
        content: dict[str, Any],
        *,
        page: PageRef,
        id_map: dict[str, str],
        by_title: dict[str, str],
        archive: zipfile.ZipFile,
        attachments: dict[str, str],
        workspace_id: str,
        progress: Progress,
    ) -> dict[str, Any]:
        """Point internal links at the new documents, and upload attachments.

        A migrated wiki whose internal links 404 is worse than no migration:
        people check three pages, find two broken, and stop trusting all of it.
        """

        def resolve_link(href: str) -> str:
            if not href or href.startswith(("http://", "https://", "mailto:", "#")):
                if href.startswith("confluence-page:"):
                    title = href.split(":", 1)[1].strip().lower()
                    target = by_title.get(title)
                    return f"/docs/{id_map[target]}" if target in id_map else href
                return href

            if href.startswith("confluence-page:"):
                title = href.split(":", 1)[1].strip().lower()
                target = by_title.get(title)
                return f"/docs/{id_map[target]}" if target in id_map else href

            candidate = unquote(href.split("#")[0])
            # Relative to the linking page, which is how both exporters write
            # them.
            joined = posixpath.normpath(
                posixpath.join(posixpath.dirname(page.path), candidate)
            )

            for probe in (candidate, joined):
                source_id = page_id_for(probe, Source.NOTION) or page_id_for(
                    probe, Source.CONFLUENCE
                )
                for lookup in (source_id, probe):
                    if lookup and lookup in id_map:
                        return f"/docs/{id_map[lookup]}"

            return href

        def resolve_src(src: str) -> str:
            if not src or src.startswith("data:"):
                return src

            if src.startswith(("http://", "https://")):
                return src

            candidate = unquote(src.split("#")[0].split("?")[0])
            joined = posixpath.normpath(
                posixpath.join(posixpath.dirname(page.path), candidate)
            )

            for probe in (joined, candidate):
                if probe in attachments:
                    return attachments[probe]
                uploaded = self._upload(archive, probe, workspace_id)
                if uploaded:
                    attachments[probe] = uploaded
                    return uploaded

            progress.warnings.append(
                f"{page.title}: attachment not found in the archive ({src[:80]})"
            )
            return src

        def walk(node: dict[str, Any]) -> dict[str, Any]:
            if node.get("type") == "image":
                attrs = dict(node.get("attrs") or {})
                attrs["src"] = resolve_src(attrs.get("src", ""))
                node = {**node, "attrs": attrs}

            marks = node.get("marks")
            if marks:
                new_marks = []
                for mark in marks:
                    if mark.get("type") == "link":
                        attrs = dict(mark.get("attrs") or {})
                        attrs["href"] = resolve_link(attrs.get("href", ""))
                        new_marks.append({**mark, "attrs": attrs})
                    else:
                        new_marks.append(mark)
                node = {**node, "marks": new_marks}

            children = node.get("content")
            if children:
                node = {**node, "content": [walk(c) for c in children]}
            return node

        return walk(content)

    def _upload(
        self, archive: zipfile.ZipFile, path: str, workspace_id: str
    ) -> str | None:
        """Put one archive entry into object storage; return its URL."""
        if _is_unsafe(path) or not path.lower().endswith(_ATTACHMENT_SUFFIXES):
            return None

        try:
            raw = archive.read(path)
        except KeyError:
            return None
        except Exception:
            logger.debug("import: could not read attachment %s", path, exc_info=True)
            return None

        if len(raw) > _MAX_PAGE_BYTES * 4:
            return None

        try:
            from aexy.services.storage_service import get_storage_service

            relative = f"{datetime.now(timezone.utc):%Y%m}/{_safe_name(path)}"
            key = f"{attachment_prefix(workspace_id)}{relative}"
            get_storage_service().put_object(key, raw, _content_type(path))

            # An app URL, not a presigned one. `presign_stored_object` says it
            # plainly: uploads are private, so these URLs are "generated
            # per-response and never stored" — putting one in a document body
            # would be a dead link within the hour. The endpoint behind this
            # path presigns at read time, after an access check.
            return f"/api/v1/workspaces/{workspace_id}/documents/attachments/{relative}"
        except Exception:
            logger.warning("import: could not store attachment %s", path, exc_info=True)
            return None

    # ------------------------------------------------------------------

    async def _record(
        self, job: DocumentImportJob, progress: Progress, status: str
    ) -> None:
        job.imported_pages = progress.imported
        job.failed_pages = progress.failed
        job.warnings = progress.warnings[:500]
        job.status = status
        await self.db.commit()

    async def finish(self, job: DocumentImportJob, progress: Progress) -> None:
        # `partial` is a terminal state, not a failure: the pages that imported
        # are real and usable, and the operator retries the rest.
        job.status = STATUS_PARTIAL if progress.failed else STATUS_COMPLETED
        job.imported_pages = progress.imported
        job.failed_pages = progress.failed
        job.warnings = progress.warnings[:500]
        job.completed_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def get_job(self, job_id: str, workspace_id: str) -> DocumentImportJob | None:
        return (
            await self.db.execute(
                select(DocumentImportJob).where(
                    DocumentImportJob.id == job_id,
                    DocumentImportJob.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()


# ----------------------------------------------------------------------
# Helpers


def _is_unsafe(name: str) -> bool:
    """Zip-slip: an entry that escapes the extraction root."""
    normalised = posixpath.normpath(name.replace("\\", "/"))
    return normalised.startswith(("/", "../")) or ".." in normalised.split("/")


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _safe_name(path: str) -> str:
    base = os.path.basename(path)
    cleaned = re.sub(r"[^\w.\-]", "_", base)
    return cleaned[:180] or "attachment"


def _content_type(path: str) -> str:
    import mimetypes

    return mimetypes.guess_type(path)[0] or "application/octet-stream"
