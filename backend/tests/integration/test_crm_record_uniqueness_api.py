"""A duplicate on a unique attribute surfaces as HTTP 409, not 400/500."""

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.main import app
from aexy.models.crm import CRMAttributeType, CRMObjectType
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.crm_service import CRMAttributeService, CRMObjectService


@pytest_asyncio.fixture
async def seeded(db_session: AsyncSession):
    dev = Developer(id=str(uuid4()), email=f"u-{uuid4().hex[:6]}@t.com", name="Owner")
    db_session.add(dev)
    await db_session.flush()
    ws = Workspace(
        id=str(uuid4()), name="W", slug=f"w-{uuid4().hex[:6]}", owner_id=dev.id
    )
    db_session.add(ws)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            id=str(uuid4()),
            workspace_id=ws.id,
            developer_id=dev.id,
            role="owner",
            status="active",
        )
    )
    await db_session.flush()

    objects = await CRMObjectService(db_session).seed_standard_objects(ws.id)
    person = next(o for o in objects if o.object_type == CRMObjectType.PERSON.value)
    attrs = await CRMAttributeService(db_session).list_attributes(person.id)
    email_attr = next(a for a in attrs if a.slug == "email")
    email_attr.is_unique = True
    email_attr.attribute_type = CRMAttributeType.EMAIL.value
    await db_session.commit()

    app.dependency_overrides[get_current_developer] = lambda: dev
    yield {"ws": ws, "object_id": person.id}
    app.dependency_overrides.pop(get_current_developer, None)


@pytest.mark.asyncio
async def test_duplicate_post_returns_409(client: AsyncClient, seeded):
    url = (
        f"/api/v1/workspaces/{seeded['ws'].id}"
        f"/crm/objects/{seeded['object_id']}/records"
    )

    first = await client.post(url, json={"values": {"email": "dupe@example.com"}})
    assert first.status_code == 201, first.text

    second = await client.post(url, json={"values": {"email": "DUPE@example.com"}})
    assert second.status_code == 409, second.text
    body = second.json()
    assert body["field"] == "email"
    assert body["existing_record_id"] == first.json()["id"]
