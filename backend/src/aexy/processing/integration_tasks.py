"""Celery tasks for integration actions (SMS, Slack, Webhooks)."""

import logging
from typing import Any

from celery import shared_task

from aexy.processing.tasks import run_async

logger = logging.getLogger(__name__)


# =============================================================================
# SMS TASKS
# =============================================================================


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_sms(
    self,
    workspace_id: str,
    to: str,
    body: str,
    record_id: str | None = None,
) -> dict[str, Any]:
    """Send an SMS message via Twilio.

    Args:
        workspace_id: Workspace ID for logging.
        to: Recipient phone number in E.164 format.
        body: Message content.
        record_id: Optional CRM record ID to log the activity.

    Returns:
        Result dict with message SID and status.
    """
    logger.info(f"Sending SMS to {to}")

    try:
        result = run_async(_send_sms(workspace_id, to, body, record_id))
        return result
    except Exception as exc:
        logger.error(f"SMS send failed: {exc}")
        raise self.retry(exc=exc)


async def _send_sms(
    workspace_id: str,
    to: str,
    body: str,
    record_id: str | None = None,
) -> dict[str, Any]:
    """Async implementation of SMS sending."""
    from aexy.core.database import async_session_maker
    from aexy.services.twilio_service import TwilioService

    async with async_session_maker() as db:
        service = TwilioService(db)
        result = await service.send_sms(
            to=to,
            body=body,
            record_id=record_id,
            workspace_id=workspace_id,
        )
        await db.commit()
        return result


# =============================================================================
# SLACK TASKS
# =============================================================================


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_slack_message(
    self,
    workspace_id: str,
    channel: str,
    message: str,
    blocks: list[dict] | None = None,
    thread_ts: str | None = None,
) -> dict[str, Any]:
    """Send a Slack message.

    Args:
        workspace_id: Workspace ID to get Slack token.
        channel: Channel ID or name.
        message: Message text.
        blocks: Optional Slack Block Kit blocks.
        thread_ts: Optional thread timestamp for replies.

    Returns:
        Result dict with message info.
    """
    logger.info(f"Sending Slack message to {channel}")

    try:
        result = run_async(_send_slack_message(
            workspace_id, channel, message, blocks, thread_ts
        ))
        return result
    except Exception as exc:
        logger.error(f"Slack message failed: {exc}")
        raise self.retry(exc=exc)


async def _send_slack_message(
    workspace_id: str,
    channel: str,
    message: str,
    blocks: list[dict] | None = None,
    thread_ts: str | None = None,
) -> dict[str, Any]:
    """Async implementation of Slack message sending."""
    from aexy.core.database import async_session_maker
    from aexy.services.twilio_service import SlackIntegrationService

    async with async_session_maker() as db:
        service = SlackIntegrationService(db)
        result = await service.send_channel_message(
            workspace_id=workspace_id,
            channel=channel,
            message=message,
            blocks=blocks,
            thread_ts=thread_ts,
        )
        return result


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_slack_dm(
    self,
    workspace_id: str,
    user_id: str,
    message: str,
    blocks: list[dict] | None = None,
) -> dict[str, Any]:
    """Send a Slack direct message.

    Args:
        workspace_id: Workspace ID to get Slack token.
        user_id: Slack user ID.
        message: Message text.
        blocks: Optional Slack Block Kit blocks.

    Returns:
        Result dict with message info.
    """
    logger.info(f"Sending Slack DM to {user_id}")

    try:
        result = run_async(_send_slack_dm(workspace_id, user_id, message, blocks))
        return result
    except Exception as exc:
        logger.error(f"Slack DM failed: {exc}")
        raise self.retry(exc=exc)


