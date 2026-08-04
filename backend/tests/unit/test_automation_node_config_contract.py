"""Node config panels and executors must agree on key names.

Every bug pinned here has the same shape: the builder's config panel writes one
key and the executor reads another, so the step is configured, saves, publishes,
and then does nothing (or fails) at run time.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from aexy.services.crm_automation_service import CRMAutomationService


def _service() -> CRMAutomationService:
    return CRMAutomationService.__new__(CRMAutomationService)


class TestNotifyTeamReadsThePanelsKeys:
    """The panel's only channel field is `team_channel_id`."""

    @pytest.mark.asyncio
    async def test_team_channel_id_is_used_as_the_slack_channel(self):
        service = _service()
        service._action_send_slack = AsyncMock(return_value={"sent": True})
        record = SimpleNamespace(id="rec-1", values={"name": "Ada"}, name="Ada")

        result = await service._action_notify_team(
            {"team_channel_id": "C123", "team_notify_message": "Deal moved"},
            record,
            "ws-1",
        )

        assert result == {"sent": True}
        sent_config = service._action_send_slack.await_args.args[0]
        assert sent_config["channel_id"] == "C123"
        assert "Deal moved" in sent_config["message"]

    @pytest.mark.asyncio
    async def test_title_is_included_in_the_message(self):
        service = _service()
        service._action_send_slack = AsyncMock(return_value={"sent": True})

        await service._action_notify_team(
            {
                "team_channel_id": "C123",
                "team_notify_title": "New high-value deal",
                "team_notify_message": "Acme — $40k",
            },
            None,
            "ws-1",
        )

        message = service._action_send_slack.await_args.args[0]["message"]
        assert "New high-value deal" in message
        assert "Acme — $40k" in message

    @pytest.mark.asyncio
    async def test_placeholders_in_title_and_message_resolve(self):
        service = _service()
        service._action_send_slack = AsyncMock(return_value={"sent": True})
        record = SimpleNamespace(id="rec-1", values={"name": "Acme"}, name="Acme")

        await service._action_notify_team(
            {
                "team_channel_id": "C123",
                "team_notify_title": "{{record.values.name}} updated",
                "team_notify_message": "at {{system.today}}",
            },
            record,
            "ws-1",
        )

        message = service._action_send_slack.await_args.args[0]["message"]
        assert "Acme updated" in message
        assert "{{" not in message


class TestAutomationConditionConjunction:
    """AutomationCondition.conjunction was accepted and then ignored."""

    @pytest.mark.asyncio
    async def test_or_group_matches_when_only_one_condition_holds(self):
        service = _service()
        record = SimpleNamespace(id="rec-1", values={"stage": "won", "amount": 10})

        conditions = [
            {"attribute": "stage", "operator": "equals", "value": "won", "conjunction": "or"},
            {"attribute": "amount", "operator": "gt", "value": 1000, "conjunction": "or"},
        ]

        assert await service._evaluate_conditions(conditions, record) is True

    @pytest.mark.asyncio
    async def test_and_group_still_requires_every_condition(self):
        service = _service()
        record = SimpleNamespace(id="rec-1", values={"stage": "won", "amount": 10})

        conditions = [
            {"attribute": "stage", "operator": "equals", "value": "won"},
            {"attribute": "amount", "operator": "gt", "value": 1000},
        ]

        assert await service._evaluate_conditions(conditions, record) is False

    @pytest.mark.asyncio
    async def test_or_group_is_false_when_nothing_holds(self):
        service = _service()
        record = SimpleNamespace(id="rec-1", values={"stage": "lost", "amount": 10})

        conditions = [
            {"attribute": "stage", "operator": "equals", "value": "won", "conjunction": "or"},
            {"attribute": "amount", "operator": "gt", "value": 1000, "conjunction": "or"},
        ]

        assert await service._evaluate_conditions(conditions, record) is False

    @pytest.mark.asyncio
    async def test_no_conditions_is_an_open_gate(self):
        service = _service()
        record = SimpleNamespace(id="rec-1", values={})

        assert await service._evaluate_conditions([], record) is True


class TestNotifyTeamEmailChannel:
    """The panel's Email Group option used to fall through to Slack."""

    @pytest.mark.asyncio
    async def test_email_channel_sends_to_each_address(self):
        service = _service()
        sent: list[dict] = []

        async def fake_send_email(config, record, workspace_id, trigger_data, run_id, index):
            sent.append({"to": config["to"], "subject": config["email_subject"], "index": index})
            return {"queued": True}

        service._action_send_email = fake_send_email

        result = await service._action_notify_team(
            {
                "notify_channel": "email",
                "team_emails": "ops@example.com, sales@example.com\nlead@example.com",
                "team_notify_title": "New deal",
                "team_notify_message": "Acme signed",
            },
            None,
            "ws-1",
            {},
            "run-1",
            3,
        )

        assert result["channel"] == "email"
        assert result["delivered_to"] == [
            "ops@example.com",
            "sales@example.com",
            "lead@example.com",
        ]
        assert [s["subject"] for s in sent] == ["New deal"] * 3
        # Distinct step orders so one recipient cannot close the run early.
        assert [s["index"] for s in sent] == [3, 4, 5]

    @pytest.mark.asyncio
    async def test_email_channel_with_no_addresses_is_a_failed_step(self):
        service = _service()

        result = await service._action_notify_team(
            {"notify_channel": "email", "team_emails": ""}, None, "ws-1"
        )

        assert "error" in result


class TestInlineRunContext:
    """system.execution_id and variables.* on the inline path."""

    def test_execution_id_resolves_from_the_run_payload(self):
        service = _service()

        rendered = service._replace_placeholders(
            "run {{system.execution_id}}", None, {"execution_id": "run-42"}
        )

        assert rendered == "run run-42"

    def test_node_output_references_fail_loudly_inline(self):
        """Better a failed step than {{variables.x}} posted into an email."""
        service = _service()

        with pytest.raises(ValueError, match="only available when the workflow runs as a graph"):
            service._replace_placeholders("score {{variables.previous.output}}", None, {})
