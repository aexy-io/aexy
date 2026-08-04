"""The Service Desk scope resolver, on its own.

``resolve_scope_clause`` is the single server-side authority for which tickets a
caller may see; the integration tests prove the endpoints consult it, these prove
it decides correctly. ``describe_scope`` has to agree with it, because the UI's
empty-state wording is built from the name it returns and a name that disagreed
with the rows would be a lie the user can't check.
"""

from uuid import uuid4

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.role import CustomRole
from aexy.models.service_desk import PendingWith, ServiceDeskTicket
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_service import (
    describe_scope,
    has_full_service_desk_view,
    resolve_scope_clause,
)


async def _member(db, ws_id: str, label: str, *, permissions: list[str] | None = None) -> str:
    dev = Developer(id=str(uuid4()), email=f"{label}-{uuid4().hex[:6]}@bimaplan.co", name=label)
    db.add(dev)
    await db.flush()
    role_id = None
    if permissions is not None:
        role = CustomRole(
            id=str(uuid4()),
            workspace_id=ws_id,
            name=f"{label}-role",
            slug=f"{label}-{uuid4().hex[:6]}",
            permissions=permissions,
        )
        db.add(role)
        await db.flush()
        role_id = role.id
    db.add(
        WorkspaceMember(
            workspace_id=ws_id, developer_id=dev.id, role="member", status="active", role_id=role_id
        )
    )
    await db.flush()
    return dev.id


