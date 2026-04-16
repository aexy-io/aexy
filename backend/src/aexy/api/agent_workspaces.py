"""API endpoints for Agent Workspaces and Blocks."""

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.agent_workspace import (
    BlockCreate,
    BlockResponse,
    BlockTreeResponse,
    BlockUpdate,
    HumanResponseRequest,
    RunTaskRequest,
    RunTaskResponse,
    WorkspaceCreate,
    WorkspaceListResponse,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from aexy.services.agent_workspace_service import AgentWorkspaceService
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/agent-workspaces",
    tags=["agent-workspaces"],
)


async def _verify_workspace_access(
    workspace_id: str,
    developer: Developer,
    db: AsyncSession,
) -> None:
    """Verify the developer is a member of the workspace."""
    member = await WorkspaceService(db).get_member(workspace_id, developer.id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )


async def _signal_workflow(workflow_id: str, signal: str, *args) -> None:
    """Signal a Temporal workflow; log (but don't raise) on failure."""
    try:
        from aexy.temporal.client import get_temporal_client

        client = await get_temporal_client()
        handle = client.get_workflow_handle(workflow_id)
        await handle.signal(signal, args=list(args) if args else None)
    except Exception:
        logger.exception("Failed to signal Temporal workflow %s (%s)", workflow_id, signal)


