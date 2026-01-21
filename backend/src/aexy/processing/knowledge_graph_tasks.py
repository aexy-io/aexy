"""Celery tasks for knowledge graph extraction and maintenance."""

import asyncio
import logging
from typing import Any

from celery import shared_task

from aexy.llm.base import LLMRateLimitError
from aexy.processing.rate_limited_task import RateLimitedTask

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async coroutine in a sync context.

    Always creates a new event loop to avoid conflicts between
    concurrent Celery tasks sharing the same worker process.
    """
    from aexy.core.database import get_engine

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        # Dispose all pooled connections before closing the loop.
        try:
            engine = get_engine()
            loop.run_until_complete(engine.dispose())
        except Exception:
            pass
        loop.close()


@shared_task(bind=True, base=RateLimitedTask, max_retries=5)
def extract_knowledge_from_document_task(
    self,
    document_id: str,
    developer_id: str,
    workspace_id: str,
) -> dict[str, Any]:
    """Extract knowledge entities from a single document.

    Args:
        document_id: Document ID to extract from.
        developer_id: Developer who triggered the extraction.
        workspace_id: Workspace ID.

    Returns:
        Extraction result dict.
    """
    logger.info(f"Extracting knowledge from document {document_id}")

    try:
        result = run_async(_extract_knowledge_from_document(
            document_id=document_id,
            developer_id=developer_id,
            workspace_id=workspace_id,
        ))
        return result
    except LLMRateLimitError as exc:
        logger.warning(f"Rate limit hit for knowledge extraction: {exc.message}")
        raise self.retry(exc=exc, countdown=exc.wait_seconds)
    except Exception as exc:
        logger.error(f"Knowledge extraction failed: {exc}")
        raise self.retry(exc=exc)


async def _extract_knowledge_from_document(
    document_id: str,
    developer_id: str,
    workspace_id: str,
) -> dict[str, Any]:
    """Async implementation of document knowledge extraction."""
    from aexy.core.database import async_session_maker
    from aexy.services.knowledge_extraction_service import KnowledgeExtractionService

    async with async_session_maker() as db:
        service = KnowledgeExtractionService(db)

        # Run incremental extraction
        job = await service.run_incremental_extraction(
            workspace_id=workspace_id,
            document_id=document_id,
            developer_id=developer_id,
        )

        return {
            "job_id": str(job.id),
            "status": job.status,
            "entities_found": job.entities_found,
            "relationships_found": job.relationships_found,
            "document_id": document_id,
            "workspace_id": workspace_id,
        }


@shared_task(bind=True, base=RateLimitedTask, max_retries=3)
def rebuild_workspace_graph_task(
    self,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    """Rebuild the entire knowledge graph for a workspace.

    Args:
        workspace_id: Workspace ID to rebuild.
        developer_id: Developer who triggered the rebuild.

    Returns:
        Rebuild result dict.
    """
    logger.info(f"Rebuilding knowledge graph for workspace {workspace_id}")

    try:
        result = run_async(_rebuild_workspace_graph(
            workspace_id=workspace_id,
            developer_id=developer_id,
        ))
        return result
    except LLMRateLimitError as exc:
        logger.warning(f"Rate limit hit for graph rebuild: {exc.message}")
        raise self.retry(exc=exc, countdown=exc.wait_seconds)
    except Exception as exc:
        logger.error(f"Graph rebuild failed: {exc}")
        raise self.retry(exc=exc)


async def _rebuild_workspace_graph(
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    """Async implementation of full workspace graph rebuild."""
    from aexy.core.database import async_session_maker
    from aexy.services.knowledge_extraction_service import KnowledgeExtractionService

    async with async_session_maker() as db:
        service = KnowledgeExtractionService(db)

        # Run full extraction
        job = await service.run_full_extraction(
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

        return {
            "job_id": str(job.id),
            "status": job.status,
            "entities_found": job.entities_found,
            "relationships_found": job.relationships_found,
            "documents_processed": job.documents_processed,
            "workspace_id": workspace_id,
        }


@shared_task
def update_document_relationships_task(workspace_id: str) -> dict[str, Any]:
    """Update document-to-document relationships based on shared entities.

    Args:
        workspace_id: Workspace ID to update.

    Returns:
        Update result dict.
    """
    logger.info(f"Updating document relationships for workspace {workspace_id}")

    try:
        result = run_async(_update_document_relationships(workspace_id))
        return result
    except Exception as exc:
        logger.error(f"Document relationship update failed: {exc}")
        raise


async def _update_document_relationships(workspace_id: str) -> dict[str, Any]:
    """Async implementation of document relationship update."""
    from datetime import datetime, timezone

    from aexy.core.database import async_session_maker
    from aexy.services.knowledge_extraction_service import KnowledgeExtractionService

    async with async_session_maker() as db:
        service = KnowledgeExtractionService(db)

        relationships = await service.build_document_relationships(workspace_id)

        return {
            "workspace_id": workspace_id,
            "relationships_created": len(relationships),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@shared_task
def cleanup_orphaned_entities_task(workspace_id: str) -> dict[str, Any]:
    """Clean up entities that no longer have any document mentions.

    Args:
        workspace_id: Workspace ID to clean.

    Returns:
        Cleanup result dict.
    """
    logger.info(f"Cleaning up orphaned entities for workspace {workspace_id}")

    try:
        result = run_async(_cleanup_orphaned_entities(workspace_id))
        return result
    except Exception as exc:
        logger.error(f"Orphaned entity cleanup failed: {exc}")
        raise


async def _cleanup_orphaned_entities(workspace_id: str) -> dict[str, Any]:
    """Async implementation of orphaned entity cleanup."""
    from datetime import datetime, timezone

    from sqlalchemy import delete, select
    from sqlalchemy.sql import func

    from aexy.core.database import async_session_maker
    from aexy.models.knowledge_graph import (
        KnowledgeEntity,
        KnowledgeEntityMention,
        KnowledgeRelationship,
    )

    async with async_session_maker() as db:
        # Find entities with no mentions
        subquery = select(KnowledgeEntityMention.entity_id).distinct().subquery()

        orphan_stmt = select(KnowledgeEntity.id).where(
            KnowledgeEntity.workspace_id == workspace_id,
            ~KnowledgeEntity.id.in_(select(subquery))
        )
        orphan_result = await db.execute(orphan_stmt)
        orphan_ids = [row[0] for row in orphan_result.all()]

        if orphan_ids:
            # Delete relationships involving orphaned entities
            delete_rel_stmt = delete(KnowledgeRelationship).where(
                KnowledgeRelationship.workspace_id == workspace_id,
                (
                    KnowledgeRelationship.source_entity_id.in_(orphan_ids) |
                    KnowledgeRelationship.target_entity_id.in_(orphan_ids)
                )
            )
            await db.execute(delete_rel_stmt)

            # Delete orphaned entities
            delete_entity_stmt = delete(KnowledgeEntity).where(
                KnowledgeEntity.id.in_(orphan_ids)
            )
            await db.execute(delete_entity_stmt)

            await db.commit()

        return {
            "workspace_id": workspace_id,
            "entities_removed": len(orphan_ids),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@shared_task
def schedule_incremental_extraction_task(
    workspace_id: str,
    document_id: str,
    developer_id: str,
    delay_seconds: int = 300,  # 5 minute default debounce
) -> dict[str, Any]:
    """Schedule an incremental extraction with debounce.

    This task can be called multiple times for the same document,
    but only the last call within the delay window will actually execute.

    Args:
        workspace_id: Workspace ID.
        document_id: Document ID.
        developer_id: Developer ID.
        delay_seconds: Debounce delay in seconds.

    Returns:
        Scheduling result.
    """
    import redis
    from aexy.core.config import settings

    # Use Redis to implement debounce
    redis_client = redis.from_url(settings.redis_url)
    debounce_key = f"kg:debounce:{workspace_id}:{document_id}"

    # Set the key with expiration - only extract after debounce period
    redis_client.setex(debounce_key, delay_seconds, developer_id)

    # Schedule the actual extraction to run after the delay
    extract_knowledge_from_document_task.apply_async(
        kwargs={
            "document_id": document_id,
            "developer_id": developer_id,
            "workspace_id": workspace_id,
        },
        countdown=delay_seconds,
    )

    return {
        "status": "scheduled",
        "document_id": document_id,
        "workspace_id": workspace_id,
        "delay_seconds": delay_seconds,
    }
