"""Polymorphic file metadata service.

The Drive AI pipeline used to know about Drive files only. Now any file-
storing surface registers a *resolver* that maps a source-specific id to
a `ResolvedFile` record. The pipeline asks the resolver for bytes, file
name, kind, and workspace, then writes the AI metadata to a single
`file_metadata` row keyed by (source_type, source_id).

Adding a fourth source type (e.g. CRM attachments) is one resolver and a
new constant in `models/file_metadata.py` — no schema migration needed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Awaitable, Callable
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.file_metadata import (
    AI_STATUS_PENDING,
    ALL_SOURCE_TYPES,
    SOURCE_COMPLIANCE_DOCUMENT,
    SOURCE_DRIVE_FILE,
    SOURCE_TASK_ATTACHMENT,
    FileMetadata,
)

logger = logging.getLogger(__name__)


@dataclass
class ResolvedFile:
    """Source-agnostic view of a file the AI pipeline will process."""

    file_url: str | None      # Direct download URL (or None if only `file_key` is known).
    file_key: str | None      # Storage key when no public URL exists (compliance docs).
    file_name: str
    file_size_bytes: int
    content_type: str | None
    workspace_id: str
    kind: str                 # file | folder | image | video | audio | pdf | doc


# A resolver is `async (db, source_id) -> ResolvedFile`.
Resolver = Callable[[AsyncSession, str], Awaitable[ResolvedFile]]


# ─── Source registry ──────────────────────────────────────────────────────
# Module-level dict keyed by source_type. Resolvers register themselves below
# (at import time of this module). Tests can also push fake resolvers in.
_REGISTRY: dict[str, Resolver] = {}


def register_source(source_type: str, resolver: Resolver) -> None:
    """Register a resolver for a source type. Last registration wins."""
    if source_type not in ALL_SOURCE_TYPES:
        # We allow registration of unknown source types so plugins / tests
        # can inject custom kinds, but log a warning for typos.
        logger.warning(
            "Registering resolver for unknown source_type %r — typo?", source_type
        )
    _REGISTRY[source_type] = resolver


async def resolve(db: AsyncSession, source_type: str, source_id: str) -> ResolvedFile:
    """Look up a file's metadata via its registered resolver."""
    resolver = _REGISTRY.get(source_type)
    if resolver is None:
        raise ValueError(
            f"No file resolver registered for source_type={source_type!r}. "
            f"Did the source's module fail to import?"
        )
    return await resolver(db, source_id)


# ─── FileMetadata CRUD ────────────────────────────────────────────────────
async def get_metadata(
    db: AsyncSession, source_type: str, source_id: str
) -> FileMetadata | None:
    return (
        await db.execute(
            select(FileMetadata).where(
                FileMetadata.source_type == source_type,
                FileMetadata.source_id == source_id,
            )
        )
    ).scalar_one_or_none()


async def get_metadata_batch(
    db: AsyncSession, source_type: str, source_ids: list[str]
) -> dict[str, FileMetadata]:
    """Single-query lookup of metadata for many sources at once.

    Used in response builders to avoid N+1 queries when serialising file
    lists. Returns a `{source_id: FileMetadata}` map; sources without a
    metadata row are simply absent from the result.
    """
    if not source_ids:
        return {}
    rows = (
        await db.execute(
            select(FileMetadata).where(
                FileMetadata.source_type == source_type,
                FileMetadata.source_id.in_(source_ids),
            )
        )
    ).scalars().all()
    return {str(row.source_id): row for row in rows}


async def get_or_create_metadata(
    db: AsyncSession,
    source_type: str,
    source_id: str,
    workspace_id: str,
) -> FileMetadata:
    """Return the existing metadata row, or create a fresh `pending` one.

    Idempotent — safe to call from upload handlers that may run twice
    (e.g. reprocessing after a partial failure).
    """
    existing = await get_metadata(db, source_type, source_id)
    if existing is not None:
        return existing

    row = FileMetadata(
        id=str(uuid4()),
        source_type=source_type,
        source_id=source_id,
        workspace_id=workspace_id,
        ai_status=AI_STATUS_PENDING,
    )
    db.add(row)
    await db.flush()
    return row