async def _send_slack_dm(
    workspace_id: str,
    user_id: str,
    message: str,
    blocks: list[dict] | None = None,
) -> dict[str, Any]:
    """Async implementation of Slack DM sending."""
    from aexy.core.database import async_session_maker
    from aexy.services.twilio_service import SlackIntegrationService

    async with async_session_maker() as db:
        service = SlackIntegrationService(db)
        result = await service.send_dm(
            workspace_id=workspace_id,
            user_id=user_id,
            message=message,
            blocks=blocks,
        )
        return result


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_slack_record_notification(
    self,
    workspace_id: str,
    channel: str,
    title: str,
    record_name: str,
    record_type: str,
    fields: dict[str, Any],
    action_url: str | None = None,
) -> dict[str, Any]:
    """Send a CRM record notification to Slack.

    Args:
        workspace_id: Workspace ID to get Slack token.
        channel: Channel ID or name.
        title: Notification title.
        record_name: Name of the CRM record.
        record_type: Type of record (contact, company, deal, etc.).
        fields: Key-value pairs to display.
        action_url: Optional URL for "View Record" button.

    Returns:
        Result dict with message info.
    """
    logger.info(f"Sending Slack record notification to {channel}")

    try:
        result = run_async(_send_slack_record_notification(
            workspace_id, channel, title, record_name, record_type, fields, action_url
        ))
        return result
    except Exception as exc:
        logger.error(f"Slack notification failed: {exc}")
        raise self.retry(exc=exc)


async def _send_slack_record_notification(
    workspace_id: str,
    channel: str,
    title: str,
    record_name: str,
    record_type: str,
    fields: dict[str, Any],
    action_url: str | None = None,
) -> dict[str, Any]:
    """Async implementation of Slack record notification."""
    from aexy.core.database import async_session_maker
    from aexy.services.twilio_service import SlackIntegrationService

    async with async_session_maker() as db:
        service = SlackIntegrationService(db)
        blocks = service.build_record_notification_blocks(
            title=title,
            record_name=record_name,
            record_type=record_type,
            fields=fields,
            action_url=action_url,
        )
        result = await service.send_channel_message(
            workspace_id=workspace_id,
            channel=channel,
            message=f"{title}: {record_name}",
            blocks=blocks,
        )
        return result


# =============================================================================
# WEBHOOK TASKS
# =============================================================================


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def deliver_webhook(
    self,
    webhook_id: str,
    payload: dict[str, Any],
    delivery_id: str | None = None,
) -> dict[str, Any]:
    """Deliver a webhook payload with retry.

    Args:
        webhook_id: Webhook configuration ID.
        payload: Payload to deliver.
        delivery_id: Optional existing delivery ID for retries.

    Returns:
        Delivery result with status and response info.
    """
    logger.info(f"Delivering webhook {webhook_id}")

    # Exponential backoff: 1min, 5min, 15min, 30min, 60min
    retry_delays = [60, 300, 900, 1800, 3600]
    current_retry = self.request.retries
    if current_retry < len(retry_delays):
        self.retry_delay = retry_delays[current_retry]

    try:
        result = run_async(_deliver_webhook(webhook_id, payload, delivery_id))
        return result
    except Exception as exc:
        logger.error(f"Webhook delivery failed: {exc}")
        raise self.retry(exc=exc)


