"""Temporal activity that fires due agent schedules.

Runs every few minutes from `temporal/schedules.py`. Each due schedule becomes
one `execute_agent` workflow, with a workflow id built from the schedule and
its slot so a tick that overlaps a slow predecessor cannot fire twice.
"""

import logging
from dataclasses import dataclass

from temporalio import activity

logger = logging.getLogger(__name__)


@dataclass
class RunDueAgentSchedulesInput:
    """Nothing to configure — due-ness is read from the rows."""

    limit: int = 200


@activity.defn
async def run_due_agent_schedules(input: RunDueAgentSchedulesInput) -> int:
    from aexy.core.database import get_async_session
    from aexy.services.agent_schedule_service import AgentScheduleService

    async with get_async_session() as session:
        fired = await AgentScheduleService(session).run_due()
        await session.commit()
    if fired:
        logger.info("Fired %d agent schedule(s)", fired)
    return fired
