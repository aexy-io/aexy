"""Drive service — CRUD for files / folders, soft delete, smart-view resolver.

Smart Views never move files. Their `filter_query` JSONB is translated here
into a SQLAlchemy expression that joins `drive_files` to `file_metadata` and
uses GIN-indexed `@>` containment ops on `file_metadata.ai_tags` and
`file_metadata.ai_categories`.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.drive import (
    KIND_FILE,
    KIND_FOLDER,
    DriveFile,
    SmartView,
)
from aexy.models.file_metadata import (
    SOURCE_DRIVE_FILE,
    FileMetadata,
    VideoAnnotation,
)
from aexy.services.file_metadata_service import get_or_create_metadata

logger = logging.getLogger(__name__)


# Files starting with these mimetypes / extensions get their kind upgraded
# from "file" to a richer kind so the UI can render the right preview.
_KIND_CONTENT_PREFIXES = {
    "image/": "image",
    "video/": "video",
    "audio/": "audio",
}
_KIND_BY_EXT = {
    ".pdf": "pdf",
    ".doc": "doc",
    ".docx": "doc",
    ".md": "doc",
    ".txt": "doc",
}


def detect_kind(file_name: str, content_type: str | None) -> str:
    ct = (content_type or "").lower()
    for prefix, kind in _KIND_CONTENT_PREFIXES.items():
        if ct.startswith(prefix):
            return kind
    if ct == "application/pdf":
        return "pdf"
    name = (file_name or "").lower()
    for ext, kind in _KIND_BY_EXT.items():
        if name.endswith(ext):
            return kind
    return KIND_FILE


class DriveService:
    """Drive CRUD + smart-view resolution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Folders ───────────────────────────────────────────────────────────
    async def create_folder(
        self,
        workspace_id: str,
        name: str,
        parent_id: str | None,
        created_by_id: str,
    ) -> DriveFile:
        if parent_id and not await self._folder_exists(workspace_id, parent_id):
            raise ValueError("Parent folder not found in workspace")

        folder = DriveFile(
            id=str(uuid4()),
            workspace_id=workspace_id,
            parent_id=parent_id,
            file_name=name.strip(),
            file_url=None,
            file_size_bytes=0,
            content_type=None,
            kind=KIND_FOLDER,
            uploaded_by_id=created_by_id,
        )
        self.db.add(folder)
        await self.db.flush()
        return folder

    async def _folder_exists(self, workspace_id: str, folder_id: str) -> bool:
        row = (
            await self.db.execute(
                select(DriveFile.id).where(
                    DriveFile.id == folder_id,
                    DriveFile.workspace_id == workspace_id,
                    DriveFile.kind == KIND_FOLDER,
                    DriveFile.deleted_at.is_(None),
                )
            )
        ).first()
        return row is not None

    # ─── Files ─────────────────────────────────────────────────────────────
    async def create_file(
        self,
        workspace_id: str,
        file_name: str,
        file_url: str,
        file_size_bytes: int,
        content_type: str | None,
        uploaded_by_id: str,
        parent_id: str | None = None,
        space_id: str | None = None,
    ) -> DriveFile:
        kind = detect_kind(file_name, content_type)
        row = DriveFile(
            id=str(uuid4()),
            workspace_id=workspace_id,
            parent_id=parent_id,
            space_id=space_id,
            file_name=file_name,
            file_url=file_url,
            file_size_bytes=file_size_bytes,
            content_type=content_type,
            kind=kind,
            uploaded_by_id=uploaded_by_id,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def get_file(self, workspace_id: str, file_id: str) -> DriveFile | None:
        return (
            await self.db.execute(
                select(DriveFile).where(
                    DriveFile.id == file_id,
                    DriveFile.workspace_id == workspace_id,
                    DriveFile.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

    async def list_files(
        self,
        workspace_id: str,
        parent_id: str | None,
        kind: str | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[DriveFile], int]:
        stmt = select(DriveFile).where(
            DriveFile.workspace_id == workspace_id,
            DriveFile.deleted_at.is_(None),
        )
        # `parent_id == None` literally matches root-level rows, so use is_().
        if parent_id is None:
            stmt = stmt.where(DriveFile.parent_id.is_(None))
        else:
            stmt = stmt.where(DriveFile.parent_id == parent_id)
        if kind:
            stmt = stmt.where(DriveFile.kind == kind)
        if search:
            ilike = f"%{search}%"
            stmt = stmt.where(DriveFile.file_name.ilike(ilike))

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int((await self.db.execute(total_stmt)).scalar_one() or 0)

        # Folders first, then files; within each by uploaded_at desc.
        stmt = (
            stmt.order_by(
                (DriveFile.kind == KIND_FOLDER).desc(),
                DriveFile.uploaded_at.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        rows = list((await self.db.execute(stmt)).scalars().all())
        return rows, total

    async def update_file(
        self,
        workspace_id: str,
        file_id: str,
        *,
        file_name: str | None = None,
        parent_id: str | None | type(...) = ...,
    ) -> DriveFile | None:
        row = await self.get_file(workspace_id, file_id)
        if row is None:
            return None
        if file_name is not None:
            row.file_name = file_name.strip()
        if parent_id is not ...:
            if parent_id and not await self._folder_exists(workspace_id, parent_id):
                raise ValueError("Target parent folder not found in workspace")
            if parent_id == file_id:
                raise ValueError("Cannot move a folder into itself")
            # Walking ancestry catches indirect cycles (A → … → D → A).
            if parent_id and await self._is_descendant(file_id, parent_id):
                raise ValueError("Cannot move a folder into one of its descendants")
            row.parent_id = parent_id
        row.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return row

    async def _is_descendant(self, ancestor_id: str, candidate_id: str) -> bool:
        """Return True if `candidate_id` is a descendant of `ancestor_id`.

        Walks up from `candidate_id` via parent_id; returns True if it ever
        reaches `ancestor_id`. Bounded by a 100-step limit so a corrupted
        cycle in the DB can't loop forever.
        """
        cursor: str | None = candidate_id
        for _ in range(100):
            if cursor is None:
                return False
            if cursor == ancestor_id:
                return True
            parent = (
                await self.db.execute(
                    select(DriveFile.parent_id).where(DriveFile.id == cursor)
                )
            ).scalar_one_or_none()
            cursor = str(parent) if parent else None
        return False

    async def soft_delete(self, workspace_id: str, file_id: str) -> bool:
        row = await self.get_file(workspace_id, file_id)
        if row is None:
            return False
        # Cascade soft-delete to descendants when removing a folder.
        if row.kind == KIND_FOLDER:
            now = datetime.now(timezone.utc)
            await self._soft_delete_subtree(row.id, now)
        else:
            row.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def _soft_delete_subtree(self, root_id: str, ts: datetime) -> None:
        """Recursively soft-delete a folder and everything beneath it.

        Uses a recursive CTE so we don't fan out N queries for deep trees.
        """
        cte = (
            select(DriveFile.id)
            .where(DriveFile.id == root_id)
            .cte(name="descendants", recursive=True)
        )
        cte = cte.union_all(
            select(DriveFile.id).where(DriveFile.parent_id == cte.c.id)
        )
        await self.db.execute(
            update(DriveFile)
            .where(DriveFile.id.in_(select(cte.c.id)))
            .values(deleted_at=ts)
        )

    # ─── Smart Views ───────────────────────────────────────────────────────
    async def list_smart_views(self, workspace_id: str) -> list[SmartView]:
        stmt = (
            select(SmartView)
            .where(SmartView.workspace_id == workspace_id)
            .order_by(SmartView.created_at.desc())
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def create_smart_view(
        self,
        workspace_id: str,
        name: str,
        filter_query: dict,
        icon: str | None,
        color: str | None,
        is_shared: bool,
        created_by_id: str,
    ) -> SmartView:
        view = SmartView(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name.strip(),
            icon=icon,
            color=color,
            filter_query=filter_query,
            is_shared=is_shared,
            created_by_id=created_by_id,
        )
        self.db.add(view)
        await self.db.flush()
        return view

    async def update_smart_view(
        self,
        workspace_id: str,
        view_id: str,
        **fields: Any,
    ) -> SmartView | None:
        view = (
            await self.db.execute(
                select(SmartView).where(
                    SmartView.id == view_id, SmartView.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if view is None:
            return None
        for key, value in fields.items():
            if value is not None and hasattr(view, key):
                setattr(view, key, value)
        view.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return view

    async def delete_smart_view(self, workspace_id: str, view_id: str) -> bool:
        view = (
            await self.db.execute(
                select(SmartView).where(
                    SmartView.id == view_id, SmartView.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if view is None:
            return False
        await self.db.delete(view)
        await self.db.flush()
        return True

    async def resolve_smart_view(
        self, workspace_id: str, view_id: str, limit: int = 200
    ) -> list[DriveFile]:
        view = (
            await self.db.execute(
                select(SmartView).where(
                    SmartView.id == view_id, SmartView.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if view is None:
            return []
        return await self.resolve_filter(workspace_id, view.filter_query or {}, limit=limit)

    async def resolve_filter(
        self, workspace_id: str, filter_query: dict, limit: int = 200
    ) -> list[DriveFile]:
        """Translate a `filter_query` dict to a SQL query.

        AI tags/categories live on `file_metadata`, so smart-view filters that
        touch them join DriveFile → FileMetadata via (drive_file, df.id).

        Supported keys:
            * all_tags      — file must contain ALL of these tags
            * any_tags      — file must contain AT LEAST ONE of these tags
            * any_categories — file must contain AT LEAST ONE category
            * kind          — file kind exactly matches
        """
        all_tags = filter_query.get("all_tags") or []
        any_tags = filter_query.get("any_tags") or []
        any_cats = filter_query.get("any_categories") or []
        kind = filter_query.get("kind")

        stmt = select(DriveFile).where(
            DriveFile.workspace_id == workspace_id,
            DriveFile.deleted_at.is_(None),
            DriveFile.kind != KIND_FOLDER,
        )

        if all_tags or any_tags or any_cats:
            stmt = stmt.join(
                FileMetadata,
                (FileMetadata.source_type == SOURCE_DRIVE_FILE)
                & (FileMetadata.source_id == DriveFile.id),
            )
            if all_tags:
                stmt = stmt.where(
                    FileMetadata.ai_tags.cast(JSONB).contains(_json_array(all_tags))
                )
            if any_tags:
                stmt = stmt.where(
                    or_(
                        *[
                            FileMetadata.ai_tags.cast(JSONB).contains(_json_array([t]))
                            for t in any_tags
                        ]
                    )
                )
            if any_cats:
                stmt = stmt.where(
                    or_(
                        *[
                            FileMetadata.ai_categories.cast(JSONB).contains(_json_array([c]))
                            for c in any_cats
                        ]
                    )
                )

        if kind:
            stmt = stmt.where(DriveFile.kind == kind)

        stmt = stmt.order_by(DriveFile.uploaded_at.desc()).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())

    # ─── Video annotations ────────────────────────────────────────────────
    # Annotations are keyed on `file_metadata.id`; the API still exposes
    # `file_id` (the drive_file id) by joining back through file_metadata.
    async def _resolve_metadata_id(
        self, workspace_id: str, file_id: str
    ) -> str:
        meta = await get_or_create_metadata(
            self.db, SOURCE_DRIVE_FILE, file_id, workspace_id
        )
        return str(meta.id)

    async def list_annotations(
        self, workspace_id: str, file_id: str
    ) -> list[VideoAnnotation]:
        metadata_id = await self._resolve_metadata_id(workspace_id, file_id)
        stmt = (
            select(VideoAnnotation)
            .where(VideoAnnotation.metadata_id == metadata_id)
            .order_by(VideoAnnotation.t_start_ms.asc())
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def create_annotation(
        self,
        workspace_id: str,
        file_id: str,
        t_start_ms: int,
        t_end_ms: int,
        label: str,
        description: str | None,
        tags: list[str],
        bbox: dict | None,
        created_by_id: str,
    ) -> VideoAnnotation:
        metadata_id = await self._resolve_metadata_id(workspace_id, file_id)
        ann = VideoAnnotation(
            id=str(uuid4()),
            metadata_id=metadata_id,
            t_start_ms=int(t_start_ms),
            t_end_ms=int(t_end_ms),
            label=label,
            description=description,
            tags=list(tags or []),
            confidence=None,
            source="manual",
            bbox=bbox,
            created_by_id=created_by_id,
        )
        self.db.add(ann)
        await self.db.flush()
        return ann

    async def get_annotation(
        self, workspace_id: str, file_id: str, annotation_id: str
    ) -> VideoAnnotation | None:
        metadata_id = await self._resolve_metadata_id(workspace_id, file_id)
        return (
            await self.db.execute(
                select(VideoAnnotation).where(
                    VideoAnnotation.id == annotation_id,
                    VideoAnnotation.metadata_id == metadata_id,
                )
            )
        ).scalar_one_or_none()

    async def update_annotation(
        self,
        workspace_id: str,
        file_id: str,
        annotation_id: str,
        **fields: Any,
    ) -> VideoAnnotation | None:
        ann = await self.get_annotation(workspace_id, file_id, annotation_id)
        if ann is None:
            return None
        for key, value in fields.items():
            if value is not None and hasattr(ann, key):
                setattr(ann, key, value)
        await self.db.flush()
        return ann

    async def delete_annotation(
        self, workspace_id: str, file_id: str, annotation_id: str
    ) -> bool:
        ann = await self.get_annotation(workspace_id, file_id, annotation_id)
        if ann is None:
            return False
        await self.db.delete(ann)
        await self.db.flush()
        return True


def _json_array(items: list[str]) -> list[str]:
    """JSONB containment expects a JSON array; SQLAlchemy renders Python lists
    correctly when the column type is JSONB."""
    return list(items)
