"""Temporal activities for integration actions (SMS, Slack, Webhooks, Agents).

Replaces: aexy.processing.integration_tasks
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class SendSMSInput:
    workspace_id: str
    to: str
    body: str
    record_id: str | None = None


@dataclass
class SendSlackMessageInput:
    workspace_id: str
    channel: str
    message: str
    blocks: list[dict] | None = None
    thread_ts: str | None = None


@dataclass
class SendSlackDMInput:
    workspace_id: str
    user_id: str
    message: str
    blocks: list[dict] | None = None


@dataclass
class SendSlackWorkflowMessageInput:
    workspace_id: str
    target_type: str
    target: str
    message: str
    record_id: str | None = None


@dataclass
class SendSlackRecordNotificationInput:
    workspace_id: str
    channel: str
    title: str
    record_name: str
    record_type: str
    fields: dict[str, Any] = field(default_factory=dict)
    action_url: str | None = None


@dataclass
class DeliverWebhookInput:
    webhook_id: str
    payload: dict[str, Any] = field(default_factory=dict)
    delivery_id: str | None = None


@dataclass
class RetryWebhookDeliveryInput:
    delivery_id: str


@dataclass
class ExecuteAgentInput:
    agent_id: str
    record_id: str | None = None
    context: dict | None = None
    user_id: str | None = None
    triggered_by: str = "automation"
    trigger_id: str | None = None


@dataclass
class SendCRMEmailInput:
    workspace_id: str
    user_id: str
    to_email: str
    subject: str
    body: str
    record_id: str | None = None
    thread_id: str | None = None


@activity.defn
async def send_sms(input: SendSMSInput) -> dict[str, Any]:
    """Send an SMS message via Twilio."""
    logger.info(f"Sending SMS to {input.to}")

    from aexy.services.twilio_service import TwilioService

    async with async_session_maker() as db:
        service = TwilioService(db)
        result = await service.send_sms(
            to=input.to, body=input.body,
            record_id=input.record_id, workspace_id=input.workspace_id,
        )
        await db.commit()
        return result


@activity.defn
async def send_slack_message(input: SendSlackMessageInput) -> dict[str, Any]:
    """Send a Slack message."""
    logger.info(f"Sending Slack message to {input.channel}")

    from aexy.services.twilio_service import SlackIntegrationService

    async with async_session_maker() as db:
        service = SlackIntegrationService(db)
        result = await service.send_channel_message(
            workspace_id=input.workspace_id, channel=input.channel,
            message=input.message, blocks=input.blocks, thread_ts=input.thread_ts,
        )
        return result


@activity.defn
async def send_slack_dm(input: SendSlackDMInput) -> dict[str, Any]:
    """Send a Slack direct message."""
    logger.info(f"Sending Slack DM to {input.user_id}")

    from aexy.services.twilio_service import SlackIntegrationService

    async with async_session_maker() as db:
        service = SlackIntegrationService(db)
        result = await service.send_dm(
            workspace_id=input.workspace_id, user_id=input.user_id,
            message=input.message, blocks=input.blocks,
        )
        return result


@activity.defn
async def send_slack_workflow_message(input: SendSlackWorkflowMessageInput) -> dict[str, Any]:
    """Send a Slack message from workflow automation."""
    logger.info(f"Sending Slack workflow message: {input.target_type} -> {input.target}")

    from sqlalchemy import select
    from aexy.models.developer import Developer
    from aexy.models.integrations import SlackIntegration
    from aexy.services.slack_integration import SlackIntegrationService
    from aexy.schemas.integrations import SlackMessage, SlackNotificationType

    async with async_session_maker() as db:
        slack_service = SlackIntegrationService()
        integration = await slack_service.get_integration_by_workspace(input.workspace_id, db)

        if not integration:
            return {"success": False, "error": "No Slack integration found"}

        send_to = input.target
        if input.target_type == "dm":
            result = await db.execute(select(Developer).where(Developer.email == input.target))
            developer = result.scalar_one_or_none()
            if not developer:
                return {"success": False, "error": f"No developer found with email: {input.target}"}

            user_mappings = integration.user_mappings or {}
            slack_user_id = None
            for slack_id, dev_id in user_mappings.items():
                if dev_id == developer.id:
                    slack_user_id = slack_id
                    break
            if not slack_user_id:
                return {"success": False, "error": f"No Slack user mapping for: {input.target}"}
            send_to = slack_user_id

        slack_message = SlackMessage(text=input.message)
        response = await slack_service.send_message(
            integration=integration, channel_id=send_to,
            message=slack_message, notification_type=SlackNotificationType.AUTOMATION, db=db,
        )
        return {
            "success": response.success, "target_type": input.target_type,
            "sent_to": send_to, "error": response.error,
        }


@activity.defn
async def send_slack_record_notification(input: SendSlackRecordNotificationInput) -> dict[str, Any]:
    """Send a CRM record notification to Slack."""
    logger.info(f"Sending Slack record notification to {input.channel}")

    from aexy.services.twilio_service import SlackIntegrationService

    async with async_session_maker() as db:
        service = SlackIntegrationService(db)
        blocks = service.build_record_notification_blocks(
            title=input.title, record_name=input.record_name,
            record_type=input.record_type, fields=input.fields, action_url=input.action_url,
        )
        result = await service.send_channel_message(
            workspace_id=input.workspace_id, channel=input.channel,
            message=f"{input.title}: {input.record_name}", blocks=blocks,
        )
        return result


@activity.defn
async def deliver_webhook(input: DeliverWebhookInput) -> dict[str, Any]:
    """Deliver a webhook payload with retry."""
    logger.info(f"Delivering webhook {input.webhook_id}")

    import hashlib
    import hmac
    import json
    from datetime import datetime, timezone
    from uuid import uuid4
    import httpx
    from sqlalchemy import select
    from aexy.models.crm import CRMWebhook, CRMWebhookDelivery

    async with async_session_maker() as db:
        stmt = select(CRMWebhook).where(CRMWebhook.id == input.webhook_id)
        result = await db.execute(stmt)
        webhook = result.scalar_one_or_none()

        if not webhook:
            return {"error": "Webhook not found"}
        if not webhook.is_active:
            return {"error": "Webhook is not active"}

        if input.delivery_id:
            stmt = select(CRMWebhookDelivery).where(CRMWebhookDelivery.id == input.delivery_id)
            result = await db.execute(stmt)
            delivery = result.scalar_one_or_none()
            if delivery:
                delivery.attempt_count += 1
        else:
            delivery = CRMWebhookDelivery(
                id=str(uuid4()), webhook_id=input.webhook_id,
                event_type=input.payload.get("event_type", "unknown"),
                request_payload=input.payload, attempt_count=1,
            )
            db.add(delivery)
            await db.flush()

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Aexy-Webhook/1.0",
            "X-Webhook-ID": input.webhook_id,
            "X-Delivery-ID": str(delivery.id),
        }

        if webhook.secret:
            body = json.dumps(input.payload, separators=(",", ":"))
            signature = hmac.new(webhook.secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={signature}"

        if webhook.headers:
            headers.update(webhook.headers)

        started_at = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(webhook.url, json=input.payload, headers=headers)

            completed_at = datetime.now(timezone.utc)
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            delivery.response_status_code = response.status_code
            delivery.response_body = response.text[:10000]
            delivery.delivered_at = completed_at
            delivery.duration_ms = duration_ms

            if 200 <= response.status_code < 300:
                delivery.status = "delivered"
                webhook.last_success_at = completed_at
            else:
                delivery.status = "failed"
                delivery.error_message = f"HTTP {response.status_code}"
                webhook.consecutive_failures = (webhook.consecutive_failures or 0) + 1

            await db.commit()
            return {"delivery_id": str(delivery.id), "status": delivery.status, "status_code": response.status_code}

        except httpx.RequestError as e:
            delivery.status = "failed"
            delivery.error_message = str(e)
            webhook.consecutive_failures = (webhook.consecutive_failures or 0) + 1
            await db.commit()
            raise Exception(f"Webhook delivery failed: {e}")


@activity.defn
async def retry_webhook_delivery(input: RetryWebhookDeliveryInput) -> dict[str, Any]:
    """Retry a failed webhook delivery."""
    logger.info(f"Retrying webhook delivery {input.delivery_id}")

    from sqlalchemy import select
    from aexy.models.crm import CRMWebhookDelivery

    async with async_session_maker() as db:
        stmt = select(CRMWebhookDelivery).where(CRMWebhookDelivery.id == input.delivery_id)
        result = await db.execute(stmt)
        delivery = result.scalar_one_or_none()

        if not delivery:
            return {"error": "Delivery not found"}

        return await deliver_webhook(DeliverWebhookInput(
            webhook_id=delivery.webhook_id,
            payload=delivery.request_payload,
            delivery_id=input.delivery_id,
        ))


@activity.defn
async def execute_agent(input: ExecuteAgentInput) -> dict[str, Any]:
    """Execute an AI agent asynchronously."""
    logger.info(f"Executing agent {input.agent_id}")

    from aexy.services.agent_service import AgentService

    async with async_session_maker() as db:
        service = AgentService(db)
        execution = await service.execute_agent(
            agent_id=input.agent_id, record_id=input.record_id,
            context=input.context or {}, user_id=input.user_id,
            triggered_by=input.triggered_by, trigger_id=input.trigger_id,
        )
        await db.commit()
        return {
            "execution_id": str(execution.id), "status": execution.status,
            "output": execution.output_result, "error": execution.error_message,
        }


@activity.defn
async def send_crm_email(input: SendCRMEmailInput) -> dict[str, Any]:
    """Send an email via the user's connected Gmail."""
    logger.info(f"Sending CRM email to {input.to_email}")

    from sqlalchemy import select
    from aexy.models.google_integration import GoogleIntegration
    from aexy.services.gmail_sync_service import GmailSyncService

    async with async_session_maker() as db:
        stmt = select(GoogleIntegration).where(
            GoogleIntegration.workspace_id == input.workspace_id,
            GoogleIntegration.is_active == True,
        )
        result = await db.execute(stmt)
        integration = result.scalar_one_or_none()

        if not integration:
            return {"status": "failed", "error": "No active Google integration"}

        service = GmailSyncService(db)
        result = await service.send_email(
            integration=integration, to=input.to_email,
            subject=input.subject, body_html=input.body,
            reply_to_message_id=input.thread_id,
        )

        if input.record_id and result.get("message_id"):
            from datetime import datetime, timezone
            from uuid import uuid4
            from aexy.models.crm import CRMActivity
            activity_record = CRMActivity(
                id=str(uuid4()), workspace_id=input.workspace_id,
                record_id=input.record_id, actor_id=input.user_id,
                activity_type="email.sent", description=f"Email sent: {input.subject}",
                metadata={"to": input.to_email, "subject": input.subject, "gmail_message_id": result.get("message_id")},
                occurred_at=datetime.now(timezone.utc),
            )
            db.add(activity_record)
            await db.commit()

        return result
