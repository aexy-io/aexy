"""GitHub Webhook API endpoints."""

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.services.webhook_handler import (
    WebhookHandler,
    WebhookVerificationError,
    UnsupportedEventError,
)
from aexy.services.ingestion_service import IngestionService
from aexy.services.profile_sync import ProfileSyncService
from aexy.services.github_task_sync_service import GitHubTaskSyncService

router = APIRouter()
settings = get_settings()


@router.post("/github")
async def handle_github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(None),
    x_github_event: str | None = Header(None),
    x_github_delivery: str | None = Header(None),
) -> dict:
    """Handle incoming GitHub webhook events.

    Verifies signature, parses event, and processes accordingly.
    """
    if not x_github_event:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-GitHub-Event header",
        )

    # Get raw body for signature verification
    body = await request.body()

    # Initialize handler
    webhook_secret = settings.github_webhook_secret if hasattr(settings, 'github_webhook_secret') else ""
    handler = WebhookHandler(webhook_secret=webhook_secret)

    # Verify signature (skip if no secret configured - dev mode)
    if webhook_secret and x_hub_signature_256:
        if not handler.verify_signature(body, x_hub_signature_256):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature",
            )

    # Parse JSON payload
    try:
        payload = await request.json()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON payload: {e}",
        )

    # Parse event
    try:
        event = handler.parse_event(x_github_event, payload)
    except UnsupportedEventError:
        # Return 200 for unsupported events (GitHub expects this)
        return {
            "status": "ignored",
            "event_type": x_github_event,
            "reason": "Unsupported event type",
        }

    # Check if event should be processed
    if not handler.should_process(event):
        return {
            "status": "ignored",
            "event_type": x_github_event,
            "action": event.action,
            "reason": "Event action not processable",
        }

    # Process event
    ingestion_service = IngestionService()
    result = await handler.handle_event(event, db, ingestion_service)

    # Process task sync for commits and PRs
    task_sync_service = GitHubTaskSyncService(db)

    if event.event_type == "push" and event.commits:
        # Process each commit for task references
        task_links_created = 0
        for commit_data in event.commits:
            sha = commit_data.get("id", commit_data.get("sha", ""))
            if sha:
                from aexy.models.activity import Commit
                from sqlalchemy import select
                stmt = select(Commit).where(Commit.sha == sha)
                commit_result = await db.execute(stmt)
                commit = commit_result.scalar_one_or_none()
                if commit:
                    links = await task_sync_service.process_commit(
                        commit=commit,
                        repository=event.repository,
                    )
                    task_links_created += len(links)
        if task_links_created > 0:
            result["task_links_created"] = task_links_created

    elif event.event_type == "pull_request" and event.pull_request:
        # Process PR for task references and status updates
        github_id = event.pull_request.get("id")
        if github_id:
            from aexy.models.activity import PullRequest
            from sqlalchemy import select
            stmt = select(PullRequest).where(PullRequest.github_id == github_id)
            pr_result = await db.execute(stmt)
            pr = pr_result.scalar_one_or_none()
            if pr:
                links = await task_sync_service.process_pull_request(
                    pull_request=pr,
                    repository=event.repository,
                    action=event.action,
                )
                if links:
                    result["task_links_created"] = len(links)

    # Trigger profile sync for affected developer(s)
    if event.sender:
        sender_id = event.sender.get("id")
        if sender_id:
            sync_service = ProfileSyncService()
            developer = await ingestion_service.find_developer_by_github_id(sender_id, db)
            if developer:
                try:
                    await sync_service.sync_developer_profile(developer.id, db)
                    result["profile_synced"] = True
                except Exception:
                    result["profile_synced"] = False

    return {
        "status": "processed",
        "delivery_id": x_github_delivery,
        **result,
    }


@router.get("/github/status")
async def webhook_status() -> dict:
    """Check webhook endpoint status."""
    return {
        "status": "active",
        "supported_events": ["push", "pull_request", "pull_request_review", "issues"],
    }


# =============================================================================
# AUTOMATION WORKFLOW WEBHOOK TRIGGERS
# =============================================================================


@router.post("/automations/{automation_id}/trigger")
async def trigger_automation_webhook(
    automation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Trigger an automation workflow via webhook.

    This is a public endpoint that allows external systems to trigger workflows.
    The automation must have a webhook trigger type and be published.
    """
    from datetime import datetime, timezone
    from uuid import uuid4
    from sqlalchemy import select

    from aexy.models.crm import CRMAutomation, CRMRecord
    from aexy.models.workflow import (
        WorkflowDefinition,
        WorkflowExecution,
        WorkflowExecutionStatus,
    )
    from aexy.temporal.client import get_temporal_client
    from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow, CRMWorkflowInput

    # Get payload
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    # Find automation
    stmt = select(CRMAutomation).where(CRMAutomation.id == automation_id)
    result = await db.execute(stmt)
    automation = result.scalar_one_or_none()

    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    if not automation.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Automation is not active",
        )

    # Get workflow
    stmt = select(WorkflowDefinition).where(WorkflowDefinition.automation_id == automation_id)
    result = await db.execute(stmt)
    workflow = result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found for this automation",
        )

    if not workflow.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workflow is not published",
        )

    # Build trigger data
    trigger_data = {
        "type": "webhook",
        "workspace_id": automation.workspace_id,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
        "source_ip": request.client.host if request.client else None,
    }

    # Check for record_id in payload
    record_id = payload.get("record_id")
    record_data = {}

    if record_id:
        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
        if record:
            record_data = {
                "id": record.id,
                "object_id": record.object_id,
                "values": record.values,
                "owner_id": record.owner_id,
            }

    # Create execution
    execution = WorkflowExecution(
        id=str(uuid4()),
        workflow_id=workflow.id,
        automation_id=automation_id,
        workspace_id=automation.workspace_id,
        record_id=record_id,
        status=WorkflowExecutionStatus.PENDING.value,
        context={
            "record_data": record_data,
            "trigger_data": trigger_data,
            "variables": {},
            "executed_nodes": [],
        },
        trigger_data=trigger_data,
        is_dry_run=False,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Dispatch to Temporal
    client = await get_temporal_client()
    await client.start_workflow(
        CRMAutomationWorkflow.run,
        CRMWorkflowInput(
            execution_id=execution.id,
            workflow_id=workflow.id,
            workspace_id=automation.workspace_id,
            trigger_data=trigger_data,
            record_id=record_id,
            record_data=record_data,
            nodes=workflow.nodes or [],
            edges=workflow.edges or [],
        ),
        id=f"crm-workflow-{execution.id}",
        task_queue="workflows",
    )

    return {
        "status": "accepted",
        "execution_id": execution.id,
        "automation_id": automation_id,
        "message": "Workflow execution started",
    }
