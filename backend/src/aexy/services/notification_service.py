"""Notification service for managing in-app and email notifications."""

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.developer import Developer
from aexy.models.notification import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    EmailNotificationLog,
    Notification,
    NotificationEventType,
    NotificationPreference,
)
from aexy.schemas.notification import (
    NotificationContext,
    NotificationCreate,
    NotificationEventType as SchemaEventType,
    NotificationResponse,
    NOTIFICATION_TEMPLATES,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for managing notifications and preferences."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize the notification service.

        Args:
            db: Database session.
        """
        self.db = db

    # ============ Notification Creation ============

    async def create_notification(
        self,
        recipient_id: str,
        event_type: NotificationEventType | str,
        title: str,
        body: str,
        context: dict[str, Any] | None = None,
        send_email: bool = True,
    ) -> Notification | None:
        """Create a notification for a user.

        Args:
            recipient_id: Developer ID of recipient.
            event_type: Type of notification event.
            title: Notification title.
            body: Notification body text.
            context: Additional context for navigation/rendering.
            send_email: Whether to also send email (respects user preferences).

        Returns:
            Created Notification or None if disabled by preferences.
        """
        event_type_str = event_type.value if isinstance(event_type, NotificationEventType) else event_type

        # Check user preferences
        pref = await self.get_preference(recipient_id, event_type_str)

        # If in-app is disabled, don't create notification
        if pref and not pref.in_app_enabled:
            logger.debug(f"In-app notification disabled for {event_type_str}, recipient: {recipient_id}")
            return None

        # Create notification
        notification = Notification(
            id=str(uuid4()),
            recipient_id=recipient_id,
            event_type=event_type_str,
            title=title,
            body=body,
            context=context or {},
            is_read=False,
            in_app_delivered=True,
        )

        self.db.add(notification)
        await self.db.commit()
        await self.db.refresh(notification)

        # Queue email if enabled
        if send_email and pref and pref.email_enabled:
            # Email sending will be handled by Celery task
            # For now, just mark that email should be sent
            logger.info(f"Email notification queued for {recipient_id}")

        logger.info(f"Created notification {notification.id} for {recipient_id}: {event_type_str}")
        return notification

    async def create_notification_from_event(
        self,
        recipient_id: str,
        event_type: NotificationEventType | str,
        context: dict[str, Any],
    ) -> Notification | None:
        """Create a notification using event template.

        Args:
            recipient_id: Developer ID of recipient.
            event_type: Type of notification event.
            context: Context variables for template rendering.

        Returns:
            Created Notification or None.
        """
        event_type_enum = (
            event_type
            if isinstance(event_type, NotificationEventType)
            else NotificationEventType(event_type)
        )

        template = NOTIFICATION_TEMPLATES.get(SchemaEventType(event_type_enum.value), {})
        title = template.get("title", "Notification")
        body_template = template.get("body_template", "You have a new notification.")

        # Render body with context
        try:
            body = body_template.format(**context)
        except KeyError as e:
            logger.warning(f"Missing template variable: {e}")
            body = body_template

        return await self.create_notification(
            recipient_id=recipient_id,
            event_type=event_type_enum,
            title=title,
            body=body,
            context=context,
        )

    # ============ Notification Retrieval ============

    async def get_notifications(
        self,
        developer_id: str,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> tuple[list[Notification], int]:
        """Get notifications for a user.

        Args:
            developer_id: Developer ID.
            limit: Maximum notifications to return.
            offset: Offset for pagination.
            unread_only: Only return unread notifications.

        Returns:
            Tuple of (notifications list, total count).
        """
        # Build base query
        query = select(Notification).where(Notification.recipient_id == developer_id)

        if unread_only:
            query = query.where(Notification.is_read == False)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query) or 0

        # Get paginated results
        query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        notifications = list(result.scalars().all())

        return notifications, total

    async def get_unread_count(self, developer_id: str) -> int:
        """Get count of unread notifications.

        Args:
            developer_id: Developer ID.

        Returns:
            Count of unread notifications.
        """
        query = select(func.count()).where(
            and_(
                Notification.recipient_id == developer_id,
                Notification.is_read == False,
            )
        )
        return await self.db.scalar(query) or 0

    async def poll_notifications(
        self,
        developer_id: str,
        since: datetime,
    ) -> list[Notification]:
        """Poll for new notifications since a timestamp.

        Args:
            developer_id: Developer ID.
            since: Only return notifications created after this time.

        Returns:
            List of new notifications.
        """
        query = (
            select(Notification)
            .where(
                and_(
                    Notification.recipient_id == developer_id,
                    Notification.created_at > since,
                )
            )
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_notification(
        self,
        notification_id: str,
        developer_id: str | None = None,
    ) -> Notification | None:
        """Get a single notification.

        Args:
            notification_id: Notification ID.
            developer_id: Optional developer ID for authorization check.

        Returns:
            Notification or None.
        """
        query = select(Notification).where(Notification.id == notification_id)
        if developer_id:
            query = query.where(Notification.recipient_id == developer_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    # ============ Notification Actions ============

    async def mark_as_read(
        self,
        notification_id: str,
        developer_id: str,
    ) -> Notification | None:
        """Mark a notification as read.

        Args:
            notification_id: Notification ID.
            developer_id: Developer ID for authorization.

        Returns:
            Updated Notification or None.
        """
        notification = await self.get_notification(notification_id, developer_id)
        if not notification:
            return None

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.utcnow()
            await self.db.commit()
            await self.db.refresh(notification)

        return notification

    async def mark_all_as_read(self, developer_id: str) -> int:
        """Mark all notifications as read for a user.

        Args:
            developer_id: Developer ID.

        Returns:
            Count of notifications marked as read.
        """
        stmt = (
            update(Notification)
            .where(
                and_(
                    Notification.recipient_id == developer_id,
                    Notification.is_read == False,
                )
            )
            .values(is_read=True, read_at=datetime.utcnow())
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount

    async def delete_notification(
        self,
        notification_id: str,
        developer_id: str,
    ) -> bool:
        """Delete a notification.

        Args:
            notification_id: Notification ID.
            developer_id: Developer ID for authorization.

        Returns:
            True if deleted, False otherwise.
        """
        notification = await self.get_notification(notification_id, developer_id)
        if not notification:
            return False

        await self.db.delete(notification)
        await self.db.commit()
        return True

    # ============ Notification Preferences ============

    async def get_preferences(
        self,
        developer_id: str,
    ) -> dict[str, NotificationPreference]:
        """Get all notification preferences for a user.

        Creates default preferences if they don't exist.

        Args:
            developer_id: Developer ID.

        Returns:
            Dict of event_type -> preference.
        """
        # Get existing preferences
        query = select(NotificationPreference).where(
            NotificationPreference.developer_id == developer_id
        )
        result = await self.db.execute(query)
        existing = {p.event_type: p for p in result.scalars().all()}

        # Create missing defaults
        for event_type, defaults in DEFAULT_NOTIFICATION_PREFERENCES.items():
            if event_type.value not in existing:
                pref = NotificationPreference(
                    id=str(uuid4()),
                    developer_id=developer_id,
                    event_type=event_type.value,
                    in_app_enabled=defaults["in_app"],
                    email_enabled=defaults["email"],
                    slack_enabled=defaults["slack"],
                )
                self.db.add(pref)
                existing[event_type.value] = pref

        if len(existing) != len(DEFAULT_NOTIFICATION_PREFERENCES):
            # We added new preferences
            await self.db.commit()
            # Refresh all
            for pref in existing.values():
                await self.db.refresh(pref)

        return existing

    async def get_preference(
        self,
        developer_id: str,
        event_type: str,
    ) -> NotificationPreference | None:
        """Get a single notification preference.

        Args:
            developer_id: Developer ID.
            event_type: Event type string.

        Returns:
            NotificationPreference or None.
        """
        query = select(NotificationPreference).where(
            and_(
                NotificationPreference.developer_id == developer_id,
                NotificationPreference.event_type == event_type,
            )
        )
        result = await self.db.execute(query)
        pref = result.scalar_one_or_none()

        # Create default if not exists
        if not pref:
            try:
                event_enum = NotificationEventType(event_type)
                defaults = DEFAULT_NOTIFICATION_PREFERENCES.get(event_enum, {})
            except ValueError:
                defaults = {"in_app": True, "email": True, "slack": False}

            pref = NotificationPreference(
                id=str(uuid4()),
                developer_id=developer_id,
                event_type=event_type,
                in_app_enabled=defaults.get("in_app", True),
                email_enabled=defaults.get("email", True),
                slack_enabled=defaults.get("slack", False),
            )
            self.db.add(pref)
            await self.db.commit()
            await self.db.refresh(pref)

        return pref

    async def update_preference(
        self,
        developer_id: str,
        event_type: str,
        in_app_enabled: bool | None = None,
        email_enabled: bool | None = None,
        slack_enabled: bool | None = None,
    ) -> NotificationPreference:
        """Update a notification preference.

        Args:
            developer_id: Developer ID.
            event_type: Event type string.
            in_app_enabled: Enable in-app notifications.
            email_enabled: Enable email notifications.
            slack_enabled: Enable Slack notifications.

        Returns:
            Updated NotificationPreference.
        """
        pref = await self.get_preference(developer_id, event_type)

        if in_app_enabled is not None:
            pref.in_app_enabled = in_app_enabled
        if email_enabled is not None:
            pref.email_enabled = email_enabled
        if slack_enabled is not None:
            pref.slack_enabled = slack_enabled

        await self.db.commit()
        await self.db.refresh(pref)
        return pref

    # ============ Bulk Operations ============

    async def send_bulk_notification(
        self,
        recipient_ids: list[str],
        event_type: NotificationEventType | str,
        title: str,
        body: str,
        context: dict[str, Any] | None = None,
    ) -> list[Notification]:
        """Send notification to multiple recipients.

        Args:
            recipient_ids: List of developer IDs.
            event_type: Event type.
            title: Notification title.
            body: Notification body.
            context: Additional context.

        Returns:
            List of created notifications.
        """
        notifications = []
        for recipient_id in recipient_ids:
            notification = await self.create_notification(
                recipient_id=recipient_id,
                event_type=event_type,
                title=title,
                body=body,
                context=context,
            )
            if notification:
                notifications.append(notification)

        return notifications

    # ============ Email Log Retrieval ============

    async def get_email_logs(
        self,
        notification_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[EmailNotificationLog]:
        """Get email notification logs.

        Args:
            notification_id: Optional filter by notification ID.
            limit: Maximum logs to return.
            offset: Offset for pagination.

        Returns:
            List of email logs.
        """
        query = select(EmailNotificationLog)

        if notification_id:
            query = query.where(EmailNotificationLog.notification_id == notification_id)

        query = query.order_by(EmailNotificationLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())


# ============ Convenience Functions for Triggering Notifications ============

async def notify_peer_review_requested(
    db: AsyncSession,
    reviewer_id: str,
    requester_name: str,
    requester_avatar: str | None,
    review_id: str,
    request_id: str,
) -> Notification | None:
    """Send notification when peer review is requested."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=reviewer_id,
        event_type=NotificationEventType.PEER_REVIEW_REQUESTED,
        context={
            "requester_name": requester_name,
            "requester_avatar": requester_avatar,
            "review_id": review_id,
            "request_id": request_id,
            "action_url": f"/reviews/peer-requests/{request_id}",
        },
    )


async def notify_peer_review_received(
    db: AsyncSession,
    developer_id: str,
    review_id: str,
) -> Notification | None:
    """Send notification when peer review is received."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.PEER_REVIEW_RECEIVED,
        context={
            "review_id": review_id,
            "action_url": f"/reviews/{review_id}",
        },
    )


async def notify_review_cycle_phase_changed(
    db: AsyncSession,
    recipient_ids: list[str],
    cycle_id: str,
    cycle_name: str,
    new_phase: str,
) -> list[Notification]:
    """Send notification when review cycle phase changes."""
    service = NotificationService(db)
    notifications = []

    for recipient_id in recipient_ids:
        notification = await service.create_notification_from_event(
            recipient_id=recipient_id,
            event_type=NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED,
            context={
                "cycle_id": cycle_id,
                "cycle_name": cycle_name,
                "new_phase": new_phase.replace("_", " ").title(),
                "action_url": f"/reviews/cycles/{cycle_id}",
            },
        )
        if notification:
            notifications.append(notification)

    return notifications


async def notify_manager_review_completed(
    db: AsyncSession,
    developer_id: str,
    review_id: str,
) -> Notification | None:
    """Send notification when manager completes review."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.MANAGER_REVIEW_COMPLETED,
        context={
            "review_id": review_id,
            "action_url": f"/reviews/{review_id}",
        },
    )


