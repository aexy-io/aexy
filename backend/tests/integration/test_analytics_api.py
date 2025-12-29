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
from datetime import datetime, timedelta
from httpx import AsyncClient


class TestAnalyticsAPI:
    """Integration tests for /analytics endpoints."""

    # Skill Heatmap Tests

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /analytics/heatmap/skills endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/analytics/heatmap/skills",
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert "skills" in data
        assert "developers" in data

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_empty(self, client: AsyncClient):
        """Test skill heatmap with no developers."""
        response = await client.post(
            "/api/analytics/heatmap/skills",
            json={"developer_ids": []},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["skills"] == []
        assert data["developers"] == []

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_invalid_ids(self, client: AsyncClient):
        """Test skill heatmap with invalid developer IDs."""
        response = await client.post(
            "/api/analytics/heatmap/skills",
            json={"developer_ids": ["invalid-id-1", "invalid-id-2"]},
        )

        # Should handle gracefully
        assert response.status_code in [200, 404]

    # Productivity Trends Tests

    @pytest.mark.asyncio
    async def test_get_productivity_trends(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test POST /analytics/productivity endpoint."""
        response = await client.post(
            "/api/analytics/productivity",
            json={
                "developer_ids": [str(sample_developer.id)],
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
                "metrics": ["commits", "prs", "reviews"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "data_points" in data
        assert "summary" in data

    @pytest.mark.asyncio
    async def test_get_productivity_trends_with_grouping(
        self, client: AsyncClient, sample_developer
    ):
        """Test productivity trends with different groupings."""
        response = await client.post(
            "/api/analytics/productivity",
            json={
                "developer_ids": [str(sample_developer.id)],
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
                "group_by": "week",
            },
        )

        assert response.status_code == 200

    # Workload Distribution Tests

    @pytest.mark.asyncio
    async def test_get_workload_distribution(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /analytics/workload endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/analytics/workload",
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert "distributions" in data
        assert "imbalance_score" in data

    @pytest.mark.asyncio
    async def test_get_workload_distribution_single_developer(
        self, client: AsyncClient, sample_developer
    ):
        """Test workload distribution with single developer."""
        response = await client.post(
            "/api/analytics/workload",
            json={"developer_ids": [str(sample_developer.id)]},
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

        response = await client.post(
            "/api/analytics/collaboration",
            json={"developer_ids": developer_ids},
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

        response = await client.post(
            "/api/analytics/collaboration",
            json={
                "developer_ids": developer_ids,
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=90)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
            },
        )

        assert response.status_code == 200

    # Activity Heatmap Tests

    @pytest.mark.asyncio
    async def test_get_activity_heatmap(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test POST /analytics/heatmap/activity endpoint."""
        response = await client.post(
            "/api/analytics/heatmap/activity",
            json={
                "developer_id": str(sample_developer.id),
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "activity_data" in data

    @pytest.mark.asyncio
    async def test_get_activity_heatmap_invalid_developer(self, client: AsyncClient):
        """Test activity heatmap with invalid developer."""
        response = await client.post(
            "/api/analytics/heatmap/activity",
            json={
                "developer_id": "invalid-uuid",
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
            },
        )

        assert response.status_code in [200, 404]

    # Code Quality Tests

    @pytest.mark.asyncio
    async def test_get_code_quality_metrics(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /analytics/quality endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/analytics/quality",
            json={
                "developer_ids": developer_ids,
                "date_range": {
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat(),
                },
            },
        )

        assert response.status_code == 200


class TestAnalyticsAPIValidation:
    """Tests for analytics API input validation."""

    @pytest.mark.asyncio
    async def test_skill_heatmap_missing_developer_ids(self, client: AsyncClient):
        """Test skill heatmap without developer_ids."""
        response = await client.post(
            "/api/analytics/heatmap/skills",
            json={},
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_productivity_invalid_date_range(self, client: AsyncClient):
        """Test productivity with invalid date range."""
        response = await client.post(
            "/api/analytics/productivity",
            json={
                "developer_ids": ["some-id"],
                "date_range": {
                    "start_date": "invalid-date",
                    "end_date": "also-invalid",
                },
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_productivity_end_before_start(
        self, client: AsyncClient, sample_developer
    ):
        """Test productivity with end date before start date."""
        response = await client.post(
            "/api/analytics/productivity",
            json={
                "developer_ids": [str(sample_developer.id)],
                "date_range": {
                    "start_date": datetime.utcnow().isoformat(),
                    "end_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                },
            },
        )

        # Should reject or handle gracefully
        assert response.status_code in [200, 400, 422]

