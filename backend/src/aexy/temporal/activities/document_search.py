"""Background maintenance for the document knowledge base.

Three jobs that must not run on a request:

* **indexing** — embedding a document is a paid API call per chunk, and the
  collaborative editor flushes a document every few seconds while somebody is
  typing in it. Doing it inline would make every keystroke wait on an LLM.
* **version pruning** — `_create_version` writes a full JSONB snapshot of the
  body on every autosave, so an actively edited page accumulates hundreds of
  complete copies of itself.
* **purging the trash** — the only remaining hard delete in the module, kept
  off the request path deliberately so "delete" in the UI can never mean "gone"
  while somebody is still reading the confirmation dialog.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from temporalio import activity

from aexy.core.database import get_async_session
from aexy.models.documentation import DocumentImportJob

logger = logging.getLogger(__name__)

#: How long a trashed document is recoverable. A workspace setting eventually;
#: a constant until there is a settings surface to put it on, because a
#: hard-coded value everyone knows beats a configurable one nobody has set.
DEFAULT_TRASH_RETENTION_DAYS = 30


@dataclass
class IndexDocumentInput:
    document_id: str
    force: bool = False


@dataclass
class ImportJobInput:
    job_id: str


@dataclass
class WorkspaceMaintenanceInput:
    workspace_id: str
    retention_days: int = DEFAULT_TRASH_RETENTION_DAYS


@activity.defn
async def index_document_embeddings(input: IndexDocumentInput) -> dict:
    """Re-embed one document, if its body has actually changed."""
    from aexy.llm.gateway import LLMGateway
    from aexy.models.documentation import Document
    from aexy.services.document_embedding_service import DocumentEmbeddingService

    async with get_async_session() as db:
        document = (
            await db.execute(select(Document).where(Document.id == input.document_id))
        ).scalar_one_or_none()
        if document is None:
            return {"indexed": 0, "reason": "document not found"}

        try:
            gateway = LLMGateway()
        except Exception:
            # No embedding provider configured. Search falls back to keywords,
            # which is the documented degraded mode rather than a failure.
            logger.info("no LLM gateway; skipping document embedding")
            return {"indexed": 0, "reason": "no gateway"}

        written = await DocumentEmbeddingService(db, gateway).index_document(
            document, force=input.force
        )
        return {"indexed": written}


@activity.defn
async def prune_document_versions(input: IndexDocumentInput) -> dict:
    """Collapse a document's autosave history to something readable."""
    from aexy.services.document_service import DocumentService

    async with get_async_session() as db:
        removed = await DocumentService(db).prune_versions(input.document_id)
        return {"pruned": removed}


@activity.defn
async def purge_document_trash(input: WorkspaceMaintenanceInput) -> dict:
    """Permanently remove documents trashed longer ago than the window.

    This is where the module's hard delete lives, and the only place it does.
    """
    from aexy.services.document_service import DocumentService

    async with get_async_session() as db:
        purged = await DocumentService(db).purge_expired(
            input.workspace_id, input.retention_days
        )
        return {"purged": purged}


@activity.defn
async def reindex_workspace_documents(input: WorkspaceMaintenanceInput) -> dict:
    """Embed every document in a workspace that is not up to date.

    For backfilling after this feature ships, and for a workspace that changes
    its embedding model. Walks in id order and commits per document, so a
    failure part-way leaves the work it did rather than rolling it all back.
    """
    from aexy.llm.gateway import LLMGateway
    from aexy.models.documentation import Document
    from aexy.services.document_embedding_service import DocumentEmbeddingService

    indexed = 0
    async with get_async_session() as db:
        try:
            gateway = LLMGateway()
        except Exception:
            return {"indexed": 0, "reason": "no gateway"}

        service = DocumentEmbeddingService(db, gateway)
        documents = (
            (
                await db.execute(
                    select(Document)
                    .where(Document.workspace_id == input.workspace_id)
                    .where(Document.deleted_at.is_(None))
                    .where(Document.is_template.is_(False))
                    .order_by(Document.id)
                )
            )
            .scalars()
            .all()
        )
        for document in documents:
            try:
                indexed += await service.index_document(document)
            except Exception:
                logger.warning(
                    "could not index document %s", document.id, exc_info=True
                )

    return {"indexed": indexed, "documents": len(documents)}


@activity.defn
async def run_document_import(input: ImportJobInput) -> dict:
    """Run one archive import to completion.

    Two passes — see `services/document_import/service.py`. Everything that can
    fail per page is caught there, so this only handles the failures that make
    the whole job impossible: an unreadable archive, storage being down.

    A re-run is safe. `id_map` records what already became a document, so the
    scan creates nothing twice and the convert re-does only what is left.
    """
    from aexy.services.document_import.service import (
        STATUS_FAILED,
        STATUS_IMPORTING,
        STATUS_SCANNING,
        DocumentImportService,
        ImportError_,
    )
    from aexy.services.storage_service import get_storage_service

    async with get_async_session() as db:
        service = DocumentImportService(db)
        job = (
            await db.execute(
                select(DocumentImportJob).where(DocumentImportJob.id == input.job_id)
            )
        ).scalar_one_or_none()
        if job is None:
            return {"error": "job not found"}

        try:
            found = get_storage_service().get_object(job.archive_key)
            if found is None:
                raise ImportError_("The uploaded archive is no longer in storage")
            raw, _content_type = found

            job.status = STATUS_SCANNING
            await db.commit()

            archive, source, pages = service.read_archive(raw)

            id_map = await service.scan(
                job,
                pages,
                workspace_id=str(job.workspace_id),
                space_id=str(job.space_id) if job.space_id else None,
                created_by_id=(
                    str(job.requested_by_id) if job.requested_by_id else None
                ),
            )

            job.status = STATUS_IMPORTING
            await db.commit()

            progress = await service.convert(
                job,
                archive,
                source,
                pages,
                id_map,
                workspace_id=str(job.workspace_id),
            )
            await service.finish(job, progress)

            logger.info(
                "import %s finished: %d imported, %d failed",
                job.id,
                progress.imported,
                progress.failed,
            )
            return {
                "imported": progress.imported,
                "failed": progress.failed,
                "status": job.status,
            }

        except Exception as exc:  # noqa: BLE001
            job.status = STATUS_FAILED
            job.error = str(exc)[:2000]
            await db.commit()
            logger.exception("import %s failed", input.job_id)
            return {"error": str(exc)}
