"""Contract checks for the multi-module automation registry.

The builder's module picker offers every module in ENABLED_MODULES, so each one
has to hold up the same bargain CRM already does: a non-empty palette, and no
step it cannot run. These generalise
test_crm_automations_functional_release.py's CRM-only executor check to all
enabled modules.
"""

from aexy.schemas.automation import (
    ACTION_REGISTRY,
    ENABLED_MODULES,
    STRUCTURAL_CAPABILITIES,
    TRIGGER_REGISTRY,
    UNAVAILABLE_ACTION_REASONS_BY_MODULE,
    UNAVAILABLE_TRIGGER_REASONS_BY_MODULE,
    get_action_ids,
    get_actions_for_module,
    get_enabled_modules,
    get_trigger_ids,
)
from aexy.services.automation_module_actions import MODULE_ACTION_ADAPTERS
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_actions import WorkflowActionHandler
from aexy.services.workflow_service import WorkflowService


def _executable_actions() -> set[str]:
    """Actions runnable on BOTH paths: canvas/Temporal and inline.

    The canvas path dispatches either from its own handler map or from the
    shared module-action table, which is where module actions live so that both
    paths run the same code.
    """
    canvas = set(WorkflowActionHandler.ACTION_HANDLER_METHODS) | set(
        MODULE_ACTION_ADAPTERS
    )
    return canvas & set(CRMAutomationService.INLINE_ACTION_TYPES)


def test_enabled_modules_are_registered_modules():
    assert set(ENABLED_MODULES) <= set(TRIGGER_REGISTRY)
    assert get_enabled_modules() == list(ENABLED_MODULES)


def test_every_enabled_module_has_a_usable_palette():
    """An enabled module with an empty palette is a dead dropdown entry."""
    for module in ENABLED_MODULES:
        assert get_trigger_ids(module), f"{module} has no visible triggers"
        assert get_action_ids(module), f"{module} has no visible actions"


def test_every_visible_action_is_executable_on_both_run_paths():
    executable = _executable_actions()
    structural = set(STRUCTURAL_CAPABILITIES)

    for module in ENABLED_MODULES:
        offered = set(get_action_ids(module)) - structural
        unrunnable = sorted(offered - executable)
        assert not unrunnable, f"{module} offers unrunnable actions: {unrunnable}"


def test_disabled_module_registries_stay_empty():
    """The gate is ENABLED_MODULES, not the registry dicts."""
    assert get_trigger_ids("not_a_module") == []
    assert get_action_ids("not_a_module") == []


def test_per_module_withholding_targets_real_registry_entries():
    """A typo'd id would silently hide nothing — catch it here."""
    for module, reasons in UNAVAILABLE_TRIGGER_REASONS_BY_MODULE.items():
        declared = {entry["id"] for entry in TRIGGER_REGISTRY.get(module, [])}
        unknown = sorted(set(reasons) - declared)
        assert not unknown, f"{module} hides unknown triggers: {unknown}"
        assert all(reason.strip() for reason in reasons.values())

    for module, reasons in UNAVAILABLE_ACTION_REASONS_BY_MODULE.items():
        declared = {entry["id"] for entry in ACTION_REGISTRY.get(module, [])}
        unknown = sorted(set(reasons) - declared)
        assert not unknown, f"{module} hides unknown actions: {unknown}"
        assert all(reason.strip() for reason in reasons.values())


def test_withholding_one_module_does_not_hide_the_id_elsewhere():
    """The collision that motivated per-module maps.

    sprints and tracking both declare blocker.created/blocker.resolved; only
    tracking dispatches them. A flat hidden-set would have hidden both.
    """
    tracking = set(get_trigger_ids("tracking"))
    sprints = set(get_trigger_ids("sprints"))

    assert {"blocker.created", "blocker.resolved"} <= tracking
    assert not {"blocker.created", "blocker.resolved"} & sprints


def test_an_action_declared_in_both_scopes_is_offered_once():
    """sprints redeclares the common `create_task`."""
    ids = get_action_ids("sprints")

    assert ids.count("create_task") == 1
    assert len(ids) == len(set(ids))

    entry = next(e for e in get_actions_for_module("sprints") if e["id"] == "create_task")
    assert entry["description"] == "Create a new task in a sprint"


def _graph(trigger_type: str) -> tuple[list[dict], list[dict]]:
    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": trigger_type}},
        {
            "id": "a",
            "type": "action",
            "data": {
                "action_type": "send_email",
                "to": "ops@example.com",
                "email_body": "body",
            },
        },
    ]
    return nodes, [{"id": "e", "source": "t", "target": "a"}]


def _trigger_errors(module: str, trigger_type: str) -> list[str]:
    nodes, edges = _graph(trigger_type)
    result = WorkflowService(db=None).validate_workflow(nodes, edges, module)
    return [e.error_type for e in result.errors]


def test_canvas_validation_uses_the_automations_own_module():
    """A hiring graph was rejected because validation always read CRM's registry.

    Every non-CRM canvas save returned 400 unknown_trigger_type, so the module
    picker would have been unusable without this.
    """
    assert _trigger_errors("hiring", "candidate.created") == []
    assert _trigger_errors("tickets", "ticket.created") == []
    assert _trigger_errors("compliance", "training.assigned") == []


def test_canvas_validation_still_rejects_out_of_module_triggers():
    assert "unknown_trigger_type" in _trigger_errors("crm", "candidate.created")
    assert "unknown_trigger_type" in _trigger_errors("hiring", "stage.changed")
    # Withheld for hiring: no emitter, so it must not pass validation either.
    assert "unknown_trigger_type" in _trigger_errors("hiring", "offer.sent")


def test_canvas_validation_defaults_to_crm():
    nodes, edges = _graph("record.created")
    assert WorkflowService(db=None).validate_workflow(nodes, edges).is_valid


def test_crm_visibility_is_unchanged_by_the_widening():
    """CRM's own withheld set is untouched by the per-module additions."""
    crm_triggers = set(get_trigger_ids("crm"))

    assert "stage.changed" in crm_triggers
    assert "email.opened" in crm_triggers  # also an email_marketing id
    assert "form.submitted" in crm_triggers  # also a forms id
    assert not {"webhook.received", "email.replied", "status.changed"} & crm_triggers