async def _deliver_webhook(
    webhook_id: str,
    payload: dict[str, Any],
    delivery_id: str | None = None,
) -> dict[str, Any]:
    """Async implementation of webhook delivery."""
    import hashlib
    import hmac
    import json
    from datetime import datetime, timezone
    from uuid import uuid4

    import httpx

    from aexy.core.database import async_session_maker
    from aexy.models.crm import CRMWebhook, CRMWebhookDelivery

    async with async_session_maker() as db:
        # Get webhook config
        from sqlalchemy import select
        stmt = select(CRMWebhook).where(CRMWebhook.id == webhook_id)
        result = await db.execute(stmt)
        webhook = result.scalar_one_or_none()

        if not webhook:
            return {"error": "Webhook not found", "webhook_id": webhook_id}

        if not webhook.is_active:
            return {"error": "Webhook is not active", "webhook_id": webhook_id}

        # Prepare delivery record
        if delivery_id:
            stmt = select(CRMWebhookDelivery).where(CRMWebhookDelivery.id == delivery_id)
            result = await db.execute(stmt)
            delivery = result.scalar_one_or_none()
            if delivery:
                delivery.attempt_count += 1
        else:
            delivery = CRMWebhookDelivery(
                id=str(uuid4()),
                webhook_id=webhook_id,
                event_type=payload.get("event_type", "unknown"),
                request_payload=payload,
                attempt_count=1,
            )
            db.add(delivery)
            await db.flush()

        # Prepare request
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Aexy-Webhook/1.0",
            "X-Webhook-ID": webhook_id,
            "X-Delivery-ID": str(delivery.id),
        }

        # Add HMAC signature if secret is set
        if webhook.secret:
            body = json.dumps(payload, separators=(",", ":"))
            signature = hmac.new(
                webhook.secret.encode(),
                body.encode(),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={signature}"

        # Add custom headers
        if webhook.headers:
            headers.update(webhook.headers)

        # Send request
        started_at = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    webhook.url,
                    json=payload,
                    headers=headers,
                )

            completed_at = datetime.now(timezone.utc)
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            # Update delivery record
            delivery.response_status_code = response.status_code
            delivery.response_body = response.text[:10000]  # Truncate if too long
            delivery.response_headers = dict(response.headers)
            delivery.delivered_at = completed_at
            delivery.duration_ms = duration_ms

            # Check success (2xx status codes)
            if 200 <= response.status_code < 300:
                delivery.status = "delivered"
                webhook.last_success_at = completed_at
            else:
                delivery.status = "failed"
                delivery.error_message = f"HTTP {response.status_code}"
                webhook.last_failure_at = completed_at
                webhook.consecutive_failures = (webhook.consecutive_failures or 0) + 1

            await db.commit()

            return {
                "delivery_id": str(delivery.id),
                "status": delivery.status,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }

        except httpx.RequestError as e:
            completed_at = datetime.now(timezone.utc)
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            delivery.status = "failed"
            delivery.error_message = str(e)
            delivery.delivered_at = completed_at
            delivery.duration_ms = duration_ms

            webhook.last_failure_at = completed_at
            webhook.consecutive_failures = (webhook.consecutive_failures or 0) + 1

            await db.commit()

            # Raise to trigger retry
            raise Exception(f"Webhook delivery failed: {e}")


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def retry_webhook_delivery(
    self,
    delivery_id: str,
) -> dict[str, Any]:
    """Retry a failed webhook delivery.

    Args:
        delivery_id: Delivery ID to retry.

    Returns:
        Retry result.
    """
    logger.info(f"Retrying webhook delivery {delivery_id}")

    try:
        result = run_async(_retry_webhook_delivery(delivery_id))
        return result
    except Exception as exc:
        logger.error(f"Webhook retry failed: {exc}")
        raise self.retry(exc=exc)


