"""Creating and firing agent schedules.

`run_due` is called by a Temporal schedule every few minutes. It claims each
due row by advancing `next_run_at` *before* dispatching, so two ticks racing
cannot fire the same routine twice; the dispatch itself carries a workflow id
made from the schedule and the slot, which Temporal also de-duplicates.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent import CRMAgent
from aexy.models.agent_schedule import AgentSchedule

logger = logging.getLogger(__name__)


class ScheduleError(ValueError):
    pass


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class AgentScheduleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, workspace_id: str) -> list[AgentSchedule]:
        rows = await self.db.execute(
            select(AgentSchedule)
            .where(AgentSchedule.workspace_id == workspace_id)
            .order_by(AgentSchedule.created_at.asc())
        )
        return list(rows.scalars().all())

    async def get(self, workspace_id: str, schedule_id: str) -> AgentSchedule | None:
        return (
            await self.db.execute(
                select(AgentSchedule)
                .where(AgentSchedule.id == schedule_id)
                .where(AgentSchedule.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()

    async def _agent_for_schedule(self, workspace_id: str, agent_id: str) -> CRMAgent:
        agent = (
            await self.db.execute(
                select(CRMAgent)
                .where(CRMAgent.id == agent_id)
                .where(CRMAgent.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()
        if agent is None:
            raise ScheduleError("Agent not found in this workspace")
        if not agent.is_active:
            # Not a retryable failure: the run would raise the same way six
            # times over. Disable the schedule instead (see `run_due`).
            raise ScheduleError("This agent is switched off. Turn it on, or remove the schedule.")
        if not agent.principal_id:
            # A schedule has nobody at the keyboard. Without a principal the
            # agent's tools would run as... nobody, and be refused everything.
            raise ScheduleError(
                "This agent has no principal to run as. Set one on the agent's Tools tab first."
            )
        return agent

    async def create(
        self,
        *,
        workspace_id: str,
        agent_id: str,
        name: str,
        routine: str,
        interval_minutes: int,
        tz: str,
        enabled: bool,
        created_by_id: str,
    ) -> AgentSchedule:
        await self._agent_for_schedule(workspace_id, agent_id)
        now = datetime.now(timezone.utc)
        row = AgentSchedule(
            id=str(uuid4()),
            workspace_id=workspace_id,
            agent_id=agent_id,
            name=name,
            routine=routine,
            interval_minutes=interval_minutes,
            timezone=tz,
            enabled=enabled,
            # First run one interval from now, not immediately: creating a
            # schedule should not itself be a run somebody did not ask for.
            next_run_at=now + timedelta(minutes=interval_minutes) if enabled else None,
            created_by_id=created_by_id,
        )
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def update(self, row: AgentSchedule, **changes) -> AgentSchedule:
        for key, value in changes.items():
            if value is None:
                continue
            setattr(row, key, value)
        if "enabled" in changes and changes["enabled"] is not None:
            if changes["enabled"] and row.next_run_at is None:
                row.next_run_at = datetime.now(timezone.utc) + timedelta(minutes=row.interval_minutes)
            if not changes["enabled"]:
                row.next_run_at = None
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def delete(self, row: AgentSchedule) -> None:
        await self.db.delete(row)
        await self.db.flush()

    # ------------------------------------------------------------------
    # Firing
    # ------------------------------------------------------------------

    async def due(self, now: datetime | None = None) -> list[AgentSchedule]:
        now = now or datetime.now(timezone.utc)
        rows = await self.db.execute(
            select(AgentSchedule)
            .where(AgentSchedule.enabled.is_(True))
            .where(AgentSchedule.next_run_at.is_not(None))
            .where(AgentSchedule.next_run_at <= now)
            .order_by(AgentSchedule.next_run_at.asc())
        )
        return list(rows.scalars().all())

    def claim(self, row: AgentSchedule, now: datetime | None = None) -> str:
        """Advance the slot and return the workflow id for this firing."""
        now = now or datetime.now(timezone.utc)
        slot = _aware(row.next_run_at) or now
        row.last_run_at = now
        row.run_count = (row.run_count or 0) + 1
        # Anchored on the slot, not on `now`, so a late tick does not drift the
        # daily run later every day.
        next_at = slot + timedelta(minutes=row.interval_minutes)
        while next_at <= now:
            next_at += timedelta(minutes=row.interval_minutes)
        row.next_run_at = next_at
        return f"agent-schedule-{row.id}-{slot.strftime('%Y%m%dT%H%M')}"

    async def dispatch(self, row: AgentSchedule, *, workflow_id: str | None = None) -> str:
        """Start the agent run for this schedule. Returns the workflow run id."""
        from aexy.temporal.activities.integrations import ExecuteAgentInput
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        agent = await self._agent_for_schedule(str(row.workspace_id), str(row.agent_id))
        return await dispatch(
            "execute_agent",
            ExecuteAgentInput(
                agent_id=str(agent.id),
                context={
                    "routine": row.routine,
                    "schedule_id": str(row.id),
                    "schedule_name": row.name,
                },
                user_id=None,
                triggered_by="schedule",
                trigger_id=str(row.id),
            ),
            task_queue=TaskQueue.WORKFLOWS,
            workflow_id=workflow_id,
        )

    async def run_now(self, row: AgentSchedule) -> str:
        """Fire once, outside the clock. Counted as a run; the slot is untouched."""
        run_id = await self.dispatch(row)
        row.last_run_at = datetime.now(timezone.utc)
        row.run_count = (row.run_count or 0) + 1
        await self.db.flush()
        await self.db.refresh(row)
        return run_id

    async def run_due(self, now: datetime | None = None) -> int:
        """Fire every due schedule once. Returns how many were dispatched."""
        now = now or datetime.now(timezone.utc)
        fired = 0
        for row in await self.due(now):
            before = (row.next_run_at, row.last_run_at, row.run_count)
            workflow_id = self.claim(row, now)
            await self.db.flush()
            try:
                await self.dispatch(row, workflow_id=workflow_id)
                fired += 1
            except ScheduleError as exc:
                # The agent lost its principal, was switched off or deleted.
                # Switch the schedule off rather than fail every five minutes
                # forever.
                logger.warning("Disabling schedule %s: %s", row.id, exc)
                row.enabled = False
                row.next_run_at = None
            except Exception:
                # Temporal unreachable, most likely. Give the slot back so the
                # next tick retries it; the workflow id is the same for the
                # same slot, so a retry cannot double-fire once it does land.
                logger.exception("Could not dispatch schedule %s; will retry", row.id)
                row.next_run_at, row.last_run_at, row.run_count = before
        await self.db.flush()
        return fired
