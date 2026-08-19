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
    ScheduleUpdate,
    ScheduleUpdateInput,
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
    # === Platform ===
    # One mail a day with what people told us, to ADMIN_EMAILS. The in-app
    # notices fire per item; this is the part that does not need anybody to log
    # in. Sends nothing on a quiet day.
    {
        "id": "daily-feedback-digest",
        "activity": "send_feedback_digest",
        "input_module": "aexy.temporal.activities.platform",
        "input_class": "SendFeedbackDigestInput",
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
    {
        "id": "aggregate-billing-usage",
        "activity": "aggregate_billing_usage",
        "input_module": "aexy.temporal.activities.analysis",
        "input_class": "AggregateBillingUsageInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.ANALYSIS,
    },
    # Phase 3 — weekly AI digests + embedding catch-up across all
    # AI-enabled workspaces. Single fan-out activity; per-developer and
    # per-repo digests are then dispatched onto the analysis queue.
    {
        "id": "weekly-ai-digests",
        "activity": "enqueue_workspace_weekly_digests",
        "input_module": "aexy.temporal.activities.ai_digests",
        "input_class": "EnqueueWorkspaceWeeklyDigestsInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.ANALYSIS,
    },
    # Daily sweep that fires T-7 / T-3 / T-1 deadline reminders for every
    # active review cycle. Idempotent via ReviewCycle.reminders_sent.
    {
        "id": "review-deadline-reminders",
        "activity": "check_review_deadlines",
        "input_module": "aexy.temporal.activities.review_digests",
        "input_class": "CheckReviewDeadlinesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.ANALYSIS,
    },
    # The same idea for the work people are actually assigned: due-tomorrow and
    # due-today reminders for tasks, project cards and stories. Review cycles had
    # a sweep and work items did not, so `deadline_reminder_1_day` /
    # `deadline_reminder_day_of` were declared events that nothing could fire.
    # Idempotent by inspecting notifications already sent, not a new column.
    {
        "id": "work-item-deadline-reminders",
        "activity": "check_work_item_deadlines",
        "input_module": "aexy.temporal.activities.work_item_deadlines",
        "input_class": "CheckWorkItemDeadlinesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.ANALYSIS,
    },
    # Phase 4 / C2 — 30-min poll of every open PR across AI-enabled
    # workspaces. Cheap (one GitHub call per PR); only fans out re-analysis
    # when title/description actually changed since last poll.
    {
        "id": "active-pr-refresh",
        "activity": "enqueue_active_pr_refresh",
        "input_module": "aexy.temporal.activities.sync",
        "input_class": "EnqueueActivePRRefreshInput",
        "interval": timedelta(minutes=30),
        "queue": TaskQueue.SYNC,
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
        # Backstop only: the request path hands emails over immediately after
        # committing, so this normally finds nothing to do.
        "id": "drain-automation-email-outbox",
        "activity": "drain_automation_email_outbox",
        "input_module": "aexy.temporal.activities.email",
        "input_class": "DrainAutomationEmailOutboxInput",
        "interval": timedelta(seconds=60),
        "queue": TaskQueue.EMAIL,
    },
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

    # === Table Audit Cleanup ===
    {
        "id": "cleanup-expired-audit-logs",
        "activity": "cleanup_expired_audit_logs",
        "input_module": "aexy.temporal.activities.tables",
        "input_class": "CleanupExpiredAuditLogsInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Gmail push renewal ===
    # Gmail drops a `users.watch` after seven days without saying so, and a desk
    # that registered once would go quiet a week later looking like its mail had
    # stopped. Daily, renewing anything lapsing within two days, so a single
    # missed run is not enough to lose push.
    {
        "id": "renew-gmail-watches",
        "activity": "renew_gmail_watches",
        "input_module": "aexy.temporal.activities.google_sync",
        "input_class": "RenewGmailWatchesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.SYNC,
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

    # === Documentation freshness ===
    # Daily drain of the document sync queue. `handle_code_change` puts a
    # document here when a push touches its linked code and its owner is on
    # the daily-batch tier; without this schedule the queue filled and
    # nothing ever emptied it. Fans out per workspace because the activity
    # that does the work needs a workspace id and a schedule input takes
    # no arguments.
    {
        "id": "document-sync-queue",
        "activity": "enqueue_document_sync_queues",
        "input_module": "aexy.temporal.activities.analysis",
        "input_class": "EnqueueDocumentSyncQueuesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.ANALYSIS,
        # Generation is an LLM call per queued document; the 300s default
        # would truncate the fan-out on any busy workspace.
        "timeout_seconds": 1800,
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

    # === GTM Weekly Report ===
    {
        "id": "weekly-gtm-report",
        "activity": "generate_weekly_gtm_report",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "GenerateWeeklyReportInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.ANALYSIS,
    },

    # === GTM SLA Breach Check (every 5 min) ===
    {
        "id": "gtm-check-sla-breaches",
        "activity": "check_sla_breaches",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "CheckSLABreachesInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.OPERATIONS,
    },

    # === GTM Batch Customer Health Scoring (daily) ===
    {
        "id": "gtm-batch-score-customer-health",
        "activity": "batch_score_customer_health",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "BatchScoreCustomerHealthInput",
        "interval": timedelta(days=1),
        "queue": TaskQueue.ANALYSIS,
    },

    # === GTM Health Drop Detection (every 6h) ===
    {
        "id": "gtm-detect-health-drops",
        "activity": "detect_health_drops",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "DetectHealthDropsInput",
        "interval": timedelta(hours=6),
        "queue": TaskQueue.ANALYSIS,
    },

    # === GTM Intent Signal Collection (every 12h) ===
    {
        "id": "gtm-collect-intent-signals",
        "activity": "collect_intent_signals",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "CollectIntentSignalsInput",
        "interval": timedelta(hours=12),
        "queue": TaskQueue.INTEGRATIONS,
    },

    # === GTM Competitor Change Check (daily) ===
    {
        "id": "gtm-check-competitor-changes",
        "activity": "check_competitor_changes",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "CheckCompetitorChangesInput",
        "interval": timedelta(days=1),
        "queue": TaskQueue.INTEGRATIONS,
    },

    # === GTM ABM Engagement Recalculation (every 6h) ===
    {
        "id": "gtm-recalculate-abm-engagement",
        "activity": "recalculate_abm_engagement",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "RecalculateABMEngagementInput",
        "interval": timedelta(hours=6),
        "queue": TaskQueue.ANALYSIS,
    },

    # === GTM Dynamic ABM List Refresh (daily) ===
    {
        "id": "gtm-refresh-dynamic-abm-lists",
        "activity": "refresh_dynamic_abm_lists",
        "input_module": "aexy.temporal.activities.gtm",
        "input_class": "RefreshDynamicABMListsInput",
        "interval": timedelta(days=1),
        "queue": TaskQueue.ANALYSIS,
    },
    # === Tracking Automation ===
    {
        "id": "tracking-check-missed-standups",
        "activity": "check_missed_standups",
        "input_module": "aexy.temporal.activities.tracking_automation",
        "input_class": "CheckMissedStandupsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "tracking-check-time-thresholds",
        "activity": "check_time_entry_thresholds",
        "input_module": "aexy.temporal.activities.tracking_automation",
        "input_class": "CheckTimeEntryThresholdsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "tracking-check-stale-blockers",
        "activity": "check_stale_blockers",
        "input_module": "aexy.temporal.activities.tracking_automation",
        "input_class": "CheckStaleBlockersInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "tracking-detect-blocker-patterns",
        "activity": "detect_blocker_patterns",
        "input_module": "aexy.temporal.activities.tracking_automation",
        "input_class": "DetectBlockerPatternsInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "tracking-check-time-anomalies",
        "activity": "check_time_anomalies",
        "input_module": "aexy.temporal.activities.tracking_automation",
        "input_class": "CheckTimeAnomaliesInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "tracking-check-participation",
        "activity": "check_standup_participation",
        "input_module": "aexy.temporal.activities.tracking_automation",
        "input_class": "CheckStandupParticipationInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Compliance Automation ===
    {
        "id": "compliance-check-approaching-due",
        "activity": "check_approaching_due_assignments",
        "input_module": "aexy.temporal.activities.compliance_automation",
        "input_class": "CheckApproachingDueInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "compliance-check-overdue",
        "activity": "check_overdue_assignments",
        "input_module": "aexy.temporal.activities.compliance_automation",
        "input_class": "CheckOverdueAssignmentsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "compliance-check-expiring-certs",
        "activity": "check_expiring_certifications",
        "input_module": "aexy.temporal.activities.compliance_automation",
        "input_class": "CheckExpiringCertsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "compliance-check-expired-certs",
        "activity": "check_expired_certifications",
        "input_module": "aexy.temporal.activities.compliance_automation",
        "input_class": "CheckExpiredCertsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    {
        "id": "compliance-check-bulk-overdue",
        "activity": "check_bulk_compliance_rates",
        "input_module": "aexy.temporal.activities.compliance_automation",
        "input_class": "CheckBulkComplianceInput",
        "interval": timedelta(weeks=1),
        "queue": TaskQueue.OPERATIONS,
    },

    # === CRM schedule/date triggers (per-minute tick, self-filters by local time) ===
    {
        "id": "crm-dispatch-schedules",
        "activity": "dispatch_crm_schedules",
        "input_module": "aexy.temporal.activities.crm_automation_schedule",
        "input_class": "DispatchCRMSchedulesInput",
        "interval": timedelta(minutes=1),
        "queue": TaskQueue.OPERATIONS,
    },

    # === Aexy Tracker enrich/attribute safety-net sweep (every 5 min) ===
    # Ingest dispatches per-project enrichment in real time; this sweep
    # catches anything left un-enriched (e.g. a missed dispatch).
    {
        "id": "tracker-enrich-sweep",
        "activity": "enrich_attribute_tracker_events",
        "input_module": "aexy.temporal.activities.tracker_enrich",
        "input_class": "EnrichTrackerEventsInput",
        "interval": timedelta(minutes=5),
        "queue": TaskQueue.ANALYSIS,
    },

    # === Aexy Tracker daily journal (refreshes today's narrative every 6h) ===
    {
        "id": "tracker-journal-sweep",
        "activity": "generate_tracker_journal",
        "input_module": "aexy.temporal.activities.tracker_journal",
        "input_class": "GenerateTrackerJournalInput",
        "interval": timedelta(hours=6),
        "queue": TaskQueue.ANALYSIS,
    },

    # === Aexy Tracker proactive insights (every 3h) ===
    {
        "id": "tracker-insights-sweep",
        "activity": "detect_tracker_insights",
        "input_module": "aexy.temporal.activities.tracker_journal",
        "input_class": "DetectTrackerInsightsInput",
        "interval": timedelta(hours=3),
        "queue": TaskQueue.ANALYSIS,
    },

    # === Reporting / analytics ===
    # Poll for scheduled reports whose next_run_at is due, render + deliver them.
    {
        "id": "deliver-scheduled-reports",
        "activity": "deliver_scheduled_reports",
        "input_module": "aexy.temporal.activities.reports",
        "input_class": "DeliverScheduledReportsInput",
        "interval": timedelta(minutes=15),
        "queue": TaskQueue.OPERATIONS,
    },
    # Daily cleanup of expired export jobs and their files.
    {
        "id": "cleanup-expired-exports",
        "activity": "cleanup_expired_exports",
        "input_module": "aexy.temporal.activities.reports",
        "input_class": "CleanupExpiredExportsInput",
        "interval": timedelta(hours=24),
        "queue": TaskQueue.OPERATIONS,
    },
    # Service Desk — open-ticket digest. Fires every half hour and the activity
    # decides which workspaces are due, because the send time is per workspace:
    # this was a single `0 9,13,17` cron pinned to Asia/Kolkata for the whole
    # deployment, so a desk in another country was paged in the middle of its
    # night. Half-hourly rather than hourly so zones with a :30 offset (IST
    # among them) still get 09:00 local rather than 09:30.
    {
        "id": "service-desk-digest",
        "activity": "send_service_desk_digest",
        "input_module": "aexy.temporal.activities.service_desk",
        "input_class": "SendServiceDeskDigestInput",
        "cron": ["0,30 * * * *"],
        "queue": TaskQueue.OPERATIONS,
        # send_all() walks every workspace with a mailbox and sends synchronously.
        # SingleActivityInput defaults to 300s, which is a ceiling on how many
        # workspaces can have a desk before digests start timing out mid-list.
        "timeout_seconds": 1800,
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

                # Honour a per-schedule timeout: SingleActivityInput defaults to
                # 300s, which silently truncates any activity that fans out over
                # every workspace.
                activity_kwargs: dict = {
                    "activity_name": activity_name,
                    "activity_input": input_class(),
                }
                if "timeout_seconds" in schedule_def:
                    activity_kwargs["timeout_seconds"] = schedule_def["timeout_seconds"]

                action = ScheduleActionStartWorkflow(
                    SingleActivityWorkflow.run,
                    SingleActivityInput(**activity_kwargs),
                    id=f"scheduled-{schedule_id}",
                    task_queue=queue,
                )

            if "cron" in schedule_def:
                spec = ScheduleSpec(
                    cron_expressions=schedule_def["cron"],
                    time_zone_name=schedule_def.get("time_zone_name"),
                )
            else:
                spec = ScheduleSpec(
                    intervals=[ScheduleIntervalSpec(every=schedule_def["interval"])],
                )

            # Create, or push the current spec onto an existing schedule.
            # Skipping on "already exists" meant a changed interval in code
            # never reached a running environment — the schedule kept whatever
            # cadence it was first registered with, silently.
            try:
                await client.create_schedule(
                    schedule_id,
                    Schedule(action=action, spec=spec, state=ScheduleState()),
                )
                logger.info(f"Created schedule: {schedule_id}")
            except ScheduleAlreadyRunningError:
                handle = client.get_schedule_handle(schedule_id)

                async def _apply(
                    inp: ScheduleUpdateInput, _action=action, _spec=spec
                ) -> ScheduleUpdate:
                    inp.description.schedule.action = _action
                    inp.description.schedule.spec = _spec
                    return ScheduleUpdate(schedule=inp.description.schedule)

                await handle.update(_apply)
                logger.info(f"Updated existing schedule: {schedule_id}")

        except Exception:
            logger.exception(f"Failed to register schedule: {schedule_id}")
