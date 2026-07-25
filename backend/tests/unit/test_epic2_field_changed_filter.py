"""US 2.1: a field.changed automation must fire only for the watched field.

The builder writes the watched field as `field_slug` into the trigger node's
data, and the graph-save bridge copies node data verbatim into trigger_config.
The dispatcher reads `trigger_config["field"]`. This test pins whether those
two ends actually meet.
"""

from uuid import uuid4

import pytest

from aexy.models.crm import CRMAutomation, CRMAutomationRun, CRMObjectType
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.crm_service import CRMObjectService


async def _seed(db):
    dev = Developer(name="O", email=f"o-{uuid4().hex[:8]}@example.com")
    db.add(dev)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()), name="A", slug=f"a-{uuid4().hex[:8]}",
        owner_id=dev.id, next_task_key=1,
    )
    db.add(ws)
    await db.flush()
    objects = await CRMObjectService(db).seed_standard_objects(ws.id)
    person = next(o for o in objects if o.object_type == CRMObjectType.PERSON.value)
    return ws, person


async def _automation(db, ws, obj, trigger_config):
    auto = CRMAutomation(
        id=str(uuid4()),
        workspace_id=ws.id,
        object_id=obj.id,
        name="Watch one field",
        trigger_type="field.changed",
        trigger_config=trigger_config,
        actions=[],
        is_active=True,
    )
    db.add(auto)
    await db.flush()
    return auto


@pytest.mark.asyncio
async def test_filter_honours_the_key_the_builder_actually_writes(db_session):
    """The builder saves `field_slug`; an unrelated change must not fire."""
    ws, person = await _seed(db_session)
    await _automation(db_session, ws, person, {"field_slug": "email"})

    runs = await CRMAutomationService(db_session).process_trigger(
        workspace_id=ws.id,
        object_id=person.id,
        trigger_type="field.changed",
        record_id=None,
        trigger_data={"changed_field": "job_title"},
    )

    assert runs == [], (
        "A change to job_title fired an automation that watches email — "
        "the builder writes 'field_slug' but the dispatcher reads 'field'."
    )


@pytest.mark.asyncio
async def test_filter_works_when_the_key_is_the_one_the_backend_reads(db_session):
    """Control: with the backend's own key name, filtering behaves correctly."""
    ws, person = await _seed(db_session)
    await _automation(db_session, ws, person, {"field": "email"})
    svc = CRMAutomationService(db_session)

    unrelated = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="field.changed",
        record_id=None, trigger_data={"changed_field": "job_title"},
    )
    assert unrelated == []

    watched = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="field.changed",
        record_id=None, trigger_data={"changed_field": "email"},
    )
    assert len(watched) == 1


@pytest.mark.asyncio
async def test_list_trigger_honours_the_chosen_list(db_session):
    """US 2.2: picking a list in the builder must scope the trigger to it."""
    ws, person = await _seed(db_session)
    auto = await _automation(db_session, ws, person, {"list_id": "the-one-i-picked"})
    auto.trigger_type = "list_entry.added"
    await db_session.flush()

    runs = await CRMAutomationService(db_session).process_trigger(
        workspace_id=ws.id,
        object_id=person.id,
        trigger_type="list_entry.added",
        record_id=None,
        trigger_data={"list_id": "a-completely-different-list"},
    )

    assert runs == [], "Adding to an unrelated list fired a list-scoped automation."


@pytest.mark.asyncio
async def test_unconfigured_trigger_fires_for_every_change(db_session):
    """No field chosen = fire on any field change."""
    ws, person = await _seed(db_session)
    await _automation(db_session, ws, person, {})

    runs = await CRMAutomationService(db_session).process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="field.changed",
        record_id=None, trigger_data={"changed_field": "anything_at_all"},
    )
    assert len(runs) == 1


@pytest.mark.asyncio
async def test_several_fields_can_be_watched_at_once(db_session):
    """US 2.1: watch name, email and deal value together."""
    ws, person = await _seed(db_session)
    await _automation(db_session, ws, person, {"fields": ["name", "email", "deal_value"]})
    svc = CRMAutomationService(db_session)

    for field in ("name", "email", "deal_value"):
        runs = await svc.process_trigger(
            workspace_id=ws.id, object_id=person.id, trigger_type="field.changed",
            record_id=None, trigger_data={"changed_field": field},
        )
        assert len(runs) == 1, f"{field} should have fired"

    ignored = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="field.changed",
        record_id=None, trigger_data={"changed_field": "linkedin"},
    )
    assert ignored == []


