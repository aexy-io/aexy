"""The monthly cap and the outcome tallies must survive concurrency.

Both were read-modify-write. The cap checked `runs_this_month` at the top of a
trigger and incremented it at the very end, with the whole run in between, so
at 99 of 100 every concurrent trigger read 99, passed, and ran. The tallies are
written from four places — the inline executor, the email activity, the outbox
giving up, and the reaper — three of them in separate worker processes, so two
finishing together produced one increment instead of two and the numbers drifted
down permanently.
"""

from uuid import uuid4

import pytest

from aexy.models.crm import CRMAutomation
from aexy.services.automation_counters import (
    correct_failure_to_success,
    record_run_outcome,
)
from aexy.services.crm_automation_service import CRMAutomationService
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


async def _automation(db, *, limit=None, used=0) -> CRMAutomation:
    automation = CRMAutomation(
        id=str(uuid4()),
        workspace_id=await seed_workspace(db),
        name="counter subject",
        module="crm",
        trigger_type="record.created",
        actions=[],
        is_active=True,
        run_limit_per_month=limit,
        runs_this_month=used,
        total_runs=used,
        successful_runs=0,
        failed_runs=0,
    )
    db.add(automation)
    await db.flush()
    return automation


async def _reload(db, automation) -> CRMAutomation:
    await db.refresh(automation)
    return automation


async def test_the_last_slot_is_given_to_exactly_one_caller(db_session):
    """Two triggers racing for one remaining run: one wins, one is refused."""
    automation = await _automation(db_session, limit=100, used=99)
    service = CRMAutomationService(db_session)

    await service._claim_monthly_run_slot(automation)
    with pytest.raises(ValueError, match="run limit exceeded"):
        await service._claim_monthly_run_slot(automation)

    await _reload(db_session, automation)
    assert automation.runs_this_month == 100, "the cap was overrun"


async def test_claiming_counts_the_run_once(db_session):
    automation = await _automation(db_session, limit=None, used=0)
    service = CRMAutomationService(db_session)

    await service._claim_monthly_run_slot(automation)

    await _reload(db_session, automation)
    assert automation.runs_this_month == 1
    assert automation.total_runs == 1
    assert automation.last_run_at is not None


async def test_no_limit_never_refuses(db_session):
    automation = await _automation(db_session, limit=None, used=10_000)
    service = CRMAutomationService(db_session)

    await service._claim_monthly_run_slot(automation)

    await _reload(db_session, automation)
    assert automation.runs_this_month == 10_001


async def test_concurrent_outcome_writes_do_not_lose_each_other(db_session):
    """The lost-update case, written the way the four real writers hit it."""
    automation = await _automation(db_session)

    for _ in range(25):
        await record_run_outcome(db_session, automation.id, succeeded=True)
    for _ in range(15):
        await record_run_outcome(db_session, automation.id, succeeded=False)

    await _reload(db_session, automation)
    assert automation.successful_runs == 25
    assert automation.failed_runs == 15


async def test_a_recovered_retry_moves_one_run_between_tallies(db_session):
    automation = await _automation(db_session)
    await record_run_outcome(db_session, automation.id, succeeded=False)

    await correct_failure_to_success(db_session, automation.id)

    await _reload(db_session, automation)
    assert automation.failed_runs == 0
    assert automation.successful_runs == 1


async def test_a_correction_can_never_drive_the_tally_negative(db_session):
    """Several writers can correct the same failure; the total must still add up."""
    automation = await _automation(db_session)
    await record_run_outcome(db_session, automation.id, succeeded=False)

    await correct_failure_to_success(db_session, automation.id)
    await correct_failure_to_success(db_session, automation.id)

    await _reload(db_session, automation)
    assert automation.failed_runs == 0, "went negative"
