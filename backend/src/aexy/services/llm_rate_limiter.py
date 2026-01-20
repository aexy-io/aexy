"""LLM API rate limiting with Redis-backed sliding window algorithm.

Supports hierarchical rate limiting:
- Global provider limits (API constraints)
- Plan-based limits (subscription tier)
- Workspace overrides (custom limits for organizations)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import redis.asyncio as redis

from aexy.core.config import get_settings, ProviderRateLimitSettings

if TYPE_CHECKING:
    from aexy.schemas.rate_limits import EffectiveRateLimits

logger = logging.getLogger(__name__)


@dataclass
class RateLimitStatus:
    """Current rate limit status for a provider."""

    provider: str
    requests_remaining_minute: int
    requests_remaining_day: int
    tokens_remaining_minute: int
    reset_at_minute: datetime
    reset_at_day: datetime
    is_limited: bool
    wait_seconds: float
    workspace_id: Optional[str] = None
    developer_id: Optional[str] = None
    source: str = "global"  # "global", "plan", or "workspace_override"

    @property
    def can_proceed(self) -> bool:
        return not self.is_limited


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""

    allowed: bool
    wait_seconds: float
    reason: Optional[str] = None
    retry_after: Optional[datetime] = None


class LLMRateLimiter:
    """Redis-backed rate limiter for LLM providers.

    Uses sliding window algorithm for smooth rate limiting.
    Tracks both request count and token usage per provider.
    """

    def __init__(self, redis_url: Optional[str] = None):
        settings = get_settings()
        self.redis_url = redis_url or settings.redis_url
        self._redis: Optional[redis.Redis] = None
        self._settings = settings
        self._prefix = settings.llm.rate_limit_redis_prefix

    async def _get_redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            self._redis = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    async def close(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()
            self._redis = None

    def _get_provider_limits(self, provider: str) -> ProviderRateLimitSettings:
        """Get rate limit settings for a provider (global limits)."""
        return self._settings.llm.get_provider_rate_limits(provider)

    def _get_key_prefix(
        self,
        provider: str,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
    ) -> str:
        """Get Redis key prefix based on context.

        Key patterns:
        - Global: llm:ratelimit:{provider}:{window}
        - Workspace: llm:ratelimit:ws:{workspace_id}:{provider}:{window}
        - Developer: llm:ratelimit:dev:{workspace_id}:{developer_id}:{provider}:{window}
        """
        if developer_id and workspace_id:
            return f"{self._prefix}dev:{workspace_id}:{developer_id}:{provider}"
        elif workspace_id:
            return f"{self._prefix}ws:{workspace_id}:{provider}"
        else:
            return f"{self._prefix}{provider}"

    def _minute_key(
        self,
        provider: str,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
    ) -> str:
        """Redis key for minute-window tracking."""
        prefix = self._get_key_prefix(provider, workspace_id, developer_id)
        return f"{prefix}:minute"

    def _day_key(
        self,
        provider: str,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
    ) -> str:
        """Redis key for day-window tracking."""
        prefix = self._get_key_prefix(provider, workspace_id, developer_id)
        return f"{prefix}:day"

    def _tokens_key(
        self,
        provider: str,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
    ) -> str:
        """Redis key for token tracking."""
        prefix = self._get_key_prefix(provider, workspace_id, developer_id)
        return f"{prefix}:tokens"

    async def check_rate_limit(
        self,
        provider: str,
        tokens_estimate: int = 0,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
        effective_limits: Optional["EffectiveRateLimits"] = None,
    ) -> RateLimitResult:
        """Check if a request is allowed under rate limits.

        Args:
            provider: LLM provider name (claude, gemini, ollama).
            tokens_estimate: Estimated tokens for this request.
            workspace_id: Optional workspace ID for workspace-level limits.
            developer_id: Optional developer ID for developer-level limits.
            effective_limits: Pre-computed effective limits (if available).

        Returns:
            RateLimitResult indicating if request is allowed.
        """
        if not self._settings.llm.rate_limit_enabled:
            return RateLimitResult(allowed=True, wait_seconds=0)

        # Get limits - use effective_limits if provided, otherwise fall back to global
        if effective_limits:
            requests_per_minute = effective_limits.requests_per_minute
            requests_per_day = effective_limits.requests_per_day
            tokens_per_minute = effective_limits.tokens_per_minute
        else:
            global_limits = self._get_provider_limits(provider)
            requests_per_minute = global_limits.requests_per_minute
            requests_per_day = global_limits.requests_per_day
            tokens_per_minute = global_limits.tokens_per_minute

        # Unlimited provider (e.g., Ollama) or unlimited plan
        if requests_per_minute == -1 and requests_per_day == -1:
            return RateLimitResult(allowed=True, wait_seconds=0)

        try:
            r = await self._get_redis()
        except Exception as e:
            # Fail open if Redis is unavailable
            logger.warning(f"Redis unavailable for rate limiting: {e}")
            return RateLimitResult(allowed=True, wait_seconds=0)

        now = time.time()

        # Check minute window
        if requests_per_minute > 0:
            minute_count = await self._get_sliding_window_count(
                r, self._minute_key(provider, workspace_id, developer_id), now, 60
            )
            if minute_count >= requests_per_minute:
                wait = 60 - (now % 60)
                context = f" (workspace: {workspace_id})" if workspace_id else ""
                return RateLimitResult(
                    allowed=False,
                    wait_seconds=wait,
                    reason=f"Rate limit exceeded: {minute_count}/{requests_per_minute} requests/minute for {provider}{context}",
                    retry_after=datetime.fromtimestamp(now + wait, tz=timezone.utc),
                )

        # Check day window
        if requests_per_day > 0:
            day_count = await self._get_sliding_window_count(
                r, self._day_key(provider, workspace_id, developer_id), now, 86400
            )
            if day_count >= requests_per_day:
                # Calculate time until midnight UTC
                wait = 86400 - (now % 86400)
                context = f" (workspace: {workspace_id})" if workspace_id else ""
                return RateLimitResult(
                    allowed=False,
                    wait_seconds=wait,
                    reason=f"Daily limit exceeded: {day_count}/{requests_per_day} requests/day for {provider}{context}",
                    retry_after=datetime.fromtimestamp(now + wait, tz=timezone.utc),
                )

        # Check token limit
        if tokens_per_minute > 0 and tokens_estimate > 0:
            token_count = await self._get_sliding_window_count(
                r, self._tokens_key(provider, workspace_id, developer_id), now, 60
            )
            if token_count + tokens_estimate > tokens_per_minute:
                wait = 60 - (now % 60)
                context = f" (workspace: {workspace_id})" if workspace_id else ""
                return RateLimitResult(
                    allowed=False,
                    wait_seconds=wait,
                    reason=f"Token limit exceeded: {token_count}/{tokens_per_minute} tokens/minute for {provider}{context}",
                    retry_after=datetime.fromtimestamp(now + wait, tz=timezone.utc),
                )

        return RateLimitResult(allowed=True, wait_seconds=0)

    async def record_request(
        self,
        provider: str,
        tokens_used: int = 0,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
    ) -> None:
        """Record a request for rate limiting.

        Call this after a successful request. Records usage at all applicable
        levels (global, workspace, developer).

        Args:
            provider: LLM provider name.
            tokens_used: Actual tokens used.
            workspace_id: Optional workspace ID for workspace-level tracking.
            developer_id: Optional developer ID for developer-level tracking.
        """
        if not self._settings.llm.rate_limit_enabled:
            return

        try:
            r = await self._get_redis()
        except Exception as e:
            logger.warning(f"Redis unavailable for recording usage: {e}")
            return

        now = time.time()

        # Always record at global level
        await self._increment_sliding_window(
            r, self._minute_key(provider), now, 60
        )
        await self._increment_sliding_window(
            r, self._day_key(provider), now, 86400
        )
        if tokens_used > 0:
            await self._increment_sliding_window(
                r, self._tokens_key(provider), now, 60, increment=tokens_used
            )

        # Record at workspace level if workspace_id provided
        if workspace_id:
            await self._increment_sliding_window(
                r, self._minute_key(provider, workspace_id), now, 60
            )
            await self._increment_sliding_window(
                r, self._day_key(provider, workspace_id), now, 86400
            )
            if tokens_used > 0:
                await self._increment_sliding_window(
                    r, self._tokens_key(provider, workspace_id), now, 60,
                    increment=tokens_used
                )

        # Record at developer level if developer_id provided
        if developer_id and workspace_id:
            await self._increment_sliding_window(
                r, self._minute_key(provider, workspace_id, developer_id), now, 60
            )
            await self._increment_sliding_window(
                r, self._day_key(provider, workspace_id, developer_id), now, 86400
            )
            if tokens_used > 0:
                await self._increment_sliding_window(
                    r, self._tokens_key(provider, workspace_id, developer_id), now, 60,
                    increment=tokens_used
                )

        context = ""
        if workspace_id:
            context = f" (workspace: {workspace_id})"
        if developer_id:
            context = f" (workspace: {workspace_id}, developer: {developer_id})"

        logger.debug(f"Recorded LLM request for {provider}{context}: {tokens_used} tokens")

    async def _get_sliding_window_count(
        self,
        r: redis.Redis,
        key: str,
        now: float,
        window_seconds: int,
    ) -> int:
        """Get count in sliding window using Redis sorted set."""
        window_start = now - window_seconds

        # Remove old entries and get count in one transaction
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        results = await pipe.execute()

        return results[1] or 0

    async def _increment_sliding_window(
        self,
        r: redis.Redis,
        key: str,
        now: float,
        window_seconds: int,
        increment: int = 1,
    ) -> None:
        """Increment sliding window counter."""
        pipe = r.pipeline()

        # Add entries with current timestamp as score
        for i in range(increment):
            member = f"{now}:{time.time_ns()}:{i}"
            pipe.zadd(key, {member: now})

        # Set expiry
        pipe.expire(key, window_seconds + 60)  # Buffer for cleanup
        await pipe.execute()

    async def get_status(
        self,
        provider: str,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
        effective_limits: Optional["EffectiveRateLimits"] = None,
    ) -> RateLimitStatus:
        """Get current rate limit status for a provider.

        Args:
            provider: LLM provider name.
            workspace_id: Optional workspace ID for workspace-level status.
            developer_id: Optional developer ID for developer-level status.
            effective_limits: Pre-computed effective limits (if available).

        Returns:
            RateLimitStatus with current usage and remaining limits.
        """
        # Get limits - use effective_limits if provided, otherwise fall back to global
        if effective_limits:
            requests_per_minute = effective_limits.requests_per_minute
            requests_per_day = effective_limits.requests_per_day
            tokens_per_minute = effective_limits.tokens_per_minute
            source = effective_limits.source
        else:
            global_limits = self._get_provider_limits(provider)
            requests_per_minute = global_limits.requests_per_minute
            requests_per_day = global_limits.requests_per_day
            tokens_per_minute = global_limits.tokens_per_minute
            source = "global"

        try:
            r = await self._get_redis()
        except Exception as e:
            logger.warning(f"Redis unavailable for status check: {e}")
            # Return default unlimited status
            now = time.time()
            return RateLimitStatus(
                provider=provider,
                requests_remaining_minute=-1,
                requests_remaining_day=-1,
                tokens_remaining_minute=-1,
                reset_at_minute=datetime.fromtimestamp(now + 60, tz=timezone.utc),
                reset_at_day=datetime.fromtimestamp(now + 86400, tz=timezone.utc),
                is_limited=False,
                wait_seconds=0,
                workspace_id=workspace_id,
                developer_id=developer_id,
                source=source,
            )

        now = time.time()

        # Get current counts at the appropriate level
        minute_count = await self._get_sliding_window_count(
            r, self._minute_key(provider, workspace_id, developer_id), now, 60
        )
        day_count = await self._get_sliding_window_count(
            r, self._day_key(provider, workspace_id, developer_id), now, 86400
        )
        token_count = await self._get_sliding_window_count(
            r, self._tokens_key(provider, workspace_id, developer_id), now, 60
        )

        # Calculate remaining
        minute_remaining = (
            max(0, requests_per_minute - minute_count)
            if requests_per_minute > 0
            else -1
        )
        day_remaining = (
            max(0, requests_per_day - day_count)
            if requests_per_day > 0
            else -1
        )
        token_remaining = (
            max(0, tokens_per_minute - token_count)
            if tokens_per_minute > 0
            else -1
        )

        # Determine if limited
        is_limited = (
            requests_per_minute > 0
            and minute_count >= requests_per_minute
        ) or (requests_per_day > 0 and day_count >= requests_per_day)

        wait_seconds = 0.0
        if is_limited:
            if (
                requests_per_minute > 0
                and minute_count >= requests_per_minute
            ):
                wait_seconds = 60 - (now % 60)
            elif requests_per_day > 0 and day_count >= requests_per_day:
                wait_seconds = 86400 - (now % 86400)

        return RateLimitStatus(
            provider=provider,
            requests_remaining_minute=minute_remaining,
            requests_remaining_day=day_remaining,
            tokens_remaining_minute=token_remaining,
            reset_at_minute=datetime.fromtimestamp(
                now + 60 - (now % 60), tz=timezone.utc
            ),
            reset_at_day=datetime.fromtimestamp(
                now + 86400 - (now % 86400), tz=timezone.utc
            ),
            is_limited=is_limited,
            wait_seconds=wait_seconds,
            workspace_id=workspace_id,
            developer_id=developer_id,
            source=source,
        )

    async def wait_if_needed(
        self,
        provider: str,
        max_wait: float = 300,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
        effective_limits: Optional["EffectiveRateLimits"] = None,
    ) -> float:
        """Wait if rate limited, up to max_wait seconds.

        Args:
            provider: LLM provider name.
            max_wait: Maximum seconds to wait.
            workspace_id: Optional workspace ID for workspace-level limits.
            developer_id: Optional developer ID for developer-level limits.
            effective_limits: Pre-computed effective limits (if available).

        Returns:
            The number of seconds waited.
        """
        result = await self.check_rate_limit(
            provider,
            workspace_id=workspace_id,
            developer_id=developer_id,
            effective_limits=effective_limits,
        )

        if result.allowed:
            return 0

        wait_time = min(result.wait_seconds, max_wait)

        if wait_time > 0:
            context = ""
            if workspace_id:
                context = f" (workspace: {workspace_id})"
            logger.info(
                f"Rate limited for {provider}{context}, waiting {wait_time:.1f}s "
                f"(reason: {result.reason})"
            )
            await asyncio.sleep(wait_time)

        return wait_time

    async def clear_provider_limits(
        self,
        provider: str,
        workspace_id: Optional[str] = None,
        developer_id: Optional[str] = None,
    ) -> None:
        """Clear rate limit data for a provider (for testing).

        Args:
            provider: LLM provider name.
            workspace_id: Optional workspace ID to clear workspace-level limits.
            developer_id: Optional developer ID to clear developer-level limits.
        """
        try:
            r = await self._get_redis()
            await r.delete(
                self._minute_key(provider, workspace_id, developer_id),
                self._day_key(provider, workspace_id, developer_id),
                self._tokens_key(provider, workspace_id, developer_id),
            )
            context = ""
            if workspace_id:
                context = f" (workspace: {workspace_id})"
            if developer_id:
                context = f" (workspace: {workspace_id}, developer: {developer_id})"
            logger.info(f"Cleared rate limit data for {provider}{context}")
        except Exception as e:
            logger.warning(f"Failed to clear rate limits: {e}")

    async def get_workspace_usage(
        self,
        provider: str,
        workspace_id: str,
    ) -> dict[str, int]:
        """Get current usage counts for a workspace.

        Args:
            provider: LLM provider name.
            workspace_id: The workspace ID.

        Returns:
            Dict with usage_minute, usage_day, and tokens_minute.
        """
        try:
            r = await self._get_redis()
        except Exception as e:
            logger.warning(f"Redis unavailable for usage check: {e}")
            return {"usage_minute": 0, "usage_day": 0, "tokens_minute": 0}

        now = time.time()

        minute_count = await self._get_sliding_window_count(
            r, self._minute_key(provider, workspace_id), now, 60
        )
        day_count = await self._get_sliding_window_count(
            r, self._day_key(provider, workspace_id), now, 86400
        )
        token_count = await self._get_sliding_window_count(
            r, self._tokens_key(provider, workspace_id), now, 60
        )

        return {
            "usage_minute": minute_count,
            "usage_day": day_count,
            "tokens_minute": token_count,
        }


# Global instance
_llm_rate_limiter: Optional[LLMRateLimiter] = None


def get_llm_rate_limiter() -> LLMRateLimiter:
    """Get the global LLM rate limiter instance."""
    global _llm_rate_limiter
    if _llm_rate_limiter is None:
        _llm_rate_limiter = LLMRateLimiter()
    return _llm_rate_limiter


async def reset_llm_rate_limiter() -> None:
    """Reset the global rate limiter (for testing)."""
    global _llm_rate_limiter
    if _llm_rate_limiter:
        await _llm_rate_limiter.close()
    _llm_rate_limiter = None
