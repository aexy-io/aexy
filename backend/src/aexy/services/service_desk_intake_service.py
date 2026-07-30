"""Bimaplan Service Desk intake — turn an inbound email into a tracked ticket.

One entry point (``ingest``) is shared by both channels (provider inbound-parse
webhook and Gmail sync). It threads replies onto existing tickets, otherwise
runs domain-based auto-assignment (partner → insurer → internal → random KAM
fallback), creates the ``Ticket`` + ``ServiceDeskTicket`` + opens the first
``TicketPendingSegment``, then best-effort AI-classifies and sends the receipt.

See ``prds/BIMAPLAN_SERVICE_DESK_PLAN.md`` §5.
"""

import logging
import re
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    MailboxChannel,
    PendingWith,
    RequestType,
    ServiceDeskIngestedMessage,
    ServiceDeskInsurer,
    ServiceDeskInsurerDomain,
    ServiceDeskLOB,
    ServiceDeskMailbox,
    ServiceDeskPartner,
    ServiceDeskPartnerDomain,
    ServiceDeskTicket,
    TicketOrigin,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse, TicketStatus
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail

logger = logging.getLogger(__name__)

SERVICE_DESK_FORM_SLUG = "service-desk"
TICKET_PREFIX = "BSD"
_BSD_RE = re.compile(rf"{TICKET_PREFIX}-(\d+)", re.IGNORECASE)
_TICKET_NUMBER_ATTEMPTS = 5


