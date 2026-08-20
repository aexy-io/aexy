"""Telling somebody a connected account has stopped working.

A broken OAuth connection is the one sync failure a notification can actually
resolve: it will not recover on its own, retries cannot fix it, and the only
remedy is a person reconnecting the account. Everything else the sync does —
a rate limit, a timeout, one bad message — retries and resolves itself, so
notifying on it would be noise that teaches people to ignore the channel.

The desk case is what made this necessary. A revoked token deactivated a Gmail
integration, the poller skipped it silently from then on, and nobody found out
until somebody asked why no tickets had arrived for a day.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.notification import NotificationEventType

logger = logging.getLogger(__name__)


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
            created = await service.create_notification(
                recipient_id=recipient_id,
                event_type=NotificationEventType.INTEGRATION_DISCONNECTED,
                title=f"{provider} disconnected: {account_label}",
                # Says what stopped, why, and what to do — in that order, because
                # that is the order the reader needs them.
                body=(
                    f"{account_label} is no longer syncing"
                    f"{f' ({reason})' if reason else ''}. "
                    "Anything that depends on this account — including service desk "
                    "tickets from this mailbox — has stopped until it is reconnected."
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
