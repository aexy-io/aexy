"""Usage alerts service for billing threshold notifications."""

import logging
from datetime import datetime, timezone

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.notification import NotificationEventType
from aexy.services.limits_service import LimitsService
from aexy.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

settings = get_settings()

# Alert thresholds (percentage)
ALERT_THRESHOLDS = [80, 90, 100]

# TTL for alert deduplication (24 hours)
ALERT_DEDUP_TTL = 86400  # seconds


class UsageAlertsService:
    """Service for checking usage thresholds and sending alerts."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._redis: redis.Redis | None = None

    async def get_redis(self) -> redis.Redis:
        """Get or create Redis connection for deduplication."""
        if self._redis is None:
            self._redis = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    def _get_event_type_for_threshold(self, threshold: int) -> NotificationEventType:
        """Get the notification event type for a threshold percentage."""
        if threshold == 80:
            return NotificationEventType.USAGE_ALERT_80
        elif threshold == 90:
            return NotificationEventType.USAGE_ALERT_90
        else:  # 100
            return NotificationEventType.USAGE_ALERT_100

    def _get_dedup_key(
        self,
        developer_id: str,
        resource_type: str,
        threshold: int,
    ) -> str:
        """Generate a deduplication key for this alert."""
        return f"usage_alert:{developer_id}:{resource_type}:{threshold}"

    async def _has_recent_alert(
        self,
        developer_id: str,
        resource_type: str,
        threshold: int,
    ) -> bool:
        """Check if we've already sent this alert recently."""
        try:
            redis_client = await self.get_redis()
            key = self._get_dedup_key(developer_id, resource_type, threshold)
            return await redis_client.exists(key) > 0
        except Exception as e:
            logger.warning(f"Failed to check alert dedup: {e}")
            return False  # Allow sending if we can't check

    async def _mark_alert_sent(
        self,
        developer_id: str,
        resource_type: str,
        threshold: int,
    ) -> None:
        """Mark that we've sent this alert."""
        try:
            redis_client = await self.get_redis()
            key = self._get_dedup_key(developer_id, resource_type, threshold)
            await redis_client.setex(key, ALERT_DEDUP_TTL, "1")
        except Exception as e:
            logger.warning(f"Failed to mark alert as sent: {e}")

    async def check_and_send_alerts(
        self,
        developer_id: str,
    ) -> dict[str, list[str]]:
        """Check usage thresholds and send alerts if needed.

        Returns a dict of resource_type -> list of sent alert thresholds.
        """
        alerts_sent: dict[str, list[str]] = {}

        # Get current usage thresholds
        limits_service = LimitsService(self.db)
        thresholds = await limits_service.get_usage_thresholds(developer_id)

        # Check LLM requests
        if thresholds.llm_requests > 0:
            sent = await self._check_resource_alerts(
                developer_id=developer_id,
                resource_type="LLM requests",
                percent_used=thresholds.llm_requests,
            )
            if sent:
                alerts_sent["llm_requests"] = sent

        # Check repositories
        if thresholds.repos > 0:
            sent = await self._check_resource_alerts(
                developer_id=developer_id,
                resource_type="repositories",
                percent_used=thresholds.repos,
            )
            if sent:
                alerts_sent["repos"] = sent

        # Check API calls (if tracked)
        if thresholds.api_calls > 0:
            sent = await self._check_resource_alerts(
                developer_id=developer_id,
                resource_type="API calls",
                percent_used=thresholds.api_calls,
            )
            if sent:
                alerts_sent["api_calls"] = sent

        return alerts_sent

    async def _check_resource_alerts(
        self,
        developer_id: str,
        resource_type: str,
        percent_used: float,
    ) -> list[str]:
        """Check if we need to send alerts for a specific resource.

        Returns list of threshold alerts sent (e.g., ["80%", "90%"]).
        """
        sent_alerts: list[str] = []

        for threshold in ALERT_THRESHOLDS:
            # Only send alert if we've crossed this threshold
            if percent_used < threshold:
                continue

            # Check if we've already sent this alert
            if await self._has_recent_alert(developer_id, resource_type, threshold):
                continue

            # Send the alert
            await self._send_alert(
                developer_id=developer_id,
                resource_type=resource_type,
                threshold=threshold,
                percent_used=percent_used,
            )

            # Mark as sent
            await self._mark_alert_sent(developer_id, resource_type, threshold)
            sent_alerts.append(f"{threshold}%")

        return sent_alerts

    async def _send_alert(
        self,
        developer_id: str,
        resource_type: str,
        threshold: int,
        percent_used: float,
    ) -> None:
        """Send a usage alert notification."""
        notification_service = NotificationService(self.db)

        # Get current usage details
        limits_service = LimitsService(self.db)
        limit_check = await limits_service.check_llm_limit_for_billing(developer_id)

        current = limit_check.current
        limit = limit_check.limit

        event_type = self._get_event_type_for_threshold(threshold)

        # Create notification
        await notification_service.create_notification_from_event(
            recipient_id=developer_id,
            event_type=event_type,
            context={
                "resource_type": resource_type,
                "current": current,
                "limit": limit,
                "percent_used": round(percent_used, 1),
                "threshold": threshold,
                "action_url": "/settings/billing",
            },
        )

        logger.info(
            f"Sent {threshold}% usage alert for {resource_type} to developer {developer_id}"
        )

    async def clear_alerts_for_developer(
        self,
        developer_id: str,
    ) -> int:
        """Clear all alert dedup keys for a developer (e.g., after plan upgrade).

        Returns count of keys cleared.
        """
        try:
            redis_client = await self.get_redis()
            pattern = f"usage_alert:{developer_id}:*"

            # Find all matching keys
            keys = []
            async for key in redis_client.scan_iter(pattern):
                keys.append(key)

            if keys:
                await redis_client.delete(*keys)

            logger.info(f"Cleared {len(keys)} usage alert keys for developer {developer_id}")
            return len(keys)

        except Exception as e:
            logger.warning(f"Failed to clear alert keys: {e}")
            return 0


# Convenience function
async def check_usage_alerts(
    db: AsyncSession,
    developer_id: str,
) -> dict[str, list[str]]:
    """Check and send usage alerts for a developer.

    This is a convenience function that creates the service and checks alerts.
    """
    service = UsageAlertsService(db)
    return await service.check_and_send_alerts(developer_id)
