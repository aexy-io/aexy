"""Drive (collaborative file storage) models.

A Drive is a per-workspace tree of files and folders backed by S3-compatible
storage. AI metadata (summary, tags, categories, embeddings, video
annotations) lives on the polymorphic `file_metadata` row keyed by
`(source_type='drive_file', source_id=DriveFile.id)`. See
`models/file_metadata.py`.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.documentation import DocumentSpace


# File kind constants — informs UI rendering (icon, preview, AI pipeline branch).
KIND_FILE = "file"
KIND_FOLDER = "folder"
KIND_IMAGE = "image"
KIND_VIDEO = "video"
KIND_AUDIO = "audio"
KIND_PDF = "pdf"
KIND_DOC = "doc"


class DriveFile(Base):
    """A file or folder in a workspace's Drive.

    Folders are rows with `kind="folder"` and a NULL `file_url`. The hierarchy
    is encoded via the self-referencing `parent_id` foreign key.
    """

    __tablename__ = "drive_files"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("drive_files.id", ondelete="CASCADE"),
        nullable=True,
    )
    space_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("document_spaces.id", ondelete="SET NULL"),
        nullable=True,
    )

    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default=KIND_FILE)

    uploaded_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    uploaded_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")
    parent: Mapped["DriveFile | None"] = relationship(
        "DriveFile", remote_side="DriveFile.id", back_populates="children"
    )
    children: Mapped[list["DriveFile"]] = relationship(
        "DriveFile", back_populates="parent", cascade="all, delete-orphan"
    )
    space: Mapped["DocumentSpace | None"] = relationship(
        "DocumentSpace", lazy="selectin"
    )

    __table_args__ = (
        Index(
            "ix_drive_files_workspace_parent",
            "workspace_id",
            "parent_id",
            postgresql_where="deleted_at IS NULL",
        ),
        Index("ix_drive_files_workspace_kind", "workspace_id", "kind"),
        Index("ix_drive_files_uploaded_by", "uploaded_by_id"),
    )


class SmartView(Base):
    """A virtual filter overlay that auto-groups files by AI metadata.

    Smart Views never move files. They store a `filter_query` JSONB document
    (e.g. `{"all_tags": ["invoice"]}`) which the drive service translates to
    a Postgres GIN-indexed query against `file_metadata.ai_tags`.
    """

    __tablename__ = "drive_smart_views"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    filter_query: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
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

    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    created_by: Mapped["Developer | None"] = relationship(
        "Developer", lazy="selectin"
    )
