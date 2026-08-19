"""Who may change a Service Desk ticket, and the outbound stakeholder email.

Visibility and authority are separate questions. An Ops Lead holds
``can_view_all_service_desk`` so every row passes the scope clause; these tests
pin that seeing a ticket never implies being allowed to touch it, and that the
ticket-level email goes out only for the people who may act on the ticket.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.google_integration import GoogleIntegration
from aexy.models.role import CustomRole
from aexy.models.service_desk import (
    ServiceDeskVendor,
    ServiceDeskVendorDomain,
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import TicketFieldsUpdate
from aexy.schemas.ticketing import TicketUpdate
from aexy.services import service_desk_mailer
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

from fastapi import HTTPException
from tests.conftest import seed_service_desk_taxonomy


async def _member(db, ws_id: str, label: str, permissions: list[str]) -> str:
    dev = Developer(id=str(uuid4()), email=f"{label}-{uuid4().hex[:6]}@capbumpy.in", name=label)
    db.add(dev)
    await db.flush()
    role = CustomRole(
        id=str(uuid4()),
        workspace_id=ws_id,
        name=f"{label}-role",
        slug=f"{label}-{uuid4().hex[:6]}",
        permissions=permissions,
    )
    db.add(role)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws_id, developer_id=dev.id, role="member", status="active", role_id=role.id
        )
    )
    await db.flush()
    return dev.id


async def _in_ops_kam(db, ws_id: str, developer_id: str) -> None:
    """Row scope is by department, so a KAM outside Operations-KAM sees nothing."""
    dept = (
        await db.execute(
            select(Department).where(
                Department.workspace_id == ws_id, Department.function_key == "ops_kam"
            )
        )
    ).scalar_one_or_none()
    if dept is None:
        dept = Department(
            id=str(uuid4()),
            workspace_id=ws_id,
            name="Operations-KAM",
            slug=f"ops-kam-{uuid4().hex[:6]}",
            function_key="ops_kam",
            path="/ops_kam/",
            depth=0,
        )
        db.add(dept)
        await db.flush()
    db.add(
        DepartmentMember(
            id=str(uuid4()), workspace_id=ws_id, department_id=dept.id, developer_id=developer_id
        )
    )
    await db.flush()


@pytest.fixture
async def desk(db_session):
    """One BSD ticket assigned to a KAM, with a Gmail-linked watched mailbox."""
    owner = Developer(id=str(uuid4()), email=f"august-{uuid4().hex[:6]}@capbumpy.in", name="August")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="BP", slug=f"bp-{uuid4().hex[:6]}", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    # Stakeholders and request types are per-workspace rows now, not an enum, so
    # a bare workspace has no taxonomy and the service layer refuses to file a
    # ticket into one. Seeds the legacy insurance slugs these tests assert on.
    await seed_service_desk_taxonomy(db_session, ws.id)

    integration = GoogleIntegration(
        id=str(uuid4()),
        workspace_id=ws.id,
        connected_by_id=owner.id,
        google_email="august@capbumpy.in",
        access_token="t",
        refresh_token="r",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        gmail_sync_enabled=True,
    )
    db_session.add(integration)
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()),
        workspace_id=ws.id,
        address="august@capbumpy.in",
        channel="gmail_sync",
        integration_id=integration.id,
    )
    db_session.add(mailbox)

    partner = ServiceDeskAccount(id=str(uuid4()), workspace_id=ws.id, name="Partner P1")
    db_session.add(partner)
    await db_session.flush()
    db_session.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()),
            workspace_id=ws.id,
            account_id=partner.id,
            domain="paimonking@runbox.com",
        )
    )
    insurer = ServiceDeskVendor(id=str(uuid4()), workspace_id=ws.id, name="Insurer I1")
    db_session.add(insurer)
    await db_session.flush()
    db_session.add(
        ServiceDeskVendorDomain(
            id=str(uuid4()),
            workspace_id=ws.id,
            vendor_id=insurer.id,
            domain="claims@insurer-one.example",
        )
    )

    kam = await _member(db_session, ws.id, "paimon", ["can_view_service_desk"])
    other_kam = await _member(db_session, ws.id, "solomon", ["can_view_service_desk"])
    await _in_ops_kam(db_session, ws.id, kam)
    await _in_ops_kam(db_session, ws.id, other_kam)
    lead = await _member(
        db_session, ws.id, "chaos", ["can_view_service_desk", "can_view_all_service_desk"]
    )
    manager = await _member(
        db_session,
        ws.id,
        "abraxas",
        ["can_view_service_desk", "can_view_all_service_desk", "can_manage_service_desk"],
    )

    form = TicketForm(
        id=str(uuid4()), workspace_id=ws.id, name="SD", slug="service-desk", created_by_id=owner.id
    )
    db_session.add(form)
    await db_session.flush()
    ticket = Ticket(
        id=str(uuid4()),
        workspace_id=ws.id,
        form_id=form.id,
        ticket_number=1,
        submitter_email="paimonking@runbox.com",
        submitter_name="King Paimon",
        field_values={"subject": "Claim status", "body": "..."},
        status="new",
        assignee_id=kam,
        source="service_desk_gmail",
    )
    db_session.add(ticket)
    await db_session.flush()
    db_session.add(
        ServiceDeskTicket(
            id=str(uuid4()),
            workspace_id=ws.id,
            ticket_id=ticket.id,
            account_id=partner.id,
            request_type="claims",
            pending_with="kam",
            origin="email",
            mailbox_id=mailbox.id,
            thread_ref="gmail-thread-1",
        )
    )
    db_session.add(
        TicketPendingSegment(
            id=str(uuid4()), workspace_id=ws.id, ticket_id=ticket.id, pending_with="kam"
        )
    )
    await db_session.commit()
    return {
        "ws": ws.id,
        "ticket": ticket.id,
        "kam": kam,
        "other_kam": other_kam,
        "lead": lead,
        "manager": manager,
    }


@pytest.fixture
def sent(monkeypatch):
    """Capture the Gmail send instead of making it, keeping the guard path real."""
    calls: list[dict] = []

    # Keyword-only on purpose. The caller used to pass these positionally and had
    # fallen one place out of step with the real signature — a stub that accepts
    # positions would let that happen again without a failure.
    async def _capture(
        db,
        *,
        integration_id,
        workspace_id,
        from_address,
        to_email,
        subject,
        body_text,
        thread_id,
        body_html=None,
        attachments=None,
        cc=None,
    ):
        calls.append(
            {
                "integration_id": integration_id,
                "workspace_id": workspace_id,
                "from": from_address,
                "to": to_email,
                "cc": cc or [],
                "subject": subject,
                "body": body_text,
                "body_html": body_html,
                "thread_id": thread_id,
                "attachments": attachments or [],
            }
        )
        return "gmail-thread-sent"

    monkeypatch.setattr(service_desk_mailer, "_send_via_gmail", _capture)
    return calls


# ------------------------------------------------------------------ authority


@pytest.mark.asyncio
async def test_view_all_does_not_grant_edit(db_session, desk):
    """The Ops Lead defect: every row visible, not one row editable."""
    svc = ServiceDeskTicketService(db_session)

    with pytest.raises(HTTPException) as moved:
        await svc.change_pending_with(
            desk["ws"], desk["ticket"], "insurer", scope_developer_id=desk["lead"]
        )
    assert moved.value.status_code == 403

    with pytest.raises(HTTPException) as edited:
        await svc.update_fields(
            desk["ws"],
            desk["ticket"],
            TicketFieldsUpdate(request_type="payout"),
            scope_developer_id=desk["lead"],
        )
    assert edited.value.status_code == 403

    # ...and reading it still works, which is the whole point of the role.
    detail = await svc.get_detail(desk["ws"], desk["ticket"], scope_developer_id=desk["lead"])
    assert detail.pending_with == "kam"
    assert detail.request_type == "claims"


@pytest.mark.asyncio
async def test_view_all_cannot_mutate_a_service_desk_ticket_through_generic_routes(
    db_session, desk
):
    from aexy.api.tickets import update_ticket

    lead = await db_session.get(Developer, desk["lead"])
    with pytest.raises(HTTPException) as exc:
        await update_ticket(
            desk["ws"],
            desk["ticket"],
            TicketUpdate(priority="urgent"),
            current_user=lead,
            db=db_session,
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_assigned_kam_may_triage_and_hand_off_their_own_ticket(db_session, desk):
    svc = ServiceDeskTicketService(db_session)

    edited = await svc.update_fields(
        desk["ws"],
        desk["ticket"],
        TicketFieldsUpdate(request_type="payout"),
        scope_developer_id=desk["kam"],
    )
    assert edited.request_type == "payout"

    moved = await svc.change_pending_with(
        desk["ws"], desk["ticket"], "insurer", scope_developer_id=desk["kam"]
    )
    assert moved.pending_with == "insurer"


@pytest.mark.asyncio
async def test_another_kam_cannot_even_see_it(db_session, desk):
    """Out of scope stays 404, so ids are not enumerable by probing for 403s."""
    svc = ServiceDeskTicketService(db_session)
    with pytest.raises(HTTPException) as exc:
        await svc.update_fields(
            desk["ws"],
            desk["ticket"],
            TicketFieldsUpdate(request_type="payout"),
            scope_developer_id=desk["other_kam"],
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_manager_may_act_on_a_ticket_assigned_to_someone_else(db_session, desk):
    svc = ServiceDeskTicketService(db_session)
    moved = await svc.change_pending_with(
        desk["ws"], desk["ticket"], "partner", scope_developer_id=desk["manager"]
    )
    assert moved.pending_with == "partner"


# ------------------------------------------------------------ outbound email


@pytest.mark.asyncio
async def test_email_goes_out_as_the_watched_mailbox_and_keeps_the_ticket_identity(
    db_session, desk, sent
):
    svc = ServiceDeskTicketService(db_session)
    detail = await svc.email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "claims@insurer-one.example",
        "Please confirm the claim register",
        "Sharing the claim register for your confirmation.",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )
    await db_session.commit()

    assert len(sent) == 1
    # Sent as August, not as the KAM. The insurer gets its own conversation
    # rather than the partner's, so ticket identity rides on the subject.
    assert sent[0]["from"] == "august@capbumpy.in"
    assert sent[0]["to"] == "claims@insurer-one.example"
    assert sent[0]["thread_id"] is None
    # The BSD number is what the deterministic inbound matcher reads.
    assert sent[0]["subject"].startswith("[SD-1] ")
    assert detail.vendor_id is not None, "later stray replies must stay scoped to this insurer"

    outgoing = [c for c in detail.correspondence if c.direction == "outgoing"]
    assert len(outgoing) == 1
    assert outgoing[0].author_email == "august@capbumpy.in"
    # The shared mailbox is the sender; the ticket must still name the person.
    assert outgoing[0].author_name == "paimon"
    assert "claims@insurer-one.example" in outgoing[0].content

    stored = (
        await db_session.execute(
            select(TicketResponse).where(TicketResponse.ticket_id == desk["ticket"])
        )
    ).scalars().all()
    # One public message (the email) plus the internal timeline line the
    # auto-move writes. Only the first is stakeholder correspondence.
    public = [r for r in stored if not r.is_internal]
    assert len(public) == 1
    assert public[0].author_id == desk["kam"]


@pytest.mark.asyncio
async def test_an_existing_bsd_subject_is_not_prefixed_twice(db_session, desk, sent):
    svc = ServiceDeskTicketService(db_session)
    await svc.email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "paimonking@runbox.com",
        "Re: SD-1 - claim update",
        "Update below.",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )
    assert sent[0]["subject"] == "Re: SD-1 - claim update"


@pytest.mark.asyncio
async def test_the_send_is_scoped_to_the_mailbox_own_workspace(db_session, desk, sent):
    """The mailer's cross-workspace guard reads this argument.

    It used to be skipped by the caller, which shifted every later argument one
    place left: the guard compared the integration against the desk's own email
    address, so it failed for every mailbox and no stakeholder email ever left.
    """
    svc = ServiceDeskTicketService(db_session)
    await svc.email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "claims@insurer-one.example",
        "Please confirm",
        "Body",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )

    assert sent[0]["workspace_id"] == desk["ws"]
    assert sent[0]["from"] == "august@capbumpy.in"
    assert sent[0]["body"] == "Body"


@pytest.mark.asyncio
async def test_an_unconfigured_recipient_is_allowed_but_hands_the_ticket_to_nobody(
    db_session, desk, sent
):
    """A desk has to loop in people Master Data has never heard of.

    Refusing meant answering them from a personal inbox, outside the thread and
    outside the record. What the address cannot do is imply a hand-off.
    """
    svc = ServiceDeskTicketService(db_session)
    detail = await svc.email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "surveyor@somewhere.example",
        "Please inspect",
        "Body",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )
    await db_session.commit()

    assert sent[0]["to"] == "surveyor@somewhere.example"
    # No stakeholder behind the address, so there is no stage to move to.
    assert detail.pending_with == "kam"
    assert "surveyor@somewhere.example" in detail.correspondence[-1].content


@pytest.mark.asyncio
async def test_cc_addresses_go_out_and_are_recorded_on_the_ticket(db_session, desk, sent):
    """Who else saw a reply is part of the record, not just a header."""
    svc = ServiceDeskTicketService(db_session)
    detail = await svc.email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "claims@insurer-one.example",
        "Please confirm",
        "Body",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
        cc_emails=[
            "broker@partner.example",
            # The To address and the desk's own mailbox are dropped: copying
            # either makes the reply read as a mistake.
            "claims@insurer-one.example",
            "august@capbumpy.in",
        ],
    )
    await db_session.commit()

    assert sent[0]["cc"] == ["broker@partner.example"]
    outgoing = [c for c in detail.correspondence if c.direction == "outgoing"]
    assert "Cc: broker@partner.example" in outgoing[0].content


@pytest.mark.asyncio
async def test_ops_lead_cannot_email_from_a_ticket(db_session, desk, sent):
    svc = ServiceDeskTicketService(db_session)
    with pytest.raises(HTTPException) as exc:
        await svc.email_stakeholder(
            desk["ws"],
            desk["ticket"],
            "claims@insurer-one.example",
            "Hello",
            "Body",
            sender_id=desk["lead"],
            scope_developer_id=desk["lead"],
        )
    assert exc.value.status_code == 403
    assert sent == []


@pytest.mark.asyncio
async def test_recipients_offered_are_the_ticket_partner_insurers_and_requester(db_session, desk):
    detail = await ServiceDeskTicketService(db_session).get_detail(
        desk["ws"], desk["ticket"], scope_developer_id=desk["kam"]
    )
    assert {r.email for r in detail.email_recipients} == {
        "paimonking@runbox.com",
        "claims@insurer-one.example",
    }


@pytest.mark.asyncio
async def test_a_mailbox_without_a_gmail_link_refuses_rather_than_sending_from_the_system(
    db_session, desk
):
    """Falling back to the transactional sender would break the reply loop."""
    unlinked = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=desk["ws"], address="webhook@capbumpy.in", channel="webhook"
    )
    with pytest.raises(RuntimeError):
        await service_desk_mailer.send_stakeholder_email(
            db_session, unlinked, "claims@insurer-one.example", "s", "b"
        )
    with pytest.raises(RuntimeError):
        await service_desk_mailer.send_stakeholder_email(
            db_session, None, "claims@insurer-one.example", "s", "b"
        )


# ------------------------------------------------- attachments and threading


@pytest.fixture
async def with_attachment(db_session, desk):
    """Put a forwardable file and a non-forwardable one on the ticket."""
    ticket = await db_session.get(Ticket, desk["ticket"])
    values = dict(ticket.field_values or {})
    values["attachments"] = [
        {
            "filename": "claim_register.xlsx",
            "content_type": "application/vnd.ms-excel",
            "size_bytes": 2048,
            "attachment_id": "att-1",
        },
        # Arrived before attachment ids were captured, so it can never be sent.
        {"filename": "legacy.pdf", "content_type": "application/pdf", "size_bytes": 100},
    ]
    ticket.field_values = values
    sd = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == desk["ticket"])
        )
    ).scalar_one()
    sd.source_message_id = "gmail-msg-1"
    await db_session.commit()
    return desk


@pytest.mark.asyncio
async def test_attachments_are_listed_with_a_forwardable_flag(db_session, with_attachment):
    detail = await ServiceDeskTicketService(db_session).get_detail(
        with_attachment["ws"], with_attachment["ticket"], scope_developer_id=with_attachment["kam"]
    )
    assert {(a.filename, a.can_forward) for a in detail.attachments} == {
        ("claim_register.xlsx", True),
        ("legacy.pdf", False),
    }


@pytest.mark.asyncio
async def test_a_chosen_file_is_refetched_and_attached(db_session, with_attachment, sent, monkeypatch):
    from aexy.services.gmail_sync_service import GmailSyncService

    async def _bytes(
        self,
        integration,
        message_id,
        body,
        max_bytes=None,
        filename=None,
        content_type=None,
    ):
        assert message_id == "gmail-msg-1"
        assert body["attachmentId"] == "att-1"
        return b"row1,row2"

    monkeypatch.setattr(GmailSyncService, "gmail_attachment_bytes", _bytes)

    await ServiceDeskTicketService(db_session).email_stakeholder(
        with_attachment["ws"],
        with_attachment["ticket"],
        "claims@insurer-one.example",
        "Register for your review",
        "Please see attached.",
        sender_id=with_attachment["kam"],
        attachment_filenames=["claim_register.xlsx"],
        scope_developer_id=with_attachment["kam"],
    )
    assert sent[0]["attachments"] == [("claim_register.xlsx", "application/vnd.ms-excel", b"row1,row2")]


@pytest.mark.asyncio
async def test_a_file_that_cannot_be_forwarded_is_refused_before_anything_is_sent(
    db_session, with_attachment, sent
):
    with pytest.raises(HTTPException) as exc:
        await ServiceDeskTicketService(db_session).email_stakeholder(
            with_attachment["ws"],
            with_attachment["ticket"],
            "claims@insurer-one.example",
            "Register",
            "See attached.",
            sender_id=with_attachment["kam"],
            attachment_filenames=["legacy.pdf"],
            scope_developer_id=with_attachment["kam"],
        )
    assert exc.value.status_code == 400
    assert sent == []


@pytest.mark.asyncio
async def test_a_failed_fetch_sends_nothing_rather_than_an_empty_promise(
    db_session, with_attachment, sent, monkeypatch
):
    """"Please find attached" with nothing attached is worse than not sending."""
    from aexy.services.gmail_sync_service import GmailSyncService

    async def _boom(
        self,
        integration,
        message_id,
        body,
        max_bytes=None,
        filename=None,
        content_type=None,
    ):
        raise ValueError("attachment exceeds the Service Desk raw-byte limit")

    monkeypatch.setattr(GmailSyncService, "gmail_attachment_bytes", _boom)

    with pytest.raises(HTTPException) as exc:
        await ServiceDeskTicketService(db_session).email_stakeholder(
            with_attachment["ws"],
            with_attachment["ticket"],
            "claims@insurer-one.example",
            "Register",
            "See attached.",
            sender_id=with_attachment["kam"],
            attachment_filenames=["claim_register.xlsx"],
            scope_developer_id=with_attachment["kam"],
        )
    assert exc.value.status_code == 502
    assert sent == []


@pytest.mark.asyncio
async def test_writing_to_an_insurer_starts_its_own_conversation(db_session, desk, sent):
    """Threading it into the partner's conversation would merge the two."""
    await ServiceDeskTicketService(db_session).email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "claims@insurer-one.example",
        "Query on this claim",
        "Body",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )
    assert sent[0]["thread_id"] is None
    assert sent[0]["subject"].startswith("[SD-1] ")


