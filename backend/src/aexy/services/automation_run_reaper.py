"""Backstop that stops automation runs from sitting un-decided forever.

Every normal path writes a run's outcome itself: the inline executor decides at
the end of ``_execute_automation``, the outbox fails a run whose email gave up,
and the email activity closes a run once its last send reports back. This exists
for when none of those ever happen — the process was killed mid-run, or a
handover was lost — because a run with no outcome is indistinguishable to an
admin from a run that is still working, and it never resolves on its own.

Deliberately conservative: it only touches runs that nothing else can still be
working on, so it can never overwrite a real outcome that is merely late.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from aexy.models.crm import (
    CRMAutomation,
    CRMAutomationEmailOutbox,
    CRMAutomationRun,
)

logger = logging.getLogger(__name__)

# Long enough that nothing legitimate is still in flight: the outbox gives up
# after MAX_ATTEMPTS at a 60s sweep, and Temporal's own activity retries sit
# well inside this.
STALLED_AFTER = timedelta(minutes=15)

_NON_TERMINAL = ("pending", "running", "queued")


async def reap_stalled_runs(db, limit: int = 100) -> dict:
    """Write a failure onto runs that were abandoned without an outcome."""
    cutoff = datetime.now(timezone.utc) - STALLED_AFTER

    rows = (
        await db.execute(
            select(CRMAutomationRun)
            .where(
                CRMAutomationRun.status.in_(_NON_TERMINAL),
                CRMAutomationRun.created_at < cutoff,
            )
            .limit(limit)
        )
    ).scalars().all()

    reaped = 0
    for run in rows:
        steps = list(run.steps_executed or [])

        # A run handed to the durable workflow is legitimately long-lived: a
        # wait node can sleep for days, and mark_crm_automation_run closes it.
        # Timing it out here would fail runs that are working correctly.
        # ponytail: durable runs are never reaped, so a workflow that dies
        # outright still strands its run. Reap on Temporal workflow state
        # (describe the handle) if that turns out to happen in practice.
        if any(step.get("type") == "handoff" for step in steps):
            continue

        # An email still pending or mid-handover will decide this run itself.
        still_working = (
            await db.execute(
                select(CRMAutomationEmailOutbox.id).where(
                    CRMAutomationEmailOutbox.automation_run_id == run.id,
                    CRMAutomationEmailOutbox.status.in_(["pending", "dispatching"]),
                )
            )
        ).first()
        if still_working:
            continue

        # Claim it, so two sweeps overlapping cannot both count this failure.
        claimed = await db.execute(
            update(CRMAutomationRun)
            .where(
                CRMAutomationRun.id == run.id,
                CRMAutomationRun.status.in_(_NON_TERMINAL),
            )
            .values(status="failed")
        )
        if claimed.rowcount == 0:
            continue

        reason = (
            "No outcome was ever recorded for this run; it was abandoned "
            "before finishing."
        )
        run.status = "failed"
        run.error_message = reason
        run.completed_at = datetime.now(timezone.utc)
        if run.started_at:
            run.duration_ms = int(
                (run.completed_at - run.started_at).total_seconds() * 1000
            )
        # Say so per step too, or the run reads failed with a step list still
        # claiming its send is on the way.
        run.steps_executed = [
            {**step, "status": "failed", "error": reason}
            if step.get("status") in {"queued", "sending", "pending"}
            else step
            for step in steps
        ]

        automation = await db.get(CRMAutomation, run.automation_id)
        if automation:
            automation.failed_runs = (automation.failed_runs or 0) + 1

        await db.commit()
        reaped += 1
        logger.warning("Reaped stalled automation run %s", run.id)

    return {"reaped": reaped}
