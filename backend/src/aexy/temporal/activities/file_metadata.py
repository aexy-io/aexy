"""Temporal activities for the polymorphic file AI metadata pipeline.

These activities run for any file source (drive_file, task_attachment,
compliance_document). The actual work lives in
`services.file_ai_pipeline.run_pipeline` so it's testable without a
worker. Backfill iterates over every uncovered file in a workspace and
dispatches per-file jobs at a throttled rate.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from temporalio import activity

from aexy.core.database import async_session_maker
from aexy.models.file_metadata import (
    SOURCE_COMPLIANCE_DOCUMENT,
    SOURCE_DRIVE_FILE,
    SOURCE_TASK_ATTACHMENT,
    FileMetadata,
)

logger = logging.getLogger(__name__)


@dataclass
class ExtractFileMetadataInput:
    source_type: str
    source_id: str


@dataclass
class BackfillWorkspaceInput:
    workspace_id: str
    # Seconds between dispatches — caps LLM cost and rate-limit pressure.
    # Default 6s ≈ 10 files/minute/workspace.
    delay_seconds: float = 6.0
    # Optional cap so a runaway workspace doesn't drain a day's quota.
    max_files: int | None = None


@activity.defn
async def extract_file_ai_metadata(
    input: ExtractFileMetadataInput,
) -> dict[str, Any]:
    """Run the AI pipeline for one file (any source)."""
    from aexy.llm.gateway import get_llm_gateway
    from aexy.services.file_ai_pipeline import run_pipeline

    logger.info(
        "File AI pipeline started for %s:%s", input.source_type, input.source_id
    )
    async with async_session_maker() as session:
        gateway = get_llm_gateway()
        result = await run_pipeline(
            session, input.source_type, input.source_id, gateway
        )
        await session.commit()

    return {
        "metadata_id": result.metadata_id,
        "source_type": result.source_type,
        "source_id": result.source_id,
        "summary": result.summary,
        "tags": result.tags,
        "categories": result.categories,
        "embeddings_count": result.embeddings_count,
        "annotations_count": result.annotations_count,
    }


# ─── Backwards-compatible Drive-only shims ─────────────────────────────────
# Old `extract_drive_file_metadata` callers (migrations + frontend that
# might still queue jobs by the old name) keep working for one release.

@dataclass
class ExtractDriveFileMetadataInput:
    file_id: str


@dataclass
class AnnotateDriveVideoInput:
    file_id: str


@activity.defn
async def extract_drive_file_metadata(
    input: ExtractDriveFileMetadataInput,
) -> dict[str, Any]:
    """Deprecated — forwards to extract_file_ai_metadata for Drive."""
    return await extract_file_ai_metadata(
        ExtractFileMetadataInput(
            source_type=SOURCE_DRIVE_FILE, source_id=input.file_id
        )
    )


@activity.defn
async def annotate_drive_video(input: AnnotateDriveVideoInput) -> dict[str, Any]:
    """Deprecated — forwards to extract_file_ai_metadata for Drive videos."""
    return await extract_file_ai_metadata(
        ExtractFileMetadataInput(
            source_type=SOURCE_DRIVE_FILE, source_id=input.file_id
        )
    )


# ─── Backfill ──────────────────────────────────────────────────────────────
@activity.defn
async def backfill_workspace_file_metadata(
    input: BackfillWorkspaceInput,
) -> dict[str, Any]:
    """Enqueue extract_file_ai_metadata for every file in a workspace that
    doesn't yet have a `file_metadata` row.

    Scans `task_attachments` (joined to `sprint_tasks` for workspace_id) and
    `compliance_documents`. Drive files already enqueue on upload, so they
    are not part of the backfill set unless explicitly missed.

    Heartbeats every dispatch so Temporal's heartbeat-timeout doesn't kill
    long-running workspaces. Dispatches are made to the same ANALYSIS queue
    via the regular `dispatch()` helper.
    """
    from aexy.models.compliance_document import ComplianceDocument
    from aexy.models.sprint import SprintTask, TaskAttachment
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    enqueued = 0
    skipped = 0
    delay = max(0.0, float(input.delay_seconds))
    cap = input.max_files

    async with async_session_maker() as session:
        # Task attachments: join through sprint_tasks for workspace scope.
        ta_stmt = (
            select(TaskAttachment.id)
            .join(SprintTask, SprintTask.id == TaskAttachment.task_id)
            .outerjoin(
                FileMetadata,
                (FileMetadata.source_type == SOURCE_TASK_ATTACHMENT)
                & (FileMetadata.source_id == TaskAttachment.id),
            )
            .where(SprintTask.workspace_id == input.workspace_id)
            .where(FileMetadata.id.is_(None))
        )
        for (attachment_id,) in (await session.execute(ta_stmt)).all():
            if cap is not None and enqueued >= cap:
                break
            try:
                await dispatch(
                    "extract_file_ai_metadata",
                    ExtractFileMetadataInput(
                        source_type=SOURCE_TASK_ATTACHMENT,
                        source_id=str(attachment_id),
                    ),
                    task_queue=TaskQueue.ANALYSIS,
                    workflow_id=f"file-ai-task_attachment-{attachment_id}",
                )
                enqueued += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Backfill skipped task attachment %s: %s", attachment_id, exc
                )
                skipped += 1
            activity.heartbeat(
                {"phase": "task_attachments", "enqueued": enqueued}
            )
            await asyncio.sleep(delay)

        if cap is None or enqueued < cap:
            cd_stmt = (
                select(ComplianceDocument.id)
                .outerjoin(
                    FileMetadata,
                    (FileMetadata.source_type == SOURCE_COMPLIANCE_DOCUMENT)
                    & (FileMetadata.source_id == ComplianceDocument.id),
                )
                .where(ComplianceDocument.workspace_id == input.workspace_id)
                .where(ComplianceDocument.deleted_at.is_(None))
                .where(FileMetadata.id.is_(None))
            )
            for (doc_id,) in (await session.execute(cd_stmt)).all():
                if cap is not None and enqueued >= cap:
                    break
                try:
                    await dispatch(
                        "extract_file_ai_metadata",
                        ExtractFileMetadataInput(
                            source_type=SOURCE_COMPLIANCE_DOCUMENT,
                            source_id=str(doc_id),
                        ),
                        task_queue=TaskQueue.ANALYSIS,
                        workflow_id=f"file-ai-compliance_document-{doc_id}",
                    )
                    enqueued += 1
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Backfill skipped compliance doc %s: %s", doc_id, exc
                    )
                    skipped += 1
                activity.heartbeat(
                    {"phase": "compliance_documents", "enqueued": enqueued}
                )
                await asyncio.sleep(delay)

    return {
        "workspace_id": input.workspace_id,
        "enqueued": enqueued,
        "skipped": skipped,
    }
