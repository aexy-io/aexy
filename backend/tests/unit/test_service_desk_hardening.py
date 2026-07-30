"""Regression tests for Service Desk intake hardening.

Each test pins a specific defect found in review:
- a "Re: BSD-<n>" subject threading onto a GENERIC ticket (shared ticket_number)
- redelivered replies being appended twice (idempotency only covered the first
  message of a thread)
- a reply to a closed ticket landing silently instead of reopening it
- the acknowledgement email being sent before the transaction committed
- auto-assignment picking someone who has left the workspace
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    PendingWith,
    ServiceDeskIngestedMessage,
    ServiceDeskMailbox,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService


async def _ws(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@bimaplan.co", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="admin", status="active"))
    await db.commit()
    return ws


async def _mailbox(db: AsyncSession, ws: Workspace) -> ServiceDeskMailbox:
    mb = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="operations@bimaplan.co", channel="webhook"
    )
    db.add(mb)
    await db.commit()
    return mb


def _email(**kw) -> InboundEmail:
    base = dict(
        to="operations@bimaplan.co", from_email="partner@abcfinance.com",
        subject="Help", body_text="Body",
    )
    base.update(kw)
    return InboundEmail(**base)


@pytest.mark.asyncio
async def test_bsd_subject_cannot_hijack_a_generic_ticket(db_session: AsyncSession):
    """ticket_number is shared with the generic module, so a crafted subject
    must not attach an external sender's body to a non-service-desk ticket."""
    ws = await _ws(db_session, f"hj-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    form = TicketForm(id=str(uuid4()), workspace_id=ws.id, name="HR Helpdesk", slug="hr-helpdesk")
    db_session.add(form)
    await db_session.flush()
    generic = Ticket(
        id=str(uuid4()), form_id=form.id, workspace_id=ws.id, ticket_number=7,
        submitter_email="employee@bimaplan.co", field_values={"subject": "My salary slip"},
        status="new", source="portal",
    )
    db_session.add(generic)
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="attacker@outside.com", subject="Re: BSD-7 please advise",
               body_text="INJECTED", message_id="<hj-1@outside.com>"),
        mb, source="service_desk_webhook",
    )
    await db_session.commit()

    # Nothing was appended to the generic ticket ...
    replies = (await db_session.execute(
        select(TicketResponse).where(TicketResponse.ticket_id == generic.id)
    )).scalars().all()
    assert replies == []
    # ... and the email became its own service desk ticket instead of vanishing.
    assert ticket is not None and ticket.id != generic.id
    sd = (await db_session.execute(
        select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
    )).scalar_one()
    assert sd.workspace_id == ws.id


@pytest.mark.asyncio
async def test_bsd_subject_still_threads_onto_a_real_service_desk_ticket(db_session: AsyncSession):
    """The hijack fix must not break legitimate subject-based threading."""
    ws = await _ws(db_session, f"th-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    intake = ServiceDeskIntakeService(db_session)

    first = await intake.ingest(_email(message_id="<th-1@x.com>"), mb, source="service_desk_webhook")
    await db_session.commit()

    again = await intake.ingest(
        _email(subject=f"Re: BSD-{first.ticket_number} more info", body_text="extra detail",
               message_id="<th-2@x.com>"),
        mb, source="service_desk_webhook",
    )
    await db_session.commit()

    assert again is not None and again.id == first.id
    replies = (await db_session.execute(
        select(TicketResponse).where(TicketResponse.ticket_id == first.id)
    )).scalars().all()
    assert [r.content for r in replies] == ["extra detail"]


@pytest.mark.asyncio
async def test_redelivered_reply_is_not_appended_twice(db_session: AsyncSession):
    """Inbound-parse providers retry on non-2xx; idempotency must cover replies,
    not just the first message of a thread."""
    ws = await _ws(db_session, f"dup-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    intake = ServiceDeskIntakeService(db_session)

    first = await intake.ingest(_email(message_id="<dup-1@x.com>"), mb, source="service_desk_webhook")
    await db_session.commit()

    reply = _email(subject=f"Re: BSD-{first.ticket_number}", body_text="my reply",
                   message_id="<dup-2@x.com>")
    assert await intake.ingest(reply, mb, source="service_desk_webhook") is not None
    await db_session.commit()
    # exact same message delivered again
    assert await intake.ingest(reply, mb, source="service_desk_webhook") is None
    await db_session.commit()

    replies = (await db_session.execute(
        select(TicketResponse).where(TicketResponse.ticket_id == first.id)
    )).scalars().all()
    assert [r.content for r in replies] == ["my reply"]

    claimed = (await db_session.execute(
        select(ServiceDeskIngestedMessage.message_id).where(
            ServiceDeskIngestedMessage.workspace_id == ws.id
        )
    )).scalars().all()
    assert sorted(claimed) == ["<dup-1@x.com>", "<dup-2@x.com>"]


@pytest.mark.asyncio
async def test_reply_to_a_closed_ticket_reopens_it(db_session: AsyncSession):
    """Otherwise the requester's message lands with no clock running and nobody
    notified, while they believe the thread is live again."""
    from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

    ws = await _ws(db_session, f"re-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    intake = ServiceDeskIntakeService(db_session)

    ticket = await intake.ingest(_email(message_id="<re-1@x.com>"), mb, source="service_desk_webhook")
    await db_session.commit()
    await ServiceDeskTicketService(db_session).change_pending_with(
        ws.id, ticket.id, PendingWith.CLOSED.value
    )
    await db_session.commit()

    sd = (await db_session.execute(
        select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
    )).scalar_one()
    assert sd.pending_with == PendingWith.CLOSED.value

    await intake.ingest(
        _email(subject=f"Re: BSD-{ticket.ticket_number}", body_text="still broken",
               message_id="<re-2@x.com>"),
        mb, source="service_desk_webhook",
    )
    await db_session.commit()

    await db_session.refresh(sd)
    assert sd.pending_with == PendingWith.KAM.value
    # and the ledger has an open segment again, so TAT resumes
    open_segs = (await db_session.execute(
        select(TicketPendingSegment).where(
            TicketPendingSegment.ticket_id == ticket.id,
            TicketPendingSegment.exited_at.is_(None),
        )
    )).scalars().all()
    assert len(open_segs) == 1 and open_segs[0].pending_with == PendingWith.KAM.value


@pytest.mark.asyncio
async def test_receipt_is_only_sent_after_flush_notifications(db_session: AsyncSession, monkeypatch):
    """Sending inline meant a rolled-back ticket could still be acknowledged."""
    sent: list[tuple] = []

    async def _capture(db, mailbox, to_email, subject, body_text, thread_id=None):
        sent.append((to_email, subject))

    import aexy.services.service_desk_mailer as mailer

    monkeypatch.setattr(mailer, "send_service_desk_email", _capture)

    ws = await _ws(db_session, f"rc-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    intake = ServiceDeskIntakeService(db_session)

    await intake.ingest(
        _email(from_email="rahul@abcfinance.com", message_id="<rc-1@x.com>"),
        mb, source="service_desk_webhook",
    )
    # nothing sent yet — the transaction is still open
    assert sent == []

    await db_session.commit()
    await intake.flush_notifications()
    assert len(sent) == 1 and sent[0][0] == "rahul@abcfinance.com"

    # queue is drained, so a second flush is a no-op
    await intake.flush_notifications()
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_ticket_number_collision_is_retried(db_session: AsyncSession):
    """ticket_number is max()+1 against a unique constraint, so concurrent intake
    collides. The webhook caller swallowed the IntegrityError and dropped the
    email, so intake must retry rather than raise."""
    ws = await _ws(db_session, f"col-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    intake = ServiceDeskIntakeService(db_session)

    first = await intake.ingest(_email(message_id="<col-1@x.com>"), mb, source="service_desk_webhook")
    await db_session.commit()

    # Force the next insert to reuse the taken number once, as a racing worker
    # that read max() before the first insert landed would.
    taken = first.ticket_number
    calls = {"n": 0}
    original = intake._next_ticket_number

    async def _colliding(workspace_id: str) -> int:
        calls["n"] += 1
        if calls["n"] == 1:
            return taken
        return await original(workspace_id)

    intake._next_ticket_number = _colliding

    second = await intake.ingest(_email(message_id="<col-2@x.com>"), mb, source="service_desk_webhook")
    await db_session.commit()

    assert calls["n"] >= 2, "the collision should have forced a retry"
    assert second is not None and second.ticket_number == taken + 1
    numbers = (await db_session.execute(
        select(Ticket.ticket_number).where(Ticket.workspace_id == ws.id)
    )).scalars().all()
    assert sorted(numbers) == [taken, taken + 1]


@pytest.mark.asyncio
async def test_auto_assignment_skips_a_departed_kam(db_session: AsyncSession):
    """Department rows outlive workspace membership; assigning to someone who
    left would park tickets in a dead queue."""
    ws = await _ws(db_session, f"kam-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)

    dept = Department(
        id=str(uuid4()), workspace_id=ws.id, name="KAM", slug="kam",
        function_key="ops_kam", path="/kam/", depth=0,
    )
    db_session.add(dept)
    await db_session.flush()

    stayed = Developer(id=str(uuid4()), email=f"stay-{uuid4().hex[:6]}@bimaplan.co", name="Stayed")
    left = Developer(id=str(uuid4()), email=f"left-{uuid4().hex[:6]}@bimaplan.co", name="Left")
    db_session.add_all([stayed, left])
    await db_session.flush()
    for dev in (stayed, left):
        db_session.add(
            DepartmentMember(id=str(uuid4()), workspace_id=ws.id, department_id=dept.id, developer_id=dev.id)
        )
    db_session.add_all([
        WorkspaceMember(workspace_id=ws.id, developer_id=stayed.id, role="member", status="active"),
        WorkspaceMember(workspace_id=ws.id, developer_id=left.id, role="member", status="removed"),
    ])
    await db_session.commit()

    intake = ServiceDeskIntakeService(db_session)
    for i in range(6):
        ticket = await intake.ingest(
            _email(from_email="unknown@nowhere.com", message_id=f"<kam-{i}@x.com>"),
            mb, source="service_desk_webhook",
        )
        assert ticket.assignee_id == stayed.id
    await db_session.commit()
