"""Service bridging API -> Temporal orchestration workflow."""

import logging
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.services.agent_workspace_service import AgentWorkspaceService
from aexy.schemas.agent_workspace import WorkspaceUpdate

logger = logging.getLogger(__name__)


class OrchestrationService:
    """Bridges API calls to Temporal agent orchestration workflows."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_orchestration(
        self,
        workspace_id: str,
        agent_workspace_id: str,
        task: str,
        model: str | None = None,
        config: dict | None = None,
        user_id: str | None = None,
    ) -> str:
        """Start an agent orchestration workflow via Temporal.

        Returns:
            Temporal workflow ID.
        """
        from aexy.temporal.client import get_temporal_client
        from aexy.temporal.workflows.agent_orchestration import (
            AgentOrchestrationInput,
            AgentOrchestrationWorkflow,
        )

        workflow_id = f"agent-orch-{agent_workspace_id}-{uuid4().hex[:8]}"

        client = await get_temporal_client()
        await client.start_workflow(
            AgentOrchestrationWorkflow.run,
            AgentOrchestrationInput(
                workspace_id=workspace_id,
                agent_workspace_id=agent_workspace_id,
                task=task,
                user_id=user_id,
                model=model,
                config=config or {},
            ),
            id=workflow_id,
            task_queue="agents",
        )

        # Store workflow ID on workspace
        ws_service = AgentWorkspaceService(self.db)
        await ws_service.update_workspace(
            workspace_id,
            agent_workspace_id,
            WorkspaceUpdate(temporal_workflow_id=workflow_id),
        )

        logger.info(f"Started orchestration workflow {workflow_id}")
        return workflow_id
