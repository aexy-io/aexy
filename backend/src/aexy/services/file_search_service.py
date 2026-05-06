"""Workspace-wide hybrid search across every file source.

Replaces `drive_search_service.py` (which only searched `drive_files`) with
a single search that spans `file_metadata` rows of every source type. The
hit shape carries `source_type` + `source_id` + a denormalised name + a
download URL so the UI can render results without per-source lookups.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.gateway import LLMGateway
from aexy.models.compliance_document import ComplianceDocument
from aexy.models.drive import DriveFile
from aexy.models.file_metadata import (
    SOURCE_COMPLIANCE_DOCUMENT,
    SOURCE_DRIVE_FILE,
    SOURCE_TASK_ATTACHMENT,
    FileEmbedding,
    FileMetadata,
)
from aexy.models.sprint import SprintTask, TaskAttachment

logger = logging.getLogger(__name__)


@dataclass
class FileSearchHit:
    metadata_id: str
    source_type: str
    source_id: str
    workspace_id: str
    file_name: str
    file_url: str | None
    content_type: str | None
    ai_summary: str | None
    ai_tags: list[str]
    ai_categories: list[str]
    ai_status: str
    score: float
    highlights: list[str]


class FileSearchService:
    def __init__(self, db: AsyncSession, gateway: LLMGateway | None):
        """`gateway` is optional — when None (e.g. no LLM keys configured),
        search degrades to keyword-only. Embeddings are skipped entirely.
        """
        self.db = db
        self.gateway = gateway

    async def search(
        self,
        workspace_id: str,
        query: str,
        kinds: list[str] | None = None,
        top_k: int = 20,
    ) -> list[FileSearchHit]:
        query = (query or "").strip()
        if not query:
            return []

        # 1. Semantic — only if a gateway is available
        semantic: dict[str, tuple[float, str]] = {}
        if self.gateway is not None:
            try:
                vectors = await self.gateway.embed_batch_limited(
                    [query], workspace_id=workspace_id
                )
                if vectors:
                    semantic = await self._semantic(workspace_id, vectors[0], kinds, top_k)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Semantic search failed; ILIKE-only: %s", exc)

        # 2. Keyword (covers brand-new files where the AI pipeline hasn't run yet)
        keyword = await self._keyword(workspace_id, query, kinds, top_k)

        # 3. Merge
        merged: dict[str, tuple[float, str]] = {}
        for mid, (score, hl) in semantic.items():
            merged[mid] = (score, hl)
        for mid, (kw_score, kw_hl) in keyword.items():
            existing = merged.get(mid)
            blended = kw_score * 0.6
            if existing is None or blended > existing[0]:
                merged[mid] = (max(existing[0] if existing else 0.0, blended), kw_hl)

        if not merged:
            return []

        # 4. Hydrate metadata rows
        ids_sorted = sorted(merged.keys(), key=lambda m: merged[m][0], reverse=True)[:top_k]
        meta_rows = list(
            (
                await self.db.execute(
                    select(FileMetadata).where(
                        FileMetadata.id.in_(ids_sorted),
                        FileMetadata.workspace_id == workspace_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        meta_by_id = {str(m.id): m for m in meta_rows}

        # 5. Resolve source rows in batches per source type to avoid N+1.
        source_files: dict[str, dict[str, _SourceRow]] = await self._fetch_source_rows(meta_rows)

        # 6. Assemble hits
        out: list[FileSearchHit] = []
        for mid in ids_sorted:
            meta = meta_by_id.get(mid)
            if meta is None:
                continue
            score, highlight = merged[mid]
            sf = source_files.get(meta.source_type, {}).get(str(meta.source_id))
            if sf is None:
                # Source row deleted but file_metadata lingers — skip silently.
                continue
            out.append(
                FileSearchHit(
                    metadata_id=str(meta.id),
                    source_type=meta.source_type,
                    source_id=str(meta.source_id),
                    workspace_id=str(meta.workspace_id),
                    file_name=sf.file_name,
                    file_url=sf.file_url,
                    content_type=sf.content_type,
                    ai_summary=meta.ai_summary,
                    ai_tags=list(meta.ai_tags or []),
                    ai_categories=list(meta.ai_categories or []),
                    ai_status=meta.ai_status,
                    score=score,
                    highlights=[highlight] if highlight else [],
                )
            )
        return out

    # ─── internals ─────────────────────────────────────────────────────────
    async def _semantic(
        self,
        workspace_id: str,
        query_vec: list[float],
        kinds: list[str] | None,
        top_k: int,
    ) -> dict[str, tuple[float, str]]:
        distance = FileEmbedding.embedding.cosine_distance(query_vec)
        stmt = (
            select(
                FileMetadata.id.label("metadata_id"),
                FileEmbedding.chunk_text.label("chunk_text"),
                distance.label("dist"),
            )
            .join(FileMetadata, FileMetadata.id == FileEmbedding.metadata_id)
            .where(
                FileMetadata.workspace_id == workspace_id,
            )
            .order_by(distance.asc())
            .limit(top_k * 4)
        )
        if kinds:
            stmt = stmt.where(FileMetadata.source_type.in_(kinds))
        rows = (await self.db.execute(stmt)).all()
        out: dict[str, tuple[float, str]] = {}
        for row in rows:
            mid = str(row.metadata_id)
            score = max(0.0, 1.0 - float(row.dist) / 2.0)
            existing = out.get(mid)
            if existing is None or score > existing[0]:
                out[mid] = (score, row.chunk_text or "")
        return out

    async def _keyword(
        self,
        workspace_id: str,
        query: str,
        kinds: list[str] | None,
        top_k: int,
    ) -> dict[str, tuple[float, str]]:
        ilike = f"%{query}%"
        # ai_summary lives on file_metadata; file_name lives per-source. We
        # do two queries: one for ai_summary hits (any source), and one for
        # file_name hits (UNION across sources). Both feed the same merged
        # dict.
        out: dict[str, tuple[float, str]] = {}

        # ai_summary
        meta_stmt = (
            select(FileMetadata)
            .where(
                FileMetadata.workspace_id == workspace_id,
                FileMetadata.ai_summary.ilike(ilike),
            )
            .limit(top_k)
        )
        if kinds:
            meta_stmt = meta_stmt.where(FileMetadata.source_type.in_(kinds))
        for m in (await self.db.execute(meta_stmt)).scalars().all():
            highlight = (m.ai_summary or "")[:180]
            out[str(m.id)] = (0.5, highlight)

        # file_name across sources via UNION
        file_name_hits = await self._file_name_matches(workspace_id, query, kinds, top_k)
        for mid, (score, hl) in file_name_hits.items():
            existing = out.get(mid)
            if existing is None or score > existing[0]:
                out[mid] = (max(existing[0] if existing else 0.0, score), hl)
        return out

    async def _file_name_matches(
        self,
        workspace_id: str,
        query: str,
        kinds: list[str] | None,
        top_k: int,
    ) -> dict[str, tuple[float, str]]:
        ilike = f"%{query}%"
        out: dict[str, tuple[float, str]] = {}

        async def _scan(source_type: str, source_table, name_col, source_id_col, where=None):
            stmt = (
                select(FileMetadata, name_col)
                .select_from(source_table)
                .join(
                    FileMetadata,
                    (FileMetadata.source_type == source_type)
                    & (FileMetadata.source_id == source_id_col),
                )
                .where(
                    FileMetadata.workspace_id == workspace_id,
                    name_col.ilike(ilike),
                )
                .limit(top_k)
            )
            if where is not None:
                stmt = stmt.where(where)
            for m, name in (await self.db.execute(stmt)).all():
                out[str(m.id)] = (0.5, str(name))

        kind_set = set(kinds) if kinds else set()

        if not kinds or SOURCE_DRIVE_FILE in kind_set:
            await _scan(
                SOURCE_DRIVE_FILE,
                DriveFile,
                DriveFile.file_name,
                DriveFile.id,
                where=DriveFile.deleted_at.is_(None),
            )
        if not kinds or SOURCE_TASK_ATTACHMENT in kind_set:
            await _scan(
                SOURCE_TASK_ATTACHMENT,
                TaskAttachment,
                TaskAttachment.file_name,
                TaskAttachment.id,
            )
        if not kinds or SOURCE_COMPLIANCE_DOCUMENT in kind_set:
            await _scan(
                SOURCE_COMPLIANCE_DOCUMENT,
                ComplianceDocument,
                ComplianceDocument.name,
                ComplianceDocument.id,
                where=ComplianceDocument.deleted_at.is_(None),
            )
        return out

    async def _fetch_source_rows(
        self, meta_rows: list[FileMetadata]
    ) -> dict[str, dict[str, "_SourceRow"]]:
        """Batch-load the source row for every hit, grouped by source_type."""
        by_type: dict[str, list[str]] = {}
        for m in meta_rows:
            by_type.setdefault(m.source_type, []).append(str(m.source_id))

        out: dict[str, dict[str, _SourceRow]] = {}
        if SOURCE_DRIVE_FILE in by_type:
            ids = by_type[SOURCE_DRIVE_FILE]
            rows = (
                await self.db.execute(
                    select(DriveFile).where(DriveFile.id.in_(ids))
                )
            ).scalars().all()
            out[SOURCE_DRIVE_FILE] = {
                str(r.id): _SourceRow(
                    file_name=r.file_name,
                    file_url=r.file_url,
                    content_type=r.content_type,
                )
                for r in rows
            }

        if SOURCE_TASK_ATTACHMENT in by_type:
            ids = by_type[SOURCE_TASK_ATTACHMENT]
            rows = (
                await self.db.execute(
                    select(TaskAttachment).where(TaskAttachment.id.in_(ids))
                )
            ).scalars().all()
            out[SOURCE_TASK_ATTACHMENT] = {
                str(r.id): _SourceRow(
                    file_name=r.file_name,
                    file_url=r.file_url,
                    content_type=r.content_type,
                )
                for r in rows
            }

        if SOURCE_COMPLIANCE_DOCUMENT in by_type:
            ids = by_type[SOURCE_COMPLIANCE_DOCUMENT]
            rows = (
                await self.db.execute(
                    select(ComplianceDocument).where(ComplianceDocument.id.in_(ids))
                )
            ).scalars().all()
            out[SOURCE_COMPLIANCE_DOCUMENT] = {
                str(r.id): _SourceRow(
                    file_name=r.name,
                    file_url=None,  # Compliance docs use file_key — frontend hits download endpoint.
                    content_type=r.mime_type,
                )
                for r in rows
            }

        return out


@dataclass
class _SourceRow:
    file_name: str
    file_url: str | None
    content_type: str | None
