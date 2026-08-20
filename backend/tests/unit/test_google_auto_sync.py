"""Auto-sync actually reaching every connected mailbox.

Two defects made a connected account sit there doing nothing, and neither
surfaced anywhere a person would look:

  * **The interval defaulted to 0**, and the scheduler only picks up
    integrations above zero. A new account reported itself connected, had
    `gmail_sync_enabled = true`, and never synced. Nothing errored — the mail
    simply never arrived.
  * **The "already running?" guard ignored the account.** It matched on
    workspace and job type, so one mailbox's in-flight sync suppressed every
    other mailbox in the same workspace. The second person to connect could
    wait indefinitely, and with two live jobs the `scalar_one_or_none()` behind
    it raised, which the surrounding `except` turned into a log line.

Both only bite a workspace with more than one account — the shape multi-account
support introduced — which is why nothing caught them earlier.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration, GoogleSyncJob
from aexy.models.workspace import Workspace
from aexy.temporal.activities.google_sync import has_live_sync_job


@pytest.fixture
async def workspace(db_session):
    owner = Developer(email="owner@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(name="WS", slug="ws", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    return ws


def _account(workspace_id: str, email: str) -> GoogleIntegration:
    return GoogleIntegration(
        workspace_id=workspace_id,
        google_email=email,
        google_user_id=email,
        access_token="x",
        refresh_token="y",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        gmail_sync_enabled=True,
        calendar_sync_enabled=True,
        is_active=True,
    )


class TestInterval:
    async def test_a_new_account_is_scheduled_to_sync(self, db_session, workspace):
        """The bug: connected, enabled, and invisible to the scheduler."""
        account = _account(workspace.id, "new@gmail.com")
        db_session.add(account)
        await db_session.flush()

        assert account.auto_sync_interval_minutes > 0, (
            "a freshly connected account is not picked up by "
            "check_auto_sync_integrations, so it will never sync"
        )
        assert account.auto_sync_calendar_interval_minutes > 0

    async def test_zero_is_still_selectable(self, db_session, workspace):
        """0 means 'Off' in the settings UI — a choice, not an unset value."""
        account = _account(workspace.id, "off@gmail.com")
        account.auto_sync_interval_minutes = 0
        db_session.add(account)
        await db_session.flush()

        assert account.auto_sync_interval_minutes == 0


class TestRunningJobGuard:
    """The guard the scheduler uses — the real one.

    Driving `check_auto_sync_integrations` end to end would need a Temporal
    worker, so the guard is extracted and called directly. Restating the query
    here instead would pass just as happily against the bug it is meant to
    catch.
    """

    async def _live_job_for(self, db, integration):
        return await has_live_sync_job(db, integration, "gmail")

    async def test_one_accounts_sync_does_not_block_another(
        self, db_session, workspace
    ):
        first = _account(workspace.id, "first@gmail.com")
        second = _account(workspace.id, "second@gmail.com")
        db_session.add_all([first, second])
        await db_session.flush()

        db_session.add(
            GoogleSyncJob(
                workspace_id=workspace.id,
                integration_id=first.id,
                job_type="gmail",
                status="running",
            )
        )
        await db_session.flush()

        assert await self._live_job_for(db_session, first) is True
        assert await self._live_job_for(db_session, second) is False, (
            "the second mailbox was treated as already syncing because another "
            "account in the same workspace was"
        )

    async def test_two_live_jobs_on_one_account_do_not_raise(
        self, db_session, workspace
    ):
        """`scalar_one_or_none()` raised here; the caller logged and moved on."""
        account = _account(workspace.id, "busy@gmail.com")
        db_session.add(account)
        await db_session.flush()

        db_session.add_all(
            [
                GoogleSyncJob(
                    workspace_id=workspace.id,
                    integration_id=account.id,
                    job_type="gmail",
                    status="running",
                ),
                GoogleSyncJob(
                    workspace_id=workspace.id,
                    integration_id=account.id,
                    job_type="gmail",
                    status="pending",
                ),
            ]
        )
        await db_session.flush()

        assert await self._live_job_for(db_session, account) is True

    async def test_a_finished_job_does_not_block_the_next_run(
        self, db_session, workspace
    ):
        account = _account(workspace.id, "done@gmail.com")
        db_session.add(account)
        await db_session.flush()

        db_session.add(
            GoogleSyncJob(
                workspace_id=workspace.id,
                integration_id=account.id,
                job_type="gmail",
                status="completed",
            )
        )
        await db_session.flush()

        assert await self._live_job_for(db_session, account) is False


class TestAStrandedJobDoesNotDisableAnAccountForever:
    """A job whose worker died used to block that account's sync permanently.

    Reported from production: a Postgres outage interrupted a sync, the row
    stayed `running`, and every 60-second tick from then on saw a live job and
    skipped. The schedule looked healthy, no error was logged anywhere, and the
    desk simply stopped receiving mail.
    """

    async def _live_job_for(self, db, integration):
        return await has_live_sync_job(db, integration, "gmail")

    async def test_a_job_older_than_the_bound_is_reclaimed(self, db_session, workspace):
        from datetime import datetime, timedelta, timezone

        from aexy.temporal.activities.google_sync import STALE_SYNC_JOB_AFTER

        account = _account(workspace.id, "desk@example.com")
        db_session.add(account)
        await db_session.flush()

        stranded = GoogleSyncJob(
            workspace_id=workspace.id,
            integration_id=account.id,
            job_type="gmail",
            status="running",
            started_at=datetime.now(timezone.utc) - STALE_SYNC_JOB_AFTER - timedelta(minutes=1),
        )
        db_session.add(stranded)
        await db_session.flush()

        assert await self._live_job_for(db_session, account) is False, (
            "a job past the staleness bound must not keep blocking this account"
        )
        # And it is closed out rather than left to be reconsidered every minute.
        await db_session.refresh(stranded)
        assert stranded.status == "failed"
        assert "Abandoned" in (stranded.error or "")

    async def test_a_job_inside_the_bound_still_blocks(self, db_session, workspace):
        """The guard still has to do its original job.

        Reclaiming a sync that is genuinely running would start a second one
        against the same mailbox.
        """
        from datetime import datetime, timedelta, timezone

        account = _account(workspace.id, "busy@example.com")
        db_session.add(account)
        await db_session.flush()

        db_session.add(
            GoogleSyncJob(
                workspace_id=workspace.id,
                integration_id=account.id,
                job_type="gmail",
                status="running",
                started_at=datetime.now(timezone.utc) - timedelta(minutes=2),
            )
        )
        await db_session.flush()

        assert await self._live_job_for(db_session, account) is True

    async def test_a_job_with_no_timestamp_yet_is_treated_as_live(
        self, db_session, workspace
    ):
        """A row written this instant may have neither timestamp populated.

        Reclaiming it would race the worker that just picked it up.
        """
        account = _account(workspace.id, "fresh@example.com")
        db_session.add(account)
        await db_session.flush()

        job = GoogleSyncJob(
            workspace_id=workspace.id,
            integration_id=account.id,
            job_type="gmail",
            status="pending",
        )
        job.created_at = None
        db_session.add(job)
        await db_session.flush()

        assert await self._live_job_for(db_session, account) is True
