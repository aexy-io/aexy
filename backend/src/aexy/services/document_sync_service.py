"""Service for handling document sync based on plan tier."""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.documentation import (
    Document,
    DocumentCodeLink,
    DocumentSyncQueue,
)
from aexy.models.developer import Developer
from aexy.models.plan import PlanTier
from aexy.services.limits_service import LimitsService

logger = logging.getLogger(__name__)


class SyncTriggerType(str, Enum):
    """Types of sync triggers based on plan tier."""

    REAL_TIME = "real_time"  # Premium: Immediate on code change
    DAILY_BATCH = "daily_batch"  # Pro: Once per day
    MANUAL = "manual"  # Free: User-initiated only


class DocumentSyncService:
    """Service for orchestrating document sync based on plan tier."""

    def __init__(self, db: AsyncSession):
        """Initialize the document sync service.

        Args:
            db: Async database session.
        """
        self.db = db
        self.limits_service = LimitsService(db)

    async def get_sync_type_for_developer(
        self, developer_id: str
    ) -> SyncTriggerType:
        """Get the sync type allowed for a developer based on their plan.

        Args:
            developer_id: Developer ID.

        Returns:
            SyncTriggerType based on plan tier.
        """
        developer = await self.limits_service.get_developer_with_plan(developer_id)

        if not developer or not developer.plan:
            return SyncTriggerType.MANUAL

        plan = developer.plan

        # Check for real-time sync capability (premium plans)
        if plan.enable_real_time_sync:
            return SyncTriggerType.REAL_TIME

        # Check tier for batch sync (pro plans)
        if plan.tier in [PlanTier.PRO.value, PlanTier.TEAM.value]:
            return SyncTriggerType.DAILY_BATCH

        # Default to manual sync (free tier)
        return SyncTriggerType.MANUAL

    async def queue_document_for_sync(
        self,
        document_id: str,
        triggered_by_commit: str | None = None,
    ) -> DocumentSyncQueue | None:
        """Queue a document for batch sync.

        This is used for mid-tier plans with daily batch sync.

        Args:
            document_id: Document to queue.
            triggered_by_commit: Commit SHA that triggered the sync.

        Returns:
            Created queue entry or None if already queued.
        """
        # Check if already in queue with pending status
        stmt = select(DocumentSyncQueue).where(
            and_(
                DocumentSyncQueue.document_id == document_id,
                DocumentSyncQueue.status == "pending",
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Update the trigger commit if newer
            if triggered_by_commit:
                existing.triggered_by_commit = triggered_by_commit
                existing.triggered_at = datetime.now(timezone.utc)
            return existing

        # Create new queue entry
        queue_entry = DocumentSyncQueue(
            id=str(uuid4()),
            document_id=document_id,
            triggered_by_commit=triggered_by_commit,
            status="pending",
        )
        self.db.add(queue_entry)
        await self.db.flush()

        return queue_entry

    async def get_pending_sync_queue(
        self,
        limit: int = 100,
    ) -> list[DocumentSyncQueue]:
        """Get pending documents in the sync queue.

        Args:
            limit: Maximum number of items to return.

        Returns:
            List of pending sync queue entries.
        """
        stmt = (
            select(DocumentSyncQueue)
            .where(DocumentSyncQueue.status == "pending")
            .options(selectinload(DocumentSyncQueue.document))
            .order_by(DocumentSyncQueue.triggered_at)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_sync_processing(
        self, queue_ids: list[str]
    ) -> int:
        """Mark queue entries as processing.

        Args:
            queue_ids: List of queue entry IDs to mark.

        Returns:
            Number of entries updated.
        """
        stmt = (
            update(DocumentSyncQueue)
            .where(DocumentSyncQueue.id.in_(queue_ids))
            .values(status="processing")
        )
        result = await self.db.execute(stmt)
        return result.rowcount

    async def mark_sync_completed(
        self,
        queue_id: str,
        success: bool = True,
        error_message: str | None = None,
    ) -> None:
        """Mark a sync queue entry as completed or failed.

        Args:
            queue_id: Queue entry ID.
            success: Whether sync was successful.
            error_message: Error message if failed.
        """
        stmt = (
            update(DocumentSyncQueue)
            .where(DocumentSyncQueue.id == queue_id)
            .values(
                status="completed" if success else "failed",
                processed_at=datetime.now(timezone.utc),
                error_message=error_message,
            )
        )
        await self.db.execute(stmt)

    async def handle_code_change(
        self,
        repository_id: str,
        commit_sha: str,
        changed_paths: list[str],
    ) -> dict[str, Any]:
        """Handle a code change event (from webhook).

        This checks each linked document and either:
        - Triggers immediate regeneration (premium)
        - Queues for batch sync (pro)
        - Marks as having pending changes (free)

        Args:
            repository_id: Repository where change occurred.
            commit_sha: Commit SHA of the change.
            changed_paths: List of file paths that changed.

        Returns:
            Summary of actions taken.
        """
        results = {
            "real_time_synced": [],
            "queued_for_batch": [],
            "marked_pending": [],
            "no_match": 0,
        }

        # Find all documents linked to files in this repository
        stmt = (
            select(DocumentCodeLink)
            .options(
                selectinload(DocumentCodeLink.document).selectinload(Document.created_by)
            )
            .where(DocumentCodeLink.repository_id == repository_id)
        )
        result = await self.db.execute(stmt)
        code_links = result.scalars().all()

        for link in code_links:
            # Check if any changed path matches this link
            matches = self._path_matches_link(link.path, link.link_type, changed_paths)

            if not matches:
                results["no_match"] += 1
                continue

            # Update link to indicate pending changes
            link.has_pending_changes = True
            link.last_commit_sha = commit_sha

            # Get document owner's sync type
            document = link.document
            if not document or not document.created_by:
                continue

            sync_type = await self.get_sync_type_for_developer(
                str(document.created_by_id)
            )

            if sync_type == SyncTriggerType.REAL_TIME:
                # Trigger immediate regeneration
                await self._trigger_real_time_sync(document, link, commit_sha)
                results["real_time_synced"].append(str(document.id))

            elif sync_type == SyncTriggerType.DAILY_BATCH:
                # Queue for batch processing
                await self.queue_document_for_sync(
                    str(document.id), triggered_by_commit=commit_sha
                )
                results["queued_for_batch"].append(str(document.id))

            else:
                # Just mark as having pending changes (free tier)
                results["marked_pending"].append(str(document.id))

        await self.db.commit()
        return results

    async def _trigger_real_time_sync(
        self,
        document: Document,
        code_link: DocumentCodeLink,
        commit_sha: str,
    ) -> bool:
        """Trigger immediate regeneration for a document.

        Args:
            document: Document to regenerate.
            code_link: Code link that triggered the sync.
            commit_sha: Commit SHA that triggered the sync.

        Returns:
            True if sync was triggered successfully.
        """
        try:
            # Import here to avoid circular imports
            from aexy.services.document_generation_service import (
                DocumentGenerationService,
            )
            from aexy.services.github_app_service import GitHubAppService

            gen_service = DocumentGenerationService(self.db)
            github_service = GitHubAppService(self.db)

            # Get the template category from the document or code link
            from aexy.models.documentation import TemplateCategory

            category = TemplateCategory.FUNCTION_DOCS

            # Get installation token
            token_result = await github_service.get_installation_token_for_developer(
                str(document.created_by_id)
            )

            if not token_result:
                logger.warning(
                    f"No installation token for document {document.id} sync"
                )
                return False

            # Note: Full implementation would fetch code and regenerate
            # For now, mark document as needing regeneration
            document.generation_status = "pending_regeneration"

            # Update the code link
            code_link.last_commit_sha = commit_sha
            code_link.has_pending_changes = False
            code_link.last_synced_at = datetime.now(timezone.utc)

            logger.info(f"Triggered real-time sync for document {document.id}")
            return True

        except Exception as e:
            logger.error(f"Failed to trigger real-time sync: {e}")
            return False

    def _path_matches_link(
        self,
        link_path: str,
        link_type: str,
        changed_paths: list[str],
    ) -> bool:
        """Check if any changed path matches a code link.

        Args:
            link_path: Path in the code link.
            link_type: Type of link (file or directory).
            changed_paths: List of changed file paths.

        Returns:
            True if there's a match.
        """
        for changed_path in changed_paths:
            if link_type == "file":
                # Exact match for file links
                if changed_path == link_path:
                    return True
            else:
                # Directory links match any file under that path
                if changed_path.startswith(link_path + "/") or changed_path == link_path:
                    return True

        return False

    async def get_sync_status(
        self, workspace_id: str
    ) -> dict[str, Any]:
        """Get sync status for all documents in a workspace.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Sync status summary.
        """
        # Count documents by sync status
        stmt = (
            select(
                Document.generation_status,
                func.count(Document.id).label("count"),
            )
            .where(Document.workspace_id == workspace_id)
            .group_by(Document.generation_status)
        )
        result = await self.db.execute(stmt)
        status_counts = {row[0]: row[1] for row in result.all()}

        # Count pending items in sync queue
        stmt = select(func.count(DocumentSyncQueue.id)).where(
            DocumentSyncQueue.status == "pending"
        )
        result = await self.db.execute(stmt)
        pending_in_queue = result.scalar() or 0

        # Count documents with pending changes
        stmt = (
            select(func.count(DocumentCodeLink.id))
            .join(Document)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    DocumentCodeLink.has_pending_changes == True,
                )
            )
        )
        result = await self.db.execute(stmt)
        pending_changes = result.scalar() or 0

        return {
            "status_counts": status_counts,
            "pending_in_queue": pending_in_queue,
            "documents_with_pending_changes": pending_changes,
        }

    async def trigger_manual_sync(
        self,
        document_id: str,
        developer_id: str,
    ) -> bool:
        """Trigger a manual sync for a document.

        This is available for all plan tiers.

        Args:
            document_id: Document to sync.
            developer_id: Developer triggering the sync.

        Returns:
            True if sync was triggered.
        """
        # Get the document with code links
        stmt = (
            select(Document)
            .options(selectinload(Document.code_links))
            .where(Document.id == document_id)
        )
        result = await self.db.execute(stmt)
        document = result.scalar_one_or_none()

        if not document:
            raise ValueError("Document not found")

        if not document.code_links:
            raise ValueError("No code links found for document")

        # Queue for processing (even manual syncs go through the queue)
        await self.queue_document_for_sync(document_id)

        # Update document status
        document.generation_status = "pending_regeneration"
        await self.db.commit()

        return True
