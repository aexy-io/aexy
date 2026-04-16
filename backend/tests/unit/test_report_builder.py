"""
Tests for ReportBuilderService.

These tests verify:
- Report CRUD operations
- Template management
- Widget data fetching
- Report scheduling
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from aexy.services.report_builder import ReportBuilderService
from aexy.schemas.analytics import (
    CustomReportCreate,
    CustomReportUpdate,
    WidgetConfig,
    ScheduledReportCreate,
    WidgetType,
    MetricType,
    ScheduleFrequency,
    DeliveryMethod,
    ExportFormat,
    ReportFilters,
)


class TestReportBuilderService:
    """Tests for ReportBuilderService."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return ReportBuilderService()

    # Report CRUD Tests

    @pytest.mark.asyncio
    async def test_create_report(
        self, service, db_session, sample_developer
    ):
        """Test report creation."""
        report_data = CustomReportCreate(
            name="Weekly Team Report",
            description="Weekly summary of team performance",
            widgets=[],
        )

        result = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        assert result is not None
        assert result.name == "Weekly Team Report"
        assert result.creator_id == sample_developer.id

    @pytest.mark.asyncio
    async def test_create_report_with_empty_widgets(
        self, service, db_session, sample_developer
    ):
        """Test report creation with no widgets."""
        report_data = CustomReportCreate(
            name="Empty Report",
            description="A report with no widgets",
            widgets=[],
        )

        result = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        assert result is not None
        assert result.widgets == []

    @pytest.mark.asyncio
    async def test_get_report(
        self, service, db_session, sample_developer
    ):
        """Test getting a report by ID."""
        # First create a report
        report_data = CustomReportCreate(
            name="Test Report",
            widgets=[],
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Then fetch it
        result = await service.get_report(created.id, db_session)

        assert result is not None
        assert result.id == created.id
        assert result.name == "Test Report"

    @pytest.mark.asyncio
    async def test_get_report_not_found(self, service, db_session):
        """Test getting a non-existent report."""
        result = await service.get_report("nonexistent-id", db_session)

        assert result is None

    @pytest.mark.asyncio
    async def test_update_report(
        self, service, db_session, sample_developer
    ):
        """Test updating a report."""
        # Create report
        report_data = CustomReportCreate(
            name="Original Name",
            widgets=[],
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Update it
        update_data = CustomReportUpdate(
            name="Updated Report Name",
            description="Updated description",
        )
        result = await service.update_report(
            created.id, update_data, db_session, user_id=sample_developer.id
        )

        assert result is not None
        assert result.name == "Updated Report Name"
        assert result.description == "Updated description"

    @pytest.mark.asyncio
    async def test_update_report_partial(
        self, service, db_session, sample_developer
    ):
        """Test partial report update."""
        # Create report
        report_data = CustomReportCreate(
            name="Original Name",
            description="Original description",
            widgets=[],
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Update only name
        update_data = CustomReportUpdate(name="New Name Only")
        result = await service.update_report(
            created.id, update_data, db_session, user_id=sample_developer.id
        )

        assert result.name == "New Name Only"
        assert result.description == "Original description"  # Unchanged

    @pytest.mark.asyncio
    async def test_delete_report(
        self, service, db_session, sample_developer
    ):
        """Test deleting a report."""
        # Create report
        report_data = CustomReportCreate(
            name="Report to Delete",
            widgets=[],
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Delete it
        deleted = await service.delete_report(
            created.id, db_session, user_id=sample_developer.id
        )

        assert deleted is True

        # Verify deletion
        result = await service.get_report(created.id, db_session)
        assert result is None

    @pytest.mark.asyncio
    async def test_list_reports_by_creator(
        self, service, db_session, sample_developer
    ):
        """Test listing reports by creator."""
        # Create multiple reports
        for i in range(3):
            report_data = CustomReportCreate(
                name=f"Report {i}",
                widgets=[],
            )
            await service.create_report(
                sample_developer.id, report_data, db_session
            )

        # List reports
        results = await service.list_reports(
            db=db_session, creator_id=sample_developer.id
        )

        assert len(results) >= 3

    @pytest.mark.asyncio
    async def test_clone_report(
        self, service, db_session, sample_developer
    ):
        """Test cloning a report."""
        # Create original report
        report_data = CustomReportCreate(
            name="Original Report",
            description="Original",
            widgets=[],
        )
        original = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Clone it
        clone = await service.clone_report(
            original.id, "Cloned Report", db_session, user_id=sample_developer.id
        )

        assert clone is not None
        assert clone.id != original.id
        assert clone.name == "Cloned Report"

    # Template Tests

    @pytest.mark.asyncio
    async def test_get_templates(self, service):
        """Test getting report templates."""
        templates = service.get_templates()

        assert len(templates) > 0
        for template in templates:
            assert hasattr(template, "id")
            assert hasattr(template, "name")
            assert hasattr(template, "category")

    @pytest.mark.asyncio
    async def test_get_templates_by_category(self, service):
        """Test filtering templates by category."""
        templates = service.get_templates(category="team")

        for template in templates:
            assert template.category == "team"

    @pytest.mark.asyncio
    async def test_create_from_template(
        self, service, db_session, sample_developer
    ):
        """Test creating a report from a template."""
        templates = service.get_templates()
        template_id = templates[0].id if templates else "template-weekly-team"

        result = await service.create_from_template(
            template_id, sample_developer.id, db_session
        )

        assert result is not None
        assert result.creator_id == sample_developer.id

    @pytest.mark.asyncio
    async def test_create_from_invalid_template(
        self, service, db_session, sample_developer
    ):
        """Test creating from non-existent template."""
        result = await service.create_from_template(
            "nonexistent-template", sample_developer.id, db_session
        )

        assert result is None

    # Schedule Tests

    @pytest.mark.asyncio
    async def test_create_schedule(
        self, service, db_session, sample_developer
    ):
        """Test creating a report schedule."""
        # First create a report
        report_data = CustomReportCreate(
            name="Scheduled Report",
            widgets=[],
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Create schedule
        schedule_data = ScheduledReportCreate(
            report_id=report.id,
            schedule=ScheduleFrequency.WEEKLY,
            day_of_week=1,
            time_utc="09:00",
            recipients=["test@example.com"],
            delivery_method=DeliveryMethod.EMAIL,
            export_format=ExportFormat.PDF,
        )

        result = await service.create_schedule(
            report.id, schedule_data, db_session, user_id=sample_developer.id
        )

        assert result is not None
        assert result.report_id == report.id
        assert result.schedule == "weekly"

    @pytest.mark.asyncio
    async def test_create_daily_schedule(
        self, service, db_session, sample_developer
    ):
        """Test creating a daily schedule."""
        # Create report
        report_data = CustomReportCreate(
            name="Daily Report",
            widgets=[],
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Create daily schedule
        schedule_data = ScheduledReportCreate(
            report_id=report.id,
            schedule=ScheduleFrequency.DAILY,
            time_utc="08:00",
            recipients=["team@example.com"],
            delivery_method=DeliveryMethod.EMAIL,
            export_format=ExportFormat.CSV,
        )

        result = await service.create_schedule(
            report.id, schedule_data, db_session, user_id=sample_developer.id
        )

        assert result.schedule == "daily"

    @pytest.mark.asyncio
    async def test_list_schedules(
        self, service, db_session, sample_developer
    ):
        """Test listing schedules for a report."""
        # Create report with schedule
        report_data = CustomReportCreate(
            name="Scheduled Report",
            widgets=[],
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        schedule_data = ScheduledReportCreate(
            report_id=report.id,
            schedule=ScheduleFrequency.WEEKLY,
            day_of_week=5,
            time_utc="17:00",
            recipients=["manager@example.com"],
            delivery_method=DeliveryMethod.SLACK,
            export_format=ExportFormat.PDF,
        )
        await service.create_schedule(
            report.id, schedule_data, db_session, user_id=sample_developer.id
        )

        # List schedules
        schedules = await service.list_schedules(db_session, report_id=report.id)

        assert len(schedules) >= 1

    @pytest.mark.asyncio
    async def test_delete_schedule(
        self, service, db_session, sample_developer
    ):
        """Test deleting a schedule."""
        # Create report and schedule
        report_data = CustomReportCreate(
            name="Report with Schedule",
            widgets=[],
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        schedule_data = ScheduledReportCreate(
            report_id=report.id,
            schedule=ScheduleFrequency.MONTHLY,
            day_of_month=1,
            time_utc="10:00",
            recipients=["report@example.com"],
            delivery_method=DeliveryMethod.EMAIL,
            export_format=ExportFormat.XLSX,
        )
        schedule = await service.create_schedule(
            report.id, schedule_data, db_session, user_id=sample_developer.id
        )

        # Delete schedule
        deleted = await service.delete_schedule(schedule.id, db_session)

        assert deleted is True

        # Verify deletion
        schedules = await service.list_schedules(db_session, report_id=report.id)
        schedule_ids = [s.id for s in schedules]
        assert schedule.id not in schedule_ids


class TestReportScheduleCalculation:
    """Unit tests for schedule calculation logic."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return ReportBuilderService()

    def test_calculate_next_run_daily(self, service):
        """Test daily schedule next run calculation."""
        next_run = service._calculate_next_run(
            frequency=ScheduleFrequency.DAILY,
            time_utc="09:00",
        )

        assert next_run is not None
        assert next_run > datetime.utcnow()

    def test_calculate_next_run_weekly(self, service):
        """Test weekly schedule next run calculation."""
        next_run = service._calculate_next_run(
            frequency=ScheduleFrequency.WEEKLY,
            time_utc="09:00",
            day_of_week=1,
        )

        assert next_run is not None
        assert next_run > datetime.utcnow()

    def test_calculate_next_run_monthly(self, service):
        """Test monthly schedule next run calculation."""
        next_run = service._calculate_next_run(
            frequency=ScheduleFrequency.MONTHLY,
            time_utc="10:00",
            day_of_month=15,
        )

        assert next_run is not None
        assert next_run > datetime.utcnow()
