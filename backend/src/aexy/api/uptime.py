"""Uptime monitoring API endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.uptime import (
    UptimeMonitorCreate,
    UptimeMonitorUpdate,
    UptimeMonitorResponse,
    UptimeMonitorSummary,
    UptimeCheckResponse,
    UptimeCheckListResponse,
    UptimeIncidentResponse,
    UptimeIncidentWithMonitor,
    UptimeIncidentListResponse,
    UptimeIncidentUpdate,
    UptimeIncidentResolve,
    UptimeMonitorStats,
    WorkspaceUptimeStats,
    TestCheckResponse,
)
from aexy.services.uptime_service import (
    UptimeService,
    MonitorNotFoundError,
    IncidentNotFoundError,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/uptime",
    tags=["Uptime Monitoring"],
)


# =============================================================================
# Helper Functions
# =============================================================================


async def verify_workspace_access(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "viewer",
) -> WorkspaceService:
    """Verify the user has access to the workspace."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{required_role.capitalize()} permission required",
        )

    return workspace_service


def monitor_to_response(monitor) -> UptimeMonitorResponse:
    """Convert UptimeMonitor to response schema."""
    return UptimeMonitorResponse(
        id=str(monitor.id),
        workspace_id=str(monitor.workspace_id),
        name=monitor.name,
        description=monitor.description,
        check_type=monitor.check_type,
        url=monitor.url,
        host=monitor.host,
        port=monitor.port,
        http_method=monitor.http_method,
        expected_status_codes=monitor.expected_status_codes,
        request_headers=monitor.request_headers,
        request_body=monitor.request_body,
        verify_ssl=monitor.verify_ssl,
        follow_redirects=monitor.follow_redirects,
        ws_message=monitor.ws_message,
        ws_expected_response=monitor.ws_expected_response,
        check_interval_seconds=monitor.check_interval_seconds,
        timeout_seconds=monitor.timeout_seconds,
        consecutive_failures_threshold=monitor.consecutive_failures_threshold,
        current_status=monitor.current_status,
        last_check_at=monitor.last_check_at,
        next_check_at=monitor.next_check_at,
        consecutive_failures=monitor.consecutive_failures,
        last_response_time_ms=monitor.last_response_time_ms,
        last_error_message=monitor.last_error_message,
        notification_channels=monitor.notification_channels,
        slack_channel_id=monitor.slack_channel_id,
        webhook_url=monitor.webhook_url,
        notify_on_recovery=monitor.notify_on_recovery,
        team_id=str(monitor.team_id) if monitor.team_id else None,
        is_active=monitor.is_active,
        created_by_id=str(monitor.created_by_id) if monitor.created_by_id else None,
        created_at=monitor.created_at,
        updated_at=monitor.updated_at,
    )


def monitor_to_summary(monitor) -> UptimeMonitorSummary:
    """Convert UptimeMonitor to summary schema."""
    return UptimeMonitorSummary(
        id=str(monitor.id),
        name=monitor.name,
        check_type=monitor.check_type,
        url=monitor.url,
        host=monitor.host,
        port=monitor.port,
        current_status=monitor.current_status,
        last_check_at=monitor.last_check_at,
        last_response_time_ms=monitor.last_response_time_ms,
        consecutive_failures=monitor.consecutive_failures,
        is_active=monitor.is_active,
    )


def check_to_response(check) -> UptimeCheckResponse:
    """Convert UptimeCheck to response schema."""
    return UptimeCheckResponse(
        id=str(check.id),
        monitor_id=str(check.monitor_id),
        is_up=check.is_up,
        status_code=check.status_code,
        response_time_ms=check.response_time_ms,
        error_message=check.error_message,
        error_type=check.error_type,
        ssl_expiry_days=check.ssl_expiry_days,
        ssl_issuer=check.ssl_issuer,
        checked_at=check.checked_at,
    )


