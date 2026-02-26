"""GTM Visitor API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    VisitorSessionListResponse,
    VisitorSessionDetailResponse,
    VisitorIdentificationResponse,
    BehavioralEventResponse,
    ManualIdentifyRequest,
    LinkToRecordRequest,
)
from aexy.services.gtm_service import VisitorService

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/visitors", response_model=VisitorSessionListResponse)
async def list_visitors(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    status: str | None = None,
    utm_source: str | None = None,
    search: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List visitor sessions with filters."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = VisitorService(db)
    sessions, total = await service.list_sessions(
        workspace_id, page=page, page_size=page_size,
        status=status, utm_source=utm_source, search=search,
    )
    return {
        "sessions": sessions,
        "total": total,
        "page": page,
        "per_page": page_size,
    }


@router.get("/visitors/{session_id}", response_model=VisitorSessionDetailResponse)
async def get_visitor_session(
    workspace_id: str,
    session_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get visitor session detail with events."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = VisitorService(db)
    session, events, identification = await service.get_session_detail(
        workspace_id, session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = VisitorSessionDetailResponse.model_validate(session)
    result.events = [BehavioralEventResponse.model_validate(e) for e in events]
    if identification:
        result.identification = VisitorIdentificationResponse.model_validate(identification)
    return result


@router.post("/visitors/{session_id}/identify", response_model=dict)
async def identify_visitor(
    workspace_id: str,
    session_id: str,
    data: ManualIdentifyRequest | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger identification for a visitor session."""
    await check_workspace_permission(workspace_id, current_user, db)

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    wf_id = await dispatch(
        "identify_visitor_session",
        {"workspace_id": workspace_id, "session_id": session_id},
        task_queue=TaskQueue.INTEGRATIONS,
    )
    return {"workflow_id": wf_id, "message": "Identification triggered"}


@router.post("/visitors/{session_id}/link")
async def link_visitor_to_record(
    workspace_id: str,
    session_id: str,
    data: LinkToRecordRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link a visitor session to a CRM record."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = VisitorService(db)
    success = await service.link_session_to_record(
        workspace_id, session_id, data.record_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.commit()
    return {"success": True}
