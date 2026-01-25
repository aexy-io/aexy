"""Email Infrastructure API routes for providers, domains, warming, and pools."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.core.encryption import has_credentials as check_has_credentials
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.provider_service import ProviderService
from aexy.services.domain_service import DomainService
from aexy.services.warming_service import WarmingService
from aexy.services.routing_service import RoutingService
from aexy.services.reputation_service import ReputationService
from aexy.services.workspace_service import WorkspaceService
from aexy.schemas.email_infrastructure import (
    # Provider schemas
    EmailProviderCreate,
    EmailProviderUpdate,
    EmailProviderResponse,
    EmailProviderListResponse,
    ProviderTestRequest,
    ProviderTestResponse,
    # Domain schemas
    SendingDomainCreate,
    SendingDomainUpdate,
    SendingDomainResponse,
    SendingDomainListResponse,
    DomainVerifyResponse,
    StartWarmingRequest,
    WarmingStatusResponse,
    # Identity schemas
    SendingIdentityCreate,
    SendingIdentityUpdate,
    SendingIdentityResponse,
    # Dedicated IP schemas
    DedicatedIPCreate,
    DedicatedIPUpdate,
    DedicatedIPResponse,
    # Warming schedule schemas
    WarmingScheduleCreate,
    WarmingScheduleUpdate,
    WarmingScheduleResponse,
    WarmingProgressResponse,
    WarmingProgressListResponse,
    # Health schemas
    DomainHealthResponse,
    DomainHealthSummary,
    ISPMetricsSummary,
    # Pool schemas
    SendingPoolCreate,
    SendingPoolUpdate,
    SendingPoolResponse,
    SendingPoolListResponse,
    SendingPoolMemberCreate,
    PoolMemberUpdate,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/email-infrastructure")


def provider_to_response(provider) -> dict:
    """Convert provider model to response dict with has_credentials computed."""
    # Check if credentials are configured (handles both encrypted and legacy formats)
    has_creds = check_has_credentials(provider.credentials)

    return {
        "id": str(provider.id),
        "workspace_id": str(provider.workspace_id),
        "name": provider.name,
        "provider_type": provider.provider_type,
        "description": provider.description,
        "status": provider.status,
        "settings": provider.settings or {},
        "max_sends_per_second": provider.max_sends_per_second,
        "max_sends_per_day": provider.max_sends_per_day,
        "current_daily_sends": provider.current_daily_sends or 0,
        "daily_sends_reset_at": provider.daily_sends_reset_at,
        "priority": provider.priority,
        "is_default": provider.is_default,
        "last_check_at": provider.last_check_at,
        "last_check_status": provider.last_check_status,
        "last_error": provider.last_error,
        "created_at": provider.created_at,
        "updated_at": provider.updated_at,
        "has_credentials": has_creds,
    }


def provider_to_list_response(provider) -> dict:
    """Convert provider model to list response dict with has_credentials computed."""
    # Check if credentials are configured (handles both encrypted and legacy formats)
    has_creds = check_has_credentials(provider.credentials)

    return {
        "id": str(provider.id),
        "workspace_id": str(provider.workspace_id),
        "name": provider.name,
        "provider_type": provider.provider_type,
        "status": provider.status,
        "is_default": provider.is_default,
        "priority": provider.priority,
        "current_daily_sends": provider.current_daily_sends or 0,
        "max_sends_per_day": provider.max_sends_per_day,
        "last_check_status": provider.last_check_status,
        "created_at": provider.created_at,
        "has_credentials": has_creds,
    }


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


# =============================================================================
# PROVIDER ROUTES
# =============================================================================

@router.post("/providers", response_model=EmailProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(
    workspace_id: str,
    data: EmailProviderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new email provider."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = ProviderService(db)
    provider = await service.create_provider(workspace_id, data)
    return provider_to_response(provider)


@router.get("/providers", response_model=list[EmailProviderListResponse])
async def list_providers(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List email providers for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = ProviderService(db)
    providers = await service.list_providers(workspace_id)
    return [provider_to_list_response(p) for p in providers]


@router.get("/providers/{provider_id}", response_model=EmailProviderResponse)
async def get_provider(
    workspace_id: str,
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an email provider by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = ProviderService(db)
    provider = await service.get_provider(provider_id, workspace_id)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider not found",
        )
    return provider_to_response(provider)


@router.patch("/providers/{provider_id}", response_model=EmailProviderResponse)
async def update_provider(
    workspace_id: str,
    provider_id: str,
    data: EmailProviderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update an email provider."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = ProviderService(db)
    provider = await service.update_provider(provider_id, workspace_id, data)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider not found",
        )
    return provider_to_response(provider)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    workspace_id: str,
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete an email provider."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = ProviderService(db)
    deleted = await service.delete_provider(provider_id, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider not found",
        )


@router.post("/providers/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    workspace_id: str,
    provider_id: str,
    data: ProviderTestRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Test a provider's connection."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = ProviderService(db)
    result = await service.test_provider(
        provider_id,
        workspace_id,
        to_email=data.to_email if data else None,
    )
    return ProviderTestResponse(
        success=result.get("success", False),
        message=result.get("message", ""),
        message_id=result.get("message_id"),
    )


# =============================================================================
# DOMAIN ROUTES
# =============================================================================

@router.post("/domains", response_model=SendingDomainResponse, status_code=status.HTTP_201_CREATED)
async def create_domain(
    workspace_id: str,
    data: SendingDomainCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new sending domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    domain = await service.create_domain(workspace_id, data)
    return domain


@router.get("/domains", response_model=list[SendingDomainListResponse])
async def list_domains(
    workspace_id: str,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List sending domains for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = DomainService(db)
    domains = await service.list_domains(workspace_id, status=status)
    return domains


@router.get("/domains/{domain_id}", response_model=SendingDomainResponse)
async def get_domain(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a sending domain by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = DomainService(db)
    domain = await service.get_domain(domain_id, workspace_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )
    return domain


@router.patch("/domains/{domain_id}", response_model=SendingDomainResponse)
async def update_domain(
    workspace_id: str,
    domain_id: str,
    data: SendingDomainUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a sending domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    domain = await service.update_domain(domain_id, workspace_id, data)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )
    return domain


@router.delete("/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a sending domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    deleted = await service.delete_domain(domain_id, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )


@router.post("/domains/{domain_id}/verify", response_model=DomainVerifyResponse)
async def verify_domain(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Verify DNS records for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    domain = await service.get_domain(domain_id, workspace_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )

    dns_status = await service.verify_domain_dns(domain_id, workspace_id)

    # Get required records from domain
    required_records = []
    dns_records = domain.dns_records or {}
    for key, record in dns_records.items():
        if isinstance(record, dict) and not record.get("verified"):
            required_records.append({
                "type": record.get("record_type"),
                "name": record.get("name"),
                "value": record.get("value"),
            })

    return DomainVerifyResponse(
        domain_id=domain_id,
        status=domain.status,
        dns_records=dns_status,
        required_records=required_records,
    )


@router.post("/domains/{domain_id}/pause", response_model=SendingDomainResponse)
async def pause_domain(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Pause a sending domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    domain = await service.pause_domain(domain_id, workspace_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )
    return domain


@router.post("/domains/{domain_id}/resume", response_model=SendingDomainResponse)
async def resume_domain(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Resume a paused sending domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    domain = await service.resume_domain(domain_id, workspace_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )
    return domain


# =============================================================================
# WARMING ROUTES
# =============================================================================

@router.post("/domains/{domain_id}/warming/start", response_model=SendingDomainResponse)
async def start_warming(
    workspace_id: str,
    domain_id: str,
    data: StartWarmingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Start warming for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = WarmingService(db)
    try:
        domain = await service.start_domain_warming(
            domain_id,
            workspace_id,
            schedule_id=data.schedule_id,
            schedule_type=data.schedule_type,
        )
        return domain
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/domains/{domain_id}/warming/pause", response_model=SendingDomainResponse)
async def pause_warming(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Pause warming for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = WarmingService(db)
    try:
        domain = await service.pause_domain_warming(domain_id, workspace_id)
        return domain
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/domains/{domain_id}/warming/resume", response_model=SendingDomainResponse)
async def resume_warming(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Resume warming for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = WarmingService(db)
    try:
        domain = await service.resume_domain_warming(domain_id, workspace_id)
        return domain
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/domains/{domain_id}/warming/status", response_model=WarmingStatusResponse)
async def get_warming_status(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get warming status for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = WarmingService(db)
    try:
        status_data = await service.get_warming_status(domain_id, workspace_id)
        return WarmingStatusResponse(**status_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/domains/{domain_id}/warming/progress", response_model=WarmingProgressListResponse)
async def get_warming_progress(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get warming progress history for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    warming_service = WarmingService(db)
    domain_service = DomainService(db)

    domain = await domain_service.get_domain(domain_id, workspace_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )

    try:
        progress = await warming_service.get_warming_progress(domain_id, workspace_id)

        # Get total days from schedule
        total_days = 0
        if domain.warming_schedule_id:
            schedule = await warming_service.get_schedule(domain.warming_schedule_id)
            if schedule and schedule.steps:
                total_days = max(step.get("day", 0) for step in schedule.steps)

        return WarmingProgressListResponse(
            domain_id=domain_id,
            total_days=total_days,
            current_day=domain.warming_day,
            progress=[WarmingProgressResponse.model_validate(p) for p in progress],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# =============================================================================
# HEALTH ROUTES
# =============================================================================

@router.get("/domains/{domain_id}/health", response_model=DomainHealthSummary)
async def get_domain_health(
    workspace_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get health summary for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = ReputationService(db)
    try:
        summary = await service.get_health_summary(domain_id)
        return DomainHealthSummary(**summary)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/domains/{domain_id}/health/history", response_model=list[DomainHealthResponse])
async def get_health_history(
    workspace_id: str,
    domain_id: str,
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get health history for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = ReputationService(db)
    history = await service.get_health_history(domain_id, days=days)
    return [DomainHealthResponse.model_validate(h) for h in history]


@router.get("/domains/{domain_id}/isp-metrics", response_model=ISPMetricsSummary)
async def get_isp_metrics(
    workspace_id: str,
    domain_id: str,
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get ISP-specific metrics for a domain."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = ReputationService(db)
    summary = await service.get_isp_summary(domain_id, days=days)
    return ISPMetricsSummary(**summary)


# =============================================================================
# IDENTITY ROUTES
# =============================================================================

@router.post("/identities", response_model=SendingIdentityResponse, status_code=status.HTTP_201_CREATED)
async def create_identity(
    workspace_id: str,
    data: SendingIdentityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new sending identity."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    try:
        identity = await service.create_identity(workspace_id, data)
        return identity
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/identities", response_model=list[SendingIdentityResponse])
async def list_identities(
    workspace_id: str,
    domain_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List sending identities for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = DomainService(db)
    identities = await service.list_identities(workspace_id, domain_id=domain_id)
    return identities


@router.patch("/identities/{identity_id}", response_model=SendingIdentityResponse)
async def update_identity(
    workspace_id: str,
    identity_id: str,
    data: SendingIdentityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a sending identity."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    identity = await service.update_identity(identity_id, workspace_id, data)
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Identity not found",
        )
    return identity


@router.delete("/identities/{identity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_identity(
    workspace_id: str,
    identity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a sending identity."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = DomainService(db)
    deleted = await service.delete_identity(identity_id, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Identity not found",
        )


# =============================================================================
# WARMING SCHEDULE ROUTES
# =============================================================================

@router.post("/warming-schedules", response_model=WarmingScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_warming_schedule(
    workspace_id: str,
    data: WarmingScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a custom warming schedule."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = WarmingService(db)
    schedule = await service.create_schedule(workspace_id, data)
    return schedule


@router.get("/warming-schedules", response_model=list[WarmingScheduleResponse])
async def list_warming_schedules(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List warming schedules (including system schedules)."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = WarmingService(db)

    # Ensure system schedules exist
    await service.get_or_create_system_schedules()

    schedules = await service.list_schedules(workspace_id)
    return schedules


@router.patch("/warming-schedules/{schedule_id}", response_model=WarmingScheduleResponse)
async def update_warming_schedule(
    workspace_id: str,
    schedule_id: str,
    data: WarmingScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a warming schedule (cannot update system schedules)."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = WarmingService(db)
    schedule = await service.update_schedule(schedule_id, workspace_id, data)
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found or cannot be modified",
        )
    return schedule


@router.delete("/warming-schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_warming_schedule(
    workspace_id: str,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a warming schedule (cannot delete system schedules)."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = WarmingService(db)
    deleted = await service.delete_schedule(schedule_id, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found or cannot be deleted",
        )


# =============================================================================
# POOL ROUTES
# =============================================================================

@router.post("/pools", response_model=SendingPoolResponse, status_code=status.HTTP_201_CREATED)
async def create_pool(
    workspace_id: str,
    data: SendingPoolCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new sending pool."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = RoutingService(db)
    pool = await service.create_pool(
        workspace_id,
        name=data.name,
        description=data.description,
        routing_strategy=data.routing_strategy,
        is_default=data.is_default,
    )

    # Add members if provided
    for member_data in data.members:
        await service.add_domain_to_pool(
            pool.id,
            member_data.domain_id,
            workspace_id,
            weight=member_data.weight,
            priority=member_data.priority,
        )

    # Refresh to get members
    from sqlalchemy import select
    from aexy.models.email_infrastructure import SendingPool
    result = await db.execute(
        select(SendingPool).where(SendingPool.id == pool.id)
    )
    pool = result.scalar_one()

    return pool


@router.get("/pools", response_model=list[SendingPoolListResponse])
async def list_pools(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List sending pools for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from sqlalchemy import select, func
    from aexy.models.email_infrastructure import SendingPool, SendingPoolMember

    result = await db.execute(
        select(
            SendingPool,
            func.count(SendingPoolMember.id).label("member_count"),
        )
        .outerjoin(SendingPoolMember)
        .where(SendingPool.workspace_id == workspace_id)
        .group_by(SendingPool.id)
        .order_by(SendingPool.created_at.asc())
    )

    pools = []
    for row in result.all():
        pool = row[0]
        pool_dict = {
            "id": pool.id,
            "workspace_id": pool.workspace_id,
            "name": pool.name,
            "description": pool.description,
            "is_active": pool.is_active,
            "is_default": pool.is_default,
            "routing_strategy": pool.routing_strategy,
            "member_count": row[1],
            "created_at": pool.created_at,
        }
        pools.append(SendingPoolListResponse(**pool_dict))

    return pools


@router.get("/pools/{pool_id}", response_model=SendingPoolResponse)
async def get_pool(
    workspace_id: str,
    pool_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a sending pool by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.email_infrastructure import SendingPool

    result = await db.execute(
        select(SendingPool)
        .options(selectinload(SendingPool.members))
        .where(
            SendingPool.id == pool_id,
            SendingPool.workspace_id == workspace_id,
        )
    )
    pool = result.scalar_one_or_none()

    if not pool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pool not found",
        )
    return pool


@router.post("/pools/{pool_id}/members", status_code=status.HTTP_201_CREATED)
async def add_pool_member(
    workspace_id: str,
    pool_id: str,
    data: SendingPoolMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Add a domain to a sending pool."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = RoutingService(db)
    try:
        member = await service.add_domain_to_pool(
            pool_id,
            data.domain_id,
            workspace_id,
            weight=data.weight,
            priority=data.priority,
        )
        return {"id": member.id, "message": "Domain added to pool"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/pools/{pool_id}/members/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_pool_member(
    workspace_id: str,
    pool_id: str,
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Remove a domain from a sending pool."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = RoutingService(db)
    removed = await service.remove_domain_from_pool(pool_id, domain_id, workspace_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pool or domain not found",
        )
