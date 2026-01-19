"""Email webhook handlers for provider events (SES, SendGrid, Mailgun, Postmark)."""

import json
import logging
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request, HTTPException, status, BackgroundTasks

from aexy.core.database import get_sync_session
from aexy.models.email_infrastructure import (
    EmailProvider,
    SendingDomain,
    ProviderEventLog,
    EventType,
    EmailProviderType,
)
from aexy.services.provider_service import ProviderService
from aexy.services.warming_service import WarmingService
from aexy.services.reputation_service import ReputationService
from aexy.models.email_marketing import (
    CampaignRecipient,
    RecipientStatus,
)
from sqlalchemy import select, and_

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/email")


# =============================================================================
# AWS SES WEBHOOKS (via SNS)
# =============================================================================

@router.post("/ses")
async def ses_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Handle AWS SES webhooks via SNS.

    SNS sends:
    - SubscriptionConfirmation: Initial subscription setup
    - Notification: Actual email events
    """
    try:
        body = await request.body()
        payload = json.loads(body)

        message_type = request.headers.get("x-amz-sns-message-type")

        if message_type == "SubscriptionConfirmation":
            # Handle SNS subscription confirmation
            subscribe_url = payload.get("SubscribeURL")
            if subscribe_url:
                # Auto-confirm by fetching the URL
                import httpx
                async with httpx.AsyncClient() as client:
                    await client.get(subscribe_url)
                logger.info(f"Confirmed SNS subscription: {payload.get('TopicArn')}")
            return {"status": "subscription_confirmed"}

        elif message_type == "Notification":
            # Parse the actual message
            message = json.loads(payload.get("Message", "{}"))
            event_type = message.get("eventType", message.get("notificationType"))

            if not event_type:
                return {"status": "ignored", "reason": "No event type"}

            # Process in background
            background_tasks.add_task(
                process_ses_event,
                message,
                event_type,
            )

            return {"status": "accepted"}

        return {"status": "ignored"}

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )
    except Exception as e:
        logger.error(f"Error processing SES webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing webhook",
        )


def process_ses_event(message: dict, event_type: str):
    """Process SES event in background."""
    with get_sync_session() as db:
        try:
            mail = message.get("mail", {})
            message_id = mail.get("messageId")
            recipients = mail.get("destination", [])

            # Map SES event types
            event_mapping = {
                "Bounce": EventType.BOUNCE.value,
                "Complaint": EventType.COMPLAINT.value,
                "Delivery": EventType.DELIVERY.value,
                "Send": EventType.SEND.value,
                "Reject": EventType.REJECT.value,
                "Open": EventType.OPEN.value,
                "Click": EventType.CLICK.value,
                "Rendering Failure": EventType.RENDERING_FAILURE.value,
                "DeliveryDelay": EventType.DELIVERY_DELAY.value,
            }

            mapped_type = event_mapping.get(event_type, event_type.lower())

            # Get bounce details if applicable
            bounce_type = None
            bounce_subtype = None
            diagnostic_code = None

            if event_type == "Bounce":
                bounce_data = message.get("bounce", {})
                bounce_type = "hard" if bounce_data.get("bounceType") == "Permanent" else "soft"
                bounce_subtype = bounce_data.get("bounceSubType")
                bounced_recipients = bounce_data.get("bouncedRecipients", [])
                if bounced_recipients:
                    diagnostic_code = bounced_recipients[0].get("diagnosticCode")
                    recipients = [r.get("emailAddress") for r in bounced_recipients]

            elif event_type == "Complaint":
                complaint_data = message.get("complaint", {})
                complained_recipients = complaint_data.get("complainedRecipients", [])
                recipients = [r.get("emailAddress") for r in complained_recipients]

            # Find workspace/domain from message ID
            workspace_id, domain_id = _find_workspace_from_message_id(db, message_id)

            if not workspace_id:
                logger.warning(f"Could not find workspace for SES message: {message_id}")
                return

            # Log event
            for recipient in recipients:
                event = ProviderEventLog(
                    workspace_id=workspace_id,
                    domain_id=domain_id,
                    event_type=mapped_type,
                    message_id=message_id,
                    recipient_email=recipient,
                    bounce_type=bounce_type,
                    bounce_subtype=bounce_subtype,
                    diagnostic_code=diagnostic_code,
                    raw_payload=message,
                    event_timestamp=datetime.fromisoformat(
                        mail.get("timestamp", "").replace("Z", "+00:00")
                    ) if mail.get("timestamp") else datetime.now(timezone.utc),
                )
                db.add(event)

                # Update campaign recipient if exists
                _update_campaign_recipient(db, message_id, recipient, mapped_type, bounce_type)

            db.commit()
            logger.info(f"Processed SES {event_type} for message {message_id}")

        except Exception as e:
            logger.error(f"Error processing SES event: {e}")
            db.rollback()


# =============================================================================
# SENDGRID WEBHOOKS
# =============================================================================

@router.post("/sendgrid")
async def sendgrid_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Handle SendGrid event webhooks."""
    try:
        # Verify signature if configured
        # signature = request.headers.get("X-Twilio-Email-Event-Webhook-Signature")
        # timestamp = request.headers.get("X-Twilio-Email-Event-Webhook-Timestamp")

        body = await request.body()
        events = json.loads(body)

        if not isinstance(events, list):
            events = [events]

        for event in events:
            background_tasks.add_task(process_sendgrid_event, event)

        return {"status": "accepted", "count": len(events)}

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )


def process_sendgrid_event(event: dict):
    """Process SendGrid event in background."""
    with get_sync_session() as db:
        try:
            event_type = event.get("event")
            message_id = event.get("sg_message_id", "").split(".")[0]  # SendGrid adds suffix
            recipient = event.get("email")

            # Map SendGrid event types
            event_mapping = {
                "processed": EventType.SEND.value,
                "delivered": EventType.DELIVERY.value,
                "bounce": EventType.BOUNCE.value,
                "deferred": EventType.DELIVERY_DELAY.value,
                "dropped": EventType.REJECT.value,
                "spamreport": EventType.COMPLAINT.value,
                "unsubscribe": EventType.UNSUBSCRIBE.value,
                "open": EventType.OPEN.value,
                "click": EventType.CLICK.value,
            }

            mapped_type = event_mapping.get(event_type, event_type)

            # Get bounce details
            bounce_type = None
            if event_type == "bounce":
                bounce_classification = event.get("bounce_classification")
                bounce_type = "soft" if bounce_classification in ["Technical", "Content"] else "hard"

            # Find workspace/domain
            workspace_id, domain_id = _find_workspace_from_message_id(db, message_id)

            if not workspace_id:
                logger.warning(f"Could not find workspace for SendGrid message: {message_id}")
                return

            # Log event
            event_log = ProviderEventLog(
                workspace_id=workspace_id,
                domain_id=domain_id,
                event_type=mapped_type,
                message_id=message_id,
                recipient_email=recipient,
                bounce_type=bounce_type,
                diagnostic_code=event.get("reason"),
                raw_payload=event,
                event_timestamp=datetime.fromtimestamp(
                    event.get("timestamp", 0),
                    tz=timezone.utc,
                ) if event.get("timestamp") else datetime.now(timezone.utc),
            )
            db.add(event_log)

            # Update campaign recipient
            _update_campaign_recipient(db, message_id, recipient, mapped_type, bounce_type)

            db.commit()
            logger.info(f"Processed SendGrid {event_type} for {recipient}")

        except Exception as e:
            logger.error(f"Error processing SendGrid event: {e}")
            db.rollback()


# =============================================================================
# MAILGUN WEBHOOKS
# =============================================================================

