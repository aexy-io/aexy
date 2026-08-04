"""Channel-aware outbound for the Service Desk.

For a Gmail-synced mailbox, replies are sent through the Gmail API as the
mailbox address and threaded into the requester's original conversation. For a
webhook mailbox (or if Gmail send fails), it falls back to the transactional
``EmailService``. All sends are best-effort — callers never depend on delivery.

"""

import base64
import logging
from email import encoders
from email.message import Message
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox

logger = logging.getLogger(__name__)

# Stamped on every service-desk email we send through Gmail, and checked by
# intake before a ticket is created. The synced mailbox is the same Google
# account these receipts are sent from, so our own sent mail comes back through
# the sync — without a deterministic marker every acknowledgement would be
# ingested as a fresh ticket, which would then be acknowledged in turn.
OUTBOUND_MARKER_HEADER = "X-Aexy-Service-Desk"


async def _send_via_gmail(
    db: AsyncSession,
    integration_id: str,
    workspace_id: str,
    from_address: str,
    to_email: str,
    subject: str,
    body_text: str,
    thread_id: str | None,
    attachments: list[tuple[str, str | None, bytes]] | None = None,
) -> str | None:
    """Send through the connected account. Returns Gmail's thread id, if given."""
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

    if attachments:
        mime: Message = MIMEMultipart()
        mime.attach(MIMEText(body_text))
        for filename, content_type, raw_bytes in attachments:
            maintype, _, subtype = (content_type or "application/octet-stream").partition("/")
            part = MIMEBase(maintype or "application", subtype or "octet-stream")
            part.set_payload(raw_bytes)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            mime.attach(part)
    else:
        mime = MIMEText(body_text)

    mime["To"] = to_email
    mime["From"] = from_address
    # Keep the watched mailbox in the reply path explicitly. Gmail already sends
    # as the connected account, but a stakeholder replying to a display name or
    # a forwarded copy can otherwise answer somewhere the desk never sees.
    mime["Reply-To"] = from_address
    mime["Subject"] = subject
    mime[OUTBOUND_MARKER_HEADER] = "1"
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()

    payload: dict = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id

    response = await GmailSyncService(db)._make_gmail_request(
        integration, "POST", "/users/me/messages/send", json=payload
    )
    return (response or {}).get("threadId")


async def send_stakeholder_email(
    db: AsyncSession,
    mailbox: ServiceDeskMailbox | None,
    to_email: str,
    subject: str,
    body_text: str,
    thread_id: str | None = None,
    attachments: list[tuple[str, str | None, bytes]] | None = None,
) -> str | None:
    """Send a KAM-composed ticket email AS the watched mailbox. Raises on failure.

    Deliberately not best-effort, unlike the automatic receipts. This is a
    person clicking Send, and the transactional fallback would deliver from a
    system address the stakeholder cannot reply to — their answer would never
    reach the watched mailbox and so never reach the ticket. Failing loudly
    lets the UI say so instead of logging an outbound message that never left.
    """
    if (
        mailbox is None
        or mailbox.channel != MailboxChannel.GMAIL_SYNC.value
        or not mailbox.integration_id
    ):
        raise RuntimeError(
            "This ticket's mailbox is not linked to a connected Gmail account, "
            "so outbound stakeholder email cannot be sent from it"
        )
    return await _send_via_gmail(
        db,
        mailbox.integration_id,
        mailbox.address,
        to_email,
        subject,
        body_text,
        thread_id,
        attachments,
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
