"""Runtime validation of task.status updates.

`TaskStatus` is no longer a backend Literal — it's free-form `str` so
project-scoped custom slugs round-trip. Validation moves into
`SprintTaskService.update_task` / `update_task_status` which reject any
slug that isn't defined in the task's scope (project rows OR workspace
defaults). This file pins that contract.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.project import Project
from aexy.models.sprint import SprintTask
from aexy.models.team import Team
from aexy.models.workspace import Workspace
from aexy.services.sprint_task_service import SprintTaskService, TaskValidationError
from aexy.services.task_config_service import TaskConfigService


async def _make_workspace(db: AsyncSession, slug: str) -> Workspace:
    dev = Developer(name=f"U {slug}")
    db.add(dev)
    await db.flush()
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=dev.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


async def _make_project(db: AsyncSession, ws: Workspace, slug: str) -> Project:
    p = Project(id=str(uuid.uuid4()), workspace_id=ws.id, name=f"P {slug}", slug=slug)
    db.add(p)
    # SprintTask.team_id is a FK to teams.id but the task/service layer treats
    # it as the project id. Postgres enforces the FK (SQLite ignores it), so a
    # Team row whose id matches the project id must exist for task inserts to
    # succeed.
    team = Team(id=p.id, workspace_id=ws.id, name=f"P {slug}", slug=slug)
    db.add(team)
    await db.commit()
    await db.refresh(p)
    return p


async def _make_task(db: AsyncSession, ws: Workspace, team_id: str) -> SprintTask:
    task = SprintTask(
        id=str(uuid.uuid4()),
        workspace_id=ws.id,
        team_id=team_id,
        sprint_id=None,
        title="probe",
        status="todo",
        source_type="manual",
        source_id="probe-1",
        priority="medium",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@pytest.mark.asyncio
async def test_update_task_accepts_canonical_slug(db_session: AsyncSession) -> None:
    ws = await _make_workspace(db_session, "ws-status-canon")
    project = await _make_project(db_session, ws, "p-status-canon")
    config = TaskConfigService(db_session)
    await config.seed_default_statuses(ws.id)
    await db_session.commit()

    task = await _make_task(db_session, ws, project.id)
    service = SprintTaskService(db_session)

    updated = await service.update_task(task_id=task.id, status="in_progress")
    assert updated is not None
    assert updated.status == "in_progress"


@pytest.mark.asyncio
async def test_update_task_accepts_custom_project_scoped_slug(
    db_session: AsyncSession,
) -> None:
    ws = await _make_workspace(db_session, "ws-status-cust")
    project = await _make_project(db_session, ws, "p-status-cust")
    config = TaskConfigService(db_session)
    await config.seed_default_statuses(ws.id)
    # Custom status scoped to one project — should be reachable from that
    # project's task even though "on_hold" isn't a canonical slug.
    await config.create_status(
        workspace_id=ws.id,
        name="On Hold",
        category="backlog",
        project_id=project.id,
    )
    await db_session.commit()

    task = await _make_task(db_session, ws, project.id)
    service = SprintTaskService(db_session)

    updated = await service.update_task_status(task_id=task.id, new_status="on_hold")
    assert updated is not None
    assert updated.status == "on_hold"


@pytest.mark.asyncio
async def test_update_task_rejects_unknown_slug(db_session: AsyncSession) -> None:
    ws = await _make_workspace(db_session, "ws-status-bad")
    project = await _make_project(db_session, ws, "p-status-bad")
    config = TaskConfigService(db_session)
    await config.seed_default_statuses(ws.id)
    await db_session.commit()

    task = await _make_task(db_session, ws, project.id)
    service = SprintTaskService(db_session)

    with pytest.raises(TaskValidationError) as exc:
        await service.update_task(task_id=task.id, status="ghost_status")
    assert exc.value.code == "unknown_status"


@pytest.mark.asyncio
async def test_update_task_rejects_other_project_scoped_slug(
    db_session: AsyncSession,
) -> None:
    """A custom slug scoped to Project B should NOT be reachable from a task
    that lives on Project A. Otherwise tasks could end up in a column the
    board doesn't render."""
    ws = await _make_workspace(db_session, "ws-status-cross")
    project_a = await _make_project(db_session, ws, "p-a")
    project_b = await _make_project(db_session, ws, "p-b")
    config = TaskConfigService(db_session)
    await config.seed_default_statuses(ws.id)
    await config.create_status(
        workspace_id=ws.id,
        name="On Hold",
        category="backlog",
        project_id=project_b.id,
    )
    await db_session.commit()

    task_a = await _make_task(db_session, ws, project_a.id)
    service = SprintTaskService(db_session)

    with pytest.raises(TaskValidationError) as exc:
        await service.update_task_status(task_id=task_a.id, new_status="on_hold")
    assert exc.value.code == "unknown_status"


@pytest.mark.asyncio
async def test_review_is_stored_as_the_slug_the_board_renders(
    db_session: AsyncSession,
) -> None:
    """A task set to review must not vanish from the kanban.

    The seeded status row is ``in_review`` but the shared UI status map, the
    keyboard shortcut and several hardcoded lists say ``review``. The board
    builds columns from the seeded slugs and buckets tasks by ``task.status``,
    so storing ``review`` put the card in a bucket no column reads — it
    disappeared from the board rather than landing in the wrong column.
    Reported by the tech team using the feature.
    """
    ws = await _make_workspace(db_session, "ws-status-review")
    project = await _make_project(db_session, ws, "p-status-review")
    config = TaskConfigService(db_session)
    await config.seed_default_statuses(ws.id)
    await db_session.commit()

    seeded = {s.slug for s in await config.get_statuses_for_project(ws.id, project.id)}
    assert "in_review" in seeded and "review" not in seeded, (
        "fixture assumption: the seed uses in_review"
    )

    service = SprintTaskService(db_session)

    # The legacy spelling every status picker sends...
    task = await _make_task(db_session, ws, project.id)
    updated = await service.update_task(task_id=task.id, status="review")
    assert updated is not None
    assert updated.status == "in_review", "stored slug must be one the board has a column for"

    # ...and the same via the dedicated status endpoint's service method.
    other = await _make_task(db_session, ws, project.id)
    moved = await service.update_task_status(other.id, "review")
    assert moved is not None and moved.status == "in_review"

    # The seeded spelling is of course left alone.
    third = await _make_task(db_session, ws, project.id)
    direct = await service.update_task_status(third.id, "in_review")
    assert direct is not None and direct.status == "in_review"


@pytest.mark.asyncio
async def test_canonicalising_does_not_invent_a_status(db_session: AsyncSession) -> None:
    """A workspace whose set really uses ``review`` keeps it.

    The alias is bidirectional, so this pins that it resolves to whatever the
    board actually has rather than always preferring one spelling.
    """
    ws = await _make_workspace(db_session, "ws-status-legacy")
    project = await _make_project(db_session, ws, "p-status-legacy")
    config = TaskConfigService(db_session)
    created = await config.create_status(
        workspace_id=ws.id,
        name="Review",  # slug is derived from the name
        category="in_review",
        project_id=project.id,
    )
    await db_session.commit()
    assert created.slug == "review", "fixture assumption: this workspace uses the legacy spelling"

    task = await _make_task(db_session, ws, project.id)
    service = SprintTaskService(db_session)
    updated = await service.update_task(task_id=task.id, status="review")
    assert updated is not None and updated.status == "review"
