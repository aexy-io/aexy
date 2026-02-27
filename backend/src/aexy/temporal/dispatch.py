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
    "send_notification_email": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "send_notification_slack": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
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

    # GTM (Go-To-Market)
    "identify_visitor_session": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "process_visitor_events": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
    "verify_email_address": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "score_lead": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
    "batch_score_leads": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},

    # GTM Outreach Sequences
    "execute_outreach_step": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
    "finalize_enrollment": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},

    # GTM Analytics / Reports
    "generate_weekly_gtm_report": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=10)},

    # GTM Reply Classification
    "classify_outreach_reply": {"retry": LLM_RETRY, "timeout": timedelta(minutes=2)},

    # GTM Personalization
    "personalize_outreach_batch": {"retry": LLM_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},

    # GTM Bulk Import
    "run_bulk_import": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},

    # GTM Alerts
    "send_gtm_alert": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},

    # GTM Lead Routing & SLA
    "route_new_lead": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},
    "check_sla_breaches": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},

    # GTM Customer Health
    "score_customer_health": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
    "batch_score_customer_health": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},
    "detect_health_drops": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},

    # GTM Expansion Playbooks
    "evaluate_expansion_triggers": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
    "advance_expansion_step": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=2)},

    # GTM Intent Signals
    "collect_intent_signals": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},
    "match_intent_signals_to_records": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=10)},

    # GTM Competitor Intelligence
    "check_competitor_changes": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},
    "generate_battle_card": {"retry": LLM_RETRY, "timeout": timedelta(minutes=10)},

    # GTM SEO Audit
    "run_seo_audit": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=15), "heartbeat": timedelta(seconds=30)},

    # GTM Content Gap Analysis
    "run_content_gap_analysis": {"retry": LLM_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},

    # GTM ABM
    "recalculate_abm_engagement": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=30), "heartbeat": timedelta(minutes=5)},
    "refresh_dynamic_abm_lists": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=10)},
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
