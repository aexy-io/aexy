"""Attaching a file of your own to a reply from a ticket.

Reported from a live desk: "when sending a mail, there is no option to attach a
file." The only file the desk could send was one that had already arrived on the
ticket — the bytes were re-fetched from the mailbox — so answering a partner with
a completed form meant leaving the product for a personal inbox, and that reply,
with its attachment, left the record entirely.

Uploads go to the desk's own storage and are staged on the ticket. The rules that
made forwarding safe are kept: the client names a file, never sends bytes with
the send, and a named file has to be one this ticket actually holds. What is new
is where the bytes may come from.
"""

from __future__ import annotations

from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import ServiceDeskMailbox, ServiceDeskTicket
from aexy.models.ticketing import Ticket, TicketForm, TicketStatus
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services import ticket_service as ticket_service_module
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from tests.conftest import seed_service_desk_taxonomy

DESK = "ops@desk.example"
REQUESTER = "asha@partner.example"
BODY = b"a completed proposal form"


class FakeStorage:
    """Holds objects in memory and remembers what it was asked to delete."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []

    def is_configured(self) -> bool:
        return True

    def upload_fileobj(self, key: str, fileobj, content_type: str) -> bool:
        self.objects[key] = fileobj.read()
        return True

    def get_object(self, key: str):
        raw = self.objects.get(key)
        return None if raw is None else (raw, "application/pdf")

    async def delete_object(self, key: str) -> bool:
        self.deleted.append(key)
        self.objects.pop(key, None)
        return True

    def key_from_url(self, url: str):
        return None


@pytest.fixture
def storage(monkeypatch) -> FakeStorage:
    fake = FakeStorage()
    # Patched where each module looks it up, not where it is defined.
    monkeypatch.setattr(ticket_service_module, "get_storage_service", lambda: fake)
    monkeypatch.setattr(
        "aexy.services.storage_service.get_storage_service", lambda: fake
    )
    return fake


class _Desk:
    ws: Workspace
    member: Developer
    ticket: Ticket
    sd: ServiceDeskTicket


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"wsowner-{slug}@desk.example", name="WS Owner")
    d.member = Developer(id=str(uuid4()), email=f"desk-{slug}@desk.example", name="Desk Member")
    db.add_all([owner, d.member])
    await db.flush()

    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            id=str(uuid4()), workspace_id=d.ws.id, developer_id=d.member.id, role="member"
        )
    )
    department = Department(
        id=str(uuid4()), workspace_id=d.ws.id, name="Operations", slug=f"ops-{slug}",
        function_key="operations",
    )
    db.add(department)
    await db.flush()
    db.add(
        DepartmentMember(
            id=str(uuid4()), workspace_id=d.ws.id, department_id=department.id,
            developer_id=d.member.id,
        )
    )
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=d.ws.id, address=DESK, channel="webhook"
    )
    form = TicketForm(id=str(uuid4()), workspace_id=d.ws.id, name="Service Desk", slug=f"sd-{slug}")
    db.add_all([mailbox, form])
    await db.flush()

    d.ticket = Ticket(
        id=str(uuid4()), workspace_id=d.ws.id, form_id=form.id, ticket_number=1,
        submitter_email=REQUESTER, status=TicketStatus.NEW.value,
        assignee_id=d.member.id, field_values={"subject": "Renewal", "attachments": []},
    )
    db.add(d.ticket)
    await db.flush()

    await seed_service_desk_taxonomy(db, d.ws.id)
    d.sd = ServiceDeskTicket(
        id=str(uuid4()), ticket_id=d.ticket.id, workspace_id=d.ws.id,
        request_type="query", pending_with="kam", origin="email",
        mailbox_id=mailbox.id,
    )
    db.add(d.sd)

    settings = dict(d.ws.settings or {})
    settings["service_desk"] = {"desk_department_id": department.id}
    d.ws.settings = settings
    await db.commit()
    return d


async def _upload(db: AsyncSession, d: _Desk, filename: str = "proposal.pdf"):
    return await ServiceDeskTicketService(db).add_outbound_attachments(
        d.ws.id,
        d.ticket.id,
        [(filename, "application/pdf", BytesIO(BODY), len(BODY))],
        scope_developer_id=str(d.member.id),
    )


@pytest.mark.asyncio
async def test_an_uploaded_file_is_offered_for_sending_but_not_shown_as_arriving(
    db_session: AsyncSession, storage: FakeStorage
) -> None:
    """It is on the ticket, and it is not part of the request.

    A reader who cannot tell those apart is told the customer sent something they
    never sent.
    """
    d = await _desk(db_session, "up-detail")
    created = await _upload(db_session, d)
    await db_session.commit()

    assert len(created) == 1 and created[0].source == "upload"
    assert created[0].can_forward is True

    detail = await ServiceDeskTicketService(db_session).get_detail(d.ws.id, d.ticket.id)
    files = {file.filename: file for file in detail.attachments}
    assert files["proposal.pdf"].source == "upload"
    assert files["proposal.pdf"].index is None, (
        "positions address the emailed list; an upload must never shift what an "
        "existing download URL points at"
    )


@pytest.mark.asyncio
async def test_sending_moves_the_file_onto_the_message_it_left_with(
    db_session: AsyncSession, storage: FakeStorage, monkeypatch
) -> None:
    """Staged on the ticket, then owned by the reply.

    Left on the ticket it would be offered again on the next reply, and which
    mail it actually went out on would be lost.
    """
    d = await _desk(db_session, "up-send")
    created = await _upload(db_session, d)
    await db_session.commit()

    sent: dict = {}

    async def _fake_send(db, mailbox, to_email, subject, body, **kwargs):
        sent["attachments"] = kwargs.get("attachments")
        return None

    monkeypatch.setattr(
        "aexy.services.service_desk_mailer.send_stakeholder_email", _fake_send
    )

    await ServiceDeskTicketService(db_session).email_stakeholder(
        d.ws.id,
        d.ticket.id,
        REQUESTER,
        "Renewal",
        "Please find the form attached.",
        sender_id=str(d.member.id),
        attachment_ids=[created[0].id],
        scope_developer_id=str(d.member.id),
    )
    await db_session.commit()

    assert [name for name, _, _ in sent["attachments"]] == ["proposal.pdf"]
    assert sent["attachments"][0][2] == BODY, "the bytes actually sent are the stored ones"

    await db_session.refresh(d.ticket)
    assert d.ticket.attachments == [], "nothing stays staged once it has gone out"

    detail = await ServiceDeskTicketService(db_session).get_detail(d.ws.id, d.ticket.id)
    assert detail.attachments == []
    assert "Attached: proposal.pdf" in detail.correspondence[0].content

    # Still readable afterwards. What the desk sent is part of the record, and a
    # KAM asked "what exactly did you send them?" has to be able to answer.
    filename, _, raw = await ServiceDeskTicketService(db_session).load_uploaded_attachment(
        d.ws.id, d.ticket.id, created[0].id
    )
    assert (filename, raw) == ("proposal.pdf", BODY)


@pytest.mark.asyncio
async def test_a_file_belonging_to_another_ticket_cannot_be_attached(
    db_session: AsyncSession, storage: FakeStorage
) -> None:
    """The id is looked up on *this* ticket. Otherwise a send is a way to read
    somebody else's uploads."""
    mine = await _desk(db_session, "up-mine")
    theirs = await _desk(db_session, "up-theirs")
    other = await _upload(db_session, theirs, filename="their-register.xlsx")
    await db_session.commit()

    with pytest.raises(HTTPException) as raised:
        await ServiceDeskTicketService(db_session).email_stakeholder(
            mine.ws.id,
            mine.ticket.id,
            REQUESTER,
            "Renewal",
            "…",
            sender_id=str(mine.member.id),
            attachment_ids=[other[0].id],
            scope_developer_id=str(mine.member.id),
        )
    assert raised.value.status_code == 400


