"""Finishing the task resolves the ticket it came from.

`Ticket.linked_task_id` has been written by the convert-to-task flow since it
existed and was read by nothing. So the engineering finished, the card went to
done, and the ticket stayed open: the requester chased something that had been
fixed days earlier and the desk's open count was wrong.

Resolved, not Closed, on purpose — see
``TicketService.resolve_for_completed_task``.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.notification import Notification, NotificationEventType
from aexy.models.sprint import SprintTask
from aexy.models.team import Team
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse, TicketStatus
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.sprint_task_service import SprintTaskService
from aexy.services.task_config_service import TaskConfigService
from aexy.services.ticket_service import TicketService


class _Fix:
    ws: Workspace
    task: SprintTask
    ticket: Ticket
    owner: Developer
    dev: Developer


async def _fixture(
    db: AsyncSession,
    slug: str,
    *,
    ticket_status: str = TicketStatus.IN_PROGRESS.value,
    link: bool = True,
    submitter: str | None = "requester@partner.example",
) -> _Fix:
    f = _Fix()
    f.owner = Developer(id=str(uuid.uuid4()), name="Ticket Owner", email=f"own-{slug}@x.test")
    f.dev = Developer(id=str(uuid.uuid4()), name="Dev", email=f"dev-{slug}@x.test")
    db.add_all([f.owner, f.dev])
    await db.flush()

    f.ws = Workspace(id=str(uuid.uuid4()), name=f"WS {slug}", slug=slug, owner_id=f.owner.id)
    db.add(f.ws)
    await db.flush()
    for d in (f.owner, f.dev):
        db.add(
            WorkspaceMember(
                id=str(uuid.uuid4()), workspace_id=f.ws.id, developer_id=d.id, role="member"
            )
        )
    team = Team(id=str(uuid.uuid4()), workspace_id=f.ws.id, name="T", slug=f"t-{slug}")
    db.add(team)
    await db.flush()

    config = TaskConfigService(db)
    await config.seed_default_statuses(f.ws.id)

    f.task = SprintTask(
        id=str(uuid.uuid4()), workspace_id=f.ws.id, team_id=team.id, sprint_id=None,
        title="Fix the login redirect", status="in_progress",
        source_type="manual", source_id=f"src-{slug}", priority="medium",
    )
    form = TicketForm(
        id=str(uuid.uuid4()), workspace_id=f.ws.id, name="Support",
        slug=f"form-{slug}", public_url_token=f"tok-{slug}",
    )
    db.add_all([f.task, form])
    await db.flush()

    f.ticket = Ticket(
        id=str(uuid.uuid4()), form_id=form.id, workspace_id=f.ws.id, ticket_number=1,
        status=ticket_status, assignee_id=f.owner.id, submitter_email=submitter,
        field_values={"subject": "Cannot log in"},
        linked_task_id=f.task.id if link else None,
    )
    db.add(f.ticket)
    await db.commit()
    return f


async def _reload(db: AsyncSession, ticket_id: str) -> Ticket:
    return (
        await db.execute(
            select(Ticket).where(Ticket.id == ticket_id).execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _internal_notes(db: AsyncSession, ticket_id: str) -> list[str]:
    rows = (
        await db.execute(
            select(TicketResponse.content).where(
                TicketResponse.ticket_id == ticket_id,
                TicketResponse.is_internal.is_(True),
            )
        )
    ).scalars().all()
    return [r or "" for r in rows]


# ── the behaviour ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_completing_the_task_resolves_the_ticket(db_session: AsyncSession) -> None:
    f = await _fixture(db_session, "trt-basic")

    await SprintTaskService(db_session).update_task_status(
        f.task.id, "done", actor_id=str(f.dev.id)
    )
    await db_session.commit()

    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status == TicketStatus.RESOLVED.value
    # Going through `update_ticket` is what sets this; a hand-rolled column write
    # would have left it null and broken the SLA report.
    assert ticket.resolved_at is not None


@pytest.mark.asyncio
async def test_it_resolves_rather_than_closes(db_session: AsyncSession) -> None:
    """The ticket is a conversation with somebody outside the workspace, and the
    developer who moved the card has not spoken to them."""
    f = await _fixture(db_session, "trt-notclosed")

    await SprintTaskService(db_session).update_task_status(f.task.id, "done")
    await db_session.commit()

    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status != TicketStatus.CLOSED.value
    assert ticket.closed_at is None


@pytest.mark.asyncio
async def test_the_note_names_the_task_that_did_it(db_session: AsyncSession) -> None:
    """Otherwise the ticket shows a status change with no cause."""
    f = await _fixture(db_session, "trt-note")

    await SprintTaskService(db_session).update_task_status(f.task.id, "done")
    await db_session.commit()

    joined = "\n".join(await _internal_notes(db_session, f.ticket.id))
    assert "Fix the login redirect" in joined
    assert "Confirm with the requester" in joined


@pytest.mark.asyncio
async def test_the_owner_is_notified(db_session: AsyncSession) -> None:
    """The person who completed the task is usually not the ticket's owner, and
    has no idea a ticket was waiting on it."""
    f = await _fixture(db_session, "trt-notify")

    await SprintTaskService(db_session).update_task_status(
        f.task.id, "done", actor_id=str(f.dev.id)
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == f.owner.id,
                Notification.event_type == NotificationEventType.TICKET_RESOLVED.value,
            )
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_the_owner_is_notified_even_when_they_completed_it(
    db_session: AsyncSession,
) -> None:
    """`_notify_quietly` drops the actor, which is right for a status nudge and
    wrong here: the owner still has to go and confirm with the requester."""
    f = await _fixture(db_session, "trt-selfnotify")

    await SprintTaskService(db_session).update_task_status(
        f.task.id, "done", actor_id=str(f.owner.id)
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == f.owner.id,
                Notification.event_type == NotificationEventType.TICKET_RESOLVED.value,
            )
        )
    ).scalars().all()
    assert len(rows) == 1


# ── the cases that must not fire ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_moving_to_done_twice_resolves_once(db_session: AsyncSession) -> None:
    """A card gets dragged back and forth. Each pass must not re-resolve,
    re-note or re-notify."""
    f = await _fixture(db_session, "trt-idem")
    svc = SprintTaskService(db_session)

    await svc.update_task_status(f.task.id, "done")
    await db_session.commit()
    await svc.update_task_status(f.task.id, "in_progress")
    await db_session.commit()
    await svc.update_task_status(f.task.id, "done")
    await db_session.commit()

    notes = [n for n in await _internal_notes(db_session, f.ticket.id) if "Resolved automatically" in n]
    assert len(notes) == 1, "the second completion must not write another note"


@pytest.mark.asyncio
async def test_an_already_closed_ticket_is_left_alone(db_session: AsyncSession) -> None:
    """Somebody closed it by hand. Reopening it to Resolved would undo that."""
    f = await _fixture(
        db_session, "trt-closed", ticket_status=TicketStatus.CLOSED.value
    )

    await SprintTaskService(db_session).update_task_status(f.task.id, "done")
    await db_session.commit()

    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status == TicketStatus.CLOSED.value


@pytest.mark.asyncio
async def test_a_task_with_no_ticket_is_unaffected(db_session: AsyncSession) -> None:
    """Most tasks are not from tickets; this must be a cheap no-op."""
    f = await _fixture(db_session, "trt-nolink", link=False)

    updated = await SprintTaskService(db_session).update_task_status(f.task.id, "done")
    await db_session.commit()

    assert updated is not None and updated.status == "done"
    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status == TicketStatus.IN_PROGRESS.value


@pytest.mark.asyncio
async def test_a_non_done_move_does_not_resolve(db_session: AsyncSession) -> None:
    f = await _fixture(db_session, "trt-review")

    await SprintTaskService(db_session).update_task_status(f.task.id, "in_review")
    await db_session.commit()

    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status == TicketStatus.IN_PROGRESS.value


@pytest.mark.asyncio
async def test_the_generic_update_path_resolves_too(db_session: AsyncSession) -> None:
    """A card can be completed from `update_task` as well. A ticket that closes
    only via one of the two write paths looks random to whoever hits the other."""
    f = await _fixture(db_session, "trt-updatepath")

    await SprintTaskService(db_session).update_task(task_id=f.task.id, status="done")
    await db_session.commit()

    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status == TicketStatus.RESOLVED.value


@pytest.mark.asyncio
async def test_resolving_survives_a_ticket_with_no_requester_email(
    db_session: AsyncSession,
) -> None:
    """A phone-logged ticket has nobody to email. That must not stop the resolve."""
    f = await _fixture(db_session, "trt-noemail", submitter=None)

    await SprintTaskService(db_session).update_task_status(f.task.id, "done")
    await db_session.commit()

    ticket = await _reload(db_session, f.ticket.id)
    assert ticket.status == TicketStatus.RESOLVED.value


@pytest.mark.asyncio
async def test_calling_the_resolver_directly_is_idempotent(
    db_session: AsyncSession,
) -> None:
    f = await _fixture(db_session, "trt-direct")
    svc = TicketService(db_session)

    first = await svc.resolve_for_completed_task(f.task.id, "Fix the login redirect")
    await db_session.commit()
    second = await svc.resolve_for_completed_task(f.task.id, "Fix the login redirect")
    await db_session.commit()

    assert first is not None and second is not None
    assert second.status == TicketStatus.RESOLVED.value
    notes = [n for n in await _internal_notes(db_session, f.ticket.id) if "Resolved automatically" in n]
    assert len(notes) == 1
