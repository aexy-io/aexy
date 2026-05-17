"""Dedup cache around LLM analysis results.

Keyed on sha256(prompt_version || canonical_json(payload)). Identical re-runs
return the cached analysis without burning tokens. Used by the GitHub AI
pipeline (analyze_commit, analyze_pr, analyze_review).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.llm_analysis_cache import LlmAnalysisCache

logger = logging.getLogger(__name__)

DEFAULT_TTL = timedelta(days=30)


def hash_payload(prompt_version: str, payload: dict[str, Any]) -> str:
    """Stable content hash for a prompt+payload pair.

    Sorts keys so semantically-equivalent payloads collide on the same hash.
    """
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    digest = hashlib.sha256()
    digest.update(prompt_version.encode("utf-8"))
    digest.update(b"\x00")
    digest.update(canonical.encode("utf-8"))
    return digest.hexdigest()


class LlmAnalysisCacheService:
    """Read-through + write-back cache for LLM analyses."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, prompt_hash: str) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        stmt = select(LlmAnalysisCache).where(
            LlmAnalysisCache.prompt_hash == prompt_hash,
            LlmAnalysisCache.expires_at > now,
        )
        result = await self.db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return row.analysis

    async def put(
        self,
        prompt_hash: str,
        analysis: dict[str, Any],
        model: str,
        prompt_version: str,
        token_usage: dict[str, Any] | None = None,
        ttl: timedelta = DEFAULT_TTL,
    ) -> None:
        """Upsert. On hash collision we overwrite — the analysis is derived
        from the same input by definition, so the newer model output wins."""
        now = datetime.now(timezone.utc)
        expires_at = now + ttl
        stmt = pg_insert(LlmAnalysisCache).values(
            prompt_hash=prompt_hash,
            analysis=analysis,
            model=model,
            prompt_version=prompt_version,
            token_usage=token_usage,
            created_at=now,
            expires_at=expires_at,
        ).on_conflict_do_update(
            index_elements=["prompt_hash"],
            set_={
                "analysis": analysis,
                "model": model,
                "prompt_version": prompt_version,
                "token_usage": token_usage,
                "expires_at": expires_at,
            },
        )
        await self.db.execute(stmt)

    async def purge_expired(self) -> int:
        """Delete rows past their expires_at. Returns count removed."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            delete(LlmAnalysisCache).where(LlmAnalysisCache.expires_at <= now)
        )
        return result.rowcount or 0
