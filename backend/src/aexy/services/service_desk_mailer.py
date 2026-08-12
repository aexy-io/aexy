"""Channel-aware outbound for the Service Desk.

For a Gmail-synced mailbox, replies are sent through the Gmail API as the
mailbox address and threaded into the requester's original conversation. For a
webhook mailbox (or if Gmail send fails), it falls back to the transactional
``EmailService``. All sends are best-effort — callers never depend on delivery.

"""

import base64
import logging
from datetime import datetime
from email import encoders
from email.message import Message
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.mail_headers import (
    AUTO_SUBMITTED_HEADER,
    AUTO_SUBMITTED_VALUE,
    OUTBOUND_MARKER_HEADER,
)
from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox
from aexy.services.service_desk_config import (
    AUTO_RESPONSE_HEADER_NAMES,
    looks_automatic,
)

logger = logging.getLogger(__name__)

# Re-exported: intake and its tests have always read the marker from here, and
# the constant now has one definition shared with the transactional sender —
# whichever channel a message leaves on, it comes back marked the same way.
__all__ = [
    "OUTBOUND_MARKER_HEADER",
    "desk_replied_in_thread",
    "send_service_desk_email",
    "send_stakeholder_email",
]


def _header_safe(value: str) -> str:
    """Collapse CR/LF so a value can never smuggle extra headers into the raw
    MIME. The API layer already rejects line breaks in caller-supplied fields;
    this keeps every other caller of the mailer safe by construction."""
    return " ".join(str(value).splitlines())


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
    cc: list[str] | None = None,
    auto_generated: bool = False,
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
            part.add_header("Content-Disposition", "attachment", filename=_header_safe(filename))
            mime.attach(part)
    else:
        mime = MIMEText(body_text)

    mime["To"] = _header_safe(to_email)
    if cc:
        # Gmail delivers to whatever the raw MIME addresses, so the header is
        # also the send list — no separate recipient argument to keep in step.
        mime["Cc"] = _header_safe(", ".join(cc))
    mime["From"] = from_address
    # Keep the watched mailbox in the reply path explicitly. Gmail already sends
    # as the connected account, but a stakeholder replying to a display name or
    # a forwarded copy can otherwise answer somewhere the desk never sees.
    mime["Reply-To"] = from_address
    mime["Subject"] = _header_safe(subject)
    mime[OUTBOUND_MARKER_HEADER] = "1"
    # A person clicked Send for a stakeholder email, so only the automatic sends
    # claim RFC 3834 — an out-of-office answering a KAM's own message is a reply
    # they should see.
    if auto_generated:
        mime[AUTO_SUBMITTED_HEADER] = AUTO_SUBMITTED_VALUE
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()

    payload: dict = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id

    response = await GmailSyncService(db)._make_gmail_request(
        integration, "POST", "/users/me/messages/send", json=payload
    )
    return (response or {}).get("threadId")


