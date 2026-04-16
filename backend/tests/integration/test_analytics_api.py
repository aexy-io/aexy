"""
Integration tests for Analytics API endpoints.

These tests verify:
- Skill heatmap endpoint
- Productivity trends endpoint
- Workload distribution endpoint
- Collaboration network endpoint
- Activity heatmap endpoint
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


class TestAnalyticsAPI:
    """Integration tests for /analytics endpoints."""

    # Skill Heatmap Tests

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /analytics/heatmap/skills endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/analytics/heatmap/skills",
            json={"developer_ids": developer_ids},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "skills" in data
        assert "developers" in data

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_empty(self, client: AsyncClient, sample_developer):
        """Test skill heatmap with no developers returns 400."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/heatmap/skills",
            json={"developer_ids": []},
            headers={"Authorization": f"Bearer {token}"},
        )

        # Endpoint requires at least one developer ID
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_invalid_ids(
        self, client: AsyncClient, sample_developer
    ):
        """Test skill heatmap with invalid developer IDs."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/heatmap/skills",
            json={"developer_ids": ["invalid-id-1", "invalid-id-2"]},
            headers={"Authorization": f"Bearer {token}"},
        )

        # Should handle gracefully (returns empty data or 200)
        assert response.status_code in [200, 404]

    # Productivity Trends Tests

    @pytest.mark.asyncio
    async def test_get_productivity_trends(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test POST /analytics/productivity endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/productivity",
            json={
                "developer_ids": [str(sample_developer.id)],
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "summary" in data

    @pytest.mark.asyncio
    async def test_get_productivity_trends_empty_developers(
        self, client: AsyncClient, sample_developer
    ):
        """Test productivity trends with empty developer list returns 400."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/productivity",
            json={
                "developer_ids": [],
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # Endpoint requires at least one developer ID
        assert response.status_code == 400

    # Workload Distribution Tests

    @pytest.mark.asyncio
    async def test_get_workload_distribution(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /analytics/workload endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/analytics/workload",
            json={"developer_ids": developer_ids},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "imbalance_score" in data

    @pytest.mark.asyncio
    async def test_get_workload_distribution_single_developer(
        self, client: AsyncClient, sample_developer
    ):
        """Test workload distribution with single developer."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/workload",
            json={"developer_ids": [str(sample_developer.id)]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["imbalance_score"] == 0.0  # No imbalance with one developer

    # Collaboration Network Tests

    @pytest.mark.asyncio
    async def test_get_collaboration_network(
        self, client: AsyncClient, sample_developers, sample_reviews_db
    ):
        """Test POST /analytics/collaboration endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/analytics/collaboration",
            json={"developer_ids": developer_ids},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "edges" in data

    @pytest.mark.asyncio
    async def test_get_collaboration_network_with_timeframe(
        self, client: AsyncClient, sample_developers
    ):
        """Test collaboration network with specific timeframe."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/analytics/collaboration",
            json={
                "developer_ids": developer_ids,
                "date_range_days": 90,
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200

    # Activity Heatmap Tests

    @pytest.mark.asyncio
    async def test_get_activity_heatmap(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test GET /analytics/heatmap/activity/{developer_id} endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/analytics/heatmap/activity/{sample_developer.id}",
            params={"days": 30},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    @pytest.mark.asyncio
    async def test_get_activity_heatmap_invalid_developer(
        self, client: AsyncClient, sample_developer
    ):
        """Test activity heatmap with invalid developer."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/analytics/heatmap/activity/invalid-uuid",
            params={"days": 30},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [200, 404]


class TestAnalyticsAPIValidation:
    """Tests for analytics API input validation."""

    @pytest.mark.asyncio
    async def test_skill_heatmap_missing_developer_ids(
        self, client: AsyncClient, sample_developer
    ):
        """Test skill heatmap without developer_ids."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/heatmap/skills",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_productivity_invalid_date_range(
        self, client: AsyncClient, sample_developer
    ):
        """Test productivity with invalid date range."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/productivity",
            json={
                "developer_ids": ["some-id"],
                "date_range": {
                    "start_date": "invalid-date",
                    "end_date": "also-invalid",
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_productivity_end_before_start(
        self, client: AsyncClient, sample_developer
    ):
        """Test productivity with end date before start date."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/analytics/productivity",
            json={
                "developer_ids": [str(sample_developer.id)],
                "date_range": {
                    "start_date": datetime.utcnow().isoformat(),
                    "end_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # Should reject or handle gracefully
        assert response.status_code in [200, 400, 422]
