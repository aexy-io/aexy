"""Compliance and certification service."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.compliance import (
    AssignmentStatus,
    AuditActionType,
    Certification,
    CertificationStatus,
    DeveloperCertification,
    LearningAuditLog,
    MandatoryTraining,
    TrainingAssignment,
)
from aexy.models.developer import Developer
from aexy.schemas.compliance import (
    AuditLogFilter,
    CertificationCreate,
    CertificationUpdate,
    ComplianceOverview,
    DeveloperCertificationCreate,
    DeveloperCertificationFilter,
    DeveloperCertificationRenew,
    DeveloperCertificationUpdate,
    DeveloperCertificationWithDetails,
    DeveloperComplianceStatus,
    ExpiringCertificationsReport,
    MandatoryTrainingCreate,
    MandatoryTrainingUpdate,
    MandatoryTrainingWithStats,
    OverdueReport,
    TrainingAssignmentBulkCreate,
    TrainingAssignmentCreate,
    TrainingAssignmentFilter,
    TrainingAssignmentUpdate,
    TrainingAssignmentWaive,
    TrainingAssignmentWithDetails,
)

logger = logging.getLogger(__name__)


class ComplianceService:
    """Service for managing learning compliance and certifications."""

    # Days before expiry to mark as "expiring soon"
    EXPIRING_SOON_DAYS = 30

    def __init__(self, db: AsyncSession) -> None:
        """Initialize the compliance service."""
        self.db = db

    # ==================== Audit Logging ====================

    async def _create_audit_log(
        self,
        workspace_id: str,
        actor_id: str,
        action_type: AuditActionType,
        target_type: str,
        target_id: str,
        old_value: dict | None = None,
        new_value: dict | None = None,
        description: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        extra_data: dict | None = None,
    ) -> LearningAuditLog:
        """Create an audit log entry."""
        log = LearningAuditLog(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=action_type.value,
            target_type=target_type,
            target_id=target_id,
            old_value=old_value,
            new_value=new_value,
            description=description,
            ip_address=ip_address,
            user_agent=user_agent,
            extra_data=extra_data or {},
        )
        self.db.add(log)
        await self.db.flush()
        return log

    # ==================== Mandatory Training CRUD ====================

    async def create_mandatory_training(
        self,
        workspace_id: str,
        data: MandatoryTrainingCreate,
        created_by_id: str,
    ) -> MandatoryTraining:
        """Create a new mandatory training requirement."""
        training = MandatoryTraining(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            learning_path_id=data.learning_path_id,
            applies_to_type=data.applies_to_type.value,
            applies_to_ids=data.applies_to_ids,
            due_days_after_assignment=data.due_days_after_assignment,
            recurring_months=data.recurring_months,
            fixed_due_date=data.fixed_due_date,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(training)
        await self.db.commit()
        await self.db.refresh(training)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=created_by_id,
            action_type=AuditActionType.TRAINING_CREATED,
            target_type="training",
            target_id=training.id,
            new_value={"name": training.name, "applies_to": training.applies_to_type},
            description=f"Created mandatory training: {training.name}",
        )
        await self.db.commit()

        logger.info(f"Created mandatory training {training.id} in workspace {workspace_id}")
        return training

    async def get_mandatory_training(
        self,
        training_id: str,
        workspace_id: str | None = None,
    ) -> MandatoryTraining | None:
        """Get a mandatory training by ID."""
        query = select(MandatoryTraining).where(MandatoryTraining.id == training_id)

        if workspace_id:
            query = query.where(MandatoryTraining.workspace_id == workspace_id)

        query = query.options(selectinload(MandatoryTraining.assignments))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_mandatory_trainings(
        self,
        workspace_id: str,
        is_active: bool | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[MandatoryTrainingWithStats], int]:
        """List mandatory trainings with completion stats."""
        query = select(MandatoryTraining).where(
            MandatoryTraining.workspace_id == workspace_id
        )

        if is_active is not None:
            query = query.where(MandatoryTraining.is_active == is_active)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(MandatoryTraining.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(selectinload(MandatoryTraining.assignments))

        result = await self.db.execute(query)
        trainings = list(result.scalars().all())

        # Build response with stats
        trainings_with_stats = []
        for training in trainings:
            stats = await self._get_training_stats(training)
            trainings_with_stats.append(stats)

        return trainings_with_stats, total

    async def _get_training_stats(
        self,
        training: MandatoryTraining,
    ) -> MandatoryTrainingWithStats:
        """Calculate completion stats for a training."""
        assignments = training.assignments

        total = len(assignments)
        completed = sum(1 for a in assignments if a.status == AssignmentStatus.COMPLETED.value)
        overdue = sum(1 for a in assignments if a.status == AssignmentStatus.OVERDUE.value)
        in_progress = sum(1 for a in assignments if a.status == AssignmentStatus.IN_PROGRESS.value)

        completion_rate = completed / total if total > 0 else 0.0

        return MandatoryTrainingWithStats(
            id=training.id,
            workspace_id=training.workspace_id,
            learning_path_id=training.learning_path_id,
            name=training.name,
            description=training.description,
            applies_to_type=training.applies_to_type,
            applies_to_ids=training.applies_to_ids,
            due_days_after_assignment=training.due_days_after_assignment,
            recurring_months=training.recurring_months,
            fixed_due_date=training.fixed_due_date,
            is_active=training.is_active,
            extra_data=training.extra_data,
            created_at=training.created_at,
            updated_at=training.updated_at,
            created_by_id=training.created_by_id,
            total_assignments=total,
            completed_assignments=completed,
            overdue_assignments=overdue,
            in_progress_assignments=in_progress,
            completion_rate=completion_rate,
        )

    async def update_mandatory_training(
        self,
        training_id: str,
        workspace_id: str,
        data: MandatoryTrainingUpdate,
        actor_id: str,
    ) -> MandatoryTraining | None:
        """Update a mandatory training."""
        training = await self.get_mandatory_training(training_id, workspace_id)
        if not training:
            return None

        old_value = {"name": training.name, "is_active": training.is_active}
        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if value is not None:
                if field == "applies_to_type" and hasattr(value, "value"):
                    setattr(training, field, value.value)
                else:
                    setattr(training, field, value)

        await self.db.commit()
        await self.db.refresh(training)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.TRAINING_UPDATED,
            target_type="training",
            target_id=training.id,
            old_value=old_value,
            new_value={"name": training.name, "is_active": training.is_active},
            description=f"Updated mandatory training: {training.name}",
        )
        await self.db.commit()

        return training

    async def delete_mandatory_training(
        self,
        training_id: str,
        workspace_id: str,
        actor_id: str,
    ) -> bool:
        """Delete a mandatory training (soft delete by deactivating)."""
        training = await self.get_mandatory_training(training_id, workspace_id)
        if not training:
            return False

        training.is_active = False

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.TRAINING_DELETED,
            target_type="training",
            target_id=training.id,
            old_value={"is_active": True},
            new_value={"is_active": False},
            description=f"Deactivated mandatory training: {training.name}",
        )

        await self.db.commit()
        return True

    # ==================== Training Assignment CRUD ====================

    async def create_assignment(
        self,
        workspace_id: str,
        data: TrainingAssignmentCreate,
        actor_id: str,
    ) -> TrainingAssignment:
        """Create a single training assignment."""
        assignment = TrainingAssignment(
            workspace_id=workspace_id,
            mandatory_training_id=data.mandatory_training_id,
            developer_id=data.developer_id,
            due_date=data.due_date,
            extra_data=data.extra_data,
        )

        self.db.add(assignment)
        await self.db.commit()
        await self.db.refresh(assignment)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.TRAINING_ASSIGNED,
            target_type="assignment",
            target_id=assignment.id,
            new_value={"developer_id": data.developer_id, "due_date": str(data.due_date)},
            description=f"Assigned training to developer {data.developer_id}",
        )
        await self.db.commit()

        return assignment

    async def bulk_create_assignments(
        self,
        workspace_id: str,
        data: TrainingAssignmentBulkCreate,
        actor_id: str,
    ) -> list[TrainingAssignment]:
        """Create multiple training assignments."""
        training = await self.get_mandatory_training(data.mandatory_training_id, workspace_id)
        if not training:
            raise ValueError("Mandatory training not found")

        # Calculate due date
        if data.due_date:
            due_date = data.due_date
        elif training.fixed_due_date:
            due_date = training.fixed_due_date
        else:
            due_date = datetime.now(timezone.utc) + timedelta(days=training.due_days_after_assignment)

        assignments = []
        for developer_id in data.developer_ids:
            # Check if assignment already exists
            existing = await self._get_existing_assignment(
                training.id, developer_id, workspace_id
            )
            if existing:
                continue

            assignment = TrainingAssignment(
                workspace_id=workspace_id,
                mandatory_training_id=data.mandatory_training_id,
                developer_id=developer_id,
                due_date=due_date,
            )
            self.db.add(assignment)
            assignments.append(assignment)

        await self.db.commit()

        # Refresh all
        for assignment in assignments:
            await self.db.refresh(assignment)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.TRAINING_ASSIGNED,
            target_type="training",
            target_id=training.id,
            new_value={"developer_ids": data.developer_ids, "count": len(assignments)},
            description=f"Bulk assigned training to {len(assignments)} developers",
        )
        await self.db.commit()

        return assignments

    async def _get_existing_assignment(
        self,
        training_id: str,
        developer_id: str,
        workspace_id: str,
    ) -> TrainingAssignment | None:
        """Check if an assignment already exists."""
        query = select(TrainingAssignment).where(
            and_(
                TrainingAssignment.mandatory_training_id == training_id,
                TrainingAssignment.developer_id == developer_id,
                TrainingAssignment.workspace_id == workspace_id,
                TrainingAssignment.status != AssignmentStatus.WAIVED.value,
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_assignment(
        self,
        assignment_id: str,
        workspace_id: str | None = None,
    ) -> TrainingAssignment | None:
        """Get a training assignment by ID."""
        query = select(TrainingAssignment).where(TrainingAssignment.id == assignment_id)

        if workspace_id:
            query = query.where(TrainingAssignment.workspace_id == workspace_id)

        query = query.options(selectinload(TrainingAssignment.mandatory_training))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_assignments(
        self,
        workspace_id: str,
        filters: TrainingAssignmentFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[TrainingAssignmentWithDetails], int]:
        """List training assignments with filters."""
        query = select(TrainingAssignment).where(
            TrainingAssignment.workspace_id == workspace_id
        )

        if filters:
            if filters.mandatory_training_id:
                query = query.where(
                    TrainingAssignment.mandatory_training_id == filters.mandatory_training_id
                )
            if filters.developer_id:
                query = query.where(
                    TrainingAssignment.developer_id == filters.developer_id
                )
            if filters.status:
                query = query.where(
                    TrainingAssignment.status == filters.status.value
                )
            if filters.is_overdue:
                now = datetime.now(timezone.utc)
                if filters.is_overdue:
                    query = query.where(
                        and_(
                            TrainingAssignment.due_date < now,
                            TrainingAssignment.status.notin_([
                                AssignmentStatus.COMPLETED.value,
                                AssignmentStatus.WAIVED.value,
                            ]),
                        )
                    )
            if filters.from_date:
                query = query.where(TrainingAssignment.created_at >= filters.from_date)
            if filters.to_date:
                query = query.where(TrainingAssignment.created_at <= filters.to_date)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(TrainingAssignment.due_date.asc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(
            selectinload(TrainingAssignment.mandatory_training),
            selectinload(TrainingAssignment.developer),
        )

        result = await self.db.execute(query)
        assignments = list(result.scalars().all())

        # Build detailed response
        detailed_assignments = []
        now = datetime.now(timezone.utc)
        for assignment in assignments:
            days_until_due = (assignment.due_date - now).days if assignment.due_date else None
            is_overdue = (
                assignment.due_date < now
                and assignment.status not in [
                    AssignmentStatus.COMPLETED.value,
                    AssignmentStatus.WAIVED.value,
                ]
            ) if assignment.due_date else False

            detailed = TrainingAssignmentWithDetails(
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
            detailed_assignments.append(detailed)

        return detailed_assignments, total

    async def update_assignment(
        self,
        assignment_id: str,
        workspace_id: str,
        data: TrainingAssignmentUpdate,
        actor_id: str,
    ) -> TrainingAssignment | None:
        """Update a training assignment."""
        assignment = await self.get_assignment(assignment_id, workspace_id)
        if not assignment:
            return None

        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if value is not None:
                if field == "status" and hasattr(value, "value"):
                    setattr(assignment, field, value.value)
                else:
                    setattr(assignment, field, value)

        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment

    async def acknowledge_assignment(
        self,
        assignment_id: str,
        developer_id: str,
        workspace_id: str,
    ) -> TrainingAssignment | None:
        """Developer acknowledges a training assignment."""
        assignment = await self.get_assignment(assignment_id, workspace_id)
        if not assignment or assignment.developer_id != developer_id:
            return None

        assignment.acknowledged_at = datetime.now(timezone.utc)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=developer_id,
            action_type=AuditActionType.TRAINING_ACKNOWLEDGED,
            target_type="assignment",
            target_id=assignment.id,
            new_value={"acknowledged_at": str(assignment.acknowledged_at)},
            description="Developer acknowledged training assignment",
        )

        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment

    async def start_assignment(
        self,
        assignment_id: str,
        developer_id: str,
        workspace_id: str,
    ) -> TrainingAssignment | None:
        """Developer starts a training assignment."""
        assignment = await self.get_assignment(assignment_id, workspace_id)
        if not assignment or assignment.developer_id != developer_id:
            return None

        if assignment.status == AssignmentStatus.PENDING.value:
            assignment.status = AssignmentStatus.IN_PROGRESS.value
            assignment.started_at = datetime.now(timezone.utc)

            await self.db.commit()
            await self.db.refresh(assignment)

        return assignment

    async def complete_assignment(
        self,
        assignment_id: str,
        developer_id: str,
        workspace_id: str,
    ) -> TrainingAssignment | None:
        """Complete a training assignment."""
        assignment = await self.get_assignment(assignment_id, workspace_id)
        if not assignment or assignment.developer_id != developer_id:
            return None

        assignment.status = AssignmentStatus.COMPLETED.value
        assignment.progress_percentage = 100
        assignment.completed_at = datetime.now(timezone.utc)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=developer_id,
            action_type=AuditActionType.TRAINING_COMPLETED,
            target_type="assignment",
            target_id=assignment.id,
            new_value={"completed_at": str(assignment.completed_at)},
            description="Developer completed training assignment",
        )

        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment

    async def waive_assignment(
        self,
        assignment_id: str,
        workspace_id: str,
        data: TrainingAssignmentWaive,
        waived_by_id: str,
    ) -> TrainingAssignment | None:
        """Waive a training assignment (manager action)."""
        assignment = await self.get_assignment(assignment_id, workspace_id)
        if not assignment:
            return None

        old_status = assignment.status
        assignment.status = AssignmentStatus.WAIVED.value
        assignment.waived_by_id = waived_by_id
        assignment.waived_at = datetime.now(timezone.utc)
        assignment.waiver_reason = data.reason

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=waived_by_id,
            action_type=AuditActionType.TRAINING_WAIVED,
            target_type="assignment",
            target_id=assignment.id,
            old_value={"status": old_status},
            new_value={"status": AssignmentStatus.WAIVED.value, "reason": data.reason},
            description=f"Training assignment waived: {data.reason}",
        )

        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment

    # ==================== Certification CRUD ====================

    async def create_certification(
        self,
        workspace_id: str,
        data: CertificationCreate,
        created_by_id: str,
    ) -> Certification:
        """Create a new certification definition."""
        certification = Certification(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            issuing_authority=data.issuing_authority,
            validity_months=data.validity_months,
            renewal_required=data.renewal_required,
            category=data.category,
            skill_tags=data.skill_tags,
            prerequisites=data.prerequisites,
            is_required=data.is_required,
            external_url=data.external_url,
            logo_url=data.logo_url,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(certification)
        await self.db.commit()
        await self.db.refresh(certification)

        logger.info(f"Created certification {certification.id} in workspace {workspace_id}")
        return certification

    async def get_certification(
        self,
        certification_id: str,
        workspace_id: str | None = None,
    ) -> Certification | None:
        """Get a certification by ID."""
        query = select(Certification).where(Certification.id == certification_id)

        if workspace_id:
            query = query.where(Certification.workspace_id == workspace_id)

        query = query.options(selectinload(Certification.developer_certifications))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_certifications(
        self,
        workspace_id: str,
        is_active: bool | None = None,
        category: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Certification], int]:
        """List certifications with filters."""
        query = select(Certification).where(
            Certification.workspace_id == workspace_id
        )

        if is_active is not None:
            query = query.where(Certification.is_active == is_active)
        if category:
            query = query.where(Certification.category == category)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(Certification.name.asc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(selectinload(Certification.developer_certifications))

        result = await self.db.execute(query)
        certifications = list(result.scalars().all())

        return certifications, total

    async def update_certification(
        self,
        certification_id: str,
        workspace_id: str,
        data: CertificationUpdate,
    ) -> Certification | None:
        """Update a certification."""
        certification = await self.get_certification(certification_id, workspace_id)
        if not certification:
            return None

        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if value is not None:
                setattr(certification, field, value)

        await self.db.commit()
        await self.db.refresh(certification)
        return certification

    # ==================== Developer Certification CRUD ====================

    async def add_developer_certification(
        self,
        workspace_id: str,
        data: DeveloperCertificationCreate,
        actor_id: str,
    ) -> DeveloperCertification:
        """Add a certification to a developer."""
        # Calculate status based on expiry
        status = CertificationStatus.ACTIVE.value
        if data.expiry_date:
            now = datetime.now(timezone.utc)
            if data.expiry_date < now:
                status = CertificationStatus.EXPIRED.value
            elif (data.expiry_date - now).days <= self.EXPIRING_SOON_DAYS:
                status = CertificationStatus.EXPIRING_SOON.value

        dev_cert = DeveloperCertification(
            workspace_id=workspace_id,
            developer_id=data.developer_id,
            certification_id=data.certification_id,
            issued_date=data.issued_date,
            expiry_date=data.expiry_date,
            status=status,
            credential_id=data.credential_id,
            verification_url=data.verification_url,
            certificate_url=data.certificate_url,
            score=data.score,
            notes=data.notes,
            extra_data=data.extra_data,
        )

        self.db.add(dev_cert)
        await self.db.commit()
        await self.db.refresh(dev_cert)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.CERTIFICATION_ADDED,
            target_type="certification",
            target_id=dev_cert.id,
            new_value={
                "developer_id": data.developer_id,
                "certification_id": data.certification_id,
                "issued_date": str(data.issued_date),
            },
            description=f"Added certification for developer {data.developer_id}",
        )
        await self.db.commit()

        return dev_cert

    async def get_developer_certification(
        self,
        dev_cert_id: str,
        workspace_id: str | None = None,
    ) -> DeveloperCertification | None:
        """Get a developer certification by ID."""
        query = select(DeveloperCertification).where(
            DeveloperCertification.id == dev_cert_id
        )

        if workspace_id:
            query = query.where(DeveloperCertification.workspace_id == workspace_id)

        query = query.options(
            selectinload(DeveloperCertification.certification),
            selectinload(DeveloperCertification.developer),
        )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_developer_certifications(
        self,
        workspace_id: str,
        filters: DeveloperCertificationFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[DeveloperCertificationWithDetails], int]:
        """List developer certifications with filters."""
        query = select(DeveloperCertification).where(
            DeveloperCertification.workspace_id == workspace_id
        )

        if filters:
            if filters.certification_id:
                query = query.where(
                    DeveloperCertification.certification_id == filters.certification_id
                )
            if filters.developer_id:
                query = query.where(
                    DeveloperCertification.developer_id == filters.developer_id
                )
            if filters.status:
                query = query.where(
                    DeveloperCertification.status == filters.status.value
                )
            if filters.is_expiring_soon:
                query = query.where(
                    DeveloperCertification.status == CertificationStatus.EXPIRING_SOON.value
                )
            if filters.is_expired:
                query = query.where(
                    DeveloperCertification.status == CertificationStatus.EXPIRED.value
                )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(DeveloperCertification.expiry_date.asc().nullslast())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(
            selectinload(DeveloperCertification.certification),
            selectinload(DeveloperCertification.developer),
        )

        result = await self.db.execute(query)
        dev_certs = list(result.scalars().all())

        # Build detailed response
        detailed_certs = []
        now = datetime.now(timezone.utc)
        for dc in dev_certs:
            days_until_expiry = (dc.expiry_date - now).days if dc.expiry_date else None
            is_expired = dc.status == CertificationStatus.EXPIRED.value
            is_expiring_soon = dc.status == CertificationStatus.EXPIRING_SOON.value

            detailed = DeveloperCertificationWithDetails(
                id=dc.id,
                developer_id=dc.developer_id,
                certification_id=dc.certification_id,
                workspace_id=dc.workspace_id,
                issued_date=dc.issued_date,
                expiry_date=dc.expiry_date,
                status=dc.status,
                credential_id=dc.credential_id,
                verification_url=dc.verification_url,
                certificate_url=dc.certificate_url,
                verified_at=dc.verified_at,
                verified_by_id=dc.verified_by_id,
                score=dc.score,
                extra_data=dc.extra_data,
                notes=dc.notes,
                renewal_reminder_sent_at=dc.renewal_reminder_sent_at,
                created_at=dc.created_at,
                updated_at=dc.updated_at,
                certification_name=dc.certification.name if dc.certification else "",
                certification_issuing_authority=dc.certification.issuing_authority if dc.certification else "",
                developer_name=dc.developer.name if dc.developer else "",
                developer_email=dc.developer.email if dc.developer else "",
                days_until_expiry=days_until_expiry,
                is_expired=is_expired,
                is_expiring_soon=is_expiring_soon,
            )
            detailed_certs.append(detailed)

        return detailed_certs, total

    async def update_developer_certification(
        self,
        dev_cert_id: str,
        workspace_id: str,
        data: DeveloperCertificationUpdate,
        actor_id: str,
    ) -> DeveloperCertification | None:
        """Update a developer certification."""
        dev_cert = await self.get_developer_certification(dev_cert_id, workspace_id)
        if not dev_cert:
            return None

        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if value is not None:
                if field == "status" and hasattr(value, "value"):
                    setattr(dev_cert, field, value.value)
                else:
                    setattr(dev_cert, field, value)

        # Recalculate status if expiry date changed
        if data.expiry_date:
            now = datetime.now(timezone.utc)
            if data.expiry_date < now:
                dev_cert.status = CertificationStatus.EXPIRED.value
            elif (data.expiry_date - now).days <= self.EXPIRING_SOON_DAYS:
                dev_cert.status = CertificationStatus.EXPIRING_SOON.value
            else:
                dev_cert.status = CertificationStatus.ACTIVE.value

        await self.db.commit()
        await self.db.refresh(dev_cert)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.CERTIFICATION_UPDATED,
            target_type="certification",
            target_id=dev_cert.id,
            new_value={"status": dev_cert.status},
            description="Updated developer certification",
        )
        await self.db.commit()

        return dev_cert

    async def verify_developer_certification(
        self,
        dev_cert_id: str,
        workspace_id: str,
        verified_by_id: str,
        verification_url: str | None = None,
    ) -> DeveloperCertification | None:
        """Verify a developer certification."""
        dev_cert = await self.get_developer_certification(dev_cert_id, workspace_id)
        if not dev_cert:
            return None

        dev_cert.verified_at = datetime.now(timezone.utc)
        dev_cert.verified_by_id = verified_by_id
        if verification_url:
            dev_cert.verification_url = verification_url

        await self.db.commit()
        await self.db.refresh(dev_cert)
        return dev_cert

    async def renew_developer_certification(
        self,
        dev_cert_id: str,
        workspace_id: str,
        data: DeveloperCertificationRenew,
        actor_id: str,
    ) -> DeveloperCertification | None:
        """Renew a developer certification."""
        dev_cert = await self.get_developer_certification(dev_cert_id, workspace_id)
        if not dev_cert:
            return None

        dev_cert.issued_date = data.new_issued_date
        dev_cert.expiry_date = data.new_expiry_date
        if data.new_credential_id:
            dev_cert.credential_id = data.new_credential_id
        if data.new_verification_url:
            dev_cert.verification_url = data.new_verification_url
        if data.new_certificate_url:
            dev_cert.certificate_url = data.new_certificate_url
        if data.score is not None:
            dev_cert.score = data.score

        # Recalculate status
        now = datetime.now(timezone.utc)
        if data.new_expiry_date:
            if data.new_expiry_date < now:
                dev_cert.status = CertificationStatus.EXPIRED.value
            elif (data.new_expiry_date - now).days <= self.EXPIRING_SOON_DAYS:
                dev_cert.status = CertificationStatus.EXPIRING_SOON.value
            else:
                dev_cert.status = CertificationStatus.ACTIVE.value
        else:
            dev_cert.status = CertificationStatus.ACTIVE.value

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.CERTIFICATION_RENEWED,
            target_type="certification",
            target_id=dev_cert.id,
            new_value={
                "issued_date": str(data.new_issued_date),
                "expiry_date": str(data.new_expiry_date) if data.new_expiry_date else None,
            },
            description="Renewed developer certification",
        )

        await self.db.commit()
        await self.db.refresh(dev_cert)
        return dev_cert

    async def revoke_developer_certification(
        self,
        dev_cert_id: str,
        workspace_id: str,
        actor_id: str,
        reason: str | None = None,
    ) -> DeveloperCertification | None:
        """Revoke a developer certification."""
        dev_cert = await self.get_developer_certification(dev_cert_id, workspace_id)
        if not dev_cert:
            return None

        old_status = dev_cert.status
        dev_cert.status = CertificationStatus.REVOKED.value
        if reason:
            dev_cert.notes = reason

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.CERTIFICATION_REVOKED,
            target_type="certification",
            target_id=dev_cert.id,
            old_value={"status": old_status},
            new_value={"status": CertificationStatus.REVOKED.value, "reason": reason},
            description=f"Revoked developer certification: {reason}",
        )

        await self.db.commit()
        await self.db.refresh(dev_cert)
        return dev_cert

    # ==================== Reports ====================

    async def get_compliance_overview(
        self,
        workspace_id: str,
    ) -> ComplianceOverview:
        """Get overall compliance overview for a workspace."""
        # Training stats
        training_query = select(MandatoryTraining).where(
            MandatoryTraining.workspace_id == workspace_id
        )
        training_result = await self.db.execute(training_query)
        trainings = list(training_result.scalars().all())

        total_trainings = len(trainings)
        active_trainings = sum(1 for t in trainings if t.is_active)

        # Assignment stats
        assignment_query = select(TrainingAssignment).where(
            TrainingAssignment.workspace_id == workspace_id
        )
        assignment_result = await self.db.execute(assignment_query)
        assignments = list(assignment_result.scalars().all())

        total_assignments = len(assignments)
        completed_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.COMPLETED.value
        )
        overdue_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.OVERDUE.value
        )
        in_progress_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.IN_PROGRESS.value
        )
        pending_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.PENDING.value
        )
        waived_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.WAIVED.value
        )

        completion_rate = (
            completed_assignments / total_assignments if total_assignments > 0 else 0.0
        )

        # Certification stats
        cert_query = select(DeveloperCertification).where(
            DeveloperCertification.workspace_id == workspace_id
        )
        cert_result = await self.db.execute(cert_query)
        certs = list(cert_result.scalars().all())

        total_certs = len(certs)
        active_certs = sum(
            1 for c in certs if c.status == CertificationStatus.ACTIVE.value
        )
        expired_certs = sum(
            1 for c in certs if c.status == CertificationStatus.EXPIRED.value
        )
        expiring_soon_certs = sum(
            1 for c in certs if c.status == CertificationStatus.EXPIRING_SOON.value
        )

        return ComplianceOverview(
            total_mandatory_trainings=total_trainings,
            active_mandatory_trainings=active_trainings,
            total_assignments=total_assignments,
            completed_assignments=completed_assignments,
            overdue_assignments=overdue_assignments,
            in_progress_assignments=in_progress_assignments,
            pending_assignments=pending_assignments,
            waived_assignments=waived_assignments,
            overall_completion_rate=completion_rate,
            total_certifications=total_certs,
            active_certifications=active_certs,
            expired_certifications=expired_certs,
            expiring_soon_certifications=expiring_soon_certs,
        )

    async def get_developer_compliance_status(
        self,
        developer_id: str,
        workspace_id: str,
    ) -> DeveloperComplianceStatus:
        """Get compliance status for a specific developer."""
        # Get developer info
        dev_query = select(Developer).where(Developer.id == developer_id)
        dev_result = await self.db.execute(dev_query)
        developer = dev_result.scalar_one_or_none()

        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        # Assignment stats
        assignment_query = select(TrainingAssignment).where(
            and_(
                TrainingAssignment.workspace_id == workspace_id,
                TrainingAssignment.developer_id == developer_id,
            )
        )
        assignment_result = await self.db.execute(assignment_query)
        assignments = list(assignment_result.scalars().all())

        total_assignments = len(assignments)
        completed_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.COMPLETED.value
        )
        overdue_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.OVERDUE.value
        )
        in_progress_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.IN_PROGRESS.value
        )
        pending_assignments = sum(
            1 for a in assignments if a.status == AssignmentStatus.PENDING.value
        )

        completion_rate = (
            completed_assignments / total_assignments if total_assignments > 0 else 0.0
        )

        # Certification stats
        cert_query = select(DeveloperCertification).where(
            and_(
                DeveloperCertification.workspace_id == workspace_id,
                DeveloperCertification.developer_id == developer_id,
            )
        )
        cert_result = await self.db.execute(cert_query)
        certs = list(cert_result.scalars().all())

        total_certs = len(certs)
        active_certs = sum(
            1 for c in certs if c.status == CertificationStatus.ACTIVE.value
        )
        expired_certs = sum(
            1 for c in certs if c.status == CertificationStatus.EXPIRED.value
        )
        expiring_soon_certs = sum(
            1 for c in certs if c.status == CertificationStatus.EXPIRING_SOON.value
        )

        # Determine compliance (no overdue and no expired required certs)
        is_compliant = overdue_assignments == 0 and expired_certs == 0

        return DeveloperComplianceStatus(
            developer_id=developer_id,
            developer_name=developer.name or "",
            developer_email=developer.email or "",
            total_assignments=total_assignments,
            completed_assignments=completed_assignments,
            overdue_assignments=overdue_assignments,
            in_progress_assignments=in_progress_assignments,
            pending_assignments=pending_assignments,
            completion_rate=completion_rate,
            total_certifications=total_certs,
            active_certifications=active_certs,
            expired_certifications=expired_certs,
            expiring_soon_certifications=expiring_soon_certs,
            is_compliant=is_compliant,
        )

    async def get_overdue_report(
        self,
        workspace_id: str,
    ) -> OverdueReport:
        """Get report of overdue training assignments."""
        now = datetime.now(timezone.utc)

        query = select(TrainingAssignment).where(
            and_(
                TrainingAssignment.workspace_id == workspace_id,
                TrainingAssignment.due_date < now,
                TrainingAssignment.status.notin_([
                    AssignmentStatus.COMPLETED.value,
                    AssignmentStatus.WAIVED.value,
                ]),
            )
        ).options(
            selectinload(TrainingAssignment.mandatory_training),
            selectinload(TrainingAssignment.developer),
        )

        result = await self.db.execute(query)
        assignments = list(result.scalars().all())

        # Build detailed list
        detailed_assignments = []
        by_training: dict[str, int] = {}
        by_team: dict[str, int] = {}

        for assignment in assignments:
            days_until_due = (assignment.due_date - now).days if assignment.due_date else None

            detailed = TrainingAssignmentWithDetails(
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
                is_overdue=True,
            )
            detailed_assignments.append(detailed)

            # Count by training
            training_id = assignment.mandatory_training_id
            by_training[training_id] = by_training.get(training_id, 0) + 1

        return OverdueReport(
            assignments=detailed_assignments,
            total=len(detailed_assignments),
            by_training=by_training,
            by_team=by_team,
        )

    async def get_expiring_certifications_report(
        self,
        workspace_id: str,
        days_ahead: int = 30,
    ) -> ExpiringCertificationsReport:
        """Get report of expiring certifications."""
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=days_ahead)

        query = select(DeveloperCertification).where(
            and_(
                DeveloperCertification.workspace_id == workspace_id,
                DeveloperCertification.expiry_date <= cutoff,
                DeveloperCertification.status != CertificationStatus.REVOKED.value,
            )
        ).options(
            selectinload(DeveloperCertification.certification),
            selectinload(DeveloperCertification.developer),
        )

        result = await self.db.execute(query)
        dev_certs = list(result.scalars().all())

        # Build detailed list
        detailed_certs = []
        by_certification: dict[str, int] = {}
        by_days: dict[str, int] = {"0-7": 0, "8-14": 0, "15-30": 0}

        for dc in dev_certs:
            days_until_expiry = (dc.expiry_date - now).days if dc.expiry_date else None
            is_expired = dc.expiry_date < now if dc.expiry_date else False

            detailed = DeveloperCertificationWithDetails(
                id=dc.id,
                developer_id=dc.developer_id,
                certification_id=dc.certification_id,
                workspace_id=dc.workspace_id,
                issued_date=dc.issued_date,
                expiry_date=dc.expiry_date,
                status=dc.status,
                credential_id=dc.credential_id,
                verification_url=dc.verification_url,
                certificate_url=dc.certificate_url,
                verified_at=dc.verified_at,
                verified_by_id=dc.verified_by_id,
                score=dc.score,
                extra_data=dc.extra_data,
                notes=dc.notes,
                renewal_reminder_sent_at=dc.renewal_reminder_sent_at,
                created_at=dc.created_at,
                updated_at=dc.updated_at,
                certification_name=dc.certification.name if dc.certification else "",
                certification_issuing_authority=dc.certification.issuing_authority if dc.certification else "",
                developer_name=dc.developer.name if dc.developer else "",
                developer_email=dc.developer.email if dc.developer else "",
                days_until_expiry=days_until_expiry,
                is_expired=is_expired,
                is_expiring_soon=not is_expired and days_until_expiry is not None and days_until_expiry <= 30,
            )
            detailed_certs.append(detailed)

            # Count by certification
            cert_id = dc.certification_id
            by_certification[cert_id] = by_certification.get(cert_id, 0) + 1

            # Count by days
            if days_until_expiry is not None:
                if days_until_expiry <= 7:
                    by_days["0-7"] += 1
                elif days_until_expiry <= 14:
                    by_days["8-14"] += 1
                else:
                    by_days["15-30"] += 1

        return ExpiringCertificationsReport(
            certifications=detailed_certs,
            total=len(detailed_certs),
            by_certification=by_certification,
            by_days_until_expiry=by_days,
        )

    # ==================== Audit Log Queries ====================

    async def list_audit_logs(
        self,
        workspace_id: str,
        filters: AuditLogFilter | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[LearningAuditLog], int]:
        """List audit logs with filters."""
        query = select(LearningAuditLog).where(
            LearningAuditLog.workspace_id == workspace_id
        )

        if filters:
            if filters.action_type:
                query = query.where(
                    LearningAuditLog.action_type == filters.action_type.value
                )
            if filters.target_type:
                query = query.where(LearningAuditLog.target_type == filters.target_type)
            if filters.target_id:
                query = query.where(LearningAuditLog.target_id == filters.target_id)
            if filters.actor_id:
                query = query.where(LearningAuditLog.actor_id == filters.actor_id)
            if filters.from_date:
                query = query.where(LearningAuditLog.created_at >= filters.from_date)
            if filters.to_date:
                query = query.where(LearningAuditLog.created_at <= filters.to_date)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningAuditLog.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(selectinload(LearningAuditLog.actor))

        result = await self.db.execute(query)
        logs = list(result.scalars().all())

        return logs, total

    # ==================== Background Tasks ====================

    async def update_overdue_assignments(
        self,
        workspace_id: str,
    ) -> int:
        """Update status of overdue assignments. Returns count of updated."""
        now = datetime.now(timezone.utc)

        query = select(TrainingAssignment).where(
            and_(
                TrainingAssignment.workspace_id == workspace_id,
                TrainingAssignment.due_date < now,
                TrainingAssignment.status.in_([
                    AssignmentStatus.PENDING.value,
                    AssignmentStatus.IN_PROGRESS.value,
                ]),
            )
        )

        result = await self.db.execute(query)
        assignments = list(result.scalars().all())

        for assignment in assignments:
            assignment.status = AssignmentStatus.OVERDUE.value

        await self.db.commit()
        return len(assignments)

    async def update_certification_statuses(
        self,
        workspace_id: str,
    ) -> int:
        """Update status of certifications based on expiry. Returns count of updated."""
        now = datetime.now(timezone.utc)
        expiring_soon_cutoff = now + timedelta(days=self.EXPIRING_SOON_DAYS)

        # Find active certifications that should be marked as expiring soon
        expiring_query = select(DeveloperCertification).where(
            and_(
                DeveloperCertification.workspace_id == workspace_id,
                DeveloperCertification.status == CertificationStatus.ACTIVE.value,
                DeveloperCertification.expiry_date.isnot(None),
                DeveloperCertification.expiry_date <= expiring_soon_cutoff,
                DeveloperCertification.expiry_date > now,
            )
        )

        expiring_result = await self.db.execute(expiring_query)
        expiring_certs = list(expiring_result.scalars().all())

        for cert in expiring_certs:
            cert.status = CertificationStatus.EXPIRING_SOON.value

        # Find expiring soon certifications that should be marked as expired
        expired_query = select(DeveloperCertification).where(
            and_(
                DeveloperCertification.workspace_id == workspace_id,
                DeveloperCertification.status.in_([
                    CertificationStatus.ACTIVE.value,
                    CertificationStatus.EXPIRING_SOON.value,
                ]),
                DeveloperCertification.expiry_date.isnot(None),
                DeveloperCertification.expiry_date <= now,
            )
        )

        expired_result = await self.db.execute(expired_query)
        expired_certs = list(expired_result.scalars().all())

        for cert in expired_certs:
            cert.status = CertificationStatus.EXPIRED.value

        await self.db.commit()
        return len(expiring_certs) + len(expired_certs)
