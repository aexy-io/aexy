"""Notification service for managing in-app and email notifications."""

import logging
import re
from collections.abc import Iterable
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
    NotificationCategoryPreference,
    NotificationEventType,
    NotificationPreference,
    NOTIFICATION_CATEGORIES,
    EVENT_TYPE_TO_CATEGORY,
)
from aexy.schemas.notification import (
    NotificationContext,
    NotificationCreate,
    NotificationEventType as SchemaEventType,
    NotificationResponse,
    NOTIFICATION_TEMPLATES,
)

logger = logging.getLogger(__name__)

# Matches mention:user:{uuid} in href attributes (TipTap mention format)
MENTION_USER_PATTERN = re.compile(r'mention:user:([0-9a-f-]{36})', re.IGNORECASE)
HTML_TAG_PATTERN = re.compile(r'<[^>]+>')


def extract_mentioned_user_ids(content: str) -> list[str]:
    """Extract user IDs from mention links in content."""
    return list(set(MENTION_USER_PATTERN.findall(content)))


def _get_text_snippet(html_content: str, max_length: int = 100) -> str:
    """Strip HTML tags and get a plain-text snippet for notification body."""
    text = HTML_TAG_PATTERN.sub('', html_content).strip()
    return text[:max_length] + "..." if len(text) > max_length else text


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

        # Dispatch email via Temporal if enabled
        if send_email and pref and pref.email_enabled:
            try:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue
                from aexy.temporal.activities.notifications import SendNotificationEmailInput

                await dispatch(
                    "send_notification_email",
                    SendNotificationEmailInput(
                        notification_id=notification.id,
                        recipient_id=recipient_id,
                    ),
                    task_queue=TaskQueue.EMAIL,
                )
                logger.info(f"Email notification dispatched for {recipient_id}")
            except Exception:
                logger.exception(f"Failed to dispatch email for notification {notification.id}")

        # Dispatch Slack via Temporal if enabled and workspace_id available
        if pref and pref.slack_enabled and context and context.get("workspace_id"):
            try:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue
                from aexy.temporal.activities.notifications import SendNotificationSlackInput

                await dispatch(
                    "send_notification_slack",
                    SendNotificationSlackInput(
                        notification_id=notification.id,
                        recipient_id=recipient_id,
                        workspace_id=context["workspace_id"],
                    ),
                    task_queue=TaskQueue.INTEGRATIONS,
                )
                logger.info(f"Slack notification dispatched for {recipient_id}")
            except Exception:
                logger.exception(f"Failed to dispatch Slack for notification {notification.id}")

        # Dispatch Web Push via Temporal if enabled
        if pref and pref.web_push_enabled:
            try:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue
                from aexy.temporal.activities.notifications import SendNotificationWebPushInput

                await dispatch(
                    "send_notification_web_push",
                    SendNotificationWebPushInput(
                        notification_id=notification.id,
                        recipient_id=recipient_id,
                    ),
                    task_queue=TaskQueue.OPERATIONS,
                )
                logger.info(f"Web push notification dispatched for {recipient_id}")
            except Exception:
                logger.exception(f"Failed to dispatch web push for notification {notification.id}")

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
        title_template = template.get("title", "Notification")
        body_template = template.get("body_template", "You have a new notification.")

        # Render title and body with context
        try:
            title = title_template.format(**context)
        except (KeyError, IndexError):
            title = title_template
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
                    web_push_enabled=defaults.get("web_push", False),
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
                defaults = {"in_app": True, "email": True, "slack": False, "web_push": False}

            pref = NotificationPreference(
                id=str(uuid4()),
                developer_id=developer_id,
                event_type=event_type,
                in_app_enabled=defaults.get("in_app", True),
                email_enabled=defaults.get("email", True),
                slack_enabled=defaults.get("slack", False),
                web_push_enabled=defaults.get("web_push", False),
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
        web_push_enabled: bool | None = None,
    ) -> NotificationPreference:
        """Update a notification preference.

        Args:
            developer_id: Developer ID.
            event_type: Event type string.
            in_app_enabled: Enable in-app notifications.
            email_enabled: Enable email notifications.
            slack_enabled: Enable Slack notifications.
            web_push_enabled: Enable web push notifications.

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
        if web_push_enabled is not None:
            pref.web_push_enabled = web_push_enabled

        await self.db.commit()
        await self.db.refresh(pref)
        return pref

    # ============ Category Preferences ============

    async def get_category_preferences(
        self,
        developer_id: str,
    ) -> dict[str, NotificationCategoryPreference]:
        """Get all category-level notification preferences for a user.

        Creates default category preferences if they don't exist.

        Returns:
            Dict of category -> preference.
        """
        query = select(NotificationCategoryPreference).where(
            NotificationCategoryPreference.developer_id == developer_id
        )
        result = await self.db.execute(query)
        existing = {p.category: p for p in result.scalars().all()}

        # Create missing defaults for all categories
        created = False
        for category in NOTIFICATION_CATEGORIES:
            if category not in existing:
                cat_pref = NotificationCategoryPreference(
                    id=str(uuid4()),
                    developer_id=developer_id,
                    category=category,
                    in_app_enabled=True,
                    email_enabled=True,
                    slack_enabled=False,
                    web_push_enabled=False,
                )
                self.db.add(cat_pref)
                existing[category] = cat_pref
                created = True

        if created:
            await self.db.commit()
            for pref in existing.values():
                await self.db.refresh(pref)

        return existing

    async def update_category_preference(
        self,
        developer_id: str,
        category: str,
        in_app_enabled: bool | None = None,
        email_enabled: bool | None = None,
        slack_enabled: bool | None = None,
        web_push_enabled: bool | None = None,
        slack_channel_id: str | None = None,
        slack_channel_name: str | None = None,
    ) -> NotificationCategoryPreference:
        """Update a category-level preference and optionally propagate to child events."""
        if category not in NOTIFICATION_CATEGORIES:
            raise ValueError(f"Invalid category: {category}")

        # Get or create category preference
        cat_prefs = await self.get_category_preferences(developer_id)
        cat_pref = cat_prefs[category]

        if in_app_enabled is not None:
            cat_pref.in_app_enabled = in_app_enabled
        if email_enabled is not None:
            cat_pref.email_enabled = email_enabled
        if slack_enabled is not None:
            cat_pref.slack_enabled = slack_enabled
        if web_push_enabled is not None:
            cat_pref.web_push_enabled = web_push_enabled
        # Allow clearing slack channel by passing empty string
        if slack_channel_id is not None:
            cat_pref.slack_channel_id = slack_channel_id or None
        if slack_channel_name is not None:
            cat_pref.slack_channel_name = slack_channel_name or None

        # Propagate master toggle changes to all child event preferences
        event_types = NOTIFICATION_CATEGORIES[category]
        for event_type_value in event_types:
            pref = await self.get_preference(developer_id, event_type_value)
            if pref:
                if in_app_enabled is not None:
                    pref.in_app_enabled = in_app_enabled
                if email_enabled is not None:
                    pref.email_enabled = email_enabled
                if slack_enabled is not None:
                    pref.slack_enabled = slack_enabled
                if web_push_enabled is not None:
                    pref.web_push_enabled = web_push_enabled

        await self.db.commit()
        await self.db.refresh(cat_pref)
        return cat_pref

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


async def notify_review_deadline(
    db: AsyncSession,
    recipient_ids: list[str],
    cycle_id: str,
    cycle_name: str,
    phase_label: str,
    days_remaining: int,
    deadline_iso: str,
) -> list[Notification]:
    """Fan-out 'Your <phase> is due in N days' to relevant participants.

    Phase choice (self / peer / manager) determines who gets notified —
    the deadline-checker activity decides the recipient set and passes
    it here. This helper only handles delivery + template rendering.
    """
    service = NotificationService(db)
    notifications = []
    for recipient_id in recipient_ids:
        notification = await service.create_notification_from_event(
            recipient_id=recipient_id,
            event_type=NotificationEventType.REVIEW_DEADLINE_REMINDER,
            context={
                "cycle_id": cycle_id,
                "cycle_name": cycle_name,
                "phase_label": phase_label,
                "days_remaining": days_remaining,
                "deadline": deadline_iso,
                "action_url": f"/reviews/cycles/{cycle_id}",
            },
        )
        if notification:
            notifications.append(notification)
    return notifications


async def notify_review_cycle_activated(
    db: AsyncSession,
    recipient_ids: list[str],
    cycle_id: str,
    cycle_name: str,
) -> list[Notification]:
    """Fan-out 'Your review cycle has started' notifications.

    Called from ReviewService.activate_review_cycle after the individual
    review rows are created. Without this, devs only discover their cycle
    has activated by stumbling onto the reviews page.
    """
    service = NotificationService(db)
    notifications = []
    for recipient_id in recipient_ids:
        notification = await service.create_notification_from_event(
            recipient_id=recipient_id,
            event_type=NotificationEventType.REVIEW_CYCLE_ACTIVATED,
            context={
                "cycle_id": cycle_id,
                "cycle_name": cycle_name,
                "action_url": f"/reviews/cycles/{cycle_id}",
            },
        )
        if notification:
            notifications.append(notification)
    return notifications


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
    entity_id: str | None = None,
    title: str = "",
) -> Notification | None:
    """Send deadline reminder notification.

    ``entity_id`` is what makes the daily sweep idempotent — it is how
    ``check_work_item_deadlines`` recognises an item it has already reminded
    about, without a new column on every table that carries a due date.
    """
    service = NotificationService(db)
    event_type = (
        NotificationEventType.DEADLINE_REMINDER_DAY_OF
        if is_day_of
        else NotificationEventType.DEADLINE_REMINDER_1_DAY
    )
    context: dict[str, Any] = {
        "task_type": task_type,
        "deadline": deadline,
        "action_url": action_url,
        "title": title,
    }
    if entity_id:
        context["entity_id"] = entity_id
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=event_type,
        context=context,
    )


async def notify_mention(
    db: AsyncSession,
    mentioned_user_id: str,
    mentioner_name: str,
    entity_type: str,
    entity_id: str,
    action_url: str,
    snippet: str = "",
) -> Notification | None:
    """Send notification when a user is @mentioned."""
    service = NotificationService(db)
    return await service.create_notification(
        recipient_id=mentioned_user_id,
        event_type=NotificationEventType.MENTION,
        title=f"{mentioner_name} mentioned you",
        body=f"{mentioner_name} mentioned you in a {entity_type}" + (f": {snippet}" if snippet else ""),
        context={
            "mentioner_name": mentioner_name,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action_url": action_url,
        },
    )


async def notify_chat_mention(
    db: AsyncSession,
    mentioned_user_id: str,
    mentioner_name: str,
    topic_id: str,
    action_url: str,
    snippet: str = "",
) -> Notification | None:
    """Send notification when a user is @mentioned in chat.

    Distinct from ``notify_mention`` on purpose. ``chat_mention`` has its own
    settings toggle and its own category, and chat is noisier than a comment on a
    document — somebody who wants chat mentions in-app only but review mentions
    by email had no way to say so, because chat was sending the generic ``mention``
    event and the "Chat mention" toggle they were reaching for controlled nothing.
    """
    service = NotificationService(db)
    return await service.create_notification(
        recipient_id=mentioned_user_id,
        event_type=NotificationEventType.CHAT_MENTION,
        title=f"{mentioner_name} mentioned you in chat",
        body=f"{mentioner_name} mentioned you" + (f": {snippet}" if snippet else ""),
        context={
            "mentioner_name": mentioner_name,
            "entity_type": "chat_message",
            "entity_id": topic_id,
            "action_url": action_url,
            "snippet": snippet,
        },
    )


# ============ Leave Notifications ============


async def notify_leave_request_submitted(
    db: AsyncSession,
    approver_id: str,
    requester_name: str,
    leave_type: str,
    start_date: str,
    end_date: str,
    request_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify approver when a leave request is submitted."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=approver_id,
        event_type=NotificationEventType.LEAVE_REQUEST_SUBMITTED,
        context={
            "requester_name": requester_name,
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "request_id": request_id,
            "workspace_id": workspace_id,
            "action_url": "/leave",
        },
    )


async def notify_leave_request_approved(
    db: AsyncSession,
    developer_id: str,
    leave_type: str,
    start_date: str,
    end_date: str,
    request_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when leave request is approved."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.LEAVE_REQUEST_APPROVED,
        context={
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "request_id": request_id,
            "workspace_id": workspace_id,
            "action_url": "/leave",
        },
    )


async def notify_leave_request_rejected(
    db: AsyncSession,
    developer_id: str,
    leave_type: str,
    start_date: str,
    end_date: str,
    request_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when leave request is rejected."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.LEAVE_REQUEST_REJECTED,
        context={
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "request_id": request_id,
            "workspace_id": workspace_id,
            "action_url": "/leave",
        },
    )


async def notify_leave_request_cancelled(
    db: AsyncSession,
    approver_id: str,
    requester_name: str,
    leave_type: str,
    start_date: str,
    end_date: str,
    request_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify approver when leave request is cancelled."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=approver_id,
        event_type=NotificationEventType.LEAVE_REQUEST_CANCELLED,
        context={
            "requester_name": requester_name,
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "request_id": request_id,
            "workspace_id": workspace_id,
            "action_url": "/leave",
        },
    )


# ============ Review / Goal Notifications ============


async def notify_review_acknowledged(
    db: AsyncSession,
    manager_id: str,
    developer_name: str,
    review_id: str,
) -> Notification | None:
    """Notify manager when employee acknowledges review."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=manager_id,
        event_type=NotificationEventType.REVIEW_ACKNOWLEDGED,
        context={
            "developer_name": developer_name,
            "review_id": review_id,
            "action_url": f"/reviews/{review_id}",
        },
    )


async def notify_goal_completed(
    db: AsyncSession,
    developer_id: str,
    goal_id: str,
    goal_title: str,
) -> Notification | None:
    """Notify developer when goal is completed."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.GOAL_COMPLETED,
        context={
            "goal_id": goal_id,
            "goal_title": goal_title,
            "action_url": f"/reviews/goals/{goal_id}",
        },
    )


# ============ Workspace / Team Notifications ============


async def notify_workspace_invite(
    db: AsyncSession,
    developer_id: str,
    workspace_name: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when invited to a workspace."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.WORKSPACE_INVITE,
        context={
            "workspace_name": workspace_name,
            "workspace_id": workspace_id,
            "action_url": "/settings/workspace",
        },
    )


async def notify_team_added(
    db: AsyncSession,
    developer_id: str,
    team_name: str,
    workspace_name: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when added to a team."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.TEAM_ADDED,
        context={
            "team_name": team_name,
            "workspace_name": workspace_name,
            "workspace_id": workspace_id,
            "action_url": "/settings/teams",
        },
    )


# ============ Learning Notifications ============


async def notify_learning_approval_requested(
    db: AsyncSession,
    approver_id: str,
    requester_name: str,
    course_title: str,
    request_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify approver when learning approval is requested."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=approver_id,
        event_type=NotificationEventType.LEARNING_APPROVAL_REQUESTED,
        context={
            "requester_name": requester_name,
            "course_title": course_title,
            "request_id": request_id,
            "workspace_id": workspace_id,
            "action_url": "/learning/approvals",
        },
    )


async def notify_learning_approval_decided(
    db: AsyncSession,
    developer_id: str,
    course_title: str,
    decision: str,
    request_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when learning approval is decided."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.LEARNING_APPROVAL_DECIDED,
        context={
            "course_title": course_title,
            "decision": decision,
            "request_id": request_id,
            "workspace_id": workspace_id,
            "action_url": "/learning/approvals",
        },
    )


async def notify_learning_goal_assigned(
    db: AsyncSession,
    developer_id: str,
    goal_title: str,
    goal_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when a learning goal is assigned."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.LEARNING_GOAL_ASSIGNED,
        context={
            "goal_title": goal_title,
            "goal_id": goal_id,
            "workspace_id": workspace_id,
            "action_url": f"/learning/goals/{goal_id}",
        },
    )


async def notify_learning_goal_overdue(
    db: AsyncSession,
    developer_id: str,
    goal_title: str,
    goal_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when a learning goal is overdue."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.LEARNING_GOAL_OVERDUE,
        context={
            "goal_title": goal_title,
            "goal_id": goal_id,
            "workspace_id": workspace_id,
            "action_url": f"/learning/goals/{goal_id}",
        },
    )


async def notify_learning_activity_completed(
    db: AsyncSession,
    developer_id: str,
    activity_title: str,
    points: int,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when a learning activity is completed."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.LEARNING_ACTIVITY_COMPLETED,
        context={
            "activity_title": activity_title,
            "points": points,
            "workspace_id": workspace_id,
            "action_url": "/learning/activities",
        },
    )


# ============ Form Notifications ============


async def notify_form_submission_received(
    db: AsyncSession,
    owner_id: str,
    form_name: str,
    submitter_name: str,
    submission_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify form owner when a submission is received."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=owner_id,
        event_type=NotificationEventType.FORM_SUBMISSION_RECEIVED,
        context={
            "form_name": form_name,
            "submitter_name": submitter_name or "Anonymous",
            "submission_id": submission_id,
            "workspace_id": workspace_id,
            "action_url": "/forms/submissions",
        },
    )


async def notify_form_submission_failed(
    db: AsyncSession,
    owner_id: str,
    form_name: str,
    submission_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify form owner when a submission fails."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=owner_id,
        event_type=NotificationEventType.FORM_SUBMISSION_FAILED,
        context={
            "form_name": form_name,
            "submission_id": submission_id,
            "workspace_id": workspace_id,
            "action_url": "/forms/submissions",
        },
    )


# ============ Campaign Notifications ============


async def notify_campaign_scheduled(
    db: AsyncSession,
    creator_id: str,
    campaign_name: str,
    scheduled_at: str,
    workspace_id: str,
) -> Notification | None:
    """Notify creator when campaign is scheduled."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=creator_id,
        event_type=NotificationEventType.CAMPAIGN_SCHEDULED,
        context={
            "campaign_name": campaign_name,
            "scheduled_at": scheduled_at,
            "workspace_id": workspace_id,
            "action_url": "/email-marketing/campaigns",
        },
    )


async def notify_campaign_send_blocked(
    db: AsyncSession,
    creator_id: str,
    campaign_name: str,
    reason: str,
    workspace_id: str,
    campaign_id: str,
) -> Notification | None:
    """Notify the creator that a due campaign couldn't send, and why."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=creator_id,
        event_type=NotificationEventType.CAMPAIGN_SEND_BLOCKED,
        context={
            "campaign_name": campaign_name,
            "reason": reason,
            "workspace_id": workspace_id,
            # Straight to the campaign, since fixing it is the point.
            "action_url": f"/email-marketing/campaigns/{campaign_id}",
        },
    )


async def notify_campaign_completed(
    db: AsyncSession,
    creator_id: str,
    campaign_name: str,
    total_recipients: int,
    workspace_id: str,
) -> Notification | None:
    """Notify creator when campaign is completed."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=creator_id,
        event_type=NotificationEventType.CAMPAIGN_COMPLETED,
        context={
            "campaign_name": campaign_name,
            "total_recipients": total_recipients,
            "workspace_id": workspace_id,
            "action_url": "/email-marketing/campaigns",
        },
    )


# ============ Document Notifications ============


async def notify_document_shared(
    db: AsyncSession,
    developer_id: str,
    sharer_name: str,
    document_title: str,
    document_id: str,
    workspace_id: str,
) -> Notification | None:
    """Notify developer when a document is shared with them."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=NotificationEventType.DOCUMENT_SHARED,
        context={
            "sharer_name": sharer_name,
            "document_title": document_title,
            "document_id": document_id,
            "workspace_id": workspace_id,
            "action_url": f"/docs/{document_id}",
        },
    )


async def notify_document_commented(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    actor_name: str,
    document_id: str,
    document_title: str,
    comment: str,
    workspace_id: str | None = None,
    comment_id: str | None = None,
) -> int:
    """Tell a document's owner and thread participants about a new comment.

    Callers pass everyone in the conversation and let this drop the actor;
    mentioned users are notified separately by ``notify_document_mentioned``,
    which is the louder signal, so callers exclude them from ``recipient_ids``
    rather than sending both for one comment.
    """
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "document_id": document_id,
        "document_title": document_title,
        "snippet": _get_text_snippet(comment),
        "action_url": f"/docs/{document_id}",
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)
    if comment_id:
        context["comment_id"] = comment_id

    return await _notify_quietly(
        db,
        recipient_ids,
        NotificationEventType.DOCUMENT_COMMENTED,
        title="New comment",
        body=f'{actor_name} commented on "{document_title}": {context["snippet"]}',
        context=context,
        actor_id=actor_id,
    )


async def notify_document_mentioned(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    actor_name: str,
    document_id: str,
    document_title: str,
    comment: str,
    workspace_id: str | None = None,
    comment_id: str | None = None,
) -> int:
    """Tell people they were named in a document comment."""
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "document_id": document_id,
        "document_title": document_title,
        "snippet": _get_text_snippet(comment),
        "action_url": f"/docs/{document_id}",
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)
    if comment_id:
        context["comment_id"] = comment_id

    return await _notify_quietly(
        db,
        recipient_ids,
        NotificationEventType.DOCUMENT_MENTIONED,
        title="Mentioned in a document",
        body=f'{actor_name} mentioned you in "{document_title}": {context["snippet"]}',
        context=context,
        actor_id=actor_id,
    )


async def notify_document_ai_proposal(
    db: AsyncSession,
    recipient_id: str,
    document_id: str,
    document_title: str,
    actor_label: str,
    workspace_id: str | None = None,
    proposed_by_id: str | None = None,
) -> int:
    """Tell a document's owner that an AI edit is waiting for review.

    ``actor_label`` names what produced the proposal ("AI sync", "Regenerate")
    rather than a person, because usually nobody clicked anything — which is
    precisely why this needs to reach the owner instead of sitting in a panel.
    """
    context: dict[str, Any] = {
        "actor_label": actor_label,
        "document_id": document_id,
        "document_title": document_title,
        "action_url": f"/docs/{document_id}",
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.DOCUMENT_AI_PROPOSAL,
        title="AI proposed a doc update",
        body=f'{actor_label} proposed an update to "{document_title}" — review pending',
        context=context,
        actor_id=proposed_by_id,
    )


async def notify_docx_ai_draft_ready(
    db: AsyncSession,
    recipient_id: str,
    document_id: str,
    document_title: str,
    summary: str,
    change_count: int,
    workspace_id: str | None = None,
) -> int:
    """Tell the person who asked that their Word draft is ready.

    Deliberately NOT the same event as ``DOCUMENT_AI_PROPOSAL``, and deliberately
    passing no ``actor_id``: the recipient IS the actor here, and
    ``_notify_quietly`` drops the actor. The owner event has a self-action guard
    precisely so it does not tell you about your own request — which left the
    person who asked for a background draft hearing nothing at all.
    """
    context: dict[str, Any] = {
        "document_id": document_id,
        "document_title": document_title,
        "summary": summary,
        "change_count": change_count,
        "action_url": f"/docs/{document_id}",
        # Grouping key in the bell: several drafts on one document read as one
        # thread rather than a stack.
        "entity_id": document_id,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    changes = "change" if change_count == 1 else "changes"
    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.DOCX_AI_DRAFT_READY,
        title="Your Word edit is ready to review",
        body=f'{change_count} {changes} drafted for "{document_title}": {summary}',
        context=context,
    )


async def notify_docx_ai_comment_answered(
    db: AsyncSession,
    recipient_id: str,
    document_id: str,
    document_title: str,
    comment_excerpt: str,
    summary: str,
    workspace_id: str | None = None,
) -> int:
    """Tell a comment's author that the AI drafted an answer to it.

    The recipient is whoever wrote the comment, which is often neither the
    document's owner nor anyone who asked for anything: a reviewer typed a remark
    in Word, sent the file back, and has no reason to be watching Aexy. No
    ``actor_id`` for the same reason as above — the trigger was their own
    comment.
    """
    context: dict[str, Any] = {
        "document_id": document_id,
        "document_title": document_title,
        "comment_excerpt": comment_excerpt,
        "summary": summary,
        "action_url": f"/docs/{document_id}",
        "entity_id": document_id,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.DOCX_AI_COMMENT_ANSWERED,
        title="Aexy answered your comment",
        body=(
            f'Your comment on "{document_title}" — {comment_excerpt} — has a '
            f"drafted edit waiting: {summary}"
        ),
        context=context,
    )


async def notify_document_sync_ownership_transferred(
    db: AsyncSession,
    recipient_id: str,
    sync_count: int,
    previous_owner_label: str,
    workspace_id: str | None = None,
) -> int:
    """Tell someone they have inherited doc-to-code syncs.

    Sent when the person who set a sync up leaves the workspace. Nobody asked
    for this, which is the whole reason it needs saying out loud: the syncs
    keep running, and the proposals they generate will start arriving for
    review from a person who never wired them up.
    """
    plural = "sync" if sync_count == 1 else "syncs"
    context: dict[str, Any] = {
        "sync_count": sync_count,
        "previous_owner": previous_owner_label,
        "action_url": "/docs",
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.DOCUMENT_SYNC_OWNERSHIP_TRANSFERRED,
        title=f"You now own {sync_count} documentation {plural}",
        body=(
            f"{previous_owner_label} left the workspace, so their {sync_count} "
            f"doc-to-code {plural} moved to you. Updates they propose will come "
            f"to you for review."
        ),
        context=context,
    )


def _screenshot_hint(screenshot_count: int, page_count: int) -> str:
    """Pre-rendered so `.format(**context)` on the template cannot KeyError.

    Empty when there are no screenshots. There is deliberately no "consider
    adding screenshots" variant: an unsolicited suggestion is the first thing
    anybody mutes.
    """
    if not screenshot_count:
        return ""
    if page_count == 1:
        return "It contains screenshots that may need retaking."
    return f"{screenshot_count} of them contain screenshots that may need retaking."


async def _notify_document_impact(
    db: AsyncSession,
    event_type: NotificationEventType,
    *,
    recipient_id: str,
    repository_id: str,
    pr_number: int,
    repository: str,
    document_titles: list[str],
    screenshot_page_count: int,
    workspace_id: str,
    title: str,
    body_lead: str,
) -> int:
    """Shared body for the two documentation-impact events.

    **No `actor_id`.** The recipient *is* the actor — they opened the pull request
    — and `_notify_quietly` skips `recipient == actor`, so passing it would
    deliver precisely nothing while looking correct. These are the only two
    notifications in the product deliberately about the recipient's own action.

    `workspace_id` is required rather than optional: Slack fan-out is gated on
    `context["workspace_id"]` and skips silently without it, and the impact row
    always has one — so this removes the failure mode instead of tolerating it.
    """
    shown = document_titles[:5]
    titles = ", ".join(shown) + ("…" if len(document_titles) > len(shown) else "")
    hint = _screenshot_hint(screenshot_page_count, len(document_titles))

    context: dict[str, Any] = {
        # The repo's dedup idiom, for grouping in the bell. The impact row is the
        # authority for whether to send at all — this field is for reading.
        "entity_id": f"{repository_id}:{pr_number}",
        "pr_number": pr_number,
        "repository": repository,
        "document_count": len(document_titles),
        "document_titles": titles,
        "screenshot_hint": hint,
        "action_url": f"/docs/impact/{repository_id}/{pr_number}",
        "workspace_id": str(workspace_id),
    }

    body = f"{body_lead} {titles}."
    if hint:
        body = f"{body} {hint}"

    return await _notify_quietly(
        db,
        [recipient_id],
        event_type,
        title=title,
        body=body,
        context=context,
    )


async def notify_document_impact_pr_opened(
    db: AsyncSession,
    recipient_id: str,
    *,
    repository_id: str,
    pr_number: int,
    repository: str,
    document_titles: list[str],
    screenshot_page_count: int,
    workspace_id: str,
) -> int:
    """Tell a pull request's author which documented pages it affects.

    Sent while the pull request is open, which is the only moment updating the
    pages is cheap: the author is still in the change and can edit them in the
    same branch.
    """
    count = len(document_titles)
    return await _notify_document_impact(
        db,
        NotificationEventType.DOCUMENT_IMPACT_PR_OPENED,
        recipient_id=recipient_id,
        repository_id=repository_id,
        pr_number=pr_number,
        repository=repository,
        document_titles=document_titles,
        screenshot_page_count=screenshot_page_count,
        workspace_id=workspace_id,
        title=f"{count} page(s) describe what #{pr_number} changes",
        body_lead=(
            f"#{pr_number} in {repository} touches code described by "
            f"{count} page(s):"
        ),
    )


async def notify_document_impact_pr_merged(
    db: AsyncSession,
    recipient_id: str,
    *,
    repository_id: str,
    pr_number: int,
    repository: str,
    document_titles: list[str],
    screenshot_page_count: int,
    workspace_id: str,
) -> int:
    """Tell a pull request's author that its merge left pages behind.

    A different thing from the open-moment nudge, not a repeat of it: that one
    was "you can still fix this here", this one is "it is now wrong". Separate
    from DOCUMENT_AI_PROPOSAL, which goes to the *page's* owner about a proposal
    waiting for review.
    """
    count = len(document_titles)
    return await _notify_document_impact(
        db,
        NotificationEventType.DOCUMENT_IMPACT_PR_MERGED,
        recipient_id=recipient_id,
        repository_id=repository_id,
        pr_number=pr_number,
        repository=repository,
        document_titles=document_titles,
        screenshot_page_count=screenshot_page_count,
        workspace_id=workspace_id,
        title=f"#{pr_number} merged — {count} page(s) now behind",
        body_lead=(
            f"#{pr_number} merged in {repository}. {count} page(s) describing "
            f"the code it changed are now out of date:"
        ),
    )


# ============ GTM Notifications ============


async def notify_gtm_alert(
    db: AsyncSession,
    recipient_id: str,
    event_type_name: str,
    summary: str,
    workspace_id: str,
) -> Notification | None:
    """Notify when a GTM alert is triggered."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=recipient_id,
        event_type=NotificationEventType.GTM_ALERT_TRIGGERED,
        context={
            "event_type": event_type_name,
            "summary": summary,
            "workspace_id": workspace_id,
            "action_url": "/gtm/alerts",
        },
    )


# ============ Assessment Notifications ============


async def notify_assessment_published(
    db: AsyncSession,
    creator_id: str,
    assessment_title: str,
    invitation_count: int,
    workspace_id: str,
) -> Notification | None:
    """Notify creator when assessment is published."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=creator_id,
        event_type=NotificationEventType.ASSESSMENT_INVITATION_SENT,
        context={
            "assessment_title": assessment_title,
            "invitation_count": invitation_count,
            "workspace_id": workspace_id,
            "action_url": "/hiring/assessments",
        },
    )


async def notify_candidate_stage_changed(
    db: AsyncSession,
    recipient_id: str,
    actor_id: str | None,
    actor_name: str,
    candidate_id: str,
    candidate_name: str,
    old_stage: str,
    new_stage: str,
    workspace_id: str | None = None,
) -> int:
    """Tell a candidate's owner that somebody else moved them along the pipeline.

    In-app only by default: it fires on every drag of the hiring board, and the
    owner dragging their own candidate is filtered out as the actor, so what
    survives is "somebody else touched your candidate" — worth knowing, not worth
    an email each time.
    """
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "candidate_id": candidate_id,
        "candidate_name": candidate_name,
        "old_stage": old_stage,
        "new_stage": new_stage,
        "action_url": "/hiring/candidates",
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.CANDIDATE_STAGE_CHANGED,
        title="Candidate stage changed",
        body=(
            f"{actor_name} moved {candidate_name} from {old_stage} to {new_stage}"
        ),
        context=context,
        actor_id=actor_id,
    )


async def notify_assessment_completed(
    db: AsyncSession,
    creator_id: str,
    candidate_name: str,
    assessment_title: str,
    workspace_id: str,
) -> Notification | None:
    """Notify creator when candidate completes assessment."""
    service = NotificationService(db)
    return await service.create_notification_from_event(
        recipient_id=creator_id,
        event_type=NotificationEventType.ASSESSMENT_COMPLETED,
        context={
            "candidate_name": candidate_name,
            "assessment_title": assessment_title,
            "workspace_id": workspace_id,
            "action_url": "/hiring/assessments",
        },
    )


# ============ Work Item (task / bug / story / ticket) Notifications ============
#
# Assignment was the one thing this product never told anybody about. Tasks,
# project cards, bugs, stories, form tickets and service desk tickets could all
# land on you and the only way to find out was to go looking, or — for the
# service desk alone — to wait for the next daily digest.
#
# These helpers are deliberately tolerant. A notification must never be the
# reason an assignment fails: the assignment is the user's actual intent and it
# is already committed or flushed by the time we get here. Every one of them
# swallows its own errors and returns quietly.


async def _notify_quietly(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    event_type: NotificationEventType,
    title: str,
    body: str,
    context: dict[str, Any],
    actor_id: str | None = None,
) -> int:
    """Notify each distinct recipient except the actor. Never raises.

    Self-filtering is not a nicety — the person clicking "assign to me" is the
    single most common assignment in any tracker, and mailing them about their
    own click is how people learn to ignore the sender.
    """
    actor = str(actor_id) if actor_id else None
    seen: set[str] = set()
    sent = 0
    service = NotificationService(db)
    for recipient_id in recipient_ids:
        if not recipient_id:
            continue
        recipient = str(recipient_id)
        if recipient == actor or recipient in seen:
            continue
        seen.add(recipient)
        try:
            if await service.create_notification(
                recipient_id=recipient,
                event_type=event_type,
                title=title,
                body=body,
                context=context,
            ):
                sent += 1
        except Exception:
            # The caller's mutation matters more than telling somebody about it.
            logger.exception(
                "Failed to notify %s of %s", recipient, event_type.value
            )
    return sent


async def notify_work_item_assigned(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    actor_name: str,
    item_label: str,
    item_title: str,
    action_url: str,
    workspace_id: str | None = None,
    event_type: NotificationEventType = NotificationEventType.TASK_ASSIGNED,
    extra_context: dict[str, Any] | None = None,
) -> int:
    """Tell people that a task, card, bug, story or ticket is now theirs.

    ``item_label`` is what the user calls the thing — "task", "bug", "story",
    "card", "ticket". One event covers all of them because they are one question
    ("what landed on me?") even though they are several tables.
    """
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "item_label": item_label,
        "task_title": item_title,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)
    if extra_context:
        context.update(extra_context)

    return await _notify_quietly(
        db,
        recipient_ids,
        event_type,
        title="Assigned to you",
        body=f'{actor_name} assigned you the {item_label} "{item_title}"',
        context=context,
        actor_id=actor_id,
    )


async def notify_work_item_unassigned(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    actor_name: str,
    item_label: str,
    item_title: str,
    action_url: str,
    workspace_id: str | None = None,
) -> int:
    """Tell people they were taken off something they may be mid-way through."""
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "item_label": item_label,
        "task_title": item_title,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        recipient_ids,
        NotificationEventType.TASK_UNASSIGNED,
        title="Removed from a task",
        body=f'{actor_name} took you off the {item_label} "{item_title}"',
        context=context,
        actor_id=actor_id,
    )


async def notify_work_item_status_changed(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    actor_name: str,
    item_title: str,
    old_status: str,
    new_status: str,
    action_url: str,
    workspace_id: str | None = None,
) -> int:
    """Tell the people on an item that somebody else moved it."""
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "task_title": item_title,
        "old_status": old_status,
        "new_status": new_status,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        recipient_ids,
        NotificationEventType.TASK_STATUS_CHANGED,
        title="Status changed",
        body=f'{actor_name} moved "{item_title}" from {old_status} to {new_status}',
        context=context,
        actor_id=actor_id,
    )


async def notify_work_item_commented(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    actor_name: str,
    item_title: str,
    comment: str,
    action_url: str,
    workspace_id: str | None = None,
) -> int:
    """Tell the people on an item about a new comment.

    Mentions inside the same comment are notified separately and are the louder
    signal; this is the ambient "there is activity on your thing" one.
    """
    snippet = _get_text_snippet(comment)
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "task_title": item_title,
        "snippet": snippet,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        recipient_ids,
        NotificationEventType.TASK_COMMENTED,
        title="New comment",
        body=f'{actor_name} commented on "{item_title}": {snippet}',
        context=context,
        actor_id=actor_id,
    )


async def notify_desk_ticket_assigned(
    db: AsyncSession,
    recipient_id: str,
    actor_id: str | None,
    actor_name: str,
    ticket_reference: str,
    ticket_title: str,
    action_url: str,
    workspace_id: str | None = None,
) -> int:
    """Tell somebody they own a service desk ticket, and its SLA clock."""
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "ticket_reference": ticket_reference,
        "ticket_title": ticket_title,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.DESK_TICKET_ASSIGNED,
        title="Service desk ticket assigned to you",
        body=f"{actor_name} made you the owner of {ticket_reference}: {ticket_title}",
        context=context,
        actor_id=actor_id,
    )


async def notify_desk_ticket_pending_with(
    db: AsyncSession,
    recipient_ids: Iterable[str],
    actor_id: str | None,
    pending_with: str,
    ticket_reference: str,
    ticket_title: str,
    action_url: str,
    workspace_id: str | None = None,
) -> int:
    """Tell a queue that a ticket has been handed to it.

    ``pending_with`` is the desk's real unit of handoff — a ticket changes queue
    far more often than it changes owner, and the queue it lands in is the one
    that has to act before the clock runs out.
    """
    context: dict[str, Any] = {
        "pending_with": pending_with,
        "ticket_reference": ticket_reference,
        "ticket_title": ticket_title,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        recipient_ids,
        NotificationEventType.DESK_TICKET_PENDING_WITH_CHANGED,
        title="Ticket is with your queue",
        body=f"{ticket_reference} ({ticket_title}) is now pending with {pending_with}",
        context=context,
        actor_id=actor_id,
    )


async def notify_ticket_assigned(
    db: AsyncSession,
    recipient_id: str,
    actor_id: str | None,
    actor_name: str,
    ticket_reference: str,
    ticket_title: str,
    action_url: str,
    workspace_id: str | None = None,
) -> int:
    """Tell somebody a form ticket (the internal request queue) is theirs."""
    context: dict[str, Any] = {
        "actor_name": actor_name,
        "ticket_reference": ticket_reference,
        "ticket_title": ticket_title,
        "action_url": action_url,
    }
    if workspace_id:
        context["workspace_id"] = str(workspace_id)

    return await _notify_quietly(
        db,
        [recipient_id],
        NotificationEventType.TICKET_ASSIGNED,
        title="Ticket assigned to you",
        body=f"{actor_name} assigned you ticket {ticket_reference}: {ticket_title}",
        context=context,
        actor_id=actor_id,
    )


# ============ Workspace Join Request Notifications ============


async def notify_workspace_join_decided(
    db: AsyncSession,
    requester_id: str,
    workspace_id: str,
    workspace_name: str,
    approved: bool,
) -> int:
    """Tell somebody whether they are in the workspace or not.

    The request notification already went to the admins; without this the
    requester was left watching a screen that never changed.
    """
    return await _notify_quietly(
        db,
        [requester_id],
        NotificationEventType.WORKSPACE_JOIN_APPROVED
        if approved
        else NotificationEventType.WORKSPACE_JOIN_REJECTED,
        title="Join request approved" if approved else "Join request declined",
        body=(
            f"You now have access to {workspace_name}"
            if approved
            else f"Your request to join {workspace_name} was declined"
        ),
        context={
            "workspace_id": str(workspace_id),
            "workspace_name": workspace_name,
            "action_url": "/dashboard" if approved else "/onboarding/workspace",
        },
    )
