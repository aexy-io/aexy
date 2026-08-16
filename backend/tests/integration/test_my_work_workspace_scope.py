"""The personal work list is scoped to one workspace.

`GET /developers/me/assigned-tasks` filtered by assignee and nothing else, so
somebody in two workspaces got both workspaces' work in one undifferentiated
list with no way to say which one they meant. These tests pin the scoping and
the fields the UI needs to tell the two apart and link each row somewhere.
"""

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.main import app
from aexy.models.bug import Bug
from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask
from aexy.models.story import UserStory
from aexy.models.workspace import Workspace, WorkspaceMember

URL = "/api/v1/developers/me/assigned-tasks"


async def _workspace(db: AsyncSession, dev: Developer, name: str) -> Workspace:
    ws = Workspace(
        id=str(uuid4()), name=name, slug=f"{name.lower()}-{uuid4().hex[:6]}", owner_id=dev.id
    )
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            id=str(uuid4()),
            workspace_id=ws.id,
            developer_id=dev.id,
            role="owner",
            status="active",
        )
    )
    await db.flush()
    return ws


@pytest_asyncio.fixture
async def seeded(db_session: AsyncSession):
    dev = Developer(id=str(uuid4()), email=f"u-{uuid4().hex[:6]}@t.com", name="Owner")
    db_session.add(dev)
    await db_session.flush()

    acme = await _workspace(db_session, dev, "Acme")
    globex = await _workspace(db_session, dev, "Globex")

    db_session.add_all(
        [
            SprintTask(
                id=str(uuid4()),
                workspace_id=acme.id,
                title="Acme task",
                status="todo",
                priority="medium",
                assignee_id=dev.id,
                task_key=12,
                source_type="manual",
                source_id=f"manual-{uuid4().hex[:8]}",
            ),
            SprintTask(
                id=str(uuid4()),
                workspace_id=globex.id,
                title="Globex task",
                status="todo",
                priority="medium",
                assignee_id=dev.id,
                source_type="manual",
                source_id=f"manual-{uuid4().hex[:8]}",
            ),
            Bug(
                id=str(uuid4()),
                workspace_id=acme.id,
                project_id=None,
                key="BUG-1",
                title="Acme bug",
                status="new",
                priority="high",
                severity="major",
                assignee_id=dev.id,
                reporter_id=dev.id,
            ),
            UserStory(
                id=str(uuid4()),
                workspace_id=globex.id,
                key="STORY-1",
                title="Globex story",
                as_a="user",
                i_want="a thing",
                status="draft",
                priority="medium",
                owner_id=dev.id,
            ),
        ]
    )
    await db_session.commit()

    app.dependency_overrides[get_current_developer_id] = lambda: dev.id
    yield {"dev": dev, "acme": acme, "globex": globex}
    app.dependency_overrides.pop(get_current_developer_id, None)


@pytest.mark.asyncio
async def test_scopes_every_tracker_to_the_requested_workspace(
    client: AsyncClient, seeded
):
    resp = await client.get(URL, params={"workspace_id": seeded["acme"].id})
    assert resp.status_code == 200, resp.text

    titles = {item["title"] for item in resp.json()}
    assert titles == {"Acme task", "Acme bug"}


@pytest.mark.asyncio
async def test_omitting_the_workspace_returns_every_workspace(
    client: AsyncClient, seeded
):
    """"All workspaces" is still available — it is just no longer the only mode."""
    resp = await client.get(URL)
    assert resp.status_code == 200, resp.text

    titles = {item["title"] for item in resp.json()}
    assert titles == {"Acme task", "Globex task", "Acme bug", "Globex story"}


@pytest.mark.asyncio
async def test_names_the_workspace_on_every_item(client: AsyncClient, seeded):
    """Across workspaces, a row that can't say where it came from is unreadable."""
    resp = await client.get(URL)
    by_title = {item["title"]: item for item in resp.json()}

    assert by_title["Acme task"]["workspace_name"] == "Acme"
    assert by_title["Globex story"]["workspace_name"] == "Globex"


@pytest.mark.asyncio
async def test_returns_what_bugs_and_stories_need_to_be_opened(
    client: AsyncClient, seeded
):
    """These two never had a link before, because the API never sent one."""
    resp = await client.get(URL)
    by_title = {item["title"]: item for item in resp.json()}

    assert by_title["Acme bug"]["reference"] == "BUG-1"
    assert "project_id" in by_title["Acme bug"]
    assert by_title["Globex story"]["reference"] == "STORY-1"
    assert "epic_id" in by_title["Globex story"]
    # Tasks get the shareable [slug:key] identifier the rest of the app uses.
    assert by_title["Acme task"]["reference"].endswith(":12]")


@pytest.mark.asyncio
async def test_rejects_a_workspace_the_caller_is_not_in(
    client: AsyncClient, seeded, db_session: AsyncSession
):
    """A filter naming somebody else's workspace is a bad request, not an empty list."""
    other_owner = Developer(id=str(uuid4()), email=f"o-{uuid4().hex[:6]}@t.com", name="Other")
    db_session.add(other_owner)
    await db_session.flush()
    outsider_ws = await _workspace(db_session, other_owner, "Initech")
    await db_session.commit()

    resp = await client.get(URL, params={"workspace_id": outsider_ws.id})
    assert resp.status_code == 404, resp.text
