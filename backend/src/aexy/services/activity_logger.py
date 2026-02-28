"""Shared helper for logging EntityActivity from any service module.

Usage:
    from aexy.services.activity_logger import log_activity

    # Inside a service method (after flush, before commit):
    await log_activity(
        self.db,
        workspace_id=workspace_id,
        entity_type="ticket",
        entity_id=str(ticket.id),
        activity_type="created",
        actor_id=str(user.id),
        title="Created ticket 'Login broken'",
    )
"""

import logging
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models import EntityActivity

logger = logging.getLogger(__name__)


async def log_activity(
    db: AsyncSession,
    *,
    workspace_id: str,
    entity_type: str,
    entity_id: str,
    activity_type: str,
    actor_id: str | None = None,
    title: str | None = None,
    content: str | None = None,
    changes: dict | None = None,
    metadata: dict | None = None,
) -> None:
    """Write an EntityActivity row.  Fire-and-forget — logs but never raises.

    Calls db.add() + db.flush() so the row is persisted regardless of whether
    the caller commits immediately or relies on get_db() auto-commit.
    """
    try:
        async with db.begin_nested():
            activity = EntityActivity(
                id=str(uuid4()),
                workspace_id=workspace_id,
                entity_type=entity_type,
                entity_id=entity_id,
                activity_type=activity_type,
                actor_id=actor_id,
                title=title,
                content=content,
                changes=changes,
                activity_metadata=metadata,
            )
            db.add(activity)
            await db.flush()
    except Exception:
        logger.exception("Failed to log entity activity for %s/%s", entity_type, entity_id)
