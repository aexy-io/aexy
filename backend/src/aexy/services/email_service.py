"""Email service for sending notifications via AWS SES or SMTP."""

import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiosmtplib
import boto3
from botocore.exceptions import ClientError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.models.notification import EmailNotificationLog, Notification
from aexy.schemas.notification import NOTIFICATION_TEMPLATES, NotificationEventType

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via AWS SES or SMTP."""

    def __init__(self):
        """Initialize the email service."""
        self._ses_client = None

    @property
    def ses_client(self):
        """Lazy-load SES client."""
        if self._ses_client is None and settings.aws_access_key_id and settings.aws_secret_access_key:
            self._ses_client = boto3.client(
                "ses",
                region_name=settings.aws_ses_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )
        return self._ses_client

    @property
    def provider(self) -> str:
        """Get the configured email provider."""
        return settings.email_provider.lower()

    @property
    def is_ses_configured(self) -> bool:
        """Check if SES is properly configured."""
        return bool(
            settings.aws_access_key_id
            and settings.aws_secret_access_key
            and settings.ses_sender_email
        )

    @property
    def is_smtp_configured(self) -> bool:
        """Check if SMTP is properly configured."""
        return bool(
            settings.smtp_host
            and settings.smtp_port
            and (settings.smtp_sender_email or settings.ses_sender_email)
        )

    @property
    def is_configured(self) -> bool:
        """Check if email service is properly configured for the selected provider."""
        logger.info(
            f"Email config check: provider={settings.email_provider}, "
            f"notifications_enabled={settings.email_notifications_enabled}, "
            f"smtp_host={settings.smtp_host}, smtp_port={settings.smtp_port}, "
            f"smtp_sender_email={settings.smtp_sender_email}"
        )
        if not settings.email_notifications_enabled:
            return False

        if self.provider == "smtp":
            return self.is_smtp_configured
        else:  # default to SES
            return self.is_ses_configured

    def _get_sender_email(self) -> str:
        """Get the sender email address based on provider."""
        if self.provider == "smtp" and settings.smtp_sender_email:
            return settings.smtp_sender_email
        return settings.ses_sender_email

    def _get_sender_name(self) -> str:
        """Get the sender display name based on provider."""
        if self.provider == "smtp" and settings.smtp_sender_name:
            return settings.smtp_sender_name
        return settings.ses_sender_name

    def _get_sender_address(self) -> str:
        """Get formatted sender address."""
        sender_name = self._get_sender_name()
        sender_email = self._get_sender_email()
        if sender_name:
            return f"{sender_name} <{sender_email}>"
        return sender_email

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

    async def _send_via_ses(
        self,
        recipient_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
    ) -> dict[str, Any]:
        """Send email via AWS SES."""
        message_body: dict[str, Any] = {
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

        response = self.ses_client.send_email(
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
        return {"message_id": response.get("MessageId"), "provider": "ses"}

    async def _send_via_smtp(
        self,
        recipient_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
    ) -> dict[str, Any]:
        """Send email via SMTP using aiosmtplib."""
        # Create message
        if body_html:
            message = MIMEMultipart("alternative")
            message.attach(MIMEText(body_text, "plain", "utf-8"))
            message.attach(MIMEText(body_html, "html", "utf-8"))
        else:
            message = MIMEMultipart()
            message.attach(MIMEText(body_text, "plain", "utf-8"))

        message["Subject"] = subject
        message["From"] = self._get_sender_address()
        message["To"] = recipient_email

        # Determine connection parameters
        use_tls = settings.smtp_use_ssl  # SSL/TLS on connect (port 465)
        start_tls = settings.smtp_use_tls and not settings.smtp_use_ssl  # STARTTLS (port 587)

        # Send via SMTP
        smtp_kwargs: dict[str, Any] = {
            "hostname": settings.smtp_host,
            "port": settings.smtp_port,
            "use_tls": use_tls,
            "start_tls": start_tls,
        }

        # Add authentication if configured
        if settings.smtp_username and settings.smtp_password:
            smtp_kwargs["username"] = settings.smtp_username
            smtp_kwargs["password"] = settings.smtp_password

        response = await aiosmtplib.send(
            message,
            **smtp_kwargs,
        )

        # aiosmtplib.send returns a tuple of (response_dict, message_str)
        # Extract message ID from response if available
        message_id = None
        if isinstance(response, tuple) and len(response) > 0:
            # Try to extract message-id from response
            response_str = str(response)
            if "id=" in response_str.lower():
                message_id = response_str

        return {"message_id": message_id or "smtp-sent", "provider": "smtp"}

    async def _send_email(
        self,
        recipient_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
    ) -> dict[str, Any]:
        """Send email using the configured provider."""
        logger.info(f"_send_email called with provider={self.provider}, smtp_configured={self.is_smtp_configured}, ses_configured={self.is_ses_configured}")
        if self.provider == "smtp":
            logger.info(f"Using SMTP to send email to {recipient_email}")
            return await self._send_via_smtp(recipient_email, subject, body_text, body_html)
        else:
            logger.info(f"Using SES to send email to {recipient_email}")
            return await self._send_via_ses(recipient_email, subject, body_text, body_html)

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
            log.error_message = f"Email service not configured (provider: {self.provider})"
            await db.commit()
            logger.warning(f"Email service not configured for provider '{self.provider}', skipping notification email")
            return log

        try:
            # Get email content
            event_type = NotificationEventType(notification.event_type)
            context = notification.context or {}
            subject, body_text, html_body = self._get_email_content(event_type, context)
            log.subject = subject

            # Send email via configured provider
            result = await self._send_email(recipient_email, subject, body_text, html_body)

            # Update log with success
            log.ses_message_id = result.get("message_id")
            log.status = "sent"
            log.sent_at = datetime.utcnow()

            # Update notification
            notification.email_sent = True
            notification.email_sent_at = datetime.utcnow()

            logger.info(
                f"Email sent successfully via {result.get('provider')} to {recipient_email}, "
                f"MessageId: {log.ses_message_id}"
            )

        except ClientError as e:
            # AWS SES specific error
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            log.status = "failed"
            log.error_message = f"{error_code}: {error_message}"
            logger.error(f"Failed to send email via SES to {recipient_email}: {error_message}")

        except aiosmtplib.SMTPException as e:
            # SMTP specific error
            log.status = "failed"
            log.error_message = f"SMTP Error: {str(e)}"
            logger.error(f"Failed to send email via SMTP to {recipient_email}: {e}")

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
            log.error_message = f"Email service not configured (provider: {self.provider})"
            await db.commit()
            return log

        try:
            result = await self._send_email(recipient_email, subject, body_text, body_html)

            log.ses_message_id = result.get("message_id")
            log.status = "sent"
            log.sent_at = datetime.utcnow()

            logger.info(f"Templated email sent via {result.get('provider')} to {recipient_email}")

        except ClientError as e:
            error_message = e.response.get("Error", {}).get("Message", str(e))
            log.status = "failed"
            log.error_message = error_message
            logger.error(f"Failed to send templated email via {self.provider}: {error_message}")

        except aiosmtplib.SMTPException as e:
            log.status = "failed"
            log.error_message = f"SMTP Error: {str(e)}"
            logger.error(f"Failed to send templated email via SMTP: {e}")

        except Exception as e:
            log.status = "failed"
            log.error_message = str(e)
            logger.error(f"Unexpected error sending templated email: {e}")

        await db.commit()
        return log

    async def verify_email_identity(self, email: str) -> bool:
        """Verify an email identity with SES (for sender verification). Only works with SES."""
        if self.provider != "ses" or not self.ses_client:
            logger.warning("Email identity verification is only supported with AWS SES")
            return False

        try:
            self.ses_client.verify_email_identity(EmailAddress=email)
            logger.info(f"Verification email sent to {email}")
            return True
        except ClientError as e:
            logger.error(f"Failed to verify email identity: {e}")
            return False

    async def get_send_quota(self) -> dict[str, Any] | None:
        """Get SES sending quota information. Only works with SES."""
        if self.provider != "ses" or not self.ses_client:
            return {"provider": self.provider, "message": "Quota info only available for SES"}

        try:
            response = self.ses_client.get_send_quota()
            return {
                "provider": "ses",
                "max_24_hour_send": response.get("Max24HourSend"),
                "max_send_rate": response.get("MaxSendRate"),
                "sent_last_24_hours": response.get("SentLast24Hours"),
            }
        except ClientError as e:
            logger.error(f"Failed to get SES quota: {e}")
            return None

    async def test_smtp_connection(self) -> dict[str, Any]:
        """Test SMTP connection without sending an email."""
        if not self.is_smtp_configured:
            return {"success": False, "error": "SMTP not configured"}

        try:
            use_tls = settings.smtp_use_ssl
            start_tls = settings.smtp_use_tls and not settings.smtp_use_ssl

            async with aiosmtplib.SMTP(
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                use_tls=use_tls,
                start_tls=start_tls,
            ) as smtp:
                if settings.smtp_username and settings.smtp_password:
                    await smtp.login(settings.smtp_username, settings.smtp_password)

            return {"success": True, "message": "SMTP connection successful"}

        except aiosmtplib.SMTPException as e:
            return {"success": False, "error": f"SMTP Error: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def send_template_email(
        self,
        to_email: str,
        template_name: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Send an email using a booking template.

        This is a simplified method for booking notifications that doesn't require
        a database session. Templates are rendered inline based on template_name.
        """
        if not self.is_configured:
            logger.warning(f"Email service not configured, skipping email to {to_email}")
            return {"success": False, "error": "Email service not configured"}

        # Build email content based on template name
        subject, body_text, body_html = self._get_booking_email_content(template_name, context)

        try:
            result = await self._send_email(to_email, subject, body_text, body_html)
            logger.info(f"Booking email '{template_name}' sent to {to_email}")
            return {"success": True, **result}
        except Exception as e:
            logger.error(f"Failed to send booking email '{template_name}' to {to_email}: {e}")
            return {"success": False, "error": str(e)}

    def _get_booking_email_content(
        self,
        template_name: str,
        context: dict[str, Any],
    ) -> tuple[str, str, str]:
        """Get email content for booking templates."""
        from datetime import datetime
        from zoneinfo import ZoneInfo

        # Parse start time for formatting
        start_time_str = context.get("start_time", "")
        end_time_str = context.get("end_time", "")
        timezone = context.get("timezone", "UTC")

        try:
            start_dt = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
            # Convert to local timezone
            try:
                tz = ZoneInfo(timezone)
                start_local = start_dt.astimezone(tz)
                end_local = end_dt.astimezone(tz)
            except Exception:
                start_local = start_dt
                end_local = end_dt

            date_str = start_local.strftime("%A, %B %d, %Y")
            time_str = f"{start_local.strftime('%I:%M %p')} - {end_local.strftime('%I:%M %p')}"
        except Exception:
            date_str = start_time_str
            time_str = ""

        event_name = context.get("event_name", "Meeting")
        invitee_name = context.get("invitee_name", "Guest")
        host_name = context.get("host_name", "Host")
        duration = context.get("duration_minutes", 30)
        location = context.get("location") or context.get("meeting_link") or "To be determined"
        confirmation_message = context.get("confirmation_message", "")

        # Template content based on template_name
        templates = {
            "booking_confirmation_invitee": {
                "subject": f"Confirmed: {event_name} with {host_name}",
                "body": f"""Hi {invitee_name},

Your booking has been confirmed!

Event: {event_name}
Date: {date_str}
Time: {time_str} ({timezone})
Duration: {duration} minutes
Location: {location}

{f"Note from host: {confirmation_message}" if confirmation_message else ""}

If you need to make changes, you can cancel or reschedule from your confirmation page.

See you soon!""",
            },
            "booking_confirmation_host": {
                "subject": f"New Booking: {event_name} with {invitee_name}",
                "body": f"""Hi {host_name},

You have a new booking!

Event: {event_name}
Guest: {invitee_name}
Date: {date_str}
Time: {time_str} ({timezone})
Duration: {duration} minutes
Location: {location}

The guest has been sent a confirmation email with the booking details.""",
            },
            "booking_reminder_invitee": {
                "subject": f"Reminder: {event_name} with {host_name} tomorrow",
                "body": f"""Hi {invitee_name},

This is a reminder about your upcoming booking.

Event: {event_name}
Date: {date_str}
Time: {time_str} ({timezone})
Duration: {duration} minutes
Location: {location}

See you soon!""",
            },
            "booking_reminder_host": {
                "subject": f"Reminder: {event_name} with {invitee_name} tomorrow",
                "body": f"""Hi {host_name},

This is a reminder about your upcoming booking.

Event: {event_name}
Guest: {invitee_name}
Date: {date_str}
Time: {time_str} ({timezone})
Duration: {duration} minutes
Location: {location}""",
            },
            "booking_cancelled_invitee": {
                "subject": f"Cancelled: {event_name} with {host_name}",
                "body": f"""Hi {invitee_name},

Unfortunately, your booking has been cancelled.

Event: {event_name}
Date: {date_str}
Time: {time_str} ({timezone})

{f"Reason: {context.get('cancellation_reason', '')}" if context.get('cancellation_reason') else ""}

We apologize for any inconvenience. Please feel free to book another time.""",
            },
            "booking_cancelled_host": {
                "subject": f"Booking Cancelled: {event_name} with {invitee_name}",
                "body": f"""Hi {host_name},

A booking has been cancelled by the guest.

Event: {event_name}
Guest: {invitee_name}
Date: {date_str}
Time: {time_str} ({timezone})

{f"Reason: {context.get('cancellation_reason', '')}" if context.get('cancellation_reason') else ""}""",
            },
            "booking_rescheduled_invitee": {
                "subject": f"Rescheduled: {event_name} with {host_name}",
                "body": f"""Hi {invitee_name},

Your booking has been rescheduled.

Event: {event_name}
New Date: {date_str}
New Time: {time_str} ({timezone})
Duration: {duration} minutes
Location: {location}

See you at the new time!""",
            },
            "booking_rescheduled_host": {
                "subject": f"Booking Rescheduled: {event_name} with {invitee_name}",
                "body": f"""Hi {host_name},

A booking has been rescheduled.

Event: {event_name}
Guest: {invitee_name}
New Date: {date_str}
New Time: {time_str} ({timezone})
Duration: {duration} minutes
Location: {location}""",
            },
        }

        template = templates.get(template_name, {
            "subject": f"Booking Update: {event_name}",
            "body": f"You have an update regarding your booking for {event_name}.",
        })

        subject = template["subject"]
        body_text = template["body"]
        body_html = self._create_html_email(
            title=subject,
            body=body_text.replace("\n", "<br>"),
        )

        return subject, body_text, body_html


# Singleton instance
email_service = EmailService()
