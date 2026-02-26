"""GTM Outreach Sequence, Reply Classification, Personalization, and Bulk Import API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    # Outreach schemas
    CreateSequenceRequest,
    UpdateSequenceRequest,
    SequenceResponse,
    SequenceListResponse,
    EnrollContactRequest,
    BulkEnrollRequest,
    EnrollmentResponse,
    EnrollmentListResponse,
    BulkEnrollResponse,
    StepExecutionResponse,
    SequenceAnalyticsResponse,
    # Reply classification schemas
    ClassifyReplyRequest,
    ReplyClassificationResponse,
    ReplyClassificationStatsResponse,
    # Bulk import schemas
    BulkImportRequest,
    BulkImportResponse,
    BulkImportAsyncResponse,
)
from aexy.services.outreach_sequence_service import OutreachSequenceService

from ._shared import check_workspace_permission

router = APIRouter()


# =============================================================================
# OUTREACH SEQUENCE ENDPOINTS
# =============================================================================

@router.post("/sequences", response_model=SequenceResponse, status_code=201)
async def create_sequence(
    workspace_id: str,
    data: CreateSequenceRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new outreach sequence."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    sequence = await service.create_sequence(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        steps=[s.model_dump() for s in data.steps],
        settings=data.settings.model_dump() if data.settings else {},
        channels=data.channels,
        created_by=current_user.id,
    )
    await db.commit()
    return sequence


@router.get("/sequences", response_model=SequenceListResponse)
async def list_sequences(
    workspace_id: str,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List outreach sequences."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    items, total = await service.list_sequences(workspace_id, status=status, page=page, per_page=per_page)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/sequences/{sequence_id}", response_model=SequenceResponse)
async def get_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get sequence details."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    sequence = await service.get_sequence(workspace_id, sequence_id)
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return sequence


@router.put("/sequences/{sequence_id}", response_model=SequenceResponse)
async def update_sequence(
    workspace_id: str,
    sequence_id: str,
    data: UpdateSequenceRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an outreach sequence."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    kwargs = {}
    if data.name is not None:
        kwargs["name"] = data.name
    if data.description is not None:
        kwargs["description"] = data.description
    if data.steps is not None:
        kwargs["steps"] = [s.model_dump() for s in data.steps]
    if data.settings is not None:
        kwargs["settings"] = data.settings.model_dump()
    if data.channels is not None:
        kwargs["channels"] = data.channels
    sequence = await service.update_sequence(workspace_id, sequence_id, **kwargs)
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    await db.commit()
    return sequence


@router.delete("/sequences/{sequence_id}", status_code=204)
async def delete_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a sequence (must be draft or archived)."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    deleted = await service.delete_sequence(workspace_id, sequence_id)
    if not deleted:
        raise HTTPException(status_code=400, detail="Can only delete draft or archived sequences")
    await db.commit()


@router.post("/sequences/{sequence_id}/activate", response_model=SequenceResponse)
async def activate_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Activate a sequence for enrollments."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    sequence = await service.activate_sequence(workspace_id, sequence_id)
    if not sequence:
        raise HTTPException(status_code=400, detail="Cannot activate sequence — must have steps and be in draft/paused status")
    await db.commit()
    await db.refresh(sequence)
    return sequence


@router.post("/sequences/{sequence_id}/pause", response_model=SequenceResponse)
async def pause_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pause an active sequence and all its enrollments."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    sequence = await service.pause_sequence(workspace_id, sequence_id)
    if not sequence:
        raise HTTPException(status_code=400, detail="Sequence is not active")
    await db.commit()
    await db.refresh(sequence)
    return sequence


# --- Enrollment Endpoints ---

@router.post("/sequences/{sequence_id}/enroll", response_model=EnrollmentResponse, status_code=201)
async def enroll_contact(
    workspace_id: str,
    sequence_id: str,
    data: EnrollContactRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Enroll a contact in a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    enrollment = await service.enroll_contact(
        workspace_id=workspace_id,
        sequence_id=sequence_id,
        record_id=data.record_id,
        email=data.email,
        contact_name=data.contact_name,
    )
    if isinstance(enrollment, dict) and "error" in enrollment:
        raise HTTPException(status_code=400, detail=enrollment["error"])
    await db.commit()
    return enrollment


@router.post("/sequences/{sequence_id}/bulk-enroll", response_model=BulkEnrollResponse)
async def bulk_enroll(
    workspace_id: str,
    sequence_id: str,
    data: BulkEnrollRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk enroll contacts in a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    try:
        result = await service.bulk_enroll(
            workspace_id=workspace_id,
            sequence_id=sequence_id,
            contacts=[c.model_dump() for c in data.contacts],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    return result


@router.get("/sequences/{sequence_id}/enrollments", response_model=EnrollmentListResponse)
async def list_enrollments(
    workspace_id: str,
    sequence_id: str,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List enrollments for a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    items, total = await service.list_enrollments(workspace_id, sequence_id, status=status, page=page, per_page=per_page)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.post("/enrollments/{enrollment_id}/pause", status_code=200)
async def pause_enrollment(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pause a single enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    ok = await service.pause_enrollment(workspace_id, enrollment_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot pause enrollment")
    await db.commit()
    return {"success": True}


@router.post("/enrollments/{enrollment_id}/resume", status_code=200)
async def resume_enrollment(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    ok = await service.resume_enrollment(workspace_id, enrollment_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot resume enrollment")
    await db.commit()
    return {"success": True}


@router.delete("/enrollments/{enrollment_id}", status_code=200)
async def unenroll_contact(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unenroll a contact from a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    ok = await service.unenroll_contact(workspace_id, enrollment_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot unenroll contact")
    await db.commit()
    return {"success": True}


@router.get("/enrollments/{enrollment_id}/timeline", response_model=list[StepExecutionResponse])
async def get_enrollment_timeline(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get step execution timeline for an enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    return await service.get_enrollment_timeline(workspace_id, enrollment_id)


@router.get("/sequences/{sequence_id}/analytics", response_model=SequenceAnalyticsResponse)
async def get_sequence_analytics(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics for a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    return await service.get_sequence_analytics(workspace_id, sequence_id)


# =============================================================================
# REPLY CLASSIFICATION ENDPOINTS
# =============================================================================

@router.post("/replies/classify", response_model=ReplyClassificationResponse)
async def classify_reply(
    workspace_id: str,
    data: ClassifyReplyRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Classify a reply and execute auto-actions."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.reply_classification_service import ReplyClassificationService
    service = ReplyClassificationService(db)
    result = await service.classify_reply(
        workspace_id, data.enrollment_id, data.reply_text, data.reply_from,
    )
    await db.commit()
    return result


@router.post("/replies/{enrollment_id}/action")
async def execute_reply_action(
    workspace_id: str,
    enrollment_id: str,
    category: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually execute a reply action for an enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.reply_classification_service import ReplyClassificationService
    service = ReplyClassificationService(db)
    result = await service.execute_action(workspace_id, enrollment_id, category)
    await db.commit()
    return result


@router.get("/replies/stats", response_model=ReplyClassificationStatsResponse)
async def get_reply_stats(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get reply classification statistics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.reply_classification_service import ReplyClassificationService
    service = ReplyClassificationService(db)
    return await service.get_classification_stats(workspace_id, days=days)


# =============================================================================
# PERSONALIZATION ENDPOINTS
# =============================================================================

@router.post("/sequences/{sequence_id}/personalize")
async def batch_personalize_sequence(
    workspace_id: str,
    sequence_id: str,
    step_index: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger batch personalization for a sequence's enrollments."""
    await check_workspace_permission(workspace_id, current_user, db)

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    wf_id = await dispatch(
        "personalize_outreach_batch",
        {"workspace_id": workspace_id, "sequence_id": sequence_id, "step_index": step_index, "limit": limit},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Batch personalization started"}


@router.get("/sequences/{sequence_id}/enrollments/{enrollment_id}/personalization")
async def get_personalization_preview(
    workspace_id: str,
    sequence_id: str,
    enrollment_id: str,
    step_index: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get personalization preview for a specific enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.outreach_personalization_service import OutreachPersonalizationService
    service = OutreachPersonalizationService(db)
    return await service.get_personalization_preview(workspace_id, sequence_id, enrollment_id, step_index)


# =============================================================================
# BULK IMPORT ENDPOINTS
# =============================================================================

@router.post("/import", response_model=BulkImportResponse)
async def import_csv_sync(
    workspace_id: str,
    data: BulkImportRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import contacts from CSV synchronously (for small imports <500 rows)."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.bulk_import_service import BulkImportService
    service = BulkImportService(db)
    job = await service.run_import(
        workspace_id=workspace_id,
        csv_content=data.csv_content,
        verify_emails=data.verify_emails,
        skip_duplicates=data.skip_duplicates,
        sequence_id=data.sequence_id,
        object_slug=data.object_slug,
    )
    return service.get_job_summary(job)


@router.post("/import/async", response_model=BulkImportAsyncResponse)
async def import_csv_async(
    workspace_id: str,
    data: BulkImportRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import contacts from CSV asynchronously (for large imports).

    Returns a workflow ID that can be used to check import status.
    CSV content must be under 1.5MB to fit within Temporal's payload limit.
    """
    await check_workspace_permission(workspace_id, current_user, db)

    # Temporal has a ~2MB payload limit. Reject CSV that would exceed it
    # (accounting for JSON serialization overhead).
    csv_size = len(data.csv_content.encode("utf-8"))
    if csv_size > 1_500_000:
        raise HTTPException(
            status_code=413,
            detail=(
                f"CSV content is {csv_size / 1_000_000:.1f}MB which exceeds the 1.5MB limit "
                f"for async import. Use the synchronous /import endpoint for large files."
            ),
        )

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    wf_id = await dispatch(
        "run_bulk_import",
        {
            "workspace_id": workspace_id,
            "csv_content": data.csv_content,
            "verify_emails": data.verify_emails,
            "skip_duplicates": data.skip_duplicates,
            "sequence_id": data.sequence_id or "",
            "object_slug": data.object_slug,
        },
        task_queue=TaskQueue.OPERATIONS,
    )
    return BulkImportAsyncResponse(workflow_id=wf_id, message="Import job started")
