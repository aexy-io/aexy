"""Progress updates on tasks and tickets.

Mounted without a router-level app guard on purpose: one router serves two
apps (a task belongs to `sprints`, a ticket to `tickets`), so the gate has to be
chosen per request from `entity_type`. `_authorize` below does that — dropping
it would leave these endpoints reachable by any workspace member regardless of
which modules they have.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.access_guard import ensure_app_enabled, ensure_member_app_access
from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.work_update import WorkUpdate
from aexy.schemas.work_update import (
    LatestWorkUpdate,
    WorkUpdateCreate,
    WorkUpdateEdit,
    WorkUpdateEntityType,
    WorkUpdateListResponse,
    WorkUpdateResponse,
)
from aexy.services.work_update_service import WorkUpdateService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/work-updates",
    tags=["Work Updates"],
)

# Which app gates each entity kind. Keep in step with
# `WORK_UPDATE_ENTITY_TYPES` / `WorkUpdateEntityType`.
_ENTITY_TYPE_TO_APP: dict[str, str] = {
    "task": "sprints",
    "ticket": "tickets",
}


async def _authorize(
    db: AsyncSession,
    workspace_id: str,
    developer: Developer,
    entity_type: str,
) -> None:
    """Workspace membership, then the app that owns this entity kind."""
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(developer.id), "member"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )
    app_id = _ENTITY_TYPE_TO_APP.get(entity_type)
    if app_id is None:
        # Unreachable via the typed path params; guards against a new entity
        # type being added to the Literal without a gate being chosen for it.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported entity type {entity_type!r}",
        )
    await ensure_app_enabled(db, workspace_id, app_id)
    await ensure_member_app_access(db, workspace_id, str(developer.id), app_id)


def _to_response(update: WorkUpdate) -> WorkUpdateResponse:
    return WorkUpdateResponse(
        id=str(update.id),
        entity_type=update.entity_type,
        entity_id=str(update.entity_id),
        author_id=str(update.author_id) if update.author_id else None,
        author_name=update.author.name if update.author else None,
        author_email=update.author.email if update.author else None,
        author_avatar_url=update.author.avatar_url if update.author else None,
        body=update.body,
        created_at=update.created_at,
        edited_at=update.edited_at,
    )


@router.get("/{entity_type}/latest", response_model=list[LatestWorkUpdate])
async def latest_work_updates(
    workspace_id: str,
    entity_type: WorkUpdateEntityType,
    ids: str = Query(description="Comma-separated entity ids"),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Latest update per entity, for rendering staleness on a board.

    Bulk by design — the alternative is one request per card.

    Declared before ``/{entity_type}/{entity_id}``: FastAPI resolves in
    declaration order, so with the generic route first this path would bind
    ``entity_id="latest"`` and never be reached.
    """
    await _authorize(db, workspace_id, current_developer, entity_type)
    entity_ids = [part.strip() for part in ids.split(",") if part.strip()]
    if len(entity_ids) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At most 500 ids per request",
        )
    latest = await WorkUpdateService(db).latest_by_entity(
        workspace_id, entity_type, entity_ids
    )
    return [
        LatestWorkUpdate(
            entity_id=entity_id,
            author_name=update.author.name if update.author else None,
            body=update.body,
            created_at=update.created_at,
        )
        for entity_id, update in latest.items()
    ]


@router.get("/{entity_type}/{entity_id}", response_model=WorkUpdateListResponse)
async def list_work_updates(
    workspace_id: str,
    entity_type: WorkUpdateEntityType,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Progress updates for one task or ticket, newest first."""
    await _authorize(db, workspace_id, current_developer, entity_type)
    updates = await WorkUpdateService(db).list_updates(
        workspace_id, entity_type, entity_id
    )
    return WorkUpdateListResponse(
        items=[_to_response(u) for u in updates], total=len(updates)
    )


@router.post(
    "/{entity_type}/{entity_id}",
    response_model=WorkUpdateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_work_update(
    workspace_id: str,
    entity_type: WorkUpdateEntityType,
    entity_id: str,
    payload: WorkUpdateCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Post a progress update.

    Any member with access to the owning app can post — not just the assignee.
    A lead adding "waiting on vendor, chased today" is the same kind of fact as
    the assignee adding it, and restricting it to the assignee is what makes
    these fields go stale.
    """
    await _authorize(db, workspace_id, current_developer, entity_type)
    update = await WorkUpdateService(db).create_update(
        workspace_id=workspace_id,
        entity_type=entity_type,
        entity_id=entity_id,
        author_id=str(current_developer.id),
        body=payload.body,
    )
    return _to_response(update)


@router.patch("/{update_id}", response_model=WorkUpdateResponse)
async def edit_work_update(
    workspace_id: str,
    update_id: str,
    payload: WorkUpdateEdit,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Reword your own update."""
    service = WorkUpdateService(db)
    existing = await service.get_update(workspace_id, update_id)
    await _authorize(db, workspace_id, current_developer, existing.entity_type)
    update = await service.edit_update(
        workspace_id, update_id, str(current_developer.id), payload.body
    )
    return _to_response(update)


@router.delete("/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_work_update(
    workspace_id: str,
    update_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Remove an update. Author, or a workspace admin clearing something up."""
    service = WorkUpdateService(db)
    existing = await service.get_update(workspace_id, update_id)
    await _authorize(db, workspace_id, current_developer, existing.entity_type)
    is_admin = await WorkspaceService(db).check_permission(
        workspace_id, str(current_developer.id), "admin"
    )
    await service.delete_update(
        workspace_id, update_id, str(current_developer.id), requester_is_admin=is_admin
    )
