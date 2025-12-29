"""GitHub Webhook API endpoints."""

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from gitraki.core.config import get_settings
from gitraki.core.database import get_db
from gitraki.services.webhook_handler import (
    WebhookHandler,
    WebhookVerificationError,
    UnsupportedEventError,
)
from gitraki.services.ingestion_service import IngestionService
from gitraki.services.profile_sync import ProfileSyncService

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
