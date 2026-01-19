"""Public API endpoints for email tracking (opens, clicks, images)."""

import logging
from io import BytesIO

from fastapi import APIRouter, Request, Response, HTTPException, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from aexy.core.database import get_async_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/t", tags=["email-tracking"])

# 1x1 transparent GIF pixel
TRACKING_PIXEL_GIF = bytes([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,  # GIF89a
    0x01, 0x00, 0x01, 0x00,              # 1x1
    0x80, 0x00, 0x00,                    # Global color table flag
    0xFF, 0xFF, 0xFF,                    # White
    0x00, 0x00, 0x00,                    # Black (transparent)
    0x21, 0xF9, 0x04,                    # Graphic control extension
    0x01, 0x00, 0x00, 0x00, 0x00,        # Transparent
    0x2C, 0x00, 0x00, 0x00, 0x00,        # Image descriptor
    0x01, 0x00, 0x01, 0x00, 0x00,        # 1x1
    0x02, 0x02, 0x44, 0x01, 0x00,        # Image data
    0x3B,                                 # Trailer
])


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies."""
    # Check X-Forwarded-For header (for proxies/load balancers)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP (client IP)
        return forwarded.split(",")[0].strip()

    # Check X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fall back to direct client IP
    if request.client:
        return request.client.host

    return "unknown"


# =============================================================================
# TRACKING PIXEL (Open Tracking)
# =============================================================================

@router.get(
    "/p/{pixel_id}.gif",
    response_class=Response,
    include_in_schema=False,
)
async def track_pixel(
    pixel_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Serve tracking pixel and record email open.

    This endpoint is called when an email client loads the tracking pixel image.
    It returns a 1x1 transparent GIF and records the open event in the background.
    """
    # Record open in background to not delay response
    background_tasks.add_task(
        _record_open_event,
        pixel_id=pixel_id,
        user_agent=request.headers.get("User-Agent"),
        ip_address=get_client_ip(request),
    )

    # Return 1x1 transparent GIF
    return Response(
        content=TRACKING_PIXEL_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


async def _record_open_event(
    pixel_id: str,
    user_agent: str | None,
    ip_address: str | None,
):
    """Background task to record pixel open event."""
    try:
        async with get_async_session() as db:
            from aexy.services.tracking_service import TrackingService

            tracking_service = TrackingService(db)
            await tracking_service.record_open(
                pixel_id=pixel_id,
                user_agent=user_agent,
                ip_address=ip_address,
            )
            logger.debug(f"Recorded open for pixel {pixel_id}")
    except Exception as e:
        logger.error(f"Failed to record open for pixel {pixel_id}: {e}")


# =============================================================================
# LINK TRACKING (Click Tracking)
# =============================================================================

@router.get(
    "/c/{link_id}",
    response_class=RedirectResponse,
    include_in_schema=False,
)
async def track_click(
    link_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    r: str | None = None,  # recipient_id parameter
):
    """
    Track link click and redirect to original URL.

    This endpoint is called when a user clicks a tracked link.
    It records the click event and redirects to the original destination.
    """
    async with get_async_session() as db:
        from aexy.services.tracking_service import TrackingService
        from aexy.models.email_marketing import TrackedLink

        # Get the link to find original URL
        result = await db.execute(
            select(TrackedLink).where(TrackedLink.id == link_id)
        )
        link = result.scalar_one_or_none()

        if not link:
            logger.warning(f"Tracked link not found: {link_id}")
            raise HTTPException(status_code=404, detail="Link not found")

        original_url = link.original_url

        # Record click in background
        background_tasks.add_task(
            _record_click_event,
            link_id=link_id,
            recipient_id=r,
            user_agent=request.headers.get("User-Agent"),
            ip_address=get_client_ip(request),
            referer=request.headers.get("Referer"),
        )

        # Redirect to original URL
        return RedirectResponse(
            url=original_url,
            status_code=302,
        )


async def _record_click_event(
    link_id: str,
    recipient_id: str | None,
    user_agent: str | None,
    ip_address: str | None,
    referer: str | None,
):
    """Background task to record link click event."""
    try:
        async with get_async_session() as db:
            from aexy.services.tracking_service import TrackingService

            tracking_service = TrackingService(db)
            await tracking_service.record_click(
                link_id=link_id,
                recipient_id=recipient_id,
                user_agent=user_agent,
                ip_address=ip_address,
                referer=referer,
            )
            logger.debug(f"Recorded click for link {link_id}")
    except Exception as e:
        logger.error(f"Failed to record click for link {link_id}: {e}")


# =============================================================================
# IMAGE TRACKING (Hosted Images)
# =============================================================================

@router.get(
    "/i/{image_id}",
    include_in_schema=False,
)
async def track_image(
    image_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Serve hosted image and track view.

    This endpoint serves images hosted for emails while tracking views.
    """
    async with get_async_session() as db:
        from aexy.services.tracking_service import TrackingService
        from aexy.models.email_marketing import HostedImage
        import httpx

        # Get the image
        result = await db.execute(
            select(HostedImage).where(HostedImage.id == image_id)
        )
        image = result.scalar_one_or_none()

        if not image:
            raise HTTPException(status_code=404, detail="Image not found")

        # Record view in background
        background_tasks.add_task(
            _record_image_view,
            image_id=image_id,
        )

        # Fetch and serve the image from storage
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(image.storage_url, timeout=10.0)

                if response.status_code != 200:
                    raise HTTPException(status_code=404, detail="Image not available")

                return Response(
                    content=response.content,
                    media_type=image.content_type,
                    headers={
                        "Cache-Control": "public, max-age=31536000",  # 1 year cache
                        "Content-Length": str(len(response.content)),
                    },
                )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Image fetch timeout")
        except Exception as e:
            logger.error(f"Failed to fetch image {image_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch image")


async def _record_image_view(image_id: str):
    """Background task to record image view."""
    try:
        async with get_async_session() as db:
            from aexy.services.tracking_service import TrackingService

            tracking_service = TrackingService(db)
            await tracking_service.record_image_view(image_id)
            logger.debug(f"Recorded view for image {image_id}")
    except Exception as e:
        logger.error(f"Failed to record view for image {image_id}: {e}")


# =============================================================================
# UNSUBSCRIBE (One-Click)
# =============================================================================

@router.get(
    "/u/{token}",
    include_in_schema=False,
)
@router.post(
    "/u/{token}",
    include_in_schema=False,
)
async def one_click_unsubscribe(
    token: str,
    request: Request,
    c: str | None = None,  # campaign_id (optional)
):
    """
    Handle one-click unsubscribe from List-Unsubscribe header.

    Supports both GET (for link clicks) and POST (for mail client buttons).
    """
    async with get_async_session() as db:
        from aexy.models.email_marketing import (
            EmailSubscriber,
            UnsubscribeEvent,
            SubscriberStatus,
            UnsubscribeSource,
        )
        from uuid import uuid4
        from datetime import datetime, timezone

        # Find subscriber by preference token
        result = await db.execute(
            select(EmailSubscriber).where(EmailSubscriber.preference_token == token)
        )
        subscriber = result.scalar_one_or_none()

        if not subscriber:
            raise HTTPException(status_code=404, detail="Invalid unsubscribe token")

        # Check if already unsubscribed
        if subscriber.status == SubscriberStatus.UNSUBSCRIBED.value:
            return Response(
                content="You have already been unsubscribed.",
                media_type="text/html",
            )

        # Update subscriber status
        subscriber.status = SubscriberStatus.UNSUBSCRIBED.value
        subscriber.status_changed_at = datetime.now(timezone.utc)
        subscriber.status_reason = "one_click_unsubscribe"

        # Log unsubscribe event
        event = UnsubscribeEvent(
            id=str(uuid4()),
            subscriber_id=subscriber.id,
            campaign_id=c,
            unsubscribe_type="all",
            source=UnsubscribeSource.LINK.value,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        db.add(event)

        await db.commit()

        logger.info(f"Subscriber {subscriber.id} unsubscribed via one-click")

        # Return simple confirmation
        html_content = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Unsubscribed</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                       display: flex; justify-content: center; align-items: center;
                       min-height: 100vh; margin: 0; background: #f5f5f5; }
                .container { text-align: center; padding: 40px; background: white;
                            border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; margin-bottom: 16px; }
                p { color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>You've been unsubscribed</h1>
                <p>You will no longer receive emails from us.</p>
                <p>If this was a mistake, you can update your preferences at any time.</p>
            </div>
        </body>
        </html>
        """

        return Response(
            content=html_content,
            media_type="text/html",
        )
