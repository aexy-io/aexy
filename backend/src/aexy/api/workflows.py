"""Workflow API routes for visual automation builder."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from sqlalchemy import select, and_, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.workflow import (
    NODE_TYPES,
    CONDITION_OPERATORS,
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowExecutionStatus,
)
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
    WorkflowExecutionListResponse,
    WorkflowExecutionDetailResponse,
    WorkflowExecutionStepResponse,
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
    # Capture values before any potential rollback (ORM objects become detached after rollback)
    user_id = current_user.id

    await check_workspace_permission(db, workspace_id, user_id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)

    # Pre-process data to avoid accessing Pydantic models after potential rollback
    nodes_data = [n.model_dump() for n in data.nodes] if data.nodes else None
    edges_data = [e.model_dump(by_alias=True) for e in data.edges] if data.edges else None
    viewport_data = data.viewport.model_dump() if data.viewport else None

    # Validate if nodes and edges are provided
    if nodes_data is not None and edges_data is not None:
        validation = service.validate_workflow(nodes_data, edges_data)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Workflow validation failed",
                    "errors": [e.model_dump() for e in validation.errors],
                },
            )

    # Get existing workflow to update properly
    workflow = await service.get_workflow_by_automation(automation_id)
    if workflow:
        workflow = await service.update_workflow(
            workflow_id=workflow.id,
            nodes=nodes_data,
            edges=edges_data,
            viewport=viewport_data,
            created_by=user_id,
        )
    else:
        try:
            workflow = await service.create_workflow(
                automation_id=automation_id,
                nodes=nodes_data,
                edges=edges_data,
                viewport=viewport_data,
            )
        except IntegrityError:
            # Race condition: workflow was created between our check and insert
            # Rollback the failed transaction and retry as update
            await db.rollback()
            # Expire all cached objects to ensure we see fresh data
            db.expire_all()
            workflow = await service.get_workflow_by_automation(automation_id)
            if workflow:
                workflow = await service.update_workflow(
                    workflow_id=workflow.id,
                    nodes=nodes_data,
                    edges=edges_data,
                    viewport=viewport_data,
                    created_by=user_id,
                )

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update workflow",
        )

    # Sync workflow nodes to automation's actions array on save
    # This ensures the automation executor can run the workflow actions
    automation_service = CRMAutomationService(db)
    automation = await automation_service.get_automation(automation_id)
    if automation and workflow.nodes:
        # Extract trigger type and config from trigger node
        trigger_type = None
        trigger_config = {}
        for node in workflow.nodes:
            if node.get("type") == "trigger":
                node_data = node.get("data", {})
                trigger_type = node_data.get("trigger_type")
                trigger_config = {
                    k: v for k, v in node_data.items()
                    if k not in ("label", "trigger_type")
                }
                break

        # Convert action nodes to automation actions format
        actions = []
        for node in workflow.nodes:
            if node.get("type") == "action":
                node_data = node.get("data", {})
                action_type = node_data.get("action_type")
                if action_type:
                    # Extract config (all fields except label and action_type)
                    config = {
                        k: v for k, v in node_data.items()
                        if k not in ("label", "action_type")
                    }
                    actions.append({
                        "type": action_type,
                        "config": config,
                    })

        # Update automation with synced trigger_type, trigger_config, and actions
        if trigger_type:
            automation.trigger_type = trigger_type
        automation.trigger_config = trigger_config
        automation.actions = actions
        await db.flush()

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

    # Sync workflow nodes to automation's actions array
    # This ensures the automation executor can run the workflow actions
    automation_service = CRMAutomationService(db)
    automation = await automation_service.get_automation(automation_id)
    if automation:
        # Extract trigger config from trigger node
        trigger_config = {}
        for node in workflow.nodes:
            if node.get("type") == "trigger":
                node_data = node.get("data", {})
                trigger_config = {
                    k: v for k, v in node_data.items()
                    if k not in ("label", "trigger_type")
                }
                break

        # Convert action nodes to automation actions format
        actions = []
        for node in workflow.nodes:
            if node.get("type") == "action":
                node_data = node.get("data", {})
                action_type = node_data.get("action_type")
                if action_type:
                    # Extract config (all fields except label and action_type)
                    config = {
                        k: v for k, v in node_data.items()
                        if k not in ("label", "action_type")
                    }
                    actions.append({
                        "type": action_type,
                        "config": config,
                    })

        # Update automation with synced actions and trigger_config
        automation.trigger_config = trigger_config
        automation.actions = actions
        await db.flush()

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

    # Build trigger data
    trigger_data = {
        "workspace_id": workspace_id,
        "triggered_by": current_user.id,
        **data.trigger_data,
    }

    # Load record data if record_id provided
    record_data = {}
    if data.record_id:
        # Validate UUID format
        import re
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
        if not uuid_pattern.match(data.record_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid record_id format: must be a valid UUID",
            )

        from aexy.services.crm_service import CRMRecordService

        record_service = CRMRecordService(db)
        record = await record_service.get_record(data.record_id)
        if record:
            record_data = {
                "id": record.id,
                "object_id": record.object_id,
                "values": record.values,
                "owner_id": record.owner_id,
            }

    # Only store record_id if the record actually exists (FK constraint)
    # record_data will have 'id' key if a record was found
    actual_record_id = data.record_id if record_data.get("id") else None

    # Create execution record
    execution = WorkflowExecution(
        id=str(uuid4()),
        workflow_id=workflow.id,
        automation_id=automation_id,
        workspace_id=workspace_id,
        record_id=actual_record_id,
        status=WorkflowExecutionStatus.PENDING.value,
        context={
            "record_data": record_data,
            "trigger_data": trigger_data,
            "variables": data.variables,
            "executed_nodes": [],
        },
        trigger_data=trigger_data,
        is_dry_run=data.dry_run,
        triggered_by=current_user.id,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # For dry runs, execute synchronously and return results immediately
    if data.dry_run:
        context = WorkflowExecutionContext(
            workspace_id=workspace_id,
            record_id=data.record_id,
            record_data=record_data,
            trigger_data=trigger_data,
            variables=data.variables,
        )

        executor = WorkflowExecutor(db)
        results = await executor.execute_workflow(automation_id, context)

        # Update execution record
        final_status = "completed"
        error = None
        error_node_id = None
        for result in results:
            if result.status == "failed":
                final_status = "failed"
                error = result.error
                error_node_id = result.node_id
                break

        execution.status = final_status
        execution.started_at = datetime.now(timezone.utc)
        execution.completed_at = datetime.now(timezone.utc)
        execution.error = error
        execution.error_node_id = error_node_id
        await db.commit()

        return WorkflowExecutionResponse(
            execution_id=execution.id,
            automation_id=automation_id,
            workflow_id=workflow.id,
            status=final_status,
            started_at=execution.started_at,
            completed_at=execution.completed_at,
            node_results=results,
            final_context=context.model_dump(),
            error=error,
            error_node_id=error_node_id,
            is_dry_run=True,
        )

    # For real executions, dispatch to Temporal
    from aexy.temporal.client import get_temporal_client
    from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow, CRMWorkflowInput

    client = await get_temporal_client()
    await client.start_workflow(
        CRMAutomationWorkflow.run,
        CRMWorkflowInput(
            execution_id=execution.id,
            workflow_id=workflow.id,
            workspace_id=workspace_id,
            trigger_data=trigger_data,
            record_id=data.record_id if record_data.get("id") else None,
            record_data=record_data,
            nodes=workflow.nodes or [],
            edges=workflow.edges or [],
        ),
        id=f"crm-workflow-{execution.id}",
        task_queue="workflows",
    )

    return WorkflowExecutionResponse(
        execution_id=execution.id,
        automation_id=automation_id,
        workflow_id=workflow.id,
        status="pending",
        started_at=datetime.now(timezone.utc),
        node_results=[],
        final_context={},
        is_dry_run=False,
    )


# =============================================================================
# WORKFLOW EXECUTION HISTORY ROUTES
# =============================================================================


@router.get("/executions", response_model=list[WorkflowExecutionListResponse])
async def list_executions(
    workspace_id: str,
    automation_id: str,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List workflow executions for an automation."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    stmt = (
        select(WorkflowExecution)
        .where(WorkflowExecution.automation_id == automation_id)
        .order_by(desc(WorkflowExecution.created_at))
    )

    if status_filter:
        stmt = stmt.where(WorkflowExecution.status == status_filter)

    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    executions = result.scalars().all()

    return [
        WorkflowExecutionListResponse(
            id=e.id,
            workflow_id=e.workflow_id,
            automation_id=e.automation_id,
            record_id=e.record_id,
            status=e.status,
            started_at=e.started_at,
            completed_at=e.completed_at,
            error=e.error,
            is_dry_run=e.is_dry_run,
            created_at=e.created_at,
        )
        for e in executions
    ]


@router.get("/executions/{execution_id}", response_model=WorkflowExecutionDetailResponse)
async def get_execution(
    workspace_id: str,
    automation_id: str,
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get detailed execution information including steps."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    stmt = (
        select(WorkflowExecution)
        .options(selectinload(WorkflowExecution.steps))
        .where(
            and_(
                WorkflowExecution.id == execution_id,
                WorkflowExecution.automation_id == automation_id,
            )
        )
    )

    result = await db.execute(stmt)
    execution = result.scalar_one_or_none()

    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )

    return WorkflowExecutionDetailResponse(
        id=execution.id,
        workflow_id=execution.workflow_id,
        automation_id=execution.automation_id,
        workspace_id=execution.workspace_id,
        record_id=execution.record_id,
        status=execution.status,
        current_node_id=execution.current_node_id,
        next_node_id=execution.next_node_id,
        context=execution.context or {},
        trigger_data=execution.trigger_data or {},
        resume_at=execution.resume_at,
        wait_event_type=execution.wait_event_type,
        wait_timeout_at=execution.wait_timeout_at,
        started_at=execution.started_at,
        completed_at=execution.completed_at,
        paused_at=execution.paused_at,
        error=execution.error,
        error_node_id=execution.error_node_id,
        is_dry_run=execution.is_dry_run,
        triggered_by=execution.triggered_by,
        created_at=execution.created_at,
        updated_at=execution.updated_at,
        steps=[
            WorkflowExecutionStepResponse(
                id=step.id,
                execution_id=step.execution_id,
                node_id=step.node_id,
                node_type=step.node_type,
                node_label=step.node_label,
                status=step.status,
                input_data=step.input_data,
                output_data=step.output_data,
                condition_result=step.condition_result,
                selected_branch=step.selected_branch,
                error=step.error,
                duration_ms=step.duration_ms,
                executed_at=step.executed_at,
            )
            for step in execution.steps
        ],
    )


@router.post("/executions/{execution_id}/cancel")
async def cancel_execution(
    workspace_id: str,
    automation_id: str,
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Cancel a running or paused execution."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    stmt = select(WorkflowExecution).where(
        and_(
            WorkflowExecution.id == execution_id,
            WorkflowExecution.automation_id == automation_id,
        )
    )
    result = await db.execute(stmt)
    execution = result.scalar_one_or_none()

    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )

    if execution.status in [
        WorkflowExecutionStatus.COMPLETED.value,
        WorkflowExecutionStatus.FAILED.value,
        WorkflowExecutionStatus.CANCELLED.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel execution with status: {execution.status}",
        )

    execution.status = WorkflowExecutionStatus.CANCELLED.value
    execution.completed_at = datetime.now(timezone.utc)
    execution.error = "Cancelled by user"
    await db.commit()

    return {"status": "cancelled", "execution_id": execution_id}


# =============================================================================
# WEBHOOK TRIGGER ROUTES
# =============================================================================


@router.get("/webhook-url")
async def get_webhook_url(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get the webhook URL for this automation's webhook trigger."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    from aexy.core.config import get_settings
    settings = get_settings()

    base_url = settings.api_base_url or "https://api.example.com"
    webhook_url = f"{base_url}/webhooks/automations/{automation_id}/trigger"

    sample_payload = {
        "record_id": "optional-record-id",
        "data": {
            "field1": "value1",
            "field2": "value2",
        },
    }

    return {
        "webhook_url": webhook_url,
        "method": "POST",
        "sample_payload": sample_payload,
        "headers": {
            "Content-Type": "application/json",
        },
        "notes": [
            "POST any JSON payload to trigger the workflow",
            "Optionally include 'record_id' to associate with a CRM record",
            "All payload data is available as trigger.payload in the workflow",
        ],
    }


# =============================================================================
# WORKFLOW VERSION HISTORY ROUTES
# =============================================================================


@router.get("/versions")
async def list_versions(
    workspace_id: str,
    automation_id: str,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    List version history for a workflow.

    Returns a list of saved versions with metadata and change summaries.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    versions = await service.list_versions(workflow.id, limit, offset)

    return {
        "versions": [
            {
                "id": v.id,
                "version": v.version,
                "change_summary": v.change_summary,
                "node_count": v.node_count,
                "edge_count": v.edge_count,
                "created_by": v.created_by,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in versions
        ],
        "current_version": workflow.version,
        "total_count": len(versions),
    }


@router.get("/versions/{version_number}")
async def get_version(
    workspace_id: str,
    automation_id: str,
    version_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Get a specific version of the workflow.

    Returns the full workflow definition at that version.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    version = await service.get_version(workflow.id, version_number)

    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version_number} not found",
        )

    return {
        "id": version.id,
        "version": version.version,
        "nodes": version.nodes,
        "edges": version.edges,
        "viewport": version.viewport,
        "change_summary": version.change_summary,
        "node_count": version.node_count,
        "edge_count": version.edge_count,
        "created_by": version.created_by,
        "created_at": version.created_at.isoformat() if version.created_at else None,
    }


@router.post("/versions/{version_number}/restore")
async def restore_version(
    workspace_id: str,
    automation_id: str,
    version_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Restore the workflow to a specific version.

    Creates a new version based on the selected version's state.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    restored_workflow = await service.restore_version(
        workflow.id,
        version_number,
        created_by=current_user.id,
    )

    if not restored_workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version_number} not found",
        )

    await db.commit()

    return {
        "success": True,
        "message": f"Workflow restored to version {version_number}",
        "new_version": restored_workflow.version,
    }


@router.get("/versions/compare")
async def compare_versions(
    workspace_id: str,
    automation_id: str,
    version_a: int = Query(..., description="First version to compare"),
    version_b: int = Query(..., description="Second version to compare"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Compare two versions of the workflow.

    Returns a diff showing added, removed, and modified nodes/edges.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    v_a = await service.get_version(workflow.id, version_a)
    v_b = await service.get_version(workflow.id, version_b)

    if not v_a:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version_a} not found",
        )

    if not v_b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version_b} not found",
        )

    diff = service.compare_versions(v_a, v_b)
    return diff


# =============================================================================
# WORKFLOW IMPORT/EXPORT ROUTES
# =============================================================================


WORKFLOW_EXPORT_VERSION = "1.0"


@router.get("/export")
async def export_workflow(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Export workflow as JSON for backup or sharing.

    Returns a portable JSON representation that can be imported into another automation.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Get automation info for metadata
    automation_service = CRMAutomationService(db)
    automation = await automation_service.get_automation(automation_id)

    export_data = {
        "version": WORKFLOW_EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "automation_name": automation.name if automation else None,
            "automation_description": automation.description if automation else None,
            "is_published": workflow.is_published,
            "workflow_version": workflow.version,
        },
        "workflow": {
            "nodes": workflow.nodes,
            "edges": workflow.edges,
            "viewport": workflow.viewport,
        },
    }

    return export_data


@router.post("/import")
async def import_workflow(
    workspace_id: str,
    automation_id: str,
    import_data: dict,
    as_draft: bool = Query(True, description="Import as unpublished draft"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Import workflow from JSON export.

    Accepts workflow JSON and applies it to the automation.
    Node and edge IDs are remapped to avoid collisions.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    # Validate import format
    if "workflow" not in import_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid import format: missing 'workflow' key",
        )

    workflow_data = import_data["workflow"]
    nodes = workflow_data.get("nodes", [])
    edges = workflow_data.get("edges", [])
    viewport = workflow_data.get("viewport")

    # Validate nodes structure
    valid_node_types = {"trigger", "action", "condition", "wait", "agent", "branch"}
    for node in nodes:
        if "id" not in node or "type" not in node:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid node format: missing 'id' or 'type'",
            )
        if node["type"] not in valid_node_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid node type: {node['type']}",
            )

    # Remap IDs to avoid collisions
    id_map = {}
    new_nodes = []
    for node in nodes:
        old_id = node["id"]
        new_id = f"{node['type']}-{uuid4().hex[:8]}"
        id_map[old_id] = new_id
        new_node = {**node, "id": new_id}
        new_nodes.append(new_node)

    new_edges = []
    for edge in edges:
        if edge.get("source") not in id_map or edge.get("target") not in id_map:
            continue  # Skip edges with invalid references
        new_edge = {
            **edge,
            "id": f"edge-{uuid4().hex[:8]}",
            "source": id_map[edge["source"]],
            "target": id_map[edge["target"]],
        }
        new_edges.append(new_edge)

    # Apply to workflow
    service = WorkflowService(db)
    workflow = await service.update_workflow_by_automation(
        automation_id=automation_id,
        nodes=new_nodes,
        edges=new_edges,
        viewport=viewport,
    )

    # Optionally unpublish (import as draft)
    if as_draft and workflow and workflow.is_published:
        await service.unpublish_workflow(workflow.id)

    await db.commit()

    return {
        "success": True,
        "workflow_id": workflow.id if workflow else None,
        "node_count": len(new_nodes),
        "edge_count": len(new_edges),
        "id_mappings": id_map,
        "imported_as_draft": as_draft,
    }


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


@router.get("/field-schema")
async def get_field_schema(
    workspace_id: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Get field schema for the workflow builder field picker.

    Returns the schema of available fields including:
    - Record fields from the automation's target object
    - Trigger data fields
    - Previous node output placeholders
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    # Get automation to find target object
    service = CRMAutomationService(db)
    automation = await service.get_automation(automation_id)

    schema = {
        "record": {"label": "Record Fields", "fields": []},
        "trigger": {"label": "Trigger Data", "fields": []},
        "system": {"label": "System Variables", "fields": []},
    }

    # Get object fields if automation has a target object
    if automation and automation.object_id:
        from aexy.models.crm import CRMObject, CRMAttribute

        stmt = (
            select(CRMObject)
            .options(selectinload(CRMObject.attributes))
            .where(CRMObject.id == automation.object_id)
        )
        result = await db.execute(stmt)
        crm_object = result.scalar_one_or_none()

        if crm_object:
            # Add record.id as a standard field
            schema["record"]["fields"].append({
                "path": "record.id",
                "name": "Record ID",
                "type": "text",
                "description": "Unique identifier for the record",
            })

            # Add all object attributes
            for attr in crm_object.attributes:
                schema["record"]["fields"].append({
                    "path": f"record.values.{attr.slug}",
                    "name": attr.name,
                    "type": attr.attribute_type,
                    "description": attr.description,
                    "config": attr.config,
                    "required": attr.is_required,
                })

            # Add computed/system fields
            schema["record"]["fields"].append({
                "path": "record.owner_id",
                "name": "Owner ID",
                "type": "text",
                "description": "ID of the record owner",
            })
            schema["record"]["fields"].append({
                "path": "record.object_id",
                "name": "Object Type ID",
                "type": "text",
                "description": "ID of the CRM object type",
            })

    # Add trigger data fields based on automation trigger type
    if automation:
        trigger_type = automation.trigger_type

        # Common trigger fields
        schema["trigger"]["fields"].append({
            "path": "trigger.workspace_id",
            "name": "Workspace ID",
            "type": "text",
            "description": "ID of the workspace",
        })
        schema["trigger"]["fields"].append({
            "path": "trigger.triggered_by",
            "name": "Triggered By",
            "type": "text",
            "description": "ID of the user who triggered the workflow",
        })
        schema["trigger"]["fields"].append({
            "path": "trigger.triggered_at",
            "name": "Triggered At",
            "type": "timestamp",
            "description": "Timestamp when the workflow was triggered",
        })

        # Trigger-specific fields
        if trigger_type == "field.changed":
            schema["trigger"]["fields"].extend([
                {
                    "path": "trigger.field_slug",
                    "name": "Changed Field",
                    "type": "text",
                    "description": "The field that was changed",
                },
                {
                    "path": "trigger.old_value",
                    "name": "Old Value",
                    "type": "text",
                    "description": "Previous value of the field",
                },
                {
                    "path": "trigger.new_value",
                    "name": "New Value",
                    "type": "text",
                    "description": "New value of the field",
                },
            ])
        elif trigger_type == "webhook.received":
            schema["trigger"]["fields"].append({
                "path": "trigger.payload",
                "name": "Webhook Payload",
                "type": "object",
                "description": "The incoming webhook payload",
            })
        elif trigger_type in ["email.opened", "email.clicked"]:
            schema["trigger"]["fields"].extend([
                {
                    "path": "trigger.email_id",
                    "name": "Email ID",
                    "type": "text",
                    "description": "ID of the email",
                },
                {
                    "path": "trigger.recipient_email",
                    "name": "Recipient Email",
                    "type": "email",
                    "description": "Email address of the recipient",
                },
            ])
            if trigger_type == "email.clicked":
                schema["trigger"]["fields"].append({
                    "path": "trigger.link_url",
                    "name": "Clicked Link URL",
                    "type": "url",
                    "description": "URL of the link that was clicked",
                })

    # Add system variables
    schema["system"]["fields"] = [
        {
            "path": "system.now",
            "name": "Current Timestamp",
            "type": "timestamp",
            "description": "Current date and time",
        },
        {
            "path": "system.today",
            "name": "Today's Date",
            "type": "date",
            "description": "Current date",
        },
        {
            "path": "system.execution_id",
            "name": "Execution ID",
            "type": "text",
            "description": "Unique ID of this workflow execution",
        },
    ]

    return schema


@router.get("/field-schema/node-outputs")
async def get_node_outputs_schema(
    workspace_id: str,
    automation_id: str,
    node_id: str = Query(..., description="ID of the current node to get upstream outputs"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Get available outputs from nodes that execute before the specified node.

    This allows referencing outputs from previous nodes in the workflow.
    """
    await check_workspace_permission(db, workspace_id, current_user.id, "member")
    await check_automation_exists(db, automation_id, workspace_id)

    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        return {"node_outputs": []}

    nodes = workflow.nodes
    edges = workflow.edges

    # Build reverse adjacency list to find upstream nodes
    upstream: dict[str, set[str]] = {n["id"]: set() for n in nodes}
    for edge in edges:
        target = edge.get("target")
        source = edge.get("source")
        if target and source:
            upstream[target].add(source)

    # Find all nodes that come before node_id using BFS
    visited = set()
    queue = list(upstream.get(node_id, set()))
    while queue:
        current = queue.pop(0)
        if current not in visited:
            visited.add(current)
            queue.extend(upstream.get(current, set()))

    # Build output schema for each upstream node
    node_outputs = []
    node_map = {n["id"]: n for n in nodes}

    for upstream_id in visited:
        node = node_map.get(upstream_id)
        if not node:
            continue

        node_type = node.get("type")
        node_label = node.get("data", {}).get("label", upstream_id)

        outputs = []

        # Define outputs based on node type
        if node_type == "trigger":
            outputs = [
                {"path": f"nodes.{upstream_id}.trigger_data", "name": "Trigger Data", "type": "object"},
            ]
        elif node_type == "action":
            action_type = node.get("data", {}).get("action_type")
            outputs = [
                {"path": f"nodes.{upstream_id}.success", "name": "Success", "type": "checkbox"},
                {"path": f"nodes.{upstream_id}.result", "name": "Result", "type": "object"},
            ]
            if action_type == "send_email":
                outputs.append({"path": f"nodes.{upstream_id}.email_id", "name": "Sent Email ID", "type": "text"})
            elif action_type == "webhook_call":
                outputs.append({"path": f"nodes.{upstream_id}.response", "name": "Webhook Response", "type": "object"})
        elif node_type == "condition":
            outputs = [
                {"path": f"nodes.{upstream_id}.result", "name": "Condition Result", "type": "checkbox"},
            ]
        elif node_type == "agent":
            agent_type = node.get("data", {}).get("agent_type")
            outputs = [
                {"path": f"nodes.{upstream_id}.output", "name": "Agent Output", "type": "object"},
            ]
            if agent_type == "lead_scoring":
                outputs.append({"path": f"nodes.{upstream_id}.output.score", "name": "Lead Score", "type": "number"})
                outputs.append({"path": f"nodes.{upstream_id}.output.reasoning", "name": "Score Reasoning", "type": "text"})
            elif agent_type == "email_drafter":
                outputs.append({"path": f"nodes.{upstream_id}.output.subject", "name": "Email Subject", "type": "text"})
                outputs.append({"path": f"nodes.{upstream_id}.output.body", "name": "Email Body", "type": "text"})
            elif agent_type == "data_enrichment":
                outputs.append({"path": f"nodes.{upstream_id}.output.enriched_data", "name": "Enriched Data", "type": "object"})
        elif node_type == "wait":
            wait_type = node.get("data", {}).get("wait_type")
            if wait_type == "event":
                outputs = [
                    {"path": f"nodes.{upstream_id}.event_data", "name": "Event Data", "type": "object"},
                    {"path": f"nodes.{upstream_id}.event_type", "name": "Event Type", "type": "text"},
                ]

        if outputs:
            node_outputs.append({
                "node_id": upstream_id,
                "node_label": node_label,
                "node_type": node_type,
                "outputs": outputs,
            })

    return {"node_outputs": node_outputs}


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


