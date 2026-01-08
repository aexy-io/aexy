"""Task Configuration API endpoints for custom statuses and fields."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.sprint import (
    TaskStatusCreate,
    TaskStatusUpdate,
    TaskStatusResponse,
    TaskStatusReorder,
    CustomFieldCreate,
    CustomFieldUpdate,
    CustomFieldResponse,
    CustomFieldReorder,
)
from aexy.services.task_config_service import TaskConfigService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["Task Configuration"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )


def status_to_response(status_obj) -> TaskStatusResponse:
    """Convert WorkspaceTaskStatus model to response schema."""
    return TaskStatusResponse(
        id=str(status_obj.id),
        workspace_id=str(status_obj.workspace_id),
        name=status_obj.name,
        slug=status_obj.slug,
        category=status_obj.category,
        color=status_obj.color,
        icon=status_obj.icon,
        position=status_obj.position,
        is_default=status_obj.is_default,
        is_active=status_obj.is_active,
        created_at=status_obj.created_at,
        updated_at=status_obj.updated_at,
    )


def field_to_response(field_obj) -> CustomFieldResponse:
    """Convert WorkspaceCustomField model to response schema."""
    return CustomFieldResponse(
        id=str(field_obj.id),
        workspace_id=str(field_obj.workspace_id),
        name=field_obj.name,
        slug=field_obj.slug,
        field_type=field_obj.field_type,
        options=field_obj.options,
        is_required=field_obj.is_required,
        default_value=field_obj.default_value,
        position=field_obj.position,
        is_active=field_obj.is_active,
        created_at=field_obj.created_at,
        updated_at=field_obj.updated_at,
    )


# ==================== Task Status Endpoints ====================

@router.get("/task-statuses", response_model=list[TaskStatusResponse])
async def list_task_statuses(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all task statuses for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = TaskConfigService(db)
    statuses = await service.get_statuses(workspace_id)
    return [status_to_response(s) for s in statuses]


@router.post("/task-statuses", response_model=TaskStatusResponse, status_code=status.HTTP_201_CREATED)
async def create_task_status(
    workspace_id: str,
    data: TaskStatusCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new task status."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)
    task_status = await service.create_status(
        workspace_id=workspace_id,
        name=data.name,
        category=data.category,
        color=data.color,
        icon=data.icon,
        is_default=data.is_default,
    )
    await db.commit()
    return status_to_response(task_status)


@router.get("/task-statuses/{status_id}", response_model=TaskStatusResponse)
async def get_task_status(
    workspace_id: str,
    status_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific task status."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = TaskConfigService(db)
    task_status = await service.get_status(status_id)

    if not task_status or task_status.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task status not found",
        )

    return status_to_response(task_status)


@router.patch("/task-statuses/{status_id}", response_model=TaskStatusResponse)
async def update_task_status(
    workspace_id: str,
    status_id: str,
    data: TaskStatusUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task status."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)

    # Verify status belongs to workspace
    existing = await service.get_status(status_id)
    if not existing or existing.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task status not found",
        )

    task_status = await service.update_status(
        status_id=status_id,
        name=data.name,
        category=data.category,
        color=data.color,
        icon=data.icon,
        is_default=data.is_default,
    )
    await db.commit()
    return status_to_response(task_status)


@router.delete("/task-statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_status(
    workspace_id: str,
    status_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task status (soft delete)."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)

    # Verify status belongs to workspace
    existing = await service.get_status(status_id)
    if not existing or existing.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task status not found",
        )

    await service.delete_status(status_id)
    await db.commit()


@router.post("/task-statuses/reorder", response_model=list[TaskStatusResponse])
async def reorder_task_statuses(
    workspace_id: str,
    data: TaskStatusReorder,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reorder task statuses."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)
    statuses = await service.reorder_statuses(workspace_id, data.status_ids)
    await db.commit()
    return [status_to_response(s) for s in statuses]


# ==================== Custom Field Endpoints ====================

@router.get("/custom-fields", response_model=list[CustomFieldResponse])
async def list_custom_fields(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all custom fields for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = TaskConfigService(db)
    fields = await service.get_custom_fields(workspace_id)
    return [field_to_response(f) for f in fields]


@router.post("/custom-fields", response_model=CustomFieldResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_field(
    workspace_id: str,
    data: CustomFieldCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom field."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)

    # Convert options if provided
    options = None
    if data.options:
        options = [opt.model_dump() for opt in data.options]

    field = await service.create_custom_field(
        workspace_id=workspace_id,
        name=data.name,
        field_type=data.field_type,
        options=options,
        is_required=data.is_required,
        default_value=data.default_value,
    )
    await db.commit()
    return field_to_response(field)


@router.get("/custom-fields/{field_id}", response_model=CustomFieldResponse)
async def get_custom_field(
    workspace_id: str,
    field_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific custom field."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = TaskConfigService(db)
    field = await service.get_custom_field(field_id)

    if not field or field.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    return field_to_response(field)


@router.patch("/custom-fields/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    workspace_id: str,
    field_id: str,
    data: CustomFieldUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom field."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)

    # Verify field belongs to workspace
    existing = await service.get_custom_field(field_id)
    if not existing or existing.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    # Convert options if provided
    options = None
    if data.options:
        options = [opt.model_dump() for opt in data.options]

    field = await service.update_custom_field(
        field_id=field_id,
        name=data.name,
        options=options,
        is_required=data.is_required,
        default_value=data.default_value,
    )
    await db.commit()
    return field_to_response(field)


@router.delete("/custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_field(
    workspace_id: str,
    field_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom field (soft delete)."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)

    # Verify field belongs to workspace
    existing = await service.get_custom_field(field_id)
    if not existing or existing.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    await service.delete_custom_field(field_id)
    await db.commit()


@router.post("/custom-fields/reorder", response_model=list[CustomFieldResponse])
async def reorder_custom_fields(
    workspace_id: str,
    data: CustomFieldReorder,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reorder custom fields."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = TaskConfigService(db)
    fields = await service.reorder_custom_fields(workspace_id, data.field_ids)
    await db.commit()
    return [field_to_response(f) for f in fields]