@router.post("/mailgun")
async def mailgun_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Handle Mailgun webhooks."""
    try:
        # Mailgun sends form data, not JSON
        form_data = await request.form()
        event_data = dict(form_data)

        # Parse event-data if present (newer webhook format)
        if "event-data" in event_data:
            event_data = json.loads(event_data["event-data"])

        background_tasks.add_task(process_mailgun_event, event_data)

        return {"status": "accepted"}

    except Exception as e:
        logger.error(f"Error processing Mailgun webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload",
        )


def process_mailgun_event(event: dict):
    """Process Mailgun event in background."""
    with get_sync_session() as db:
        try:
            event_type = event.get("event")
            message_id = event.get("message", {}).get("headers", {}).get("message-id", "")
            if not message_id:
                message_id = event.get("Message-Id", "")
            recipient = event.get("recipient")

            # Map Mailgun event types
            event_mapping = {
                "accepted": EventType.SEND.value,
                "delivered": EventType.DELIVERY.value,
                "failed": EventType.BOUNCE.value,
                "rejected": EventType.REJECT.value,
                "complained": EventType.COMPLAINT.value,
                "unsubscribed": EventType.UNSUBSCRIBE.value,
                "opened": EventType.OPEN.value,
                "clicked": EventType.CLICK.value,
            }

            mapped_type = event_mapping.get(event_type, event_type)

            # Get bounce details
            bounce_type = None
            if event_type == "failed":
                severity = event.get("severity")
                bounce_type = "hard" if severity == "permanent" else "soft"

            # Find workspace/domain
            workspace_id, domain_id = _find_workspace_from_message_id(db, message_id)

            if not workspace_id:
                logger.warning(f"Could not find workspace for Mailgun message: {message_id}")
                return

            # Log event
            event_log = ProviderEventLog(
                workspace_id=workspace_id,
                domain_id=domain_id,
                event_type=mapped_type,
                message_id=message_id,
                recipient_email=recipient,
                bounce_type=bounce_type,
                diagnostic_code=event.get("delivery-status", {}).get("message"),
                raw_payload=event,
                event_timestamp=datetime.fromtimestamp(
                    event.get("timestamp", 0),
                    tz=timezone.utc,
                ) if event.get("timestamp") else datetime.now(timezone.utc),
            )
            db.add(event_log)

            # Update campaign recipient
            _update_campaign_recipient(db, message_id, recipient, mapped_type, bounce_type)

            db.commit()
            logger.info(f"Processed Mailgun {event_type} for {recipient}")

        except Exception as e:
            logger.error(f"Error processing Mailgun event: {e}")
            db.rollback()


# =============================================================================
# POSTMARK WEBHOOKS
# =============================================================================

@router.post("/postmark")
async def postmark_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Handle Postmark webhooks."""
    try:
        body = await request.body()
        event = json.loads(body)

        background_tasks.add_task(process_postmark_event, event)

        return {"status": "accepted"}

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )


