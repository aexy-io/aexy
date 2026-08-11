"""Which mail a connected Gmail account keeps out of Aexy.

Connecting a personal mailbox to a shared workspace is only a reasonable thing
to ask if some of it can be kept out. Two mechanisms, deliberately different in
kind:

* **rules** — standing, by address or domain, evaluated *before* a message
  becomes a ``SyncedEmail``. Excluded mail leaves no body, snippet or
  attachment preview to be scrubbed later, because it was never written.
* **hidden messages** — one message, hidden after the fact. The row is deleted
  and a tombstone kept, because ``_sync_message`` treats the presence of a
  ``SyncedEmail`` row as "already seen": without the tombstone the next full
  sync re-imports what somebody just hid.

Everything here is scoped to one integration. Rules belong to the person who
connected the mailbox, not to the workspace.
"""

from __future__ import annotations

import logging
import re
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.google_integration import (
    GoogleSyncExclusionRule,
    GoogleSyncHiddenMessage,
    SyncedEmail,
)

logger = logging.getLogger(__name__)

KINDS = ("address", "domain")
MATCH_SCOPES = ("participants", "sender")

# Deliberately loose. This validates the *shape* of what someone typed so a
# stray "@" or a pasted display name doesn't silently become a rule that matches
# nothing; it is not an attempt to decide what a deliverable address is.
_ADDRESS_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_DOMAIN_RE = re.compile(r"^[^@\s.]+(\.[^@\s.]+)+$")


class ExclusionValueError(ValueError):
    """The address or domain as typed cannot match anything."""


def normalise_value(kind: str, value: str) -> str:
    """Lowercase, trimmed, and stored in the one shape matching expects.

    A domain is stored bare — ``acme.com``, never ``@acme.com`` — so a match is
    one comparison rather than two shapes. Somebody typing the ``@`` is doing
    the obviously intended thing, so it is accepted and stripped rather than
    rejected.
    """
    if kind not in KINDS:
        raise ExclusionValueError(f"Unknown exclusion kind {kind!r}")

    cleaned = (value or "").strip().lower()
    if kind == "domain":
        cleaned = cleaned.lstrip("@")

    if not cleaned:
        raise ExclusionValueError("An exclusion needs an address or a domain")

    pattern = _ADDRESS_RE if kind == "address" else _DOMAIN_RE
    if not pattern.match(cleaned):
        raise ExclusionValueError(
            f"{value!r} does not look like {'an email address' if kind == 'address' else 'a domain'}"
        )
    return cleaned


def address_of(raw: str | None) -> str | None:
    """The bare address out of whatever Gmail put in the header.

    Headers arrive as ``Bob <bob@acme.com>`` as often as ``bob@acme.com``, and a
    rule that only matched the second form would look like it was working while
    letting most mail through.
    """
    if not raw:
        return None
    candidate = raw.strip().lower()
    if "<" in candidate and ">" in candidate:
        candidate = candidate[candidate.rfind("<") + 1 : candidate.rfind(">")]
    candidate = candidate.strip().strip(",;")
    return candidate or None


def _domain_of(address: str | None) -> str | None:
    if not address or "@" not in address:
        return None
    return address.rsplit("@", 1)[1] or None


def participants(
    from_email: str | None,
    to_emails: list[str] | None,
    cc_emails: list[str] | None,
) -> set[str]:
    """Every address on a message, normalised.

    Includes recipients, which is the whole point. Matching only ``from_email``
    would leave your own replies to a hidden correspondent in place — they carry
    the counterparty in ``to_emails`` — so hiding someone that way still exposes
    half the conversation.
    """
    found: set[str] = set()
    for raw in [from_email, *(to_emails or []), *(cc_emails or [])]:
        address = address_of(raw)
        if address:
            found.add(address)
    return found


def rule_matches(
    rule: GoogleSyncExclusionRule,
    from_email: str | None,
    to_emails: list[str] | None,
    cc_emails: list[str] | None,
) -> bool:
    """Whether this rule covers this message."""
    if rule.match_scope == "sender":
        sender = address_of(from_email)
        addresses = {sender} if sender else set()
    else:
        addresses = participants(from_email, to_emails, cc_emails)

    if not addresses:
        return False

    if rule.kind == "address":
        return rule.value in addresses
    return any(_domain_of(address) == rule.value for address in addresses)


def matching_rule(
    rules: list[GoogleSyncExclusionRule],
    from_email: str | None,
    to_emails: list[str] | None,
    cc_emails: list[str] | None,
) -> GoogleSyncExclusionRule | None:
    """The first rule covering this message, or None."""
    for rule in rules:
        if rule_matches(rule, from_email, to_emails, cc_emails):
            return rule
    return None


