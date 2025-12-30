"""Integrations API endpoints for Jira and Linear."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.integrations import (
    JiraIntegrationCreate,
    JiraIntegrationUpdate,
    JiraIntegrationResponse,
    LinearIntegrationCreate,
    LinearIntegrationUpdate,
    LinearIntegrationResponse,
    ConnectionTestResponse,
    SyncResult,
    RemoteStatus,
    RemoteField,
    RemoteTeam,
    RemoteProject,
)
from devograph.services.jira_integration_service import JiraIntegrationService
from devograph.services.linear_integration_service import LinearIntegrationService
from devograph.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/integrations", tags=["Integrations"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "admin",
) -> None:
    """Check if user has permission to manage integrations."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to manage integrations",
        )


def jira_to_response(integration) -> JiraIntegrationResponse:
    """Convert JiraIntegration model to response schema."""
    return JiraIntegrationResponse(
        id=str(integration.id),
        workspace_id=str(integration.workspace_id),
        site_url=integration.site_url,
        user_email=integration.user_email,
        project_mappings=integration.project_mappings,
        status_mappings=integration.status_mappings,
        field_mappings=integration.field_mappings,
        sync_enabled=integration.sync_enabled,
        sync_direction=integration.sync_direction,
        last_sync_at=integration.last_sync_at,
        is_active=integration.is_active,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


def linear_to_response(integration) -> LinearIntegrationResponse:
    """Convert LinearIntegration model to response schema."""
    return LinearIntegrationResponse(
        id=str(integration.id),
        workspace_id=str(integration.workspace_id),
        organization_id=integration.organization_id,
        organization_name=integration.organization_name,
        team_mappings=integration.team_mappings,
        status_mappings=integration.status_mappings,
        field_mappings=integration.field_mappings,
        sync_enabled=integration.sync_enabled,
        last_sync_at=integration.last_sync_at,
        is_active=integration.is_active,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


# ==================== Jira Integration Endpoints ====================

@router.get("/jira", response_model=JiraIntegrationResponse | None)
async def get_jira_integration(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get Jira integration for workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = JiraIntegrationService(db)
    integration = await service.get_integration(workspace_id)

    if not integration:
        return None

    return jira_to_response(integration)


@router.post("/jira", response_model=JiraIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_jira_integration(
    workspace_id: str,
    data: JiraIntegrationCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create Jira integration for workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)
    try:
        integration = await service.create_integration(
            workspace_id=workspace_id,
            site_url=data.site_url,
            user_email=data.user_email,
            api_token=data.api_token,
            connected_by_id=str(current_user.id),
        )
        await db.commit()
        return jira_to_response(integration)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/jira/test", response_model=ConnectionTestResponse)
async def test_jira_connection(
    workspace_id: str,
    data: JiraIntegrationCreate | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test Jira connection. If data is provided, tests new credentials. Otherwise tests existing integration."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)

    if data:
        return await service.test_new_connection(
            site_url=data.site_url,
            user_email=data.user_email,
            api_token=data.api_token,
        )
    else:
        return await service.test_connection(workspace_id)


@router.patch("/jira", response_model=JiraIntegrationResponse)
async def update_jira_integration(
    workspace_id: str,
    data: JiraIntegrationUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update Jira integration settings."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)

    # Convert Pydantic models to dicts
    status_mappings = None
    if data.status_mappings:
        status_mappings = [m.model_dump() for m in data.status_mappings]

    field_mappings = None
    if data.field_mappings:
        field_mappings = [m.model_dump() for m in data.field_mappings]

    project_mappings = None
    if data.project_mappings:
        project_mappings = {k: v.model_dump() for k, v in data.project_mappings.items()}

    integration = await service.update_integration(
        workspace_id=workspace_id,
        project_mappings=project_mappings,
        status_mappings=status_mappings,
        field_mappings=field_mappings,
        sync_enabled=data.sync_enabled,
        sync_direction=data.sync_direction,
    )

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jira integration not found",
        )

    await db.commit()
    return jira_to_response(integration)


@router.delete("/jira", status_code=status.HTTP_204_NO_CONTENT)
async def delete_jira_integration(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete Jira integration."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)
    deleted = await service.delete_integration(workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jira integration not found",
        )

    await db.commit()


@router.post("/jira/sync", response_model=SyncResult)
async def sync_jira_issues(
    workspace_id: str,
    team_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually sync issues from Jira."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)
    result = await service.sync_issues(workspace_id, team_id)
    await db.commit()
    return result


@router.get("/jira/statuses", response_model=list[RemoteStatus])
async def get_jira_statuses(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get available statuses from Jira."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)
    return await service.get_remote_statuses(workspace_id)


@router.get("/jira/fields", response_model=list[RemoteField])
async def get_jira_fields(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get available custom fields from Jira."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)
    return await service.get_remote_fields(workspace_id)


@router.get("/jira/projects", response_model=list[RemoteProject])
async def get_jira_projects(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get available projects from Jira."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = JiraIntegrationService(db)
    result = await service.test_connection(workspace_id)
    return result.available_projects or []


# ==================== Linear Integration Endpoints ====================

@router.get("/linear", response_model=LinearIntegrationResponse | None)
async def get_linear_integration(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get Linear integration for workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = LinearIntegrationService(db)
    integration = await service.get_integration(workspace_id)

    if not integration:
        return None

    return linear_to_response(integration)


@router.post("/linear", response_model=LinearIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_linear_integration(
    workspace_id: str,
    data: LinearIntegrationCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create Linear integration for workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)
    try:
        integration = await service.create_integration(
            workspace_id=workspace_id,
            api_key=data.api_key,
            connected_by_id=str(current_user.id),
        )
        await db.commit()
        return linear_to_response(integration)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/linear/test", response_model=ConnectionTestResponse)
async def test_linear_connection(
    workspace_id: str,
    data: LinearIntegrationCreate | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test Linear connection. If data is provided, tests new API key. Otherwise tests existing integration."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)

    if data:
        return await service.test_new_connection(data.api_key)
    else:
        return await service.test_connection(workspace_id)


@router.patch("/linear", response_model=LinearIntegrationResponse)
async def update_linear_integration(
    workspace_id: str,
    data: LinearIntegrationUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update Linear integration settings."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)

    # Convert Pydantic models to dicts
    status_mappings = None
    if data.status_mappings:
        status_mappings = [m.model_dump() for m in data.status_mappings]

    field_mappings = None
    if data.field_mappings:
        field_mappings = [m.model_dump() for m in data.field_mappings]

    team_mappings = None
    if data.team_mappings:
        team_mappings = {k: v.model_dump() for k, v in data.team_mappings.items()}

    integration = await service.update_integration(
        workspace_id=workspace_id,
        team_mappings=team_mappings,
        status_mappings=status_mappings,
        field_mappings=field_mappings,
        sync_enabled=data.sync_enabled,
    )

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Linear integration not found",
        )

    await db.commit()
    return linear_to_response(integration)


@router.delete("/linear", status_code=status.HTTP_204_NO_CONTENT)
async def delete_linear_integration(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete Linear integration."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)
    deleted = await service.delete_integration(workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Linear integration not found",
        )

    await db.commit()


@router.post("/linear/sync", response_model=SyncResult)
async def sync_linear_issues(
    workspace_id: str,
    team_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually sync issues from Linear."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)
    result = await service.sync_issues(workspace_id, team_id)
    await db.commit()
    return result


@router.get("/linear/states", response_model=list[RemoteStatus])
async def get_linear_states(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get available workflow states from Linear."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)
    return await service.get_remote_states(workspace_id)


@router.get("/linear/teams", response_model=list[RemoteTeam])
async def get_linear_teams(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get available teams from Linear."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)
    return await service.get_remote_teams(workspace_id)


@router.get("/linear/fields", response_model=list[RemoteField])
async def get_linear_fields(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get available custom fields from Linear."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = LinearIntegrationService(db)
    return await service.get_remote_fields(workspace_id)
