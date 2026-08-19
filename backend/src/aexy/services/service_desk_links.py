"""The links the desk's own mail carries.

Every acknowledgement and closure the desk sent was a dead end: a ticket id in
prose and nothing to click. The requester's only way back in was to reply to the
mail and hope, and the KAM reading a digest had to find the ticket by hand.

Which link a message carries is decided by **who is reading it**, not by which
message it is:

* **A member of the workspace** — a colleague reading a digest, or the requester
  themselves when they wrote in from inside (``TicketOrigin.INTERNAL``) — gets
  the in-app ticket. It is behind the workspace's own authorization and shows
  exactly what their role allows, so it needs no decision from anybody and mints
  no token. This is the better link where it applies: more of the ticket, and
  nothing published to get it.

* **Everybody else** — the partner, the vendor, the person with no account —
  gets the public share view (``/public/tickets/{token}``): a filtered,
  read-only page where the token *is* the authorization. That is publishing, so
  it is **off unless a workspace turns it on** (``public_ticket_links_enabled``).

The default matters more than it looks. A desk handling insurance documents
should not start minting share tokens for every ticket it acknowledges because
the product shipped an upgrade, and "on unless you edit the template" is not a
control anybody would recognise as one. With it off, the copy still holds
``{{ticket_url}}``; it simply renders empty and the surrounding ``{% if %}``
drops the sentence.

Note what the split does *not* do: an external requester is never handed an
in-app URL as a consolation. That link is a login wall for a workspace they have
no account in, which reads as a broken link rather than a missing one.

A token is minted lazily even for those who get one — at the moment an
acknowledgement that uses it is queued, never at ticket creation — so a desk
that has AI, receipts or the link itself switched off never publishes one.
"""

from __future__ import annotations

import logging
import secrets
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.ticketing import Ticket, TicketShareLink
from aexy.models.workspace import WorkspaceMember

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return get_settings().frontend_url.rstrip("/")


def app_ticket_url(ticket_id: str) -> str:
    """The in-app ticket, for people who are members of the workspace."""
    return f"{_base_url()}/service-desk/tickets/{ticket_id}"


def desk_queue_url() -> str:
    """The desk's own queue — what a digest links to as a whole."""
    return f"{_base_url()}/service-desk/tickets"


def share_url(token: str) -> str:
    return f"{_base_url()}/public/tickets/{token}"


async def public_links_enabled(db: AsyncSession, workspace_id: str) -> bool:
    """Whether this workspace publishes a no-account view of its own tickets.

    **Off by default, and deliberately.** Every other switch in this change
    resolves to a sensible default and inherits; this one does not, because
    turning it on is a decision to serve ticket subjects, requester names and
    attachments to anyone holding a URL. A default that publishes is not a
    default anybody chose.
    """
    from aexy.models.workspace import Workspace

    ws = await db.get(Workspace, workspace_id)
    if ws is None:
        return False
    sd = (ws.settings or {}).get("service_desk") or {}
    return bool(sd.get("public_ticket_links_enabled", False))


async def _requester_is_a_member(db: AsyncSession, ticket: Ticket) -> bool:
    """Whether the person who opened this ticket can just open it in the app.

    Matched on the submitter's address against active workspace membership.
    Deliberately not on ``TicketOrigin.INTERNAL``: that flag says the sender was
    on the desk's own mail domain, which is a good guess at "colleague" and not
    the same question. A contractor on a partner domain who has an account
    should get the app; a shared alias on the company domain that belongs to
    nobody should not.
    """
    address = (ticket.submitter_email or "").strip().lower()
    if not address:
        return False
    found = (
        await db.execute(
            select(WorkspaceMember.id)
            .join(Developer, Developer.id == WorkspaceMember.developer_id)
            .where(
                WorkspaceMember.workspace_id == ticket.workspace_id,
                WorkspaceMember.status == "active",
                func.lower(Developer.email) == address,
            )
            .limit(1)
        )
    ).first()
    return found is not None


async def ensure_requester_url(db: AsyncSession, ticket: Ticket) -> str:
    """The public URL a requester can open, minting a share link if needed.

    Reuses whatever link the ticket already has — including one an operator
    created by hand from the share dialog — so a ticket never accumulates a
    second token, and revoking the one in the dialog also kills the one in the
    email. A revoked link is deliberately *not* silently re-enabled: somebody
    turned it off, and the mail simply goes out without a link.

    A requester who is a member of the workspace gets the in-app ticket instead,
    and no token is created for them at all — see ``_requester_is_a_member``.

    Returns "" when the requester is external and the workspace has not switched
    public links on, which is the default. Checked here rather than at each call
    site so no future caller can publish a ticket by forgetting to ask.

    Never raises. A receipt that would have been useful with a link is still
    worth sending without one.
    """
    if await _requester_is_a_member(db, ticket):
        return app_ticket_url(ticket.id)
    if not await public_links_enabled(db, ticket.workspace_id):
        return ""
    try:
        link = (
            await db.execute(
                select(TicketShareLink)
                .where(TicketShareLink.ticket_id == ticket.id)
                .order_by(TicketShareLink.created_at.desc())
                .limit(1)
            )
        ).scalars().first()
        if link is not None:
            return share_url(link.token) if link.is_active else ""
        link = TicketShareLink(
            id=str(uuid4()),
            ticket_id=ticket.id,
            workspace_id=ticket.workspace_id,
            # Same generator and width the share dialog uses — 128 bits, so the
            # token itself is the authorization for an unauthenticated page.
            token=secrets.token_urlsafe(16),
            is_active=True,
        )
        # Savepoint, because the failure this swallows is a failed INSERT, and a
        # failed flush leaves the session needing a rollback. Catching it without
        # one would trade "no link in the email" for every later statement in
        # intake dying of PendingRollbackError — the ticket itself would be lost.
        async with db.begin_nested():
            db.add(link)
        return share_url(link.token)
    except Exception as exc:  # noqa: BLE001 — a missing link must not stop the mail
        logger.info("Service desk: could not mint a share link for %s (%s)", ticket.id, exc)
        return ""