@pytest.mark.asyncio
async def test_answering_the_requester_stays_in_their_conversation(db_session, desk, sent):
    await ServiceDeskTicketService(db_session).email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "paimonking@runbox.com",
        "Update for you",
        "Body",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )
    assert sent[0]["thread_id"] == "gmail-thread-1"


# ------------------------------------------------- emailing moves the stage


@pytest.mark.asyncio
async def test_emailing_an_insurer_moves_the_ticket_the_same_way_move_to_does(
    db_session, desk, sent
):
    svc = ServiceDeskTicketService(db_session)
    detail = await svc.email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "claims@insurer-one.example",
        "Please confirm",
        "Body",
        sender_id=desk["kam"],
        scope_developer_id=desk["kam"],
    )
    await db_session.commit()

    assert detail.pending_with == "insurer"
    # The ledger must be indistinguishable from a Move to click: the KAM segment
    # closed and an insurer segment opened, attributed and annotated.
    segments = (
        await db_session.execute(
            select(TicketPendingSegment)
            .where(TicketPendingSegment.ticket_id == desk["ticket"])
            .order_by(TicketPendingSegment.entered_at)
        )
    ).scalars().all()
    assert [s.pending_with for s in segments] == ["kam", "insurer"]
    assert segments[0].exited_at is not None
    assert segments[1].changed_by_id == desk["kam"]
    assert "Insurer I1" in (segments[1].note or "")


