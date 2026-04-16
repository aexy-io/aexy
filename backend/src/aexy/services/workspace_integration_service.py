"""Hooks for other modules to spawn agent workspaces."""

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.schemas.agent_workspace import WorkspaceCreate
from aexy.services.agent_workspace_service import AgentWorkspaceService
from aexy.services.orchestration_service import OrchestrationService

logger = logging.getLogger(__name__)


class WorkspaceIntegrationService:
    """Allows any Aexy module to create and run agent workspaces."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_from_module(
        self,
        workspace_id: str,
        source_module: str,
        task: str,
        created_by_id: str | None = None,
        source_record_id: str | None = None,
        title: str | None = None,
        config: dict | None = None,
        auto_run: bool = False,
    ) -> dict[str, Any]:
        """Create an agent workspace from another module.

        Args:
            workspace_id: Aexy workspace ID.
            source_module: Module name (e.g., 'crm', 'sprints', 'analytics').
            task: Task description for the orchestrator.
            created_by_id: Developer who triggered this.
            source_record_id: Optional reference to the originating record.
            title: Optional workspace title (auto-generated if None).
            config: Optional workspace config overrides.
            auto_run: If True, immediately start orchestration.

        Returns:
            Dict with workspace details and optional workflow_id.
        """
        ws_service = AgentWorkspaceService(self.db)

        workspace = await ws_service.create_workspace(
            workspace_id=workspace_id,
            data=WorkspaceCreate(
                title=title or f"Agent Analysis: {task[:100]}",
                description=task,
                source_module=source_module,
                source_record_id=source_record_id,
                config=config or {},
            ),
            created_by_id=created_by_id,
        )

        result = {
            "agent_workspace_id": workspace.id,
            "workspace_id": workspace_id,
            "title": workspace.title,
            "status": workspace.status,
        }

        if auto_run:
            orch_service = OrchestrationService(self.db)
            workflow_id = await orch_service.start_orchestration(
                workspace_id=workspace_id,
                agent_workspace_id=workspace.id,
                task=task,
                config=config,
                user_id=created_by_id,
            )
            result["temporal_workflow_id"] = workflow_id

        return result
