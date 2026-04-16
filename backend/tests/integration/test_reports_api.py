"""
Integration tests for Reports API endpoints.

These tests verify:
- Report CRUD operations
- Template management
- Report scheduling
- Widget data fetching
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


class TestReportsAPI:
    """Integration tests for /reports endpoints."""

    # Report CRUD Tests

    @pytest.mark.asyncio
    async def test_create_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test POST /reports endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/reports",
            json={
                "name": sample_report_config["name"],
                "description": sample_report_config["description"],
                "widgets": sample_report_config["widgets"],
                "filters": sample_report_config["filters"],
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == sample_report_config["name"]
        assert "id" in data

    @pytest.mark.asyncio
    async def test_get_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test GET /reports/{id} endpoint."""
        token = create_test_token(sample_developer.id)

        # First create a report
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": sample_report_config["name"],
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        # Then fetch it
        response = await client.get(
            f"/api/v1/reports/{report_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == report_id

    @pytest.mark.asyncio
    async def test_get_report_not_found(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /reports/{id} with non-existent ID."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/reports/nonexistent-id",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test PUT /reports/{id} endpoint."""
        token = create_test_token(sample_developer.id)

        # Create report
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Original Name",
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        # Update it
        response = await client.put(
            f"/api/v1/reports/{report_id}",
            json={
                "name": "Updated Name",
                "description": "New description",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "New description"

    @pytest.mark.asyncio
    async def test_delete_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test DELETE /reports/{id} endpoint."""
        token = create_test_token(sample_developer.id)

        # Create report
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Report to Delete",
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        # Delete it
        response = await client.delete(
            f"/api/v1/reports/{report_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 204

        # Verify deletion
        get_response = await client.get(
            f"/api/v1/reports/{report_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_reports(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test GET /reports endpoint."""
        token = create_test_token(sample_developer.id)

        # Create multiple reports
        for i in range(3):
            await client.post(
                "/api/v1/reports",
                json={
                    "name": f"Report {i}",
                    "widgets": sample_report_config["widgets"],
                    "filters": {},
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        # List reports
        response = await client.get(
            "/api/v1/reports",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3

    @pytest.mark.asyncio
    async def test_clone_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test POST /reports/{id}/clone endpoint."""
        token = create_test_token(sample_developer.id)

        # Create original
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Original Report",
                "widgets": sample_report_config["widgets"],
                "filters": sample_report_config["filters"],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        # Clone it (new_name is a query parameter in the actual API)
        response = await client.post(
            f"/api/v1/reports/{report_id}/clone",
            params={"new_name": "Cloned Report"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [200, 201]  # clone may not return 201
        data = response.json()
        assert data["name"] == "Cloned Report"
        assert data["id"] != report_id

    # Template Tests

    @pytest.mark.asyncio
    async def test_list_templates(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /reports/templates/list endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/reports/templates/list",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            for template in data:
                assert "id" in template
                assert "name" in template

    @pytest.mark.asyncio
    async def test_list_templates_by_category(
        self, client: AsyncClient, sample_developer
    ):
        """Test filtering templates by category."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/reports/templates/list",
            params={"category": "team"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        for template in data:
            assert template.get("category") == "team"

    @pytest.mark.asyncio
    async def test_create_from_template(
        self, client: AsyncClient, sample_developer
    ):
        """Test POST /reports/templates/{template_id}/create endpoint."""
        token = create_test_token(sample_developer.id)

        # Get templates first
        templates_response = await client.get(
            "/api/v1/reports/templates/list",
            headers={"Authorization": f"Bearer {token}"},
        )
        templates = templates_response.json()

        if templates:
            template_id = templates[0]["id"]

            response = await client.post(
                f"/api/v1/reports/templates/{template_id}/create",
                headers={"Authorization": f"Bearer {token}"},
            )

            assert response.status_code in [200, 201]

    # Widget Data Tests

    @pytest.mark.asyncio
    async def test_get_report_data(
        self, client: AsyncClient, sample_developer, sample_developers, sample_report_config
    ):
        """Test POST /reports/{id}/data endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developer.id)

        # Create report with widgets
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Data Report",
                "widgets": sample_report_config["widgets"],
                "filters": {"developer_ids": developer_ids},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        # Get report data (this is a POST endpoint in the actual API)
        response = await client.post(
            f"/api/v1/reports/{report_id}/data",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "widgets" in data

    # Schedule Tests

    @pytest.mark.asyncio
    async def test_create_schedule(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test POST /reports/{id}/schedules endpoint."""
        token = create_test_token(sample_developer.id)

        # Create report
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Scheduled Report",
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        # Create schedule
        response = await client.post(
            f"/api/v1/reports/{report_id}/schedules",
            json={
                "schedule": "weekly",
                "day_of_week": 1,
                "time_utc": "09:00",
                "recipients": ["test@example.com"],
                "delivery_method": "email",
                "export_format": "pdf",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["schedule"] == "weekly"

    @pytest.mark.asyncio
    async def test_list_schedules(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test GET /reports/schedules/list endpoint."""
        token = create_test_token(sample_developer.id)

        # Create report with schedule
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Report with Schedules",
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        await client.post(
            f"/api/v1/reports/{report_id}/schedules",
            json={
                "schedule": "daily",
                "time_utc": "08:00",
                "recipients": ["team@example.com"],
                "delivery_method": "slack",
                "export_format": "csv",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # List schedules (actual route is /reports/schedules/list with optional report_id query param)
        response = await client.get(
            "/api/v1/reports/schedules/list",
            params={"report_id": report_id},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_delete_schedule(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test DELETE /reports/schedules/{id} endpoint."""
        token = create_test_token(sample_developer.id)

        # Create report and schedule
        create_response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Report to Unschedule",
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        report_id = create_response.json()["id"]

        schedule_response = await client.post(
            f"/api/v1/reports/{report_id}/schedules",
            json={
                "schedule": "monthly",
                "day_of_month": 1,
                "time_utc": "10:00",
                "recipients": ["monthly@example.com"],
                "delivery_method": "email",
                "export_format": "xlsx",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        schedule_id = schedule_response.json()["id"]

        # Delete schedule
        response = await client.delete(
            f"/api/v1/reports/schedules/{schedule_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 204


class TestReportsAPIValidation:
    """Tests for reports API input validation."""

    @pytest.mark.asyncio
    async def test_create_report_missing_name(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test creating report without name."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/reports",
            json={
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_report_empty_widgets(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating report with empty widgets list."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/reports",
            json={
                "name": "Empty Widgets Report",
                "widgets": [],
                "filters": {},
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # The API requires at least one widget
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_reports_unauthenticated(self, client: AsyncClient):
        """Test reports endpoint without authentication."""
        response = await client.get("/api/v1/reports")

        assert response.status_code == 403
