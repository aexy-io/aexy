"""Where a ticket sits once its task is finished.

Completing the linked task already moved the ticket to Resolved. It did not touch
``pending_with``, so the ticket stayed in the queue of whoever the work had been
pending with — still on their board, still with the breach clock running against
them, after the work was done.

The awkward part, and the reason this has its own path rather than reusing
``change_pending_with``: that method couples the terminal bucket to
``status = CLOSED`` and sends the closure email. Both are correct when a person
closes a ticket. Neither is correct here — a developer dragging a card has not
spoken to the requester, which is why this path resolves rather than closes.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskStakeholder,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.sprint import SprintTask
from aexy.models.team import Team
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse, TicketStatus
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.ticket_service import TicketService


async def _fixture(db: AsyncSession, slug: str, *, terminal: bool = True):
    owner = Developer(id=str(uuid.uuid4()), name="Owner", email=f"own-{slug}@x.test")
    db.add(owner)
    await db.flush()

    ws = Workspace(id=str(uuid.uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            id=str(uuid.uuid4()), workspace_id=ws.id, developer_id=owner.id, role="member"
        )
    )

    db.add(
        ServiceDeskStakeholder(
            id=str(uuid.uuid4()), workspace_id=ws.id, slug="tech", label="Tech",
            semantics="internal", function_key="engineering", position=0,
        )
    )
    if terminal:
        db.add(
            ServiceDeskStakeholder(
                id=str(uuid.uuid4()), workspace_id=ws.id, slug="closed", label="Closed",
                semantics="closed", position=9,
            )
        )

    team = Team(id=str(uuid.uuid4()), workspace_id=ws.id, name="Tech Board", slug=f"t-{slug}")
    form = TicketForm(
        id=str(uuid.uuid4()), workspace_id=ws.id, name="Support",
        slug=f"form-{slug}", public_url_token=f"tok-{slug}",
    )
    db.add_all([team, form])
    await db.flush()

    task = SprintTask(
        id=str(uuid.uuid4()), workspace_id=ws.id, team_id=team.id, sprint_id=None,
        title="Fix the login redirect", status="in_progress",
        source_type="ticket", source_id=f"src-{slug}", priority="medium",
    )
    db.add(task)
    await db.flush()

    ticket = Ticket(
        id=str(uuid.uuid4()), form_id=form.id, workspace_id=ws.id, ticket_number=1,
        status=TicketStatus.IN_PROGRESS.value, assignee_id=owner.id,
        submitter_email="requester@partner.example",
        field_values={"subject": "Cannot log in"},
        linked_task_id=task.id,
    )
    db.add(ticket)
    await db.flush()

    db.add(
        ServiceDeskTicket(
            id=str(uuid.uuid4()), ticket_id=ticket.id, workspace_id=ws.id,
            request_type="query", pending_with="tech",
        )
    )
    # The open stage the clock is currently running against.
    db.add(
        TicketPendingSegment(
            id=str(uuid.uuid4()), workspace_id=ws.id, ticket_id=ticket.id,
            pending_with="tech",
        )
    )
    await db.commit()
    return ws, ticket, task


async def _sd(db: AsyncSession, ticket_id: str) -> ServiceDeskTicket:
    return (
        await db.execute(
            select(ServiceDeskTicket)
            .where(ServiceDeskTicket.ticket_id == ticket_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_resolving_parks_the_ticket_in_the_terminal_bucket(db_session: AsyncSession):
    ws, ticket, task = await _fixture(db_session, f"park-{uuid.uuid4().hex[:6]}")

    await TicketService(db_session).resolve_for_completed_task(
        task_id=str(task.id), task_title=task.title
    )

    assert (await _sd(db_session, str(ticket.id))).pending_with == "closed"


@pytest.mark.asyncio
async def test_the_status_stays_resolved_not_closed(db_session: AsyncSession):
    """The one place two decisions pull against each other.

    Moving to the terminal bucket through the normal hand-off would also flip the
    status to Closed, because that is what a person closing a ticket means. Here
    the bucket is being used only to stop the clock.
    """
    ws, ticket, task = await _fixture(db_session, f"resolved-{uuid.uuid4().hex[:6]}")

    await TicketService(db_session).resolve_for_completed_task(
        task_id=str(task.id), task_title=task.title
    )

    reloaded = (
        await db_session.execute(
            select(Ticket).where(Ticket.id == ticket.id).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert reloaded.status == TicketStatus.RESOLVED.value
    assert reloaded.closed_at is None


@pytest.mark.asyncio
async def test_the_open_stage_is_closed_and_no_new_one_opened(db_session: AsyncSession):
    """The terminal bucket has no clock — that is what makes it terminal.

    Leaving the stage open would keep counting time against Tech forever, and
    opening a fresh one in the terminal bucket would start a stage that can never
    end.
    """
    ws, ticket, task = await _fixture(db_session, f"clock-{uuid.uuid4().hex[:6]}")

    await TicketService(db_session).resolve_for_completed_task(
        task_id=str(task.id), task_title=task.title
    )

    segments = (
        await db_session.execute(
            select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert len(segments) == 1
    assert segments[0].pending_with == "tech"
    assert segments[0].exited_at is not None
    assert segments[0].duration_seconds is not None


@pytest.mark.asyncio
async def test_the_move_is_written_into_the_ticket(db_session: AsyncSession):
    """Named in the ticket, not only the server log.

    Whoever wonders next week why this left their queue is reading the ticket.
    """
    ws, ticket, task = await _fixture(db_session, f"note-{uuid.uuid4().hex[:6]}")

    await TicketService(db_session).resolve_for_completed_task(
        task_id=str(task.id), task_title=task.title
    )

    notes = (
        await db_session.execute(
            select(TicketResponse.content).where(
                TicketResponse.ticket_id == ticket.id,
                TicketResponse.is_internal.is_(True),
            )
        )
    ).scalars().all()
    moved = [n for n in notes if n and "Pending With changed" in n]
    assert moved, notes
    # Labels, not slugs — this is read by people.
    assert "Tech" in moved[0] and "Closed" in moved[0]
    assert "Fix the login redirect" in moved[0]


@pytest.mark.asyncio
async def test_a_workspace_with_no_terminal_bucket_is_left_alone(db_session: AsyncSession):
    """Better to leave the ticket where it is than invent a bucket.

    A desk that has never been set up has no terminal bucket, and resolving must
    still work — the status change is the part that matters.
    """
    ws, ticket, task = await _fixture(
        db_session, f"noterm-{uuid.uuid4().hex[:6]}", terminal=False
    )

    await TicketService(db_session).resolve_for_completed_task(
        task_id=str(task.id), task_title=task.title
    )

    assert (await _sd(db_session, str(ticket.id))).pending_with == "tech"
    reloaded = (
        await db_session.execute(
            select(Ticket).where(Ticket.id == ticket.id).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert reloaded.status == TicketStatus.RESOLVED.value


@pytest.mark.asyncio
async def test_resolving_twice_moves_once(db_session: AsyncSession):
    ws, ticket, task = await _fixture(db_session, f"twice-{uuid.uuid4().hex[:6]}")
    service = TicketService(db_session)

    await service.resolve_for_completed_task(task_id=str(task.id), task_title=task.title)
    await service.resolve_for_completed_task(task_id=str(task.id), task_title=task.title)

    segments = (
        await db_session.execute(
            select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert len(segments) == 1
    notes = (
        await db_session.execute(
            select(TicketResponse.content).where(
                TicketResponse.ticket_id == ticket.id,
                TicketResponse.is_internal.is_(True),
            )
        )
    ).scalars().all()
    assert len([n for n in notes if n and "Pending With changed" in n]) == 1
