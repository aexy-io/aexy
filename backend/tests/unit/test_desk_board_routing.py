"""Which Service Desk bucket a board's work is pending with.

Converting a ticket to a task means the work is now owed by whoever owns the
board — but nothing computed that, so the ticket kept whatever `pending_with` it
already had and somebody moved it by hand. The chain to compute it was already in
the schema and used by nothing:

    board (Team) -> Team.department_id -> Department.function_key
                 -> ServiceDeskStakeholder.function_key -> bucket

The cases worth pinning down are the ones that resolve to *nothing*, because a
resolver that answers None three different ways gives an admin a feature that
quietly does nothing and no way to find out why.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department
from aexy.models.service_desk import ServiceDeskStakeholder
from aexy.models.team import Team
from aexy.models.workspace import Workspace
from aexy.services.desk_board_routing import (
    REASON_DEPARTMENT,
    REASON_DEPARTMENT_HAS_NO_FUNCTION,
    REASON_NO_BOARD,
    REASON_NO_BUCKET_FOR_FUNCTION,
    REASON_NO_DEPARTMENT,
    REASON_OVERRIDE,
    explain,
    resolve_board_routing,
)


async def _workspace(db: AsyncSession) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"o-{uuid4().hex[:8]}@example.test", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()), name="WS", slug=f"ws-{uuid4().hex[:8]}", owner_id=owner.id, settings={}
    )
    db.add(ws)
    await db.flush()
    return ws


async def _department(
    db: AsyncSession, ws: Workspace, name: str, function_key: str | None
) -> Department:
    dept = Department(
        id=str(uuid4()),
        workspace_id=ws.id,
        name=name,
        slug=name.lower(),
        function_key=function_key,
    )
    db.add(dept)
    await db.flush()
    return dept


async def _board(
    db: AsyncSession,
    ws: Workspace,
    name: str,
    *,
    department_id: str | None = None,
    override: str | None = None,
) -> Team:
    team = Team(
        id=str(uuid4()),
        workspace_id=ws.id,
        name=name,
        slug=name.lower().replace(" ", "-"),
        department_id=department_id,
        desk_stakeholder_slug=override,
    )
    db.add(team)
    await db.flush()
    return team


async def _bucket(
    db: AsyncSession,
    ws: Workspace,
    slug: str,
    *,
    function_key: str | None = None,
    semantics: str = "internal",
    is_active: bool = True,
) -> ServiceDeskStakeholder:
    row = ServiceDeskStakeholder(
        id=str(uuid4()),
        workspace_id=ws.id,
        slug=slug,
        label=slug.title(),
        semantics=semantics,
        function_key=function_key,
        is_active=is_active,
    )
    db.add(row)
    await db.flush()
    return row


@pytest.mark.asyncio
async def test_board_resolves_through_its_department(db_session: AsyncSession):
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Engineering", "engineering")
    await _bucket(db_session, ws, "tech", function_key="engineering")
    board = await _board(db_session, ws, "Tech Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug == "tech"
    assert routing.reason == REASON_DEPARTMENT
    assert routing.department_name == "Engineering"
    # The log line names the department, so the reader can tell an automatic move
    # from somebody's manual one.
    assert "Engineering" in explain(routing, board.name)


@pytest.mark.asyncio
async def test_a_retired_spelling_on_either_side_still_matches(db_session: AsyncSession):
    """The failure this whole module exists to prevent.

    Live workspaces hold `ops_kam` — the insurance-broking spelling from when the
    desk was an insurance desk — in `departments.function_key`, while newer rows
    canonicalise to `operations`. Comparing a single string means the join
    silently finds nothing, and the symptom is indistinguishable from routing
    being switched off.
    """
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Operations", "ops_kam")
    await _bucket(db_session, ws, "kam", function_key="operations")
    board = await _board(db_session, ws, "Ops Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug == "kam"
    assert routing.reason == REASON_DEPARTMENT


@pytest.mark.asyncio
async def test_a_board_with_no_department_says_so(db_session: AsyncSession):
    ws = await _workspace(db_session)
    await _bucket(db_session, ws, "tech", function_key="engineering")
    board = await _board(db_session, ws, "Loose Board")

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug is None
    assert routing.reason == REASON_NO_DEPARTMENT
    # And says where the fix is, since it is not on the screen the reader is on.
    assert "settings" in explain(routing, board.name)


@pytest.mark.asyncio
async def test_a_department_with_no_function_is_a_distinct_answer(db_session: AsyncSession):
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Special Projects", None)
    board = await _board(db_session, ws, "SP Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.reason == REASON_DEPARTMENT_HAS_NO_FUNCTION
    assert "Special Projects" in explain(routing, board.name)


@pytest.mark.asyncio
async def test_a_function_no_bucket_claims_is_a_distinct_answer(db_session: AsyncSession):
    """The state a workspace is in before anyone adds a Tech bucket.

    The department exists and carries `engineering`; the desk's taxonomy — seeded
    from the insurance template — has no bucket owned by it. Saying which
    department went unclaimed is the whole difference between a fixable message
    and a feature that does nothing.
    """
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Engineering", "engineering")
    await _bucket(db_session, ws, "kam", function_key="operations")
    board = await _board(db_session, ws, "Tech Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug is None
    assert routing.reason == REASON_NO_BUCKET_FOR_FUNCTION
    assert "Engineering" in explain(routing, board.name)


@pytest.mark.asyncio
async def test_the_override_beats_the_department(db_session: AsyncSession):
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Engineering", "engineering")
    await _bucket(db_session, ws, "tech", function_key="engineering")
    await _bucket(db_session, ws, "triage", function_key="support")
    board = await _board(db_session, ws, "Shared Triage", department_id=dept.id, override="triage")

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug == "triage"
    assert routing.reason == REASON_OVERRIDE


@pytest.mark.asyncio
async def test_an_override_naming_a_retired_bucket_falls_back(db_session: AsyncSession):
    """Retiring a bucket must not start routing boards into a dead one.

    The override stores a slug, not a foreign key, so nothing at the database
    level notices when the bucket it names is retired. Falling back to the
    department is the safe reading — the board still routes somewhere real.
    """
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Engineering", "engineering")
    await _bucket(db_session, ws, "tech", function_key="engineering")
    await _bucket(db_session, ws, "triage", function_key="support", is_active=False)
    board = await _board(db_session, ws, "Shared Triage", department_id=dept.id, override="triage")

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug == "tech"
    assert routing.reason == REASON_DEPARTMENT


@pytest.mark.asyncio
async def test_a_retired_bucket_is_never_resolved_into(db_session: AsyncSession):
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Engineering", "engineering")
    await _bucket(db_session, ws, "tech", function_key="engineering", is_active=False)
    board = await _board(db_session, ws, "Tech Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug is None
    assert routing.reason == REASON_NO_BUCKET_FOR_FUNCTION


@pytest.mark.asyncio
async def test_an_external_bucket_is_never_resolved_into(db_session: AsyncSession):
    """A board is where work is done, so it can only be an internal party.

    An external bucket sharing a function key would otherwise move the ticket out
    of the desk's own queue the moment somebody started work on it.
    """
    ws = await _workspace(db_session)
    dept = await _department(db_session, ws, "Engineering", "engineering")
    await _bucket(db_session, ws, "partner", function_key="engineering", semantics="external")
    board = await _board(db_session, ws, "Tech Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.reason == REASON_NO_BUCKET_FOR_FUNCTION


@pytest.mark.asyncio
async def test_a_board_in_another_workspace_is_not_resolved(db_session: AsyncSession):
    """The board id arrives in a request body, so it is scoped, not trusted."""
    ws = await _workspace(db_session)
    other = await _workspace(db_session)
    dept = await _department(db_session, other, "Engineering", "engineering")
    await _bucket(db_session, other, "tech", function_key="engineering")
    board = await _board(db_session, other, "Tech Board", department_id=dept.id)

    routing = await resolve_board_routing(db_session, ws.id, board.id)

    assert routing.stakeholder_slug is None
    assert routing.reason == REASON_NO_BOARD


# ------------------------------------------------- the dashboard's department view


@pytest.mark.asyncio
async def test_dashboard_rolls_buckets_up_to_departments(db_session: AsyncSession):
    """One row per department, folded from the bucket board's own numbers.

    Folded server-side rather than in the frontend so the two views cannot
    disagree about the same tickets — and so both sum to `total_open`, which is
    the check a reader will actually do.
    """
    from datetime import datetime, timezone
    from uuid import uuid4 as _uuid4

    from aexy.models.service_desk import ServiceDeskTicket, TicketPendingSegment
    from aexy.models.ticketing import Ticket, TicketForm
    from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

    ws = await _workspace(db_session)
    await _department(db_session, ws, "Engineering", "engineering")
    await _department(db_session, ws, "Operations", "operations")
    # Two internal buckets owned by Engineering, one by Operations, one external.
    await _bucket(db_session, ws, "tech", function_key="engineering")
    await _bucket(db_session, ws, "tech_review", function_key="engineering")
    await _bucket(db_session, ws, "kam", function_key="operations")
    await _bucket(db_session, ws, "partner", semantics="external")
    await _bucket(db_session, ws, "closed", semantics="closed")

    form = TicketForm(
        id=str(_uuid4()), workspace_id=ws.id, name="Support",
        slug=f"f-{_uuid4().hex[:6]}", public_url_token=f"t-{_uuid4().hex[:6]}",
    )
    db_session.add(form)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    for number, bucket in enumerate(["tech", "tech_review", "kam", "partner"], start=1):
        ticket = Ticket(
            id=str(_uuid4()), form_id=form.id, workspace_id=ws.id, ticket_number=number,
            status="in_progress", field_values={"subject": f"t{number}"},
        )
        db_session.add(ticket)
        await db_session.flush()
        db_session.add(
            ServiceDeskTicket(
                id=str(_uuid4()), ticket_id=ticket.id, workspace_id=ws.id,
                request_type="query", pending_with=bucket,
            )
        )
        db_session.add(
            TicketPendingSegment(
                id=str(_uuid4()), workspace_id=ws.id, ticket_id=ticket.id,
                pending_with=bucket, entered_at=now,
            )
        )
    await db_session.commit()

    dashboard = await ServiceDeskTicketService(db_session).get_dashboard(ws.id)
    rows = {
        (r.department_name or r.function_key or "external"): r for r in dashboard.departments
    }

    assert rows["Engineering"].total == 2
    assert sorted(rows["Engineering"].pending_with) == ["tech", "tech_review"]
    assert rows["Operations"].total == 1
    # External kept, not dropped — otherwise this view quietly sums to less than
    # the bucket board for the same tickets.
    assert rows["external"].total == 1
    assert sum(r.total for r in dashboard.departments) == dashboard.total_open
