"""Service layer for Agent Workspaces and Blocks."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent_workspace import (
    AgentWorkspace,
    AgentWorkspaceBlock,
    AgentWorkspaceStatus,
    BlockStatus,
)
from aexy.schemas.agent_workspace import (
    BlockCreate,
    BlockUpdate,
    WorkspaceCreate,
    WorkspaceUpdate,
)

logger = logging.getLogger(__name__)


class AgentWorkspaceService:
    """CRUD and business logic for agent workspaces and blocks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Workspace CRUD ─────────────────────────────────────────────

    async def create_workspace(
        self,
        workspace_id: str,
        data: WorkspaceCreate,
        created_by_id: str | None = None,
    ) -> AgentWorkspace:
        ws = AgentWorkspace(
            id=str(uuid4()),
            workspace_id=workspace_id,
            title=data.title,
            description=data.description,
            source_module=data.source_module,
            source_record_id=data.source_record_id,
            config=data.config,
            created_by_id=created_by_id,
        )
        self.db.add(ws)
        await self.db.flush()
        return ws

    async def list_workspaces(
        self,
        workspace_id: str,
        status: str | None = None,
    ) -> list[AgentWorkspace]:
        stmt = select(AgentWorkspace).where(
            AgentWorkspace.workspace_id == workspace_id,
        )
        if status:
            stmt = stmt.where(AgentWorkspace.status == status)
        stmt = stmt.order_by(AgentWorkspace.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_workspace(
        self, workspace_id: str, agent_workspace_id: str
    ) -> AgentWorkspace | None:
        result = await self.db.execute(
            select(AgentWorkspace).where(
                AgentWorkspace.id == agent_workspace_id,
                AgentWorkspace.workspace_id == workspace_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_workspace(
        self,
        workspace_id: str,
        agent_workspace_id: str,
        data: WorkspaceUpdate,
    ) -> AgentWorkspace | None:
        ws = await self.get_workspace(workspace_id, agent_workspace_id)
        if not ws:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(ws, field, value)
        ws.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return ws

    async def delete_workspace(
        self, workspace_id: str, agent_workspace_id: str
    ) -> bool:
        ws = await self.get_workspace(workspace_id, agent_workspace_id)
        if not ws:
            return False
        await self.db.delete(ws)
        await self.db.flush()
        return True

    # ── Block CRUD ─────────────────────────────────────────────────

    async def create_block(
        self,
        agent_workspace_id: str,
        data: BlockCreate,
    ) -> AgentWorkspaceBlock:
        # Validate parent exists if set
        if data.parent_id:
            parent = await self._get_block(agent_workspace_id, data.parent_id)
            if not parent:
                raise ValueError(f"Parent block {data.parent_id} not found")

        new_block_id = str(uuid4())

        # Validate no cycle in dependencies
        if data.dependencies or data.parent_id:
            await self._validate_no_cycles(
                agent_workspace_id, new_block_id, data.parent_id, data.dependencies
            )

        block = AgentWorkspaceBlock(
            id=new_block_id,
            workspace_id=agent_workspace_id,
            parent_id=data.parent_id,
            block_type=data.block_type,
            title=data.title,
            status=data.status,
            agent_id=data.agent_id,
            content=data.content,
            dependencies=data.dependencies,
            sort_order=data.sort_order,
        )
        self.db.add(block)
        await self.db.flush()
        return block

    async def list_blocks(
        self, agent_workspace_id: str
    ) -> list[AgentWorkspaceBlock]:
        result = await self.db.execute(
            select(AgentWorkspaceBlock)
            .where(AgentWorkspaceBlock.workspace_id == agent_workspace_id)
            .order_by(AgentWorkspaceBlock.sort_order)
        )
        return list(result.scalars().all())

    async def get_block(
        self, agent_workspace_id: str, block_id: str
    ) -> AgentWorkspaceBlock | None:
        return await self._get_block(agent_workspace_id, block_id)

    async def update_block(
        self,
        agent_workspace_id: str,
        block_id: str,
        data: BlockUpdate,
    ) -> AgentWorkspaceBlock | None:
        block = await self._get_block(agent_workspace_id, block_id)
        if not block:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(block, field, value)

        # Auto-set timestamps based on status
        if data.status == BlockStatus.RUNNING.value and not block.started_at:
            block.started_at = datetime.now(timezone.utc)
        elif data.status in (
            BlockStatus.COMPLETED.value,
            BlockStatus.FAILED.value,
        ):
            block.completed_at = datetime.now(timezone.utc)

        block.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return block

    async def delete_block(
        self, agent_workspace_id: str, block_id: str
    ) -> bool:
        block = await self._get_block(agent_workspace_id, block_id)
        if not block:
            return False
        await self.db.delete(block)
        await self.db.flush()
        return True

    # ── Block tree ─────────────────────────────────────────────────

    async def get_block_tree(
        self, agent_workspace_id: str
    ) -> list[dict]:
        """Return blocks as a nested tree structure."""
        blocks = await self.list_blocks(agent_workspace_id)

        # Build tree from flat list
        block_map: dict[str, dict] = {}
        roots: list[dict] = []

        for block in blocks:
            node = {
                "id": block.id,
                "workspace_id": block.workspace_id,
                "parent_id": block.parent_id,
                "block_type": block.block_type,
                "title": block.title,
                "status": block.status,
                "agent_id": block.agent_id,
                "execution_id": block.execution_id,
                "content": block.content,
                "file_key": block.file_key,
                "file_url": block.file_url,
                "file_mime_type": block.file_mime_type,
                "dependencies": block.dependencies,
                "handoff_data": block.handoff_data,
                "sort_order": block.sort_order,
                "token_usage": block.token_usage,
                "error_message": block.error_message,
                "started_at": block.started_at,
                "completed_at": block.completed_at,
                "created_at": block.created_at,
                "updated_at": block.updated_at,
                "children": [],
            }
            block_map[block.id] = node

        for block in blocks:
            node = block_map[block.id]
            if block.parent_id and block.parent_id in block_map:
                block_map[block.parent_id]["children"].append(node)
            else:
                roots.append(node)

        return roots

    # ── Workspace stats ────────────────────────────────────────────

    async def get_workspace_stats(
        self, agent_workspace_id: str
    ) -> dict:
        """Get block count and completion stats."""
        result = await self.db.execute(
            select(
                func.count(AgentWorkspaceBlock.id).label("total"),
                func.count(AgentWorkspaceBlock.id)
                .filter(AgentWorkspaceBlock.status == BlockStatus.COMPLETED.value)
                .label("completed"),
            ).where(AgentWorkspaceBlock.workspace_id == agent_workspace_id)
        )
        row = result.one()
        return {"total": row.total, "completed": row.completed}

    # ── HITL actions ───────────────────────────────────────────────

    async def respond_to_block(
        self,
        agent_workspace_id: str,
        block_id: str,
        response: str,
    ) -> AgentWorkspaceBlock | None:
        """Store human response in a waiting_human block."""
        block = await self._get_block(agent_workspace_id, block_id)
        if not block or block.status != BlockStatus.WAITING_HUMAN.value:
            return None

        block.content = {**block.content, "human_response": response}
        block.status = BlockStatus.COMPLETED.value
        block.completed_at = datetime.now(timezone.utc)
        block.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return block

    async def pause_workspace(
        self, workspace_id: str, agent_workspace_id: str
    ) -> AgentWorkspace | None:
        ws = await self.get_workspace(workspace_id, agent_workspace_id)
        if not ws or ws.status != AgentWorkspaceStatus.ACTIVE.value:
            return None
        ws.status = AgentWorkspaceStatus.PAUSED.value
        ws.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return ws

    async def resume_workspace(
        self, workspace_id: str, agent_workspace_id: str
    ) -> AgentWorkspace | None:
        ws = await self.get_workspace(workspace_id, agent_workspace_id)
        if not ws or ws.status != AgentWorkspaceStatus.PAUSED.value:
            return None
        ws.status = AgentWorkspaceStatus.ACTIVE.value
        ws.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return ws

    # ── DAG validation ─────────────────────────────────────────────

    async def _validate_no_cycles(
        self,
        agent_workspace_id: str,
        block_id: str,
        parent_id: str | None,
        dependencies: list[str],
    ) -> None:
        """Validate that adding this block won't create a cycle in the DAG."""
        blocks = await self.list_blocks(agent_workspace_id)
        adjacency: dict[str, list[str]] = {}
        for b in blocks:
            deps = list(b.dependencies or [])
            if b.parent_id:
                deps.append(b.parent_id)
            adjacency[b.id] = deps

        # Add the new/updated edges
        new_deps = list(dependencies)
        if parent_id:
            new_deps.append(parent_id)
        adjacency[block_id] = new_deps

        # DFS cycle detection
        visited: set[str] = set()
        in_stack: set[str] = set()

        def has_cycle(node: str) -> bool:
            if node in in_stack:
                return True
            if node in visited:
                return False
            visited.add(node)
            in_stack.add(node)
            for dep in adjacency.get(node, []):
                if has_cycle(dep):
                    return True
            in_stack.discard(node)
            return False

        for node_id in adjacency:
            if has_cycle(node_id):
                raise ValueError("Adding this block would create a cycle in the DAG")

    async def _get_block(
        self, agent_workspace_id: str, block_id: str
    ) -> AgentWorkspaceBlock | None:
        result = await self.db.execute(
            select(AgentWorkspaceBlock).where(
                AgentWorkspaceBlock.id == block_id,
                AgentWorkspaceBlock.workspace_id == agent_workspace_id,
            )
        )
        return result.scalar_one_or_none()
