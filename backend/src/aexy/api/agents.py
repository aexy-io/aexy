"""API endpoints for AI Agents."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.workspace_service import WorkspaceService
from aexy.services.agent_service import AgentService
from aexy.services.writing_style_service import WritingStyleService
from aexy.schemas.agent import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentExecuteRequest,
    AgentExecutionResponse,
    AgentToolInfo,
    WritingStyleResponse,
    GenerateEmailRequest,
    GenerateEmailResponse,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/crm/agents")
writing_style_router = APIRouter(prefix="/workspaces/{workspace_id}/crm/writing-style")


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions for this workspace",
        )


# =============================================================================
# AGENT CRUD
# =============================================================================


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    workspace_id: str,
    agent_type: str | None = None,
    is_active: bool | None = None,
    include_system: bool = True,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List agents in a workspace."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    # Ensure system agents exist
    await service.ensure_system_agents(workspace_id)

    agents = await service.list_agents(
        workspace_id=workspace_id,
        agent_type=agent_type,
        is_active=is_active,
        include_system=include_system,
        skip=skip,
        limit=limit,
    )
    return agents


@router.post("", response_model=AgentResponse)
async def create_agent(
    workspace_id: str,
    data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a custom agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.create_agent(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        agent_type=data.agent_type,
        goal=data.goal,
        system_prompt=data.system_prompt,
        tools=data.tools,
        max_iterations=data.max_iterations,
        timeout_seconds=data.timeout_seconds,
        model=data.model,
        created_by_id=current_developer.id,
    )
    await db.commit()
    return agent


@router.get("/tools", response_model=list[AgentToolInfo])
async def list_available_tools(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List all available tools for agent configuration."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    return AgentService.get_available_tools()


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get an agent by ID."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    workspace_id: str,
    agent_id: str,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = data.model_dump(exclude_unset=True)
    agent = await service.update_agent(agent_id, **update_data)
    if not agent:
        raise HTTPException(status_code=400, detail="Cannot modify system agent")

    await db.commit()
    return agent


@router.delete("/{agent_id}")
async def delete_agent(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    success = await service.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete system agent")

    await db.commit()
    return {"message": "Agent deleted"}


@router.post("/{agent_id}/toggle", response_model=AgentResponse)
async def toggle_agent(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Toggle agent active status."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent = await service.toggle_agent(agent_id)
    await db.commit()
    return agent


# =============================================================================
# AGENT EXECUTION
# =============================================================================


@router.post("/{agent_id}/run", response_model=AgentExecutionResponse)
async def execute_agent(
    workspace_id: str,
    agent_id: str,
    data: AgentExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Execute an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        execution = await service.execute_agent(
            agent_id=agent_id,
            record_id=data.record_id,
            context=data.context,
            user_id=current_developer.id,
            triggered_by="manual",
        )
        await db.commit()
        return execution
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{agent_id}/executions", response_model=list[AgentExecutionResponse])
async def list_agent_executions(
    workspace_id: str,
    agent_id: str,
    status: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List executions for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    executions = await service.list_executions(
        agent_id=agent_id,
        status=status,
        skip=skip,
        limit=limit,
    )
    return executions


@router.get("/{agent_id}/executions/{execution_id}", response_model=AgentExecutionResponse)
async def get_execution(
    workspace_id: str,
    agent_id: str,
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a specific execution."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    execution = await service.get_execution(execution_id)
    if not execution or execution.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


# =============================================================================
# WRITING STYLE
# =============================================================================


@writing_style_router.get("", response_model=WritingStyleResponse | None)
async def get_writing_style(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get the current user's writing style profile."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = WritingStyleService(db)
    style = await service.get_style(str(current_developer.id), workspace_id)
    return style


@writing_style_router.post("/analyze", response_model=WritingStyleResponse)
async def analyze_writing_style(
    workspace_id: str,
    max_samples: int = Query(default=50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Analyze user's sent emails to build a writing style profile."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = WritingStyleService(db)
    style = await service.analyze_emails(
        developer_id=str(current_developer.id),
        workspace_id=workspace_id,
        max_samples=max_samples,
    )
    await db.commit()
    return style


@writing_style_router.post("/generate-email", response_model=GenerateEmailResponse)
async def generate_email(
    workspace_id: str,
    data: GenerateEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Generate an email matching the user's writing style."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = WritingStyleService(db)
    result = await service.generate_email(
        developer_id=str(current_developer.id),
        workspace_id=workspace_id,
        recipient_name=data.recipient_name,
        purpose=data.purpose,
        key_points=data.key_points,
        tone_override=data.tone_override,
    )
    return GenerateEmailResponse(**result)