async def update_status(
    db: AsyncSession,
    metadata_id: str,
    status: str,
    *,
    error: str | None = None,
) -> None:
    row = (
        await db.execute(
            select(FileMetadata).where(FileMetadata.id == metadata_id)
        )
    ).scalar_one_or_none()
    if row is None:
        return
    row.ai_status = status
    row.ai_error = error[:1000] if error else None
    if status == "done":
        row.ai_processed_at = datetime.now(timezone.utc)
    await db.flush()


# ─── Default resolvers ────────────────────────────────────────────────────
# Imports inside each resolver avoid a hard import cycle between
# `services.file_metadata_service` and source modules.

async def _resolve_drive_file(db: AsyncSession, source_id: str) -> ResolvedFile:
    from aexy.models.drive import DriveFile

    row = (
        await db.execute(select(DriveFile).where(DriveFile.id == source_id))
    ).scalar_one_or_none()
    if row is None:
        raise ValueError(f"DriveFile {source_id} not found")
    return ResolvedFile(
        file_url=row.file_url,
        file_key=None,
        file_name=row.file_name,
        file_size_bytes=int(row.file_size_bytes or 0),
        content_type=row.content_type,
        workspace_id=str(row.workspace_id),
        kind=row.kind,
    )


async def _resolve_task_attachment(db: AsyncSession, source_id: str) -> ResolvedFile:
    from aexy.models.sprint import SprintTask, TaskAttachment

    row = (
        await db.execute(
            select(TaskAttachment).where(TaskAttachment.id == source_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ValueError(f"TaskAttachment {source_id} not found")

    # task_attachments don't carry workspace_id directly; resolve via the task.
    task = (
        await db.execute(select(SprintTask).where(SprintTask.id == row.task_id))
    ).scalar_one_or_none()
    if task is None or not task.workspace_id:
        raise ValueError(
            f"TaskAttachment {source_id} has no resolvable workspace_id (task missing or unscoped)"
        )

    return ResolvedFile(
        file_url=row.file_url,
        file_key=None,
        file_name=row.file_name,
        file_size_bytes=int(row.file_size or 0),
        content_type=row.content_type,
        workspace_id=str(task.workspace_id),
        kind=_kind_from(row.file_name, row.content_type),
    )


async def _resolve_compliance_document(
    db: AsyncSession, source_id: str
) -> ResolvedFile:
    from aexy.models.compliance_document import ComplianceDocument

    row = (
        await db.execute(
            select(ComplianceDocument).where(ComplianceDocument.id == source_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ValueError(f"ComplianceDocument {source_id} not found")
    return ResolvedFile(
        file_url=None,                     # use `file_key` + storage service
        file_key=row.file_key,
        file_name=row.name,
        file_size_bytes=int(row.file_size or 0),
        content_type=row.mime_type,
        workspace_id=str(row.workspace_id),
        kind=_kind_from(row.name, row.mime_type),
    )


def _kind_from(file_name: str | None, content_type: str | None) -> str:
    """Mirror the Drive `detect_kind` heuristic so the pipeline branches
    consistently across sources.
    """
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("video/"):
        return "video"
    if ct.startswith("audio/"):
        return "audio"
    if ct == "application/pdf":
        return "pdf"
    name = (file_name or "").lower()
    for ext, kind in (
        (".pdf", "pdf"),
        (".docx", "doc"),
        (".doc", "doc"),
        (".md", "doc"),
        (".txt", "doc"),
    ):
        if name.endswith(ext):
            return kind
    return "file"


# Register defaults on import so a `from aexy.services.file_metadata_service
# import resolve` is enough to use the system. New source types can override
# by calling `register_source` themselves.
register_source(SOURCE_DRIVE_FILE, _resolve_drive_file)
register_source(SOURCE_TASK_ATTACHMENT, _resolve_task_attachment)
register_source(SOURCE_COMPLIANCE_DOCUMENT, _resolve_compliance_document)