# =============================================================================
# WORKFLOW TEMPLATES ROUTES
# =============================================================================

templates_router = APIRouter(prefix="/workspaces/{workspace_id}/crm/workflow-templates")


@templates_router.get("/categories")
async def get_template_categories(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get all available template categories with counts."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.data.workflow_templates import TEMPLATE_CATEGORIES, get_system_templates

    # Get system templates for counts
    system_templates = get_system_templates()
    category_counts: dict[str, int] = {}
    for template in system_templates:
        cat = template.get("category", "custom")
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # Count custom templates from database
    from aexy.models.workflow import WorkflowTemplate

    stmt = select(WorkflowTemplate.category).where(
        and_(
            WorkflowTemplate.is_published == True,
            (WorkflowTemplate.workspace_id == workspace_id) | (WorkflowTemplate.is_system == True),
        )
    )
    result = await db.execute(stmt)
    for (category,) in result.all():
        category_counts[category] = category_counts.get(category, 0) + 1

    categories = []
    for cat_id, cat_info in TEMPLATE_CATEGORIES.items():
        categories.append({
            "id": cat_id,
            "label": cat_info["label"],
            "icon": cat_info["icon"],
            "template_count": category_counts.get(cat_id, 0),
        })

    # Add custom category for user-created templates
    categories.append({
        "id": "custom",
        "label": "Custom",
        "icon": "Sparkles",
        "template_count": category_counts.get("custom", 0),
    })

    return categories


@templates_router.get("")
async def list_templates(
    workspace_id: str,
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List all available workflow templates."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.data.workflow_templates import get_system_templates
    from aexy.models.workflow import WorkflowTemplate

    templates = []

    # Get system templates (built-in)
    system_templates = get_system_templates()
    for i, template in enumerate(system_templates):
        if category and template.get("category") != category:
            continue
        templates.append({
            "id": f"system-{i}",
            "name": template["name"],
            "description": template.get("description"),
            "category": template.get("category", "sales"),
            "icon": template.get("icon"),
            "is_system": True,
            "use_count": 0,
            "node_count": len(template.get("nodes", [])),
            "created_at": None,
        })

    # Get custom templates from database
    stmt = select(WorkflowTemplate).where(
        and_(
            WorkflowTemplate.is_published == True,
            (WorkflowTemplate.workspace_id == workspace_id) | (WorkflowTemplate.is_system == True),
        )
    )

    if category:
        stmt = stmt.where(WorkflowTemplate.category == category)

    stmt = stmt.order_by(desc(WorkflowTemplate.use_count))

    result = await db.execute(stmt)
    db_templates = result.scalars().all()

    for t in db_templates:
        templates.append({
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "category": t.category,
            "icon": t.icon,
            "is_system": t.is_system,
            "use_count": t.use_count,
            "node_count": len(t.nodes or []),
            "created_at": t.created_at,
        })

    return templates


@templates_router.get("/{template_id}")
async def get_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a specific workflow template with full node/edge data."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    # Check if it's a system template (starts with "system-")
    if template_id.startswith("system-"):
        from aexy.data.workflow_templates import get_system_templates

        try:
            index = int(template_id.split("-")[1])
            system_templates = get_system_templates()
            if 0 <= index < len(system_templates):
                template = system_templates[index]
                return {
                    "id": template_id,
                    "name": template["name"],
                    "description": template.get("description"),
                    "category": template.get("category", "sales"),
                    "icon": template.get("icon"),
                    "nodes": template.get("nodes", []),
                    "edges": template.get("edges", []),
                    "viewport": template.get("viewport"),
                    "is_system": True,
                    "is_published": True,
                    "use_count": 0,
                    "created_at": None,
                }
        except (ValueError, IndexError):
            pass

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # Get from database
    from aexy.models.workflow import WorkflowTemplate

    stmt = select(WorkflowTemplate).where(
        and_(
            WorkflowTemplate.id == template_id,
            (WorkflowTemplate.workspace_id == workspace_id) | (WorkflowTemplate.is_system == True),
        )
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "icon": template.icon,
        "nodes": template.nodes,
        "edges": template.edges,
        "viewport": template.viewport,
        "is_system": template.is_system,
        "is_published": template.is_published,
        "use_count": template.use_count,
        "created_at": template.created_at,
    }


@templates_router.post("/{template_id}/apply")
async def apply_template(
    workspace_id: str,
    template_id: str,
    automation_id: str = Query(..., description="Automation to apply template to"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Apply a template to an automation's workflow."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    # Get template data
    nodes = []
    edges = []
    viewport = None

    if template_id.startswith("system-"):
        from aexy.data.workflow_templates import get_system_templates

        try:
            index = int(template_id.split("-")[1])
            system_templates = get_system_templates()
            if 0 <= index < len(system_templates):
                template = system_templates[index]
                nodes = template.get("nodes", [])
                edges = template.get("edges", [])
                viewport = template.get("viewport")
        except (ValueError, IndexError):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )
    else:
        from aexy.models.workflow import WorkflowTemplate

        stmt = select(WorkflowTemplate).where(
            and_(
                WorkflowTemplate.id == template_id,
                (WorkflowTemplate.workspace_id == workspace_id) | (WorkflowTemplate.is_system == True),
            )
        )
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )

        nodes = template.nodes
        edges = template.edges
        viewport = template.viewport

        # Increment use count
        template.use_count += 1

    # Generate new IDs for nodes and edges to avoid collisions
    from uuid import uuid4
    import re

    id_map = {}
    new_nodes = []
    for node in nodes:
        old_id = node["id"]
        new_id = f"{node['type']}-{uuid4().hex[:8]}"
        id_map[old_id] = new_id
        new_node = {**node, "id": new_id}
        new_nodes.append(new_node)

    new_edges = []
    for edge in edges:
        new_edge = {
            **edge,
            "id": f"edge-{uuid4().hex[:8]}",
            "source": id_map.get(edge["source"], edge["source"]),
            "target": id_map.get(edge["target"], edge["target"]),
        }
        new_edges.append(new_edge)

    # Apply to workflow
    service = WorkflowService(db)
    workflow = await service.update_workflow_by_automation(
        automation_id=automation_id,
        nodes=new_nodes,
        edges=new_edges,
        viewport=viewport,
    )

    await db.commit()

    return {
        "success": True,
        "workflow_id": workflow.id if workflow else None,
        "node_count": len(new_nodes),
        "edge_count": len(new_edges),
    }


@templates_router.post("")
async def create_template(
    workspace_id: str,
    name: str = Query(..., min_length=1, max_length=255),
    description: str | None = Query(None),
    category: str = Query("custom"),
    automation_id: str = Query(..., description="Automation to create template from"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new template from an existing workflow."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")
    await check_automation_exists(db, automation_id, workspace_id)

    # Get the workflow
    service = WorkflowService(db)
    workflow = await service.get_workflow_by_automation(automation_id)

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    if not workflow.nodes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create template from empty workflow",
        )

    # Create template
    from aexy.models.workflow import WorkflowTemplate

    template = WorkflowTemplate(
        id=str(uuid4()),
        workspace_id=workspace_id,
        name=name,
        description=description,
        category=category,
        nodes=workflow.nodes,
        edges=workflow.edges,
        viewport=workflow.viewport,
        is_system=False,
        is_published=True,
        created_by=current_user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "is_system": template.is_system,
        "node_count": len(template.nodes or []),
        "created_at": template.created_at,
    }


@templates_router.delete("/{template_id}")
async def delete_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a custom template."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    if template_id.startswith("system-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete system templates",
        )

    from aexy.models.workflow import WorkflowTemplate

    stmt = select(WorkflowTemplate).where(
        and_(
            WorkflowTemplate.id == template_id,
            WorkflowTemplate.workspace_id == workspace_id,
            WorkflowTemplate.is_system == False,
        )
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or cannot be deleted",
        )

    await db.delete(template)
    await db.commit()

    return {"success": True, "deleted_id": template_id}
