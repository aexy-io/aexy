"""Deprecated shim — use `aexy.services.file_ai_pipeline` instead.

The Drive-specific pipeline has been generalised into a polymorphic one
that handles every file source (drive_file, task_attachment,
compliance_document). This module re-exports the new entry point with a
Drive-id-only signature so any pre-existing callers keep working for one
release. New code should call `file_ai_pipeline.run_pipeline(db,
source_type, source_id, gateway)` directly.
"""

from __future__ import annotations

import warnings

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.gateway import LLMGateway
from aexy.models.file_metadata import SOURCE_DRIVE_FILE
from aexy.services.file_ai_pipeline import (
    PipelineResult,
    run_pipeline as _run_pipeline,
)
from aexy.services.file_ai_pipeline import _annotate_video as _annotate_video_inner  # noqa: F401
from aexy.services.file_metadata_service import resolve as _resolve  # noqa: F401

__all__ = ["run_pipeline", "PipelineResult"]


async def run_pipeline(
    db: AsyncSession, file_id: str, gateway: LLMGateway
) -> PipelineResult:
    """Drive-id-only signature kept for backwards compatibility."""
    warnings.warn(
        "drive_ai_pipeline.run_pipeline is deprecated; "
        "use file_ai_pipeline.run_pipeline(db, source_type, source_id, gateway).",
        DeprecationWarning,
        stacklevel=2,
    )
    return await _run_pipeline(db, SOURCE_DRIVE_FILE, file_id, gateway)
