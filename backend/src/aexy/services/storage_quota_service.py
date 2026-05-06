"""Storage quota tracking and enforcement.

Aggregates storage usage across every file-storing table in the platform
(drive_files, task_attachments via sprint_tasks, compliance_documents) and
enforces the per-workspace `max_storage_gb` limit drawn from the effective
plan (with workspace overrides applied).

Usage is computed-on-read via a single `UNION ALL` and cached in Redis for
60 s to avoid hot-path latency on every upload. The cache is invalidated by
`invalidate_workspace_usage(workspace_id)` after persistence-affecting
mutations.
"""

from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as redis
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.services.limits_service import LimitsService

logger = logging.getLogger(__name__)

# Bytes per GB — base 1024 to align with how we present the user-facing
# "X GB used" figure in the billing dashboard.
BYTES_PER_GB = 1024 * 1024 * 1024

USAGE_CACHE_TTL_SECONDS = 60
USAGE_CACHE_PREFIX = "storage:usage:"


# Single query summing every place a workspace currently stores files.
# Each branch carries its own join path back to workspace_id:
#   * drive_files: direct
#   * task_attachments: through sprint_tasks (which carries workspace_id)
#   * compliance_documents: direct
_USAGE_QUERY = text(
    """
    SELECT COALESCE(SUM(size_bytes), 0)::BIGINT AS total
    FROM (
        SELECT df.file_size_bytes AS size_bytes
        FROM drive_files df
        WHERE df.workspace_id = :workspace_id
          AND df.deleted_at IS NULL
          AND df.kind <> 'folder'

        UNION ALL

        SELECT ta.file_size AS size_bytes
        FROM task_attachments ta
        JOIN sprint_tasks st ON st.id = ta.task_id
        WHERE st.workspace_id = :workspace_id

        UNION ALL

        SELECT cd.file_size AS size_bytes
        FROM compliance_documents cd
        WHERE cd.workspace_id = :workspace_id
    ) AS combined
    """
)


