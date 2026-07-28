"""Concurrency-safe bookkeeping for CRM automation rows.

An automation's success/failure tallies are written from four different places
— the inline executor, the email activity reconciling a provider result, the
outbox giving up on a send, and the stalled-run reaper — and the last three run
in separate worker processes. Read-modify-write on the ORM attribute
(``automation.failed_runs += 1``) loads a value, adds one, and writes the whole
number back, so two of those finishing at the same moment produce one increment
instead of two. The counters drift down over time and never recover.

Expressing the increment as SQL keeps the arithmetic in the database, where the
row lock makes it serial. Every counter write goes through here so there is one
place to look, and none of the callers has to remember which style is safe.
"""

from __future__ import annotations

from sqlalchemy import select, update

from aexy.models.crm import CRMAutomation, CRMAutomationRun


async def load_run_for_update(db, run_id: str) -> CRMAutomationRun | None:
    """Fetch a run row with the intent to rewrite its step log.

    `steps_executed` is a single JSON document holding every step of the run,
    and four writers rewrite it: the inline executor, the email activity
    reporting a provider result, the outbox giving up on a send, and the
    stalled-run reaper. Three of those live in separate worker processes.
    Read-modify-write on one JSON blob means the last writer wins and the
    others' step outcomes vanish — a delivered email quietly losing its "sent",
    or a failure losing its reason.

    Taking the row lock first makes the read-modify-write serial, so the
    concurrent writers queue instead of overwriting each other. SQLite has no
    FOR UPDATE and SQLAlchemy omits the clause there, which is fine: the test
    database is single-connection, so the race cannot arise in the first place.
    """
    return (
        await db.execute(
            select(CRMAutomationRun)
            .where(CRMAutomationRun.id == run_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def record_run_outcome(db, automation_id: str, *, succeeded: bool) -> None:
    """Count one finished run against its automation."""
    column = "successful_runs" if succeeded else "failed_runs"
    await db.execute(
        update(CRMAutomation)
        .where(CRMAutomation.id == automation_id)
        .values({column: getattr(CRMAutomation, column) + 1})
    )


async def correct_failure_to_success(db, automation_id: str) -> None:
    """Move one run from the failed tally to the successful one.

    A retry that finally delivers has to undo the failure a previous attempt
    recorded, or the same run is counted in both columns.

    The floor matters: the two tallies are written by several processes, and a
    correction can arrive for a failure another writer already corrected.
    Without it, failed_runs goes negative and the totals stop adding up.
    """
    await db.execute(
        update(CRMAutomation)
        .where(CRMAutomation.id == automation_id, CRMAutomation.failed_runs > 0)
        .values(failed_runs=CRMAutomation.failed_runs - 1)
    )
    await db.execute(
        update(CRMAutomation)
        .where(CRMAutomation.id == automation_id)
        .values(successful_runs=CRMAutomation.successful_runs + 1)
    )
