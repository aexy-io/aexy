"""Celery application configuration."""

from celery import Celery

from devograph.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "devograph",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "devograph.processing.tasks",
        "devograph.processing.sync_tasks",
        "devograph.processing.oncall_tasks",
        "devograph.processing.tracking_tasks",
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
        "devograph.processing.tasks.analyze_commit_task": {
            "rate_limit": "10/m",  # 10 per minute for LLM API
        },
        "devograph.processing.tasks.analyze_pr_task": {
            "rate_limit": "10/m",
        },
        "devograph.processing.tasks.analyze_developer_task": {
            "rate_limit": "5/m",
        },
        # GitHub sync tasks - more conservative for API limits
        "devograph.processing.sync_tasks.sync_repository_task": {
            "rate_limit": "30/m",  # 30 repos per minute
        },
        "devograph.processing.sync_tasks.sync_commits_task": {
            "rate_limit": "60/m",  # Individual commit sync
        },
    },

    # Task routing - separate queues for different task types
    task_routes={
        "devograph.processing.sync_tasks.*": {"queue": "sync"},
        "devograph.processing.tasks.analyze_*": {"queue": "analysis"},
        "devograph.processing.tasks.batch_*": {"queue": "batch"},
        "devograph.processing.tracking_tasks.*": {"queue": "tracking"},
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
            "task": "devograph.processing.tasks.batch_profile_sync_task",
            "schedule": 3600 * 24,  # Daily
        },
        "reset-daily-limits": {
            "task": "devograph.processing.tasks.reset_daily_limits_task",
            "schedule": 3600,  # Hourly check for limit resets
        },
        "report-usage-to-stripe": {
            "task": "devograph.processing.tasks.batch_report_usage_task",
            "schedule": 3600,  # Hourly usage reporting to Stripe
        },
        # On-call scheduling
        "check-oncall-upcoming-shifts": {
            "task": "devograph.processing.oncall_tasks.check_upcoming_shifts",
            "schedule": 300,  # Every 5 minutes
        },
        "check-oncall-ending-shifts": {
            "task": "devograph.processing.oncall_tasks.check_ending_shifts",
            "schedule": 300,  # Every 5 minutes
        },
    },
)
