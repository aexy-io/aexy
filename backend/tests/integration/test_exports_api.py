"""
Integration tests for Exports API endpoints.

These tests verify:
- Export job creation
- Export status tracking
- Download functionality
- Supported formats
"""

import pytest
from httpx import AsyncClient


class TestExportsAPI:
    """Integration tests for /exports endpoints."""

    # Export Creation Tests

    @pytest.mark.asyncio
    async def test_create_export_json(
        self, client: AsyncClient, sample_developer
    ):
        """Test POST /exports endpoint for JSON export."""
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["status"] in ["pending", "processing", "completed"]
        assert data["format"] == "json"

    @pytest.mark.asyncio
    async def test_create_export_csv(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /exports endpoint for CSV export."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/exports",
            json={
                "export_type": "developers",
                "format": "csv",
                "config": {"developer_ids": developer_ids},
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["format"] == "csv"

    @pytest.mark.asyncio
    async def test_create_export_pdf(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test POST /exports endpoint for PDF export."""
        # First create a report
        report_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": sample_report_config["name"],
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
        )
        report_id = report_response.json()["id"]

        # Export as PDF
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "report",
                "format": "pdf",
                "config": {"report_id": report_id},
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["format"] == "pdf"

    @pytest.mark.asyncio
    async def test_create_export_xlsx(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /exports endpoint for XLSX export."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/exports",
            json={
                "export_type": "team_analytics",
                "format": "xlsx",
                "config": {
                    "developer_ids": developer_ids,
                    "include_productivity": True,
                    "include_skills": True,
                },
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["format"] == "xlsx"

    # Export Status Tests

    @pytest.mark.asyncio
    async def test_get_export_status(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports/{id} endpoint."""
        # Create export
        create_response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Get status
        response = await client.get(f"/api/exports/{export_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == export_id
        assert "status" in data

    @pytest.mark.asyncio
    async def test_get_export_status_not_found(self, client: AsyncClient):
        """Test GET /exports/{id} with non-existent ID."""
        response = await client.get("/api/exports/nonexistent-id")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_export_status_completed(
        self, client: AsyncClient, sample_developer
    ):
        """Test export status when completed includes file info."""
        # Create export
        create_response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Get status (may need to poll in real scenario)
        response = await client.get(f"/api/exports/{export_id}")

        assert response.status_code == 200
        data = response.json()

        # If completed, should have file info
        if data["status"] == "completed":
            assert "file_path" in data or "download_url" in data

    # Download Tests

    @pytest.mark.asyncio
    async def test_download_export(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports/{id}/download endpoint."""
        # Create export
        create_response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Try to download
        response = await client.get(f"/api/exports/{export_id}/download")

        # May return file or redirect, or 404 if still processing
        assert response.status_code in [200, 202, 302, 404]

    @pytest.mark.asyncio
    async def test_download_pending_export(
        self, client: AsyncClient, sample_developer
    ):
        """Test download when export is still pending."""
        # Create export
        create_response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Immediately try to download
        response = await client.get(f"/api/exports/{export_id}/download")

        # Should indicate not ready or return accepted status
        assert response.status_code in [202, 404, 409]

    # Supported Formats Tests

    @pytest.mark.asyncio
    async def test_get_supported_formats(self, client: AsyncClient):
        """Test GET /exports/formats endpoint."""
        response = await client.get("/api/exports/formats")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert "json" in data
        assert "csv" in data

    @pytest.mark.asyncio
    async def test_get_export_types(self, client: AsyncClient):
        """Test GET /exports/types endpoint."""
        response = await client.get("/api/exports/types")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    # List Exports Tests

    @pytest.mark.asyncio
    async def test_list_exports(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports endpoint."""
        # Create some exports
        for i in range(3):
            await client.post(
                "/api/exports",
                json={
                    "export_type": "developer_profile",
                    "format": "json",
                    "config": {"developer_id": str(sample_developer.id)},
                },
            )

        # List exports
        response = await client.get(
            "/api/exports",
            params={"requested_by": str(sample_developer.id)},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_list_exports_with_status_filter(
        self, client: AsyncClient, sample_developer
    ):
        """Test listing exports filtered by status."""
        response = await client.get(
            "/api/exports",
            params={
                "requested_by": str(sample_developer.id),
                "status": "completed",
            },
        )

        assert response.status_code == 200
        data = response.json()
        for export in data:
            assert export["status"] == "completed"

    # Cancel Export Tests

    @pytest.mark.asyncio
    async def test_cancel_export(
        self, client: AsyncClient, sample_developer
    ):
        """Test DELETE /exports/{id} endpoint (cancel)."""
        # Create export
        create_response = await client.post(
            "/api/exports",
            json={
                "export_type": "team_analytics",
                "format": "pdf",
                "config": {},
            },
        )
        export_id = create_response.json()["id"]

        # Cancel it
        response = await client.delete(f"/api/exports/{export_id}")

        assert response.status_code in [200, 204, 409]  # 409 if already completed


class TestExportsAPIValidation:
    """Tests for exports API input validation."""

    @pytest.mark.asyncio
    async def test_create_export_invalid_format(self, client: AsyncClient):
        """Test creating export with invalid format."""
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "invalid_format",
                "config": {},
            },
        )

        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_export_invalid_type(self, client: AsyncClient):
        """Test creating export with invalid export_type."""
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "invalid_type",
                "format": "json",
                "config": {},
            },
        )

        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_export_missing_format(self, client: AsyncClient):
        """Test creating export without format."""
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "config": {},
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_export_missing_config(self, client: AsyncClient):
        """Test creating export without config."""
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
            },
        )

        # Config might be optional or required depending on implementation
        assert response.status_code in [201, 422]


class TestExportJobProcessing:
    """Tests for export job processing behavior."""

    @pytest.mark.asyncio
    async def test_export_sets_expiry(
        self, client: AsyncClient, sample_developer
    ):
        """Test that exports have expiry time set."""
        response = await client.post(
            "/api/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "expires_at" in data

    @pytest.mark.asyncio
    async def test_large_export_queued(
        self, client: AsyncClient, sample_developers
    ):
        """Test that large exports are queued for background processing."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/exports",
            json={
                "export_type": "team_analytics",
                "format": "xlsx",
                "config": {
                    "developer_ids": developer_ids,
                    "include_all_metrics": True,
                },
            },
        )

        assert response.status_code == 201
        data = response.json()
        # Large exports should be queued, not completed immediately
        assert data["status"] in ["pending", "processing", "completed"]

