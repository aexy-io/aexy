"""Semantic search over documents.

Documents were the one body of text in the workspace that keyword search
reached and semantic search did not. `FileSearchService` already ran a hybrid
keyword + pgvector search over Drive files, task attachments and compliance
documents; documents were simply never registered as a source, so "what did we
decide about the refund window" found a PDF attachment and missed the page that
actually recorded the decision.

Two things this deliberately does not do:

* **It does not embed on every save.** The collaborative editor flushes a
  document every few seconds while somebody is typing in it. Embedding is a
  paid API call per chunk; `content_sha` is what stops one person's afternoon
  of writing from becoming several hundred of them.

* **It does not search without a caller.** `search` takes an access predicate
  and applies it in SQL. Semantic search that ranked documents the caller
  cannot open would be the keyword-search leak with a better algorithm.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import ColumnElement, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.gateway import LLMGateway
from aexy.models.documentation import Document, DocumentEmbedding

logger = logging.getLogger(__name__)

# Matching `file_ai_pipeline`, so a workspace's two embedding stores chunk the
# same way and a result from one is comparable with a result from the other.
CHUNK_SIZE_CHARS = 4000
CHUNK_OVERLAP_CHARS = 200
EMBEDDING_BATCH_SIZE = 16

#: Beyond this a "document" is an import artefact or a runaway generation, and
#: embedding all of it costs real money for results nobody reads.
MAX_CHARS_PER_DOCUMENT = 400_000


@dataclass(slots=True)
class SemanticHit:
    document_id: str
    chunk_text: str
    distance: float

    @property
    def score(self) -> float:
        """Cosine distance as a similarity in [0, 1], so it can be blended with
        a keyword rank rather than compared to one."""
        return max(0.0, 1.0 - self.distance)


def chunk_text(text: str) -> list[str]:
    """Overlapping windows, split on whitespace where possible.

    The same algorithm as `file_ai_pipeline._chunk_text`. Duplicated rather than
    imported because that module pulls in the whole Drive/video pipeline —
    ffmpeg probing included — and this one runs on the document save path.
    """
    text = (text or "").strip()
    if not text:
        return []

    chunks: list[str] = []
    i = 0
    while i < len(text):
        end = min(i + CHUNK_SIZE_CHARS, len(text))
        if end < len(text):
            boundary = text.rfind(" ", i + CHUNK_SIZE_CHARS // 2, end)
            if boundary != -1:
                end = boundary
        chunks.append(text[i:end].strip())
        if end >= len(text):
            break
        i = max(i + 1, end - CHUNK_OVERLAP_CHARS)
    return [c for c in chunks if c]


class DocumentEmbeddingService:
    def __init__(self, db: AsyncSession, gateway: LLMGateway | None):
        """`gateway` is optional. With no embedding provider configured the
        service degrades to a no-op and search falls back to keywords — the
        same contract `FileSearchService` already has, so a deployment without
        LLM keys keeps working rather than erroring on every save."""
        self.db = db
        self.gateway = gateway

    # ------------------------------------------------------------------

    async def index_document(
        self, document: Document, *, force: bool = False
    ) -> int:
        """(Re)build this document's chunks. Returns how many were written."""
        if self.gateway is None:
            return 0
        if document.deleted_at is not None:
            await self.forget(str(document.id))
            return 0

        from aexy.services.proposed_edits_service import current_document_sha

        sha = current_document_sha(document)
        if sha is None:
            return 0

        if not force:
            existing_sha = (
                await self.db.execute(
                    select(DocumentEmbedding.content_sha)
                    .where(DocumentEmbedding.document_id == document.id)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing_sha == sha:
                # The body has not moved since the last index. This is the
                # common case while a document is being edited collaboratively,
                # and skipping it here is what keeps the flush loop cheap.
                return 0

        text = (document.content_text or "")[:MAX_CHARS_PER_DOCUMENT]
        chunks = chunk_text(f"{document.title}\n\n{text}")
        if not chunks:
            await self.forget(str(document.id))
            return 0

        await self.forget(str(document.id))

        model_name = self.gateway.embeddings.model_name
        written = 0
        for start in range(0, len(chunks), EMBEDDING_BATCH_SIZE):
            batch = chunks[start : start + EMBEDDING_BATCH_SIZE]
            try:
                vectors = await self.gateway.embed_batch_limited(
                    batch, workspace_id=str(document.workspace_id)
                )
            except Exception:
                # A failed batch leaves the document partially indexed, which
                # is why `content_sha` is written per row: the next save sees a
                # sha that does not match and rebuilds the lot.
                logger.warning(
                    "could not embed chunks %d-%d of document %s",
                    start,
                    start + len(batch),
                    document.id,
                    exc_info=True,
                )
                break

            for offset, (chunk, vector) in enumerate(
                zip(batch, vectors, strict=False)
            ):
                self.db.add(
                    DocumentEmbedding(
                        document_id=str(document.id),
                        workspace_id=str(document.workspace_id),
                        chunk_index=start + offset,
                        chunk_text=chunk,
                        embedding=vector,
                        embedding_model=model_name,
                        content_sha=sha,
                    )
                )
                written += 1
            await self.db.flush()

        await self.db.commit()
        return written

    async def forget(self, document_id: str) -> None:
        await self.db.execute(
            delete(DocumentEmbedding).where(
                DocumentEmbedding.document_id == document_id
            )
        )

    # ------------------------------------------------------------------

    async def search(
        self,
        workspace_id: str,
        query: str,
        *,
        access_clause: ColumnElement[bool] | None = None,
        limit: int = 20,
    ) -> list[SemanticHit]:
        """Nearest chunks to `query`, restricted to documents the caller may read.

        The join to `documents` is what carries the access predicate. Filtering
        afterwards in Python would let a private document consume slots in the
        result set and turn `limit` into a lie.
        """
        if self.gateway is None:
            return []

        try:
            vectors = await self.gateway.embed_batch_limited(
                [query], workspace_id=workspace_id
            )
        except Exception:
            logger.warning("could not embed search query", exc_info=True)
            return []
        if not vectors:
            return []

        distance = DocumentEmbedding.embedding.cosine_distance(vectors[0])

        # One row per document — its best-matching chunk. Without this a
        # long document with twenty near-identical paragraphs fills the whole
        # result page with itself.
        stmt = (
            select(
                DocumentEmbedding.document_id,
                func.min(distance).label("distance"),
            )
            .join(Document, Document.id == DocumentEmbedding.document_id)
            .where(
                DocumentEmbedding.workspace_id == workspace_id,
                Document.deleted_at.is_(None),
                Document.is_template.is_(False),
            )
            .group_by(DocumentEmbedding.document_id)
            .order_by(func.min(distance))
            .limit(limit)
        )
        if access_clause is not None:
            stmt = stmt.where(access_clause)

        rows = (await self.db.execute(stmt)).all()
        if not rows:
            return []

        # Fetch the winning chunk text for each document, for the snippet.
        best: dict[str, float] = {str(r[0]): float(r[1]) for r in rows}
        chunk_rows = (
            await self.db.execute(
                select(
                    DocumentEmbedding.document_id,
                    DocumentEmbedding.chunk_text,
                    distance.label("distance"),
                ).where(DocumentEmbedding.document_id.in_(list(best)))
            )
        ).all()

        snippets: dict[str, tuple[str, float]] = {}
        for document_id, text, dist in chunk_rows:
            key = str(document_id)
            current = snippets.get(key)
            if current is None or float(dist) < current[1]:
                snippets[key] = (text, float(dist))

        return [
            SemanticHit(
                document_id=document_id,
                chunk_text=snippets.get(document_id, ("", 0.0))[0],
                distance=score,
            )
            for document_id, score in sorted(best.items(), key=lambda kv: kv[1])
        ]
