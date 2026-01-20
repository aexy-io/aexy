"""Celery task utilities for rate-limited LLM operations."""

import functools
import logging
from typing import Any, Callable, TypeVar

from celery import Task

from aexy.llm.base import LLMRateLimitError

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


class RateLimitedTask(Task):
    """Custom Celery task class with rate limit handling.

    Automatically handles LLMRateLimitError by scheduling retries
    with appropriate delays based on the rate limit wait time.

    Usage:
        @shared_task(bind=True, base=RateLimitedTask, max_retries=5)
        def my_llm_task(self, ...):
            ...
    """

    # Errors that should trigger automatic retry
    autoretry_for = (LLMRateLimitError,)

    # Default retry settings
    max_retries = 5
    default_retry_delay = 60

    # Exponential backoff settings
    retry_backoff = True
    retry_backoff_max = 600  # Max 10 minutes
    retry_jitter = True  # Add randomness to prevent thundering herd

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        if isinstance(exc, LLMRateLimitError):
            logger.warning(
                f"Task {self.name} failed due to rate limit after "
                f"{self.request.retries} retries: {exc.message}"
            )
        super().on_failure(exc, task_id, args, kwargs, einfo)

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """Handle task retry."""
        if isinstance(exc, LLMRateLimitError):
            logger.info(
                f"Task {self.name} retrying due to rate limit "
                f"(attempt {self.request.retries + 1}/{self.max_retries}): "
                f"waiting {exc.wait_seconds}s"
            )
        super().on_retry(exc, task_id, args, kwargs, einfo)

    def retry(
        self,
        args=None,
        kwargs=None,
        exc=None,
        throw=True,
        eta=None,
        countdown=None,
        max_retries=None,
        **options,
    ):
        """Override retry to handle rate limit errors specially."""
        if isinstance(exc, LLMRateLimitError):
            # Use the wait time from the rate limit error
            countdown = max(exc.wait_seconds, 10)  # Minimum 10 seconds
            logger.info(
                f"Rate limit retry for {self.name}: waiting {countdown:.1f}s "
                f"(retry {self.request.retries + 1}/{max_retries or self.max_retries})"
            )

        return super().retry(
            args=args,
            kwargs=kwargs,
            exc=exc,
            throw=throw,
            eta=eta,
            countdown=countdown,
            max_retries=max_retries,
            **options,
        )


def check_rate_limit_sync(provider: str, tokens_estimate: int = 1000) -> None:
    """Synchronous rate limit check for use in Celery tasks.

    This function runs the async rate limit check synchronously.

    Args:
        provider: LLM provider name (claude, gemini, ollama).
        tokens_estimate: Estimated tokens for this request.

    Raises:
        LLMRateLimitError: If rate limit is exceeded.
    """
    from aexy.processing.tasks import run_async
    from aexy.services.llm_rate_limiter import get_llm_rate_limiter

    async def _check():
        rate_limiter = get_llm_rate_limiter()
        result = await rate_limiter.check_rate_limit(provider, tokens_estimate)
        if not result.allowed:
            raise LLMRateLimitError(
                message=result.reason or "Rate limit exceeded",
                retry_after=result.retry_after,
                wait_seconds=result.wait_seconds,
            )

    run_async(_check())


def record_usage_sync(provider: str, tokens_used: int = 0) -> None:
    """Synchronous usage recording for use in Celery tasks.

    Args:
        provider: LLM provider name.
        tokens_used: Number of tokens used.
    """
    from aexy.processing.tasks import run_async
    from aexy.services.llm_rate_limiter import get_llm_rate_limiter

    async def _record():
        rate_limiter = get_llm_rate_limiter()
        await rate_limiter.record_request(provider, tokens_used)

    run_async(_record())


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
    """Decorator to add rate limit checking to a function.

    This decorator can be used on async functions to add rate limit
    checking before execution.

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
