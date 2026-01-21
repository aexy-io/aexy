"""Unified LLM gateway with provider selection and caching."""

import hashlib
import logging
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    LLMConfig,
    LLMProvider,
    LLMRateLimitError,
    MatchScore,
    TaskSignals,
)

if TYPE_CHECKING:
    from aexy.services.llm_rate_limiter import LLMRateLimiter

logger = logging.getLogger(__name__)


class LLMGateway:
    """Unified gateway for LLM operations with caching, rate limiting, and provider abstraction."""

    def __init__(
        self,
        provider: LLMProvider,
        cache: Any | None = None,  # Will be AnalysisCache when implemented
        rate_limiter: "LLMRateLimiter | None" = None,
    ) -> None:
        """Initialize the gateway.

        Args:
            provider: The LLM provider to use.
            cache: Optional cache for analysis results.
            rate_limiter: Optional rate limiter for API calls.
        """
        self.provider = provider
        self.cache = cache
        self._rate_limiter = rate_limiter

    @property
    def rate_limiter(self) -> "LLMRateLimiter":
        """Get rate limiter (lazy initialization)."""
        if self._rate_limiter is None:
            from aexy.services.llm_rate_limiter import get_llm_rate_limiter
            self._rate_limiter = get_llm_rate_limiter()
        return self._rate_limiter

    async def _check_rate_limit(
        self,
        tokens_estimate: int = 1000,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> None:
        """Check rate limit and raise if exceeded.

        Args:
            tokens_estimate: Estimated tokens for this request.
            workspace_id: Optional workspace ID for workspace-level limits.
            developer_id: Optional developer ID for developer-level limits.

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        result = await self.rate_limiter.check_rate_limit(
            self.provider.provider_name,
            tokens_estimate=tokens_estimate,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

        if not result.allowed:
            raise LLMRateLimitError(
                message=result.reason or "Rate limit exceeded",
                retry_after=result.retry_after,
                wait_seconds=result.wait_seconds,
            )

    async def _record_rate_limit_usage(
        self,
        tokens_used: int,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> None:
        """Record usage for rate limiting.

        Args:
            tokens_used: Number of tokens used.
            workspace_id: Optional workspace ID for workspace-level tracking.
            developer_id: Optional developer ID for developer-level tracking.
        """
        await self.rate_limiter.record_request(
            self.provider.provider_name,
            tokens_used=tokens_used,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

    async def get_rate_limit_status(
        self,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Get current rate limit status for the provider.

        Args:
            workspace_id: Optional workspace ID for workspace-level status.
            developer_id: Optional developer ID for developer-level status.

        Returns:
            Dict with rate limit status information.
        """
        status = await self.rate_limiter.get_status(
            self.provider.provider_name,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )
        return {
            "provider": status.provider,
            "is_limited": status.is_limited,
            "requests_remaining_minute": status.requests_remaining_minute,
            "requests_remaining_day": status.requests_remaining_day,
            "tokens_remaining_minute": status.tokens_remaining_minute,
            "reset_at_minute": status.reset_at_minute.isoformat(),
            "reset_at_day": status.reset_at_day.isoformat(),
            "wait_seconds": status.wait_seconds,
            "workspace_id": status.workspace_id,
            "developer_id": status.developer_id,
            "source": status.source,
        }

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
            from aexy.services.usage_service import UsageService

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
        skip_rate_limit: bool = False,
        workspace_id: str | None = None,
    ) -> AnalysisResult:
        """Analyze content with optional caching and rate limiting.

        Args:
            request: The analysis request.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 24 hours).
            db: Database session for usage tracking.
            developer_id: Developer ID for billing usage.
            skip_rate_limit: Skip rate limit check (for internal/priority requests).
            workspace_id: Optional workspace ID for workspace-level rate limiting.

        Returns:
            Analysis result.

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        cache_key = None

        # Check cache first (no rate limit cost)
        if use_cache and self.cache:
            cache_key = self._hash_content(
                f"{request.analysis_type}:{request.content}"
            )
            cached = await self.cache.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for {cache_key[:16]}...")
                return cached

        # Check rate limit before making request
        if not skip_rate_limit:
            await self._check_rate_limit(
                tokens_estimate=1000,
                workspace_id=workspace_id,
                developer_id=developer_id,
            )

        result = await self.provider.analyze(request)

        # Record usage for rate limiting
        total_tokens = result.input_tokens + result.output_tokens
        await self._record_rate_limit_usage(
            total_tokens,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

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
        workspace_id: str | None = None,
    ) -> list[AnalysisResult]:
        """Analyze multiple requests.

        Args:
            requests: List of analysis requests.
            use_cache: Whether to use caching.
            db: Database session for usage tracking.
            developer_id: Developer ID for billing usage.
            workspace_id: Optional workspace ID for workspace-level rate limiting.

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
                workspace_id=workspace_id,
            )
            results.append(result)
        return results

    async def extract_task_signals(
        self,
        task_description: str,
        use_cache: bool = True,
        cache_ttl: int = 3600,
        skip_rate_limit: bool = False,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> TaskSignals:
        """Extract signals from a task description.

        Args:
            task_description: The task description.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 1 hour).
            skip_rate_limit: Skip rate limit check.
            workspace_id: Optional workspace ID for workspace-level rate limiting.
            developer_id: Optional developer ID for developer-level rate limiting.

        Returns:
            Extracted task signals.

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        cache_key = None

        if use_cache and self.cache:
            cache_key = self._hash_content(f"task_signals:{task_description}")
            cached = await self.cache.get(cache_key)
            if cached:
                return cached

        # Check rate limit
        if not skip_rate_limit:
            await self._check_rate_limit(
                tokens_estimate=500,
                workspace_id=workspace_id,
                developer_id=developer_id,
            )

        result = await self.provider.extract_task_signals(task_description)

        # Record usage (estimate ~500 tokens)
        await self._record_rate_limit_usage(
            500,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

        if use_cache and self.cache and cache_key:
            await self.cache.set(cache_key, result, ttl=cache_ttl)

        return result

    async def call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        tokens_estimate: int = 1000,
        skip_rate_limit: bool = False,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> tuple[str, int, int, int]:
        """Call LLM directly with custom prompts and rate limiting.

        This method provides rate-limited access to the underlying provider
        for use cases like question generation that need custom prompts.

        Args:
            system_prompt: System prompt for the LLM.
            user_prompt: User prompt with the actual request.
            tokens_estimate: Estimated tokens for pre-check.
            skip_rate_limit: Skip rate limit check.
            workspace_id: Optional workspace ID for workspace-level rate limiting.
            developer_id: Optional developer ID for developer-level rate limiting.

        Returns:
            Tuple of (response_text, total_tokens, input_tokens, output_tokens).

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        # Check rate limit
        if not skip_rate_limit:
            await self._check_rate_limit(
                tokens_estimate=tokens_estimate,
                workspace_id=workspace_id,
                developer_id=developer_id,
            )

        # Call provider directly
        result = await self.provider._call_api(system_prompt, user_prompt)

        # Record usage for rate limiting
        if isinstance(result, tuple) and len(result) >= 2:
            total_tokens = result[1] if len(result) > 1 else 0
            await self._record_rate_limit_usage(
                total_tokens,
                workspace_id=workspace_id,
                developer_id=developer_id,
            )

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
        from aexy.llm.claude_provider import ClaudeProvider

        return ClaudeProvider(config)

    elif config.provider == "ollama":
        from aexy.llm.ollama_provider import OllamaProvider

        return OllamaProvider(config)

    elif config.provider == "gemini":
        from aexy.llm.gemini_provider import GeminiProvider

        return GeminiProvider(config)

    else:
        raise ValueError(f"Unsupported LLM provider: {config.provider}")


_llm_gateway_instance: LLMGateway | None = None
_llm_gateway_initialized: bool = False


def get_llm_gateway() -> LLMGateway | None:
    """Get the LLM gateway instance.

    Uses lazy initialization and caches successful results.
    If gateway creation fails, it will retry on next call.

    Returns:
        LLM gateway if configured, None otherwise.
    """
    global _llm_gateway_instance, _llm_gateway_initialized

    # Return cached instance if available
    if _llm_gateway_initialized and _llm_gateway_instance is not None:
        return _llm_gateway_instance

    from aexy.core.config import get_settings

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
        _llm_gateway_instance = LLMGateway(provider=provider, cache=None)
        _llm_gateway_initialized = True
        return _llm_gateway_instance
    except Exception as e:
        logger.error(f"Failed to create LLM provider: {e}")
        return None