class GmailSyncExclusionService:
    """Reads and writes one integration's exclusions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_rules(self, integration_id: str) -> list[GoogleSyncExclusionRule]:
        result = await self.db.execute(
            select(GoogleSyncExclusionRule)
            .where(GoogleSyncExclusionRule.integration_id == integration_id)
            .order_by(GoogleSyncExclusionRule.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_rule(
        self,
        integration_id: str,
        workspace_id: str,
        kind: str,
        value: str,
        match_scope: str = "participants",
        actor_id: str | None = None,
    ) -> GoogleSyncExclusionRule:
        """Add a rule, or return the one that already says this.

        Idempotent rather than a 409: asking twice for mail to stay out is not
        an error, and the caller wants the rule either way.
        """
        if match_scope not in MATCH_SCOPES:
            raise ExclusionValueError(f"Unknown match scope {match_scope!r}")
        normalised = normalise_value(kind, value)

        existing = (
            await self.db.execute(
                select(GoogleSyncExclusionRule).where(
                    GoogleSyncExclusionRule.integration_id == integration_id,
                    GoogleSyncExclusionRule.kind == kind,
                    GoogleSyncExclusionRule.value == normalised,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing

        rule = GoogleSyncExclusionRule(
            id=str(uuid4()),
            integration_id=integration_id,
            workspace_id=workspace_id,
            kind=kind,
            value=normalised,
            match_scope=match_scope,
            created_by_id=actor_id,
        )
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def delete_rule(self, integration_id: str, rule_id: str) -> bool:
        """Stop excluding future mail. Already-purged mail stays gone.

        Deliberate: the tombstones a purge wrote survive, so deleting a rule
        does not resurrect months of mail somebody chose to remove. Re-syncing
        it is a separate, explicit act.
        """
        rule = (
            await self.db.execute(
                select(GoogleSyncExclusionRule).where(
                    GoogleSyncExclusionRule.id == rule_id,
                    GoogleSyncExclusionRule.integration_id == integration_id,
                )
            )
        ).scalar_one_or_none()
        if rule is None:
            return False
        await self.db.delete(rule)
        await self.db.flush()
        return True

    async def is_hidden(self, integration_id: str, gmail_id: str) -> bool:
        found = (
            await self.db.execute(
                select(GoogleSyncHiddenMessage.id).where(
                    GoogleSyncHiddenMessage.integration_id == integration_id,
                    GoogleSyncHiddenMessage.gmail_id == gmail_id,
                )
            )
        ).first()
        return found is not None

    async def hide_message(
        self,
        integration_id: str,
        workspace_id: str,
        gmail_id: str,
        actor_id: str | None = None,
        rule_id: str | None = None,
    ) -> None:
        """Delete the synced row and remember that it must not come back.

        The order matters less than the pairing: without the tombstone the next
        full sync re-imports the message, because the row that was just deleted
        was also the "already seen" marker.
        """
        if not await self.is_hidden(integration_id, gmail_id):
            self.db.add(
                GoogleSyncHiddenMessage(
                    id=str(uuid4()),
                    integration_id=integration_id,
                    workspace_id=workspace_id,
                    gmail_id=gmail_id,
                    rule_id=rule_id,
                    hidden_by_id=actor_id,
                )
            )
        await self.db.execute(
            delete(SyncedEmail).where(
                SyncedEmail.integration_id == integration_id,
                SyncedEmail.gmail_id == gmail_id,
            )
        )
        await self.db.flush()

    async def purge_for_rule(
        self,
        integration_id: str,
        workspace_id: str,
        rule: GoogleSyncExclusionRule,
        actor_id: str | None = None,
    ) -> int:
        """Remove already-synced mail the new rule covers.

        "Hide mail from this domain" that leaves last month's in the CRM is not
        what anyone means by hide, so a rule applies backwards as well as
        forwards. Returns how many messages were removed.
        """
        candidates = (
            await self.db.execute(
                select(SyncedEmail).where(
                    SyncedEmail.integration_id == integration_id
                )
            )
        ).scalars().all()

        removed = 0
        for email in candidates:
            if not rule_matches(rule, email.from_email, email.to_emails, email.cc_emails):
                continue
            await self.hide_message(
                integration_id=integration_id,
                workspace_id=workspace_id,
                gmail_id=email.gmail_id,
                actor_id=actor_id,
                rule_id=str(rule.id),
            )
            removed += 1

        if removed:
            logger.info(
                "Purged %s synced messages for exclusion rule %s (%s %s)",
                removed,
                rule.id,
                rule.kind,
                rule.value,
            )
        return removed
