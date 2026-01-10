"""Workflow events API for receiving external events and webhooks."""

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.core.config import get_settings
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.workflow_event_service import WorkflowEventService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/workspaces/{workspace_id}/workflow-events")


# =============================================================================
# SCHEMAS
# =============================================================================


class WorkflowEventRequest(BaseModel):
    """Request to trigger a workflow event."""

    event_type: str = Field(..., description="Type of event (e.g., email.opened)")
    event_data: dict[str, Any] = Field(
        default_factory=dict, description="Event payload data"
    )
    record_id: str | None = Field(None, description="Optional record ID")


class WorkflowEventResponse(BaseModel):
    """Response from triggering an event."""

    success: bool
    message: str
    resumed_executions: list[str] = Field(default_factory=list)


class SupportedEventType(BaseModel):
    """Supported event type info."""

    type: str
    label: str
    description: str
    filter_fields: list[str]


# =============================================================================
# WEBHOOK ENDPOINTS (External Event Receivers)
# =============================================================================


@router.post("/webhooks/email-tracking", response_model=WorkflowEventResponse)
async def receive_email_tracking_event(
    workspace_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive email tracking events (opens, clicks, replies, bounces).
    Used by email tracking services like SendGrid, Mailgun, etc.
    """
    body = await request.json()

    # Map common email event payloads
    event_type = body.get("event") or body.get("type")
    if not event_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing event type in payload",
        )

    # Normalize event type
    event_type_map = {
        "open": "email.opened",
        "opened": "email.opened",
        "click": "email.clicked",
        "clicked": "email.clicked",
        "reply": "email.replied",
        "replied": "email.replied",
        "bounce": "email.bounced",
        "bounced": "email.bounced",
        "delivered": "email.delivered",
    }
    normalized_type = event_type_map.get(event_type.lower(), f"email.{event_type}")

    event_data = {
        "email_id": body.get("email_id") or body.get("message_id") or body.get("sg_message_id"),
        "record_id": body.get("record_id") or body.get("metadata", {}).get("record_id"),
        "recipient_email": body.get("email") or body.get("recipient"),
        "timestamp": body.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "raw_event": body,
    }

    # Handle click-specific data
    if "url" in body or "link" in body:
        event_data["link_url"] = body.get("url") or body.get("link")

    service = WorkflowEventService(db)
    resumed = await service.handle_event(workspace_id, normalized_type, event_data)

    return WorkflowEventResponse(
        success=True,
        message=f"Processed {normalized_type} event",
        resumed_executions=resumed,
    )


@router.post("/webhooks/form-submission", response_model=WorkflowEventResponse)
async def receive_form_submission(
    workspace_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive form submission events.
    Used by form services like Typeform, JotForm, etc.
    """
    body = await request.json()

    event_data = {
        "form_id": body.get("form_id") or body.get("formId"),
        "record_id": body.get("record_id") or body.get("hidden", {}).get("record_id"),
        "submission_id": body.get("submission_id") or body.get("response_id"),
        "submitted_at": body.get("submitted_at") or datetime.now(timezone.utc).isoformat(),
        "answers": body.get("answers") or body.get("responses") or body.get("data"),
        "raw_event": body,
    }

    service = WorkflowEventService(db)
    resumed = await service.handle_event(workspace_id, "form.submitted", event_data)

    return WorkflowEventResponse(
        success=True,
        message="Processed form.submitted event",
        resumed_executions=resumed,
    )


@router.post("/webhooks/meeting", response_model=WorkflowEventResponse)
async def receive_meeting_event(
    workspace_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive meeting events from calendar integrations.
    Used by Calendly, Cal.com, Google Calendar, etc.
    """
    body = await request.json()

    # Determine event type
    event_type = body.get("event") or body.get("type") or "scheduled"
    event_type_map = {
        "invitee.created": "meeting.scheduled",
        "scheduled": "meeting.scheduled",
        "booked": "meeting.scheduled",
        "invitee.canceled": "meeting.cancelled",
        "cancelled": "meeting.cancelled",
        "canceled": "meeting.cancelled",
        "completed": "meeting.completed",
        "ended": "meeting.completed",
    }
    normalized_type = event_type_map.get(event_type.lower(), f"meeting.{event_type}")

    # Extract meeting data
    payload = body.get("payload", body)
    invitee = payload.get("invitee", {})

    event_data = {
        "meeting_id": payload.get("event", {}).get("uuid") or payload.get("meeting_id"),
        "calendar_id": payload.get("event_type", {}).get("uuid") or payload.get("calendar_id"),
        "record_id": (
            payload.get("tracking", {}).get("record_id")
            or invitee.get("record_id")
            or body.get("record_id")
        ),
        "meeting_type": payload.get("event_type", {}).get("name"),
        "scheduled_at": payload.get("event", {}).get("start_time"),
        "invitee_email": invitee.get("email"),
        "invitee_name": invitee.get("name"),
        "raw_event": body,
    }

    service = WorkflowEventService(db)
    resumed = await service.handle_event(workspace_id, normalized_type, event_data)

    return WorkflowEventResponse(
        success=True,
        message=f"Processed {normalized_type} event",
        resumed_executions=resumed,
    )


@router.post("/webhooks/custom/{webhook_id}", response_model=WorkflowEventResponse)
async def receive_custom_webhook(
    workspace_id: str,
    webhook_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive custom webhook events.
    Generic endpoint for any external system.
    """
    body = await request.json()

    event_data = {
        "webhook_id": webhook_id,
        "record_id": body.get("record_id"),
        "payload": body,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    service = WorkflowEventService(db)
    resumed = await service.handle_event(workspace_id, "webhook.received", event_data)

    return WorkflowEventResponse(
        success=True,
        message="Processed webhook.received event",
        resumed_executions=resumed,
    )


# =============================================================================
# MANUAL EVENT TRIGGER (Authenticated)
# =============================================================================


@router.post("/trigger", response_model=WorkflowEventResponse)
async def trigger_event(
    workspace_id: str,
    data: WorkflowEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """
    Manually trigger a workflow event.
    Useful for testing or internal integrations.
    """
    # Verify workspace access
    from aexy.services.workspace_service import WorkspaceService

    ws_service = WorkspaceService(db)
    workspace = await ws_service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Check membership
    member = await ws_service.get_workspace_member(workspace_id, current_user.id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    event_data = {
        **data.event_data,
        "triggered_by": current_user.id,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
    }

    if data.record_id:
        event_data["record_id"] = data.record_id

    service = WorkflowEventService(db)
    resumed = await service.handle_event(workspace_id, data.event_type, event_data)

    return WorkflowEventResponse(
        success=True,
        message=f"Triggered {data.event_type} event",
        resumed_executions=resumed,
    )


# =============================================================================
# METADATA ENDPOINTS
# =============================================================================


@router.get("/types", response_model=list[SupportedEventType])
async def get_supported_event_types(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get list of supported event types for wait nodes."""
    return WorkflowEventService.get_supported_events()


@router.get("/webhook-urls")
async def get_webhook_urls(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get webhook URLs for this workspace."""
    base_url = settings.api_base_url or "https://api.example.com"

    return {
        "email_tracking": f"{base_url}/workspaces/{workspace_id}/workflow-events/webhooks/email-tracking",
        "form_submission": f"{base_url}/workspaces/{workspace_id}/workflow-events/webhooks/form-submission",
        "meeting": f"{base_url}/workspaces/{workspace_id}/workflow-events/webhooks/meeting",
        "custom_webhook_template": f"{base_url}/workspaces/{workspace_id}/workflow-events/webhooks/custom/{{webhook_id}}",
    }
