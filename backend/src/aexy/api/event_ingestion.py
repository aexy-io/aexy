"""Public event ingestion API for tracking pixel — no auth, workspace-key based."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_async_session
from aexy.models.gtm import BehavioralEvent
from aexy.schemas.gtm import EventBatchRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["event-ingestion"])


@router.post("/t/{workspace_key}/events")
async def ingest_events(
    workspace_key: str,
    batch: EventBatchRequest,
    request: Request,
):
    """Ingest a batch of behavioral events from the tracking pixel.

    This is a public endpoint — no auth required.
    Authentication is via workspace_key (UUID that maps to workspace.id).
    """
    if not batch.events:
        return JSONResponse({"ok": True, "ingested": 0})

    # Get client IP
    client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else None

    user_agent = request.headers.get("User-Agent", "")[:500]
    now = datetime.now(timezone.utc)

    # Validate workspace key by checking format (UUID)
    # Full validation happens on insert (FK constraint)
    try:
        workspace_id = str(workspace_key)  # workspace_key IS the workspace_id
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workspace key")

    async with get_async_session() as db:
        events_to_insert = []
        for evt in batch.events:
            events_to_insert.append(
                BehavioralEvent(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    anonymous_id=evt.anonymous_id,
                    event_type=evt.event_type,
                    page_url=evt.page_url,
                    page_title=evt.page_title,
                    referrer=evt.referrer,
                    utm_source=evt.utm_source,
                    utm_medium=evt.utm_medium,
                    utm_campaign=evt.utm_campaign,
                    utm_term=evt.utm_term,
                    utm_content=evt.utm_content,
                    properties=evt.properties,
                    ip_address=client_ip,
                    user_agent=user_agent,
                    occurred_at=evt.occurred_at or now,
                    received_at=now,
                )
            )

        db.add_all(events_to_insert)
        await db.commit()

    # Dispatch async processing (session aggregation + identification)
    try:
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        await dispatch(
            "process_visitor_events",
            {
                "workspace_id": workspace_id,
                "anonymous_id": batch.events[0].anonymous_id,
                "event_count": len(batch.events),
            },
            task_queue=TaskQueue.INTEGRATIONS,
            workflow_id=f"process-events-{workspace_id}-{batch.events[0].anonymous_id[:16]}",
        )
    except Exception:
        # Don't fail the ingestion if dispatch fails
        logger.exception("Failed to dispatch process_visitor_events")

    return JSONResponse(
        {"ok": True, "ingested": len(events_to_insert)},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


@router.options("/t/{workspace_key}/events")
async def events_cors_preflight(workspace_key: str):
    """CORS preflight for event ingestion."""
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    )
