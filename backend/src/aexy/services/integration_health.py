"""Telling somebody a connected account has stopped working.

A broken OAuth connection is the one sync failure a notification can actually
resolve: it will not recover on its own, retries cannot fix it, and the only
remedy is a person reconnecting the account. Everything else the sync does —
a rate limit, a timeout, one bad message — retries and resolves itself, so
notifying on it would be noise that teaches people to ignore the channel.

The desk case is what made this necessary. A revoked token deactivated a Gmail
integration, the poller skipped it silently from then on, and nobody found out
until somebody asked why no tickets had arrived for a day.

Callers may sit in a poller and so re-report the same dead account on every
pass. `RENOTIFY_AFTER` is what keeps that from becoming a mail storm: one
message per person per account per day, which is often enough to stay a live
reminder while the account is still broken and rare enough to stay readable.
The throttle lives here, not in the callers, because "how often may we say
this" is a property of the message, not of whoever noticed.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.notification import Notification, NotificationEventType

logger = logging.getLogger(__name__)

# One notice per recipient per account per day.
RENOTIFY_AFTER = timedelta(hours=24)


async def notify_integration_disconnected(
    db: AsyncSession,
    *,
    workspace_id: str,
    provider: str,
    account_label: str,
    reason: str | None,
    connected_by_id: str | None = None,
    settings_path: str,
) -> int:
    """Tell the people who can fix it. Returns how many were notified.

    Recipients are whoever connected the account plus the workspace's owners and
    admins — the person who connected it may have left, and an account nobody
    owns is exactly the one that goes unnoticed longest.

    A recipient already told about this same account inside `RENOTIFY_AFTER` is
    skipped and not counted, so a caller on a five-minute schedule reports the
    same breakage 288 times a day and sends one mail.
    """
    from aexy.models.workspace import Workspace, WorkspaceMember
    from aexy.services.notification_service import NotificationService

    recipients: list[str] = []
    if connected_by_id:
        recipients.append(connected_by_id)

    owner_id = (
        await db.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
    ).scalar_one_or_none()
    if owner_id:
        recipients.append(str(owner_id))

    admins = (
        await db.execute(
            select(WorkspaceMember.developer_id).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.role.in_(["owner", "admin"]),
                WorkspaceMember.status == "active",
            )
        )
    ).scalars().all()
    recipients.extend(str(a) for a in admins)

    service = NotificationService(db)
    notified = 0
    for recipient_id in dict.fromkeys(recipients):  # de-duped, order kept
        try:
            if await _told_recently(db, recipient_id, provider, account_label):
                continue
            created = await service.create_notification(
                recipient_id=recipient_id,
                event_type=NotificationEventType.INTEGRATION_DISCONNECTED,
                title=f"{provider} disconnected: {account_label}",
                # Says what stopped, why, and what to do, in that order, because
                # that is the order the reader needs them. The mailbox wording
                # this carried was written for the desk case and read as
                # nonsense once GitHub started calling — a repository sync has
                # no tickets — so it names the provider it was given instead.
                body=(
                    f"{account_label} is no longer syncing"
                    f"{f' ({reason})' if reason else ''}. "
                    f"Anything that depends on this {provider} account has "
                    "stopped until it is reconnected."
                ),
                context={
                    "provider": provider,
                    "account": account_label,
                    "reason": reason,
                    "workspace_id": workspace_id,
                    "action_url": settings_path,
                },
            )
            if created is not None:
                notified += 1
        except Exception as exc:  # noqa: BLE001 - never block a sync on telling someone
            logger.error("Could not notify %s about %s: %s", recipient_id, account_label, exc)
    return notified


async def _told_recently(
    db: AsyncSession, recipient_id: str, provider: str, account_label: str
) -> bool:
    """Has this person already heard about this account inside the window?

    Matches on the notification's own context rather than a column on the
    integration, so one throttle covers every provider and a recipient watching
    several broken accounts still hears about each of them separately.

    The context comparison happens in Python: the column is JSONB on Postgres
    but plain JSON under SQLite in the tests, and a `->>` predicate would pass
    one and fail the other. The window bounds the scan to a handful of rows, so
    reading them back is cheap.
    """
    since = datetime.now(timezone.utc) - RENOTIFY_AFTER
    recent = (
        await db.execute(
            select(Notification.context)
            .where(
                Notification.recipient_id == recipient_id,
                Notification.event_type
                == NotificationEventType.INTEGRATION_DISCONNECTED.value,
                Notification.created_at >= since,
            )
            .order_by(Notification.created_at.desc())
            # Generous, because it is a ceiling on distinct broken accounts one
            # person watches, not on notices sent. Overrunning it costs one
            # extra mail for the account that fell off the end, and the row that
            # mail writes puts it back in range — so it cannot storm again.
            .limit(200)
        )
    ).scalars().all()

    return any(
        (ctx or {}).get("provider") == provider
        and (ctx or {}).get("account") == account_label
        for ctx in recent
    )


async def notify_github_connection_broken(
    db: AsyncSession,
    *,
    developer_id: str,
    github_username: str | None,
    reason: str,
) -> int:
    """Report a GitHub connection the moment it is marked broken.

    The auto-sync poller reports this too, but only on its next pass and only
    for developers who switched auto-sync on. Firing here as well makes the
    notice immediate and covers the developer who only ever syncs by hand — for
    whom the poller never runs at all.

    Fans out over every workspace the developer adopted a repository into, not
    just the one being synced when it broke: the connection is a property of the
    person, so it has stopped syncing for all of them, and each workspace's
    admins are a different set of people.

    Saying it twice costs nothing. `notify_integration_disconnected` throttles
    per recipient per account, so whichever of the two paths gets there first
    sends the mail and the other is a no-op.
    """
    from aexy.models.repository import WorkspaceRepository

    workspace_ids = (
        await db.execute(
            select(WorkspaceRepository.workspace_id)
            .where(
                WorkspaceRepository.adopted_by_developer_id == developer_id,
                WorkspaceRepository.is_active == True,  # noqa: E712
            )
            .distinct()
        )
    ).scalars().all()

    notified = 0
    for workspace_id in workspace_ids:
        notified += await notify_integration_disconnected(
            db,
            workspace_id=str(workspace_id),
            provider="GitHub",
            account_label=f"@{github_username}" if github_username else "GitHub account",
            reason=reason,
            connected_by_id=str(developer_id),
            settings_path="/settings/integrations",
        )
    return notified