async def notify_goal_auto_linked(
    db: AsyncSession,
    developer_id: str,
    goal_id: str,
    goal_title: str,
    count: int,
) -> Notification | None:
    """Send notification when contributions are auto-linked to goal."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.GOAL_AUTO_LINKED,
        context={
            "goal_id": goal_id,
            "goal_title": goal_title,
            "count": count,
            "action_url": f"/reviews/goals/{goal_id}",
        },
    )


async def notify_goal_at_risk(
    db: AsyncSession,
    developer_id: str,
    goal_id: str,
    goal_title: str,
) -> Notification | None:
    """Send notification when goal is at risk of missing deadline."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.GOAL_AT_RISK,
        context={
            "goal_id": goal_id,
            "goal_title": goal_title,
            "action_url": f"/reviews/goals/{goal_id}",
        },
    )


async def notify_deadline_reminder(
    db: AsyncSession,
    developer_id: str,
    task_type: str,
    deadline: str,
    action_url: str,
    is_day_of: bool = False,
) -> Notification | None:
    """Send deadline reminder notification."""
    service = NotificationService(db)
    event_type = (
        NotificationEventType.DEADLINE_REMINDER_DAY_OF
        if is_day_of
        else NotificationEventType.DEADLINE_REMINDER_1_DAY
    )
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=event_type,
        context={
            "task_type": task_type,
            "deadline": deadline,
            "action_url": action_url,
        },
    )
