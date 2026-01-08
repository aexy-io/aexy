"""Tests for LLM Gateway."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    AnalysisType,
    LanguageAnalysis,
    LLMProvider,
    MatchScore,
    TaskSignals,
)
from aexy.llm.gateway import LLMGateway


class MockLLMProvider(LLMProvider):
    """Mock LLM provider for testing."""

    def __init__(self, responses: dict[str, AnalysisResult] | None = None):
        self.responses = responses or {}
        self.calls: list[AnalysisRequest] = []
        self._healthy = True

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-model"

    async def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        self.calls.append(request)
        return self.responses.get(
            request.analysis_type.value,
            AnalysisResult(
                languages=[LanguageAnalysis(name="Python", confidence=0.9)],
                summary="Mock analysis",
                confidence=0.85,
                provider="mock",
                model="mock-model",
            ),
        )

    async def extract_task_signals(self, task_description: str) -> TaskSignals:
        return TaskSignals(
            required_skills=["Python"],
            domain="backend",
            confidence=0.8,
        )

    async def score_match(
        self,
        task_signals: TaskSignals,
        developer_skills: dict[str, Any],
    ) -> MatchScore:
        return MatchScore(
            developer_id=developer_skills.get("developer_id", "unknown"),
            overall_score=75.0,
            skill_match=80.0,
            experience_match=70.0,
            growth_opportunity=65.0,
            reasoning="Mock match score",
        )

    async def health_check(self) -> bool:
        return self._healthy


class MockCache:
    """Mock cache for testing."""

    def __init__(self):
        self._store: dict[str, Any] = {}

    async def get(self, key: str) -> Any:
        return self._store.get(key)

    async def set(self, key: str, value: Any, ttl: int = 86400) -> bool:
        self._store[key] = value
        return True

    async def health_check(self) -> bool:
        return True


class TestLLMGateway:
    """Tests for LLMGateway."""

    @pytest.fixture
    def mock_provider(self):
        """Create a mock provider."""
        return MockLLMProvider()

    @pytest.fixture
    def mock_cache(self):
        """Create a mock cache."""
        return MockCache()

    @pytest.fixture
    def gateway(self, mock_provider):
        """Create a gateway without cache."""
        return LLMGateway(provider=mock_provider, cache=None)

    @pytest.fixture
    def gateway_with_cache(self, mock_provider, mock_cache):
        """Create a gateway with cache."""
        return LLMGateway(provider=mock_provider, cache=mock_cache)

    @pytest.mark.asyncio
    async def test_analyze_without_cache(self, gateway, mock_provider):
        """Should call provider for analysis."""
        request = AnalysisRequest(
            content="def hello(): pass",
            analysis_type=AnalysisType.CODE,
        )

        result = await gateway.analyze(request, use_cache=False)

        assert result.provider == "mock"
        assert len(mock_provider.calls) == 1
        assert result.confidence > 0

    @pytest.mark.asyncio
    async def test_analyze_with_cache_miss(self, gateway_with_cache, mock_provider, mock_cache):
        """Should call provider on cache miss."""
        request = AnalysisRequest(
            content="def hello(): pass",
            analysis_type=AnalysisType.CODE,
        )

        result = await gateway_with_cache.analyze(request, use_cache=True)

        assert result.provider == "mock"
        assert len(mock_provider.calls) == 1

    @pytest.mark.asyncio
    async def test_analyze_with_cache_hit(self, gateway_with_cache, mock_provider, mock_cache):
        """Should return cached result on cache hit."""
        request = AnalysisRequest(
            content="def hello(): pass",
            analysis_type=AnalysisType.CODE,
        )

        # First call populates cache
        await gateway_with_cache.analyze(request, use_cache=True)
        initial_calls = len(mock_provider.calls)

        # Second call should use cache
        result = await gateway_with_cache.analyze(request, use_cache=True)

        # Provider should not be called again
        assert len(mock_provider.calls) == initial_calls
        assert result is not None

    @pytest.mark.asyncio
    async def test_analyze_batch(self, gateway, mock_provider):
        """Should analyze multiple requests."""
        requests = [
            AnalysisRequest(content="code1", analysis_type=AnalysisType.CODE),
            AnalysisRequest(content="code2", analysis_type=AnalysisType.CODE),
            AnalysisRequest(content="code3", analysis_type=AnalysisType.CODE),
        ]

        results = await gateway.analyze_batch(requests, use_cache=False)

        assert len(results) == 3
        assert len(mock_provider.calls) == 3

    @pytest.mark.asyncio
    async def test_extract_task_signals(self, gateway):
        """Should extract task signals."""
        signals = await gateway.extract_task_signals("Implement user auth")

        assert "Python" in signals.required_skills
        assert signals.domain == "backend"

    @pytest.mark.asyncio
    async def test_score_match(self, gateway):
        """Should score developer-task match."""
        task_signals = TaskSignals(
            required_skills=["Python", "FastAPI"],
            domain="backend",
        )
        developer_skills = {
            "developer_id": "dev-123",
            "languages": [{"name": "Python"}],
        }

        score = await gateway.score_match(task_signals, developer_skills)

        assert score.developer_id == "dev-123"
        assert score.overall_score == 75.0

    @pytest.mark.asyncio
    async def test_rank_developers(self, gateway):
        """Should rank multiple developers."""
        task_signals = TaskSignals(
            required_skills=["Python"],
            domain="backend",
        )
        developers = [
            {"developer_id": "dev-1", "languages": [{"name": "Python"}]},
            {"developer_id": "dev-2", "languages": [{"name": "Go"}]},
        ]

        scores = await gateway.rank_developers(task_signals, developers)

        assert len(scores) == 2
        # Should be sorted by overall_score
        assert scores[0].overall_score >= scores[-1].overall_score

    @pytest.mark.asyncio
    async def test_health_check_healthy(self, gateway_with_cache, mock_provider):
        """Should return healthy when all components are healthy."""
        mock_provider._healthy = True

        health = await gateway_with_cache.health_check()

        assert health["healthy"] is True
        assert health["provider"]["healthy"] is True
        assert health["cache"]["healthy"] is True

    @pytest.mark.asyncio
    async def test_health_check_unhealthy_provider(self, gateway, mock_provider):
        """Should return unhealthy when provider is unhealthy."""
        mock_provider._healthy = False

        health = await gateway.health_check()

        assert health["healthy"] is False
        assert health["provider"]["healthy"] is False

    def test_provider_name(self, gateway):
        """Should return provider name."""
        assert gateway.provider_name == "mock"

    def test_model_name(self, gateway):
        """Should return model name."""
        assert gateway.model_name == "mock-model"

    def test_hash_content(self):
        """Should generate consistent hashes."""
        hash1 = LLMGateway._hash_content("test content")
        hash2 = LLMGateway._hash_content("test content")
        hash3 = LLMGateway._hash_content("different content")

        assert hash1 == hash2
        assert hash1 != hash3
        assert len(hash1) == 64  # SHA256 hex length
