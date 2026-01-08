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
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test report creation."""
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            description=sample_report_config["description"],
            widgets=sample_report_config["widgets"],
            filters=sample_report_config["filters"],
        )

        result = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        assert result is not None
        assert result.name == sample_report_config["name"]
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
            filters={},
        )

        result = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        assert result is not None
        assert result.widgets == []

    @pytest.mark.asyncio
    async def test_get_report(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test getting a report by ID."""
        # First create a report
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            widgets=sample_report_config["widgets"],
            filters={},
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Then fetch it
        result = await service.get_report(created.id, db_session)

        assert result is not None
        assert result.id == created.id
        assert result.name == sample_report_config["name"]

    @pytest.mark.asyncio
    async def test_get_report_not_found(self, service, db_session):
        """Test getting a non-existent report."""
        result = await service.get_report("nonexistent-id", db_session)

        assert result is None

    @pytest.mark.asyncio
    async def test_update_report(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test updating a report."""
        # Create report
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            widgets=sample_report_config["widgets"],
            filters={},
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Update it
        update_data = CustomReportUpdate(
            name="Updated Report Name",
            description="Updated description",
        )
        result = await service.update_report(created.id, update_data, db_session)

        assert result is not None
        assert result.name == "Updated Report Name"
        assert result.description == "Updated description"

    @pytest.mark.asyncio
    async def test_update_report_partial(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test partial report update."""
        # Create report
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            description="Original description",
            widgets=sample_report_config["widgets"],
            filters={},
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Update only name
        update_data = CustomReportUpdate(name="New Name Only")
        result = await service.update_report(created.id, update_data, db_session)

        assert result.name == "New Name Only"
        assert result.description == "Original description"  # Unchanged

    @pytest.mark.asyncio
    async def test_delete_report(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test deleting a report."""
        # Create report
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            widgets=[],
            filters={},
        )
        created = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Delete it
        await service.delete_report(created.id, db_session)

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
                filters={},
            )
            await service.create_report(
                sample_developer.id, report_data, db_session
            )

        # List reports
        results = await service.list_reports(
            creator_id=sample_developer.id, db=db_session
        )

        assert len(results) >= 3

    @pytest.mark.asyncio
    async def test_clone_report(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test cloning a report."""
        # Create original report
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            description="Original",
            widgets=sample_report_config["widgets"],
            filters=sample_report_config["filters"],
        )
        original = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Clone it
        clone = await service.clone_report(
            original.id, "Cloned Report", sample_developer.id, db_session
        )

        assert clone is not None
        assert clone.id != original.id
        assert clone.name == "Cloned Report"
        assert clone.widgets == original.widgets

    # Template Tests

    @pytest.mark.asyncio
    async def test_get_templates(self, service):
        """Test getting report templates."""
        templates = service.get_templates()

        assert len(templates) > 0
        for template in templates:
            assert "id" in template
            assert "name" in template
            assert "category" in template

    @pytest.mark.asyncio
    async def test_get_templates_by_category(self, service):
        """Test filtering templates by category."""
        templates = service.get_templates(category="team")

        for template in templates:
            assert template["category"] == "team"

    @pytest.mark.asyncio
    async def test_create_from_template(
        self, service, db_session, sample_developer
    ):
        """Test creating a report from a template."""
        templates = service.get_templates()
        template_id = templates[0]["id"] if templates else "weekly_team"

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

    # Widget Data Tests

    @pytest.mark.asyncio
    async def test_get_widget_data_skill_heatmap(
        self, service, db_session, sample_developers
    ):
        """Test fetching skill heatmap widget data."""
        widget = WidgetConfig(
            type="skill_heatmap",
            config={},
        )
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.get_widget_data(
            widget, db_session, developer_ids=developer_ids
        )

        assert result is not None
        assert "skills" in result or "data" in result

    @pytest.mark.asyncio
    async def test_get_widget_data_productivity(
        self, service, db_session, sample_developer, sample_commits_db
    ):
        """Test fetching productivity widget data."""
        widget = WidgetConfig(
            type="productivity_chart",
            config={"period": "30d"},
        )

        result = await service.get_widget_data(
            widget, db_session, developer_ids=[sample_developer.id]
        )

        assert result is not None

    @pytest.mark.asyncio
    async def test_get_widget_data_invalid_type(self, service, db_session):
        """Test fetching data for invalid widget type."""
        widget = WidgetConfig(
            type="invalid_widget_type",
            config={},
        )

        result = await service.get_widget_data(widget, db_session)

        assert result is None or result == {}

    # Schedule Tests

    @pytest.mark.asyncio
    async def test_create_schedule(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test creating a report schedule."""
        # First create a report
        report_data = CustomReportCreate(
            name=sample_report_config["name"],
            widgets=[],
            filters={},
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Create schedule
        schedule_data = ScheduledReportCreate(
            schedule="weekly",
            day_of_week=1,
            time_utc="09:00",
            recipients=["test@example.com"],
            delivery_method="email",
            export_format="pdf",
        )

        result = await service.create_schedule(
            report.id, schedule_data, db_session
        )

        assert result is not None
        assert result.report_id == report.id
        assert result.schedule == "weekly"

    @pytest.mark.asyncio
    async def test_create_daily_schedule(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test creating a daily schedule."""
        # Create report
        report_data = CustomReportCreate(
            name="Daily Report",
            widgets=[],
            filters={},
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        # Create daily schedule
        schedule_data = ScheduledReportCreate(
            schedule="daily",
            time_utc="08:00",
            recipients=["team@example.com"],
            delivery_method="email",
            export_format="csv",
        )

        result = await service.create_schedule(
            report.id, schedule_data, db_session
        )

        assert result.schedule == "daily"

    @pytest.mark.asyncio
    async def test_list_schedules(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test listing schedules for a report."""
        # Create report with schedule
        report_data = CustomReportCreate(
            name="Scheduled Report",
            widgets=[],
            filters={},
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        schedule_data = ScheduledReportCreate(
            schedule="weekly",
            day_of_week=5,
            time_utc="17:00",
            recipients=["manager@example.com"],
            delivery_method="slack",
            export_format="pdf",
        )
        await service.create_schedule(report.id, schedule_data, db_session)

        # List schedules
        schedules = await service.list_schedules(report.id, db_session)

        assert len(schedules) >= 1

    @pytest.mark.asyncio
    async def test_delete_schedule(
        self, service, db_session, sample_developer, sample_report_config
    ):
        """Test deleting a schedule."""
        # Create report and schedule
        report_data = CustomReportCreate(
            name="Report with Schedule",
            widgets=[],
            filters={},
        )
        report = await service.create_report(
            sample_developer.id, report_data, db_session
        )

        schedule_data = ScheduledReportCreate(
            schedule="monthly",
            day_of_month=1,
            time_utc="10:00",
            recipients=["report@example.com"],
            delivery_method="email",
            export_format="xlsx",
        )
        schedule = await service.create_schedule(
            report.id, schedule_data, db_session
        )

        # Delete schedule
        await service.delete_schedule(schedule.id, db_session)

        # Verify deletion
        schedules = await service.list_schedules(report.id, db_session)
        schedule_ids = [s.id for s in schedules]
        assert schedule.id not in schedule_ids


class TestReportValidation:
    """Unit tests for report validation logic."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return ReportBuilderService()

    def test_validate_widget_config_valid(self, service):
        """Test validation of valid widget config."""
        widget = {
            "type": "skill_heatmap",
            "config": {"show_legend": True},
            "position": {"x": 0, "y": 0, "w": 2, "h": 1},
        }

        is_valid = service._validate_widget_config(widget)
        assert is_valid is True

    def test_validate_widget_config_missing_type(self, service):
        """Test validation fails for missing type."""
        widget = {
            "config": {},
            "position": {"x": 0, "y": 0},
        }

        is_valid = service._validate_widget_config(widget)
        assert is_valid is False

    def test_validate_schedule_weekly(self, service):
        """Test validation of weekly schedule."""
        schedule = {
            "schedule": "weekly",
            "day_of_week": 1,
            "time_utc": "09:00",
        }

        is_valid = service._validate_schedule(schedule)
        assert is_valid is True

    def test_validate_schedule_monthly(self, service):
        """Test validation of monthly schedule."""
        schedule = {
            "schedule": "monthly",
            "day_of_month": 15,
            "time_utc": "10:00",
        }

        is_valid = service._validate_schedule(schedule)
        assert is_valid is True

    def test_validate_schedule_invalid_day(self, service):
        """Test validation fails for invalid day."""
        schedule = {
            "schedule": "weekly",
            "day_of_week": 10,  # Invalid
            "time_utc": "09:00",
        }

        is_valid = service._validate_schedule(schedule)
        assert is_valid is False
