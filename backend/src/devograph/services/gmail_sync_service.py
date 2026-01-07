"""Gmail Sync Service for syncing emails from Google."""

import base64
import logging
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.core.config import get_settings
from devograph.models.google_integration import (
    EmailSyncCursor,
    GoogleIntegration,
    SyncedEmail,
    SyncedEmailRecordLink,
)
from devograph.models.crm import CRMRecord

logger = logging.getLogger(__name__)
settings = get_settings()

# Gmail API URLs
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Gmail API scopes required
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


class GmailSyncError(Exception):
    """Gmail sync error."""

    pass


class GmailAuthError(GmailSyncError):
    """Gmail authentication error."""

    pass


class GmailSyncService:
    """Service for syncing Gmail emails."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _refresh_token_if_needed(
        self, integration: GoogleIntegration
    ) -> str:
        """Refresh the access token if it's about to expire.

        Returns the current or refreshed access token.
        """
        # Check if token expires within 5 minutes
        if integration.token_expiry and integration.token_expiry > datetime.now(
            timezone.utc
        ) + timedelta(minutes=5):
            return integration.access_token

        # Refresh the token
        if not integration.refresh_token:
            raise GmailAuthError("No refresh token available")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": integration.refresh_token,
                    "grant_type": "refresh_token",
                },
            )

            if response.status_code != 200:
                logger.error(f"Failed to refresh token: {response.text}")
                raise GmailAuthError("Failed to refresh Google token")

            token_data = response.json()
            integration.access_token = token_data["access_token"]
            integration.token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=token_data.get("expires_in", 3600)
            )
            await self.db.flush()

            return integration.access_token

    async def _make_gmail_request(
        self,
        integration: GoogleIntegration,
        method: str,
        endpoint: str,
        **kwargs,
    ) -> dict:
        """Make an authenticated request to the Gmail API."""
        access_token = await self._refresh_token_if_needed(integration)

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{GMAIL_API_BASE}{endpoint}",
                headers={"Authorization": f"Bearer {access_token}"},
                **kwargs,
            )

            if response.status_code == 401:
                raise GmailAuthError("Gmail authentication failed")

            if response.status_code >= 400:
                logger.error(f"Gmail API error: {response.status_code} - {response.text}")
                raise GmailSyncError(f"Gmail API error: {response.status_code}")

            return response.json()

    async def get_or_create_sync_cursor(
        self, integration: GoogleIntegration
    ) -> EmailSyncCursor:
        """Get or create the sync cursor for an integration."""
        result = await self.db.execute(
            select(EmailSyncCursor).where(
                EmailSyncCursor.integration_id == integration.id
            )
        )
        cursor = result.scalar_one_or_none()

        if not cursor:
            cursor = EmailSyncCursor(integration_id=integration.id)
            self.db.add(cursor)
            await self.db.flush()

        return cursor

    async def start_full_sync(
        self,
        integration: GoogleIntegration,
        max_messages: int = 500,
    ) -> dict:
        """Start a full sync of emails.

        Returns sync statistics.
        """
        if not integration.gmail_sync_enabled:
            return {"error": "Gmail sync not enabled"}

        cursor = await self.get_or_create_sync_cursor(integration)

        if cursor.full_sync_completed:
            return {"message": "Full sync already completed", "messages_synced": cursor.messages_synced}

        cursor.full_sync_started_at = datetime.now(timezone.utc)
        messages_synced = 0
        page_token = cursor.next_page_token

        try:
            # Get list of messages
            params: dict[str, Any] = {
                "maxResults": min(100, max_messages),
                "labelIds": ["INBOX"],  # Start with inbox only
            }
            if page_token:
                params["pageToken"] = page_token

            while messages_synced < max_messages:
                response = await self._make_gmail_request(
                    integration,
                    "GET",
                    "/users/me/messages",
                    params=params,
                )

                messages = response.get("messages", [])
                if not messages:
                    break

                # Fetch and store each message
                for msg_info in messages:
                    try:
                        await self._sync_message(integration, msg_info["id"])
                        messages_synced += 1
                    except Exception as e:
                        logger.error(f"Failed to sync message {msg_info['id']}: {e}")
                        continue

                    if messages_synced >= max_messages:
                        break

                # Get next page token
                page_token = response.get("nextPageToken")
                if not page_token:
                    cursor.full_sync_completed = True
                    cursor.full_sync_completed_at = datetime.now(timezone.utc)
                    break

                cursor.next_page_token = page_token
                params["pageToken"] = page_token

            # Get history ID for incremental sync
            profile_response = await self._make_gmail_request(
                integration, "GET", "/users/me/profile"
            )
            cursor.history_id = profile_response.get("historyId")
            cursor.messages_synced = (cursor.messages_synced or 0) + messages_synced
            cursor.last_sync_at = datetime.now(timezone.utc)
            cursor.last_error = None
            cursor.error_count = 0

            await self.db.flush()

            return {
                "messages_synced": messages_synced,
                "full_sync_completed": cursor.full_sync_completed,
                "history_id": cursor.history_id,
            }

        except Exception as e:
            cursor.last_error = str(e)
            cursor.error_count = (cursor.error_count or 0) + 1
            await self.db.flush()
            raise

    async def start_incremental_sync(
        self, integration: GoogleIntegration
    ) -> dict:
        """Sync new emails since the last sync using Gmail History API.

        Returns sync statistics.
        """
        if not integration.gmail_sync_enabled:
            return {"error": "Gmail sync not enabled"}

        cursor = await self.get_or_create_sync_cursor(integration)

        if not cursor.history_id:
            # No history ID - need full sync first
            return await self.start_full_sync(integration)

        messages_synced = 0
        try:
            # Get history since last sync
            response = await self._make_gmail_request(
                integration,
                "GET",
                "/users/me/history",
                params={
                    "startHistoryId": cursor.history_id,
                    "historyTypes": ["messageAdded"],
                },
            )

            history = response.get("history", [])
            new_history_id = response.get("historyId")

            # Process each history record
            seen_message_ids = set()
            for record in history:
                for msg_added in record.get("messagesAdded", []):
                    msg_id = msg_added["message"]["id"]
                    if msg_id not in seen_message_ids:
                        seen_message_ids.add(msg_id)
                        try:
                            await self._sync_message(integration, msg_id)
                            messages_synced += 1
                        except Exception as e:
                            logger.error(f"Failed to sync message {msg_id}: {e}")

            # Update cursor
            if new_history_id:
                cursor.history_id = new_history_id
            cursor.last_sync_at = datetime.now(timezone.utc)
            cursor.last_error = None

            await self.db.flush()

            return {
                "messages_synced": messages_synced,
                "history_id": cursor.history_id,
            }

        except GmailSyncError as e:
            if "historyId" in str(e).lower():
                # History ID expired - need full sync
                cursor.history_id = None
                cursor.full_sync_completed = False
                await self.db.flush()
                return await self.start_full_sync(integration)
            raise

    async def _sync_message(
        self, integration: GoogleIntegration, message_id: str
    ) -> SyncedEmail:
        """Fetch and store a single message."""
        # Check if already synced
        result = await self.db.execute(
            select(SyncedEmail).where(SyncedEmail.gmail_id == message_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # Fetch full message
        message = await self._make_gmail_request(
            integration,
            "GET",
            f"/users/me/messages/{message_id}",
            params={"format": "full"},
        )

        # Parse message
        email_data = self._parse_message(message)

        # Create synced email record
        synced_email = SyncedEmail(
            workspace_id=integration.workspace_id,
            integration_id=integration.id,
            gmail_id=message_id,
            gmail_thread_id=message.get("threadId"),
            subject=email_data.get("subject"),
            from_email=email_data.get("from_email"),
            from_name=email_data.get("from_name"),
            to_emails=email_data.get("to_emails"),
            cc_emails=email_data.get("cc_emails"),
            snippet=message.get("snippet"),
            body_text=email_data.get("body_text"),
            body_html=email_data.get("body_html"),
            labels=message.get("labelIds"),
            is_read="UNREAD" not in (message.get("labelIds") or []),
            is_starred="STARRED" in (message.get("labelIds") or []),
            has_attachments=email_data.get("has_attachments", False),
            gmail_date=email_data.get("date"),
        )

        self.db.add(synced_email)
        await self.db.flush()

        return synced_email

    def _parse_message(self, message: dict) -> dict:
        """Parse Gmail message into structured data."""
        payload = message.get("payload", {})
        headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}

        # Parse from address
        from_header = headers.get("from", "")
        from_name, from_email = parseaddr(from_header)

        # Parse to addresses
        to_header = headers.get("to", "")
        to_emails = self._parse_email_list(to_header)

        # Parse CC addresses
        cc_header = headers.get("cc", "")
        cc_emails = self._parse_email_list(cc_header)

        # Parse date
        date_str = headers.get("date", "")
        date = None
        if date_str:
            try:
                from email.utils import parsedate_to_datetime
                date = parsedate_to_datetime(date_str)
            except Exception:
                pass

        # Get body
        body_text, body_html = self._extract_body(payload)

        # Check for attachments
        has_attachments = self._has_attachments(payload)

        return {
            "subject": headers.get("subject"),
            "from_email": from_email,
            "from_name": from_name,
            "to_emails": to_emails,
            "cc_emails": cc_emails,
            "date": date,
            "body_text": body_text,
            "body_html": body_html,
            "has_attachments": has_attachments,
        }

    def _parse_email_list(self, header_value: str) -> list[dict]:
        """Parse a comma-separated email list into structured data."""
        if not header_value:
            return []

        emails = []
        # Split by comma but handle quoted names
        parts = header_value.split(",")
        for part in parts:
            name, email = parseaddr(part.strip())
            if email:
                emails.append({"name": name or None, "email": email})
        return emails

    def _extract_body(self, payload: dict) -> tuple[str | None, str | None]:
        """Extract text and HTML body from message payload."""
        body_text = None
        body_html = None

        def process_part(part: dict):
            nonlocal body_text, body_html
            mime_type = part.get("mimeType", "")
            body = part.get("body", {})
            data = body.get("data")

            if data:
                decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                if mime_type == "text/plain" and not body_text:
                    body_text = decoded
                elif mime_type == "text/html" and not body_html:
                    body_html = decoded

            # Process nested parts
            for sub_part in part.get("parts", []):
                process_part(sub_part)

        process_part(payload)
        return body_text, body_html

    def _has_attachments(self, payload: dict) -> bool:
        """Check if message has attachments."""
        def check_part(part: dict) -> bool:
            if part.get("filename"):
                return True
            for sub_part in part.get("parts", []):
                if check_part(sub_part):
                    return True
            return False

        return check_part(payload)

    async def link_emails_to_records(
        self,
        workspace_id: str,
        email_ids: list[str] | None = None,
    ) -> dict:
        """Link synced emails to CRM records by email address matching."""
        # Get emails to process
        query = select(SyncedEmail).where(SyncedEmail.workspace_id == workspace_id)
        if email_ids:
            query = query.where(SyncedEmail.id.in_(email_ids))

        result = await self.db.execute(query)
        emails = result.scalars().all()

        # Get all records with email attributes
        records_result = await self.db.execute(
            select(CRMRecord)
            .where(CRMRecord.workspace_id == workspace_id)
            .options(selectinload(CRMRecord.object))
        )
        records = records_result.scalars().all()

        # Build email -> record mapping
        email_to_records: dict[str, list[CRMRecord]] = {}
        for record in records:
            if not record.values:
                continue
            # Look for email fields in record values
            for key, value in record.values.items():
                if isinstance(value, str) and "@" in value:
                    email_lower = value.lower()
                    if email_lower not in email_to_records:
                        email_to_records[email_lower] = []
                    email_to_records[email_lower].append(record)

        links_created = 0
        for email in emails:
            # Check from email
            if email.from_email:
                for record in email_to_records.get(email.from_email.lower(), []):
                    await self._create_email_link(email, record, "from")
                    links_created += 1

            # Check to emails
            for to in email.to_emails or []:
                to_email = to.get("email", "").lower()
                for record in email_to_records.get(to_email, []):
                    await self._create_email_link(email, record, "to")
                    links_created += 1

        await self.db.flush()
        return {"links_created": links_created}

    async def _create_email_link(
        self,
        email: SyncedEmail,
        record: CRMRecord,
        link_type: str,
    ) -> SyncedEmailRecordLink | None:
        """Create a link between an email and a record if it doesn't exist."""
        # Check if link already exists
        result = await self.db.execute(
            select(SyncedEmailRecordLink).where(
                SyncedEmailRecordLink.email_id == email.id,
                SyncedEmailRecordLink.record_id == record.id,
            )
        )
        if result.scalar_one_or_none():
            return None

        link = SyncedEmailRecordLink(
            email_id=email.id,
            record_id=record.id,
            link_type=link_type,
            confidence=1.0,
        )
        self.db.add(link)
        return link

    async def send_email(
        self,
        integration: GoogleIntegration,
        to: str,
        subject: str,
        body_html: str,
        reply_to_message_id: str | None = None,
    ) -> dict:
        """Send an email via Gmail API.

        Returns the sent message info.
        """
        import email.mime.text
        import email.mime.multipart

        # Build the email
        msg = email.mime.multipart.MIMEMultipart("alternative")
        msg["To"] = to
        msg["Subject"] = subject
        msg["From"] = integration.google_email

        if reply_to_message_id:
            msg["In-Reply-To"] = reply_to_message_id
            msg["References"] = reply_to_message_id

        # Add HTML body
        html_part = email.mime.text.MIMEText(body_html, "html")
        msg.attach(html_part)

        # Encode message
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        # Send via Gmail API
        response = await self._make_gmail_request(
            integration,
            "POST",
            "/users/me/messages/send",
            json={"raw": raw},
        )

        return {
            "message_id": response.get("id"),
            "thread_id": response.get("threadId"),
        }
