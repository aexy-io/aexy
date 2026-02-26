"""Public event ingestion API for tracking pixel — no auth, workspace-key based."""

import logging
import re
import time
from datetime import datetime, timezone
from uuid import uuid4

import redis.asyncio as redis
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.core.database import get_async_session
from aexy.models.gtm import BehavioralEvent
from aexy.models.workspace import Workspace
from aexy.schemas.gtm import EventBatchRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["event-ingestion"])

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

# Rate limit settings for the public event ingestion endpoint
_RATE_LIMIT_PER_IP_PER_MINUTE = 60       # max requests per IP per minute
_RATE_LIMIT_PER_WORKSPACE_PER_MINUTE = 300  # max requests per workspace per minute
_RATE_LIMIT_WINDOW_SECONDS = 60

# Lazy-initialized Redis connection for rate limiting
_redis_client: redis.Redis | None = None


async def _get_redis() -> redis.Redis | None:
    """Get or create a Redis client for rate limiting."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        settings = get_settings()
        _redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        # Test connection
        await _redis_client.ping()
        return _redis_client
    except Exception:
        logger.warning("Redis unavailable for event ingestion rate limiting")
        return None


async def _check_rate_limit(key: str, max_requests: int) -> bool:
    """Check and increment a sliding-window rate limit counter.

    Returns True if the request is allowed, False if rate-limited.
    """
    r = await _get_redis()
    if r is None:
        # If Redis is unavailable, allow the request (fail-open)
        return True

    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    try:
        pipe = r.pipeline()
        # Remove expired entries
        pipe.zremrangebyscore(key, 0, window_start)
        # Count current entries
        pipe.zcard(key)
        # Add the new request
        pipe.zadd(key, {str(now): now})
        # Set expiry on the key so it doesn't linger
        pipe.expire(key, _RATE_LIMIT_WINDOW_SECONDS + 10)
        results = await pipe.execute()

        current_count = results[1]
        return current_count < max_requests
    except Exception:
        logger.warning("Rate limit check failed for key %s", key)
        return True  # fail-open


@router.post("/t/{workspace_key}/events")
async def ingest_events(
    workspace_key: str,
    batch: EventBatchRequest,
    request: Request,
):
    """Ingest a batch of behavioral events from the tracking pixel.

    This is a public endpoint — no auth required.
    Authentication is via workspace_key (UUID that maps to workspace.id).
    Rate-limited per IP and per workspace to prevent abuse.
    """
    try:
        if not batch.events:
            return JSONResponse({"ok": True, "ingested": 0}, headers=CORS_HEADERS)

        # Get client IP
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.client.host if request.client else None
        if not client_ip:
            client_ip = "0.0.0.0"

        user_agent = request.headers.get("User-Agent", "")[:500]
        now = datetime.now(timezone.utc)

        # Validate workspace key format and existence
        if not UUID_RE.match(workspace_key):
            raise HTTPException(status_code=400, detail="Invalid workspace key")
        workspace_id = workspace_key

        # Verify workspace exists (cached via Redis to avoid DB hit per request)
        r = await _get_redis()
        ws_cache_key = f"gtm:ws_exists:{workspace_id}"
        ws_exists = None
        if r:
            try:
                ws_exists = await r.get(ws_cache_key)
            except Exception:
                pass

        if ws_exists is None:
            async with get_async_session() as check_db:
                from sqlalchemy import select
                result = await check_db.scalar(
                    select(Workspace.id).where(Workspace.id == workspace_id)
                )
                ws_exists = "1" if result else "0"
                if r:
                    try:
                        await r.setex(ws_cache_key, 300, ws_exists)  # cache 5 min
                    except Exception:
                        pass

        if ws_exists == "0":
            raise HTTPException(status_code=404, detail="Workspace not found")

        # Rate limiting — per IP and per workspace
        ip_allowed = await _check_rate_limit(
            f"gtm:events:ip:{client_ip}", _RATE_LIMIT_PER_IP_PER_MINUTE
        )
        if not ip_allowed:
            return JSONResponse(
                {"ok": False, "detail": "Rate limit exceeded"},
                status_code=429,
                headers={**CORS_HEADERS, "Retry-After": "60"},
            )

        ws_allowed = await _check_rate_limit(
            f"gtm:events:ws:{workspace_id}", _RATE_LIMIT_PER_WORKSPACE_PER_MINUTE
        )
        if not ws_allowed:
            return JSONResponse(
                {"ok": False, "detail": "Rate limit exceeded"},
                status_code=429,
                headers={**CORS_HEADERS, "Retry-After": "60"},
            )

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
            headers=CORS_HEADERS,
        )
    except HTTPException as exc:
        return JSONResponse(
            {"ok": False, "detail": exc.detail},
            status_code=exc.status_code,
            headers=CORS_HEADERS,
        )
    except Exception:
        logger.exception("Unexpected error in event ingestion")
        return JSONResponse(
            {"ok": False, "detail": "Internal server error"},
            status_code=500,
            headers=CORS_HEADERS,
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
