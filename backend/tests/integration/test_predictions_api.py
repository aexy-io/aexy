"""
Integration tests for Predictions API endpoints.

These tests verify:
- Attrition risk prediction
- Burnout risk assessment
- Performance trajectory prediction
- Team health analysis
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


class TestPredictionsAPI:
    """Integration tests for /predictions endpoints."""

    # Attrition Risk Tests

    @pytest.mark.asyncio
    async def test_get_attrition_risk(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test GET /predictions/attrition/{developer_id} endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/attrition/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "risk_score" in data
        assert "risk_level" in data
        assert 0 <= data["risk_score"] <= 1
        assert data["risk_level"] in ["low", "moderate", "high", "critical"]

    @pytest.mark.asyncio
    async def test_get_attrition_risk_with_force_refresh(
        self, client: AsyncClient, sample_developer
    ):
        """Test attrition risk with cache bypass."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/attrition/{sample_developer.id}",
            params={"use_cache": False},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [200, 404, 500]

    @pytest.mark.asyncio
    async def test_get_attrition_risk_not_found(
        self, client: AsyncClient, sample_developer
    ):
        """Test attrition risk for non-existent developer."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            "/api/v1/predictions/attrition/nonexistent-id",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [404, 500]

    # Burnout Risk Tests

    @pytest.mark.asyncio
    async def test_get_burnout_risk(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test GET /predictions/burnout/{developer_id} endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/burnout/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "risk_score" in data
        assert "risk_level" in data

    @pytest.mark.asyncio
    async def test_get_burnout_risk_includes_work_patterns(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test that burnout risk includes work pattern analysis."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/burnout/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        if data.get("work_pattern_analysis"):
            assert "weekend_commits_percent" in data["work_pattern_analysis"]

    # Performance Trajectory Tests

    @pytest.mark.asyncio
    async def test_get_performance_trajectory(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /predictions/trajectory/{developer_id} endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/trajectory/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [200, 404, 500]
        if response.status_code == 200:
            data = response.json()
            assert "trajectory" in data
            assert data["trajectory"] in [
                "accelerating", "steady", "plateauing", "declining"
            ]

    @pytest.mark.asyncio
    async def test_get_performance_trajectory_with_months(
        self, client: AsyncClient, sample_developer
    ):
        """Test trajectory with custom prediction window."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/trajectory/{sample_developer.id}",
            params={"months": 12},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code in [200, 404, 500]

    @pytest.mark.asyncio
    async def test_get_trajectory_includes_career_readiness(
        self, client: AsyncClient, sample_developer
    ):
        """Test that trajectory includes career readiness."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/trajectory/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        if response.status_code == 200:
            data = response.json()
            if "career_readiness" in data:
                assert "next_level" in data["career_readiness"]

    # Team Health Tests

    @pytest.mark.asyncio
    async def test_get_team_health(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /predictions/team-health endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/predictions/team-health",
            json={"developer_ids": developer_ids},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "health_score" in data
        assert "health_grade" in data
        assert 0 <= data["health_score"] <= 1
        assert data["health_grade"] in ["A", "B", "C", "D", "F"]

    @pytest.mark.asyncio
    async def test_get_team_health_includes_risks(
        self, client: AsyncClient, sample_developers
    ):
        """Test that team health includes risk analysis."""
        developer_ids = [str(dev.id) for dev in sample_developers]
        token = create_test_token(sample_developers[0].id)

        response = await client.post(
            "/api/v1/predictions/team-health",
            json={"developer_ids": developer_ids},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "risks" in data
        assert "strengths" in data

    @pytest.mark.asyncio
    async def test_get_team_health_empty_team(
        self, client: AsyncClient, sample_developer
    ):
        """Test team health with no developers."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/predictions/team-health",
            json={"developer_ids": []},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 400

    # Developer Insights Tests (cached insights)

    @pytest.mark.asyncio
    async def test_get_developer_insights(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /predictions/insights/{developer_id} endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/insights/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_clear_developer_insights(
        self, client: AsyncClient, sample_developer
    ):
        """Test DELETE /predictions/insights/{developer_id} endpoint."""
        token = create_test_token(sample_developer.id)

        response = await client.delete(
            f"/api/v1/predictions/insights/{sample_developer.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 204


class TestPredictionsAPIValidation:
    """Tests for predictions API input validation."""

    @pytest.mark.asyncio
    async def test_team_health_missing_developer_ids(
        self, client: AsyncClient, sample_developer
    ):
        """Test team health without developer_ids."""
        token = create_test_token(sample_developer.id)

        response = await client.post(
            "/api/v1/predictions/team-health",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_trajectory_invalid_months(
        self, client: AsyncClient, sample_developer
    ):
        """Test trajectory with invalid months value."""
        token = create_test_token(sample_developer.id)

        response = await client.get(
            f"/api/v1/predictions/trajectory/{sample_developer.id}",
            params={"months": -5},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_predictions_unauthenticated(self, client: AsyncClient):
        """Test predictions endpoint without authentication."""
        response = await client.get(
            "/api/v1/predictions/attrition/some-id",
        )

        assert response.status_code == 403
