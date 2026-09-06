"""Routines on a clock, and the remote server's prompts and resources."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from aexy.models.agent import CRMAgent
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.agent_principal_service import AgentPrincipalService
from aexy.services.agent_schedule_service import AgentScheduleService, ScheduleError, _aware
from aexy.services.mcp_prompts import (
    CAPABILITIES_URI,
    prompts_for,
    read_resource,
    render_prompt,
    resources_for,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def setup(db_session):
    owner = Developer(email="o@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(name="W", slug="w", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="owner"))
    principal = await AgentPrincipalService(db_session).create(
        workspace_id=str(ws.id), name="Bot", description=None,
        capabilities=["mcp.service_desk"], created_by_id=str(owner.id),
    )
    with_principal = CRMAgent(
        workspace_id=ws.id, name="Triage", agent_type="custom", tools=["aexy_sd_open_tickets"],
        principal_id=principal.id,
    )
    without = CRMAgent(workspace_id=ws.id, name="Loose", agent_type="custom", tools=[])
    db_session.add_all([with_principal, without])
    await db_session.commit()
    return owner, ws, with_principal, without


class TestSchedules:
    async def test_an_agent_without_a_principal_cannot_be_scheduled(self, db_session, setup):
        owner, ws, _agent, loose = setup
        with pytest.raises(ScheduleError):
            await AgentScheduleService(db_session).create(
                workspace_id=str(ws.id), agent_id=str(loose.id), name="x", routine="do",
                interval_minutes=60, tz="UTC", enabled=True, created_by_id=str(owner.id),
            )

    async def test_creation_does_not_fire_immediately(self, db_session, setup):
        owner, ws, agent, _ = setup
        row = await AgentScheduleService(db_session).create(
            workspace_id=str(ws.id), agent_id=str(agent.id), name="Daily triage",
            routine="Triage the desk", interval_minutes=1440, tz="UTC", enabled=True,
            created_by_id=str(owner.id),
        )
        assert row.next_run_at is not None
        assert _aware(row.next_run_at) > datetime.now(timezone.utc) + timedelta(hours=23)
        assert await AgentScheduleService(db_session).due() == []

    async def test_due_rows_fire_once_and_advance_on_the_slot(self, db_session, setup):
        owner, ws, agent, _ = setup
        service = AgentScheduleService(db_session)
        row = await service.create(
            workspace_id=str(ws.id), agent_id=str(agent.id), name="Hourly",
            routine="Sweep", interval_minutes=60, tz="UTC", enabled=True,
            created_by_id=str(owner.id),
        )
        # Pretend the slot was three hours ago and the tick is late.
        slot = datetime.now(timezone.utc) - timedelta(hours=3)
        row.next_run_at = slot
        await db_session.flush()

        dispatched: list[tuple[str, str | None]] = []

        async def fake_dispatch(activity, input, task_queue=None, workflow_id=None, **_):
            dispatched.append((input.agent_id, workflow_id))
            assert input.triggered_by == "schedule"
            assert input.trigger_id == str(row.id)
            assert input.context["routine"] == "Sweep"
            assert input.user_id is None
            return "run-1"

        with patch("aexy.temporal.dispatch.dispatch", new=fake_dispatch):
            fired = await service.run_due()
        assert fired == 1
        assert dispatched[0][0] == str(agent.id)
        assert dispatched[0][1].startswith(f"agent-schedule-{row.id}-")
        # Advanced past now, anchored on the slot rather than drifting to now.
        assert _aware(row.next_run_at) > datetime.now(timezone.utc)
        assert (_aware(row.next_run_at) - slot).total_seconds() % 3600 == 0
        assert row.run_count == 1

        with patch("aexy.temporal.dispatch.dispatch", new=fake_dispatch):
            assert await service.run_due() == 0

    async def test_losing_the_principal_disables_the_schedule(self, db_session, setup):
        owner, ws, agent, _ = setup
        service = AgentScheduleService(db_session)
        row = await service.create(
            workspace_id=str(ws.id), agent_id=str(agent.id), name="Hourly",
            routine="Sweep", interval_minutes=60, tz="UTC", enabled=True,
            created_by_id=str(owner.id),
        )
        row.next_run_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        agent.principal_id = None
        await db_session.flush()

        with patch("aexy.temporal.dispatch.dispatch", new=AsyncMock(return_value="x")):
            fired = await service.run_due()
        assert fired == 0
        assert row.enabled is False
        assert row.next_run_at is None


class TestPromptsAndResources:
    def test_prompts_are_filtered_to_granted_capabilities(self):
        names = {p["name"] for p in prompts_for({"mcp.service_desk"})}
        assert {"service_desk_triage", "tat_review"} <= names
        assert "sprint_standup" not in names
        assert "leave_approvals" not in names

    def test_a_prompt_renders_its_arguments(self):
        rendered = render_prompt("tat_review", {"pending_with": "finance"}, {"mcp.service_desk"})
        text = rendered["messages"][0]["content"]["text"]
        assert "pending with finance" in text
        assert "aexy_sd_tat_report" in text

    def test_an_ungranted_prompt_is_unknown(self):
        assert render_prompt("sprint_standup", {}, {"mcp.crm"}) is None

    def test_resources_list_capabilities_and_granted_catalogues(self):
        catalog = {
            "capabilities": [
                {"capability": "mcp.crm", "operation_count": 1, "operations": [
                    {"action": "list_records", "method": "GET", "path": "/x", "summary": "", "mutating": False}
                ]},
                {"capability": "mcp.admin", "operation_count": 1, "operations": []},
            ]
        }
        uris = {r["uri"] for r in resources_for(catalog, {"mcp.crm"})}
        assert uris == {CAPABILITIES_URI, "aexy://catalog/crm"}
        assert read_resource("aexy://catalog/admin", catalog, {"mcp.crm"}, "ws") is None
        body = read_resource("aexy://catalog/crm", catalog, {"mcp.crm"}, "ws")
        assert body["mimeType"] == "application/json"
        assert "list_records" in body["text"]
