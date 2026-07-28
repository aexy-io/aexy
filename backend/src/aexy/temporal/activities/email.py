"""Temporal activities for email marketing and campaigns.

Replaces: aexy.processing.email_marketing_tasks
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

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
class DrainAutomationEmailOutboxInput:
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
    automation_run_id: str | None = None
    automation_step_order: int | None = None
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
async def drain_automation_email_outbox(
    input: DrainAutomationEmailOutboxInput,
) -> dict[str, Any]:
    """Backstop for the request-path handoff.

    The request path drains the outbox itself right after committing, so this
    normally finds nothing. It exists for when that never happened - process
    killed between commit and handoff, or the worker unreachable at the time.

    Also reaps runs abandoned without an outcome. It rides this schedule rather
    than its own because both are the same kind of backstop on the same cadence,
    and an un-decided run is usually a lost email handover anyway.
    """
    from aexy.core.database import async_session_maker
    from aexy.services.automation_email_outbox import drain_outbox
    from aexy.services.automation_run_reaper import reap_stalled_runs

    result = await drain_outbox()
    if result["dispatched"] or result["failed"]:
        logger.info("Outbox sweep: %s", result)

    # Guarded separately: reaping must not be able to break the drain, which is
    # the part that actually gets mail out.
    try:
        async with async_session_maker() as db:
            result |= await reap_stalled_runs(db)
    except Exception:
        logger.exception("Stalled automation run reap failed")

    return result


def _is_final_activity_attempt() -> bool:
    """Whether Temporal will not schedule another attempt after this one fails.

    Outside an activity (unit tests calling the function directly) treat the
    attempt as final so a single-shot invocation still records a failure.
    """
    try:
        info = activity.info()
    except RuntimeError:
        return True
    policy = info.retry_policy
    if policy is None:
        return True
    # maximum_attempts == 0 means unlimited retries in Temporal.
    if policy.maximum_attempts == 0:
        return False
    return info.attempt >= policy.maximum_attempts


def _matching_email_step(
    steps: list[dict], input: SendWorkflowEmailInput
) -> dict | None:
    for step in steps:
        if (
            step.get("type") in {"send_email", "notify_user"}
            and step.get("order") == input.automation_step_order
        ):
            return step
    return None


async def _prepare_automation_email_send(
    db: Any, input: SendWorkflowEmailInput
) -> str:
    """Claim the step before contacting the provider, or refuse a re-send.

    Returns one of:
    - ``none``: not an automation send (or no step); caller may send normally
    - ``claimed``: step moved queued/failed → sending; safe to contact provider
    - ``already_sent``: do not send; return success
    - ``refuse_resend``: prior attempt may have reached the provider; do not send
    """
    if not input.automation_run_id:
        return "none"

    from aexy.models.crm import CRMAutomationRun  # noqa: F401
    from aexy.services.automation_counters import load_run_for_update

    run = await load_run_for_update(db, input.automation_run_id)
    if not run:
        return "none"

    steps = [dict(step) for step in (run.steps_executed or [])]
    step = _matching_email_step(steps, input)
    if step is None:
        return "none"

    status = step.get("status")
    if status == "sent":
        return "already_sent"
    if status in {"sending", "needs_review"}:
        # A previous attempt claimed the step (and may have delivered) without
        # a durable terminal write. Re-sending would risk a duplicate email.
        return "refuse_resend"
    if status in {"queued", "failed"}:
        # ``failed`` is claimable so a success after an intermediate failure
        # write (or a recovered final write path) can still attempt once more
        # only when Temporal retries; the usual path leaves the step queued
        # until a terminal outcome.
        step["status"] = "sending"
        run.steps_executed = steps
        return "claimed"
    return "refuse_resend"


async def _release_automation_email_claim(
    db: Any, input: SendWorkflowEmailInput
) -> None:
    """Return a claimed step to queued so a later Temporal attempt can re-send.

    Used only on non-final failures where we did not record a terminal outcome.
    If the provider actually accepted the message and then we raised, a later
    attempt may still double-send; the refuse_resend path covers the case where
    the step stayed ``sending`` (success path that failed while writing back).
    """
    if not input.automation_run_id:
        return

    from aexy.models.crm import CRMAutomationRun  # noqa: F401
    from aexy.services.automation_counters import load_run_for_update

    run = await load_run_for_update(db, input.automation_run_id)
    if not run:
        return

    steps = [dict(step) for step in (run.steps_executed or [])]
    step = _matching_email_step(steps, input)
    if step is None or step.get("status") != "sending":
        return
    step["status"] = "queued"
    run.steps_executed = steps


@activity.defn
async def send_workflow_email(input: SendWorkflowEmailInput) -> dict[str, Any]:
    """Send tracked email from workflow action.

    Automation runs are reconciled under Temporal retries without permanently
    stamping a failure that a later success cannot correct, and without
    re-contacting the provider when a prior attempt already claimed the step
    and may have delivered.
    """
    logger.info(f"Sending workflow email to {input.to_email}")

    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        prep = await _prepare_automation_email_send(db, input)
        if prep != "none":
            await db.commit()

        if prep == "already_sent":
            return {"status": "sent", "to": input.to_email, "deduped": True}

        if prep == "refuse_resend":
            result = {
                "status": "needs_review",
                "reason": "prior_send_attempt_uncertain",
                "to": input.to_email,
            }
            await _record_automation_email_result(db, input, result)
            await db.commit()
            return result

        service = EmailCampaignService(db)
        try:
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
        except Exception as error:
            if _is_final_activity_attempt():
                try:
                    await _record_automation_email_result(
                        db,
                        input,
                        {
                            "status": "failed",
                            "error": str(error),
                            "to": input.to_email,
                        },
                    )
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Could not record failed workflow email result")
            else:
                # Keep the step retryable; do not commit a terminal failure that
                # would block a later success from finalizing the run.
                try:
                    await _release_automation_email_claim(db, input)
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Could not release automation email claim")
            raise

        await _record_automation_email_result(db, input, result)
        await db.commit()
        return result


async def _record_automation_email_result(
    db: Any,
    input: SendWorkflowEmailInput,
    result: dict[str, Any],
) -> None:
    """Write the provider's final email outcome back to a CRM automation run.

    Step transitions are monotonic for delivery honesty:
    - ``queued`` / ``sending`` / ``failed`` may become ``sent`` (retry recovered)
    - ``sent`` never regresses
    - intermediate Temporal failures should leave the step ``queued`` (see
      ``send_workflow_email``); a terminal failure may set ``failed``
    """
    if not input.automation_run_id:
        return

    from aexy.models.crm import CRMAutomation, CRMActivity
    from aexy.services.automation_counters import (
        correct_failure_to_success,
        load_run_for_update,
        record_run_outcome,
    )

    run = await load_run_for_update(db, input.automation_run_id)
    if not run:
        logger.warning("Automation run %s was not found for email result", input.automation_run_id)
        return

    email_sent = result.get("status") == "sent"
    needs_review = result.get("status") == "needs_review"
    reason = result.get("reason") or result.get("error")
    steps = [dict(step) for step in (run.steps_executed or [])]
    prior_run_status = run.status

    step = _matching_email_step(steps, input)
    if step is None:
        logger.warning("No queued email step found for automation run %s", run.id)
        return

    current = step.get("status")
    prior_step_status = current
    if current == "sent":
        logger.info(
            "Ignoring duplicate email result for automation run %s step %s",
            run.id,
            input.automation_step_order,
        )
        return
    if current not in {"queued", "sending", "failed"}:
        # needs_review or unknown terminal: do not regress or re-finalize.
        logger.info(
            "Ignoring email result for automation run %s step %s in status %s",
            run.id,
            input.automation_step_order,
            current,
        )
        return
    # Same terminal failure again (e.g. activity retried the write): no-op.
    if current == "failed" and not email_sent and not needs_review:
        logger.info(
            "Ignoring duplicate failed email result for automation run %s step %s",
            run.id,
            input.automation_step_order,
        )
        return

    if email_sent:
        step["status"] = "sent"
        step.pop("error", None)
    elif needs_review:
        step["status"] = "needs_review"
        step["error"] = str(reason or "Send outcome uncertain")
    else:
        step["status"] = "failed"
        step["error"] = str(reason or "Email was not sent")
    step["result"] = result

    run.steps_executed = steps
    email_steps = [
        step for step in steps if step.get("type") in {"send_email", "notify_user"}
    ]
    # Still waiting on another in-flight email (or a claim not yet finalized).
    if any(step.get("status") in {"queued", "sending"} for step in email_steps):
        return

    automation = await db.get(CRMAutomation, run.automation_id)

    # The executor already counted this run if it reached a verdict of its own
    # (a later step failing under "stop" finalizes the run while an earlier
    # email is still in flight). Counting again here would double it — unless
    # this email step itself was counted failed and a later success recovers it.
    already_counted = prior_run_status in {"completed", "failed"}

    run.completed_at = datetime.now(timezone.utc)
    run.duration_ms = int(
        (run.completed_at - run.started_at).total_seconds() * 1000
    ) if run.started_at else None

    # Any failed or uncertain step fails the run, not just a failed email: under
    # error_handling="continue" an earlier step can have failed and still
    # reach here, and reporting the run completed would contradict it.
    failed_steps = [
        step
        for step in steps
        if step.get("status") in {"failed", "needs_review"}
    ]
    if failed_steps:
        new_status = "failed"
        if any(step.get("status") in {"failed", "needs_review"} for step in email_steps):
            run.error_message = str(reason or "Email was not sent")
        else:
            run.error_message = str(failed_steps[0].get("error") or "A step failed")
    else:
        new_status = "completed"
        run.error_message = None

    run.status = new_status

    if automation:
        if already_counted:
            # Only reverse counters when THIS step was failed and is now sent —
            # not when the executor failed the run for another reason while the
            # email was still queued/sending.
            if (
                prior_run_status == "failed"
                and new_status == "completed"
                and prior_step_status == "failed"
            ):
                await correct_failure_to_success(db, automation.id)
        elif new_status == "failed":
            await record_run_outcome(db, automation.id, succeeded=False)
        else:
            await record_run_outcome(db, automation.id, succeeded=True)

    if input.record_id and automation:
        if email_sent:
            outcome = "email sent"
            email_status = "sent"
        elif needs_review:
            outcome = "email needs review"
            email_status = "needs_review"
        else:
            outcome = "email not sent"
            email_status = "not_sent"
        db.add(
            CRMActivity(
                id=str(uuid4()),
                workspace_id=automation.workspace_id,
                record_id=input.record_id,
                activity_type="automation.triggered",
                actor_type="automation",
                actor_id=None,
                actor_name=automation.name,
                title=f'Automation "{automation.name}" {outcome}',
                description=None if email_sent else str(reason or "Email was not sent"),
                activity_metadata={
                    "automation_id": automation.id,
                    "run_id": run.id,
                    "email_status": email_status,
                    "reason": reason,
                    "to": result.get("to", input.to_email),
                },
                occurred_at=run.completed_at,
            )
        )


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
