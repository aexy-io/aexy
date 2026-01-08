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
