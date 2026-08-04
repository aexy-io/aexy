"""Phase-2 palette honesty trim (US-1.5), now across every enabled module.

The registry accessors are the source of truth the frontend palette consumes.
Orphan/unwired capabilities stay hidden until wired/built — that rule is what
this file pins. The CRM-only module scope it also used to pin was lifted once
every module in the registry had a live trigger dispatch; the per-module
contract lives in test_automation_module_registry.py.
"""

from aexy.schemas.automation import (
    ENABLED_MODULES,
    get_action_ids,
    get_actions_for_module,
    get_all_actions,
    get_all_triggers,
    get_trigger_ids,
    get_triggers_for_module,
)

NON_CRM_MODULES = [
    "tickets", "hiring", "email_marketing", "uptime",
    "sprints", "forms", "booking", "tracking", "compliance",
]
HIDDEN_CRM_TRIGGERS = [
    # Still withheld: nothing routes an inbound webhook into a CRM automation.
    "webhook.received",
    # 2026-07-24: dropped from the registry outright rather than hidden.
    # status.changed has no emitter at all (pipeline moves surface as
    # stage.changed); email.replied has a dispatcher that no inbound mail
    # path ever calls. Both were on display in the builder until now.
    "status.changed", "email.replied",
]
ORPHAN_ACTIONS = ["enrich_record", "classify_record", "generate_summary"]
RELEASE_ACTIONS = [
    "send_sms",
    "webhook_call",
    # Moved out of ORPHAN_ACTIONS 2026-07-29. It was an orphan in the literal
    # sense — the config panel wrote api_url/api_method/api_body and the
    # handler read webhook_url/http_method/body_template, so nothing it was
    # configured with ever reached the executor, and the auth fields were read
    # by nothing at all. Both executors now read those keys and apply the auth
    # config, so it has the matching published handler this list is about.
    "api_request",
    "run_agent",
    "wait",
    "condition",
    "branch",
]
# Withheld by product decision rather than by a missing handler.
WITHHELD_ACTIONS = ["add_to_list", "remove_from_list"]


# --- module scoping -------------------------------------------------------

def test_all_triggers_cover_every_enabled_module():
    assert set(get_all_triggers().keys()) == set(ENABLED_MODULES)


def test_all_actions_cover_every_enabled_module_plus_common():
    assert set(get_all_actions().keys()) == {"common", *ENABLED_MODULES}


def test_non_crm_modules_are_offered():
    """Was "…_empty": each of these now dispatches, so each is offered."""
    for module in NON_CRM_MODULES:
        assert module in ENABLED_MODULES, module
        assert get_triggers_for_module(module), module
        assert get_trigger_ids(module), module
        assert get_actions_for_module(module), module
        assert get_action_ids(module), module


def test_unknown_module_registries_stay_empty():
    """ENABLED_MODULES remains the gate, so anything outside it is empty."""
    assert get_triggers_for_module("not_a_module") == []
    assert get_trigger_ids("not_a_module") == []
    assert get_actions_for_module("not_a_module") == []
    assert get_action_ids("not_a_module") == []


# --- hidden CRM capabilities ---------------------------------------------

def test_hidden_crm_triggers_removed():
    ids = get_trigger_ids("crm")
    for trig in HIDDEN_CRM_TRIGGERS:
        assert trig not in ids, trig


def test_orphan_actions_removed():
    ids = get_action_ids("crm")
    for act in ORPHAN_ACTIONS:
        assert act not in ids, act


def test_functional_release_actions_are_visible():
    """Release actions appear only after gaining matching published handlers."""
    ids = get_action_ids("crm")
    for act in RELEASE_ACTIONS:
        assert act in ids, act


def test_withheld_actions_removed():
    ids = get_action_ids("crm")
    for act in WITHHELD_ACTIONS:
        assert act not in ids, act


# --- core CRM capabilities preserved -------------------------------------

def test_crm_core_triggers_preserved():
    ids = get_trigger_ids("crm")
    for trig in ["record.created", "record.updated", "field.changed",
                 "stage.changed"]:
        assert trig in ids, trig


def test_crm_triggers_are_exactly_the_agreed_set():
    """Pin the whole list: a new registry entry must be an explicit decision.

    Each entry below has a live dispatch path as of 2026-07-24. Adding one
    without a dispatcher puts a trigger in the builder that never fires.
    """
    assert set(get_trigger_ids("crm")) == {
        # shared record save path
        "record.created", "record.updated", "record.deleted",
        "field.changed", "stage.changed",
        # list membership changes
        "list_entry.added", "list_entry.removed",
        # form submission handler
        "form.submitted",
        # email tracking endpoints
        "email.opened", "email.clicked",
        # per-minute schedule runner
        "schedule.daily", "schedule.weekly",
        "date.approaching", "date.passed",
    }


def test_crm_core_actions_preserved():
    ids = get_action_ids("crm")
    for act in ["send_email", "create_record", "update_record",
                "create_task", "notify_user"]:
        assert act in ids, act


def test_crm_actions_are_exactly_the_agreed_set():
    """Send Slack is present here and gated per workspace at the API layer."""
    assert set(get_action_ids("crm")) == {
        "send_email", "send_slack", "create_task",
        "notify_user", "notify_team", "create_record", "update_record",
        "enroll_in_sequence", "remove_from_sequence",
        # Un-hidden 2026-07-24 once each gained a real executor case.
        "delete_record", "assign_owner", "link_records",
        # Functional-release capabilities routed through inline or durable
        # execution depending on their canvas node type.
        "send_sms", "webhook_call", "run_agent",
        # Un-hidden 2026-07-29. It was withheld for having no connected
        # executor, which was true: the config panel wrote api_url/api_method/
        # api_body while the handler read webhook_url/http_method/
        # body_template, so the step failed on "No webhook URL specified"
        # however it was configured, and its auth fields were read by nothing
        # at all. Both executors now read those keys and apply the auth config.
        "api_request",
        "wait", "condition", "branch",
    }
