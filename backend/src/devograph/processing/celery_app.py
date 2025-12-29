"""Celery application configuration."""

from celery import Celery

from devograph.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "devograph",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["devograph.processing.tasks"],
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

    # Rate limiting
    task_annotations={
        "devograph.processing.tasks.analyze_commit_task": {
            "rate_limit": "10/m",  # 10 per minute for LLM API
        },
        "devograph.processing.tasks.analyze_pr_task": {
            "rate_limit": "10/m",
        },
        "devograph.processing.tasks.analyze_developer_task": {
            "rate_limit": "5/m",
        },
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
            "schedule": 3600 * 24,  # Daily (will be configured via APScheduler)
        },
    },
)
