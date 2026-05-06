"""Shared Pydantic schemas for the polymorphic file AI metadata layer."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FileAIMetadata(BaseModel):
    """The AI-generated metadata block exposed on every file response.

    Embedded into `TaskAttachmentResponse`, `ComplianceDocumentResponse`, and
    `DriveFileResponse` so frontend code reads the same shape regardless of
    where the file lives.
    """

    model_config = ConfigDict(from_attributes=True)

    metadata_id: str | None = None
    source_type: str
    source_id: str
    ai_status: str  # pending | processing | done | failed
    ai_error: str | None = None
    ai_summary: str | None = None
    ai_tags: list[str] = Field(default_factory=list)
    ai_categories: list[str] = Field(default_factory=list)
    ai_processed_at: datetime | None = None


def metadata_to_ai_response(
    source_type: str, source_id: str, row: object | None
) -> FileAIMetadata:
    """Build a `FileAIMetadata` for a response, even when no row exists yet
    (so the frontend always sees a consistent shape with `ai_status='pending'`).
    """
    if row is None:
        return FileAIMetadata(
            metadata_id=None,
            source_type=source_type,
            source_id=str(source_id),
            ai_status="pending",
            ai_tags=[],
            ai_categories=[],
        )
    return FileAIMetadata(
        metadata_id=str(getattr(row, "id")),
        source_type=getattr(row, "source_type"),
        source_id=str(getattr(row, "source_id")),
        ai_status=getattr(row, "ai_status"),
        ai_error=getattr(row, "ai_error"),
        ai_summary=getattr(row, "ai_summary"),
        ai_tags=list(getattr(row, "ai_tags") or []),
        ai_categories=list(getattr(row, "ai_categories") or []),
        ai_processed_at=getattr(row, "ai_processed_at"),
    )
