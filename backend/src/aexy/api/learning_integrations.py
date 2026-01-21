"""Learning integrations API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.learning_integrations import (
    # Enums
    HRProviderTypeEnum,
    LMSProviderTypeEnum,
    IntegrationStatusEnum,
    SCORMVersionEnum,
    SCORMCompletionStatusEnum,
    XAPIVerbTypeEnum,
    CalendarProviderTypeEnum,
    # HR Integration
    HRIntegrationCreate,
    HRIntegrationUpdate,
    HRIntegrationResponse,
    HRIntegrationList,
    HRIntegrationFilter,
    HRSyncLogResponse,
    # LMS Integration
    LMSIntegrationCreate,
    LMSIntegrationUpdate,
    LMSIntegrationResponse,
    LMSIntegrationList,
    LMSIntegrationFilter,
    # SCORM
    SCORMPackageCreate,
    SCORMPackageUpdate,
    SCORMPackageResponse,
    SCORMPackageList,
    SCORMPackageFilter,
    SCORMTrackingUpdate,
    SCORMTrackingResponse,
    SCORMTrackingWithDetails,
    SCORMTrackingList,
    SCORMTrackingFilter,
    # xAPI
    XAPIStatementCreate,
    XAPIStatementResponse,
    XAPIStatementList,
    XAPIStatementFilter,
    # Calendar
    CalendarIntegrationCreate,
    CalendarIntegrationUpdate,
    CalendarIntegrationResponse,
    CalendarIntegrationList,
    CalendarEventCreate,
    CalendarEventResponse,
    # Overview
    IntegrationsOverview,
)
from aexy.services.learning_integrations_service import LearningIntegrationsService

router = APIRouter(prefix="/learning/integrations", tags=["learning-integrations"])


# ==================== Overview ====================

@router.get("/overview", response_model=IntegrationsOverview)
async def get_integrations_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> IntegrationsOverview:
    """Get overview of all learning integrations."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    return await service.get_integrations_overview(
        workspace_id=current_user.current_workspace_id,
    )


# ==================== HR Integrations ====================

