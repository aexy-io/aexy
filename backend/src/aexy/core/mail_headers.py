"""Headers that mark a message as sent by this application.

Lives in ``core`` because two unrelated senders need the same marker: the Service
Desk's Gmail sender, and the generic transactional ``EmailService``. A watched
Service Desk mailbox receives mail from both — the desk's own acknowledgements
and the daily digest — and without a marker it ingests them as fresh tickets. The
digest did exactly that: it went out through the transactional path, which
stamped nothing, and came back as a ticket whose "requester" was Aexy itself.
"""

from __future__ import annotations

# Stamped on every message this application sends, and checked by Service Desk
# intake before a ticket is created. The name is historical: it marks mail as
# *ours*, whichever feature composed it.
OUTBOUND_MARKER_HEADER = "X-Aexy-Service-Desk"

# RFC 3834. Not just for our own benefit — it is what tells somebody else's
# helpdesk not to answer our digest either, and their auto-responder not to
# answer our acknowledgements.
AUTO_SUBMITTED_HEADER = "Auto-Submitted"
AUTO_SUBMITTED_VALUE = "auto-generated"


def auto_generated_headers(enabled: bool = True) -> dict[str, str]:
    """The headers for a message no person composed, or ``{}`` when not one.

    Returning a mapping rather than setting them in place keeps the three
    provider paths (SES raw MIME, Postmark JSON, SMTP) honest about carrying the
    same thing.
    """
    if not enabled:
        return {}
    return {
        OUTBOUND_MARKER_HEADER: "1",
        AUTO_SUBMITTED_HEADER: AUTO_SUBMITTED_VALUE,
    }
