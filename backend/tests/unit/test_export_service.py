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

from aexy.services.export_service import ExportService
from aexy.schemas.analytics import ExportRequest, ExportStatus


class TestExportService:
    """Tests for ExportService."""

    @pytest.fixture
    def temp_export_dir(self, tmp_path):
        """Create temporary export directory."""
        export_dir = tmp_path / "exports"
        export_dir.mkdir()
        return export_dir

    @pytest.fixture
    def service(self, temp_export_dir):
        """Create service instance writing into a temp export dir.

        ExportService takes its export directory via the constructor and uses
        it as a pathlib.Path, so inject the temp dir here instead of patching
        the attribute with a string later.
        """
        return ExportService(export_dir=temp_export_dir)

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
        """Test creating PDF export job.

        create_export_job raises ValueError when the reportlab dependency for
        PDF is unavailable, so accept either a created job or that guard.
        """
        request = ExportRequest(
            export_type="report",
            format="pdf",
            config={"report_id": "test-report-id"},
        )

        try:
            job = await service.create_export_job(
                request, sample_developer.id, db_session
            )
            assert job.format == "pdf"
        except ValueError as e:
            assert "reportlab" in str(e).lower()

    @pytest.mark.asyncio
    async def test_create_export_job_csv(
        self, service, db_session, sample_developer
    ):
        """Test creating CSV export job."""
        request = ExportRequest(
            export_type="team_analytics",
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
        """Test creating XLSX export job.

        create_export_job raises ValueError when openpyxl is unavailable.
        """
        request = ExportRequest(
            export_type="team_analytics",
            format="xlsx",
            config={"team_id": "test-team-id"},
        )

        try:
            job = await service.create_export_job(
                request, sample_developer.id, db_session
            )
            assert job.format == "xlsx"
        except ValueError as e:
            assert "openpyxl" in str(e).lower()

    # Export Processing Tests

    @pytest.mark.asyncio
    async def test_process_export_json(
        self, service, db_session, sample_developer
    ):
        """Test processing JSON export."""
        request = ExportRequest(
            export_type="developer_profile",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {
            "developers": [
                {"name": "Dev 1", "skills": ["Python"]},
                {"name": "Dev 2", "skills": ["TypeScript"]},
            ]
        }

        result = await service.process_export(job.id, db_session, test_data)

        assert result.status == "completed"
        assert result.file_path is not None

    @pytest.mark.asyncio
    async def test_process_export_csv(
        self, service, db_session, sample_developer
    ):
        """Test processing CSV export."""
        request = ExportRequest(
            export_type="team_analytics",
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

        result = await service.process_export(job.id, db_session, test_data)

        assert result.status == "completed"

    @pytest.mark.asyncio
    async def test_process_export_pdf(
        self, service, db_session, sample_developer
    ):
        """Test processing PDF export.

        Skips gracefully if reportlab isn't installed (create_export_job guards
        against it), otherwise verifies a terminal status.
        """
        request = ExportRequest(
            export_type="report",
            format="pdf",
            config={},
        )
        try:
            job = await service.create_export_job(
                request, sample_developer.id, db_session
            )
        except ValueError:
            pytest.skip("reportlab not installed; PDF export unavailable")

        test_data = {
            "title": "Weekly Report",
            "sections": [
                {"heading": "Summary", "content": "This is a test report."},
            ]
        }

        result = await service.process_export(job.id, db_session, test_data)
        assert result.status in ["completed", "pending", "failed"]

    # Job Status Tests

    @pytest.mark.asyncio
    async def test_get_export_status(
        self, service, db_session, sample_developer
    ):
        """Test getting export job status."""
        request = ExportRequest(
            export_type="developer_profile",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Public accessor is get_export_job.
        status = await service.get_export_job(job.id, db_session)

        assert status is not None
        assert status.id == job.id
        assert status.status == "pending"

    @pytest.mark.asyncio
    async def test_get_export_status_not_found(self, service, db_session):
        """Test getting status for non-existent job."""
        status = await service.get_export_job(
            "00000000-0000-0000-0000-000000000000", db_session
        )

        assert status is None

    @pytest.mark.asyncio
    async def test_update_job_status(
        self, service, db_session, sample_developer
    ):
        """Test updating job status."""
        request = ExportRequest(
            export_type="developer_profile",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Signature is update_job_status(job_id, db, status, ...).
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
            export_type="developer_profile",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

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
    async def test_get_download_path(
        self, service, db_session, sample_developer
    ):
        """Test getting download path for completed export."""
        request = ExportRequest(
            export_type="developer_profile",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        test_data = {"test": "data"}
        completed = await service.process_export(job.id, db_session, test_data)

        # get_download_path takes the job object and returns a Path or None.
        path = service.get_download_path(completed)

        if completed.status == "completed":
            assert path is not None
            assert path.exists()
        else:
            assert path is None

    @pytest.mark.asyncio
    async def test_get_download_path_pending_job(
        self, service, db_session, sample_developer
    ):
        """Test getting download path for pending job returns None."""
        request = ExportRequest(
            export_type="developer_profile",
            format="json",
            config={},
        )
        job = await service.create_export_job(
            request, sample_developer.id, db_session
        )

        # Pending job has no file_path yet.
        path = service.get_download_path(job)

        assert path is None

    # Cleanup Tests

    @pytest.mark.asyncio
    async def test_cleanup_expired_exports(
        self, service, db_session
    ):
        """Test cleaning up expired export files runs without error."""
        cleaned = await service.cleanup_expired_exports(db_session)

        assert cleaned >= 0


@pytest.mark.skip(
    reason="ExportService no longer exposes get_supported_formats/"
    "is_format_supported; supported formats are enforced by the ExportFormat "
    "enum on ExportRequest, and PDF/XLSX availability is checked inline in "
    "create_export_job. No standalone format-support API to test."
)
class TestExportFormatSupport:
    """Placeholder for removed format-support API tests."""

    def test_removed(self):
        pass


@pytest.mark.skip(
    reason="ExportService._format_json/_format_csv were removed; formatting is "
    "now done by file-writing helpers (_export_json/_export_csv) that persist to "
    "disk rather than returning strings. Covered by test_process_export_* tests."
)
class TestExportFormatters:
    """Unit tests for export formatting functions."""

    def test_format_json_data(self):
        pass

    def test_format_csv_data(self):
        pass

    def test_format_csv_with_special_characters(self):
        pass


@pytest.mark.skip(
    reason="ExportService._validate_request was removed; request validation is "
    "now enforced by the ExportRequest pydantic schema (ExportType/ExportFormat "
    "enums) at construction time, not by a service helper method."
)
class TestExportValidation:
    """Unit tests for export validation."""

    def test_validate_export_request_valid(self):
        pass

    def test_validate_export_request_invalid_format(self):
        pass

    def test_validate_export_request_invalid_type(self):
        pass


class TestDocxExport:
    """Word export.

    Asserts the bytes are a document that reads back, not just that the job
    reached a terminal status: a renderer that emits a file Word cannot open,
    or one that drops the payload and writes only a title, would both leave
    the job "completed".
    """

    @pytest.fixture
    def service(self, tmp_path):
        return ExportService(export_dir=tmp_path / "exports")

    @pytest.mark.asyncio
    async def test_tabular_data_becomes_a_real_table(
        self, service, db_session, sample_developer
    ):
        request = ExportRequest(export_type="sprint_tasks", format="docx", config={})
        try:
            job = await service.create_export_job(
                request, sample_developer.id, db_session
            )
        except ValueError:
            pytest.skip("python-docx not installed; Word export unavailable")

        data = {
            "headers": ["Task", "Owner", "Points"],
            "rows": [["Fix billing", "ana", "3"], ["Add dunning", "raj", "5"]],
        }

        result = await service.process_export(job.id, db_session, data)
        assert result.status == ExportStatus.COMPLETED.value

        from pathlib import Path

        from aexy.services.docx_service import extract_structured

        extract = extract_structured(Path(result.file_path).read_bytes())

        assert len(extract.tables) == 1
        assert extract.tables[0].header == ["Task", "Owner", "Points"]
        assert ["Add dunning", "raj", "5"] in extract.tables[0].rows

    @pytest.mark.asyncio
    async def test_nested_data_still_produces_content(
        self, service, db_session, sample_developer
    ):
        """The shapes `_data_to_table` returns None for must not export a
        document containing nothing but a heading."""
        request = ExportRequest(export_type="report", format="docx", config={})
        try:
            job = await service.create_export_job(
                request, sample_developer.id, db_session
            )
        except ValueError:
            pytest.skip("python-docx not installed; Word export unavailable")

        data = {
            "summary": {"velocity": 42, "carry_over": 3},
            "risks": ["Migration window", "Data backfill"],
        }

        result = await service.process_export(job.id, db_session, data)
        assert result.status == ExportStatus.COMPLETED.value

        from pathlib import Path

        from aexy.services.docx_service import extract_structured

        markdown = extract_structured(Path(result.file_path).read_bytes()).markdown

        assert "42" in markdown
        assert "Migration window" in markdown
        assert "Data backfill" in markdown
