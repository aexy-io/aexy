"""Tests for LLM base types and interfaces."""

import pytest

from gitraki.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    AnalysisType,
    CodeQualityIndicators,
    DomainAnalysis,
    FrameworkAnalysis,
    LanguageAnalysis,
    LLMConfig,
    MatchScore,
    SoftSkillAnalysis,
    TaskSignals,
)


class TestLLMConfig:
    """Tests for LLMConfig model."""

    def test_default_values(self):
        """Should have sensible defaults."""
        config = LLMConfig(provider="claude", model="test-model")

        assert config.provider == "claude"
        assert config.model == "test-model"
        assert config.api_key is None
        assert config.base_url is None
        assert config.max_tokens == 4096
        assert config.temperature == 0.0
        assert config.timeout == 60

    def test_with_api_key(self):
        """Should accept API key."""
        config = LLMConfig(
            provider="claude",
            model="claude-sonnet-4-20250514",
            api_key="test-key",
        )

        assert config.api_key == "test-key"

    def test_with_base_url(self):
        """Should accept base URL for self-hosted."""
        config = LLMConfig(
            provider="ollama",
            model="codellama",
            base_url="http://localhost:11434",
        )

        assert config.base_url == "http://localhost:11434"


class TestAnalysisType:
    """Tests for AnalysisType enum."""

    def test_all_types_exist(self):
        """Should have all expected analysis types."""
        assert AnalysisType.CODE == "code"
        assert AnalysisType.COMMIT_MESSAGE == "commit_message"
        assert AnalysisType.PR_DESCRIPTION == "pr_description"
        assert AnalysisType.REVIEW_COMMENT == "review_comment"
        assert AnalysisType.TASK_DESCRIPTION == "task_description"


class TestAnalysisRequest:
    """Tests for AnalysisRequest model."""

    def test_minimal_request(self):
        """Should create with minimal fields."""
        request = AnalysisRequest(
            content="def hello(): pass",
            analysis_type=AnalysisType.CODE,
        )

        assert request.content == "def hello(): pass"
        assert request.analysis_type == AnalysisType.CODE
        assert request.context == {}
        assert request.file_path is None

    def test_full_request(self):
        """Should accept all fields."""
        request = AnalysisRequest(
            content="def hello(): pass",
            analysis_type=AnalysisType.CODE,
            context={"repo": "test/repo"},
            file_path="src/main.py",
            language_hint="python",
        )

        assert request.file_path == "src/main.py"
        assert request.language_hint == "python"
        assert request.context["repo"] == "test/repo"


class TestLanguageAnalysis:
    """Tests for LanguageAnalysis model."""

    def test_minimal(self):
        """Should create with minimal fields."""
        lang = LanguageAnalysis(name="Python")

        assert lang.name == "Python"
        assert lang.proficiency_indicators == []
        assert lang.patterns_detected == []
        assert lang.confidence == 0.0

    def test_full(self):
        """Should accept all fields."""
        lang = LanguageAnalysis(
            name="Python",
            proficiency_indicators=["async/await", "type hints"],
            patterns_detected=["factory pattern"],
            confidence=0.85,
        )

        assert lang.proficiency_indicators == ["async/await", "type hints"]
        assert lang.confidence == 0.85

    def test_confidence_bounds(self):
        """Should enforce confidence bounds."""
        with pytest.raises(ValueError):
            LanguageAnalysis(name="Python", confidence=1.5)

        with pytest.raises(ValueError):
            LanguageAnalysis(name="Python", confidence=-0.1)


class TestFrameworkAnalysis:
    """Tests for FrameworkAnalysis model."""

    def test_minimal(self):
        """Should create with minimal fields."""
        fw = FrameworkAnalysis(name="FastAPI")

        assert fw.name == "FastAPI"
        assert fw.category == "unknown"
        assert fw.usage_depth == "basic"

    def test_full(self):
        """Should accept all fields."""
        fw = FrameworkAnalysis(
            name="FastAPI",
            category="web",
            usage_depth="advanced",
            patterns_detected=["dependency injection"],
            confidence=0.9,
        )

        assert fw.category == "web"
        assert fw.usage_depth == "advanced"


