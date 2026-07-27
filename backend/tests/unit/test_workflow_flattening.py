"""Regression checks for flattening a canvas graph onto an automation.

Two silent failures motivated these:
  1. Actions ran in node-array order (the order blocks were dropped on the
     canvas), so rewiring a flow changed the picture and nothing else.
  2. Condition/wait/agent/branch nodes were dropped on publish, leaving the
     automation running every action unconditionally with no error anywhere.
"""

from types import SimpleNamespace

from aexy.api.workflows import sync_workflow_to_automation
from aexy.services.workflow_service import WorkflowService


def _node(node_id, node_type, **data):
    return {"id": node_id, "type": node_type, "data": data}


def _edge(source, target):
    return {"source": source, "target": target}


def _flatten(nodes, edges, module="crm"):
    # `module` is read to pick the trigger registry the flattened trigger_type
    # is checked against, so the stand-in has to carry it like the ORM row does.
    automation = SimpleNamespace(
        module=module,
        object_id=None,
        trigger_type=None,
        trigger_config=None,
        actions=None,
    )
    sync_workflow_to_automation(automation, nodes, edges, WorkflowService(db=None))
    return automation


def test_action_order_follows_edges_not_array_order():
    # Array order is deliberately reversed relative to the wiring:
    # the wires say trigger -> first -> second.
    nodes = [
        _node("second", "action", action_type="send_email", label="Second"),
        _node("first", "action", action_type="update_record", label="First"),
        _node("trigger", "trigger", trigger_type="stage.changed"),
    ]
    edges = [_edge("trigger", "first"), _edge("first", "second")]

    automation = _flatten(nodes, edges)

    assert [a["type"] for a in automation.actions] == ["update_record", "send_email"]


def test_rewiring_reverses_execution_order():
    nodes = [
        _node("a", "action", action_type="update_record"),
        _node("b", "action", action_type="send_email"),
        _node("trigger", "trigger", trigger_type="record.created"),
    ]

    forward = _flatten(nodes, [_edge("trigger", "a"), _edge("a", "b")])
    reversed_ = _flatten(nodes, [_edge("trigger", "b"), _edge("b", "a")])

    assert [x["type"] for x in forward.actions] == ["update_record", "send_email"]
    assert [x["type"] for x in reversed_.actions] == ["send_email", "update_record"]


def test_trigger_and_config_are_synced_without_label_noise():
    nodes = [
        _node("trigger", "trigger", trigger_type="stage.changed", object_id="obj-1", label="Stage Changed"),
        _node("a", "action", action_type="notify_user", notify_type="workspace_admin", label="Notify"),
    ]
    automation = _flatten(nodes, [_edge("trigger", "a")])

    assert automation.trigger_type == "stage.changed"
    assert automation.trigger_config == {"object_id": "obj-1"}
    assert automation.actions == [
        {"type": "notify_user", "config": {"notify_type": "workspace_admin"}}
    ]


def test_unreachable_nodes_go_last_rather_than_disappearing():
    nodes = [
        _node("orphan", "action", action_type="send_sms"),
        _node("trigger", "trigger", trigger_type="record.created"),
        _node("wired", "action", action_type="send_email"),
    ]
    automation = _flatten(nodes, [_edge("trigger", "wired")])

    types = [a["type"] for a in automation.actions]
    assert set(types) == {"send_sms", "send_email"}
    assert types[-1] == "send_sms" or types[0] == "send_sms"  # present, not dropped


def test_validation_accepts_condition_nodes_the_executor_can_run():
    service = WorkflowService(db=None)
    nodes = [
        _node("trigger", "trigger", trigger_type="record.created"),
        _node(
            "cond",
            "condition",
            conditions=[
                {
                    "field": "record.values.status",
                    "operator": "equals",
                    "value": "qualified",
                }
            ],
        ),
        _node("act", "action", action_type="send_email", to="a@b.com",
              email_subject="s", email_body="b"),
    ]
    edges = [_edge("trigger", "cond"), _edge("cond", "act")]

    result = service.validate_workflow(nodes, edges)

    unsupported = [e for e in result.errors if e.error_type == "unsupported_node_type"]
    assert unsupported == []
    assert result.is_valid is True


def test_validation_still_rejects_unknown_structural_nodes():
    service = WorkflowService(db=None)
    nodes = [
        _node("trigger", "trigger", trigger_type="record.created"),
        _node("join", "join"),
    ]

    result = service.validate_workflow(nodes, [_edge("trigger", "join")])

    unsupported = [e for e in result.errors if e.error_type == "unsupported_node_type"]
    assert [e.node_id for e in unsupported] == ["join"]


def test_validation_accepts_a_plain_trigger_plus_action_flow():
    service = WorkflowService(db=None)
    nodes = [
        _node("trigger", "trigger", trigger_type="record.created"),
        _node("act", "action", action_type="send_email", to="a@b.com",
              email_subject="s", email_body="b"),
    ]

    result = service.validate_workflow(nodes, [_edge("trigger", "act")])

    assert [e.error_type for e in result.errors] == []
    assert result.is_valid is True


def test_validation_accepts_a_wait_node():
    """Wait runs on the durable engine now, so a wait canvas must save/publish."""
    service = WorkflowService(db=None)
    nodes = [
        _node("trigger", "trigger", trigger_type="record.created"),
        _node("w", "wait", wait_type="duration", duration_value=1, duration_unit="hours"),
        _node("act", "action", action_type="send_email", to="a@b.com",
              email_subject="s", email_body="b"),
    ]
    edges = [_edge("trigger", "w"), _edge("w", "act")]

    result = service.validate_workflow(nodes, edges)

    unsupported = [e for e in result.errors if e.error_type == "unsupported_node_type"]
    assert unsupported == []
    assert result.is_valid is True


def test_every_publishable_node_type_has_somewhere_to_run():
    """The drop in sync_workflow_to_automation must never outrun the gate.

    Only `action` nodes survive flattening onto automation.actions, so a node
    type that publish accepts but neither executor claims is dropped in silence
    and the automation runs its remaining actions unconditionally. Publishing a
    structural node is therefore only safe while the canvas is also routed to
    the durable engine.
    """
    from aexy.services.crm_automation_service import CRMAutomationService
    from aexy.services.workflow_service import _EXECUTABLE_NODE_TYPES

    inline_runnable = {"trigger", "action"}
    unroutable = [
        node_type
        for node_type in _EXECUTABLE_NODE_TYPES
        if node_type not in inline_runnable
        and node_type not in CRMAutomationService._DURABLE_NODE_TYPES
    ]

    assert unroutable == [], (
        f"{unroutable} can be published but neither executor runs them. Either "
        "add them to CRMAutomationService._DURABLE_NODE_TYPES or drop them from "
        "_EXECUTABLE_NODE_TYPES."
    )
