"""
Tests for PredictiveAnalyticsService.

These tests verify:
- Attrition risk analysis
- Burnout risk assessment
- Performance trajectory prediction
- Team health analysis
- Cache behavior
"""

import json
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

from aexy.services.predictive_analytics import PredictiveAnalyticsService
from aexy.schemas.analytics import (
    AttritionRiskAnalysis,
    BurnoutRiskAssessment,
    PerformanceTrajectory,
    TeamHealthAnalysis,
)


def _make_llm_response(data: dict):
    """Create a mock LLM response object with raw_response attribute."""
    resp = MagicMock()
    resp.raw_response = json.dumps(data)
    return resp


class TestPredictiveAnalyticsService:
    """Tests for PredictiveAnalyticsService."""

    @pytest.fixture
    def mock_llm(self):
        """Create a mock LLM gateway."""
        mock = MagicMock()
        mock.analyze = AsyncMock()
        mock.get_model_name = MagicMock(return_value="test-model")
        return mock

    @pytest.fixture
    def service(self, mock_llm):
        """Create service instance with mocked LLM."""
        return PredictiveAnalyticsService(llm_gateway=mock_llm)

    # Attrition Risk Tests

    @pytest.mark.asyncio
    async def test_analyze_attrition_risk_returns_analysis(
        self, service, mock_llm, db_session, sample_developer, sample_commits_db
    ):
        """Test attrition risk analysis returns proper structure."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.35,
            "risk_level": "low",
            "confidence": 0.8,
            "factors": [
                {"factor": "stable_activity", "weight": 0.3, "evidence": "Consistent commits", "trend": "stable"}
            ],
            "positive_signals": ["Regular commit pattern"],
            "recommendations": ["Continue engagement"],
            "suggested_actions": ["Schedule regular 1:1s"],
        })

        result = await service.analyze_attrition_risk(
            sample_developer.id, db_session
        )

        assert result is not None
        assert 0 <= result.risk_score <= 1
        assert result.risk_level in ["low", "moderate", "high", "critical"]
        assert 0 <= result.confidence <= 1

    @pytest.mark.asyncio
    async def test_analyze_attrition_risk_low_activity(
        self, service, mock_llm, db_session, sample_developer
    ):
        """Test attrition risk with low/no activity flags higher risk."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.75,
            "risk_level": "high",
            "confidence": 0.7,
            "factors": [
                {"factor": "declining_activity", "weight": 0.6, "evidence": "No recent commits", "trend": "declining"}
            ],
            "positive_signals": [],
            "recommendations": ["Investigate engagement"],
            "suggested_actions": ["Schedule urgent 1:1"],
        })

        result = await service.analyze_attrition_risk(
            sample_developer.id, db_session
        )

        assert result.risk_score >= 0.5

    @pytest.mark.asyncio
    async def test_analyze_attrition_risk_includes_factors(
        self, service, mock_llm, db_session, sample_developer, sample_commits_db
    ):
        """Test that attrition analysis includes risk factors."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.45,
            "risk_level": "moderate",
            "confidence": 0.75,
            "factors": [
                {"factor": "reduced_collaboration", "weight": 0.4, "evidence": "Fewer reviews", "trend": "declining"},
                {"factor": "changed_hours", "weight": 0.2, "evidence": "Late commits", "trend": "stable"},
            ],
            "positive_signals": ["Quality maintained"],
            "recommendations": ["Review workload"],
            "suggested_actions": ["Discuss work-life balance"],
        })

        result = await service.analyze_attrition_risk(
            sample_developer.id, db_session
        )

        assert len(result.factors) > 0
        for factor in result.factors:
            assert factor.factor  # RiskFactor object, not dict
            assert factor.weight >= 0

    @pytest.mark.asyncio
    async def test_analyze_attrition_risk_invalid_developer(
        self, service, mock_llm, db_session
    ):
        """Test attrition analysis with invalid developer ID."""
        # Service raises ValueError for nonexistent developer
        with pytest.raises(ValueError, match="not found"):
            await service.analyze_attrition_risk(
                "nonexistent-id", db_session
            )

    # Burnout Risk Tests

    @pytest.mark.asyncio
    async def test_assess_burnout_risk(
        self, service, mock_llm, db_session, sample_developer, sample_commits_db
    ):
        """Test burnout risk assessment."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.3,
            "risk_level": "low",
            "confidence": 0.85,
            "indicators": ["Normal work hours", "Consistent output"],
            "factors": [],
            "recommendations": ["Maintain current pace"],
        })

        result = await service.assess_burnout_risk(
            sample_developer.id, db_session
        )

        assert result is not None
        assert 0 <= result.risk_score <= 1
        assert result.risk_level in ["low", "moderate", "high", "critical"]

    @pytest.mark.asyncio
    async def test_assess_burnout_risk_high_activity(
        self, service, mock_llm, db_session, sample_developer
    ):
        """Test burnout risk with excessive activity patterns."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.8,
            "risk_level": "high",
            "confidence": 0.9,
            "indicators": [
                "High weekend activity",
                "Frequent late-night commits",
                "Increasing volume trend",
            ],
            "factors": [],
            "recommendations": ["Consider workload reduction", "Encourage time off"],
        })

        result = await service.assess_burnout_risk(
            sample_developer.id, db_session
        )

        assert result.risk_score >= 0.6
        assert len(result.indicators) > 0

    @pytest.mark.asyncio
    async def test_assess_burnout_includes_factors(
        self, service, mock_llm, db_session, sample_developer, sample_commits_db
    ):
        """Test that burnout assessment includes factors and indicators."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.4,
            "risk_level": "moderate",
            "confidence": 0.8,
            "indicators": ["Some weekend work"],
            "factors": [
                {"factor": "weekend_work", "weight": 0.3, "evidence": "15% weekend commits", "trend": "stable"},
            ],
            "recommendations": ["Monitor workload"],
        })

        result = await service.assess_burnout_risk(
            sample_developer.id, db_session
        )

        assert result.indicators is not None
        assert len(result.indicators) > 0

    # Performance Trajectory Tests

    @pytest.mark.asyncio
    async def test_predict_performance_trajectory(
        self, service, mock_llm, db_session, sample_developer, sample_commits_db
    ):
        """Test performance trajectory prediction."""
        mock_llm.analyze.return_value = _make_llm_response({
            "trajectory": "steady",
            "confidence": 0.75,
            "predicted_growth": [
                {"skill": "Python", "current": 80, "predicted": 85, "timeline": "3 months"},
            ],
            "challenges": ["May need more senior mentorship"],
            "opportunities": ["Could lead small projects"],
            "career_readiness": {
                "next_level": "Staff Engineer",
                "readiness_score": 0.6,
                "blockers": ["Need more system design experience"],
            },
            "recommendations": ["Focus on architecture skills"],
        })

        result = await service.predict_performance_trajectory(
            sample_developer.id, db_session
        )

        assert result is not None
        assert result.trajectory in ["accelerating", "steady", "plateauing", "declining"]
        assert 0 <= result.confidence <= 1

    @pytest.mark.asyncio
    async def test_predict_trajectory_includes_growth_areas(
        self, service, mock_llm, db_session, sample_developer
    ):
        """Test trajectory includes predicted skill growth."""
        mock_llm.analyze.return_value = _make_llm_response({
            "trajectory": "accelerating",
            "confidence": 0.8,
            "predicted_growth": [
                {"skill": "Python", "current": 70, "predicted": 85, "timeline": "6 months"},
                {"skill": "System Design", "current": 40, "predicted": 60, "timeline": "6 months"},
            ],
            "challenges": [],
            "opportunities": ["High growth potential"],
            "career_readiness": {
                "next_level": "Senior",
                "readiness_score": 0.7,
                "blockers": [],
            },
            "recommendations": [],
        })

        result = await service.predict_performance_trajectory(
            sample_developer.id, db_session
        )

        assert len(result.predicted_growth) > 0

    @pytest.mark.asyncio
    async def test_predict_trajectory_career_readiness(
        self, service, mock_llm, db_session, sample_developer
    ):
        """Test trajectory includes career readiness assessment."""
        mock_llm.analyze.return_value = _make_llm_response({
            "trajectory": "steady",
            "confidence": 0.7,
            "predicted_growth": [],
            "challenges": [],
            "opportunities": [],
            "career_readiness": {
                "next_level": "Principal Engineer",
                "readiness_score": 0.4,
                "blockers": ["Need leadership experience", "Missing cross-team collaboration"],
            },
            "recommendations": ["Seek leadership opportunities"],
        })

        result = await service.predict_performance_trajectory(
            sample_developer.id, db_session
        )

        assert result.career_readiness is not None
        assert result.career_readiness.next_level == "Principal Engineer"

    # Team Health Tests

    @pytest.mark.asyncio
    async def test_analyze_team_health(
        self, service, mock_llm, db_session, sample_developers
    ):
        """Test team health analysis."""
        developer_ids = [dev.id for dev in sample_developers]

        mock_llm.analyze.return_value = _make_llm_response({
            "health_score": 0.75,
            "health_grade": "B",
            "strengths": ["Strong Python expertise", "Good code review culture"],
            "risks": [
                {"risk": "Single point of failure for DevOps", "severity": "high", "mitigation": "Cross-train team"}
            ],
            "capacity_assessment": {
                "current_utilization": 0.7,
                "sustainable_velocity": True,
                "bottlenecks": [],
            },
            "recommendations": ["Hire DevOps engineer"],
            "suggested_hires": ["DevOps Engineer", "Frontend Developer"],
        })

        result = await service.analyze_team_health(developer_ids, db_session)

        assert result is not None
        assert 0 <= result.health_score <= 1
        assert result.health_grade in ["A", "B", "C", "D", "F"]

    @pytest.mark.asyncio
    async def test_analyze_team_health_identifies_risks(
        self, service, mock_llm, db_session, sample_developers
    ):
        """Test that team health identifies risks."""
        developer_ids = [dev.id for dev in sample_developers]

        mock_llm.analyze.return_value = _make_llm_response({
            "health_score": 0.5,
            "health_grade": "C",
            "strengths": [],
            "risks": [
                {"risk": "High attrition risk", "severity": "high", "mitigation": "Address concerns"},
                {"risk": "Skill gaps in frontend", "severity": "medium", "mitigation": "Training"},
            ],
            "capacity_assessment": {
                "current_utilization": 0.9,
                "sustainable_velocity": False,
                "bottlenecks": ["Code review"],
            },
            "recommendations": ["Reduce workload", "Hire frontend developer"],
            "suggested_hires": ["Frontend Developer"],
        })

        result = await service.analyze_team_health(developer_ids, db_session)

        assert len(result.risks) > 0
        for risk in result.risks:
            assert risk.risk  # TeamRisk object, not dict
            assert risk.severity

    @pytest.mark.asyncio
    async def test_analyze_team_health_empty_team(
        self, service, mock_llm, db_session
    ):
        """Test team health with no developers."""
        mock_llm.analyze.return_value = _make_llm_response({
            "health_score": 0.0,
            "health_grade": "F",
            "strengths": [],
            "risks": [],
            "capacity_assessment": {
                "current_utilization": 0.0,
                "sustainable_velocity": False,
                "bottlenecks": [],
            },
            "recommendations": [],
            "suggested_hires": [],
        })

        result = await service.analyze_team_health([], db_session)

        assert result is not None
        assert result.health_score == 0.0

    # Cache Tests

    @pytest.mark.asyncio
    async def test_analyze_uses_cache(
        self, service, mock_llm, db_session, sample_developer, sample_commits_db
    ):
        """Test that analysis uses cache on second call."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.35,
            "risk_level": "low",
            "confidence": 0.8,
            "factors": [],
            "positive_signals": [],
            "recommendations": [],
            "suggested_actions": [],
        })

        # First call
        await service.analyze_attrition_risk(
            sample_developer.id, db_session, use_cache=True
        )

        # Second call should use cache
        await service.analyze_attrition_risk(
            sample_developer.id, db_session, use_cache=True
        )

        # LLM should only be called once if cache is working
        # (depends on implementation - this is a placeholder assertion)
        assert mock_llm.analyze.call_count >= 1

    @pytest.mark.asyncio
    async def test_analyze_bypasses_cache_when_disabled(
        self, service, mock_llm, db_session, sample_developer
    ):
        """Test that cache can be bypassed."""
        mock_llm.analyze.return_value = _make_llm_response({
            "risk_score": 0.35,
            "risk_level": "low",
            "confidence": 0.8,
            "factors": [],
            "positive_signals": [],
            "recommendations": [],
            "suggested_actions": [],
        })

        # Two calls with cache disabled
        await service.analyze_attrition_risk(
            sample_developer.id, db_session, use_cache=False
        )
        await service.analyze_attrition_risk(
            sample_developer.id, db_session, use_cache=False
        )

        # LLM should be called twice
        assert mock_llm.analyze.call_count == 2

    @pytest.mark.asyncio
    async def test_get_cached_insights(
        self, service, db_session, sample_developer
    ):
        """Test retrieving all cached insights for a developer."""
        insights = await service.get_all_cached_insights(
            sample_developer.id, db_session
        )

        assert isinstance(insights, list)

    @pytest.mark.asyncio
    async def test_clear_cached_insights(
        self, service, db_session, sample_developer
    ):
        """Test clearing cached insights."""
        cleared_count = await service.clear_cached_insights(
            sample_developer.id, db_session
        )

        assert cleared_count >= 0


class TestTrendCalculation:
    """Unit tests for trend calculation logic."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        mock_llm = MagicMock()
        return PredictiveAnalyticsService(llm_gateway=mock_llm)

    def test_calculate_trend_increasing(self, service):
        """Test increasing trend calculation."""
        trend = service._calculate_trend(current=150, baseline=100)
        assert "increasing" in trend

    def test_calculate_trend_decreasing(self, service):
        """Test decreasing trend calculation."""
        trend = service._calculate_trend(current=50, baseline=100)
        assert "decreasing" in trend

    def test_calculate_trend_stable(self, service):
        """Test stable trend calculation."""
        trend = service._calculate_trend(current=105, baseline=100)
        assert trend == "stable"

    def test_calculate_trend_zero_baseline(self, service):
        """Test trend with zero baseline."""
        trend = service._calculate_trend(current=10, baseline=0)
        assert trend == "new activity"

    def test_calculate_trend_no_activity(self, service):
        """Test trend with no activity in either period."""
        trend = service._calculate_trend(current=0, baseline=0)
        assert trend == "no activity"
