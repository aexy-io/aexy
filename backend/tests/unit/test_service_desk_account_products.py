"""A partner served for several products, owned by several people.

An account carried one `assigned_owner_id`, which says a partner is one person's
to look after. Desks split them: the same partner's motor work belongs to one
owner and its health work to another. The only way to express that was two
accounts sharing a domain — and the sender matcher would then resolve between
them arbitrarily, so the second owner's tickets reached the first about half the
time with nothing to say why.

The pairing does two jobs. It routes, and it narrows what the classifier is
asked: a partner served for two products is a much easier question than a
catalogue of forty, and one served for exactly one is not a question at all.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskAccountProduct,
    ServiceDeskMailbox,
    ServiceDeskProduct,
    ServiceDeskTicket,
)
from aexy.models.ticketing import TicketResponse
from aexy.models.workspace import Workspace
from aexy.schemas.service_desk import (
    AccountCreate,
    AccountProductInput,
    AccountUpdate,
    InboundEmail,
)
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from aexy.services.service_desk_service import ServiceDeskService
from tests.conftest import seed_service_desk_taxonomy


class _Desk:
    ws: Workspace
    mailbox: ServiceDeskMailbox
    account_owner: Developer
    motor_owner: Developer
    motor: ServiceDeskProduct
    health: ServiceDeskProduct
    account: ServiceDeskAccount


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    d.account_owner = Developer(
        id=str(uuid4()), email=f"acct-{slug}@desk.example", name="Account KAM"
    )
    d.motor_owner = Developer(
        id=str(uuid4()), email=f"motor-{slug}@desk.example", name="Motor KAM"
    )
    db.add_all([owner, d.account_owner, d.motor_owner])
    await db.flush()
    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    d.mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=d.ws.id, address="ops@desk.example", channel="webhook"
    )
    d.motor = ServiceDeskProduct(id=str(uuid4()), workspace_id=d.ws.id, name="Motor")
    d.health = ServiceDeskProduct(id=str(uuid4()), workspace_id=d.ws.id, name="Health")
    d.account = ServiceDeskAccount(
        id=str(uuid4()), workspace_id=d.ws.id, name="Partner Co",
        assigned_owner_id=d.account_owner.id,
    )
    db.add_all([d.mailbox, d.motor, d.health, d.account])
    await db.flush()
    db.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=d.ws.id, account_id=d.account.id,
            domain="partner.example",
        )
    )
    await db.commit()
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _pair(db: AsyncSession, d: _Desk, product, owner: Developer | None) -> None:
    db.add(
        ServiceDeskAccountProduct(
            id=str(uuid4()), workspace_id=d.ws.id, account_id=d.account.id,
            product_id=product.id, assigned_owner_id=owner.id if owner else None,
        )
    )
    await db.commit()


async def _sd(db: AsyncSession, ticket_id: str) -> ServiceDeskTicket:
    return (
        await db.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id)
        )
    ).scalar_one()


# ------------------------------------------------------------------ editing


@pytest.mark.asyncio
async def test_products_are_saved_and_read_back_with_names(db_session: AsyncSession):
    """Ids are not something a person can check a mapping against."""
    d = await _desk(db_session, "ap-save")
    svc = ServiceDeskService(db_session)

    created = await svc.create_account(
        d.ws.id,
        AccountCreate(
            name="Second Partner",
            domains=["second.example"],
            products=[
                AccountProductInput(product_id=d.motor.id, assigned_owner_id=d.motor_owner.id),
                AccountProductInput(product_id=d.health.id),
            ],
        ),
    )
    await db_session.commit()

    by_name = {p.product_name: p for p in created.products}
    assert set(by_name) == {"Motor", "Health"}
    assert by_name["Motor"].assigned_owner_name == "Motor KAM"
    assert by_name["Health"].assigned_owner_id is None


@pytest.mark.asyncio
async def test_updating_products_replaces_the_whole_set(db_session: AsyncSession):
    d = await _desk(db_session, "ap-replace")
    await _pair(db_session, d, d.motor, d.motor_owner)
    svc = ServiceDeskService(db_session)

    updated = await svc.update_account(
        d.ws.id, d.account.id,
        AccountUpdate(products=[AccountProductInput(product_id=d.health.id)]),
    )
    await db_session.commit()

    assert [p.product_name for p in updated.products] == ["Health"]


@pytest.mark.asyncio
async def test_another_workspaces_product_is_refused(db_session: AsyncSession):
    """The FK would accept it, and this partner's routing would then depend on a
    row nobody in this workspace can see."""
    d = await _desk(db_session, "ap-foreign")
    other = await _desk(db_session, "ap-foreign-other")
    svc = ServiceDeskService(db_session)

    with pytest.raises(HTTPException) as raised:
        await svc.update_account(
            d.ws.id, d.account.id,
            AccountUpdate(products=[AccountProductInput(product_id=other.motor.id)]),
        )

    assert raised.value.status_code == 422


@pytest.mark.asyncio
async def test_the_same_product_cannot_be_listed_twice(db_session: AsyncSession):
    """Two rows could name two owners, and routing would pick by insertion order."""
    d = await _desk(db_session, "ap-dupe")
    svc = ServiceDeskService(db_session)

    with pytest.raises(HTTPException) as raised:
        await svc.update_account(
            d.ws.id, d.account.id,
            AccountUpdate(
                products=[
                    AccountProductInput(product_id=d.motor.id, assigned_owner_id=d.motor_owner.id),
                    AccountProductInput(product_id=d.motor.id),
                ]
            ),
        )

    assert raised.value.status_code == 422


# ------------------------------------------------------------------ routing


@pytest.mark.asyncio
async def test_a_single_product_partner_needs_no_model_to_get_its_product(
    db_session: AsyncSession, monkeypatch
):
    """One option is not a choice, so it is not asked as one.

    The model is still called — the request type genuinely needs classifying —
    but the product is decided before it, which is why this holds even when the
    call fails outright. A partner served for exactly one product had its LOB
    left blank on every ticket the classifier could not answer.
    """
    d = await _desk(db_session, "ap-single")
    await _pair(db_session, d, d.motor, d.motor_owner)

    class _GatewayDown(BaseException):
        """Outside `Exception`, so the best-effort `except` cannot hide it
        having been reached — but raised deliberately, to stand for a model
        that is simply unavailable."""

    def _unavailable(*a, **k):
        raise _GatewayDown("no model today")

    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _unavailable)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", lambda self, *a, **k: _noop())

    async def _noop():
        return None

    with pytest.raises(_GatewayDown):
        await ServiceDeskIntakeService(db_session).ingest(
            InboundEmail(
                to=d.mailbox.address, from_email="priya@partner.example",
                subject="Endorsement", message_id="ap-single-1",
            ),
            d.mailbox,
            "service_desk_webhook",
        )

    sd = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.workspace_id == d.ws.id)
        )
    ).scalar_one()
    assert sd.product_id == d.motor.id


@pytest.mark.asyncio
async def test_a_split_partner_reaches_the_products_own_owner(
    db_session: AsyncSession, monkeypatch
):
    """The point of the pairing. Assignment happens before classification, so
    this is a re-route once the product is known — and it says so."""
    d = await _desk(db_session, "ap-route")
    await _pair(db_session, d, d.motor, d.motor_owner)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", lambda self, *a, **k: _noop())

    async def _noop():
        return None

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=d.mailbox.address, from_email="priya@partner.example",
            subject="Endorsement", message_id="ap-route-1",
        ),
        d.mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == d.motor_owner.id
    notes = (
        await db_session.execute(
            select(TicketResponse.content).where(
                TicketResponse.ticket_id == ticket.id,
                TicketResponse.is_internal.is_(True),
            )
        )
    ).scalars().all()
    assert any("Reassigned on classification" in note for note in notes)


@pytest.mark.asyncio
async def test_a_pairing_without_its_own_owner_leaves_the_account_owner(
    db_session: AsyncSession, monkeypatch
):
    """Most desks pair products without splitting people. Nothing should change."""
    d = await _desk(db_session, "ap-no-owner")
    await _pair(db_session, d, d.motor, None)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", lambda self, *a, **k: _noop())

    async def _noop():
        return None

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=d.mailbox.address, from_email="priya@partner.example",
            subject="Endorsement", message_id="ap-no-owner-1",
        ),
        d.mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == d.account_owner.id


@pytest.mark.asyncio
async def test_the_classifier_is_offered_only_this_partners_products(
    db_session: AsyncSession,
):
    """A partner the desk does not serve for health cannot get a health ticket."""
    d = await _desk(db_session, "ap-narrow")
    await _pair(db_session, d, d.motor, None)

    offered = await ServiceDeskIntakeService(db_session)._products_for(d.ws.id, d.account.id)

    assert [name for name, _ in offered] == ["Motor"]


@pytest.mark.asyncio
async def test_an_unpaired_account_still_sees_the_whole_catalogue(
    db_session: AsyncSession,
):
    """Every desk until somebody splits a partner. Nothing changes for them."""
    d = await _desk(db_session, "ap-fallback")

    offered = await ServiceDeskIntakeService(db_session)._products_for(d.ws.id, d.account.id)

    assert sorted(name for name, _ in offered) == ["Health", "Motor"]


@pytest.mark.asyncio
async def test_the_owner_lookup_answers_only_for_a_real_pairing(
    db_session: AsyncSession,
):
    """It returns nothing rather than the account's owner, so the caller can
    tell which of the two answered and say so on the timeline."""
    d = await _desk(db_session, "ap-lookup")
    await _pair(db_session, d, d.motor, d.motor_owner)
    intake = ServiceDeskIntakeService(db_session)

    assert await intake.product_owner(d.account.id, d.motor.id) == d.motor_owner.id
    assert await intake.product_owner(d.account.id, d.health.id) is None
    assert await intake.product_owner(None, d.motor.id) is None
    assert await intake.product_owner(d.account.id, None) is None
