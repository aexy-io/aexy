"""Web Push notification service using VAPID and the Web Push protocol."""

import json
import logging
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.notification import WebPushSubscription

logger = logging.getLogger(__name__)


class WebPushService:
    """Service for managing web push subscriptions and sending push notifications."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def subscribe(
        self,
        developer_id: str,
        endpoint: str,
        p256dh_key: str,
        auth_key: str,
        user_agent: str | None = None,
    ) -> WebPushSubscription:
        """Subscribe a browser for push notifications.

        If the endpoint already exists for this developer, reactivate it.
        """
        # Check for existing subscription
        query = select(WebPushSubscription).where(
            and_(
                WebPushSubscription.developer_id == developer_id,
                WebPushSubscription.endpoint == endpoint,
            )
        )
        result = await self.db.execute(query)
        existing = result.scalar_one_or_none()

        if existing:
            existing.p256dh_key = p256dh_key
            existing.auth_key = auth_key
            existing.user_agent = user_agent
            existing.is_active = True
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

        sub = WebPushSubscription(
            id=str(uuid4()),
            developer_id=developer_id,
            endpoint=endpoint,
            p256dh_key=p256dh_key,
            auth_key=auth_key,
            user_agent=user_agent,
            is_active=True,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def unsubscribe(self, developer_id: str, endpoint: str) -> bool:
        """Deactivate a push subscription."""
        query = select(WebPushSubscription).where(
            and_(
                WebPushSubscription.developer_id == developer_id,
                WebPushSubscription.endpoint == endpoint,
            )
        )
        result = await self.db.execute(query)
        sub = result.scalar_one_or_none()

        if not sub:
            return False

        sub.is_active = False
        await self.db.commit()
        return True

    async def get_subscriptions(self, developer_id: str) -> list[WebPushSubscription]:
        """Get all active push subscriptions for a developer."""
        query = select(WebPushSubscription).where(
            and_(
                WebPushSubscription.developer_id == developer_id,
                WebPushSubscription.is_active == True,
            )
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def send_push(
        self,
        developer_id: str,
        title: str,
        body: str,
        action_url: str | None = None,
        icon: str | None = None,
    ) -> list[dict]:
        """Send push notification to all active subscriptions for a developer.

        Returns list of results per subscription.
        """
        settings = get_settings()
        if not settings.vapid_private_key or not settings.vapid_public_key:
            logger.warning("VAPID keys not configured, skipping web push")
            return [{"success": False, "error": "VAPID keys not configured"}]

        subscriptions = await self.get_subscriptions(developer_id)
        if not subscriptions:
            return [{"success": False, "error": "No active subscriptions"}]

        payload = json.dumps({
            "title": title,
            "body": body,
            "action_url": action_url,
            "icon": icon or "/icon-192.png",
        })

        vapid_claims = {"sub": settings.vapid_claims_email}
        results = []

        for sub in subscriptions:
            try:
                from pywebpush import webpush, WebPushException

                subscription_info = {
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key,
                    },
                }

                webpush(
                    subscription_info=subscription_info,
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims=vapid_claims,
                )
                results.append({"success": True, "endpoint": sub.endpoint})

            except WebPushException as e:
                logger.warning(f"Web push failed for {sub.endpoint}: {e}")
                # If 410 Gone or 404, deactivate the subscription
                if hasattr(e, "response") and e.response and e.response.status_code in (404, 410):
                    sub.is_active = False
                    await self.db.commit()
                results.append({"success": False, "endpoint": sub.endpoint, "error": str(e)})

            except Exception as e:
                logger.exception(f"Unexpected error sending web push to {sub.endpoint}")
                results.append({"success": False, "endpoint": sub.endpoint, "error": str(e)})

        return results
