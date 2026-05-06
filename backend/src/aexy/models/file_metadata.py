"""Polymorphic file AI metadata.

A single `file_metadata` row exists per file regardless of where the file
itself lives (Drive, task attachment, compliance document, …). The pair
`(source_type, source_id)` is unique and lets the polymorphic resolver
route back to the original row. `file_embeddings` and `video_annotations`
both foreign-key to `file_metadata.id`.

Adding a fourth source type is one line in the source-type constants plus
a resolver registration; no schema change needed.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


# ─── Source types ──────────────────────────────────────────────────────────
SOURCE_DRIVE_FILE = "drive_file"
SOURCE_TASK_ATTACHMENT = "task_attachment"
SOURCE_COMPLIANCE_DOCUMENT = "compliance_document"

ALL_SOURCE_TYPES = (
    SOURCE_DRIVE_FILE,
    SOURCE_TASK_ATTACHMENT,
    SOURCE_COMPLIANCE_DOCUMENT,
)

# AI status pipeline values
AI_STATUS_PENDING = "pending"
AI_STATUS_PROCESSING = "processing"
AI_STATUS_DONE = "done"
AI_STATUS_FAILED = "failed"


class FileMetadata(Base):
    """One row per file across the platform — regardless of source."""

    __tablename__ = "file_metadata"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )

    # Polymorphic key — (source_type, source_id) uniquely identifies the file.
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)

    # Denormalised so workspace-scope queries don't have to join through
    # the source table (which differs per source).
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    ai_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=AI_STATUS_PENDING
    )
    ai_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    ai_categories: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    ai_processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    embeddings: Mapped[list["FileEmbedding"]] = relationship(
        "FileEmbedding", back_populates="metadata_row", cascade="all, delete-orphan"
    )
    annotations: Mapped[list["VideoAnnotation"]] = relationship(
        "VideoAnnotation",
        back_populates="metadata_row",
        cascade="all, delete-orphan",
        order_by="VideoAnnotation.t_start_ms",
    )

    __table_args__ = (
        UniqueConstraint("source_type", "source_id", name="uq_file_metadata_source"),
        Index("ix_file_metadata_workspace", "workspace_id"),
        Index(
            "ix_file_metadata_pending",
            "ai_status",
            postgresql_where="ai_status IN ('pending', 'processing')",
        ),
    )


class FileEmbedding(Base):
    """Chunk-level embeddings for semantic search.

    Vector dim 1024 keeps OpenRouter `text-embedding-3-large@1024` and
    Ollama `bge-m3` interchangeable.
    """

    __tablename__ = "file_embeddings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    metadata_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("file_metadata.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    metadata_row: Mapped[FileMetadata] = relationship(
        FileMetadata, back_populates="embeddings"
    )

    __table_args__ = (
        UniqueConstraint("metadata_id", "chunk_index", name="uq_file_embedding_chunk"),
    )


class VideoAnnotation(Base):
    """Timecoded annotations on a video file (Qwen-VL or manual).

    Re-keyed from the previous `drive_video_annotations.file_id` to
    `file_metadata.id` so non-Drive videos (e.g. task attachments) can also
    carry annotations.
    """

    __tablename__ = "video_annotations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    metadata_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("file_metadata.id", ondelete="CASCADE"),
        nullable=False,
    )
    t_start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    t_end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="qwen")
    bbox: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    metadata_row: Mapped[FileMetadata] = relationship(
        FileMetadata, back_populates="annotations"
    )
    created_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        Index("ix_video_annotations_metadata_time", "metadata_id", "t_start_ms"),
    )
