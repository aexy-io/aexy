"""GTM Alerts API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_alerts import (
    AlertConfigCreate,
    AlertConfigUpdate,
    AlertConfigResponse,
    AlertLogListResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/alerts/configs", response_model=list[AlertConfigResponse])
async def list_alert_configs(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    return await service.list_alert_configs(workspace_id)


@router.post("/alerts/configs", response_model=AlertConfigResponse)
async def create_alert_config(
    workspace_id: str,
    data: AlertConfigCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    result = await service.create_alert_config(workspace_id, data.model_dump())
    await db.commit()
    return result


@router.put("/alerts/configs/{alert_id}", response_model=AlertConfigResponse)
async def update_alert_config(
    workspace_id: str,
    alert_id: str,
    data: AlertConfigUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    result = await service.update_alert_config(workspace_id, alert_id, data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    await db.commit()
    return result


@router.delete("/alerts/configs/{alert_id}", status_code=204)
async def delete_alert_config(
    workspace_id: str,
    alert_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    deleted = await service.delete_alert_config(workspace_id, alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")
    await db.commit()


@router.get("/alerts/logs", response_model=AlertLogListResponse)
async def list_alert_logs(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    event_type: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    return await service.list_alert_logs(workspace_id, page=page, per_page=per_page, event_type=event_type)


@router.post("/alerts/test/{alert_id}")
async def test_alert_config(
    workspace_id: str,
    alert_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    result = await service.test_alert(workspace_id, alert_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result
