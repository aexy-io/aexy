"""
Integration tests for Reports API endpoints.

These tests verify:
- Report CRUD operations
- Template management
- Report scheduling
- Widget data fetching
"""

import pytest
from httpx import AsyncClient


class TestReportsAPI:
    """Integration tests for /reports endpoints."""

    # Report CRUD Tests

    @pytest.mark.asyncio
    async def test_create_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test POST /reports endpoint."""
        response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": sample_report_config["name"],
                "description": sample_report_config["description"],
                "widgets": sample_report_config["widgets"],
                "filters": sample_report_config["filters"],
            },
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
        # First create a report
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": sample_report_config["name"],
                "widgets": sample_report_config["widgets"],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        # Then fetch it
        response = await client.get(f"/api/reports/{report_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == report_id

    @pytest.mark.asyncio
    async def test_get_report_not_found(self, client: AsyncClient):
        """Test GET /reports/{id} with non-existent ID."""
        response = await client.get("/api/reports/nonexistent-id")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_report(
        self, client: AsyncClient, sample_developer, sample_report_config
    ):
        """Test PUT /reports/{id} endpoint."""
        # Create report
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Original Name",
                "widgets": [],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        # Update it
        response = await client.put(
            f"/api/reports/{report_id}",
            json={
                "name": "Updated Name",
                "description": "New description",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "New description"

    @pytest.mark.asyncio
    async def test_delete_report(
        self, client: AsyncClient, sample_developer
    ):
        """Test DELETE /reports/{id} endpoint."""
        # Create report
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Report to Delete",
                "widgets": [],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        # Delete it
        response = await client.delete(f"/api/reports/{report_id}")
        assert response.status_code == 204

        # Verify deletion
        get_response = await client.get(f"/api/reports/{report_id}")
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_reports(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /reports endpoint."""
        # Create multiple reports
        for i in range(3):
            await client.post(
                "/api/reports",
                json={
                    "creator_id": str(sample_developer.id),
                    "name": f"Report {i}",
                    "widgets": [],
                    "filters": {},
                },
            )

        # List reports
        response = await client.get(
            "/api/reports",
            params={"creator_id": str(sample_developer.id)},
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
        # Create original
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Original Report",
                "widgets": sample_report_config["widgets"],
                "filters": sample_report_config["filters"],
            },
        )
        report_id = create_response.json()["id"]

        # Clone it
        response = await client.post(
            f"/api/reports/{report_id}/clone",
            json={"name": "Cloned Report"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Cloned Report"
        assert data["id"] != report_id

    # Template Tests

    @pytest.mark.asyncio
    async def test_list_templates(self, client: AsyncClient):
        """Test GET /reports/templates endpoint."""
        response = await client.get("/api/reports/templates")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for template in data:
            assert "id" in template
            assert "name" in template

    @pytest.mark.asyncio
    async def test_list_templates_by_category(self, client: AsyncClient):
        """Test filtering templates by category."""
        response = await client.get(
            "/api/reports/templates",
            params={"category": "team"},
        )

        assert response.status_code == 200
        data = response.json()
        for template in data:
            assert template.get("category") == "team"

    @pytest.mark.asyncio
    async def test_create_from_template(
        self, client: AsyncClient, sample_developer
    ):
        """Test POST /reports/from-template endpoint."""
        # Get templates first
        templates_response = await client.get("/api/reports/templates")
        templates = templates_response.json()

        if templates:
            template_id = templates[0]["id"]

            response = await client.post(
                "/api/reports/from-template",
                json={
                    "template_id": template_id,
                    "creator_id": str(sample_developer.id),
                },
            )

            assert response.status_code == 201

    # Widget Data Tests

    @pytest.mark.asyncio
    async def test_get_report_data(
        self, client: AsyncClient, sample_developer, sample_developers
    ):
        """Test GET /reports/{id}/data endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        # Create report with widgets
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Data Report",
                "widgets": [
                    {
                        "type": "skill_heatmap",
                        "config": {},
                        "position": {"x": 0, "y": 0, "w": 2, "h": 1},
                    },
                ],
                "filters": {"developer_ids": developer_ids},
            },
        )
        report_id = create_response.json()["id"]

        # Get report data
        response = await client.get(f"/api/reports/{report_id}/data")

        assert response.status_code == 200
        data = response.json()
        assert "widgets" in data

    # Schedule Tests

    @pytest.mark.asyncio
    async def test_create_schedule(
        self, client: AsyncClient, sample_developer
    ):
        """Test POST /reports/{id}/schedules endpoint."""
        # Create report
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Scheduled Report",
                "widgets": [],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        # Create schedule
        response = await client.post(
            f"/api/reports/{report_id}/schedules",
            json={
                "schedule": "weekly",
                "day_of_week": 1,
                "time_utc": "09:00",
                "recipients": ["test@example.com"],
                "delivery_method": "email",
                "export_format": "pdf",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["schedule"] == "weekly"

    @pytest.mark.asyncio
    async def test_list_schedules(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /reports/{id}/schedules endpoint."""
        # Create report with schedule
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Report with Schedules",
                "widgets": [],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        await client.post(
            f"/api/reports/{report_id}/schedules",
            json={
                "schedule": "daily",
                "time_utc": "08:00",
                "recipients": ["team@example.com"],
                "delivery_method": "slack",
                "export_format": "csv",
            },
        )

        # List schedules
        response = await client.get(f"/api/reports/{report_id}/schedules")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_delete_schedule(
        self, client: AsyncClient, sample_developer
    ):
        """Test DELETE /reports/schedules/{id} endpoint."""
        # Create report and schedule
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Report to Unschedule",
                "widgets": [],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        schedule_response = await client.post(
            f"/api/reports/{report_id}/schedules",
            json={
                "schedule": "monthly",
                "day_of_month": 1,
                "time_utc": "10:00",
                "recipients": ["monthly@example.com"],
                "delivery_method": "email",
                "export_format": "xlsx",
            },
        )
        schedule_id = schedule_response.json()["id"]

        # Delete schedule
        response = await client.delete(f"/api/reports/schedules/{schedule_id}")
        assert response.status_code == 204


class TestReportsAPIValidation:
    """Tests for reports API input validation."""

    @pytest.mark.asyncio
    async def test_create_report_missing_name(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating report without name."""
        response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "widgets": [],
                "filters": {},
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_schedule_invalid_day(
        self, client: AsyncClient, sample_developer
    ):
        """Test creating schedule with invalid day_of_week."""
        create_response = await client.post(
            "/api/reports",
            json={
                "creator_id": str(sample_developer.id),
                "name": "Test Report",
                "widgets": [],
                "filters": {},
            },
        )
        report_id = create_response.json()["id"]

        response = await client.post(
            f"/api/reports/{report_id}/schedules",
            json={
                "schedule": "weekly",
                "day_of_week": 10,  # Invalid
                "time_utc": "09:00",
                "recipients": ["test@example.com"],
                "delivery_method": "email",
                "export_format": "pdf",
            },
        )

        assert response.status_code in [400, 422]

