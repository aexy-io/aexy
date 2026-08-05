"""Unit tests for the Organization module service.

Covers department hierarchy (materialized path), re-parenting with the cycle
guard, multi-function membership with the single-primary rule, headcount
rollups, org-chart assembly, and reporting-line assignment.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import DepartmentMember
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.organization import (
    DepartmentCreate,
    MembershipCreate,
    MembershipUpdate,
    PositionCreate,
)
from aexy.services.organization_service import OrganizationService


async def _make_workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(email=f"owner-{slug}@example.com", name=f"Owner {slug}")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


async def _make_developer(db: AsyncSession, tag: str, ws: Workspace) -> Developer:
    """A developer who is also an active member of ``ws``.

    The workspace membership is not incidental: you can only be placed in a
    department of a workspace you actually belong to, so a developer without it
    is a state the product never produces.
    """
    dev = Developer(email=f"{tag}@example.com", name=tag)
    db.add(dev)
    await db.flush()
    db.add(
        WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role="member", status="active")
    )
    await db.commit()
    await db.refresh(dev)
    return dev


@pytest.mark.asyncio
async def test_department_hierarchy_and_paths(db_session: AsyncSession):
    ws = await _make_workspace(db_session, "org-a")
    svc = OrganizationService(db_session)

    ops = await svc.create_department(ws.id, DepartmentCreate(name="Operations", function_key="ops_kam"))
    kam = await svc.create_department(ws.id, DepartmentCreate(name="KAM Desk", parent_id=ops.id))
    await db_session.commit()

    assert ops.depth == 0 and ops.path == f"/{ops.id}/"
    assert kam.depth == 1 and kam.path == f"/{ops.id}/{kam.id}/"
    assert kam.parent_id == ops.id

    # slug auto-generated + collision-safe
    dup = await svc.create_department(ws.id, DepartmentCreate(name="Operations"))
    assert dup.slug != ops.slug


@pytest.mark.asyncio
async def test_reparent_rewrites_subtree_and_blocks_cycles(db_session: AsyncSession):
    ws = await _make_workspace(db_session, "org-b")
    svc = OrganizationService(db_session)

    a = await svc.create_department(ws.id, DepartmentCreate(name="A"))
    b = await svc.create_department(ws.id, DepartmentCreate(name="B", parent_id=a.id))
    c = await svc.create_department(ws.id, DepartmentCreate(name="C", parent_id=b.id))
    await db_session.commit()

    # cycle guard: moving A under its own descendant C must fail
    with pytest.raises(HTTPException) as ei:
        await svc.reparent_department(ws.id, a.id, c.id)
    assert ei.value.status_code == 400

    # self-parent must fail
    with pytest.raises(HTTPException):
        await svc.reparent_department(ws.id, a.id, a.id)

    # valid: move B (and its subtree C) to a root
    await svc.reparent_department(ws.id, b.id, None)
    await db_session.commit()

    detail_b = await svc.get_department(ws.id, b.id)
    detail_c = await svc.get_department(ws.id, c.id)
    assert detail_b.parent_id is None and detail_b.depth == 0
    assert detail_b.path == f"/{b.id}/"
    # C's path/depth rewritten to follow B
    assert detail_c.depth == 1
    assert detail_c.path == f"/{b.id}/{c.id}/"


@pytest.mark.asyncio
async def test_multi_function_membership_single_primary(db_session: AsyncSession):
    ws = await _make_workspace(db_session, "org-c")
    dev = await _make_developer(db_session, "neha", ws)
    svc = OrganizationService(db_session)

    sales = await svc.create_department(ws.id, DepartmentCreate(name="Sales", function_key="sales"))
    finance = await svc.create_department(ws.id, DepartmentCreate(name="Finance", function_key="finance"))
    await db_session.commit()

    # same person in two functions — allowed
    await svc.add_member(ws.id, sales.id, MembershipCreate(developer_id=dev.id, is_primary=True))
    await svc.add_member(ws.id, finance.id, MembershipCreate(developer_id=dev.id, is_primary=True))
    await db_session.commit()

    # only the most recent primary remains primary
    rows = (
        await db_session.execute(
            select(DepartmentMember).where(
                DepartmentMember.workspace_id == ws.id,
                DepartmentMember.developer_id == dev.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 2
    assert sum(1 for r in rows if r.is_primary) == 1
    primary = next(r for r in rows if r.is_primary)
    assert primary.department_id == finance.id

    # developer belongs to two departments
    depts = await svc.list_departments_for_developer(ws.id, dev.id)
    assert {d.id for d in depts} == {sales.id, finance.id}

    # duplicate membership rejected
    with pytest.raises(HTTPException) as ei:
        await svc.add_member(ws.id, sales.id, MembershipCreate(developer_id=dev.id))
    assert ei.value.status_code == 409


@pytest.mark.asyncio
async def test_headcount_and_org_chart(db_session: AsyncSession):
    ws = await _make_workspace(db_session, "org-d")
    d1 = await _make_developer(db_session, "a", ws)
    d2 = await _make_developer(db_session, "b", ws)
    svc = OrganizationService(db_session)

    root = await svc.create_department(ws.id, DepartmentCreate(name="Company"))
    eng = await svc.create_department(ws.id, DepartmentCreate(name="Engineering", parent_id=root.id))
    await db_session.commit()

    await svc.add_member(ws.id, eng.id, MembershipCreate(developer_id=d1.id))
    await svc.add_member(ws.id, eng.id, MembershipCreate(developer_id=d2.id))
    await db_session.commit()

    detail = await svc.get_department(ws.id, eng.id)
    assert detail.headcount_actual == 2 and detail.member_count == 2

    chart = await svc.get_org_chart(ws.id)
    assert len(chart) == 1
    assert chart[0].id == root.id
    assert len(chart[0].children) == 1
    assert chart[0].children[0].id == eng.id
    assert chart[0].children[0].member_count == 2


@pytest.mark.asyncio
async def test_delete_reparents_children(db_session: AsyncSession):
    ws = await _make_workspace(db_session, "org-e")
    svc = OrganizationService(db_session)

    a = await svc.create_department(ws.id, DepartmentCreate(name="A"))
    b = await svc.create_department(ws.id, DepartmentCreate(name="B", parent_id=a.id))
    c = await svc.create_department(ws.id, DepartmentCreate(name="C", parent_id=b.id))
    await db_session.commit()

    # delete middle node B → C should reattach under A
    await svc.delete_department(ws.id, b.id)
    await db_session.commit()

    c_detail = await svc.get_department(ws.id, c.id)
    assert c_detail.parent_id == a.id
    assert c_detail.path == f"/{a.id}/{c.id}/"
    assert c_detail.depth == 1


@pytest.mark.asyncio
async def test_set_manager_reporting_line(db_session: AsyncSession):
    ws = await _make_workspace(db_session, "org-f")
    report = await _make_developer(db_session, "report", ws)
    boss = await _make_developer(db_session, "boss", ws)
    svc = OrganizationService(db_session)

    await svc.set_manager(ws.id, report.id, boss.id)
    await db_session.commit()

    member = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.developer_id == report.id,
            )
        )
    ).scalar_one()
    assert member.manager_id == boss.id

    # cannot report to self
    with pytest.raises(HTTPException):
        await svc.set_manager(ws.id, report.id, report.id)


@pytest.mark.asyncio
async def test_set_manager_rejects_a_cycle(db_session: AsyncSession):
    """A→B→C is fine; closing the loop back to A is not.

    A cycle would make anything that walks the chain to build a reporting tree
    recurse until it ran out of stack, so it has to be refused at write time —
    there is no safe way to render it later.
    """
    ws = await _make_workspace(db_session, "org-cycle")
    a = await _make_developer(db_session, "chain-a", ws)
    b = await _make_developer(db_session, "chain-b", ws)
    c = await _make_developer(db_session, "chain-c", ws)
    svc = OrganizationService(db_session)

    await svc.set_manager(ws.id, a.id, b.id)
    await svc.set_manager(ws.id, b.id, c.id)
    await db_session.commit()

    # c reporting to a would close a→b→c→a
    with pytest.raises(HTTPException) as ei:
        await svc.set_manager(ws.id, c.id, a.id)
    assert ei.value.status_code == 400
    assert "cycle" in ei.value.detail.lower()

    # the rejected write left the chain untouched
    rows = {
        m.developer_id: m.manager_id
        for m in (
            await db_session.execute(
                select(WorkspaceMember).where(WorkspaceMember.workspace_id == ws.id)
            )
        ).scalars().all()
    }
    assert rows[a.id] == b.id and rows[b.id] == c.id and rows[c.id] is None


@pytest.mark.asyncio
async def test_org_membership_is_confined_to_the_workspace(db_session: AsyncSession):
    """Neither a department nor a reporting line may reach an outside developer.

    ``manager_id`` FKs to ``developers.id`` and ``MembershipCreate`` takes a bare
    developer id, so without an explicit check both would happily accept someone
    from another workspace — and ``MemberSummary`` would hand back that person's
    name and email.
    """
    ws = await _make_workspace(db_session, "org-tenant")
    other = await _make_workspace(db_session, "org-other")
    insider = await _make_developer(db_session, "insider", ws)
    outsider = await _make_developer(db_session, "outsider", other)
    svc = OrganizationService(db_session)

    dept = await svc.create_department(ws.id, DepartmentCreate(name="Ops", function_key="ops_kam"))
    await db_session.commit()

    with pytest.raises(HTTPException) as ei:
        await svc.add_member(ws.id, dept.id, MembershipCreate(developer_id=outsider.id))
    assert ei.value.status_code == 400

    with pytest.raises(HTTPException) as ei:
        await svc.set_manager(ws.id, insider.id, outsider.id)
    assert ei.value.status_code == 400


@pytest.mark.asyncio
async def test_list_people_includes_those_in_no_department(db_session: AsyncSession):
    """The state every new joiner starts in has to be visible somewhere.

    Department-first reads (directory, org chart) structurally cannot show
    someone who belongs to no department, which is exactly who needs placing.
    """
    ws = await _make_workspace(db_session, "org-people")
    placed = await _make_developer(db_session, "placed", ws)
    await _make_developer(db_session, "stranded", ws)
    svc = OrganizationService(db_session)

    sales = await svc.create_department(ws.id, DepartmentCreate(name="Sales", function_key="sales"))
    await db_session.commit()
    await svc.add_member(ws.id, sales.id, MembershipCreate(developer_id=placed.id, is_primary=True))
    await svc.set_manager(ws.id, placed.id, None)
    await db_session.commit()

    people = {p.name: p for p in await svc.list_people(ws.id)}
    # the workspace owner is a member too, so assert on the two we care about
    assert people["placed"].departments[0].name == "Sales"
    assert people["placed"].departments[0].is_primary is True
    assert people["stranded"].departments == []


# ==================== headcount seats (positions) ====================
#
# A department position is a headcount seat. Creating one was the only thing the
# product could do with it: it had a `filled_by_id` column that nothing ever
# wrote, so every seat read "Open" for ever and no member could be connected to
# the seat they occupy. These tests pin the seat down as the owner of that link.


async def _dept_with_seats(db: AsyncSession, slug: str, *titles: str):
    ws = await _make_workspace(db, slug)
    svc = OrganizationService(db)
    dept = await svc.create_department(ws.id, DepartmentCreate(name="Tech"))
    await db.commit()
    seats = [await svc.add_position(ws.id, dept.id, PositionCreate(title=t)) for t in titles]
    await db.commit()
    return ws, svc, dept, seats


@pytest.mark.asyncio
async def test_member_can_be_placed_in_a_seat_on_add(db_session: AsyncSession):
    ws, svc, dept, (seat,) = await _dept_with_seats(db_session, "seat-add", "Tech Lead")
    dev = await _make_developer(db_session, "lead", ws)

    member = await svc.add_member(
        ws.id, dept.id, MembershipCreate(developer_id=dev.id, position_id=seat.id)
    )
    await db_session.commit()

    assert member.position_id == seat.id
    assert member.position_title == "Tech Lead"

    detail = await svc.get_department(ws.id, dept.id)
    assert detail.positions[0].status == "filled"
    assert detail.positions[0].filled_by_id == dev.id
    assert detail.positions[0].filled_by_name == "lead"
    assert detail.members[0].position_title == "Tech Lead"


@pytest.mark.asyncio
async def test_omitting_the_seat_leaves_every_seat_open(db_session: AsyncSession):
    """The pre-existing call shape must keep behaving exactly as it did."""
    ws, svc, dept, _ = await _dept_with_seats(db_session, "seat-omit", "Tech Lead")
    dev = await _make_developer(db_session, "nobody", ws)

    member = await svc.add_member(ws.id, dept.id, MembershipCreate(developer_id=dev.id))
    await db_session.commit()

    assert member.position_id is None
    detail = await svc.get_department(ws.id, dept.id)
    assert detail.positions[0].status == "open"
    assert detail.positions[0].filled_by_id is None


@pytest.mark.asyncio
async def test_seat_can_be_assigned_and_vacated_after_the_fact(db_session: AsyncSession):
    ws, svc, dept, (seat,) = await _dept_with_seats(db_session, "seat-later", "Tech Lead")
    dev = await _make_developer(db_session, "later", ws)
    member = await svc.add_member(ws.id, dept.id, MembershipCreate(developer_id=dev.id))
    await db_session.commit()

    filled = await svc.update_member(
        ws.id, dept.id, member.id, MembershipUpdate(position_id=seat.id)
    )
    await db_session.commit()
    assert filled.position_id == seat.id

    # Explicit null vacates it, and the seat has to become available again —
    # a seat that can never be refilled is not a headcount seat.
    vacated = await svc.update_member(
        ws.id, dept.id, member.id, MembershipUpdate(position_id=None)
    )
    await db_session.commit()
    assert vacated.position_id is None
    detail = await svc.get_department(ws.id, dept.id)
    assert detail.positions[0].status == "open"


@pytest.mark.asyncio
async def test_unrelated_edit_does_not_vacate_the_seat(db_session: AsyncSession):
    """`position_id` unset means "don't touch"; only an explicit null clears it."""
    ws, svc, dept, (seat,) = await _dept_with_seats(db_session, "seat-keep", "Tech Lead")
    dev = await _make_developer(db_session, "keeper", ws)
    member = await svc.add_member(
        ws.id, dept.id, MembershipCreate(developer_id=dev.id, position_id=seat.id)
    )
    await db_session.commit()

    updated = await svc.update_member(
        ws.id, dept.id, member.id, MembershipUpdate(role_in_department="manager")
    )
    await db_session.commit()

    assert updated.role_in_department == "manager"
    assert updated.position_id == seat.id


@pytest.mark.asyncio
async def test_moving_seats_frees_the_previous_one(db_session: AsyncSession):
    ws, svc, dept, (lead, ic) = await _dept_with_seats(
        db_session, "seat-move", "Tech Lead", "Engineer"
    )
    dev = await _make_developer(db_session, "mover", ws)
    member = await svc.add_member(
        ws.id, dept.id, MembershipCreate(developer_id=dev.id, position_id=lead.id)
    )
    await db_session.commit()

    await svc.update_member(ws.id, dept.id, member.id, MembershipUpdate(position_id=ic.id))
    await db_session.commit()

    by_id = {p.id: p for p in (await svc.get_department(ws.id, dept.id)).positions}
    assert by_id[lead.id].status == "open" and by_id[lead.id].filled_by_id is None
    assert by_id[ic.id].filled_by_id == dev.id


@pytest.mark.asyncio
async def test_an_occupied_seat_cannot_be_taken(db_session: AsyncSession):
    ws, svc, dept, (seat,) = await _dept_with_seats(db_session, "seat-taken", "Tech Lead")
    first = await _make_developer(db_session, "first", ws)
    second = await _make_developer(db_session, "second", ws)
    await svc.add_member(
        ws.id, dept.id, MembershipCreate(developer_id=first.id, position_id=seat.id)
    )
    await db_session.commit()

    with pytest.raises(HTTPException) as ei:
        await svc.add_member(
            ws.id, dept.id, MembershipCreate(developer_id=second.id, position_id=seat.id)
        )
    assert ei.value.status_code == 409


@pytest.mark.asyncio
async def test_a_seat_from_another_department_is_rejected(db_session: AsyncSession):
    """A seat belongs to one department, so accepting a foreign id would place
    someone in a seat that is not on the roster they are being added to."""
    ws, svc, dept, _ = await _dept_with_seats(db_session, "seat-foreign", "Tech Lead")
    other = await svc.create_department(ws.id, DepartmentCreate(name="Sales"))
    await db_session.commit()
    elsewhere = await svc.add_position(ws.id, other.id, PositionCreate(title="AE"))
    await db_session.commit()
    dev = await _make_developer(db_session, "wrongseat", ws)

    with pytest.raises(HTTPException) as ei:
        await svc.add_member(
            ws.id, dept.id, MembershipCreate(developer_id=dev.id, position_id=elsewhere.id)
        )
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_removing_a_member_reopens_their_seat(db_session: AsyncSession):
    """Otherwise the seat reads as taken by someone who has left, and is
    permanently unofferable."""
    ws, svc, dept, (seat,) = await _dept_with_seats(db_session, "seat-leaver", "Tech Lead")
    dev = await _make_developer(db_session, "leaver", ws)
    member = await svc.add_member(
        ws.id, dept.id, MembershipCreate(developer_id=dev.id, position_id=seat.id)
    )
    await db_session.commit()

    await svc.remove_member(ws.id, dept.id, member.id)
    await db_session.commit()

    detail = await svc.get_department(ws.id, dept.id)
    assert detail.positions[0].status == "open"
    assert detail.positions[0].filled_by_id is None


@pytest.mark.asyncio
async def test_a_seat_created_with_a_holder_is_filled(db_session: AsyncSession):
    """`status` defaults to "open", which would advertise an occupied seat."""
    ws = await _make_workspace(db_session, "seat-born-filled")
    svc = OrganizationService(db_session)
    dept = await svc.create_department(ws.id, DepartmentCreate(name="Tech"))
    await db_session.commit()
    dev = await _make_developer(db_session, "holder", ws)

    seat = await svc.add_position(
        ws.id, dept.id, PositionCreate(title="Tech Lead", filled_by_id=dev.id)
    )
    await db_session.commit()

    assert seat.status == "filled"
    assert seat.filled_by_name == "holder"
