"""Bimaplan Service Desk management service — master data + ticket listing.

CRUD for partners/insurers/LOBs/mailboxes (the editable master data that drives
intake auto-assignment) plus listing service-desk tickets and manual logging.
"""

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import delete, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    INTERNAL_PENDING_WITH,
    ServiceDeskInsurer,
    ServiceDeskInsurerDomain,
    ServiceDeskLOB,
    ServiceDeskMailbox,
    ServiceDeskPartner,
    ServiceDeskPartnerDomain,
    ServiceDeskTicket,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace
from aexy.schemas.service_desk import (
    InboundEmail,
    InsurerCreate,
    InsurerResponse,
    InsurerUpdate,
    LOBCreate,
    LOBResponse,
    MailboxCreate,
    MailboxResponse,
    MailboxUpdate,
    ManualTicketCreate,
    PartnerCreate,
    PartnerResponse,
    PartnerUpdate,
    ServiceDeskTicketResponse,
)


async def _caller_functions(db: AsyncSession, workspace_id: str, developer_id: str) -> set[str]:
    """The ``function_key``s of every department the caller belongs to."""
    return set(
        (
            await db.execute(
                select(Department.function_key)
                .join(DepartmentMember, DepartmentMember.department_id == Department.id)
                .where(
                    Department.workspace_id == workspace_id,
                    DepartmentMember.developer_id == developer_id,
                    Department.function_key.isnot(None),
                )
            )
        ).scalars().all()
    )


async def resolve_scope_clause(db: AsyncSession, workspace_id: str, developer_id: str):
    """Row-level visibility for the caller (BRD §11 / plan §10).

    Returns None when the caller may see everything (Ops Head / manager /
    anyone with ``can_manage_service_desk``). Otherwise returns a SQLAlchemy
    clause restricting to: tickets pending with a function the caller belongs
    to, plus (for Ops/KAM members) tickets assigned to them. A caller with no
    relevant function sees nothing.
    """
    from aexy.services.permission_service import PermissionService

    if await PermissionService(db).check_permission(workspace_id, developer_id, "can_manage_service_desk"):
        return None

    functions = await _caller_functions(db, workspace_id, developer_id)
    pending_values = {pw for pw, fk in INTERNAL_PENDING_WITH.items() if fk in functions}

    clauses = []
    if pending_values:
        clauses.append(ServiceDeskTicket.pending_with.in_(pending_values))
    if "ops_kam" in functions:
        clauses.append(Ticket.assignee_id == developer_id)
    if not clauses:
        return false()
    return or_(*clauses)


async def describe_scope(db: AsyncSession, workspace_id: str, developer_id: str) -> str:
    """``"all"`` | ``"function"`` | ``"none"`` — how wide the caller's view is.

    The clause returned by ``resolve_scope_clause`` can't be introspected by the
    UI, and an empty ticket list is ambiguous: a KAM who was never added to the
    Operations department sees exactly what a KAM on a quiet day sees. Naming the
    scope lets the page say "you are in no department yet" instead of implying
    there is no work.
    """
    from aexy.services.permission_service import PermissionService

    if await PermissionService(db).check_permission(workspace_id, developer_id, "can_manage_service_desk"):
        return "all"
    functions = await _caller_functions(db, workspace_id, developer_id)
    if "ops_kam" in functions or any(fk in functions for fk in INTERNAL_PENDING_WITH.values()):
        return "function"
    return "none"


TICKET_PREFIX = "BSD"


def _norm_domain(d: str) -> str:
    return d.strip().lower().lstrip("@")


class ServiceDeskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ----------------------------------------------------------- partners

    @staticmethod
    def _partner_response(p: ServiceDeskPartner) -> PartnerResponse:
        return PartnerResponse(
            id=p.id,
            workspace_id=p.workspace_id,
            name=p.name,
            assigned_kam_id=p.assigned_kam_id,
            is_active=p.is_active,
            domains=[d.domain for d in p.domains],
            created_at=p.created_at,
        )

    async def list_partners(self, workspace_id: str) -> list[PartnerResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskPartner)
                .where(ServiceDeskPartner.workspace_id == workspace_id)
                .order_by(ServiceDeskPartner.name)
            )
        ).scalars().all()
        return [self._partner_response(p) for p in rows]

    async def create_partner(self, workspace_id: str, data: PartnerCreate) -> PartnerResponse:
        partner = ServiceDeskPartner(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            assigned_kam_id=data.assigned_kam_id,
            is_active=data.is_active,
        )
        self.db.add(partner)
        await self.db.flush()
        for dom in data.domains:
            self.db.add(
                ServiceDeskPartnerDomain(
                    id=str(uuid4()), workspace_id=workspace_id, partner_id=partner.id, domain=_norm_domain(dom)
                )
            )
        await self.db.flush()
        await self.db.refresh(partner)
        return self._partner_response(partner)

    async def update_partner(self, workspace_id: str, partner_id: str, data: PartnerUpdate) -> PartnerResponse:
        partner = await self._get_partner(workspace_id, partner_id)
        payload = data.model_dump(exclude_unset=True)
        domains = payload.pop("domains", None)
        for k, v in payload.items():
            setattr(partner, k, v)
        if domains is not None:
            await self.db.execute(
                delete(ServiceDeskPartnerDomain).where(ServiceDeskPartnerDomain.partner_id == partner_id)
            )
            for dom in domains:
                self.db.add(
                    ServiceDeskPartnerDomain(
                        id=str(uuid4()), workspace_id=workspace_id, partner_id=partner_id, domain=_norm_domain(dom)
                    )
                )
        await self.db.flush()
        await self.db.refresh(partner)
        return self._partner_response(partner)

    async def delete_partner(self, workspace_id: str, partner_id: str) -> None:
        partner = await self._get_partner(workspace_id, partner_id)
        await self.db.delete(partner)
        await self.db.flush()

    async def _get_partner(self, workspace_id: str, partner_id: str) -> ServiceDeskPartner:
        p = (
            await self.db.execute(
                select(ServiceDeskPartner).where(
                    ServiceDeskPartner.id == partner_id, ServiceDeskPartner.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if p is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")
        return p

    # ----------------------------------------------------------- insurers

    @staticmethod
    def _insurer_response(i: ServiceDeskInsurer) -> InsurerResponse:
        return InsurerResponse(
            id=i.id,
            workspace_id=i.workspace_id,
            name=i.name,
            is_active=i.is_active,
            domains=[d.domain for d in i.domains],
            created_at=i.created_at,
        )

    async def list_insurers(self, workspace_id: str) -> list[InsurerResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskInsurer)
                .where(ServiceDeskInsurer.workspace_id == workspace_id)
                .order_by(ServiceDeskInsurer.name)
            )
        ).scalars().all()
        return [self._insurer_response(i) for i in rows]

    async def create_insurer(self, workspace_id: str, data: InsurerCreate) -> InsurerResponse:
        insurer = ServiceDeskInsurer(
            id=str(uuid4()), workspace_id=workspace_id, name=data.name, is_active=data.is_active
        )
        self.db.add(insurer)
        await self.db.flush()
        for dom in data.domains:
            self.db.add(
                ServiceDeskInsurerDomain(
                    id=str(uuid4()), workspace_id=workspace_id, insurer_id=insurer.id, domain=_norm_domain(dom)
                )
            )
        await self.db.flush()
        await self.db.refresh(insurer)
        return self._insurer_response(insurer)

    async def update_insurer(self, workspace_id: str, insurer_id: str, data: InsurerUpdate) -> InsurerResponse:
        insurer = (
            await self.db.execute(
                select(ServiceDeskInsurer).where(
                    ServiceDeskInsurer.id == insurer_id, ServiceDeskInsurer.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if insurer is None:
            raise HTTPException(status_code=404, detail="Insurer not found")
        payload = data.model_dump(exclude_unset=True)
        domains = payload.pop("domains", None)
        for k, v in payload.items():
            setattr(insurer, k, v)
        if domains is not None:
            await self.db.execute(
                delete(ServiceDeskInsurerDomain).where(ServiceDeskInsurerDomain.insurer_id == insurer_id)
            )
            for dom in domains:
                self.db.add(
                    ServiceDeskInsurerDomain(
                        id=str(uuid4()), workspace_id=workspace_id, insurer_id=insurer_id, domain=_norm_domain(dom)
                    )
                )
        await self.db.flush()
        await self.db.refresh(insurer)
        return self._insurer_response(insurer)

    async def delete_insurer(self, workspace_id: str, insurer_id: str) -> None:
        await self.db.execute(
            delete(ServiceDeskInsurer).where(
                ServiceDeskInsurer.id == insurer_id, ServiceDeskInsurer.workspace_id == workspace_id
            )
        )
        await self.db.flush()

    # ----------------------------------------------------------- LOBs

    async def list_lobs(self, workspace_id: str) -> list[LOBResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskLOB)
                .where(ServiceDeskLOB.workspace_id == workspace_id)
                .order_by(ServiceDeskLOB.name)
            )
        ).scalars().all()
        return [LOBResponse.model_validate(r) for r in rows]

    async def create_lob(self, workspace_id: str, data: LOBCreate) -> LOBResponse:
        lob = ServiceDeskLOB(id=str(uuid4()), workspace_id=workspace_id, name=data.name, is_active=data.is_active)
        self.db.add(lob)
        await self.db.flush()
        await self.db.refresh(lob)
        return LOBResponse.model_validate(lob)

    async def delete_lob(self, workspace_id: str, lob_id: str) -> None:
        await self.db.execute(
            delete(ServiceDeskLOB).where(
                ServiceDeskLOB.id == lob_id, ServiceDeskLOB.workspace_id == workspace_id
            )
        )
        await self.db.flush()

    # ----------------------------------------------------------- mailboxes

    async def list_mailboxes(self, workspace_id: str) -> list[MailboxResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskMailbox)
                .where(ServiceDeskMailbox.workspace_id == workspace_id)
                .order_by(ServiceDeskMailbox.address)
            )
        ).scalars().all()
        return [MailboxResponse.model_validate(r) for r in rows]

    async def create_mailbox(self, workspace_id: str, data: MailboxCreate) -> MailboxResponse:
        mailbox = ServiceDeskMailbox(
            id=str(uuid4()),
            workspace_id=workspace_id,
            address=data.address.lower(),
            channel=data.channel,
            integration_id=data.integration_id,
            is_active=data.is_active,
        )
        self.db.add(mailbox)
        await self.db.flush()
        await self.db.refresh(mailbox)
        return MailboxResponse.model_validate(mailbox)

    async def update_mailbox(self, workspace_id: str, mailbox_id: str, data: MailboxUpdate) -> MailboxResponse:
        mailbox = (
            await self.db.execute(
                select(ServiceDeskMailbox).where(
                    ServiceDeskMailbox.id == mailbox_id, ServiceDeskMailbox.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if mailbox is None:
            raise HTTPException(status_code=404, detail="Mailbox not found")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(mailbox, k, v)
        await self.db.flush()
        await self.db.refresh(mailbox)
        return MailboxResponse.model_validate(mailbox)

    async def delete_mailbox(self, workspace_id: str, mailbox_id: str) -> None:
        await self.db.execute(
            delete(ServiceDeskMailbox).where(
                ServiceDeskMailbox.id == mailbox_id, ServiceDeskMailbox.workspace_id == workspace_id
            )
        )
        await self.db.flush()

    # ----------------------------------------------------------- settings

    async def get_settings(self, workspace_id: str, developer_id: str | None = None) -> dict:
        ws = await self.db.get(Workspace, workspace_id)
        sd = ((ws.settings or {}).get("service_desk") or {}) if ws else {}
        can_manage = False
        scope = "all"
        if developer_id is not None:
            from aexy.services.permission_service import PermissionService

            can_manage = await PermissionService(self.db).check_permission(
                workspace_id, developer_id, "can_manage_service_desk"
            )
            scope = await describe_scope(self.db, workspace_id, developer_id)
        return {
            "ai_classification_enabled": bool(sd.get("ai_classification_enabled", False)),
            "can_manage": bool(can_manage),
            "scope": scope,
        }

    async def update_settings(self, workspace_id: str, ai_classification_enabled: bool) -> dict:
        ws = await self.db.get(Workspace, workspace_id)
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        settings = dict(ws.settings or {})
        sd = dict(settings.get("service_desk") or {})
        sd["ai_classification_enabled"] = bool(ai_classification_enabled)
        settings["service_desk"] = sd
        ws.settings = settings  # reassign so SQLAlchemy tracks the JSONB change
        await self.db.flush()
        # Only a manager reaches this endpoint, so can_manage is true by construction.
        # Only a manager reaches this endpoint, so both capabilities are true by
        # construction — a manager's scope is always "all".
        return {"ai_classification_enabled": bool(ai_classification_enabled), "can_manage": True, "scope": "all"}

    # ----------------------------------------------------------- tickets

    async def list_tickets(
        self, workspace_id: str, developer_id: str | None = None
    ) -> list[ServiceDeskTicketResponse]:
        query = (
            select(ServiceDeskTicket, Ticket, ServiceDeskPartner)
            .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
            .outerjoin(ServiceDeskPartner, ServiceDeskPartner.id == ServiceDeskTicket.partner_id)
            .where(ServiceDeskTicket.workspace_id == workspace_id)
            .order_by(Ticket.created_at.desc())
        )
        if developer_id is not None:
            clause = await resolve_scope_clause(self.db, workspace_id, developer_id)
            if clause is not None:
                query = query.where(clause)
        rows = (await self.db.execute(query)).all()
        out: list[ServiceDeskTicketResponse] = []
        for sd, ticket, partner in rows:
            out.append(
                ServiceDeskTicketResponse(
                    id=sd.id,
                    ticket_id=sd.ticket_id,
                    workspace_id=sd.workspace_id,
                    ticket_number=ticket.ticket_number,
                    display_id=f"{TICKET_PREFIX}-{ticket.ticket_number}",
                    subject=(ticket.field_values or {}).get("subject"),
                    requester_email=ticket.submitter_email,
                    requester_name=ticket.submitter_name,
                    status=ticket.status,
                    lob_id=sd.lob_id,
                    partner_id=sd.partner_id,
                    partner_name=partner.name if partner else None,
                    insurer_id=sd.insurer_id,
                    assigned_kam_id=ticket.assignee_id,
                    request_type=sd.request_type,
                    pending_with=sd.pending_with,
                    origin=sd.origin,
                    needs_triage=sd.needs_triage,
                    ai_confidence=sd.ai_confidence,
                    created_at=sd.created_at,
                )
            )
        return out

    async def create_manual_ticket(self, workspace_id: str, data: ManualTicketCreate) -> str:
        """Log a phone/WhatsApp request as a ticket (same fields, origin=manual)."""
        from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

        # A manual ticket has no mailbox. It used to pass a synthetic, unsaved
        # ServiceDeskMailbox — which would now violate the mailbox_id FK — and
        # intake handles None directly (outbound falls back to EmailService).
        intake = ServiceDeskIntakeService(self.db)
        email = InboundEmail(
            to="manual@local",
            from_email=data.requester_email or "manual@local",
            from_name=data.requester_name,
            subject=data.subject,
            body_text=data.body,
        )
        ticket = await intake._create_ticket(workspace_id, email, None, source="service_desk_manual")
        # override AI defaults with the explicitly-provided fields
        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
            )
        ).scalar_one()
        sd.origin = "manual"
        sd.request_type = data.request_type
        # These ids come from the request body — confirm they are ours.
        if data.lob_id:
            await self._require_own(ServiceDeskLOB, workspace_id, data.lob_id, "LOB")
            sd.lob_id = data.lob_id
        if data.partner_id:
            await self._require_own(ServiceDeskPartner, workspace_id, data.partner_id, "Partner")
            sd.partner_id = data.partner_id
        await self.db.flush()

        # Commit before the acknowledgement goes out, so a rollback can't leave
        # the requester holding a receipt for a ticket that never existed.
        await self.db.commit()
        await intake.flush_notifications()
        return ticket.id

    async def _require_own(self, model, workspace_id: str, row_id: str, label: str) -> None:
        found = (
            await self.db.execute(
                select(model.id).where(model.id == row_id, model.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()
        if found is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found in this workspace"
            )
