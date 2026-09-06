"""Agent schedules: routines an agent runs on a clock.

Members may read; admins create, change and delete. Reachable over MCP under
the `agents` capability, which is right: arranging when an existing, scoped
agent runs is agent configuration, not a new grant.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.agent_schedule import (
    AgentScheduleCreate,
    AgentScheduleResponse,
    AgentScheduleUpdate,
)
from aexy.services.agent_schedule_service import AgentScheduleService, ScheduleError
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/agent-schedules", tags=["Agent Schedules"])


async def _require(db: AsyncSession, workspace_id: str, developer_id: str, role: str) -> None:
    if not await WorkspaceService(db).check_permission(workspace_id, developer_id, role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


async def _load(db: AsyncSession, workspace_id: str, schedule_id: str):
    row = await AgentScheduleService(db).get(workspace_id, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return row


@router.get("", response_model=list[AgentScheduleResponse])
async def list_agent_schedules(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require(db, workspace_id, str(current_user.id), "member")
    return [AgentScheduleResponse.model_validate(r) for r in await AgentScheduleService(db).list(workspace_id)]


@router.post("", response_model=AgentScheduleResponse, status_code=201)
async def create_agent_schedule(
    workspace_id: str,
    data: AgentScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require(db, workspace_id, str(current_user.id), "admin")
    try:
        row = await AgentScheduleService(db).create(
            workspace_id=workspace_id,
            agent_id=data.agent_id,
            name=data.name,
            routine=data.routine,
            interval_minutes=data.interval_minutes,
            tz=data.timezone,
            enabled=data.enabled,
            created_by_id=str(current_user.id),
        )
    except ScheduleError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return AgentScheduleResponse.model_validate(row)


@router.patch("/{schedule_id}", response_model=AgentScheduleResponse)
async def update_agent_schedule(
    workspace_id: str,
    schedule_id: str,
    data: AgentScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require(db, workspace_id, str(current_user.id), "admin")
    row = await _load(db, workspace_id, schedule_id)
    changes = data.model_dump(exclude_unset=True)
    if "timezone" in changes:
        changes["timezone"] = changes.pop("timezone")
    row = await AgentScheduleService(db).update(row, **changes)
    return AgentScheduleResponse.model_validate(row)


@router.delete("/{schedule_id}", status_code=204)
async def delete_agent_schedule(
    workspace_id: str,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require(db, workspace_id, str(current_user.id), "admin")
    row = await _load(db, workspace_id, schedule_id)
    await AgentScheduleService(db).delete(row)


@router.post("/{schedule_id}/run", response_model=AgentScheduleResponse)
async def run_agent_schedule_now(
    workspace_id: str,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Fire the routine once, now, outside its clock. Does not move the clock."""
    await _require(db, workspace_id, str(current_user.id), "admin")
    row = await _load(db, workspace_id, schedule_id)
    service = AgentScheduleService(db)
    try:
        await service.run_now(row)
    except ScheduleError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # Temporal unreachable, most likely
        raise HTTPException(status_code=503, detail=f"Could not start the run: {exc}")
    return AgentScheduleResponse.model_validate(row)