async def desk_replied_in_thread(
    db: AsyncSession,
    mailbox: ServiceDeskMailbox | None,
    thread_id: str | None,
    after: datetime | None = None,
) -> bool:
    """True when a person has answered this Gmail thread from the desk since ``after``.

    Asked before an automatic acknowledgement goes out. Somebody typing a reply
    in Gmail minutes after the mail arrived is a better answer than "your request
    has been logged"; sending the canned receipt afterwards reads as if the desk
    never saw the human reply. The sync cannot know this on its own — the reply
    may not have been synced yet when the ticket is created — so the account is
    asked directly.

    ``after`` is when the message that opened the ticket arrived, and only mail
    the desk sent *later* counts. Without it, a thread the desk itself started —
    an ops colleague writing to a partner by hand, the partner's reply becoming
    the ticket — read as already answered, and that requester was never
    acknowledged at all.

    Two classes of desk mail are not a colleague answering: mail this application
    sent, identified by its marker header, and the mailbox's own auto-responder.
    An out-of-office is the strongest reason to send the ticket id, not to
    withhold it.

    False for anything this cannot establish (webhook mailbox, no thread, no
    ``after``, API failure): a receipt too many is better than a requester who is
    never told their ticket number.
    """
    if (
        mailbox is None
        or not thread_id
        or after is None
        or mailbox.channel != MailboxChannel.GMAIL_SYNC.value
        or not mailbox.integration_id
    ):
        return False

    from aexy.services.gmail_sync_service import GmailSyncService

    try:
        integration = await db.get(GoogleIntegration, mailbox.integration_id)
        if integration is None or str(integration.workspace_id) != str(mailbox.workspace_id):
            return False
        thread = await GmailSyncService(db)._make_gmail_request(
            integration,
            "GET",
            f"/users/me/threads/{thread_id}",
            params={
                "format": "metadata",
                "metadataHeaders": [
                    "From",
                    "Subject",
                    OUTBOUND_MARKER_HEADER,
                    *AUTO_RESPONSE_HEADER_NAMES,
                ],
            },
        )
    except Exception as exc:  # noqa: BLE001 — never block an acknowledgement
        logger.info("Service desk: could not read thread %s (%s)", thread_id, exc)
        return False

    # Gmail's own clock for both sides of the comparison: the caller's `after`
    # comes from the ticket-opening message's internalDate, so a sender's skewed
    # or forged Date header cannot decide whether a receipt goes out.
    cutoff_ms = int(after.timestamp() * 1000)

    for message in (thread or {}).get("messages", []):
        if "SENT" not in (message.get("labelIds") or []):
            continue
        try:
            if int(message.get("internalDate", 0)) <= cutoff_ms:
                continue
        except (TypeError, ValueError):
            continue  # undatable, so it cannot be shown to be a later reply
        headers = {
            str(header.get("name", "")).lower(): str(header.get("value", ""))
            for header in ((message.get("payload") or {}).get("headers") or [])
        }
        if headers.get(OUTBOUND_MARKER_HEADER.lower(), "").strip():
            continue  # our own automatic mail, not a colleague
        if looks_automatic(headers, headers.get("subject")):
            continue  # the desk's own out-of-office
        return True
    return False


async def send_stakeholder_email(
    db: AsyncSession,
    mailbox: ServiceDeskMailbox | None,
    to_email: str,
    subject: str,
    body_text: str,
    thread_id: str | None = None,
    attachments: list[tuple[str, str | None, bytes]] | None = None,
    cc: list[str] | None = None,
) -> str | None:
    """Send a person-composed ticket email AS the watched mailbox. Raises on failure.

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
    # Keywords, not positions. This call omitted ``workspace_id`` when that
    # parameter was added, so every argument after it landed one place to the
    # left: the cross-workspace check compared the integration against the desk's
    # own email address, failed for every mailbox, and the UI reported "the email
    # could not be sent" on every send.
    return await _send_via_gmail(
        db,
        integration_id=mailbox.integration_id,
        workspace_id=mailbox.workspace_id,
        from_address=mailbox.address,
        to_email=to_email,
        subject=subject,
        body_text=body_text,
        thread_id=thread_id,
        attachments=attachments,
        cc=cc,
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
                integration_id=mailbox.integration_id,
                workspace_id=mailbox.workspace_id,
                from_address=mailbox.address,
                to_email=to_email,
                subject=subject,
                body_text=body_text,
                thread_id=thread_id,
                auto_generated=True,
            )
            return
        except Exception as exc:  # noqa: BLE001 — degrade to transactional send
            logger.info("Service desk: Gmail send failed, falling back to EmailService (%s)", exc)

    try:
        from aexy.services.email_service import EmailService

        await EmailService().send_templated_email(
            db=db,
            recipient_email=to_email,
            subject=subject,
            body_text=body_text,
            # Same marker the Gmail path stamps: the channel a receipt happened to
            # go out on must not decide whether it can come back in as a ticket.
            auto_generated=True,
        )
    except Exception as exc:  # noqa: BLE001 — outbound is best-effort
        logger.info("Service desk: email send skipped (%s)", exc)
