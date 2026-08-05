"""Choosing which department receives incoming tickets.

This started as the literal ``function_key == "ops_kam"``, so a workspace not set
up from the insurance-broking template auto-assigned nothing at all. That became
"the department behind the desk's first internal queue" — a fair guess, since the
bucket a new ticket starts in is by definition the team that fields it, but still
a guess: a desk whose first queue is Support while its intake team is Operations
had no way to say otherwise.

Now it is a setting, with the guess as its documented fallback. Both the
auto-assignment path and the digest resolve it through the same function on
purpose — a workspace where those two disagreed about who runs the desk would be
worse off than with either answer alone.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_service import ServiceDeskService, resolve_desk_department
from tests.conftest import seed_service_desk_taxonomy


async def _workspace(db: AsyncSession, slug: str) -> tuple[Workspace, Developer]:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()), name=f"WS {slug}", slug=f"{slug}-{uuid4().hex[:6]}",
        owner_id=owner.id, settings={},
    )
    db.add(ws)
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="admin", status="active"
        )
    )
    await db.flush()
    # The insurance slugs: `kam` is the first internal bucket, routing to
    # `operations`, which is what the fallback infers from.
    await seed_service_desk_taxonomy(db, ws.id)
    await db.commit()
    return ws, owner


async def _department(
    db: AsyncSession, ws: Workspace, name: str, function_key: str | None = None
) -> Department:
    dept = Department(
        id=str(uuid4()),
        workspace_id=ws.id,
        name=name,
        slug=name.lower().replace(" ", "-"),
        function_key=function_key,
        path=f"/{name.lower()}/",
        depth=0,
    )
    db.add(dept)
    await db.commit()
    return dept


# ==================== the fallback ====================


@pytest.mark.asyncio
async def test_with_nothing_chosen_it_infers_from_the_first_queue(
    db_session: AsyncSession,
):
    ws, _owner = await _workspace(db_session, "intake-infer")
    ops = await _department(db_session, ws, "Operations", "operations")

    resolved = await resolve_desk_department(db_session, ws.id)

    assert resolved is not None and resolved.id == ops.id


@pytest.mark.asyncio
async def test_no_department_claims_the_function_resolves_to_nobody(
    db_session: AsyncSession,
):
    """Not an error — but it is the state where every ticket arrives unassigned,
    which is why the settings page says so instead of showing a blank. Two
    departments and no function match is a genuine ambiguity: picking either
    would silently route one team's mail to the other."""
    ws, _owner = await _workspace(db_session, "intake-nobody")
    await _department(db_session, ws, "Marketing", "marketing")
    await _department(db_session, ws, "Sales", "sales")

    assert await resolve_desk_department(db_session, ws.id) is None


@pytest.mark.asyncio
async def test_a_lone_department_receives_tickets_even_without_a_function_match(
    db_session: AsyncSession,
):
    """A workspace whose only department is Tech (function key or not) has
    nothing to disambiguate — resolving to nobody just meant every ticket
    arrived unassigned while a perfectly good team existed."""
    ws, _owner = await _workspace(db_session, "intake-lone")
    tech = await _department(db_session, ws, "Tech", "engineering")

    resolved = await resolve_desk_department(db_session, ws.id)
    assert resolved is not None and resolved.id == tech.id


@pytest.mark.asyncio
async def test_the_lone_department_fallback_ignores_inactive_departments(
    db_session: AsyncSession,
):
    ws, _owner = await _workspace(db_session, "intake-lone-inactive")
    tech = await _department(db_session, ws, "Tech", "engineering")
    ghost = await _department(db_session, ws, "Old Ops", None)
    ghost.is_active = False
    await db_session.commit()

    resolved = await resolve_desk_department(db_session, ws.id)
    assert resolved is not None and resolved.id == tech.id


# ==================== the explicit choice ====================


@pytest.mark.asyncio
async def test_the_chosen_department_wins_over_the_inference(db_session: AsyncSession):
    """The whole point: a desk whose first queue routes to Operations can still
    hand its incoming mail to Support."""
    ws, owner = await _workspace(db_session, "intake-explicit")
    await _department(db_session, ws, "Operations", "operations")
    support = await _department(db_session, ws, "Support", "support")

    await ServiceDeskService(db_session).update_settings(
        ws.id, desk_department_id=support.id, developer_id=owner.id
    )
    await db_session.commit()

    resolved = await resolve_desk_department(db_session, ws.id)
    assert resolved is not None and resolved.id == support.id


@pytest.mark.asyncio
async def test_a_department_with_no_function_key_can_still_receive_tickets(
    db_session: AsyncSession,
):
    """Intake and row-visibility are different questions. A department created by
    hand, with no function key at all, is a perfectly good place to send mail."""
    ws, owner = await _workspace(db_session, "intake-nofunction")
    desk = await _department(db_session, ws, "Front Desk")

    await ServiceDeskService(db_session).update_settings(
        ws.id, desk_department_id=desk.id, developer_id=owner.id
    )
    await db_session.commit()

    resolved = await resolve_desk_department(db_session, ws.id)
    assert resolved is not None and resolved.id == desk.id


@pytest.mark.asyncio
async def test_clearing_it_goes_back_to_the_inference(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "intake-clear")
    ops = await _department(db_session, ws, "Operations", "operations")
    support = await _department(db_session, ws, "Support", "support")
    service = ServiceDeskService(db_session)

    await service.update_settings(ws.id, desk_department_id=support.id, developer_id=owner.id)
    await db_session.commit()
    await service.update_settings(ws.id, desk_department_id="", developer_id=owner.id)
    await db_session.commit()

    resolved = await resolve_desk_department(db_session, ws.id)
    assert resolved is not None and resolved.id == ops.id


