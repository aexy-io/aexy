"""GTM SEO & Content Gap API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_seo import (
    SEOAuditCreate,
    SEOAuditResponse,
    SEOAuditListResponse,
    SEOAuditPageResponse,
    SEOScoreHistoryResponse,
)
from aexy.schemas.gtm_content import (
    ContentAnalysisCreate,
    ContentAnalysisResponse,
    ContentAnalysisListResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


# =============================================================================
# SEO ENDPOINTS
# =============================================================================

@router.post("/seo/audits")
async def create_seo_audit(
    workspace_id: str,
    data: SEOAuditCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.seo_audit_service import SEOAuditService
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = SEOAuditService(db)
    audit = await service.create_audit(workspace_id, data.target_url, record_id=data.record_id)
    wf_id = await dispatch(
        "run_seo_audit",
        {"workspace_id": workspace_id, "audit_id": str(audit.id)},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"audit": audit, "workflow_id": wf_id}


@router.get("/seo/audits", response_model=SEOAuditListResponse)
async def list_seo_audits(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    return await service.list_audits(workspace_id, page=page, per_page=per_page)


@router.get("/seo/audits/{audit_id}", response_model=SEOAuditResponse)
async def get_seo_audit(
    workspace_id: str,
    audit_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    result = await service.get_audit(workspace_id, audit_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/seo/audits/{audit_id}/pages", response_model=list[SEOAuditPageResponse])
async def get_seo_audit_pages(
    workspace_id: str,
    audit_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    result = await service.get_audit_pages(workspace_id, audit_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/seo/history/{domain}", response_model=SEOScoreHistoryResponse)
async def get_seo_score_history(
    workspace_id: str,
    domain: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    return await service.get_score_history(workspace_id, domain)


@router.delete("/seo/audits/{audit_id}", status_code=204)
async def delete_seo_audit(
    workspace_id: str,
    audit_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = SEOAuditService(db)
    deleted = await service.delete_audit(workspace_id, audit_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


# =============================================================================
# CONTENT GAP ENDPOINTS
# =============================================================================

@router.post("/content-gap/analyses")
async def create_content_gap_analysis(
    workspace_id: str,
    data: ContentAnalysisCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.content_gap_service import ContentGapService
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ContentGapService(db)
    analysis = await service.create_analysis(workspace_id, data.our_domain, data.competitor_domains)
    wf_id = await dispatch(
        "run_content_gap_analysis",
        {"workspace_id": workspace_id, "analysis_id": str(analysis.id)},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"analysis": analysis, "workflow_id": wf_id}


@router.get("/content-gap/analyses", response_model=ContentAnalysisListResponse)
async def list_content_gap_analyses(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.content_gap_service import ContentGapService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ContentGapService(db)
    items, total = await service.list_analyses(workspace_id, page=page, per_page=per_page)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/content-gap/analyses/{analysis_id}", response_model=ContentAnalysisResponse)
async def get_content_gap_analysis(
    workspace_id: str,
    analysis_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.content_gap_service import ContentGapService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ContentGapService(db)
    result = await service.get_analysis(workspace_id, analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/content-gap/analyses/{analysis_id}", status_code=204)
async def delete_content_gap_analysis(
    workspace_id: str,
    analysis_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.content_gap_service import ContentGapService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = ContentGapService(db)
    deleted = await service.delete_analysis(workspace_id, analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")
