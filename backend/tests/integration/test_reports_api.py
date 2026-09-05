"""
Integration tests for Reports API endpoints.

These tests verify:
- Report CRUD operations
- Template management
- Report scheduling
- Widget data fetching
"""

from datetime import datetime, timedelta, timezone

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from jose import jwt

from aexy.core.config import get_settings

settings = get_settings()

# A syntactically valid UUID that is guaranteed absent from the DB. Used for
# "not found" paths (the routes take str ids, so a malformed value would just
# 404 too, but a real UUID keeps the intent unambiguous).
ABSENT_UUID = "00000000-0000-0000-0000-000000000000"


def _auth(developer_id: str) -> dict:
    """Bearer header for the given developer id (JWT, matches app auth)."""
    payload = {
        "sub": str(developer_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        "type": "access",
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return {"Authorization": f"Bearer {token}"}


def _widget(wid: str = "w1") -> dict:
    """A valid WidgetConfig payload (id/type/title are required)."""
    return {
        "id": wid,
        "type": "heatmap",
        "title": "Skill Heatmap",
        "config": {},
        "position": {"x": 0, "y": 0, "width": 6, "height": 4},
    }

@pytest_asyncio.fixture
async def reports_workspace(db_session, sample_developer):
    """A workspace the sample developer owns.

    Reports moved under `/workspaces/{id}/reports` when the module became
    workspace-scoped: they used to be addressed by id alone and scoped by
    creator, which is what kept them out of reach of the workspace app toggle.
    """
    from aexy.models.workspace import Workspace, WorkspaceMember

    ws = Workspace(
        id=str(uuid.uuid4()),
        name="Reports WS",
        slug=f"reports-{uuid.uuid4().hex[:6]}",
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



class TestReportsAPI:
    """Integration tests for /reports endpoints."""

    # Report CRUD Tests

    @pytest.mark.asyncio
    async def test_create_report(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test POST /reports endpoint."""
        response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": sample_report_config["name"],
                "description": sample_report_config["description"],
                "widgets": sample_report_config["widgets"],
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == sample_report_config["name"]
        assert "id" in data

    @pytest.mark.asyncio
    async def test_get_report(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test GET /reports/{id} endpoint."""
        # First create a report
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": sample_report_config["name"],
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        # Then fetch it
        response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == report_id

    @pytest.mark.asyncio
    async def test_get_report_not_found(
        self, client: AsyncClient, reports_workspace, sample_developer
    ):
        """Test GET /reports/{id} with non-existent ID."""
        response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{ABSENT_UUID}",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_report(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test PUT /reports/{id} endpoint."""
        # Create report
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Original Name",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        # Update it
        response = await client.put(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}",
            headers=_auth(sample_developer.id),
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
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test DELETE /reports/{id} endpoint."""
        # Create report
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Report to Delete",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        # Delete it
        response = await client.delete(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}",
            headers=_auth(sample_developer.id),
        )
        assert response.status_code == 204

        # Verify deletion
        get_response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}",
            headers=_auth(sample_developer.id),
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_reports(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test GET /reports endpoint."""
        # Create multiple reports
        for i in range(3):
            await client.post(
                f"/api/v1/workspaces/{reports_workspace.id}/reports",
                headers=_auth(sample_developer.id),
                json={
                    "name": f"Report {i}",
                    "widgets": sample_report_config["widgets"],
                },
            )

        # List reports
        response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3

    @pytest.mark.asyncio
    async def test_clone_report(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test POST /reports/{id}/clone endpoint."""
        # Create original
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Original Report",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        # Clone it (new_name is a query parameter)
        response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}/clone",
            headers=_auth(sample_developer.id),
            params={"new_name": "Cloned Report"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Cloned Report"
        assert data["id"] != report_id

    # Template Tests

    @pytest.mark.asyncio
    async def test_list_templates(self, client: AsyncClient, reports_workspace, sample_developer):
        """Test GET /reports/templates/list endpoint."""
        response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/templates/list",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for template in data:
            assert "id" in template
            assert "name" in template

    @pytest.mark.asyncio
    async def test_list_templates_by_category(
        self, client: AsyncClient, reports_workspace, sample_developer
    ):
        """Test filtering templates by category."""
        response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/templates/list",
            headers=_auth(sample_developer.id),
            params={"category": "team"},
        )

        assert response.status_code == 200
        data = response.json()
        for template in data:
            assert template.get("category") == "team"

    @pytest.mark.asyncio
    async def test_create_from_template(
        self, client: AsyncClient, reports_workspace, sample_developer
    ):
        """Test POST /reports/templates/{id}/create endpoint."""
        # Get templates first
        templates_response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/templates/list",
            headers=_auth(sample_developer.id),
        )
        templates = templates_response.json()

        if templates:
            template_id = templates[0]["id"]

            response = await client.post(
                f"/api/v1/workspaces/{reports_workspace.id}/reports/templates/{template_id}/create",
                headers=_auth(sample_developer.id),
            )

            assert response.status_code == 200

    # Widget Data Tests

    @pytest.mark.asyncio
    async def test_get_report_data(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_developers
    ):
        """Test POST /reports/{id}/data endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        # Create report with widgets
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Data Report",
                "widgets": [_widget("data-w1")],
                "filters": {"developer_ids": developer_ids},
            },
        )
        report_id = create_response.json()["id"]

        # Get report data (endpoint is POST; developer_ids overrides are optional)
        response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}/data",
            headers=_auth(sample_developer.id),
        )

        assert response.status_code == 200
        data = response.json()
        assert "widgets" in data

    # Schedule Tests

    @pytest.mark.asyncio
    async def test_create_schedule(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test POST /reports/{id}/schedules endpoint."""
        # Create report
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Scheduled Report",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        # Create schedule (report_id is required in the body too)
        response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}/schedules",
            headers=_auth(sample_developer.id),
            json={
                "report_id": report_id,
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
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test GET /reports/schedules/list endpoint."""
        # Create report with schedule
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Report with Schedules",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}/schedules",
            headers=_auth(sample_developer.id),
            json={
                "report_id": report_id,
                "schedule": "daily",
                "time_utc": "08:00",
                "recipients": ["team@example.com"],
                "delivery_method": "slack",
                "export_format": "csv",
            },
        )

        # List schedules
        response = await client.get(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/schedules/list",
            headers=_auth(sample_developer.id),
            params={"report_id": report_id},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_delete_schedule(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test DELETE /reports/schedules/{id} endpoint."""
        # Create report and schedule
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Report to Unschedule",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        schedule_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}/schedules",
            headers=_auth(sample_developer.id),
            json={
                "report_id": report_id,
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
        response = await client.delete(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/schedules/{schedule_id}",
            headers=_auth(sample_developer.id),
        )
        assert response.status_code == 204


class TestReportsAPIValidation:
    """Tests for reports API input validation."""

    @pytest.mark.asyncio
    async def test_create_report_missing_name(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test creating report without name."""
        response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "widgets": sample_report_config["widgets"],
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_schedule_invalid_day(
        self, client: AsyncClient, reports_workspace, sample_developer, sample_report_config
    ):
        """Test creating schedule with invalid day_of_week."""
        create_response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports",
            headers=_auth(sample_developer.id),
            json={
                "name": "Test Report",
                "widgets": sample_report_config["widgets"],
            },
        )
        report_id = create_response.json()["id"]

        response = await client.post(
            f"/api/v1/workspaces/{reports_workspace.id}/reports/{report_id}/schedules",
            headers=_auth(sample_developer.id),
            json={
                "report_id": report_id,
                "schedule": "weekly",
                "day_of_week": 10,  # Invalid (ge=0, le=6)
                "time_utc": "09:00",
                "recipients": ["test@example.com"],
                "delivery_method": "email",
                "export_format": "pdf",
            },
        )

        assert response.status_code in [400, 422]
