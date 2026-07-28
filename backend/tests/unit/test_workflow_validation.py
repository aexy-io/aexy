"""Unit tests for CRM automation workflow validation.

Covers the Phase-1 hardening stories in the CRM automations tracker:
  US-6.1 required-field enforcement per action type
  US-6.2 email literal format validation
  US-6.4 variable-reference syntax validation
  US-1.3 publish gating (validate_workflow is the gate publish uses)

validate_workflow / _validate_node are pure (no DB), so the service is
constructed with db=None.
"""

import pytest

from aexy.services.workflow_service import WorkflowService


@pytest.fixture
def svc():
    return WorkflowService(db=None)


def _wf(*action_nodes):
    """Build a minimal valid-structure workflow: one trigger wired to each action."""
    trigger = {"id": "t1", "type": "trigger", "data": {"trigger_type": "record.created"}}
    nodes = [trigger, *action_nodes]
    edges = [
        {"id": f"e{i}", "source": "t1", "target": n["id"]}
        for i, n in enumerate(action_nodes)
    ]
    return nodes, edges


def _action(action_id, action_type, **data):
    return {"id": action_id, "type": "action", "data": {"action_type": action_type, **data}}


def err_types(result):
    return {e.error_type for e in result.errors}


# ---------------------------------------------------------------------------
# 1.1 Required fields per action type (US-6.1)
# ---------------------------------------------------------------------------

def test_required_fields_send_email_missing_recipient(svc):
    node = _action("a1", "send_email", email_body="hi")
    r = svc.validate_workflow(*_wf(node))
    assert not r.is_valid
    assert "missing_email_recipient" in err_types(r)


def test_required_fields_send_email_valid_with_to(svc):
    node = _action("a1", "send_email", email_body="hi", to="a@b.com")
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid, err_types(r)


def test_required_fields_send_email_valid_with_email_field(svc):
    # A field reference (not a literal address) satisfies the recipient requirement.
    node = _action("a1", "send_email", email_body="hi", email_field="email")
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid, err_types(r)


def test_required_fields_webhook_missing_url(svc):
    node = _action("a1", "webhook_call")
    r = svc.validate_workflow(*_wf(node))
    assert "missing_webhook_url" in err_types(r)


def test_required_fields_create_task_missing_title(svc):
    node = _action("a1", "create_task")
    r = svc.validate_workflow(*_wf(node))
    assert "missing_task_title" in err_types(r)


def test_required_fields_add_to_list_missing_list(svc):
    node = _action("a1", "add_to_list")
    r = svc.validate_workflow(*_wf(node))
    assert "missing_list" in err_types(r)


def test_notify_user_requires_a_specific_email(svc):
    node = _action("a1", "notify_user", notify_type="email")
    r = svc.validate_workflow(*_wf(node))
    assert "missing_notification_recipient" in err_types(r)


def test_notify_user_accepts_a_specific_email(svc):
    node = _action("a1", "notify_user", notify_type="email", notify_email="user@example.com")
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid, err_types(r)


# ---------------------------------------------------------------------------
# 1.2 Email literal format validation (US-6.2)
# ---------------------------------------------------------------------------

def test_email_literal_invalid_format(svc):
    node = _action("a1", "send_email", email_body="hi", to="not-an-email")
    r = svc.validate_workflow(*_wf(node))
    assert not r.is_valid
    assert "invalid_email" in err_types(r)


def test_email_literal_valid_format(svc):
    node = _action("a1", "send_email", email_body="hi", to="user@example.com")
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid, err_types(r)


def test_notification_email_literal_invalid_format(svc):
    node = _action("a1", "notify_user", notify_type="email", notify_email="not-an-email")
    r = svc.validate_workflow(*_wf(node))
    assert "invalid_email" in err_types(r)


def test_email_literal_variable_is_not_format_checked(svc):
    node = _action("a1", "send_email", email_body="hi", to="{{record.values.email}}")
    r = svc.validate_workflow(*_wf(node))
    assert "invalid_email" not in err_types(r)
    assert r.is_valid, err_types(r)


# ---------------------------------------------------------------------------
# 1.3 Variable-reference syntax validation (US-6.4)
# ---------------------------------------------------------------------------

def test_variable_reference_malformed_braces(svc):
    node = _action("a1", "send_email", to="a@b.com", email_body="Hi {{record.values.name")
    r = svc.validate_workflow(*_wf(node))
    assert not r.is_valid
    assert "malformed_variable" in err_types(r)


def test_variable_reference_unknown_namespace(svc):
    node = _action("a1", "send_email", to="a@b.com", email_body="Hi {{name}}")
    r = svc.validate_workflow(*_wf(node))
    assert not r.is_valid
    assert "unknown_variable_namespace" in err_types(r)


def test_variable_reference_valid(svc):
    node = _action(
        "a1", "send_email", to="a@b.com",
        email_body="Hi {{record.values.name}} from {{trigger.actor}}",
    )
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid, err_types(r)


# ---------------------------------------------------------------------------
# 1.4 Publish gating (US-1.3) — validate_workflow is the gate publish_workflow uses
# ---------------------------------------------------------------------------

def test_publish_gating_invalid_blocks(svc):
    node = _action("a1", "send_email")  # no recipient, no content
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid is False
    assert len(r.errors) >= 1


def test_publish_gating_valid_passes(svc):
    node = _action("a1", "send_email", to="a@b.com", email_body="Hi")
    r = svc.validate_workflow(*_wf(node))
    assert r.is_valid is True


def test_existing_behavior_preserved_send_email_missing_content(svc):
    # Regression: the pre-existing content check must still fire.
    node = _action("a1", "send_email", to="a@b.com")
    r = svc.validate_workflow(*_wf(node))
    assert "missing_email_content" in err_types(r)


# ---------------------------------------------------------------------------
# 1.5 Dynamic-field type check — light: numeric literals (US-6.3)
# ---------------------------------------------------------------------------

def _wait(node_id, **data):
    return {"id": node_id, "type": "wait", "data": {"wait_type": "duration", **data}}


def _condition(node_id, operator, value):
    return {
        "id": node_id,
        "type": "condition",
        "data": {"conditions": [{"field": "score", "operator": operator, "value": value}]},
    }


def test_field_type_wait_duration_non_numeric(svc):
    r = svc.validate_workflow(*_wf(_wait("w1", duration_value="abc")))
    assert "invalid_duration" in err_types(r)


def test_field_type_wait_duration_numeric_string_ok(svc):
    r = svc.validate_workflow(*_wf(_wait("w1", duration_value="5")))
    assert "invalid_duration" not in err_types(r)


def test_field_type_wait_duration_int_ok(svc):
    r = svc.validate_workflow(*_wf(_wait("w1", duration_value=5)))
    assert "invalid_duration" not in err_types(r)


def test_field_type_wait_duration_variable_skipped(svc):
    r = svc.validate_workflow(*_wf(_wait("w1", duration_value="{{variables.days}}")))
    assert "invalid_duration" not in err_types(r)


def test_field_type_condition_numeric_operator_non_numeric(svc):
    r = svc.validate_workflow(*_wf(_condition("c1", "gt", "abc")))
    assert "invalid_condition_value" in err_types(r)


def test_field_type_condition_numeric_operator_ok(svc):
    r = svc.validate_workflow(*_wf(_condition("c1", "gte", "50")))
    assert "invalid_condition_value" not in err_types(r)


def test_field_type_condition_string_operator_allows_text(svc):
    r = svc.validate_workflow(*_wf(_condition("c1", "equals", "active")))
    assert "invalid_condition_value" not in err_types(r)
