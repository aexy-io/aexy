"""Service Desk intake — turn an inbound email into a tracked ticket.

One entry point (``ingest``) is shared by both channels (provider inbound-parse
webhook and Gmail sync). It threads replies onto existing tickets, otherwise
runs domain-based auto-assignment (account → vendor → internal → arbitrary
owner fallback), creates the ``Ticket`` + ``ServiceDeskTicket`` + opens the first
``TicketPendingSegment``, then best-effort AI-classifies and sends the receipt.

Which stakeholder a new ticket starts with, and what request type it is triaged
as, come from the workspace's taxonomy rather than from a shared enum — see
``service_desk_taxonomy``.
"""

import json
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import NamedTuple
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import DepartmentMember
from aexy.models.service_desk import (
    MailboxChannel,
    ServiceDeskIngestedMessage,
    ServiceDeskVendor,
    ServiceDeskVendorDomain,
    ServiceDeskProduct,
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskAccountProduct,
    ServiceDeskTicket,
    TicketOrigin,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse, TicketStatus
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services.service_desk_config import (
    address_is_ignored,
    display_id as render_display_id,
    domain_candidates,
    forwarded_sender,
    force_ticket_id_into_subject,
    looks_automatic,
    message_recipients,
    normalise_ignored_senders,
    sender_is_ignored,
    ticket_number_in_subject,
    ticket_prefix,
    ticket_prefix_display,
)
from aexy.services.service_desk_links import ensure_requester_url
from aexy.services.service_desk_templates import template_references
from aexy.services.service_desk_mailer import OUTBOUND_MARKER_HEADER
from aexy.services.service_desk_industry_templates import SEMANTIC_EXTERNAL
from aexy.services.service_desk_taxonomy import external_slug_for, load_taxonomy

logger = logging.getLogger(__name__)

# How many addresses of one thread are kept for reply-all. A long chain of
# forwards accumulates dozens, and the compose box has to stay something a person
# can read and edit before they send to all of them.
THREAD_PARTICIPANT_LIMIT = 25

SERVICE_DESK_FORM_SLUG = "service-desk"
# Stands in for the requester on a ticket logged by phone or WhatsApp, where
# there may be no email address at all. It is not deliverable, so the
# acknowledgement recognises it and stays put rather than attempting a send.
MANUAL_SENDER_ADDRESS = "manual@local"
# What `acknowledge_ticket` reports. Only ACK_FAILED is worth another attempt.
ACK_SENT = "sent"
ACK_NOTHING_TO_DO = "nothing_to_do"
ACK_FAILED = "failed"
_TICKET_NUMBER_ATTEMPTS = 5
_MAX_ISSUES_PER_EMAIL = 5
# An email may only be auto-split into two tickets, and only when the model is
# this sure about both halves. Anything less certain stays one triage ticket —
# a human merging two tickets costs more than a human splitting one.
_SPLIT_MIN_CONFIDENCE = 0.85
# Attaching a stakeholder's mail to the wrong ticket is worse than opening one
# extra ticket, because one company's correspondence about different requests
# often reads almost identically. So a content match must be both confident and
# unambiguous, and it is only ever attempted for a sender already known to
# master data.
# Below this the model is guessing, so a human is asked to confirm the fields.
_LOW_CONFIDENCE = 0.6

# How many past corrections are shown to the classifier. Small on purpose: they
# are prompt text, so every extra example is paid for on every classification,
# and beyond a handful they crowd out the message actually being read.
_MAX_CORRECTION_EXAMPLES = 8
_AI_MATCH_MIN_CONFIDENCE = 0.85
_AI_MATCH_MAX_CANDIDATES = 20


class FlushOutcome(NamedTuple):
    """What one ``flush_notifications`` call actually did.

    ``skipped`` is a queued acknowledgement that never left and never will: a
    colleague answered the requester by hand first, or this deployment has no
    channel configured to send on. Retrying either changes nothing, which is why
    it is counted apart from ``failed``.
    """

    sent: int
    failed: int
    skipped: int


def _domain_of(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[-1].strip().lower().rstrip(">")


def _address_of(email: str | None) -> str | None:
    """The bare sender address, lower-cased, display name and brackets stripped.

    Account/vendor records may be keyed on a whole address as well as a domain,
    so several distinct companies can be tested from one real mailbox using
    plus-suffixes (`me+abcfinance@gmail.com`). A shared-domain provider like
    gmail.com cannot otherwise represent more than one company.
    """
    if not email or "@" not in email:
        return None
    addr = email.strip()
    if "<" in addr and ">" in addr:
        addr = addr[addr.rindex("<") + 1 : addr.rindex(">")]
    return addr.strip().lower()


async def ai_classification_enabled(db: AsyncSession, workspace_id: str) -> bool:
    """Whether AI may read this workspace's desk mail.

    The single gate for every AI-dependent behaviour in the desk: classification,
    product/request-type inference, thread matching and auto-split.

    It **follows the workspace's own AI switch** (``WorkspaceAISettings.
    ai_enabled``) rather than asking for a second, separate yes. A per-feature
    opt-in that defaulted off meant a workspace could turn AI on, see nothing
    happen, and have no way to tell which of two switches was the reason — and
    the workspace-level switch already exists precisely to be the one answer to
    "AI on our data, or not".

    The desk keeps a veto, not a duplicate: an explicit ``False`` stored here is
    a deliberate "not on the service desk" and survives the workspace switch
    being on. Absent (the common case) means inherit. An explicit ``True`` is
    the value written before this was inheritable; it reads as inherit, because
    the LLM gateway refuses the call anyway when the workspace has AI off.
    """
    from aexy.services.workspace_ai_settings_service import is_ai_enabled

    ws = await db.get(Workspace, workspace_id)
    if ws is None:
        return False
    if ((ws.settings or {}).get("service_desk") or {}).get("ai_classification_enabled") is False:
        return False
    return await is_ai_enabled(db, workspace_id)


async def attachment_previews_enabled(db: AsyncSession, workspace_id: str) -> bool:
    """Whether intake may read attachment *bytes* to build classifier previews.

    Deliberately its own opt-in rather than riding on ``ai_classification_enabled``.
    Classifying a subject and a body reads text the desk was sent anyway; opening
    the PDF attached to it is a different question about a customer's documents,
    and inheriting a workspace-wide "AI is fine" default would answer it on
    somebody's behalf. Off unless switched on.
    """
    ws = await db.get(Workspace, workspace_id)
    if ws is None:
        return False
    sd = (ws.settings or {}).get("service_desk") or {}
    if not bool(sd.get("ai_attachment_previews_enabled", False)):
        return False
    return await ai_classification_enabled(db, workspace_id)


def stamp_assignment_note(ticket: Ticket, note: str) -> TicketResponse:
    """Record why a ticket has the owner it has, in both places it gets read.

    The timeline entry is what somebody scrolls to. The copy on the ticket is
    what the detail endpoint reads to show the reason at the top, without having
    to guess which of a ticket's internal notes was the routing one — a guess
    that would sooner or later show an AI-match note as an assignment reason.

    Returns the timeline row for the caller to add; the ticket is updated here.
    """
    values = dict(ticket.field_values or {})
    values["assignment_note"] = note
    ticket.field_values = values
    return TicketResponse(
        id=str(uuid4()),
        ticket_id=ticket.id,
        content=note,
        is_internal=True,
    )


def is_aexy_generated(email: InboundEmail) -> bool:
    """True for mail this application sent (see ``OUTBOUND_MARKER_HEADER``)."""
    return bool((email.headers or {}).get(OUTBOUND_MARKER_HEADER.lower(), "").strip())


def is_desk_own_mail(email: InboundEmail, mailbox: ServiceDeskMailbox | None) -> bool:
    """True when the desk address itself sent this message.

    The marker header only covers mail *this application* sent. A reply someone
    types in Gmail from the shared desk address carries no marker, and the
    incremental Gmail sync walks History ``messagesAdded``, which includes SENT —
    so the desk's own outbound comes back through the sync as if it were inbound.
    Ingesting it as a request made the desk its own requester: a ticket whose
    submitter was the desk address, acknowledged to the desk address.

    Deliberately an exact-address test, not a domain test: a colleague writing in
    from the same domain is a real request (see ``TicketOrigin.INTERNAL``).
    """
    if mailbox is None:
        return False
    sender = _address_of(email.from_email)
    return sender is not None and sender == (mailbox.address or "").strip().lower()


def is_automatic_response(email: InboundEmail) -> bool:
    """True for out-of-office replies, auto-responders and bulk machine mail.

    These carry no request: acknowledging them invites a reply loop, splitting
    them invents work, and reopening a closed ticket from one hides a closure
    the requester never disputed.

    The predicate itself is shared with the outbound side, which has to ask the
    same question about the desk's own mail — see ``looks_automatic``.
    """
    return looks_automatic(email.headers or {}, email.subject)


class ServiceDeskIntakeService:
    """Intake for one inbound message.

    Outbound acknowledgements are NOT sent inline: they are queued and sent by
    ``flush_notifications()``, which callers invoke *after* committing. Sending
    inline meant a requester could be acknowledged for a ticket whose
    transaction then rolled back.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._pending_notifications: list[dict] = []

    # ------------------------------------------------------------------ public

    async def ingest(
        self,
        email: InboundEmail,
        mailbox: ServiceDeskMailbox,
        source: str,
    ) -> Ticket | None:
        """Ingest one inbound email for a service-desk mailbox.

        Returns the created or updated ticket, or None if it was a duplicate.
        """
        workspace_id = mailbox.workspace_id

        # 0) Never ingest our own outbound. Checked before the message id is even
        #    claimed, so a receipt we sent leaves no trace on the way back in.
        if is_aexy_generated(email):
            logger.info("Service desk: skipped self-generated message %s", email.message_id)
            return None

        # 0b) Mail the desk itself sent, but that this application did not
        #     compose — somebody answered from Gmail. It belongs on the ticket as
        #     outgoing correspondence, never as a new request.
        if is_desk_own_mail(email, mailbox):
            return await self._record_desk_reply(workspace_id, email, mailbox)

        # 0c) A sender Ops has chosen to ignore. Nothing is inferred here: a
        #     no-reply address is a perfectly ordinary way for a counterparty to
        #     send the notices a desk acts on, so only an explicit entry drops mail.
        if await self._sender_is_ignored(workspace_id, email):
            logger.info(
                "Service desk: sender %s is on this workspace's ignore list (%s)",
                email.from_email,
                email.message_id,
            )
            return None

        automatic = is_automatic_response(email)

        # 1) Idempotency — claim this message id first. The unique constraint on
        #    (workspace_id, message_id) is what actually makes this safe: two
        #    concurrent deliveries of the same message both pass a bare SELECT.
        #    Covers replies too, not just the first message of a thread.
        if email.message_id and not await self._claim_message(workspace_id, email.message_id):
            logger.info("Service desk: duplicate message %s ignored", email.message_id)
            return None

        # 2) Threading — append to an existing ticket if this is a reply
        existing = await self._find_thread_ticket(workspace_id, email)
        match_note: str | None = None
        suggestion: str | None = None
        if existing is None and not automatic and await self._ai_enabled(workspace_id):
            # 2b) Deterministic matching found nothing. With AI on, a stakeholder
            #     who started a fresh thread and dropped the ticket number can
            #     still be reunited with their ticket — but only on a confident,
            #     single candidate. Anything else falls through to a new ticket.
            existing, match_note, suggestion = await self._ai_match_ticket(workspace_id, email)
        if existing is not None:
            await self._append_reply(
                workspace_id, existing, email, mailbox, automatic=automatic
            )
            if match_note:
                # Visible on the timeline so a human can see the merge happened,
                # why, and undo it if the model was wrong.
                self.db.add(
                    TicketResponse(
                        id=str(uuid4()),
                        ticket_id=existing.id,
                        content=match_note,
                        is_internal=True,
                    )
                )
                await self.db.flush()
            await self._link_message(workspace_id, email.message_id, existing.id)
            return existing

        # 3) New ticket
        ticket = await self.create_ticket(
            workspace_id, email, mailbox, source, automatic=automatic, suggestion=suggestion
        )
        await self._link_message(workspace_id, email.message_id, ticket.id)
        return ticket

    async def _sender_is_ignored(self, workspace_id: str, email: InboundEmail) -> bool:
        """Whether this workspace has listed this sender as noise.

        Ops maintains the list ("Ignored senders" in Service Desk settings). The
        alternative — inferring it from the address — would have dropped a
        vendor's ``no-reply@`` notices, which are exactly the mail a desk is there
        to act on. Infrastructure senders like ``no-reply@accounts.google.com``
        keep opening tickets until somebody says otherwise, and then stop.

        How far Master Data may override the list depends on how the entry was
        written, because the two forms are different statements:

        * A **bare domain** is broad. A registered account or vendor outranks it,
          so a domain ignored in passing cannot silence a counterparty somebody
          deliberately configured.
        * A **whole address** is specific, and now wins outright. It used to lose
          to Master Data as well, which meant a partner's daily automailer —
          ``dailyreport@partner.com``, on a domain mapped to that partner — could
          not be excluded by any setting the product offered. It opened a ticket
          every day, forever, and adding it to the list did nothing. Nobody types
          a full address into this list except after seeing that exact mail and
          deciding it is not a request.
        """
        ws = await self.db.get(Workspace, workspace_id)
        ignored = normalise_ignored_senders(
            ((ws.settings or {}).get("service_desk") or {}).get("ignored_senders") if ws else None
        )
        if not ignored:
            return False
        address = _address_of(email.from_email)
        domain = _domain_of(email.from_email)
        if not sender_is_ignored(address, domain, ignored):
            return False
        if address_is_ignored(address, ignored):
            return True
        if await self._match_account(workspace_id, domain, address) is not None:
            return False
        return await self._match_vendor(workspace_id, domain, address) is None

    # ------------------------------------------------------------- own outbound

    async def _record_desk_reply(
        self, workspace_id: str, email: InboundEmail, mailbox: ServiceDeskMailbox
    ) -> Ticket | None:
        """File a Gmail-typed reply from the desk on the ticket it answers.

        Recorded rather than dropped so the timeline holds the whole conversation
        — otherwise the ticket shows the customer's mail and the desk's later
        acknowledgement with the actual answer missing from between them.

        Deliberately not ``_append_reply``: that path reads the sender as a
        stakeholder handing the ticket back, and would reopen a closed ticket and
        restart the clock because the desk answered its own mail. What a reply
        typed in Gmail means for stage and ownership is a human judgement — the
        Move control — not something to infer here.

        A reply on a thread that has no ticket has nothing to attach to, so it is
        claimed and dropped: opening a ticket for it is the bug this guards.
        """
        if email.message_id and not await self._claim_message(workspace_id, email.message_id):
            logger.info("Service desk: duplicate message %s ignored", email.message_id)
            return None

        ticket = await self._find_thread_ticket(workspace_id, email)
        if ticket is None:
            logger.info(
                "Service desk: desk reply %s matched no ticket, not ingested",
                email.message_id,
            )
            return None

        # Same shape the UI's own send writes, so both read alike on the
        # timeline. ``author_id`` stays empty — Gmail names the shared mailbox,
        # not which colleague typed it — so the desk address is what marks this
        # correspondence outgoing.
        recipient = _address_of(email.to) or email.to or "requester"
        self.db.add(
            TicketResponse(
                id=str(uuid4()),
                ticket_id=ticket.id,
                author_email=mailbox.address,
                content=f"To: {recipient}\nSubject: {email.subject}\n\n{email.body_text or ''}",
                is_internal=False,
            )
        )
        self._absorb_attachments(ticket, email)
        # Adding somebody to the chain most often happens here, in the mail
        # client, not in the ticket — so a desk reply updates the participants
        # even though it never changes who a reply goes back to.
        self._absorb_participants(ticket, email, mailbox, from_desk=True)
        await self.db.flush()
        await self._link_message(workspace_id, email.message_id, ticket.id)
        return ticket

    # --------------------------------------------------------------- idempotency

    async def _claim_message(self, workspace_id: str, message_id: str) -> bool:
        """Record a message id as processed. False if it was already claimed."""
        try:
            async with self.db.begin_nested():
                self.db.add(
                    ServiceDeskIngestedMessage(
                        id=str(uuid4()), workspace_id=workspace_id, message_id=message_id
                    )
                )
            return True
        except IntegrityError:
            return False

    async def _link_message(self, workspace_id: str, message_id: str | None, ticket_id: str) -> None:
        """Attach the claimed message row to the ticket it produced."""
        if not message_id:
            return
        row = (
            await self.db.execute(
                select(ServiceDeskIngestedMessage).where(
                    ServiceDeskIngestedMessage.workspace_id == workspace_id,
                    ServiceDeskIngestedMessage.message_id == message_id,
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            row.ticket_id = ticket_id
            await self.db.flush()

    # --------------------------------------------------------------- threading

    async def _find_thread_ticket(self, workspace_id: str, email: InboundEmail) -> Ticket | None:
        thread_ref = email.thread_id or email.in_reply_to
        if thread_ref:
            sdt = (
                await self.db.execute(
                    select(ServiceDeskTicket).where(
                        ServiceDeskTicket.workspace_id == workspace_id,
                        ServiceDeskTicket.thread_ref == thread_ref,
                    )
                )
            ).scalar_one_or_none()
            if sdt is not None:
                return await self.db.get(Ticket, sdt.ticket_id)

        # subject carries BSD-<n>?
        #
        # ticket_number is shared with the GENERIC ticketing module, so this must
        # join service_desk_tickets. Matching on the number alone let anyone who
        # emailed the desk with "Re: BSD-7" post a public reply onto generic
        # ticket #7 (an HR helpdesk ticket, say) — and swallow their mail, since
        # no service desk ticket was created for it.
        number = await ticket_number_in_subject(self.db, workspace_id, email.subject)
        if number is not None:
            return (
                await self.db.execute(
                    select(Ticket)
                    .join(ServiceDeskTicket, ServiceDeskTicket.ticket_id == Ticket.id)
                    .where(
                        Ticket.workspace_id == workspace_id,
                        Ticket.ticket_number == number,
                        ServiceDeskTicket.workspace_id == workspace_id,
                    )
                )
            ).scalar_one_or_none()
        return None

    async def _ai_match_ticket(
        self, workspace_id: str, email: InboundEmail
    ) -> tuple[Ticket | None, str | None, str | None]:
        """Reunite a stray stakeholder email with its ticket, carefully.

        Returns ``(ticket, merge_note, suggestion)``. A ticket is returned only
        when the model names exactly one open candidate and is confident about
        it; otherwise the email becomes a new ticket and, if there was a
        near-miss, ``suggestion`` carries it so a human is asked to decide.

        Two hard limits make this safe enough to run unattended. The sender must
        already be an account or vendor in master data, so an unknown address can
        never be merged into someone's claim. And the candidate list is scoped to
        that same company's open tickets, so the model is never choosing between
        two different accounts' claims in the first place.
        """
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        prefix = await ticket_prefix(self.db, workspace_id)
        address = _address_of(email.from_email)
        domain = _domain_of(email.from_email)
        account = await self._match_account(workspace_id, domain, address)
        vendor = None if account else await self._match_vendor(workspace_id, domain, address)
        if account is None and vendor is None:
            return None, None, None

        query = (
            select(Ticket, ServiceDeskTicket)
            .join(ServiceDeskTicket, ServiceDeskTicket.ticket_id == Ticket.id)
            .where(
                Ticket.workspace_id == workspace_id,
                ServiceDeskTicket.workspace_id == workspace_id,
                *(
                    [ServiceDeskTicket.pending_with != taxonomy.closed_slug]
                    if taxonomy.closed_slug
                    else []
                ),
            )
            .order_by(Ticket.created_at.desc())
            .limit(_AI_MATCH_MAX_CANDIDATES)
        )
        if account is not None:
            query = query.where(ServiceDeskTicket.account_id == account.id)
        else:
            # A vendor writes about work the desk sent them, so the plausible
            # homes are tickets already handed to that vendor.
            query = query.where(ServiceDeskTicket.vendor_id == vendor.id)
        rows = (await self.db.execute(query)).all()
        if not rows:
            return None, None, None

        by_number = {ticket.ticket_number: ticket for ticket, _ in rows}
        catalogue = "\n".join(
            f"- {render_display_id(prefix, ticket.ticket_number)}: "
            f"{(ticket.field_values or {}).get('subject') or '(no subject)'} "
            f"[{sd.request_type}, pending with {sd.pending_with}]"
            for ticket, sd in rows
        )
        sender_label = account.name if account is not None else vendor.name

        try:
            from aexy.llm.gateway import get_llm_gateway

            # Vocabulary-neutral on purpose: this desk may be tracking claims,
            # shipments or support cases, and the example id uses the
            # workspace's own prefix so the model answers in ids we can parse.
            system = (
                "You match an incoming service desk email to an existing open ticket. "
                "Only match when the email clearly continues that specific ticket's "
                "request. Different tickets from one company often use near-identical "
                "wording, so answer null unless you are certain. Reply with compact JSON: "
                f'{{"ticket": "{render_display_id(prefix, 12)}" or null, '
                '"confidence": 0..1, "reason": "one short sentence"}. '
                "JSON only."
            )
            user = (
                f"Sender: {email.from_email} ({sender_label})\n"
                f"Subject: {email.subject}\n\n{(email.body_text or '')[:1500]}\n\n"
                f"Open tickets for this company:\n{catalogue}"
            )
            text, *_ = await get_llm_gateway().call_llm(
                system, user, tokens_estimate=350, workspace_id=workspace_id,
                feature="service_desk.ticket_match",
            )
            found = re.search(r"\{.*\}", text, re.DOTALL)
            if not found:
                return (
                    None,
                    None,
                    "AI ticket matching returned an unreadable response, so this email "
                    "was opened as a new ticket for a human to review.",
                )
            data = json.loads(found.group(0))
        except Exception as exc:  # noqa: BLE001 — matching is best-effort
            logger.info("Service desk: AI match skipped (%s)", exc)
            return (
                None,
                None,
                "AI ticket matching was unavailable, so this email was opened as a "
                "new ticket for a human to review.",
            )

        raw = data.get("ticket")
        reason = str(data.get("reason") or "")[:300]
        try:
            confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))
        except (TypeError, ValueError):
            confidence = 0.0

        # Matches this workspace's own prefix only. A generic `\w+-(\d+)` would
        # let the model name "INV-2024" and have it resolve to ticket 2024.
        matched_number = await ticket_number_in_subject(self.db, workspace_id, str(raw or ""))
        candidate = by_number.get(matched_number) if matched_number is not None else None
        if candidate is None:
            if raw:
                return (
                    None,
                    None,
                    "AI ticket matching named a ticket outside the allowed candidates, "
                    "so this email was opened as a new ticket for a human to review.",
                )
            return None, None, None

        display = render_display_id(prefix, candidate.ticket_number)
        if confidence >= _AI_MATCH_MIN_CONFIDENCE:
            return (
                candidate,
                f"Matched to this ticket by AI at {confidence:.0%} confidence "
                f"(no ticket number in the subject). Reason: {reason or 'not given'}. "
                "Move this message if the match is wrong.",
                None,
            )
        return (
            None,
            None,
            f"This may belong to {display} — AI suggested it at {confidence:.0%} "
            f"confidence, which was too low to merge automatically. "
            f"Reason: {reason or 'not given'}. A human should confirm or ignore.",
        )

    async def _append_reply(
        self,
        workspace_id: str,
        ticket: Ticket,
        email: InboundEmail,
        mailbox: ServiceDeskMailbox | None = None,
        automatic: bool = False,
    ) -> None:
        response = TicketResponse(
            id=str(uuid4()),
            ticket_id=ticket.id,
            author_email=email.from_email,
            content=email.body_text or "",
            is_internal=False,
        )
        self.db.add(response)
        self._absorb_attachments(ticket, email)
        self._absorb_participants(ticket, email, mailbox)
        await self.db.flush()

        # A reply to a closed ticket must reopen it — otherwise the requester's
        # message lands silently: no stakeholder clock restarts and nobody is
        # notified, while the requester believes the thread is live again.
        # An out-of-office bounce is not the requester disputing the closure, so
        # it is kept as correspondence and the ticket stays closed.
        if automatic:
            return
        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(
                    ServiceDeskTicket.ticket_id == ticket.id,
                    ServiceDeskTicket.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if sd is None:
            return
        from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        reopen_to = taxonomy.default_stakeholder_slug
        if taxonomy.is_closed(sd.pending_with):
            if reopen_to is None:
                # No taxonomy at all: leave it closed rather than invent a bucket.
                # The reply is still recorded on the ticket above.
                logger.warning(
                    "Cannot reopen ticket %s: workspace %s has no service desk stakeholders",
                    ticket.id,
                    workspace_id,
                )
                return
            await ServiceDeskTicketService(self.db).change_pending_with(
                workspace_id,
                ticket.id,
                reopen_to,
                note="Reopened by requester reply",
            )
            return

        # The stakeholder we were waiting on has answered, so the ball is back
        # with the team that fields incoming mail: somebody has to read it and
        # decide, whether the reply resolves the request or only promises an
        # update tomorrow. Mirrors the outbound side, and goes through the same
        # transition, so the segment, the timeline entry and the clock are
        # identical to a Move to click.
        sender = await self._handback_sender(workspace_id, sd.pending_with, email)
        if sender is not None and reopen_to is not None:
            await ServiceDeskTicketService(self.db).change_pending_with(
                workspace_id,
                ticket.id,
                reopen_to,
                note=f"Reply received from {sender}",
            )

    async def _handback_sender(
        self, workspace_id: str, pending_with: str, email: InboundEmail
    ) -> str | None:
        """Name the stakeholder if this reply came from the one we are waiting on.

        Someone else chasing the ticket while the vendor still owes an answer
        does not mean the vendor is done, so only the party actually holding the
        ticket hands it back. Deliberately only external buckets: an outside
        party answering says nothing about whether an internal team has finished
        its own work, and pulling the ticket out of an internal queue would lose
        it from that team's list.

        Which master-data table an external bucket speaks for is declared on the
        stakeholder itself (``links_to``), so renaming a bucket cannot change
        which table its senders are matched against. This was a fixed
        insurer/partner/third-party dict before.
        """
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        stakeholder = taxonomy.stakeholder(pending_with)
        if stakeholder is None or stakeholder.semantics != SEMANTIC_EXTERNAL:
            return None
        address = _address_of(email.from_email)
        domain = _domain_of(email.from_email)
        if pending_with == external_slug_for(taxonomy, "vendor"):
            vendor = await self._match_vendor(workspace_id, domain, address)
            return vendor.name if vendor else None
        if pending_with == external_slug_for(taxonomy, "account"):
            account = await self._match_account(workspace_id, domain, address)
            return account.name if account else None
        # An external bucket with no master data of its own, so any external
        # sender who is not a known account or vendor is taken to be that party.
        if await self._match_account(workspace_id, domain, address) is not None:
            return None
        if await self._match_vendor(workspace_id, domain, address) is not None:
            return None
        return email.from_name or address

    @staticmethod
    def _absorb_attachments(ticket: Ticket, email: InboundEmail) -> None:
        """Add a reply's files to the ticket's own attachment list.

        A stakeholder answering with a corrected register is sending the desk a
        file it needs; storing only the reply's text dropped it silently, so the
        KAM could neither see it nor forward it. Files are keyed by name and
        handle so the same message arriving twice cannot duplicate them.
        """
        if not email.attachments:
            return
        values = dict(ticket.field_values or {})
        existing = values.get("attachments")
        existing = [item for item in existing if isinstance(item, dict)] if isinstance(existing, list) else []
        seen = {(item.get("filename"), item.get("attachment_id")) for item in existing}

        added = False
        for attachment in email.attachments:
            key = (attachment.filename, attachment.attachment_id)
            if key in seen:
                continue
            seen.add(key)
            existing.append({**attachment.model_dump(), "message_id": email.message_id})
            added = True
        if added:
            values["attachments"] = existing
            ticket.field_values = values

    # ----------------------------------------------------- routing, own domain

    async def _route_internal_sender(
        self,
        workspace_id: str,
        email: InboundEmail,
        address: str | None,
        internal_domain: str | None,
        policy: str,
    ) -> tuple[
        ServiceDeskAccount | None, ServiceDeskVendor | None, str | None, str | None, bool
    ]:
        """Owner and attribution for mail sent from the desk's own domain.

        Returns ``(account, vendor, owner_id, assignment_note, needs_triage)``.

        The sender is a colleague, so the address in ``From:`` identifies nobody
        the desk routes by — every internal message would otherwise be handed to
        an arbitrary member of the desk. Four sources are tried, most specific
        first, and only the last two infer anything:

        1. **Who the message was addressed to.** A colleague writing out to a
           counterparty with the desk copied names that counterparty in ``To:``
           or ``Cc:`` and nowhere else. This is the common shape and it used to
           route entirely at random.
        2. **A Master Data row for the colleague's own address.** Mapping a whole
           address rather than a domain is how a desk says "mail from this person
           belongs to this account", and it is worth honouring: matching is
           restricted to the exact address so that a row carelessly keyed on the
           desk's *own domain* can never swallow all internal mail.
        3. **The original author of a forwarded message**, from the forwarding
           headers or the quoted block. Inferred, so the ticket stays flagged.
        4. **The colleague who wrote in.** A request somebody here raised is
           theirs until it is moved. This one needs no configuration, which is
           what makes the routing hold for a desk that has mapped nothing and for
           a colleague who joined this morning.

        The first two read Master Data as directly as the external-sender branch
        does, so they do not flag the ticket for triage; the last two are
        inferences and leave it flagged. Nothing here invents an owner: an
        account with no owner still falls back, and says so.
        """
        # Never route by an address on the desk's own domain — a colleague in Cc
        # is a colleague, not the counterparty this ticket is about.
        counterparties = [
            candidate
            for candidate in message_recipients(email.headers or {})
            if candidate != address and _domain_of(candidate) != internal_domain
        ]

        # A message addressed to an insurer and copied to a partner concerns both,
        # so the whole recipient list is read before anything is decided. Looking
        # for the vendor only until the account turned up made the vendor link
        # depend on which of the two happened to be first in the headers.
        matched: ServiceDeskAccount | None = None
        matched_address: str | None = None
        vendor: ServiceDeskVendor | None = None
        for candidate in counterparties:
            if matched is None:
                matched = await self._match_account(
                    workspace_id, _domain_of(candidate), candidate
                )
                if matched is not None:
                    matched_address = candidate
                    continue
            if vendor is None:
                vendor = await self._match_vendor(
                    workspace_id, _domain_of(candidate), candidate
                )
            if matched is not None and vendor is not None:
                break

        if matched is not None:
            owner = matched.assigned_owner_id
            note = None
            if owner is None:
                owner = await self._fallback_owner(workspace_id, policy)
                note = (
                    f"Assigned by fallback: this message is addressed to {matched_address}, "
                    f'which Master Data maps to "{matched.name}" — but that account has '
                    "no assigned owner. Set one so its tickets stop being distributed "
                    "arbitrarily."
                )
            return matched, vendor, owner, note, False

        # Exact address only. `_match_account` would otherwise also try the
        # sender's domain, which here is the desk's own — one row keyed on it
        # would capture every internal message ever sent.
        own_row = await self._match_account(workspace_id, None, address)
        if own_row is not None:
            owner = own_row.assigned_owner_id
            note = None
            if owner is None:
                owner = await self._fallback_owner(workspace_id, policy)
                note = (
                    f'Assigned by fallback: Master Data maps {email.from_email} to '
                    f'"{own_row.name}", which has no assigned owner. Set one so its tickets '
                    "stop being distributed arbitrarily."
                )
            return own_row, vendor, owner, note, False

        forwarded = forwarded_sender(email.headers or {}, email.body_text, internal_domain)
        account = (
            await self._match_account(workspace_id, _domain_of(forwarded), forwarded)
            if forwarded
            else None
        )
        if account is not None:
            owner = account.assigned_owner_id or await self._fallback_owner(
                workspace_id, policy
            )
            note = (
                f'Attributed to "{account.name}" from the forwarded message: '
                f"{email.from_email} forwarded mail originally from {forwarded}. "
                "Confirm this is the right account."
            )
            if account.assigned_owner_id is None:
                note += (
                    f' "{account.name}" has no assigned owner in Master Data, so the '
                    "owner was picked by fallback."
                )
            # Inferred attribution, so a human still confirms it. The value is
            # that the *owner* is right in the meantime: without this every
            # forwarded request landed on an arbitrary member of the desk and
            # looked deliberately assigned.
            return account, vendor, owner, note, True

        # Nothing identified a counterparty. The one person this message is known
        # to concern is the colleague who wrote it, and a request raised by a
        # colleague is theirs until somebody moves it. Handing it to an arbitrary
        # third person instead was the whole of the reported bug — and unlike the
        # steps above, this needs no Master Data at all, so it holds for a
        # colleague nobody has mapped and for one who joined this morning.
        sender_id = await self._workspace_member_id(workspace_id, address)
        if sender_id is not None:
            return (
                None,
                vendor,
                sender_id,
                (
                    f"Assigned to {email.from_email}, who raised it: no account is mapped to "
                    "that address or to anyone this message was addressed to, and the person "
                    "who wrote in is the one it is known to concern. Move it if somebody else "
                    "should carry it."
                ),
                True,
            )

        return (
            None,
            vendor,
            await self._fallback_owner(workspace_id, policy),
            (
                f"Assigned by fallback: {email.from_email} is on this desk's own domain, is "
                "not a member of this workspace, and no account is mapped to that address or "
                "to anyone this message was addressed to. Map the counterparty's domain to the "
                "right account in Master Data so mail like this reaches its owner."
            ),
            True,
        )

    async def _workspace_member_id(self, workspace_id: str, address: str | None) -> str | None:
        """The developer behind an address, if they are an active member here.

        Membership is the check, not merely having a row: developer records are
        synced from elsewhere and outlive people leaving, and a ticket assigned
        to somebody who left is worse than one assigned at random — nobody is
        watching that queue at all.
        """
        if not address:
            return None
        return (
            await self.db.execute(
                select(Developer.id)
                .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
                .where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                    func.lower(Developer.email) == address,
                )
            )
        ).scalars().first()

    @staticmethod
    def _absorb_participants(
        ticket: Ticket,
        email: InboundEmail,
        mailbox: ServiceDeskMailbox | None,
        from_desk: bool = False,
    ) -> None:
        """Record who else is on this email thread.

        Replying from the ticket could never keep the people already on the
        conversation, because the ticket knew who wrote in and nothing about who
        they copied. Those addresses exist only on the message, so they are taken
        from each one as it arrives — the original request, every stakeholder
        reply, and replies a colleague typed in the mail client, which is where
        somebody most often adds a person to the chain.

        The desk's own address is never a participant: copying it into a reply
        would bring that reply back through the sync as fresh correspondence.

        ``thread_reply_to`` is the last person who *wrote in*, not the first. A
        thread that has moved on to an insurer's claims handler must not answer
        the partner who opened it three weeks ago. Mail the desk itself sent
        updates the chain but never this — the desk does not reply to itself.
        """
        desk = (mailbox.address or "").strip().lower() if mailbox is not None else ""
        values = dict(ticket.field_values or {})
        stored = values.get("thread_participants")
        participants = [
            item.strip().lower()
            for item in (stored if isinstance(stored, list) else [])
            if isinstance(item, str) and "@" in item
        ]

        arriving = list(message_recipients(email.headers or {}))
        sender = _address_of(email.from_email)
        # A ticket logged by phone has no requester address, only the sentinel
        # standing in for one. Recording it would prefill the compose box with an
        # address that cannot receive mail, which is worse than an empty box.
        if sender == MANUAL_SENDER_ADDRESS:
            sender = None
        if sender and not from_desk:
            arriving.append(sender)

        changed = False
        for address in arriving:
            if not address or address == desk or address in participants:
                continue
            if address == MANUAL_SENDER_ADDRESS:
                continue
            if len(participants) >= THREAD_PARTICIPANT_LIMIT:
                break
            participants.append(address)
            changed = True

        if sender and not from_desk and values.get("thread_reply_to") != sender:
            values["thread_reply_to"] = sender
            changed = True

        if changed:
            values["thread_participants"] = participants
            ticket.field_values = values

    # ------------------------------------------------------------- new ticket

    async def create_ticket(
        self,
        workspace_id: str,
        email: InboundEmail,
        mailbox: ServiceDeskMailbox | None,
        source: str,
        automatic: bool = False,
        suggestion: str | None = None,
        classify: bool = True,
        send_receipt: bool = True,
    ) -> Ticket:
        """Create a ticket from a normalised message. Public: manual logging
        (phone/WhatsApp) goes through the same path with ``mailbox=None``, and
        reaching in for a private method to do that made the boundary a lie.

        The acknowledgement is queued, not sent — the caller commits, then calls
        ``flush_notifications()``.

        ``classify=False`` skips the LLM step. Email intake runs inside a worker
        where a ten-second model call costs nobody anything; manual logging runs
        inside an HTTP request with somebody watching a spinner, and there the
        model is guessing at fields the person filling the form has just typed.

        ``send_receipt=False`` does not queue the acknowledgement at all, for a
        caller that will send it after responding — see ``acknowledge_ticket``.
        """
        domain = _domain_of(email.from_email)
        address = _address_of(email.from_email)
        internal_domain = _domain_of(mailbox.address) if mailbox else None

        account: ServiceDeskAccount | None = None
        vendor: ServiceDeskVendor | None = None
        origin = TicketOrigin.EMAIL.value
        needs_triage = False
        assigned_owner_id: str | None = None
        # Why this ticket ended up with this owner. Recorded on the timeline
        # below whenever the answer was not Master Data, because the symptom of a
        # missing or mistyped mapping — a ticket on a KAM who has nothing to do
        # with the partner — is indistinguishable from a deliberate assignment
        # once the ticket exists. "Assignment is not following our master data"
        # is unanswerable without this.
        assignment_note: str | None = None
        # One read, before the branching below: every fallback path needs it and
        # it decides whether "no owner" is a failure or this desk's deliberate
        # choice (see the final fallback at the end of this block).
        policy = await self._unmatched_policy(workspace_id)

        if domain and internal_domain and domain == internal_domain:
            # Sender is on the desk's own domain: a colleague wrote in, forwarded
            # a counterparty's mail, or copied the desk on mail they sent out.
            # `From:` names none of those counterparties, so routing has to look
            # somewhere other than the sender — see `_route_internal_sender`.
            origin = TicketOrigin.INTERNAL.value
            (
                account,
                vendor,
                assigned_owner_id,
                assignment_note,
                needs_triage,
            ) = await self._route_internal_sender(
                workspace_id, email, address, internal_domain, policy
            )
        else:
            account = await self._match_account(workspace_id, domain, address)
            if account is not None:
                assigned_owner_id = account.assigned_owner_id
                if assigned_owner_id is None:
                    assigned_owner_id = await self._fallback_owner(workspace_id, policy)
                    assignment_note = (
                        f'Assigned by fallback: "{account.name}" matched {domain}, but has no '
                        "assigned owner in Master Data. Set one so its tickets stop being "
                        "distributed arbitrarily."
                    )
            else:
                vendor = await self._match_vendor(workspace_id, domain, address)
                # vendor-originated or wholly unknown → triage + an arbitrary owner
                needs_triage = True
                assigned_owner_id = await self._fallback_owner(workspace_id, policy)
                assignment_note = (
                    f"Assigned by fallback: no account is mapped to {domain or email.from_email}. "
                    "Add the domain to the right account in Master Data so future mail from this "
                    "sender reaches its owner."
                )

        if assigned_owner_id is None and policy != "unassigned":
            # Only a genuine dead end reaches here now. With the policy set to
            # "unassigned" a null owner is the intended outcome, and handing the
            # ticket to the workspace owner would quietly undo the setting.
            assigned_owner_id = (
                await self.db.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
            ).scalar_one_or_none()
            assignment_note = (
                (assignment_note or "Assigned by fallback.")
                + " The desk department has no active members either, so the ticket went to the "
                "workspace owner."
            )
        elif assigned_owner_id is None:
            needs_triage = True
            assignment_note = (
                (assignment_note or "")
                + " Left unassigned because this desk is set to leave unroutable tickets "
                "unassigned. It is flagged for triage so it stays visible."
            ).strip()

        form_id = await self._ensure_form(workspace_id)

        # The ticket-number retry against concurrent intake lives in
        # ``_insert_ticket``, so every creation path gets it, not just this one.
        ticket = await self._insert_ticket(
            workspace_id,
            form_id=form_id,
            submitter_email=email.from_email,
            submitter_name=email.from_name,
            email_verified=False,
            # Kept in both places on purpose: `title` is the column readers and
            # indexes use, `field_values["subject"]` stays because the form
            # renderer and every existing consumer read the submission blob.
            title=(email.subject or "").strip()[:500] or None,
            field_values={
                "subject": email.subject,
                "body": email.body_text,
                "account": account.name if account else None,
                "vendor": vendor.name if vendor else None,
                # The owning message is stamped on each file because the handle
                # is only valid against the message it arrived on. A ticket
                # accumulates files from replies too, each from a different one.
                "attachments": [
                    {**attachment.model_dump(), "message_id": email.message_id}
                    for attachment in email.attachments
                ],
                # Everyone this first message reached, so a reply from the ticket
                # can keep them. Filled in below, once the ticket exists.
                "thread_participants": [],
            },
            status=TicketStatus.NEW.value,
            assignee_id=assigned_owner_id,
            source=source,
        )
        self._absorb_participants(ticket, email, mailbox)
        await self.db.flush()

        # Where a new ticket starts and what it is triaged as both come from the
        # workspace's taxonomy. These were the `PendingWith.KAM` / `RequestType.QUERY`
        # enum members, i.e. one company's answer applied to everyone.
        # The one place that DOES seed. An email arriving at a desk nobody has
        # configured must not be dropped, so it falls back to the neutral template
        # rather than refusing. Every other path passes seed=False so that reads
        # never silently make this choice on the workspace's behalf.
        taxonomy = await load_taxonomy(self.db, workspace_id)
        start_stakeholder = taxonomy.default_stakeholder_slug
        start_request_type = taxonomy.default_request_type_slug
        if start_stakeholder is None or start_request_type is None:
            # Seeding runs on read, so this only happens if a workspace actively
            # deactivated everything. Refuse loudly rather than write a ticket
            # into a bucket that no queue or dashboard can show.
            raise HTTPException(
                status_code=409,
                detail=(
                    "This workspace has no active service desk stakeholders or request "
                    "types. Apply an industry template in Service Desk settings first."
                ),
            )

        sd = ServiceDeskTicket(
            id=str(uuid4()),
            ticket_id=ticket.id,
            workspace_id=workspace_id,
            account_id=account.id if account else None,
            vendor_id=vendor.id if vendor else None,
            request_type=start_request_type,
            pending_with=start_stakeholder,
            origin=origin,
            needs_triage=needs_triage,
            mailbox_id=mailbox.id if mailbox is not None else None,
            thread_ref=email.thread_id or email.message_id,
            source_message_id=email.message_id,
        )
        self.db.add(sd)

        if assignment_note:
            self.db.add(stamp_assignment_note(ticket, assignment_note))

        # open the first pending-with segment (the ledger starts here)
        self.db.add(
            TicketPendingSegment(
                id=str(uuid4()),
                workspace_id=workspace_id,
                ticket_id=ticket.id,
                pending_with=start_stakeholder,
                entered_at=datetime.now(timezone.utc),
                changed_by_id=assigned_owner_id,
                note="Ticket created",
            )
        )
        await self.db.flush()

        # The model saw a possible home for this mail but was not sure enough to
        # merge it. Opening a fresh ticket is the safe default, but staying silent
        # would hide the near-miss, so the suggestion is recorded and a human is
        # asked to look.
        if suggestion:
            sd.needs_triage = True
            self.db.add(
                TicketResponse(
                    id=str(uuid4()),
                    ticket_id=ticket.id,
                    content=suggestion,
                    is_internal=True,
                )
            )
            await self.db.flush()

        # best-effort enrichment + receipt (never block intake).
        # AI reading/categorisation follows the workspace's AI switch (see
        # ``ai_classification_enabled``), and an automatic response carries no
        # request to read — classifying one would only invent a request type and
        # a product for a machine's away message.
        issues: list[dict] = []
        overflow = False
        if automatic:
            sd.needs_triage = True
        elif classify and await self._ai_enabled(workspace_id):
            issues, overflow = await self._classify(workspace_id, sd, email)
            if not issues:
                # The classifier ran and produced nothing usable — a workspace
                # that deactivated every request type, a response the model
                # could not be held to, or a call that never happened. The
                # ticket is in exactly the state the branch below describes, so
                # it is flagged the same way. Leaving it clear reported a read
                # that did not happen: the ticket carried the workspace default
                # request type and no product, and looked confirmed.
                sd.needs_triage = True
        else:
            # Nothing has read this ticket: the ticket is still created, owned and
            # clocked, but nobody has set the product or confirmed the request
            # type — it holds the workspace's default. Flag it so the owner
            # completes those fields by hand rather than the desk silently
            # reporting every ticket as its default type with no product on it.
            # A caller that already has those answers from a person clears it.
            sd.needs_triage = True

        # Now that the product is known, ask whether this account/product pairing
        # names its own owner. Assignment had to happen before classification —
        # the ticket row comes first — so this is the point at which a partner
        # split between two people is actually routed to the right one.
        reroute = await self.product_owner(sd.account_id, sd.product_id)
        if reroute and reroute != ticket.assignee_id:
            ticket.assignee_id = reroute
            # Stamped, not just noted: this supersedes whatever the routing block
            # decided, so leaving the earlier reason on the ticket would have the
            # "why this owner" line explain an owner the ticket no longer has.
            self.db.add(
                stamp_assignment_note(
                    ticket,
                    f"Reassigned on classification: this {taxonomy.term('account')} has a "
                    f"separate owner for this {taxonomy.term('product')}.",
                )
            )

        children: list[Ticket] = []
        if len(issues) > 1 and not overflow:
            children = await self._auto_split(workspace_id, ticket, sd, email, issues, mailbox)
        if (len(issues) > 1 or overflow) and not children:
            # Everything we did not split cleanly stays one ticket for a human.
            sd.needs_triage = True
        await self.db.flush()

        # One acknowledgement per inbound message, listing every ticket it
        # produced. Children never send their own — the requester wrote once.
        if not automatic and send_receipt:
            await self._send_receipt(
                workspace_id,
                ticket,
                mailbox,
                thread_id=email.thread_id,
                children=children,
                arrived_at=email.sent_at,
            )

        logger.info(
            "Service desk: created ticket %s",
            await ticket_prefix_display(self.db, workspace_id, ticket.ticket_number),
        )

        from aexy.services.service_desk_ticket_service import dispatch_service_desk_event

        await dispatch_service_desk_event(
            self.db, workspace_id, "service_desk.ticket_created", ticket, sd
        )
        return ticket

    async def _insert_ticket(self, workspace_id: str, **fields) -> Ticket:
        """Add a ``Ticket``, retrying its number against concurrent intake.

        ticket_number is max()+1 against a real uq_ticket_number constraint, so
        two emails arriving together collide. Retry inside a savepoint instead of
        letting the IntegrityError escape — in the webhook path it was swallowed
        by the caller and the email was dropped.
        """
        for attempt in range(_TICKET_NUMBER_ATTEMPTS):
            candidate = Ticket(
                id=str(uuid4()),
                workspace_id=workspace_id,
                ticket_number=await self._next_ticket_number(workspace_id),
                **fields,
            )
            try:
                async with self.db.begin_nested():
                    self.db.add(candidate)
                return candidate
            except IntegrityError:
                # The savepoint rollback already detached `candidate`; do not try
                # to expunge it (that raises "not present in this Session").
                if attempt == _TICKET_NUMBER_ATTEMPTS - 1:
                    raise
        raise AssertionError("unreachable: the loop returns or re-raises")

    # ----------------------------------------------------------- auto-split

    @staticmethod
    def _is_splittable(issues: list[dict]) -> bool:
        """The whole auto-split contract, in one place.

        Exactly two candidates, materially different request types, and the
        model sure about both. Three candidates, a repeated request type or one
        shaky confidence all mean the email is ambiguous, and an ambiguous email
        becomes one ticket a human triages — never three tickets.
        """
        return (
            len(issues) == 2
            and issues[0]["request_type"] != issues[1]["request_type"]
            and all(issue["confidence"] >= _SPLIT_MIN_CONFIDENCE for issue in issues)
        )

    async def _auto_split(
        self,
        workspace_id: str,
        primary: Ticket,
        sd: ServiceDeskTicket,
        email: InboundEmail,
        issues: list[dict],
        mailbox: ServiceDeskMailbox | None,
    ) -> list[Ticket]:
        """Create the second ticket for ``issues[1]``. Returns [] if not split.

        The child is created inside a savepoint: if anything about it fails, the
        savepoint rolls back and the caller is left with exactly one intact
        primary ticket flagged for triage, never a half-created pair.
        """
        if not self._is_splittable(issues):
            return []
        if not await self._auto_split_enabled(workspace_id):
            return []

        try:
            async with self.db.begin_nested():
                child = await self.create_child_ticket(
                    workspace_id, primary, sd, email, issues[1], mailbox
                )
                child_number = child.ticket_number
        except Exception as exc:  # noqa: BLE001 — an unsplit email is still a ticket
            logger.warning("Service desk: auto-split rolled back (%s)", exc)
            return []

        prefix = await ticket_prefix(self.db, workspace_id)
        primary_values = dict(primary.field_values or {})
        primary_values["split_children"] = [
            {"ticket_id": child.id, "display_id": render_display_id(prefix, child_number)}
        ]
        primary.field_values = primary_values
        await self.db.flush()
        logger.info(
            "Service desk: auto-split %s into child %s",
            render_display_id(prefix, primary.ticket_number),
            render_display_id(prefix, child_number),
        )
        return [child]

    async def create_child_ticket(
        self,
        workspace_id: str,
        primary: Ticket,
        sd: ServiceDeskTicket,
        email: InboundEmail,
        issue: dict,
        mailbox: ServiceDeskMailbox | None,
        human_split: bool = False,
    ) -> Ticket:
        """The second request from one email, as its own tracked ticket.

        ``human_split`` decides whether the child inherits the parent's triage
        flag. The parent is flagged when one email carried several requests and
        nobody separated them — so once a person has done exactly that, the
        reason no longer applies to the child they deliberately created, and
        carrying it over asks them to confirm work they just did. An auto-split
        child keeps inheriting, because there nobody has looked at all.
        """
        # A child starts where a fresh ticket starts: the workspace's own default
        # bucket. Falls back to the parent's bucket for a desk with no taxonomy,
        # which is still better than inventing a slug nothing recognises.
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        child_pending_with = taxonomy.default_stakeholder_slug or sd.pending_with
        primary_values = primary.field_values or {}
        child = await self._insert_ticket(
            workspace_id,
            form_id=primary.form_id,
            submitter_email=primary.submitter_email,
            submitter_name=primary.submitter_name,
            email_verified=False,
            field_values={
                "subject": issue["summary"],
                "body": primary_values.get("body"),
                "account": primary_values.get("account"),
                "vendor": primary_values.get("vendor"),
                "attachments": primary_values.get("attachments") or [],
                "email_subject": primary_values.get("subject"),
                "split_from_ticket_id": primary.id,
            },
            status=TicketStatus.NEW.value,
            # Same owner as the primary: one email, one owner, and the child lands
            # in exactly the queue the requester's own ticket landed in.
            assignee_id=primary.assignee_id,
            source=primary.source,
        )
        await self.db.flush()

        self.db.add(
            ServiceDeskTicket(
                id=str(uuid4()),
                ticket_id=child.id,
                workspace_id=workspace_id,
                split_parent_ticket_id=primary.id,
                account_id=sd.account_id,
                vendor_id=sd.vendor_id,
                product_id=await self._product_id(workspace_id, issue.get("product")),
                request_type=issue["request_type"],
                pending_with=child_pending_with,
                origin=sd.origin,
                # A human-split child is judged on its own classification.
                needs_triage=(
                    issue["confidence"] < _LOW_CONFIDENCE if human_split else sd.needs_triage
                ),
                ai_confidence=issue["confidence"],
                mailbox_id=mailbox.id if mailbox is not None else None,
                # No thread_ref: replies must thread onto the primary, and two
                # rows sharing one thread_ref would break that lookup outright.
                thread_ref=None,
                source_message_id=email.message_id,
            )
        )
        self.db.add(
            TicketPendingSegment(
                id=str(uuid4()),
                workspace_id=workspace_id,
                ticket_id=child.id,
                pending_with=child_pending_with,
                entered_at=datetime.now(timezone.utc),
                changed_by_id=child.assignee_id,
                note="Created by auto-split",
            )
        )
        await self.db.flush()
        return child

    async def _recent_corrections(self, workspace_id: str, allowed: set[str]) -> str:
        """Recent classifications this desk overruled, as prompt examples.

        A desk's vocabulary is its own: one workspace files a renewal reminder as
        a query, another as its own request type, and a general-purpose prompt
        gets that wrong the same way every time. These are the corrections its
        own people already made, which is the cheapest training signal available
        and needs no extra work from anybody.

        Bounded hard, and to subjects only. The examples are prompt text, so an
        unbounded set would grow the cost of every classification and eventually
        push the mail being classified out of the window; and a body would carry
        a requester's details into the prompt for every later ticket, which is a
        different thing from reading their own mail.
        """
        rows = (
            await self.db.execute(
                select(Ticket.field_values, ServiceDeskTicket.request_type)
                .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
                .where(
                    ServiceDeskTicket.workspace_id == workspace_id,
                    ServiceDeskTicket.ai_request_type.is_not(None),
                    ServiceDeskTicket.ai_request_type != ServiceDeskTicket.request_type,
                )
                .order_by(ServiceDeskTicket.updated_at.desc())
                .limit(_MAX_CORRECTION_EXAMPLES)
            )
        ).all()
        examples = [
            f"- {subject[:120]} -> {request_type}"
            for field_values, request_type in rows
            # A retired request type would teach the model to answer with a slug
            # the validator then rejects.
            if request_type in allowed
            and (subject := " ".join(str((field_values or {}).get("subject") or "").split()))
        ]
        if not examples:
            return ""
        return (
            "This desk previously corrected these classifications; follow the same "
            "judgement:\n" + "\n".join(examples) + "\n\n"
        )

    async def _products_for(
        self, workspace_id: str, account_id: str | None
    ) -> list[tuple[str, str]]:
        """The products worth offering the classifier, as (name, id).

        An account that has been paired with specific products is asked only
        about those. It is a materially easier question — two options rather than
        a workspace catalogue of forty — and it makes a whole class of answer
        impossible rather than merely unlikely: a partner the desk does not serve
        for health cannot have a ticket classified as health.

        An account with no pairings, or no account at all, falls back to the
        whole catalogue. That is every desk until somebody splits a partner, and
        nothing about their classification changes.
        """
        if account_id is not None:
            paired = (
                await self.db.execute(
                    select(ServiceDeskProduct.name, ServiceDeskProduct.id)
                    .join(
                        ServiceDeskAccountProduct,
                        ServiceDeskAccountProduct.product_id == ServiceDeskProduct.id,
                    )
                    .where(
                        ServiceDeskAccountProduct.account_id == account_id,
                        ServiceDeskProduct.is_active.is_(True),
                    )
                    .order_by(ServiceDeskProduct.name)
                )
            ).all()
            if paired:
                return [(str(name), pid) for name, pid in paired]
        rows = (
            await self.db.execute(
                select(ServiceDeskProduct.name, ServiceDeskProduct.id).where(
                    ServiceDeskProduct.workspace_id == workspace_id,
                    ServiceDeskProduct.is_active.is_(True),
                )
            )
        ).all()
        return [(str(name), pid) for name, pid in rows]

    async def product_owner(
        self, account_id: str | None, product_id: str | None
    ) -> str | None:
        """The owner named for this account/product pairing, if there is one.

        The narrowest answer the desk has to "whose ticket is this". Falls back
        to nothing — not to the account's owner — because the caller needs to
        know which of the two answered, in order to say so on the timeline.
        """
        if not account_id or not product_id:
            return None
        return (
            await self.db.execute(
                select(ServiceDeskAccountProduct.assigned_owner_id).where(
                    ServiceDeskAccountProduct.account_id == account_id,
                    ServiceDeskAccountProduct.product_id == product_id,
                )
            )
        ).scalars().first()

    async def account_owner(self, account_id: str | None) -> str | None:
        """The owner named for this account, if there is one.

        The broader answer to "whose ticket is this", used when no
        account/product pairing names somebody more specific. Kept next to
        ``product_owner`` so the precedence between the two is readable in one
        place rather than reconstructed at each call site.
        """
        if not account_id:
            return None
        return (
            await self.db.execute(
                select(ServiceDeskAccount.assigned_owner_id).where(
                    ServiceDeskAccount.id == account_id
                )
            )
        ).scalars().first()

    async def _product_id(self, workspace_id: str, name: str | None) -> str | None:
        if not name:
            return None
        return (
            await self.db.execute(
                select(ServiceDeskProduct.id).where(
                    ServiceDeskProduct.workspace_id == workspace_id,
                    func.lower(ServiceDeskProduct.name) == name.strip().lower(),
                    ServiceDeskProduct.is_active.is_(True),
                )
            )
        ).scalars().first()

    # ------------------------------------------------------------- assignment

    @staticmethod
    def _match_keys(domain: str | None, address: str | None) -> list[str]:
        """Everything a Master Data row could be keyed on for this sender.

        The whole address, then the sender's domain and each parent domain above
        it. Matching used to be exact equality on the domain, so a partner
        writing from ``mail.partner.com`` or ``claims.partner.com`` — a regional
        office, a marketing platform, a ticketing subdomain — was not recognised
        as that partner at all, and the ticket went to an arbitrary owner with
        nothing to say why. See ``domain_candidates`` for what stops this
        reaching up into a public suffix.
        """
        return [key for key in ([address] if address else []) + domain_candidates(domain) if key]

    async def _match_account(
        self, workspace_id: str, domain: str | None, address: str | None = None
    ) -> ServiceDeskAccount | None:
        keys = self._match_keys(domain, address)
        if not keys:
            return None
        row = (
            await self.db.execute(
                select(ServiceDeskAccount)
                .join(ServiceDeskAccountDomain, ServiceDeskAccountDomain.account_id == ServiceDeskAccount.id)
                .where(
                    ServiceDeskAccount.workspace_id == workspace_id,
                    ServiceDeskAccount.is_active.is_(True),
                    func.lower(ServiceDeskAccountDomain.domain).in_(keys),
                )
                # Most specific first, in two steps. A whole-address record beats
                # any domain, otherwise one gmail.com partner would swallow every
                # plus-suffixed company keyed on the same domain. Then the longest
                # domain wins, so a desk can map `partner.com` to one owner and
                # `claims.partner.com` to another and have both hold.
                .order_by(
                    (func.lower(ServiceDeskAccountDomain.domain) == (address or "")).desc(),
                    func.length(ServiceDeskAccountDomain.domain).desc(),
                    ServiceDeskAccount.created_at,
                    ServiceDeskAccount.id,
                )
            )
        ).scalars().first()
        return row

    async def _match_vendor(
        self, workspace_id: str, domain: str | None, address: str | None = None
    ) -> ServiceDeskVendor | None:
        keys = self._match_keys(domain, address)
        if not keys:
            return None
        row = (
            await self.db.execute(
                select(ServiceDeskVendor)
                .join(ServiceDeskVendorDomain, ServiceDeskVendorDomain.vendor_id == ServiceDeskVendor.id)
                .where(
                    ServiceDeskVendor.workspace_id == workspace_id,
                    ServiceDeskVendor.is_active.is_(True),
                    func.lower(ServiceDeskVendorDomain.domain).in_(keys),
                )
                .order_by(
                    (func.lower(ServiceDeskVendorDomain.domain) == (address or "")).desc(),
                    func.length(ServiceDeskVendorDomain.domain).desc(),
                    ServiceDeskVendor.created_at,
                    ServiceDeskVendor.id,
                )
            )
        ).scalars().first()
        return row

    async def _unmatched_policy(self, workspace_id: str) -> str:
        """This desk's answer to "what do we do with a ticket we cannot route"."""
        from aexy.services.service_desk_config import unmatched_assignment

        ws_settings = (
            await self.db.execute(
                select(Workspace.settings).where(Workspace.id == workspace_id)
            )
        ).scalar_one_or_none() or {}
        return unmatched_assignment(ws_settings.get("service_desk") or {})

    async def _fallback_owner(self, workspace_id: str, policy: str) -> str | None:
        """The owner for a ticket whose account could not be identified.

        Split out from ``_random_owner`` because "pick somebody" is only one of
        three defensible answers, and it was the one that hid the problem: an
        arbitrarily-assigned ticket reads as a deliberate assignment, so a
        missing domain in Master Data showed up as a KAM asking why a partner
        they do not handle is in their queue.
        """
        if policy == "unassigned":
            return None
        if policy == "desk_head":
            from aexy.services.service_desk_service import resolve_desk_department

            dept = await resolve_desk_department(self.db, workspace_id)
            if dept is not None and dept.head_id:
                return str(dept.head_id)
            # No head recorded. A member of the desk still beats nobody, and the
            # note on the ticket says which answer was used.
            return await self._random_owner(workspace_id)
        return await self._random_owner(workspace_id)

    async def _random_owner(self, workspace_id: str) -> str | None:
        """Pick a random member of the department that runs this desk.

        Which department that is, is now the workspace's own answer: the one named
        in Service Desk settings, or — with none named — the department behind the
        desk's first internal queue. It used to be the literal
        ``function_key == "ops_kam"``, a key only workspaces set up from the
        insurance-broking template ever had, so everybody else's incoming mail
        arrived unassigned with nothing to say why.

        Department membership alone isn't enough: rows are not removed when
        someone leaves the workspace, so joining WorkspaceMember keeps tickets
        from being auto-assigned to a departed employee's dead queue.
        """
        from aexy.services.service_desk_service import resolve_desk_department

        dept = await resolve_desk_department(self.db, workspace_id)
        if dept is None:
            return None

        rows = (
            await self.db.execute(
                select(DepartmentMember.developer_id)
                .join(
                    WorkspaceMember,
                    (WorkspaceMember.developer_id == DepartmentMember.developer_id)
                    & (WorkspaceMember.workspace_id == workspace_id),
                )
                .where(
                    DepartmentMember.department_id == dept.id,
                    WorkspaceMember.status == "active",
                )
                .distinct()
            )
        ).scalars().all()
        if not rows:
            return None
        return secrets.choice(list(rows))

    # ------------------------------------------------------------- form/number

    async def _ensure_form(self, workspace_id: str) -> str:
        existing = (
            await self.db.execute(
                select(TicketForm.id).where(
                    TicketForm.workspace_id == workspace_id,
                    TicketForm.slug == SERVICE_DESK_FORM_SLUG,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing

        owner_id = (
            await self.db.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
        ).scalar_one_or_none()

        form = TicketForm(
            id=str(uuid4()),
            workspace_id=workspace_id,
            # The form name is visible in the generic ticketing module, so it must
            # not be one customer's name — every workspace running a desk would
            # have found another company's desk name in its own forms list.
            name="Service Desk",
            slug=SERVICE_DESK_FORM_SLUG,
            description="Auto-created intake form for email-originated service desk tickets.",
            created_by_id=owner_id,
        )
        try:
            async with self.db.begin_nested():
                self.db.add(form)
            return form.id
        except IntegrityError:
            # Concurrent intake created the form first — reuse it.
            existing = (
                await self.db.execute(
                    select(TicketForm.id).where(
                        TicketForm.workspace_id == workspace_id,
                        TicketForm.slug == SERVICE_DESK_FORM_SLUG,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                return existing
            raise

    async def _next_ticket_number(self, workspace_id: str) -> int:
        stmt = select(func.max(Ticket.ticket_number)).where(Ticket.workspace_id == workspace_id)
        return ((await self.db.execute(stmt)).scalar() or 0) + 1

    # ------------------------------------------------------- best-effort hooks

    async def _ai_enabled(self, workspace_id: str) -> bool:
        return await ai_classification_enabled(self.db, workspace_id)

    async def _auto_split_enabled(self, workspace_id: str) -> bool:
        """Whether intake may auto-create a second ticket. Off unless switched on."""
        ws = await self.db.get(Workspace, workspace_id)
        if ws is None:
            return False
        return bool(((ws.settings or {}).get("service_desk") or {}).get("auto_split_enabled", False))

    async def _classify(
        self, workspace_id: str, sd: ServiceDeskTicket, email: InboundEmail
    ) -> tuple[list[dict], bool]:
        """Persist bounded issue candidates on the primary ticket.

        Returns ``(issues, overflow)``. Creating tickets from them is the
        caller's decision — this method never splits.
        """
        try:
            from aexy.llm.gateway import get_llm_gateway

            product_rows = await self._products_for(workspace_id, sd.account_id)
            product_ids = {str(name).lower(): pid for name, pid in product_rows}
            product_list = (
                ", ".join(name for name, _ in product_rows) if product_rows else "(none configured)"
            )

            # One product to choose from is not a choice. Setting it here spends
            # no tokens and cannot be got wrong, and it leaves the model the
            # question it is actually useful for.
            if len(product_rows) == 1:
                sd.product_id = product_rows[0][1]

            # The prompt used to say "You classify insurance operations emails"
            # and name the four insurance request types inline, so a software
            # company's desk was asking a model to pick between `claims` and
            # `policy_issuance`. Both the framing and the options come from the
            # workspace now.
            taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
            allowed = {r.slug for r in taxonomy.request_types}
            if not allowed:
                return [], False
            default_type = taxonomy.default_request_type_slug or sorted(allowed)[0]
            # Labels alongside slugs: `access_request` is a token, "Access
            # Request" is what the model can actually reason about.
            options = ", ".join(f"{r.slug} ({r.label})" for r in taxonomy.request_types)
            product_term = taxonomy.term("products")
            corrections = await self._recent_corrections(workspace_id, allowed)
            system = (
                "You classify incoming service desk emails and detect independently "
                "actionable issues. Return one issue for a batch of rows requiring the "
                "same workflow. Split candidates only when requests need materially "
                "different workflows or outcomes. Reply with compact JSON: "
                '{"issues":[{"summary":"short action", "request_type": one of '
                f'[{", ".join(sorted(allowed))}], "product": one of the provided '
                f'{product_term} or null, "confidence":0..1, '
                '"split_reason":"why independent or null"}]}. '
                f"Return between one and {_MAX_ISSUES_PER_EMAIL} issues. JSON only."
            )
            attachment_context = "\n".join(
                "- "
                + attachment.filename
                + f" ({attachment.content_type or 'unknown type'}, "
                + f"{attachment.size_bytes or 0} bytes)"
                + (f": {attachment.preview}" if attachment.preview else "")
                for attachment in email.attachments[:3]
            ) or "(none)"
            user = (
                f"Request types: {options}\n"
                f"{product_term}: {product_list}\n"
                f"{corrections}"
                f"Subject: {email.subject}\n\n{(email.body_text or '')[:2000]}\n\n"
                "Attachment context (metadata and deliberately limited previews):\n"
                f"{attachment_context}"
            )
            gateway = get_llm_gateway()
            text, *_ = await gateway.call_llm(
                system,
                user,
                tokens_estimate=650,
                workspace_id=workspace_id,
                feature="service_desk.classify",
            )

            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                raise ValueError("classification response did not contain JSON")
            data = json.loads(match.group(0))
            raw_issues = data.get("issues")
            if not isinstance(raw_issues, list):
                raw_issues = [data]

            primary_ticket = await self.db.get(Ticket, sd.ticket_id)
            if primary_ticket is None:
                raise ValueError("primary ticket disappeared during classification")
            primary_values = dict(primary_ticket.field_values or {})
            issues_overflow = len(raw_issues) > _MAX_ISSUES_PER_EMAIL
            if issues_overflow:
                primary_values["issues_overflow"] = True
                primary_ticket.field_values = primary_values

            issues = self._normalise_issues(raw_issues, allowed, default_type)
            if not issues:
                raise ValueError("classification response contained no valid issues")

            self._apply_issue(sd, issues[0], product_ids)
            primary_values["detected_issues"] = issues
            primary_ticket.field_values = primary_values
            await self.db.flush()
            return issues, issues_overflow
        except Exception as exc:  # noqa: BLE001 — classification is best-effort
            sd.needs_triage = True
            logger.info("Service desk: AI classification skipped (%s)", exc)
            return [], False

    @staticmethod
    def _normalise_issues(
        raw_issues: list[object], valid_types: set[str], default_type: str
    ) -> list[dict]:
        """Validate, deduplicate, and hard-cap model-proposed issue candidates.

        The allowed types are the workspace's own request types, not a fixed
        enum, so a desk that never had a ``query`` type can't be handed one.
        """
        issues: list[dict] = []
        seen: set[tuple[str, str, str]] = set()
        for raw in raw_issues[:_MAX_ISSUES_PER_EMAIL]:
            if not isinstance(raw, dict):
                continue
            summary = " ".join(str(raw.get("summary") or "").split())[:240]
            if not summary:
                continue
            request_type = str(raw.get("request_type") or default_type).lower()
            if request_type not in valid_types:
                request_type = default_type
            product = str(raw["product"]).strip()[:255] if raw.get("product") else None
            try:
                confidence = max(0.0, min(1.0, float(raw.get("confidence", 0))))
            except (TypeError, ValueError):
                confidence = 0.0
            fingerprint = (summary.lower(), request_type, (product or "").lower())
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            issues.append(
                {
                    "summary": summary,
                    "request_type": request_type,
                    "product": product,
                    "confidence": confidence,
                    "split_reason": str(raw.get("split_reason") or "")[:300] or None,
                }
            )
        return issues

    @staticmethod
    def _apply_issue(sd: ServiceDeskTicket, issue: dict, product_ids: dict[str, str]) -> None:
        """Apply only configured classification values to the primary ticket.

        The model's answer is written twice: once as the ticket's value, which a
        person may overwrite, and once as ``ai_*``, which nobody does. Keeping
        both is what makes "did a human agree with this?" answerable at all —
        with one column, a correction is indistinguishable from a classification
        that was right first time.
        """
        sd.request_type = issue["request_type"]
        sd.ai_request_type = issue["request_type"]
        sd.ai_confidence = issue["confidence"]
        if issue["confidence"] < _LOW_CONFIDENCE:
            sd.needs_triage = True
        if issue.get("product"):
            sd.product_id = product_ids.get(str(issue["product"]).lower())
        # Recorded even when the product came from a single-product pairing
        # rather than the model, so "the AI got the product wrong" cannot be
        # said of a product the AI was never asked about.
        if issue.get("product"):
            sd.ai_product_id = sd.product_id

    async def acknowledge_ticket(self, ticket_id: str) -> str:
        """Acknowledge a ticket that is already committed.

        The manual path uses this. Creating the ticket is what the operator is
        waiting for; the receipt is an SMTP round trip that has nothing to do with
        whether the ticket exists, so it happens after the response.

        Returns one of ``ACK_SENT``, ``ACK_NOTHING_TO_DO`` or ``ACK_FAILED``. The
        caller is a Temporal activity, and "there was nobody to write to" must not
        look like "the send broke" — only the second is worth retrying.
        """
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            logger.info("Service desk: ticket %s vanished before its receipt", ticket_id)
            return ACK_NOTHING_TO_DO
        # A phone call has no address to answer. The sentinel is not deliverable,
        # so sending to it only buys an SMTP failure and a log line.
        if (ticket.submitter_email or "").strip().lower() == MANUAL_SENDER_ADDRESS:
            return ACK_NOTHING_TO_DO
        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id)
            )
        ).scalar_one_or_none()
        mailbox = (
            await self.db.get(ServiceDeskMailbox, sd.mailbox_id)
            if sd is not None and sd.mailbox_id
            else None
        )
        await self._send_receipt(
            ticket.workspace_id,
            ticket,
            mailbox,
            thread_id=sd.thread_ref if sd is not None else None,
        )
        # Nothing queued means `_send_receipt` declined it — no requester address,
        # or the requester is the desk itself. That is a decision, not a failure.
        if not self._pending_notifications:
            return ACK_NOTHING_TO_DO
        outcome = await self.flush_notifications()
        if outcome.failed:
            return ACK_FAILED
        # Queued but not sent and not failed: a colleague got there first, or
        # there is no channel to send on. Reporting ACK_SENT for either would put
        # "sent" in the activity log for a message nobody received.
        return ACK_SENT if outcome.sent else ACK_NOTHING_TO_DO

    async def _send_receipt(
        self,
        workspace_id: str,
        ticket: Ticket,
        mailbox: ServiceDeskMailbox | None,
        thread_id: str | None = None,
        children: list[Ticket] | None = None,
        arrived_at: datetime | None = None,
    ) -> None:
        """Queue the acknowledgement email; sent by ``flush_notifications()``.

        One message in means one acknowledgement out, naming every ticket it
        produced — the requester wrote once and should be told once.
        """
        if not ticket.submitter_email:
            return
        # Belt and braces against a self-loop: whatever produced a ticket whose
        # requester is the desk itself, the desk does not write to itself about
        # it. ``is_desk_own_mail`` stops that ticket being created at all; this
        # also covers rows written before it existed and manual mis-entry.
        if mailbox is not None and _address_of(ticket.submitter_email) == (
            mailbox.address or ""
        ).strip().lower():
            logger.info(
                "Service desk: receipt withheld, requester is the desk address (%s)",
                mailbox.address,
            )
            return
        prefix = await ticket_prefix(self.db, workspace_id)
        child_ids = [
            render_display_id(prefix, child.ticket_number) for child in (children or [])
        ]
        additional = ""
        if child_ids:
            additional = (
                "Your email covered more than one request, so we also logged "
                + ("Tickets " if len(child_ids) > 1 else "Ticket ")
                + ", ".join(f"#{display_id}" for display_id in child_ids)
                + "."
            )
        self._pending_notifications.append(
            {
                "workspace_id": workspace_id,
                "mailbox_id": mailbox.id if mailbox is not None else None,
                "ticket_id": ticket.id,
                "ticket_number": ticket.ticket_number,
                "to": ticket.submitter_email,
                "thread_id": thread_id,
                # The cutoff for "has a person replied since?" — see
                # ``desk_replied_in_thread``.
                "arrived_at": arrived_at,
                "vars": {
                    "display_id": await ticket_prefix_display(
                        self.db, workspace_id, ticket.ticket_number
                    ),
                    "subject": (ticket.field_values or {}).get("subject") or "Your request",
                    "requester_name": ticket.submitter_name or "there",
                    "additional_tickets": additional,
                    # Resolved at queue time, not at send time: this runs inside
                    # the ticket's own transaction, so the token is committed
                    # with the ticket rather than written from the notification
                    # flush that happens after the commit.
                    #
                    # Only when the copy actually uses it. Minting unconditionally
                    # would publish a share token for every ticket a desk has ever
                    # acknowledged, including desks that deliberately removed the
                    # link from their acknowledgement.
                    "ticket_url": (
                        await ensure_requester_url(self.db, ticket)
                        if await template_references(
                            self.db, workspace_id, "receipt", "ticket_url"
                        )
                        else ""
                    ),
                },
            }
        )

    async def _already_answered_by_a_person(
        self, ticket_id: str, mailbox: ServiceDeskMailbox | None
    ) -> bool:
        """True when a colleague has already replied to this requester by hand.

        The acknowledgement exists to tell a requester their mail arrived and
        carries a ticket number. Once a person has answered them, sending it
        anyway reads as though the desk never noticed the human reply — so the
        canned receipt stands down.

        Two sources, because the reply may not have been ingested yet: what is
        already on the ticket, and what the account itself shows in the thread.
        """
        if mailbox is None:
            return False
        desk_address = (mailbox.address or "").strip().lower()
        if desk_address:
            replied = (
                await self.db.execute(
                    select(TicketResponse.id).where(
                        TicketResponse.ticket_id == ticket_id,
                        func.lower(TicketResponse.author_email) == desk_address,
                        TicketResponse.is_internal.is_(False),
                    )
                )
            ).first()
            if replied is not None:
                return True
        return False

    async def flush_notifications(self) -> FlushOutcome:
        """Send queued acknowledgements. Call AFTER committing; never raises.

        Kept separate from ``ingest`` so a rolled-back transaction can't leave a
        requester holding a receipt for a ticket that does not exist.

        Returns what became of each one. Callers that treat outbound as
        best-effort ignore it, as they always have; the Temporal activity behind
        manual logging does not, because a receipt that silently never arrived is
        the whole reason it is a durable job.
        """
        pending, self._pending_notifications = self._pending_notifications, []
        if not pending:
            return FlushOutcome(sent=0, failed=0, skipped=0)
        from aexy.services.service_desk_mailer import (
            SEND_FAILED,
            SEND_OK,
            desk_replied_in_thread,
            send_service_desk_email,
        )
        from aexy.services.service_desk_templates import render_sd

        sent = failures = skipped = 0
        for item in pending:
            try:
                mailbox = (
                    await self.db.get(ServiceDeskMailbox, item["mailbox_id"])
                    if item["mailbox_id"]
                    else None
                )
                # Checked here rather than at queue time: this runs after the
                # commit, so the thread lookup is a network call outside the
                # ticket's transaction, and it sees a reply sent seconds ago.
                if await self._already_answered_by_a_person(
                    item["ticket_id"], mailbox
                ) or await desk_replied_in_thread(
                    self.db, mailbox, item["thread_id"], after=item["arrived_at"]
                ):
                    logger.info(
                        "Service desk: receipt for %s withheld, a person already replied",
                        item["vars"].get("display_id"),
                    )
                    skipped += 1
                    continue
                subject, body = await render_sd(self.db, item["workspace_id"], "receipt", item["vars"])
                # The receipt is usually the first message the desk sends, so its
                # subject is the one a colleague's later Gmail reply inherits as
                # "Re: …" — the only way the id reaches mail this application
                # never composed. The template is editable, so an Ops edit that
                # drops {{display_id}} cannot be allowed to take the id with it.
                subject = await force_ticket_id_into_subject(
                    self.db, item["workspace_id"], subject, item["ticket_number"]
                )
                outcome = await send_service_desk_email(
                    self.db, mailbox, item["to"], subject, body, thread_id=item["thread_id"]
                )
                if outcome == SEND_OK:
                    sent += 1
                elif outcome == SEND_FAILED:
                    failures += 1
                    logger.warning(
                        "Service desk: receipt for %s was not delivered",
                        item["vars"].get("display_id"),
                    )
                else:
                    skipped += 1
            except Exception as exc:  # noqa: BLE001 — acknowledgements are best-effort
                failures += 1
                logger.warning("Service desk: receipt send skipped (%s)", exc)
        return FlushOutcome(sent=sent, failed=failures, skipped=skipped)

    # ---------------------------------------------------------- mailbox lookup

    async def find_mailbox(self, workspace_id: str, address: str) -> ServiceDeskMailbox | None:
        return (
            await self.db.execute(
                select(ServiceDeskMailbox).where(
                    ServiceDeskMailbox.workspace_id == workspace_id,
                    func.lower(ServiceDeskMailbox.address) == address.lower(),
                    ServiceDeskMailbox.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()

    @staticmethod
    async def find_mailbox_by_address(db: AsyncSession, address: str) -> ServiceDeskMailbox | None:
        """Workspace-agnostic lookup used by inbound webhooks (to_email → mailbox).

        Addresses are only unique per workspace, so two workspaces may register
        the same one. Pick the oldest deterministically rather than raising
        MultipleResultsFound, which would 500 every inbound email.
        """
        return (
            await db.execute(
                select(ServiceDeskMailbox)
                .where(
                    func.lower(ServiceDeskMailbox.address) == address.lower(),
                    ServiceDeskMailbox.is_active.is_(True),
                )
                .order_by(ServiceDeskMailbox.created_at, ServiceDeskMailbox.id)
            )
        ).scalars().first()

    @staticmethod
    async def find_mailbox_by_integration(
        db: AsyncSession, integration_id: str, workspace_id: str | None = None
    ) -> ServiceDeskMailbox | None:
        """Lookup used by the Gmail sync fan-out (integration → mailbox).

        ``workspace_id`` is the integration's *own* workspace and callers must
        pass it. Matching on ``integration_id`` alone made the mailbox row decide
        which workspace an inbox belongs to: a mailbox registered against another
        workspace's integration would receive that workspace's mail as tickets.
        The create/update path now refuses cross-workspace integration ids, and
        this filter keeps any row written before that check from being honoured.
        """
        query = select(ServiceDeskMailbox).where(
            ServiceDeskMailbox.integration_id == integration_id,
            ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
            ServiceDeskMailbox.is_active.is_(True),
        )
        if workspace_id is not None:
            query = query.where(ServiceDeskMailbox.workspace_id == workspace_id)
        mailbox = (
            await db.execute(
                query.order_by(ServiceDeskMailbox.created_at, ServiceDeskMailbox.id)
            )
        ).scalars().first()
        if mailbox is not None:
            return mailbox

        # Older gmail_sync mailbox records were created before the integration
        # link was populated. Recover only when the mailbox address is exactly
        # the connected Google account, then persist the link for later syncs.
        # The join keeps the recovery inside the integration's own workspace,
        # and the caller's workspace_id narrows it further when supplied.
        from aexy.models.google_integration import GoogleIntegration

        recovery = (
            select(ServiceDeskMailbox)
            .join(GoogleIntegration, GoogleIntegration.workspace_id == ServiceDeskMailbox.workspace_id)
            .where(
                GoogleIntegration.id == integration_id,
                func.lower(ServiceDeskMailbox.address) == func.lower(GoogleIntegration.google_email),
                ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
                ServiceDeskMailbox.is_active.is_(True),
            )
        )
        if workspace_id is not None:
            recovery = recovery.where(ServiceDeskMailbox.workspace_id == workspace_id)
        mailbox = (
            await db.execute(
                recovery.order_by(ServiceDeskMailbox.created_at, ServiceDeskMailbox.id)
            )
        ).scalars().first()
        if mailbox is not None:
            mailbox.integration_id = integration_id
            await db.flush()
        return mailbox


async def acknowledge_ticket_in_background(ticket_id: str) -> None:
    """Send a committed ticket's acknowledgement, in a session of its own.

    Shaped for ``BackgroundTasks``: it runs after the response has gone out, so
    the request-scoped session is already closed and any failure has nobody left
    to report to. Both facts are handled here rather than at each call site.
    """
    from aexy.core.database import get_async_session

    try:
        async with get_async_session() as session:
            await ServiceDeskIntakeService(session).acknowledge_ticket(ticket_id)
    except Exception as exc:  # noqa: BLE001 — acknowledgements are best-effort
        logger.warning("Service desk: receipt for %s skipped (%s)", ticket_id, exc)
