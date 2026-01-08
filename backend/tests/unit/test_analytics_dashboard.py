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
        assert "skills" in result
        assert "developers" in result
        assert len(result["developers"]) == len(sample_developers)

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_empty_developers(self, service, db_session):
        """Test skill heatmap with no developers."""
        result = await service.generate_skill_heatmap([], db_session)

        assert result is not None
        assert result["skills"] == []
        assert result["developers"] == []

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_aggregates_skills(
        self, service, db_session, sample_developers
    ):
        """Test that skill heatmap properly aggregates skills across developers."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.generate_skill_heatmap(developer_ids, db_session)

        # Check that common skills are identified
        skill_names = [s["name"] for s in result["skills"]]
        assert "Python" in skill_names  # Present in multiple developers

    @pytest.mark.asyncio
    async def test_generate_skill_heatmap_calculates_coverage(
        self, service, db_session, sample_developers
    ):
        """Test skill coverage percentage calculation."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.generate_skill_heatmap(developer_ids, db_session)

        for skill in result["skills"]:
            assert "coverage_percent" in skill
            assert 0 <= skill["coverage_percent"] <= 100

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
            [sample_developer.id], date_range, db_session
        )

        assert result is not None
        assert "data_points" in result
        assert "summary" in result

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
            [sample_developer.id], date_range, db_session
        )

        assert result is not None
        assert result["summary"]["total_commits"] == 0

    @pytest.mark.asyncio
    async def test_get_productivity_trends_calculates_velocity(
        self, service, db_session, sample_developer, sample_commits_db
    ):
        """Test that velocity metrics are calculated."""
        date_range = DateRange(
            start_date=datetime.utcnow() - timedelta(days=30),
            end_date=datetime.utcnow(),
        )

        result = await service.get_productivity_trends(
            [sample_developer.id], date_range, db_session
        )

        assert "velocity" in result["summary"]

    # Workload Distribution Tests

    @pytest.mark.asyncio
    async def test_get_workload_distribution(
        self, service, db_session, sample_developers, sample_commits_db
    ):
        """Test workload distribution calculation."""
        developer_ids = [sample_developers[0].id]  # Use first developer

        result = await service.get_workload_distribution(developer_ids, db_session)

        assert result is not None
        assert "distributions" in result
        assert "imbalance_score" in result

    @pytest.mark.asyncio
    async def test_get_workload_distribution_empty(self, service, db_session):
        """Test workload distribution with no developers."""
        result = await service.get_workload_distribution([], db_session)

        assert result is not None
        assert result["distributions"] == []

    @pytest.mark.asyncio
    async def test_get_workload_distribution_imbalance_score(
        self, service, db_session, sample_developers
    ):
        """Test imbalance score calculation."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.get_workload_distribution(developer_ids, db_session)

        assert 0 <= result["imbalance_score"] <= 1

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
        assert "nodes" in result
        assert "edges" in result

    @pytest.mark.asyncio
    async def test_get_collaboration_network_empty(self, service, db_session):
        """Test collaboration network with no developers."""
        result = await service.get_collaboration_network([], db_session)

        assert result is not None
        assert result["nodes"] == []
        assert result["edges"] == []

    @pytest.mark.asyncio
    async def test_get_collaboration_network_nodes_have_properties(
        self, service, db_session, sample_developers
    ):
        """Test that network nodes have required properties."""
        developer_ids = [dev.id for dev in sample_developers]

        result = await service.get_collaboration_network(developer_ids, db_session)

        for node in result["nodes"]:
            assert "id" in node
            assert "name" in node

    # Activity Heatmap Tests

    @pytest.mark.asyncio
    async def test_generate_activity_heatmap(
        self, service, db_session, sample_developer, sample_commits_db
    ):
        """Test activity heatmap generation."""
        date_range = DateRange(
            start_date=datetime.utcnow() - timedelta(days=30),
            end_date=datetime.utcnow(),
        )

        result = await service.generate_activity_heatmap(
            sample_developer.id, date_range, db_session
        )

        assert result is not None
        assert "activity_data" in result

    @pytest.mark.asyncio
    async def test_generate_activity_heatmap_invalid_developer(
        self, service, db_session
    ):
        """Test activity heatmap with invalid developer ID."""
        date_range = DateRange(
            start_date=datetime.utcnow() - timedelta(days=30),
            end_date=datetime.utcnow(),
        )

        result = await service.generate_activity_heatmap(
            "invalid-uuid", date_range, db_session
        )

        # Should return empty or None gracefully
        assert result is None or result.get("activity_data") == []


class TestSkillHeatmapCalculations:
    """Unit tests for skill heatmap calculation logic."""

    def test_calculate_skill_level_from_frequency(self):
        """Test skill level calculation based on usage frequency."""
        service = AnalyticsDashboardService()

        # High frequency = high level
        high_freq = service._calculate_skill_level(100, 1000)
        low_freq = service._calculate_skill_level(10, 1000)

        assert high_freq > low_freq

    def test_calculate_coverage_percentage(self):
        """Test coverage percentage calculation."""
        service = AnalyticsDashboardService()

        # 3 out of 4 developers have skill
        coverage = service._calculate_coverage(3, 4)
        assert coverage == 75.0

        # All developers have skill
        full_coverage = service._calculate_coverage(4, 4)
        assert full_coverage == 100.0

        # No developers have skill
        no_coverage = service._calculate_coverage(0, 4)
        assert no_coverage == 0.0

    def test_calculate_coverage_zero_division(self):
        """Test coverage calculation handles zero total."""
        service = AnalyticsDashboardService()

        coverage = service._calculate_coverage(0, 0)
        assert coverage == 0.0


class TestProductivityCalculations:
    """Unit tests for productivity calculation logic."""

    def test_calculate_velocity_from_commits(self):
        """Test velocity calculation from commit data."""
        service = AnalyticsDashboardService()

        commits_per_day = [5, 3, 7, 2, 8, 4, 6]
        velocity = service._calculate_velocity(commits_per_day)

        assert velocity > 0
        assert isinstance(velocity, float)

    def test_calculate_velocity_empty_data(self):
        """Test velocity with no commits."""
        service = AnalyticsDashboardService()

        velocity = service._calculate_velocity([])
        assert velocity == 0.0


class TestWorkloadCalculations:
    """Unit tests for workload calculation logic."""

    def test_calculate_imbalance_score_balanced(self):
        """Test imbalance score for balanced workload."""
        service = AnalyticsDashboardService()

        # Equal distribution
        workloads = [25, 25, 25, 25]
        score = service._calculate_imbalance(workloads)

        assert score < 0.1  # Nearly balanced

    def test_calculate_imbalance_score_imbalanced(self):
        """Test imbalance score for imbalanced workload."""
        service = AnalyticsDashboardService()

        # Very unequal distribution
        workloads = [90, 5, 3, 2]
        score = service._calculate_imbalance(workloads)

        assert score > 0.5  # Significant imbalance

    def test_calculate_imbalance_empty(self):
        """Test imbalance with no data."""
        service = AnalyticsDashboardService()

        score = service._calculate_imbalance([])
        assert score == 0.0