def _domain_of(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[-1].strip().lower().rstrip(">")


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

        # 1) Idempotency — claim this message id first. The unique constraint on
        #    (workspace_id, message_id) is what actually makes this safe: two
        #    concurrent deliveries of the same message both pass a bare SELECT.
        #    Covers replies too, not just the first message of a thread.
        if email.message_id and not await self._claim_message(workspace_id, email.message_id):
            logger.info("Service desk: duplicate message %s ignored", email.message_id)
            return None

        # 2) Threading — append to an existing ticket if this is a reply
        existing = await self._find_thread_ticket(workspace_id, email)
        if existing is not None:
            await self._append_reply(workspace_id, existing, email)
            await self._link_message(workspace_id, email.message_id, existing.id)
            return existing

        # 3) New ticket
        ticket = await self._create_ticket(workspace_id, email, mailbox, source)
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
        m = _BSD_RE.search(email.subject or "")
        if m:
            number = int(m.group(1))
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

    async def _append_reply(self, workspace_id: str, ticket: Ticket, email: InboundEmail) -> None:
        response = TicketResponse(
            id=str(uuid4()),
            ticket_id=ticket.id,
            author_email=email.from_email,
            content=email.body_text or "",
            is_internal=False,
        )
        self.db.add(response)
        await self.db.flush()

        # A reply to a closed ticket must reopen it — otherwise the requester's
        # message lands silently: no stakeholder clock restarts and nobody is
        # notified, while the requester believes the thread is live again.
        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(
                    ServiceDeskTicket.ticket_id == ticket.id,
                    ServiceDeskTicket.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if sd is not None and sd.pending_with == PendingWith.CLOSED.value:
            from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

            await ServiceDeskTicketService(self.db).change_pending_with(
                workspace_id,
                ticket.id,
                PendingWith.KAM.value,
                note="Reopened by requester reply",
            )

    # ------------------------------------------------------------- new ticket

    async def _create_ticket(
        self, workspace_id: str, email: InboundEmail, mailbox: ServiceDeskMailbox | None, source: str
    ) -> Ticket:
        domain = _domain_of(email.from_email)
        internal_domain = _domain_of(mailbox.address) if mailbox else None

        partner: ServiceDeskPartner | None = None
        insurer: ServiceDeskInsurer | None = None
        origin = TicketOrigin.EMAIL.value
        needs_triage = False
        assigned_kam_id: str | None = None

        if domain and internal_domain and domain == internal_domain:
            # Internal sender (@bimaplan.co) — partner must be confirmed by KAM
            origin = TicketOrigin.INTERNAL.value
            needs_triage = True
            assigned_kam_id = await self._random_kam(workspace_id)
        else:
            partner = await self._match_partner(workspace_id, domain)
            if partner is not None:
                assigned_kam_id = partner.assigned_kam_id or await self._random_kam(workspace_id)
            else:
                insurer = await self._match_insurer(workspace_id, domain)
                # insurer-originated or wholly unknown → triage + random KAM
                needs_triage = True
                assigned_kam_id = await self._random_kam(workspace_id)

        form_id = await self._ensure_form(workspace_id)

        # ticket_number is max()+1 against a real uq_ticket_number constraint, so
        # concurrent intake (two emails arriving together) collides. Retry inside
        # a savepoint instead of letting the IntegrityError escape — in the
        # webhook path it was swallowed by the caller and the email was dropped.
        ticket: Ticket | None = None
        for attempt in range(_TICKET_NUMBER_ATTEMPTS):
            candidate = Ticket(
                id=str(uuid4()),
                form_id=form_id,
                workspace_id=workspace_id,
                ticket_number=await self._next_ticket_number(workspace_id),
                submitter_email=email.from_email,
                submitter_name=email.from_name,
                email_verified=False,
                field_values={
                    "subject": email.subject,
                    "body": email.body_text,
                    "partner": partner.name if partner else None,
                    "insurer": insurer.name if insurer else None,
                },
                status=TicketStatus.NEW.value,
                assignee_id=assigned_kam_id,
                source=source,
            )
            try:
                async with self.db.begin_nested():
                    self.db.add(candidate)
                ticket = candidate
                break
            except IntegrityError:
                # The savepoint rollback already detached `candidate`; do not try
                # to expunge it (that raises "not present in this Session").
                if attempt == _TICKET_NUMBER_ATTEMPTS - 1:
                    raise
        assert ticket is not None  # loop either breaks with a ticket or raises
        await self.db.flush()

        sd = ServiceDeskTicket(
            id=str(uuid4()),
            ticket_id=ticket.id,
            workspace_id=workspace_id,
            partner_id=partner.id if partner else None,
            insurer_id=insurer.id if insurer else None,
            request_type=RequestType.QUERY.value,
            pending_with=PendingWith.KAM.value,
            origin=origin,
            needs_triage=needs_triage,
            mailbox_id=mailbox.id if mailbox is not None else None,
            thread_ref=email.thread_id or email.message_id,
            source_message_id=email.message_id,
        )
        self.db.add(sd)

        # open the first pending-with segment (the ledger starts here)
        self.db.add(
            TicketPendingSegment(
                id=str(uuid4()),
                workspace_id=workspace_id,
                ticket_id=ticket.id,
                pending_with=PendingWith.KAM.value,
                entered_at=datetime.now(timezone.utc),
                changed_by_id=assigned_kam_id,
                note="Ticket created",
            )
        )
        await self.db.flush()

        # best-effort enrichment + receipt (never block intake).
        # AI reading/categorisation is opt-in per workspace (default off).
        if await self._ai_enabled(workspace_id):
            await self._classify(workspace_id, sd, email)
        await self._send_receipt(workspace_id, ticket, mailbox, thread_id=email.thread_id)

        logger.info("Service desk: created ticket %s-%s", TICKET_PREFIX, ticket.ticket_number)
        return ticket

    # ------------------------------------------------------------- assignment

    async def _match_partner(self, workspace_id: str, domain: str | None) -> ServiceDeskPartner | None:
        if not domain:
            return None
        row = (
            await self.db.execute(
                select(ServiceDeskPartner)
                .join(ServiceDeskPartnerDomain, ServiceDeskPartnerDomain.partner_id == ServiceDeskPartner.id)
                .where(
                    ServiceDeskPartner.workspace_id == workspace_id,
                    ServiceDeskPartner.is_active.is_(True),
                    func.lower(ServiceDeskPartnerDomain.domain) == domain,
                )
                .order_by(ServiceDeskPartner.created_at, ServiceDeskPartner.id)
            )
        ).scalars().first()
        return row

    async def _match_insurer(self, workspace_id: str, domain: str | None) -> ServiceDeskInsurer | None:
        if not domain:
            return None
        row = (
            await self.db.execute(
                select(ServiceDeskInsurer)
                .join(ServiceDeskInsurerDomain, ServiceDeskInsurerDomain.insurer_id == ServiceDeskInsurer.id)
                .where(
                    ServiceDeskInsurer.workspace_id == workspace_id,
                    ServiceDeskInsurer.is_active.is_(True),
                    func.lower(ServiceDeskInsurerDomain.domain) == domain,
                )
                .order_by(ServiceDeskInsurer.created_at, ServiceDeskInsurer.id)
            )
        ).scalars().first()
        return row

    async def _random_kam(self, workspace_id: str) -> str | None:
        """Pick a random Ops/KAM department member who is still on the team.

        Department membership alone isn't enough: rows are not removed when
        someone leaves the workspace, so joining WorkspaceMember keeps tickets
        from being auto-assigned to a departed employee's dead queue.
        """
        rows = (
            await self.db.execute(
                select(DepartmentMember.developer_id)
                .join(Department, Department.id == DepartmentMember.department_id)
                .join(
                    WorkspaceMember,
                    (WorkspaceMember.developer_id == DepartmentMember.developer_id)
                    & (WorkspaceMember.workspace_id == workspace_id),
                )
                .where(
                    Department.workspace_id == workspace_id,
                    Department.function_key == "ops_kam",
                    Department.is_active.is_(True),
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
            name="Bimaplan Service Desk",
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
        """Whether AI email reading/categorisation is enabled for this workspace."""
        ws = await self.db.get(Workspace, workspace_id)
        if ws is None:
            return False
        return bool(((ws.settings or {}).get("service_desk") or {}).get("ai_classification_enabled", False))

    async def _classify(self, workspace_id: str, sd: ServiceDeskTicket, email: InboundEmail) -> None:
        """Best-effort AI classification of request_type + LOB. Never raises."""
        try:
            from aexy.llm.gateway import get_llm_gateway

            lobs = (
                await self.db.execute(
                    select(ServiceDeskLOB.name).where(
                        ServiceDeskLOB.workspace_id == workspace_id,
                        ServiceDeskLOB.is_active.is_(True),
                    )
                )
            ).scalars().all()
            lob_list = ", ".join(lobs) if lobs else "(none configured)"
            system = (
                "You classify insurance operations emails. Reply with a compact JSON object "
                '{"request_type": one of [query, policy_issuance, claims, payout], '
                '"lob": one of the provided LOBs or null, "confidence": 0..1}. JSON only.'
            )
            user = f"LOBs: {lob_list}\nSubject: {email.subject}\n\n{(email.body_text or '')[:2000]}"
            gateway = get_llm_gateway()
            text, *_ = await gateway.call_llm(system, user, tokens_estimate=400, workspace_id=workspace_id)

            import json

            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                return
            data = json.loads(match.group(0))
            rt = str(data.get("request_type", "")).lower()
            if rt in {e.value for e in RequestType}:
                sd.request_type = rt
            conf = data.get("confidence")
            if isinstance(conf, (int, float)):
                sd.ai_confidence = float(conf)
                if conf < 0.6:
                    sd.needs_triage = True
            lob_name = data.get("lob")
            if lob_name:
                lob_id = (
                    await self.db.execute(
                        select(ServiceDeskLOB.id).where(
                            ServiceDeskLOB.workspace_id == workspace_id,
                            func.lower(ServiceDeskLOB.name) == str(lob_name).lower(),
                        )
                    )
                ).scalar_one_or_none()
                if lob_id:
                    sd.lob_id = lob_id
            await self.db.flush()
        except Exception as exc:  # noqa: BLE001 — classification is best-effort
            logger.info("Service desk: AI classification skipped (%s)", exc)

    async def _send_receipt(
        self, workspace_id: str, ticket: Ticket, mailbox: ServiceDeskMailbox | None, thread_id: str | None = None
    ) -> None:
        """Queue the acknowledgement email; sent by ``flush_notifications()``."""
        if not ticket.submitter_email:
            return
        self._pending_notifications.append(
            {
                "workspace_id": workspace_id,
                "mailbox_id": mailbox.id if mailbox is not None else None,
                "to": ticket.submitter_email,
                "thread_id": thread_id,
                "vars": {
                    "display_id": f"{TICKET_PREFIX}-{ticket.ticket_number}",
                    "subject": (ticket.field_values or {}).get("subject") or "Your request",
                    "requester_name": ticket.submitter_name or "there",
                },
            }
        )

    async def flush_notifications(self) -> None:
        """Send queued acknowledgements. Call AFTER committing; never raises.

        Kept separate from ``ingest`` so a rolled-back transaction can't leave a
        requester holding a receipt for a ticket that does not exist.
        """
        pending, self._pending_notifications = self._pending_notifications, []
        if not pending:
            return
        from aexy.services.service_desk_mailer import send_service_desk_email
        from aexy.services.service_desk_templates import render_sd

        for item in pending:
            try:
                mailbox = (
                    await self.db.get(ServiceDeskMailbox, item["mailbox_id"])
                    if item["mailbox_id"]
                    else None
                )
                subject, body = await render_sd(self.db, item["workspace_id"], "receipt", item["vars"])
                await send_service_desk_email(
                    self.db, mailbox, item["to"], subject, body, thread_id=item["thread_id"]
                )
            except Exception as exc:  # noqa: BLE001 — acknowledgements are best-effort
                logger.warning("Service desk: receipt send skipped (%s)", exc)

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
    async def find_mailbox_by_integration(db: AsyncSession, integration_id: str) -> ServiceDeskMailbox | None:
        """Lookup used by the Gmail sync fan-out (integration → mailbox)."""
        return (
            await db.execute(
                select(ServiceDeskMailbox)
                .where(
                    ServiceDeskMailbox.integration_id == integration_id,
                    ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
                    ServiceDeskMailbox.is_active.is_(True),
                )
                .order_by(ServiceDeskMailbox.created_at, ServiceDeskMailbox.id)
            )
        ).scalars().first()
