"""GTM Handoffs API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_handoff import (
    HandoffCreate,
    HandoffResponse,
    HandoffListResponse,
    HandoffAnalyticsResponse,
    DeclineRequest,
    ConvertRequest,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.post("/handoffs", response_model=HandoffResponse)
async def create_handoff(
    workspace_id: str,
    data: HandoffCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    return await service.create_handoff(workspace_id, data.model_dump(), created_by=str(current_user.id))


@router.get("/handoffs", response_model=HandoffListResponse)
async def list_handoffs(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    status: str = None,
    assigned_to: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    items, total = await service.list_handoffs(workspace_id, page=page, per_page=per_page, status=status, assigned_to=assigned_to)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/handoffs/analytics", response_model=HandoffAnalyticsResponse)
async def get_handoff_analytics(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    return await service.get_handoff_analytics(workspace_id)


@router.get("/handoffs/{handoff_id}", response_model=HandoffResponse)
async def get_handoff(
    workspace_id: str,
    handoff_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    result = await service.get_handoff(workspace_id, handoff_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/handoffs/{handoff_id}/accept")
async def accept_handoff(
    workspace_id: str,
    handoff_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    result = await service.accept_handoff(workspace_id, handoff_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/handoffs/{handoff_id}/decline")
async def decline_handoff(
    workspace_id: str,
    handoff_id: str,
    data: DeclineRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    result = await service.decline_handoff(workspace_id, handoff_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/handoffs/{handoff_id}/convert")
async def convert_handoff(
    workspace_id: str,
    handoff_id: str,
    data: ConvertRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    result = await service.convert_to_deal(workspace_id, handoff_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result
