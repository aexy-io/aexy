"""The trigger schema must describe every module, and only with real keys."""

from aexy.schemas.automation import ENABLED_MODULES, get_trigger_ids
from aexy.services.automation_trigger_schema import (
    _CRM_TRIGGER_FIELDS,
    _MODULE_TRIGGER_FIELDS,
    trigger_fields_for,
)


def test_every_visible_trigger_has_a_described_payload():
    """A trigger with no fields leaves the builder guessing at {{trigger.*}}."""
    missing = []
    for module in ENABLED_MODULES:
        for trigger_type in get_trigger_ids(module):
            if not trigger_fields_for(module, trigger_type):
                missing.append(f"{module}/{trigger_type}")
    assert not missing, f"triggers with no field schema: {missing}"


def test_every_path_is_a_trigger_path():
    for module, triggers in {"crm": _CRM_TRIGGER_FIELDS, **_MODULE_TRIGGER_FIELDS}.items():
        entries = triggers.values() if module == "crm" else triggers.values()
        for fields in entries:
            for path, name, type_, _description in fields:
                assert path.startswith("trigger."), f"{module}: {path}"
                assert name, f"{module}: {path} has no label"
                assert type_, f"{module}: {path} has no type"


def test_no_duplicate_paths_within_a_trigger():
    for module in ("crm", *_MODULE_TRIGGER_FIELDS):
        for trigger_type in (
            _CRM_TRIGGER_FIELDS if module == "crm" else _MODULE_TRIGGER_FIELDS[module]
        ):
            paths = [p for p, *_ in trigger_fields_for(module, trigger_type)]
            assert len(paths) == len(set(paths)), f"{module}/{trigger_type} repeats a path"


def test_unknown_pairs_return_nothing_rather_than_guessing():
    assert trigger_fields_for("tickets", "not.a.trigger") == ()
    assert trigger_fields_for("not_a_module", "ticket.created") == ()
    assert trigger_fields_for("crm", None) == ()


def test_module_payloads_match_their_dispatchers():
    """Spot-checks against the services that emit these events."""
    tickets = dict(
        (p, t) for p, _n, t, _d in trigger_fields_for("tickets", "ticket.created")
    )
    # ticket_service.create_ticket's payload
    assert "trigger.ticket_id" in tickets
    assert "trigger.ticket_number" in tickets
    assert "trigger.submitter_email" in tickets
    assert tickets["trigger.field_values"] == "object"

    # uptime_service's base payload is shared by every monitor.* event
    monitor_down = {p for p, *_ in trigger_fields_for("uptime", "monitor.down")}
    assert {"trigger.monitor_id", "trigger.monitor_name", "trigger.url"} <= monitor_down

    # tracking_events.emit_standup_streak
    streak = {p for p, *_ in trigger_fields_for("tracking", "standup.streak")}
    assert {"trigger.streak_count", "trigger.milestone"} <= streak

    # compliance_service assignment reminders
    overdue = {p for p, *_ in trigger_fields_for("compliance", "assignment.overdue")}
    assert {"trigger.assignment_id", "trigger.developer_id", "trigger.days_overdue"} <= overdue


def test_crm_schema_is_unchanged_by_the_move():
    """The CRM table moved modules; its contents are the contract."""
    created = {p for p, *_ in trigger_fields_for("crm", "record.created")}
    assert created == {
        "trigger.trigger_type",
        "trigger.workspace_id",
        "trigger.object_id",
        "trigger.record_id",
        "trigger.values",
        "trigger.created_by_id",
    }
