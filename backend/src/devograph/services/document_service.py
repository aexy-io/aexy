"""Document management service for Notion-like documentation."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.documentation import (
    CollaborationSession,
    Document,
    DocumentCodeLink,
    DocumentCollaborator,
    DocumentFavorite,
    DocumentGenerationPrompt,
    DocumentNotification,
    DocumentNotificationType,
    DocumentPermission,
    DocumentStatus,
    DocumentSyncQueue,
    DocumentTemplate,
    DocumentVersion,
    DocumentVisibility,
    TemplateCategory,
)


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
    ) -> list[dict[str, Any]]:
        """Get hierarchical document tree for sidebar."""
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
                workspace_id, developer_id, doc.id, include_templates, visibility, space_id
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
                    "has_children": len(children) > 0,
                    "children": children,
                    "created_at": doc.created_at.isoformat(),
                    "updated_at": doc.updated_at.isoformat(),
                }
            )

        return tree

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

    async def get_template(self, template_id: str) -> DocumentTemplate | None:
        """Get a template by ID."""
        stmt = select(DocumentTemplate).where(DocumentTemplate.id == template_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_templates(
        self,
        workspace_id: str | None = None,
        category: str | None = None,
        include_system: bool = True,
    ) -> list[DocumentTemplate]:
        """List available templates."""
        conditions = [DocumentTemplate.is_active == True]  # noqa: E712

        if workspace_id:
            if include_system:
                conditions.append(
                    or_(
                        DocumentTemplate.workspace_id == workspace_id,
                        DocumentTemplate.is_system == True,  # noqa: E712
                    )
                )
            else:
                conditions.append(DocumentTemplate.workspace_id == workspace_id)
        else:
            conditions.append(DocumentTemplate.is_system == True)  # noqa: E712

        if category:
            conditions.append(DocumentTemplate.category == category)

        stmt = (
            select(DocumentTemplate)
            .where(and_(*conditions))
            .order_by(DocumentTemplate.name)
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

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

    # ==================== Code Links ====================

    async def create_code_link(
        self,
        document_id: str,
        repository_id: str,
        path: str,
        link_type: str = "file",
        branch: str = "main",
        section_id: str | None = None,
    ) -> DocumentCodeLink:
        """Create a link between a document and source code."""
        link = DocumentCodeLink(
            id=str(uuid4()),
            document_id=document_id,
            repository_id=repository_id,
            path=path,
            link_type=link_type,
            branch=branch,
            document_section_id=section_id,
        )

        self.db.add(link)
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
        await self.db.commit()
        await self.db.refresh(collaborator)
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

    # ==================== Notifications ====================

    async def create_notification(
        self,
        document_id: str,
        developer_id: str,
        notification_type: str,
        message: str,
        created_by_id: str | None = None,
    ) -> DocumentNotification:
        """Create a document notification."""
        notification = DocumentNotification(
            id=str(uuid4()),
            document_id=document_id,
            developer_id=developer_id,
            type=notification_type,
            message=message,
            created_by_id=created_by_id,
        )

        self.db.add(notification)
        await self.db.commit()
        await self.db.refresh(notification)
        return notification

    async def get_notifications(
        self,
        developer_id: str,
        workspace_id: str | None = None,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[DocumentNotification], int, int]:
        """Get notifications for a developer. Returns (notifications, total, unread_count)."""
        conditions = [DocumentNotification.developer_id == developer_id]

        if workspace_id:
            conditions.append(
                DocumentNotification.document_id.in_(
                    select(Document.id).where(Document.workspace_id == workspace_id)
                )
            )

        if unread_only:
            conditions.append(DocumentNotification.is_read == False)  # noqa: E712

        stmt = (
            select(DocumentNotification)
            .where(and_(*conditions))
            .options(
                selectinload(DocumentNotification.document),
                selectinload(DocumentNotification.created_by),
            )
            .order_by(DocumentNotification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.db.execute(stmt)
        notifications = list(result.scalars().all())

        # Get total count
        count_stmt = select(func.count()).where(and_(*conditions))
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get unread count
        unread_conditions = [
            DocumentNotification.developer_id == developer_id,
            DocumentNotification.is_read == False,  # noqa: E712
        ]
        if workspace_id:
            unread_conditions.append(
                DocumentNotification.document_id.in_(
                    select(Document.id).where(Document.workspace_id == workspace_id)
                )
            )
        unread_stmt = select(func.count()).where(and_(*unread_conditions))
        unread_result = await self.db.execute(unread_stmt)
        unread_count = unread_result.scalar() or 0

        return notifications, total, unread_count

    async def mark_notification_read(
        self,
        notification_id: str,
        developer_id: str,
    ) -> bool:
        """Mark a notification as read."""
        stmt = (
            update(DocumentNotification)
            .where(
                and_(
                    DocumentNotification.id == notification_id,
                    DocumentNotification.developer_id == developer_id,
                )
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )

        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount > 0

    async def mark_all_notifications_read(
        self,
        developer_id: str,
        workspace_id: str | None = None,
    ) -> int:
        """Mark all notifications as read. Returns count of updated notifications."""
        conditions = [
            DocumentNotification.developer_id == developer_id,
            DocumentNotification.is_read == False,  # noqa: E712
        ]

        if workspace_id:
            conditions.append(
                DocumentNotification.document_id.in_(
                    select(Document.id).where(Document.workspace_id == workspace_id)
                )
            )

        stmt = (
            update(DocumentNotification)
            .where(and_(*conditions))
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )

        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount

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
