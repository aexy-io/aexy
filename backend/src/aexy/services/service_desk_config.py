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


# How often a Gmail-backed desk mailbox is polled for new mail, in minutes.
#
# A desk mailbox used to inherit ``GoogleIntegration.auto_sync_interval_minutes``
# — the same setting a personal inbox uses, defaulting to 15 — so a request
# waited up to a quarter of an hour before it was a ticket, and nothing on the
# Service Desk pages said so or could change it. Registering a mailbox as an
# intake source is a statement about latency, and this is where it is expressed.
DEFAULT_INTAKE_POLL_MINUTES = 2

# One minute is the schedule's own tick, so nothing below it can be honoured.
# The ceiling is there to stop a desk being configured into the behaviour this
# replaced without anyone noticing.
MIN_INTAKE_POLL_MINUTES = 1
MAX_INTAKE_POLL_MINUTES = 60


def normalise_poll_minutes(value: object) -> int | None:
    """Clamp a supplied intake interval, or None when it isn't one."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    minutes = int(value)
    if minutes < MIN_INTAKE_POLL_MINUTES or minutes > MAX_INTAKE_POLL_MINUTES:
        return None
    return minutes


async def intake_poll_minutes(db: AsyncSession, workspace_id: str) -> int:
    """How often this workspace's desk mailboxes are polled."""
    from aexy.models.workspace import Workspace

    ws = await db.get(Workspace, workspace_id)
    settings = ((ws.settings or {}).get("service_desk") or {}) if ws else {}
    return normalise_poll_minutes(settings.get("intake_poll_minutes")) or DEFAULT_INTAKE_POLL_MINUTES


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


# Two-label suffixes under which anybody may register. Configuring one as an
# account domain would make every sender in a country match that account once
# subdomain matching is on, so the write path refuses them.
#
# Deliberately a short, explicit list rather than a public-suffix library: the
# real list is thousands of entries, needs updating, and (in the usual
# implementation) is fetched over the network at import time. These are the ones
# a desk actually mistypes. It is a guard rail, not a boundary — a suffix that
# slips through still needs somebody to have typed it into Master Data.
PUBLIC_SUFFIXES: frozenset[str] = frozenset(
    {
        "co.in", "co.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.il", "co.id",
        "com.au", "com.br", "com.cn", "com.mx", "com.sg", "com.tr", "com.tw",
        "net.au", "org.au", "org.uk", "ac.in", "ac.uk", "gov.in", "gov.uk",
        "net.in", "org.in", "firm.in", "gen.in", "ind.in",
    }
)


def domain_is_too_broad(domain: str) -> bool:
    """Whether matching this domain would claim senders it has no business with.

    A single label ("com") or a public suffix ("co.in") is not an organisation,
    and with subdomain matching in force it would hand one account every sender
    in a registry.
    """
    cleaned = domain.strip().lower().lstrip("@").rstrip(".")
    if not cleaned or cleaned.count(".") == 0:
        return True
    return cleaned in PUBLIC_SUFFIXES


def domain_candidates(domain: str | None) -> list[str]:
    """A sender domain and the parent domains it belongs to, most specific first.

    ``mail.eu.partner.com`` is mail from ``partner.com``, and a desk that has
    mapped the partner should not have to enumerate its subdomains — an exact
    equality check was why a partner writing from a regional or marketing
    subdomain arrived unattributed and landed on an arbitrary owner.

    The bare TLD is dropped and so is any known public suffix: no account should
    ever match on "com", and ``partner.co.in`` must not also be read as mail from
    "co.in". Dropping them here rather than only at the write path means a row
    saved before that guard existed still cannot claim a country's mail.

    The rest are returned longest-first so a caller can prefer the most specific
    mapping, which is what lets ``partner.com`` and ``claims.partner.com``
    coexist and point at different owners.
    """
    cleaned = (domain or "").strip().lower().rstrip(".").rstrip(">")
    if not cleaned or "." not in cleaned:
        return []
    labels = cleaned.split(".")
    return [
        candidate
        for candidate in (".".join(labels[i:]) for i in range(len(labels) - 1))
        if candidate not in PUBLIC_SUFFIXES
    ]


def digest_enabled(service_desk_settings: Mapping[str, object]) -> bool:
    """Whether this desk wants its open-ticket digest at all.

    On by default, because a desk that has never opened these settings is better
    served by being told what is open than by silence. But it is a real switch
    now: there was previously no value that turned the digest off — an empty
    hour list fell back to the default, and the API refused to store one — so
    three emails a day was a mail filter's problem to solve.
    """
    return bool(service_desk_settings.get("digest_enabled", True))


UNMATCHED_ASSIGNMENT_CHOICES: tuple[str, ...] = ("random", "unassigned", "desk_head")


def unmatched_assignment(service_desk_settings: Mapping[str, object]) -> str:
    """What to do with a ticket whose account intake could not identify.

    Defaults to ``"random"``, which is what the desk has always done, so no
    existing workspace changes behaviour on upgrade. It is also the option that
    hid the problem: an arbitrarily-assigned ticket is indistinguishable from a
    deliberately-assigned one, so a missing domain mapping in Master Data
    surfaced only as a KAM asking why a partner they do not handle is in their
    queue. ``"unassigned"`` leaves it visibly waiting instead, and
    ``"desk_head"`` gives every unmatched ticket to one accountable person.

    An unrecognised stored value falls back to the default rather than raising:
    this is read on the intake path, and refusing to route mail because a
    settings blob is odd would drop tickets on the floor.
    """
    value = service_desk_settings.get("unmatched_assignment")
    if isinstance(value, str) and value in UNMATCHED_ASSIGNMENT_CHOICES:
        return value
    return "random"


