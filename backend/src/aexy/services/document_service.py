"""Document management service for Notion-like documentation."""

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, case, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from aexy.services.activity_logger import log_activity
from aexy.services.document_access import AccessLevel, DocumentAccess
from aexy.services.docx_service import extract_structured
from aexy.services.storage_service import get_storage_service
from aexy.services.document_templates_catalog import (
    SystemTemplate,
    get_system_template,
    is_system_template_id,
    list_system_templates,
)
from aexy.models.documentation import (
    CONTENT_FORMAT_DOCX,
    DOCUMENT_SEARCH_VECTOR,
    Document,
    DocumentCodeLink,
    DocumentCollaborator,
    DocumentFavorite,
    DocumentSyncMode,
    DocumentTemplate,
    DocumentVersion,
    DocumentVisibility,
)

logger = logging.getLogger(__name__)

# Stamped on the catalogue's templates, which ship with the code and so have no
# creation date of their own. Fixed rather than `now()` so the same template does
# not appear to change every time it is listed.
SYSTEM_TEMPLATE_TIMESTAMP = datetime(2026, 1, 1, tzinfo=timezone.utc)

# A tree deeper than this is either pathological or the residue of a legacy
# parent cycle. Bounded so assembly stays linear and the JSON response finite.
_MAX_TREE_DEPTH = 50

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


@dataclass
class SearchHit:
    """A search result and why it ranked where it did.

    The snippet is part of the result rather than something the caller derives,
    because on PostgreSQL it comes from `ts_headline` — the same tsquery that
    did the matching — and no client-side approximation of that is worth
    maintaining alongside it.
    """

    document: Document
    score: float
    snippet: str | None


