"""Shared task-attachment helpers.

Used by both the sprint-scoped router (`/sprints/{sprint_id}/tasks/{task_id}/attachments`)
and the project-scoped router (`/teams/{team_id}/tasks/{task_id}/attachments`)
so backlog tasks (no sprint) can carry attachments using the same code path.

Permission and ownership checks live in the routers — these helpers assume
the caller has already authorised the operation against `task`.
"""

from __future__ import annotations

import logging
import re
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask
from aexy.schemas.sprint import TaskAttachmentListResponse, TaskAttachmentResponse
from aexy.services.sprint_task_service import SprintTaskService
from aexy.services.storage_quota_service import StorageQuotaService
from aexy.services.storage_service import get_storage_service

logger = logging.getLogger(__name__)


ATTACHMENTS_PREFIX = "task-attachments"
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def attachment_to_response(
    attachment, ai_row: object | None = None
) -> TaskAttachmentResponse:
    """Single attachment row → response, with optional AI metadata."""
    from aexy.models.file_metadata import SOURCE_TASK_ATTACHMENT
    from aexy.schemas.file_metadata import metadata_to_ai_response

    return TaskAttachmentResponse(
        id=str(attachment.id),
        task_id=str(attachment.task_id),
        file_name=attachment.file_name,
        file_url=attachment.file_url,
        file_size=attachment.file_size,
        content_type=attachment.content_type,
        uploaded_by_id=str(attachment.uploaded_by_id) if attachment.uploaded_by_id else None,
        uploaded_at=attachment.uploaded_at,
        ai=metadata_to_ai_response(SOURCE_TASK_ATTACHMENT, str(attachment.id), ai_row),
    )


async def attachments_with_ai(db, attachments) -> list[TaskAttachmentResponse]:
    """Build attachment responses with their `ai` block populated in one
    extra query (no N+1)."""
    from aexy.models.file_metadata import SOURCE_TASK_ATTACHMENT
    from aexy.services.file_metadata_service import get_metadata_batch

    if not attachments:
        return []
    ids = [str(a.id) for a in attachments]
    ai_map = await get_metadata_batch(db, SOURCE_TASK_ATTACHMENT, ids)
    return [attachment_to_response(a, ai_map.get(str(a.id))) for a in attachments]


async def upload_attachments_for_task(
    db,
    task: SprintTask,
    files: list[UploadFile],
    current_user: Developer,
) -> TaskAttachmentListResponse:
    """Upload one or more files to `task`. Persists DB rows + S3 objects.

    Caller is responsible for authorisation. Quota is asserted against
    `task.workspace_id` when set; otherwise the upload is allowed without
    quota enforcement (the workspace-less path is rare and used only for
    legacy data).
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided",
        )

    storage = get_storage_service()
    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage is not configured on this deployment",
        )

    bodies: list[tuple[UploadFile, bytes]] = []
    total_bytes = 0
    for upload in files:
        body = await upload.read()
        if not body:
            continue
        bodies.append((upload, body))
        total_bytes += len(body)

    if not bodies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No non-empty files provided",
        )

    quota = StorageQuotaService(db)
    if task.workspace_id:
        await quota.assert_storage_available(
            workspace_id=str(task.workspace_id),
            incoming_bytes=total_bytes,
            developer_id=str(current_user.id),
        )
    # TODO: tasks created before workspace_id was added (legacy data) bypass
    # the quota check. Backfill workspace_id on existing tasks and remove the
    # `if` guard above so every upload is bounded.

    task_service = SprintTaskService(db)
    created: list = []
    for upload, body in bodies:
        original_name = upload.filename or "attachment"
        safe_name = SAFE_FILENAME_RE.sub("_", original_name) or "attachment"
        key = f"{ATTACHMENTS_PREFIX}/{task.id}/{uuid4().hex}_{safe_name}"
        content_type = upload.content_type or "application/octet-stream"
        ok = storage.put_object(key=key, data=body, content_type=content_type)
        if not ok:
            logger.error(
                "Failed to upload attachment %s for task %s", original_name, task.id
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload attachment '{original_name}'",
            )

        attachment = await task_service.add_attachment(
            task_id=str(task.id),
            file_name=original_name,
            file_url=storage.get_object_url(key),
            file_size=len(body),
            content_type=content_type,
            uploaded_by_id=str(current_user.id),
        )
        created.append(attachment)

    await db.commit()
    if task.workspace_id:
        await quota.invalidate_workspace_usage(str(task.workspace_id))

    # Fire-and-forget AI metadata pipeline per attachment. Failure here must
    # never block the upload — the file is already persisted.
    from aexy.models.file_metadata import SOURCE_TASK_ATTACHMENT
    from aexy.temporal.activities.file_metadata import ExtractFileMetadataInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    for attachment in created:
        try:
            await dispatch(
                "extract_file_ai_metadata",
                ExtractFileMetadataInput(
                    source_type=SOURCE_TASK_ATTACHMENT,
                    source_id=str(attachment.id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"file-ai-task_attachment-{attachment.id}",
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Failed to dispatch file AI pipeline for attachment %s: %s",
                attachment.id, exc,
            )

    return TaskAttachmentListResponse(
        attachments=await attachments_with_ai(db, created),
    )


async def list_attachments_for_task(db, task: SprintTask) -> TaskAttachmentListResponse:
    task_service = SprintTaskService(db)
    attachments = await task_service.list_attachments(str(task.id))
    return TaskAttachmentListResponse(
        attachments=await attachments_with_ai(db, attachments),
    )


async def delete_attachment_for_task(
    db,
    task: SprintTask,
    attachment_id: str,
    actor_id: str | None = None,
) -> None:
    """Delete an attachment row + its S3 object. Raises 404 if not found
    or if the attachment doesn't belong to `task`."""
    task_service = SprintTaskService(db)
    attachment = await task_service.get_attachment(attachment_id)
    if not attachment or str(attachment.task_id) != str(task.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    storage = get_storage_service()
    if storage.is_configured():
        key = storage.key_from_url(attachment.file_url)
        if key:
            await storage.delete_object(key)
        else:
            logger.warning(
                "Could not derive storage key from attachment URL %s; "
                "skipping object delete",
                attachment.file_url,
            )

    await task_service.delete_attachment(attachment_id, actor_id=actor_id)
    await db.commit()
    if task.workspace_id:
        await StorageQuotaService(db).invalidate_workspace_usage(str(task.workspace_id))
