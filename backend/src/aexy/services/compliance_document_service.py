"""Compliance document service for the Document Center."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import settings
from aexy.models.compliance_document import (
    ComplianceDocument,
    ComplianceDocumentLink,
    ComplianceDocumentStatus,
    ComplianceDocumentTag,
    ComplianceFolder,
)
from aexy.schemas.compliance_document import (
    DocumentCreate,
    DocumentFilters,
    DocumentUpdate,
    FolderCreate,
    FolderUpdate,
    LinkCreateRequest,
)
from aexy.services.storage_service import get_storage_service

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
}

MAX_FOLDER_DEPTH = 4


class ComplianceDocumentService:
    """Service for managing compliance documents and folders."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ==================== Folders ====================

    async def create_folder(
        self, workspace_id: str, data: FolderCreate, created_by: str
    ) -> ComplianceFolder:
        parent_path = "/"
        parent_depth = 0

        if data.parent_id:
            parent = await self.get_folder(workspace_id, data.parent_id)
            if not parent:
                raise ValueError("Parent folder not found")
            parent_path = parent.path
            parent_depth = parent.depth
            if parent_depth >= MAX_FOLDER_DEPTH:
                raise ValueError(f"Maximum folder depth of {MAX_FOLDER_DEPTH} exceeded")

        folder = ComplianceFolder(
            workspace_id=workspace_id,
            parent_id=data.parent_id,
            name=data.name,
            description=data.description,
            depth=parent_depth + 1 if data.parent_id else 0,
            created_by=created_by,
        )
        self.db.add(folder)
        await self.db.flush()

        # Set materialized path
        if data.parent_id:
            folder.path = f"{parent_path}{folder.id}/"
        else:
            folder.path = f"/{folder.id}/"

        await self.db.commit()
        await self.db.refresh(folder)
        return folder

    async def list_folders(self, workspace_id: str) -> list[ComplianceFolder]:
        result = await self.db.execute(
            select(ComplianceFolder)
            .where(ComplianceFolder.workspace_id == workspace_id)
            .order_by(ComplianceFolder.path, ComplianceFolder.sort_order)
        )
        return list(result.scalars().all())

    async def get_folder(self, workspace_id: str, folder_id: str) -> ComplianceFolder | None:
        result = await self.db.execute(
            select(ComplianceFolder).where(
                and_(
                    ComplianceFolder.id == folder_id,
                    ComplianceFolder.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def update_folder(
        self, workspace_id: str, folder_id: str, data: FolderUpdate
    ) -> ComplianceFolder | None:
        folder = await self.get_folder(workspace_id, folder_id)
        if not folder:
            return None

        if data.name is not None:
            folder.name = data.name
        if data.description is not None:
            folder.description = data.description
        if data.sort_order is not None:
            folder.sort_order = data.sort_order

        await self.db.commit()
        await self.db.refresh(folder)
        return folder

    async def delete_folder(self, workspace_id: str, folder_id: str) -> bool:
        folder = await self.get_folder(workspace_id, folder_id)
        if not folder:
            return False

        # Check if folder has documents
        doc_count = await self.db.execute(
            select(func.count()).where(
                and_(
                    ComplianceDocument.folder_id == folder_id,
                    ComplianceDocument.status != ComplianceDocumentStatus.DELETED.value,
                )
            )
        )
        if doc_count.scalar() > 0:
            raise ValueError("Cannot delete folder that contains documents")

        # Check for child folders
        child_count = await self.db.execute(
            select(func.count()).where(ComplianceFolder.parent_id == folder_id)
        )
        if child_count.scalar() > 0:
            raise ValueError("Cannot delete folder that contains subfolders")

        await self.db.delete(folder)
        await self.db.commit()
        return True

    async def get_folder_tree(self, workspace_id: str) -> list[dict]:
        """Get the full folder tree with document counts."""
        folders = await self.list_folders(workspace_id)

        # Get document counts per folder
        count_result = await self.db.execute(
            select(
                ComplianceDocument.folder_id,
                func.count().label("count"),
            )
            .where(
                and_(
                    ComplianceDocument.workspace_id == workspace_id,
                    ComplianceDocument.status == ComplianceDocumentStatus.ACTIVE.value,
                )
            )
            .group_by(ComplianceDocument.folder_id)
        )
        doc_counts = {row.folder_id: row.count for row in count_result}

        # Build tree
        folder_map = {}
        roots = []

        for f in folders:
            node = {
                "id": f.id,
                "name": f.name,
                "description": f.description,
                "parent_id": f.parent_id,
                "depth": f.depth,
                "sort_order": f.sort_order,
                "children": [],
                "document_count": doc_counts.get(f.id, 0),
            }
            folder_map[f.id] = node

        for f in folders:
            node = folder_map[f.id]
            if f.parent_id and f.parent_id in folder_map:
                folder_map[f.parent_id]["children"].append(node)
            else:
                roots.append(node)

        return roots

    # ==================== Documents ====================

    async def create_document(
        self, workspace_id: str, data: DocumentCreate, uploaded_by: str
    ) -> ComplianceDocument:
        doc = ComplianceDocument(
            workspace_id=workspace_id,
            folder_id=data.folder_id,
            name=data.name,
            description=data.description,
            file_key=data.file_key,
            file_size=data.file_size,
            mime_type=data.mime_type,
            uploaded_by=uploaded_by,
        )
        self.db.add(doc)
        await self.db.flush()

        # Add tags
        for tag_name in data.tags:
            tag = ComplianceDocumentTag(
                document_id=doc.id,
                workspace_id=workspace_id,
                tag=tag_name.strip().lower(),
            )
            self.db.add(tag)

        await self.db.commit()
        await self.db.refresh(doc, ["tags"])
        return doc

    async def list_documents(
        self, workspace_id: str, filters: DocumentFilters
    ) -> tuple[list[ComplianceDocument], int]:
        query = (
            select(ComplianceDocument)
            .options(selectinload(ComplianceDocument.tags))
            .where(ComplianceDocument.workspace_id == workspace_id)
        )
        count_query = select(func.count()).where(
            ComplianceDocument.workspace_id == workspace_id
        ).select_from(ComplianceDocument)

        # Apply filters
        if filters.status:
            query = query.where(ComplianceDocument.status == filters.status.value)
            count_query = count_query.where(ComplianceDocument.status == filters.status.value)
        else:
            # Default: exclude deleted
            query = query.where(ComplianceDocument.status != ComplianceDocumentStatus.DELETED.value)
            count_query = count_query.where(ComplianceDocument.status != ComplianceDocumentStatus.DELETED.value)

        if filters.folder_id:
            query = query.where(ComplianceDocument.folder_id == filters.folder_id)
            count_query = count_query.where(ComplianceDocument.folder_id == filters.folder_id)

        if filters.mime_type:
            query = query.where(ComplianceDocument.mime_type == filters.mime_type)
            count_query = count_query.where(ComplianceDocument.mime_type == filters.mime_type)

        if filters.uploaded_by:
            query = query.where(ComplianceDocument.uploaded_by == filters.uploaded_by)
            count_query = count_query.where(ComplianceDocument.uploaded_by == filters.uploaded_by)

        if filters.search:
            escaped = filters.search.replace("%", r"\%").replace("_", r"\_")
            search_term = f"%{escaped}%"
            search_filter = or_(
                ComplianceDocument.name.ilike(search_term),
                ComplianceDocument.description.ilike(search_term),
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        if filters.tags:
            # Documents that have ANY of the specified tags
            query = query.where(
                ComplianceDocument.id.in_(
                    select(ComplianceDocumentTag.document_id).where(
                        ComplianceDocumentTag.tag.in_(filters.tags)
                    )
                )
            )
            count_query = count_query.where(
                ComplianceDocument.id.in_(
                    select(ComplianceDocumentTag.document_id).where(
                        ComplianceDocumentTag.tag.in_(filters.tags)
                    )
                )
            )

        # Get total count
        total_result = await self.db.execute(count_query)
        total = total_result.scalar()

        # Sorting
        allowed_sort_fields = {"created_at", "updated_at", "name", "file_size", "mime_type"}
        sort_field = filters.sort_by if filters.sort_by in allowed_sort_fields else "created_at"
        sort_col = getattr(ComplianceDocument, sort_field)
        if filters.sort_order == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())

        # Pagination
        offset = (filters.page - 1) * filters.page_size
        query = query.offset(offset).limit(filters.page_size)

        result = await self.db.execute(query)
        documents = list(result.scalars().all())
        return documents, total

    async def get_document(
        self, workspace_id: str, document_id: str
    ) -> ComplianceDocument | None:
        result = await self.db.execute(
            select(ComplianceDocument)
            .options(
                selectinload(ComplianceDocument.tags),
                selectinload(ComplianceDocument.links),
            )
            .where(
                and_(
                    ComplianceDocument.id == document_id,
                    ComplianceDocument.workspace_id == workspace_id,
                    ComplianceDocument.status != ComplianceDocumentStatus.DELETED.value,
                )
            )
        )
        return result.scalar_one_or_none()

    async def update_document(
        self, workspace_id: str, document_id: str, data: DocumentUpdate
    ) -> ComplianceDocument | None:
        doc = await self.get_document(workspace_id, document_id)
        if not doc:
            return None

        if data.name is not None:
            doc.name = data.name
        if data.description is not None:
            doc.description = data.description
        if data.folder_id is not None:
            doc.folder_id = data.folder_id

        await self.db.commit()
        await self.db.refresh(doc, ["tags"])
        return doc

    async def archive_document(
        self, workspace_id: str, document_id: str
    ) -> ComplianceDocument | None:
        doc = await self.get_document(workspace_id, document_id)
        if not doc:
            return None

        doc.status = ComplianceDocumentStatus.ARCHIVED.value
        doc.archived_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(doc)
        return doc

    async def delete_document(
        self, workspace_id: str, document_id: str
    ) -> bool:
        doc = await self.get_document(workspace_id, document_id)
        if not doc:
            return False

        doc.status = ComplianceDocumentStatus.DELETED.value
        doc.deleted_at = datetime.now(timezone.utc)
        await self.db.commit()
        return True

    async def move_document(
        self, workspace_id: str, document_id: str, folder_id: str | None
    ) -> ComplianceDocument | None:
        doc = await self.get_document(workspace_id, document_id)
        if not doc:
            return None

        if folder_id:
            folder = await self.get_folder(workspace_id, folder_id)
            if not folder:
                raise ValueError("Target folder not found")

        doc.folder_id = folder_id
        await self.db.commit()
        await self.db.refresh(doc)
        return doc

    # ==================== Tags ====================

    async def add_tags(
        self, workspace_id: str, document_id: str, tags: list[str]
    ) -> list[str]:
        doc = await self.get_document(workspace_id, document_id)
        if not doc:
            raise ValueError("Document not found")

        existing_tags = {t.tag for t in doc.tags}

        for tag_name in tags:
            normalized = tag_name.strip().lower()
            if normalized and normalized not in existing_tags:
                tag = ComplianceDocumentTag(
                    document_id=document_id,
                    workspace_id=workspace_id,
                    tag=normalized,
                )
                self.db.add(tag)
                existing_tags.add(normalized)

        await self.db.commit()
        return sorted(existing_tags)

    async def remove_tag(
        self, workspace_id: str, document_id: str, tag_name: str
    ) -> bool:
        result = await self.db.execute(
            select(ComplianceDocumentTag).where(
                and_(
                    ComplianceDocumentTag.document_id == document_id,
                    ComplianceDocumentTag.tag == tag_name.strip().lower(),
                )
            )
        )
        tag = result.scalar_one_or_none()
        if not tag:
            return False

        await self.db.delete(tag)
        await self.db.commit()
        return True

    async def list_workspace_tags(self, workspace_id: str) -> list[str]:
        """List all unique tags used in a workspace."""
        result = await self.db.execute(
            select(ComplianceDocumentTag.tag)
            .where(ComplianceDocumentTag.workspace_id == workspace_id)
            .distinct()
            .order_by(ComplianceDocumentTag.tag)
        )
        return [row[0] for row in result]

    # ==================== Links ====================

    async def link_document(
        self,
        workspace_id: str,
        document_id: str,
        data: LinkCreateRequest,
        linked_by: str,
    ) -> ComplianceDocumentLink:
        doc = await self.get_document(workspace_id, document_id)
        if not doc:
            raise ValueError("Document not found")

        link = ComplianceDocumentLink(
            document_id=document_id,
            workspace_id=workspace_id,
            entity_type=data.entity_type.value,
            entity_id=data.entity_id,
            link_type=data.link_type.value,
            notes=data.notes,
            linked_by=linked_by,
        )
        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)
        return link

    async def unlink_document(
        self, workspace_id: str, document_id: str, link_id: str
    ) -> bool:
        result = await self.db.execute(
            select(ComplianceDocumentLink).where(
                and_(
                    ComplianceDocumentLink.id == link_id,
                    ComplianceDocumentLink.document_id == document_id,
                    ComplianceDocumentLink.workspace_id == workspace_id,
                )
            )
        )
        link = result.scalar_one_or_none()
        if not link:
            return False

        await self.db.delete(link)
        await self.db.commit()
        return True

    async def get_document_links(
        self, workspace_id: str, document_id: str
    ) -> list[ComplianceDocumentLink]:
        result = await self.db.execute(
            select(ComplianceDocumentLink).where(
                and_(
                    ComplianceDocumentLink.document_id == document_id,
                    ComplianceDocumentLink.workspace_id == workspace_id,
                )
            )
        )
        return list(result.scalars().all())

    async def get_entity_documents(
        self, workspace_id: str, entity_type: str, entity_id: str
    ) -> list[tuple[ComplianceDocument, ComplianceDocumentLink]]:
        """Get all documents linked to a specific entity."""
        result = await self.db.execute(
            select(ComplianceDocument, ComplianceDocumentLink)
            .join(
                ComplianceDocumentLink,
                ComplianceDocumentLink.document_id == ComplianceDocument.id,
            )
            .options(selectinload(ComplianceDocument.tags))
            .where(
                and_(
                    ComplianceDocumentLink.workspace_id == workspace_id,
                    ComplianceDocumentLink.entity_type == entity_type,
                    ComplianceDocumentLink.entity_id == entity_id,
                    ComplianceDocument.status != ComplianceDocumentStatus.DELETED.value,
                )
            )
        )
        return list(result.all())

    # ==================== Upload ====================

    def generate_upload_url(
        self, workspace_id: str, filename: str, content_type: str, file_size: int
    ) -> dict:
        """Generate a presigned upload URL for direct browser upload."""
        if content_type not in ALLOWED_MIME_TYPES:
            raise ValueError(f"File type '{content_type}' is not allowed")

        max_size = settings.compliance_max_file_size_mb * 1024 * 1024
        if file_size > max_size:
            raise ValueError(
                f"File size exceeds maximum of {settings.compliance_max_file_size_mb}MB"
            )

        storage = get_storage_service()
        if not storage.is_configured():
            raise ValueError("Storage is not configured")

        date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        unique_id = str(uuid4())
        safe_filename = filename.replace("/", "_").replace("\\", "_")
        file_key = f"{storage.compliance_prefix}/{workspace_id}/{date_prefix}/{unique_id}_{safe_filename}"

        presigned_url = storage.generate_presigned_put_url(
            key=file_key,
            content_type=content_type,
            expires_in=3600,
        )
        if not presigned_url:
            raise ValueError("Failed to generate upload URL")

        return {
            "presigned_url": presigned_url,
            "file_key": file_key,
            "expires_in": 3600,
        }

    def upload_file_directly(
        self, workspace_id: str, filename: str, content_type: str, file_data: bytes
    ) -> dict:
        """Upload a file directly through the backend (no presigned URL needed)."""
        if content_type not in ALLOWED_MIME_TYPES:
            raise ValueError(f"File type '{content_type}' is not allowed")

        max_size = settings.compliance_max_file_size_mb * 1024 * 1024
        if len(file_data) > max_size:
            raise ValueError(
                f"File size exceeds maximum of {settings.compliance_max_file_size_mb}MB"
            )

        storage = get_storage_service()
        if not storage.is_configured():
            raise ValueError("Storage is not configured")

        date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        unique_id = str(uuid4())
        safe_filename = filename.replace("/", "_").replace("\\", "_")
        file_key = f"{storage.compliance_prefix}/{workspace_id}/{date_prefix}/{unique_id}_{safe_filename}"

        if not storage.put_object(file_key, file_data, content_type):
            raise ValueError("Failed to upload file to storage")

        return {
            "file_key": file_key,
            "file_size": len(file_data),
        }

    def generate_download_url(self, file_key: str) -> str | None:
        """Generate a presigned download URL."""
        storage = get_storage_service()
        return storage.generate_presigned_get_url(file_key, expires_in=3600)
