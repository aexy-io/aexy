"""Outreach sequence activities.

Activities:
    - execute_outreach_step: Execute a single outreach step (email, LinkedIn, SMS)
    - finalize_enrollment: Mark an enrollment as completed or exited
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# INPUT DATACLASSES
# =============================================================================

@dataclass
class OutreachEnrollmentInput:
    enrollment_id: str
    workspace_id: str
    sequence_id: str
    steps: list  # JSONB step definitions
    settings: dict | None = None  # Sequence settings (send_window, etc.)
    recipient_timezone: str | None = None  # Recipient timezone for send-window


@dataclass
class ExecuteStepInput:
    enrollment_id: str
    workspace_id: str
    step_index: int
    channel: str
    action: str
    config: dict


@dataclass
class FinalizeEnrollmentInput:
    enrollment_id: str
    exit_reason: str  # "completed", "replied", "bounced", "unsubscribed", "exited"


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn
async def execute_outreach_step(input: ExecuteStepInput) -> dict:
    """Execute a single outreach step (email, LinkedIn, SMS).

    1. Get enrollment from DB
    2. Run compliance check
    3. Dispatch via appropriate channel provider
    4. Create OutreachStepExecution record
    5. Update enrollment.current_step_index
    """
    from sqlalchemy import select, and_

    from aexy.integrations.registry import ProviderRegistry
    from aexy.models.gtm_outreach import (
        OutreachEnrollment,
        OutreachStepExecution,
        StepExecutionStatus,
    )
    from aexy.services.gtm_compliance_service import GTMComplianceService
    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        # 1. Get enrollment
        enrollment = (await db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.id == input.enrollment_id,
                    OutreachEnrollment.workspace_id == input.workspace_id,
                )
            )
        )).scalar_one_or_none()

        if not enrollment:
            return {"success": False, "reason": "Enrollment not found"}

        # 2. Compliance check
        compliance = GTMComplianceService(db)
        permission = await compliance.check_send_permission(
            input.workspace_id, enrollment.email, enrollment.record_id,
        )
        if not permission.get("allowed"):
            # Record a skipped execution
            execution = OutreachStepExecution(
                id=str(uuid4()),
                enrollment_id=input.enrollment_id,
                workspace_id=input.workspace_id,
                step_index=input.step_index,
                channel=input.channel,
                action=input.action,
                status=StepExecutionStatus.SKIPPED.value,
                error_message=f"Compliance blocked: {permission.get('reason', 'unknown')}",
            )
            db.add(execution)
            await db.commit()
            return {
                "success": False,
                "reason": f"Compliance blocked: {permission.get('reason')}",
                "execution_id": execution.id,
            }

        # 3. Execute based on channel/action
        provider_message_id = None
        error_message = None
        status = StepExecutionStatus.SENT.value
        sent_at = datetime.now(timezone.utc)

        try:
            if input.channel == "email" and input.action == "send_email":
                config = input.config
                from_email = config.get("from_email")
                from_name = config.get("from_name")

                # Inbox rotation: if no explicit from_email, use RoutingService
                if not from_email and config.get("sending_pool_id"):
                    try:
                        from aexy.services.routing_service import RoutingService
                        routing = RoutingService(db)
                        decision = await routing.route_email(
                            workspace_id=input.workspace_id,
                            recipient_email=enrollment.email,
                            pool_id=config.get("sending_pool_id"),
                        )
                        if decision:
                            from_email = decision.from_email
                            logger.info(
                                f"Inbox rotation: selected {from_email} "
                                f"(domain={decision.domain}) for {enrollment.email}"
                            )
                    except Exception as e:
                        logger.warning(f"Inbox rotation fallback: {e}")

                email_svc = EmailCampaignService(db)
                result = await email_svc.send_workflow_email(
                    workspace_id=input.workspace_id,
                    to_email=enrollment.email,
                    subject=config.get("subject", ""),
                    html_body=config.get("html_body", ""),
                    from_name=from_name,
                    from_email=from_email,
                    record_id=enrollment.record_id,
                    track_opens=config.get("track_opens", True),
                    track_clicks=config.get("track_clicks", True),
                    sending_pool_id=config.get("sending_pool_id"),
                )
                provider_message_id = result.get("message_id")
                if result.get("status") != "sent":
                    status = StepExecutionStatus.FAILED.value
                    error_message = result.get("error", "Email send failed")

            elif input.channel == "linkedin":
                provider = await ProviderRegistry.get_provider(
                    db, input.workspace_id, "linkedin_automation",
                )
                if not provider:
                    status = StepExecutionStatus.FAILED.value
                    error_message = "No linkedin_automation provider configured"
                else:
                    config = input.config
                    if input.action == "linkedin_connect":
                        result = await provider.send_connection_request(
                            linkedin_url=config.get("profile_url", ""),
                            message=config.get("message", ""),
                        )
                    elif input.action == "linkedin_message":
                        result = await provider.send_message(
                            linkedin_url=config.get("profile_url", ""),
                            message=config.get("message", ""),
                        )
                    elif input.action == "linkedin_view":
                        result = await provider.view_profile(
                            linkedin_url=config.get("profile_url", ""),
                        )
                    else:
                        status = StepExecutionStatus.FAILED.value
                        error_message = f"Unknown LinkedIn action: {input.action}"
                        result = {}

                    if result and not result.success:
                        status = StepExecutionStatus.FAILED.value
                        error_message = result.error or "LinkedIn action failed"

            elif input.channel == "sms" and input.action == "send_sms":
                provider = await ProviderRegistry.get_provider(
                    db, input.workspace_id, "sms",
                )
                if not provider:
                    status = StepExecutionStatus.FAILED.value
                    error_message = "No sms provider configured"
                else:
                    config = input.config
                    result = await provider.send_sms(
                        to_number=config.get("phone_number", ""),
                        body=config.get("message", ""),
                    )
                    provider_message_id = result.message_id
                    if not result.success:
                        status = StepExecutionStatus.FAILED.value
                        error_message = result.error or "SMS send failed"

            else:
                status = StepExecutionStatus.FAILED.value
                error_message = f"Unknown channel/action: {input.channel}/{input.action}"

        except Exception as e:
            status = StepExecutionStatus.FAILED.value
            error_message = str(e)
            logger.exception(
                f"Error executing outreach step {input.step_index} "
                f"for enrollment {input.enrollment_id}"
            )

        # 4. Create step execution record
        # Extract variant_index and thread_id from config (passed by workflow)
        variant_index = input.config.get("variant_index")
        thread_id = input.config.get("thread_id")

        execution = OutreachStepExecution(
            id=str(uuid4()),
            enrollment_id=input.enrollment_id,
            workspace_id=input.workspace_id,
            step_index=input.step_index,
            channel=input.channel,
            action=input.action,
            status=status,
            provider_message_id=provider_message_id,
            error_message=error_message,
            variant_index=variant_index,
            thread_id=thread_id or provider_message_id,
            sent_at=sent_at if status != StepExecutionStatus.FAILED.value else None,
        )
        db.add(execution)

        # 5. Update enrollment step index
        enrollment.current_step_index = input.step_index + 1
        await db.commit()

    return {
        "success": status == StepExecutionStatus.SENT.value,
        "execution_id": execution.id,
        "status": status,
        "provider_message_id": provider_message_id,
        "thread_id": thread_id or provider_message_id,
        "error": error_message,
    }


@activity.defn
async def finalize_enrollment(input: FinalizeEnrollmentInput) -> dict:
    """Mark an enrollment as completed or exited and update sequence stats.

    Updates:
    - enrollment.status and completed_at
    - sequence denormalized counters
    """
    from sqlalchemy import select, update

    from aexy.models.gtm_outreach import (
        OutreachEnrollment,
        OutreachSequence,
        EnrollmentStatus,
    )

    async with async_session_maker() as db:
        enrollment = (await db.execute(
            select(OutreachEnrollment).where(OutreachEnrollment.id == input.enrollment_id)
        )).scalar_one_or_none()

        if not enrollment:
            return {"success": False, "reason": "Enrollment not found"}

        now = datetime.now(timezone.utc)

        # Map exit_reason to enrollment status
        status_map = {
            "completed": EnrollmentStatus.COMPLETED.value,
            "replied": EnrollmentStatus.REPLIED.value,
            "bounced": EnrollmentStatus.BOUNCED.value,
            "unsubscribed": EnrollmentStatus.UNSUBSCRIBED.value,
            "exited": EnrollmentStatus.EXITED.value,
            "failed": EnrollmentStatus.FAILED.value,
        }
        new_status = status_map.get(input.exit_reason, EnrollmentStatus.COMPLETED.value)

        enrollment.status = new_status
        enrollment.exit_reason = input.exit_reason
        enrollment.completed_at = now

        # Update sequence stats
        sequence = (await db.execute(
            select(OutreachSequence).where(OutreachSequence.id == enrollment.sequence_id)
        )).scalar_one_or_none()

        if sequence:
            # Decrement active, increment the appropriate counter
            sequence.active_count = max(0, sequence.active_count - 1)
            if input.exit_reason == "completed":
                sequence.completed_count += 1
            elif input.exit_reason == "replied":
                sequence.replied_count += 1
            elif input.exit_reason == "bounced":
                sequence.bounced_count += 1

        await db.commit()

    logger.info(
        f"Finalized enrollment {input.enrollment_id} with reason: {input.exit_reason}"
    )
    return {
        "success": True,
        "enrollment_id": input.enrollment_id,
        "status": new_status,
        "exit_reason": input.exit_reason,
    }
