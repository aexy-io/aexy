"""Redis-based cache for Developer Insights API responses."""

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_TTL = 300  # 5 minutes


class InsightsCache:
    """Redis-based cache for expensive Developer Insights endpoints.

    Keys are prefixed with ``aexy:insights:`` and default to a 5-minute TTL.
    All methods gracefully degrade when Redis is unavailable -- they log a
    warning and return ``None`` / no-op so callers can proceed without cache.
    """

    PREFIX = "aexy:insights:"

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    # ------------------------------------------------------------------
    # Key helpers
    # ------------------------------------------------------------------

    @staticmethod
    def make_key(workspace_id: str, endpoint: str, **params: Any) -> str:
        """Build a deterministic cache key.

        The key layout is::

            aexy:insights:ws:{workspace_id}:{endpoint}:{param_hash}

        ``param_hash`` is a short SHA-256 hex digest of the sorted
        query-parameter pairs so that identical requests always hit the
        same key regardless of parameter ordering.

        Args:
            workspace_id: The workspace UUID.
            endpoint: A short label for the endpoint (e.g. ``"team"``).
            **params: Arbitrary query parameters to incorporate.

        Returns:
            A fully-qualified cache key string.
        """
        # Filter out None values and sort for determinism
        filtered = {k: str(v) for k, v in sorted(params.items()) if v is not None}
        raw = json.dumps(filtered, sort_keys=True)
        param_hash = hashlib.sha256(raw.encode()).hexdigest()[:12]
        return f"{InsightsCache.PREFIX}ws:{workspace_id}:{endpoint}:{param_hash}"

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def get(self, cache_key: str) -> dict[str, Any] | None:
        """Return cached dict for *cache_key*, or ``None`` on miss / error."""
        try:
            data = await self._redis.get(cache_key)
            if data is None:
                return None
            logger.debug("Insights cache HIT: %s", cache_key)
            return json.loads(data)
        except Exception as e:
            logger.warning("Insights cache get failed for %s: %s", cache_key, e)
            return None

    async def set(
        self, cache_key: str, data: dict[str, Any], ttl: int = DEFAULT_TTL
    ) -> None:
        """Store *data* under *cache_key* with the given TTL (seconds)."""
        try:
            json_data = json.dumps(data, default=str)
            await self._redis.setex(cache_key, ttl, json_data)
            logger.debug("Insights cache SET: %s (ttl=%ds)", cache_key, ttl)
        except Exception as e:
            logger.warning("Insights cache set failed for %s: %s", cache_key, e)

    async def invalidate(self, pattern: str) -> int:
        """Delete all keys matching *pattern* (supports Redis glob syntax).

        Args:
            pattern: A Redis key pattern, e.g.
                     ``aexy:insights:ws:{workspace_id}:*``.

        Returns:
            Number of keys deleted (0 on error).
        """
        try:
            keys: list[bytes | str] = []
            async for key in self._redis.scan_iter(pattern):
                keys.append(key)
            if keys:
                await self._redis.delete(*keys)
                logger.info(
                    "Insights cache invalidated %d key(s) for pattern %s",
                    len(keys),
                    pattern,
                )
            return len(keys)
        except Exception as e:
            logger.warning("Insights cache invalidate failed for %s: %s", pattern, e)
            return 0


# ----------------------------------------------------------------------
# Singleton accessor
# ----------------------------------------------------------------------

_insights_cache: InsightsCache | None = None


def get_insights_cache() -> InsightsCache | None:
    """Return a module-level :class:`InsightsCache` singleton.

    On first call the function creates a ``redis.asyncio`` client from
    ``settings.redis_url``.  If Redis is not available the function
    returns ``None`` so callers can simply skip caching.
    """
    global _insights_cache

    if _insights_cache is not None:
        return _insights_cache

    try:
        import redis.asyncio as aioredis
        from aexy.core.config import get_settings

        settings = get_settings()
        client = aioredis.from_url(settings.redis_url)
        _insights_cache = InsightsCache(client)
        return _insights_cache
    except Exception as e:
        logger.warning("Failed to create InsightsCache (Redis unavailable): %s", e)
        return None
