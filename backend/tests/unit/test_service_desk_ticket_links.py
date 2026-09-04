"""The links the desk's own mail carries.

Every acknowledgement and closure was a dead end: a ticket id in prose and
nothing to click. The requester's only route back in was to reply and hope.

The requester gets the existing public share view — read-only, no account
needed. A colleague reading a digest gets the in-app queue instead, which is
behind the workspace's own authorization.

The requester-facing half is **off unless a workspace turns it on**, so every
test that wants a link says so. That is not ceremony: a default that publishes
ticket subjects, requester names and attachments to anyone holding a URL is a
decision no upgrade should make on a desk's behalf.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.ticketing import Ticket, TicketForm, TicketShareLink
from aexy.models.workspace import Workspace
from aexy.services.service_desk_links import (
    app_ticket_url,
    desk_queue_url,
    ensure_requester_url,
    public_links_enabled,
)
from aexy.services.service_desk_mailer import html_from_text
from aexy.services.service_desk_templates import (
    render_sd,
    template_references,
    upsert_sd_template,
)
from tests.conftest import seed_service_desk_taxonomy


async def _ticket(
    db: AsyncSession, slug: str, public_links: bool = True
) -> tuple[Workspace, Ticket]:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()),
        name=f"WS {slug}",
        slug=slug,
        owner_id=owner.id,
        settings={"service_desk": {"public_ticket_links_enabled": public_links}},
    )
    db.add(ws)
    await db.flush()
    form = TicketForm(
        id=str(uuid4()), workspace_id=ws.id, name="Service Desk",
        slug=f"sd-{slug}", created_by_id=owner.id,
    )
    db.add(form)
    await db.flush()
    ticket = Ticket(
        id=str(uuid4()), workspace_id=ws.id, form_id=form.id, ticket_number=21,
        submitter_email="requester@partner.example", field_values={"subject": "Endorsement"},
    )
    db.add(ticket)
    await db.commit()
    await seed_service_desk_taxonomy(db, ws.id)
    return ws, ticket


# ------------------------------------------------------------------ minting


@pytest.mark.asyncio
async def test_a_share_link_is_minted_for_the_requester(db_session: AsyncSession):
    _, ticket = await _ticket(db_session, "links-mint")

    url = await ensure_requester_url(db_session, ticket)
    await db_session.commit()

    link = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().one()
    assert url.endswith(f"/public/tickets/{link.token}")
    assert link.is_active is True


@pytest.mark.asyncio
async def test_the_same_ticket_never_gets_a_second_token(db_session: AsyncSession):
    """The acknowledgement and the closure must name one address, not two."""
    _, ticket = await _ticket(db_session, "links-reuse")

    first = await ensure_requester_url(db_session, ticket)
    second = await ensure_requester_url(db_session, ticket)
    await db_session.commit()

    assert first == second
    links = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert len(links) == 1


@pytest.mark.asyncio
async def test_a_revoked_link_is_not_quietly_reissued(db_session: AsyncSession):
    """Somebody turned it off. The mail goes out without a link instead."""
    _, ticket = await _ticket(db_session, "links-revoked")
    db_session.add(
        TicketShareLink(
            id=str(uuid4()), ticket_id=ticket.id, workspace_id=ticket.workspace_id,
            token="revoked-token", is_active=False,
        )
    )
    await db_session.commit()

    assert await ensure_requester_url(db_session, ticket) == ""


# ------------------------------------------------------------------ the copy


@pytest.mark.asyncio
async def test_the_receipt_carries_the_link(db_session: AsyncSession):
    ws, ticket = await _ticket(db_session, "links-receipt")
    url = await ensure_requester_url(db_session, ticket)
    await db_session.commit()

    _, body = await render_sd(
        db_session, ws.id, "receipt",
        {"display_id": "SD-21", "subject": "Endorsement", "requester_name": "Sam",
         "ticket_url": url},
    )

    assert url in body


@pytest.mark.asyncio
async def test_a_missing_link_leaves_no_dangling_label(db_session: AsyncSession):
    """The whole sentence is conditional, not just the URL."""
    ws, _ = await _ticket(db_session, "links-absent")

    _, body = await render_sd(
        db_session, ws.id, "closure",
        {"display_id": "SD-21", "requester_name": "Sam", "closure_note": "Resolved.",
         "overall_days": "0.71", "ticket_url": ""},
    )

    assert "http" not in body
    assert "history of this ticket" not in body
    assert "has been resolved" in body


def test_the_digest_links_the_queue_not_each_row():
    """Fifteen URLs in a fifteen-row digest is a wall, not a convenience."""
    assert desk_queue_url().endswith("/service-desk/tickets")
    assert app_ticket_url("abc-123").endswith("/service-desk/tickets/abc-123")


# ------------------------------------------------------------------- clickable


def test_the_html_alternative_makes_the_url_a_link():
    html = html_from_text("Track it here:\nhttps://app.example.com/public/tickets/abc123\n")

    assert '<a href="https://app.example.com/public/tickets/abc123">' in html


def test_the_html_alternative_escapes_what_a_requester_wrote():
    """The body carries a requester's subject and a KAM's note verbatim."""
    html = html_from_text("Ram & Co <script>alert(1)</script>")

    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "Ram &amp; Co" in html


# ------------------------------------------------- already-customised copy


@pytest.mark.asyncio
async def test_a_customised_template_renders_the_appended_block(db_session: AsyncSession):
    """What ``migrate_2026_08_19_service_desk_email_links.sql`` leaves behind.

    A workspace that had edited its receipt keeps its own row, and the built-in
    default is never consulted again — so the desks that took the trouble to
    write their own copy were exactly the ones whose mail stayed a dead end.
    The migration appends this block; it has to render.
    """
    ws, ticket = await _ticket(db_session, "links-migrated")
    await upsert_sd_template(
        db_session,
        ws.id,
        "receipt",
        "{{display_id}} {{subject}}",
        "Dear {{requester_name}},\n\nLogged as #{{display_id}}.\n\nRegards,\n{{desk_name}}\n\n"
        "{% if ticket_url %}You can track this request here:\n{{ticket_url}}\n{% endif %}",
        None,
    )
    url = await ensure_requester_url(db_session, ticket)
    await db_session.commit()

    _, body = await render_sd(
        db_session, ws.id, "receipt",
        {"display_id": "SD-21", "subject": "Endorsement", "requester_name": "Sam",
         "ticket_url": url},
    )

    assert "Logged as #SD-21." in body  # their copy, untouched
    assert url in body


@pytest.mark.asyncio
async def test_the_appended_block_still_degrades_without_a_link(db_session: AsyncSession):
    ws, _ = await _ticket(db_session, "links-migrated-empty")
    await upsert_sd_template(
        db_session,
        ws.id,
        "receipt",
        "{{display_id}} {{subject}}",
        "Dear {{requester_name}},\n\nRegards,\n{{desk_name}}\n\n"
        "{% if ticket_url %}You can track this request here:\n{{ticket_url}}\n{% endif %}",
        None,
    )
    await db_session.commit()

    _, body = await render_sd(
        db_session, ws.id, "receipt",
        {"display_id": "SD-21", "subject": "Endorsement", "requester_name": "Sam",
         "ticket_url": ""},
    )

    assert "track this request" not in body
    assert "{%" not in body
    # Nothing dangling after the sign-off where the block would have gone.
    assert body.rstrip().endswith("WS links-migrated-empty")


@pytest.mark.asyncio
async def test_no_token_is_minted_when_the_copy_does_not_use_one(db_session: AsyncSession):
    """Deleting {{ticket_url}} from the copy is how a desk declines to publish.

    Minting unconditionally would put a public share token on every ticket the
    desk has ever acknowledged — including desks that removed the link on
    purpose. Editing the text is a discoverable control, because it is the same
    text they are reading.
    """
    ws, ticket = await _ticket(db_session, "links-declined")
    await upsert_sd_template(
        db_session, ws.id, "receipt", "{{display_id}} {{subject}}",
        "Dear {{requester_name}},\n\nLogged as #{{display_id}}.\n\nRegards,\n{{desk_name}}",
        None,
    )
    await db_session.commit()

    assert await template_references(db_session, ws.id, "receipt", "ticket_url") is False
    links = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert links == []


@pytest.mark.asyncio
async def test_the_built_in_copy_does_use_the_link(db_session: AsyncSession):
    """The default has to opt in, or nobody gets a link without customising."""
    ws, _ = await _ticket(db_session, "links-default-copy")

    assert await template_references(db_session, ws.id, "receipt", "ticket_url") is True
    assert await template_references(db_session, ws.id, "closure", "ticket_url") is True
    assert await template_references(db_session, ws.id, "digest", "desk_url") is True


# ------------------------------------------------------------- off by default


@pytest.mark.asyncio
async def test_a_workspace_that_never_asked_publishes_nothing(db_session: AsyncSession):
    """The default. No token, no URL — and no row created to leak later."""
    owner = Developer(id=str(uuid4()), email="owner-nolinks@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="WS nolinks", slug="links-default-off", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    form = TicketForm(
        id=str(uuid4()), workspace_id=ws.id, name="Service Desk",
        slug="sd-links-default-off", created_by_id=owner.id,
    )
    db_session.add(form)
    await db_session.flush()
    ticket = Ticket(
        id=str(uuid4()), workspace_id=ws.id, form_id=form.id, ticket_number=1,
        submitter_email="requester@partner.example", field_values={"subject": "Endorsement"},
    )
    db_session.add(ticket)
    await db_session.commit()
    await seed_service_desk_taxonomy(db_session, ws.id)

    assert await public_links_enabled(db_session, ws.id) is False
    assert await ensure_requester_url(db_session, ticket) == ""
    links = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert links == []


@pytest.mark.asyncio
async def test_switching_it_off_stops_minting(db_session: AsyncSession):
    ws, ticket = await _ticket(db_session, "links-switched-off", public_links=False)

    assert await ensure_requester_url(db_session, ticket) == ""


@pytest.mark.asyncio
async def test_the_copy_stays_intact_with_publishing_off(db_session: AsyncSession):
    """The template keeps {{ticket_url}}; it simply renders to nothing.

    This is what makes the setting a switch rather than a migration: turning it
    on later needs no edit to anybody's copy.
    """
    ws, _ = await _ticket(db_session, "links-off-copy", public_links=False)

    _, body = await render_sd(
        db_session, ws.id, "receipt",
        {"display_id": "SD-21", "subject": "Endorsement", "requester_name": "Sam",
         "ticket_url": ""},
    )

    assert "http" not in body
    assert "track this request" not in body
    assert "Ticket #SD-21" in body


@pytest.mark.asyncio
async def test_real_intake_publishes_nothing_by_default(db_session: AsyncSession):
    """The assertion that actually matters: end to end through ``create_ticket``.

    The gate lives in ``ensure_requester_url`` rather than at each call site, so
    this proves the whole path — a desk taking mail today, upgraded, still mints
    no public token for the tickets it opens.
    """
    from aexy.models.service_desk import ServiceDeskMailbox
    from aexy.schemas.service_desk import InboundEmail
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

    owner = Developer(id=str(uuid4()), email="owner-e2e@desk.example", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="WS e2e", slug="links-e2e", owner_id=owner.id)
    db_session.add(ws)
    await db_session.commit()
    await seed_service_desk_taxonomy(db_session, ws.id)
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="ops@desk.example", channel="webhook"
    )
    db_session.add(mailbox)
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).create_ticket(
        ws.id,
        InboundEmail(
            to="ops@desk.example",
            from_email="priya@partner.example",
            subject="Endorsement request",
            body_text="Please endorse policy 4471.",
            message_id="links-e2e-1",
        ),
        mailbox,
        "service_desk_webhook",
        classify=False,
    )
    await db_session.commit()

    links = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert links == []


@pytest.mark.asyncio
async def test_real_intake_publishes_once_the_desk_asks(db_session: AsyncSession):
    from aexy.models.service_desk import ServiceDeskMailbox
    from aexy.schemas.service_desk import InboundEmail
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

    owner = Developer(id=str(uuid4()), email="owner-e2e-on@desk.example", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(
        id=str(uuid4()), name="WS e2e on", slug="links-e2e-on", owner_id=owner.id,
        settings={"service_desk": {"public_ticket_links_enabled": True}},
    )
    db_session.add(ws)
    await db_session.commit()
    await seed_service_desk_taxonomy(db_session, ws.id)
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="ops@desk.example", channel="webhook"
    )
    db_session.add(mailbox)
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).create_ticket(
        ws.id,
        InboundEmail(
            to="ops@desk.example",
            from_email="priya@partner.example",
            subject="Endorsement request",
            body_text="Please endorse policy 4471.",
            message_id="links-e2e-on-1",
        ),
        mailbox,
        "service_desk_webhook",
        classify=False,
    )
    await db_session.commit()

    link = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().one()
    assert link.is_active is True


# ------------------------------------------------- who is reading it


@pytest.mark.asyncio
async def test_a_colleague_gets_the_in_app_ticket_and_no_token(db_session: AsyncSession):
    """A member needs no publishing decision — they can just open it.

    This is the better link where it applies: the app shows more of the ticket
    than the filtered public view, and nothing is published to reach it.
    """
    from aexy.models.workspace import WorkspaceMember

    ws, ticket = await _ticket(db_session, "links-member", public_links=False)
    colleague = Developer(id=str(uuid4()), email="asha@desk.example", name="Asha")
    db_session.add(colleague)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            id=str(uuid4()), workspace_id=ws.id, developer_id=colleague.id, status="active"
        )
    )
    # Upper-cased on purpose: mail addresses arrive however the sender's client
    # wrote them, and the match is case-insensitive.
    ticket.submitter_email = "ASHA@desk.example"
    await db_session.commit()

    url = await ensure_requester_url(db_session, ticket)

    assert url == app_ticket_url(ticket.id)
    links = (
        await db_session.execute(
            select(TicketShareLink).where(TicketShareLink.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert links == []


@pytest.mark.asyncio
async def test_an_external_requester_is_not_sent_into_a_login_wall(db_session: AsyncSession):
    """With publishing off they get no link, never an in-app one.

    An app URL for a workspace they have no account in reads as a broken link
    rather than a missing one.
    """
    ws, ticket = await _ticket(db_session, "links-external", public_links=False)

    assert ticket.submitter_email == "requester@partner.example"
    assert await ensure_requester_url(db_session, ticket) == ""


@pytest.mark.asyncio
async def test_a_departed_colleague_falls_back_to_the_public_rule(db_session: AsyncSession):
    """Membership rows outlive people. Only an active member gets the app link."""
    from aexy.models.workspace import WorkspaceMember

    ws, ticket = await _ticket(db_session, "links-departed", public_links=False)
    gone = Developer(id=str(uuid4()), email="gone@desk.example", name="Gone")
    db_session.add(gone)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            id=str(uuid4()), workspace_id=ws.id, developer_id=gone.id, status="removed"
        )
    )
    ticket.submitter_email = "gone@desk.example"
    await db_session.commit()

    assert await ensure_requester_url(db_session, ticket) == ""