def process_postmark_event(event: dict):
    """Process Postmark event in background."""
    with get_sync_session() as db:
        try:
            record_type = event.get("RecordType")
            message_id = event.get("MessageID")
            recipient = event.get("Recipient") or event.get("Email")

            # Map Postmark event types
            event_mapping = {
                "Delivery": EventType.DELIVERY.value,
                "Bounce": EventType.BOUNCE.value,
                "SpamComplaint": EventType.COMPLAINT.value,
                "Open": EventType.OPEN.value,
                "Click": EventType.CLICK.value,
                "SubscriptionChange": EventType.UNSUBSCRIBE.value,
            }

            mapped_type = event_mapping.get(record_type, record_type.lower() if record_type else "unknown")

            # Get bounce details
            bounce_type = None
            if record_type == "Bounce":
                type_code = event.get("TypeCode")
                # Postmark type codes: 1=HardBounce, 2=SoftBounce, etc.
                bounce_type = "hard" if type_code == 1 else "soft"

            # Find workspace/domain
            workspace_id, domain_id = _find_workspace_from_message_id(db, message_id)

            if not workspace_id:
                logger.warning(f"Could not find workspace for Postmark message: {message_id}")
                return

            # Log event
            event_log = ProviderEventLog(
                workspace_id=workspace_id,
                domain_id=domain_id,
                event_type=mapped_type,
                message_id=message_id,
                recipient_email=recipient,
                bounce_type=bounce_type,
                diagnostic_code=event.get("Description"),
                raw_payload=event,
                event_timestamp=datetime.fromisoformat(
                    event.get("DeliveredAt", event.get("BouncedAt", "")).replace("Z", "+00:00")
                ) if event.get("DeliveredAt") or event.get("BouncedAt") else datetime.now(timezone.utc),
            )
            db.add(event_log)

            # Update campaign recipient
            _update_campaign_recipient(db, message_id, recipient, mapped_type, bounce_type)

            db.commit()
            logger.info(f"Processed Postmark {record_type} for {recipient}")

        except Exception as e:
            logger.error(f"Error processing Postmark event: {e}")
            db.rollback()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _find_workspace_from_message_id(db, message_id: str) -> tuple[str | None, str | None]:
    """Find workspace and domain from a message ID."""
    if not message_id:
        return None, None

    # First, try to find from campaign recipients
    result = db.execute(
        select(CampaignRecipient)
        .where(CampaignRecipient.message_id == message_id)
    )
    recipient = result.scalar_one_or_none()

    if recipient:
        # Get workspace from campaign
        from aexy.models.email_marketing import EmailCampaign
        campaign_result = db.execute(
            select(EmailCampaign).where(EmailCampaign.id == recipient.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if campaign:
            return campaign.workspace_id, None  # TODO: Get domain from recipient

    # Fallback: Try to find from provider event logs
    result = db.execute(
        select(ProviderEventLog)
        .where(ProviderEventLog.message_id == message_id)
        .order_by(ProviderEventLog.created_at.desc())
        .limit(1)
    )
    event = result.scalar_one_or_none()

    if event:
        return event.workspace_id, event.domain_id

    return None, None


def _update_campaign_recipient(
    db,
    message_id: str,
    recipient_email: str,
    event_type: str,
    bounce_type: str | None = None,
):
    """Update campaign recipient status based on event."""
    if not message_id:
        return

    result = db.execute(
        select(CampaignRecipient)
        .where(CampaignRecipient.message_id == message_id)
    )
    recipient = result.scalar_one_or_none()

    if not recipient:
        return

    now = datetime.now(timezone.utc)

    if event_type == EventType.DELIVERY.value:
        if recipient.status in [RecipientStatus.PENDING.value, RecipientStatus.SENT.value]:
            recipient.status = RecipientStatus.DELIVERED.value
            recipient.delivered_at = now

    elif event_type == EventType.BOUNCE.value:
        recipient.status = RecipientStatus.BOUNCED.value
        recipient.bounce_type = bounce_type
        recipient.error_message = f"{bounce_type or 'unknown'} bounce"

    elif event_type == EventType.COMPLAINT.value:
        # Mark as unsubscribed on complaint
        recipient.status = RecipientStatus.UNSUBSCRIBED.value
        recipient.error_message = "Spam complaint"

    elif event_type == EventType.OPEN.value:
        if recipient.first_opened_at is None:
            recipient.first_opened_at = now
        recipient.open_count += 1
        if recipient.status in [
            RecipientStatus.SENT.value,
            RecipientStatus.DELIVERED.value,
        ]:
            recipient.status = RecipientStatus.OPENED.value

    elif event_type == EventType.CLICK.value:
        if recipient.first_clicked_at is None:
            recipient.first_clicked_at = now
        recipient.click_count += 1
        if recipient.status in [
            RecipientStatus.SENT.value,
            RecipientStatus.DELIVERED.value,
            RecipientStatus.OPENED.value,
        ]:
            recipient.status = RecipientStatus.CLICKED.value

    elif event_type == EventType.UNSUBSCRIBE.value:
        recipient.status = RecipientStatus.UNSUBSCRIBED.value

    db.commit()
