"""User onboarding workflow."""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


@dataclass
class OnboardingWorkflowInput:
    workspace_id: str
    user_id: str
    flow_id: str | None = None
    flow_slug: str | None = None
    record_id: str | None = None


@workflow.defn
class OnboardingWorkflow:
    """Workflow for user onboarding flow."""

    @workflow.run
    async def run(self, input: OnboardingWorkflowInput) -> dict[str, Any]:
        from aexy.temporal.activities.email import StartUserOnboardingInput

        return await workflow.execute_activity(
            "start_user_onboarding",
            StartUserOnboardingInput(
                workspace_id=input.workspace_id,
                user_id=input.user_id,
                flow_id=input.flow_id,
                flow_slug=input.flow_slug,
                record_id=input.record_id,
            ),
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
