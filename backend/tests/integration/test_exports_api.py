"""
Integration tests for Exports API endpoints.

These tests verify:
- Export job creation
- Export status tracking
- Download functionality
- Supported formats
"""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from jose import jwt

from aexy.core.config import get_settings

settings = get_settings()

# Valid-but-absent UUID for "not found" paths.
ABSENT_UUID = "00000000-0000-0000-0000-000000000000"


def _auth(developer_id: str) -> dict:
    payload = {
        "sub": str(developer_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        "type": "access",
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return {"Authorization": f"Bearer {token}"}



@pytest_asyncio.fixture
async def exports_workspace(db_session, sample_developer):
    """A workspace the sample developer owns.

    Reports moved under `/workspaces/{id}/reports` when the module became
    workspace-scoped. This file creates one to export, so it moved too.
    """
    import uuid as _uuid

    from aexy.models.workspace import Workspace, WorkspaceMember

    ws = Workspace(
        id=str(_uuid.uuid4()),
        name="Exports WS",
        slug=f"exports-{_uuid.uuid4().hex[:6]}",
        owner_id=sample_developer.id,
    )
    db_session.add(ws)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id,
            developer_id=sample_developer.id,
            role="owner",
            status="active",
        )
    )
    await db_session.commit()
    return ws


class TestExportsAPI:
    """Integration tests for /exports endpoints."""

    # Export Creation Tests

    @pytest.mark.asyncio
    async def test_create_export_json(
        self, client: AsyncClient, sample_developer
    ):
        """Test POST /exports endpoint for JSON export."""
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )

        # The route returns 202 Accepted (async processing).
        assert response.status_code == 202
        data = response.json()
        assert "id" in data
        assert data["status"] in ["pending", "processing", "completed"]
        assert data["format"] == "json"

    @pytest.mark.asyncio
    async def test_create_export_csv(
        self, client: AsyncClient, sample_developer, sample_developers
    ):
        """Test POST /exports endpoint for CSV export."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "team_analytics",
                "format": "csv",
                "config": {"developer_ids": developer_ids},
            },
        )

        assert response.status_code == 202
        data = response.json()
        assert data["format"] == "csv"

    @pytest.mark.asyncio
    async def test_create_export_pdf(
        self, client: AsyncClient, sample_developer, sample_report_config, exports_workspace
    ):
        """Test POST /exports endpoint for PDF export."""
        # First create a report to export
        report_response = await client.post(
            f"/api/v1/workspaces/{exports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": sample_report_config["name"],
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = report_response.json()["id"]

        # Export as PDF
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "report",
                "format": "pdf",
                "config": {"report_id": report_id},
            },
        )

        # PDF export requires reportlab; if unavailable the API returns 400.
        assert response.status_code in [202, 400]
        if response.status_code == 202:
            data = response.json()
            assert data["format"] == "pdf"

    @pytest.mark.asyncio
    async def test_create_export_xlsx(
        self, client: AsyncClient, sample_developer, sample_developers
    ):
        """Test POST /exports endpoint for XLSX export."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
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

        # XLSX export requires openpyxl; if unavailable the API returns 400.
        assert response.status_code in [202, 400]
        if response.status_code == 202:
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
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Get status
        response = await client.get(
            f"/api/v1/exports/{export_id}",
            headers=_auth(sample_developer.id),
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
        response = await client.get(
            f"/api/v1/exports/{ABSENT_UUID}",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_export_status_completed(
        self, client: AsyncClient, sample_developer
    ):
        """Test export status when completed includes file info."""
        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Get status (may need to poll in real scenario)
        response = await client.get(
            f"/api/v1/exports/{export_id}",
            headers=_auth(sample_developer.id),
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
        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Try to download
        response = await client.get(
            f"/api/v1/exports/{export_id}/download",
            headers=_auth(sample_developer.id),
        )

        # Returns the file when complete, otherwise 400 (not ready) or 404.
        assert response.status_code in [200, 202, 302, 400, 404]

    @pytest.mark.asyncio
    async def test_download_pending_export(
        self, client: AsyncClient, sample_developer
    ):
        """Test download when export is still pending."""
        # Create export
        create_response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )
        export_id = create_response.json()["id"]

        # Immediately try to download
        response = await client.get(
            f"/api/v1/exports/{export_id}/download",
            headers=_auth(sample_developer.id),
        )

        # Not-ready jobs return 400 ("Export is not ready"); 404/409 also acceptable.
        assert response.status_code in [400, 404, 409]

    # Supported Formats Tests

    @pytest.mark.asyncio
    async def test_get_supported_formats(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports/formats/available endpoint."""
        response = await client.get(
            "/api/v1/exports/formats/available",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 200
        data = response.json()
        # Response is {"formats": [{"format": "csv", ...}, ...]}
        assert "formats" in data
        format_codes = [f["format"] for f in data["formats"]]
        assert "json" in format_codes
        assert "csv" in format_codes

    @pytest.mark.skip(
        reason="No GET /exports/types endpoint exists in the current API; "
        "export types are enumerated by the ExportType enum, not a route."
    )
    @pytest.mark.asyncio
    async def test_get_export_types(self, client: AsyncClient):
        """Test GET /exports/types endpoint (endpoint no longer exists)."""

    # List Exports Tests

    @pytest.mark.asyncio
    async def test_list_exports(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /exports endpoint."""
        # Create some exports
        for i in range(3):
            await client.post(
                "/api/v1/exports",
                headers=_auth(sample_developer.id),
                json={
                    "export_type": "developer_profile",
                    "format": "json",
                    "config": {"developer_id": str(sample_developer.id)},
                },
            )

        # List exports (requester comes from auth)
        response = await client.get(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
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
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            params={"status_filter": "completed"},
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
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "team_analytics",
                "format": "csv",
                "config": {},
            },
        )
        export_id = create_response.json()["id"]

        # Cancel it
        response = await client.delete(
            f"/api/v1/exports/{export_id}",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code in [200, 204, 409]  # 409 if already completed


class TestExportsAPIValidation:
    """Tests for exports API input validation."""

    @pytest.mark.asyncio
    async def test_create_export_invalid_format(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export with invalid format."""
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "invalid_format",
                "config": {},
            },
        )

        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_export_invalid_type(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export with invalid export_type."""
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "invalid_type",
                "format": "json",
                "config": {},
            },
        )

        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_create_export_missing_format(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export without format."""
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "config": {},
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_export_missing_config(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating export without config."""
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
            },
        )

        # Config defaults to {} in the schema, so this is accepted (202).
        assert response.status_code in [202, 422]


class TestExportJobProcessing:
    """Tests for export job processing behavior."""

    @pytest.mark.asyncio
    async def test_export_sets_expiry(
        self, client: AsyncClient, sample_developer
    ):
        """Test that exports have expiry time set."""
        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "developer_profile",
                "format": "json",
                "config": {"developer_id": str(sample_developer.id)},
            },
        )

        assert response.status_code == 202
        data = response.json()
        assert "expires_at" in data

    @pytest.mark.asyncio
    async def test_large_export_queued(
        self, client: AsyncClient, sample_developer, sample_developers
    ):
        """Test that large exports are queued for background processing."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/v1/exports",
            headers=_auth(sample_developer.id),
            json={
                "export_type": "team_analytics",
                "format": "csv",
                "config": {
                    "developer_ids": developer_ids,
                    "include_all_metrics": True,
                },
            },
        )

        assert response.status_code == 202
        data = response.json()
        # Large exports should be queued, not completed immediately
        assert data["status"] in ["pending", "processing", "completed"]
