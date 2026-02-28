"""API endpoints for Agent Policy Engine."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.workspace_service import WorkspaceService
from aexy.services.agent_policy_engine import AgentPolicyEngine
from aexy.schemas.agent_policy import (
    AgentPolicyCreate,
    AgentPolicyUpdate,
    AgentPolicyResponse,
    PolicyDecisionResponse,
    ConfigAuditResponse,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/crm/agent-policies")
audit_router = APIRouter(prefix="/workspaces/{workspace_id}/crm/agents/{agent_id}")


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
# POLICY CRUD
# =============================================================================


@router.get("", response_model=list[AgentPolicyResponse])
async def list_policies(
    workspace_id: str,
    agent_id: str | None = Query(None, description="Filter by agent ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List agent policies for a workspace."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    engine = AgentPolicyEngine(db)
    return await engine.list_policies(
        workspace_id=workspace_id,
        agent_id=agent_id,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=AgentPolicyResponse, status_code=201)
async def create_policy(
    workspace_id: str,
    data: AgentPolicyCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a new agent policy."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    engine = AgentPolicyEngine(db)
    policy = await engine.create_policy(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        agent_id=data.agent_id,
        policy_type=data.policy_type,
        config=data.config,
        priority=data.priority,
        is_active=data.is_active,
        created_by_id=str(current_developer.id),
    )
    await db.commit()
    return policy


@router.get("/{policy_id}", response_model=AgentPolicyResponse)
async def get_policy(
    workspace_id: str,
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a policy by ID."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    engine = AgentPolicyEngine(db)
    policy = await engine.get_policy(policy_id)
    if not policy or policy.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.patch("/{policy_id}", response_model=AgentPolicyResponse)
async def update_policy(
    workspace_id: str,
    policy_id: str,
    data: AgentPolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a policy."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    engine = AgentPolicyEngine(db)

    existing = await engine.get_policy(policy_id)
    if not existing or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Policy not found")

    update_data = data.model_dump(exclude_unset=True)
    policy = await engine.update_policy(policy_id, **update_data)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    await db.commit()
    return policy


@router.delete("/{policy_id}")
async def delete_policy(
    workspace_id: str,
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a policy."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    engine = AgentPolicyEngine(db)

    existing = await engine.get_policy(policy_id)
    if not existing or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Policy not found")

    success = await engine.delete_policy(policy_id)
    if not success:
        raise HTTPException(status_code=404, detail="Policy not found")

    await db.commit()
    return {"message": "Policy deleted"}


# =============================================================================
# POLICY DECISIONS & CONFIG AUDIT (on agent sub-router)
# =============================================================================


@audit_router.get("/policy-decisions", response_model=list[PolicyDecisionResponse])
async def list_policy_decisions(
    workspace_id: str,
    agent_id: str,
    execution_id: str | None = Query(None, description="Filter by execution ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List policy decisions for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    engine = AgentPolicyEngine(db)
    return await engine.list_decisions(
        agent_id=agent_id,
        execution_id=execution_id,
        skip=skip,
        limit=limit,
    )


@audit_router.get("/config-audit", response_model=list[ConfigAuditResponse])
async def list_config_audit(
    workspace_id: str,
    agent_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List configuration audit trail for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    engine = AgentPolicyEngine(db)
    return await engine.list_config_audits(
        agent_id=agent_id,
        skip=skip,
        limit=limit,
    )
