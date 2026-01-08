"""Email service for sending notifications via AWS SES."""

import logging
from datetime import datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.models.notification import EmailNotificationLog, Notification
from aexy.schemas.notification import NOTIFICATION_TEMPLATES, NotificationEventType

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via AWS SES."""

    def __init__(self):
        """Initialize the email service with AWS SES client."""
        self._client = None

    @property
    def client(self):
        """Lazy-load SES client."""
        if self._client is None and settings.aws_access_key_id and settings.aws_secret_access_key:
            self._client = boto3.client(
                "ses",
                region_name=settings.aws_ses_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )
        return self._client

    @property
    def is_configured(self) -> bool:
        """Check if email service is properly configured."""
        return bool(
            settings.email_notifications_enabled
            and settings.aws_access_key_id
            and settings.aws_secret_access_key
            and settings.ses_sender_email
        )

    def _get_sender_address(self) -> str:
        """Get formatted sender address."""
        if settings.ses_sender_name:
            return f"{settings.ses_sender_name} <{settings.ses_sender_email}>"
        return settings.ses_sender_email

    def _render_template(
        self,
        template: str,
        context: dict[str, Any],
    ) -> str:
        """Render a template string with context variables."""
        try:
            return template.format(**context)
        except KeyError as e:
            logger.warning(f"Missing template variable: {e}")
            return template

    def _get_email_content(
        self,
        event_type: NotificationEventType,
        context: dict[str, Any],
    ) -> tuple[str, str, str]:
        """Get email subject, text body, and HTML body for an event type."""
        template = NOTIFICATION_TEMPLATES.get(event_type, {})

        # Get subject
        subject_template = template.get("email_subject", "Aexy Notification")
        subject = self._render_template(subject_template, context)

        # Get body
        body_template = template.get("body_template", "You have a new notification.")
        body_text = self._render_template(body_template, context)

        # Create HTML body
        action_url = context.get("action_url", "")
        if action_url and not action_url.startswith("http"):
            action_url = f"{settings.frontend_url}{action_url}"

        html_body = self._create_html_email(
            title=subject,
            body=body_text,
            action_url=action_url,
            action_text="View Details",
        )

        return subject, body_text, html_body

    def _create_html_email(
        self,
        title: str,
        body: str,
        action_url: str | None = None,
        action_text: str = "View Details",
    ) -> str:
        """Create a simple HTML email template."""
        button_html = ""
        if action_url:
            button_html = f"""
            <div style="text-align: center; margin: 30px 0;">
                <a href="{action_url}"
                   style="background-color: #0891b2; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 6px; font-weight: 500;">
                    {action_text}
                </a>
            </div>
            """

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     background-color: #f3f4f6; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white;
                        border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <!-- Header -->
                <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Aexy</h1>
                </div>

                <!-- Content -->
                <div style="padding: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px;">{title}</h2>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">{body}</p>
                    {button_html}
                </div>

                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 20px; text-align: center;
                            border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this email because you have notifications enabled in Aexy.
                        <br>
                        <a href="{settings.frontend_url}/settings/notifications"
                           style="color: #0891b2;">Manage notification preferences</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

    async def send_notification_email(
        self,
        db: AsyncSession,
        notification: Notification,
        recipient_email: str,
    ) -> EmailNotificationLog:
        """Send an email notification and log the result."""
        # Create log entry
        log = EmailNotificationLog(
            notification_id=notification.id,
            recipient_email=recipient_email,
            subject="",  # Will be set below
            template_name=notification.event_type,
            status="pending",
        )
        db.add(log)

        if not self.is_configured:
            log.status = "failed"
            log.error_message = "Email service not configured"
            await db.commit()
            logger.warning("Email service not configured, skipping notification email")
            return log

        try:
            # Get email content
            event_type = NotificationEventType(notification.event_type)
            context = notification.context or {}
            subject, body_text, html_body = self._get_email_content(event_type, context)
            log.subject = subject

            # Send email via SES
            response = self.client.send_email(
                Source=self._get_sender_address(),
                Destination={
                    "ToAddresses": [recipient_email],
                },
                Message={
                    "Subject": {
                        "Data": subject,
                        "Charset": "UTF-8",
                    },
                    "Body": {
                        "Text": {
                            "Data": body_text,
                            "Charset": "UTF-8",
                        },
                        "Html": {
                            "Data": html_body,
                            "Charset": "UTF-8",
                        },
                    },
                },
            )

            # Update log with success
            log.ses_message_id = response.get("MessageId")
            log.status = "sent"
            log.sent_at = datetime.utcnow()

            # Update notification
            notification.email_sent = True
            notification.email_sent_at = datetime.utcnow()

            logger.info(f"Email sent successfully to {recipient_email}, MessageId: {log.ses_message_id}")

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            log.status = "failed"
            log.error_message = f"{error_code}: {error_message}"
            logger.error(f"Failed to send email to {recipient_email}: {error_message}")

        except Exception as e:
            log.status = "failed"
            log.error_message = str(e)
            logger.error(f"Unexpected error sending email to {recipient_email}: {e}")

        await db.commit()
        return log

    async def send_templated_email(
        self,
        db: AsyncSession,
        recipient_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
        notification_id: str | None = None,
    ) -> EmailNotificationLog:
        """Send a custom templated email."""
        log = EmailNotificationLog(
            notification_id=notification_id,
            recipient_email=recipient_email,
            subject=subject,
            template_name="custom",
            status="pending",
        )
        db.add(log)

        if not self.is_configured:
            log.status = "failed"
            log.error_message = "Email service not configured"
            await db.commit()
            return log

        try:
            message_body = {
                "Text": {
                    "Data": body_text,
                    "Charset": "UTF-8",
                },
            }
            if body_html:
                message_body["Html"] = {
                    "Data": body_html,
                    "Charset": "UTF-8",
                }

            response = self.client.send_email(
                Source=self._get_sender_address(),
                Destination={
                    "ToAddresses": [recipient_email],
                },
                Message={
                    "Subject": {
                        "Data": subject,
                        "Charset": "UTF-8",
                    },
                    "Body": message_body,
                },
            )

            log.ses_message_id = response.get("MessageId")
            log.status = "sent"
            log.sent_at = datetime.utcnow()

        except ClientError as e:
            error_message = e.response.get("Error", {}).get("Message", str(e))
            log.status = "failed"
            log.error_message = error_message
            logger.error(f"Failed to send templated email: {error_message}")

        except Exception as e:
            log.status = "failed"
            log.error_message = str(e)
            logger.error(f"Unexpected error sending templated email: {e}")

        await db.commit()
        return log

    async def verify_email_identity(self, email: str) -> bool:
        """Verify an email identity with SES (for sender verification)."""
        if not self.client:
            return False

        try:
            self.client.verify_email_identity(EmailAddress=email)
            logger.info(f"Verification email sent to {email}")
            return True
        except ClientError as e:
            logger.error(f"Failed to verify email identity: {e}")
            return False

    async def get_send_quota(self) -> dict[str, Any] | None:
        """Get SES sending quota information."""
        if not self.client:
            return None

        try:
            response = self.client.get_send_quota()
            return {
                "max_24_hour_send": response.get("Max24HourSend"),
                "max_send_rate": response.get("MaxSendRate"),
                "sent_last_24_hours": response.get("SentLast24Hours"),
            }
        except ClientError as e:
            logger.error(f"Failed to get SES quota: {e}")
            return None


# Singleton instance
email_service = EmailService()
