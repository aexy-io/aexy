"""Progress updates on tasks and tickets.

Covers the contract the UI depends on (newest first, edit is author-only,
delete is author-or-admin) and the two things that would be silent bugs: an
update written against another workspace's task, and updates left behind by a
hard-deleted ticket.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.entity_activity import EntityActivity
from aexy.models.sprint import SprintTask
from aexy.models.team import Team
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.work_update import WORK_UPDATE_ENTITY_TYPES, WorkUpdate
from aexy.models.workspace import Workspace
from aexy.services.work_update_service import MAX_BODY_CHARS, WorkUpdateService


# ── fixtures ─────────────────────────────────────────────────────────────


async def _make_developer(db: AsyncSession, tag: str) -> Developer:
    dev = Developer(name=f"Dev {tag}", email=f"{tag}@example.test")
    db.add(dev)
    await db.flush()
    return dev


async def _make_workspace(db: AsyncSession, slug: str, owner: Developer) -> Workspace:
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    return ws


async def _make_task(db: AsyncSession, ws: Workspace, tag: str) -> SprintTask:
    # SprintTask.team_id is a FK to teams.id; Postgres enforces it.
    team = Team(id=str(uuid.uuid4()), workspace_id=ws.id, name=f"T {tag}", slug=f"t-{tag}")
    db.add(team)
    await db.flush()
    task = SprintTask(
        id=str(uuid.uuid4()),
        workspace_id=ws.id,
        team_id=team.id,
        sprint_id=None,
        title=f"task {tag}",
        status="todo",
        source_type="manual",
        source_id=f"src-{tag}",
        priority="medium",
    )
    db.add(task)
    await db.flush()
    return task


async def _make_ticket(db: AsyncSession, ws: Workspace, tag: str, number: int = 1) -> Ticket:
    form = TicketForm(
        id=str(uuid.uuid4()),
        workspace_id=ws.id,
        name=f"Form {tag}",
        slug=f"form-{tag}",
        public_url_token=f"tok-{tag}",
    )
    db.add(form)
    await db.flush()
    ticket = Ticket(
        id=str(uuid.uuid4()),
        form_id=form.id,
        workspace_id=ws.id,
        ticket_number=number,
        status="new",
    )
    db.add(ticket)
    await db.flush()
    return ticket


# ── reads and writes ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_updates_come_back_newest_first(db_session: AsyncSession) -> None:
    """The list is a status board, not a transcript — the current state of the
    work has to be the first thing read."""
    dev = await _make_developer(db_session, "wu-order")
    ws = await _make_workspace(db_session, "wu-order", dev)
    task = await _make_task(db_session, ws, "order")
    service = WorkUpdateService(db_session)

    for body in ("first thing", "second thing", "third thing"):
        await service.create_update(
            workspace_id=str(ws.id),
            entity_type="task",
            entity_id=str(task.id),
            author_id=str(dev.id),
            body=body,
        )

    updates = await service.list_updates(str(ws.id), "task", str(task.id))
    assert [u.body for u in updates] == ["third thing", "second thing", "first thing"]


@pytest.mark.asyncio
async def test_posting_an_update_shows_in_the_activity_log(
    db_session: AsyncSession,
) -> None:
    """The update stream is a separate table, so without this mirror an update
    would be invisible to the History tab and the workspace feed — the feature
    would look like nothing happened."""
    dev = await _make_developer(db_session, "wu-log")
    ws = await _make_workspace(db_session, "wu-log", dev)
    ticket = await _make_ticket(db_session, ws, "log")

    await WorkUpdateService(db_session).create_update(
        workspace_id=str(ws.id),
        entity_type="ticket",
        entity_id=str(ticket.id),
        author_id=str(dev.id),
        body="chased the vendor",
    )

    logged = (
        await db_session.execute(
            select(EntityActivity).where(
                EntityActivity.entity_type == "ticket",
                EntityActivity.entity_id == str(ticket.id),
                EntityActivity.activity_type == "progress_updated",
            )
        )
    ).scalars().all()
    assert len(logged) == 1
    # The body is deliberately NOT copied: the update is editable and the log
    # is not, so a copy would leave the feed quoting a stale version.
    assert logged[0].content is None
    assert logged[0].actor_id == str(dev.id)


@pytest.mark.asyncio
async def test_cannot_post_against_another_workspaces_task(
    db_session: AsyncSession,
) -> None:
    """workspace_id comes from the URL and entity_id from the body. Without the
    pair being verified, a member of A could hang updates off B's task and read
    them back, since the list path filters on the same unverified pair."""
    dev = await _make_developer(db_session, "wu-cross")
    ws_a = await _make_workspace(db_session, "wu-cross-a", dev)
    ws_b = await _make_workspace(db_session, "wu-cross-b", dev)
    task_in_b = await _make_task(db_session, ws_b, "cross")

    with pytest.raises(HTTPException) as exc:
        await WorkUpdateService(db_session).create_update(
            workspace_id=str(ws_a.id),
            entity_type="task",
            entity_id=str(task_in_b.id),
            author_id=str(dev.id),
            body="should not land",
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_unknown_entity_type_is_rejected(db_session: AsyncSession) -> None:
    dev = await _make_developer(db_session, "wu-type")
    ws = await _make_workspace(db_session, "wu-type", dev)

    with pytest.raises(HTTPException) as exc:
        await WorkUpdateService(db_session).create_update(
            workspace_id=str(ws.id),
            entity_type="epic",
            entity_id=str(uuid.uuid4()),
            author_id=str(dev.id),
            body="nope",
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_blank_and_oversized_bodies_are_rejected(
    db_session: AsyncSession,
) -> None:
    dev = await _make_developer(db_session, "wu-body")
    ws = await _make_workspace(db_session, "wu-body", dev)
    task = await _make_task(db_session, ws, "body")
    service = WorkUpdateService(db_session)

    for bad in ("", "   ", "\n\t "):
        with pytest.raises(HTTPException) as exc:
            await service.create_update(
                workspace_id=str(ws.id),
                entity_type="task",
                entity_id=str(task.id),
                author_id=str(dev.id),
                body=bad,
            )
        assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        await service.create_update(
            workspace_id=str(ws.id),
            entity_type="task",
            entity_id=str(task.id),
            author_id=str(dev.id),
            body="x" * (MAX_BODY_CHARS + 1),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_body_is_stored_trimmed(db_session: AsyncSession) -> None:
    dev = await _make_developer(db_session, "wu-trim")
    ws = await _make_workspace(db_session, "wu-trim", dev)
    task = await _make_task(db_session, ws, "trim")

    update = await WorkUpdateService(db_session).create_update(
        workspace_id=str(ws.id),
        entity_type="task",
        entity_id=str(task.id),
        author_id=str(dev.id),
        body="  waiting on review  ",
    )
    assert update.body == "waiting on review"


# ── edit / delete authority ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_only_the_author_can_edit(db_session: AsyncSession) -> None:
    """An update is a statement attributed to a person. Letting someone else
    rewrite it under that name is worse than a wrong update standing."""
    author = await _make_developer(db_session, "wu-author")
    other = await _make_developer(db_session, "wu-other")
    ws = await _make_workspace(db_session, "wu-edit", author)
    task = await _make_task(db_session, ws, "edit")
    service = WorkUpdateService(db_session)

    update = await service.create_update(
        workspace_id=str(ws.id),
        entity_type="task",
        entity_id=str(task.id),
        author_id=str(author.id),
        body="original",
    )
    assert update.edited_at is None

    with pytest.raises(HTTPException) as exc:
        await service.edit_update(str(ws.id), str(update.id), str(other.id), "hijacked")
    assert exc.value.status_code == 403

    edited = await service.edit_update(
        str(ws.id), str(update.id), str(author.id), "corrected"
    )
    assert edited.body == "corrected"
    # Drives the "edited" marker in the UI.
    assert edited.edited_at is not None


@pytest.mark.asyncio
async def test_delete_allows_author_or_admin_only(db_session: AsyncSession) -> None:
    author = await _make_developer(db_session, "wu-del-author")
    other = await _make_developer(db_session, "wu-del-other")
    ws = await _make_workspace(db_session, "wu-del", author)
    task = await _make_task(db_session, ws, "del")
    service = WorkUpdateService(db_session)

    async def post(body: str) -> WorkUpdate:
        return await service.create_update(
            workspace_id=str(ws.id),
            entity_type="task",
            entity_id=str(task.id),
            author_id=str(author.id),
            body=body,
        )

    a = await post("one")
    with pytest.raises(HTTPException) as exc:
        await service.delete_update(str(ws.id), str(a.id), str(other.id))
    assert exc.value.status_code == 403

    # ...but an admin clearing something up may.
    await service.delete_update(
        str(ws.id), str(a.id), str(other.id), requester_is_admin=True
    )

    b = await post("two")
    await service.delete_update(str(ws.id), str(b.id), str(author.id))

    assert await service.list_updates(str(ws.id), "task", str(task.id)) == []


@pytest.mark.asyncio
async def test_editing_an_update_in_another_workspace_is_not_found(
    db_session: AsyncSession,
) -> None:
    """`update_id` is unguessable but not secret; the workspace filter is what
    stops a leaked id being editable from another tenant."""
    dev = await _make_developer(db_session, "wu-scope")
    ws_a = await _make_workspace(db_session, "wu-scope-a", dev)
    ws_b = await _make_workspace(db_session, "wu-scope-b", dev)
    task = await _make_task(db_session, ws_a, "scope")
    service = WorkUpdateService(db_session)

    update = await service.create_update(
        workspace_id=str(ws_a.id),
        entity_type="task",
        entity_id=str(task.id),
        author_id=str(dev.id),
        body="in A",
    )

    with pytest.raises(HTTPException) as exc:
        await service.edit_update(str(ws_b.id), str(update.id), str(dev.id), "from B")
    assert exc.value.status_code == 404


# ── bulk read for the board ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_latest_by_entity_picks_the_newest_per_task(
    db_session: AsyncSession,
) -> None:
    """Backs the "last update 3d ago" badge. One query for a whole board, so
    the fold has to pick the right row per entity."""
    dev = await _make_developer(db_session, "wu-latest")
    ws = await _make_workspace(db_session, "wu-latest", dev)
    task_a = await _make_task(db_session, ws, "latest-a")
    task_b = await _make_task(db_session, ws, "latest-b")
    quiet = await _make_task(db_session, ws, "latest-quiet")
    service = WorkUpdateService(db_session)

    for entity, bodies in ((task_a, ("a-old", "a-new")), (task_b, ("b-only",))):
        for body in bodies:
            await service.create_update(
                workspace_id=str(ws.id),
                entity_type="task",
                entity_id=str(entity.id),
                author_id=str(dev.id),
                body=body,
            )

    latest = await service.latest_by_entity(
        str(ws.id), "task", [str(task_a.id), str(task_b.id), str(quiet.id)]
    )
    assert latest[str(task_a.id)].body == "a-new"
    assert latest[str(task_b.id)].body == "b-only"
    # A task nobody has written about is absent, not an error — the card just
    # renders no badge.
    assert str(quiet.id) not in latest


@pytest.mark.asyncio
async def test_latest_by_entity_is_empty_for_no_ids(db_session: AsyncSession) -> None:
    dev = await _make_developer(db_session, "wu-noids")
    ws = await _make_workspace(db_session, "wu-noids", dev)
    assert await WorkUpdateService(db_session).latest_by_entity(str(ws.id), "task", []) == {}


# ── orphan cleanup ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hard_deleting_a_ticket_takes_its_updates(
    db_session: AsyncSession,
) -> None:
    """There is no FK to cascade from — the target lives in one of two tables —
    so without the explicit sweep these rows would outlive the ticket and
    attach themselves to whatever next held that id."""
    dev = await _make_developer(db_session, "wu-orphan")
    ws = await _make_workspace(db_session, "wu-orphan", dev)
    ticket = await _make_ticket(db_session, ws, "orphan")
    service = WorkUpdateService(db_session)

    await service.create_update(
        workspace_id=str(ws.id),
        entity_type="ticket",
        entity_id=str(ticket.id),
        author_id=str(dev.id),
        body="mid-investigation",
    )

    removed = await service.delete_for_entity(str(ws.id), "ticket", str(ticket.id))
    assert removed == 1

    left = (
        await db_session.execute(
            select(WorkUpdate).where(WorkUpdate.entity_id == str(ticket.id))
        )
    ).scalars().all()
    assert left == []


# ── invariants ───────────────────────────────────────────────────────────


def test_every_supported_entity_type_has_an_app_gate() -> None:
    """The router has no router-level app guard — it spans two apps, so the gate
    is chosen per request from entity_type. An entity type with no entry would
    raise instead of silently skipping the gate, but catching it here means the
    person adding the type finds out at test time."""
    from aexy.api.work_updates import _ENTITY_TYPE_TO_APP

    assert set(_ENTITY_TYPE_TO_APP) == set(WORK_UPDATE_ENTITY_TYPES)


def test_gated_apps_exist_in_the_catalog() -> None:
    from aexy.api.work_updates import _ENTITY_TYPE_TO_APP
    from aexy.models.app_definitions import APP_CATALOG

    unknown = {app for app in _ENTITY_TYPE_TO_APP.values() if app not in APP_CATALOG}
    assert unknown == set(), f"gate references unknown apps: {unknown}"


def test_schema_literal_matches_the_model() -> None:
    """`WorkUpdateEntityType` is what the route accepts; `WORK_UPDATE_ENTITY_TYPES`
    is what the service validates. Drift means a 422 from the route for a type
    the service supports, or vice versa."""
    from typing import get_args

    from aexy.schemas.work_update import WorkUpdateEntityType

    assert set(get_args(WorkUpdateEntityType)) == set(WORK_UPDATE_ENTITY_TYPES)
