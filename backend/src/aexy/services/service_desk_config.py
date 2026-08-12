"""Per-workspace Service Desk identity: the ticket prefix.

The prefix was a module constant, ``TICKET_PREFIX = "BSD"`` — short for one
customer's desk — written independently in the intake service, the ticket service
and the digest service. Every other company using the module would have had its
tickets numbered ``BSD-41``, with no way to change it without a code edit.

It lives in ``Workspace.settings["service_desk"]["ticket_prefix"]`` now, and the
default is the neutral ``SD``.

One property worth knowing: the prefix is **not stored on the ticket**. Display
ids are rendered from ``ticket_number`` on read, so changing a workspace's prefix
relabels its existing tickets too, and subject-line threading for mail already in
flight stops matching. That is the right trade for a desk being set up; it would
not have been for one already corresponding with customers.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

# Neutral default for a workspace that hasn't chosen one. Deliberately not the
# original "BSD": that stood for a specific customer's service desk, and every
# new workspace inheriting it was the bug, not a feature.
DEFAULT_TICKET_PREFIX = "SD"

# Uppercase letters/digits only, so the prefix is safe to embed in the matching
# regex without escaping and reads as an identifier in a subject line.
_VALID_PREFIX = re.compile(r"^[A-Z][A-Z0-9]{0,9}$")


def normalise_prefix(value: str | None) -> str | None:
    """Return a usable prefix, or None when the input isn't one."""
    if not value:
        return None
    candidate = value.strip().upper()
    return candidate if _VALID_PREFIX.match(candidate) else None


async def ticket_prefix(db: AsyncSession, workspace_id: str) -> str:
    """The workspace's ticket prefix, falling back to the legacy default."""
    from aexy.models.workspace import Workspace

    ws = await db.get(Workspace, workspace_id)
    settings = ((ws.settings or {}).get("service_desk") or {}) if ws else {}
    return normalise_prefix(settings.get("ticket_prefix")) or DEFAULT_TICKET_PREFIX


async def ticket_prefix_display(
    db: AsyncSession, workspace_id: str, ticket_number: int | None
) -> str:
    """``"ACME-41"`` — the customer-facing id."""
    return f"{await ticket_prefix(db, workspace_id)}-{ticket_number}"


def display_id(prefix: str, ticket_number: int | None) -> str:
    """Same rendering for callers that already resolved the prefix once.

    Listing endpoints render hundreds of these; re-reading the workspace row per
    row would be a query per ticket.
    """
    return f"{prefix}-{ticket_number}"


async def ticket_number_in_subject(
    db: AsyncSession, workspace_id: str, subject: str | None
) -> int | None:
    """Extract a ticket number from ``Re: ACME-41 …``, or None.

    Matches only *this workspace's* prefix, never an arbitrary one: a pattern like
    ``\\w+-(\\d+)`` would let any mail with a hyphenated token in its subject —
    "RE: INV-2024", "PO-8871" — attach itself to whichever ticket happened to
    carry that number.

    It briefly also accepted a hardcoded legacy prefix, to cover threads sent
    before the prefix became configurable. Nothing has shipped, so there are no
    such threads, and accepting a second prefix in perpetuity would mean a
    workspace could be threaded into by mail quoting a foreign id.
    """
    if not subject:
        return None
    prefix = await ticket_prefix(db, workspace_id)
    pattern = re.compile(rf"{re.escape(prefix)}-(\d+)", re.IGNORECASE)
    match = pattern.search(subject)
    return int(match.group(1)) if match else None


# Headers that mean "a machine sent this". The X-Auto* ones only ever appear on
# auto-responders, so their presence is enough; Precedence needs a value check
# because ordinary mail carries it too.
_AUTO_RESPONSE_MARKER_HEADERS = ("x-autoreply", "x-autorespond")
_AUTO_RESPONSE_PRECEDENCE = {"auto_reply", "auto-reply", "bulk", "junk", "list"}
_AUTO_RESPONSE_SUBJECT_RE = re.compile(
    r"out of (the )?office|auto[\s-]?repl(y|ied)|automatic repl(y|ied)|"
    r"on (annual )?leave|vacation repl(y|ied)|away from (my |the )?(desk|office)",
    re.IGNORECASE,
)

# The headers that answer "did a person write this?", for a caller that has to ask
# the provider for named headers rather than being handed the whole message.
AUTO_RESPONSE_HEADER_NAMES = (
    "Auto-Submitted",
    "Precedence",
    "X-Autoreply",
    "X-Autorespond",
)


def looks_automatic(headers: Mapping[str, str], subject: str | None) -> bool:
    """Whether these headers and subject read as machine-generated.

    Lives here rather than in the intake service because both directions need the
    same answer: inbound, so an out-of-office is not treated as a request; and
    outbound, so the desk's *own* vacation responder is not mistaken for a
    colleague having replied. Header keys must be lower-cased by the caller.
    """
    # RFC 3834: ordinary mail says "no"; every other value (often with
    # parameters, e.g. "auto-replied; owner-email=...") means automatic.
    auto_submitted = headers.get("auto-submitted", "").strip().lower()
    if auto_submitted and not auto_submitted.startswith("no"):
        return True
    if any(headers.get(name, "").strip() for name in _AUTO_RESPONSE_MARKER_HEADERS):
        return True
    if headers.get("precedence", "").strip().lower() in _AUTO_RESPONSE_PRECEDENCE:
        return True
    return bool(_AUTO_RESPONSE_SUBJECT_RE.search(subject or ""))


async def force_ticket_id_into_subject(
    db: AsyncSession, workspace_id: str, subject: str, ticket_number: int | None
) -> str:
    """``"[ACME-41] …"`` — the id present on every mail the desk sends out.

    One rule for all of them, because the subject is doing three jobs at once:
    it is the second (deliberate) path the inbound matcher reads, it is what a
    requester quotes when they write about the ticket again, and it is what a
    colleague's Gmail reply inherits as ``Re: …`` — the only way the id reaches a
    message this application never composed.

    A wrong number is not corrected: matching reads the first id in the subject,
    so overwriting the one a human typed would silently redirect their reply. The
    id is added when this ticket's own is absent, and otherwise left alone.
    """
    if ticket_number is None:
        return subject
    if await ticket_number_in_subject(db, workspace_id, subject) == ticket_number:
        return subject
    prefix = await ticket_prefix(db, workspace_id)
    return f"[{display_id(prefix, ticket_number)}] {subject}"
