"""Module actions must exist on both run paths, and only where they can work.

The registry offers an action when both the canvas/Temporal executor and the
inline executor can run it. Module actions live in one shared place
(automation_module_actions) precisely so that is true by construction rather
than by two lists being kept in step by hand — which is how add_tag,
add_response, add_note, create_offer and send_reminder ended up canvas-only and
therefore invisible.
"""

from aexy.schemas.automation import (
    ACTION_REGISTRY,
    ENABLED_MODULES,
    STRUCTURAL_CAPABILITIES,
    UNAVAILABLE_ACTION_REASONS_BY_MODULE,
    get_action_ids,
)
from aexy.services.automation_module_actions import MODULE_ACTION_ADAPTERS
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_actions import WorkflowActionHandler


def _runnable() -> set[str]:
    """Actions both executors can run."""
    canvas = set(WorkflowActionHandler.ACTION_HANDLER_METHODS) | set(MODULE_ACTION_ADAPTERS)
    inline = set(CRMAutomationService.INLINE_ACTION_TYPES)
    return canvas & inline


def test_every_offered_action_runs_on_both_paths():
    structural = set(STRUCTURAL_CAPABILITIES)
    runnable = _runnable()

    for module in ENABLED_MODULES:
        offered = set(get_action_ids(module)) - structural
        unrunnable = sorted(offered - runnable)
        assert not unrunnable, f"{module} offers unrunnable actions: {unrunnable}"


def test_shared_module_actions_are_reachable_from_the_inline_path():
    """INLINE_ACTION_TYPES is derived from the table, not re-typed."""
    assert set(MODULE_ACTION_ADAPTERS) <= set(CRMAutomationService.INLINE_ACTION_TYPES)


def test_actions_the_canvas_used_to_own_alone_are_now_shared():
    """The five whose canvas handlers were removed in favour of shared ones."""
    for action in ("add_response", "add_tag", "remove_tag", "add_note", "create_offer"):
        assert action in MODULE_ACTION_ADAPTERS, action
        # The canvas method map must not shadow the shared implementation.
        assert action not in WorkflowActionHandler.ACTION_HANDLER_METHODS, action


def test_newly_implemented_actions_are_no_longer_withheld():
    still_hidden = {
        action
        for reasons in UNAVAILABLE_ACTION_REASONS_BY_MODULE.values()
        for action in reasons
    }

    for action in (
        "change_status",
        "merge_tickets",
        "reject_candidate",
        "send_assessment",
        "acknowledge_incident",
        "add_to_sprint",
        "remove_from_sprint",
        "add_to_campaign",
        "remove_from_campaign",
        "update_recipient",
        "pause_campaign",
        "resume_campaign",
        "escalate_blocker",
        "flag_anomaly",
        "create_crm_record",
        "create_ticket",
        "waive_training",
    ):
        assert action not in still_hidden, f"{action} is implemented but still hidden"


def test_what_stays_withheld_says_why():
    """A withheld action needs a reason a reader can act on."""
    for module, reasons in UNAVAILABLE_ACTION_REASONS_BY_MODULE.items():
        for action, reason in reasons.items():
            assert len(reason.strip()) > 20, f"{module}.{action} has a thin reason"

    # The ones that need a subsystem that does not exist yet.
    assert "page_on_call" in UNAVAILABLE_ACTION_REASONS_BY_MODULE["uptime"]
    assert "restrict_permissions" in UNAVAILABLE_ACTION_REASONS_BY_MODULE["compliance"]
    assert "update_activity_pattern" in UNAVAILABLE_ACTION_REASONS_BY_MODULE["tracking"]


def test_waive_training_is_declared_in_the_registry():
    compliance_ids = {entry["id"] for entry in ACTION_REGISTRY["compliance"]}
    assert "waive_training" in compliance_ids
    assert "waive_training" in get_action_ids("compliance")


def test_adapters_cover_only_declared_registry_actions():
    """An adapter for an id no module declares would be unreachable code."""
    declared = {
        entry["id"]
        for scope in ("common", *ENABLED_MODULES)
        for entry in ACTION_REGISTRY.get(scope, [])
    }
    unknown = sorted(set(MODULE_ACTION_ADAPTERS) - declared)
    assert not unknown, f"adapters for undeclared actions: {unknown}"
