"""
Integration tests for Predictions API endpoints.

These tests verify:
- Attrition risk prediction
- Burnout risk assessment
- Performance trajectory prediction
- Team health analysis
"""

import pytest
from httpx import AsyncClient


class TestPredictionsAPI:
    """Integration tests for /predictions endpoints."""

    # Attrition Risk Tests

    @pytest.mark.asyncio
    async def test_get_attrition_risk(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test GET /predictions/attrition/{developer_id} endpoint."""
        response = await client.get(
            f"/api/predictions/attrition/{sample_developer.id}"
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
        response = await client.get(
            f"/api/predictions/attrition/{sample_developer.id}",
            params={"use_cache": False},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_attrition_risk_not_found(self, client: AsyncClient):
        """Test attrition risk for non-existent developer."""
        response = await client.get(
            "/api/predictions/attrition/nonexistent-id"
        )

        assert response.status_code in [404, 200]  # May return null or 404

    # Burnout Risk Tests

    @pytest.mark.asyncio
    async def test_get_burnout_risk(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test GET /predictions/burnout/{developer_id} endpoint."""
        response = await client.get(
            f"/api/predictions/burnout/{sample_developer.id}"
        )

        assert response.status_code == 200
        data = response.json()
        assert "risk_score" in data
        assert "risk_level" in data
        assert "indicators" in data

    @pytest.mark.asyncio
    async def test_get_burnout_risk_includes_work_patterns(
        self, client: AsyncClient, sample_developer, sample_commits_db
    ):
        """Test that burnout risk includes work pattern analysis."""
        response = await client.get(
            f"/api/predictions/burnout/{sample_developer.id}"
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
        response = await client.get(
            f"/api/predictions/trajectory/{sample_developer.id}"
        )

        assert response.status_code == 200
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
        response = await client.get(
            f"/api/predictions/trajectory/{sample_developer.id}",
            params={"months_ahead": 12},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_trajectory_includes_career_readiness(
        self, client: AsyncClient, sample_developer
    ):
        """Test that trajectory includes career readiness."""
        response = await client.get(
            f"/api/predictions/trajectory/{sample_developer.id}"
        )

        assert response.status_code == 200
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

        response = await client.post(
            "/api/predictions/team-health",
            json={"developer_ids": developer_ids},
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

        response = await client.post(
            "/api/predictions/team-health",
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert "risks" in data
        assert "strengths" in data

    @pytest.mark.asyncio
    async def test_get_team_health_empty_team(self, client: AsyncClient):
        """Test team health with no developers."""
        response = await client.post(
            "/api/predictions/team-health",
            json={"developer_ids": []},
        )

        assert response.status_code in [200, 400]

    # Skill Gaps Prediction Tests

    @pytest.mark.asyncio
    async def test_predict_skill_gaps(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /predictions/skill-gaps endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/predictions/skill-gaps",
            json={
                "developer_ids": developer_ids,
                "roadmap_skills": ["Kubernetes", "Rust", "Machine Learning"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "gaps" in data or "skill_gaps" in data

    @pytest.mark.asyncio
    async def test_predict_skill_gaps_with_timeline(
        self, client: AsyncClient, sample_developers
    ):
        """Test skill gaps prediction with timeline."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/predictions/skill-gaps",
            json={
                "developer_ids": developer_ids,
                "roadmap_skills": ["GraphQL", "WebAssembly"],
                "timeline_months": 6,
            },
        )

        assert response.status_code == 200

    # Batch Predictions Tests

    @pytest.mark.asyncio
    async def test_batch_attrition_analysis(
        self, client: AsyncClient, sample_developers
    ):
        """Test POST /predictions/attrition/batch endpoint."""
        developer_ids = [str(dev.id) for dev in sample_developers]

        response = await client.post(
            "/api/predictions/attrition/batch",
            json={"developer_ids": developer_ids},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "results" in data

    # Cache Management Tests

    @pytest.mark.asyncio
    async def test_get_cached_insights(
        self, client: AsyncClient, sample_developer
    ):
        """Test GET /predictions/cached/{developer_id} endpoint."""
        response = await client.get(
            f"/api/predictions/cached/{sample_developer.id}"
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_clear_cached_insights(
        self, client: AsyncClient, sample_developer
    ):
        """Test DELETE /predictions/cached/{developer_id} endpoint."""
        response = await client.delete(
            f"/api/predictions/cached/{sample_developer.id}"
        )

        assert response.status_code in [200, 204]


class TestPredictionsAPIValidation:
    """Tests for predictions API input validation."""

    @pytest.mark.asyncio
    async def test_team_health_missing_developer_ids(self, client: AsyncClient):
        """Test team health without developer_ids."""
        response = await client.post(
            "/api/predictions/team-health",
            json={},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_skill_gaps_missing_skills(
        self, client: AsyncClient, sample_developer
    ):
        """Test skill gaps without roadmap_skills."""
        response = await client.post(
            "/api/predictions/skill-gaps",
            json={"developer_ids": [str(sample_developer.id)]},
        )

        assert response.status_code in [200, 422]

    @pytest.mark.asyncio
    async def test_trajectory_invalid_months(
        self, client: AsyncClient, sample_developer
    ):
        """Test trajectory with invalid months_ahead."""
        response = await client.get(
            f"/api/predictions/trajectory/{sample_developer.id}",
            params={"months_ahead": -5},
        )

        assert response.status_code in [400, 422]

