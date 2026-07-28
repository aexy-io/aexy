"""Regression checks for the workspace-admin notify target.

Covers the "Deal Stage Notification" template path: notify every owner/admin
by email, minus whoever moved the deal.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from aexy.services.crm_automation_service import CRMAutomationService


def _member(developer_id, email):
    return SimpleNamespace(
        developer_id=developer_id,
        developer=SimpleNamespace(id=developer_id, email=email),
    )


def _service_with_admins(members):
    service = CRMAutomationService(db=None)
    service._action_send_email = AsyncMock(return_value={"success": True})
    service._action_send_slack = AsyncMock(return_value={"success": True})

    workspace_service = SimpleNamespace(
        get_workspace_admins=AsyncMock(return_value=members)
    )
    return service, workspace_service


@pytest.mark.asyncio
async def test_notifies_every_admin_by_email():
    members = [_member("dev-1", "owner@example.com"), _member("dev-2", "admin@example.com")]
    service, workspace_service = _service_with_admins(members)

    with patch(
        "aexy.services.workspace_service.WorkspaceService",
        return_value=workspace_service,
    ):
        result = await service._action_notify_user(
            {
                "notify_type": "workspace_admin",
                "channel": "email",
                "notify_title": "Deal stage changed",
                "notify_message": "{{record.values.name}} moved on.",
            },
            SimpleNamespace(id="rec-1", name="Acme", values={"name": "Acme"}),
            "ws-1",
            {"changed_by_id": "dev-9"},
        )

    assert result["success"] is True
    assert result["recipients_notified"] == 2
    assert service._action_send_email.await_count == 2
    # Admins are fetched unfiltered so "nobody but the actor" can be told apart
    # from "no admins at all"; the actor is excluded afterwards.
    workspace_service.get_workspace_admins.assert_awaited_once_with("ws-1")
    # Subject/body come from the builder's field names, not blank defaults.
    sent = service._action_send_email.await_args_list[0].args[0]
    assert sent["email_subject"] == "Deal stage changed"
    # Handed over unrendered on purpose: _action_send_email renders the body
    # into html_body with per-value escaping. Substituting here would leave it
    # nothing to escape and put raw record markup back into the email.
    assert sent["email_body"] == "{{record.values.name}} moved on."


@pytest.mark.asyncio
async def test_reports_failure_when_no_admins_remain():
    service, workspace_service = _service_with_admins([])

    with patch(
        "aexy.services.workspace_service.WorkspaceService",
        return_value=workspace_service,
    ):
        result = await service._action_notify_user(
            {"notify_type": "workspace_admin", "channel": "email"},
            None,
            "ws-1",
            {"changed_by_id": "dev-1"},
        )

    assert "error" in result
    service._action_send_email.assert_not_awaited()


@pytest.mark.asyncio
async def test_single_user_target_still_requires_a_recipient():
    service = CRMAutomationService(db=None)

    result = await service._action_notify_user({"channel": "email"}, None, "ws-1", None)

    assert result["error"] == "No user_id or user_email specified"


@pytest.mark.asyncio
async def test_specific_email_sends_without_an_aexy_user_account():
    service = CRMAutomationService(db=None)
    service._action_send_email = AsyncMock(return_value={"success": True, "queued": True})

    result = await service._action_notify_user(
        {
            "notify_type": "email",
            "notify_email": "customer@example.com",
            "notify_title": "Deal stage changed",
            "notify_message": "The deal moved.",
        },
        None,
        "ws-1",
        None,
        "run-1",
        2,
    )

    assert result["success"] is True
    assert result["queued"] is True
    assert result["recipients_notified"] == 1
    service._action_send_email.assert_awaited_once()
    args = service._action_send_email.await_args.args
    assert args[0]["to"] == "customer@example.com"
    assert args[0]["email_subject"] == "Deal stage changed"
    assert args[4:] == ("run-1", 2)


@pytest.mark.asyncio
async def test_solo_admin_moving_own_deal_is_a_no_op_not_a_failure():
    """A workspace whose only admin is the actor has nobody left to tell.

    That is the exclusion working, not a failure, so the run must not be
    recorded as failed on every self-triggered stage change.
    """
    members = [_member("dev-1", "owner@example.com")]
    service, workspace_service = _service_with_admins(members)

    with patch(
        "aexy.services.workspace_service.WorkspaceService",
        return_value=workspace_service,
    ):
        result = await service._action_notify_user(
            {"notify_type": "workspace_admin", "channel": "email"},
            None,
            "ws-1",
            {"changed_by_id": "dev-1"},
        )

    assert result["success"] is True
    assert result["skipped"] is True
    assert "error" not in result
    service._action_send_email.assert_not_awaited()


@pytest.mark.asyncio
async def test_undelivered_notification_reports_a_top_level_error():
    """The executor only fails a step on a top-level "error".

    A nested-only failure was recorded as a successful step.
    """
    service = CRMAutomationService(db=None)
    service._action_send_email = AsyncMock(
        return_value={"error": "No recipient email address specified"}
    )

    result = await service._action_notify_user(
        {"notify_type": "email", "notify_email": "{{record.values.missing}}"},
        None,
        "ws-1",
        None,
    )

    assert result["success"] is False
    # The message names the channel and the recipient. On "both" a half
    # failure has to be distinguishable from a total one, so a generic
    # sentence is not enough.
    assert "Email to" in result["error"]
    assert "No recipient email address specified" in result["error"]


@pytest.mark.asyncio
async def test_undelivered_slack_notification_reports_a_top_level_error():
    """Reachable over the API even though no screen offers a channel picker."""
    service = CRMAutomationService(db=None)
    service._action_send_slack = AsyncMock(return_value={"success": False})
    service._action_send_email = AsyncMock(return_value={"success": True})

    result = await service._action_notify_user(
        {"notify_type": "email", "notify_email": "a@example.com", "channel": "slack"},
        None,
        "ws-1",
        None,
    )

    assert result["success"] is False
    assert "Slack to" in result["error"]


@pytest.mark.asyncio
async def test_queued_email_is_not_treated_as_a_failure():
    """Guards against over-correcting: a handed-off email is not an error."""
    service = CRMAutomationService(db=None)
    service._action_send_email = AsyncMock(
        return_value={"success": True, "queued": True}
    )

    result = await service._action_notify_user(
        {"notify_type": "email", "notify_email": "a@example.com"},
        None,
        "ws-1",
        None,
        "run-1",
        0,
    )

    assert result["success"] is True
    assert result["queued"] is True
    assert "error" not in result


@pytest.mark.asyncio
async def test_a_half_delivered_both_channel_notification_is_not_a_success():
    """Slack failing while email queues used to read as a clean success.

    `channels_notified` was non-empty, so no top-level error was set and the
    executor recorded the step green — the half that never arrived left no
    trace in run history.
    """
    service = CRMAutomationService(db=None)
    service._action_send_slack = AsyncMock(
        return_value={"success": False, "error": "channel_not_found"}
    )
    service._action_send_email = AsyncMock(
        return_value={"success": True, "queued": True, "to": "a@example.com"}
    )

    result = await service._action_notify_user(
        {
            "notify_type": "email",
            "notify_email": "a@example.com",
            "channel": "both",
        },
        None,
        "ws-1",
        None,
    )

    assert "error" in result, "a failed channel must reach the executor's gate"
    assert "channel_not_found" in result["error"]
    assert result["failures"] == [
        "Slack to a@example.com: channel_not_found"
    ]
