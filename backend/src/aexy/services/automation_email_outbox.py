"""Draining the automation email outbox.

An automation records the emails it intends to send in the same transaction as
the run, then this hands them to the Temporal worker. Two things call it: the
request path, immediately after its transaction commits, so delivery stays
near-instant; and a scheduled sweep, so nothing is lost if that attempt never
happens (process killed, request aborted, worker unreachable at the time).

Both can run against the same row, so a row is claimed with a conditional
update before anything is dispatched. Whoever loses the race sees no rows.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy import update as sqlalchemy_update

from aexy.core.database import async_session_maker
from aexy.models.crm import CRMAutomationEmailOutbox
from aexy.temporal.activities.email import SendWorkflowEmailInput
from aexy.temporal.task_queues import TaskQueue

logger = logging.getLogger(__name__)

# A row the sweep finds still "dispatching" was claimed by something that then
# died; after this long it is fair game again.
STALE_CLAIM_AFTER = timedelta(minutes=5)

MAX_ATTEMPTS = 5


async def drain_outbox(run_id: str | None = None, limit: int = 50) -> dict:
    """Dispatch pending outbox rows. Never raises - callers are fire-and-forget.

    Args:
        run_id: Only drain this run's emails (the immediate attempt). None
            sweeps everything pending, including rows whose claim went stale.
    """
    from aexy.temporal.dispatch import dispatch

    dispatched = 0
    failed = 0

    try:
        async with async_session_maker() as db:
            stmt = select(CRMAutomationEmailOutbox).where(
                CRMAutomationEmailOutbox.attempts < MAX_ATTEMPTS
            )
            if run_id:
                stmt = stmt.where(
                    CRMAutomationEmailOutbox.automation_run_id == run_id,
                    CRMAutomationEmailOutbox.status == "pending",
                )
            else:
                cutoff = datetime.now(timezone.utc) - STALE_CLAIM_AFTER
                stmt = stmt.where(
                    (CRMAutomationEmailOutbox.status == "pending")
                    | (
                        (CRMAutomationEmailOutbox.status == "dispatching")
                        # When it was claimed, not when it was created: a row
                        # that waited an hour then was claimed a second ago is
                        # not stale, and treating it as stale sends twice.
                        & (CRMAutomationEmailOutbox.claimed_at < cutoff)
                    )
                )
            rows = (await db.execute(stmt.limit(limit))).scalars().all()

            for row in rows:
                # Claim it. The condition repeats every field we read, so if
                # anything changed since - including another drainer claiming a
                # stale row a moment earlier - this updates nothing and we skip
                # it. Matching on status alone is not enough: two drainers can
                # both see the same stale "dispatching" row, and that stays
                # true after the first one claims it, so both would send.
                now = datetime.now(timezone.utc)
                claimed = await db.execute(
                    update(CRMAutomationEmailOutbox)
                    .where(
                        CRMAutomationEmailOutbox.id == row.id,
                        CRMAutomationEmailOutbox.status == row.status,
                        CRMAutomationEmailOutbox.attempts == row.attempts,
                        CRMAutomationEmailOutbox.claimed_at.is_(None)
                        if row.claimed_at is None
                        else CRMAutomationEmailOutbox.claimed_at == row.claimed_at,
                    )
                    .values(
                        status="dispatching",
                        attempts=row.attempts + 1,
                        claimed_at=now,
                    )
                )
                if claimed.rowcount == 0:
                    continue
                await db.commit()

                try:
                    # Naming the workflow after the outbox row makes a repeat
                    # handover harmless. reject_duplicate_id is what actually
                    # makes that true: the default policy only refuses a start
                    # while the first is still RUNNING, so a send that
                    # completed and then lost its bookkeeping - process killed
                    # before the row was marked dispatched - would be reclaimed
                    # by the sweep and sent to the customer a second time.
                    await dispatch(
                        "send_workflow_email",
                        SendWorkflowEmailInput(**row.payload),
                        task_queue=TaskQueue.EMAIL,
                        workflow_id=f"send_workflow_email-outbox-{row.id}",
                        reject_duplicate_id=True,
                    )
                except Exception as e:
                    # The workflow id is derived from this row, so Temporal's
                    # own duplicate-start error means the first handoff DID
                    # land and only its response was lost. Treating that as a
                    # failure would fail a run whose email is on its way. Only
                    # Temporal's typed error counts here - see below.
                    if _is_already_started(e):
                        logger.info(
                            "Automation email %s was already handed over", row.id
                        )
                        await db.execute(
                            update(CRMAutomationEmailOutbox)
                            .where(CRMAutomationEmailOutbox.id == row.id)
                            .values(
                                status="dispatched",
                                dispatched_at=datetime.now(timezone.utc),
                                error=None,
                            )
                        )
                        await db.commit()
                        dispatched += 1
                        continue

                    logger.warning(
                        "Could not hand automation email %s to the worker: %s",
                        row.id,
                        e,
                    )
                    exhausted = row.attempts + 1 >= MAX_ATTEMPTS
                    await db.execute(
                        update(CRMAutomationEmailOutbox)
                        .where(CRMAutomationEmailOutbox.id == row.id)
                        .values(
                            status="failed" if exhausted else "pending",
                            error=str(e)[:500],
                        )
                    )
                    if exhausted:
                        # Otherwise the row is simply never looked at again and
                        # the run sits on "queued" forever with nothing saying
                        # why - the silent failure this work exists to remove.
                        await _fail_run(db, row.automation_run_id, row.step_order, str(e))
                    await db.commit()
                    failed += 1
                    continue

                await db.execute(
                    update(CRMAutomationEmailOutbox)
                    .where(CRMAutomationEmailOutbox.id == row.id)
                    .values(
                        status="dispatched",
                        dispatched_at=datetime.now(timezone.utc),
                        error=None,
                    )
                )
                await db.commit()
                dispatched += 1
    except Exception:
        logger.exception("Automation email outbox drain failed")

    return {"dispatched": dispatched, "failed": failed}


def _is_already_started(error: BaseException | None) -> bool:
    """Whether Temporal refused the start because this row was handed over before.

    Covers both a still-running first handoff and - because the outbox handoff
    sets reject_duplicate_id - one that already completed. Either way it means
    a handoff for this row happened; it does not by itself mean the email was
    delivered.

    Typed-only, deliberately. Matching on the error text would let an unrelated
    failure that happens to contain "already exists" - a unique-constraint
    violation, say - mark an email as handed over when it never was. That stops
    every retry and leaves the run looking healthy having sent nothing, which
    is the exact class of bug this whole change exists to remove.
    """
    from temporalio.exceptions import WorkflowAlreadyStartedError

    seen: set[int] = set()
    while error is not None and id(error) not in seen:
        if isinstance(error, WorkflowAlreadyStartedError):
            return True
        seen.add(id(error))
        error = error.__cause__ or error.__context__
    return False


async def _fail_run(db, run_id: str, step_order: int, error: str) -> None:
    """Give up on one email and say so, rather than going quiet.

    Scoped to the step that actually failed. Failing every queued step of the
    run would condemn siblings that are still in flight, and a sibling that
    later delivers could no longer record itself - a delivered email shown as
    failed, which is the same lie in the other direction.
    """
    from aexy.models.crm import CRMAutomation, CRMAutomationRun

    run = await db.get(CRMAutomationRun, run_id)
    if not run:
        return

    steps = [dict(step) for step in (run.steps_executed or [])]
    for step in steps:
        if step.get("order") == step_order and step.get("status") == "queued":
            step["status"] = "failed"
            step["error"] = f"Email could not be sent: {error}"[:500]
    run.steps_executed = steps

    # Other emails on this run may still be waiting; the run is only decided
    # once none of them are.
    still_waiting = (
        await db.execute(
            select(CRMAutomationEmailOutbox.id).where(
                CRMAutomationEmailOutbox.automation_run_id == run_id,
                CRMAutomationEmailOutbox.status.in_(["pending", "dispatching"]),
            )
        )
    ).first()
    if still_waiting:
        return

    # Claim the run before touching the counters. Two of its emails can exhaust
    # at the same moment, and both drainers would otherwise read it as queued
    # and count the same failure twice.
    claimed = await db.execute(
        sqlalchemy_update(CRMAutomationRun)
        .where(
            CRMAutomationRun.id == run_id,
            CRMAutomationRun.status.in_(["queued", "pending", "running"]),
        )
        .values(status="failed")
    )
    if claimed.rowcount == 0:
        return

    run.status = "failed"
    run.error_message = f"Email could not be sent: {error}"[:500]
    run.completed_at = datetime.now(timezone.utc)
    if run.started_at:
        run.duration_ms = int(
            (run.completed_at - run.started_at).total_seconds() * 1000
        )

    automation = await db.get(CRMAutomation, run.automation_id)
    if automation:
        automation.failed_runs += 1