def normalise_email_list(values: object) -> list[str]:
    """Clean a list of plain addresses, dropping anything that isn't one.

    Used for the digest's extra recipients: managers who want the desk's summary
    without being in the department that runs it. Deliberately addresses only —
    no domains — because unlike the ignore list this one *sends* somewhere, and a
    domain would name nobody.
    """
    if not isinstance(values, (list, tuple, set)):
        return []
    cleaned: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        entry = value.strip().lower()
        if "@" not in entry or " " in entry or entry in cleaned:
            continue
        cleaned.append(entry)
    return cleaned


def normalise_id_list(values: object) -> list[str]:
    """Clean a list of developer ids (the digest's opt-outs)."""
    if not isinstance(values, (list, tuple, set)):
        return []
    cleaned: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        entry = value.strip()
        if entry and entry not in cleaned:
            cleaned.append(entry)
    return cleaned


def normalise_ignored_senders(values: object) -> list[str]:
    """Clean an Ops-supplied ignore list into lower-cased addresses and domains.

    Deliberately a list somebody writes, not a pattern this module guesses. A
    heuristic on ``no-reply@`` would have dropped an insurer's own notices — the
    work an ops desk exists to do — so nothing is ignored until a human says which
    sender is noise. ``@`` decides the kind: ``no-reply@accounts.google.com`` is
    one address, ``accounts.google.com`` is every sender at that domain.
    """
    if not isinstance(values, (list, tuple, set)):
        return []
    cleaned: list[str] = []
    for value in values:
        # Strings only. ``str(None)`` is "none", which would silently become a
        # domain nobody typed.
        if not isinstance(value, str):
            continue
        entry = value.strip().lower().lstrip("@")
        if not entry or " " in entry or entry in cleaned:
            continue
        cleaned.append(entry)
    return cleaned


def sender_is_ignored(
    address: str | None, domain: str | None, ignored: list[str]
) -> bool:
    """Whether an ignore-list entry covers this sender."""
    if not ignored:
        return False
    return any(entry == address or entry == domain for entry in ignored if entry)


def address_is_ignored(address: str | None, ignored: list[str]) -> bool:
    """Whether the ignore list names this *exact address*, not just its domain.

    The distinction decides whether Master Data may override the entry. A bare
    domain is a broad statement about a counterparty, and one written in passing
    must not be able to silence a partner somebody deliberately configured. A
    whole address is the opposite: somebody typed ``dailyreport@partner.com``,
    which is only ever written by a person who has seen that mail and decided it
    is not a request.
    """
    if not address or not ignored:
        return False
    return any(entry == address for entry in ignored if entry)


# Headers that name the person a message was originally from, when the address
# in `From:` is a forwarder rather than the author. `Resent-From` is the RFC 5322
# one; the `X-` names are what real forwarders and mail gateways actually emit.
# `Reply-To` is last and least trusted — on ordinary mail it is usually the
# sender themselves, and it only tells us anything when it points elsewhere.
_ORIGIN_HEADERS = (
    "resent-from",
    "x-original-from",
    "x-original-sender",
    "x-forwarded-for",
    "reply-to",
)

# The `From:` line inside a forwarded block. Gmail writes "---------- Forwarded
# message ---------", Outlook writes "From: ... Sent: ... To:"; both put the
# original author on a line of their own, which is all this needs.
_QUOTED_FROM_RE = re.compile(r"^\s*(?:>\s*)*from:\s*(.+)$", re.IGNORECASE | re.MULTILINE)

_ADDRESS_RE = re.compile(r"[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+")

# Only the top of the body is read. A long thread accumulates every earlier
# message's headers, and the tenth `From:` down is not who sent this one.
_QUOTED_SCAN_LINES = 40


def forwarded_sender(
    headers: Mapping[str, str], body_text: str | None, internal_domain: str | None
) -> str | None:
    """Who actually wrote a message that a colleague forwarded to the desk.

    Mail forwarded into a shared mailbox arrives *from* the person who forwarded
    it, so a desk on ``ops@acme.com`` sees ``acme.com`` and concludes there is no
    account to infer — the ticket is flagged for triage and handed to an
    arbitrary member of the desk. Every forwarded partner request lands on the
    wrong owner, and the routing looks broken when the mapping is fine.

    Sources are tried most trustworthy first: the headers a forwarder sets, then
    the quoted ``From:`` line the mail client wrote into the body.

    Two deliberate limits:

    * The result is ignored unless it is on a **different domain** to the desk's
      own. A colleague's ordinary internal mail names themselves in ``Reply-To``,
      and attributing that to an account would be worse than not attributing it.
    * The body is only read here — the one case where the alternative is no
      attribution at all. Body text is written by whoever sent the mail, so it
      decides which account a ticket is filed against and nothing else; it grants
      no access, and the ticket stays flagged for a human either way.
    """
    for name in _ORIGIN_HEADERS:
        candidate = _first_address(headers.get(name))
        if candidate and _domain(candidate) != internal_domain:
            return candidate

    for match in _QUOTED_FROM_RE.finditer(
        "\n".join((body_text or "").splitlines()[:_QUOTED_SCAN_LINES])
    ):
        candidate = _first_address(match.group(1))
        if candidate and _domain(candidate) != internal_domain:
            return candidate
    return None


def _first_address(value: str | None) -> str | None:
    if not value:
        return None
    found = _ADDRESS_RE.search(value)
    return found.group(0).lower() if found else None


def _domain(address: str) -> str | None:
    return address.rsplit("@", 1)[-1] if "@" in address else None


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
