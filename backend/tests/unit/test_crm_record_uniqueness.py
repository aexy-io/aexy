"""Unique-attribute enforcement on CRM record create/update."""

from uuid import uuid4

import pytest

from aexy.models.crm import CRMAttributeType, CRMObjectType
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.crm_service import CRMAttributeService, CRMObjectService, CRMRecordService
from aexy.services.data_table_service import DuplicateValueError


async def _seed(db):
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

    objects = await CRMObjectService(db).seed_standard_objects(ws.id)
    person = next(o for o in objects if o.object_type == CRMObjectType.PERSON.value)

    attrs = await CRMAttributeService(db).list_attributes(person.id)
    email_attr = next(a for a in attrs if a.slug == "email")
    email_attr.is_unique = True
    email_attr.attribute_type = CRMAttributeType.EMAIL.value
    await db.flush()

    return ws, person


@pytest.mark.asyncio
async def test_duplicate_unique_value_is_rejected(db_session):
    ws, person = await _seed(db_session)
    svc = CRMRecordService(db_session)

    await svc.create_record(ws.id, person.id, {"email": "dup@example.com"})

    with pytest.raises(DuplicateValueError) as exc:
        await svc.create_record(ws.id, person.id, {"email": "dup@example.com"})
    assert exc.value.field == "email"


@pytest.mark.asyncio
async def test_email_uniqueness_is_case_insensitive(db_session):
    ws, person = await _seed(db_session)
    svc = CRMRecordService(db_session)

    await svc.create_record(ws.id, person.id, {"email": "Case@Example.com"})

    with pytest.raises(DuplicateValueError):
        await svc.create_record(ws.id, person.id, {"email": "case@example.com"})


@pytest.mark.asyncio
async def test_update_into_existing_value_is_rejected_but_self_update_is_fine(db_session):
    ws, person = await _seed(db_session)
    svc = CRMRecordService(db_session)

    first = await svc.create_record(ws.id, person.id, {"email": "a@example.com"})
    second = await svc.create_record(ws.id, person.id, {"email": "b@example.com"})

    with pytest.raises(DuplicateValueError):
        await svc.update_record(second.id, values={"email": "a@example.com"})

    # Rewriting a record's own value must not trip the check.
    updated = await svc.update_record(first.id, values={"email": "a@example.com"})
    assert updated.values["email"] == "a@example.com"


@pytest.mark.asyncio
async def test_non_unique_attribute_and_other_workspace_are_unaffected(db_session):
    ws, person = await _seed(db_session)
    other_ws, _ = await _seed(db_session)
    svc = CRMRecordService(db_session)

    # Non-unique attribute: duplicates still allowed.
    await svc.create_record(ws.id, person.id, {"job_title": "Engineer"})
    await svc.create_record(ws.id, person.id, {"job_title": "Engineer"})

    # Same email in a different workspace's Person object is a different scope.
    await svc.create_record(ws.id, person.id, {"email": "scoped@example.com"})
    other_person = await svc.create_record(
        other_ws.id, person.id, {"email": "scoped@example.com"}
    )
    assert other_person.id


@pytest.mark.asyncio
async def test_archived_record_does_not_block(db_session):
    ws, person = await _seed(db_session)
    svc = CRMRecordService(db_session)

    first = await svc.create_record(ws.id, person.id, {"email": "gone@example.com"})
    await svc.delete_record(first.id)

    revived = await svc.create_record(ws.id, person.id, {"email": "gone@example.com"})
    assert revived.id != first.id