async def _retry_webhook_delivery(delivery_id: str) -> dict[str, Any]:
    """Async implementation of webhook retry."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.crm import CRMWebhookDelivery

    async with async_session_maker() as db:
        stmt = select(CRMWebhookDelivery).where(CRMWebhookDelivery.id == delivery_id)
        result = await db.execute(stmt)
        delivery = result.scalar_one_or_none()

        if not delivery:
            return {"error": "Delivery not found", "delivery_id": delivery_id}

        # Re-deliver with the original payload
        return await _deliver_webhook(
            webhook_id=delivery.webhook_id,
            payload=delivery.request_payload,
            delivery_id=delivery_id,
        )


# =============================================================================
# AI AGENT TASKS
# =============================================================================


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def execute_agent_task(
    self,
    agent_id: str,
    record_id: str | None = None,
    context: dict | None = None,
    user_id: str | None = None,
    triggered_by: str = "automation",
    trigger_id: str | None = None,
) -> dict[str, Any]:
    """Execute an AI agent asynchronously.

    Args:
        agent_id: Agent ID to execute.
        record_id: Optional CRM record ID.
        context: Optional execution context.
        user_id: User triggering the execution.
        triggered_by: What triggered this execution.
        trigger_id: ID of the trigger (automation/workflow).

    Returns:
        Execution result.
    """
    logger.info(f"Executing agent {agent_id}")

    try:
        result = run_async(_execute_agent(
            agent_id, record_id, context, user_id, triggered_by, trigger_id
        ))
        return result
    except Exception as exc:
        logger.error(f"Agent execution failed: {exc}")
        raise self.retry(exc=exc)


async def _execute_agent(
    agent_id: str,
    record_id: str | None = None,
    context: dict | None = None,
    user_id: str | None = None,
    triggered_by: str = "automation",
    trigger_id: str | None = None,
) -> dict[str, Any]:
    """Async implementation of agent execution."""
    from aexy.core.database import async_session_maker
    from aexy.services.agent_service import AgentService

    async with async_session_maker() as db:
        service = AgentService(db)
        execution = await service.execute_agent(
            agent_id=agent_id,
            record_id=record_id,
            context=context or {},
            user_id=user_id,
            triggered_by=triggered_by,
            trigger_id=trigger_id,
        )
        await db.commit()

        return {
            "execution_id": str(execution.id),
            "status": execution.status,
            "output": execution.output_result,
            "error": execution.error_message,
            "duration_ms": execution.duration_ms,
        }


# =============================================================================
# EMAIL TASKS
# =============================================================================


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_crm_email(
    self,
    workspace_id: str,
    user_id: str,
    to_email: str,
    subject: str,
    body: str,
    record_id: str | None = None,
    thread_id: str | None = None,
) -> dict[str, Any]:
    """Send an email via the user's connected Gmail.

    Args:
        workspace_id: Workspace ID.
        user_id: User ID for Gmail connection.
        to_email: Recipient email.
        subject: Email subject.
        body: Email body (HTML supported).
        record_id: Optional CRM record to log activity.
        thread_id: Optional Gmail thread ID for replies.

    Returns:
        Send result with message ID.
    """
    logger.info(f"Sending CRM email to {to_email}")

    try:
        result = run_async(_send_crm_email(
            workspace_id, user_id, to_email, subject, body, record_id, thread_id
        ))
        return result
    except Exception as exc:
        logger.error(f"Email send failed: {exc}")
        raise self.retry(exc=exc)


async def _send_crm_email(
    workspace_id: str,
    user_id: str,
    to_email: str,
    subject: str,
    body: str,
    record_id: str | None = None,
    thread_id: str | None = None,
) -> dict[str, Any]:
    """Async implementation of CRM email sending."""
    from aexy.core.database import async_session_maker
    from aexy.services.gmail_service import GmailService

    async with async_session_maker() as db:
        service = GmailService(db)
        result = await service.send_email(
            developer_id=user_id,
            to_email=to_email,
            subject=subject,
            body=body,
            thread_id=thread_id,
        )

        # Log to CRM activity if record_id provided
        if record_id and result.get("id"):
            from datetime import datetime, timezone
            from uuid import uuid4
            from aexy.models.crm import CRMActivity

            activity = CRMActivity(
                id=str(uuid4()),
                workspace_id=workspace_id,
                record_id=record_id,
                actor_id=user_id,
                activity_type="email.sent",
                description=f"Email sent: {subject}",
                metadata={
                    "to": to_email,
                    "subject": subject,
                    "gmail_message_id": result.get("id"),
                    "thread_id": result.get("threadId"),
                },
                occurred_at=datetime.now(timezone.utc),
            )
            db.add(activity)
            await db.commit()

        return result
