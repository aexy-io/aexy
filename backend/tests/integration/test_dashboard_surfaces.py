"""Two dashboards, two layouts, one preferences row.

There is exactly one `dashboard_preferences` row per developer and it also
carries sidebar state, so the home dashboard's layout nests inside it rather
than taking a row of its own. These tests pin the part that is easy to get
wrong: editing one surface must not move the other's widgets, and the sidebar
fields must stay shared.
"""

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.main import app
from aexy.models.developer import Developer

URL = "/api/v1/dashboard/preferences"


@pytest_asyncio.fixture
async def dev(db_session: AsyncSession):
    developer = Developer(id=str(uuid4()), email=f"u-{uuid4().hex[:6]}@t.com", name="Owner")
    db_session.add(developer)
    await db_session.commit()

    app.dependency_overrides[get_current_developer] = lambda: developer
    yield developer
    app.dependency_overrides.pop(get_current_developer, None)


@pytest.mark.asyncio
async def test_my_work_surface_has_its_own_default_layout(client: AsyncClient, dev):
    resp = await client.get(URL, params={"surface": "my_work"})
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert "myWorkQueue" in body["visible_widgets"]
    # The insights dashboard's own default is untouched by asking for this one.
    overview = (await client.get(URL)).json()
    assert "myWorkQueue" not in overview["visible_widgets"]
    assert "welcome" in overview["visible_widgets"]


@pytest.mark.asyncio
async def test_editing_one_surface_leaves_the_other_alone(client: AsyncClient, dev):
    before = (await client.get(URL)).json()["visible_widgets"]

    saved = await client.put(
        URL,
        params={"surface": "my_work"},
        json={"visible_widgets": ["myWorkQueue"], "widget_order": ["myWorkQueue"], "preset_type": "custom"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["visible_widgets"] == ["myWorkQueue"]

    # Reading it back gets the edit, not the default.
    assert (await client.get(URL, params={"surface": "my_work"})).json()[
        "visible_widgets"
    ] == ["myWorkQueue"]
    # And the insights dashboard still has exactly what it had.
    assert (await client.get(URL)).json()["visible_widgets"] == before


@pytest.mark.asyncio
async def test_sidebar_state_is_shared_across_surfaces(client: AsyncClient, dev):
    """Pinned items and persona belong to the person, not to a dashboard."""
    await client.put(
        URL,
        params={"surface": "my_work"},
        json={"sidebar_pinned_items": ["/crm"], "sidebar_persona": "manager"},
    )

    overview = (await client.get(URL)).json()
    assert overview["sidebar_pinned_items"] == ["/crm"]
    assert overview["sidebar_persona"] == "manager"


@pytest.mark.asyncio
async def test_resetting_a_surface_restores_its_own_defaults(client: AsyncClient, dev):
    await client.put(
        URL,
        params={"surface": "my_work"},
        json={"visible_widgets": ["myWorkQueue"], "preset_type": "custom"},
    )

    resp = await client.post(
        f"{URL}/reset", params={"surface": "my_work", "preset_type": "developer"}
    )
    assert resp.status_code == 200, resp.text
    # Its own layout, not the developer persona's — that preset belongs to the
    # other dashboard.
    assert "myWorkStats" in resp.json()["visible_widgets"]
    assert "languageProficiency" not in resp.json()["visible_widgets"]


@pytest.mark.asyncio
async def test_unknown_surface_is_rejected(client: AsyncClient, dev):
    """A typo must not strand a layout under a key nothing reads back."""
    resp = await client.get(URL, params={"surface": "my-work"})
    assert resp.status_code == 400, resp.text
