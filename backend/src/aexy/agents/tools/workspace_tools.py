"""Tools for agents to create/update/read blocks in agent workspaces."""

from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class CreateBlockInput(BaseModel):
    title: str = Field(description="Block title")
    block_type: str = Field(
        default="markdown",
        description="Block type: markdown, json, table, code, text",
    )
    content: str = Field(description="Block content (markdown text, JSON string, etc.)")
    parent_id: str | None = Field(default=None, description="Parent block ID")


class CreateBlockTool(BaseTool):
    """Create a new block in the current agent workspace."""

    name: str = "create_block"
    description: str = "Create a new block in the workspace with content"
    args_schema: type[BaseModel] = CreateBlockInput

    agent_workspace_id: str = ""
    db: Any = None

    def _run(self, **kwargs) -> str:
        raise NotImplementedError("Use async")

    async def _arun(
        self,
        title: str,
        block_type: str = "markdown",
        content: str = "",
        parent_id: str | None = None,
    ) -> str:
        from aexy.schemas.agent_workspace import BlockCreate
        from aexy.services.agent_workspace_service import AgentWorkspaceService

        service = AgentWorkspaceService(self.db)
        content_dict = {"text": content} if block_type == "markdown" else {"data": content}

        block = await service.create_block(
            self.agent_workspace_id,
            BlockCreate(
                parent_id=parent_id,
                block_type=block_type,
                title=title,
                content=content_dict,
                status="completed",
            ),
        )
        return f"Created block '{title}' (id={block.id})"


class UpdateBlockInput(BaseModel):
    block_id: str = Field(description="ID of the block to update")
    content: str = Field(description="New content for the block")
    status: str | None = Field(default=None, description="New status")


class UpdateBlockTool(BaseTool):
    """Update an existing block's content or status."""

    name: str = "update_block"
    description: str = "Update a block's content or status in the workspace"
    args_schema: type[BaseModel] = UpdateBlockInput

    agent_workspace_id: str = ""
    db: Any = None

    def _run(self, **kwargs) -> str:
        raise NotImplementedError("Use async")

    async def _arun(
        self,
        block_id: str,
        content: str = "",
        status: str | None = None,
    ) -> str:
        from aexy.schemas.agent_workspace import BlockUpdate
        from aexy.services.agent_workspace_service import AgentWorkspaceService

        service = AgentWorkspaceService(self.db)
        update = BlockUpdate(content={"text": content})
        if status:
            update.status = status
        block = await service.update_block(self.agent_workspace_id, block_id, update)
        if not block:
            return f"Block {block_id} not found"
        return f"Updated block {block_id}"


class ReadBlockInput(BaseModel):
    block_id: str = Field(description="ID of the block to read")


class ReadBlockTool(BaseTool):
    """Read another block's content from the workspace."""

    name: str = "read_block"
    description: str = "Read a block's content from the workspace"
    args_schema: type[BaseModel] = ReadBlockInput

    agent_workspace_id: str = ""
    db: Any = None

    def _run(self, **kwargs) -> str:
        raise NotImplementedError("Use async")

    async def _arun(self, block_id: str) -> str:
        import json

        from aexy.services.agent_workspace_service import AgentWorkspaceService

        service = AgentWorkspaceService(self.db)
        block = await service.get_block(self.agent_workspace_id, block_id)
        if not block:
            return f"Block {block_id} not found"
        return json.dumps(
            {
                "id": block.id,
                "title": block.title,
                "type": block.block_type,
                "status": block.status,
                "content": block.content,
            },
            default=str,
        )


def get_workspace_tools(
    agent_workspace_id: str, db: Any
) -> list[BaseTool]:
    """Create workspace tool instances for an agent."""
    return [
        CreateBlockTool(agent_workspace_id=agent_workspace_id, db=db),
        UpdateBlockTool(agent_workspace_id=agent_workspace_id, db=db),
        ReadBlockTool(agent_workspace_id=agent_workspace_id, db=db),
    ]
