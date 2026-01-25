"""Booking webhooks API endpoints (Enterprise feature)."""

import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.booking import BookingWebhook
from aexy.schemas.booking import (
    BookingWebhookCreate,
    BookingWebhookUpdate,
    BookingWebhookResponse,
    BookingWebhookListResponse,
)
from aexy.schemas.booking.webhook import WebhookTestResponse, WEBHOOK_EVENTS

router = APIRouter(
    prefix="/workspaces/{workspace_id}/booking/webhooks",
    tags=["Booking - Webhooks (Enterprise)"],
)


def webhook_to_response(webhook: BookingWebhook) -> BookingWebhookResponse:
    """Convert BookingWebhook model to response schema."""
    return BookingWebhookResponse(
        id=webhook.id,
        workspace_id=webhook.workspace_id,
        name=webhook.name,
        url=webhook.url,
        events=webhook.events,
        is_active=webhook.is_active,
        last_triggered_at=webhook.last_triggered_at,
        failure_count=webhook.failure_count,
        last_failure_at=webhook.last_failure_at,
        last_failure_reason=webhook.last_failure_reason,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


@router.get("/events", response_model=list[str])
async def list_webhook_events(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
):
    """List available webhook events."""
    return WEBHOOK_EVENTS


@router.get("", response_model=BookingWebhookListResponse)
async def list_webhooks(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List booking webhooks for workspace."""
    # TODO: Add enterprise tier check

    stmt = (
        select(BookingWebhook)
        .where(BookingWebhook.workspace_id == workspace_id)
        .order_by(BookingWebhook.created_at.desc())
    )
    result = await db.execute(stmt)
    webhooks = result.scalars().all()

    return BookingWebhookListResponse(
        webhooks=[webhook_to_response(w) for w in webhooks],
        total=len(webhooks),
    )


@router.post("", response_model=BookingWebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    workspace_id: str,
    data: BookingWebhookCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a booking webhook."""
    # TODO: Add enterprise tier check

    # Validate events
    invalid_events = [e for e in data.events if e not in WEBHOOK_EVENTS]
    if invalid_events:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid events: {invalid_events}. Valid events: {WEBHOOK_EVENTS}",
        )

    # Generate secret
    webhook_secret = secrets.token_urlsafe(32)

    webhook = BookingWebhook(
        id=str(uuid4()),
        workspace_id=workspace_id,
        name=data.name,
        url=data.url,
        events=data.events,
        secret=webhook_secret,
    )

    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    return webhook_to_response(webhook)


@router.get("/{webhook_id}", response_model=BookingWebhookResponse)
async def get_webhook(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific webhook."""
    stmt = select(BookingWebhook).where(BookingWebhook.id == webhook_id)
    result = await db.execute(stmt)
    webhook = result.scalar_one_or_none()

    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    return webhook_to_response(webhook)


@router.get("/{webhook_id}/secret")
async def get_webhook_secret(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get webhook secret (for signature verification)."""
    stmt = select(BookingWebhook).where(BookingWebhook.id == webhook_id)
    result = await db.execute(stmt)
    webhook = result.scalar_one_or_none()

    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    return {"secret": webhook.secret}


@router.patch("/{webhook_id}", response_model=BookingWebhookResponse)
async def update_webhook(
    workspace_id: str,
    webhook_id: str,
    data: BookingWebhookUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a webhook."""
    stmt = select(BookingWebhook).where(BookingWebhook.id == webhook_id)
    result = await db.execute(stmt)
    webhook = result.scalar_one_or_none()

    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    # Validate events if provided
    if data.events:
        invalid_events = [e for e in data.events if e not in WEBHOOK_EVENTS]
        if invalid_events:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid events: {invalid_events}",
            )
        webhook.events = data.events

    if data.name is not None:
        webhook.name = data.name
    if data.url is not None:
        webhook.url = data.url
    if data.is_active is not None:
        webhook.is_active = data.is_active

    await db.commit()
    await db.refresh(webhook)

    return webhook_to_response(webhook)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a webhook."""
    stmt = select(BookingWebhook).where(BookingWebhook.id == webhook_id)
    result = await db.execute(stmt)
    webhook = result.scalar_one_or_none()

    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    await db.delete(webhook)
    await db.commit()


@router.post("/{webhook_id}/test", response_model=WebhookTestResponse)
async def test_webhook(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test a webhook by sending a test payload."""
    import httpx
    import time
    import hashlib
    import hmac
    import json
    from datetime import datetime
    from zoneinfo import ZoneInfo

    stmt = select(BookingWebhook).where(BookingWebhook.id == webhook_id)
    result = await db.execute(stmt)
    webhook = result.scalar_one_or_none()

    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    # Build test payload
    test_payload = {
        "event": "test",
        "timestamp": datetime.now(ZoneInfo("UTC")).isoformat(),
        "data": {
            "message": "This is a test webhook from Aexy",
            "webhook_id": webhook_id,
        },
    }

    # Sign payload
    payload_str = json.dumps(test_payload, sort_keys=True)
    signature = hmac.new(
        webhook.secret.encode("utf-8"),
        payload_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Send request
    start_time = time.time()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook.url,
                json=test_payload,
                headers={
                    "X-Aexy-Signature": f"sha256={signature}",
                    "X-Aexy-Event": "test",
                    "Content-Type": "application/json",
                },
                timeout=10,
            )

        elapsed_ms = int((time.time() - start_time) * 1000)

        return WebhookTestResponse(
            success=response.status_code < 400,
            status_code=response.status_code,
            response_time_ms=elapsed_ms,
        )

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)

        return WebhookTestResponse(
            success=False,
            response_time_ms=elapsed_ms,
            error=str(e),
        )


@router.post("/{webhook_id}/rotate-secret", response_model=BookingWebhookResponse)
async def rotate_webhook_secret(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Rotate webhook secret."""
    stmt = select(BookingWebhook).where(BookingWebhook.id == webhook_id)
    result = await db.execute(stmt)
    webhook = result.scalar_one_or_none()

    if not webhook or webhook.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    # Generate new secret
    webhook.secret = secrets.token_urlsafe(32)
    webhook.failure_count = 0  # Reset failure count

    await db.commit()
    await db.refresh(webhook)

    return webhook_to_response(webhook)
