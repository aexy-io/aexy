"""Channel-aware outbound for the Service Desk.

For a Gmail-synced mailbox, replies are sent through the Gmail API as the
mailbox address and threaded into the requester's original conversation. For a
webhook mailbox (or if Gmail send fails), it falls back to the transactional
``EmailService``. All sends are best-effort — callers never depend on delivery.

"""

import base64
import logging
from email.mime.text import MIMEText

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox

logger = logging.getLogger(__name__)


async def _send_via_gmail(
    db: AsyncSession,
    integration_id: str,
    workspace_id: str,
    from_address: str,
    to_email: str,
    subject: str,
    body_text: str,
    thread_id: str | None,
) -> None:
    from aexy.services.gmail_sync_service import GmailSyncService

    integration = await db.get(GoogleIntegration, integration_id)
    if integration is None or not integration.gmail_sync_enabled:
        raise RuntimeError("Gmail integration unavailable")
    # The mailbox row names the integration, so this is the last place that can
    # stop a cross-workspace row (written before the create-time check existed)
    # from sending mail out of somebody else's Google account.
    if str(integration.workspace_id) != str(workspace_id):
        raise RuntimeError(
            f"Gmail integration {integration_id} does not belong to workspace {workspace_id}"
        )

    mime = MIMEText(body_text)
    mime["To"] = to_email
    mime["From"] = from_address
    mime["Subject"] = subject
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()

    payload: dict = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id

    await GmailSyncService(db)._make_gmail_request(
        integration, "POST", "/users/me/messages/send", json=payload
    )


async def send_service_desk_email(
    db: AsyncSession,
    mailbox: ServiceDeskMailbox | None,
    to_email: str,
    subject: str,
    body_text: str,
    thread_id: str | None = None,
) -> None:
    """Send an email for a service-desk mailbox, picking the channel. Never raises."""
    if not to_email:
        return

    if (
        mailbox is not None
        and mailbox.channel == MailboxChannel.GMAIL_SYNC.value
        and mailbox.integration_id
    ):
        try:
            await _send_via_gmail(
                db,
                mailbox.integration_id,
                mailbox.workspace_id,
                mailbox.address,
                to_email,
                subject,
                body_text,
                thread_id,
            )
            return
        except Exception as exc:  # noqa: BLE001 — degrade to transactional send
            logger.info("Service desk: Gmail send failed, falling back to EmailService (%s)", exc)

    try:
        from aexy.services.email_service import EmailService

        await EmailService().send_templated_email(
            db=db, recipient_email=to_email, subject=subject, body_text=body_text
        )
    except Exception as exc:  # noqa: BLE001 — outbound is best-effort
        logger.info("Service desk: email send skipped (%s)", exc)
