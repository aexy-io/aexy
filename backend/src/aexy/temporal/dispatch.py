"""Temporal dispatch layer - drop-in replacement for Celery .delay() pattern.

Usage:
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    # Fire-and-forget (replaces task.delay())
    await dispatch("analyze_commit", AnalyzeCommitInput(...), task_queue=TaskQueue.ANALYSIS)

    # With explicit workflow ID for idempotency
    await dispatch("sync_repository", SyncRepositoryInput(...),
                   task_queue=TaskQueue.SYNC, workflow_id="sync-repo-123")
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import uuid4

from temporalio import workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy

from aexy.temporal.client import get_temporal_client
from aexy.temporal.task_queues import TaskQueue

logger = logging.getLogger(__name__)

# =============================================================================
# Retry Policies
# =============================================================================

STANDARD_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=60),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=10),
    maximum_attempts=4,
)

LLM_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=30),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=10),
    maximum_attempts=6,
    non_retryable_error_types=["ValueError", "KeyError"],
)

WEBHOOK_RETRY = RetryPolicy(
    initial_interval=timedelta(minutes=1),
    backoff_coefficient=3.0,
    maximum_interval=timedelta(hours=1),
    maximum_attempts=6,
)

# Map activity names to retry policies and timeouts
ACTIVITY_CONFIG: dict[str, dict[str, Any]] = {
    # Analysis (LLM)
    "analyze_commit": {"retry": LLM_RETRY, "timeout": timedelta(minutes=10)},
    "analyze_pr": {"retry": LLM_RETRY, "timeout": timedelta(minutes=10)},
    "analyze_developer": {"retry": LLM_RETRY, "timeout": timedelta(minutes=30)},
    "batch_profile_sync": {"retry": STANDARD_RETRY, "timeout": timedelta(hours=2), "heartbeat": timedelta(minutes=5)},
    "extract_knowledge_from_document": {"retry": LLM_RETRY, "timeout": timedelta(minutes=30)},
    "rebuild_workspace_graph": {"retry": LLM_RETRY, "timeout": timedelta(hours=2), "heartbeat": timedelta(minutes=5)},

    # Sync (external APIs)
    "sync_repository": {"retry": "github_sync", "timeout": timedelta(hours=2), "heartbeat": timedelta(minutes=5)},
    "sync_commits": {"retry": "github_sync", "timeout": timedelta(hours=1)},
    "check_repo_auto_sync": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=10)},
    "sync_gmail": {"retry": "google_sync", "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},
    "sync_calendar": {"retry": "google_sync", "timeout": timedelta(minutes=30)},

    # Webhooks
    "deliver_webhook": {"retry": WEBHOOK_RETRY, "timeout": timedelta(minutes=2)},

    # Short activities (notifications, SMS, etc.)
    "send_sms": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "send_slack_message": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "send_slack_dm": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "send_uptime_notification": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "send_booking_notification": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "send_swap_notification": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},

    # Medium activities
    "send_campaign": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30)},
    "execute_agent": {"retry": LLM_RETRY, "timeout": timedelta(minutes=10)},
    "execute_workflow_action": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},

    # Reminders (on-demand)
    "process_auto_assignment": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
    "send_reminder_notification": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},

    # Insights
    "auto_generate_snapshots": {"retry": STANDARD_RETRY, "timeout": timedelta(hours=1)},
}

DEFAULT_CONFIG = {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)}


async def dispatch(
    activity_name: str,
    input: Any,
    task_queue: str = TaskQueue.OPERATIONS,
    workflow_id: str | None = None,
) -> str:
    """Start a single-activity workflow (fire-and-forget replacement for .delay()).

    Args:
        activity_name: Name of the activity function to execute.
        input: Dataclass input for the activity.
        task_queue: Task queue to use.
        workflow_id: Optional workflow ID for idempotency.

    Returns:
        Workflow run ID.
    """
    from aexy.temporal.workflows.single_activity import SingleActivityWorkflow, SingleActivityInput

    client = await get_temporal_client()
    wf_id = workflow_id or f"{activity_name}-{uuid4()}"

    config = ACTIVITY_CONFIG.get(activity_name, DEFAULT_CONFIG)

    handle = await client.start_workflow(
        SingleActivityWorkflow.run,
        SingleActivityInput(
            activity_name=activity_name,
            activity_input=input,
            retry_policy_name=_get_retry_name(config["retry"]),
            timeout_seconds=int(config["timeout"].total_seconds()),
            heartbeat_seconds=int(config.get("heartbeat", timedelta(0)).total_seconds()) or None,
        ),
        id=wf_id,
        task_queue=task_queue,
    )
    logger.debug(f"Dispatched {activity_name} as workflow {wf_id}")
    return handle.id


def _get_retry_name(policy: RetryPolicy | str) -> str:
    """Get a name for a retry policy for serialization."""
    if isinstance(policy, str):
        return policy
    if policy is LLM_RETRY:
        return "llm"
    elif policy is WEBHOOK_RETRY:
        return "webhook"
    return "standard"
