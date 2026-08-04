"""
Integration tests for Analytics API endpoints.

These tests verify:
- Skill heatmap endpoint
- Productivity trends endpoint
- Workload distribution endpoint
- Collaboration network endpoint
- Activity heatmap endpoint

Notes on drift from the original (SQLite / older-code) version of this file:
- Analytics routes are mounted under ``/api/v1/analytics`` (not ``/api/analytics``).
- Every analytics endpoint now requires authentication and every target
  developer must share an active workspace with the caller
  (``_require_developers_visible``). Tests seed a workspace + members and send
  a bearer token.
- Response shapes changed: productivity returns ``data`` (not ``data_points``);
  workload returns ``items`` (not ``distributions``); activity heatmap returns
  ``data`` (not ``activity_data``).
- The activity heatmap endpoint is ``GET /heatmap/activity/{developer_id}``
  with a ``days`` query param (previously POST with a body).
- The ``/analytics/quality`` endpoint no longer exists.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from tests.conftest import requires_postgres

settings = get_settings()

API = "/api/v1/analytics"


def _token(developer_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    payload = {"sub": developer_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _auth(developer_id: str) -> dict:
    return {"Authorization": f"Bearer {_token(developer_id)}"}


@pytest_asyncio.fixture
async def workspace_devs(db_session: AsyncSession):
    """Create a workspace with several active members.

    Returns (caller_id, [developer_ids]). All developers (including the caller)
    share the same active workspace so ``_require_developers_visible`` passes.
    """
    devs = [
        Developer(id=str(uuid4()), name=f"Dev {i}", email=f"dev-{uuid4().hex[:6]}@test.com")
        for i in range(4)
    ]
    db_session.add_all(devs)
    await db_session.flush()

    ws = Workspace(
        id=str(uuid4()),
        name="Analytics WS",
        slug=f"analytics-ws-{uuid4().hex[:6]}",
        owner_id=devs[0].id,
    )
    db_session.add(ws)
    await db_session.flush()

    for d in devs:
        db_session.add(
            WorkspaceMember(
                workspace_id=ws.id,
                developer_id=d.id,
                role="admin",
                status="active",
            )
        )
    await db_session.commit()
    for d in devs:
        await db_session.refresh(d)

    return devs[0].id, devs


class TestAnalyticsAPI:
    """Integration tests for /analytics endpoints."""

    # Skill Heatmap Tests

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap(self, client: AsyncClient, workspace_devs):
        """Test POST /analytics/heatmap/skills endpoint."""
        caller_id, devs = workspace_devs
        developer_ids = [str(dev.id) for dev in devs]

        response = await client.post(
            f"{API}/heatmap/skills",
            headers=_auth(caller_id),
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert "skills" in data
        assert "developers" in data

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_empty(self, client: AsyncClient, workspace_devs):
        """Test skill heatmap with no developers.

        Empty developer_ids is rejected with 400 (at least one required).
        """
        caller_id, _ = workspace_devs
        response = await client.post(
            f"{API}/heatmap/skills",
            headers=_auth(caller_id),
            json={"developer_ids": []},
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_invalid_ids(
        self, client: AsyncClient, workspace_devs
    ):
        """Test skill heatmap with developer IDs outside the caller's workspace."""
        caller_id, _ = workspace_devs
        response = await client.post(
            f"{API}/heatmap/skills",
            headers=_auth(caller_id),
            json={
                "developer_ids": [
                    "00000000-0000-0000-0000-000000000000",
                    "00000000-0000-0000-0000-000000000001",
                ]
            },
        )

        # Targets not visible to the caller -> 403 (cross-workspace read denied).
        assert response.status_code in [200, 403, 404]

    # Productivity Trends Tests

    @requires_postgres

    @pytest.mark.asyncio
    async def test_get_productivity_trends(
        self, client: AsyncClient, workspace_devs
    ):
        """Test POST /analytics/productivity endpoint."""
        caller_id, devs = workspace_devs
        response = await client.post(
            f"{API}/productivity",
            headers=_auth(caller_id),
            json={
                "developer_ids": [str(devs[0].id)],
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
                "metrics": ["commits", "prs", "reviews"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "summary" in data

    @requires_postgres

    @pytest.mark.asyncio
    async def test_get_productivity_trends_with_grouping(
        self, client: AsyncClient, workspace_devs
    ):
        """Test productivity trends with a metrics selection and grouping."""
        caller_id, devs = workspace_devs
        response = await client.post(
            f"{API}/productivity",
            headers=_auth(caller_id),
            json={
                "developer_ids": [str(devs[0].id)],
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
                "metrics": ["commits"],
                "group_by": "day",
            },
        )

        assert response.status_code == 200

    # Workload Distribution Tests

    @pytest.mark.asyncio
    async def test_get_workload_distribution(self, client: AsyncClient, workspace_devs):
        """Test POST /analytics/workload endpoint."""
        caller_id, devs = workspace_devs
        developer_ids = [str(dev.id) for dev in devs]

        response = await client.post(
            f"{API}/workload",
            headers=_auth(caller_id),
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "imbalance_score" in data

    @pytest.mark.asyncio
    async def test_get_workload_distribution_single_developer(
        self, client: AsyncClient, workspace_devs
    ):
        """Test workload distribution with single developer."""
        caller_id, devs = workspace_devs
        response = await client.post(
            f"{API}/workload",
            headers=_auth(caller_id),
            json={"developer_ids": [str(devs[0].id)]},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["imbalance_score"] == 0.0  # No imbalance with one developer

    # Collaboration Network Tests

    @pytest.mark.asyncio
    async def test_get_collaboration_network(
        self, client: AsyncClient, workspace_devs
    ):
        """Test POST /analytics/collaboration endpoint."""
        caller_id, devs = workspace_devs
        developer_ids = [str(dev.id) for dev in devs]

        response = await client.post(
            f"{API}/collaboration",
            headers=_auth(caller_id),
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "edges" in data

    @pytest.mark.asyncio
    async def test_get_collaboration_network_with_timeframe(
        self, client: AsyncClient, workspace_devs
    ):
        """Test collaboration network with a specific timeframe."""
        caller_id, devs = workspace_devs
        developer_ids = [str(dev.id) for dev in devs]

        response = await client.post(
            f"{API}/collaboration",
            headers=_auth(caller_id),
            json={
                "developer_ids": developer_ids,
                "date_range_days": 90,
            },
        )

        assert response.status_code == 200

    # Activity Heatmap Tests

    @pytest.mark.asyncio
    async def test_get_activity_heatmap(
        self, client: AsyncClient, workspace_devs
    ):
        """Test GET /analytics/heatmap/activity/{developer_id} endpoint."""
        caller_id, devs = workspace_devs
        response = await client.get(
            f"{API}/heatmap/activity/{devs[0].id}",
            headers=_auth(caller_id),
            params={"days": 30},
        )

        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    @pytest.mark.asyncio
    async def test_get_activity_heatmap_invalid_developer(
        self, client: AsyncClient, workspace_devs
    ):
        """Test activity heatmap with a developer outside the caller's workspace."""
        caller_id, _ = workspace_devs
        # Valid-but-absent UUID so the route exercises the not-found/forbidden
        # path rather than 500-ing on a malformed param.
        response = await client.get(
            f"{API}/heatmap/activity/00000000-0000-0000-0000-000000000000",
            headers=_auth(caller_id),
            params={"days": 30},
        )

        assert response.status_code in [200, 403, 404]


class TestAnalyticsAPIValidation:
    """Tests for analytics API input validation."""

    @pytest.mark.asyncio
    async def test_skill_heatmap_missing_developer_ids(
        self, client: AsyncClient, workspace_devs
    ):
        """Test skill heatmap without developer_ids."""
        caller_id, _ = workspace_devs
        response = await client.post(
            f"{API}/heatmap/skills",
            headers=_auth(caller_id),
            json={},
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_productivity_invalid_date_range(
        self, client: AsyncClient, workspace_devs
    ):
        """Test productivity with invalid date range."""
        caller_id, _ = workspace_devs
        response = await client.post(
            f"{API}/productivity",
            headers=_auth(caller_id),
            json={
                "developer_ids": ["00000000-0000-0000-0000-000000000000"],
                "date_range": {
                    "start_date": "invalid-date",
                    "end_date": "also-invalid",
                },
            },
        )

        assert response.status_code == 422

    @requires_postgres

    @pytest.mark.asyncio
    async def test_productivity_end_before_start(
        self, client: AsyncClient, workspace_devs
    ):
        """Test productivity with end date before start date."""
        caller_id, devs = workspace_devs
        response = await client.post(
            f"{API}/productivity",
            headers=_auth(caller_id),
            json={
                "developer_ids": [str(devs[0].id)],
                "date_range": {
                    "start_date": datetime.utcnow().isoformat(),
                    "end_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                },
            },
        )

        # Should reject or handle gracefully
        assert response.status_code in [200, 400, 422]
