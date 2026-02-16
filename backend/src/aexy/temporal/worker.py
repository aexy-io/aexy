"""Temporal worker entrypoint.

Registers all workflows and activities, then runs the worker.

Usage:
    python -m aexy.temporal.worker
    python -m aexy.temporal.worker --queues analysis,sync
"""

import argparse
import asyncio
import logging
import sys

from temporalio.client import Client
from temporalio.worker import Worker
from temporalio.worker.workflow_sandbox import (
    SandboxedWorkflowRunner,
    SandboxRestrictions,
)

from aexy.core.config import get_settings
from aexy.temporal.task_queues import TaskQueue

logger = logging.getLogger(__name__)


def get_all_workflows() -> list:
    """Import and return all workflow classes."""
    from aexy.temporal.workflows.analysis import BatchProfileSyncWorkflow
    from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow
    from aexy.temporal.workflows.email_campaign import EmailCampaignWorkflow
    from aexy.temporal.workflows.maintenance import CleanupWorkflow
    from aexy.temporal.workflows.onboarding import OnboardingWorkflow
    from aexy.temporal.workflows.single_activity import SingleActivityWorkflow
    from aexy.temporal.workflows.sync import SyncGmailWorkflow, SyncRepositoryWorkflow

    return [
        SingleActivityWorkflow,
        CRMAutomationWorkflow,
        BatchProfileSyncWorkflow,
        SyncRepositoryWorkflow,
        SyncGmailWorkflow,
        EmailCampaignWorkflow,
        OnboardingWorkflow,
        CleanupWorkflow,
    ]


def get_all_activities() -> list:
    """Import and return all activity functions."""
    from aexy.temporal.activities.analysis import (
        analyze_commit,
        analyze_developer,
        analyze_pr,
        batch_profile_sync,
        batch_report_usage,
        process_document_sync_queue,
        regenerate_document,
        reset_daily_limits,
    )
    from aexy.temporal.activities.booking import (
        cleanup_expired_pending,
        create_calendar_event,
        generate_booking_analytics,
        mark_completed_bookings,
        process_booking_webhooks,
        send_booking_notification,
        send_booking_reminders,
        sync_all_calendars,
    )
    from aexy.temporal.activities.email import (
        aggregate_daily_analytics,
        aggregate_workspace_stats,
        check_due_onboarding_steps,
        check_scheduled_campaigns,
        cleanup_old_analytics,
        complete_onboarding_step,
        process_onboarding_step,
        seed_default_blocks,
        send_campaign,
        send_campaign_email,
        send_workflow_email,
        start_user_onboarding,
        update_campaign_stats,
    )
    from aexy.temporal.activities.google_sync import (
        check_auto_sync_integrations,
        sync_calendar,
        sync_gmail,
    )
    from aexy.temporal.activities.integrations import (
        deliver_webhook,
        execute_agent,
        retry_webhook_delivery,
        send_crm_email,
        send_slack_dm,
        send_slack_message,
        send_slack_record_notification,
        send_slack_workflow_message,
        send_sms,
    )
    from aexy.temporal.activities.knowledge_graph import (
        cleanup_orphaned_entities,
        extract_knowledge_from_document,
        rebuild_workspace_graph,
        schedule_incremental_extraction,
        update_document_relationships,
    )
    from aexy.temporal.activities.oncall import (
        check_ending_shifts,
        check_upcoming_shifts,
        send_swap_notification,
        sync_oncall_calendar_events,
    )
    from aexy.temporal.activities.reminders import (
        check_evidence_freshness,
        flag_overdue_reminders,
        generate_reminder_instances,
        process_auto_assignment,
        process_escalations,
        send_daily_digest,
        send_reminder_notification,
        send_weekly_slack_summary,
    )
    from aexy.temporal.activities.reputation import (
        auto_pause_unhealthy_domains,
        calculate_daily_health,
        calculate_isp_metrics,
        process_unprocessed_events,
    )
    from aexy.temporal.activities.sync import check_repo_auto_sync, sync_commits, sync_repository
    from aexy.temporal.activities.tracking import (
        aggregate_daily_standups,
        aggregate_time_entries,
        analyze_activity_patterns,
        check_overdue_blockers,
        generate_sprint_progress_report,
        import_slack_history,
        map_slack_users,
        send_standup_reminders,
        sync_all_slack_channels,
        sync_slack_channel,
    )
    from aexy.temporal.activities.uptime import (
        cleanup_old_checks,
        execute_check,
        process_due_checks,
        run_test_check,
        send_uptime_notification,
    )
    from aexy.temporal.activities.warming import (
        check_warming_thresholds,
        process_warming_day,
        reset_daily_volumes,
        update_warming_metrics,
    )
    from aexy.temporal.activities.workflow_actions import (
        cleanup_old_executions,
        execute_workflow_action,
    )

    return [
        # Analysis
        analyze_commit,
        analyze_pr,
        analyze_developer,
        reset_daily_limits,
        batch_report_usage,
        batch_profile_sync,
        process_document_sync_queue,
        regenerate_document,
        # Sync
        sync_repository,
        sync_commits,
        check_repo_auto_sync,
        # Email
        send_campaign,
        send_campaign_email,
        update_campaign_stats,
        check_scheduled_campaigns,
        aggregate_daily_analytics,
        send_workflow_email,
        aggregate_workspace_stats,
        cleanup_old_analytics,
        start_user_onboarding,
        process_onboarding_step,
        complete_onboarding_step,
        check_due_onboarding_steps,
        seed_default_blocks,
        # Warming
        process_warming_day,
        check_warming_thresholds,
        reset_daily_volumes,
        update_warming_metrics,
        # Reputation
        calculate_daily_health,
        calculate_isp_metrics,
        auto_pause_unhealthy_domains,
        process_unprocessed_events,
        # Booking
        send_booking_reminders,
        sync_all_calendars,
        process_booking_webhooks,
        cleanup_expired_pending,
        mark_completed_bookings,
        generate_booking_analytics,
        send_booking_notification,
        create_calendar_event,
        # Uptime
        process_due_checks,
        execute_check,
        send_uptime_notification,
        cleanup_old_checks,
        run_test_check,
        # Integrations
        send_sms,
        send_slack_message,
        send_slack_dm,
        send_slack_workflow_message,
        send_slack_record_notification,
        deliver_webhook,
        retry_webhook_delivery,
        execute_agent,
        send_crm_email,
        # Google Sync
        sync_gmail,
        sync_calendar,
        check_auto_sync_integrations,
        # Tracking
        send_standup_reminders,
        aggregate_daily_standups,
        check_overdue_blockers,
        analyze_activity_patterns,
        aggregate_time_entries,
        generate_sprint_progress_report,
        sync_slack_channel,
        sync_all_slack_channels,
        import_slack_history,
        map_slack_users,
        # On-call
        check_upcoming_shifts,
        check_ending_shifts,
        sync_oncall_calendar_events,
        send_swap_notification,
        # Knowledge Graph
        extract_knowledge_from_document,
        rebuild_workspace_graph,
        update_document_relationships,
        cleanup_orphaned_entities,
        schedule_incremental_extraction,
        # Workflow Actions
        execute_workflow_action,
        cleanup_old_executions,
        # Reminders (Compliance)
        generate_reminder_instances,
        process_escalations,
        send_daily_digest,
        flag_overdue_reminders,
        check_evidence_freshness,
        process_auto_assignment,
        send_weekly_slack_summary,
        send_reminder_notification,
    ]


