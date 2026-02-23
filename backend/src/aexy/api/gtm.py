"""GTM (Go-To-Market) API endpoints."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.integrations.registry import ProviderRegistry
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    # Provider schemas
    GTMProviderConfigCreate,
    GTMProviderConfigUpdate,
    GTMProviderConfigResponse,
    GTMProviderTestResult,
    GTMAvailableProvider,
    SetDefaultRequest,
    # ICP schemas
    ICPTemplateCreate,
    ICPTemplateUpdate,
    ICPTemplateResponse,
    # Dashboard schemas
    GTMDashboardOverview,
    GTMFunnelResponse,
    RecentVisitorsResponse,
    # Visitor schemas
    VisitorSessionListResponse,
    VisitorSessionDetailResponse,
    VisitorSessionResponse,
    VisitorIdentificationResponse,
    BehavioralEventResponse,
    ManualIdentifyRequest,
    LinkToRecordRequest,
    # Compliance schemas
    RecordConsentRequest,
    ConsentStatusResponse,
    SendPermissionCheck,
    AddSuppressionRequest,
    SuppressionEntryResponse,
    SuppressionListResponse,
    ComplianceAuditResponse,
    ComplianceAuditListResponse,
    ErasureRequest,
    UnsubscribeRequest,
    # Scoring schemas
    ScoringOverviewResponse,
    ScoredLeadListResponse,
    ScoreDetailResponse,
    # Dedup schemas
    DuplicateMatch,
    MergeRequest,
    MergeResult,
    DedupStatsResponse,
    # Analytics schemas
    PipelineAnalyticsResponse,
    ChannelAnalyticsResponse,
    AttributionAnalyticsResponse,
    SequenceComparisonAnalyticsResponse,
    TrendAnalyticsResponse,
    WeeklyReportResponse,
    # Outreach schemas
    CreateSequenceRequest,
    UpdateSequenceRequest,
    SequenceResponse,
    SequenceListResponse,
    EnrollContactRequest,
    BulkEnrollRequest,
    EnrollmentResponse,
    EnrollmentListResponse,
    BulkEnrollResponse,
    StepExecutionResponse,
    SequenceAnalyticsResponse,
    # Reply classification schemas
    ClassifyReplyRequest,
    ReplyClassificationResponse,
    ReplyClassificationStatsResponse,
    # Bulk import schemas
    BulkImportRequest,
    BulkImportResponse,
    BulkImportAsyncResponse,
)
from aexy.services.gtm_service import (
    GTMProviderService,
    GTMDashboardService,
    ICPTemplateService,
    VisitorService,
    GTMScoringService,
)
from aexy.services.dedup_service import DedupService
from aexy.services.gtm_compliance_service import GTMComplianceService
from aexy.services.outreach_sequence_service import OutreachSequenceService
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/gtm",
    tags=["GTM"],
)


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this workspace",
        )


# =============================================================================
# PROVIDER ENDPOINTS
# =============================================================================

@router.get("/providers/available", response_model=list[GTMAvailableProvider])
async def list_available_providers(
    workspace_id: str,
    slot: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all available (registered) providers."""
    await check_workspace_permission(workspace_id, current_user, db)

    # Ensure providers are registered
    _ensure_providers_registered()

    providers = ProviderRegistry.list_available(slot=slot)
    return providers