def _excerpt(text: str | None, query: str, width: int = 160) -> str | None:
    """A plain-text window around the first match, for the SQLite path."""
    if not text:
        return None
    idx = text.lower().find(query.lower())
    if idx < 0:
        return text[:width].strip() or None
    start = max(0, idx - width // 3)
    end = min(len(text), idx + len(query) + width // 2)
    fragment = text[start:end].strip()
    return f"{'…' if start else ''}{fragment}{'…' if end < len(text) else ''}"


async def _schedule_reindex(document_id: str, dedupe_key: str) -> None:
    """Queue this document for re-embedding, off the request path.

    Best-effort by design. Embedding is a paid call per chunk and the
    collaborative editor flushes a document every few seconds while somebody is
    typing in it — a save that waited on a model would be unusable, and a save
    that *failed* because Temporal was unreachable would be worse than a search
    index that lags by a minute.

    The workflow id carries the content sha, so re-saving identical content
    does not re-embed it.
    """
    try:
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        await dispatch(
            "index_document_embeddings",
            {"document_id": document_id, "force": False},
            task_queue=TaskQueue.ANALYSIS,
            workflow_id=f"doc-embed-{document_id}-{dedupe_key}",
        )
    except Exception:
        logger.debug("could not queue embedding for document %s", document_id)


#: Ceiling on a TipTap body, measured as its serialised JSON.
#:
#: Word documents have had `MAX_DOCX_BYTES` since they were added; TipTap
#: bodies had nothing, and they are the format that costs the most to leave
#: unbounded — every content change snapshots the *whole* body into
#: `document_versions`, and every change re-chunks it for embeddings. A runaway
#: import or a pathological generation therefore multiplies across three tables.
#:
#: 8 MB of JSON is a document far larger than anything a person writes; the
#: cases that reach it are machine-produced.
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024


class DocumentTooLargeError(ValueError):
    """The document body exceeds `MAX_DOCUMENT_BYTES`."""

    def __init__(self, size: int) -> None:
        self.size = size
        super().__init__(
            f"Document body is {size // (1024 * 1024)} MB; the limit is "
            f"{MAX_DOCUMENT_BYTES // (1024 * 1024)} MB"
        )


def _reject_if_oversized(content: dict | None) -> None:
    if not content:
        return
    size = len(json.dumps(content, separators=(",", ":")).encode("utf-8"))
    if size > MAX_DOCUMENT_BYTES:
        raise DocumentTooLargeError(size)


class DocumentCycleError(ValueError):
    """A move would have made a document its own ancestor."""


class DocxStorageError(RuntimeError):
    """The document's bytes could not be written to object storage."""


class DocxConflictError(RuntimeError):
    """Someone else saved this document since it was opened.

    Carries the current sha so the caller can tell the editor what it is now
    holding a stale copy of.
    """

    def __init__(self, message: str, current_sha: str | None = None) -> None:
        super().__init__(message)
        self.current_sha = current_sha


def docx_version_key(document_id: str, version_number: int) -> str:
    """Where one saved version lives. Written once, never overwritten.
    
    There is deliberately no mutable "current" object. An earlier shape wrote
    both a `current.docx` and a per-version copy, which meant every save touched
    object storage *before* the row was committed: an interrupted commit left the
    store holding new bytes while the row still held the previous
    `docx_content_sha`. The sha then described content that was no longer there,
    which quietly voids the optimistic-concurrency check — a later save would be
    accepted against a hash of bytes nobody had.
    
    Pointing `documents.docx_storage_key` at the version key instead makes the
    commit the only thing that publishes a save. An object written for a commit
    that never landed is simply unreferenced, and the row always describes bytes
    that exist.
    """
    return f"documents/{document_id}/versions/{version_number}.docx"


def compute_docx_sha(raw: bytes) -> str:
    """SHA-256 of a document's bytes.

    The docx counterpart of `compute_content_sha` for TipTap content, and used
    the same way: as the base an AI proposal records, so approving a stale
    proposal is caught rather than overwriting an edit made in the meantime.
    """
    return hashlib.sha256(raw).hexdigest()


class DocumentService:
    """Service for document CRUD operations and tree management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Document CRUD ====================

    async def create_document(
        self,
        workspace_id: str,
        created_by_id: str,
        title: str = "Untitled",
        content: dict | None = None,
        parent_id: str | None = None,
        template_id: str | None = None,
        space_id: str | None = None,
        icon: str | None = None,
        cover_image: str | None = None,
        visibility: str = DocumentVisibility.WORKSPACE.value,
    ) -> Document:
        """Create a new document, optionally from a template."""
        # Get next position in parent
        position = await self._get_next_position(workspace_id, parent_id)

        # If using a template, load its content
        if template_id:
            template = await self.get_template(template_id)
            if template:
                content = content or template.content_template
                icon = icon or template.icon

        # Only auto-assign space for workspace visibility docs that don't have a space
        # Private docs should NOT have a space (they're personal)
        # Shared docs without space_id are workspace-level shared
        # Only space docs (explicitly assigned) go to a space

        document = Document(
            id=str(uuid4()),
            workspace_id=workspace_id,
            parent_id=parent_id,
            space_id=space_id,
            title=title,
            content=content or {"type": "doc", "content": []},
            # Extracted here as well as on update. It was set only on update,
            # so a document created *with* a body — every AI generation, every
            # imported page, every API client that sends content on create —
            # was unsearchable by that body until somebody happened to edit it.
            # `search_vector` is generated from this column, so an empty one
            # means the page is indexed by its title alone.
            content_text=self._extract_text(content) if content else None,
            icon=icon,
            cover_image=cover_image,
            visibility=visibility,
            created_by_id=created_by_id,
            last_edited_by_id=created_by_id,
            position=position,
        )

        self.db.add(document)
        await self.db.flush()

        # Create initial version
        await self._create_version(
            document_id=document.id,
            content=document.content,
            created_by_id=created_by_id,
            change_summary="Document created",
            is_auto_save=False,
        )

        await log_activity(
            self.db,
            workspace_id=workspace_id,
            entity_type="document",
            entity_id=str(document.id),
            activity_type="created",
            actor_id=created_by_id,
            title=f"Created document '{title}'",
        )

        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def get_document(
        self,
        document_id: str,
        workspace_id: str | None = None,
        *,
        include_deleted: bool = False,
    ) -> Document | None:
        """Get a document by ID with all relationships.

        A trashed document is not found unless asked for explicitly. Every
        caller that wants one — restore, purge, the trash listing — says so;
        everything else would otherwise keep serving a document somebody
        deleted, which is the failure mode a trash is supposed to prevent in
        the other direction.

        This is *not* an authorization check. `DocumentAccess.resolve` is, and
        every endpoint calls it. Keeping the two separate is deliberate: a
        service method that silently returns None for a permission problem
        makes 404s that should be 403s and hides bugs in the access layer.
        """
        stmt = (
            select(Document)
            .where(Document.id == document_id)
            .options(
                selectinload(Document.created_by),
                selectinload(Document.last_edited_by),
                selectinload(Document.code_links),
                selectinload(Document.collaborators),
            )
        )

        if workspace_id:
            stmt = stmt.where(Document.workspace_id == workspace_id)
        if not include_deleted:
            stmt = stmt.where(Document.deleted_at.is_(None))

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_document(
        self,
        document_id: str,
        updated_by_id: str,
        title: str | None = None,
        content: dict | None = None,
        icon: str | None = None,
        cover_image: str | None = None,
        visibility: str | None = None,
        create_version: bool = True,
        is_auto_save: bool = False,
    ) -> Document | None:
        """Update a document with optional version creation."""
        document = await self.get_document(document_id)
        if not document:
            return None

        _reject_if_oversized(content)

        # A Word document's body is a file, and `content` is `{}` by design.
        # Writing TipTap content into it would leave a document whose two
        # bodies disagree, and whichever the reader consulted would be wrong.
        # Title, icon and visibility are format-independent and still allowed.
        if document.is_docx and content is not None:
            raise ValueError(
                f"Document {document_id} is a Word document; its body is edited "
                "through the docx endpoints, not by writing TipTap content."
            )

        # Track if content changed
        content_changed = content is not None and content != document.content

        # Update fields
        if title is not None:
            document.title = title
        if content is not None:
            document.content = content
            document.content_text = self._extract_text(content)
        if icon is not None:
            document.icon = icon
        if cover_image is not None:
            document.cover_image = cover_image
        if visibility is not None:
            document.visibility = visibility

        document.last_edited_by_id = updated_by_id
        document.updated_at = datetime.now(timezone.utc)

        # Visibility decides who may read the document, so a cached decision
        # from earlier in this request is now wrong.
        if visibility is not None:
            DocumentAccess.invalidate(self.db, document_id)

        # Create version if content changed
        if content_changed and create_version:
            await self._create_version(
                document_id=document.id,
                content=content,
                created_by_id=updated_by_id,
                change_summary="Content updated",
                is_auto_save=is_auto_save,
            )

        # Log to unified feed (skip auto-saves to avoid noise)
        if not is_auto_save:
            changes = {}
            if title is not None:
                changes["title"] = {"new": title}
            if visibility is not None:
                changes["visibility"] = {"new": visibility}
            if content_changed:
                changes["content"] = {"new": "(updated)"}
            if changes:
                await log_activity(
                    self.db,
                    workspace_id=document.workspace_id,
                    entity_type="document",
                    entity_id=str(document.id),
                    activity_type="updated",
                    actor_id=updated_by_id,
                    title=f"Updated document '{document.title}'",
                    changes=changes,
                )

        await self.db.commit()
        await self.db.refresh(document)

        if content_changed:
            from aexy.services.proposed_edits_service import current_document_sha

            await _schedule_reindex(
                str(document.id), current_document_sha(document) or "unknown"
            )

        return document

    async def delete_document(
        self,
        document_id: str,
        workspace_id: str,
        deleted_by_id: str | None = None,
    ) -> bool:
        """Move a document and its subtree to the trash.

        Was `db.delete(document)`, which cascaded to the children and took
        their versions, comments, code links, collaborators and docx storage
        keys with them, permanently, at member level. Nothing about that was
        recoverable and nothing about it was logged beyond the parent's title.

        Now it stamps `deleted_at` across the subtree. `purge_expired` removes
        rows for real once the workspace's retention window has passed, which
        is also the answer to an erasure request.
        """
        document = await self.get_document(document_id, workspace_id)
        if not document:
            return False

        subtree = await self._subtree_ids(str(document.id))
        now = datetime.now(timezone.utc)

        await self.db.execute(
            update(Document)
            .where(Document.id.in_(subtree))
            .where(Document.deleted_at.is_(None))
            .values(deleted_at=now, deleted_by_id=deleted_by_id)
        )

        for doomed_id in subtree:
            DocumentAccess.invalidate(self.db, doomed_id)

        await log_activity(
            self.db,
            workspace_id=str(document.workspace_id),
            entity_type="document",
            entity_id=str(document.id),
            activity_type="deleted",
            actor_id=deleted_by_id,
            title=f"Moved '{document.title}' to trash",
            changes={"subtree_size": {"new": len(subtree)}},
        )

        await self.db.commit()
        return True

    async def restore_document(
        self,
        document_id: str,
        workspace_id: str,
        restored_by_id: str | None = None,
    ) -> Document | None:
        """Bring a trashed document and its subtree back.

        If the parent it was under is itself still in the trash, the document
        comes back at the root rather than into a parent nobody can see. The
        alternative — restoring it into an invisible parent — produces a
        document that exists, is not deleted, and appears nowhere.
        """
        document = await self.get_document(
            document_id, workspace_id, include_deleted=True
        )
        if not document or document.deleted_at is None:
            return None

        if document.parent_id:
            parent_alive = (
                await self.db.execute(
                    select(Document.id)
                    .where(Document.id == document.parent_id)
                    .where(Document.deleted_at.is_(None))
                )
            ).scalar_one_or_none()
            if parent_alive is None:
                document.parent_id = None
                document.position = await self._get_next_position(workspace_id, None)

        subtree = await self._subtree_ids(str(document.id), include_deleted=True)
        await self.db.execute(
            update(Document)
            .where(Document.id.in_(subtree))
            .values(deleted_at=None, deleted_by_id=None)
        )

        for restored_id in subtree:
            DocumentAccess.invalidate(self.db, restored_id)

        await log_activity(
            self.db,
            workspace_id=str(document.workspace_id),
            entity_type="document",
            entity_id=str(document.id),
            activity_type="restored",
            actor_id=restored_by_id,
            title=f"Restored '{document.title}' from trash",
        )

        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def list_trash(
        self,
        workspace_id: str,
        limit: int = 50,
        offset: int = 0,
        access_clause: Any | None = None,
    ) -> list[Document]:
        """Trashed documents, newest deletion first.

        Only the roots of each deleted subtree: a page whose parent was
        deleted in the same action is not a separate thing to restore, and
        listing all of them turns "deleted one section" into fifty rows.
        """
        parent = aliased(Document)
        stmt = (
            select(Document)
            .where(Document.workspace_id == workspace_id)
            .where(Document.deleted_at.is_not(None))
            .where(
                or_(
                    Document.parent_id.is_(None),
                    ~select(parent.id)
                    .where(parent.id == Document.parent_id)
                    .where(parent.deleted_at.is_not(None))
                    .exists(),
                )
            )
            .order_by(Document.deleted_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if access_clause is not None:
            stmt = stmt.where(access_clause)
        return list((await self.db.execute(stmt)).scalars().all())

    async def purge_expired(
        self,
        workspace_id: str,
        retention_days: int,
    ) -> int:
        """Permanently remove documents trashed longer ago than the window.

        This is the only remaining hard delete, and it is deliberately not
        reachable from a request — it runs on a schedule, so "delete" in the
        UI can never mean "gone" while somebody is still looking at the
        confirmation dialog.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        doomed = list(
            (
                await self.db.execute(
                    select(Document.id)
                    .where(Document.workspace_id == workspace_id)
                    .where(Document.deleted_at.is_not(None))
                    .where(Document.deleted_at < cutoff)
                )
            )
            .scalars()
            .all()
        )
        if not doomed:
            return 0

        storage_keys = list(
            (
                await self.db.execute(
                    select(Document.docx_storage_key)
                    .where(Document.id.in_(doomed))
                    .where(Document.docx_storage_key.is_not(None))
                )
            )
            .scalars()
            .all()
        )

        await self.db.execute(delete(Document).where(Document.id.in_(doomed)))
        await self.db.commit()

        for key in storage_keys:
            try:
                get_storage_service().delete_file(key)
            except Exception:  # pragma: no cover - best effort
                logger.warning("purge: could not remove docx object %s", key)

        logger.info(
            "purged %d document(s) from workspace %s past %d-day retention",
            len(doomed),
            workspace_id,
            retention_days,
        )
        return len(doomed)

    async def _subtree_ids(
        self,
        root_id: str,
        *,
        include_deleted: bool = False,
        max_depth: int = 200,
    ) -> list[str]:
        """Every descendant of `root_id`, plus itself.

        Breadth-first with a visited set rather than a recursive CTE, because
        the same code runs against SQLite in the test suite. The visited set is
        not defensive style — `move_document` shipped without a descendant
        check, so a cycle is two ordinary moves away and this traversal would
        otherwise never terminate on one.
        """
        seen: set[str] = {root_id}
        frontier = [root_id]
        depth = 0

        while frontier and depth < max_depth:
            stmt = select(Document.id).where(Document.parent_id.in_(frontier))
            if not include_deleted:
                stmt = stmt.where(Document.deleted_at.is_(None))
            rows = list((await self.db.execute(stmt)).scalars().all())
            frontier = [str(r) for r in rows if str(r) not in seen]
            seen.update(frontier)
            depth += 1

        if depth >= max_depth:
            logger.warning(
                "document subtree walk from %s hit the depth cap; "
                "the tree is either pathological or cyclic",
                root_id,
            )
        return list(seen)

    async def duplicate_document(
        self,
        document_id: str,
        workspace_id: str,
        duplicated_by_id: str,
        include_children: bool = False,
    ) -> Document | None:
        """Duplicate a document and optionally its children."""
        original = await self.get_document(document_id, workspace_id)
        if not original:
            return None

        # A docx duplicate needs its own copy of the bytes. Reusing
        # `create_document` would produce a row claiming to be a Word document
        # with no file behind it — openable only as a blank page.
        if original.is_docx:
            raw = await self.get_docx_bytes(original.id)
            if raw is None:
                return None
            duplicate = await self.create_docx_document(
                workspace_id=workspace_id,
                created_by_id=duplicated_by_id,
                raw=raw,
                title=f"{original.title} (Copy)",
                parent_id=original.parent_id,
                space_id=original.space_id,
                visibility=original.visibility,
            )
            if include_children:
                await self._duplicate_children(
                    original.id, duplicate.id, duplicated_by_id
                )
            return duplicate

        # Create duplicate
        duplicate = await self.create_document(
            workspace_id=workspace_id,
            created_by_id=duplicated_by_id,
            title=f"{original.title} (Copy)",
            content=original.content,
            parent_id=original.parent_id,
            icon=original.icon,
            cover_image=original.cover_image,
        )

        if include_children:
            await self._duplicate_children(original.id, duplicate.id, duplicated_by_id)

        return duplicate

    async def _duplicate_children(
        self,
        original_parent_id: str,
        new_parent_id: str,
        duplicated_by_id: str,
    ) -> None:
        """Recursively duplicate children."""
        stmt = select(Document).where(Document.parent_id == original_parent_id)
        result = await self.db.execute(stmt)
        children = result.scalars().all()

        for child in children:
            new_child = Document(
                id=str(uuid4()),
                workspace_id=child.workspace_id,
                parent_id=new_parent_id,
                title=child.title,
                content=child.content,
                content_text=child.content_text,
                icon=child.icon,
                cover_image=child.cover_image,
                created_by_id=duplicated_by_id,
                last_edited_by_id=duplicated_by_id,
                position=child.position,
            )
            self.db.add(new_child)
            await self.db.flush()

            # Recursively duplicate children of this child
            await self._duplicate_children(child.id, new_child.id, duplicated_by_id)

    # ==================== Document Tree ====================

    async def get_document_tree(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        parent_id: str | None = None,
        include_templates: bool = False,
        visibility: str | None = None,
        space_id: str | None = None,
        access_clause: Any | None = None,
    ) -> list[dict[str, Any]]:
        """Get hierarchical document tree for sidebar.

        Two things changed here and they are connected.

        **It no longer leaks.** The old version restricted private documents to
        their creator only when the caller passed an explicit
        `visibility="private"` filter — which the sidebar never did. Every
        default call returned every document at that level regardless of
        visibility, space membership or author. `access_clause` comes from
        `DocumentAccess.visible_clause` and is a `WHERE` predicate, so the
        filtering happens in SQL and cannot be forgotten by a caller that
        builds its own query on top.

        **It is one query, not one per node.** The old version recursed per
        level, on the surface that renders on every page of the module. This
        loads the workspace's documents once and assembles the tree in memory;
        `has_children` and the staleness badge come out of the same pass.
        """
        stale_ids = await self._documents_behind_their_code(workspace_id)

        stmt = select(Document).where(Document.workspace_id == workspace_id)
        stmt = stmt.where(Document.deleted_at.is_(None))

        if access_clause is not None:
            stmt = stmt.where(access_clause)

        if not include_templates:
            stmt = stmt.where(Document.is_template == False)  # noqa: E712

        if space_id:
            if space_id == "none":
                stmt = stmt.where(Document.space_id.is_(None))
            else:
                stmt = stmt.where(Document.space_id == space_id)

        if visibility:
            stmt = stmt.where(Document.visibility == visibility)

        stmt = stmt.order_by(Document.position, Document.created_at)

        documents = list((await self.db.execute(stmt)).scalars().all())

        favorite_ids: set[str] = set()
        if developer_id:
            fav_rows = await self.db.execute(
                select(DocumentFavorite.document_id).where(
                    DocumentFavorite.developer_id == developer_id
                )
            )
            favorite_ids = {row[0] for row in fav_rows.fetchall()}

        return self._assemble_tree(
            documents,
            root_parent_id=parent_id,
            favorite_ids=favorite_ids,
            stale_ids=stale_ids,
        )

    def _assemble_tree(
        self,
        documents: list[Document],
        *,
        root_parent_id: str | None,
        favorite_ids: set[str],
        stale_ids: set[str],
    ) -> list[dict[str, Any]]:
        """Build the nested shape from a flat, already-filtered row set.

        A document whose parent was filtered out — because it is private, or
        in a space the caller does not belong to — is re-parented to the level
        being rendered rather than dropped. Dropping it would mean a page you
        have been explicitly shared on disappears from your sidebar because of
        where its author happened to file it.
        """
        by_id = {str(d.id): d for d in documents}
        children: dict[str | None, list[Document]] = {}

        for doc in documents:
            parent = str(doc.parent_id) if doc.parent_id else None
            if parent is not None and parent not in by_id:
                parent = root_parent_id
            children.setdefault(parent, []).append(doc)

        def node(doc: Document, depth: int) -> dict[str, Any]:
            doc_id = str(doc.id)
            # `by_id` is a set of distinct rows so a cycle cannot repeat within
            # one branch, but a legacy cycle can still make a branch deep; the
            # bound keeps assembly linear and the response finite.
            kids = (
                [node(c, depth + 1) for c in children.get(doc_id, [])]
                if depth < _MAX_TREE_DEPTH
                else []
            )
            return {
                "id": doc.id,
                "title": doc.title,
                "icon": doc.icon,
                "parent_id": doc.parent_id,
                "space_id": doc.space_id,
                "space_name": doc.space.name if doc.space else None,
                "position": doc.position,
                "visibility": doc.visibility,
                "created_by_id": doc.created_by_id,
                "is_favorited": doc_id in favorite_ids,
                # Visible while browsing, not only after opening the page.
                # A document whose sync is muted is deliberately excluded:
                # somebody said they did not want it updated, and a badge
                # they cannot clear is the kind that teaches people to
                # ignore badges.
                "is_behind_code": doc_id in stale_ids,
                "has_children": len(kids) > 0,
                "children": kids,
                "created_at": doc.created_at.isoformat(),
                "updated_at": doc.updated_at.isoformat(),
            }

        roots = children.get(root_parent_id, [])
        return [node(d, 0) for d in roots]

    async def _documents_behind_their_code(self, workspace_id: str) -> set[str]:
        """Documents in this workspace whose linked code has moved on.

        One query for the whole tree. Muted links are excluded — "off" means
        stop watching, and that has to include the tree or the setting only
        half takes effect.
        """
        from aexy.models.documentation import DocumentSyncMode

        rows = await self.db.execute(
            select(DocumentCodeLink.document_id)
            .join(Document, DocumentCodeLink.document_id == Document.id)
            .where(Document.workspace_id == workspace_id)
            .where(DocumentCodeLink.has_pending_changes.is_(True))
            .where(DocumentCodeLink.sync_mode != DocumentSyncMode.OFF.value)
        )
        return {row[0] for row in rows.fetchall()}

    async def move_document(
        self,
        document_id: str,
        workspace_id: str,
        new_parent_id: str | None,
        position: int,
    ) -> Document | None:
        """Move a document to a new parent and/or position.

        Raises `DocumentCycleError` if the target is the document itself or one
        of its descendants. There was no such check, so two ordinary moves
        produced a parent cycle — after which `get_ancestors`, an unbounded
        `while` over `parent_id`, spun forever and pinned the worker. The
        breadcrumb runs on every document page, so the hang landed on everyone
        immediately, not just on whoever made the move.
        """
        document = await self.get_document(document_id, workspace_id)
        if not document:
            return None

        if new_parent_id:
            if str(new_parent_id) == str(document_id):
                raise DocumentCycleError("A document cannot be its own parent")

            parent = await self.get_document(new_parent_id, workspace_id)
            if parent is None:
                raise DocumentCycleError(
                    "The destination does not exist in this workspace"
                )

            descendants = await self._subtree_ids(str(document_id))
            if str(new_parent_id) in descendants:
                raise DocumentCycleError(
                    "A document cannot be moved inside one of its own pages"
                )

        old_parent_id = document.parent_id
        old_position = document.position

        # Update positions of siblings in old parent
        if old_parent_id != new_parent_id:
            await self._reorder_siblings(workspace_id, old_parent_id, old_position, -1)

        # Update positions of siblings in new parent
        await self._reorder_siblings(workspace_id, new_parent_id, position, 1)

        # A move can change which space the document is filed under, and the
        # space is one of the things access is resolved from.
        DocumentAccess.invalidate(self.db, document_id)

        # Move document
        document.parent_id = new_parent_id
        document.position = position
        document.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def _reorder_siblings(
        self,
        workspace_id: str,
        parent_id: str | None,
        from_position: int,
        delta: int,
    ) -> None:
        """Reorder sibling documents after insert/remove."""
        stmt = (
            update(Document)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    Document.parent_id == parent_id,
                    Document.position >= from_position,
                )
            )
            .values(position=Document.position + delta)
        )
        await self.db.execute(stmt)

    async def _get_next_position(
        self,
        workspace_id: str,
        parent_id: str | None,
    ) -> int:
        """Get the next position for a new document in a parent."""
        stmt = select(func.max(Document.position)).where(
            and_(
                Document.workspace_id == workspace_id,
                Document.parent_id == parent_id,
            )
        )
        result = await self.db.execute(stmt)
        max_position = result.scalar()
        return (max_position or -1) + 1

    # ==================== Version History ====================

    async def get_version_history(
        self,
        document_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[DocumentVersion]:
        """Get version history for a document."""
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.version_number.desc())
            .limit(limit)
            .offset(offset)
            .options(selectinload(DocumentVersion.created_by))
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def prune_versions(
        self,
        document_id: str,
        *,
        keep_autosaves_for_hours: int = 24,
        keep_daily_for_days: int = 30,
    ) -> int:
        """Collapse autosave noise, keep everything a person would look for.

        `_create_version` writes a **full JSONB snapshot** of the body on every
        content change including autosaves, with no dedup and no ceiling. A
        document edited actively for a day produced hundreds of complete copies
        of itself, and `Document.versions` was `lazy="selectin"` — so loading
        the document loaded every one of them.

        The rules, in the order they are applied:

        * a manual save is never pruned. Somebody pressed save.
        * a pinned or labelled version is never pruned, nor is the newest.
        * autosaves inside the recent window are kept in full — that window is
          where "undo what I just did" lives.
        * older than that, one autosave survives per day for `keep_daily_for_days`;
          beyond it, one per week.

        Returns how many rows were removed.
        """
        rows = list(
            (
                await self.db.execute(
                    select(DocumentVersion)
                    .where(DocumentVersion.document_id == document_id)
                    .order_by(DocumentVersion.version_number.desc())
                )
            )
            .scalars()
            .all()
        )
        if len(rows) <= 1:
            return 0

        now = datetime.now(timezone.utc)
        recent_cutoff = now - timedelta(hours=keep_autosaves_for_hours)
        daily_cutoff = now - timedelta(days=keep_daily_for_days)

        newest_id = str(rows[0].id)
        seen_buckets: set[tuple[int, int, int, str]] = set()
        doomed: list[str] = []

        for version in rows:
            if str(version.id) == newest_id:
                continue
            if not version.is_auto_save or version.is_pinned or version.label:
                continue

            created = version.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)

            if created >= recent_cutoff:
                continue

            if created >= daily_cutoff:
                bucket = (created.year, created.month, created.day, "d")
            else:
                iso = created.isocalendar()
                bucket = (iso[0], iso[1], 0, "w")

            # Rows arrive newest-first, so the first version in a bucket is the
            # last state that bucket reached — which is the one worth keeping.
            if bucket in seen_buckets:
                doomed.append(str(version.id))
            else:
                seen_buckets.add(bucket)

        if not doomed:
            return 0

        await self.db.execute(
            delete(DocumentVersion).where(DocumentVersion.id.in_(doomed))
        )
        await self.db.commit()
        logger.info(
            "pruned %d autosave version(s) from document %s", len(doomed), document_id
        )
        return len(doomed)

    async def restore_version(
        self,
        document_id: str,
        version_id: str,
        restored_by_id: str,
    ) -> Document | None:
        """Restore a document to a previous version."""
        document = await self.get_document(document_id)
        if document is not None and document.is_docx:
            # The version's `content` is `{}`; the bytes are the version.
            return await self.restore_docx_version(
                document_id=document_id,
                version_id=version_id,
                restored_by_id=restored_by_id,
            )

        # Get the version
        stmt = select(DocumentVersion).where(
            and_(
                DocumentVersion.id == version_id,
                DocumentVersion.document_id == document_id,
            )
        )
        result = await self.db.execute(stmt)
        version = result.scalar_one_or_none()

        if not version:
            return None

        # A version somebody restored from is a version somebody cares about,
        # so the retention sweep must never collapse it — otherwise "go back to
        # how it was on Tuesday" works once and then the Tuesday state is gone.
        version.is_pinned = True

        # Update document with version content
        document = await self.update_document(
            document_id=document_id,
            updated_by_id=restored_by_id,
            content=version.content,
            create_version=True,
            is_auto_save=False,
        )

        return document

    async def _create_version(
        self,
        document_id: str,
        content: dict,
        created_by_id: str,
        change_summary: str | None = None,
        is_auto_save: bool = False,
        is_auto_generated: bool = False,
    ) -> DocumentVersion:
        """Create a new version for a document."""
        # Get next version number
        stmt = select(func.max(DocumentVersion.version_number)).where(
            DocumentVersion.document_id == document_id
        )
        result = await self.db.execute(stmt)
        max_version = result.scalar()
        next_version = (max_version or 0) + 1

        version = DocumentVersion(
            id=str(uuid4()),
            document_id=document_id,
            version_number=next_version,
            content=content,
            created_by_id=created_by_id,
            change_summary=change_summary,
            is_auto_save=is_auto_save,
            is_auto_generated=is_auto_generated,
        )

        self.db.add(version)
        await self.db.flush()
        return version

    # ==================== Word documents ====================
    #
    # A docx document is a `documents` row whose body is a file rather than a
    # TipTap tree. These methods own the two things that differ: the bytes go to
    # object storage, and `content_text` is refreshed from them on every write so
    # search, embeddings and the knowledge graph keep working with no
    # docx-specific code of their own.

    async def create_docx_document(
        self,
        workspace_id: str,
        created_by_id: str,
        raw: bytes,
        title: str,
        parent_id: str | None = None,
        space_id: str | None = None,
        visibility: str = DocumentVisibility.WORKSPACE.value,
        source_drive_file_id: str | None = None,
    ) -> Document:
        """Create a document whose body is a Word file.

        The bytes are parsed before anything is written: a file that cannot be
        read should fail the request, not create a document nobody can open.
        """
        extract = extract_structured(raw)

        document = Document(
            id=str(uuid4()),
            workspace_id=workspace_id,
            parent_id=parent_id,
            space_id=space_id,
            title=title,
            content={},
            content_text=extract.markdown,
            content_format=CONTENT_FORMAT_DOCX,
            visibility=visibility,
            created_by_id=created_by_id,
            last_edited_by_id=created_by_id,
            position=await self._get_next_position(workspace_id, parent_id),
            source_drive_file_id=source_drive_file_id,
        )

        # A new document's first version is always 1, so the key is derivable
        # before the row exists — which it must be, since the check constraint
        # requires a key on any docx row.
        document.docx_storage_key = docx_version_key(document.id, 1)
        document.docx_size_bytes = len(raw)
        document.docx_content_sha = compute_docx_sha(raw)

        self.db.add(document)
        await self.db.flush()

        await self._create_docx_version(
            document=document,
            raw=raw,
            created_by_id=created_by_id,
            change_summary="Document created",
        )

        await log_activity(
            self.db,
            workspace_id=workspace_id,
            entity_type="document",
            entity_id=str(document.id),
            activity_type="created",
            actor_id=created_by_id,
            title=f"Created document '{title}'",
        )

        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def replace_docx_bytes(
        self,
        document_id: str,
        updated_by_id: str,
        raw: bytes,
        expected_sha: str | None = None,
        change_summary: str | None = None,
    ) -> Document | None:
        """Save new bytes for a docx document, as a new version.

        ``expected_sha`` is optimistic concurrency: the editor sends the sha it
        loaded, and a mismatch means someone else saved in between. Refusing is
        the only safe answer — the editor holds a whole document in memory, so
        a blind write would silently discard the other person's save in full,
        not merge around it.
        """
        # Locked for the rest of the transaction, which is what makes both the
        # staleness check and the version number correct under concurrency.
        # Without it two autosaves can read the same sha, both pass the check,
        # and both claim the same version number — the first losing its content
        # and the second failing on the uniqueness constraint. SQLite ignores
        # row locking, so the tests exercise the logic and Postgres enforces it.
        document = await self._get_document_for_update(document_id)
        if not document:
            return None
        if not document.is_docx:
            raise ValueError(
                f"Document {document_id} is {document.content_format!r}, not a Word document."
            )

        if expected_sha is not None and document.docx_content_sha != expected_sha:
            raise DocxConflictError(
                "This document changed since it was opened.",
                current_sha=document.docx_content_sha,
            )

        extract = extract_structured(raw)

        # The version write is what puts the bytes in storage, and the row is
        # repointed at that object. Nothing overwrites anything, so a commit that
        # never lands leaves an unreferenced object rather than a row describing
        # content that is not there.
        version = await self._create_docx_version(
            document=document,
            raw=raw,
            created_by_id=updated_by_id,
            change_summary=change_summary or "Content updated",
        )

        document.content_text = extract.markdown
        document.docx_storage_key = version.docx_storage_key
        document.docx_size_bytes = len(raw)
        document.docx_content_sha = compute_docx_sha(raw)
        document.last_edited_by_id = updated_by_id
        document.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def _get_document_for_update(self, document_id: str) -> Document | None:
        """The document row, locked until this transaction ends.

        Serialises concurrent saves of one document. `get_document` eager-loads
        relationships, which cannot be combined with `FOR UPDATE` on every
        backend, so this is a deliberately bare read.
        """
        result = await self.db.execute(
            select(Document).where(Document.id == document_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_docx_bytes(self, document_id: str) -> bytes | None:
        """The current bytes of a docx document, or None if unreadable."""
        document = await self.get_document(document_id)
        if not document or not document.is_docx or not document.docx_storage_key:
            return None
        return self._get_docx_bytes(document.docx_storage_key)

    async def _create_docx_version(
        self,
        document: Document,
        raw: bytes,
        created_by_id: str,
        change_summary: str | None = None,
    ) -> DocumentVersion:
        """Snapshot the bytes as an immutable, numbered object.

        A copy per version rather than a diff chain: this module cannot parse
        the format, so there is no honest diff to replay, and a restore that
        reconstructs bytes it does not understand is how a document gets
        quietly corrupted.
        """
        stmt = select(func.max(DocumentVersion.version_number)).where(
            DocumentVersion.document_id == document.id
        )
        result = await self.db.execute(stmt)
        next_version = (result.scalar() or 0) + 1

        key = docx_version_key(document.id, next_version)
        self._put_docx_bytes(key, raw)

        version = DocumentVersion(
            id=str(uuid4()),
            document_id=document.id,
            version_number=next_version,
            content={},
            content_format=CONTENT_FORMAT_DOCX,
            docx_storage_key=key,
            docx_size_bytes=len(raw),
            created_by_id=created_by_id,
            change_summary=change_summary,
        )
        self.db.add(version)
        await self.db.flush()
        return version

    async def restore_docx_version(
        self,
        document_id: str,
        version_id: str,
        restored_by_id: str,
    ) -> Document | None:
        """Make a previous version's bytes current, as a new version.

        Forward-only, matching ``restore_version`` for TipTap documents: the
        history a restore was made from stays readable instead of being rewritten.
        """
        document = await self.get_document(document_id)
        if not document or not document.is_docx:
            return None

        stmt = select(DocumentVersion).where(
            and_(
                DocumentVersion.id == version_id,
                DocumentVersion.document_id == document_id,
            )
        )
        result = await self.db.execute(stmt)
        version = result.scalar_one_or_none()
        if not version or not version.docx_storage_key:
            return None

        raw = self._get_docx_bytes(version.docx_storage_key)
        if raw is None:
            return None

        return await self.replace_docx_bytes(
            document_id=document_id,
            updated_by_id=restored_by_id,
            raw=raw,
            change_summary=f"Restored from version {version.version_number}",
        )

    @staticmethod
    def _put_docx_bytes(key: str, raw: bytes) -> None:
        storage = get_storage_service()
        if not storage.is_configured():
            # Dev and test run without object storage. Failing here would make
            # every docx path untestable, so the row is still written — and the
            # read side returns None rather than pretending to have bytes.
            logger.warning("Storage not configured; skipped writing %s", key)
            return
        if not storage.put_object(
            key=key, data=raw, content_type=DOCX_CONTENT_TYPE
        ):
            raise DocxStorageError(f"Failed to write document bytes to {key}.")

    @staticmethod
    def _get_docx_bytes(key: str) -> bytes | None:
        storage = get_storage_service()
        if not storage.is_configured():
            return None
        result = storage.get_object(key)
        return result[0] if result else None

    # ==================== Search ====================

    async def search_documents(
        self,
        workspace_id: str,
        query: str,
        limit: int = 20,
        offset: int = 0,
        access_clause: Any | None = None,
        semantic: Any | None = None,
    ) -> list[SearchHit]:
        """Search titles and bodies, ranked, filtered to what the caller may read.

        Two defects, one method.

        The first was that this filtered on `workspace_id` alone — no
        visibility, no space, no collaborator, no `developer_id` parameter at
        all — and was reachable by any workspace viewer. That made every
        private document in the workspace discoverable *by its contents*, which
        is worse than the by-id read it was built on. `access_clause` is now
        required by every caller and applied inside the query, so `LIMIT` and
        `OFFSET` count the rows the caller can actually see.

        The second was `ILIKE '%q%'`: a leading wildcard over `content_text`,
        which is a sequential scan of every document body in the workspace,
        ordered by `updated_at` rather than by relevance. On PostgreSQL this
        now uses the `search_vector` column and its GIN index, ranks with
        `ts_rank_cd`, and returns a `ts_headline` snippet. SQLite — the test
        suite — keeps the `LIKE` path, which is why the two are branches of one
        method rather than two methods somebody could call the wrong one of.
        """
        base = select(Document).where(
            Document.workspace_id == workspace_id,
            Document.deleted_at.is_(None),
            Document.is_template == False,  # noqa: E712
        )
        if access_clause is not None:
            base = base.where(access_clause)

        if self.db.bind is not None and self.db.bind.dialect.name == "postgresql":
            hits = await self._search_postgres(base, query, limit, offset)
        else:
            hits = await self._search_fallback(base, query, limit, offset)

        if semantic is not None:
            hits = await self._blend_semantic(
                hits,
                semantic=semantic,
                workspace_id=workspace_id,
                query=query,
                access_clause=access_clause,
                limit=limit,
                offset=offset,
            )
        return hits

    async def _blend_semantic(
        self,
        keyword_hits: list["SearchHit"],
        *,
        semantic: Any,
        workspace_id: str,
        query: str,
        access_clause: Any | None,
        limit: int,
        offset: int,
    ) -> list["SearchHit"]:
        """Merge keyword and vector results into one ranking.

        Reciprocal rank fusion rather than a weighted sum of the two scores:
        `ts_rank_cd` and cosine similarity are not on the same scale and their
        ranges shift with the corpus, so any fixed weighting is tuned to
        whatever documents happened to exist when it was chosen. RRF only reads
        positions, which is what makes it survive the corpus changing.

        A document that only the vector side found still needs its row, and
        that fetch re-applies the access predicate — the semantic search
        already filtered, and doing it twice costs one indexed lookup and
        removes a way for the two paths to disagree.
        """
        K = 60  # RRF damping; the conventional value.

        scored: dict[str, float] = {}
        by_id: dict[str, SearchHit] = {}

        for rank, hit in enumerate(keyword_hits):
            key = str(hit.document.id)
            scored[key] = scored.get(key, 0.0) + 1.0 / (K + rank + 1)
            by_id[key] = hit

        semantic_hits = await semantic.search(
            workspace_id,
            query,
            access_clause=access_clause,
            limit=limit + offset,
        )
        missing = [h.document_id for h in semantic_hits if h.document_id not in by_id]
        if missing:
            stmt = select(Document).where(Document.id.in_(missing))
            if access_clause is not None:
                stmt = stmt.where(access_clause)
            for document in (await self.db.execute(stmt)).scalars().all():
                by_id[str(document.id)] = SearchHit(
                    document=document, score=0.0, snippet=None
                )

        for rank, hit in enumerate(semantic_hits):
            if hit.document_id not in by_id:
                continue  # filtered out by the access predicate on re-fetch
            scored[hit.document_id] = scored.get(hit.document_id, 0.0) + 1.0 / (
                K + rank + 1
            )
            existing = by_id[hit.document_id]
            if not existing.snippet and hit.chunk_text:
                existing.snippet = hit.chunk_text[:280]

        ranked = sorted(scored.items(), key=lambda kv: kv[1], reverse=True)
        out: list[SearchHit] = []
        for document_id, score in ranked[offset : offset + limit]:
            hit = by_id[document_id]
            hit.score = score
            out.append(hit)
        return out

    async def _search_postgres(
        self,
        base,
        query: str,
        limit: int,
        offset: int,
    ) -> list["SearchHit"]:
        tsquery = func.websearch_to_tsquery("english", query)
        rank = func.ts_rank_cd(DOCUMENT_SEARCH_VECTOR, tsquery)
        snippet = func.ts_headline(
            "english",
            func.coalesce(Document.content_text, ""),
            tsquery,
            "StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=24,MinWords=8",
        )

        stmt = (
            base.add_columns(rank.label("rank"), snippet.label("snippet"))
            .where(DOCUMENT_SEARCH_VECTOR.op("@@")(tsquery))
            .order_by(rank.desc(), Document.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = (await self.db.execute(stmt)).all()
        return [
            SearchHit(document=row[0], score=float(row[1] or 0.0), snippet=row[2])
            for row in rows
        ]

    async def _search_fallback(
        self,
        base,
        query: str,
        limit: int,
        offset: int,
    ) -> list["SearchHit"]:
        pattern = f"%{query}%"
        stmt = (
            base.where(
                or_(
                    Document.title.ilike(pattern),
                    Document.content_text.ilike(pattern),
                )
            )
            # A title match is what the searcher almost always meant; without
            # this the fallback ordered purely by recency and buried the exact
            # page whose name was typed.
            .order_by(
                case((Document.title.ilike(pattern), 0), else_=1),
                Document.updated_at.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
        documents = list((await self.db.execute(stmt)).scalars().all())
        return [
            SearchHit(
                document=doc,
                score=1.0 if query.lower() in (doc.title or "").lower() else 0.5,
                snippet=_excerpt(doc.content_text, query),
            )
            for doc in documents
        ]

    # ==================== Templates ====================

    @staticmethod
    def _system_template_row(entry: "SystemTemplate") -> DocumentTemplate:
        """A catalogue entry shaped like the row the API and callers expect.

        Deliberately never added to the session: system templates live in code
        (``document_templates_catalog``), and this only spares every caller and
        every response builder from having to know that. It means the rest of this
        service, ``create_document`` and the template endpoints all keep working
        against one type.
        """
        return DocumentTemplate(
            id=entry.id,
            workspace_id=None,
            name=entry.name,
            description=entry.description,
            category=entry.category.value,
            icon=entry.icon,
            content_template=entry.content,
            prompt_template=entry.prompt,
            system_prompt=None,
            variables=list(entry.variables),
            is_system=True,
            is_active=True,
            created_by_id=None,
            # A code-defined template has no creation time. A fixed value keeps the
            # response stable between requests, which `now()` would not.
            created_at=SYSTEM_TEMPLATE_TIMESTAMP,
            updated_at=SYSTEM_TEMPLATE_TIMESTAMP,
        )

    async def get_template(self, template_id: str) -> DocumentTemplate | None:
        """Get a template by ID, from the catalogue or the workspace's own rows.

        The catalogue is consulted first so a ``sys:`` id resolves without a query
        — and so ``create_document(template_id=…)`` and ``duplicate_template``
        work against system templates unchanged.
        """
        if is_system_template_id(template_id):
            entry = get_system_template(template_id)
            return self._system_template_row(entry) if entry else None

        stmt = select(DocumentTemplate).where(DocumentTemplate.id == template_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_templates(
        self,
        workspace_id: str | None = None,
        category: str | None = None,
        include_system: bool = True,
    ) -> list[DocumentTemplate]:
        """List available templates: the code catalogue plus the workspace's own.

        System templates come from the catalogue rather than from rows, so they
        are the same everywhere and change on deploy. They are listed first, in
        the catalogue's own order (Blank first) rather than alphabetically —
        picker order is an authoring decision.
        """
        system: list[DocumentTemplate] = (
            [self._system_template_row(entry) for entry in list_system_templates(category)]
            if include_system
            else []
        )

        if not workspace_id:
            return system

        conditions = [
            DocumentTemplate.is_active == True,  # noqa: E712
            DocumentTemplate.workspace_id == workspace_id,
        ]
        if category:
            conditions.append(DocumentTemplate.category == category)

        stmt = (
            select(DocumentTemplate)
            .where(and_(*conditions))
            .order_by(DocumentTemplate.name)
        )
        result = await self.db.execute(stmt)
        return system + list(result.scalars().all())

    async def create_template(
        self,
        workspace_id: str,
        created_by_id: str,
        name: str,
        category: str,
        content_template: dict,
        prompt_template: str,
        variables: list[str],
        description: str | None = None,
        icon: str | None = None,
        system_prompt: str | None = None,
    ) -> DocumentTemplate:
        """Create a custom template."""
        template = DocumentTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            category=category,
            icon=icon,
            content_template=content_template,
            prompt_template=prompt_template,
            system_prompt=system_prompt,
            variables=variables,
            is_system=False,
            created_by_id=created_by_id,
        )

        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def duplicate_template(
        self,
        template_id: str,
        workspace_id: str,
        duplicated_by_id: str,
    ) -> DocumentTemplate | None:
        """Duplicate a template (typically a system template for customization)."""
        original = await self.get_template(template_id)
        if not original:
            return None

        return await self.create_template(
            workspace_id=workspace_id,
            created_by_id=duplicated_by_id,
            name=f"{original.name} (Custom)",
            category=original.category,
            content_template=original.content_template,
            prompt_template=original.prompt_template,
            variables=original.variables,
            description=original.description,
            icon=original.icon,
            system_prompt=original.system_prompt,
        )

    #: What a workspace may change about its own template. Anything else on the
    #: model — `is_system`, `workspace_id`, `created_by_id` — is not the caller's
    #: to set, so an unknown key is dropped rather than trusted.
    EDITABLE_TEMPLATE_FIELDS = frozenset(
        {"name", "description", "icon", "content_template", "category"}
    )

    async def update_workspace_template(
        self,
        template_id: str,
        workspace_id: str,
        fields: dict,
    ) -> DocumentTemplate | None:
        """Rename or re-body one of this workspace's own templates.

        Scoped to ``workspace_id`` in the query rather than checked afterwards, so
        a template id from another workspace is indistinguishable from one that
        does not exist. System templates live in code and are not editable at all;
        the way to change one is to fork it (``duplicate_template``).

        ``fields`` carries only what the request actually sent, so a description
        can be cleared by sending ``null`` — treating ``None`` as "leave alone"
        would make a template's description unremovable once written.
        """
        if is_system_template_id(template_id):
            return None

        stmt = select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            DocumentTemplate.workspace_id == workspace_id,
        )
        template = (await self.db.execute(stmt)).scalar_one_or_none()
        if template is None:
            return None

        for key, value in fields.items():
            if key in self.EDITABLE_TEMPLATE_FIELDS:
                setattr(template, key, value)

        await self.db.commit()
        # Refreshed even though the session sets `expire_on_commit=False`. Taking
        # it out looked like removing a redundant round trip and instead made
        # every rename fail with `MissingGreenlet`: the endpoint builds its
        # response in a sync function, so the first attribute that still needs
        # loading attempts IO outside the greenlet and raises. The update itself
        # had already committed, so the row changed and the caller saw a 500 —
        # the worst shape a bug can take. Found by renaming one in a browser.
        await self.db.refresh(template)
        return template

    async def delete_workspace_template(self, template_id: str, workspace_id: str) -> bool:
        """Retire one of this workspace's templates. Returns whether it existed.

        Deactivated rather than deleted: ``list_templates`` already filters on
        ``is_active``, and a hard delete would be the one destructive action in the
        templates surface — a mis-click that cannot be undone.
        """
        if is_system_template_id(template_id):
            return False

        stmt = select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            DocumentTemplate.workspace_id == workspace_id,
        )
        template = (await self.db.execute(stmt)).scalar_one_or_none()
        if template is None:
            return False

        template.is_active = False
        await self.db.commit()
        return True

    # ==================== Code Links ====================

    async def create_code_link(
        self,
        document_id: str,
        repository_id: str,
        path: str,
        link_type: str = "file",
        branch: str = "main",
        section_id: str | None = None,
        owner_developer_id: str | None = None,
        template_category: str | None = None,
    ) -> DocumentCodeLink:
        """Create a link between a document and source code.

        `owner_developer_id` is whoever set the sync up — their plan tier
        decides how it behaves and their GitHub access is the fallback when
        no installation covers the repository directly. Callers that have a
        request user should always pass it; leaving it null produces a sync
        that works only while a repository-scoped installation exists.
        """
        link = DocumentCodeLink(
            id=str(uuid4()),
            document_id=document_id,
            repository_id=repository_id,
            path=path,
            link_type=link_type,
            branch=branch,
            document_section_id=section_id,
            owner_developer_id=owner_developer_id,
            template_category=template_category,
        )

        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)
        return link

    async def find_code_link(
        self,
        workspace_id: str,
        repository_id: str,
        path: str,
    ):
        """The existing link for this repository path, if the workspace has one.

        What makes re-running a whole-repository pass safe: without it a second
        run creates a parallel document per module, and the reviewed one is
        buried under near-duplicates nobody can tell apart.
        """
        stmt = (
            select(DocumentCodeLink)
            .join(Document, DocumentCodeLink.document_id == Document.id)
            .where(Document.workspace_id == workspace_id)
            .where(DocumentCodeLink.repository_id == repository_id)
            .where(DocumentCodeLink.path == path)
            .options(selectinload(DocumentCodeLink.repository))
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def set_code_link_sync_mode(
        self,
        link_id: str,
        document_id: str,
        sync_mode: str,
    ) -> DocumentCodeLink | None:
        """Set how this link reacts to code changes.

        Turning a link off also clears its pending flag: "stop watching" that
        left a stale "behind the code" badge on the page would be a setting
        that visibly did not take effect.
        """
        stmt = (
            select(DocumentCodeLink)
            .where(DocumentCodeLink.id == link_id)
            .where(DocumentCodeLink.document_id == document_id)
            .options(selectinload(DocumentCodeLink.repository))
        )
        result = await self.db.execute(stmt)
        link = result.scalar_one_or_none()
        if not link:
            return None

        link.sync_mode = sync_mode
        if sync_mode == DocumentSyncMode.OFF.value:
            link.has_pending_changes = False

        await self.db.commit()
        await self.db.refresh(link)
        return link

    async def get_code_link(
        self, link_id: str, document_id: str
    ) -> DocumentCodeLink | None:
        """One code link, scoped to the document the caller was checked against.

        Scoped by `document_id` as well as `link_id`: the route has already
        checked the caller may touch this document, and matching on the link
        alone would let that check be bypassed by passing a link belonging to a
        document in another workspace.
        """
        stmt = (
            select(DocumentCodeLink)
            .where(DocumentCodeLink.id == link_id)
            .where(DocumentCodeLink.document_id == document_id)
            .options(selectinload(DocumentCodeLink.repository))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def set_code_link_owner(
        self,
        link_id: str,
        document_id: str,
        owner_developer_id: str,
    ) -> DocumentCodeLink | None:
        """Point a code link's sync at a different developer."""
        link = await self.get_code_link(link_id, document_id)
        if not link:
            return None

        link.owner_developer_id = owner_developer_id
        await self.db.commit()
        await self.db.refresh(link)
        return link

    async def get_code_links(self, document_id: str) -> list[DocumentCodeLink]:
        """Get all code links for a document."""
        stmt = (
            select(DocumentCodeLink)
            .where(DocumentCodeLink.document_id == document_id)
            .options(selectinload(DocumentCodeLink.repository))
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_code_link(self, link_id: str) -> bool:
        """Delete a code link."""
        stmt = delete(DocumentCodeLink).where(DocumentCodeLink.id == link_id)
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount > 0

    async def get_documents_linked_to_path(
        self,
        repository_id: str,
        path: str,
    ) -> list[Document]:
        """Find all documents linked to a specific code path."""
        stmt = (
            select(Document)
            .join(DocumentCodeLink)
            .where(
                and_(
                    DocumentCodeLink.repository_id == repository_id,
                    or_(
                        DocumentCodeLink.path == path,
                        # Also match directory links that contain this path
                        and_(
                            DocumentCodeLink.link_type == "directory",
                            path.startswith(DocumentCodeLink.path),
                        ),
                    ),
                )
            )
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ==================== Permissions ====================

    async def add_collaborator(
        self,
        document_id: str,
        developer_id: str,
        permission: str,
        invited_by_id: str,
    ) -> DocumentCollaborator:
        """Add a collaborator to a document."""
        collaborator = DocumentCollaborator(
            id=str(uuid4()),
            document_id=document_id,
            developer_id=developer_id,
            permission=permission,
            invited_by_id=invited_by_id,
        )

        self.db.add(collaborator)

        # Get workspace_id for the unified feed
        document = await self.get_document(document_id)
        if document:
            await log_activity(
                self.db,
                workspace_id=document.workspace_id,
                entity_type="document",
                entity_id=document_id,
                activity_type="linked",
                actor_id=invited_by_id,
                title=f"Shared document '{document.title}'",
                metadata={"collaborator_id": developer_id, "permission": permission},
            )

        await self.db.commit()
        await self.db.refresh(collaborator)

        # Notify the developer they were added as collaborator
        try:
            from aexy.services.notification_service import notify_document_shared
            from aexy.models.developer import Developer

            doc = await self.get_document(document_id)
            inviter = await self.db.get(Developer, invited_by_id)
            sharer_name = inviter.name if inviter else "Someone"
            doc_title = doc.title if doc else "a document"
            workspace_id = doc.workspace_id if doc else ""
            await notify_document_shared(
                db=self.db,
                developer_id=developer_id,
                sharer_name=sharer_name,
                document_title=doc_title,
                document_id=document_id,
                workspace_id=str(workspace_id),
            )
        except Exception:
            pass  # Non-critical

        # A share changes who may read this document, and `DocumentAccess`
        # memoises its answers for the life of the session. Without this the
        # rest of the request — and the response it builds — would still be
        # working from the answer it computed before its own write.
        DocumentAccess.invalidate(self.db, document_id)

        return collaborator

    async def update_collaborator_permission(
        self,
        document_id: str,
        developer_id: str,
        permission: str,
    ) -> bool:
        """Update a collaborator's permission."""
        stmt = (
            update(DocumentCollaborator)
            .where(
                and_(
                    DocumentCollaborator.document_id == document_id,
                    DocumentCollaborator.developer_id == developer_id,
                )
            )
            .values(permission=permission)
        )

        result = await self.db.execute(stmt)
        await self.db.commit()
        DocumentAccess.invalidate(self.db, document_id)
        return result.rowcount > 0

    async def remove_collaborator(
        self,
        document_id: str,
        developer_id: str,
    ) -> bool:
        """Remove a collaborator from a document."""
        stmt = delete(DocumentCollaborator).where(
            and_(
                DocumentCollaborator.document_id == document_id,
                DocumentCollaborator.developer_id == developer_id,
            )
        )

        result = await self.db.execute(stmt)

        # Log to unified feed
        if result.rowcount > 0:
            document = await self.get_document(document_id)
            if document:
                await log_activity(
                    self.db,
                    workspace_id=str(document.workspace_id),
                    entity_type="document",
                    entity_id=str(document.id),
                    activity_type="unlinked",
                    title=f"Removed collaborator from document '{document.title}'",
                )

        await self.db.commit()
        DocumentAccess.invalidate(self.db, document_id)
        return result.rowcount > 0

    async def check_permission(
        self,
        document_id: str,
        developer_id: str,
        required_permission: str,
    ) -> bool:
        """Deprecated. Use `DocumentAccess` instead.

        This was the module's only correct permission check and it was called
        from three collaborator-management endpoints, never from a read or a
        write. It also predates document spaces, so it answers "no" for a space
        admin acting in their own space and for a workspace admin acting on a
        document whose author has left.

        Kept as a thin delegation rather than deleted so that any caller
        outside this repository gets the *right* answer instead of the old one,
        and so the fix cannot be undone by re-adding a call to it.
        """
        access = DocumentAccess(self.db)
        level = await access.resolve(document_id, developer_id)
        return level >= AccessLevel.from_permission(required_permission)

    # ==================== Favorites ====================

    async def toggle_favorite(
        self,
        document_id: str,
        developer_id: str,
    ) -> bool:
        """Toggle favorite status for a document. Returns True if favorited, False if unfavorited."""
        # Check if already favorited
        stmt = select(DocumentFavorite).where(
            and_(
                DocumentFavorite.document_id == document_id,
                DocumentFavorite.developer_id == developer_id,
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Remove favorite
            await self.db.delete(existing)
            await self.db.commit()
            return False
        else:
            # Add favorite
            favorite = DocumentFavorite(
                id=str(uuid4()),
                document_id=document_id,
                developer_id=developer_id,
            )
            self.db.add(favorite)
            await self.db.commit()
            return True

    async def get_favorites(
        self,
        workspace_id: str,
        developer_id: str,
        access_clause: Any | None = None,
    ) -> list[dict[str, Any]]:
        """Get user's favorited documents as a flat list.

        Access-filtered like every other listing. A favourite outlives the
        share that created it: somebody stars a page, their collaborator row is
        later removed, and without this the page stays in their sidebar and
        opens.
        """
        stmt = (
            select(Document)
            .join(DocumentFavorite, Document.id == DocumentFavorite.document_id)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    Document.deleted_at.is_(None),
                    DocumentFavorite.developer_id == developer_id,
                )
            )
            .order_by(DocumentFavorite.created_at.desc())
        )
        if access_clause is not None:
            stmt = stmt.where(access_clause)

        result = await self.db.execute(stmt)
        documents = result.scalars().all()

        return [
            {
                "id": doc.id,
                "title": doc.title,
                "icon": doc.icon,
                "parent_id": doc.parent_id,
                "position": doc.position,
                "visibility": doc.visibility,
                "created_by_id": doc.created_by_id,
                "is_favorited": True,
                "has_children": False,  # Don't load children for favorites list
                "children": [],
                "created_at": doc.created_at.isoformat(),
                "updated_at": doc.updated_at.isoformat(),
            }
            for doc in documents
        ]

    # ==================== Ancestors (Breadcrumbs) ====================

    async def get_ancestors(
        self,
        document_id: str,
    ) -> list[dict[str, Any]]:
        """Get ancestors of a document for breadcrumb navigation.

        `move_document` now refuses to create a parent cycle, but rows that
        predate that guard still exist in deployed databases and this walk is
        what they hang. The visited set turns one of them into a truncated
        breadcrumb — wrong, visibly so, and survivable — instead of a pinned
        worker on every page load.
        """
        ancestors: list[dict[str, Any]] = []
        seen: set[str] = set()
        current_id = document_id

        while current_id and current_id not in seen:
            seen.add(current_id)

            stmt = select(Document).where(Document.id == current_id)
            result = await self.db.execute(stmt)
            doc = result.scalar_one_or_none()

            if not doc:
                break

            # Don't include the document itself in ancestors
            if doc.id != document_id:
                ancestors.insert(
                    0,
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "icon": doc.icon,
                    },
                )

            current_id = doc.parent_id

        if current_id and current_id in seen:
            logger.warning(
                "document %s sits in a parent cycle; breadcrumb truncated",
                document_id,
            )

        return ancestors

    # ==================== Helpers ====================

    def _extract_text(self, content: dict) -> str:
        """Extract plain text from TipTap JSON content for search."""
        text_parts = []

        def extract_recursive(node: dict | list) -> None:
            if isinstance(node, dict):
                if node.get("type") == "text":
                    text_parts.append(node.get("text", ""))
                if "content" in node:
                    extract_recursive(node["content"])
            elif isinstance(node, list):
                for item in node:
                    extract_recursive(item)

        extract_recursive(content)
        return " ".join(text_parts)
