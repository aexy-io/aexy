"""Email campaign orchestration workflow."""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


@dataclass
class EmailCampaignWorkflowInput:
    campaign_id: str


@workflow.defn
class EmailCampaignWorkflow:
    """Workflow for processing email campaign sending."""

    @workflow.run
    async def run(self, input: EmailCampaignWorkflowInput) -> dict[str, Any]:
        from aexy.temporal.activities.email import SendCampaignInput

        # Process campaign sending (handles batching internally)
        result = await workflow.execute_activity(
            "send_campaign",
            SendCampaignInput(campaign_id=input.campaign_id),
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=RetryPolicy(
                initial_interval=timedelta(seconds=60),
                maximum_attempts=4,
            ),
        )

        # Update stats after campaign completes
        from aexy.temporal.activities.email import UpdateCampaignStatsInput
        await workflow.execute_activity(
            "update_campaign_stats",
            UpdateCampaignStatsInput(campaign_id=input.campaign_id),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        return result
