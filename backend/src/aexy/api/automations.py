"""Platform-wide Automations API routes.

Provides generic /workspaces/{workspace_id}/automations/* endpoints
that support all Aexy modules (CRM, Tickets, Hiring, Email Marketing, etc.).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.automation_service import (
    AutomationService,
    filter_actions_by_integrations,
)
from aexy.services.workflow_generator import generate_workflow_from_prompt
from aexy.services.workspace_service import WorkspaceService
from aexy.schemas.automation import (
    AutomationCreate,
    AutomationUpdate,
    AutomationResponse,
    AutomationRunResponse,
    AutomationModule,
    TriggerRegistryResponse,
    ActionRegistryResponse,
    ModuleTriggersResponse,
    ModuleActionsResponse,
    get_all_triggers,
    get_all_actions,
    get_triggers_for_module,
    get_actions_for_module,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/automations")


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
# REGISTRY ENDPOINTS (for frontend to discover available triggers/actions)
# =============================================================================

@router.get("/registry/triggers", response_model=TriggerRegistryResponse)
async def get_trigger_registry(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get all available triggers organized by module."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    return TriggerRegistryResponse(triggers=get_all_triggers())


@router.get("/registry/actions", response_model=ActionRegistryResponse)
async def get_action_registry(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get all available actions organized by module."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    return ActionRegistryResponse(actions=get_all_actions())


@router.get("/registry/modules/{module}/triggers", response_model=ModuleTriggersResponse)
async def get_module_triggers(
    workspace_id: str,
    module: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get available triggers for a specific module."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    return ModuleTriggersResponse(
        module=module,
        triggers=get_triggers_for_module(module),
    )


@router.get("/registry/modules/{module}/actions", response_model=ModuleActionsResponse)
async def get_module_actions(
    workspace_id: str,
    module: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get available actions for a specific module.

    Integration-backed actions are dropped when the workspace has not
    connected the integration they need, so the palette never offers a step
    that could only fail.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    actions = await filter_actions_by_integrations(
        db, workspace_id, get_actions_for_module(module)
    )
    return ModuleActionsResponse(module=module, actions=actions)


# =============================================================================
# AUTOMATION CRUD
# =============================================================================

@router.post("", response_model=AutomationResponse, status_code=status.HTTP_201_CREATED)
async def create_automation(
    workspace_id: str,
    data: AutomationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new automation.

    The `module` field determines which Aexy module this automation belongs to:
    - crm: CRM records, stages, activities
    - tickets: Support tickets, SLAs
    - hiring: Candidates, requirements
    - email_marketing: Campaigns, recipients
    - uptime: Monitors, incidents
    - sprints: Tasks, sprints
    - forms: Form submissions
    - booking: Bookings, events
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = AutomationService(db)
    # Convert Pydantic models to dicts for JSONB serialization
    conditions = [c.model_dump() for c in data.conditions] if data.conditions else None
    actions = [a.model_dump() for a in data.actions]

    from aexy.services.workflow_service import validate_action_configs

    action_errors = validate_action_configs(actions)
    if action_errors:
        raise HTTPException(status_code=400, detail="; ".join(action_errors))

    automation = await service.create_automation(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        module=data.module,
        module_config=data.module_config,
        object_id=data.object_id,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        conditions=conditions,
        actions=actions,
        error_handling=data.error_handling,
        run_limit_per_month=data.run_limit_per_month,
        is_active=data.is_active,
        created_by_id=current_user.id,
    )
    return automation


@router.get("", response_model=list[AutomationResponse])
async def list_automations(
    workspace_id: str,
    module: AutomationModule | None = Query(None, description="Filter by module (crm, tickets, hiring, etc.)"),
    object_id: str | None = Query(None, description="Filter by object/entity ID"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List automations for a workspace.

    Supports filtering by module to get only CRM, Tickets, or other module automations.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = AutomationService(db)
    automations = await service.list_automations(
        workspace_id=workspace_id,
        module=module,
        object_id=object_id,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )
    return automations


@router.get("/{automation_id}", response_model=AutomationResponse)
async def get_automation(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an automation by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = AutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")
    return automation


@router.patch("/{automation_id}", response_model=AutomationResponse)
async def update_automation(
    workspace_id: str,
    automation_id: str,
    data: AutomationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = AutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    automation = await service.update_automation(
        automation_id=automation_id,
        **data.model_dump(exclude_unset=True),
    )
    return automation


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = AutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    await service.delete_automation(automation_id)


@router.post("/{automation_id}/toggle", response_model=AutomationResponse)
async def toggle_automation(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Toggle automation active status."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = AutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    automation = await service.toggle_automation(automation_id)
    return automation


@router.post("/{automation_id}/trigger")
async def trigger_automation_manually(
    workspace_id: str,
    automation_id: str,
    record_id: str | None = Query(None, description="Record/entity ID to trigger automation for"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Manually trigger an automation.

    For CRM automations, provide a record_id.
    For other modules, provide the relevant entity ID.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = AutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    # Run in background on its own session: the request's session is torn down
    # before background tasks run, so borrowing it leaves this work uncommitted.
    async def run_automation():
        from aexy.core.database import get_async_session
        from aexy.services.automation_email_outbox import drain_outbox

        async with get_async_session() as task_db:
            run = await AutomationService(task_db).trigger_automation(
                automation_id=automation_id,
                record_id=record_id,
                trigger_data={
                    "manual_trigger": True,
                    "triggered_by": current_user.id,
                    "module": automation.module,
                },
            )
        # Committed by the context manager above; hand this run's queued
        # email over. Scoped to the run: one admin pressing a button must not
        # pick up every other workspace's pending work.
        await drain_outbox(run_id=str(run.id))

    background_tasks.add_task(run_automation)

    return {
        "message": "Automation triggered",
        "automation_id": automation_id,
        "record_id": record_id,
        "module": automation.module,
    }


# =============================================================================
# AUTOMATION RUNS
# =============================================================================

@router.get("/{automation_id}/runs", response_model=list[AutomationRunResponse])
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

    service = AutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation not found")

    runs = await service.list_automation_runs(
        automation_id=automation_id,
        skip=skip,
        limit=limit,
    )
    return runs


@router.get("/runs/{run_id}", response_model=AutomationRunResponse)
async def get_automation_run(
    workspace_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a specific automation run."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = AutomationService(db)
    run = await service.get_automation_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Automation run not found")

    # Verify workspace access through automation
    automation = await service.get_automation(run.automation_id)
    if not automation or automation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Automation run not found")

    return run


# =============================================================================
# WORKFLOW GENERATION (UX-DEF-004)
# =============================================================================

class WorkflowFromPromptRequest(BaseModel):
    """Generate a workflow draft from a one-line description."""

    prompt: str = Field(..., min_length=8, max_length=2000)
    module: str | None = None


@router.post("/generate-workflow")
async def generate_workflow(
    workspace_id: str,
    data: WorkflowFromPromptRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Generate a ReactFlow {nodes, edges} draft from a prompt.

    The frontend uses this as a third creation path alongside
    TemplateGallery and "start blank". The LLM is a starting point —
    the canvas validates the result and the user can rewire anything.
    Errors here are user-facing (bad prompt / LLM rate-limit /
    malformed response); the caller falls back to TemplateGallery.
    """
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    try:
        payload = await generate_workflow_from_prompt(
            prompt=data.prompt,
            module=data.module,
            workspace_id=workspace_id,
            developer_id=str(current_developer.id),
            db=db,
        )
        return payload
    except ValueError as e:
        # Validation / shape failures — surface to the user so they
        # can retry with a clearer prompt.
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        logger.exception("workflow generation failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Workflow generation failed. Try again or start from a template.",
        )