# ==================== validation and staleness ====================


@pytest.mark.asyncio
async def test_a_department_from_another_workspace_is_refused(db_session: AsyncSession):
    """Trusting the id would send one workspace's mail to another's people, and
    the symptom — nobody being assigned anything — reads as a quiet inbox."""
    ws, owner = await _workspace(db_session, "intake-mine")
    other, _ = await _workspace(db_session, "intake-theirs")
    foreign = await _department(db_session, other, "Operations", "operations")

    with pytest.raises(HTTPException) as ei:
        await ServiceDeskService(db_session).update_settings(
            ws.id, desk_department_id=foreign.id, developer_id=owner.id
        )
    assert ei.value.status_code == 400


@pytest.mark.asyncio
async def test_a_nonexistent_department_is_refused(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "intake-ghost")

    with pytest.raises(HTTPException) as ei:
        await ServiceDeskService(db_session).update_settings(
            ws.id, desk_department_id=str(uuid4()), developer_id=owner.id
        )
    assert ei.value.status_code == 400


@pytest.mark.asyncio
async def test_a_deactivated_department_falls_back_rather_than_stopping_intake(
    db_session: AsyncSession,
):
    """Losing auto-assignment silently is the failure this area keeps producing,
    so a stale choice degrades to the inference instead of resolving to nobody."""
    ws, owner = await _workspace(db_session, "intake-stale")
    ops = await _department(db_session, ws, "Operations", "operations")
    support = await _department(db_session, ws, "Support", "support")

    await ServiceDeskService(db_session).update_settings(
        ws.id, desk_department_id=support.id, developer_id=owner.id
    )
    await db_session.commit()
    support.is_active = False
    await db_session.commit()

    resolved = await resolve_desk_department(db_session, ws.id)
    assert resolved is not None and resolved.id == ops.id


# ==================== what the settings page is told ====================


@pytest.mark.asyncio
async def test_settings_report_the_department_actually_in_force(
    db_session: AsyncSession,
):
    ws, owner = await _workspace(db_session, "intake-report")
    ops = await _department(db_session, ws, "Operations", "operations")

    settings = await ServiceDeskService(db_session).get_settings(ws.id, developer_id=owner.id)

    # Resolved, not raw: nothing has been chosen, and a blank field here would
    # imply nobody is receiving tickets.
    assert settings["desk_department_id"] == ops.id
    assert settings["desk_department_name"] == "Operations"
    assert settings["desk_department_is_explicit"] is False


@pytest.mark.asyncio
async def test_settings_mark_a_deliberate_choice_as_explicit(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "intake-report-explicit")
    await _department(db_session, ws, "Operations", "operations")
    support = await _department(db_session, ws, "Support", "support")
    service = ServiceDeskService(db_session)

    await service.update_settings(ws.id, desk_department_id=support.id, developer_id=owner.id)
    await db_session.commit()

    settings = await service.get_settings(ws.id, developer_id=owner.id)
    assert settings["desk_department_id"] == support.id
    assert settings["desk_department_is_explicit"] is True


@pytest.mark.asyncio
async def test_a_stale_choice_is_not_reported_as_explicit(db_session: AsyncSession):
    """Otherwise the page would show "Support, chosen" while mail went to
    Operations — the setting silently not being honoured."""
    ws, owner = await _workspace(db_session, "intake-report-stale")
    ops = await _department(db_session, ws, "Operations", "operations")
    support = await _department(db_session, ws, "Support", "support")
    service = ServiceDeskService(db_session)

    await service.update_settings(ws.id, desk_department_id=support.id, developer_id=owner.id)
    await db_session.commit()
    support.is_active = False
    await db_session.commit()

    settings = await service.get_settings(ws.id, developer_id=owner.id)
    assert settings["desk_department_id"] == ops.id
    assert settings["desk_department_is_explicit"] is False


# ==================== it actually assigns tickets ====================


@pytest.mark.asyncio
async def test_intake_assigns_to_the_chosen_department(
    db_session: AsyncSession, monkeypatch
):
    """The end-to-end claim, not just the resolver's answer."""
    from aexy.models.service_desk import ServiceDeskMailbox
    from aexy.schemas.service_desk import InboundEmail
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

    # Classification and the receipt email are best-effort hooks that reach
    # outward; the assignment is what is being claimed here.
    async def _noop(self, *a, **k):
        return None

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _noop)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _noop)

    ws, owner = await _workspace(db_session, "intake-e2e")
    await _department(db_session, ws, "Operations", "operations")
    support = await _department(db_session, ws, "Support", "support")

    agent = Developer(id=str(uuid4()), email=f"agent-{ws.slug}@example.com", name="Agent")
    db_session.add(agent)
    await db_session.flush()
    db_session.add(
        DepartmentMember(workspace_id=ws.id, department_id=support.id, developer_id=agent.id)
    )
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=agent.id, role="member", status="active"
        )
    )
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="help@example.com", channel="webhook"
    )
    db_session.add(mailbox)
    await db_session.commit()

    await ServiceDeskService(db_session).update_settings(
        ws.id, desk_department_id=support.id, developer_id=owner.id
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to="help@example.com",
            from_email="customer@elsewhere.io",
            subject="Help",
            body_text="Body",
            message_id="m-intake-e2e",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == agent.id