async def _in_department(db, ws_id: str, function_key: str, developer_id: str) -> None:
    dept = (
        await db.execute(
            select(Department).where(
                Department.workspace_id == ws_id, Department.function_key == function_key
            )
        )
    ).scalar_one_or_none()
    if dept is None:
        dept = Department(
            id=str(uuid4()),
            workspace_id=ws_id,
            name=function_key,
            slug=f"{function_key}-{uuid4().hex[:6]}",
            function_key=function_key,
            path=f"/{function_key}/",
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
    """A workspace with three tickets: one per KAM, one pending with Finance."""
    owner = Developer(id=str(uuid4()), email=f"owner-{uuid4().hex[:6]}@bimaplan.co", name="owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="BP", slug=f"bp-{uuid4().hex[:6]}", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()

    form = TicketForm(
        id=str(uuid4()), workspace_id=ws.id, name="SD", slug=f"sd-{uuid4().hex[:6]}", created_by_id=owner.id
    )
    db_session.add(form)
    await db_session.flush()

    kam_a = await _member(db_session, ws.id, "kam-a")
    kam_b = await _member(db_session, ws.id, "kam-b")
    await _in_department(db_session, ws.id, "ops_kam", kam_a)
    await _in_department(db_session, ws.id, "ops_kam", kam_b)

    ids = {}
    for n, (label, assignee, pending) in enumerate(
        [
            ("a", kam_a, PendingWith.KAM.value),
            ("b", kam_b, PendingWith.KAM.value),
            ("fin", kam_a, PendingWith.FINANCE.value),
        ],
        start=1,
    ):
        ticket = Ticket(
            id=str(uuid4()),
            workspace_id=ws.id,
            form_id=form.id,
            ticket_number=n,
            field_values={"subject": label},
            status="new",
            assignee_id=assignee,
            source="service_desk_manual",
        )
        db_session.add(ticket)
        await db_session.flush()
        db_session.add(
            ServiceDeskTicket(
                id=str(uuid4()),
                workspace_id=ws.id,
                ticket_id=ticket.id,
                request_type="claims",
                pending_with=pending,
                origin="manual",
            )
        )
        ids[label] = ticket.id
    await db_session.commit()
    return {"ws": ws.id, "kam_a": kam_a, "kam_b": kam_b, "tickets": ids}


async def _visible(db, ws_id: str, developer_id: str) -> set[str]:
    """The ticket ids the resolver admits, run as a real query."""
    query = select(ServiceDeskTicket.ticket_id).join(
        Ticket, Ticket.id == ServiceDeskTicket.ticket_id
    ).where(ServiceDeskTicket.workspace_id == ws_id)
    clause = await resolve_scope_clause(db, ws_id, developer_id)
    if clause is not None:
        query = query.where(clause)
    return set((await db.execute(query)).scalars().all())


@pytest.mark.asyncio
async def test_a_kam_is_scoped_to_their_assignments_not_the_kam_queue(db_session, desk):
    """Both tickets sit pending-with KAM; only one belongs to this KAM."""
    seen = await _visible(db_session, desk["ws"], desk["kam_a"])
    assert seen == {desk["tickets"]["a"], desk["tickets"]["fin"]}
    assert desk["tickets"]["b"] not in seen
    assert await describe_scope(db_session, desk["ws"], desk["kam_a"]) == "assigned"


@pytest.mark.asyncio
async def test_view_all_and_manage_each_open_the_whole_desk(db_session, desk):
    """Two permissions, one outcome — that is what makes the Lead role possible."""
    everything = set(desk["tickets"].values())

    lead = await _member(
        db_session,
        desk["ws"],
        "lead",
        permissions=["can_view_service_desk", "can_view_all_service_desk"],
    )
    head = await _member(
        db_session,
        desk["ws"],
        "head",
        permissions=["can_view_service_desk", "can_manage_service_desk"],
    )
    await db_session.commit()

    for who in (lead, head):
        assert await has_full_service_desk_view(db_session, desk["ws"], who) is True
        assert await resolve_scope_clause(db_session, desk["ws"], who) is None
        assert await _visible(db_session, desk["ws"], who) == everything
        assert await describe_scope(db_session, desk["ws"], who) == "all"


@pytest.mark.asyncio
async def test_a_non_ops_function_keeps_its_queue_without_gaining_peer_access(db_session, desk):
    """Finance sees what was handed to Finance, whoever it is assigned to."""
    finance = await _member(db_session, desk["ws"], "finance", permissions=["can_view_service_desk"])
    await _in_department(db_session, desk["ws"], "finance", finance)
    await db_session.commit()

    assert await _visible(db_session, desk["ws"], finance) == {desk["tickets"]["fin"]}
    assert await describe_scope(db_session, desk["ws"], finance) == "function"


@pytest.mark.asyncio
async def test_someone_in_no_department_matches_nothing(db_session, desk):
    """Distinguishable from a quiet day, which is the whole point of the name."""
    nobody = await _member(db_session, desk["ws"], "nobody", permissions=["can_view_service_desk"])
    await db_session.commit()

    assert await _visible(db_session, desk["ws"], nobody) == set()
    assert await describe_scope(db_session, desk["ws"], nobody) == "none"


@pytest.mark.asyncio
async def test_a_kam_who_is_also_in_finance_gets_both_rules(db_session, desk):
    """Dropping the KAM queue must not drop a second function with it."""
    await _in_department(db_session, desk["ws"], "finance", desk["kam_b"])
    await db_session.commit()

    # Own ticket (assignment) + the Finance ticket (queue), still not KAM A's.
    assert await _visible(db_session, desk["ws"], desk["kam_b"]) == {
        desk["tickets"]["b"],
        desk["tickets"]["fin"],
    }
    assert await describe_scope(db_session, desk["ws"], desk["kam_b"]) == "function"


@pytest.mark.asyncio
async def test_the_digest_does_not_mail_around_the_row_scope(db_session, desk):
    """Heading the department is not the same as being allowed to see it all.

    The daily digest lists tickets in the body of an email, so if it picked its
    "everything" recipient by department headship it would deliver exactly what
    the API refuses that person.
    """
    from aexy.services.service_desk_digest_service import ServiceDeskDigestService

    dept = (
        await db_session.execute(
            select(Department).where(
                Department.workspace_id == desk["ws"], Department.function_key == "ops_kam"
            )
        )
    ).scalar_one()
    dept.head_id = desk["kam_a"]
    await db_session.commit()

    by_email = {
        d.recipient_email: d for d in await ServiceDeskDigestService(db_session).build_digests(desk["ws"])
    }
    head_dev = await db_session.get(Developer, desk["kam_a"])
    # KAM A heads the department but holds no full-view permission, so their
    # digest is still only their own tickets — and they get exactly one.
    assert len(by_email) == 2
    assert by_email[head_dev.email].is_ops_head is False
    assert {r.display_id for r in by_email[head_dev.email].rows} == {"BSD-1", "BSD-3"}

    # Grant full view and the same head now legitimately gets the whole desk.
    member = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == desk["ws"],
                WorkspaceMember.developer_id == desk["kam_a"],
            )
        )
    ).scalar_one()
    member.permission_overrides = {"can_view_all_service_desk": True}
    await db_session.commit()

    after = {
        d.recipient_email: d for d in await ServiceDeskDigestService(db_session).build_digests(desk["ws"])
    }
    assert after[head_dev.email].is_ops_head is True
    assert {r.display_id for r in after[head_dev.email].rows} == {"BSD-1", "BSD-2", "BSD-3"}
