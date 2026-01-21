"""Learning integrations service layer.

Handles HR sync, SCORM/xAPI LMS integration, and calendar sync business logic.
"""

import uuid
from datetime import datetime

from sqlalchemy import select, func, and_, Integer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.learning_integrations import (
    HRIntegration,
    HRSyncLog,
    LMSIntegration,
    SCORMPackage,
    SCORMTracking,
    XAPIStatement,
    LearningCalendarIntegration,
    LearningCalendarEvent,
    IntegrationStatus,
    SyncStatus,
    SCORMCompletionStatus,
)
from aexy.schemas.learning_integrations import (
    HRIntegrationCreate,
    HRIntegrationUpdate,
    HRIntegrationFilter,
    LMSIntegrationCreate,
    LMSIntegrationUpdate,
    LMSIntegrationFilter,
    SCORMPackageCreate,
    SCORMPackageUpdate,
    SCORMPackageFilter,
    SCORMTrackingUpdate,
    SCORMTrackingFilter,
    XAPIStatementCreate,
    XAPIStatementFilter,
    CalendarIntegrationCreate,
    CalendarIntegrationUpdate,
    CalendarEventCreate,
    IntegrationsOverview,
)


class LearningIntegrationsService:
    """Service for managing learning integrations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Overview ====================

    async def get_integrations_overview(self, workspace_id: str) -> IntegrationsOverview:
        """Get overview of all learning integrations for a workspace."""
        # HR integrations count
        hr_result = await self.db.execute(
            select(
                func.count(HRIntegration.id).label("total"),
                func.sum(func.cast(HRIntegration.is_active, Integer)).label("active"),
            ).where(HRIntegration.workspace_id == workspace_id)
        )
        hr_row = hr_result.first()

        # LMS integrations count
        lms_result = await self.db.execute(
            select(
                func.count(LMSIntegration.id).label("total"),
                func.sum(func.cast(LMSIntegration.is_active, Integer)).label("active"),
            ).where(LMSIntegration.workspace_id == workspace_id)
        )
        lms_row = lms_result.first()

        # SCORM packages count
        scorm_result = await self.db.execute(
            select(
                func.count(SCORMPackage.id).label("total"),
                func.sum(func.cast(SCORMPackage.is_active, Integer)).label("active"),
            ).where(SCORMPackage.workspace_id == workspace_id)
        )
        scorm_row = scorm_result.first()

        # Calendar integrations count
        cal_result = await self.db.execute(
            select(
                func.count(LearningCalendarIntegration.id).label("total"),
                func.sum(func.cast(LearningCalendarIntegration.is_active, Integer)).label("active"),
            ).where(LearningCalendarIntegration.workspace_id == workspace_id)
        )
        cal_row = cal_result.first()

        # xAPI statements count
        xapi_result = await self.db.execute(
            select(func.count(XAPIStatement.id)).where(
                XAPIStatement.workspace_id == workspace_id
            )
        )
        xapi_count = xapi_result.scalar() or 0

        # Last HR sync
        last_hr_sync = await self.db.execute(
            select(HRIntegration.last_sync_at)
            .where(
                and_(
                    HRIntegration.workspace_id == workspace_id,
                    HRIntegration.last_sync_at.isnot(None),
                )
            )
            .order_by(HRIntegration.last_sync_at.desc())
            .limit(1)
        )
        hr_sync_time = last_hr_sync.scalar()

        # Last LMS sync
        last_lms_sync = await self.db.execute(
            select(LMSIntegration.last_sync_at)
            .where(
                and_(
                    LMSIntegration.workspace_id == workspace_id,
                    LMSIntegration.last_sync_at.isnot(None),
                )
            )
            .order_by(LMSIntegration.last_sync_at.desc())
            .limit(1)
        )
        lms_sync_time = last_lms_sync.scalar()

        return IntegrationsOverview(
            hr_integrations_count=hr_row.total or 0 if hr_row else 0,
            hr_integrations_active=hr_row.active or 0 if hr_row else 0,
            lms_integrations_count=lms_row.total or 0 if lms_row else 0,
            lms_integrations_active=lms_row.active or 0 if lms_row else 0,
            scorm_packages_count=scorm_row.total or 0 if scorm_row else 0,
            scorm_packages_active=scorm_row.active or 0 if scorm_row else 0,
            calendar_integrations_count=cal_row.total or 0 if cal_row else 0,
            calendar_integrations_active=cal_row.active or 0 if cal_row else 0,
            total_xapi_statements=xapi_count,
            last_hr_sync_at=hr_sync_time,
            last_lms_sync_at=lms_sync_time,
        )

    # ==================== HR Integrations ====================

    async def create_hr_integration(
        self,
        workspace_id: str,
        data: HRIntegrationCreate,
        created_by_id: str,
    ) -> HRIntegration:
        """Create a new HR integration."""
        integration = HRIntegration(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            provider=data.provider,
            name=data.name,
            description=data.description,
            api_base_url=data.api_base_url,
            # In production, encrypt api_key before storing
            api_key_encrypted=data.api_key,
            oauth_credentials=data.oauth_credentials,
            sync_employees=data.sync_employees,
            sync_departments=data.sync_departments,
            sync_managers=data.sync_managers,
            sync_terminations=data.sync_terminations,
            sync_frequency_hours=data.sync_frequency_hours,
            field_mappings=data.field_mappings,
            status=IntegrationStatus.PENDING_SETUP,
            is_active=True,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(integration)
        await self.db.commit()
        await self.db.refresh(integration)
        return integration

    async def update_hr_integration(
        self,
        integration_id: str,
        workspace_id: str,
        data: HRIntegrationUpdate,
    ) -> HRIntegration | None:
        """Update an HR integration."""
        result = await self.db.execute(
            select(HRIntegration).where(
                and_(
                    HRIntegration.id == integration_id,
                    HRIntegration.workspace_id == workspace_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if "api_key" in update_data:
            update_data["api_key_encrypted"] = update_data.pop("api_key")

        for field, value in update_data.items():
            if hasattr(integration, field):
                setattr(integration, field, value)

        await self.db.commit()
        await self.db.refresh(integration)
        return integration

    async def list_hr_integrations(
        self,
        workspace_id: str,
        filters: HRIntegrationFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[HRIntegration], int]:
        """List HR integrations with optional filters."""
        query = select(HRIntegration).where(HRIntegration.workspace_id == workspace_id)

        if filters:
            if filters.provider:
                query = query.where(HRIntegration.provider == filters.provider)
            if filters.status:
                query = query.where(HRIntegration.status == filters.status)
            if filters.is_active is not None:
                query = query.where(HRIntegration.is_active == filters.is_active)

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(HRIntegration.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        integrations = list(result.scalars().all())

        return integrations, total

    async def delete_hr_integration(
        self,
        integration_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete an HR integration."""
        result = await self.db.execute(
            select(HRIntegration).where(
                and_(
                    HRIntegration.id == integration_id,
                    HRIntegration.workspace_id == workspace_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return False

        await self.db.delete(integration)
        await self.db.commit()
        return True

    async def trigger_hr_sync(
        self,
        integration_id: str,
        workspace_id: str,
    ) -> HRSyncLog:
        """Trigger an HR sync operation."""
        result = await self.db.execute(
            select(HRIntegration).where(
                and_(
                    HRIntegration.id == integration_id,
                    HRIntegration.workspace_id == workspace_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            raise ValueError("Integration not found")

        # Create sync log
        sync_log = HRSyncLog(
            id=str(uuid.uuid4()),
            integration_id=integration_id,
            workspace_id=workspace_id,
            status=SyncStatus.PENDING,
            started_at=datetime.utcnow(),
        )

        self.db.add(sync_log)
        await self.db.commit()
        await self.db.refresh(sync_log)

        # In production, this would queue a Celery task to perform the sync
        # For now, we just create the log entry

        return sync_log

    async def list_hr_sync_logs(
        self,
        integration_id: str,
        workspace_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[HRSyncLog], int]:
        """List HR sync logs for an integration."""
        query = select(HRSyncLog).where(
            and_(
                HRSyncLog.integration_id == integration_id,
                HRSyncLog.workspace_id == workspace_id,
            )
        )

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(HRSyncLog.started_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        logs = list(result.scalars().all())

        return logs, total

    # ==================== LMS Integrations ====================

    async def create_lms_integration(
        self,
        workspace_id: str,
        data: LMSIntegrationCreate,
        created_by_id: str,
    ) -> LMSIntegration:
        """Create a new LMS integration."""
        integration = LMSIntegration(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            provider=data.provider,
            name=data.name,
            description=data.description,
            api_base_url=data.api_base_url,
            api_key_encrypted=data.api_key,
            oauth_credentials=data.oauth_credentials,
            scorm_support=data.scorm_support,
            scorm_versions=data.scorm_versions,
            xapi_support=data.xapi_support,
            xapi_endpoint=data.xapi_endpoint,
            xapi_credentials=data.xapi_credentials,
            sync_completions=data.sync_completions,
            sync_progress=data.sync_progress,
            sync_frequency_hours=data.sync_frequency_hours,
            status=IntegrationStatus.PENDING_SETUP,
            is_active=True,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(integration)
        await self.db.commit()
        await self.db.refresh(integration)
        return integration

    async def update_lms_integration(
        self,
        integration_id: str,
        workspace_id: str,
        data: LMSIntegrationUpdate,
    ) -> LMSIntegration | None:
        """Update an LMS integration."""
        result = await self.db.execute(
            select(LMSIntegration).where(
                and_(
                    LMSIntegration.id == integration_id,
                    LMSIntegration.workspace_id == workspace_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if "api_key" in update_data:
            update_data["api_key_encrypted"] = update_data.pop("api_key")

        for field, value in update_data.items():
            if hasattr(integration, field):
                setattr(integration, field, value)

        await self.db.commit()
        await self.db.refresh(integration)
        return integration

    async def list_lms_integrations(
        self,
        workspace_id: str,
        filters: LMSIntegrationFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LMSIntegration], int]:
        """List LMS integrations with optional filters."""
        query = select(LMSIntegration).where(LMSIntegration.workspace_id == workspace_id)

        if filters:
            if filters.provider:
                query = query.where(LMSIntegration.provider == filters.provider)
            if filters.scorm_support is not None:
                query = query.where(LMSIntegration.scorm_support == filters.scorm_support)
            if filters.xapi_support is not None:
                query = query.where(LMSIntegration.xapi_support == filters.xapi_support)
            if filters.status:
                query = query.where(LMSIntegration.status == filters.status)
            if filters.is_active is not None:
                query = query.where(LMSIntegration.is_active == filters.is_active)

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(LMSIntegration.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        integrations = list(result.scalars().all())

        return integrations, total

    async def delete_lms_integration(
        self,
        integration_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete an LMS integration."""
        result = await self.db.execute(
            select(LMSIntegration).where(
                and_(
                    LMSIntegration.id == integration_id,
                    LMSIntegration.workspace_id == workspace_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return False

        await self.db.delete(integration)
        await self.db.commit()
        return True

    # ==================== SCORM Packages ====================

    async def create_scorm_package(
        self,
        workspace_id: str,
        data: SCORMPackageCreate,
        created_by_id: str,
    ) -> SCORMPackage:
        """Create a new SCORM package."""
        package = SCORMPackage(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            integration_id=data.integration_id,
            title=data.title,
            description=data.description,
            version=data.version,
            package_url=data.package_url,
            launch_url=data.launch_url,
            passing_score=data.passing_score,
            max_attempts=data.max_attempts,
            time_limit_minutes=data.time_limit_minutes,
            learning_path_id=data.learning_path_id,
            manifest_data={},
            is_active=True,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(package)
        await self.db.commit()
        await self.db.refresh(package)
        return package

    async def update_scorm_package(
        self,
        package_id: str,
        workspace_id: str,
        data: SCORMPackageUpdate,
    ) -> SCORMPackage | None:
        """Update a SCORM package."""
        result = await self.db.execute(
            select(SCORMPackage).where(
                and_(
                    SCORMPackage.id == package_id,
                    SCORMPackage.workspace_id == workspace_id,
                )
            )
        )
        package = result.scalar_one_or_none()

        if not package:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(package, field):
                setattr(package, field, value)

        await self.db.commit()
        await self.db.refresh(package)
        return package

    async def list_scorm_packages(
        self,
        workspace_id: str,
        filters: SCORMPackageFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """List SCORM packages with statistics."""
        query = select(SCORMPackage).where(SCORMPackage.workspace_id == workspace_id)

        if filters:
            if filters.integration_id:
                query = query.where(SCORMPackage.integration_id == filters.integration_id)
            if filters.version:
                query = query.where(SCORMPackage.version == filters.version)
            if filters.is_active is not None:
                query = query.where(SCORMPackage.is_active == filters.is_active)

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(SCORMPackage.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        packages = list(result.scalars().all())

        # Get stats for each package
        packages_with_stats = []
        for package in packages:
            stats = await self._get_scorm_package_stats(package.id)
            package_dict = {
                **{c.name: getattr(package, c.name) for c in package.__table__.columns},
                **stats,
            }
            packages_with_stats.append(package_dict)

        return packages_with_stats, total

    async def _get_scorm_package_stats(self, package_id: str) -> dict:
        """Get statistics for a SCORM package."""
        result = await self.db.execute(
            select(
                func.count(SCORMTracking.id).label("total"),
                func.sum(
                    func.cast(
                        SCORMTracking.completion_status == SCORMCompletionStatus.COMPLETED,
                        Integer,
                    )
                ).label("completed"),
                func.sum(
                    func.cast(
                        SCORMTracking.completion_status == SCORMCompletionStatus.PASSED,
                        Integer,
                    )
                ).label("passed"),
                func.sum(
                    func.cast(
                        SCORMTracking.completion_status == SCORMCompletionStatus.FAILED,
                        Integer,
                    )
                ).label("failed"),
                func.sum(
                    func.cast(
                        SCORMTracking.completion_status == SCORMCompletionStatus.INCOMPLETE,
                        Integer,
                    )
                ).label("in_progress"),
                func.avg(SCORMTracking.score_raw).label("avg_score"),
                func.avg(SCORMTracking.total_time_seconds).label("avg_time"),
            ).where(SCORMTracking.package_id == package_id)
        )
        row = result.first()

        return {
            "total_enrollments": row.total or 0,
            "completed_count": row.completed or 0,
            "passed_count": row.passed or 0,
            "failed_count": row.failed or 0,
            "in_progress_count": row.in_progress or 0,
            "average_score": row.avg_score,
            "average_time_seconds": int(row.avg_time) if row.avg_time else None,
        }

    async def delete_scorm_package(
        self,
        package_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a SCORM package."""
        result = await self.db.execute(
            select(SCORMPackage).where(
                and_(
                    SCORMPackage.id == package_id,
                    SCORMPackage.workspace_id == workspace_id,
                )
            )
        )
        package = result.scalar_one_or_none()

        if not package:
            return False

        await self.db.delete(package)
        await self.db.commit()
        return True

    # ==================== SCORM Tracking ====================

    async def get_or_create_scorm_tracking(
        self,
        package_id: str,
        developer_id: str,
        workspace_id: str,
    ) -> SCORMTracking:
        """Get or create a SCORM tracking record for a learner."""
        result = await self.db.execute(
            select(SCORMTracking).where(
                and_(
                    SCORMTracking.package_id == package_id,
                    SCORMTracking.developer_id == developer_id,
                )
            )
        )
        tracking = result.scalar_one_or_none()

        if tracking:
            return tracking

        # Create new tracking record
        tracking = SCORMTracking(
            id=str(uuid.uuid4()),
            package_id=package_id,
            developer_id=developer_id,
            workspace_id=workspace_id,
            cmi_data={},
            completion_status=SCORMCompletionStatus.NOT_ATTEMPTED,
            first_accessed_at=datetime.utcnow(),
        )

        self.db.add(tracking)
        await self.db.commit()
        await self.db.refresh(tracking)
        return tracking

    async def update_scorm_tracking(
        self,
        tracking_id: str,
        data: SCORMTrackingUpdate,
    ) -> SCORMTracking | None:
        """Update SCORM tracking data."""
        result = await self.db.execute(
            select(SCORMTracking).where(SCORMTracking.id == tracking_id)
        )
        tracking = result.scalar_one_or_none()

        if not tracking:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(tracking, field):
                setattr(tracking, field, value)

        tracking.last_accessed_at = datetime.utcnow()

        # Check if completed
        if data.completion_status in [
            SCORMCompletionStatus.COMPLETED,
            SCORMCompletionStatus.PASSED,
            SCORMCompletionStatus.FAILED,
        ]:
            tracking.completed_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(tracking)
        return tracking

    async def list_scorm_tracking(
        self,
        workspace_id: str,
        filters: SCORMTrackingFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """List SCORM tracking records with details."""
        query = (
            select(SCORMTracking)
            .join(SCORMPackage, SCORMTracking.package_id == SCORMPackage.id)
            .where(SCORMTracking.workspace_id == workspace_id)
        )

        if filters:
            if filters.package_id:
                query = query.where(SCORMTracking.package_id == filters.package_id)
            if filters.developer_id:
                query = query.where(SCORMTracking.developer_id == filters.developer_id)
            if filters.completion_status:
                query = query.where(SCORMTracking.completion_status == filters.completion_status)

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(SCORMTracking.last_accessed_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(selectinload(SCORMTracking.package))

        result = await self.db.execute(query)
        records = list(result.scalars().all())

        # Add package title to each record
        tracking_with_details = []
        for record in records:
            record_dict = {c.name: getattr(record, c.name) for c in record.__table__.columns}
            record_dict["package_title"] = record.package.title if record.package else ""
            tracking_with_details.append(record_dict)

        return tracking_with_details, total

    # ==================== xAPI Statements ====================

    async def create_xapi_statement(
        self,
        workspace_id: str,
        developer_id: str,
        data: XAPIStatementCreate,
    ) -> XAPIStatement:
        """Create a new xAPI statement."""
        statement = XAPIStatement(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            developer_id=developer_id,
            integration_id=data.integration_id,
            statement_id=data.statement_id,
            actor_mbox=data.actor_mbox,
            actor_name=data.actor_name,
            actor_account=data.actor_account,
            verb_id=data.verb_id,
            verb_display=data.verb_display,
            object_id=data.object_id,
            object_type=data.object_type,
            object_definition=data.object_definition,
            result_score_scaled=data.result_score_scaled,
            result_score_raw=data.result_score_raw,
            result_success=data.result_success,
            result_completion=data.result_completion,
            result_duration=data.result_duration,
            result_response=data.result_response,
            result_extensions=data.result_extensions,
            context_registration=data.context_registration,
            context_extensions=data.context_extensions,
            timestamp=data.timestamp,
            raw_statement=data.raw_statement,
        )

        self.db.add(statement)
        await self.db.commit()
        await self.db.refresh(statement)
        return statement

    async def list_xapi_statements(
        self,
        workspace_id: str,
        filters: XAPIStatementFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[XAPIStatement], int]:
        """List xAPI statements with optional filters."""
        query = select(XAPIStatement).where(XAPIStatement.workspace_id == workspace_id)

        if filters:
            if filters.developer_id:
                query = query.where(XAPIStatement.developer_id == filters.developer_id)
            if filters.verb_id:
                query = query.where(XAPIStatement.verb_id == filters.verb_id)
            if filters.verb_type:
                query = query.where(XAPIStatement.verb_type == filters.verb_type)
            if filters.object_id:
                query = query.where(XAPIStatement.object_id == filters.object_id)
            if filters.from_date:
                query = query.where(XAPIStatement.timestamp >= filters.from_date)
            if filters.to_date:
                query = query.where(XAPIStatement.timestamp <= filters.to_date)

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(XAPIStatement.timestamp.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        statements = list(result.scalars().all())

        return statements, total

    # ==================== Calendar Integrations ====================

    async def create_calendar_integration(
        self,
        workspace_id: str,
        developer_id: str,
        data: CalendarIntegrationCreate,
    ) -> LearningCalendarIntegration:
        """Create a new calendar integration for a developer."""
        integration = LearningCalendarIntegration(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            developer_id=developer_id,
            provider=data.provider,
            calendar_id=data.calendar_id,
            sync_learning_sessions=data.sync_learning_sessions,
            sync_deadlines=data.sync_deadlines,
            sync_certifications=data.sync_certifications,
            status=IntegrationStatus.PENDING_SETUP,
            is_active=True,
            extra_data=data.extra_data,
        )

        self.db.add(integration)
        await self.db.commit()
        await self.db.refresh(integration)
        return integration

    async def update_calendar_integration(
        self,
        integration_id: str,
        developer_id: str,
        data: CalendarIntegrationUpdate,
    ) -> LearningCalendarIntegration | None:
        """Update a calendar integration."""
        result = await self.db.execute(
            select(LearningCalendarIntegration).where(
                and_(
                    LearningCalendarIntegration.id == integration_id,
                    LearningCalendarIntegration.developer_id == developer_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(integration, field):
                setattr(integration, field, value)

        await self.db.commit()
        await self.db.refresh(integration)
        return integration

    async def list_calendar_integrations(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LearningCalendarIntegration], int]:
        """List calendar integrations."""
        query = select(LearningCalendarIntegration).where(
            LearningCalendarIntegration.workspace_id == workspace_id
        )

        if developer_id:
            query = query.where(LearningCalendarIntegration.developer_id == developer_id)

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(LearningCalendarIntegration.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        integrations = list(result.scalars().all())

        return integrations, total

    async def delete_calendar_integration(
        self,
        integration_id: str,
        developer_id: str,
    ) -> bool:
        """Delete a calendar integration."""
        result = await self.db.execute(
            select(LearningCalendarIntegration).where(
                and_(
                    LearningCalendarIntegration.id == integration_id,
                    LearningCalendarIntegration.developer_id == developer_id,
                )
            )
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return False

        await self.db.delete(integration)
        await self.db.commit()
        return True

    async def create_calendar_event(
        self,
        integration_id: str,
        workspace_id: str,
        developer_id: str,
        data: CalendarEventCreate,
    ) -> LearningCalendarEvent:
        """Create a calendar event."""
        event = LearningCalendarEvent(
            id=str(uuid.uuid4()),
            integration_id=integration_id,
            workspace_id=workspace_id,
            developer_id=developer_id,
            linked_entity_type=data.linked_entity_type,
            linked_entity_id=data.linked_entity_id,
            title=data.title,
            description=data.description,
            start_time=data.start_time,
            end_time=data.end_time,
            is_all_day=data.is_all_day,
            extra_data=data.extra_data,
        )

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        # In production, this would sync to the external calendar
        return event

    async def list_calendar_events(
        self,
        integration_id: str,
        developer_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LearningCalendarEvent], int]:
        """List calendar events for an integration."""
        query = select(LearningCalendarEvent).where(
            and_(
                LearningCalendarEvent.integration_id == integration_id,
                LearningCalendarEvent.developer_id == developer_id,
            )
        )

        # Count total
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginate
        query = query.order_by(LearningCalendarEvent.start_time.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        events = list(result.scalars().all())

        return events, total