class TestDomainAnalysis:
    """Tests for DomainAnalysis model."""

    def test_minimal(self):
        """Should create with minimal fields."""
        domain = DomainAnalysis(name="payments")

        assert domain.name == "payments"
        assert domain.indicators == []

    def test_full(self):
        """Should accept all fields."""
        domain = DomainAnalysis(
            name="authentication",
            indicators=["JWT handling", "OAuth flow"],
            confidence=0.8,
        )

        assert domain.indicators == ["JWT handling", "OAuth flow"]


class TestSoftSkillAnalysis:
    """Tests for SoftSkillAnalysis model."""

    def test_minimal(self):
        """Should create with minimal fields."""
        skill = SoftSkillAnalysis(skill="communication")

        assert skill.skill == "communication"
        assert skill.score == 0.0

    def test_full(self):
        """Should accept all fields."""
        skill = SoftSkillAnalysis(
            skill="mentorship",
            score=0.75,
            indicators=["explains concepts", "provides examples"],
        )

        assert skill.score == 0.75


class TestCodeQualityIndicators:
    """Tests for CodeQualityIndicators model."""

    def test_defaults(self):
        """Should have sensible defaults."""
        quality = CodeQualityIndicators()

        assert quality.complexity == "moderate"
        assert quality.documentation_quality == "moderate"
        assert quality.test_coverage_indicators == []
        assert quality.best_practices == []
        assert quality.concerns == []

    def test_full(self):
        """Should accept all fields."""
        quality = CodeQualityIndicators(
            complexity="high",
            test_coverage_indicators=["pytest fixtures"],
            documentation_quality="excellent",
            best_practices=["type hints", "docstrings"],
            concerns=["complex nesting"],
        )

        assert quality.complexity == "high"
        assert quality.documentation_quality == "excellent"


class TestAnalysisResult:
    """Tests for AnalysisResult model."""

    def test_empty_result(self):
        """Should create empty result."""
        result = AnalysisResult()

        assert result.languages == []
        assert result.frameworks == []
        assert result.domains == []
        assert result.soft_skills == []
        assert result.code_quality is None
        assert result.confidence == 0.0

    def test_full_result(self):
        """Should accept all fields."""
        result = AnalysisResult(
            languages=[LanguageAnalysis(name="Python", confidence=0.9)],
            frameworks=[FrameworkAnalysis(name="FastAPI", category="web")],
            domains=[DomainAnalysis(name="backend")],
            soft_skills=[SoftSkillAnalysis(skill="communication", score=0.8)],
            code_quality=CodeQualityIndicators(complexity="low"),
            summary="A well-structured API endpoint",
            confidence=0.85,
            tokens_used=500,
            provider="claude",
            model="claude-sonnet-4-20250514",
        )

        assert len(result.languages) == 1
        assert result.languages[0].name == "Python"
        assert result.provider == "claude"
        assert result.tokens_used == 500


class TestTaskSignals:
    """Tests for TaskSignals model."""

    def test_defaults(self):
        """Should have sensible defaults."""
        signals = TaskSignals()

        assert signals.required_skills == []
        assert signals.preferred_skills == []
        assert signals.domain is None
        assert signals.complexity == "medium"

    def test_full(self):
        """Should accept all fields."""
        signals = TaskSignals(
            required_skills=["Python", "FastAPI"],
            preferred_skills=["Redis"],
            domain="backend",
            complexity="high",
            estimated_effort="days",
            keywords=["API", "caching"],
            confidence=0.9,
        )

        assert "Python" in signals.required_skills
        assert signals.estimated_effort == "days"


class TestMatchScore:
    """Tests for MatchScore model."""

    def test_minimal(self):
        """Should create with minimal fields."""
        score = MatchScore(
            developer_id="dev-123",
            overall_score=75.0,
            skill_match=80.0,
            experience_match=70.0,
            growth_opportunity=60.0,
        )

        assert score.developer_id == "dev-123"
        assert score.overall_score == 75.0

    def test_full(self):
        """Should accept all fields."""
        score = MatchScore(
            developer_id="dev-123",
            overall_score=85.0,
            skill_match=90.0,
            experience_match=80.0,
            growth_opportunity=70.0,
            reasoning="Strong Python skills, good domain experience",
            strengths=["Python", "API design"],
            gaps=["Redis experience"],
        )

        assert score.reasoning != ""
        assert "Python" in score.strengths

    def test_score_bounds(self):
        """Should enforce score bounds."""
        with pytest.raises(ValueError):
            MatchScore(
                developer_id="dev-123",
                overall_score=150.0,
                skill_match=0.0,
                experience_match=0.0,
                growth_opportunity=0.0,
            )
