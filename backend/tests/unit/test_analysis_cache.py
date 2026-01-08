"""Tests for Analysis Cache."""

import pytest

from aexy.cache.analysis_cache import InMemoryCache
from aexy.llm.base import AnalysisResult, LanguageAnalysis


class TestInMemoryCache:
    """Tests for InMemoryCache."""

    @pytest.fixture
    def cache(self):
        """Create an in-memory cache."""
        return InMemoryCache()

    @pytest.mark.asyncio
    async def test_get_missing_key(self, cache):
        """Should return None for missing key."""
        result = await cache.get("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_and_get(self, cache):
        """Should store and retrieve data."""
        data = {"name": "test", "value": 42}

        await cache.set("key1", data)
        result = await cache.get("key1")

        assert result == data

    @pytest.mark.asyncio
    async def test_set_with_model(self, cache):
        """Should store Pydantic models."""
        model = AnalysisResult(
            languages=[LanguageAnalysis(name="Python", confidence=0.9)],
            summary="Test result",
            confidence=0.85,
        )

        await cache.set("model_key", model)
        result = await cache.get("model_key")

        assert result is not None
        assert result["summary"] == "Test result"

    @pytest.mark.asyncio
    async def test_get_model(self, cache):
        """Should retrieve and parse as model."""
        model = AnalysisResult(
            languages=[LanguageAnalysis(name="Python", confidence=0.9)],
            summary="Test result",
        )

        await cache.set("model_key", model)
        result = await cache.get_model("model_key", AnalysisResult)

        assert result is not None
        assert result.summary == "Test result"
        assert len(result.languages) == 1

    @pytest.mark.asyncio
    async def test_get_model_missing(self, cache):
        """Should return None for missing model."""
        result = await cache.get_model("nonexistent", AnalysisResult)
        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, cache):
        """Should delete entries."""
        await cache.set("key1", {"data": "test"})
        assert await cache.exists("key1")

        await cache.delete("key1")
        assert not await cache.exists("key1")

    @pytest.mark.asyncio
    async def test_exists(self, cache):
        """Should check existence."""
        assert not await cache.exists("key1")

        await cache.set("key1", {"data": "test"})
        assert await cache.exists("key1")

    @pytest.mark.asyncio
    async def test_clear_prefix(self, cache):
        """Should clear entries by prefix."""
        await cache.set("prefix1_a", {"data": "a"})
        await cache.set("prefix1_b", {"data": "b"})
        await cache.set("prefix2_c", {"data": "c"})

        deleted = await cache.clear_prefix("prefix1")

        assert deleted == 2
        assert not await cache.exists("prefix1_a")
        assert not await cache.exists("prefix1_b")
        assert await cache.exists("prefix2_c")

    @pytest.mark.asyncio
    async def test_ttl_expiration(self, cache):
        """Should expire entries after TTL."""
        import time

        # Set with very short TTL
        await cache.set("expiring", {"data": "test"}, ttl=1)

        # Should exist immediately
        assert await cache.exists("expiring")

        # Wait for expiration
        time.sleep(1.1)

        # Should be expired
        assert not await cache.exists("expiring")

    @pytest.mark.asyncio
    async def test_health_check(self, cache):
        """Should always be healthy for in-memory cache."""
        assert await cache.health_check() is True

    @pytest.mark.asyncio
    async def test_get_stats(self, cache):
        """Should return stats."""
        await cache.set("key1", {"data": "test"})
        await cache.set("key2", {"data": "test"})

        stats = await cache.get_stats()

        assert stats["total_keys"] == 2

    @pytest.mark.asyncio
    async def test_overwrite(self, cache):
        """Should overwrite existing keys."""
        await cache.set("key1", {"value": 1})
        await cache.set("key1", {"value": 2})

        result = await cache.get("key1")
        assert result["value"] == 2

    @pytest.mark.asyncio
    async def test_different_data_types(self, cache):
        """Should handle various data types."""
        # String
        await cache.set("string", {"type": "string", "value": "hello"})

        # Number
        await cache.set("number", {"type": "number", "value": 42})

        # List
        await cache.set("list", {"type": "list", "value": [1, 2, 3]})

        # Nested
        await cache.set("nested", {
            "type": "nested",
            "value": {"a": {"b": {"c": 1}}},
        })

        assert (await cache.get("string"))["value"] == "hello"
        assert (await cache.get("number"))["value"] == 42
        assert (await cache.get("list"))["value"] == [1, 2, 3]
        assert (await cache.get("nested"))["value"]["a"]["b"]["c"] == 1
