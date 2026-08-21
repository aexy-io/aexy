"""Who may read a task attachment.

The read route carries only an attachment id — no workspace, sprint or team —
so that one URL stays valid wherever the task lives. That makes the route
responsible for working out which workspace governs the file, rather than
inheriting the answer from its path like the upload and list routes do.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.task_attachments import _workspace_for_task, download_task_attachment
from aexy.models.developer import Developer
from aexy.models.sprint import Sprint, SprintTask, TaskAttachment
from aexy.models.team import Team
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services import task_attachment_service as tas

KEY = "task-attachments/t/deadbeef_shot.png"


class FakeStorage:
    def is_configured(self):
        return True

    def key_from_url(self, url):
        return None

    def get_object_stream(self, key, byte_range=None, chunk_size=None):
        return {
            "iter": iter([b"bytes"]),
            "content_type": "image/png",
            "content_length": 5,
            "content_range": None,
        }


@pytest.fixture
def fake_storage(monkeypatch):
    monkeypatch.setattr(tas, "get_storage_service", FakeStorage)
    return FakeStorage()


async def _workspace(db: AsyncSession) -> tuple[Workspace, Developer]:
    owner = Developer(id=str(uuid4()), email=f"o-{uuid4().hex[:8]}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name="WS", slug=f"ws-{uuid4().hex[:8]}", owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="admin", status="active"))
    await db.commit()
    return ws, owner


async def _attachment_on(db: AsyncSession, task: SprintTask) -> TaskAttachment:
    att = TaskAttachment(
        id=str(uuid4()),
        task_id=task.id,
        file_name="shot.png",
        file_url=f"https://example.invalid/aexy-storage/{KEY}",
        storage_key=KEY,
        file_size=5,
        content_type="image/png",
    )
    db.add(att)
    await db.commit()
    return att


# ─── Working out the owning workspace ───────────────────────────────────────

@pytest.mark.asyncio
async def test_workspace_comes_from_the_task_when_it_has_one(db_session):
    ws, _ = await _workspace(db_session)
    task = SprintTask(id=str(uuid4()), title="T", source_id=str(uuid4()), workspace_id=ws.id)
    db_session.add(task)
    await db_session.commit()

    assert await _workspace_for_task(task, db_session) == ws.id


@pytest.mark.asyncio
async def test_legacy_task_falls_back_to_its_sprint(db_session):
    """Tasks predating `workspace_id` don't carry one — the sprint they hang
    off is the same owner the upload route checks against."""
    ws, _ = await _workspace(db_session)
    team = Team(
        id=str(uuid4()), name="Team", slug=f"team-{uuid4().hex[:8]}", workspace_id=ws.id
    )
    db_session.add(team)
    await db_session.flush()
    sprint = Sprint(
        id=str(uuid4()),
        name="S1",
        workspace_id=ws.id,
        team_id=team.id,
        start_date=datetime(2026, 8, 1, tzinfo=timezone.utc),
        end_date=datetime(2026, 8, 15, tzinfo=timezone.utc),
    )
    db_session.add(sprint)
    await db_session.commit()

    task = SprintTask(id=str(uuid4()), title="T", source_id=str(uuid4()), sprint_id=sprint.id, workspace_id=None)
    db_session.add(task)
    await db_session.commit()

    assert await _workspace_for_task(task, db_session) == ws.id


@pytest.mark.asyncio
async def test_legacy_backlog_task_falls_back_to_its_team(db_session):
    ws, owner = await _workspace(db_session)
    team = Team(
        id=str(uuid4()), name="Team", slug=f"team-{uuid4().hex[:8]}", workspace_id=ws.id
    )
    db_session.add(team)
    await db_session.commit()

    task = SprintTask(id=str(uuid4()), title="T", source_id=str(uuid4()), team_id=team.id, workspace_id=None)
    db_session.add(task)
    await db_session.commit()

    assert await _workspace_for_task(task, db_session) == ws.id


@pytest.mark.asyncio
async def test_task_belonging_to_nothing_has_no_owning_workspace(db_session):
    task = SprintTask(id=str(uuid4()), title="Orphan", source_id=str(uuid4()))
    db_session.add(task)
    await db_session.commit()

    assert await _workspace_for_task(task, db_session) is None


# ─── The endpoint ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_member_gets_the_bytes(db_session, fake_storage):
    ws, owner = await _workspace(db_session)
    task = SprintTask(id=str(uuid4()), title="T", source_id=str(uuid4()), workspace_id=ws.id)
    db_session.add(task)
    await db_session.commit()
    att = await _attachment_on(db_session, task)

    resp = await download_task_attachment(att.id, None, owner, db_session)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_non_member_is_refused(db_session, fake_storage):
    ws, _ = await _workspace(db_session)
    task = SprintTask(id=str(uuid4()), title="T", source_id=str(uuid4()), workspace_id=ws.id)
    db_session.add(task)
    await db_session.commit()
    att = await _attachment_on(db_session, task)

    outsider = Developer(id=str(uuid4()), email="out@example.com", name="Outsider")
    db_session.add(outsider)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await download_task_attachment(att.id, None, outsider, db_session)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_unknown_attachment_is_a_404(db_session, fake_storage):
    _, owner = await _workspace(db_session)
    with pytest.raises(HTTPException) as exc:
        await download_task_attachment(str(uuid4()), None, owner, db_session)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_attachment_on_an_unplaceable_task_is_a_404_not_a_leak(db_session, fake_storage):
    """No workspace means no membership that could grant access — refuse rather
    than fall through to serving the bytes."""
    _, owner = await _workspace(db_session)
    task = SprintTask(id=str(uuid4()), title="Orphan", source_id=str(uuid4()))
    db_session.add(task)
    await db_session.commit()
    att = await _attachment_on(db_session, task)

    with pytest.raises(HTTPException) as exc:
        await download_task_attachment(att.id, None, owner, db_session)
    assert exc.value.status_code == 404
