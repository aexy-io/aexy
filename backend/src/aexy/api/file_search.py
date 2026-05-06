"""Workspace-wide file search + per-file metadata API.

Covers:
  * `GET  /workspaces/{ws}/search/files?q=...&kinds=...` — global search
  * `GET  /workspaces/{ws}/source-files?source_type=...` — browse one source
  * `GET  /workspaces/{ws}/files/{source_type}/{source_id}/metadata`
  * `POST /workspaces/{ws}/files/{source_type}/{source_id}/reannotate`
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.compliance_document import ComplianceDocument
from aexy.models.developer import Developer
from aexy.models.drive import DriveFile, KIND_FOLDER
from aexy.models.file_metadata import (
    ALL_SOURCE_TYPES,
    SOURCE_COMPLIANCE_DOCUMENT,
    SOURCE_DRIVE_FILE,
    SOURCE_TASK_ATTACHMENT,
)
from aexy.models.sprint import SprintTask, TaskAttachment
from aexy.schemas.file_metadata import FileAIMetadata, metadata_to_ai_response
from aexy.services.file_metadata_service import get_metadata, resolve
from aexy.services.workspace_service import WorkspaceService
from aexy.services.file_metadata_service import _kind_from
from aexy.temporal.activities.file_metadata import ExtractFileMetadataInput
from aexy.temporal.dispatch import dispatch
from aexy.temporal.task_queues import TaskQueue

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["File Search"])


# ─── Schemas ───────────────────────────────────────────────────────────────
class FileSearchHitResponse(BaseModel):
    metadata_id: str
    source_type: str
    source_id: str
    workspace_id: str
    file_name: str
    file_url: str | None
    content_type: str | None
    ai_summary: str | None
    ai_tags: list[str] = Field(default_factory=list)
    ai_categories: list[str] = Field(default_factory=list)
    ai_status: str
    score: float
    highlights: list[str] = Field(default_factory=list)


class FileSearchResponse(BaseModel):
    results: list[FileSearchHitResponse]


class SourceFileRow(BaseModel):
    """Unified shape for a file across any source. The Drive UI renders
    these in its grid alongside DriveFile rows so non-drive sources (task
    attachments, compliance docs) are browsable in one place.
    """

    source_type: str
    source_id: str
    workspace_id: str
    file_name: str
    file_url: str | None
    content_type: str | None
    kind: str
    file_size_bytes: int
    uploaded_at: datetime


class SourceFileListResponse(BaseModel):
    files: list[SourceFileRow]
    total: int


# ─── Permission helper ────────────────────────────────────────────────────
async def _verify(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    role: str = "viewer",
):
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )


# ─── Search ────────────────────────────────────────────────────────────────
@router.get("/search/files", response_model=FileSearchResponse)
async def search_workspace_files(
    workspace_id: str,
    q: str = Query(..., min_length=2),
    kinds: str | None = Query(
        None,
        description=(
            "Comma-separated source types to filter on "
            "(drive_file,task_attachment,compliance_document). Default: all."
        ),
    ),
    limit: int = Query(20, ge=1, le=50),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify(workspace_id, current_user, db, "viewer")
    from aexy.llm.gateway import get_llm_gateway
    from aexy.services.file_search_service import FileSearchService

    kind_list = [k.strip() for k in (kinds or "").split(",") if k.strip()] or None

    service = FileSearchService(db, get_llm_gateway())
    hits = await service.search(workspace_id, q, kinds=kind_list, top_k=limit)
    return FileSearchResponse(
        results=[FileSearchHitResponse(**hit.__dict__) for hit in hits]
    )


# ─── Browse files by source type ──────────────────────────────────────────
@router.get("/source-files", response_model=SourceFileListResponse)
async def list_source_files(
    workspace_id: str,
    source_type: str = Query(..., description="drive_file | task_attachment | compliance_document"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List every file in `workspace_id` whose `source_type` matches.

    Lets the Drive UI render virtual "Task Attachments" / "Compliance
    Documents" views in the same grid as drive_files. Excludes folders
    (drive_file) and soft-deleted rows.
    """
    await _verify(workspace_id, current_user, db, "viewer")
    if source_type not in ALL_SOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown source_type {source_type!r}",
        )

    rows: list[SourceFileRow] = []
    total = 0

    if source_type == SOURCE_DRIVE_FILE:
        base = select(DriveFile).where(
            DriveFile.workspace_id == workspace_id,
            DriveFile.deleted_at.is_(None),
            DriveFile.kind != KIND_FOLDER,
        )
        total_q = await db.execute(
            select(_func_count()).select_from(base.subquery())
        )
        total = int(total_q.scalar_one() or 0)
        result = await db.execute(
            base.order_by(DriveFile.uploaded_at.desc()).offset(offset).limit(limit)
        )
        for r in result.scalars().all():
            rows.append(
                SourceFileRow(
                    source_type=SOURCE_DRIVE_FILE,
                    source_id=str(r.id),
                    workspace_id=str(r.workspace_id),
                    file_name=r.file_name,
                    file_url=r.file_url,
                    content_type=r.content_type,
                    kind=r.kind,
                    file_size_bytes=int(r.file_size_bytes or 0),
                    uploaded_at=r.uploaded_at,
                )
            )

    elif source_type == SOURCE_TASK_ATTACHMENT:
        # task_attachments scope to a workspace via their parent SprintTask.
        base = (
            select(TaskAttachment)
            .join(SprintTask, SprintTask.id == TaskAttachment.task_id)
            .where(SprintTask.workspace_id == workspace_id)
        )
        total_q = await db.execute(
            select(_func_count()).select_from(base.subquery())
        )
        total = int(total_q.scalar_one() or 0)
        result = await db.execute(
            base.order_by(TaskAttachment.uploaded_at.desc()).offset(offset).limit(limit)
        )
        for r in result.scalars().all():
            rows.append(
                SourceFileRow(
                    source_type=SOURCE_TASK_ATTACHMENT,
                    source_id=str(r.id),
                    workspace_id=workspace_id,
                    file_name=r.file_name,
                    file_url=r.file_url,
                    content_type=r.content_type,
                    kind=_kind_from(r.file_name, r.content_type),
                    file_size_bytes=int(r.file_size or 0),
                    uploaded_at=r.uploaded_at,
                )
            )

    elif source_type == SOURCE_COMPLIANCE_DOCUMENT:
        base = select(ComplianceDocument).where(
            ComplianceDocument.workspace_id == workspace_id,
            ComplianceDocument.deleted_at.is_(None),
        )
        total_q = await db.execute(
            select(_func_count()).select_from(base.subquery())
        )
        total = int(total_q.scalar_one() or 0)
        result = await db.execute(
            base.order_by(ComplianceDocument.created_at.desc()).offset(offset).limit(limit)
        )
        for r in result.scalars().all():
            rows.append(
                SourceFileRow(
                    source_type=SOURCE_COMPLIANCE_DOCUMENT,
                    source_id=str(r.id),
                    workspace_id=str(r.workspace_id),
                    file_name=r.name,
                    # Compliance docs use file_key + a separate download
                    # endpoint — frontend constructs the URL when needed.
                    file_url=None,
                    content_type=r.mime_type,
                    kind=_kind_from(r.name, r.mime_type),
                    file_size_bytes=int(r.file_size or 0),
                    uploaded_at=r.created_at,
                )
            )

    return SourceFileListResponse(files=rows, total=total)


