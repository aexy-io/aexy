"""Email provider service for multi-provider sending (SES, SendGrid, Mailgun, Postmark, SMTP)."""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from uuid import uuid4

import aiosmtplib
import boto3
import httpx
from botocore.exceptions import ClientError
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.email_infrastructure import (
    EmailProvider,
    SendingDomain,
    SendingIdentity,
    ProviderEventLog,
    EmailProviderType,
    ProviderStatus,
    EventType,
)
from aexy.schemas.email_infrastructure import (
    EmailProviderCreate,
    EmailProviderUpdate,
    EmailProviderResponse,
)

logger = logging.getLogger(__name__)


# =============================================================================
# PROVIDER CLIENT INTERFACE
# =============================================================================

class EmailProviderClient(ABC):
    """Abstract base class for email provider clients."""

    @abstractmethod
    async def send_email(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        """
        Send an email.

        Returns:
            dict with 'message_id' and 'success' keys
        """
        pass

    @abstractmethod
    async def test_connection(self) -> dict:
        """
        Test the provider connection.

        Returns:
            dict with 'success' and 'message' keys
        """
        pass

    @abstractmethod
    async def get_quota(self) -> dict | None:
        """Get sending quota information if available."""
        pass


# =============================================================================
# AWS SES CLIENT
# =============================================================================

class SESClient(EmailProviderClient):
    """AWS SES email client."""

    def __init__(self, credentials: dict):
        self.region = credentials.get("region", "us-east-1")
        self.access_key_id = credentials.get("access_key_id")
        self.secret_access_key = credentials.get("secret_access_key")
        self.configuration_set = credentials.get("configuration_set")
        self._client = None

    @property
    def client(self):
        """Lazy-load SES client."""
        if self._client is None:
            self._client = boto3.client(
                "ses",
                region_name=self.region,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
            )
        return self._client

    async def send_email(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        try:
            source = f"{from_name} <{from_email}>" if from_name else from_email

            message_body: dict[str, Any] = {}
            if body_html:
                message_body["Html"] = {"Data": body_html, "Charset": "UTF-8"}
            if body_text:
                message_body["Text"] = {"Data": body_text, "Charset": "UTF-8"}

            send_kwargs: dict[str, Any] = {
                "Source": source,
                "Destination": {"ToAddresses": [to_email]},
                "Message": {
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": message_body,
                },
            }

            if reply_to:
                send_kwargs["ReplyToAddresses"] = [reply_to]

            if self.configuration_set:
                send_kwargs["ConfigurationSetName"] = self.configuration_set

            response = self.client.send_email(**send_kwargs)

            return {
                "success": True,
                "message_id": response.get("MessageId"),
                "provider": "ses",
            }

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            logger.error(f"SES send error: {error_code} - {error_message}")
            return {
                "success": False,
                "error": f"{error_code}: {error_message}",
                "provider": "ses",
            }

    async def test_connection(self) -> dict:
        # Check for required credentials first
        if not self.access_key_id or not self.secret_access_key:
            return {
                "success": False,
                "message": "SES credentials not configured. Please add access_key_id and secret_access_key."
            }
        try:
            self.client.get_send_quota()
            return {"success": True, "message": "SES connection successful"}
        except ClientError as e:
            error_message = e.response.get("Error", {}).get("Message", str(e))
            return {"success": False, "message": f"SES connection failed: {error_message}"}

    async def get_quota(self) -> dict | None:
        try:
            response = self.client.get_send_quota()
            return {
                "max_24_hour_send": response.get("Max24HourSend"),
                "max_send_rate": response.get("MaxSendRate"),
                "sent_last_24_hours": response.get("SentLast24Hours"),
            }
        except ClientError:
            return None


# =============================================================================
# SENDGRID CLIENT
# =============================================================================

class SendGridClient(EmailProviderClient):
    """SendGrid email client."""

    API_URL = "https://api.sendgrid.com/v3/mail/send"

    def __init__(self, credentials: dict):
        self.api_key = credentials.get("api_key")

    async def send_email(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": from_email, "name": from_name} if from_name else {"email": from_email},
            "subject": subject,
            "content": [],
        }

        if body_text:
            payload["content"].append({"type": "text/plain", "value": body_text})
        if body_html:
            payload["content"].append({"type": "text/html", "value": body_html})

        if reply_to:
            payload["reply_to"] = {"email": reply_to}

        if headers:
            payload["headers"] = headers

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.API_URL,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )

                if response.status_code in (200, 202):
                    # SendGrid returns message ID in header
                    message_id = response.headers.get("X-Message-Id")
                    return {
                        "success": True,
                        "message_id": message_id,
                        "provider": "sendgrid",
                    }
                else:
                    error_body = response.json() if response.content else {}
                    errors = error_body.get("errors", [])
                    error_msg = errors[0].get("message") if errors else response.text
                    logger.error(f"SendGrid send error: {response.status_code} - {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "provider": "sendgrid",
                    }

            except httpx.HTTPError as e:
                logger.error(f"SendGrid HTTP error: {e}")
                return {"success": False, "error": str(e), "provider": "sendgrid"}

    async def test_connection(self) -> dict:
        # Check for required credentials first
        if not self.api_key:
            return {
                "success": False,
                "message": "SendGrid credentials not configured. Please add api_key."
            }
        # Test by fetching user info
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    "https://api.sendgrid.com/v3/user/profile",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                if response.status_code == 200:
                    return {"success": True, "message": "SendGrid connection successful"}
                else:
                    return {"success": False, "message": f"SendGrid auth failed: {response.status_code}"}
            except httpx.HTTPError as e:
                return {"success": False, "message": f"SendGrid connection failed: {e}"}

    async def get_quota(self) -> dict | None:
        # SendGrid doesn't have a simple quota endpoint
        return None


# =============================================================================
# MAILGUN CLIENT
# =============================================================================

class MailgunClient(EmailProviderClient):
    """Mailgun email client."""

    def __init__(self, credentials: dict):
        self.api_key = credentials.get("api_key")
        self.domain = credentials.get("domain")
        self.region = credentials.get("region", "us")
        self.base_url = (
            f"https://api.eu.mailgun.net/v3/{self.domain}"
            if self.region == "eu"
            else f"https://api.mailgun.net/v3/{self.domain}"
        )

    async def send_email(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        from_address = f"{from_name} <{from_email}>" if from_name else from_email

        data = {
            "from": from_address,
            "to": to_email,
            "subject": subject,
        }

        if body_html:
            data["html"] = body_html
        if body_text:
            data["text"] = body_text
        if reply_to:
            data["h:Reply-To"] = reply_to

        # Add custom headers
        if headers:
            for key, value in headers.items():
                data[f"h:{key}"] = value

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/messages",
                    data=data,
                    auth=("api", self.api_key),
                )

                if response.status_code == 200:
                    result = response.json()
                    return {
                        "success": True,
                        "message_id": result.get("id"),
                        "provider": "mailgun",
                    }
                else:
                    error_body = response.json() if response.content else {}
                    error_msg = error_body.get("message", response.text)
                    logger.error(f"Mailgun send error: {response.status_code} - {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "provider": "mailgun",
                    }

            except httpx.HTTPError as e:
                logger.error(f"Mailgun HTTP error: {e}")
                return {"success": False, "error": str(e), "provider": "mailgun"}

    async def test_connection(self) -> dict:
        # Check for required credentials first
        if not self.api_key or not self.domain:
            return {
                "success": False,
                "message": "Mailgun credentials not configured. Please add api_key and domain."
            }
        async with httpx.AsyncClient() as client:
            try:
                # Test by getting domain info
                base = (
                    "https://api.eu.mailgun.net/v3"
                    if self.region == "eu"
                    else "https://api.mailgun.net/v3"
                )
                response = await client.get(
                    f"{base}/domains/{self.domain}",
                    auth=("api", self.api_key),
                )
                if response.status_code == 200:
                    return {"success": True, "message": "Mailgun connection successful"}
                else:
                    return {"success": False, "message": f"Mailgun auth failed: {response.status_code}"}
            except httpx.HTTPError as e:
                return {"success": False, "message": f"Mailgun connection failed: {e}"}

    async def get_quota(self) -> dict | None:
        # Mailgun doesn't have a simple quota endpoint
        return None


# =============================================================================
# POSTMARK CLIENT
# =============================================================================

class PostmarkClient(EmailProviderClient):
    """Postmark email client."""

    API_URL = "https://api.postmarkapp.com/email"

    def __init__(self, credentials: dict):
        self.server_token = credentials.get("server_token")

    async def send_email(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        from_address = f"{from_name} <{from_email}>" if from_name else from_email

        payload = {
            "From": from_address,
            "To": to_email,
            "Subject": subject,
        }

        if body_html:
            payload["HtmlBody"] = body_html
        if body_text:
            payload["TextBody"] = body_text
        if reply_to:
            payload["ReplyTo"] = reply_to

        # Add custom headers
        if headers:
            payload["Headers"] = [{"Name": k, "Value": v} for k, v in headers.items()]

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.API_URL,
                    json=payload,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-Postmark-Server-Token": self.server_token,
                    },
                )

                result = response.json()

                if response.status_code == 200:
                    return {
                        "success": True,
                        "message_id": result.get("MessageID"),
                        "provider": "postmark",
                    }
                else:
                    error_msg = result.get("Message", response.text)
                    logger.error(f"Postmark send error: {response.status_code} - {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "provider": "postmark",
                    }

            except httpx.HTTPError as e:
                logger.error(f"Postmark HTTP error: {e}")
                return {"success": False, "error": str(e), "provider": "postmark"}

    async def test_connection(self) -> dict:
        # Check for required credentials first
        if not self.server_token:
            return {
                "success": False,
                "message": "Postmark credentials not configured. Please add server_token."
            }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    "https://api.postmarkapp.com/server",
                    headers={
                        "Accept": "application/json",
                        "X-Postmark-Server-Token": self.server_token,
                    },
                )
                if response.status_code == 200:
                    return {"success": True, "message": "Postmark connection successful"}
                else:
                    return {"success": False, "message": f"Postmark auth failed: {response.status_code}"}
            except httpx.HTTPError as e:
                return {"success": False, "message": f"Postmark connection failed: {e}"}

    async def get_quota(self) -> dict | None:
        # Postmark doesn't have sending limits in the same way
        return None


