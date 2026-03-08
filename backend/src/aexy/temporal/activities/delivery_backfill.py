"""One-time backfill activity for notification delivery events.

Reads existing Notification and EmailNotificationLog records to populate
the notification_delivery_events table with historical data.
"""

import logging
from dataclasses import dataclass
from datetime import timezone
from typing import Any
from uuid import uuid4

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class BackfillDeliveryEventsInput:
    batch_size: int = 500
    dry_run: bool = False


@activity.defn
async def backfill_delivery_events(input: BackfillDeliveryEventsInput) -> dict[str, Any]:
    """Backfill notification_delivery_events from existing data.

    Sources:
    1. Notification.in_app_delivered=True -> (in_app, delivered)
    2. Notification.is_read=True -> (in_app, opened) with read_at timestamp
    3. Notification.email_sent=True -> (email, sent) with email_sent_at
    4. Notification.slack_sent=True -> (slack, sent) with slack_sent_at
    5. EmailNotificationLog -> email events with ses_message_id
    """
    logger.info(f"Starting delivery events backfill (batch_size={input.batch_size}, dry_run={input.dry_run})")

    from sqlalchemy import select, func, and_
    from aexy.models.notification import Notification, EmailNotificationLog
    from aexy.models.notification_delivery import NotificationDeliveryEvent, DeliveryChannel, DeliveryStatus

    async with async_session_maker() as db:
        # Check how many events already exist
        existing_count = (await db.execute(
            select(func.count(NotificationDeliveryEvent.id))
        )).scalar() or 0

        if existing_count > 0:
            logger.info(f"Found {existing_count} existing delivery events, skipping backfill")
            return {"status": "skipped", "existing_events": existing_count}

        created = 0
        offset = 0

        while True:
            # Fetch batch of notifications
            result = await db.execute(
                select(Notification)
                .order_by(Notification.created_at.asc())
                .offset(offset)
                .limit(input.batch_size)
            )
            notifications = list(result.scalars().all())

            if not notifications:
                break

            for n in notifications:
                # In-app delivered
                if n.in_app_delivered:
                    db.add(NotificationDeliveryEvent(
                        id=str(uuid4()),
                        notification_id=n.id,
                        developer_id=n.recipient_id,
                        channel=DeliveryChannel.IN_APP.value,
                        status=DeliveryStatus.DELIVERED.value,
                        event_timestamp=n.created_at.replace(tzinfo=timezone.utc) if n.created_at.tzinfo is None else n.created_at,
                    ))
                    created += 1

                # In-app opened (read)
                if n.is_read and n.read_at:
                    db.add(NotificationDeliveryEvent(
                        id=str(uuid4()),
                        notification_id=n.id,
                        developer_id=n.recipient_id,
                        channel=DeliveryChannel.IN_APP.value,
                        status=DeliveryStatus.OPENED.value,
                        event_timestamp=n.read_at.replace(tzinfo=timezone.utc) if n.read_at.tzinfo is None else n.read_at,
                    ))
                    created += 1

                # Email sent
                if n.email_sent:
                    db.add(NotificationDeliveryEvent(
                        id=str(uuid4()),
                        notification_id=n.id,
                        developer_id=n.recipient_id,
                        channel=DeliveryChannel.EMAIL.value,
                        status=DeliveryStatus.SENT.value,
                        provider="ses",
                        event_timestamp=(n.email_sent_at or n.created_at).replace(tzinfo=timezone.utc)
                        if (n.email_sent_at or n.created_at).tzinfo is None
                        else (n.email_sent_at or n.created_at),
                    ))
                    created += 1

                # Slack sent
                if n.slack_sent:
                    db.add(NotificationDeliveryEvent(
                        id=str(uuid4()),
                        notification_id=n.id,
                        developer_id=n.recipient_id,
                        channel=DeliveryChannel.SLACK.value,
                        status=DeliveryStatus.SENT.value,
                        provider="slack",
                        event_timestamp=(n.slack_sent_at or n.created_at).replace(tzinfo=timezone.utc)
                        if (n.slack_sent_at or n.created_at).tzinfo is None
                        else (n.slack_sent_at or n.created_at),
                    ))
                    created += 1

            offset += input.batch_size

            if not input.dry_run:
                await db.commit()

            logger.info(f"Processed {offset} notifications, {created} events created")

        # Backfill from EmailNotificationLog for provider_message_id correlation
        offset = 0
        email_events = 0

        while True:
            result = await db.execute(
                select(EmailNotificationLog)
                .where(
                    and_(
                        EmailNotificationLog.notification_id.isnot(None),
                        EmailNotificationLog.ses_message_id.isnot(None),
                    )
                )
                .order_by(EmailNotificationLog.created_at.asc())
                .offset(offset)
                .limit(input.batch_size)
            )
            logs = list(result.scalars().all())

            if not logs:
                break

            for log in logs:
                # Get notification for developer_id
                notif_result = await db.execute(
                    select(Notification).where(Notification.id == log.notification_id)
                )
                notification = notif_result.scalar_one_or_none()
                if not notification:
                    continue

                # Map log status to delivery status
                status_map = {
                    "delivered": DeliveryStatus.DELIVERED.value,
                    "bounced": DeliveryStatus.BOUNCED.value,
                    "failed": DeliveryStatus.FAILED.value,
                }
                delivery_status = status_map.get(log.status)
                if delivery_status:
                    db.add(NotificationDeliveryEvent(
                        id=str(uuid4()),
                        notification_id=notification.id,
                        developer_id=notification.recipient_id,
                        channel=DeliveryChannel.EMAIL.value,
                        status=delivery_status,
                        provider="ses",
                        provider_message_id=log.ses_message_id,
                        event_metadata={"error": log.error_message} if log.error_message else {},
                        event_timestamp=(log.sent_at or log.created_at).replace(tzinfo=timezone.utc)
                        if (log.sent_at or log.created_at).tzinfo is None
                        else (log.sent_at or log.created_at),
                    ))
                    email_events += 1

            offset += input.batch_size

            if not input.dry_run:
                await db.commit()

        total = created + email_events
        logger.info(f"Backfill complete: {total} events ({created} from notifications, {email_events} from email logs)")
        return {
            "status": "completed",
            "notification_events": created,
            "email_log_events": email_events,
            "total_events": total,
        }
