"""
Tests for AnalyticsDashboardService.

These tests verify:
- Skill heatmap generation
- Productivity trends calculation
- Workload distribution analysis
- Collaboration network building
"""

import pytest
from datetime import datetime, timedelta

from aexy.services.analytics_dashboard import AnalyticsDashboardService
from aexy.schemas.analytics import DateRange


class TestAnalyticsDashboardService:
    """Tests for AnalyticsDashboardService."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return AnalyticsDashboardService()

    # Skill Heatmap Tests

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_with_developers(
        self, service, db_session, sample_developers
    ):
        """Test skill heatmap generation with valid developers."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.generate_skill_heatmap(developer_ids, db_session)

        assert result is not None
        assert hasattr(result, "skills")
        assert hasattr(result, "developers")
        assert len(result.developers) == len(sample_developers)

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_empty_developers(self, service, db_session):
        """Test skill heatmap with no developers."""
        result = await service.generate_skill_heatmap([], db_session)

        assert result is not None
        assert result.skills == []
        assert result.developers == []

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_has_cells(
        self, service, db_session, sample_developers
    ):
        """Test that skill heatmap contains cells for each developer-skill pair."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.generate_skill_heatmap(developer_ids, db_session)

        # cells should exist for developer-skill combinations
        assert hasattr(result, "cells")

    # Productivity Trends Tests

    @pytest.mark.asyncio
    async def test_get_productivity_trends(
        self, service, db_session, sample_developer, sample_commits_db, sample_pull_requests_db
    ):
        """Test productivity trends calculation."""
        date_range = DateRange(
            start_date=datetime.utcnow() - timedelta(days=30),
            end_date=datetime.utcnow(),
        )

        result = await service.get_productivity_trends(
            [sample_developer.id], db_session, date_range, group_by="day"
        )

        assert result is not None
        assert hasattr(result, "data")
        assert hasattr(result, "summary")

    @pytest.mark.asyncio
    async def test_get_productivity_trends_empty_range(
        self, service, db_session, sample_developer
    ):
        """Test productivity trends with no activity in range."""
        # Far future date range
        date_range = DateRange(
            start_date=datetime.utcnow() + timedelta(days=100),
            end_date=datetime.utcnow() + timedelta(days=130),
        )

        result = await service.get_productivity_trends(
            [sample_developer.id], db_session, date_range, group_by="day"
        )

        assert result is not None
        assert result.summary["total_commits"] == 0

    @pytest.mark.asyncio
    async def test_get_productivity_trends_summary_has_metrics(
        self, service, db_session, sample_developer, sample_commits_db
    ):
        """Test that productivity summary includes key metrics."""
        date_range = DateRange(
            start_date=datetime.utcnow() - timedelta(days=30),
            end_date=datetime.utcnow(),
        )

        result = await service.get_productivity_trends(
            [sample_developer.id], db_session, date_range, group_by="day"
        )

        assert "total_commits" in result.summary
        assert "total_prs" in result.summary
        assert "total_reviews" in result.summary

    # Workload Distribution Tests

    @pytest.mark.asyncio
    async def test_get_workload_distribution(
        self, service, db_session, sample_developers, sample_commits_db
    ):
        """Test workload distribution calculation."""
        developer_ids = [sample_developers[0].id]  # Use first developer

        result = await service.get_workload_distribution(developer_ids, db_session)

        assert result is not None
        assert hasattr(result, "items")
        assert hasattr(result, "imbalance_score")

    @pytest.mark.asyncio
    async def test_get_workload_distribution_empty(self, service, db_session):
        """Test workload distribution with no developers."""
        result = await service.get_workload_distribution([], db_session)

        assert result is not None
        assert result.items == []

    @pytest.mark.asyncio
    async def test_get_workload_distribution_imbalance_score(
        self, service, db_session, sample_developers
    ):
        """Test imbalance score calculation."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.get_workload_distribution(developer_ids, db_session)

        assert 0 <= result.imbalance_score <= 1

    # Collaboration Network Tests

    @pytest.mark.asyncio
    async def test_get_collaboration_network(
        self, service, db_session, sample_developer, sample_reviews_db
    ):
        """Test collaboration network generation."""
        result = await service.get_collaboration_network(
            [sample_developer.id], db_session
        )

        assert result is not None
        assert hasattr(result, "nodes")
        assert hasattr(result, "edges")

    @pytest.mark.asyncio
    async def test_get_collaboration_network_empty(self, service, db_session):
        """Test collaboration network with no developers."""
        result = await service.get_collaboration_network([], db_session)

        assert result is not None
        assert result.nodes == []
        assert result.edges == []

    @pytest.mark.asyncio
    async def test_get_collaboration_network_nodes_have_properties(
        self, service, db_session, sample_developers
    ):
        """Test that network nodes have required properties."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.get_collaboration_network(developer_ids, db_session)

        for node in result.nodes:
            assert "id" in node
            assert "name" in node

    # Activity Heatmap Tests

    @pytest.mark.asyncio
    async def test_generate_activity_heatmap(
        self, service, db_session, sample_developer, sample_commits_db
    ):
        """Test activity heatmap generation."""
        result = await service.generate_activity_heatmap(
            sample_developer.id, db_session, days=30
        )

        assert result is not None
        assert hasattr(result, "data")

    @pytest.mark.asyncio
    async def test_generate_activity_heatmap_invalid_developer(
        self, service, db_session
    ):
        """Test activity heatmap with invalid developer ID."""
        result = await service.generate_activity_heatmap(
            "invalid-uuid", db_session, days=30
        )

        # Should return empty data gracefully
        assert result is not None
        assert result.max_count == 0


class TestProductivityCalculations:
    """Unit tests for productivity calculation logic."""

    @pytest.mark.asyncio
    async def test_productivity_summary_values(self, db_session):
        """Test that productivity summary values are non-negative."""
        service = AnalyticsDashboardService()
        date_range = DateRange(
            start_date=datetime.utcnow() - timedelta(days=7),
            end_date=datetime.utcnow(),
        )

        result = await service.get_productivity_trends(
            [], db_session, date_range, group_by="day"
        )

        assert result.summary["total_commits"] >= 0
        assert result.summary["total_prs"] >= 0
        assert result.summary["total_reviews"] >= 0


class TestWorkloadCalculations:
    """Unit tests for workload calculation logic."""

    @pytest.mark.asyncio
    async def test_workload_imbalance_empty(self, db_session):
        """Test imbalance with no data."""
        service = AnalyticsDashboardService()

        result = await service.get_workload_distribution([], db_session)

        assert result.imbalance_score == 0.0

    @pytest.mark.asyncio
    async def test_workload_single_developer(self, db_session, sample_developer):
        """Test workload with single developer has zero imbalance."""
        service = AnalyticsDashboardService()

        result = await service.get_workload_distribution(
            [sample_developer.id], db_session
        )

        assert result.imbalance_score == 0.0
