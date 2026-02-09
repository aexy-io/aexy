"""Compliance document models for the Document Center.

This module provides models for:
- ComplianceFolder (hierarchical folder organization)
- ComplianceDocument (file metadata and S3 references)
- ComplianceDocumentTag (tagging for cross-document filtering)
- ComplianceDocumentLink (polymorphic links to other entities)
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, BigInteger, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class ComplianceDocumentStatus(str, Enum):
    """Status of a compliance document."""
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class ComplianceEntityType(str, Enum):
    """Entity types that can be linked to compliance documents."""
    REMINDER = "reminder"
    REMINDER_INSTANCE = "reminder_instance"
    CERTIFICATION = "certification"
    TRAINING = "training"
    CONTROL = "control"


class ComplianceDocumentLinkType(str, Enum):
    """Types of links between documents and entities."""
    EVIDENCE = "evidence"
    REFERENCE = "reference"
    ATTACHMENT = "attachment"


class ComplianceFolder(Base):
    """Hierarchical folder for organizing compliance documents."""

    __tablename__ = "compliance_folders"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("compliance_folders.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str] = mapped_column(Text, nullable=False, default="/")
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    children: Mapped[list["ComplianceFolder"]] = relationship(
        "ComplianceFolder", back_populates="parent", cascade="all, delete-orphan"
    )
    parent: Mapped["ComplianceFolder | None"] = relationship(
        "ComplianceFolder", back_populates="children", remote_side=[id]
    )
    documents: Mapped[list["ComplianceDocument"]] = relationship(
        "ComplianceDocument", back_populates="folder"
    )


class ComplianceDocument(Base):
    """Compliance document file metadata."""

    __tablename__ = "compliance_documents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    folder_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("compliance_folders.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ComplianceDocumentStatus.ACTIVE.value
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    uploaded_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    folder: Mapped["ComplianceFolder | None"] = relationship(
        "ComplianceFolder", back_populates="documents"
    )
    tags: Mapped[list["ComplianceDocumentTag"]] = relationship(
        "ComplianceDocumentTag", back_populates="document", cascade="all, delete-orphan"
    )
    links: Mapped[list["ComplianceDocumentLink"]] = relationship(
        "ComplianceDocumentLink", back_populates="document", cascade="all, delete-orphan"
    )


class ComplianceDocumentTag(Base):
    """Tag associated with a compliance document."""

    __tablename__ = "compliance_document_tags"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("compliance_documents.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    tag: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    document: Mapped["ComplianceDocument"] = relationship(
        "ComplianceDocument", back_populates="tags"
    )


class ComplianceDocumentLink(Base):
    """Polymorphic link between a document and a compliance entity."""

    __tablename__ = "compliance_document_links"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("compliance_documents.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    link_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ComplianceDocumentLinkType.EVIDENCE.value
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    linked_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    document: Mapped["ComplianceDocument"] = relationship(
        "ComplianceDocument", back_populates="links"
    )
