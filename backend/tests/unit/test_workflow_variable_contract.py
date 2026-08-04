"""The builder's field picker may only offer variables that actually resolve.

An unknown path is not cosmetic: the canvas/Temporal executor fails the step
with "Dynamic value '{{...}}' is missing", and the inline executor renders the
literal braces into the email or webhook body. These tests pin the three layers
that have to agree — the advertised schema, the save-time namespace check, and
both resolvers.
"""

from types import SimpleNamespace

from aexy.services.automation_trigger_schema import _CRM_TRIGGER_FIELDS
from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_actions import WorkflowActionHandler
from aexy.services.workflow_service import _VARIABLE_NAMESPACES, WorkflowService

# Keys each dispatcher puts in trigger_data, read off services/crm_events.py and
# temporal/activities/crm_automation_schedule.py. The schema is checked against
# this rather than against itself.
EMITTED_TRIGGER_KEYS: dict[str, set[str]] = {
    "record.created": {"trigger_type", "workspace_id", "object_id", "record_id", "values", "created_by_id"},
    "record.updated": {"trigger_type", "workspace_id", "object_id", "record_id", "old_values", "new_values", "changes", "updated_by_id"},
    "record.deleted": {"trigger_type", "workspace_id", "object_id", "record_id", "values", "permanent", "deleted_by_id"},
    # field.changed re-sends record.updated's payload plus the changed field.
    "field.changed": {"trigger_type", "workspace_id", "object_id", "record_id", "old_values", "new_values", "changes", "updated_by_id", "changed_field", "old_value", "new_value"},
    "stage.changed": {"trigger_type", "workspace_id", "object_id", "record_id", "old_stage", "new_stage", "changed_by_id"},
    "list_entry.added": {"trigger_type", "workspace_id", "object_id", "record_id", "list_id", "list_name", "added_by_id"},
    "list_entry.removed": {"trigger_type", "workspace_id", "object_id", "record_id", "list_id", "list_name", "removed_by_id"},
    "form.submitted": {"trigger_type", "workspace_id", "object_id", "record_id", "form_id", "form_name", "submission_id", "data"},
    "email.opened": {"trigger_type", "workspace_id", "object_id", "record_id", "campaign_id", "pixel_id"},
    "email.clicked": {"trigger_type", "workspace_id", "object_id", "record_id", "url", "campaign_id", "link_id"},
    "schedule.daily": {"trigger_type", "scheduled", "fired_at"},
    "schedule.weekly": {"trigger_type", "scheduled", "fired_at"},
    "date.approaching": {"trigger_type", "scheduled", "fired_at", "attribute_slug", "date_value", "days_until"},
    "date.passed": {"trigger_type", "scheduled", "fired_at", "attribute_slug", "date_value", "days_until"},
}


def test_every_advertised_trigger_field_is_actually_emitted():
    for trigger_type, entries in _CRM_TRIGGER_FIELDS.items():
        emitted = EMITTED_TRIGGER_KEYS[trigger_type]
        advertised = {path.removeprefix("trigger.") for path, _n, _t, _d in entries}
        unresolvable = sorted(advertised - emitted)
        assert not unresolvable, f"{trigger_type} advertises unemitted keys: {unresolvable}"


def test_retired_fake_trigger_fields_are_gone():
    """The three the picker used to offer for every trigger, that nothing sets."""
    every_path = {path for entries in _CRM_TRIGGER_FIELDS.values() for path, *_ in entries}

    assert "trigger.triggered_by" not in every_path
    assert "trigger.triggered_at" not in every_path
    # field.changed's key is changed_field; field_slug was never emitted.
    assert "trigger.field_slug" not in every_path
    assert "trigger.changed_field" in every_path


def test_system_namespace_passes_save_validation():
    """The picker offers system.*; the save-time check used to reject it."""
    assert "system" in _VARIABLE_NAMESPACES

    node = {
        "id": "a",
        "type": "action",
        "data": {
            "action_type": "send_email",
            "to": "ops@example.com",
            "email_body": "Run at {{system.now}} on {{system.today}}",
        },
    }
    nodes = [{"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}}, node]
    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"id": "e", "source": "t", "target": "a"}]
    )
    assert result.is_valid, [e.error_type for e in result.errors]


def test_canvas_resolver_resolves_system_variables():
    handler = WorkflowActionHandler.__new__(WorkflowActionHandler)
    context = WorkflowExecutionContext(
        workspace_id="ws-1",
        record_id="rec-1",
        record_data={"id": "rec-1", "values": {}},
        trigger_data={},
        variables={},
        is_dry_run=False,
    )

    now = handler._get_context_value("system.now", context)
    today = handler._get_context_value("system.today", context)

    assert now and "T" in now
    assert today and len(today) == 10
    # Unknown members stay unresolved rather than silently returning a record
    # field, which is what the old fallthrough did.
    assert handler._get_context_value("system.nonsense", context) is None


def test_inline_resolver_resolves_system_variables():
    service = CRMAutomationService.__new__(CRMAutomationService)
    record = SimpleNamespace(id="rec-1", values={"email": "ada@example.com"}, name="Ada")

    rendered = service._replace_placeholders(
        "at {{system.now}} / {{system.today}} / {{record.values.email}}",
        record,
        {},
    )

    assert "{{system.now}}" not in rendered
    assert "{{system.today}}" not in rendered
    assert "ada@example.com" in rendered


def test_both_resolvers_agree_on_system_today():
    handler = WorkflowActionHandler.__new__(WorkflowActionHandler)
    service = CRMAutomationService.__new__(CRMAutomationService)

    assert handler._system_value("today") == service._system_value("today")
    assert handler._system_value("bogus") is None
    assert service._system_value("bogus") is None
