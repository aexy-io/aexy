"""Integration tests for health endpoints."""

import pytest


class TestHealthEndpoints:
    """Test health check endpoints."""

    @pytest.mark.asyncio
    async def test_health_check(self, client):
        """Should return healthy status."""
        response = await client.get("/api/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_readiness_check(self, client):
        """Should return ready status."""
        response = await client.get("/api/v1/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
