"""Temporal activities for knowledge graph extraction and maintenance.

Replaces: aexy.processing.knowledge_graph_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class ExtractKnowledgeInput:
    document_id: str
    developer_id: str
    workspace_id: str


@dataclass
class RebuildWorkspaceGraphInput:
    workspace_id: str
    developer_id: str


@dataclass
class UpdateDocumentRelationshipsInput:
    workspace_id: str


@dataclass
class CleanupOrphanedEntitiesInput:
    workspace_id: str


@dataclass
class ScheduleIncrementalExtractionInput:
    workspace_id: str
    document_id: str
    developer_id: str
    delay_seconds: int = 300


@activity.defn
async def extract_knowledge_from_document(input: ExtractKnowledgeInput) -> dict[str, Any]:
    """Extract knowledge entities from a single document."""
    logger.info(f"Extracting knowledge from document {input.document_id}")

    from aexy.services.knowledge_extraction_service import KnowledgeExtractionService

    async with async_session_maker() as db:
        service = KnowledgeExtractionService(db)
        job = await service.run_incremental_extraction(
            workspace_id=input.workspace_id,
            document_id=input.document_id,
            developer_id=input.developer_id,
        )
        return {
            "job_id": str(job.id),
            "status": job.status,
            "entities_found": job.entities_found,
            "relationships_found": job.relationships_found,
        }


@activity.defn
async def rebuild_workspace_graph(input: RebuildWorkspaceGraphInput) -> dict[str, Any]:
    """Rebuild the entire knowledge graph for a workspace."""
    logger.info(f"Rebuilding knowledge graph for workspace {input.workspace_id}")
    activity.heartbeat("Starting graph rebuild")

    from aexy.services.knowledge_extraction_service import KnowledgeExtractionService

    async with async_session_maker() as db:
        service = KnowledgeExtractionService(db)
        job = await service.run_full_extraction(
            workspace_id=input.workspace_id,
            developer_id=input.developer_id,
        )
        return {
            "job_id": str(job.id),
            "status": job.status,
            "entities_found": job.entities_found,
            "relationships_found": job.relationships_found,
            "documents_processed": job.documents_processed,
        }


@activity.defn
async def update_document_relationships(input: UpdateDocumentRelationshipsInput) -> dict[str, Any]:
    """Update document-to-document relationships based on shared entities."""
    logger.info(f"Updating document relationships for workspace {input.workspace_id}")

    from datetime import datetime, timezone
    from aexy.services.knowledge_extraction_service import KnowledgeExtractionService

    async with async_session_maker() as db:
        service = KnowledgeExtractionService(db)
        relationships = await service.build_document_relationships(input.workspace_id)
        return {
            "workspace_id": input.workspace_id,
            "relationships_created": len(relationships),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@activity.defn
async def cleanup_orphaned_entities(input: CleanupOrphanedEntitiesInput) -> dict[str, Any]:
    """Clean up entities that no longer have any document mentions."""
    logger.info(f"Cleaning up orphaned entities for workspace {input.workspace_id}")

    from aexy.processing.knowledge_graph_tasks import _cleanup_orphaned_entities
    return await _cleanup_orphaned_entities(input.workspace_id)


@activity.defn
async def schedule_incremental_extraction(input: ScheduleIncrementalExtractionInput) -> dict[str, Any]:
    """Schedule an incremental extraction with debounce via Redis."""
    logger.info(f"Scheduling incremental extraction for document {input.document_id}")

    import redis as redis_lib
    from aexy.core.config import settings
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    redis_client = redis_lib.from_url(settings.redis_url)
    debounce_key = f"kg:debounce:{input.workspace_id}:{input.document_id}"
    redis_client.setex(debounce_key, input.delay_seconds, input.developer_id)

    # Schedule the actual extraction
    await dispatch(
        "extract_knowledge_from_document",
        ExtractKnowledgeInput(
            document_id=input.document_id,
            developer_id=input.developer_id,
            workspace_id=input.workspace_id,
        ),
        task_queue=TaskQueue.ANALYSIS,
    )

    return {"status": "scheduled", "delay_seconds": input.delay_seconds}
