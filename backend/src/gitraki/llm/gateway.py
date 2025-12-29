"""Unified LLM gateway with provider selection and caching."""

import hashlib
import logging
from functools import lru_cache
from typing import Any

from gitraki.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    LLMConfig,
    LLMProvider,
    MatchScore,
    TaskSignals,
)

logger = logging.getLogger(__name__)


class LLMGateway:
    """Unified gateway for LLM operations with caching and provider abstraction."""

    def __init__(
        self,
        provider: LLMProvider,
        cache: Any | None = None,  # Will be AnalysisCache when implemented
    ) -> None:
        """Initialize the gateway.

        Args:
            provider: The LLM provider to use.
            cache: Optional cache for analysis results.
        """
        self.provider = provider
        self.cache = cache

    @staticmethod
    def _hash_content(content: str) -> str:
        """Generate a hash for content-based caching.

        Args:
            content: The content to hash.

        Returns:
            SHA256 hash of the content.
        """
        return hashlib.sha256(content.encode()).hexdigest()

    async def analyze(
        self,
        request: AnalysisRequest,
        use_cache: bool = True,
        cache_ttl: int = 86400,
    ) -> AnalysisResult:
        """Analyze content with optional caching.

        Args:
            request: The analysis request.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 24 hours).

        Returns:
            Analysis result.
        """
        cache_key = None

        if use_cache and self.cache:
            cache_key = self._hash_content(
                f"{request.analysis_type}:{request.content}"
            )
            cached = await self.cache.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for {cache_key[:16]}...")
                return cached

        result = await self.provider.analyze(request)

        if use_cache and self.cache and cache_key and result.confidence > 0:
            await self.cache.set(cache_key, result, ttl=cache_ttl)
            logger.debug(f"Cached result for {cache_key[:16]}...")

        return result

    async def analyze_batch(
        self,
        requests: list[AnalysisRequest],
        use_cache: bool = True,
    ) -> list[AnalysisResult]:
        """Analyze multiple requests.

        Args:
            requests: List of analysis requests.
            use_cache: Whether to use caching.

        Returns:
            List of analysis results.
        """
        results = []
        for request in requests:
            result = await self.analyze(request, use_cache=use_cache)
            results.append(result)
        return results

    async def extract_task_signals(
        self,
        task_description: str,
        use_cache: bool = True,
        cache_ttl: int = 3600,
    ) -> TaskSignals:
        """Extract signals from a task description.

        Args:
            task_description: The task description.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 1 hour).

        Returns:
            Extracted task signals.
        """
        cache_key = None

        if use_cache and self.cache:
            cache_key = self._hash_content(f"task_signals:{task_description}")
            cached = await self.cache.get(cache_key)
            if cached:
                return cached

        result = await self.provider.extract_task_signals(task_description)

        if use_cache and self.cache and cache_key:
            await self.cache.set(cache_key, result, ttl=cache_ttl)

        return result

    async def score_match(
        self,
        task_signals: TaskSignals,
        developer_skills: dict[str, Any],
    ) -> MatchScore:
        """Score a developer-task match.

        Args:
            task_signals: Extracted task signals.
            developer_skills: Developer skill fingerprint.

        Returns:
            Match score.
        """
        return await self.provider.score_match(task_signals, developer_skills)

    async def rank_developers(
        self,
        task_signals: TaskSignals,
        developers: list[dict[str, Any]],
    ) -> list[MatchScore]:
        """Rank multiple developers for a task.

        Args:
            task_signals: Extracted task signals.
            developers: List of developer skill profiles.

        Returns:
            Ranked list of match scores.
        """
        scores = []
        for developer in developers:
            score = await self.score_match(task_signals, developer)
            scores.append(score)

        # Sort by overall score descending
        scores.sort(key=lambda s: s.overall_score, reverse=True)
        return scores

    async def health_check(self) -> dict[str, Any]:
        """Check health of the gateway and its components.

        Returns:
            Health status dict.
        """
        provider_healthy = await self.provider.health_check()

        cache_healthy = True
        if self.cache:
            try:
                cache_healthy = await self.cache.health_check()
            except Exception:
                cache_healthy = False

        return {
            "healthy": provider_healthy and cache_healthy,
            "provider": {
                "name": self.provider.provider_name,
                "model": self.provider.model_name,
                "healthy": provider_healthy,
            },
            "cache": {
                "enabled": self.cache is not None,
                "healthy": cache_healthy,
            },
        }

    @property
    def provider_name(self) -> str:
        """Get the current provider name."""
        return self.provider.provider_name

    @property
    def model_name(self) -> str:
        """Get the current model name."""
        return self.provider.model_name


def create_provider(config: LLMConfig) -> LLMProvider:
    """Create an LLM provider based on configuration.

    Args:
        config: LLM configuration.

    Returns:
        Configured LLM provider.

    Raises:
        ValueError: If provider type is not supported.
    """
    if config.provider == "claude":
        from gitraki.llm.claude_provider import ClaudeProvider

        return ClaudeProvider(config)

    elif config.provider == "ollama":
        from gitraki.llm.ollama_provider import OllamaProvider

        return OllamaProvider(config)

    else:
        raise ValueError(f"Unsupported LLM provider: {config.provider}")


@lru_cache
def get_llm_gateway() -> LLMGateway | None:
    """Get the cached LLM gateway instance.

    Returns:
        LLM gateway if configured, None otherwise.
    """
    from gitraki.core.config import get_settings

    settings = get_settings()

    # Check if LLM is configured
    if not hasattr(settings, "llm") or not settings.llm.anthropic_api_key:
        logger.warning("LLM not configured - gateway not available")
        return None

    config = LLMConfig(
        provider=settings.llm.llm_provider,
        model=settings.llm.llm_model,
        api_key=settings.llm.anthropic_api_key,
        base_url=settings.llm.ollama_base_url if settings.llm.llm_provider == "ollama" else None,
        max_tokens=settings.llm.max_tokens_per_request,
        temperature=0.0,
    )

    provider = create_provider(config)

    # TODO: Add cache when implemented
    return LLMGateway(provider=provider, cache=None)
