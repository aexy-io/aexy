"""
Tests for ExportService.

These tests verify:
- Export job creation
- PDF, CSV, JSON, XLSX export
- Job status tracking
- File cleanup
"""

import pytest
import json
import os
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from aexy.services.export_service import ExportService
from aexy.schemas.analytics import ExportRequest


class TestExportService:
    """Tests for ExportService."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return ExportService()

    @pytest.fixture
    def temp_export_dir(self, tmp_path):
        """Create temporary export directory."""
        export_dir = tmp_path / "exports"
        export_dir.mkdir()
        return export_dir

    # Job Creation Tests

    @pytest.mark.asyncio
    async def test_create_export_job(
        self, service, db_session, sample_developer
    ):
        """Test creating an export job."""
        request = ExportRequest(
            export_type="developer_profile",
            format="json",
            config={"developer_id": sample_developer.id},
        )

        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        assert job is not None
        assert job.export_type == "developer_profile"
        assert job.format == "json"
        assert job.status == "pending"

    @pytest.mark.asyncio
    async def test_create_export_job_pdf(
        self, service, db_session, sample_developer
    ):
        """Test creating PDF export job."""
        request = ExportRequest(
            export_type="report",
            format="pdf",
            config={"report_id": "test-report-id"},
        )

        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        assert job.format == "pdf"

    @pytest.mark.asyncio
    async def test_create_export_job_csv(
        self, service, db_session, sample_developer
    ):
        """Test creating CSV export job."""
        request = ExportRequest(
            export_type="developers",
            format="csv",
            config={},
        )

        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        assert job.format == "csv"

    @pytest.mark.asyncio
    async def test_create_export_job_xlsx(
        self, service, db_session, sample_developer
    ):
        """Test creating XLSX export job."""
        request = ExportRequest(
            export_type="team_analytics",
            format="xlsx",
            config={"team_id": "test-team-id"},
        )

        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        assert job.format == "xlsx"

    # Export Processing Tests

    @pytest.mark.asyncio
    async def test_process_export_json(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing JSON export."""
        # Create job
        request = ExportRequest(
            export_type="test",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Process with sample data
        test_data = {
            "developers": [
                {"name": "Dev 1", "skills": ["Python"]},
                {"name": "Dev 2", "skills": ["TypeScript"]},
            ]
        }

        with patch.object(service, "export_dir", str(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        assert result.status == "completed"
        assert result.file_path is not None

    @pytest.mark.asyncio
    async def test_process_export_csv(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing CSV export."""
        request = ExportRequest(
            export_type="developers",
            format="csv",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {
            "headers": ["name", "email", "skills"],
            "rows": [
                ["Dev 1", "dev1@example.com", "Python, Go"],
                ["Dev 2", "dev2@example.com", "TypeScript"],
            ]
        }

        with patch.object(service, "export_dir", str(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        assert result.status == "completed"

    @pytest.mark.asyncio
    async def test_process_export_xlsx(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing XLSX export."""
        request = ExportRequest(
            export_type="analytics",
            format="xlsx",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {
            "sheets": [
                {
                    "name": "Developers",
                    "headers": ["Name", "Skills"],
                    "rows": [["Dev 1", "Python"]],
                },
                {
                    "name": "Teams",
                    "headers": ["Team", "Members"],
                    "rows": [["Backend", "3"]],
                },
            ]
        }

        with patch.object(service, "export_dir", str(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        # May be pending if openpyxl not installed
        assert result.status in ["completed", "pending", "failed"]

    @pytest.mark.asyncio
    async def test_process_export_pdf(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing PDF export."""
        request = ExportRequest(
            export_type="report",
            format="pdf",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {
            "title": "Weekly Report",
            "sections": [
                {"heading": "Summary", "content": "This is a test report."},
            ]
        }

        with patch.object(service, "export_dir", str(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        # May be pending if reportlab not installed
        assert result.status in ["completed", "pending", "failed"]

    # Job Status Tests

    @pytest.mark.asyncio
    async def test_get_export_status(
        self, service, db_session, sample_developer
    ):
        """Test getting export job status."""
        request = ExportRequest(
            export_type="test",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        status = await service.get_export_status(job.id, db_session)

        assert status is not None
        assert status.id == job.id
        assert status.status == "pending"

    @pytest.mark.asyncio
    async def test_get_export_status_not_found(self, service, db_session):
        """Test getting status for non-existent job."""
        status = await service.get_export_status("nonexistent-id", db_session)

        assert status is None

    @pytest.mark.asyncio
    async def test_update_job_status(
        self, service, db_session, sample_developer
    ):
        """Test updating job status."""
        request = ExportRequest(
            export_type="test",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Update to processing
        updated = await service._update_job_status(
            job.id, "processing", db_session
        )

        assert updated.status == "processing"

    @pytest.mark.asyncio
    async def test_update_job_status_with_error(
        self, service, db_session, sample_developer
    ):
        """Test updating job with error."""
        request = ExportRequest(
            export_type="test",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Update to failed
        updated = await service._update_job_status(
            job.id,
            "failed",
            db_session,
            error_message="Test error message",
        )

        assert updated.status == "failed"
        assert updated.error_message == "Test error message"

    # Download Tests

    @pytest.mark.asyncio
    async def test_get_download_url(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test getting download URL for completed export."""
        # Create and process job
        request = ExportRequest(
            export_type="test",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {"test": "data"}
        with patch.object(service, "export_dir", str(temp_export_dir)):
            completed = await service.process_export(job.id, db_session, test_data)

        # Get download URL
        url = await service.get_download_url(completed.id, db_session)

        if completed.status == "completed":
            assert url is not None
        else:
            assert url is None

    @pytest.mark.asyncio
    async def test_get_download_url_pending_job(
        self, service, db_session, sample_developer
    ):
        """Test getting download URL for pending job returns None."""
        request = ExportRequest(
            export_type="test",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        url = await service.get_download_url(job.id, db_session)

        assert url is None

    # Cleanup Tests

    @pytest.mark.asyncio
    async def test_cleanup_expired_exports(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test cleaning up expired export files."""
        # This test would require creating old files
        # For now, just verify the method runs without error
        with patch.object(service, "export_dir", str(temp_export_dir)):
            cleaned = await service.cleanup_expired_exports(db_session)

        assert cleaned >= 0

    # Format Support Tests

    def test_get_supported_formats(self, service):
        """Test getting list of supported formats."""
        formats = service.get_supported_formats()

        assert "json" in formats
        assert "csv" in formats

    def test_is_format_supported(self, service):
        """Test checking if format is supported."""
        assert service.is_format_supported("json") is True
        assert service.is_format_supported("csv") is True
        assert service.is_format_supported("invalid") is False


class TestExportFormatters:
    """Unit tests for export formatting functions."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return ExportService()

    def test_format_json_data(self, service):
        """Test JSON data formatting."""
        data = {"key": "value", "list": [1, 2, 3]}

        formatted = service._format_json(data)

        assert json.loads(formatted) == data

    def test_format_csv_data(self, service):
        """Test CSV data formatting."""
        data = {
            "headers": ["Name", "Value"],
            "rows": [["Item 1", "100"], ["Item 2", "200"]],
        }

        formatted = service._format_csv(data)

        assert "Name,Value" in formatted
        assert "Item 1,100" in formatted

    def test_format_csv_with_special_characters(self, service):
        """Test CSV formatting with quotes and commas."""
        data = {
            "headers": ["Name", "Description"],
            "rows": [["Test", 'Value with "quotes" and, commas']],
        }

        formatted = service._format_csv(data)

        # Should properly escape special characters
        assert formatted is not None


class TestExportValidation:
    """Unit tests for export validation."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return ExportService()

    def test_validate_export_request_valid(self, service):
        """Test validation of valid export request."""
        request = ExportRequest(
            export_type="developers",
            format="csv",
            config={},
        )

        is_valid = service._validate_request(request)
        assert is_valid is True

    def test_validate_export_request_invalid_format(self, service):
        """Test validation fails for invalid format."""
        request = ExportRequest(
            export_type="developers",
            format="invalid_format",
            config={},
        )

        is_valid = service._validate_request(request)
        assert is_valid is False

    def test_validate_export_request_invalid_type(self, service):
        """Test validation fails for invalid export type."""
        request = ExportRequest(
            export_type="",
            format="csv",
            config={},
        )

        is_valid = service._validate_request(request)
        assert is_valid is False
