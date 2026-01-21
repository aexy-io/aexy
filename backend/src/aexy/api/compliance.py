"""Compliance and certification API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.schemas.compliance import (
    AppliesToEnum,
    AssignmentStatusEnum,
    AuditActionTypeEnum,
    AuditLogFilter,
    AuditLogList,
    CertificationCreate,
    CertificationList,
    CertificationResponse,
    CertificationStatusEnum,
    CertificationUpdate,
    CertificationWithStats,
    ComplianceOverview,
    DeveloperCertificationCreate,
    DeveloperCertificationFilter,
    DeveloperCertificationList,
    DeveloperCertificationRenew,
    DeveloperCertificationResponse,
    DeveloperCertificationUpdate,
    DeveloperCertificationVerify,
    DeveloperCertificationWithDetails,
    DeveloperComplianceStatus,
    ExpiringCertificationsReport,
    LearningAuditLogResponse,
    LearningAuditLogWithActor,
    MandatoryTrainingCreate,
    MandatoryTrainingList,
    MandatoryTrainingResponse,
    MandatoryTrainingUpdate,
    MandatoryTrainingWithStats,
    OverdueReport,
    TrainingAssignmentBulkCreate,
    TrainingAssignmentComplete,
    TrainingAssignmentCreate,
    TrainingAssignmentFilter,
    TrainingAssignmentList,
    TrainingAssignmentResponse,
    TrainingAssignmentUpdate,
    TrainingAssignmentWaive,
    TrainingAssignmentWithDetails,
)
from aexy.services.compliance_service import ComplianceService

router = APIRouter(prefix="/compliance")


# ==================== Mandatory Training Endpoints ====================


@router.post(
    "/mandatory-training",
    response_model=MandatoryTrainingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_mandatory_training(
    data: MandatoryTrainingCreate,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a new mandatory training requirement.

    Args:
        data: Mandatory training data.
        workspace_id: Workspace UUID.
        developer_id: Creator's developer UUID.
        db: Database session.

    Returns:
        Created mandatory training.
    """
    service = ComplianceService(db)
    training = await service.create_mandatory_training(workspace_id, data, developer_id)
    return MandatoryTrainingResponse.model_validate(training)


@router.get("/mandatory-training", response_model=MandatoryTrainingList)
async def list_mandatory_trainings(
    workspace_id: str,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List mandatory trainings with completion statistics.

    Args:
        workspace_id: Workspace UUID.
        is_active: Filter by active status.
        page: Page number.
        page_size: Items per page.
        db: Database session.

    Returns:
        Paginated list of mandatory trainings with stats.
    """
    service = ComplianceService(db)
    trainings, total = await service.list_mandatory_trainings(
        workspace_id=workspace_id,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )

    return MandatoryTrainingList(
        items=trainings,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get(
    "/mandatory-training/{training_id}",
    response_model=MandatoryTrainingWithStats,
)
async def get_mandatory_training(
    training_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific mandatory training with stats.

    Args:
        training_id: Training UUID.
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Mandatory training with completion stats.
    """
    service = ComplianceService(db)
    training = await service.get_mandatory_training(training_id, workspace_id)

    if not training:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mandatory training not found",
        )

    stats = await service._get_training_stats(training)
    return stats