@pytest.mark.asyncio
async def test_an_unsent_file_can_be_taken_back_off_the_ticket(
    db_session: AsyncSession, storage: FakeStorage
) -> None:
    d = await _desk(db_session, "up-remove")
    created = await _upload(db_session, d)
    await db_session.commit()

    service = ServiceDeskTicketService(db_session)
    await service.remove_outbound_attachment(
        d.ws.id, d.ticket.id, created[0].id, scope_developer_id=str(d.member.id)
    )
    await db_session.commit()

    assert storage.deleted, "the bytes go too — an unsent file nobody wants is not kept"
    detail = await service.get_detail(d.ws.id, d.ticket.id)
    assert detail.attachments == []


@pytest.mark.asyncio
async def test_the_bytes_can_be_read_back_by_whoever_may_see_the_ticket(
    db_session: AsyncSession, storage: FakeStorage
) -> None:
    """Same read rule as the emailed files: seeing the ticket is enough."""
    d = await _desk(db_session, "up-download")
    created = await _upload(db_session, d)
    await db_session.commit()

    filename, content_type, raw = await ServiceDeskTicketService(
        db_session
    ).load_uploaded_attachment(d.ws.id, d.ticket.id, created[0].id)

    assert (filename, raw) == ("proposal.pdf", BODY)
    assert content_type == "application/pdf"
