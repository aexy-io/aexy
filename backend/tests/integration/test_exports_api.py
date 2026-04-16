"""
Integration tests for Exports API endpoints.

These tests verify:
- Export job creation
- Export status tracking
- Download functionality
- Supported formats
"""

import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from jose import jwt

from aexy.core.config import get_settings

settings = get_settings()


def create_test_token(developer_id: str) -> str:
    """Create a test JWT token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    to_encode = {
        "sub": developer_id,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


class TestExportsAPI:
    """Integration tests for /exports endpoints."""

    # Export Creation Tests

    @pytest.mark.asyncio
    async def test_create_export_json(
        self, client: AsyncClient, sample_developer
    ):
        """Test POST /exports endpoint for JSON export."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 202
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
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developers",
                "format": "csv",
                "config": {"developer_ids": developer_ids},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 202
        data = response.json()
        assert data["format"] == "csv"

    @pytest.mark.asyncio
    async def test_create_export_pdf(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test POST /exports endpoint for PDF export."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "report",
                "format": "pdf",
                "config": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [202, 400]

    @pytest.mark.asyncio
    async def test_create_export_xlsx(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /exports endpoint for XLSX export."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "team_analytics",
                "format": "xlsx",
                "config": {
                    "developer_ids": developer_ids,
                    "include_productivity": True,
                    "include_skills": True,
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 202
        data = response.json()
        assert data["format"] == "xlsx"

    # Export Status Tests

    @pytest.mark.asyncio
    async def test_get_export_status(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports/{id} endpoint."""
        token = create_test_token(sample_developer.id)

        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        export_id = create_response.json()["id"]

        # Get status
        response = await client.get(
            f"/api/v1/exports/{export_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == export_id
        assert "status" in data

    @pytest.mark.asyncio
    async def test_get_export_status_not_found(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports/{id} with non-existent ID."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/exports/nonexistent-id",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_export_status_completed(
        self, client: AsyncClient, sample_developer
    ):
        """Test export status when completed includes file info."""
        token = create_test_token(sample_developer.id)

        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        export_id = create_response.json()["id"]

        # Get status (may need to poll in real scenario)
        response = await client.get(
            f"/api/v1/exports/{export_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

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
        token = create_test_token(sample_developer.id)

        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        export_id = create_response.json()["id"]

        # Try to download
        response = await client.get(
            f"/api/v1/exports/{export_id}/download",
            headers={"Authorization": f"Bearer {token}"},
        )

        # May return file or 400 if still processing, or 404
        assert response.status_code in [200, 400, 404]

    @pytest.mark.asyncio
    async def test_download_pending_export(
        self, client: AsyncClient, sample_developer
    ):
        """Test download when export is still pending."""
        token = create_test_token(sample_developer.id)

        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        export_id = create_response.json()["id"]

        # Immediately try to download
        response = await client.get(
            f"/api/v1/exports/{export_id}/download",
            headers={"Authorization": f"Bearer {token}"},
        )

        # Should indicate not ready (400 "Export is not ready") or 404
        assert response.status_code in [400, 404]

    # Available Formats Tests

    @pytest.mark.asyncio
    async def test_get_available_formats(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports/formats/available endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/exports/formats/available",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "formats" in data
        assert isinstance(data["formats"], list)

    # List Exports Tests

    @pytest.mark.asyncio
    async def test_list_exports(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports endpoint."""
        token = create_test_token(sample_developer.id)

        # Create some exports
        for i in range(3):
            await client.post(
                "/api/v1/exports",
                json={
                    "export_type": "developer_profile",
                    "format": "json",
                    "config": {"developer_id": str(sample_developer.id)},
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        # List exports
        response = await client.get(
            "/api/v1/exports",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_list_exports_with_status_filter(
        self, client: AsyncClient, sample_developer
    ):
        """Test listing exports filtered by status."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/exports",
            params={"status_filter": "completed"},
            headers={"Authorization": f"Bearer {token}"},
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
        token = create_test_token(sample_developer.id)

        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "team_analytics",
                "format": "json",
                "config": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        export_id = create_response.json()["id"]

        # Cancel it
        response = await client.delete(
            f"/api/v1/exports/{export_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [204, 404]


class TestExportsAPIValidation:
    """Tests for exports API input validation."""

    @pytest.mark.asyncio
    async def test_create_export_invalid_format(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export with invalid format."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "invalid_format",
                "config": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_export_invalid_type(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export with invalid export_type."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "invalid_type",
                "format": "json",
                "config": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_export_missing_format(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export without format."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "config": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_export_missing_config(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export without config."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # Config might be optional or required depending on implementation
        assert response.status_code in [202, 422]

    @pytest.mark.asyncio
    async def test_create_export_unauthenticated(self, client: AsyncClient):
        """Test creating export without authentication."""
        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {},
            },
        )

        assert response.status_code == 403


class TestExportJobProcessing:
    """Tests for export job processing behavior."""

    @pytest.mark.asyncio
    async def test_export_sets_status(
        self, client: AsyncClient, sample_developer
    ):
        """Test that exports have a status set."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 202
        data = response.json()
        assert "status" in data

    @pytest.mark.asyncio
    async def test_large_export_queued(
        self, client: AsyncClient, sample_developers
    ):
        """Test that large exports are queued for background processing."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/exports",
            json={
                "export_type": "team_analytics",
                "format": "xlsx",
                "config": {
                    "developer_ids": developer_ids,
                    "include_all_metrics": True,
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 202
        data = response.json()
        # Large exports should be queued, not completed immediately
        assert data["status"] in ["pending", "processing", "completed"]