@pytest.mark.asyncio
async def test_the_kam_can_send_without_moving_the_ticket(db_session, desk, sent):
    """An update to the insurer is not a hand-off to them."""
    detail = await ServiceDeskTicketService(db_session).email_stakeholder(
        desk["ws"],
        desk["ticket"],
        "claims@insurer-one.example",
        "Just so you know",
        "Body",
        sender_id=desk["kam"],
        move_ticket=False,
        scope_developer_id=desk["kam"],
    )
    assert detail.pending_with == "kam"


@pytest.mark.asyncio
async def test_recipients_carry_the_stage_they_imply(db_session, desk):
    detail = await ServiceDeskTicketService(db_session).get_detail(
        desk["ws"], desk["ticket"], scope_developer_id=desk["kam"]
    )
    stages = {r.email: r.stage for r in detail.email_recipients}
    assert stages["claims@insurer-one.example"] == "insurer"
    # The requester is also P1's configured address, so it keeps the partner
    # stage rather than being downgraded when added as the requester.
    assert stages["paimonking@runbox.com"] == "partner"


@pytest.mark.asyncio
async def test_a_full_kam_insurer_kam_partner_round_trip_is_recorded_in_order(
    db_session, desk, sent
):
    """The ledger must read as the real sequence, mixing emails and manual moves."""
    svc = ServiceDeskTicketService(db_session)

    # KAM writes to the insurer -> ticket moves to Insurer.
    await svc.email_stakeholder(
        desk["ws"], desk["ticket"], "claims@insurer-one.example",
        "Claim query", "Body", sender_id=desk["kam"], scope_developer_id=desk["kam"],
    )
    # Insurer answers; the KAM takes it back by hand.
    await svc.change_pending_with(
        desk["ws"], desk["ticket"], "kam",
        changed_by_id=desk["kam"], note="Insurer replied", scope_developer_id=desk["kam"],
    )
    # KAM then writes to the partner -> ticket moves to Partner.
    detail = await svc.email_stakeholder(
        desk["ws"], desk["ticket"], "paimonking@runbox.com",
        "Update for you", "Body", sender_id=desk["kam"], scope_developer_id=desk["kam"],
    )
    await db_session.commit()

    assert detail.pending_with == "partner"
    assert [s.pending_with for s in detail.segments] == ["kam", "insurer", "kam", "partner"]
    # Every closed segment carries a duration, so stakeholder TAT stays computable.
    assert all(s.duration_seconds is not None for s in detail.segments[:-1])
    assert detail.segments[-1].exited_at is None

    # Both emails are on the ticket, in order, attributed, and outgoing.
    outgoing = [c for c in detail.correspondence if c.direction == "outgoing"]
    assert len(outgoing) == 2
    assert all(c.author_name == "paimon" for c in outgoing)
    assert "claims@insurer-one.example" in outgoing[0].content
    assert "paimonking@runbox.com" in outgoing[1].content
    # Each send left as the desk mailbox, never as the KAM.
    assert [c["to"] for c in sent] == ["claims@insurer-one.example", "paimonking@runbox.com"]
    assert {c["from"] for c in sent} == {"august@capbumpy.in"}