# ── Workspace endpoints ───────────────────────────────────────────


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_workspace(
    workspace_id: str,
    data: WorkspaceCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new agent workspace."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.create_workspace(workspace_id, data, created_by_id=current_user.id)
    return WorkspaceResponse.model_validate(ws)


@router.get("", response_model=list[WorkspaceListResponse])
async def list_agent_workspaces(
    workspace_id: str,
    status_filter: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List agent workspaces."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    workspaces = await service.list_workspaces(workspace_id, status=status_filter)
    results = []
    for ws in workspaces:
        stats = await service.get_workspace_stats(ws.id)
        results.append(
            WorkspaceListResponse(
                id=ws.id,
                workspace_id=ws.workspace_id,
                title=ws.title,
                description=ws.description,
                status=ws.status,
                source_module=ws.source_module,
                created_by_id=ws.created_by_id,
                temporal_workflow_id=ws.temporal_workflow_id,
                created_at=ws.created_at,
                updated_at=ws.updated_at,
                block_count=stats["total"],
                completed_blocks=stats["completed"],
            )
        )
    return results


@router.get("/{agent_workspace_id}", response_model=WorkspaceResponse)
async def get_agent_workspace(
    workspace_id: str,
    agent_workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get agent workspace with blocks."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    return WorkspaceResponse.model_validate(ws)


@router.patch("/{agent_workspace_id}", response_model=WorkspaceResponse)
async def update_agent_workspace(
    workspace_id: str,
    agent_workspace_id: str,
    data: WorkspaceUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update agent workspace."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.update_workspace(workspace_id, agent_workspace_id, data)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    return WorkspaceResponse.model_validate(ws)


@router.delete("/{agent_workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_workspace(
    workspace_id: str,
    agent_workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete agent workspace."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    deleted = await service.delete_workspace(workspace_id, agent_workspace_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent workspace not found")


# ── Block endpoints ───────────────────────────────────────────────


@router.post(
    "/{agent_workspace_id}/blocks",
    response_model=BlockResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_block(
    workspace_id: str,
    agent_workspace_id: str,
    data: BlockCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a block in the workspace."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    try:
        block = await service.create_block(agent_workspace_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return BlockResponse.model_validate(block)


@router.get(
    "/{agent_workspace_id}/blocks",
    response_model=list[BlockResponse],
)
async def list_blocks(
    workspace_id: str,
    agent_workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List blocks (flat)."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    blocks = await service.list_blocks(agent_workspace_id)
    return [BlockResponse.model_validate(b) for b in blocks]


@router.get(
    "/{agent_workspace_id}/blocks/tree",
    response_model=list[BlockTreeResponse],
)
async def get_block_tree(
    workspace_id: str,
    agent_workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get blocks as a nested tree."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    tree = await service.get_block_tree(agent_workspace_id)
    return tree


@router.get(
    "/{agent_workspace_id}/blocks/{block_id}",
    response_model=BlockResponse,
)
async def get_block(
    workspace_id: str,
    agent_workspace_id: str,
    block_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a single block."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    block = await service.get_block(agent_workspace_id, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return BlockResponse.model_validate(block)


@router.patch(
    "/{agent_workspace_id}/blocks/{block_id}",
    response_model=BlockResponse,
)
async def update_block(
    workspace_id: str,
    agent_workspace_id: str,
    block_id: str,
    data: BlockUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a block."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    block = await service.update_block(agent_workspace_id, block_id, data)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return BlockResponse.model_validate(block)


@router.delete(
    "/{agent_workspace_id}/blocks/{block_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_block(
    workspace_id: str,
    agent_workspace_id: str,
    block_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a block."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    deleted = await service.delete_block(agent_workspace_id, block_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Block not found")


@router.post(
    "/{agent_workspace_id}/blocks/{block_id}/upload",
    response_model=BlockResponse,
)
async def upload_file_to_block(
    workspace_id: str,
    agent_workspace_id: str,
    block_id: str,
    file: UploadFile,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file to a block (image, pdf, etc.)."""
    from aexy.services.storage_service import StorageService

    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")
    block = await service.get_block(agent_workspace_id, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    # Upload to S3
    storage = StorageService()
    file_key = f"agent-workspaces/{agent_workspace_id}/{block_id}/{file.filename}"
    file_content = await file.read()
    file_url = await storage.upload(file_key, file_content, content_type=file.content_type)

    # Update block
    block = await service.update_block(
        agent_workspace_id,
        block_id,
        BlockUpdate(
            file_key=file_key,
            file_url=file_url,
            file_mime_type=file.content_type,
        ),
    )
    return BlockResponse.model_validate(block)


# ── Orchestration endpoints ───────────────────────────────────────


@router.post(
    "/{agent_workspace_id}/run",
    response_model=RunTaskResponse,
)
async def run_orchestration(
    workspace_id: str,
    agent_workspace_id: str,
    data: RunTaskRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Start orchestration workflow on a workspace."""
    from aexy.services.orchestration_service import OrchestrationService

    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")

    orch_service = OrchestrationService(db)
    workflow_id = await orch_service.start_orchestration(
        workspace_id=workspace_id,
        agent_workspace_id=agent_workspace_id,
        task=data.task,
        model=data.model,
        config=data.config,
        user_id=current_user.id,
    )

    return RunTaskResponse(temporal_workflow_id=workflow_id)


# ── HITL + Action endpoints ───────────────────────────────────────


@router.post(
    "/{agent_workspace_id}/blocks/{block_id}/respond",
    response_model=BlockResponse,
)
async def respond_to_block(
    workspace_id: str,
    agent_workspace_id: str,
    block_id: str,
    data: HumanResponseRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Submit human response to a waiting_human block."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")

    block = await service.respond_to_block(agent_workspace_id, block_id, data.response)
    if not block:
        raise HTTPException(
            status_code=400,
            detail="Block not found or not in waiting_human status",
        )

    if ws.temporal_workflow_id:
        await _signal_workflow(
            ws.temporal_workflow_id, "on_human_response", block_id, data.response
        )

    return BlockResponse.model_validate(block)


@router.post("/{agent_workspace_id}/pause", response_model=WorkspaceResponse)
async def pause_workspace(
    workspace_id: str,
    agent_workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pause workspace orchestration."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.pause_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=400, detail="Cannot pause workspace")

    if ws.temporal_workflow_id:
        await _signal_workflow(ws.temporal_workflow_id, "pause")

    return WorkspaceResponse.model_validate(ws)


@router.post("/{agent_workspace_id}/resume", response_model=WorkspaceResponse)
async def resume_workspace(
    workspace_id: str,
    agent_workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resume paused workspace orchestration."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.resume_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=400, detail="Cannot resume workspace")

    if ws.temporal_workflow_id:
        await _signal_workflow(ws.temporal_workflow_id, "resume")

    return WorkspaceResponse.model_validate(ws)


@router.post(
    "/{agent_workspace_id}/blocks/{block_id}/retry",
    response_model=BlockResponse,
)
async def retry_block(
    workspace_id: str,
    agent_workspace_id: str,
    block_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Retry a failed block."""
    await _verify_workspace_access(workspace_id, current_user, db)
    service = AgentWorkspaceService(db)
    ws = await service.get_workspace(workspace_id, agent_workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Agent workspace not found")

    block = await service.get_block(agent_workspace_id, block_id)
    if not block or block.status != "failed":
        raise HTTPException(status_code=400, detail="Block not found or not failed")

    block = await service.update_block(
        agent_workspace_id,
        block_id,
        BlockUpdate(status="pending", error_message=None),
    )

    if ws.temporal_workflow_id:
        await _signal_workflow(ws.temporal_workflow_id, "retry_block", block_id)

    return BlockResponse.model_validate(block)
