"""Temporal activities for notification delivery (email + Slack).

Dispatched by NotificationService.create_notification() to deliver
notifications via email (SES/SMTP) and Slack DMs.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class SendNotificationEmailInput:
    notification_id: str
    recipient_id: str


@dataclass
class SendNotificationSlackInput:
    notification_id: str
    recipient_id: str
    workspace_id: str


@dataclass
class SendNotificationWebPushInput:
    notification_id: str
    recipient_id: str


@activity.defn
async def send_notification_email(input: SendNotificationEmailInput) -> dict[str, Any]:
    """Send an email for a notification via EmailService."""
    logger.info(f"Sending notification email: notification={input.notification_id}")

    from sqlalchemy import select
    from aexy.models.notification import Notification
    from aexy.models.developer import Developer
    from aexy.services.email_service import email_service

    async with async_session_maker() as db:
        # Load notification
        result = await db.execute(
            select(Notification).where(Notification.id == input.notification_id)
        )
        notification = result.scalar_one_or_none()
        if not notification:
            logger.warning(f"Notification {input.notification_id} not found")
            return {"success": False, "error": "Notification not found"}

        # Skip if email already sent
        if notification.email_sent:
            logger.info(f"Email already sent for notification {input.notification_id}")
            return {"success": True, "skipped": True}

        # Load recipient to get email
        result = await db.execute(
            select(Developer).where(Developer.id == input.recipient_id)
        )
        developer = result.scalar_one_or_none()
        if not developer or not developer.email:
            logger.info(f"No email for recipient {input.recipient_id}, skipping")
            return {"success": False, "error": "Recipient has no email"}

        # Send via EmailService (handles logging, email_sent flag, etc.)
        log = await email_service.send_notification_email(
            db=db, notification=notification, recipient_email=developer.email
        )
        await db.commit()

        return {
            "success": log.status == "sent",
            "log_id": str(log.id),
            "status": log.status,
        }


@activity.defn
async def send_notification_slack(input: SendNotificationSlackInput) -> dict[str, Any]:
    """Send a Slack notification via channel routing or DM fallback."""
    logger.info(f"Sending notification Slack: notification={input.notification_id}")

    from sqlalchemy import select
    from aexy.models.notification import Notification, NotificationCategoryPreference, EVENT_TYPE_TO_CATEGORY
    from aexy.services.slack_integration import SlackIntegrationService
    from aexy.schemas.integrations import SlackBlock, SlackMessage, SlackNotificationType

    async with async_session_maker() as db:
        # Load notification
        result = await db.execute(
            select(Notification).where(Notification.id == input.notification_id)
        )
        notification = result.scalar_one_or_none()
        if not notification:
            logger.warning(f"Notification {input.notification_id} not found")
            return {"success": False, "error": "Notification not found"}

        # Skip if Slack already sent
        if getattr(notification, "slack_sent", False):
            logger.info(f"Slack already sent for notification {input.notification_id}")
            return {"success": True, "skipped": True}

        # Get Slack integration for workspace
        slack_service = SlackIntegrationService()
        integration = await slack_service.get_integration_by_workspace(
            input.workspace_id, db
        )
        if not integration:
            logger.info(f"No Slack integration for workspace {input.workspace_id}")
            return {"success": False, "error": "No Slack integration"}

        # Determine target channel via routing priority:
        # 1. Per-category slack_channel_id
        # 2. Integration default_channel_id
        # 3. DM to mapped Slack user
        target_channel_id = None
        route_type = "dm"

        # Check per-category preference
        category = EVENT_TYPE_TO_CATEGORY.get(notification.event_type)
        if category:
            cat_result = await db.execute(
                select(NotificationCategoryPreference).where(
                    NotificationCategoryPreference.developer_id == input.recipient_id,
                    NotificationCategoryPreference.category == category,
                )
            )
            cat_pref = cat_result.scalar_one_or_none()
            if cat_pref and cat_pref.slack_channel_id:
                target_channel_id = cat_pref.slack_channel_id
                route_type = "category_channel"
                logger.info(f"Routing to category channel {target_channel_id} for {category}")

        # Fallback to integration default channel
        if not target_channel_id and getattr(integration, "default_channel_id", None):
            target_channel_id = integration.default_channel_id
            route_type = "default_channel"
            logger.info(f"Routing to default channel {target_channel_id}")

        # Fallback to DM
        if not target_channel_id:
            user_mappings = integration.user_mappings or {}
            for slack_id, dev_id in user_mappings.items():
                if dev_id == input.recipient_id:
                    target_channel_id = slack_id
                    break

            if not target_channel_id:
                logger.info(f"No Slack user mapping for developer {input.recipient_id}")
                return {"success": False, "error": "No Slack user mapping"}

        # Build message blocks
        context = notification.context or {}
        action_url = context.get("action_url")

        blocks: list[SlackBlock] = [
            SlackBlock(
                type="section",
                text={
                    "type": "mrkdwn",
                    "text": f"*{notification.title}*\n{notification.body}",
                },
            )
        ]

        if action_url:
            from aexy.core.config import settings
            if action_url.startswith("/"):
                action_url = f"{settings.frontend_url}{action_url}"
                
            blocks.append(SlackBlock(
                type="actions",
                elements=[
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Details"},
                        "url": action_url,
                        "action_id": "notification_view",
                    }
                ],
            ))

        slack_message = SlackMessage(
            text=f"{notification.title}: {notification.body}",
            blocks=blocks,
        )

        response = await slack_service.send_message(
            integration=integration,
            channel_id=target_channel_id,
            message=slack_message,
            notification_type=SlackNotificationType.AUTOMATION,
            db=db,
        )

        # Update slack_sent tracking if column exists
        if response.success and hasattr(notification, "slack_sent"):
            notification.slack_sent = True
            notification.slack_sent_at = datetime.now(timezone.utc)
            await db.commit()

        return {
            "success": response.success,
            "sent_to": target_channel_id,
            "route_type": route_type,
            "error": response.error,
        }


@activity.defn
async def send_notification_web_push(input: SendNotificationWebPushInput) -> dict[str, Any]:
    """Send a web push notification to all active subscriptions for a developer."""
    logger.info(f"Sending web push notification: notification={input.notification_id}")

    from sqlalchemy import select
    from aexy.models.notification import Notification
    from aexy.services.web_push_service import WebPushService

    async with async_session_maker() as db:
        # Load notification
        result = await db.execute(
            select(Notification).where(Notification.id == input.notification_id)
        )
        notification = result.scalar_one_or_none()
        if not notification:
            logger.warning(f"Notification {input.notification_id} not found")
            return {"success": False, "error": "Notification not found"}

        context = notification.context or {}
        action_url = context.get("action_url")

        web_push_service = WebPushService(db)
        results = await web_push_service.send_push(
            developer_id=input.recipient_id,
            title=notification.title,
            body=notification.body,
            action_url=action_url,
        )

        any_success = any(r.get("success") for r in results)
        return {
            "success": any_success,
            "results": results,
        }