async def run_worker(queues: list[str] | None = None) -> None:
    """Start the Temporal worker.

    Args:
        queues: List of task queues to listen on. Defaults to all queues.
    """
    settings = get_settings()

    # Retry connection — Temporal server may still be initializing
    client = None
    max_retries = 10
    for attempt in range(1, max_retries + 1):
        try:
            client = await Client.connect(
                settings.temporal_address,
                namespace=settings.temporal_namespace,
            )
            logger.info(f"Connected to Temporal at {settings.temporal_address}")
            break
        except Exception as e:
            if attempt == max_retries:
                logger.error(f"Failed to connect to Temporal after {max_retries} attempts: {e}")
                raise
            wait = min(attempt * 2, 15)
            logger.warning(
                f"Temporal connection attempt {attempt}/{max_retries} failed: {e}. "
                f"Retrying in {wait}s..."
            )
            await asyncio.sleep(wait)

    target_queues = queues or TaskQueue.ALL
    workflows = get_all_workflows()
    activities = get_all_activities()

    logger.info(
        f"Starting worker with {len(workflows)} workflows, "
        f"{len(activities)} activities on queues: {target_queues}"
    )

    # Register schedules on startup (only once, from the first worker)
    try:
        from aexy.temporal.schedules import register_schedules
        await register_schedules(client)
        logger.info("Schedules registered successfully")
    except Exception:
        logger.exception("Failed to register schedules (may already exist)")

    # Run one worker per queue concurrently
    # Mark aexy modules as pass-through for the workflow sandbox
    # to avoid restrictions on pathlib/config imports used by app code
    sandbox_runner = SandboxedWorkflowRunner(
        restrictions=SandboxRestrictions.default.with_passthrough_modules("aexy"),
    )

    workers = []
    for queue in target_queues:
        worker = Worker(
            client,
            task_queue=queue,
            workflows=workflows,
            activities=activities,
            workflow_runner=sandbox_runner,
        )
        workers.append(worker)

    if len(workers) == 1:
        await workers[0].run()
    else:
        # Run all workers concurrently
        await asyncio.gather(*(w.run() for w in workers))


def main() -> None:
    """CLI entrypoint for the Temporal worker."""
    parser = argparse.ArgumentParser(description="Aexy Temporal Worker")
    parser.add_argument(
        "--queues",
        type=str,
        default=None,
        help="Comma-separated list of task queues (default: all)",
    )
    args = parser.parse_args()

    queues = args.queues.split(",") if args.queues else None

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        asyncio.run(run_worker(queues))
    except KeyboardInterrupt:
        logger.info("Worker shutting down...")
        sys.exit(0)


if __name__ == "__main__":
    main()
