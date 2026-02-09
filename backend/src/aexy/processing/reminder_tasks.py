"""Recurring reminder task logic.

These functions handle:
- Generating reminder instances
- Processing escalations
- Sending daily digests
- Flagging overdue reminders
- Checking evidence freshness
- Weekly Slack summaries

Temporal activities in aexy.temporal.activities.reminders call the
_*_async() functions defined here.
"""

import logging
from datetime import datetime, timezone, timedelta

from aexy.core.database import async_session_maker
from aexy.services.reminder_service import ReminderService
from aexy.services.notification_service import NotificationService
from aexy.models.notification import NotificationEventType
from aexy.models.reminder import (
    Reminder,
    ReminderInstance,
    ReminderStatus,
    InstanceStatus,
)

logger = logging.getLogger(__name__)


async def _generate_reminder_instances_async():
    """Async implementation of instance generation."""
    async with async_session_maker() as db:
        try:
            reminder_service = ReminderService(db)
            notification_service = NotificationService(db)

            # Get reminders that are due
            reminders = await reminder_service.get_due_reminders()
            created_count = 0

            for reminder in reminders:
                try:
                    # Create instance
                    instance = await reminder_service.create_instance(
                        reminder=reminder,
                        due_date=reminder.next_occurrence,
                    )
                    created_count += 1

                    # Send assignment notification if owner assigned
                    if instance.assigned_owner_id:
                        await notification_service.create_notification(
                            recipient_id=str(instance.assigned_owner_id),
                            event_type=NotificationEventType.REMINDER_ASSIGNED,
                            title=f"Reminder assigned: {reminder.title}",
                            body=f"You have been assigned a reminder due on {instance.due_date.strftime('%Y-%m-%d')}",
                            context={
                                "reminder_id": str(reminder.id),
                                "instance_id": str(instance.id),
                                "reminder_title": reminder.title,
                                "due_date": instance.due_date.isoformat(),
                                "priority": reminder.priority,
                                "category": reminder.category,
                                "workspace_id": str(reminder.workspace_id),
                            },
                        )

                    # Advance to next occurrence
                    await reminder_service.advance_reminder_schedule(reminder)

                    logger.debug(f"Created instance for reminder {reminder.id}")

                except Exception as e:
                    logger.error(f"Error creating instance for reminder {reminder.id}: {e}")
                    continue

            await db.commit()
            logger.info(f"Generated {created_count} reminder instances")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error generating reminder instances: {e}")
            raise


async def _process_escalations_async():
    """Async implementation of escalation processing."""
    async with async_session_maker() as db:
        try:
            reminder_service = ReminderService(db)
            notification_service = NotificationService(db)

            # Get instances that need escalation
            instances = await reminder_service.get_instances_for_escalation()
            escalated_count = 0

            for instance in instances:
                reminder = instance.reminder
                esc_config = reminder.escalation_config

                if not esc_config.get("enabled"):
                    continue

                levels = esc_config.get("levels", [])
                current_level = instance.current_escalation_level

                # Find next level
                level_order = ["l1", "l2", "l3", "l4"]
                next_level_name = None
                next_level_config = None

                if not current_level:
                    # First escalation
                    if levels:
                        next_level_config = levels[0]
                        next_level_name = next_level_config.get("level", "l1")
                else:
                    try:
                        current_idx = level_order.index(current_level)
                        for level in levels:
                            if level.get("level") == level_order[current_idx + 1]:
                                next_level_config = level
                                next_level_name = level.get("level")
                                break
                    except (ValueError, IndexError):
                        continue

                if not next_level_config:
                    continue

                # Create escalation
                escalated_to_id = next_level_config.get("notify_owner_id")
                escalated_to_team_id = next_level_config.get("notify_team_id")
                notification_channels = {
                    "channels": ["email", "in_app"],
                    "slack_channel": next_level_config.get("slack_channel"),
                }

                escalation = await reminder_service.escalate_instance(
                    instance=instance,
                    level=next_level_name,
                    escalated_to_id=escalated_to_id,
                    escalated_to_team_id=escalated_to_team_id,
                    notification_channels=notification_channels,
                )

                # Send notification
                if escalated_to_id:
                    await notification_service.create_notification(
                        recipient_id=escalated_to_id,
                        event_type=NotificationEventType.REMINDER_ESCALATED,
                        title=f"Escalation: {reminder.title}",
                        body=f"This reminder has been escalated to {next_level_name.upper()}. Due date was {instance.due_date.strftime('%Y-%m-%d')}",
                        context={
                            "reminder_id": str(reminder.id),
                            "instance_id": str(instance.id),
                            "escalation_id": str(escalation.id),
                            "reminder_title": reminder.title,
                            "escalation_level": next_level_name,
                            "due_date": instance.due_date.isoformat(),
                            "priority": reminder.priority,
                            "workspace_id": str(reminder.workspace_id),
                        },
                    )

                escalated_count += 1
                logger.debug(f"Escalated instance {instance.id} to {next_level_name}")

            await db.commit()
            logger.info(f"Processed {escalated_count} escalations")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing escalations: {e}")
            raise


async def _send_daily_digest_async():
    """Async implementation of daily digest sending."""
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload

    async with async_session_maker() as db:
        try:
            notification_service = NotificationService(db)

            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = today_start + timedelta(days=1)

            # Get instances grouped by owner
            stmt = (
                select(
                    ReminderInstance.assigned_owner_id,
                    func.count(ReminderInstance.id).label("count"),
                    func.sum(
                        func.case(
                            (ReminderInstance.due_date < now, 1),
                            else_=0
                        )
                    ).label("overdue_count"),
                )
                .join(Reminder)
                .where(
                    ReminderInstance.assigned_owner_id.isnot(None),
                    ReminderInstance.status.in_([
                        InstanceStatus.PENDING.value,
                        InstanceStatus.NOTIFIED.value,
                        InstanceStatus.ACKNOWLEDGED.value,
                        InstanceStatus.OVERDUE.value,
                    ]),
                    ReminderInstance.due_date <= today_end,
                )
                .group_by(ReminderInstance.assigned_owner_id)
            )

            result = await db.execute(stmt)
            owner_stats = result.all()

            digest_count = 0
            for owner_id, total_count, overdue_count in owner_stats:
                if not owner_id or total_count == 0:
                    continue

                due_today = total_count - (overdue_count or 0)

                body_parts = []
                if overdue_count and overdue_count > 0:
                    body_parts.append(f"{overdue_count} overdue")
                if due_today > 0:
                    body_parts.append(f"{due_today} due today")

                if not body_parts:
                    continue

                await notification_service.create_notification(
                    recipient_id=str(owner_id),
                    event_type=NotificationEventType.REMINDER_DUE,
                    title="Daily Reminder Digest",
                    body=f"You have {', '.join(body_parts)}",
                    context={
                        "type": "daily_digest",
                        "total_count": total_count,
                        "overdue_count": overdue_count or 0,
                        "due_today_count": due_today,
                        "date": today_start.isoformat(),
                    },
                )

                digest_count += 1

            await db.commit()
            logger.info(f"Sent {digest_count} daily digest notifications")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending daily digest: {e}")
            raise


async def _flag_overdue_reminders_async():
    """Async implementation of overdue flagging."""
    from sqlalchemy import select, update
    from sqlalchemy.orm import selectinload

    async with async_session_maker() as db:
        try:
            notification_service = NotificationService(db)

            now = datetime.now(timezone.utc)

            # Get instances that should be marked overdue
            stmt = (
                select(ReminderInstance)
                .join(Reminder)
                .where(
                    ReminderInstance.status.in_([
                        InstanceStatus.PENDING.value,
                        InstanceStatus.NOTIFIED.value,
                    ]),
                    ReminderInstance.due_date < now,
                )
                .options(
                    selectinload(ReminderInstance.reminder),
                    selectinload(ReminderInstance.assigned_owner),
                )
            )

            result = await db.execute(stmt)
            instances = list(result.scalars().all())

            flagged_count = 0
            for instance in instances:
                instance.status = InstanceStatus.OVERDUE.value
                flagged_count += 1

                # Send overdue notification
                if instance.assigned_owner_id:
                    reminder = instance.reminder
                    await notification_service.create_notification(
                        recipient_id=str(instance.assigned_owner_id),
                        event_type=NotificationEventType.REMINDER_OVERDUE,
                        title=f"Overdue: {reminder.title}",
                        body=f"This reminder was due on {instance.due_date.strftime('%Y-%m-%d')}",
                        context={
                            "reminder_id": str(reminder.id),
                            "instance_id": str(instance.id),
                            "reminder_title": reminder.title,
                            "due_date": instance.due_date.isoformat(),
                            "priority": reminder.priority,
                            "workspace_id": str(reminder.workspace_id),
                        },
                    )

            await db.commit()
            logger.info(f"Flagged {flagged_count} instances as overdue")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error flagging overdue reminders: {e}")
            raise


async def _check_evidence_freshness_async():
    """Async implementation of evidence freshness checking."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)
            stale_threshold = now - timedelta(days=90)  # Evidence older than 90 days

            # Get completed instances with evidence
            stmt = (
                select(ReminderInstance)
                .join(Reminder)
                .where(
                    ReminderInstance.status == InstanceStatus.COMPLETED.value,
                    ReminderInstance.completed_at < stale_threshold,
                    Reminder.requires_evidence == True,
                )
                .options(
                    selectinload(ReminderInstance.reminder),
                )
            )

            result = await db.execute(stmt)
            instances = list(result.scalars().all())

            # For now, just log - could trigger re-verification workflow
            stale_count = len([i for i in instances if i.evidence_links])

            await db.commit()
            logger.info(f"Found {stale_count} instances with potentially stale evidence")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error checking evidence freshness: {e}")
            raise


async def _process_auto_assignment_async(workspace_id: str, reminder_id: str):
    """Async implementation of auto-assignment processing."""
    async with async_session_maker() as db:
        try:
            reminder_service = ReminderService(db)

            reminder = await reminder_service.get_reminder(reminder_id)
            if not reminder:
                logger.warning(f"Reminder {reminder_id} not found for auto-assignment")
                return

            # Resolve assignment - this updates round-robin index etc.
            owner_id, team_id = await reminder_service._resolve_assignment(reminder)

            await db.commit()
            logger.info(f"Processed auto-assignment for reminder {reminder_id}: owner={owner_id}, team={team_id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing auto-assignment for reminder {reminder_id}: {e}")
            raise


async def _send_weekly_slack_summary_async():
    """Async implementation of weekly Slack summary."""
    from sqlalchemy import select, func
    from aexy.models.workspace import Workspace
    from aexy.models.integrations import SlackIntegration

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)
            week_start = now - timedelta(days=7)

            # Get workspaces with Slack integration
            stmt = (
                select(Workspace)
                .join(SlackIntegration)
                .where(SlackIntegration.is_active == True)
            )

            result = await db.execute(stmt)
            workspaces = list(result.scalars().all())

            for workspace in workspaces:
                try:
                    # Get stats for this workspace
                    reminder_service = ReminderService(db)
                    stats = await reminder_service.get_dashboard_stats(str(workspace.id))

                    # Get completed count for the week
                    completed_stmt = (
                        select(func.count(ReminderInstance.id))
                        .join(Reminder)
                        .where(
                            Reminder.workspace_id == workspace.id,
                            ReminderInstance.status == InstanceStatus.COMPLETED.value,
                            ReminderInstance.completed_at >= week_start,
                        )
                    )
                    completed_result = await db.execute(completed_stmt)
                    completed_this_week = completed_result.scalar() or 0

                    # Format message
                    message = (
                        f"*Weekly Reminder Summary*\n\n"
                        f"*Active Reminders:* {stats.active_reminders}\n"
                        f"*Pending Instances:* {stats.total_pending_instances}\n"
                        f"*Overdue:* {stats.total_overdue_instances}\n"
                        f"*Completed This Week:* {completed_this_week}\n"
                    )

                    if stats.critical_overdue > 0:
                        message += f"\n:warning: *Critical Overdue:* {stats.critical_overdue}"

                    # TODO: Send to Slack using SlackService
                    # For now, just log
                    logger.info(f"Weekly summary for workspace {workspace.id}:\n{message}")

                except Exception as e:
                    logger.error(f"Error generating weekly summary for workspace {workspace.id}: {e}")
                    continue

            await db.commit()
            logger.info(f"Sent weekly Slack summaries to {len(workspaces)} workspaces")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending weekly Slack summaries: {e}")
            raise


async def _send_reminder_notification_async(instance_id: str, notification_type: str):
    """Async implementation of reminder notification."""
    async with async_session_maker() as db:
        try:
            reminder_service = ReminderService(db)
            notification_service = NotificationService(db)

            instance = await reminder_service.get_instance(instance_id)
            if not instance:
                logger.warning(f"Instance {instance_id} not found for notification")
                return

            reminder = instance.reminder
            recipient_id = instance.assigned_owner_id

            if not recipient_id:
                logger.debug(f"No owner assigned for instance {instance_id}")
                return

            event_types = {
                "due": NotificationEventType.REMINDER_DUE,
                "acknowledged": NotificationEventType.REMINDER_ACKNOWLEDGED,
                "completed": NotificationEventType.REMINDER_COMPLETED,
                "escalated": NotificationEventType.REMINDER_ESCALATED,
                "overdue": NotificationEventType.REMINDER_OVERDUE,
            }

            event_type = event_types.get(notification_type)
            if not event_type:
                logger.warning(f"Unknown notification type: {notification_type}")
                return

            titles = {
                "due": f"Reminder due: {reminder.title}",
                "acknowledged": f"Reminder acknowledged: {reminder.title}",
                "completed": f"Reminder completed: {reminder.title}",
                "escalated": f"Reminder escalated: {reminder.title}",
                "overdue": f"Reminder overdue: {reminder.title}",
            }

            bodies = {
                "due": f"This reminder is due on {instance.due_date.strftime('%Y-%m-%d')}",
                "acknowledged": f"This reminder has been acknowledged",
                "completed": f"This reminder has been completed",
                "escalated": f"This reminder has been escalated to {instance.current_escalation_level}",
                "overdue": f"This reminder was due on {instance.due_date.strftime('%Y-%m-%d')}",
            }

            await notification_service.create_notification(
                recipient_id=str(recipient_id),
                event_type=event_type,
                title=titles[notification_type],
                body=bodies[notification_type],
                context={
                    "reminder_id": str(reminder.id),
                    "instance_id": str(instance.id),
                    "reminder_title": reminder.title,
                    "due_date": instance.due_date.isoformat(),
                    "priority": reminder.priority,
                    "category": reminder.category,
                    "workspace_id": str(reminder.workspace_id),
                    "notification_type": notification_type,
                },
            )

            # Mark as notified if it's a due notification
            if notification_type == "due":
                await reminder_service.mark_instance_notified(instance_id)

            await db.commit()
            logger.info(f"Sent {notification_type} notification for instance {instance_id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending reminder notification: {e}")
            raise
