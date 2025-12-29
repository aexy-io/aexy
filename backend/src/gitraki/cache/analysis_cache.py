"""Redis-based cache for LLM analysis results."""

import json
import logging
from functools import lru_cache
from typing import Any, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class AnalysisCache:
    """Redis-based cache for LLM analysis results.

    Uses content hashing to avoid duplicate analysis of the same content.
    Supports any Pydantic model for serialization.
    """

    def __init__(self, redis_client: Any) -> None:
        """Initialize the cache.

        Args:
            redis_client: Redis client (async or sync).
        """
        self._redis = redis_client
        self._prefix = "gitraki:llm:cache:"

    def _make_key(self, cache_key: str) -> str:
        """Create a prefixed cache key.

        Args:
            cache_key: The base cache key.

        Returns:
            Prefixed key.
        """
        return f"{self._prefix}{cache_key}"

    async def get(self, cache_key: str) -> dict[str, Any] | None:
        """Get a cached analysis result.

        Args:
            cache_key: The cache key (content hash).

        Returns:
            Cached data dict if found, None otherwise.
        """
        try:
            key = self._make_key(cache_key)
            data = await self._redis.get(key)

            if data is None:
                return None

            return json.loads(data)

        except Exception as e:
            logger.warning(f"Cache get failed for {cache_key[:16]}...: {e}")
            return None

    async def get_model(self, cache_key: str, model_class: type[T]) -> T | None:
        """Get a cached result as a Pydantic model.

        Args:
            cache_key: The cache key.
            model_class: The Pydantic model class to deserialize to.

        Returns:
            Model instance if found, None otherwise.
        """
        data = await self.get(cache_key)
        if data is None:
            return None

        try:
            return model_class.model_validate(data)
        except Exception as e:
            logger.warning(f"Failed to parse cached data as {model_class.__name__}: {e}")
            return None

    async def set(
        self,
        cache_key: str,
        data: dict[str, Any] | BaseModel,
        ttl: int = 86400,
    ) -> bool:
        """Set a cached analysis result.

        Args:
            cache_key: The cache key.
            data: Data to cache (dict or Pydantic model).
            ttl: Time to live in seconds (default 24 hours).

        Returns:
            True if cached successfully, False otherwise.
        """
        try:
            key = self._make_key(cache_key)

            if isinstance(data, BaseModel):
                json_data = data.model_dump_json()
            else:
                json_data = json.dumps(data)

            await self._redis.setex(key, ttl, json_data)
            return True

        except Exception as e:
            logger.warning(f"Cache set failed for {cache_key[:16]}...: {e}")
            return False

    async def delete(self, cache_key: str) -> bool:
        """Delete a cached entry.

        Args:
            cache_key: The cache key.

        Returns:
            True if deleted, False otherwise.
        """
        try:
            key = self._make_key(cache_key)
            await self._redis.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache delete failed for {cache_key[:16]}...: {e}")
            return False

    async def exists(self, cache_key: str) -> bool:
        """Check if a cache entry exists.

        Args:
            cache_key: The cache key.

        Returns:
            True if exists, False otherwise.
        """
        try:
            key = self._make_key(cache_key)
            return await self._redis.exists(key) > 0
        except Exception as e:
            logger.warning(f"Cache exists check failed: {e}")
            return False

    async def clear_prefix(self, prefix: str = "") -> int:
        """Clear all cache entries with a given prefix.

        Args:
            prefix: Additional prefix to match.

        Returns:
            Number of keys deleted.
        """
        try:
            pattern = f"{self._prefix}{prefix}*"
            keys = []

            async for key in self._redis.scan_iter(pattern):
                keys.append(key)

            if keys:
                await self._redis.delete(*keys)

            return len(keys)

        except Exception as e:
            logger.warning(f"Cache clear failed: {e}")
            return 0

    async def health_check(self) -> bool:
        """Check if the cache is healthy.

        Returns:
            True if healthy, False otherwise.
        """
        try:
            await self._redis.ping()
            return True
        except Exception as e:
            logger.error(f"Cache health check failed: {e}")
            return False

    async def get_stats(self) -> dict[str, Any]:
        """Get cache statistics.

        Returns:
            Dict with cache stats.
        """
        try:
            info = await self._redis.info("stats")
            memory = await self._redis.info("memory")

            # Count our keys
            pattern = f"{self._prefix}*"
            key_count = 0
            async for _ in self._redis.scan_iter(pattern):
                key_count += 1

            return {
                "total_keys": key_count,
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0),
                "memory_used_bytes": memory.get("used_memory", 0),
                "memory_used_human": memory.get("used_memory_human", "unknown"),
            }

        except Exception as e:
            logger.warning(f"Failed to get cache stats: {e}")
            return {"error": str(e)}


class InMemoryCache:
    """Simple in-memory cache for development/testing."""

    def __init__(self) -> None:
        """Initialize the in-memory cache."""
        self._cache: dict[str, tuple[str, float]] = {}
        self._prefix = "gitraki:llm:cache:"

    def _make_key(self, cache_key: str) -> str:
        return f"{self._prefix}{cache_key}"

    async def get(self, cache_key: str) -> dict[str, Any] | None:
        key = self._make_key(cache_key)
        if key not in self._cache:
            return None

        import time

        data, expires_at = self._cache[key]
        if time.time() > expires_at:
            del self._cache[key]
            return None

        return json.loads(data)

    async def get_model(self, cache_key: str, model_class: type[T]) -> T | None:
        data = await self.get(cache_key)
        if data is None:
            return None
        return model_class.model_validate(data)

    async def set(
        self,
        cache_key: str,
        data: dict[str, Any] | BaseModel,
        ttl: int = 86400,
    ) -> bool:
        import time

        key = self._make_key(cache_key)
        if isinstance(data, BaseModel):
            json_data = data.model_dump_json()
        else:
            json_data = json.dumps(data)

        self._cache[key] = (json_data, time.time() + ttl)
        return True

    async def delete(self, cache_key: str) -> bool:
        key = self._make_key(cache_key)
        if key in self._cache:
            del self._cache[key]
        return True

    async def exists(self, cache_key: str) -> bool:
        return await self.get(cache_key) is not None

    async def clear_prefix(self, prefix: str = "") -> int:
        pattern = f"{self._prefix}{prefix}"
        keys_to_delete = [k for k in self._cache if k.startswith(pattern)]
        for key in keys_to_delete:
            del self._cache[key]
        return len(keys_to_delete)

    async def health_check(self) -> bool:
        return True

    async def get_stats(self) -> dict[str, Any]:
        return {
            "total_keys": len(self._cache),
            "hits": 0,
            "misses": 0,
            "memory_used_bytes": 0,
            "memory_used_human": "in-memory",
        }


@lru_cache
def get_analysis_cache() -> AnalysisCache | InMemoryCache:
    """Get the cached analysis cache instance.

    Returns:
        Analysis cache (Redis-based or in-memory fallback).
    """
    from gitraki.core.config import get_settings

    settings = get_settings()

    try:
        import redis.asyncio as redis

        client = redis.from_url(settings.redis_url)
        return AnalysisCache(client)

    except ImportError:
        logger.warning("Redis not installed, using in-memory cache")
        return InMemoryCache()

    except Exception as e:
        logger.warning(f"Failed to connect to Redis, using in-memory cache: {e}")
        return InMemoryCache()
