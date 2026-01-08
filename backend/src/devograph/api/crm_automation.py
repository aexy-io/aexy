"""CRM Automation, Sequences, and Webhooks API routes."""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.crm_automation_service import (
    CRMAutomationService,
    CRMSequenceService,
    CRMWebhookService,
)
from aexy.schemas.crm import (
    # Automation schemas
    CRMAutomationCreate,
    CRMAutomationUpdate,
    CRMAutomationResponse,
    CRMAutomationRunResponse,
    # Sequence schemas
    CRMSequenceCreate,
    CRMSequenceUpdate,
    CRMSequenceResponse,
    CRMSequenceStepCreate,
    CRMSequenceStepUpdate,
    CRMSequenceStepResponse,
    CRMSequenceEnrollmentCreate,
    CRMSequenceEnrollmentResponse,
    # Webhook schemas
    CRMWebhookCreate,
    CRMWebhookUpdate,
    CRMWebhookResponse,
    CRMWebhookDeliveryResponse,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/crm")


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(developer_id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


# =============================================================================
# AUTOMATION ROUTES
# =============================================================================

@router.post("/automations", response_model=CRMAutomationResponse, status_code=status.HTTP_201_CREATED)
async def create_automation(
    workspace_id: str,
    data: CRMAutomationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMAutomationService(db)
    automation = await service.create_automation(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        object_id=data.object_id,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        conditions=data.conditions,
        actions=data.actions,
        created_by_id=current_user.id,
    )
    return automation


@router.get("/automations", response_model=list[CRMAutomationResponse])
async def list_automations(
    workspace_id: str,
    object_id: str | None = None,
    is_active: bool | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List automations for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMAutomationService(db)
    automations = await service.list_automations(
        workspace_id=workspace_id,
        object_id=object_id,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )
    return automations


@router.get("/automations/{automation_id}", response_model=CRMAutomationResponse)
async def get_automation(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an automation by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")
    return automation


@router.patch("/automations/{automation_id}", response_model=CRMAutomationResponse)
async def update_automation(
    workspace_id: str,
    automation_id: str,
    data: CRMAutomationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    automation = await service.update_automation(
        automation_id=automation_id,
        **data.model_dump(exclude_unset=True),
    )
    return automation


@router.delete("/automations/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    await service.delete_automation(automation_id)


@router.post("/automations/{automation_id}/toggle", response_model=CRMAutomationResponse)
async def toggle_automation(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Toggle automation active status."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    automation = await service.toggle_automation(automation_id)
    return automation


@router.post("/automations/{automation_id}/trigger")
async def trigger_automation_manually(
    workspace_id: str,
    automation_id: str,
    record_id: str = Query(..., description="Record ID to trigger automation for"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Manually trigger an automation for a specific record."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    # Run in background
    async def run_automation():
        async_service = CRMAutomationService(db)
        await async_service.trigger_automation(
            automation_id=automation_id,
            record_id=record_id,
            trigger_data={"manual_trigger": True, "triggered_by": current_user.id},
        )

    background_tasks.add_task(run_automation)

    return {"message": "Automation triggered", "automation_id": automation_id, "record_id": record_id}


@router.get("/automations/{automation_id}/runs", response_model=list[CRMAutomationRunResponse])
async def list_automation_runs(
    workspace_id: str,
    automation_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List runs for an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    runs = await service.list_automation_runs(
        automation_id=automation_id,
        skip=skip,
        limit=limit,
    )
    return runs


@router.get("/automation-runs/{run_id}", response_model=CRMAutomationRunResponse)
async def get_automation_run(
    workspace_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a specific automation run."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMAutomationService(db)
    run = await service.get_automation_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Automation run not found")

    # Verify workspace access through automation
    automation = await service.get_automation(run.automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation run not found")

    return run


# =============================================================================
# SEQUENCE ROUTES
# =============================================================================

@router.post("/sequences", response_model=CRMSequenceResponse, status_code=status.HTTP_201_CREATED)
async def create_sequence(
    workspace_id: str,
    data: CRMSequenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    sequence = await service.create_sequence(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        object_id=data.object_id,
        created_by_id=current_user.id,
    )
    return sequence


@router.get("/sequences", response_model=list[CRMSequenceResponse])
async def list_sequences(
    workspace_id: str,
    object_id: str | None = None,
    is_active: bool | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List sequences for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    sequences = await service.list_sequences(
        workspace_id=workspace_id,
        object_id=object_id,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )
    return sequences


@router.get("/sequences/{sequence_id}", response_model=CRMSequenceResponse)
async def get_sequence(
    workspace_id: str,
    sequence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a sequence by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return sequence


@router.patch("/sequences/{sequence_id}", response_model=CRMSequenceResponse)
async def update_sequence(
    workspace_id: str,
    sequence_id: str,
    data: CRMSequenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    sequence = await service.update_sequence(
        sequence_id=sequence_id,
        **data.model_dump(exclude_unset=True),
    )
    return sequence


@router.delete("/sequences/{sequence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sequence(
    workspace_id: str,
    sequence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    await service.delete_sequence(sequence_id)


@router.post("/sequences/{sequence_id}/toggle", response_model=CRMSequenceResponse)
async def toggle_sequence(
    workspace_id: str,
    sequence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Toggle sequence active status."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    sequence = await service.toggle_sequence(sequence_id)
    return sequence


# =============================================================================
# SEQUENCE STEP ROUTES
# =============================================================================

@router.post("/sequences/{sequence_id}/steps", response_model=CRMSequenceStepResponse, status_code=status.HTTP_201_CREATED)
async def create_sequence_step(
    workspace_id: str,
    sequence_id: str,
    data: CRMSequenceStepCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Add a step to a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    step = await service.add_step(
        sequence_id=sequence_id,
        step_type=data.step_type,
        config=data.config,
        delay_days=data.delay_days,
        delay_hours=data.delay_hours,
        order=data.order,
    )
    return step


@router.get("/sequences/{sequence_id}/steps", response_model=list[CRMSequenceStepResponse])
async def list_sequence_steps(
    workspace_id: str,
    sequence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List steps in a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    steps = await service.list_steps(sequence_id)
    return steps


@router.patch("/sequence-steps/{step_id}", response_model=CRMSequenceStepResponse)
async def update_sequence_step(
    workspace_id: str,
    step_id: str,
    data: CRMSequenceStepUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a sequence step."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    step = await service.get_step(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(step.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Step not found")

    step = await service.update_step(
        step_id=step_id,
        **data.model_dump(exclude_unset=True),
    )
    return step


@router.delete("/sequence-steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sequence_step(
    workspace_id: str,
    step_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a sequence step."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    step = await service.get_step(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(step.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Step not found")

    await service.delete_step(step_id)


@router.post("/sequence-steps/{step_id}/reorder")
async def reorder_sequence_step(
    workspace_id: str,
    step_id: str,
    new_order: int = Query(..., ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Reorder a sequence step."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMSequenceService(db)
    step = await service.get_step(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(step.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Step not found")

    await service.reorder_steps(step.sequence_id, step_id, new_order)

    # Return updated steps
    steps = await service.list_steps(step.sequence_id)
    return {"steps": [CRMSequenceStepResponse.model_validate(s) for s in steps]}


# =============================================================================
# SEQUENCE ENROLLMENT ROUTES
# =============================================================================

@router.post("/sequences/{sequence_id}/enroll", response_model=CRMSequenceEnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def enroll_in_sequence(
    workspace_id: str,
    sequence_id: str,
    data: CRMSequenceEnrollmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Enroll a record in a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    enrollment = await service.enroll_record(
        sequence_id=sequence_id,
        record_id=data.record_id,
        enrolled_by_id=current_user.id,
    )
    return enrollment


@router.get("/sequences/{sequence_id}/enrollments", response_model=list[CRMSequenceEnrollmentResponse])
async def list_sequence_enrollments(
    workspace_id: str,
    sequence_id: str,
    status_filter: str | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List enrollments in a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    sequence = await service.get_sequence(sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sequence not found")

    enrollments = await service.list_enrollments(
        sequence_id=sequence_id,
        status=status_filter,
        skip=skip,
        limit=limit,
    )
    return enrollments


@router.get("/enrollments/{enrollment_id}", response_model=CRMSequenceEnrollmentResponse)
async def get_enrollment(
    workspace_id: str,
    enrollment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an enrollment by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    enrollment = await service.get_enrollment(enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(enrollment.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    return enrollment


@router.post("/enrollments/{enrollment_id}/pause", response_model=CRMSequenceEnrollmentResponse)
async def pause_enrollment(
    workspace_id: str,
    enrollment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Pause an enrollment."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    enrollment = await service.get_enrollment(enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(enrollment.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    enrollment = await service.pause_enrollment(enrollment_id)
    return enrollment


@router.post("/enrollments/{enrollment_id}/resume", response_model=CRMSequenceEnrollmentResponse)
async def resume_enrollment(
    workspace_id: str,
    enrollment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Resume a paused enrollment."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    enrollment = await service.get_enrollment(enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(enrollment.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    enrollment = await service.resume_enrollment(enrollment_id)
    return enrollment


@router.post("/enrollments/{enrollment_id}/unenroll", response_model=CRMSequenceEnrollmentResponse)
async def unenroll_from_sequence(
    workspace_id: str,
    enrollment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Unenroll a record from a sequence."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMSequenceService(db)
    enrollment = await service.get_enrollment(enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Verify workspace through sequence
    sequence = await service.get_sequence(enrollment.sequence_id)
    if not sequence or sequence.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    enrollment = await service.unenroll(enrollment_id)
    return enrollment


# =============================================================================
# WEBHOOK ROUTES
# =============================================================================

@router.post("/webhooks", response_model=CRMWebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    workspace_id: str,
    data: CRMWebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new webhook subscription."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    webhook = await service.create_webhook(
        workspace_id=workspace_id,
        name=data.name,
        url=data.url,
        events=data.events,
        object_id=data.object_id,
        headers=data.headers,
        created_by_id=current_user.id,
    )
    return webhook


@router.get("/webhooks", response_model=list[CRMWebhookResponse])
async def list_webhooks(
    workspace_id: str,
    object_id: str | None = None,
    is_active: bool | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List webhooks for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMWebhookService(db)
    webhooks = await service.list_webhooks(
        workspace_id=workspace_id,
        object_id=object_id,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )
    return webhooks


@router.get("/webhooks/{webhook_id}", response_model=CRMWebhookResponse)
async def get_webhook(
    workspace_id: str,
    webhook_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a webhook by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.patch("/webhooks/{webhook_id}", response_model=CRMWebhookResponse)
async def update_webhook(
    workspace_id: str,
    webhook_id: str,
    data: CRMWebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a webhook."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")

    webhook = await service.update_webhook(
        webhook_id=webhook_id,
        **data.model_dump(exclude_unset=True),
    )
    return webhook


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    workspace_id: str,
    webhook_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a webhook."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await service.delete_webhook(webhook_id)


@router.post("/webhooks/{webhook_id}/toggle", response_model=CRMWebhookResponse)
async def toggle_webhook(
    workspace_id: str,
    webhook_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Toggle webhook active status."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")

    webhook = await service.toggle_webhook(webhook_id)
    return webhook


@router.post("/webhooks/{webhook_id}/rotate-secret", response_model=CRMWebhookResponse)
async def rotate_webhook_secret(
    workspace_id: str,
    webhook_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Rotate the webhook signing secret."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")

    webhook = await service.rotate_secret(webhook_id)
    return webhook


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(
    workspace_id: str,
    webhook_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Send a test webhook delivery."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")

    # Send test payload
    test_payload = {
        "event": "test",
        "workspace_id": workspace_id,
        "webhook_id": webhook_id,
        "timestamp": "2024-01-01T00:00:00Z",
        "data": {
            "message": "This is a test webhook delivery",
            "triggered_by": current_user.id,
        },
    }

    async def send_test():
        async_service = CRMWebhookService(db)
        await async_service.deliver_webhook(webhook_id, test_payload)

    background_tasks.add_task(send_test)

    return {"message": "Test webhook queued", "webhook_id": webhook_id}


@router.get("/webhooks/{webhook_id}/deliveries", response_model=list[CRMWebhookDeliveryResponse])
async def list_webhook_deliveries(
    workspace_id: str,
    webhook_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List deliveries for a webhook."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMWebhookService(db)
    webhook = await service.get_webhook(webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Webhook not found")

    deliveries = await service.list_deliveries(
        webhook_id=webhook_id,
        skip=skip,
        limit=limit,
    )
    return deliveries


@router.get("/webhook-deliveries/{delivery_id}", response_model=CRMWebhookDeliveryResponse)
async def get_webhook_delivery(
    workspace_id: str,
    delivery_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a specific webhook delivery."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CRMWebhookService(db)
    delivery = await service.get_delivery(delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    # Verify workspace through webhook
    webhook = await service.get_webhook(delivery.webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Delivery not found")

    return delivery


@router.post("/webhook-deliveries/{delivery_id}/retry")
async def retry_webhook_delivery(
    workspace_id: str,
    delivery_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Retry a failed webhook delivery."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CRMWebhookService(db)
    delivery = await service.get_delivery(delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    # Verify workspace through webhook
    webhook = await service.get_webhook(delivery.webhook_id)
    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Delivery not found")

    async def retry_delivery():
        async_service = CRMWebhookService(db)
        await async_service.retry_delivery(delivery_id)

    background_tasks.add_task(retry_delivery)

    return {"message": "Retry queued", "delivery_id": delivery_id}