@router.get("/providers", response_model=list[GTMProviderConfigResponse])
async def list_providers(
    workspace_id: str,
    slot: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List configured providers for this workspace."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMProviderService(db)
    configs = await service.list_providers(workspace_id, slot=slot)
    return configs


@router.post("/providers", response_model=GTMProviderConfigResponse, status_code=201)
async def create_provider(
    workspace_id: str,
    data: GTMProviderConfigCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Configure a new provider."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    _ensure_providers_registered()

    # Check if provider class exists
    if not ProviderRegistry.get_class(data.slot, data.provider_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {data.slot}/{data.provider_name}",
        )

    service = GTMProviderService(db)

    # Check for duplicate
    existing = await service.get_provider(workspace_id, data.slot, data.provider_name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Provider {data.provider_name} already configured for slot {data.slot}",
        )

    config = await service.create_provider(workspace_id, data.model_dump())
    await db.commit()
    return config


@router.put("/providers/{slot}/{provider_name}", response_model=GTMProviderConfigResponse)
async def update_provider(
    workspace_id: str,
    slot: str,
    provider_name: str,
    data: GTMProviderConfigUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a provider configuration."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = GTMProviderService(db)
    config = await service.update_provider(
        workspace_id, slot, provider_name, data.model_dump(exclude_unset=True),
    )
    if not config:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()
    return config


@router.delete("/providers/{slot}/{provider_name}", status_code=204)
async def delete_provider(
    workspace_id: str,
    slot: str,
    provider_name: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a provider configuration."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = GTMProviderService(db)
    deleted = await service.delete_provider(workspace_id, slot, provider_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()


@router.post("/providers/{slot}/{provider_name}/test", response_model=GTMProviderTestResult)
async def test_provider(
    workspace_id: str,
    slot: str,
    provider_name: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test a provider's connection using stored credentials."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    _ensure_providers_registered()

    service = GTMProviderService(db)
    result = await service.test_provider(workspace_id, slot, provider_name)
    await db.commit()
    return result


class TestCredentialsRequest(BaseModel):
    provider_name: str
    credentials: dict[str, Any]


@router.post("/providers/{slot}/test-credentials", response_model=GTMProviderTestResult)
async def test_credentials(
    workspace_id: str,
    slot: str,
    data: TestCredentialsRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test provider credentials without saving them."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    _ensure_providers_registered()

    provider_name = data.provider_name.lower().strip()
    klass = ProviderRegistry.get_class(slot, provider_name)
    if not klass:
        available = ProviderRegistry.list_available(slot)
        names = [p["name"] for p in available]
        hint = f" Available: {', '.join(names)}" if names else ""
        return GTMProviderTestResult(
            success=False,
            message=f"Unknown provider '{data.provider_name}' for slot '{slot}'.{hint}",
        )

    missing = klass.validate_credentials(data.credentials)
    if missing:
        return GTMProviderTestResult(
            success=False,
            message=f"Missing required credentials: {', '.join(missing)}",
        )

    provider = klass(credentials=data.credentials)
    result = await provider.test_connection()
    return GTMProviderTestResult(**result)


@router.post("/providers/{slot}/set-default")
async def set_default_provider(
    workspace_id: str,
    slot: str,
    data: SetDefaultRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Set a provider as the default for a slot."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = GTMProviderService(db)
    success = await service.set_default(workspace_id, slot, data.provider_name)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()
    return {"success": True}


# =============================================================================
# DASHBOARD ENDPOINTS
# =============================================================================

@router.get("/dashboard/overview", response_model=GTMDashboardOverview)
async def get_dashboard_overview(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard overview KPIs."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMDashboardService(db)
    return await service.get_overview(workspace_id, days=days)


@router.get("/dashboard/funnel", response_model=GTMFunnelResponse)
async def get_dashboard_funnel(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get funnel stage data."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMDashboardService(db)
    stages = await service.get_funnel(workspace_id)
    return {"stages": stages}


@router.get("/dashboard/recent-visitors", response_model=RecentVisitorsResponse)
async def get_recent_visitors(
    workspace_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get recent identified visitors."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMDashboardService(db)
    visitors = await service.get_recent_visitors(workspace_id, limit=limit)
    return {"visitors": visitors}


# =============================================================================
# ICP TEMPLATE ENDPOINTS
# =============================================================================

@router.get("/icp-templates", response_model=list[ICPTemplateResponse])
async def list_icp_templates(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List ICP templates."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    return await service.list_templates(workspace_id)


@router.post("/icp-templates", response_model=ICPTemplateResponse, status_code=201)
async def create_icp_template(
    workspace_id: str,
    data: ICPTemplateCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    template = await service.create_template(
        workspace_id, data.model_dump(), created_by=str(current_user.id),
    )
    await db.commit()
    return template


@router.get("/icp-templates/{template_id}", response_model=ICPTemplateResponse)
async def get_icp_template(
    workspace_id: str,
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    template = await service.get_template(workspace_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="ICP template not found")
    return template


@router.put("/icp-templates/{template_id}", response_model=ICPTemplateResponse)
async def update_icp_template(
    workspace_id: str,
    template_id: str,
    data: ICPTemplateUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    template = await service.update_template(
        workspace_id, template_id, data.model_dump(exclude_unset=True),
    )
    if not template:
        raise HTTPException(status_code=404, detail="ICP template not found")
    await db.commit()
    return template


@router.delete("/icp-templates/{template_id}", status_code=204)
async def delete_icp_template(
    workspace_id: str,
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    deleted = await service.delete_template(workspace_id, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="ICP template not found")
    await db.commit()


# =============================================================================
# VISITOR ENDPOINTS
# =============================================================================

@router.get("/visitors", response_model=VisitorSessionListResponse)
async def list_visitors(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    status: str | None = None,
    utm_source: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List visitor sessions with filters."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = VisitorService(db)
    sessions, total = await service.list_sessions(
        workspace_id, page=page, page_size=page_size,
        status=status, utm_source=utm_source,
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


# =============================================================================
# HELPERS
# =============================================================================

_providers_registered = False

def _ensure_providers_registered():
    """Import all provider modules to trigger registration."""
    global _providers_registered
    if _providers_registered:
        return
    import aexy.integrations.providers.visitor_identification  # noqa: F401
    import aexy.integrations.providers.email_verification  # noqa: F401
    import aexy.integrations.providers.contact_enrichment  # noqa: F401
    import aexy.integrations.providers.linkedin_automation  # noqa: F401
    import aexy.integrations.providers.sms_provider  # noqa: F401
    _providers_registered = True


# =============================================================================
# COMPLIANCE ENDPOINTS
# =============================================================================

@router.get("/compliance/check", response_model=SendPermissionCheck)
async def check_send_permission(
    workspace_id: str,
    email: str = Query(...),
    record_id: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Check if we're allowed to send to this contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    result = await service.check_send_permission(workspace_id, email, record_id=record_id)
    return result


@router.post("/compliance/consent", response_model=ConsentStatusResponse, status_code=201)
async def record_consent(
    workspace_id: str,
    data: RecordConsentRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Record consent for a contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    await service.record_consent(
        workspace_id=workspace_id,
        email=data.email,
        consent_type=data.consent_type.value,
        source=data.consent_source,
        jurisdiction=data.jurisdiction.value,
        record_id=data.record_id,
    )
    await db.commit()
    return await service.get_consent_status(workspace_id, data.email)


@router.get("/compliance/consent/{email}", response_model=ConsentStatusResponse)
async def get_consent_status(
    workspace_id: str,
    email: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get consent status for a contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    return await service.get_consent_status(workspace_id, email)


@router.delete("/compliance/consent/{email}")
async def revoke_consent(
    workspace_id: str,
    email: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoke consent for a contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    revoked = await service.revoke_consent(workspace_id, email)
    if not revoked:
        raise HTTPException(status_code=404, detail="No active consent found for this email")
    await db.commit()
    return {"success": True}


@router.get("/compliance/suppression", response_model=SuppressionListResponse)
async def list_suppression(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List suppression list entries."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    entries, total = await service.list_suppression(workspace_id, page=page, per_page=per_page)
    return {
        "entries": [
            {
                "id": str(e.id),
                "email": e.email,
                "domain": e.domain,
                "reason": e.reason,
                "source": e.source,
                "added_at": e.added_at.isoformat() if e.added_at else None,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/compliance/suppression", status_code=201)
async def add_suppression(
    workspace_id: str,
    data: AddSuppressionRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add an email to the suppression list."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    entry = await service.add_to_suppression(
        workspace_id=workspace_id,
        email=data.email,
        reason=data.reason.value,
        source=data.source,
        added_by=str(current_user.id),
    )
    await db.commit()
    return {
        "id": str(entry.id),
        "email": entry.email,
        "domain": entry.domain,
        "reason": entry.reason,
        "source": entry.source,
    }


@router.delete("/compliance/suppression/{email}")
async def remove_suppression(
    workspace_id: str,
    email: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove an email from the suppression list."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    removed = await service.remove_from_suppression(workspace_id, email)
    if not removed:
        raise HTTPException(status_code=404, detail="Email not found on suppression list")
    await db.commit()
    return {"success": True}


@router.post("/compliance/unsubscribe")
async def process_unsubscribe(
    workspace_id: str,
    data: UnsubscribeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Process an unsubscribe: suppression + consent revocation."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    result = await service.process_unsubscribe(workspace_id, data.email)
    await db.commit()
    return result


@router.post("/compliance/erasure")
async def process_erasure(
    workspace_id: str,
    data: ErasureRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """GDPR right-to-erasure: delete all contact data."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    if not data.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erasure request must have confirm=true. This action is irreversible.",
        )

    service = GTMComplianceService(db)
    result = await service.process_erasure_request(workspace_id, data.email)
    await db.commit()
    return result


@router.get("/compliance/audit", response_model=ComplianceAuditListResponse)
async def list_audit_log(
    workspace_id: str,
    email: str | None = Query(default=None),
    action: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List compliance audit log entries."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    entries, total = await service.list_audit_log(
        workspace_id, email=email, action=action, page=page, per_page=per_page,
    )
    return {
        "entries": [
            {
                "id": str(e.id),
                "email": e.email,
                "action": e.action,
                "reason": e.reason,
                "jurisdiction": e.jurisdiction,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# =============================================================================
# SCORING ENDPOINTS
# =============================================================================

@router.get("/scoring/overview", response_model=ScoringOverviewResponse)
async def get_scoring_overview(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get scoring overview for dashboard."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMScoringService(db)
    return await service.get_scoring_overview(workspace_id)


@router.get("/scoring/leads", response_model=ScoredLeadListResponse)
async def list_scored_leads(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    min_score: int | None = Query(default=None, ge=0, le=100),
    max_score: int | None = Query(default=None, ge=0, le=100),
    lifecycle_stage: str | None = Query(default=None),
    sort_by: Literal["total_score", "firmographic_score", "behavioral_score", "intent_score", "created_at"] = Query(default="total_score"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List scored leads with filters and pagination."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMScoringService(db)
    leads, total = await service.list_scores(
        workspace_id,
        page=page,
        per_page=per_page,
        min_score=min_score,
        max_score=max_score,
        lifecycle_stage=lifecycle_stage,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return {
        "leads": leads,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/scoring/leads/{record_id}", response_model=ScoreDetailResponse)
async def get_lead_score_detail(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed score for a single record."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMScoringService(db)
    detail = await service.get_score_detail(workspace_id, record_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Score not found for this record")
    return detail


# =============================================================================
# DEDUP ENDPOINTS
# =============================================================================

@router.get("/dedup/scan", response_model=list[DuplicateMatch])
async def scan_duplicates(
    workspace_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    record_id: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Scan for duplicate records in the workspace."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = DedupService(db)
    if record_id:
        return await service.find_duplicates(workspace_id, record_id=record_id)
    return await service.bulk_find_duplicates(workspace_id, limit=limit)


@router.post("/dedup/merge", response_model=MergeResult)
async def merge_records(
    workspace_id: str,
    data: MergeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Merge two duplicate records."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = DedupService(db)
    result = await service.merge_records(
        workspace_id,
        primary_id=data.primary_id,
        duplicate_id=data.duplicate_id,
        merge_strategy=data.strategy,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    await db.commit()
    return result


@router.get("/dedup/stats", response_model=DedupStatsResponse)
async def get_dedup_stats(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get dedup statistics for the workspace."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = DedupService(db)
    return await service.get_dedup_stats(workspace_id)


# =============================================================================
# OUTREACH SEQUENCE ENDPOINTS
# =============================================================================

@router.post("/sequences", response_model=SequenceResponse, status_code=201)
async def create_sequence(
    workspace_id: str,
    data: CreateSequenceRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new outreach sequence."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    sequence = await service.create_sequence(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        steps=[s.model_dump() for s in data.steps],
        settings=data.settings.model_dump() if data.settings else {},
        channels=data.channels,
        created_by=current_user.id,
    )
    await db.commit()
    return sequence


@router.get("/sequences", response_model=SequenceListResponse)
async def list_sequences(
    workspace_id: str,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List outreach sequences."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    items, total = await service.list_sequences(workspace_id, status=status, page=page, per_page=per_page)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/sequences/{sequence_id}", response_model=SequenceResponse)
async def get_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get sequence details."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    sequence = await service.get_sequence(workspace_id, sequence_id)
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return sequence


@router.put("/sequences/{sequence_id}", response_model=SequenceResponse)
async def update_sequence(
    workspace_id: str,
    sequence_id: str,
    data: UpdateSequenceRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an outreach sequence."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    kwargs = {}
    if data.name is not None:
        kwargs["name"] = data.name
    if data.description is not None:
        kwargs["description"] = data.description
    if data.steps is not None:
        kwargs["steps"] = [s.model_dump() for s in data.steps]
    if data.settings is not None:
        kwargs["settings"] = data.settings.model_dump()
    if data.channels is not None:
        kwargs["channels"] = data.channels
    sequence = await service.update_sequence(workspace_id, sequence_id, **kwargs)
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    await db.commit()
    return sequence


@router.delete("/sequences/{sequence_id}", status_code=204)
async def delete_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a sequence (must be draft or archived)."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    deleted = await service.delete_sequence(workspace_id, sequence_id)
    if not deleted:
        raise HTTPException(status_code=400, detail="Can only delete draft or archived sequences")
    await db.commit()


@router.post("/sequences/{sequence_id}/activate", response_model=SequenceResponse)
async def activate_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Activate a sequence for enrollments."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    sequence = await service.activate_sequence(workspace_id, sequence_id)
    if not sequence:
        raise HTTPException(status_code=400, detail="Cannot activate sequence — must have steps and be in draft/paused status")
    await db.commit()
    return sequence


@router.post("/sequences/{sequence_id}/pause", response_model=SequenceResponse)
async def pause_sequence(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pause an active sequence and all its enrollments."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = OutreachSequenceService(db)
    sequence = await service.pause_sequence(workspace_id, sequence_id)
    if not sequence:
        raise HTTPException(status_code=400, detail="Sequence is not active")
    await db.commit()
    return sequence


# --- Enrollment Endpoints ---

@router.post("/sequences/{sequence_id}/enroll", response_model=EnrollmentResponse, status_code=201)
async def enroll_contact(
    workspace_id: str,
    sequence_id: str,
    data: EnrollContactRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Enroll a contact in a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    enrollment = await service.enroll_contact(
        workspace_id=workspace_id,
        sequence_id=sequence_id,
        record_id=data.record_id,
        email=data.email,
        contact_name=data.contact_name,
    )
    if isinstance(enrollment, dict) and "error" in enrollment:
        raise HTTPException(status_code=400, detail=enrollment["error"])
    await db.commit()
    return enrollment


@router.post("/sequences/{sequence_id}/bulk-enroll", response_model=BulkEnrollResponse)
async def bulk_enroll(
    workspace_id: str,
    sequence_id: str,
    data: BulkEnrollRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk enroll contacts in a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    result = await service.bulk_enroll(
        workspace_id=workspace_id,
        sequence_id=sequence_id,
        contacts=[c.model_dump() for c in data.contacts],
    )
    await db.commit()
    return result


@router.get("/sequences/{sequence_id}/enrollments", response_model=EnrollmentListResponse)
async def list_enrollments(
    workspace_id: str,
    sequence_id: str,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List enrollments for a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    items, total = await service.list_enrollments(workspace_id, sequence_id, status=status, page=page, per_page=per_page)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.post("/enrollments/{enrollment_id}/pause", status_code=200)
async def pause_enrollment(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pause a single enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    ok = await service.pause_enrollment(workspace_id, enrollment_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot pause enrollment")
    await db.commit()
    return {"success": True}


@router.post("/enrollments/{enrollment_id}/resume", status_code=200)
async def resume_enrollment(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    ok = await service.resume_enrollment(workspace_id, enrollment_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot resume enrollment")
    await db.commit()
    return {"success": True}


@router.delete("/enrollments/{enrollment_id}", status_code=200)
async def unenroll_contact(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unenroll a contact from a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    ok = await service.unenroll_contact(workspace_id, enrollment_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot unenroll contact")
    await db.commit()
    return {"success": True}


@router.get("/enrollments/{enrollment_id}/timeline", response_model=list[StepExecutionResponse])
async def get_enrollment_timeline(
    workspace_id: str,
    enrollment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get step execution timeline for an enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    return await service.get_enrollment_timeline(workspace_id, enrollment_id)


@router.get("/sequences/{sequence_id}/analytics", response_model=SequenceAnalyticsResponse)
async def get_sequence_analytics(
    workspace_id: str,
    sequence_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics for a sequence."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = OutreachSequenceService(db)
    return await service.get_sequence_analytics(workspace_id, sequence_id)


# =============================================================================
# GTM ANALYTICS ENDPOINTS
# =============================================================================

@router.get("/analytics/pipeline", response_model=PipelineAnalyticsResponse)
async def get_pipeline_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get pipeline analytics — lifecycle stage distribution and conversion rates."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_pipeline_analytics(workspace_id, days=days)


@router.get("/analytics/channels", response_model=ChannelAnalyticsResponse)
async def get_channel_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get channel performance analytics — email, LinkedIn, SMS metrics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_channel_analytics(workspace_id, days=days)


@router.get("/analytics/attribution", response_model=AttributionAnalyticsResponse)
async def get_attribution_analytics(
    workspace_id: str,
    model: str = Query(default="linear", pattern="^(first_touch|last_touch|linear|u_shaped|time_decay)$"),
    days: int = Query(default=90, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get multi-touch attribution analytics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_attribution_analytics(workspace_id, model=model, days=days)


@router.get("/analytics/sequences", response_model=SequenceComparisonAnalyticsResponse)
async def get_sequence_comparison_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get sequence comparison analytics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_sequence_analytics(workspace_id, days=days)


@router.get("/analytics/trends", response_model=TrendAnalyticsResponse)
async def get_trend_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get time-series trend analytics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_trend_analytics(workspace_id, days=days)


@router.get("/analytics/weekly-report", response_model=WeeklyReportResponse)
async def get_weekly_report(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest weekly report data."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_weekly_report_data(workspace_id)


# =============================================================================
# REPLY CLASSIFICATION ENDPOINTS
# =============================================================================

@router.post("/replies/classify", response_model=ReplyClassificationResponse)
async def classify_reply(
    workspace_id: str,
    data: ClassifyReplyRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Classify a reply and execute auto-actions."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.reply_classification_service import ReplyClassificationService
    service = ReplyClassificationService(db)
    result = await service.classify_reply(
        workspace_id, data.enrollment_id, data.reply_text, data.reply_from,
    )
    await db.commit()
    return result


@router.post("/replies/{enrollment_id}/action")
async def execute_reply_action(
    workspace_id: str,
    enrollment_id: str,
    category: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually execute a reply action for an enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.reply_classification_service import ReplyClassificationService
    service = ReplyClassificationService(db)
    result = await service.execute_action(workspace_id, enrollment_id, category)
    await db.commit()
    return result


@router.get("/replies/stats", response_model=ReplyClassificationStatsResponse)
async def get_reply_stats(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get reply classification statistics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.reply_classification_service import ReplyClassificationService
    service = ReplyClassificationService(db)
    return await service.get_classification_stats(workspace_id, days=days)


# =============================================================================
# PERSONALIZATION ENDPOINTS
# =============================================================================

@router.post("/sequences/{sequence_id}/personalize")
async def batch_personalize_sequence(
    workspace_id: str,
    sequence_id: str,
    step_index: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger batch personalization for a sequence's enrollments."""
    await check_workspace_permission(workspace_id, current_user, db)

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    wf_id = await dispatch(
        "personalize_outreach_batch",
        {"workspace_id": workspace_id, "sequence_id": sequence_id, "step_index": step_index, "limit": limit},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Batch personalization started"}


@router.get("/sequences/{sequence_id}/enrollments/{enrollment_id}/personalization")
async def get_personalization_preview(
    workspace_id: str,
    sequence_id: str,
    enrollment_id: str,
    step_index: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get personalization preview for a specific enrollment."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.outreach_personalization_service import OutreachPersonalizationService
    service = OutreachPersonalizationService(db)
    return await service.get_personalization_preview(workspace_id, sequence_id, enrollment_id, step_index)


# =============================================================================
# BULK IMPORT ENDPOINTS
# =============================================================================

@router.post("/import", response_model=BulkImportResponse)
async def import_csv_sync(
    workspace_id: str,
    data: BulkImportRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import contacts from CSV synchronously (for small imports <500 rows)."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.bulk_import_service import BulkImportService
    service = BulkImportService(db)
    job = await service.run_import(
        workspace_id=workspace_id,
        csv_content=data.csv_content,
        verify_emails=data.verify_emails,
        skip_duplicates=data.skip_duplicates,
        sequence_id=data.sequence_id,
        object_slug=data.object_slug,
    )
    return service.get_job_summary(job)


@router.post("/import/async", response_model=BulkImportAsyncResponse)
async def import_csv_async(
    workspace_id: str,
    data: BulkImportRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import contacts from CSV asynchronously (for large imports).

    Returns a workflow ID that can be used to check import status.
    """
    await check_workspace_permission(workspace_id, current_user, db)

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    wf_id = await dispatch(
        "run_bulk_import",
        {
            "workspace_id": workspace_id,
            "csv_content": data.csv_content,
            "verify_emails": data.verify_emails,
            "skip_duplicates": data.skip_duplicates,
            "sequence_id": data.sequence_id or "",
            "object_slug": data.object_slug,
        },
        task_queue=TaskQueue.OPERATIONS,
    )
    return BulkImportAsyncResponse(workflow_id=wf_id, message="Import job started")


# =============================================================================
# ALERTS (#32)
# =============================================================================

@router.get("/alerts/configs")
async def list_alert_configs(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_alerts import AlertConfigResponse
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    return await service.list_configs(workspace_id)


@router.post("/alerts/configs")
async def create_alert_config(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_alerts import AlertConfigCreate, AlertConfigResponse
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = AlertConfigCreate(**data)
    service = GTMAlertService(db)
    return await service.create_config(workspace_id, parsed)


@router.put("/alerts/configs/{alert_id}")
async def update_alert_config(
    workspace_id: str,
    alert_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_alerts import AlertConfigUpdate, AlertConfigResponse
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = AlertConfigUpdate(**data)
    service = GTMAlertService(db)
    result = await service.update_config(workspace_id, alert_id, parsed.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
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
    deleted = await service.delete_config(workspace_id, alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/alerts/logs")
async def list_alert_logs(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    event_type: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_alerts import AlertLogListResponse
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    return await service.list_logs(workspace_id, page=page, per_page=per_page, event_type=event_type)


@router.post("/alerts/test/{alert_id}")
async def test_alert_config(
    workspace_id: str,
    alert_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_alerts import EmitEventRequest
    from aexy.services.gtm_alert_service import GTMAlertService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMAlertService(db)
    result = await service.test_alert(workspace_id, alert_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


# =============================================================================
# ROUTING & SLA (#26)
# =============================================================================

@router.get("/routing/rules")
async def list_routing_rules(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_routing import RoutingRuleResponse
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.list_rules(workspace_id)


@router.post("/routing/rules")
async def create_routing_rule(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_routing import RoutingRuleCreate, RoutingRuleResponse
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = RoutingRuleCreate(**data)
    service = LeadRoutingService(db)
    return await service.create_rule(workspace_id, parsed)


@router.put("/routing/rules/{rule_id}")
async def update_routing_rule(
    workspace_id: str,
    rule_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_routing import RoutingRuleUpdate, RoutingRuleResponse
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = RoutingRuleUpdate(**data)
    service = LeadRoutingService(db)
    result = await service.update_rule(workspace_id, rule_id, parsed.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/routing/rules/{rule_id}", status_code=204)
async def delete_routing_rule(
    workspace_id: str,
    rule_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    deleted = await service.delete_rule(workspace_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/routing/route/{record_id}")
async def manual_route_record(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.route_record(workspace_id, record_id)


@router.get("/routing/assignments")
async def list_routing_assignments(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    status: str = None,
    assignee_id: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_routing import LeadAssignmentListResponse
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.list_assignments(workspace_id, page=page, per_page=per_page, status=status, assignee_id=assignee_id)


@router.post("/routing/assignments/{assignment_id}/respond")
async def record_first_response(
    workspace_id: str,
    assignment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    result = await service.record_first_response(workspace_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/routing/assignments/{assignment_id}/reassign")
async def reassign_assignment(
    workspace_id: str,
    assignment_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_routing import ReassignRequest
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = ReassignRequest(**data)
    service = LeadRoutingService(db)
    result = await service.reassign(workspace_id, assignment_id, parsed)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/routing/sla-dashboard")
async def get_sla_dashboard(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_routing import SLADashboardResponse
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.get_sla_dashboard(workspace_id)


# =============================================================================
# HEALTH SCORING (#27)
# =============================================================================

@router.get("/health/dashboard")
async def get_health_dashboard(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_health import HealthDashboardResponse
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.get_dashboard(workspace_id)


@router.get("/health/scores")
async def list_health_scores(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    health_status: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_health import HealthScoreListResponse
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.list_scores(workspace_id, page=page, per_page=per_page, health_status=health_status)


@router.get("/health/scores/{record_id}")
async def get_health_score(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_health import HealthScoreResponse
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    result = await service.get_score(workspace_id, record_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/health/scores/{record_id}/rescore")
async def rescore_customer(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.rescore(workspace_id, record_id)


@router.post("/health/batch-score")
async def batch_score_health(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "run_batch_health_scoring",
        {"workspace_id": workspace_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Batch scoring started"}


@router.get("/health/config")
async def get_health_config(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_health import HealthConfigResponse
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.get_config(workspace_id)


@router.put("/health/config")
async def update_health_config(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_health import HealthConfigUpdate, HealthConfigResponse
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = HealthConfigUpdate(**data)
    service = HealthScoringService(db)
    return await service.update_config(workspace_id, parsed.model_dump(exclude_none=True))


# =============================================================================
# EXPANSION (#28)
# =============================================================================

@router.get("/expansion/playbooks")
async def list_expansion_playbooks(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import PlaybookResponse
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    return await service.list_playbooks(workspace_id)


@router.post("/expansion/playbooks")
async def create_expansion_playbook(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import PlaybookCreate, PlaybookResponse
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = PlaybookCreate(**data)
    service = ExpansionPlaybookService(db)
    return await service.create_playbook(workspace_id, parsed)


@router.get("/expansion/playbooks/{playbook_id}")
async def get_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import PlaybookResponse
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    result = await service.get_playbook(workspace_id, playbook_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/expansion/playbooks/{playbook_id}")
async def update_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import PlaybookUpdate, PlaybookResponse
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = PlaybookUpdate(**data)
    service = ExpansionPlaybookService(db)
    result = await service.update_playbook(workspace_id, playbook_id, parsed.model_dump(exclude_none=True))
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
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    deleted = await service.delete_playbook(workspace_id, playbook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/expansion/playbooks/{playbook_id}/enroll/{record_id}")
async def enroll_in_expansion_playbook(
    workspace_id: str,
    playbook_id: str,
    record_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import EnrollRequest, EnrollmentResponse as ExpEnrollmentResponse
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = EnrollRequest(**data)
    service = ExpansionPlaybookService(db)
    return await service.enroll(workspace_id, playbook_id, record_id, parsed)


@router.get("/expansion/enrollments")
async def list_expansion_enrollments(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    playbook_id: str = None,
    status: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import EnrollmentListResponse as ExpEnrollmentListResponse
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
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    result = await service.advance_step(workspace_id, enrollment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/expansion/enrollments/{enrollment_id}/outcome")
async def record_expansion_outcome(
    workspace_id: str,
    enrollment_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import OutcomeRequest
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = OutcomeRequest(**data)
    service = ExpansionPlaybookService(db)
    result = await service.record_outcome(workspace_id, enrollment_id, parsed)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/expansion/analytics")
async def get_expansion_analytics(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_expansion import PlaybookAnalyticsResponse
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ExpansionPlaybookService(db)
    return await service.get_analytics(workspace_id)


# =============================================================================
# HANDOFFS (#29)
# =============================================================================

@router.post("/handoffs")
async def create_handoff(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_handoff import HandoffCreate, HandoffResponse
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = HandoffCreate(**data)
    service = HandoffService(db)
    return await service.create_handoff(workspace_id, parsed)


@router.get("/handoffs")
async def list_handoffs(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    status: str = None,
    assigned_to: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_handoff import HandoffListResponse
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    return await service.list_handoffs(workspace_id, page=page, per_page=per_page, status=status, assigned_to=assigned_to)


@router.get("/handoffs/analytics")
async def get_handoff_analytics(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_handoff import HandoffAnalyticsResponse
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HandoffService(db)
    return await service.get_analytics(workspace_id)


@router.get("/handoffs/{handoff_id}")
async def get_handoff(
    workspace_id: str,
    handoff_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_handoff import HandoffResponse
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
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_handoff import DeclineRequest
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = DeclineRequest(**data)
    service = HandoffService(db)
    result = await service.decline_handoff(workspace_id, handoff_id, parsed)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/handoffs/{handoff_id}/convert")
async def convert_handoff(
    workspace_id: str,
    handoff_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_handoff import ConvertRequest
    from aexy.services.handoff_service import HandoffService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = ConvertRequest(**data)
    service = HandoffService(db)
    result = await service.convert_to_deal(workspace_id, handoff_id, parsed)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


# =============================================================================
# INTENT SIGNALS (#25)
# =============================================================================

@router.get("/intent/signals")
async def list_intent_signals(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    signal_type: str = None,
    intent_strength: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_intent import IntentSignalListResponse
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.list_signals(workspace_id, page=page, per_page=per_page, signal_type=signal_type, intent_strength=intent_strength)


@router.get("/intent/signals/{signal_id}")
async def get_intent_signal(
    workspace_id: str,
    signal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_intent import IntentSignalResponse
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    result = await service.get_signal(workspace_id, signal_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/intent/signals")
async def create_intent_signal(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_intent import IntentSignalCreate, IntentSignalResponse
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = IntentSignalCreate(**data)
    service = IntentSignalService(db)
    return await service.create_signal(workspace_id, parsed)


@router.post("/intent/signals/{signal_id}/dismiss")
async def dismiss_intent_signal(
    workspace_id: str,
    signal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    result = await service.dismiss_signal(workspace_id, signal_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/intent/records/{record_id}/signals")
async def get_record_intent_signals(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.get_signals_for_record(workspace_id, record_id)


@router.get("/intent/config")
async def get_intent_config(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_intent import IntentConfigResponse
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.get_config(workspace_id)


@router.put("/intent/config")
async def update_intent_config(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_intent import IntentConfigUpdate, IntentConfigResponse
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = IntentConfigUpdate(**data)
    service = IntentSignalService(db)
    return await service.update_config(workspace_id, parsed.model_dump(exclude_none=True))


@router.get("/intent/summary")
async def get_intent_summary(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_intent import IntentSummaryResponse
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.get_summary(workspace_id)


@router.post("/intent/collect")
async def trigger_intent_collection(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "run_intent_signal_collection",
        {"workspace_id": workspace_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Intent collection started"}


# =============================================================================
# COMPETITORS (#31)
# =============================================================================

@router.get("/competitors")
async def list_competitors(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import CompetitorResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    return await service.list_competitors(workspace_id)


@router.post("/competitors")
async def create_competitor(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import CompetitorCreate, CompetitorResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = CompetitorCreate(**data)
    service = CompetitorIntelService(db)
    return await service.create_competitor(workspace_id, parsed)


@router.get("/competitors/changes")
async def list_competitor_changes(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    competitor_id: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import CompetitorChangeListResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    return await service.list_changes(workspace_id, page=page, per_page=per_page, competitor_id=competitor_id)


@router.post("/competitors/changes/{change_id}/acknowledge")
async def acknowledge_competitor_change(
    workspace_id: str,
    change_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    result = await service.acknowledge_change(workspace_id, change_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/competitors/{competitor_id}")
async def get_competitor(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import CompetitorResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    result = await service.get_competitor(workspace_id, competitor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/competitors/{competitor_id}")
async def update_competitor(
    workspace_id: str,
    competitor_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import CompetitorUpdate, CompetitorResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = CompetitorUpdate(**data)
    service = CompetitorIntelService(db)
    result = await service.update_competitor(workspace_id, competitor_id, parsed.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/competitors/{competitor_id}", status_code=204)
async def delete_competitor(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    deleted = await service.delete_competitor(workspace_id, competitor_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/competitors/{competitor_id}/check")
async def manual_competitor_check(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "run_competitor_change_check",
        {"workspace_id": workspace_id, "competitor_id": competitor_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Competitor check started"}


@router.get("/competitors/{competitor_id}/battle-card")
async def get_battle_card(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import BattleCardResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    result = await service.get_battle_card(workspace_id, competitor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/competitors/{competitor_id}/battle-card/generate")
async def generate_battle_card(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "run_battle_card_generation",
        {"workspace_id": workspace_id, "competitor_id": competitor_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Battle card generation started"}


@router.put("/competitors/{competitor_id}/battle-card/{card_id}")
async def update_battle_card(
    workspace_id: str,
    competitor_id: str,
    card_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_competitor import BattleCardUpdate, BattleCardResponse
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = BattleCardUpdate(**data)
    service = CompetitorIntelService(db)
    result = await service.update_battle_card(workspace_id, competitor_id, card_id, parsed.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/competitors/{competitor_id}/battle-card/{card_id}/publish")
async def publish_battle_card(
    workspace_id: str,
    competitor_id: str,
    card_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    result = await service.publish_battle_card(workspace_id, competitor_id, card_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


# =============================================================================
# SEO (#18)
# =============================================================================

@router.post("/seo/audits")
async def create_seo_audit(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_seo import SEOAuditCreate, SEOAuditResponse
    from aexy.services.seo_audit_service import SEOAuditService
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = SEOAuditCreate(**data)
    service = SEOAuditService(db)
    audit = await service.create_audit(workspace_id, parsed)
    wf_id = await dispatch(
        "run_seo_audit",
        {"workspace_id": workspace_id, "audit_id": str(audit.id)},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"audit": audit, "workflow_id": wf_id}


@router.get("/seo/audits")
async def list_seo_audits(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_seo import SEOAuditListResponse
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    return await service.list_audits(workspace_id, page=page, per_page=per_page)


@router.get("/seo/audits/{audit_id}")
async def get_seo_audit(
    workspace_id: str,
    audit_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_seo import SEOAuditResponse
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    result = await service.get_audit(workspace_id, audit_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/seo/audits/{audit_id}/pages")
async def get_seo_audit_pages(
    workspace_id: str,
    audit_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_seo import SEOAuditPageResponse
    from aexy.services.seo_audit_service import SEOAuditService
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    result = await service.get_audit_pages(workspace_id, audit_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/seo/history/{domain}")
async def get_seo_score_history(
    workspace_id: str,
    domain: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_seo import SEOScoreHistoryResponse
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
    await check_workspace_permission(workspace_id, current_user, db)
    service = SEOAuditService(db)
    deleted = await service.delete_audit(workspace_id, audit_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


# =============================================================================
# CONTENT GAP (#19)
# =============================================================================

@router.post("/content-gap/analyses")
async def create_content_gap_analysis(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_content import ContentAnalysisCreate, ContentAnalysisResponse
    from aexy.services.content_gap_service import ContentGapService
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = ContentAnalysisCreate(**data)
    service = ContentGapService(db)
    analysis = await service.create_analysis(workspace_id, parsed)
    wf_id = await dispatch(
        "run_content_gap_analysis",
        {"workspace_id": workspace_id, "analysis_id": str(analysis.id)},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"analysis": analysis, "workflow_id": wf_id}


@router.get("/content-gap/analyses")
async def list_content_gap_analyses(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_content import ContentAnalysisListResponse
    from aexy.services.content_gap_service import ContentGapService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ContentGapService(db)
    return await service.list_analyses(workspace_id, page=page, per_page=per_page)


@router.get("/content-gap/analyses/{analysis_id}")
async def get_content_gap_analysis(
    workspace_id: str,
    analysis_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_content import ContentAnalysisResponse
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
    await check_workspace_permission(workspace_id, current_user, db)
    service = ContentGapService(db)
    deleted = await service.delete_analysis(workspace_id, analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


# =============================================================================
# ABM (#30)
# =============================================================================

@router.get("/abm/lists")
async def list_abm_target_lists(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import TargetListResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.list_target_lists(workspace_id)


@router.post("/abm/lists")
async def create_abm_target_list(
    workspace_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import TargetListCreate, TargetListResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = TargetListCreate(**data)
    service = ABMService(db)
    return await service.create_target_list(workspace_id, parsed)


@router.get("/abm/overview")
async def get_abm_overview(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import ABMOverviewResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.get_overview(workspace_id)


@router.get("/abm/accounts")
async def list_abm_accounts(
    workspace_id: str,
    page: int = 1,
    per_page: int = 50,
    target_list_id: str = None,
    tier: str = None,
    stage: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import ABMAccountListResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.list_accounts(workspace_id, page=page, per_page=per_page, target_list_id=target_list_id, tier=tier, stage=stage)


@router.get("/abm/lists/{list_id}")
async def get_abm_target_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import TargetListResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.get_target_list(workspace_id, list_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/abm/lists/{list_id}")
async def update_abm_target_list(
    workspace_id: str,
    list_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import TargetListUpdate, TargetListResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = TargetListUpdate(**data)
    service = ABMService(db)
    result = await service.update_target_list(workspace_id, list_id, parsed.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/abm/lists/{list_id}", status_code=204)
async def delete_abm_target_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    deleted = await service.delete_target_list(workspace_id, list_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/abm/lists/{list_id}/accounts")
async def add_abm_accounts_to_list(
    workspace_id: str,
    list_id: str,
    data: list,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import ABMAccountCreate
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = [ABMAccountCreate(**item) for item in data]
    service = ABMService(db)
    return await service.add_accounts(workspace_id, list_id, parsed)


@router.post("/abm/lists/{list_id}/refresh")
async def refresh_abm_target_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "run_abm_list_refresh",
        {"workspace_id": workspace_id, "list_id": list_id},
        task_queue=TaskQueue.SYNC,
    )
    return {"workflow_id": wf_id, "message": "List refresh started"}


@router.get("/abm/accounts/{account_id}")
async def get_abm_account(
    workspace_id: str,
    account_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import ABMAccountResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.get_account(workspace_id, account_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/abm/accounts/{account_id}")
async def update_abm_account(
    workspace_id: str,
    account_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import ABMAccountUpdate, ABMAccountResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = ABMAccountUpdate(**data)
    service = ABMService(db)
    result = await service.update_account(workspace_id, account_id, parsed.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/abm/accounts/{account_id}", status_code=204)
async def delete_abm_account(
    workspace_id: str,
    account_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    deleted = await service.remove_account(workspace_id, account_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/abm/accounts/{account_id}/stage")
async def change_abm_account_stage(
    workspace_id: str,
    account_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import StageChangeRequest, ABMAccountResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = StageChangeRequest(**data)
    service = ABMService(db)
    result = await service.change_stage(workspace_id, account_id, parsed)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/abm/accounts/{account_id}/campaign")
async def assign_abm_campaign(
    workspace_id: str,
    account_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import CampaignAssignRequest, ABMAccountResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = CampaignAssignRequest(**data)
    service = ABMService(db)
    result = await service.assign_campaign(workspace_id, account_id, parsed)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/abm/accounts/{account_id}/journey")
async def get_abm_account_journey(
    workspace_id: str,
    account_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.schemas.gtm_abm import AccountJourneyResponse
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.get_account_journey(workspace_id, account_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result