@router.patch(
    "/mandatory-training/{training_id}",
    response_model=MandatoryTrainingResponse,
)
async def update_mandatory_training(
    training_id: str,
    data: MandatoryTrainingUpdate,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Update a mandatory training.

    Args:
        training_id: Training UUID.
        data: Update data.
        workspace_id: Workspace UUID.
        developer_id: Actor's developer UUID.
        db: Database session.

    Returns:
        Updated mandatory training.
    """
    service = ComplianceService(db)
    training = await service.update_mandatory_training(
        training_id, workspace_id, data, developer_id
    )

    if not training:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mandatory training not found",
        )

    return MandatoryTrainingResponse.model_validate(training)


@router.delete(
    "/mandatory-training/{training_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_mandatory_training(
    training_id: str,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete (deactivate) a mandatory training.

    Args:
        training_id: Training UUID.
        workspace_id: Workspace UUID.
        developer_id: Actor's developer UUID.
        db: Database session.
    """
    service = ComplianceService(db)
    deleted = await service.delete_mandatory_training(
        training_id, workspace_id, developer_id
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mandatory training not found",
        )


# ==================== Training Assignment Endpoints ====================


@router.post(
    "/assignments",
    response_model=TrainingAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment(
    data: TrainingAssignmentCreate,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a single training assignment.

    Args:
        data: Assignment data.
        workspace_id: Workspace UUID.
        developer_id: Actor's developer UUID.
        db: Database session.

    Returns:
        Created assignment.
    """
    service = ComplianceService(db)
    assignment = await service.create_assignment(workspace_id, data, developer_id)
    return TrainingAssignmentResponse.model_validate(assignment)


@router.post(
    "/assignments/bulk",
    response_model=list[TrainingAssignmentResponse],
    status_code=status.HTTP_201_CREATED,
)
async def bulk_create_assignments(
    data: TrainingAssignmentBulkCreate,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple training assignments.

    Args:
        data: Bulk assignment data.
        workspace_id: Workspace UUID.
        developer_id: Actor's developer UUID.
        db: Database session.

    Returns:
        List of created assignments.
    """
    service = ComplianceService(db)
    try:
        assignments = await service.bulk_create_assignments(
            workspace_id, data, developer_id
        )
        return [TrainingAssignmentResponse.model_validate(a) for a in assignments]
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/assignments", response_model=TrainingAssignmentList)
async def list_assignments(
    workspace_id: str,
    mandatory_training_id: str | None = None,
    developer_id: str | None = None,
    assignment_status: AssignmentStatusEnum | None = Query(None, alias="status"),
    is_overdue: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List training assignments with filters.

    Args:
        workspace_id: Workspace UUID.
        mandatory_training_id: Filter by training.
        developer_id: Filter by developer.
        assignment_status: Filter by status.
        is_overdue: Filter overdue assignments.
        page: Page number.
        page_size: Items per page.
        db: Database session.

    Returns:
        Paginated list of assignments with details.
    """
    service = ComplianceService(db)

    filters = TrainingAssignmentFilter(
        mandatory_training_id=mandatory_training_id,
        developer_id=developer_id,
        status=assignment_status,
        is_overdue=is_overdue,
    )

    assignments, total = await service.list_assignments(
        workspace_id=workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return TrainingAssignmentList(
        items=assignments,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get(
    "/assignments/{assignment_id}",
    response_model=TrainingAssignmentWithDetails,
)
async def get_assignment(
    assignment_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific training assignment.

    Args:
        assignment_id: Assignment UUID.
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Assignment with details.
    """
    service = ComplianceService(db)

    # Get the assignment with relationships
    filters = TrainingAssignmentFilter()
    assignments, _ = await service.list_assignments(
        workspace_id=workspace_id,
        filters=filters,
        page=1,
        page_size=1,
    )

    # Find the specific assignment
    assignment = await service.get_assignment(assignment_id, workspace_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    # Build detailed response
    from datetime import timezone

    now = datetime.now(timezone.utc)
    days_until_due = (assignment.due_date - now).days if assignment.due_date else None
    is_overdue = (
        assignment.due_date < now and assignment.status not in ["completed", "waived"]
    ) if assignment.due_date else False

    return TrainingAssignmentWithDetails(
        id=assignment.id,
        mandatory_training_id=assignment.mandatory_training_id,
        developer_id=assignment.developer_id,
        workspace_id=assignment.workspace_id,
        due_date=assignment.due_date,
        status=assignment.status,
        progress_percentage=assignment.progress_percentage,
        started_at=assignment.started_at,
        completed_at=assignment.completed_at,
        acknowledged_at=assignment.acknowledged_at,
        waived_by_id=assignment.waived_by_id,
        waived_at=assignment.waived_at,
        waiver_reason=assignment.waiver_reason,
        extra_data=assignment.extra_data,
        reminder_sent_at=assignment.reminder_sent_at,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        training_name=assignment.mandatory_training.name if assignment.mandatory_training else "",
        training_description=assignment.mandatory_training.description if assignment.mandatory_training else None,
        developer_name=assignment.developer.name if assignment.developer else "",
        developer_email=assignment.developer.email if assignment.developer else "",
        learning_path_id=assignment.mandatory_training.learning_path_id if assignment.mandatory_training else None,
        days_until_due=days_until_due,
        is_overdue=is_overdue,
    )


@router.patch(
    "/assignments/{assignment_id}",
    response_model=TrainingAssignmentResponse,
)
async def update_assignment(
    assignment_id: str,
    data: TrainingAssignmentUpdate,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Update a training assignment.

    Args:
        assignment_id: Assignment UUID.
        data: Update data.
        workspace_id: Workspace UUID.
        developer_id: Actor's developer UUID.
        db: Database session.

    Returns:
        Updated assignment.
    """
    service = ComplianceService(db)
    assignment = await service.update_assignment(
        assignment_id, workspace_id, data, developer_id
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    return TrainingAssignmentResponse.model_validate(assignment)


@router.post(
    "/assignments/{assignment_id}/acknowledge",
    response_model=TrainingAssignmentResponse,
)
async def acknowledge_assignment(
    assignment_id: str,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Developer acknowledges a training assignment.

    Args:
        assignment_id: Assignment UUID.
        workspace_id: Workspace UUID.
        developer_id: Developer's UUID.
        db: Database session.

    Returns:
        Acknowledged assignment.
    """
    service = ComplianceService(db)
    assignment = await service.acknowledge_assignment(
        assignment_id, developer_id, workspace_id
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or unauthorized",
        )

    return TrainingAssignmentResponse.model_validate(assignment)


@router.post(
    "/assignments/{assignment_id}/start",
    response_model=TrainingAssignmentResponse,
)
async def start_assignment(
    assignment_id: str,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Developer starts a training assignment.

    Args:
        assignment_id: Assignment UUID.
        workspace_id: Workspace UUID.
        developer_id: Developer's UUID.
        db: Database session.

    Returns:
        Started assignment.
    """
    service = ComplianceService(db)
    assignment = await service.start_assignment(
        assignment_id, developer_id, workspace_id
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or unauthorized",
        )

    return TrainingAssignmentResponse.model_validate(assignment)


@router.post(
    "/assignments/{assignment_id}/complete",
    response_model=TrainingAssignmentResponse,
)
async def complete_assignment(
    assignment_id: str,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Developer completes a training assignment.

    Args:
        assignment_id: Assignment UUID.
        workspace_id: Workspace UUID.
        developer_id: Developer's UUID.
        db: Database session.

    Returns:
        Completed assignment.
    """
    service = ComplianceService(db)
    assignment = await service.complete_assignment(
        assignment_id, developer_id, workspace_id
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or unauthorized",
        )

    return TrainingAssignmentResponse.model_validate(assignment)


@router.post(
    "/assignments/{assignment_id}/waive",
    response_model=TrainingAssignmentResponse,
)
async def waive_assignment(
    assignment_id: str,
    data: TrainingAssignmentWaive,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Manager waives a training assignment.

    Args:
        assignment_id: Assignment UUID.
        data: Waiver data with reason.
        workspace_id: Workspace UUID.
        developer_id: Manager's developer UUID.
        db: Database session.

    Returns:
        Waived assignment.
    """
    service = ComplianceService(db)
    assignment = await service.waive_assignment(
        assignment_id, workspace_id, data, developer_id
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    return TrainingAssignmentResponse.model_validate(assignment)


# ==================== Certification Endpoints ====================


@router.post(
    "/certifications",
    response_model=CertificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_certification(
    data: CertificationCreate,
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a new certification definition.

    Args:
        data: Certification data.
        workspace_id: Workspace UUID.
        developer_id: Creator's developer UUID.
        db: Database session.

    Returns:
        Created certification.
    """
    service = ComplianceService(db)
    certification = await service.create_certification(
        workspace_id, data, developer_id
    )
    return CertificationResponse.model_validate(certification)


@router.get("/certifications", response_model=CertificationList)
async def list_certifications(
    workspace_id: str,
    is_active: bool | None = None,
    category: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List certifications with holder statistics.

    Args:
        workspace_id: Workspace UUID.
        is_active: Filter by active status.
        category: Filter by category.
        page: Page number.
        page_size: Items per page.
        db: Database session.

    Returns:
        Paginated list of certifications with stats.
    """
    service = ComplianceService(db)
    certifications, total = await service.list_certifications(
        workspace_id=workspace_id,
        is_active=is_active,
        category=category,
        page=page,
        page_size=page_size,
    )

    # Build stats for each certification
    items_with_stats = []
    for cert in certifications:
        dev_certs = cert.developer_certifications
        total_holders = len(dev_certs)
        active_holders = sum(1 for dc in dev_certs if dc.status == "active")
        expiring_soon = sum(1 for dc in dev_certs if dc.status == "expiring_soon")
        expired = sum(1 for dc in dev_certs if dc.status == "expired")

        items_with_stats.append(CertificationWithStats(
            id=cert.id,
            workspace_id=cert.workspace_id,
            name=cert.name,
            description=cert.description,
            issuing_authority=cert.issuing_authority,
            validity_months=cert.validity_months,
            renewal_required=cert.renewal_required,
            category=cert.category,
            skill_tags=cert.skill_tags,
            prerequisites=cert.prerequisites,
            is_required=cert.is_required,
            external_url=cert.external_url,
            logo_url=cert.logo_url,
            extra_data=cert.extra_data,
            is_active=cert.is_active,
            created_at=cert.created_at,
            updated_at=cert.updated_at,
            created_by_id=cert.created_by_id,
            total_holders=total_holders,
            active_holders=active_holders,
            expiring_soon_count=expiring_soon,
            expired_count=expired,
        ))

    return CertificationList(
        items=items_with_stats,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get(
    "/certifications/{certification_id}",
    response_model=CertificationWithStats,
)
async def get_certification(
    certification_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific certification with stats.

    Args:
        certification_id: Certification UUID.
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Certification with holder stats.
    """
    service = ComplianceService(db)
    cert = await service.get_certification(certification_id, workspace_id)

    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certification not found",
        )

    dev_certs = cert.developer_certifications
    total_holders = len(dev_certs)
    active_holders = sum(1 for dc in dev_certs if dc.status == "active")
    expiring_soon = sum(1 for dc in dev_certs if dc.status == "expiring_soon")
    expired = sum(1 for dc in dev_certs if dc.status == "expired")

    return CertificationWithStats(
        id=cert.id,
        workspace_id=cert.workspace_id,
        name=cert.name,
        description=cert.description,
        issuing_authority=cert.issuing_authority,
        validity_months=cert.validity_months,
        renewal_required=cert.renewal_required,
        category=cert.category,
        skill_tags=cert.skill_tags,
        prerequisites=cert.prerequisites,
        is_required=cert.is_required,
        external_url=cert.external_url,
        logo_url=cert.logo_url,
        extra_data=cert.extra_data,
        is_active=cert.is_active,
        created_at=cert.created_at,
        updated_at=cert.updated_at,
        created_by_id=cert.created_by_id,
        total_holders=total_holders,
        active_holders=active_holders,
        expiring_soon_count=expiring_soon,
        expired_count=expired,
    )


@router.patch(
    "/certifications/{certification_id}",
    response_model=CertificationResponse,
)
async def update_certification(
    certification_id: str,
    data: CertificationUpdate,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Update a certification.

    Args:
        certification_id: Certification UUID.
        data: Update data.
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Updated certification.
    """
    service = ComplianceService(db)
    certification = await service.update_certification(
        certification_id, workspace_id, data
    )

    if not certification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certification not found",
        )

    return CertificationResponse.model_validate(certification)


# ==================== Developer Certification Endpoints ====================


@router.post(
    "/developer-certifications",
    response_model=DeveloperCertificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_developer_certification(
    data: DeveloperCertificationCreate,
    workspace_id: str,
    actor_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Add a certification to a developer.

    Args:
        data: Developer certification data.
        workspace_id: Workspace UUID.
        actor_id: Actor's developer UUID.
        db: Database session.

    Returns:
        Created developer certification.
    """
    service = ComplianceService(db)
    dev_cert = await service.add_developer_certification(workspace_id, data, actor_id)
    return DeveloperCertificationResponse.model_validate(dev_cert)


@router.get("/developer-certifications", response_model=DeveloperCertificationList)
async def list_developer_certifications(
    workspace_id: str,
    certification_id: str | None = None,
    developer_id: str | None = None,
    cert_status: CertificationStatusEnum | None = Query(None, alias="status"),
    is_expiring_soon: bool | None = None,
    is_expired: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List developer certifications with filters.

    Args:
        workspace_id: Workspace UUID.
        certification_id: Filter by certification.
        developer_id: Filter by developer.
        cert_status: Filter by status.
        is_expiring_soon: Filter expiring soon.
        is_expired: Filter expired.
        page: Page number.
        page_size: Items per page.
        db: Database session.

    Returns:
        Paginated list of developer certifications.
    """
    service = ComplianceService(db)

    filters = DeveloperCertificationFilter(
        certification_id=certification_id,
        developer_id=developer_id,
        status=cert_status,
        is_expiring_soon=is_expiring_soon,
        is_expired=is_expired,
    )

    dev_certs, total = await service.list_developer_certifications(
        workspace_id=workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return DeveloperCertificationList(
        items=dev_certs,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get(
    "/developer-certifications/{dev_cert_id}",
    response_model=DeveloperCertificationWithDetails,
)
async def get_developer_certification(
    dev_cert_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific developer certification.

    Args:
        dev_cert_id: Developer certification UUID.
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Developer certification with details.
    """
    service = ComplianceService(db)
    dev_cert = await service.get_developer_certification(dev_cert_id, workspace_id)

    if not dev_cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer certification not found",
        )

    # Build detailed response
    from datetime import timezone

    now = datetime.now(timezone.utc)
    days_until_expiry = (dev_cert.expiry_date - now).days if dev_cert.expiry_date else None
    is_expired = dev_cert.status == "expired"
    is_expiring_soon = dev_cert.status == "expiring_soon"

    return DeveloperCertificationWithDetails(
        id=dev_cert.id,
        developer_id=dev_cert.developer_id,
        certification_id=dev_cert.certification_id,
        workspace_id=dev_cert.workspace_id,
        issued_date=dev_cert.issued_date,
        expiry_date=dev_cert.expiry_date,
        status=dev_cert.status,
        credential_id=dev_cert.credential_id,
        verification_url=dev_cert.verification_url,
        certificate_url=dev_cert.certificate_url,
        verified_at=dev_cert.verified_at,
        verified_by_id=dev_cert.verified_by_id,
        score=dev_cert.score,
        extra_data=dev_cert.extra_data,
        notes=dev_cert.notes,
        renewal_reminder_sent_at=dev_cert.renewal_reminder_sent_at,
        created_at=dev_cert.created_at,
        updated_at=dev_cert.updated_at,
        certification_name=dev_cert.certification.name if dev_cert.certification else "",
        certification_issuing_authority=dev_cert.certification.issuing_authority if dev_cert.certification else "",
        developer_name=dev_cert.developer.name if dev_cert.developer else "",
        developer_email=dev_cert.developer.email if dev_cert.developer else "",
        days_until_expiry=days_until_expiry,
        is_expired=is_expired,
        is_expiring_soon=is_expiring_soon,
    )


@router.patch(
    "/developer-certifications/{dev_cert_id}",
    response_model=DeveloperCertificationResponse,
)
async def update_developer_certification(
    dev_cert_id: str,
    data: DeveloperCertificationUpdate,
    workspace_id: str,
    actor_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Update a developer certification.

    Args:
        dev_cert_id: Developer certification UUID.
        data: Update data.
        workspace_id: Workspace UUID.
        actor_id: Actor's developer UUID.
        db: Database session.

    Returns:
        Updated developer certification.
    """
    service = ComplianceService(db)
    dev_cert = await service.update_developer_certification(
        dev_cert_id, workspace_id, data, actor_id
    )

    if not dev_cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer certification not found",
        )

    return DeveloperCertificationResponse.model_validate(dev_cert)


@router.post(
    "/developer-certifications/{dev_cert_id}/verify",
    response_model=DeveloperCertificationResponse,
)
async def verify_developer_certification(
    dev_cert_id: str,
    data: DeveloperCertificationVerify | None = None,
    workspace_id: str = "",
    developer_id: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Verify a developer certification.

    Args:
        dev_cert_id: Developer certification UUID.
        data: Verification data.
        workspace_id: Workspace UUID.
        developer_id: Verifier's developer UUID.
        db: Database session.

    Returns:
        Verified developer certification.
    """
    service = ComplianceService(db)
    dev_cert = await service.verify_developer_certification(
        dev_cert_id,
        workspace_id,
        developer_id,
        data.verification_url if data else None,
    )

    if not dev_cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer certification not found",
        )

    return DeveloperCertificationResponse.model_validate(dev_cert)


@router.post(
    "/developer-certifications/{dev_cert_id}/renew",
    response_model=DeveloperCertificationResponse,
)
async def renew_developer_certification(
    dev_cert_id: str,
    data: DeveloperCertificationRenew,
    workspace_id: str,
    actor_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Renew a developer certification.

    Args:
        dev_cert_id: Developer certification UUID.
        data: Renewal data.
        workspace_id: Workspace UUID.
        actor_id: Actor's developer UUID.
        db: Database session.

    Returns:
        Renewed developer certification.
    """
    service = ComplianceService(db)
    dev_cert = await service.renew_developer_certification(
        dev_cert_id, workspace_id, data, actor_id
    )

    if not dev_cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer certification not found",
        )

    return DeveloperCertificationResponse.model_validate(dev_cert)


@router.post(
    "/developer-certifications/{dev_cert_id}/revoke",
    response_model=DeveloperCertificationResponse,
)
async def revoke_developer_certification(
    dev_cert_id: str,
    workspace_id: str,
    actor_id: str,
    reason: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Revoke a developer certification.

    Args:
        dev_cert_id: Developer certification UUID.
        workspace_id: Workspace UUID.
        actor_id: Actor's developer UUID.
        reason: Revocation reason.
        db: Database session.

    Returns:
        Revoked developer certification.
    """
    service = ComplianceService(db)
    dev_cert = await service.revoke_developer_certification(
        dev_cert_id, workspace_id, actor_id, reason
    )

    if not dev_cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer certification not found",
        )

    return DeveloperCertificationResponse.model_validate(dev_cert)


# ==================== Report Endpoints ====================


@router.get("/reports/overview", response_model=ComplianceOverview)
async def get_compliance_overview(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get overall compliance overview for a workspace.

    Args:
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Compliance overview with statistics.
    """
    service = ComplianceService(db)
    return await service.get_compliance_overview(workspace_id)


@router.get(
    "/reports/developer/{developer_id}",
    response_model=DeveloperComplianceStatus,
)
async def get_developer_compliance_status(
    developer_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get compliance status for a specific developer.

    Args:
        developer_id: Developer UUID.
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Developer compliance status.
    """
    service = ComplianceService(db)
    try:
        return await service.get_developer_compliance_status(developer_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/reports/overdue", response_model=OverdueReport)
async def get_overdue_report(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get report of overdue training assignments.

    Args:
        workspace_id: Workspace UUID.
        db: Database session.

    Returns:
        Overdue assignments report.
    """
    service = ComplianceService(db)
    return await service.get_overdue_report(workspace_id)


@router.get("/reports/expiring-certifications", response_model=ExpiringCertificationsReport)
async def get_expiring_certifications_report(
    workspace_id: str,
    days_ahead: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Get report of expiring certifications.

    Args:
        workspace_id: Workspace UUID.
        days_ahead: Days to look ahead.
        db: Database session.

    Returns:
        Expiring certifications report.
    """
    service = ComplianceService(db)
    return await service.get_expiring_certifications_report(workspace_id, days_ahead)


# ==================== Audit Log Endpoints ====================


@router.get("/audit-logs", response_model=AuditLogList)
async def list_audit_logs(
    workspace_id: str,
    action_type: AuditActionTypeEnum | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    actor_id: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List audit logs with filters.

    Args:
        workspace_id: Workspace UUID.
        action_type: Filter by action type.
        target_type: Filter by target type.
        target_id: Filter by target ID.
        actor_id: Filter by actor.
        from_date: Filter from date.
        to_date: Filter to date.
        page: Page number.
        page_size: Items per page.
        db: Database session.

    Returns:
        Paginated list of audit logs.
    """
    service = ComplianceService(db)

    filters = AuditLogFilter(
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        actor_id=actor_id,
        from_date=from_date,
        to_date=to_date,
    )

    logs, total = await service.list_audit_logs(
        workspace_id=workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    # Build response with actor details
    items = [
        LearningAuditLogWithActor(
            id=log.id,
            workspace_id=log.workspace_id,
            actor_id=log.actor_id,
            action_type=log.action_type,
            target_type=log.target_type,
            target_id=log.target_id,
            old_value=log.old_value,
            new_value=log.new_value,
            description=log.description,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            extra_data=log.extra_data,
            created_at=log.created_at,
            actor_name=log.actor.name if log.actor else "",
            actor_email=log.actor.email if log.actor else "",
        )
        for log in logs
    ]

    return AuditLogList(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )
