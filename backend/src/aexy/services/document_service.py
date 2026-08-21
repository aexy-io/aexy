"""Document management service for Notion-like documentation."""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.services.activity_logger import log_activity
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
    CollaborationSession,
    Document,
    DocumentCodeLink,
    DocumentCollaborator,
    DocumentFavorite,
    DocumentGenerationPrompt,
    DocumentPermission,
    DocumentStatus,
    DocumentSyncMode,
    DocumentSyncQueue,
    DocumentTemplate,
    DocumentVersion,
    DocumentVisibility,
    TemplateCategory,
)

logger = logging.getLogger(__name__)

# Stamped on the catalogue's templates, which ship with the code and so have no
# creation date of their own. Fixed rather than `now()` so the same template does
# not appear to change every time it is listed.
SYSTEM_TEMPLATE_TIMESTAMP = datetime(2026, 1, 1, tzinfo=timezone.utc)

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


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
    ) -> Document | None:
        """Get a document by ID with all relationships."""
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
        return document

    async def delete_document(
        self,
        document_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a document and all its children."""
        document = await self.get_document(document_id, workspace_id)
        if not document:
            return False

        # Log before hard delete since entity won't exist after
        await log_activity(
            self.db,
            workspace_id=str(document.workspace_id),
            entity_type="document",
            entity_id=str(document.id),
            activity_type="deleted",
            title=f"Deleted document '{document.title}'",
        )

        # Delete recursively (cascade will handle children)
        await self.db.delete(document)
        await self.db.commit()
        return True

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
        _stale_ids: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Get hierarchical document tree for sidebar.

        `_stale_ids` is computed once at the top of the recursion and threaded
        down. The tree recurses per level, so asking per document whether it
        has fallen behind its code would be a query per node — on the one
        surface that renders on every page of the module.
        """
        if _stale_ids is None:
            _stale_ids = await self._documents_behind_their_code(workspace_id)
        stmt = (
            select(Document)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    Document.parent_id == parent_id,
                )
            )
            .order_by(Document.position)
        )

        if not include_templates:
            stmt = stmt.where(Document.is_template == False)  # noqa: E712

        # Filter by space if specified
        if space_id:
            if space_id == "none":
                # Special value to get docs without a space
                stmt = stmt.where(Document.space_id == None)  # noqa: E711
            else:
                stmt = stmt.where(Document.space_id == space_id)

        # Filter by visibility if specified
        if visibility:
            stmt = stmt.where(Document.visibility == visibility)
            # For private docs, only show docs created by the user
            if visibility == DocumentVisibility.PRIVATE.value and developer_id:
                stmt = stmt.where(Document.created_by_id == developer_id)

        result = await self.db.execute(stmt)
        documents = result.scalars().all()

        # Get user's favorites to mark them
        favorite_ids: set[str] = set()
        if developer_id:
            fav_stmt = select(DocumentFavorite.document_id).where(
                DocumentFavorite.developer_id == developer_id
            )
            fav_result = await self.db.execute(fav_stmt)
            favorite_ids = {row[0] for row in fav_result.fetchall()}

        tree = []
        for doc in documents:
            children = await self.get_document_tree(
                workspace_id,
                developer_id,
                doc.id,
                include_templates,
                visibility,
                space_id,
                _stale_ids=_stale_ids,
            )
            tree.append(
                {
                    "id": doc.id,
                    "title": doc.title,
                    "icon": doc.icon,
                    "parent_id": doc.parent_id,
                    "space_id": doc.space_id,
                    "space_name": doc.space.name if doc.space else None,
                    "position": doc.position,
                    "visibility": doc.visibility,
                    "created_by_id": doc.created_by_id,
                    "is_favorited": doc.id in favorite_ids,
                    # Visible while browsing, not only after opening the page.
                    # A document whose sync is muted is deliberately excluded:
                    # somebody said they did not want it updated, and a badge
                    # they cannot clear is the kind that teaches people to
                    # ignore badges.
                    "is_behind_code": doc.id in _stale_ids,
                    "has_children": len(children) > 0,
                    "children": children,
                    "created_at": doc.created_at.isoformat(),
                    "updated_at": doc.updated_at.isoformat(),
                }
            )

        return tree

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
        """Move a document to a new parent and/or position."""
        document = await self.get_document(document_id, workspace_id)
        if not document:
            return None

        old_parent_id = document.parent_id
        old_position = document.position

        # Update positions of siblings in old parent
        if old_parent_id != new_parent_id:
            await self._reorder_siblings(workspace_id, old_parent_id, old_position, -1)

        # Update positions of siblings in new parent
        await self._reorder_siblings(workspace_id, new_parent_id, position, 1)

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
    ) -> list[Document]:
        """Full-text search in document titles and content."""
        # Simple LIKE search for now (can be upgraded to full-text search)
        search_pattern = f"%{query}%"

        stmt = (
            select(Document)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    Document.is_template == False,  # noqa: E712
                    or_(
                        Document.title.ilike(search_pattern),
                        Document.content_text.ilike(search_pattern),
                    ),
                )
            )
            .order_by(Document.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

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
        return result.rowcount > 0

    async def check_permission(
        self,
        document_id: str,
        developer_id: str,
        required_permission: str,
    ) -> bool:
        """Check if a developer has the required permission on a document."""
        document = await self.get_document(document_id)
        if not document:
            return False

        # Creator has admin access
        if document.created_by_id == developer_id:
            return True

        # Check explicit permissions
        stmt = select(DocumentCollaborator).where(
            and_(
                DocumentCollaborator.document_id == document_id,
                DocumentCollaborator.developer_id == developer_id,
            )
        )

        result = await self.db.execute(stmt)
        collaborator = result.scalar_one_or_none()

        if not collaborator:
            return False

        # Permission hierarchy: admin > edit > comment > view
        permission_levels = {
            DocumentPermission.VIEW.value: 1,
            DocumentPermission.COMMENT.value: 2,
            DocumentPermission.EDIT.value: 3,
            DocumentPermission.ADMIN.value: 4,
        }

        user_level = permission_levels.get(collaborator.permission, 0)
        required_level = permission_levels.get(required_permission, 0)

        return user_level >= required_level

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
    ) -> list[dict[str, Any]]:
        """Get user's favorited documents as a flat list."""
        stmt = (
            select(Document)
            .join(DocumentFavorite, Document.id == DocumentFavorite.document_id)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    DocumentFavorite.developer_id == developer_id,
                )
            )
            .order_by(DocumentFavorite.created_at.desc())
        )

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
        """Get ancestors of a document for breadcrumb navigation."""
        ancestors = []
        current_id = document_id

        while current_id:
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