@pytest.mark.asyncio
async def test_stage_change_narrowing(db_session):
    """US 2.2: only fire when a deal moves into the stage you chose."""
    ws, person = await _seed(db_session)
    auto = await _automation(db_session, ws, person, {"to_stage": "won"})
    auto.trigger_type = "stage.changed"
    await db_session.flush()
    svc = CRMAutomationService(db_session)

    lost = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="stage.changed",
        record_id=None, trigger_data={"old_stage": "negotiation", "new_stage": "lost"},
    )
    assert lost == []

    won = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="stage.changed",
        record_id=None, trigger_data={"old_stage": "negotiation", "new_stage": "won"},
    )
    assert len(won) == 1


@pytest.mark.asyncio
async def test_legacy_config_key_still_honoured(db_session):
    """Automations saved before the rename must keep filtering."""
    ws, person = await _seed(db_session)
    await _automation(db_session, ws, person, {"attribute_slug": "email"})

    runs = await CRMAutomationService(db_session).process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="field.changed",
        record_id=None, trigger_data={"changed_field": "job_title"},
    )
    assert runs == []


@pytest.mark.asyncio
async def test_form_trigger_honours_the_chosen_form(db_session):
    """US 2.4: a form-scoped automation ignores submissions of other forms."""
    ws, person = await _seed(db_session)
    auto = await _automation(db_session, ws, person, {"form_id": "form-A"})
    auto.trigger_type = "form.submitted"
    await db_session.flush()
    svc = CRMAutomationService(db_session)

    other = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="form.submitted",
        record_id=None, trigger_data={"form_id": "form-B"},
    )
    assert other == []

    chosen = await svc.process_trigger(
        workspace_id=ws.id, object_id=person.id, trigger_type="form.submitted",
        record_id=None, trigger_data={"form_id": "form-A"},
    )
    assert len(chosen) == 1


@pytest.mark.asyncio
async def test_action_only_canvas_stays_on_inline_path(db_session):
    """No wait node => no durable hand-off (keeps the fast path, no Temporal)."""
    from aexy.models.workflow import WorkflowDefinition

    ws, person = await _seed(db_session)
    auto = await _automation(db_session, ws, person, {})
    auto.trigger_type = "record.created"
    db_session.add(WorkflowDefinition(
        id=str(uuid4()), automation_id=auto.id,
        nodes=[{"id": "t1", "type": "trigger", "data": {}},
               {"id": "a1", "type": "action", "data": {"action_type": "update_record"}}],
        edges=[{"source": "t1", "target": "a1"}],
    ))
    await db_session.flush()

    run = CRMAutomationRun(
        id=str(uuid4()), automation_id=auto.id, module="crm",
        record_id=None, trigger_data={}, status="pending", steps_executed=[],
    )
    handed_off = await CRMAutomationService(db_session)._dispatch_durably_if_needed(
        auto, run, None
    )
    assert handed_off is False


@pytest.mark.asyncio
async def test_wait_canvas_is_detected_for_handoff(db_session):
    """A wait node is recognised as needing the durable path."""
    from aexy.models.workflow import WorkflowDefinition

    ws, person = await _seed(db_session)
    auto = await _automation(db_session, ws, person, {})
    auto.trigger_type = "record.created"
    wf = WorkflowDefinition(
        id=str(uuid4()), automation_id=auto.id,
        nodes=[{"id": "t1", "type": "trigger", "data": {}},
               {"id": "w1", "type": "wait", "data": {"wait_type": "duration"}}],
        edges=[{"source": "t1", "target": "w1"}],
    )
    db_session.add(wf)
    await db_session.flush()

    # Detection only — assert the canvas is seen as durable without starting
    # Temporal (that path is covered by the live end-to-end check).
    svc = CRMAutomationService(db_session)
    loaded = await __import__(
        "aexy.services.workflow_service", fromlist=["WorkflowService"]
    ).WorkflowService(db_session).get_workflow_by_automation(auto.id)
    assert any(n.get("type") in svc._DURABLE_NODE_TYPES for n in loaded.nodes)
