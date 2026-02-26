"""Unified saved views API for all entity types (sprints, tickets, hiring, etc.)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.models import Developer
from aexy.api.developers import get_current_developer
from aexy.schemas.crm import CRMListCreate, CRMListUpdate, CRMListResponse
from aexy.services.data_table_service import DataTableService
from aexy.services.workspace_service import WorkspaceService

VALID_ENTITY_TYPES = {"sprint_task", "ticket", "candidate"}


async def _check_workspace(workspace_id: str, current_user: Developer, db: AsyncSession):
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(status_code=403, detail="No access to this workspace")

router = APIRouter(
    prefix="/workspaces/{workspace_id}/saved-views/{entity_type}",
)


def _view_to_response(v) -> CRMListResponse:
    return CRMListResponse(
        id=str(v.id),
        workspace_id=str(v.workspace_id),
        object_id=str(v.object_id) if v.object_id else None,
        name=v.name,
        slug=v.slug,
        description=v.description,
        icon=v.icon,
        color=v.color,
        view_type=v.view_type,
        filters=v.filters,
        sorts=v.sorts,
        visible_attributes=v.visible_attributes,
        column_config=v.column_config,
        group_by_attribute=v.group_by_attribute,
        kanban_settings=v.kanban_settings,
        date_attribute=v.date_attribute,
        end_date_attribute=v.end_date_attribute,
        is_private=v.is_private,
        owner_id=str(v.owner_id) if v.owner_id else None,
        entity_type=v.entity_type,
        entity_scope_id=str(v.entity_scope_id) if v.entity_scope_id else None,
        entry_count=v.entry_count,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


def _validate_entity_type(entity_type: str):
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entity_type '{entity_type}'. Must be one of: {', '.join(sorted(VALID_ENTITY_TYPES))}",
        )


@router.get("", response_model=list[CRMListResponse])
async def list_entity_views(
    workspace_id: str,
    entity_type: str,
    scope_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List saved views for an entity type, optionally scoped."""
    await _check_workspace(workspace_id, current_user, db)
    _validate_entity_type(entity_type)

    service = DataTableService(db)
    views = await service.list_views(
        workspace_id=workspace_id,
        entity_type=entity_type,
        entity_scope_id=scope_id,
        user_id=str(current_user.id),
    )
    return [_view_to_response(v) for v in views]


@router.post("", response_model=CRMListResponse, status_code=201)
async def create_entity_view(
    workspace_id: str,
    entity_type: str,
    data: CRMListCreate,
    scope_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a saved view for an entity type."""
    await _check_workspace(workspace_id, current_user, db)
    _validate_entity_type(entity_type)

    # scope_id from query param takes precedence, then body
    resolved_scope_id = scope_id or data.entity_scope_id

    service = DataTableService(db)
    view = await service.create_view(
        table_id=None,
        workspace_id=workspace_id,
        name=data.name,
        view_type=data.view_type,
        filters=[f.model_dump() for f in data.filters] if data.filters else None,
        sorts=[s.model_dump() for s in data.sorts] if data.sorts else None,
        visible_attributes=data.visible_attributes,
        column_config=[c.model_dump() for c in data.column_config] if data.column_config else None,
        group_by_attribute=data.group_by_attribute,
        kanban_settings=data.kanban_settings.model_dump() if data.kanban_settings else None,
        is_private=data.is_private,
        owner_id=str(current_user.id),
        entity_type=entity_type,
        entity_scope_id=resolved_scope_id,
    )

    await db.commit()
    return _view_to_response(view)


@router.patch("/{view_id}", response_model=CRMListResponse)
async def update_entity_view(
    workspace_id: str,
    entity_type: str,
    view_id: str,
    data: CRMListUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a saved view."""
    await _check_workspace(workspace_id, current_user, db)
    _validate_entity_type(entity_type)

    service = DataTableService(db)
    existing = await service.get_view(view_id, workspace_id=workspace_id)
    if not existing or existing.entity_type != entity_type:
        raise HTTPException(status_code=404, detail="View not found")

    if existing.is_private and str(existing.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Cannot modify another user's private view")

    update_data = data.model_dump(exclude_unset=True)
    if "filters" in update_data and update_data["filters"] is not None:
        update_data["filters"] = [f if isinstance(f, dict) else f.model_dump() for f in update_data["filters"]]
    if "sorts" in update_data and update_data["sorts"] is not None:
        update_data["sorts"] = [s if isinstance(s, dict) else s.model_dump() for s in update_data["sorts"]]
    if "column_config" in update_data and update_data["column_config"] is not None:
        update_data["column_config"] = [c if isinstance(c, dict) else c.model_dump() for c in update_data["column_config"]]
    if "kanban_settings" in update_data and update_data["kanban_settings"] is not None:
        ks = update_data["kanban_settings"]
        update_data["kanban_settings"] = ks if isinstance(ks, dict) else ks.model_dump()
    # Remove entity fields — not mutable after creation
    update_data.pop("entity_type", None)
    update_data.pop("entity_scope_id", None)

    view = await service.update_view(view_id, workspace_id=workspace_id, **update_data)
    if not view:
        raise HTTPException(status_code=404, detail="View not found")

    await db.commit()
    return _view_to_response(view)


@router.delete("/{view_id}", status_code=204)
async def delete_entity_view(
    workspace_id: str,
    entity_type: str,
    view_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved view."""
    await _check_workspace(workspace_id, current_user, db)
    _validate_entity_type(entity_type)

    service = DataTableService(db)
    existing = await service.get_view(view_id, workspace_id=workspace_id)
    if not existing or existing.entity_type != entity_type:
        raise HTTPException(status_code=404, detail="View not found")

    if existing.is_private and str(existing.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Cannot delete another user's private view")

    if not await service.delete_view(view_id, workspace_id=workspace_id):
        raise HTTPException(status_code=404, detail="View not found")

    await db.commit()
