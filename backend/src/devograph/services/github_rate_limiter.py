"""GitHub API rate limit handling with Redis tracking."""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as redis

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class RateLimitInfo:
    """Rate limit information from GitHub API headers."""

    limit: int  # Max requests allowed
    remaining: int  # Requests remaining
    reset_at: datetime  # When the limit resets
    resource: str  # Resource type (core, search, etc.)

    @property
    def is_exhausted(self) -> bool:
        """Check if rate limit is exhausted."""
        return self.remaining <= 0

    @property
    def reset_in_seconds(self) -> float:
        """Seconds until rate limit resets."""
        delta = self.reset_at - datetime.now(timezone.utc)
        return max(0, delta.total_seconds())


@dataclass
class RateLimitStatus:
    """Current rate limit status for a token."""

    core: RateLimitInfo | None = None
    search: RateLimitInfo | None = None
    graphql: RateLimitInfo | None = None
    can_proceed: bool = True
    wait_seconds: float = 0


class GitHubRateLimiter:
    """Handle GitHub API rate limits with Redis tracking.

    This service:
    - Tracks rate limit headers from GitHub API responses
    - Provides wait-if-needed functionality
    - Caches rate limit info in Redis
    - Helps avoid hitting rate limits proactively
    """

    # GitHub rate limits
    CORE_LIMIT = 5000  # For authenticated users
    SEARCH_LIMIT = 30  # Per minute
    GRAPHQL_LIMIT = 5000  # Per hour

    # Buffer to stay safe
    SAFETY_BUFFER = 100  # Leave some requests as buffer

    def __init__(self, redis_url: str | None = None):
        self.redis_url = redis_url or settings.redis_url
        self._redis: redis.Redis | None = None

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

    def _token_key(self, access_token: str) -> str:
        """Generate a Redis key for a token (hashed for security)."""
        token_hash = hashlib.sha256(access_token.encode()).hexdigest()[:16]
        return f"github:ratelimit:{token_hash}"

    @staticmethod
    def parse_headers(headers: dict[str, str]) -> RateLimitInfo | None:
        """Parse rate limit info from GitHub API response headers.

        GitHub sends these headers:
        - x-ratelimit-limit: Max requests
        - x-ratelimit-remaining: Remaining requests
        - x-ratelimit-reset: Unix timestamp when limit resets
        - x-ratelimit-resource: Resource type (core, search, etc.)
        """
        try:
            limit = int(headers.get("x-ratelimit-limit", 0))
            remaining = int(headers.get("x-ratelimit-remaining", 0))
            reset_ts = int(headers.get("x-ratelimit-reset", 0))
            resource = headers.get("x-ratelimit-resource", "core")

            if limit == 0:
                return None

            reset_at = datetime.fromtimestamp(reset_ts, tz=timezone.utc)

            return RateLimitInfo(
                limit=limit,
                remaining=remaining,
                reset_at=reset_at,
                resource=resource,
            )
        except (ValueError, TypeError) as e:
            logger.warning(f"Failed to parse rate limit headers: {e}")
            return None

    async def record_rate_limit(
        self,
        access_token: str,
        headers: dict[str, str],
    ) -> RateLimitInfo | None:
        """Record rate limit info from API response headers.

        Call this after each GitHub API request to track limits.
        """
        info = self.parse_headers(headers)
        if not info:
            return None

        try:
            r = await self._get_redis()
            key = self._token_key(access_token)

            # Store rate limit info
            await r.hset(
                key,
                mapping={
                    f"{info.resource}_limit": info.limit,
                    f"{info.resource}_remaining": info.remaining,
                    f"{info.resource}_reset": info.reset_at.timestamp(),
                },
            )

            # Set expiry to reset time + buffer
            ttl = int(info.reset_in_seconds) + 60
            await r.expire(key, ttl)

            if info.remaining < self.SAFETY_BUFFER:
                logger.warning(
                    f"GitHub rate limit low: {info.remaining}/{info.limit} "
                    f"for {info.resource}, resets in {info.reset_in_seconds:.0f}s"
                )

        except Exception as e:
            logger.error(f"Failed to record rate limit: {e}")

        return info

    async def get_rate_limit_status(self, access_token: str) -> RateLimitStatus:
        """Get current rate limit status for a token."""
        status = RateLimitStatus()

        try:
            r = await self._get_redis()
            key = self._token_key(access_token)
            data = await r.hgetall(key)

            if not data:
                return status  # No cached data, assume OK

            now = datetime.now(timezone.utc)

            for resource in ["core", "search", "graphql"]:
                limit_key = f"{resource}_limit"
                if limit_key in data:
                    reset_ts = float(data.get(f"{resource}_reset", 0))
                    reset_at = datetime.fromtimestamp(reset_ts, tz=timezone.utc)

                    info = RateLimitInfo(
                        limit=int(data[limit_key]),
                        remaining=int(data.get(f"{resource}_remaining", 0)),
                        reset_at=reset_at,
                        resource=resource,
                    )

                    setattr(status, resource, info)

                    # Check if we need to wait
                    if info.remaining <= 0 and reset_at > now:
                        status.can_proceed = False
                        status.wait_seconds = max(
                            status.wait_seconds,
                            info.reset_in_seconds,
                        )

        except Exception as e:
            logger.error(f"Failed to get rate limit status: {e}")

        return status

    async def wait_if_needed(
        self,
        access_token: str,
        resource: str = "core",
    ) -> float:
        """Wait if rate limit is exhausted.

        Returns the number of seconds waited.
        """
        status = await self.get_rate_limit_status(access_token)

        if status.can_proceed:
            return 0

        wait_seconds = min(status.wait_seconds, 900)  # Max 15 min wait

        if wait_seconds > 0:
            logger.info(
                f"Rate limit exhausted for {resource}, "
                f"waiting {wait_seconds:.0f}s until reset"
            )
            await asyncio.sleep(wait_seconds)

        return wait_seconds

    async def check_and_wait(
        self,
        access_token: str,
        resource: str = "core",
        min_remaining: int = 10,
    ) -> bool:
        """Check rate limit and wait if necessary.

        Args:
            access_token: GitHub access token
            resource: Resource type to check
            min_remaining: Minimum remaining requests required

        Returns:
            True if we can proceed, False if rate limit is completely blocked.
        """
        status = await self.get_rate_limit_status(access_token)
        info = getattr(status, resource, None)

        if info is None:
            return True  # No info, assume OK

        if info.remaining >= min_remaining:
            return True

        if info.remaining > 0:
            # Low but not exhausted - proceed but log warning
            logger.warning(
                f"Rate limit low ({info.remaining} remaining), "
                f"consider slowing down"
            )
            return True

        # Wait for reset
        wait_time = await self.wait_if_needed(access_token, resource)
        return wait_time < 900  # If we waited reasonable time, proceed

    async def record_request(self, access_token: str) -> None:
        """Record that a request was made (decrements cached remaining count).

        Call this before making a request to proactively track usage.
        """
        try:
            r = await self._get_redis()
            key = self._token_key(access_token)

            # Decrement the remaining count
            await r.hincrby(key, "core_remaining", -1)

        except Exception as e:
            logger.error(f"Failed to record request: {e}")


# Global instance for convenience
_rate_limiter: GitHubRateLimiter | None = None


def get_rate_limiter() -> GitHubRateLimiter:
    """Get the global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = GitHubRateLimiter()
    return _rate_limiter