# =============================================================================
# SMTP CLIENT
# =============================================================================

class SMTPClient(EmailProviderClient):
    """Generic SMTP email client."""

    def __init__(self, credentials: dict):
        self.host = credentials.get("host")
        self.port = credentials.get("port", 587)
        self.username = credentials.get("username")
        self.password = credentials.get("password")
        self.use_tls = credentials.get("use_tls", True)

    async def send_email(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        try:
            # Create message
            if body_html:
                message = MIMEMultipart("alternative")
                if body_text:
                    message.attach(MIMEText(body_text, "plain", "utf-8"))
                message.attach(MIMEText(body_html, "html", "utf-8"))
            else:
                message = MIMEMultipart()
                message.attach(MIMEText(body_text or "", "plain", "utf-8"))

            message["Subject"] = subject
            message["From"] = f"{from_name} <{from_email}>" if from_name else from_email
            message["To"] = to_email

            if reply_to:
                message["Reply-To"] = reply_to

            # Add custom headers
            if headers:
                for key, value in headers.items():
                    message[key] = value

            # Determine TLS settings
            use_ssl = self.port == 465
            start_tls = self.use_tls and not use_ssl

            smtp_kwargs: dict[str, Any] = {
                "hostname": self.host,
                "port": self.port,
                "use_tls": use_ssl,
                "start_tls": start_tls,
            }

            if self.username and self.password:
                smtp_kwargs["username"] = self.username
                smtp_kwargs["password"] = self.password

            response = await aiosmtplib.send(message, **smtp_kwargs)

            # Extract message ID if available
            message_id = None
            if isinstance(response, tuple) and len(response) > 0:
                message_id = str(response)

            return {
                "success": True,
                "message_id": message_id or f"smtp-{uuid4()}",
                "provider": "smtp",
            }

        except aiosmtplib.SMTPException as e:
            logger.error(f"SMTP send error: {e}")
            return {"success": False, "error": str(e), "provider": "smtp"}

    async def test_connection(self) -> dict:
        # Check for required credentials first
        if not self.host:
            return {
                "success": False,
                "message": "SMTP credentials not configured. Please add host."
            }
        try:
            use_ssl = self.port == 465
            start_tls = self.use_tls and not use_ssl

            async with aiosmtplib.SMTP(
                hostname=self.host,
                port=self.port,
                use_tls=use_ssl,
                start_tls=start_tls,
            ) as smtp:
                if self.username and self.password:
                    await smtp.login(self.username, self.password)

            return {"success": True, "message": "SMTP connection successful"}

        except aiosmtplib.SMTPException as e:
            return {"success": False, "message": f"SMTP connection failed: {e}"}

    async def get_quota(self) -> dict | None:
        return None


# =============================================================================
# PROVIDER SERVICE
# =============================================================================

def get_provider_client(provider: EmailProvider) -> EmailProviderClient:
    """Factory function to create the appropriate provider client."""
    provider_type = provider.provider_type

    if provider_type == EmailProviderType.SES.value:
        return SESClient(provider.credentials)
    elif provider_type == EmailProviderType.SENDGRID.value:
        return SendGridClient(provider.credentials)
    elif provider_type == EmailProviderType.MAILGUN.value:
        return MailgunClient(provider.credentials)
    elif provider_type == EmailProviderType.POSTMARK.value:
        return PostmarkClient(provider.credentials)
    elif provider_type == EmailProviderType.SMTP.value:
        return SMTPClient(provider.credentials)
    else:
        raise ValueError(f"Unsupported provider type: {provider_type}")


class ProviderService:
    """Service for managing email providers and sending emails."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db

    # -------------------------------------------------------------------------
    # PROVIDER CRUD
    # -------------------------------------------------------------------------

    async def create_provider(
        self,
        workspace_id: str,
        data: EmailProviderCreate,
    ) -> EmailProvider:
        """Create a new email provider."""
        provider = EmailProvider(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            provider_type=data.provider_type,
            description=data.description,
            credentials=data.credentials,
            settings=data.settings,
            max_sends_per_second=data.max_sends_per_second,
            max_sends_per_day=data.max_sends_per_day,
            priority=data.priority,
            is_default=data.is_default,
            status=ProviderStatus.SETUP.value,
        )

        # If this is the default, unset other defaults
        if data.is_default:
            await self._unset_default_providers(workspace_id)

        self.db.add(provider)
        await self.db.commit()
        await self.db.refresh(provider)

        logger.info(f"Created email provider: {provider.id} ({provider.name})")
        return provider

    async def update_provider(
        self,
        provider_id: str,
        workspace_id: str,
        data: EmailProviderUpdate,
    ) -> EmailProvider | None:
        """Update an email provider."""
        result = await self.db.execute(
            select(EmailProvider).where(
                and_(
                    EmailProvider.id == provider_id,
                    EmailProvider.workspace_id == workspace_id,
                )
            )
        )
        provider = result.scalar_one_or_none()

        if not provider:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Handle default flag
        if update_data.get("is_default"):
            await self._unset_default_providers(workspace_id, exclude_id=provider_id)

        for key, value in update_data.items():
            setattr(provider, key, value)

        await self.db.commit()
        await self.db.refresh(provider)

        logger.info(f"Updated email provider: {provider.id}")
        return provider

    async def delete_provider(
        self,
        provider_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete an email provider."""
        result = await self.db.execute(
            select(EmailProvider).where(
                and_(
                    EmailProvider.id == provider_id,
                    EmailProvider.workspace_id == workspace_id,
                )
            )
        )
        provider = result.scalar_one_or_none()

        if not provider:
            return False

        await self.db.delete(provider)
        await self.db.commit()

        logger.info(f"Deleted email provider: {provider_id}")
        return True

    async def get_provider(
        self,
        provider_id: str,
        workspace_id: str,
    ) -> EmailProvider | None:
        """Get an email provider by ID."""
        result = await self.db.execute(
            select(EmailProvider).where(
                and_(
                    EmailProvider.id == provider_id,
                    EmailProvider.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_providers(
        self,
        workspace_id: str,
    ) -> list[EmailProvider]:
        """List all email providers for a workspace."""
        result = await self.db.execute(
            select(EmailProvider)
            .where(EmailProvider.workspace_id == workspace_id)
            .order_by(EmailProvider.priority.asc(), EmailProvider.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_default_provider(
        self,
        workspace_id: str,
    ) -> EmailProvider | None:
        """Get the default email provider for a workspace."""
        result = await self.db.execute(
            select(EmailProvider).where(
                and_(
                    EmailProvider.workspace_id == workspace_id,
                    EmailProvider.is_default == True,
                    EmailProvider.status == ProviderStatus.ACTIVE.value,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _unset_default_providers(
        self,
        workspace_id: str,
        exclude_id: str | None = None,
    ) -> None:
        """Unset default flag on all providers except the excluded one."""
        result = await self.db.execute(
            select(EmailProvider).where(
                and_(
                    EmailProvider.workspace_id == workspace_id,
                    EmailProvider.is_default == True,
                    EmailProvider.id != exclude_id if exclude_id else True,
                )
            )
        )
        for provider in result.scalars().all():
            provider.is_default = False

    # -------------------------------------------------------------------------
    # PROVIDER OPERATIONS
    # -------------------------------------------------------------------------

    async def test_provider(
        self,
        provider_id: str,
        workspace_id: str,
        to_email: str | None = None,
    ) -> dict:
        """Test a provider's connection and optionally send a test email."""
        provider = await self.get_provider(provider_id, workspace_id)
        if not provider:
            return {"success": False, "message": "Provider not found"}

        try:
            client = get_provider_client(provider)

            # Test connection
            result = await client.test_connection()

            # Update provider status
            provider.last_check_at = datetime.now(timezone.utc)
            provider.last_check_status = "success" if result["success"] else "failed"
            provider.last_error = None if result["success"] else result.get("message")

            if result["success"]:
                provider.status = ProviderStatus.ACTIVE.value
            else:
                provider.status = ProviderStatus.ERROR.value

            await self.db.commit()

            return result

        except Exception as e:
            logger.error(f"Error testing provider {provider_id}: {e}")
            provider.last_check_at = datetime.now(timezone.utc)
            provider.last_check_status = "error"
            provider.last_error = str(e)
            provider.status = ProviderStatus.ERROR.value
            await self.db.commit()
            return {"success": False, "message": str(e)}

    async def send_via_provider(
        self,
        provider: EmailProvider,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> dict:
        """
        Send an email via a specific provider.

        Returns:
            dict with 'success', 'message_id', 'provider' keys
        """
        # Check provider status
        if provider.status != ProviderStatus.ACTIVE.value:
            return {
                "success": False,
                "error": f"Provider {provider.name} is not active (status: {provider.status})",
                "provider": provider.provider_type,
            }

        # Check daily limit
        if provider.max_sends_per_day:
            if provider.current_daily_sends >= provider.max_sends_per_day:
                return {
                    "success": False,
                    "error": f"Provider {provider.name} has reached daily limit",
                    "provider": provider.provider_type,
                }

        try:
            client = get_provider_client(provider)

            result = await client.send_email(
                from_email=from_email,
                from_name=from_name,
                to_email=to_email,
                subject=subject,
                body_html=body_html,
                body_text=body_text,
                reply_to=reply_to,
                headers=headers,
            )

            # Update daily send count on success
            if result.get("success"):
                provider.current_daily_sends += 1
                await self.db.commit()

            return result

        except Exception as e:
            logger.error(f"Error sending via provider {provider.id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "provider": provider.provider_type,
            }

    async def reset_daily_counts(self, workspace_id: str) -> int:
        """Reset daily send counts for all providers in a workspace."""
        result = await self.db.execute(
            select(EmailProvider).where(EmailProvider.workspace_id == workspace_id)
        )
        providers = result.scalars().all()

        count = 0
        now = datetime.now(timezone.utc)

        for provider in providers:
            provider.current_daily_sends = 0
            provider.daily_sends_reset_at = now
            count += 1

        await self.db.commit()
        logger.info(f"Reset daily counts for {count} providers in workspace {workspace_id}")
        return count

    # -------------------------------------------------------------------------
    # EVENT LOGGING
    # -------------------------------------------------------------------------

    async def log_provider_event(
        self,
        workspace_id: str,
        provider_id: str | None,
        domain_id: str | None,
        event_type: str,
        message_id: str | None,
        recipient_email: str | None,
        raw_payload: dict,
        bounce_type: str | None = None,
        bounce_subtype: str | None = None,
        diagnostic_code: str | None = None,
        event_timestamp: datetime | None = None,
    ) -> ProviderEventLog:
        """Log a provider webhook event."""
        event = ProviderEventLog(
            id=str(uuid4()),
            workspace_id=workspace_id,
            provider_id=provider_id,
            domain_id=domain_id,
            event_type=event_type,
            message_id=message_id,
            recipient_email=recipient_email,
            raw_payload=raw_payload,
            bounce_type=bounce_type,
            bounce_subtype=bounce_subtype,
            diagnostic_code=diagnostic_code,
            event_timestamp=event_timestamp,
        )

        self.db.add(event)
        await self.db.commit()

        logger.debug(f"Logged provider event: {event_type} for {message_id}")
        return event

    async def get_unprocessed_events(
        self,
        workspace_id: str | None = None,
        limit: int = 100,
    ) -> list[ProviderEventLog]:
        """Get unprocessed provider events."""
        query = select(ProviderEventLog).where(ProviderEventLog.processed == False)

        if workspace_id:
            query = query.where(ProviderEventLog.workspace_id == workspace_id)

        query = query.order_by(ProviderEventLog.created_at.asc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def mark_event_processed(self, event_id: str) -> None:
        """Mark a provider event as processed."""
        result = await self.db.execute(
            select(ProviderEventLog).where(ProviderEventLog.id == event_id)
        )
        event = result.scalar_one_or_none()

        if event:
            event.processed = True
            event.processed_at = datetime.now(timezone.utc)
            await self.db.commit()

    # -------------------------------------------------------------------------
    # SYNC METHODS (for Celery tasks)
    # -------------------------------------------------------------------------

    def send_email_sync(
        self,
        provider_id: str,
        to_email: str,
        from_email: str,
        from_name: str,
        subject: str,
        html_body: str,
        text_body: str = "",
        reply_to: str | None = None,
    ) -> dict:
        """
        Sync version of send_via_provider for Celery tasks.

        Returns:
            Dict with success, message_id, or error
        """
        import asyncio

        # Get provider
        result = self.db.execute(
            select(EmailProvider).where(EmailProvider.id == provider_id)
        )
        provider = result.scalar_one_or_none()

        if not provider:
            return {"success": False, "error": "Provider not found"}

        if provider.status != ProviderStatus.ACTIVE.value:
            return {"success": False, "error": f"Provider is {provider.status}"}

        # Check daily limit
        if provider.max_daily_sends and provider.current_daily_sends >= provider.max_daily_sends:
            return {"success": False, "error": "Provider daily limit reached"}

        # Get client
        client = self._get_client(provider)
        if not client:
            return {"success": False, "error": f"Unsupported provider type: {provider.provider_type}"}

        try:
            # Run async send in event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            try:
                send_result = loop.run_until_complete(
                    client.send_email(
                        to_email=to_email,
                        from_email=from_email,
                        from_name=from_name,
                        subject=subject,
                        html_body=html_body,
                        text_body=text_body,
                        reply_to=reply_to,
                    )
                )
            finally:
                loop.close()

            # Increment counter
            provider.current_daily_sends += 1
            self.db.commit()

            return {
                "success": True,
                "message_id": send_result.get("message_id"),
                "provider": provider.provider_type,
            }

        except Exception as e:
            logger.error(f"Provider send failed: {e}")
            return {"success": False, "error": str(e)}

    def _get_client(self, provider: EmailProvider) -> EmailProviderClient | None:
        """Get the appropriate client for a provider."""
        provider_type = provider.provider_type
        credentials = provider.credentials

        if provider_type == EmailProviderType.SES.value:
            return SESClient(credentials)
        elif provider_type == EmailProviderType.SENDGRID.value:
            return SendGridClient(credentials)
        elif provider_type == EmailProviderType.MAILGUN.value:
            return MailgunClient(credentials)
        elif provider_type == EmailProviderType.POSTMARK.value:
            return PostmarkClient(credentials)
        elif provider_type == EmailProviderType.SMTP.value:
            return SMTPClient(credentials)
        else:
            return None
