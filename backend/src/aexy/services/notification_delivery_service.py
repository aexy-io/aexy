"""Service for recording and querying notification delivery events."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func, and_, distinct, case, desc
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.notification import Notification, EmailNotificationLog
from aexy.models.notification_delivery import (
    NotificationDeliveryEvent,
    DeliveryChannel,
    DeliveryStatus,
)

logger = logging.getLogger(__name__)


class NotificationDeliveryService:
    """Service for the notification delivery event ledger."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # RECORD EVENTS
    # =========================================================================

    async def record_event(
        self,
        notification_id: str,
        developer_id: str,
        channel: str,
        status: str,
        provider: str | None = None,
        provider_message_id: str | None = None,
        event_metadata: dict | None = None,
        event_timestamp: datetime | None = None,
    ) -> NotificationDeliveryEvent:
        """Record a delivery event (append-only)."""
        event = NotificationDeliveryEvent(
            id=str(uuid4()),
            notification_id=notification_id,
            developer_id=developer_id,
            channel=channel,
            status=status,
            provider=provider,
            provider_message_id=provider_message_id,
            event_metadata=event_metadata or {},
            event_timestamp=event_timestamp or datetime.now(timezone.utc),
        )
        self.db.add(event)
        await self.db.flush()
        return event

    # =========================================================================
    # QUERY: TIMELINE
    # =========================================================================

    async def get_delivery_timeline(
        self,
        notification_id: str,
        developer_id: str,
    ) -> dict:
        """Get all delivery events for a notification grouped by channel.

        Returns:
            {
                "notification_id": "...",
                "channels": {
                    "email": {"current_status": "delivered", "events": [...]},
                    "in_app": {"current_status": "opened", "events": [...]},
                }
            }
        """
        result = await self.db.execute(
            select(NotificationDeliveryEvent)
            .where(
                and_(
                    NotificationDeliveryEvent.notification_id == notification_id,
                    NotificationDeliveryEvent.developer_id == developer_id,
                )
            )
            .order_by(NotificationDeliveryEvent.event_timestamp.asc())
        )
        events = list(result.scalars().all())

        channels: dict[str, dict] = {}
        for event in events:
            if event.channel not in channels:
                channels[event.channel] = {"current_status": event.status, "events": []}
            channels[event.channel]["current_status"] = event.status
            channels[event.channel]["events"].append({
                "id": event.id,
                "status": event.status,
                "provider": event.provider,
                "provider_message_id": event.provider_message_id,
                "event_metadata": event.event_metadata,
                "event_timestamp": event.event_timestamp.isoformat(),
                "created_at": event.created_at.isoformat(),
            })

        return {"notification_id": notification_id, "channels": channels}

    # =========================================================================
    # QUERY: STATUS SUMMARY
    # =========================================================================

    async def get_delivery_status_summary(
        self,
        notification_id: str,
        developer_id: str,
    ) -> dict[str, str]:
        """Get the latest status per channel for a notification.

        Returns:
            {"email": "delivered", "in_app": "opened", "slack": "sent"}
        """
        # Subquery: latest event_timestamp per channel
        latest_sq = (
            select(
                NotificationDeliveryEvent.channel,
                func.max(NotificationDeliveryEvent.event_timestamp).label("max_ts"),
            )
            .where(
                and_(
                    NotificationDeliveryEvent.notification_id == notification_id,
                    NotificationDeliveryEvent.developer_id == developer_id,
                )
            )
            .group_by(NotificationDeliveryEvent.channel)
            .subquery()
        )

        result = await self.db.execute(
            select(NotificationDeliveryEvent.channel, NotificationDeliveryEvent.status)
            .join(
                latest_sq,
                and_(
                    NotificationDeliveryEvent.channel == latest_sq.c.channel,
                    NotificationDeliveryEvent.event_timestamp == latest_sq.c.max_ts,
                    NotificationDeliveryEvent.notification_id == notification_id,
                ),
            )
        )

        return {row[0]: row[1] for row in result.all()}

    # =========================================================================
    # QUERY: LIST WITH DELIVERY STATUS
    # =========================================================================

    async def list_notifications_with_delivery(
        self,
        developer_id: str,
        channel: str | None = None,
        status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """List notifications enriched with current delivery status per channel.

        Returns paginated results with filtering support.
        """
        # Base query: notifications for this developer
        base_filters = [Notification.recipient_id == developer_id]
        if date_from:
            base_filters.append(Notification.created_at >= date_from)
        if date_to:
            base_filters.append(Notification.created_at <= date_to)

        # If filtering by channel or status, join delivery events
        if channel or status:
            # Get notification IDs matching the filter
            event_filters = [NotificationDeliveryEvent.developer_id == developer_id]
            if channel:
                event_filters.append(NotificationDeliveryEvent.channel == channel)
            if status:
                event_filters.append(NotificationDeliveryEvent.status == status)

            matching_ids = (
                select(distinct(NotificationDeliveryEvent.notification_id))
                .where(and_(*event_filters))
                .scalar_subquery()
            )
            base_filters.append(Notification.id.in_(matching_ids))

        # Count total
        count_result = await self.db.execute(
            select(func.count(Notification.id)).where(and_(*base_filters))
        )
        total = count_result.scalar() or 0

        # Fetch page
        offset = (page - 1) * per_page
        result = await self.db.execute(
            select(Notification)
            .where(and_(*base_filters))
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        notifications = list(result.scalars().all())

        # Batch-fetch delivery status for these notifications
        items = []
        if notifications:
            notification_ids = [n.id for n in notifications]

            # Get latest status per (notification_id, channel) using DISTINCT ON
            # Fallback: fetch all events and compute in Python
            events_result = await self.db.execute(
                select(NotificationDeliveryEvent)
                .where(
                    NotificationDeliveryEvent.notification_id.in_(notification_ids)
                )
                .order_by(
                    NotificationDeliveryEvent.notification_id,
                    NotificationDeliveryEvent.channel,
                    NotificationDeliveryEvent.event_timestamp.desc(),
                )
            )
            all_events = list(events_result.scalars().all())

            # Build latest status map: {notification_id: {channel: status}}
            status_map: dict[str, dict[str, str]] = {}
            seen: set[tuple[str, str]] = set()
            for event in all_events:
                key = (event.notification_id, event.channel)
                if key not in seen:
                    seen.add(key)
                    status_map.setdefault(event.notification_id, {})[event.channel] = event.status

            for n in notifications:
                items.append({
                    "id": n.id,
                    "event_type": n.event_type,
                    "title": n.title,
                    "body": n.body,
                    "created_at": n.created_at.isoformat(),
                    "is_read": n.is_read,
                    "channels": status_map.get(n.id, {}),
                })

        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "has_next": (page * per_page) < total,
        }

    # =========================================================================
    # QUERY: AGGREGATE STATS
    # =========================================================================

    async def get_aggregate_stats(
        self,
        developer_id: str,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict:
        """Compute per-channel delivery stats (counts and rates).

        Returns:
            {
                "channels": [
                    {"channel": "email", "total_sent": 100, "total_delivered": 95, ...},
                ],
                "overall_delivery_rate": 0.95,
                "total_notifications": 150
            }
        """
        filters = [NotificationDeliveryEvent.developer_id == developer_id]
        if date_from:
            filters.append(NotificationDeliveryEvent.event_timestamp >= date_from)
        if date_to:
            filters.append(NotificationDeliveryEvent.event_timestamp <= date_to)

        # Count events by channel and status
        result = await self.db.execute(
            select(
                NotificationDeliveryEvent.channel,
                NotificationDeliveryEvent.status,
                func.count(distinct(NotificationDeliveryEvent.notification_id)),
            )
            .where(and_(*filters))
            .group_by(
                NotificationDeliveryEvent.channel,
                NotificationDeliveryEvent.status,
            )
        )

        # Build per-channel stats
        channel_data: dict[str, dict[str, int]] = {}
        for row in result.all():
            ch, st, cnt = row
            channel_data.setdefault(ch, {})[st] = cnt

        channels = []
        total_sent_all = 0
        total_delivered_all = 0

        for ch, statuses in channel_data.items():
            sent = statuses.get(DeliveryStatus.SENT.value, 0) + statuses.get(DeliveryStatus.QUEUED.value, 0)
            delivered = statuses.get(DeliveryStatus.DELIVERED.value, 0)
            opened = statuses.get(DeliveryStatus.OPENED.value, 0)
            clicked = statuses.get(DeliveryStatus.CLICKED.value, 0)
            failed = statuses.get(DeliveryStatus.FAILED.value, 0)
            bounced = statuses.get(DeliveryStatus.BOUNCED.value, 0)

            # For rates, denominator is sent (includes queued that were sent)
            total_for_rate = sent + delivered + opened + clicked + failed + bounced
            delivery_rate = (delivered + opened + clicked) / total_for_rate if total_for_rate > 0 else 0.0
            open_rate = (opened + clicked) / total_for_rate if total_for_rate > 0 else 0.0
            click_rate = clicked / total_for_rate if total_for_rate > 0 else 0.0

            channels.append({
                "channel": ch,
                "total_sent": total_for_rate,
                "total_delivered": delivered + opened + clicked,
                "total_opened": opened + clicked,
                "total_clicked": clicked,
                "total_failed": failed,
                "total_bounced": bounced,
                "delivery_rate": round(delivery_rate, 4),
                "open_rate": round(open_rate, 4),
                "click_rate": round(click_rate, 4),
            })

            total_sent_all += total_for_rate
            total_delivered_all += delivered + opened + clicked

        # Total unique notifications
        notif_count = await self.db.execute(
            select(func.count(distinct(NotificationDeliveryEvent.notification_id)))
            .where(and_(*filters))
        )
        total_notifications = notif_count.scalar() or 0

        overall_delivery_rate = total_delivered_all / total_sent_all if total_sent_all > 0 else 0.0

        return {
            "channels": channels,
            "overall_delivery_rate": round(overall_delivery_rate, 4),
            "total_notifications": total_notifications,
            "period_start": date_from.isoformat() if date_from else None,
            "period_end": date_to.isoformat() if date_to else None,
        }

    # =========================================================================
    # WEBHOOK CORRELATION
    # =========================================================================

    async def correlate_provider_event(
        self,
        provider_message_id: str,
        event_type: str,
        provider: str | None = None,
        event_metadata: dict | None = None,
        event_timestamp: datetime | None = None,
    ) -> NotificationDeliveryEvent | None:
        """Correlate a provider webhook event to a notification delivery event.

        Looks up the notification via EmailNotificationLog.ses_message_id,
        then records the corresponding delivery event.
        """
        # Map provider event types to our status enum
        status_map = {
            "delivery": DeliveryStatus.DELIVERED.value,
            "send": DeliveryStatus.SENT.value,
            "open": DeliveryStatus.OPENED.value,
            "click": DeliveryStatus.CLICKED.value,
            "bounce": DeliveryStatus.BOUNCED.value,
            "complaint": DeliveryStatus.FAILED.value,
            "reject": DeliveryStatus.FAILED.value,
        }

        status = status_map.get(event_type)
        if not status:
            logger.debug(f"Unmapped provider event type: {event_type}")
            return None

        # Find the notification via EmailNotificationLog
        result = await self.db.execute(
            select(EmailNotificationLog)
            .where(EmailNotificationLog.ses_message_id == provider_message_id)
        )
        email_log = result.scalar_one_or_none()

        if not email_log or not email_log.notification_id:
            return None

        # Get the notification to find the developer_id
        notif_result = await self.db.execute(
            select(Notification).where(Notification.id == email_log.notification_id)
        )
        notification = notif_result.scalar_one_or_none()
        if not notification:
            return None

        event = await self.record_event(
            notification_id=notification.id,
            developer_id=notification.recipient_id,
            channel=DeliveryChannel.EMAIL.value,
            status=status,
            provider=provider,
            provider_message_id=provider_message_id,
            event_metadata=event_metadata or {},
            event_timestamp=event_timestamp or datetime.now(timezone.utc),
        )

        logger.debug(
            f"Correlated provider event: {event_type} -> {status} "
            f"for notification {notification.id}"
        )
        return event