@pytest.mark.asyncio
async def test_the_breach_clock_restarts_on_the_stage_the_email_moved_it_to(
    db_session, desk, sent
):
    """SLA is measured per stage, so an emailed hand-off must reset the clock.

    If the email moved the ticket but the ledger kept the old segment open, the
    insurer's stage would inherit the KAM's age and show a breach the insurer
    never caused, or hide one they did.
    """
    svc = ServiceDeskTicketService(db_session)

    # The ticket has already been sitting with the KAM for a week.
    opened = (
        await db_session.execute(
            select(TicketPendingSegment).where(
                TicketPendingSegment.ticket_id == desk["ticket"],
                TicketPendingSegment.exited_at.is_(None),
            )
        )
    ).scalar_one()
    opened.entered_at = datetime.now(timezone.utc) - timedelta(days=7)
    await db_session.flush()

    ticket = await db_session.get(Ticket, desk["ticket"])
    breached = await svc.compute_tat(desk["ticket"], ticket)
    assert breached.current_pending_with == "kam"
    assert breached.breach_level == "red"

    # Emailing the insurer hands it over, so the stage clock starts again.
    detail = await svc.email_stakeholder(
        desk["ws"], desk["ticket"], "claims@insurer-one.example",
        "Over to you", "Body", sender_id=desk["kam"], scope_developer_id=desk["kam"],
    )
    await db_session.commit()

    assert detail.pending_with == "insurer"
    assert detail.tat.current_pending_with == "insurer"
    assert detail.tat.breach_level == "green"
    assert detail.tat.current_stage_seconds < 60
    # The week with the KAM is not lost, it is attributed to the KAM.
    assert detail.tat.stakeholder_seconds["kam"] > 0
    # Overall wall-clock keeps running across the hand-off.
    assert detail.tat.overall_seconds >= breached.overall_seconds


# ---------------------------------------------------------------- header safety


def test_email_request_rejects_line_breaks_in_headers():
    """A CR or LF in `to` or `subject` would let the sender append raw MIME
    headers (a Bcc, say) to the message handed to Gmail, quietly defeating the
    recipient allowlist. The schema is the first line of defence."""
    from pydantic import ValidationError as PydanticValidationError

    from aexy.schemas.service_desk import StakeholderEmailRequest

    StakeholderEmailRequest(to="a@b.example", subject="Fine subject", body="Body")

    for bad in ("Evil\r\nBcc: attacker@evil.example", "Evil\nX-Injected: 1"):
        with pytest.raises(PydanticValidationError):
            StakeholderEmailRequest(to="a@b.example", subject=bad, body="Body")
        with pytest.raises(PydanticValidationError):
            StakeholderEmailRequest(to=f"a@b.example{bad}", subject="Fine", body="Body")


def test_mailer_header_safe_collapses_line_breaks():
    from aexy.services.service_desk_mailer import _header_safe

    assert _header_safe("report\r\nBcc: x@y.example.csv") == "report Bcc: x@y.example.csv"
    assert _header_safe("plain.csv") == "plain.csv"
