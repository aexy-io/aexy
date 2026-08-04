"""Unit tests for standard CRM object seeding (upsert by object_type)."""

from uuid import uuid4

from sqlalchemy import func, select

from aexy.models.crm import CRMAttribute, CRMObject, CRMObjectType, CRMPipeline
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.crm_service import CRMObjectService

STANDARD_TYPES = [
    CRMObjectType.COMPANY.value,
    CRMObjectType.PERSON.value,
    CRMObjectType.DEAL.value,
    CRMObjectType.LEAD.value,
]


async def _make_workspace(db) -> Workspace:
    owner = Developer(name="Owner", email=f"owner-{uuid4().hex[:8]}@example.com")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()),
        name="Acme",
        slug=f"acme-{uuid4().hex[:8]}",
        owner_id=owner.id,
        next_task_key=1,
    )
    db.add(ws)
    await db.flush()
    return ws


async def _count(db, model, *where):
    stmt = select(func.count()).select_from(model).where(*where)
    return (await db.execute(stmt)).scalar()


async def test_seed_standard_objects_creates_the_standard_set(db_session):
    ws = await _make_workspace(db_session)

    objects = await CRMObjectService(db_session).seed_standard_objects(ws.id)

    assert [o.object_type for o in objects] == STANDARD_TYPES
    assert await _count(db_session, CRMObject, CRMObject.workspace_id == ws.id) == 4
    assert await _count(db_session, CRMPipeline, CRMPipeline.workspace_id == ws.id) == 2


async def test_seed_standard_objects_is_idempotent(db_session):
    ws = await _make_workspace(db_session)
    service = CRMObjectService(db_session)

    first = await service.seed_standard_objects(ws.id)
    object_ids = [o.id for o in first]
    attrs_after_first = await _count(
        db_session, CRMAttribute, CRMAttribute.object_id.in_(object_ids)
    )

    second = await service.seed_standard_objects(ws.id)

    # Same objects come back, and nothing new was created.
    assert [o.id for o in second] == object_ids
    assert await _count(db_session, CRMObject, CRMObject.workspace_id == ws.id) == 4
    assert await _count(db_session, CRMPipeline, CRMPipeline.workspace_id == ws.id) == 2
    assert (
        await _count(db_session, CRMAttribute, CRMAttribute.object_id.in_(object_ids))
        == attrs_after_first
    )


async def test_seed_standard_objects_fills_in_missing_types(db_session):
    """A workspace that only has a Person gets the other three seeded."""
    ws = await _make_workspace(db_session)
    service = CRMObjectService(db_session)

    person = await service.create_object(
        workspace_id=ws.id,
        name="Person",
        plural_name="People",
        object_type=CRMObjectType.PERSON.value,
    )

    objects = await service.seed_standard_objects(ws.id)

    by_type = {o.object_type: o for o in objects}
    assert by_type[CRMObjectType.PERSON.value].id == person.id
    assert await _count(db_session, CRMObject, CRMObject.workspace_id == ws.id) == 4
    # Person pre-existed, so only the Deal and Lead pipelines are created.
    assert await _count(db_session, CRMPipeline, CRMPipeline.workspace_id == ws.id) == 2
