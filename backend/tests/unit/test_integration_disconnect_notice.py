"""One disconnect notice per person per account per day.

The GitHub half of this ran from `check_repo_auto_sync`, which is on a
five-minute schedule, and `auth_status` stays "error" until a human reconnects.
The only de-duplication was a set rebuilt at the top of each pass, so a single
broken connection re-reported itself 288 times a day to the adopter *and* to
every owner and admin of the workspace. A day of that is a few hundred mails
about one thing nobody had fixed yet.

The fix is a throttle inside the notifier rather than in the caller, so these
tests drive `notify_integration_disconnected` directly and count what reaches
the email queue, not what reaches the notifications table — the table was never
the thing anyone complained about.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.notification import Notification, NotificationEventType
from aexy.models.repository import Repository, WorkspaceRepository
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.integration_health import (
    notify_github_connection_broken,
    notify_integration_disconnected,
)


@pytest.fixture
def emails(monkeypatch) -> list:
    """Every send_notification_email dispatched, in order."""
    sent: list = []

    import aexy.temporal.dispatch as dispatch_module

    async def _record(activity, payload, *args, **kwargs):
        if activity == "send_notification_email":
            sent.append(payload)
        return None

    monkeypatch.setattr(dispatch_module, "dispatch", _record)
    return sent


@pytest.fixture
async def adopter(db_session):
    developer = Developer(email="adopter@example.com", name="Adopter")
    db_session.add(developer)
    await db_session.flush()
    return developer


@pytest.fixture
async def workspace(db_session, adopter):
    ws = Workspace(name="WS", slug="ws", owner_id=adopter.id)
    db_session.add(ws)
    await db_session.flush()
    return ws


async def _add_admin(db_session, workspace, email: str) -> Developer:
    admin = Developer(email=email, name=email.split("@")[0])
    db_session.add(admin)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=admin.id,
            role="admin",
            status="active",
        )
    )
    await db_session.flush()
    return admin


async def _notify(db_session, workspace, adopter, *, account: str = "@adopter") -> int:
    return await notify_integration_disconnected(
        db_session,
        workspace_id=str(workspace.id),
        provider="GitHub",
        account_label=account,
        reason="GitHub refused the saved credentials",
        connected_by_id=str(adopter.id),
        settings_path="/settings/integrations",
    )


async def test_a_poller_repeating_itself_sends_one_mail(
    db_session, workspace, adopter, emails
):
    """The bug, at the scale it actually happened."""
    first = await _notify(db_session, workspace, adopter)
    assert first == 1

    # A day of five-minute passes over a connection nobody has fixed.
    for _ in range(287):
        assert await _notify(db_session, workspace, adopter) == 0

    assert len(emails) == 1


async def test_admins_are_told_once_each(db_session, workspace, adopter, emails):
    """Fan-out is intact; it is the repetition that was wrong, not the audience."""
    await _add_admin(db_session, workspace, "admin-a@example.com")
    await _add_admin(db_session, workspace, "admin-b@example.com")

    assert await _notify(db_session, workspace, adopter) == 3
    assert await _notify(db_session, workspace, adopter) == 0
    assert len(emails) == 3


async def test_the_notice_returns_the_next_day(db_session, workspace, adopter, emails):
    """A reminder, not a one-shot: the account is still broken tomorrow."""
    await _notify(db_session, workspace, adopter)

    notice = (
        await db_session.execute(
            select(Notification).where(
                Notification.recipient_id == adopter.id,
                Notification.event_type
                == NotificationEventType.INTEGRATION_DISCONNECTED.value,
            )
        )
    ).scalar_one()
    notice.created_at = datetime.now(timezone.utc) - timedelta(hours=25)
    await db_session.commit()

    assert await _notify(db_session, workspace, adopter) == 1
    assert len(emails) == 2


async def test_two_broken_accounts_do_not_silence_each_other(
    db_session, workspace, adopter, emails
):
    """An admin watching several dead connections must hear about each one."""
    assert await _notify(db_session, workspace, adopter, account="@one") == 1
    assert await _notify(db_session, workspace, adopter, account="@two") == 1
    assert await _notify(db_session, workspace, adopter, account="@one") == 0

    assert len(emails) == 2


# --- The sync path announcing a breakage the moment it finds one -------------
#
# The poller reports this too, but only on its next five-minute pass and only
# for developers who switched auto-sync on. A developer who syncs by hand got
# nothing at all.


async def _adopt(db_session, workspace, adopter, *, github_id: int, full_name: str):
    repo = Repository(
        id=str(uuid4()),
        github_id=github_id,
        full_name=full_name,
        name=full_name.split("/")[1],
        owner_login=full_name.split("/")[0],
        owner_type="Organization",
    )
    db_session.add(repo)
    await db_session.flush()
    db_session.add(
        WorkspaceRepository(
            id=str(uuid4()),
            workspace_id=workspace.id,
            repository_id=repo.id,
            adopted_by_developer_id=adopter.id,
            is_active=True,
            sync_status="pending",
        )
    )
    await db_session.flush()
    return repo


async def _broken(db_session, adopter) -> int:
    return await notify_github_connection_broken(
        db_session,
        developer_id=str(adopter.id),
        github_username="adopter",
        reason="GitHub rejected the refresh token",
    )


async def test_a_breakage_is_announced_without_waiting_for_the_poller(
    db_session, workspace, adopter, emails
):
    await _adopt(db_session, workspace, adopter, github_id=99001, full_name="acme/one")

    assert await _broken(db_session, adopter) == 1
    assert len(emails) == 1


async def test_saying_it_twice_still_sends_one_mail(
    db_session, workspace, adopter, emails
):
    """The sync path and the poller both report it; the reader sees it once."""
    await _adopt(db_session, workspace, adopter, github_id=99001, full_name="acme/one")

    await _broken(db_session, adopter)
    # The poller, five minutes later, naming the same account.
    await _notify(db_session, workspace, adopter, account="@adopter")

    assert len(emails) == 1


async def test_every_workspace_the_developer_syncs_for_is_told(
    db_session, workspace, adopter, emails
):
    """The connection is the person's, so it broke for all of their workspaces."""
    await _adopt(db_session, workspace, adopter, github_id=99001, full_name="acme/one")

    second_ws = Workspace(name="WS2", slug="ws2", owner_id=adopter.id)
    db_session.add(second_ws)
    await db_session.flush()
    other_admin = await _add_admin(db_session, second_ws, "admin-ws2@example.com")
    await _adopt(
        db_session, second_ws, adopter, github_id=99002, full_name="acme/other"
    )

    # The adopter once — throttled across both workspaces — plus WS2's admin.
    assert await _broken(db_session, adopter) == 2

    told = set(
        (
            await db_session.execute(
                select(Notification.recipient_id).where(
                    Notification.event_type
                    == NotificationEventType.INTEGRATION_DISCONNECTED.value
                )
            )
        ).scalars().all()
    )
    assert told == {adopter.id, other_admin.id}
