"""Unit tests for the Bimaplan Service Desk intake service.

Covers domain-based auto-assignment (partner → insurer → internal → random KAM
fallback), first pending-with segment creation, reply threading, and
idempotency. AI classification and the receipt email are best-effort hooks and
are stubbed out here.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskInsurer,
    ServiceDeskInsurerDomain,
    ServiceDeskMailbox,
    ServiceDeskPartner,
    ServiceDeskPartnerDomain,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketResponse
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services import service_desk_intake_service as sd_mod
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService


@pytest.fixture(autouse=True)
def _stub_best_effort(monkeypatch):
    async def _noop(self, *a, **k):
        return None

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _noop)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _noop)


async def _workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(email=f"owner-{slug}@bimaplan.co", name=f"Owner {slug}")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


async def _mailbox(db: AsyncSession, ws: Workspace) -> ServiceDeskMailbox:
    mb = ServiceDeskMailbox(workspace_id=ws.id, address="operations@bimaplan.co", channel="webhook")
    db.add(mb)
    await db.commit()
    await db.refresh(mb)
    return mb


async def _ops_kam(db: AsyncSession, ws: Workspace, n: int = 2) -> list[str]:
    dept = Department(
        workspace_id=ws.id, name="KAM", slug="kam", function_key="ops_kam", path="/kam/", depth=0
    )
    db.add(dept)
    await db.flush()
    ids = []
    for i in range(n):
        dev = Developer(email=f"kam{i}-{ws.slug}@bimaplan.co", name=f"KAM{i}")
        db.add(dev)
        await db.flush()
        db.add(DepartmentMember(workspace_id=ws.id, department_id=dept.id, developer_id=dev.id))
        # A KAM must also be an active workspace member — auto-assignment skips
        # department rows left behind by people who have left the workspace.
        db.add(
            WorkspaceMember(
                workspace_id=ws.id, developer_id=dev.id, role="member", status="active"
            )
        )
        ids.append(dev.id)
    await db.commit()
    return ids


def _email(**kw) -> InboundEmail:
    base = dict(to="operations@bimaplan.co", from_email="x@example.com", subject="Help", body_text="Body")
    base.update(kw)
    return InboundEmail(**base)


async def _sd_for(db: AsyncSession, ticket_id: str) -> ServiceDeskTicket:
    return (
        await db.execute(select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_partner_domain_match_assigns_mapped_kam(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-a")
    mb = await _mailbox(db_session, ws)
    kam = Developer(email="neha@bimaplan.co", name="Neha")
    db_session.add(kam)
    await db_session.flush()
    partner = ServiceDeskPartner(workspace_id=ws.id, name="ABC Finance", assigned_kam_id=kam.id)
    db_session.add(partner)
    await db_session.flush()
    db_session.add(ServiceDeskPartnerDomain(workspace_id=ws.id, partner_id=partner.id, domain="abcfinance.com"))
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="rahul@abcfinance.com", message_id="m1"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    assert ticket is not None
    assert ticket.assignee_id == kam.id
    sd = await _sd_for(db_session, ticket.id)
    assert sd.partner_id == partner.id
    assert sd.pending_with == "kam"
    assert sd.needs_triage is False
    # first ledger segment opened
    seg = (
        await db_session.execute(select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == ticket.id))
    ).scalars().all()
    assert len(seg) == 1 and seg[0].pending_with == "kam" and seg[0].exited_at is None


@pytest.mark.asyncio
async def test_insurer_domain_match_flags_triage(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-b")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    insurer = ServiceDeskInsurer(workspace_id=ws.id, name="XYZ Life")
    db_session.add(insurer)
    await db_session.flush()
    db_session.add(ServiceDeskInsurerDomain(workspace_id=ws.id, insurer_id=insurer.id, domain="xyzlifeinsurance.com"))
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="claims@xyzlifeinsurance.com", message_id="m2"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, ticket.id)
    assert sd.insurer_id == insurer.id
    assert sd.partner_id is None
    assert sd.needs_triage is True


@pytest.mark.asyncio
async def test_internal_sender_marks_internal(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-c")
    mb = await _mailbox(db_session, ws)
    kams = await _ops_kam(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="priya.sales@bimaplan.co", message_id="m3"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, ticket.id)
    assert sd.origin == "internal"
    assert sd.needs_triage is True
    assert ticket.assignee_id in kams  # random fallback into Ops/KAM


@pytest.mark.asyncio
async def test_no_match_random_fallback(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-d")
    mb = await _mailbox(db_session, ws)
    kams = await _ops_kam(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="contact@newpartner.io", message_id="m4"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, ticket.id)
    assert sd.needs_triage is True
    assert sd.partner_id is None
    assert ticket.assignee_id in kams


@pytest.mark.asyncio
async def test_threading_appends_reply(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-e")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    svc = ServiceDeskIntakeService(db_session)

    first = await svc.ingest(_email(from_email="a@newpartner.io", message_id="msg-1", thread_id="T1"), mb, "service_desk_webhook")
    await db_session.commit()

    # reply in the same thread
    second = await svc.ingest(
        _email(from_email="a@newpartner.io", message_id="msg-2", thread_id="T1", body_text="A reply"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    assert second is not None and second.id == first.id
    tickets = (await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))).scalars().all()
    assert len(tickets) == 1  # no new ticket
    responses = (
        await db_session.execute(select(TicketResponse).where(TicketResponse.ticket_id == first.id))
    ).scalars().all()
    assert len(responses) == 1 and responses[0].content == "A reply"


@pytest.mark.asyncio
async def test_idempotent_on_message_id(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-f")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    svc = ServiceDeskIntakeService(db_session)

    t1 = await svc.ingest(_email(from_email="a@newpartner.io", message_id="dup-1"), mb, "service_desk_webhook")
    await db_session.commit()
    dup = await svc.ingest(_email(from_email="a@newpartner.io", message_id="dup-1"), mb, "service_desk_webhook")
    await db_session.commit()

    assert t1 is not None and dup is None
    count = (await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))).scalars().all()
    assert len(count) == 1


@pytest.mark.asyncio
async def test_subject_bsd_token_threads(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-g")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    svc = ServiceDeskIntakeService(db_session)

    first = await svc.ingest(_email(from_email="a@newpartner.io", message_id="s1", subject="Original"), mb, "service_desk_webhook")
    await db_session.commit()
    num = first.ticket_number

    second = await svc.ingest(
        _email(from_email="a@newpartner.io", message_id="s2", subject=f"Re: BSD-{num} Original", body_text="threaded"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    assert second is not None and second.id == first.id
