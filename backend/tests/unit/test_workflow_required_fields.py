"""Publish-time required-field checks must match what the builder saves.

These checks read the node config the config panel writes. When the two use
different spellings for the same setting, a correctly filled-in step can never
be saved — the builder shows a filled field and the validator insists it is
empty.
"""

from unittest.mock import MagicMock

from aexy.services.workflow_service import WorkflowService


def _canvas(action_data: dict) -> tuple[list[dict], list[dict]]:
    nodes = [
        {"id": "n1", "type": "trigger", "data": {"trigger_type": "field.changed"}},
        {"id": "n2", "type": "action", "data": action_data},
    ]
    edges = [{"id": "e1", "source": "n1", "target": "n2"}]
    return nodes, edges


def _errors_for(action_data: dict) -> list[str]:
    nodes, edges = _canvas(action_data)
    result = WorkflowService(MagicMock()).validate_workflow(nodes, edges)
    return [e.error_type for e in result.errors]


def test_task_step_saved_by_the_builder_is_accepted():
    """Regression: the panel saves task_title, the check only read title."""
    errors = _errors_for(
        {"action_type": "create_task", "task_title": "Follow up on {{record.name}}"}
    )

    assert "missing_task_title" not in errors


def test_task_step_with_the_other_spelling_is_also_accepted():
    errors = _errors_for({"action_type": "create_task", "title": "Follow up"})

    assert "missing_task_title" not in errors


def test_task_step_with_no_title_at_all_is_still_rejected():
    """The check must keep doing its job — this is not a blanket pass."""
    errors = _errors_for({"action_type": "create_task"})

    assert "missing_task_title" in errors


def test_email_step_saved_by_the_builder_is_accepted():
    errors = _errors_for({"action_type": "send_email", "to": "ada@example.com"})

    assert "missing_email_recipient" not in errors
