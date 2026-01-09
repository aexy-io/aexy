"""Workflow API routes for visual automation builder."""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.workflow import NODE_TYPES, CONDITION_OPERATORS
from aexy.services.workflow_service import WorkflowService, WorkflowExecutor
from aexy.services.workspace_service import WorkspaceService
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.schemas.workflow import (
    WorkflowDefinitionCreate,
    WorkflowDefinitionUpdate,
    WorkflowDefinitionResponse,
    WorkflowExecutionRequest,
    WorkflowExecutionResponse,
    WorkflowValidationResult,
    WorkflowExecutionContext,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/crm/automations/{automation_id}/workflow")


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


async def check_automation_exists(
    db: AsyncSession,
    automation_id: str,
    workspace_id: str,
) -> None:
    """Check if automation exists and belongs to workspace."""
    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )
    if automation.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Automation does not belong to this workspace",
        )


# =============================================================================
# WORKFLOW DEFINITION ROUTES
# =============================================================================


@router.get("", response_model=WorkflowDefinitionResponse)
async def get_workflow(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get the workflow definition for an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        # Return empty workflow if none exists
        workflow = await service.create_workflow(automation_id)

    return workflow


@router.put("", response_model=WorkflowDefinitionResponse)
async def update_workflow(
    workspace_id: str,
    automation_id: str,
    data: WorkflowDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update the workflow definition for an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)

    # Validate if nodes and edges are provided
    if data.nodes is not None and data.edges is not None:
        nodes = [n.model_dump() for n in data.nodes]
        edges = [e.model_dump(by_alias=True) for e in data.edges]
        validation = service.validate_workflow(nodes, edges)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Workflow validation failed",
                    "errors": [e.model_dump() for e in validation.errors],
                },
            )

    workflow = await service.update_workflow_by_automation(
        automation_id=automation_id,
        nodes=[n.model_dump() for n in data.nodes] if data.nodes else None,
        edges=[e.model_dump(by_alias=True) for e in data.edges] if data.edges else None,
        viewport=data.viewport.model_dump() if data.viewport else None,
    )

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update workflow",
        )

    return workflow


@router.post("/validate", response_model=WorkflowValidationResult)
async def validate_workflow(
    workspace_id: str,
    automation_id: str,
    data: WorkflowDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Validate a workflow definition without saving."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = WorkflowService(db)
    nodes = [n.model_dump() for n in data.nodes]
    edges = [e.model_dump(by_alias=True) for e in data.edges]
    return service.validate_workflow(nodes, edges)


@router.post("/publish", response_model=WorkflowDefinitionResponse)
async def publish_workflow(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Publish a workflow (make it live)."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Validate before publishing
    validation = service.validate_workflow(workflow.nodes, workflow.edges)
    if not validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Cannot publish invalid workflow",
                "errors": [e.model_dump() for e in validation.errors],
            },
        )

    workflow = await service.publish_workflow(workflow.id)
    return workflow


@router.post("/unpublish", response_model=WorkflowDefinitionResponse)
async def unpublish_workflow(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Unpublish a workflow."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    workflow = await service.unpublish_workflow(workflow.id)
    return workflow


# =============================================================================
# WORKFLOW EXECUTION ROUTES
# =============================================================================


@router.post("/execute", response_model=WorkflowExecutionResponse)
async def execute_workflow(
    workspace_id: str,
    automation_id: str,
    data: WorkflowExecutionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Manually execute a workflow."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    if not workflow.is_published and not data.dry_run:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot execute unpublished workflow. Use dry_run=true for testing.",
        )

    # Build execution context
    context = WorkflowExecutionContext(
        record_id=data.record_id,
        trigger_data={
            "workspace_id": workspace_id,
            "triggered_by": current_user.id,
            **data.trigger_data,
        },
        variables=data.variables,
    )

    # Load record data if record_id provided
    if data.record_id:
        from aexy.services.crm_service import CRMRecordService

        record_service = CRMRecordService(db)
        record = await record_service.get_record(data.record_id)
        if record:
            context.record_data = {
                "id": record.id,
                "object_id": record.object_id,
                "values": record.values,
                "owner_id": record.owner_id,
            }

    # Execute workflow
    from datetime import datetime, timezone
    from uuid import uuid4

    executor = WorkflowExecutor(db)
    results = await executor.execute_workflow(automation_id, context)

    # Determine overall status
    final_status = "completed"
    error = None
    for result in results:
        if result.status == "failed":
            final_status = "failed"
            error = result.error
            break

    return WorkflowExecutionResponse(
        execution_id=str(uuid4()),
        automation_id=automation_id,
        status=final_status,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        node_results=results,
        final_context=context.model_dump(),
        error=error,
    )


# =============================================================================
# WORKFLOW METADATA ROUTES
# =============================================================================


@router.get("/node-types")
async def get_node_types(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get available node types for the workflow builder."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    return {
        "node_types": NODE_TYPES,
        "condition_operators": CONDITION_OPERATORS,
    }


# =============================================================================
# STANDALONE WORKFLOW ROUTES (for listing all workflows)
# =============================================================================

workflows_router = APIRouter(prefix="/workspaces/{workspace_id}/crm/workflows")


@workflows_router.get("", response_model=list[WorkflowDefinitionResponse])
async def list_workflows(
    workspace_id: str,
    is_published: bool | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List all workflows in a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from sqlalchemy import select
    from aexy.models.workflow import WorkflowDefinition
    from aexy.models.crm import CRMAutomation

    stmt = (
        select(WorkflowDefinition)
        .join(CRMAutomation)
        .where(CRMAutomation.workspace_id == workspace_id)
    )

    if is_published is not None:
        stmt = stmt.where(WorkflowDefinition.is_published == is_published)

    stmt = stmt.order_by(WorkflowDefinition.updated_at.desc())

    result = await db.execute(stmt)
    return list(result.scalars().all())