def _func_count():
    """Lazy import to avoid a top-level `func` import shadowing the standard
    library."""
    from sqlalchemy import func

    return func.count()


# ─── Per-file metadata ────────────────────────────────────────────────────
@router.get(
    "/files/{source_type}/{source_id}/metadata",
    response_model=FileAIMetadata,
)
async def get_file_metadata(
    workspace_id: str,
    source_type: str,
    source_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Return the AI metadata block for any file source.

    Frontend uses this for the hover popover, the universal detail page,
    and lazy-fetching tags inside per-context lists. Returns a `pending`
    block when no metadata row exists yet so callers don't have to
    special-case 404s.
    """
    await _verify(workspace_id, current_user, db, "viewer")
    if source_type not in ALL_SOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown source_type {source_type!r}",
        )
    row = await get_metadata(db, source_type, source_id)
    if row is not None and str(row.workspace_id) != workspace_id:
        # Don't leak across workspaces.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return metadata_to_ai_response(source_type, source_id, row)


@router.post(
    "/files/{source_type}/{source_id}/reannotate",
    status_code=status.HTTP_202_ACCEPTED,
)
async def reannotate_file(
    workspace_id: str,
    source_type: str,
    source_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Force-re-run the AI pipeline for any file. Frontend's universal
    'Reannotate' button posts here regardless of source.
    """
    await _verify(workspace_id, current_user, db, "member")
    if source_type not in ALL_SOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown source_type {source_type!r}",
        )

    # Verify the source row exists *and* belongs to this workspace before
    # spending LLM budget on it. Without this check, any workspace member
    # could trigger reprocessing of any file in any other workspace by
    # guessing a UUID — billing the wrong tenant and blowing past quotas.
    try:
        resolved = await resolve(db, source_type, source_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if str(resolved.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    await dispatch(
        "extract_file_ai_metadata",
        ExtractFileMetadataInput(source_type=source_type, source_id=source_id),
        task_queue=TaskQueue.ANALYSIS,
        workflow_id=f"file-ai-{source_type}-{source_id}-{uuid.uuid4().hex[:8]}",
    )
    return {"status": "queued"}
