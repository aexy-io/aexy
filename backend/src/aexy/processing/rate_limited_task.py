"""Rate limiting utilities for LLM operations.

The Celery-specific RateLimitedTask class has been removed. Temporal handles
retries via its built-in retry policies (see aexy.temporal.dispatch.LLM_RETRY).

This module retains the async-compatible helpers that are still useful:
  - rate_limited() decorator for async functions
  - get_current_provider() helper
"""

import functools
import logging
from typing import Any, Callable, TypeVar

from aexy.llm.base import LLMRateLimitError

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


def get_current_provider() -> str:
    """Get the currently configured LLM provider.

    Returns:
        Provider name (claude, gemini, ollama).
    """
    from aexy.core.config import get_settings

    return get_settings().llm.llm_provider


def rate_limited(
    provider: str | None = None,
    tokens_estimate: int = 1000,
) -> Callable[[F], F]:
    """Decorator to add rate limit checking to an async function.

    Args:
        provider: LLM provider to check (uses default if None).
        tokens_estimate: Estimated tokens for pre-check.

    Example:
        @rate_limited(provider="gemini", tokens_estimate=2000)
        async def my_llm_function():
            ...
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            from aexy.services.llm_rate_limiter import get_llm_rate_limiter

            target_provider = provider or get_current_provider()
            rate_limiter = get_llm_rate_limiter()

            result = await rate_limiter.check_rate_limit(
                target_provider,
                tokens_estimate=tokens_estimate,
            )

            if not result.allowed:
                raise LLMRateLimitError(
                    message=result.reason or "Rate limit exceeded",
                    retry_after=result.retry_after,
                    wait_seconds=result.wait_seconds,
                )

            return await func(*args, **kwargs)

        return wrapper  # type: ignore

    return decorator
