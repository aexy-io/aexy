"""Progress updates on tasks and tickets.

See ``models/work_update.py`` for why this is separate from comments and from
the activity log.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.work_update import WORK_UPDATE_ENTITY_TYPES, WorkUpdate
from aexy.services.activity_logger import log_activity

logger = logging.getLogger(__name__)

MAX_BODY_CHARS = 5000


class WorkUpdateService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── entity resolution ────────────────────────────────────────────────

    async def _assert_entity_in_workspace(
        self, workspace_id: str, entity_type: str, entity_id: str
    ) -> None:
        """Verify the target exists *in this workspace* before writing.

        Without this the workspace id comes from the URL and the entity id from
        the body, so a member of workspace A could hang an update off a task in
        workspace B — and then read it back, since the list path filters on the
        same unverified pair. The check is the same one
        ``api/entity_activity.py`` makes for its own polymorphic writes.
        """
        if entity_type not in WORK_UPDATE_ENTITY_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Progress updates are not supported for {entity_type!r}. "
                    f"Expected one of: {', '.join(sorted(WORK_UPDATE_ENTITY_TYPES))}"
                ),
            )

        # Lazy imports: both modules import service code transitively.
        if entity_type == "task":
            from aexy.models.sprint import SprintTask as model
        else:
            from aexy.models.ticketing import Ticket as model

        found = await self.db.execute(
            select(model.id).where(
                model.id == entity_id,
                model.workspace_id == workspace_id,
            )
        )
        if found.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{entity_type.capitalize()} not found",
            )

    @staticmethod
    def _clean_body(body: str) -> str:
        cleaned = (body or "").strip()
        if not cleaned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An update needs some text",
            )
        if len(cleaned) > MAX_BODY_CHARS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An update is limited to {MAX_BODY_CHARS} characters",
            )
        return cleaned

    # ── reads ────────────────────────────────────────────────────────────

    async def list_updates(
        self, workspace_id: str, entity_type: str, entity_id: str
    ) -> list[WorkUpdate]:
        """Newest first — the current state of the work is the thing you want
        to read, and the history of it is below."""
        await self._assert_entity_in_workspace(workspace_id, entity_type, entity_id)
        result = await self.db.execute(
            select(WorkUpdate)
            .where(
                WorkUpdate.workspace_id == workspace_id,
                WorkUpdate.entity_type == entity_type,
                WorkUpdate.entity_id == entity_id,
            )
            .order_by(WorkUpdate.created_at.desc())
        )
        return list(result.scalars().all())

    async def latest_by_entity(
        self, workspace_id: str, entity_type: str, entity_ids: list[str]
    ) -> dict[str, WorkUpdate]:
        """Most recent update per entity, for a whole board in one query.

        Used to show "last update 3 days ago" on cards. Done as a single
        fetch-and-fold rather than a correlated subquery per card because a
        board renders a few hundred at once; the index on
        (entity_type, entity_id, created_at) keeps the scan tight.
        """
        if not entity_ids:
            return {}
        result = await self.db.execute(
            select(WorkUpdate)
            .where(
                WorkUpdate.workspace_id == workspace_id,
                WorkUpdate.entity_type == entity_type,
                WorkUpdate.entity_id.in_(entity_ids),
            )
            .order_by(WorkUpdate.created_at.desc())
        )
        latest: dict[str, WorkUpdate] = {}
        for update in result.scalars().all():
            # Descending order means the first row seen per entity is its newest.
            latest.setdefault(str(update.entity_id), update)
        return latest

    async def get_update(self, workspace_id: str, update_id: str) -> WorkUpdate:
        result = await self.db.execute(
            select(WorkUpdate).where(
                WorkUpdate.id == update_id,
                WorkUpdate.workspace_id == workspace_id,
            )
        )
        update = result.scalar_one_or_none()
        if update is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Update not found"
            )
        return update

    # ── writes ───────────────────────────────────────────────────────────

    async def create_update(
        self,
        workspace_id: str,
        entity_type: str,
        entity_id: str,
        author_id: str,
        body: str,
    ) -> WorkUpdate:
        await self._assert_entity_in_workspace(workspace_id, entity_type, entity_id)
        cleaned = self._clean_body(body)

        update = WorkUpdate(
            workspace_id=workspace_id,
            entity_type=entity_type,
            entity_id=entity_id,
            author_id=author_id,
            body=cleaned,
        )
        self.db.add(update)
        await self.db.flush()

        # Mirror the *event* into the activity log so an update shows up in the
        # History tab and the workspace feed. Deliberately no body here: the
        # update is editable and the log is not, so copying the text would leave
        # the feed quoting a version that no longer exists.
        await log_activity(
            self.db,
            workspace_id=workspace_id,
            entity_type=entity_type,
            entity_id=str(entity_id),
            activity_type="progress_updated",
            actor_id=author_id,
            title="Posted a progress update",
        )

        await self.db.refresh(update)
        return update

    async def edit_update(
        self, workspace_id: str, update_id: str, requester_id: str, body: str
    ) -> WorkUpdate:
        """Only the author may reword their own update.

        Not an admin override: an update is a statement attributed to a person,
        and letting someone else rewrite it under that person's name is worse
        than leaving a wrong one standing. Admins can delete (below).
        """
        update = await self.get_update(workspace_id, update_id)
        if str(update.author_id) != str(requester_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the author can edit an update",
            )
        update.body = self._clean_body(body)
        update.edited_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.refresh(update)
        return update

    async def delete_update(
        self,
        workspace_id: str,
        update_id: str,
        requester_id: str,
        requester_is_admin: bool = False,
    ) -> None:
        update = await self.get_update(workspace_id, update_id)
        if str(update.author_id) != str(requester_id) and not requester_is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the author or a workspace admin can delete an update",
            )
        await self.db.delete(update)
        await self.db.flush()

    async def delete_for_entity(
        self, workspace_id: str, entity_type: str, entity_id: str
    ) -> int:
        """Drop every update for an entity that is being hard-deleted.

        There is no FK to cascade from — the target lives in one of two tables —
        so a deleted task would otherwise leave its updates behind, and a new
        task that reused the id (restore-from-backup, re-import) would inherit
        someone else's status notes.
        """
        result = await self.db.execute(
            select(WorkUpdate).where(
                WorkUpdate.workspace_id == workspace_id,
                WorkUpdate.entity_type == entity_type,
                WorkUpdate.entity_id == entity_id,
            )
        )
        orphans = list(result.scalars().all())
        for orphan in orphans:
            await self.db.delete(orphan)
        if orphans:
            await self.db.flush()
        return len(orphans)
