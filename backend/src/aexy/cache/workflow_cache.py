"""Redis-based cache for workflow definitions and execution data."""

import json
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

# Cache TTL in seconds (1 hour for workflow definitions)
WORKFLOW_CACHE_TTL = 3600
# Cache TTL for execution order (24 hours - invalidated on workflow update)
TOPO_SORT_CACHE_TTL = 86400


class WorkflowCache:
    """Redis-based cache for workflow data.

    Caches:
    - Workflow definitions to avoid DB lookups
    - Precomputed topological sort order for execution
    """

    def __init__(self, redis_client: Any) -> None:
        """Initialize the cache.

        Args:
            redis_client: Redis client (async).
        """
        self._redis = redis_client
        self._workflow_prefix = "aexy:workflow:"
        self._topo_prefix = "aexy:workflow:topo:"

    def _workflow_key(self, workflow_id: str) -> str:
        """Create a cache key for workflow definition."""
        return f"{self._workflow_prefix}{workflow_id}"

    def _topo_key(self, workflow_id: str, version: int) -> str:
        """Create a cache key for topological sort (version-specific)."""
        return f"{self._topo_prefix}{workflow_id}:v{version}"

    # =========================================================================
    # WORKFLOW DEFINITION CACHE
    # =========================================================================

    async def get_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        """Get a cached workflow definition.

        Args:
            workflow_id: The workflow ID.

        Returns:
            Workflow data dict if cached, None otherwise.
        """
        try:
            key = self._workflow_key(workflow_id)
            data = await self._redis.get(key)

            if data is None:
                return None

            return json.loads(data)

        except Exception as e:
            logger.warning(f"Workflow cache get failed for {workflow_id}: {e}")
            return None

    async def set_workflow(
        self,
        workflow_id: str,
        workflow_data: dict[str, Any],
        ttl: int = WORKFLOW_CACHE_TTL,
    ) -> bool:
        """Cache a workflow definition.

        Args:
            workflow_id: The workflow ID.
            workflow_data: The workflow data to cache.
            ttl: Time to live in seconds.

        Returns:
            True if cached successfully.
        """
        try:
            key = self._workflow_key(workflow_id)
            await self._redis.setex(key, ttl, json.dumps(workflow_data))
            return True

        except Exception as e:
            logger.warning(f"Workflow cache set failed for {workflow_id}: {e}")
            return False

    async def invalidate_workflow(self, workflow_id: str) -> bool:
        """Invalidate a cached workflow and its topological sort.

        Args:
            workflow_id: The workflow ID.

        Returns:
            True if invalidated.
        """
        try:
            # Delete workflow cache
            workflow_key = self._workflow_key(workflow_id)
            await self._redis.delete(workflow_key)

            # Delete all version-specific topo caches
            pattern = f"{self._topo_prefix}{workflow_id}:*"
            keys = await self._redis.keys(pattern)
            if keys:
                await self._redis.delete(*keys)

            return True

        except Exception as e:
            logger.warning(f"Workflow cache invalidate failed for {workflow_id}: {e}")
            return False

    # =========================================================================
    # TOPOLOGICAL SORT CACHE
    # =========================================================================

    async def get_topo_sort(
        self, workflow_id: str, version: int
    ) -> list[str] | None:
        """Get cached topological sort order.

        Args:
            workflow_id: The workflow ID.
            version: The workflow version.

        Returns:
            List of node IDs in execution order, or None if not cached.
        """
        try:
            key = self._topo_key(workflow_id, version)
            data = await self._redis.get(key)

            if data is None:
                return None

            return json.loads(data)

        except Exception as e:
            logger.warning(f"Topo sort cache get failed for {workflow_id}: {e}")
            return None

    async def set_topo_sort(
        self,
        workflow_id: str,
        version: int,
        execution_order: list[str],
        ttl: int = TOPO_SORT_CACHE_TTL,
    ) -> bool:
        """Cache topological sort order.

        Args:
            workflow_id: The workflow ID.
            version: The workflow version.
            execution_order: List of node IDs in execution order.
            ttl: Time to live in seconds.

        Returns:
            True if cached successfully.
        """
        try:
            key = self._topo_key(workflow_id, version)
            await self._redis.setex(key, ttl, json.dumps(execution_order))
            return True

        except Exception as e:
            logger.warning(f"Topo sort cache set failed for {workflow_id}: {e}")
            return False

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    @staticmethod
    def compute_topo_sort(nodes: list[dict], edges: list[dict]) -> list[str]:
        """Compute topological sort order for workflow nodes.

        Uses Kahn's algorithm for topological sorting.

        Args:
            nodes: List of node definitions.
            edges: List of edge definitions.

        Returns:
            List of node IDs in execution order.

        Raises:
            ValueError: If the graph has a cycle.
        """
        if not nodes:
            return []

        # Build adjacency list and in-degree count
        graph: dict[str, list[str]] = defaultdict(list)
        in_degree: dict[str, int] = {node["id"]: 0 for node in nodes}

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target and target in in_degree:
                graph[source].append(target)
                in_degree[target] += 1

        # Find all nodes with no incoming edges (triggers)
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        result = []

        while queue:
            # Sort for deterministic order
            queue.sort()
            node_id = queue.pop(0)
            result.append(node_id)

            for neighbor in graph[node_id]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(result) != len(nodes):
            raise ValueError("Workflow graph contains a cycle")

        return result


# In-memory fallback cache for when Redis is unavailable
class InMemoryWorkflowCache:
    """Simple in-memory cache fallback for workflows."""

    def __init__(self, max_size: int = 100) -> None:
        self._cache: dict[str, tuple[Any, float]] = {}
        self._max_size = max_size

    def _evict_if_needed(self) -> None:
        """Evict oldest entries if cache is full."""
        if len(self._cache) >= self._max_size:
            # Remove oldest 10%
            sorted_keys = sorted(
                self._cache.keys(),
                key=lambda k: self._cache[k][1]
            )
            for key in sorted_keys[:self._max_size // 10]:
                del self._cache[key]

    async def get_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        """Get cached workflow."""
        import time
        entry = self._cache.get(f"workflow:{workflow_id}")
        if entry:
            data, timestamp = entry
            if time.time() - timestamp < WORKFLOW_CACHE_TTL:
                return data
            del self._cache[f"workflow:{workflow_id}"]
        return None

    async def set_workflow(
        self, workflow_id: str, workflow_data: dict[str, Any], ttl: int = WORKFLOW_CACHE_TTL
    ) -> bool:
        """Cache workflow."""
        import time
        self._evict_if_needed()
        self._cache[f"workflow:{workflow_id}"] = (workflow_data, time.time())
        return True

    async def invalidate_workflow(self, workflow_id: str) -> bool:
        """Invalidate cached workflow."""
        keys_to_delete = [k for k in self._cache if workflow_id in k]
        for key in keys_to_delete:
            del self._cache[key]
        return True

    async def get_topo_sort(self, workflow_id: str, version: int) -> list[str] | None:
        """Get cached topo sort."""
        import time
        key = f"topo:{workflow_id}:v{version}"
        entry = self._cache.get(key)
        if entry:
            data, timestamp = entry
            if time.time() - timestamp < TOPO_SORT_CACHE_TTL:
                return data
            del self._cache[key]
        return None

    async def set_topo_sort(
        self, workflow_id: str, version: int, execution_order: list[str], ttl: int = TOPO_SORT_CACHE_TTL
    ) -> bool:
        """Cache topo sort."""
        import time
        self._evict_if_needed()
        self._cache[f"topo:{workflow_id}:v{version}"] = (execution_order, time.time())
        return True
