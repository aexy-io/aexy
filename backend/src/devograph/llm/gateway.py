"""Unified LLM gateway with provider selection and caching."""

import hashlib
import logging
from functools import lru_cache
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from devograph.llm.base import (
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

    async def _record_usage(
        self,
        db: AsyncSession | None,
        developer_id: str | None,
        result: AnalysisResult,
        operation: str = "analysis",
    ) -> None:
        """Record token usage for billing.

        Args:
            db: Database session.
            developer_id: Developer ID for billing.
            result: Analysis result containing token counts.
            operation: Type of operation performed.
        """
        if not db or not developer_id:
            return

        if result.input_tokens == 0 and result.output_tokens == 0:
            return

        try:
            from devograph.services.usage_service import UsageService

            usage_service = UsageService(db)
            await usage_service.record_usage(
                developer_id=developer_id,
                provider=result.provider,
                model=result.model,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                operation=operation,
            )
        except Exception as e:
            # Log but don't fail the request if usage tracking fails
            logger.warning(f"Failed to record usage: {e}")

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
        db: AsyncSession | None = None,
        developer_id: str | None = None,
    ) -> AnalysisResult:
        """Analyze content with optional caching.

        Args:
            request: The analysis request.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 24 hours).
            db: Database session for usage tracking.
            developer_id: Developer ID for billing usage.

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

        # Track usage for billing
        await self._record_usage(
            db=db,
            developer_id=developer_id,
            result=result,
            operation=f"analysis:{request.analysis_type.value}",
        )

        if use_cache and self.cache and cache_key and result.confidence > 0:
            await self.cache.set(cache_key, result, ttl=cache_ttl)
            logger.debug(f"Cached result for {cache_key[:16]}...")

        return result

    async def analyze_batch(
        self,
        requests: list[AnalysisRequest],
        use_cache: bool = True,
        db: AsyncSession | None = None,
        developer_id: str | None = None,
    ) -> list[AnalysisResult]:
        """Analyze multiple requests.

        Args:
            requests: List of analysis requests.
            use_cache: Whether to use caching.
            db: Database session for usage tracking.
            developer_id: Developer ID for billing usage.

        Returns:
            List of analysis results.
        """
        results = []
        for request in requests:
            result = await self.analyze(
                request,
                use_cache=use_cache,
                db=db,
                developer_id=developer_id,
            )
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
        from devograph.llm.claude_provider import ClaudeProvider

        return ClaudeProvider(config)

    elif config.provider == "ollama":
        from devograph.llm.ollama_provider import OllamaProvider

        return OllamaProvider(config)

    elif config.provider == "gemini":
        from devograph.llm.gemini_provider import GeminiProvider

        return GeminiProvider(config)

    else:
        raise ValueError(f"Unsupported LLM provider: {config.provider}")


@lru_cache
def get_llm_gateway() -> LLMGateway | None:
    """Get the cached LLM gateway instance.

    Returns:
        LLM gateway if configured, None otherwise.
    """
    from devograph.core.config import get_settings

    settings = get_settings()

    # Check if LLM is configured
    if not hasattr(settings, "llm"):
        logger.warning("LLM not configured - gateway not available")
        return None

    llm_settings = settings.llm
    provider_name = llm_settings.llm_provider

    # Get the appropriate API key based on provider
    api_key = None
    base_url = None

    if provider_name == "claude":
        api_key = llm_settings.anthropic_api_key
        if not api_key:
            logger.warning("Anthropic API key not configured for Claude provider")
            return None
    elif provider_name == "gemini":
        api_key = llm_settings.gemini_api_key
        if not api_key:
            logger.warning("Gemini API key not configured for Gemini provider")
            return None
    elif provider_name == "ollama":
        base_url = llm_settings.ollama_base_url
        # Ollama doesn't need an API key
    else:
        logger.warning(f"Unknown LLM provider: {provider_name}")
        return None

    config = LLMConfig(
        provider=provider_name,
        model=llm_settings.llm_model,
        api_key=api_key,
        base_url=base_url,
        max_tokens=llm_settings.max_tokens_per_request,
        temperature=0.0,
    )

    try:
        provider = create_provider(config)
        # TODO: Add cache when implemented
        return LLMGateway(provider=provider, cache=None)
    except Exception as e:
        logger.error(f"Failed to create LLM provider: {e}")
        return None
