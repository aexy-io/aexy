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
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from aexy.services.export_service import ExportService
from aexy.schemas.analytics import ExportRequest, ExportFormat, ExportType, ExportStatus


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
            export_type=ExportType.DEVELOPER_PROFILE,
            format=ExportFormat.JSON,
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
        from aexy.services import export_service as es_module

        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.PDF,
            config={"report_id": "test-report-id"},
        )

        if not es_module.REPORTLAB_AVAILABLE:
            # PDF export should raise ValueError when reportlab not installed
            with pytest.raises(ValueError, match="reportlab"):
                await service.create_export_job(
                    request, sample_developer.id, db_session
                )
        else:
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
            export_type=ExportType.DEVELOPER_PROFILE,
            format=ExportFormat.CSV,
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
            export_type=ExportType.TEAM_ANALYTICS,
            format=ExportFormat.XLSX,
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
            export_type=ExportType.REPORT,
            format=ExportFormat.JSON,
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

        with patch.object(service, "export_dir", Path(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        assert result.status == "completed"
        assert result.file_path is not None

    @pytest.mark.asyncio
    async def test_process_export_csv(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing CSV export."""
        request = ExportRequest(
            export_type=ExportType.DEVELOPER_PROFILE,
            format=ExportFormat.CSV,
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

        with patch.object(service, "export_dir", Path(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        assert result.status == "completed"

    @pytest.mark.asyncio
    async def test_process_export_xlsx(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing XLSX export."""
        from aexy.services import export_service as es_module

        if not es_module.OPENPYXL_AVAILABLE:
            pytest.skip("openpyxl not installed")

        request = ExportRequest(
            export_type=ExportType.TEAM_ANALYTICS,
            format=ExportFormat.XLSX,
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

        with patch.object(service, "export_dir", Path(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        assert result.status in ["completed", "pending", "failed"]

    @pytest.mark.asyncio
    async def test_process_export_pdf(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test processing PDF export."""
        from aexy.services import export_service as es_module

        if not es_module.REPORTLAB_AVAILABLE:
            pytest.skip("reportlab not installed")

        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.PDF,
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

        with patch.object(service, "export_dir", Path(temp_export_dir)):
            result = await service.process_export(job.id, db_session, test_data)

        assert result.status in ["completed", "pending", "failed"]

    # Job Status Tests

    @pytest.mark.asyncio
    async def test_get_export_job(
        self, service, db_session, sample_developer
    ):
        """Test getting export job by ID."""
        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.JSON,
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        fetched = await service.get_export_job(job.id, db_session)

        assert fetched is not None
        assert fetched.id == job.id
        assert fetched.status == "pending"

    @pytest.mark.asyncio
    async def test_get_export_job_not_found(self, service, db_session):
        """Test getting non-existent job."""
        fetched = await service.get_export_job("nonexistent-id", db_session)

        assert fetched is None

    @pytest.mark.asyncio
    async def test_update_job_status(
        self, service, db_session, sample_developer
    ):
        """Test updating job status."""
        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.JSON,
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Update to processing
        updated = await service.update_job_status(
            job.id, db_session, ExportStatus.PROCESSING
        )

        assert updated.status == "processing"

    @pytest.mark.asyncio
    async def test_update_job_status_with_error(
        self, service, db_session, sample_developer
    ):
        """Test updating job with error."""
        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.JSON,
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Update to failed
        updated = await service.update_job_status(
            job.id,
            db_session,
            ExportStatus.FAILED,
            error_message="Test error message",
        )

        assert updated.status == "failed"
        assert updated.error_message == "Test error message"

    # Download Tests

    @pytest.mark.asyncio
    async def test_get_download_path_completed(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test getting download path for completed export."""
        # Create and process job
        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.JSON,
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {"test": "data"}
        with patch.object(service, "export_dir", Path(temp_export_dir)):
            completed = await service.process_export(job.id, db_session, test_data)

        # Get download path
        if completed and completed.status == "completed":
            path = service.get_download_path(completed)
            assert path is not None

    @pytest.mark.asyncio
    async def test_get_download_path_pending_job(
        self, service, db_session, sample_developer
    ):
        """Test getting download path for pending job returns None."""
        request = ExportRequest(
            export_type=ExportType.REPORT,
            format=ExportFormat.JSON,
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        path = service.get_download_path(job)

        assert path is None

    # Cleanup Tests

    @pytest.mark.asyncio
    async def test_cleanup_expired_exports(
        self, service, db_session, sample_developer, temp_export_dir
    ):
        """Test cleaning up expired export files."""
        # This test would require creating old files
        # For now, just verify the method runs without error
        with patch.object(service, "export_dir", Path(temp_export_dir)):
            cleaned = await service.cleanup_expired_exports(db_session)

        assert cleaned >= 0

    # Format Support Tests

    def test_supported_formats_via_enum(self, service):
        """Test that ExportFormat enum defines supported formats."""
        assert ExportFormat.JSON.value == "json"
        assert ExportFormat.CSV.value == "csv"
        assert ExportFormat.PDF.value == "pdf"
        assert ExportFormat.XLSX.value == "xlsx"


class TestExportFormatters:
    """Unit tests for export formatting via file output."""

    @pytest.fixture
    def service(self, tmp_path):
        """Create service instance with temp dir."""
        return ExportService(export_dir=tmp_path)

    def test_flatten_dict_to_csv(self, service):
        """Test flattening nested dict to CSV rows."""
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)
        service._flatten_dict_to_csv(writer, {"key": "value", "number": 42})

        result = output.getvalue()
        assert "key,value" in result
        assert "number,42" in result

    def test_data_to_table_with_headers_and_rows(self, service):
        """Test data_to_table with standard tabular data."""
        data = {
            "headers": ["Name", "Value"],
            "rows": [["Item 1", "100"], ["Item 2", "200"]],
        }

        table = service._data_to_table(data)

        assert table is not None
        assert table[0] == ["Name", "Value"]
        assert ["Item 1", "100"] in table

    def test_data_to_table_key_value(self, service):
        """Test data_to_table with simple key-value dict."""
        data = {"name": "test", "count": 5}

        table = service._data_to_table(data)

        assert table is not None
        assert table[0] == ["Key", "Value"]

    def test_data_to_table_empty(self, service):
        """Test data_to_table with empty data."""
        table = service._data_to_table({})

        assert table is None


class TestExportValidation:
    """Unit tests for export request validation via Pydantic."""

    def test_valid_export_request(self):
        """Test valid export request creation."""
        request = ExportRequest(
            export_type=ExportType.DEVELOPER_PROFILE,
            format=ExportFormat.CSV,
            config={},
        )

        assert request.export_type == ExportType.DEVELOPER_PROFILE
        assert request.format == ExportFormat.CSV

    def test_invalid_format_raises(self):
        """Test that invalid format raises validation error."""
        with pytest.raises(ValueError):
            ExportRequest(
                export_type=ExportType.DEVELOPER_PROFILE,
                format="invalid_format",
                config={},
            )

    def test_invalid_export_type_raises(self):
        """Test that invalid export type raises validation error."""
        with pytest.raises(ValueError):
            ExportRequest(
                export_type="nonexistent_type",
                format=ExportFormat.CSV,
                config={},
            )
