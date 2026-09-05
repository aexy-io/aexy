"""Importing a Notion or Confluence export into a space.

Uploading the archive starts a background job; everything else here reports on
it or serves what it produced.

**Admin on the target space**, not edit. Import creates documents in bulk, and
every one goes through `DocumentService.create_document` rather than being
written straight to the table — an importer that inserted rows directly would
be a way to place documents into a restricted space without the access layer
ever seeing them.
"""

from __future__ import annotations

import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.document_audit import DocumentAuditAction
from aexy.models.documentation import DocumentImportJob, DocumentSpace
from aexy.schemas.document_import import (
    ImportJobResponse,
    ImportStartResponse,
)
from aexy.services.document_audit_service import Actor, DocumentAuditService
from aexy.services.document_import.service import (
    STATUS_PENDING,
    DocumentImportService,
    ImportError_,
    attachment_prefix,
)
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/documents", tags=["Document import"]
)

#: An archive larger than this is a whole Confluence instance rather than a
#: space, and should be split before it is uploaded.
MAX_ARCHIVE_BYTES = 500 * 1024 * 1024


async def _require_space_admin(
    workspace_id: str,
    space_id: str | None,
    current_user: Developer,
    db: AsyncSession,
) -> None:
    """Import writes in bulk, so it needs admin on where it is writing."""
    workspace_service = WorkspaceService(db)
    if await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        return

    if space_id:
        from aexy.models.documentation import DocumentSpaceMember, DocumentSpaceRole

        role = (
            await db.execute(
                select(DocumentSpaceMember.role).where(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == str(current_user.id),
                )
            )
        ).scalar_one_or_none()
        if role == DocumentSpaceRole.ADMIN.value:
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Importing requires admin access to the destination space",
    )


@router.post("/import", response_model=ImportStartResponse, status_code=202)
async def start_import(
    workspace_id: str,
    request: Request,
    file: UploadFile = File(...),
    space_id: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Upload an export archive and start importing it.

    202, not 201: a Confluence space is thousands of pages and the work happens
    afterwards. The response carries the job id to poll.
    """
    await _require_space_admin(workspace_id, space_id, current_user, db)

    if space_id:
        space = (
            await db.execute(
                select(DocumentSpace).where(
                    DocumentSpace.id == space_id,
                    DocumentSpace.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if space is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Space not found"
            )

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The archive is empty"
        )
    if len(raw) > MAX_ARCHIVE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"The archive is {len(raw) // (1024 * 1024)} MB; the limit is "
                f"{MAX_ARCHIVE_BYTES // (1024 * 1024)} MB. Export one space at a time."
            ),
        )

    service = DocumentImportService(db)

    # Opened here, before anything is stored, so an unreadable zip is a 400 the
    # user sees now rather than a job that fails silently in a minute.
    try:
        _archive, source, pages = service.read_archive(raw)
    except ImportError_ as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    if not pages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No importable pages found in that archive",
        )

    from aexy.services.storage_service import get_storage_service

    job = DocumentImportJob(
        workspace_id=workspace_id,
        space_id=space_id,
        requested_by_id=str(current_user.id),
        source=source.value,
        archive_key="",
        archive_name=file.filename,
        status=STATUS_PENDING,
        total_pages=len(pages),
    )
    db.add(job)
    await db.flush()

    archive_key = f"workspaces/{workspace_id}/imports/{job.id}.zip"
    try:
        get_storage_service().put_object(archive_key, raw, "application/zip")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not store the archive; object storage is unavailable",
        ) from exc

    job.archive_key = archive_key

    await DocumentAuditService(db).log(
        workspace_id=workspace_id,
        action=DocumentAuditAction.CREATED,
        actor=Actor.from_request(request, current_user),
        context={
            "import_job": str(job.id),
            "source": source.value,
            "pages": len(pages),
            "space_id": space_id,
        },
    )
    await db.commit()

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    await dispatch(
        "run_document_import",
        {"job_id": str(job.id)},
        task_queue=TaskQueue.ANALYSIS,
        workflow_id=f"doc-import-{job.id}",
    )

    return ImportStartResponse(
        job_id=str(job.id),
        source=source.value,
        total_pages=len(pages),
        status=job.status,
    )


@router.get("/import/{job_id}", response_model=ImportJobResponse)
async def import_status(
    workspace_id: str,
    job_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Progress, counts, and every page that did not convert cleanly."""
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    job = await DocumentImportService(db).get_job(job_id, workspace_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import job not found"
        )
    return _job_response(job)


@router.get("/import", response_model=list[ImportJobResponse])
async def list_imports(
    workspace_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    jobs = (
        (
            await db.execute(
                select(DocumentImportJob)
                .where(DocumentImportJob.workspace_id == workspace_id)
                .order_by(DocumentImportJob.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [_job_response(j) for j in jobs]


@router.post("/import/{job_id}/retry", response_model=ImportStartResponse)
async def retry_import(
    workspace_id: str,
    job_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Re-run a job, importing only what it did not already create.

    Safe to call repeatedly: `id_map` records every page that already became a
    document, so a retry converts the rest rather than duplicating the lot.
    That is the whole reason the map is persisted.
    """
    await _require_space_admin(workspace_id, None, current_user, db)

    job = await DocumentImportService(db).get_job(job_id, workspace_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import job not found"
        )
    if job.status in (STATUS_PENDING, "scanning", "importing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That import is still running"
        )

    job.status = STATUS_PENDING
    job.error = None
    await db.commit()

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    await dispatch(
        "run_document_import",
        {"job_id": str(job.id)},
        task_queue=TaskQueue.ANALYSIS,
        # A fresh workflow id: the same one would be deduplicated as the
        # original run, which is exactly what a retry must not be.
        workflow_id=f"doc-import-{job.id}-retry-{job.imported_pages}",
    )

    return ImportStartResponse(
        job_id=str(job.id),
        source=job.source,
        total_pages=job.total_pages,
        status=job.status,
    )


@router.get("/attachments/{path:path}")
async def get_imported_attachment(
    workspace_id: str,
    path: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Serve a file an import brought in.

    Documents store this path rather than a presigned URL, because
    `presign_stored_object` is explicit that those are "generated per-response
    and never stored" — one written into a document body is a dead link within
    the hour.

    The key is built from the workspace in the path plus a fixed prefix, so a
    caller who can name a path can only ever name one inside their own
    workspace's import area. Passing the storage key straight through would let
    them read any object in the bucket.
    """
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if ".." in path or path.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attachment path"
        )

    from aexy.services.storage_service import get_storage_service

    storage = get_storage_service()
    key = f"{attachment_prefix(workspace_id)}{path}"

    presigned = storage.generate_presigned_get_url(key)
    if presigned:
        return RedirectResponse(presigned)

    found = storage.get_object(key)
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
        )
    data, content_type = found
    return StreamingResponse(iter([data]), media_type=content_type)


def _job_response(job: DocumentImportJob) -> ImportJobResponse:
    return ImportJobResponse(
        id=str(job.id),
        source=job.source,
        status=job.status,
        space_id=str(job.space_id) if job.space_id else None,
        archive_name=job.archive_name,
        total_pages=job.total_pages,
        imported_pages=job.imported_pages,
        failed_pages=job.failed_pages,
        warnings=list(job.warnings or []),
        error=job.error,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )
