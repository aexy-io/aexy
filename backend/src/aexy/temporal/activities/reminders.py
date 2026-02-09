"""Temporal activities for compliance reminders.

Replaces: aexy.processing.reminder_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

logger = logging.getLogger(__name__)


@dataclass
class GenerateReminderInstancesInput:
    pass


@dataclass
class ProcessEscalationsInput:
    pass


@dataclass
class SendDailyDigestInput:
    pass


@dataclass
class FlagOverdueRemindersInput:
    pass


@dataclass
class CheckEvidenceFreshnessInput:
    pass


@dataclass
class ProcessAutoAssignmentInput:
    workspace_id: str
    reminder_id: str


@dataclass
class SendWeeklySlackSummaryInput:
    pass


@dataclass
class SendReminderNotificationInput:
    instance_id: str
    notification_type: str


@activity.defn
async def generate_reminder_instances(input: GenerateReminderInstancesInput) -> None:
    """Generate reminder instances for due reminders. Runs daily."""
    logger.info("Generating reminder instances")
    from aexy.processing.reminder_tasks import _generate_reminder_instances_async

    await _generate_reminder_instances_async()


@activity.defn
async def process_escalations(input: ProcessEscalationsInput) -> None:
    """Process escalations for overdue reminder instances. Runs every 2 hours."""
    logger.info("Processing reminder escalations")
    from aexy.processing.reminder_tasks import _process_escalations_async

    await _process_escalations_async()


@activity.defn
async def send_daily_digest(input: SendDailyDigestInput) -> None:
    """Send daily reminder digest to owners. Runs daily at 08:00."""
    logger.info("Sending daily reminder digest")
    from aexy.processing.reminder_tasks import _send_daily_digest_async

    await _send_daily_digest_async()


@activity.defn
async def flag_overdue_reminders(input: FlagOverdueRemindersInput) -> None:
    """Flag reminder instances as overdue. Runs hourly."""
    logger.info("Flagging overdue reminders")
    from aexy.processing.reminder_tasks import _flag_overdue_reminders_async

    await _flag_overdue_reminders_async()


@activity.defn
async def check_evidence_freshness(input: CheckEvidenceFreshnessInput) -> None:
    """Check for stale evidence on completed reminders. Runs daily."""
    logger.info("Checking evidence freshness")
    from aexy.processing.reminder_tasks import _check_evidence_freshness_async

    await _check_evidence_freshness_async()


@activity.defn
async def process_auto_assignment(input: ProcessAutoAssignmentInput) -> None:
    """Process automatic assignment for a reminder."""
    logger.info(f"Processing auto-assignment for reminder {input.reminder_id}")
    from aexy.processing.reminder_tasks import _process_auto_assignment_async

    await _process_auto_assignment_async(input.workspace_id, input.reminder_id)


@activity.defn
async def send_weekly_slack_summary(input: SendWeeklySlackSummaryInput) -> None:
    """Send weekly reminder summary to configured Slack channels. Runs weekly."""
    logger.info("Sending weekly Slack reminder summary")
    from aexy.processing.reminder_tasks import _send_weekly_slack_summary_async

    await _send_weekly_slack_summary_async()


@activity.defn
async def send_reminder_notification(input: SendReminderNotificationInput) -> None:
    """Send a notification for a reminder instance."""
    logger.info(f"Sending {input.notification_type} notification for instance {input.instance_id}")
    from aexy.processing.reminder_tasks import _send_reminder_notification_async

    await _send_reminder_notification_async(input.instance_id, input.notification_type)
