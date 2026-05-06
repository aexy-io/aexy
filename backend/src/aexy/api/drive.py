"""Drive API — collaborative file storage with AI metadata.

All routes are scoped under `/workspaces/{workspace_id}/drive`. Permission
checks reuse the existing workspace-level RBAC (`viewer` for reads,
`member` for writes).

Upload endpoint flow:
    1. Validate quota via StorageQuotaService.assert_storage_available
       (raises 413 on overflow).
    2. Stream each file to S3-compatible storage (RustFS).
    3. Persist DriveFile row.
    4. Dispatch the AI metadata Temporal activity per file (writes to
       `file_metadata` keyed on `(drive_file, drive_file_id)`).
    5. Invalidate the storage usage Redis cache.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.drive import DriveFile, KIND_FOLDER
from aexy.schemas.drive import (
    DriveFileListResponse,
    DriveFileResponse,
    DriveUsageResponse,
    FileUpdate,
    FolderCreate,
    SmartViewCreate,
    SmartViewListResponse,
    SmartViewResponse,
    SmartViewUpdate,
    VideoAnnotationCreate,
    VideoAnnotationListResponse,
    VideoAnnotationResponse,
    VideoAnnotationUpdate,
)
from aexy.services.drive_service import DriveService
from aexy.services.storage_quota_service import StorageQuotaService
from aexy.services.storage_service import get_storage_service
from aexy.services.workspace_service import WorkspaceService
from aexy.temporal.activities.file_metadata import (
    ExtractFileMetadataInput,
)
from aexy.models.file_metadata import SOURCE_DRIVE_FILE
from aexy.temporal.dispatch import dispatch
from aexy.temporal.task_queues import TaskQueue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/drive", tags=["Drive"])

DRIVE_PREFIX = "drive"
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

# Per-file and per-batch upload ceilings. The per-file cap protects against
# a single 10 GB upload blowing memory; the batch cap stops a 100-file batch
# of 50 MB each from doing the same. Numbers are conservative defaults — the
# real quota is enforced by StorageQuotaService.assert_storage_available.
MAX_BYTES_PER_FILE = 500 * 1024 * 1024       # 500 MB
MAX_BYTES_PER_BATCH = 2 * 1024 * 1024 * 1024  # 2 GB


# ─── Helpers ───────────────────────────────────────────────────────────────
async def _verify_access(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    role: str = "viewer",
) -> None:
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, str(current_user.id), role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )


def _file_to_response(row: Any) -> DriveFileResponse:
    return DriveFileResponse(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        parent_id=str(row.parent_id) if row.parent_id else None,
        space_id=str(row.space_id) if row.space_id else None,
        file_name=row.file_name,
        file_url=row.file_url,
        file_size_bytes=int(row.file_size_bytes or 0),
        content_type=row.content_type,
        kind=row.kind,
        uploaded_by_id=str(row.uploaded_by_id) if row.uploaded_by_id else None,
        uploaded_at=row.uploaded_at,
        updated_at=row.updated_at,
        deleted_at=row.deleted_at,
    )


def _smart_view_to_response(row: Any) -> SmartViewResponse:
    return SmartViewResponse(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        icon=row.icon,
        color=row.color,
        filter_query=dict(row.filter_query or {}),
        is_shared=bool(row.is_shared),
        created_by_id=str(row.created_by_id) if row.created_by_id else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _annotation_to_response(row: Any, *, file_id: str) -> VideoAnnotationResponse:
    return VideoAnnotationResponse(
        id=str(row.id),
        file_id=file_id,
        t_start_ms=int(row.t_start_ms),
        t_end_ms=int(row.t_end_ms),
        label=row.label,
        description=row.description,
        tags=list(row.tags or []),
        confidence=row.confidence,
        source=row.source,
        bbox=row.bbox,
        created_by_id=str(row.created_by_id) if row.created_by_id else None,
        created_at=row.created_at,
    )


# ─── Files & folders ───────────────────────────────────────────────────────
@router.get("/files", response_model=DriveFileListResponse)
async def list_files(
    workspace_id: str,
    parent_id: str | None = Query(None),
    kind: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "viewer")
    service = DriveService(db)
    rows, total = await service.list_files(
        workspace_id=workspace_id,
        parent_id=parent_id,
        kind=kind,
        search=search,
        limit=limit,
        offset=offset,
    )
    return DriveFileListResponse(
        files=[_file_to_response(r) for r in rows], total=total
    )


@router.get("/files/{file_id}", response_model=DriveFileResponse)
async def get_file(
    workspace_id: str,
    file_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "viewer")
    service = DriveService(db)
    row = await service.get_file(workspace_id, file_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return _file_to_response(row)


@router.post("/folders", response_model=DriveFileResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    workspace_id: str,
    data: FolderCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    try:
        folder = await service.create_folder(
            workspace_id=workspace_id,
            name=data.name,
            parent_id=data.parent_id,
            created_by_id=str(current_user.id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await db.commit()
    return _file_to_response(folder)


@router.post(
    "/files",
    response_model=DriveFileListResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_files(
    workspace_id: str,
    files: list[UploadFile] = File(...),
    parent_id: str | None = Query(None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided")

    storage = get_storage_service()
    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage is not configured",
        )

    # Read every file once, capping per-file and per-batch sizes so a
    # malicious or accidental large upload can't blow the worker's memory.
    # The plan-level quota check follows below.
    bodies: list[tuple[UploadFile, bytes]] = []
    total_bytes = 0
    for upload in files:
        body = await upload.read()
        if not body:
            continue
        if len(body) > MAX_BYTES_PER_FILE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File {upload.filename!r} is {len(body) // (1024 * 1024)} MB; "
                    f"per-file limit is {MAX_BYTES_PER_FILE // (1024 * 1024)} MB."
                ),
            )
        if total_bytes + len(body) > MAX_BYTES_PER_BATCH:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"Batch upload exceeds {MAX_BYTES_PER_BATCH // (1024 * 1024)} MB. "
                    "Split the upload into multiple requests."
                ),
            )
        bodies.append((upload, body))
        total_bytes += len(body)
    if not bodies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No non-empty files provided",
        )

    quota = StorageQuotaService(db)
    await quota.assert_storage_available(
        workspace_id=workspace_id,
        incoming_bytes=total_bytes,
        developer_id=str(current_user.id),
    )

    service = DriveService(db)
    persisted: list = []
    for upload, body in bodies:
        original_name = upload.filename or "upload"
        safe_name = SAFE_FILENAME_RE.sub("_", original_name) or "upload"
        key = f"{DRIVE_PREFIX}/{workspace_id}/{uuid.uuid4().hex}_{safe_name}"
        content_type = upload.content_type or "application/octet-stream"
        ok = storage.put_object(key=key, data=body, content_type=content_type)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload '{original_name}'",
            )
        row = await service.create_file(
            workspace_id=workspace_id,
            file_name=original_name,
            file_url=storage.get_object_url(key),
            file_size_bytes=len(body),
            content_type=content_type,
            uploaded_by_id=str(current_user.id),
            parent_id=parent_id,
        )
        persisted.append(row)

    await db.commit()
    await quota.invalidate_workspace_usage(workspace_id)

    # Fire-and-forget AI pipeline — failure here doesn't block the upload.
    for row in persisted:
        try:
            await dispatch(
                "extract_file_ai_metadata",
                ExtractFileMetadataInput(
                    source_type=SOURCE_DRIVE_FILE, source_id=str(row.id)
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"file-ai-drive_file-{row.id}",
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to dispatch file AI pipeline for %s: %s", row.id, exc)

    return DriveFileListResponse(
        files=[_file_to_response(r) for r in persisted], total=len(persisted)
    )


@router.patch("/files/{file_id}", response_model=DriveFileResponse)
async def update_file(
    workspace_id: str,
    file_id: str,
    data: FileUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    try:
        kwargs: dict[str, Any] = {}
        if data.file_name is not None:
            kwargs["file_name"] = data.file_name
        # parent_id allows null to mean "move to root", so distinguish
        # "field present" (in model_fields_set) from absent.
        if "parent_id" in data.model_fields_set:
            kwargs["parent_id"] = data.parent_id
        row = await service.update_file(workspace_id, file_id, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await db.commit()
    return _file_to_response(row)


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    workspace_id: str,
    file_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    ok = await service.soft_delete(workspace_id, file_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await db.commit()
    quota = StorageQuotaService(db)
    await quota.invalidate_workspace_usage(workspace_id)
    return None


# ─── Re-annotate (manual reprocess) ────────────────────────────────────────
@router.post("/files/{file_id}/reannotate", status_code=status.HTTP_202_ACCEPTED)
async def reannotate_file(
    workspace_id: str,
    file_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    row = await service.get_file(workspace_id, file_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    # The pipeline is the same regardless of kind — videos add Qwen-VL
    # frame annotation as a branch inside `run_pipeline`. We don't need a
    # separate workflow for video.
    await dispatch(
        "extract_file_ai_metadata",
        ExtractFileMetadataInput(
            source_type=SOURCE_DRIVE_FILE, source_id=file_id
        ),
        task_queue=TaskQueue.ANALYSIS,
        workflow_id=f"file-ai-drive_file-{file_id}-{uuid.uuid4().hex[:8]}",
    )
    return {"status": "queued"}


# ─── Video annotations ─────────────────────────────────────────────────────
@router.get(
    "/files/{file_id}/annotations", response_model=VideoAnnotationListResponse
)
async def list_annotations(
    workspace_id: str,
    file_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "viewer")
    service = DriveService(db)
    file_row = await service.get_file(workspace_id, file_id)
    if file_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    rows = await service.list_annotations(workspace_id, file_id)
    return VideoAnnotationListResponse(
        annotations=[_annotation_to_response(r, file_id=file_id) for r in rows]
    )


@router.post(
    "/files/{file_id}/annotations",
    response_model=VideoAnnotationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_annotation(
    workspace_id: str,
    file_id: str,
    data: VideoAnnotationCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    file_row = await service.get_file(workspace_id, file_id)
    if file_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    row = await service.create_annotation(
        workspace_id=workspace_id,
        file_id=file_id,
        t_start_ms=data.t_start_ms,
        t_end_ms=data.t_end_ms,
        label=data.label,
        description=data.description,
        tags=data.tags,
        bbox=data.bbox,
        created_by_id=str(current_user.id),
    )
    await db.commit()
    return _annotation_to_response(row, file_id=file_id)


@router.patch(
    "/files/{file_id}/annotations/{annotation_id}",
    response_model=VideoAnnotationResponse,
)
async def update_annotation(
    workspace_id: str,
    file_id: str,
    annotation_id: str,
    data: VideoAnnotationUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    file_row = await service.get_file(workspace_id, file_id)
    if file_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    row = await service.update_annotation(
        workspace_id,
        file_id,
        annotation_id,
        t_start_ms=data.t_start_ms,
        t_end_ms=data.t_end_ms,
        label=data.label,
        description=data.description,
        tags=data.tags,
        bbox=data.bbox,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found"
        )
    await db.commit()
    return _annotation_to_response(row, file_id=file_id)


@router.delete(
    "/files/{file_id}/annotations/{annotation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_annotation(
    workspace_id: str,
    file_id: str,
    annotation_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    file_row = await service.get_file(workspace_id, file_id)
    if file_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    ok = await service.delete_annotation(workspace_id, file_id, annotation_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found"
        )
    await db.commit()
    return None


# ─── Smart Views ───────────────────────────────────────────────────────────
@router.get("/smart-views", response_model=SmartViewListResponse)
async def list_smart_views(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "viewer")
    service = DriveService(db)
    rows = await service.list_smart_views(workspace_id)
    return SmartViewListResponse(
        smart_views=[_smart_view_to_response(r) for r in rows]
    )


@router.post(
    "/smart-views",
    response_model=SmartViewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_smart_view(
    workspace_id: str,
    data: SmartViewCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    row = await service.create_smart_view(
        workspace_id=workspace_id,
        name=data.name,
        filter_query=data.filter_query.model_dump(exclude_none=True),
        icon=data.icon,
        color=data.color,
        is_shared=data.is_shared,
        created_by_id=str(current_user.id),
    )
    await db.commit()
    return _smart_view_to_response(row)


@router.patch("/smart-views/{view_id}", response_model=SmartViewResponse)
async def update_smart_view(
    workspace_id: str,
    view_id: str,
    data: SmartViewUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    fields: dict[str, Any] = data.model_dump(exclude_unset=True)
    if "filter_query" in fields and fields["filter_query"] is not None:
        # Pydantic gave us a SmartViewFilter; convert to plain dict.
        fields["filter_query"] = data.filter_query.model_dump(exclude_none=True) if data.filter_query else None
    row = await service.update_smart_view(workspace_id, view_id, **fields)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Smart view not found"
        )
    await db.commit()
    return _smart_view_to_response(row)


@router.delete(
    "/smart-views/{view_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_smart_view(
    workspace_id: str,
    view_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "member")
    service = DriveService(db)
    ok = await service.delete_smart_view(workspace_id, view_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Smart view not found"
        )
    await db.commit()
    return None


@router.get(
    "/smart-views/{view_id}/files", response_model=DriveFileListResponse
)
async def smart_view_files(
    workspace_id: str,
    view_id: str,
    limit: int = Query(200, ge=1, le=500),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "viewer")
    service = DriveService(db)
    rows = await service.resolve_smart_view(workspace_id, view_id, limit=limit)
    return DriveFileListResponse(
        files=[_file_to_response(r) for r in rows], total=len(rows)
    )


# ─── Usage ─────────────────────────────────────────────────────────────────
# Drive-scoped search is gone; callers use the workspace-wide endpoint at
# `/workspaces/{ws}/search/files?kinds=drive_file`.



@router.get("/usage", response_model=DriveUsageResponse)
async def drive_usage(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    await _verify_access(workspace_id, current_user, db, "viewer")
    quota = StorageQuotaService(db)
    summary = await quota.get_usage_summary(
        workspace_id, developer_id=str(current_user.id)
    )

    # files_count comes from drive_files alone (the dashboard-y figure the UI
    # cares about) — task attachments + compliance docs already roll into
    # the bytes total.
    files_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(DriveFile)
                .where(
                    DriveFile.workspace_id == workspace_id,
                    DriveFile.deleted_at.is_(None),
                    DriveFile.kind != KIND_FOLDER,
                )
            )
        ).scalar_one()
        or 0
    )
    return DriveUsageResponse(
        used_bytes=summary["used_bytes"],
        limit_bytes=summary["limit_bytes"],
        unlimited=summary["unlimited"],
        percent_used=summary["percent_used"],
        files_count=files_count,
    )
