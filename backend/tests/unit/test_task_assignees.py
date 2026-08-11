"""Multiple assignees on a task.

`SprintTask.assignee_id` stays the primary and the single source of truth for
everything that must resolve to one developer; `task_assignees` holds everyone.
The whole design rests on those two never disagreeing, so most of this file
pins that mirror — especially on the legacy single-assignee paths, which must go
on behaving exactly as they did before collaborators existed.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask, TaskActivity, TaskAssignee
from aexy.models.team import Team
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.sprint_task_service import SprintTaskService, TaskValidationError


async def _make_developer(db: AsyncSession, tag: str, ws: Workspace | None = None) -> Developer:
    dev = Developer(name=f"Dev {tag}", email=f"{tag}@example.test")
    db.add(dev)
    await db.flush()
    if ws is not None:
        # Assignees must be members of the task's workspace, so fixtures have to
        # create the membership too or every assignment 400s.
        db.add(
            WorkspaceMember(
                id=str(uuid.uuid4()),
                workspace_id=ws.id,
                developer_id=dev.id,
                role="member",
            )
        )
        await db.flush()
    return dev


async def _make_workspace(db: AsyncSession, slug: str, owner: Developer) -> Workspace:
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    return ws


async def _make_task(db: AsyncSession, ws: Workspace, tag: str, assignee_id: str | None = None) -> SprintTask:
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
        assignee_id=assignee_id,
    )
    db.add(task)
    await db.flush()
    return task


async def _rows(db: AsyncSession, task_id: str) -> list[TaskAssignee]:
    result = await db.execute(
        select(TaskAssignee)
        .where(TaskAssignee.task_id == task_id)
        .order_by(TaskAssignee.created_at)
    )
    return list(result.scalars().all())


# ── the mirror ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_assignees_mirrors_primary_to_the_column(
    db_session: AsyncSession,
) -> None:
    owner = await _make_developer(db_session, "ta-owner")
    ws = await _make_workspace(db_session, "ta-mirror", owner)
    a = await _make_developer(db_session, "ta-a", ws)
    b = await _make_developer(db_session, "ta-b", ws)
    c = await _make_developer(db_session, "ta-c", ws)
    task = await _make_task(db_session, ws, "mirror")
    service = SprintTaskService(db_session)

    updated = await service.set_assignees(
        str(task.id), [str(a.id), str(b.id), str(c.id)], primary_id=str(b.id)
    )
    assert updated is not None
    # Everything that needs exactly one developer reads this column.
    assert str(updated.assignee_id) == str(b.id)

    rows = await _rows(db_session, str(task.id))
    assert {str(r.developer_id) for r in rows} == {str(a.id), str(b.id), str(c.id)}
    assert [str(r.developer_id) for r in rows if r.is_primary] == [str(b.id)]


@pytest.mark.asyncio
async def test_no_primary_means_all_equal_and_a_null_column(
    db_session: AsyncSession,
) -> None:
    """The "everyone equally on this" arrangement the tech team asked for.

    `assignee_id` is genuinely null — nobody is individually accountable — while
    the assignee list still names all three.
    """
    owner = await _make_developer(db_session, "ta-eq-owner")
    ws = await _make_workspace(db_session, "ta-equal", owner)
    a = await _make_developer(db_session, "ta-eq-a", ws)
    b = await _make_developer(db_session, "ta-eq-b", ws)
    task = await _make_task(db_session, ws, "equal")
    service = SprintTaskService(db_session)

    updated = await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=None
    )
    assert updated is not None
    assert updated.assignee_id is None
    rows = await _rows(db_session, str(task.id))
    assert len(rows) == 2
    assert not any(r.is_primary for r in rows)


@pytest.mark.asyncio
async def test_at_most_one_primary_survives_repeated_changes(
    db_session: AsyncSession,
) -> None:
    """Two primaries would make the mirror depend on row order, so which name
    ended up in `assignee_id` would vary between reads."""
    owner = await _make_developer(db_session, "ta-one-owner")
    ws = await _make_workspace(db_session, "ta-one", owner)
    a = await _make_developer(db_session, "ta-one-a", ws)
    b = await _make_developer(db_session, "ta-one-b", ws)
    task = await _make_task(db_session, ws, "one")
    service = SprintTaskService(db_session)

    await service.set_assignees(str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id))
    await service.set_primary_assignee(str(task.id), str(b.id))
    await service.set_primary_assignee(str(task.id), str(a.id))

    rows = await _rows(db_session, str(task.id))
    assert sum(1 for r in rows if r.is_primary) == 1
    task_now = await service.get_task(str(task.id))
    assert str(task_now.assignee_id) == str(a.id)


@pytest.mark.asyncio
async def test_primary_must_be_one_of_the_assignees(db_session: AsyncSession) -> None:
    owner = await _make_developer(db_session, "ta-bad-owner")
    ws = await _make_workspace(db_session, "ta-bad", owner)
    a = await _make_developer(db_session, "ta-bad-a", ws)
    outsider = await _make_developer(db_session, "ta-bad-b", ws)
    task = await _make_task(db_session, ws, "bad")

    with pytest.raises(TaskValidationError) as exc:
        await SprintTaskService(db_session).set_assignees(
            str(task.id), [str(a.id)], primary_id=str(outsider.id)
        )
    assert exc.value.code == "primary_not_assigned"


@pytest.mark.asyncio
async def test_assignees_must_be_workspace_members(db_session: AsyncSession) -> None:
    """Otherwise an id from any workspace can be dropped onto a task: the person
    shows in the list, gets notified and counts toward that team's workload,
    while having no access to the task itself."""
    owner = await _make_developer(db_session, "ta-mem-owner")
    ws = await _make_workspace(db_session, "ta-member", owner)
    insider = await _make_developer(db_session, "ta-mem-in", ws)
    stranger = await _make_developer(db_session, "ta-mem-out")  # no membership
    task = await _make_task(db_session, ws, "member")

    with pytest.raises(TaskValidationError) as exc:
        await SprintTaskService(db_session).set_assignees(
            str(task.id), [str(insider.id), str(stranger.id)], primary_id=str(insider.id)
        )
    assert exc.value.code == "assignee_not_member"


# ── legacy single-assignee paths keep their old behaviour ────────────────


@pytest.mark.asyncio
async def test_assign_task_replaces_rather_than_accumulates(
    db_session: AsyncSession,
) -> None:
    """Reassigning A → B must leave B alone on the task, as it always did.

    Demoting A to collaborator instead would quietly accumulate everyone who
    ever held the task, and tell A they were still on work they handed over.
    """
    owner = await _make_developer(db_session, "ta-re-owner")
    ws = await _make_workspace(db_session, "ta-reassign", owner)
    a = await _make_developer(db_session, "ta-re-a", ws)
    b = await _make_developer(db_session, "ta-re-b", ws)
    task = await _make_task(db_session, ws, "reassign")
    service = SprintTaskService(db_session)

    await service.assign_task(str(task.id), str(a.id))
    rows = await _rows(db_session, str(task.id))
    assert [str(r.developer_id) for r in rows] == [str(a.id)]

    await service.assign_task(str(task.id), str(b.id))
    rows = await _rows(db_session, str(task.id))
    assert [str(r.developer_id) for r in rows] == [str(b.id)], (
        "reassignment must not leave the previous assignee on the task"
    )
    assert rows[0].is_primary


@pytest.mark.asyncio
async def test_assign_task_promotes_an_existing_collaborator_in_place(
    db_session: AsyncSession,
) -> None:
    """The (task_id, developer_id) unique constraint would reject a second row,
    so promotion has to reuse the existing one."""
    owner = await _make_developer(db_session, "ta-promo-owner")
    ws = await _make_workspace(db_session, "ta-promote", owner)
    a = await _make_developer(db_session, "ta-promo-a", ws)
    b = await _make_developer(db_session, "ta-promo-b", ws)
    task = await _make_task(db_session, ws, "promote")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id)
    )
    await service.assign_task(str(task.id), str(b.id))

    rows = await _rows(db_session, str(task.id))
    # a was the primary and is replaced; b was already a collaborator and is
    # promoted in place.
    assert [str(r.developer_id) for r in rows] == [str(b.id)]
    assert rows[0].is_primary


@pytest.mark.asyncio
async def test_unassign_takes_the_owner_off_but_leaves_collaborators(
    db_session: AsyncSession,
) -> None:
    owner = await _make_developer(db_session, "ta-un-owner")
    ws = await _make_workspace(db_session, "ta-unassign", owner)
    a = await _make_developer(db_session, "ta-un-a", ws)
    b = await _make_developer(db_session, "ta-un-b", ws)
    task = await _make_task(db_session, ws, "unassign")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id)
    )
    await service.unassign_task(str(task.id))

    rows = await _rows(db_session, str(task.id))
    assert [str(r.developer_id) for r in rows] == [str(b.id)]
    assert not rows[0].is_primary
    task_now = await service.get_task(str(task.id))
    assert task_now.assignee_id is None


@pytest.mark.asyncio
async def test_unassign_a_solo_task_empties_it(db_session: AsyncSession) -> None:
    """The common case, and the one that must match the old behaviour exactly:
    a task with one assignee, unassigned, has nobody on it."""
    owner = await _make_developer(db_session, "ta-solo-owner")
    ws = await _make_workspace(db_session, "ta-solo", owner)
    a = await _make_developer(db_session, "ta-solo-a", ws)
    task = await _make_task(db_session, ws, "solo")
    service = SprintTaskService(db_session)

    await service.assign_task(str(task.id), str(a.id))
    await service.unassign_task(str(task.id))

    assert await _rows(db_session, str(task.id)) == []
    task_now = await service.get_task(str(task.id))
    assert task_now.assignee_id is None


@pytest.mark.asyncio
async def test_update_task_assignee_change_syncs_the_rows(
    db_session: AsyncSession,
) -> None:
    """The generic PATCH writes `assignee_id` directly. Without the reconcile
    the assignee list would silently omit whoever was just assigned."""
    owner = await _make_developer(db_session, "ta-patch-owner")
    ws = await _make_workspace(db_session, "ta-patch", owner)
    a = await _make_developer(db_session, "ta-patch-a", ws)
    task = await _make_task(db_session, ws, "patch")
    service = SprintTaskService(db_session)

    await service.update_task(task_id=str(task.id), assignee_id=str(a.id))

    rows = await _rows(db_session, str(task.id))
    assert [str(r.developer_id) for r in rows] == [str(a.id)]
    assert rows[0].is_primary


@pytest.mark.asyncio
async def test_a_task_created_already_assigned_gets_its_primary_row(
    db_session: AsyncSession,
) -> None:
    """`add_task` is the sprint create path. A task born assigned must carry the
    row, or it shows an assignee in reports and nobody in the UI."""
    from aexy.models.sprint import Sprint

    owner = await _make_developer(db_session, "ta-new-owner")
    ws = await _make_workspace(db_session, "ta-created", owner)
    a = await _make_developer(db_session, "ta-new-a", ws)
    team = Team(id=str(uuid.uuid4()), workspace_id=ws.id, name="T created", slug="t-created")
    db_session.add(team)
    await db_session.flush()
    sprint = Sprint(
        id=str(uuid.uuid4()),
        team_id=team.id,
        workspace_id=ws.id,
        name="S created",
        start_date=date(2026, 8, 3),
        end_date=date(2026, 8, 14),
    )
    db_session.add(sprint)
    await db_session.flush()

    created = await SprintTaskService(db_session).add_task(
        sprint_id=str(sprint.id),
        title="already assigned",
        source_id="created-1",
        assignee_id=str(a.id),
    )

    rows = await _rows(db_session, str(created.id))
    assert [str(r.developer_id) for r in rows] == [str(a.id)]
    assert rows[0].is_primary


# ── incremental add / remove ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_assignee_leaves_the_others_alone(db_session: AsyncSession) -> None:
    owner = await _make_developer(db_session, "ta-add-owner")
    ws = await _make_workspace(db_session, "ta-add", owner)
    a = await _make_developer(db_session, "ta-add-a", ws)
    b = await _make_developer(db_session, "ta-add-b", ws)
    task = await _make_task(db_session, ws, "add")
    service = SprintTaskService(db_session)

    await service.assign_task(str(task.id), str(a.id))
    await service.add_assignee(str(task.id), str(b.id))

    rows = await _rows(db_session, str(task.id))
    assert {str(r.developer_id) for r in rows} == {str(a.id), str(b.id)}
    # Adding a collaborator does not disturb who is accountable.
    assert [str(r.developer_id) for r in rows if r.is_primary] == [str(a.id)]
    task_now = await service.get_task(str(task.id))
    assert str(task_now.assignee_id) == str(a.id)


@pytest.mark.asyncio
async def test_adding_the_same_person_twice_is_a_no_op(
    db_session: AsyncSession,
) -> None:
    owner = await _make_developer(db_session, "ta-dup-owner")
    ws = await _make_workspace(db_session, "ta-dup", owner)
    a = await _make_developer(db_session, "ta-dup-a", ws)
    task = await _make_task(db_session, ws, "dup")
    service = SprintTaskService(db_session)

    await service.add_assignee(str(task.id), str(a.id))
    await service.add_assignee(str(task.id), str(a.id))

    assert len(await _rows(db_session, str(task.id))) == 1


@pytest.mark.asyncio
async def test_removing_the_primary_leaves_no_designated_owner(
    db_session: AsyncSession,
) -> None:
    """Rather than promoting somebody — a promotion nobody asked for is how work
    ends up assigned to a person who never agreed to it."""
    owner = await _make_developer(db_session, "ta-rm-owner")
    ws = await _make_workspace(db_session, "ta-remove", owner)
    a = await _make_developer(db_session, "ta-rm-a", ws)
    b = await _make_developer(db_session, "ta-rm-b", ws)
    task = await _make_task(db_session, ws, "remove")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id)
    )
    updated = await service.remove_assignee(str(task.id), str(a.id))

    assert updated is not None and updated.assignee_id is None
    rows = await _rows(db_session, str(task.id))
    assert [str(r.developer_id) for r in rows] == [str(b.id)]


@pytest.mark.asyncio
async def test_clearing_the_primary_keeps_everyone_on_the_task(
    db_session: AsyncSession,
) -> None:
    owner = await _make_developer(db_session, "ta-clr-owner")
    ws = await _make_workspace(db_session, "ta-clear", owner)
    a = await _make_developer(db_session, "ta-clr-a", ws)
    b = await _make_developer(db_session, "ta-clr-b", ws)
    task = await _make_task(db_session, ws, "clear")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id)
    )
    updated = await service.set_primary_assignee(str(task.id), None)

    assert updated is not None and updated.assignee_id is None
    rows = await _rows(db_session, str(task.id))
    assert len(rows) == 2 and not any(r.is_primary for r in rows)


@pytest.mark.asyncio
async def test_set_assignees_empty_clears_the_task(db_session: AsyncSession) -> None:
    owner = await _make_developer(db_session, "ta-empty-owner")
    ws = await _make_workspace(db_session, "ta-empty", owner)
    a = await _make_developer(db_session, "ta-empty-a", ws)
    task = await _make_task(db_session, ws, "empty")
    service = SprintTaskService(db_session)

    await service.set_assignees(str(task.id), [str(a.id)], primary_id=str(a.id))
    updated = await service.set_assignees(str(task.id), [], primary_id=None)

    assert updated is not None and updated.assignee_id is None
    assert await _rows(db_session, str(task.id)) == []


@pytest.mark.asyncio
async def test_duplicate_ids_are_collapsed(db_session: AsyncSession) -> None:
    owner = await _make_developer(db_session, "ta-col-owner")
    ws = await _make_workspace(db_session, "ta-collapse", owner)
    a = await _make_developer(db_session, "ta-col-a", ws)
    task = await _make_task(db_session, ws, "collapse")

    await SprintTaskService(db_session).set_assignees(
        str(task.id), [str(a.id), str(a.id), str(a.id)], primary_id=str(a.id)
    )
    assert len(await _rows(db_session, str(task.id))) == 1


# ── filters and history ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filtering_by_assignee_finds_collaborator_tasks(
    db_session: AsyncSession,
) -> None:
    """Filtering to a person and not seeing work they are genuinely on reads as
    "nothing assigned to them" — worse than having no filter."""
    owner = await _make_developer(db_session, "ta-flt-owner")
    ws = await _make_workspace(db_session, "ta-filter", owner)
    primary = await _make_developer(db_session, "ta-flt-p", ws)
    helper = await _make_developer(db_session, "ta-flt-h", ws)
    task = await _make_task(db_session, ws, "filter")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(primary.id), str(helper.id)], primary_id=str(primary.id)
    )

    found = await service.get_tasks_by_assignee(str(helper.id))
    assert [str(t.id) for t in found] == [str(task.id)]


@pytest.mark.asyncio
async def test_changing_the_set_is_recorded_in_history(
    db_session: AsyncSession,
) -> None:
    owner = await _make_developer(db_session, "ta-hist-owner")
    ws = await _make_workspace(db_session, "ta-history", owner)
    a = await _make_developer(db_session, "ta-hist-a", ws)
    b = await _make_developer(db_session, "ta-hist-b", ws)
    task = await _make_task(db_session, ws, "history")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id), actor_id=str(owner.id)
    )
    await service.remove_assignee(str(task.id), str(b.id), actor_id=str(owner.id))

    actions = {
        row.action
        for row in (
            await db_session.execute(
                select(TaskActivity).where(TaskActivity.task_id == str(task.id))
            )
        )
        .scalars()
        .all()
    }
    assert "assignees_changed" in actions
    assert "assignee_removed" in actions


@pytest.mark.asyncio
async def test_response_lists_primary_first(db_session: AsyncSession) -> None:
    """So the UI can render the list without sorting, and the primary is the
    face shown when a card only has room for one avatar."""
    from aexy.services.sprint_task_response import task_to_response

    owner = await _make_developer(db_session, "ta-resp-owner")
    ws = await _make_workspace(db_session, "ta-response", owner)
    a = await _make_developer(db_session, "ta-resp-a", ws)
    b = await _make_developer(db_session, "ta-resp-b", ws)
    c = await _make_developer(db_session, "ta-resp-c", ws)
    task = await _make_task(db_session, ws, "response")
    service = SprintTaskService(db_session)

    # c is added last but made primary.
    updated = await service.set_assignees(
        str(task.id), [str(a.id), str(b.id), str(c.id)], primary_id=str(c.id)
    )
    payload = task_to_response(updated)

    assert [x.developer_id for x in payload.assignees][0] == str(c.id)
    assert payload.assignees[0].is_primary is True
    assert {x.developer_id for x in payload.assignees} == {
        str(a.id),
        str(b.id),
        str(c.id),
    }


@pytest.mark.asyncio
async def test_handing_a_task_from_one_person_to_another(
    db_session: AsyncSession,
) -> None:
    """The plain reassignment the team does all day.

    `uq_task_assignees_one_primary` used to exist only in
    migrate_task_assignees.sql, so production enforced it and this suite — which
    builds its schema from the models — did not. Every path that set a new
    primary wrote it in the same flush that cleared the old one, and SQLAlchemy
    emits saves before deletes, so Postgres saw two primaries on one task and
    refused. Reassigning any already-assigned task returned a 500.
    """
    owner = await _make_developer(db_session, "ta-hand-owner")
    ws = await _make_workspace(db_session, "ta-hand", owner)
    a = await _make_developer(db_session, "ta-hand-a", ws)
    b = await _make_developer(db_session, "ta-hand-b", ws)
    task = await _make_task(db_session, ws, "hand")
    service = SprintTaskService(db_session)

    await service.set_assignees(str(task.id), [str(a.id)], primary_id=str(a.id))
    updated = await service.set_assignees(str(task.id), [str(b.id)], primary_id=str(b.id))

    assert updated is not None
    assert str(updated.assignee_id) == str(b.id)
    rows = await _rows(db_session, str(task.id))
    assert [str(r.developer_id) for r in rows] == [str(b.id)]
    assert [r.is_primary for r in rows] == [True]


@pytest.mark.asyncio
async def test_promoting_a_collaborator_over_the_current_primary(
    db_session: AsyncSession,
) -> None:
    """The other shape of the same fault: nobody leaves, the badge moves."""
    owner = await _make_developer(db_session, "ta-promo-owner")
    ws = await _make_workspace(db_session, "ta-promo", owner)
    a = await _make_developer(db_session, "ta-promo-a", ws)
    b = await _make_developer(db_session, "ta-promo-b", ws)
    task = await _make_task(db_session, ws, "promo")
    service = SprintTaskService(db_session)

    await service.set_assignees(
        str(task.id), [str(a.id), str(b.id)], primary_id=str(a.id)
    )
    await service.add_assignee(str(task.id), str(b.id), make_primary=True)

    rows = await _rows(db_session, str(task.id))
    assert {str(r.developer_id) for r in rows} == {str(a.id), str(b.id)}
    assert [str(r.developer_id) for r in rows if r.is_primary] == [str(b.id)]
