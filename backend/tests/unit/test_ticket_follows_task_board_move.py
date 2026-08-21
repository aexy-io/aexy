"""A ticket follows its task when the task moves to another board.

Converting a ticket to a task is not the only time a board changes: moving the
card onto the Tech board is how work actually gets handed to Tech, and the ticket
sitting in the old bucket afterwards is the same complaint in a new place.

There is a correctness problem underneath the feature. ``move_to_project`` is a
*fork*: the clone lands on the target board and the source is archived or marked
done. So a ticket raised from the source was left pointing at a dead task — and
because ``convert_to_task`` refuses a ticket that already has one, that ticket
could not be converted again either. Re-pointing the link is the half of this
that is a bug fix rather than a feature.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department
from aexy.models.project import Project
from aexy.models.service_desk import (
    ServiceDeskStakeholder,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.sprint import SprintTask
from aexy.models.team import Team
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse, TicketStatus
from aexy.models.workspace import Workspace
from aexy.services.sprint_task_service import SprintTaskService
from aexy.services.task_config_service import TaskConfigService


async def _board(
    db: AsyncSession, ws: Workspace, name: str, *, department_id: str | None = None
) -> Project:
    slug = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}"
    project = Project(id=str(uuid.uuid4()), workspace_id=ws.id, name=name, slug=slug)
    db.add(project)
    # `SprintTask.team_id` holds the project id and FKs to teams.id, so the two
    # rows deliberately share one id — see `ProjectService.create_project`.
    db.add(
        Team(
            id=project.id,
            workspace_id=ws.id,
            name=name,
            slug=slug,
            department_id=department_id,
        )
    )
    await db.flush()
    return project


async def _fixture(db: AsyncSession, *, target_has_bucket: bool = True):
    dev = Developer(id=str(uuid.uuid4()), name="Dev", email=f"d-{uuid.uuid4().hex[:6]}@x.test")
    db.add(dev)
    await db.flush()
    ws = Workspace(
        id=str(uuid.uuid4()), name="WS", slug=f"ws-{uuid.uuid4().hex[:6]}", owner_id=dev.id
    )
    db.add(ws)
    await db.flush()
    await TaskConfigService(db).seed_default_statuses(ws.id)

    ops = Department(
        id=str(uuid.uuid4()), workspace_id=ws.id, name="Operations", slug="operations",
        function_key="operations",
    )
    eng = Department(
        id=str(uuid.uuid4()), workspace_id=ws.id, name="Engineering", slug="engineering",
        function_key="engineering",
    )
    db.add_all([ops, eng])
    db.add(
        ServiceDeskStakeholder(
            id=str(uuid.uuid4()), workspace_id=ws.id, slug="kam", label="KAM",
            semantics="internal", function_key="operations", position=0,
        )
    )
    if target_has_bucket:
        db.add(
            ServiceDeskStakeholder(
                id=str(uuid.uuid4()), workspace_id=ws.id, slug="tech", label="Tech",
                semantics="internal", function_key="engineering", position=1,
            )
        )
    await db.flush()

    ops_board = await _board(db, ws, "Ops Board", department_id=ops.id)
    tech_board = await _board(db, ws, "Tech Board", department_id=eng.id)

    task = SprintTask(
        id=str(uuid.uuid4()), workspace_id=ws.id, team_id=ops_board.id, sprint_id=None,
        title="Fix the login redirect", status="todo", source_type="ticket",
        source_id=str(uuid.uuid4()), priority="medium", labels=[],
    )
    form = TicketForm(
        id=str(uuid.uuid4()), workspace_id=ws.id, name="Support",
        slug=f"f-{uuid.uuid4().hex[:6]}", public_url_token=f"t-{uuid.uuid4().hex[:6]}",
    )
    db.add_all([task, form])
    await db.flush()

    ticket = Ticket(
        id=str(uuid.uuid4()), form_id=form.id, workspace_id=ws.id, ticket_number=1,
        status=TicketStatus.IN_PROGRESS.value, field_values={"subject": "Cannot log in"},
        linked_task_id=task.id,
    )
    db.add(ticket)
    await db.flush()
    db.add(
        ServiceDeskTicket(
            id=str(uuid.uuid4()), ticket_id=ticket.id, workspace_id=ws.id,
            request_type="query", pending_with="kam",
        )
    )
    db.add(
        TicketPendingSegment(
            id=str(uuid.uuid4()), workspace_id=ws.id, ticket_id=ticket.id, pending_with="kam",
        )
    )
    await db.commit()
    return ws, ticket, task, tech_board, dev


async def _reload_ticket(db: AsyncSession, ticket_id: str) -> Ticket:
    return (
        await db.execute(
            select(Ticket).where(Ticket.id == ticket_id).execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _pending_with(db: AsyncSession, ticket_id: str) -> str:
    return (
        await db.execute(
            select(ServiceDeskTicket.pending_with)
            .where(ServiceDeskTicket.ticket_id == ticket_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _notes(db: AsyncSession, ticket_id: str) -> list[str]:
    rows = (
        await db.execute(
            select(TicketResponse.content).where(
                TicketResponse.ticket_id == ticket_id,
                TicketResponse.is_internal.is_(True),
            )
        )
    ).scalars().all()
    return [r or "" for r in rows]


@pytest.mark.asyncio
async def test_the_ticket_is_handed_to_the_new_boards_department(db_session: AsyncSession):
    ws, ticket, task, tech_board, dev = await _fixture(db_session)

    new_task = await SprintTaskService(db_session).move_to_project(
        task_id=str(task.id),
        target_project_id=str(tech_board.id),
        source_action="archive",
        actor_id=str(dev.id),
    )
    await db_session.commit()

    assert await _pending_with(db_session, str(ticket.id)) == "tech"
    # And the log says which board did it, so this is not mistaken for somebody
    # moving the ticket by hand.
    moved = [n for n in await _notes(db_session, str(ticket.id)) if "Pending With changed" in n]
    assert moved and "Tech Board" in moved[0], moved
    assert str(new_task.id) != str(task.id)


@pytest.mark.asyncio
async def test_the_link_follows_the_fork(db_session: AsyncSession):
    """The bug underneath: the source task is archived by the move.

    Left pointing at it, the ticket referenced a dead task and could never be
    converted again, because conversion refuses a ticket that already has one.
    """
    ws, ticket, task, tech_board, dev = await _fixture(db_session)

    new_task = await SprintTaskService(db_session).move_to_project(
        task_id=str(task.id),
        target_project_id=str(tech_board.id),
        source_action="archive",
        actor_id=str(dev.id),
    )
    await db_session.commit()

    assert (await _reload_ticket(db_session, str(ticket.id))).linked_task_id == str(new_task.id)


@pytest.mark.asyncio
async def test_the_clock_restarts_against_the_new_queue(db_session: AsyncSession):
    """A hand-off, so the old stage closes and a new one opens.

    Unlike resolution, this is not terminal — somebody still owes the action, and
    the time they take has to be attributed to them rather than to whoever held
    the ticket before.
    """
    ws, ticket, task, tech_board, dev = await _fixture(db_session)

    await SprintTaskService(db_session).move_to_project(
        task_id=str(task.id),
        target_project_id=str(tech_board.id),
        source_action="archive",
        actor_id=str(dev.id),
    )
    await db_session.commit()

    segments = (
        await db_session.execute(
            select(TicketPendingSegment)
            .where(TicketPendingSegment.ticket_id == ticket.id)
            .order_by(TicketPendingSegment.entered_at)
        )
    ).scalars().all()
    assert [s.pending_with for s in segments] == ["kam", "tech"]
    assert segments[0].exited_at is not None
    assert segments[1].exited_at is None


@pytest.mark.asyncio
async def test_a_target_board_with_no_bucket_says_so_and_leaves_it(db_session: AsyncSession):
    """The state before anyone adds a Tech bucket.

    The move still happens and the link still follows — only the hand-off is
    skipped, with the reason written where the person asking will see it.
    """
    ws, ticket, task, tech_board, dev = await _fixture(db_session, target_has_bucket=False)

    new_task = await SprintTaskService(db_session).move_to_project(
        task_id=str(task.id),
        target_project_id=str(tech_board.id),
        source_action="archive",
        actor_id=str(dev.id),
    )
    await db_session.commit()

    assert await _pending_with(db_session, str(ticket.id)) == "kam"
    assert (await _reload_ticket(db_session, str(ticket.id))).linked_task_id == str(new_task.id)
    explained = [n for n in await _notes(db_session, str(ticket.id)) if "Engineering" in n]
    assert explained, await _notes(db_session, str(ticket.id))


@pytest.mark.asyncio
async def test_a_task_with_no_ticket_moves_silently(db_session: AsyncSession):
    """The overwhelmingly common case must not grow a ticket note."""
    ws, ticket, task, tech_board, dev = await _fixture(db_session)
    unlinked = await _reload_ticket(db_session, str(ticket.id))
    unlinked.linked_task_id = None
    await db_session.commit()

    await SprintTaskService(db_session).move_to_project(
        task_id=str(task.id),
        target_project_id=str(tech_board.id),
        source_action="archive",
        actor_id=str(dev.id),
    )
    await db_session.commit()

    assert await _pending_with(db_session, str(ticket.id)) == "kam"
    assert not [n for n in await _notes(db_session, str(ticket.id)) if "Pending With" in n]
