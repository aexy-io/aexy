"""External Task Sync Service for bidirectional sync with Jira/Linear.

This service handles outbound sync from Gitraki to external task trackers.
When a SprintTask is updated in Gitraki, this service pushes the changes
back to the original source (Jira or Linear).
"""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.sprint import SprintTask, Sprint
from devograph.models.integrations import JiraIntegration, LinearIntegration

logger = logging.getLogger(__name__)


class ExternalTaskSyncService:
    """Service for syncing SprintTask changes to external task trackers."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def on_task_updated(
        self,
        task: SprintTask,
        changed_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        """Handle SprintTask update and sync to external source.

        Args:
            task: The updated SprintTask
            changed_fields: Optional list of fields that changed

        Returns:
            Dict with sync result information
        """
        # Only sync tasks from external sources
        if not task.source_type or task.source_type in ("manual", "github_issue"):
            return {"synced": False, "reason": "Not an external source task"}

        # Get sprint to find workspace
        stmt = (
            select(Sprint)
            .where(Sprint.id == task.sprint_id)
            .options(selectinload(Sprint.team))
        )
        result = await self.db.execute(stmt)
        sprint = result.scalar_one_or_none()

        if not sprint or not sprint.team:
            return {"synced": False, "reason": "Sprint or team not found"}

        workspace_id = str(sprint.team.workspace_id)

        # Check integration sync settings
        if task.source_type == "jira":
            return await self._sync_to_jira(task, workspace_id, changed_fields)
        elif task.source_type == "linear":
            return await self._sync_to_linear(task, workspace_id, changed_fields)
        else:
            return {"synced": False, "reason": f"Unknown source type: {task.source_type}"}

    async def _sync_to_jira(
        self,
        task: SprintTask,
        workspace_id: str,
        changed_fields: list[str] | None,
    ) -> dict[str, Any]:
        """Sync task changes to Jira."""
        # Get Jira integration
        stmt = select(JiraIntegration).where(
            JiraIntegration.workspace_id == workspace_id,
            JiraIntegration.is_active == True,
        )
        result = await self.db.execute(stmt)
        integration = result.scalar_one_or_none()

        if not integration:
            return {"synced": False, "reason": "Jira integration not found or inactive"}

        # Check sync direction
        if integration.sync_direction == "import":
            return {"synced": False, "reason": "Sync direction is import-only"}

        if not integration.sync_enabled:
            return {"synced": False, "reason": "Sync is disabled"}

        # Import here to avoid circular imports
        from devograph.services.jira_integration_service import JiraIntegrationService

        jira_service = JiraIntegrationService(self.db)
        success = await jira_service.push_task_update(task)

        if success:
            # Update sync status
            task.last_synced_at = datetime.now()
            task.sync_status = "synced"
            await self.db.flush()

            logger.info(f"Synced task '{task.title[:30]}' to Jira ({task.source_id})")
            return {"synced": True, "source": "jira", "source_id": task.source_id}
        else:
            task.sync_status = "pending"
            await self.db.flush()

            return {"synced": False, "reason": "Failed to push to Jira"}

    async def _sync_to_linear(
        self,
        task: SprintTask,
        workspace_id: str,
        changed_fields: list[str] | None,
    ) -> dict[str, Any]:
        """Sync task changes to Linear."""
        # Get Linear integration
        stmt = select(LinearIntegration).where(
            LinearIntegration.workspace_id == workspace_id,
            LinearIntegration.is_active == True,
        )
        result = await self.db.execute(stmt)
        integration = result.scalar_one_or_none()

        if not integration:
            return {"synced": False, "reason": "Linear integration not found or inactive"}

        if not integration.sync_enabled:
            return {"synced": False, "reason": "Sync is disabled"}

        # Import here to avoid circular imports
        from devograph.services.linear_integration_service import LinearIntegrationService

        linear_service = LinearIntegrationService(self.db)
        success = await linear_service.push_task_update(task)

        if success:
            # Update sync status
            task.last_synced_at = datetime.now()
            task.sync_status = "synced"
            await self.db.flush()

            logger.info(f"Synced task '{task.title[:30]}' to Linear ({task.source_id})")
            return {"synced": True, "source": "linear", "source_id": task.source_id}
        else:
            task.sync_status = "pending"
            await self.db.flush()

            return {"synced": False, "reason": "Failed to push to Linear"}

    async def sync_pending_tasks(
        self,
        workspace_id: str,
    ) -> dict[str, Any]:
        """Sync all pending tasks for a workspace.

        Useful for retrying failed syncs or batch syncing after reconnection.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dict with counts of synced and failed tasks
        """
        # Find all pending tasks from external sources
        stmt = (
            select(SprintTask)
            .join(Sprint)
            .where(
                Sprint.team.has(workspace_id=workspace_id),
                SprintTask.source_type.in_(["jira", "linear"]),
                SprintTask.sync_status == "pending",
            )
        )
        result = await self.db.execute(stmt)
        pending_tasks = result.scalars().all()

        synced_count = 0
        failed_count = 0

        for task in pending_tasks:
            try:
                result = await self.on_task_updated(task)
                if result.get("synced"):
                    synced_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                logger.error(f"Error syncing task {task.id}: {e}")
                failed_count += 1

        return {
            "synced": synced_count,
            "failed": failed_count,
            "total": len(pending_tasks),
        }

    async def check_sync_conflicts(
        self,
        task: SprintTask,
    ) -> bool:
        """Check if there's a sync conflict for a task.

        A conflict exists when:
        - Task was updated externally after our last sync
        - Task has local changes that haven't been synced

        Args:
            task: The SprintTask to check

        Returns:
            True if conflict exists
        """
        if not task.external_updated_at or not task.last_synced_at:
            return False

        # Conflict if external update is newer than our last sync
        # and we have local changes (sync_status is pending)
        return (
            task.external_updated_at > task.last_synced_at
            and task.sync_status == "pending"
        )

    async def resolve_conflict(
        self,
        task: SprintTask,
        resolution: str,
    ) -> dict[str, Any]:
        """Resolve a sync conflict.

        Args:
            task: The conflicted SprintTask
            resolution: One of "keep_local", "keep_remote", "merge"

        Returns:
            Dict with resolution result
        """
        if resolution == "keep_local":
            # Push local changes to remote
            result = await self.on_task_updated(task)
            return {"resolution": "keep_local", "sync_result": result}

        elif resolution == "keep_remote":
            # Re-import from remote (need to trigger a sync)
            task.sync_status = "synced"
            await self.db.flush()
            return {"resolution": "keep_remote", "action": "manual_sync_required"}

        elif resolution == "merge":
            # For now, merge defaults to keep_local
            # A more sophisticated merge would compare field-by-field
            result = await self.on_task_updated(task)
            return {"resolution": "merge", "sync_result": result}

        else:
            return {"error": f"Unknown resolution: {resolution}"}
