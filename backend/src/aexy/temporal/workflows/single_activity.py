"""SingleActivityWorkflow - wraps a single activity as a workflow.

This is the fire-and-forget replacement for Celery's .delay() pattern.
Each activity gets its own workflow execution with full observability.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


@dataclass
class SingleActivityInput:
    activity_name: str
    activity_input: Any
    retry_policy_name: str = "standard"
    timeout_seconds: int = 300
    heartbeat_seconds: int | None = None


# Retry policy lookup
def _get_retry_policy(name: str) -> RetryPolicy:
    if name == "llm":
        return RetryPolicy(
            initial_interval=timedelta(seconds=30),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(minutes=10),
            maximum_attempts=6,
            non_retryable_error_types=["ValueError", "KeyError"],
        )
    elif name == "google_sync":
        return RetryPolicy(
            initial_interval=timedelta(seconds=60),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(minutes=10),
            maximum_attempts=4,
            non_retryable_error_types=["GmailAuthError"],
        )
    elif name == "github_sync":
        return RetryPolicy(
            initial_interval=timedelta(seconds=60),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(minutes=10),
            maximum_attempts=4,
            non_retryable_error_types=["GitHubAuthError"],
        )
    elif name == "webhook":
        return RetryPolicy(
            initial_interval=timedelta(minutes=1),
            backoff_coefficient=3.0,
            maximum_interval=timedelta(hours=1),
            maximum_attempts=6,
        )
    else:  # standard
        return RetryPolicy(
            initial_interval=timedelta(seconds=60),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(minutes=10),
            maximum_attempts=4,
        )


@workflow.defn
class SingleActivityWorkflow:
    """Execute a single activity as a workflow.

    Provides full Temporal observability (history, retries, timeouts)
    for fire-and-forget activity dispatches.
    """

    @workflow.run
    async def run(self, input: SingleActivityInput) -> Any:
        retry_policy = _get_retry_policy(input.retry_policy_name)

        kwargs: dict[str, Any] = {
            "start_to_close_timeout": timedelta(seconds=input.timeout_seconds),
            "retry_policy": retry_policy,
        }
        if input.heartbeat_seconds:
            kwargs["heartbeat_timeout"] = timedelta(seconds=input.heartbeat_seconds)

        return await workflow.execute_activity(
            input.activity_name,
            input.activity_input,
            **kwargs,
        )
