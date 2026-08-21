"""A domain two accounts both claim.

A domain decides which account a ticket belongs to, so the unique constraint is
right to refuse a second claim. It was refusing it as a 500 raised from inside
an autoflush, so what a person saw was a stack trace naming a constraint rather
than which entry to change.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.schemas.service_desk import AccountCreate, AccountUpdate
from aexy.services.service_desk_service import ServiceDeskService
from tests.unit.test_service_desk_intake import _workspace


@pytest.mark.asyncio
async def test_a_domain_another_account_holds_is_refused_by_name(db_session: AsyncSession):
    ws = await _workspace(db_session, "dom-conflict")
    svc = ServiceDeskService(db_session)
    await svc.create_account(ws.id, AccountCreate(name="ABC Finance", domains=["acme.com"]))
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await svc.create_account(ws.id, AccountCreate(name="Acme Insurance", domains=["acme.com"]))

    assert exc.value.status_code == 409
    # Both halves of "what happened" are in the message: the domain, and who has it.
    assert "acme.com" in exc.value.detail
    assert "ABC Finance" in exc.value.detail


@pytest.mark.asyncio
async def test_an_account_may_keep_its_own_domain_on_update(db_session: AsyncSession):
    """The obvious way to break this fix: rejecting a row against itself."""
    ws = await _workspace(db_session, "dom-self")
    svc = ServiceDeskService(db_session)
    account = await svc.create_account(ws.id, AccountCreate(name="ABC Finance", domains=["abc.com"]))
    await db_session.commit()

    updated = await svc.update_account(
        ws.id, account.id, AccountUpdate(domains=["abc.com", "abc.co.uk"])
    )
    assert sorted(updated.domains) == ["abc.co.uk", "abc.com"]


@pytest.mark.asyncio
async def test_a_full_address_conflicts_the_same_way(db_session: AsyncSession):
    """What was actually reported — an address, not a domain, held twice."""
    ws = await _workspace(db_session, "dom-addr")
    svc = ServiceDeskService(db_session)
    await svc.create_account(ws.id, AccountCreate(name="Surbhi", domains=["surbhi.j@bimaplan.co"]))
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await svc.create_account(ws.id, AccountCreate(name="Surbhi J", domains=["surbhi.j@bimaplan.co"]))
    assert exc.value.status_code == 409
