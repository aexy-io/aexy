"""GTM Webhook API endpoints — manage outbound webhooks for GTM events."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.gtm_webhook_service import GTM_EVENT_TYPES

from ._shared import check_workspace_permission

router = APIRouter()


# --- Schemas ---

class GTMWebhookCreate(BaseModel):
    name: str
    url: str
    events: list[str]
    description: str | None = None
    headers: dict | None = None


class GTMWebhookUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    events: list[str] | None = None
    description: str | None = None
    headers: dict | None = None
    is_active: bool | None = None


class GTMWebhookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    url: str
    events: list[str]
    is_active: bool
    total_deliveries: int
    successful_deliveries: int
    failed_deliveries: int
    last_delivery_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class GTMWebhookDeliveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    webhook_id: str
    event_type: str
    payload: dict
    status: str
    response_status_code: int | None = None
    error_message: str | None = None
    attempt_number: int
    duration_ms: int | None = None
    created_at: datetime
    delivered_at: datetime | None = None


# --- Endpoints ---

@router.get("/webhooks/events")
async def list_available_events(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available GTM event types for webhook subscriptions."""
    await check_workspace_permission(workspace_id, current_user, db)
    return {"events": GTM_EVENT_TYPES}


@router.get("/webhooks", response_model=list[GTMWebhookResponse])
async def list_webhooks(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    return await service.list_webhooks(workspace_id)


@router.post("/webhooks", response_model=GTMWebhookResponse)
async def create_webhook(
    workspace_id: str,
    data: GTMWebhookCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    return await service.create_webhook(
        workspace_id=workspace_id,
        name=data.name,
        url=data.url,
        events=data.events,
        description=data.description,
        headers=data.headers,
    )


@router.get("/webhooks/{webhook_id}", response_model=GTMWebhookResponse)
async def get_webhook(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    result = await service.get_webhook(workspace_id, webhook_id)
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


@router.put("/webhooks/{webhook_id}", response_model=GTMWebhookResponse)
async def update_webhook(
    workspace_id: str,
    webhook_id: str,
    data: GTMWebhookUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    result = await service.update_webhook(
        workspace_id, webhook_id, **data.model_dump(exclude_none=True),
    )
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    deleted = await service.delete_webhook(workspace_id, webhook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"deleted": True}


@router.post("/webhooks/{webhook_id}/rotate-secret", response_model=GTMWebhookResponse)
async def rotate_webhook_secret(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    result = await service.rotate_secret(workspace_id, webhook_id)
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


@router.get("/webhooks/{webhook_id}/deliveries")
async def list_webhook_deliveries(
    workspace_id: str,
    webhook_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    items, total = await service.list_deliveries(workspace_id, webhook_id, page, per_page)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(
    workspace_id: str,
    webhook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Send a test event to the webhook."""
    from aexy.services.gtm_webhook_service import GTMWebhookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMWebhookService(db)
    webhook = await service.get_webhook(workspace_id, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    delivery_id = await service._deliver_to_webhook(
        webhook, "test.ping", {"message": "Test webhook delivery from Aexy GTM"},
    )
    return {"delivery_id": delivery_id, "message": "Test event sent"}
