"""Temporal activities for email marketing and campaigns.

Replaces: aexy.processing.email_marketing_tasks
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class SendCampaignInput:
    campaign_id: str


@dataclass
class SendCampaignEmailInput:
    campaign_id: str
    recipient_id: str


@dataclass
class UpdateCampaignStatsInput:
    campaign_id: str


@dataclass
class CheckScheduledCampaignsInput:
    pass


@dataclass
class AggregateDailyAnalyticsInput:
    pass


@dataclass
class SendWorkflowEmailInput:
    workspace_id: str
    to_email: str
    subject: str
    html_body: str
    from_name: str | None = None
    from_email: str | None = None
    record_id: str | None = None
    execution_id: str | None = None
    track_opens: bool = True
    track_clicks: bool = True


@dataclass
class AggregateWorkspaceStatsInput:
    pass


@dataclass
class CleanupOldAnalyticsInput:
    days: int = 90


@dataclass
class StartUserOnboardingInput:
    workspace_id: str
    user_id: str
    flow_id: str | None = None
    flow_slug: str | None = None
    record_id: str | None = None


@dataclass
class ProcessOnboardingStepInput:
    progress_id: str


@dataclass
class CompleteOnboardingStepInput:
    progress_id: str | None = None
    flow_id: str | None = None
    user_id: str | None = None
    step_id: str | None = None


@dataclass
class CheckDueOnboardingStepsInput:
    pass


@dataclass
class SeedDefaultBlocksInput:
    workspace_id: str


@activity.defn
async def send_campaign(input: SendCampaignInput) -> dict[str, Any]:
    """Process campaign sending in batches."""
    logger.info(f"Processing campaign {input.campaign_id}")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.process_campaign_sending(input.campaign_id)
        await db.commit()
        return result


@activity.defn
async def send_campaign_email(input: SendCampaignEmailInput) -> dict[str, Any]:
    """Send individual campaign email with tracking."""
    logger.info(f"Sending campaign email: campaign={input.campaign_id}, recipient={input.recipient_id}")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.send_campaign_email(
            campaign_id=input.campaign_id,
            recipient_id=input.recipient_id,
        )
        await db.commit()
        return result


@activity.defn
async def update_campaign_stats(input: UpdateCampaignStatsInput) -> dict[str, Any]:
    """Aggregate recipient stats to campaign level."""
    logger.info(f"Updating stats for campaign {input.campaign_id}")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.update_campaign_stats(input.campaign_id)
        await db.commit()
        return result


@activity.defn
async def check_scheduled_campaigns(input: CheckScheduledCampaignsInput) -> dict[str, Any]:
    """Check for scheduled campaigns due to send."""
    logger.info("Checking scheduled campaigns")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.check_scheduled_campaigns()
        await db.commit()
        return result


@activity.defn
async def aggregate_daily_analytics(input: AggregateDailyAnalyticsInput) -> dict[str, Any]:
    """Aggregate campaign analytics daily."""
    logger.info("Aggregating daily email analytics")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.aggregate_daily_analytics()
        await db.commit()
        return result


@activity.defn
async def send_workflow_email(input: SendWorkflowEmailInput) -> dict[str, Any]:
    """Send tracked email from workflow action."""
    logger.info(f"Sending workflow email to {input.to_email}")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.send_workflow_email(
            workspace_id=input.workspace_id,
            to_email=input.to_email,
            subject=input.subject,
            html_body=input.html_body,
            from_name=input.from_name,
            from_email=input.from_email,
            record_id=input.record_id,
            execution_id=input.execution_id,
            track_opens=input.track_opens,
            track_clicks=input.track_clicks,
        )
        await db.commit()
        return result


@activity.defn
async def aggregate_workspace_stats(input: AggregateWorkspaceStatsInput) -> dict[str, Any]:
    """Aggregate workspace-level email stats."""
    logger.info("Aggregating workspace stats")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.aggregate_workspace_stats()
        await db.commit()
        return result


@activity.defn
async def cleanup_old_analytics(input: CleanupOldAnalyticsInput) -> dict[str, Any]:
    """Clean up old analytics data."""
    logger.info(f"Cleaning up analytics older than {input.days} days")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.cleanup_old_analytics(input.days)
        await db.commit()
        return result


@activity.defn
async def start_user_onboarding(input: StartUserOnboardingInput) -> dict[str, Any]:
    """Start onboarding flow for user.

    Looks up the flow by flow_id or flow_slug, then delegates to
    OnboardingService.start_onboarding(flow_id, user_id, record_id).
    """
    logger.info(f"Starting onboarding for user {input.user_id}")

    from sqlalchemy import select
    from aexy.models.email_marketing import OnboardingFlow
    from aexy.services.onboarding_service import OnboardingService

    async with async_session_maker() as db:
        # Resolve flow
        flow = None
        if input.flow_id:
            flow = (await db.execute(
                select(OnboardingFlow)
                .where(OnboardingFlow.id == input.flow_id)
                .where(OnboardingFlow.workspace_id == input.workspace_id)
            )).scalar_one_or_none()
        elif input.flow_slug:
            flow = (await db.execute(
                select(OnboardingFlow)
                .where(OnboardingFlow.slug == input.flow_slug)
                .where(OnboardingFlow.workspace_id == input.workspace_id)
            )).scalar_one_or_none()
        else:
            return {"status": "failed", "error": "Must specify flow_id or flow_slug"}

        if not flow:
            return {"status": "failed", "error": "Flow not found"}
        if not flow.is_active:
            return {"status": "skipped", "message": "Flow is not active"}

        service = OnboardingService(db)
        progress = await service.start_onboarding(
            flow_id=flow.id,
            user_id=input.user_id,
            record_id=input.record_id,
        )
        await db.commit()

        # Dispatch first step processing
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        await dispatch(
            "process_onboarding_step",
            ProcessOnboardingStepInput(progress_id=progress.id),
            task_queue=TaskQueue.EMAIL,
        )

        return {"status": "success", "progress_id": progress.id}


@activity.defn
async def process_onboarding_step(input: ProcessOnboardingStepInput) -> dict[str, Any]:
    """Process the current onboarding step and schedule the next one.

    Mirrors the old Celery task: loads progress + flow, executes the step
    (sends email for email steps), advances, and dispatches next step.
    """
    logger.info(f"Processing onboarding step for progress {input.progress_id}")

    from sqlalchemy import select
    from aexy.models.email_marketing import (
        OnboardingProgress, OnboardingFlow, OnboardingStatus,
    )
    from aexy.models.developer import Developer

    async with async_session_maker() as db:
        progress = (await db.execute(
            select(OnboardingProgress).where(OnboardingProgress.id == input.progress_id)
        )).scalar_one_or_none()

        if not progress:
            return {"status": "error", "message": "Progress not found"}
        if progress.status != OnboardingStatus.IN_PROGRESS.value:
            return {"status": "skipped", "message": f"Status is {progress.status}"}

        flow = (await db.execute(
            select(OnboardingFlow).where(OnboardingFlow.id == progress.flow_id)
        )).scalar_one_or_none()

        if not flow or not flow.is_active:
            return {"status": "skipped", "message": "Flow not active"}

        steps = flow.steps or []
        if progress.current_step >= len(steps):
            progress.status = OnboardingStatus.COMPLETED.value
            progress.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"status": "completed"}

        step = steps[progress.current_step]
        step_id = step.get("id", f"step_{progress.current_step}")
        step_type = step.get("type", "email")
        step_config = step.get("config", {})

        now = datetime.now(timezone.utc)

        if step_type == "email":
            user = (await db.execute(
                select(Developer).where(Developer.id == progress.user_id)
            )).scalar_one_or_none()

            if user and user.email:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue

                await dispatch(
                    "send_workflow_email",
                    SendWorkflowEmailInput(
                        workspace_id=flow.workspace_id,
                        to_email=user.email,
                        subject=step_config.get("subject", "Onboarding Step"),
                        html_body=step_config.get("body", f"<p>Step {progress.current_step + 1}</p>"),
                        record_id=progress.record_id,
                    ),
                    task_queue=TaskQueue.EMAIL,
                )

        elif step_type == "milestone":
            return {"status": "waiting", "waiting_for": step_config.get("milestone_slug")}

        # Mark step complete and advance
        completed = list(progress.completed_steps)
        completed.append(step_id)
        progress.completed_steps = completed
        progress.last_step_at = now
        progress.current_step += 1

        if progress.current_step >= len(steps):
            progress.status = OnboardingStatus.COMPLETED.value
            progress.completed_at = now
            progress.next_step_scheduled = None
            await db.commit()
            logger.info(f"Onboarding completed for progress {input.progress_id}")
            return {"status": "completed"}

        # Schedule next step
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        next_step = steps[progress.current_step]
        delay = next_step.get("delay", flow.delay_between_steps)
        progress.next_step_scheduled = now + timedelta(seconds=delay)
        await db.commit()

        # The Temporal schedule (check-due-onboarding-steps) will pick this
        # up when next_step_scheduled <= now, so no explicit countdown needed.

        return {"status": "success", "step_completed": step_id, "next_step": progress.current_step}


@activity.defn
async def complete_onboarding_step(input: CompleteOnboardingStepInput) -> dict[str, Any]:
    """Complete a specific onboarding step, then dispatch step processing.

    Accepts either progress_id directly, or flow_id + user_id to look it up.
    """
    logger.info(f"Completing onboarding step: progress_id={input.progress_id}")

    from sqlalchemy import select
    from aexy.models.email_marketing import OnboardingProgress
    from aexy.services.onboarding_service import OnboardingService

    async with async_session_maker() as db:
        if input.progress_id:
            progress = (await db.execute(
                select(OnboardingProgress).where(OnboardingProgress.id == input.progress_id)
            )).scalar_one_or_none()
        elif input.flow_id and input.user_id:
            progress = (await db.execute(
                select(OnboardingProgress)
                .where(OnboardingProgress.flow_id == input.flow_id)
                .where(OnboardingProgress.user_id == input.user_id)
            )).scalar_one_or_none()
        else:
            return {"status": "error", "message": "Must specify progress_id or (flow_id + user_id)"}

        if not progress:
            return {"status": "error", "message": "Progress not found"}

        service = OnboardingService(db)
        await service.complete_step(
            progress_id=progress.id,
            step_id=input.step_id,
        )
        await db.commit()

        # Dispatch step processing for the next step
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        await dispatch(
            "process_onboarding_step",
            ProcessOnboardingStepInput(progress_id=progress.id),
            task_queue=TaskQueue.EMAIL,
        )

        return {"status": "success", "progress_id": progress.id}


@activity.defn
async def check_due_onboarding_steps(input: CheckDueOnboardingStepsInput) -> dict[str, Any]:
    """Check for and process due onboarding steps."""
    logger.info("Checking due onboarding steps")

    from aexy.services.onboarding_service import OnboardingService

    async with async_session_maker() as db:
        service = OnboardingService(db)
        result = await service.check_due_steps()
        await db.commit()
        return result


@activity.defn
async def seed_default_blocks(input: SeedDefaultBlocksInput) -> dict[str, Any]:
    """Seed default system blocks for visual email builder."""
    logger.info(f"Seeding default blocks for workspace {input.workspace_id}")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        service = EmailCampaignService(db)
        result = await service.seed_default_blocks(input.workspace_id)
        await db.commit()
        return result