def incident_to_response(incident) -> UptimeIncidentResponse:
    """Convert UptimeIncident to response schema."""
    return UptimeIncidentResponse(
        id=str(incident.id),
        monitor_id=str(incident.monitor_id),
        workspace_id=str(incident.workspace_id),
        ticket_id=str(incident.ticket_id) if incident.ticket_id else None,
        status=incident.status,
        started_at=incident.started_at,
        resolved_at=incident.resolved_at,
        first_error_message=incident.first_error_message,
        first_error_type=incident.first_error_type,
        last_error_message=incident.last_error_message,
        last_error_type=incident.last_error_type,
        total_checks=incident.total_checks,
        failed_checks=incident.failed_checks,
        root_cause=incident.root_cause,
        resolution_notes=incident.resolution_notes,
        acknowledged_at=incident.acknowledged_at,
        acknowledged_by_id=str(incident.acknowledged_by_id) if incident.acknowledged_by_id else None,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


def incident_with_monitor(incident) -> UptimeIncidentWithMonitor:
    """Convert UptimeIncident with monitor details."""
    response = UptimeIncidentWithMonitor(
        id=str(incident.id),
        monitor_id=str(incident.monitor_id),
        workspace_id=str(incident.workspace_id),
        ticket_id=str(incident.ticket_id) if incident.ticket_id else None,
        status=incident.status,
        started_at=incident.started_at,
        resolved_at=incident.resolved_at,
        first_error_message=incident.first_error_message,
        first_error_type=incident.first_error_type,
        last_error_message=incident.last_error_message,
        last_error_type=incident.last_error_type,
        total_checks=incident.total_checks,
        failed_checks=incident.failed_checks,
        root_cause=incident.root_cause,
        resolution_notes=incident.resolution_notes,
        acknowledged_at=incident.acknowledged_at,
        acknowledged_by_id=str(incident.acknowledged_by_id) if incident.acknowledged_by_id else None,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )

    if incident.monitor:
        response.monitor_name = incident.monitor.name
        response.monitor_url = incident.monitor.url
        response.monitor_host = incident.monitor.host
        response.monitor_check_type = incident.monitor.check_type

    return response


# =============================================================================
# MONITOR ENDPOINTS
# =============================================================================


@router.get("/monitors", response_model=list[UptimeMonitorSummary])
async def list_monitors(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(False, description="Only return active monitors"),
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List uptime monitors for a workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)
    monitors, total = await service.list_monitors(
        workspace_id,
        active_only=active_only,
        status=status,
        limit=limit,
        offset=offset,
    )

    return [monitor_to_summary(m) for m in monitors]


@router.post("/monitors", response_model=UptimeMonitorResponse, status_code=201)
async def create_monitor(
    workspace_id: str,
    data: UptimeMonitorCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new uptime monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Check for duplicate name
    existing = await service.get_monitor_by_name(workspace_id, data.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Monitor with name '{data.name}' already exists",
        )

    monitor = await service.create_monitor(
        workspace_id,
        data,
        created_by_id=str(current_user.id),
    )

    return monitor_to_response(monitor)


@router.get("/monitors/{monitor_id}", response_model=UptimeMonitorResponse)
async def get_monitor(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific uptime monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)
    monitor = await service.get_monitor(monitor_id)

    if not monitor or str(monitor.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    return monitor_to_response(monitor)


@router.patch("/monitors/{monitor_id}", response_model=UptimeMonitorResponse)
async def update_monitor(
    workspace_id: str,
    monitor_id: str,
    data: UptimeMonitorUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an uptime monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    # Check for duplicate name if name is being changed
    if data.name and data.name != existing.name:
        duplicate = await service.get_monitor_by_name(workspace_id, data.name)
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Monitor with name '{data.name}' already exists",
            )

    try:
        monitor = await service.update_monitor(monitor_id, data)
        return monitor_to_response(monitor)
    except MonitorNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )


@router.delete("/monitors/{monitor_id}", status_code=204)
async def delete_monitor(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an uptime monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    await service.delete_monitor(monitor_id)


@router.post("/monitors/{monitor_id}/pause", response_model=UptimeMonitorResponse)
async def pause_monitor(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Pause an uptime monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    try:
        monitor = await service.pause_monitor(monitor_id)
        return monitor_to_response(monitor)
    except MonitorNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )


@router.post("/monitors/{monitor_id}/resume", response_model=UptimeMonitorResponse)
async def resume_monitor(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused uptime monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    try:
        monitor = await service.resume_monitor(monitor_id)
        return monitor_to_response(monitor)
    except MonitorNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )


@router.post("/monitors/{monitor_id}/test", response_model=TestCheckResponse)
async def test_monitor(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Run an immediate test check (does not record result or trigger incidents)."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    # Run the test check directly (not via Temporal for immediate response)
    from aexy.services.uptime_checker import get_uptime_checker

    checker = get_uptime_checker()
    result = await checker.check(existing)

    return TestCheckResponse(
        is_up=result.is_up,
        status_code=result.status_code,
        response_time_ms=result.response_time_ms,
        error_message=result.error_message,
        error_type=result.error_type,
        ssl_expiry_days=result.ssl_expiry_days,
        ssl_issuer=result.ssl_issuer,
        checked_at=result.checked_at or datetime.now(timezone.utc),
    )


# =============================================================================
# CHECK HISTORY ENDPOINTS
# =============================================================================


@router.get("/monitors/{monitor_id}/checks", response_model=UptimeCheckListResponse)
async def list_checks(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start_time: datetime | None = Query(None, description="Filter checks after this time"),
    end_time: datetime | None = Query(None, description="Filter checks before this time"),
):
    """Get check history for a monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    checks, total = await service.list_checks(
        monitor_id,
        limit=limit,
        offset=offset,
        start_time=start_time,
        end_time=end_time,
    )

    return UptimeCheckListResponse(
        items=[check_to_response(c) for c in checks],
        total=total,
        page=(offset // limit) + 1,
        page_size=limit,
        has_more=(offset + limit) < total,
    )


# =============================================================================
# INCIDENT ENDPOINTS
# =============================================================================


@router.get("/incidents", response_model=UptimeIncidentListResponse)
async def list_incidents(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
    monitor_id: str | None = Query(None, description="Filter by monitor ID"),
    status: str | None = Query(None, description="Filter by status (ongoing, resolved)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List incidents for a workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)
    incidents, total = await service.list_incidents(
        workspace_id,
        monitor_id=monitor_id,
        status=status,
        limit=limit,
        offset=offset,
    )

    return UptimeIncidentListResponse(
        items=[incident_with_monitor(i) for i in incidents],
        total=total,
        page=(offset // limit) + 1,
        page_size=limit,
        has_more=(offset + limit) < total,
    )


@router.get("/incidents/{incident_id}", response_model=UptimeIncidentWithMonitor)
async def get_incident(
    workspace_id: str,
    incident_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific incident."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)
    incident = await service.get_incident(incident_id)

    if not incident or str(incident.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    return incident_with_monitor(incident)


@router.patch("/incidents/{incident_id}", response_model=UptimeIncidentResponse)
async def update_incident(
    workspace_id: str,
    incident_id: str,
    data: UptimeIncidentUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update incident details (root cause, resolution notes)."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify incident exists and belongs to workspace
    existing = await service.get_incident(incident_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    try:
        incident = await service.update_incident(incident_id, data)
        return incident_to_response(incident)
    except IncidentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )


@router.post("/incidents/{incident_id}/resolve", response_model=UptimeIncidentResponse)
async def resolve_incident(
    workspace_id: str,
    incident_id: str,
    data: UptimeIncidentResolve,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually resolve an incident."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify incident exists and belongs to workspace
    existing = await service.get_incident(incident_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    if existing.status == "resolved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incident is already resolved",
        )

    try:
        incident = await service.resolve_incident(
            incident_id,
            data,
            resolved_by_id=str(current_user.id),
        )
        return incident_to_response(incident)
    except IncidentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )


@router.post("/incidents/{incident_id}/acknowledge", response_model=UptimeIncidentResponse)
async def acknowledge_incident(
    workspace_id: str,
    incident_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge an incident."""
    await verify_workspace_access(workspace_id, current_user, db, "editor")

    service = UptimeService(db)

    # Verify incident exists and belongs to workspace
    existing = await service.get_incident(incident_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    if existing.acknowledged_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incident is already acknowledged",
        )

    try:
        incident = await service.acknowledge_incident(
            incident_id,
            acknowledged_by_id=str(current_user.id),
        )
        return incident_to_response(incident)
    except IncidentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )


# =============================================================================
# STATISTICS ENDPOINTS
# =============================================================================


@router.get("/stats", response_model=WorkspaceUptimeStats)
async def get_workspace_stats(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate uptime statistics for the workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)
    return await service.get_workspace_stats(workspace_id)


@router.get("/monitors/{monitor_id}/stats", response_model=UptimeMonitorStats)
async def get_monitor_stats(
    workspace_id: str,
    monitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get statistics for a specific monitor."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = UptimeService(db)

    # Verify monitor exists and belongs to workspace
    existing = await service.get_monitor(monitor_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    stats = await service.get_monitor_stats(monitor_id)
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitor not found",
        )

    return stats