@router.post("/hr", response_model=HRIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_hr_integration(
    data: HRIntegrationCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> HRIntegrationResponse:
    """Create a new HR system integration."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    integration = await service.create_hr_integration(
        workspace_id=current_user.current_workspace_id,
        data=data,
        created_by_id=current_user.id,
    )
    return HRIntegrationResponse.model_validate(integration)


@router.get("/hr", response_model=HRIntegrationList)
async def list_hr_integrations(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    provider: HRProviderTypeEnum | None = Query(default=None),
    integration_status: IntegrationStatusEnum | None = Query(default=None, alias="status"),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> HRIntegrationList:
    """List HR integrations."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = HRIntegrationFilter(
        provider=provider,
        status=integration_status,
        is_active=is_active,
    )

    service = LearningIntegrationsService(db)
    integrations, total = await service.list_hr_integrations(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return HRIntegrationList(
        items=[HRIntegrationResponse.model_validate(i) for i in integrations],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.put("/hr/{integration_id}", response_model=HRIntegrationResponse)
async def update_hr_integration(
    integration_id: str,
    data: HRIntegrationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> HRIntegrationResponse:
    """Update an HR integration."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    integration = await service.update_hr_integration(
        integration_id=integration_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
    )

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="HR integration not found",
        )

    return HRIntegrationResponse.model_validate(integration)


@router.delete("/hr/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hr_integration(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> None:
    """Delete an HR integration."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    deleted = await service.delete_hr_integration(
        integration_id=integration_id,
        workspace_id=current_user.current_workspace_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="HR integration not found",
        )


@router.post("/hr/{integration_id}/sync", response_model=HRSyncLogResponse)
async def trigger_hr_sync(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> HRSyncLogResponse:
    """Trigger an HR sync operation."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    try:
        sync_log = await service.trigger_hr_sync(
            integration_id=integration_id,
            workspace_id=current_user.current_workspace_id,
        )
        return HRSyncLogResponse.model_validate(sync_log)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# ==================== LMS Integrations ====================

@router.post("/lms", response_model=LMSIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_lms_integration(
    data: LMSIntegrationCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LMSIntegrationResponse:
    """Create a new LMS integration."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    integration = await service.create_lms_integration(
        workspace_id=current_user.current_workspace_id,
        data=data,
        created_by_id=current_user.id,
    )
    return LMSIntegrationResponse.model_validate(integration)


@router.get("/lms", response_model=LMSIntegrationList)
async def list_lms_integrations(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    provider: LMSProviderTypeEnum | None = Query(default=None),
    scorm_support: bool | None = Query(default=None),
    xapi_support: bool | None = Query(default=None),
    integration_status: IntegrationStatusEnum | None = Query(default=None, alias="status"),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> LMSIntegrationList:
    """List LMS integrations."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = LMSIntegrationFilter(
        provider=provider,
        scorm_support=scorm_support,
        xapi_support=xapi_support,
        status=integration_status,
        is_active=is_active,
    )

    service = LearningIntegrationsService(db)
    integrations, total = await service.list_lms_integrations(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return LMSIntegrationList(
        items=[LMSIntegrationResponse.model_validate(i) for i in integrations],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.put("/lms/{integration_id}", response_model=LMSIntegrationResponse)
async def update_lms_integration(
    integration_id: str,
    data: LMSIntegrationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LMSIntegrationResponse:
    """Update an LMS integration."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    integration = await service.update_lms_integration(
        integration_id=integration_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
    )

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="LMS integration not found",
        )

    return LMSIntegrationResponse.model_validate(integration)


@router.delete("/lms/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lms_integration(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> None:
    """Delete an LMS integration."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    deleted = await service.delete_lms_integration(
        integration_id=integration_id,
        workspace_id=current_user.current_workspace_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="LMS integration not found",
        )


# ==================== SCORM Packages ====================

@router.post("/scorm/packages", response_model=SCORMPackageResponse, status_code=status.HTTP_201_CREATED)
async def create_scorm_package(
    data: SCORMPackageCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> SCORMPackageResponse:
    """Create a new SCORM package."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    package = await service.create_scorm_package(
        workspace_id=current_user.current_workspace_id,
        data=data,
        created_by_id=current_user.id,
    )
    return SCORMPackageResponse.model_validate(package)


@router.get("/scorm/packages", response_model=SCORMPackageList)
async def list_scorm_packages(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    integration_id: str | None = Query(default=None),
    version: SCORMVersionEnum | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> SCORMPackageList:
    """List SCORM packages with statistics."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = SCORMPackageFilter(
        integration_id=integration_id,
        version=version,
        is_active=is_active,
    )

    service = LearningIntegrationsService(db)
    packages, total = await service.list_scorm_packages(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return SCORMPackageList(
        items=packages,  # Already includes stats
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.put("/scorm/packages/{package_id}", response_model=SCORMPackageResponse)
async def update_scorm_package(
    package_id: str,
    data: SCORMPackageUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> SCORMPackageResponse:
    """Update a SCORM package."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    package = await service.update_scorm_package(
        package_id=package_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
    )

    if not package:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SCORM package not found",
        )

    return SCORMPackageResponse.model_validate(package)


@router.delete("/scorm/packages/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scorm_package(
    package_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> None:
    """Delete a SCORM package."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    deleted = await service.delete_scorm_package(
        package_id=package_id,
        workspace_id=current_user.current_workspace_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SCORM package not found",
        )


# ==================== SCORM Tracking ====================

@router.get("/scorm/tracking", response_model=SCORMTrackingList)
async def list_scorm_tracking(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    package_id: str | None = Query(default=None),
    developer_id: str | None = Query(default=None),
    completion_status: SCORMCompletionStatusEnum | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> SCORMTrackingList:
    """List SCORM tracking records."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = SCORMTrackingFilter(
        package_id=package_id,
        developer_id=developer_id,
        completion_status=completion_status,
    )

    service = LearningIntegrationsService(db)
    records, total = await service.list_scorm_tracking(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return SCORMTrackingList(
        items=records,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.post("/scorm/packages/{package_id}/launch", response_model=SCORMTrackingResponse)
async def launch_scorm_package(
    package_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> SCORMTrackingResponse:
    """Launch a SCORM package (get or create tracking record)."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    tracking = await service.get_or_create_scorm_tracking(
        package_id=package_id,
        developer_id=current_user.id,
        workspace_id=current_user.current_workspace_id,
    )
    return SCORMTrackingResponse.model_validate(tracking)


@router.put("/scorm/tracking/{tracking_id}", response_model=SCORMTrackingResponse)
async def update_scorm_tracking(
    tracking_id: str,
    data: SCORMTrackingUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> SCORMTrackingResponse:
    """Update SCORM tracking data."""
    service = LearningIntegrationsService(db)
    tracking = await service.update_scorm_tracking(
        tracking_id=tracking_id,
        data=data,
    )

    if not tracking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SCORM tracking record not found",
        )

    return SCORMTrackingResponse.model_validate(tracking)


# ==================== xAPI Statements ====================

@router.post("/xapi/statements", response_model=XAPIStatementResponse, status_code=status.HTTP_201_CREATED)
async def create_xapi_statement(
    data: XAPIStatementCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> XAPIStatementResponse:
    """Create a new xAPI statement."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    statement = await service.create_xapi_statement(
        workspace_id=current_user.current_workspace_id,
        developer_id=current_user.id,
        data=data,
    )
    return XAPIStatementResponse.model_validate(statement)


@router.get("/xapi/statements", response_model=XAPIStatementList)
async def list_xapi_statements(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    developer_id: str | None = Query(default=None),
    verb_id: str | None = Query(default=None),
    verb_type: XAPIVerbTypeEnum | None = Query(default=None),
    object_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> XAPIStatementList:
    """List xAPI statements."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = XAPIStatementFilter(
        developer_id=developer_id,
        verb_id=verb_id,
        verb_type=verb_type,
        object_id=object_id,
    )

    service = LearningIntegrationsService(db)
    statements, total = await service.list_xapi_statements(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return XAPIStatementList(
        items=[XAPIStatementResponse.model_validate(s) for s in statements],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


# ==================== Calendar Integrations ====================

@router.post("/calendar", response_model=CalendarIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_calendar_integration(
    data: CalendarIntegrationCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CalendarIntegrationResponse:
    """Create a new calendar integration for the current user."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    integration = await service.create_calendar_integration(
        workspace_id=current_user.current_workspace_id,
        developer_id=current_user.id,
        data=data,
    )
    return CalendarIntegrationResponse.model_validate(integration)


@router.get("/calendar", response_model=CalendarIntegrationList)
async def list_calendar_integrations(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> CalendarIntegrationList:
    """List calendar integrations for the current user."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    integrations, total = await service.list_calendar_integrations(
        workspace_id=current_user.current_workspace_id,
        developer_id=current_user.id,
        page=page,
        page_size=page_size,
    )

    return CalendarIntegrationList(
        items=[CalendarIntegrationResponse.model_validate(i) for i in integrations],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.put("/calendar/{integration_id}", response_model=CalendarIntegrationResponse)
async def update_calendar_integration(
    integration_id: str,
    data: CalendarIntegrationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CalendarIntegrationResponse:
    """Update a calendar integration."""
    service = LearningIntegrationsService(db)
    integration = await service.update_calendar_integration(
        integration_id=integration_id,
        developer_id=current_user.id,
        data=data,
    )

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar integration not found",
        )

    return CalendarIntegrationResponse.model_validate(integration)


@router.delete("/calendar/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_integration(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> None:
    """Delete a calendar integration."""
    service = LearningIntegrationsService(db)
    deleted = await service.delete_calendar_integration(
        integration_id=integration_id,
        developer_id=current_user.id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar integration not found",
        )


@router.post("/calendar/{integration_id}/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_calendar_event(
    integration_id: str,
    data: CalendarEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CalendarEventResponse:
    """Create a new calendar event."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningIntegrationsService(db)
    event = await service.create_calendar_event(
        integration_id=integration_id,
        workspace_id=current_user.current_workspace_id,
        developer_id=current_user.id,
        data=data,
    )
    return CalendarEventResponse.model_validate(event)
