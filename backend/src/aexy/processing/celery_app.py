"""Celery application configuration."""

from celery import Celery

from aexy.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "aexy",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "aexy.processing.tasks",
        "aexy.processing.sync_tasks",
        "aexy.processing.oncall_tasks",
        "aexy.processing.tracking_tasks",
        "aexy.processing.google_sync_tasks",
        "aexy.processing.integration_tasks",
        "aexy.processing.workflow_tasks",
        "aexy.processing.email_marketing_tasks",
        "aexy.processing.warming_tasks",
        "aexy.processing.reputation_tasks",
        "aexy.processing.booking_tasks",
    ],
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Task execution
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Rate limiting - different limits for different task types
    task_annotations={
        # LLM analysis tasks - conservative limits
        "aexy.processing.tasks.analyze_commit_task": {
            "rate_limit": "10/m",  # 10 per minute for LLM API
        },
        "aexy.processing.tasks.analyze_pr_task": {
            "rate_limit": "10/m",
        },
        "aexy.processing.tasks.analyze_developer_task": {
            "rate_limit": "5/m",
        },
        # GitHub sync tasks - more conservative for API limits
        "aexy.processing.sync_tasks.sync_repository_task": {
            "rate_limit": "30/m",  # 30 repos per minute
        },
        "aexy.processing.sync_tasks.sync_commits_task": {
            "rate_limit": "60/m",  # Individual commit sync
        },
    },

    # Task routing - separate queues for different task types
    task_routes={
        "aexy.processing.sync_tasks.*": {"queue": "sync"},
        "aexy.processing.tasks.analyze_*": {"queue": "analysis"},
        "aexy.processing.tasks.batch_*": {"queue": "batch"},
        "aexy.processing.tracking_tasks.*": {"queue": "tracking"},
        "aexy.processing.google_sync_tasks.*": {"queue": "google_sync"},
        "aexy.processing.integration_tasks.*": {"queue": "integrations"},
        "aexy.processing.workflow_tasks.*": {"queue": "workflows"},
        "aexy.processing.email_marketing_tasks.*": {"queue": "email_campaigns"},
        "aexy.processing.warming_tasks.*": {"queue": "email_warming"},
        "aexy.processing.reputation_tasks.*": {"queue": "email_reputation"},
        "aexy.processing.booking_tasks.*": {"queue": "booking"},
    },

    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,

    # Result expiration
    result_expires=3600,  # 1 hour

    # Worker settings
    worker_prefetch_multiplier=1,
    worker_concurrency=4,

    # Beat scheduler for periodic tasks
    beat_schedule={
        "nightly-batch-sync": {
            "task": "aexy.processing.tasks.batch_profile_sync_task",
            "schedule": 3600 * 24,  # Daily
        },
        "reset-daily-limits": {
            "task": "aexy.processing.tasks.reset_daily_limits_task",
            "schedule": 3600,  # Hourly check for limit resets
        },
        "report-usage-to-stripe": {
            "task": "aexy.processing.tasks.batch_report_usage_task",
            "schedule": 3600,  # Hourly usage reporting to Stripe
        },
        # On-call scheduling
        "check-oncall-upcoming-shifts": {
            "task": "aexy.processing.oncall_tasks.check_upcoming_shifts",
            "schedule": 300,  # Every 5 minutes
        },
        "check-oncall-ending-shifts": {
            "task": "aexy.processing.oncall_tasks.check_ending_shifts",
            "schedule": 300,  # Every 5 minutes
        },
        # Workflow scheduling
        "check-paused-workflows": {
            "task": "aexy.processing.workflow_tasks.check_paused_workflows",
            "schedule": 60,  # Every minute
        },
        "check-event-subscription-timeouts": {
            "task": "aexy.processing.workflow_tasks.check_event_subscription_timeouts",
            "schedule": 60,  # Every minute
        },
        "process-workflow-retries": {
            "task": "aexy.processing.workflow_tasks.process_workflow_retries",
            "schedule": 60,  # Every minute
        },
        "cleanup-old-workflow-executions": {
            "task": "aexy.processing.workflow_tasks.cleanup_old_executions",
            "schedule": 3600 * 24,  # Daily
        },
        # Email Marketing
        "check-scheduled-campaigns": {
            "task": "aexy.processing.email_marketing_tasks.check_scheduled_campaigns_task",
            "schedule": 60,  # Every minute
        },
        "aggregate-email-analytics": {
            "task": "aexy.processing.email_marketing_tasks.aggregate_daily_analytics_task",
            "schedule": 3600,  # Hourly
        },
        "aggregate-workspace-stats": {
            "task": "aexy.processing.email_marketing_tasks.aggregate_workspace_stats_task",
            "schedule": 3600 * 24,  # Daily
        },
        "cleanup-old-analytics": {
            "task": "aexy.processing.email_marketing_tasks.cleanup_old_analytics_task",
            "schedule": 3600 * 24 * 7,  # Weekly
        },
        "check-due-onboarding-steps": {
            "task": "aexy.processing.email_marketing_tasks.check_due_onboarding_steps",
            "schedule": 300,  # Every 5 minutes
        },
        # Email Warming (Multi-domain infrastructure)
        "process-warming-day": {
            "task": "aexy.processing.warming_tasks.process_warming_day",
            "schedule": 3600 * 24,  # Daily at midnight UTC
        },
        "check-warming-thresholds": {
            "task": "aexy.processing.warming_tasks.check_warming_thresholds",
            "schedule": 3600,  # Hourly
        },
        "reset-daily-volumes-email": {
            "task": "aexy.processing.warming_tasks.reset_daily_volumes",
            "schedule": 3600 * 24,  # Daily at midnight UTC
        },
        # Email Reputation Monitoring
        "calculate-daily-health": {
            "task": "aexy.processing.reputation_tasks.calculate_daily_health",
            "schedule": 3600 * 24,  # Daily
        },
        "calculate-isp-metrics": {
            "task": "aexy.processing.reputation_tasks.calculate_isp_metrics",
            "schedule": 3600 * 24,  # Daily
        },
        "auto-pause-unhealthy-domains": {
            "task": "aexy.processing.reputation_tasks.auto_pause_unhealthy_domains",
            "schedule": 900,  # Every 15 minutes
        },
        "process-unprocessed-events": {
            "task": "aexy.processing.reputation_tasks.process_unprocessed_events",
            "schedule": 300,  # Every 5 minutes
        },
        # Booking module
        "send-booking-reminders": {
            "task": "aexy.processing.booking_tasks.send_booking_reminders",
            "schedule": 900,  # Every 15 minutes
        },
        "sync-booking-calendars": {
            "task": "aexy.processing.booking_tasks.sync_all_calendars",
            "schedule": 300,  # Every 5 minutes
        },
        "cleanup-expired-pending-bookings": {
            "task": "aexy.processing.booking_tasks.cleanup_expired_pending_bookings",
            "schedule": 600,  # Every 10 minutes
        },
        "mark-completed-bookings": {
            "task": "aexy.processing.booking_tasks.mark_completed_bookings",
            "schedule": 3600,  # Hourly
        },
    },
)
