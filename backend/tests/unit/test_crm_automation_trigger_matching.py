"""Regression tests for CRM automation trigger matching (`process_trigger`).

Production bug (workspace "capbumpy", automation 54f54973-...): a published
`record.created` automation showed 0 runs when a record was added. Root cause:
the /automations builder never sets `object_id`, so automations are stored with
`object_id IS NULL`, and `process_trigger` matched with a strict
`object_id == object_id` predicate — which never matches NULL in SQL. Result:
every record-triggered automation built in that UI silently never fired.
"""

from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from aexy.models.crm import CRMAutomation, CRMAutomationRun
from aexy.services.crm_automation_service import CRMAutomationService

from tests.conftest import seed_crm_object, seed_workspace

pytestmark = pytest.mark.asyncio


async def _make_automation(db_session, *, object_id, trigger_type="record.created",
                           trigger_config=None, is_active=True, actions=None,
                           workspace_id=None):
    automation = CRMAutomation(
        id=str(uuid4()),
        workspace_id=workspace_id or await seed_workspace(db_session),
        name="New Automation",
        module="crm",
        object_id=object_id,
        trigger_type=trigger_type,
        trigger_config=trigger_config or {},
        conditions=[],
        actions=actions if actions is not None else [],
        is_active=is_active,
    )
    db_session.add(automation)
    await db_session.flush()
    return automation


async def test_null_object_automation_fires_on_record_created(db_session):
    """The production repro: object_id IS NULL must still match and run."""
    automation = await _make_automation(db_session, object_id=None)

    service = CRMAutomationService(db_session)
    runs = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=str(uuid4()),  # any object in the workspace
        trigger_type="record.created",
        record_id=None,
    )

    assert len(runs) == 1
    assert runs[0].automation_id == automation.id
    assert runs[0].status == "completed"


async def test_queued_email_step_survives_commit_and_reload(db_session):
    """A queued email result must persist for the worker to finish the run."""
    automation = await _make_automation(
        db_session,
        object_id=None,
        actions=[{"type": "send_email", "config": {}}],
    )
    service = CRMAutomationService(db_session)
    service._execute_action = AsyncMock(return_value={"queued": True})

    run = await service.trigger_automation(automation.id)
    await db_session.commit()
    run_id = run.id
    db_session.expire_all()

    persisted = await db_session.get(CRMAutomationRun, run_id)
    assert persisted.status == "queued"
    assert len(persisted.steps_executed) == 1
    assert persisted.steps_executed[0]["type"] == "send_email"
    assert persisted.steps_executed[0]["order"] == 0
    assert persisted.steps_executed[0]["status"] == "queued"
    assert persisted.steps_executed[0]["result"] == {"queued": True}


async def test_object_bound_automation_matches_only_its_object(db_session):
    # Real rows: object_id is a foreign key, so made-up ids only insert on
    # SQLite, where foreign keys go unenforced.
    workspace_id = await seed_workspace(db_session)
    obj_a = await seed_crm_object(db_session, workspace_id, "Alpha")
    obj_b = await seed_crm_object(db_session, workspace_id, "Beta")
    automation = await _make_automation(
        db_session, object_id=obj_a, workspace_id=workspace_id
    )
    service = CRMAutomationService(db_session)

    matched = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=obj_a,
        trigger_type="record.created",
    )
    assert len(matched) == 1

    unmatched = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=obj_b,
        trigger_type="record.created",
    )
    assert unmatched == []


async def test_inactive_automation_does_not_fire(db_session):
    automation = await _make_automation(db_session, object_id=None, is_active=False)
    service = CRMAutomationService(db_session)
    runs = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=str(uuid4()),
        trigger_type="record.created",
    )
    assert runs == []


async def test_trigger_type_must_match(db_session):
    automation = await _make_automation(db_session, object_id=None,
                                        trigger_type="record.created")
    service = CRMAutomationService(db_session)
    runs = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=str(uuid4()),
        trigger_type="record.updated",
    )
    assert runs == []


async def test_field_changed_filter_applies(db_session):
    """The field filter compares against the dot enum value ('field.changed').

    Previously it checked the literal 'field_changed', which never equalled the
    dispatched trigger_type, so the watched-field filter was silently skipped.
    """
    automation = await _make_automation(
        db_session,
        object_id=None,
        trigger_type="field.changed",
        trigger_config={"field": "status"},
    )
    service = CRMAutomationService(db_session)

    # A different field changed -> filtered out, no run.
    skipped = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=str(uuid4()),
        trigger_type="field.changed",
        trigger_data={"changed_field": "email"},
    )
    assert skipped == []

    # The watched field changed -> fires.
    fired = await service.process_trigger(
        workspace_id=automation.workspace_id,
        object_id=str(uuid4()),
        trigger_type="field.changed",
        trigger_data={"changed_field": "status"},
    )
    assert len(fired) == 1
