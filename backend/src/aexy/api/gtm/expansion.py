"""GTM Expansion API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_expansion import (
    PlaybookCreate,
    PlaybookUpdate,
    PlaybookResponse,
    EnrollRequest,
    EnrollmentResponse as ExpEnrollmentResponse,
    EnrollmentListResponse as ExpEnrollmentListResponse,
    OutcomeRequest,
    PlaybookAnalyticsResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/expansion/playbooks", response_model=list[PlaybookResponse])
async def list_expansion_playbooks(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    return await service.list_playbooks(workspace_id)


@router.post("/expansion/playbooks", response_model=PlaybookResponse)
async def create_expansion_playbook(
    workspace_id: str,
    data: PlaybookCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ExpansionPlaybookService(db)
    return await service.create_playbook(workspace_id, data.model_dump())


@router.get("/expansion/playbooks/{playbook_id}", response_model=PlaybookResponse)
async def get_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    result = await service.get_playbook(workspace_id, playbook_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/expansion/playbooks/{playbook_id}", response_model=PlaybookResponse)
async def update_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    data: PlaybookUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ExpansionPlaybookService(db)
    result = await service.update_playbook(workspace_id, playbook_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/expansion/playbooks/{playbook_id}", status_code=204)
async def delete_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ExpansionPlaybookService(db)
    deleted = await service.delete_playbook(workspace_id, playbook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/expansion/playbooks/{playbook_id}/enroll/{record_id}", response_model=ExpEnrollmentResponse)
async def enroll_in_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    record_id: str,
    data: EnrollRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ExpansionPlaybookService(db)
    return await service.enroll(workspace_id, playbook_id, record_id, data)


@router.get("/expansion/enrollments", response_model=ExpEnrollmentListResponse)
async def list_expansion_enrollments(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    playbook_id: str = None,
    status: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    return await service.list_enrollments(workspace_id, page=page, per_page=per_page, playbook_id=playbook_id, status=status)


@router.post("/expansion/enrollments/{enrollment_id}/advance")
async def advance_expansion_step(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ExpansionPlaybookService(db)
    result = await service.advance_step(workspace_id, enrollment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/expansion/enrollments/{enrollment_id}/outcome")
async def record_expansion_outcome(
    workspace_id: str,
    enrollment_id: str,
    data: OutcomeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ExpansionPlaybookService(db)
    result = await service.record_outcome(workspace_id, enrollment_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/expansion/analytics", response_model=PlaybookAnalyticsResponse)
async def get_expansion_analytics(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    return await service.get_playbook_analytics(workspace_id)
