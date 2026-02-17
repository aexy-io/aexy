"""Temporal schedule registration - replaces Celery Beat.

Registers all 25 periodic tasks as Temporal Schedules.
3 polling tasks from Celery Beat are eliminated entirely because
Temporal handles them natively (paused workflows, event subscription
timeouts, workflow retries).
"""

import logging
from datetime import timedelta

from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleAlreadyRunningError,
    ScheduleIntervalSpec,
    ScheduleSpec,
    ScheduleState,
)

from aexy.temporal.task_queues import TaskQueue

logger = logging.getLogger(__name__)


# Schedule definitions: (schedule_id, activity_name, input_class_path, interval, task_queue)
SCHEDULES: list[dict] = [
    # === Analysis ===
    {
        "id": "nightly-batch-sync",
        "workflow": "BatchProfileSyncWorkflow",
        "workflow_module": "aexy.temporal.workflows.analysis",
        "input_module": "aexy.temporal.workflows.analysis",
        "input_class": "BatchProfileSyncInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.ANALYSIS,
    },
    {
        "id": "reset-daily-limits",
        "activity": "reset_daily_limits",
        "input_module": "aexy.temporal.activities.analysis",
        "input_class": "ResetDailyLimitsInput",
        "interval": timedelta(hours=1),
        "queue": TaskQueue.ANALYSIS,
    },
    {
        "id": "report-usage-to-stripe",
        "activity": "batch_report_usage",
        "input_module": "aexy.temporal.activities.analysis",
        "input_class": "BatchReportUsageInput",
        "interval": timedelta(hours=1),
        "queue": TaskQueue.ANALYSIS,
    },

    # === On-call ===
    {
        "id": "check-oncall-upcoming-shifts",
        "activity": "check_upcoming_shifts",
        "input_module": "aexy.temporal.activities.oncall",
        "input_class": "CheckUpcomingShiftsInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "check-oncall-ending-shifts",
        "activity": "check_ending_shifts",
        "input_module": "aexy.temporal.activities.oncall",
        "input_class": "CheckEndingShiftsInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Workflow cleanup (3 polling tasks ELIMINATED - only cleanup remains) ===
    {
        "id": "cleanup-old-workflow-executions",
        "workflow": "CleanupWorkflow",
        "workflow_module": "aexy.temporal.workflows.maintenance",
        "input_module": "aexy.temporal.workflows.maintenance",
        "input_class": "CleanupWorkflowInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.WORKFLOWS,
    },

    # === Email Marketing ===
    {
        "id": "check-scheduled-campaigns",
        "activity": "check_scheduled_campaigns",
        "input_module": "aexy.temporal.activities.email",
        "input_class": "CheckScheduledCampaignsInput",
        "interval": timedelta(seconds=60),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "aggregate-email-analytics",
        "activity": "aggregate_daily_analytics",
        "input_module": "aexy.temporal.activities.email",
        "input_class": "AggregateDailyAnalyticsInput",
        "interval": timedelta(hours=1),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "aggregate-workspace-stats",
        "activity": "aggregate_workspace_stats",
        "input_module": "aexy.temporal.activities.email",
        "input_class": "AggregateWorkspaceStatsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "cleanup-old-analytics",
        "activity": "cleanup_old_analytics",
        "input_module": "aexy.temporal.activities.email",
        "input_class": "CleanupOldAnalyticsInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "check-due-onboarding-steps",
        "activity": "check_due_onboarding_steps",
        "input_module": "aexy.temporal.activities.email",
        "input_class": "CheckDueOnboardingStepsInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.EMAIL,
    },

    # === Email Warming ===
    {
        "id": "process-warming-day",
        "activity": "process_warming_day",
        "input_module": "aexy.temporal.activities.warming",
        "input_class": "ProcessWarmingDayInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "check-warming-thresholds",
        "activity": "check_warming_thresholds",
        "input_module": "aexy.temporal.activities.warming",
        "input_class": "CheckWarmingThresholdsInput",
        "interval": timedelta(hours=1),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "reset-daily-volumes-email",
        "activity": "reset_daily_volumes",
        "input_module": "aexy.temporal.activities.warming",
        "input_class": "ResetDailyVolumesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.EMAIL,
    },

    # === Email Reputation ===
    {
        "id": "calculate-daily-health",
        "activity": "calculate_daily_health",
        "input_module": "aexy.temporal.activities.reputation",
        "input_class": "CalculateDailyHealthInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "calculate-isp-metrics",
        "activity": "calculate_isp_metrics",
        "input_module": "aexy.temporal.activities.reputation",
        "input_class": "CalculateISPMetricsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "auto-pause-unhealthy-domains",
        "activity": "auto_pause_unhealthy_domains",
        "input_module": "aexy.temporal.activities.reputation",
        "input_class": "AutoPauseUnhealthyDomainsInput",
        "interval": timedelta(minutes=15),
        "queue": TaskQueue.EMAIL,
    },
    {
        "id": "process-unprocessed-events",
        "activity": "process_unprocessed_events",
        "input_module": "aexy.temporal.activities.reputation",
        "input_class": "ProcessUnprocessedEventsInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.EMAIL,
    },

    # === Booking ===
    {
        "id": "send-booking-reminders",
        "activity": "send_booking_reminders",
        "input_module": "aexy.temporal.activities.booking",
        "input_class": "SendBookingRemindersInput",
        "interval": timedelta(minutes=15),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "sync-booking-calendars",
        "activity": "sync_all_calendars",
        "input_module": "aexy.temporal.activities.booking",
        "input_class": "SyncAllCalendarsInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "cleanup-expired-pending-bookings",
        "activity": "cleanup_expired_pending",
        "input_module": "aexy.temporal.activities.booking",
        "input_class": "CleanupExpiredPendingInput",
        "interval": timedelta(minutes=10),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "mark-completed-bookings",
        "activity": "mark_completed_bookings",
        "input_module": "aexy.temporal.activities.booking",
        "input_class": "MarkCompletedBookingsInput",
        "interval": timedelta(hours=1),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Uptime Monitoring ===
    {
        "id": "uptime-process-due-checks",
        "activity": "process_due_checks",
        "input_module": "aexy.temporal.activities.uptime",
        "input_class": "ProcessDueChecksInput",
        "interval": timedelta(seconds=60),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "uptime-cleanup-old-checks",
        "activity": "cleanup_old_checks",
        "input_module": "aexy.temporal.activities.uptime",
        "input_class": "CleanupOldChecksInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Reminders (Compliance) ===
    {
        "id": "generate-reminder-instances",
        "activity": "generate_reminder_instances",
        "input_module": "aexy.temporal.activities.reminders",
        "input_class": "GenerateReminderInstancesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "process-reminder-escalations",
        "activity": "process_escalations",
        "input_module": "aexy.temporal.activities.reminders",
        "input_class": "ProcessEscalationsInput",
        "interval": timedelta(hours=2),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "send-daily-reminder-digest",
        "activity": "send_daily_digest",
        "input_module": "aexy.temporal.activities.reminders",
        "input_class": "SendDailyDigestInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "flag-overdue-reminders",
        "activity": "flag_overdue_reminders",
        "input_module": "aexy.temporal.activities.reminders",
        "input_class": "FlagOverdueRemindersInput",
        "interval": timedelta(hours=1),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "check-evidence-freshness",
        "activity": "check_evidence_freshness",
        "input_module": "aexy.temporal.activities.reminders",
        "input_class": "CheckEvidenceFreshnessInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "send-weekly-slack-summary",
        "activity": "send_weekly_slack_summary",
        "input_module": "aexy.temporal.activities.reminders",
        "input_class": "SendWeeklySlackSummaryInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Google Sync ===
    {
        "id": "check-gmail-auto-sync",
        "activity": "check_auto_sync_integrations",
        "input_module": "aexy.temporal.activities.google_sync",
        "input_class": "CheckAutoSyncInput",
        "interval": timedelta(seconds=60),
        "queue": TaskQueue.SYNC,
    },

    # === Repository Auto-Sync ===
    {
        "id": "check-repo-auto-sync",
        "activity": "check_repo_auto_sync",
        "input_module": "aexy.temporal.activities.sync",
        "input_class": "CheckRepoAutoSyncInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.SYNC,
    },

    # === Insights Auto-Snapshot ===
    {
        "id": "auto-generate-snapshots",
        "activity": "auto_generate_snapshots",
        "input_module": "aexy.temporal.activities.insights",
        "input_class": "AutoGenerateSnapshotsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.ANALYSIS,
    },
]


async def register_schedules(client: Client) -> None:
    """Register all periodic schedules with Temporal.

    This replaces Celery Beat. Called once on worker startup.
    Schedules are created or updated idempotently.
    """
    from importlib import import_module

    from aexy.temporal.workflows.single_activity import (
        SingleActivityInput,
        SingleActivityWorkflow,
    )

    for schedule_def in SCHEDULES:
        schedule_id = schedule_def["id"]
        queue = schedule_def["queue"]

        try:
            # Build the workflow action
            if "workflow" in schedule_def:
                # Schedule triggers a dedicated workflow
                wf_module = import_module(schedule_def["workflow_module"])
                wf_class = getattr(wf_module, schedule_def["workflow"])
                input_module = import_module(schedule_def["input_module"])
                input_class = getattr(input_module, schedule_def["input_class"])

                action = ScheduleActionStartWorkflow(
                    wf_class.run,
                    input_class(),
                    id=f"scheduled-{schedule_id}",
                    task_queue=queue,
                )
            else:
                # Schedule triggers a SingleActivityWorkflow wrapping the activity
                activity_name = schedule_def["activity"]
                input_module = import_module(schedule_def["input_module"])
                input_class = getattr(input_module, schedule_def["input_class"])

                action = ScheduleActionStartWorkflow(
                    SingleActivityWorkflow.run,
                    SingleActivityInput(
                        activity_name=activity_name,
                        activity_input=input_class(),
                    ),
                    id=f"scheduled-{schedule_id}",
                    task_queue=queue,
                )

            spec = ScheduleSpec(
                intervals=[ScheduleIntervalSpec(every=schedule_def["interval"])],
            )

            # Try to create, update if exists
            try:
                await client.create_schedule(
                    schedule_id,
                    Schedule(action=action, spec=spec, state=ScheduleState()),
                )
                logger.info(f"Created schedule: {schedule_id}")
            except ScheduleAlreadyRunningError:
                logger.info(f"Schedule already exists, skipping: {schedule_id}")

        except Exception:
            logger.exception(f"Failed to register schedule: {schedule_id}")
