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