class StorageQuotaService:
    """Compute + enforce per-workspace storage quotas."""

    def __init__(self, db: AsyncSession, redis_client: Optional[redis.Redis] = None):
        self.db = db
        self._redis = redis_client
        self._owns_redis = redis_client is None

    async def _get_redis(self) -> redis.Redis:
        if self._redis is None:
            settings = get_settings()
            self._redis = redis.from_url(
                settings.redis_url, encoding="utf-8", decode_responses=True
            )
        return self._redis

    async def close(self) -> None:
        if self._redis is not None and self._owns_redis:
            await self._redis.close()
            self._redis = None

    @staticmethod
    def _cache_key(workspace_id: str) -> str:
        return f"{USAGE_CACHE_PREFIX}{workspace_id}"

    async def get_workspace_storage_used(self, workspace_id: str) -> int:
        """Return total bytes used by `workspace_id` across all file tables."""
        cache_key = self._cache_key(workspace_id)
        try:
            r = await self._get_redis()
            cached = await r.get(cache_key)
            if cached is not None:
                return int(cached)
        except Exception as exc:  # pragma: no cover - cache is best-effort
            logger.warning("Storage usage cache read failed: %s", exc)

        result = await self.db.execute(_USAGE_QUERY, {"workspace_id": workspace_id})
        used = int(result.scalar_one() or 0)

        try:
            r = await self._get_redis()
            await r.setex(cache_key, USAGE_CACHE_TTL_SECONDS, str(used))
        except Exception as exc:  # pragma: no cover
            logger.warning("Storage usage cache write failed: %s", exc)

        return used

    async def get_effective_storage_limit_bytes(
        self, workspace_id: str, developer_id: str | None = None
    ) -> int:
        """Return the storage limit in bytes (-1 for unlimited).

        `developer_id` is optional — when omitted we look up the workspace's
        owner via the existing LimitsService plan-resolution path which
        operates on (workspace, developer). When the workspace has a plan
        override, the override wins.
        """
        limits = LimitsService(self.db)
        # LimitsService.get_effective_plan accepts (developer_id, workspace_id).
        # When we're called from an API route we have current_user.id; when
        # called from a Temporal activity we look up the workspace owner.
        if developer_id is None:
            # Fallback: query the workspace owner directly to avoid recursing
            # into LimitsService's developer-centric API.
            from aexy.models.workspace import Workspace
            from sqlalchemy import select

            ws = (
                await self.db.execute(select(Workspace).where(Workspace.id == workspace_id))
            ).scalar_one_or_none()
            if ws is None:
                raise ValueError(f"Workspace {workspace_id} not found")
            developer_id = str(ws.owner_id)

        effective = await limits.get_effective_plan(developer_id, workspace_id)
        gb = effective.max_storage_gb
        if gb == -1:
            return -1
        return gb * BYTES_PER_GB

    async def assert_storage_available(
        self,
        workspace_id: str,
        incoming_bytes: int,
        developer_id: str | None = None,
    ) -> None:
        """Raise HTTPException(413) if `incoming_bytes` would push the
        workspace past its quota. -1 (unlimited) bypasses the check.

        Concurrent uploads from the same workspace are serialised via a
        Postgres advisory transaction lock keyed on the workspace id. Without
        the lock, two simultaneous uploads can both pass the cached/used
        check and overshoot the cap by up to 2x their incoming bytes. The
        lock is released automatically at end of the request's transaction.
        """
        if incoming_bytes <= 0:
            return

        limit_bytes = await self.get_effective_storage_limit_bytes(
            workspace_id, developer_id=developer_id
        )
        if limit_bytes == -1:
            return

        # Serialise concurrent quota assertions for the same workspace.
        # `hashtextextended` is deterministic and bigint-shaped, which is what
        # `pg_advisory_xact_lock(bigint)` expects. Tests on SQLite simply skip
        # this guard (the function doesn't exist) — fine, since the race only
        # matters under real concurrency on Postgres.
        try:
            await self.db.execute(
                text(
                    "SELECT pg_advisory_xact_lock(hashtextextended(:workspace_id, 0))"
                ),
                {"workspace_id": workspace_id},
            )
        except Exception as exc:  # pragma: no cover — non-PG dialects
            logger.debug("advisory lock skipped: %s", exc)

        # Read used bytes directly from the DB now that the lock is held —
        # bypass the cache so we can't accept a stale value.
        result = await self.db.execute(_USAGE_QUERY, {"workspace_id": workspace_id})
        used = int(result.scalar_one() or 0)

        if used + incoming_bytes > limit_bytes:
            limit_gb = limit_bytes / BYTES_PER_GB
            used_gb = used / BYTES_PER_GB
            incoming_mb = incoming_bytes / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"Storage quota exceeded: {used_gb:.2f} GB used + "
                    f"{incoming_mb:.2f} MB incoming > {limit_gb:.2f} GB limit. "
                    "Upgrade your plan or delete unused files."
                ),
            )

    async def invalidate_workspace_usage(self, workspace_id: str) -> None:
        """Drop the Redis cache for a workspace. Call after any insert/delete
        that affects the storage rollup."""
        try:
            r = await self._get_redis()
            await r.delete(self._cache_key(workspace_id))
        except Exception as exc:  # pragma: no cover
            logger.warning("Storage usage cache invalidate failed: %s", exc)

    async def get_usage_summary(
        self, workspace_id: str, developer_id: str | None = None
    ) -> dict:
        """Return a usage summary suitable for the billing dashboard card."""
        used = await self.get_workspace_storage_used(workspace_id)
        limit = await self.get_effective_storage_limit_bytes(
            workspace_id, developer_id=developer_id
        )
        unlimited = limit == -1
        percent_used = 0.0 if unlimited or limit == 0 else (used / limit) * 100.0
        return {
            "used_bytes": used,
            "limit_bytes": limit,
            "unlimited": unlimited,
            "percent_used": min(100.0, percent_used),
        }
