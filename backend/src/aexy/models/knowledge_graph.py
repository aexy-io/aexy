"""Knowledge graph models for document entity extraction and relationship mapping."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.documentation import Document
    from aexy.models.workspace import Workspace


class KnowledgeEntityType(str, Enum):
    """Types of entities that can be extracted from documents."""

    PERSON = "person"
    CONCEPT = "concept"
    TECHNOLOGY = "technology"
    PROJECT = "project"
    ORGANIZATION = "organization"
    CODE = "code"
    EXTERNAL = "external"


class KnowledgeRelationType(str, Enum):
    """Types of relationships between entities."""

    MENTIONS = "mentions"
    RELATED_TO = "related_to"
    DEPENDS_ON = "depends_on"
    AUTHORED_BY = "authored_by"
    IMPLEMENTS = "implements"
    REFERENCES = "references"
    LINKS_TO = "links_to"
    SHARES_ENTITY = "shares_entity"


class KnowledgeExtractionStatus(str, Enum):
    """Status of a knowledge extraction job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class KnowledgeExtractionJobType(str, Enum):
    """Type of extraction job."""

    SINGLE_DOCUMENT = "single_document"
    FULL_WORKSPACE = "full_workspace"
    INCREMENTAL = "incremental"


class KnowledgeEntity(Base):
    """Extracted entities from documents (people, concepts, technologies, etc.)."""

    __tablename__ = "knowledge_entities"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Entity identification
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(
        String(50), default=KnowledgeEntityType.CONCEPT.value, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Aliases for the same entity (e.g., "React", "ReactJS", "React.js")
    aliases: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )

    # Additional data (URLs, external IDs, etc.)
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Quality metrics
    confidence_score: Mapped[float] = mapped_column(
        Float, default=0.5, nullable=False
    )
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Temporal tracking
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    mentions: Mapped[list["KnowledgeEntityMention"]] = relationship(
        "KnowledgeEntityMention",
        back_populates="entity",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "normalized_name", "entity_type",
            name="uq_knowledge_entity_workspace_name_type"
        ),
        Index("ix_knowledge_entities_workspace_type", "workspace_id", "entity_type"),
        Index("ix_knowledge_entities_confidence", "workspace_id", "confidence_score"),
    )


class KnowledgeEntityMention(Base):
    """Tracks where entities appear in documents with context."""

    __tablename__ = "knowledge_entity_mentions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    entity_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("knowledge_entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Context around the mention
    context_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Position data (JSON for flexibility - could include line, char offset, etc.)
    position_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Quality metrics
    confidence_score: Mapped[float] = mapped_column(
        Float, default=0.5, nullable=False
    )

    # When was this mention extracted
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    entity: Mapped["KnowledgeEntity"] = relationship(
        "KnowledgeEntity",
        back_populates="mentions",
        lazy="selectin",
    )
    document: Mapped["Document"] = relationship("Document", lazy="selectin")

    __table_args__ = (
        Index("ix_entity_mentions_document", "document_id"),
        Index("ix_entity_mentions_entity_doc", "entity_id", "document_id"),
    )


class KnowledgeRelationship(Base):
    """Relationships between entities (entity-to-entity connections)."""

    __tablename__ = "knowledge_relationships"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_entity_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("knowledge_entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_entity_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("knowledge_entities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationship metadata
    relationship_type: Mapped[str] = mapped_column(
        String(50), default=KnowledgeRelationType.RELATED_TO.value, nullable=False
    )
    strength: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    bidirectional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Additional context or data
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    source_entity: Mapped["KnowledgeEntity"] = relationship(
        "KnowledgeEntity",
        foreign_keys=[source_entity_id],
        lazy="selectin",
    )
    target_entity: Mapped["KnowledgeEntity"] = relationship(
        "KnowledgeEntity",
        foreign_keys=[target_entity_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "source_entity_id", "target_entity_id", "relationship_type",
            name="uq_knowledge_relationship"
        ),
        Index("ix_knowledge_relationships_type", "workspace_id", "relationship_type"),
    )


class KnowledgeDocumentRelationship(Base):
    """Relationships between documents (document-to-document connections)."""

    __tablename__ = "knowledge_document_relationships"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationship metadata
    relationship_type: Mapped[str] = mapped_column(
        String(50), default=KnowledgeRelationType.RELATED_TO.value, nullable=False
    )

    # Shared entities between documents (entity IDs)
    shared_entities: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )

    # Connection strength based on shared entities and other factors
    strength: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)

    # Additional data
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    source_document: Mapped["Document"] = relationship(
        "Document",
        foreign_keys=[source_document_id],
        lazy="selectin",
    )
    target_document: Mapped["Document"] = relationship(
        "Document",
        foreign_keys=[target_document_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "source_document_id", "target_document_id", "relationship_type",
            name="uq_knowledge_doc_relationship"
        ),
        Index("ix_knowledge_doc_relationships_strength", "workspace_id", "strength"),
    )


class KnowledgeExtractionJob(Base):
    """Tracks knowledge extraction jobs for documents."""

    __tablename__ = "knowledge_extraction_jobs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    triggered_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Job metadata
    job_type: Mapped[str] = mapped_column(
        String(50),
        default=KnowledgeExtractionJobType.SINGLE_DOCUMENT.value,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        default=KnowledgeExtractionStatus.PENDING.value,
        nullable=False,
    )

    # Results
    entities_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    relationships_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    documents_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Error tracking
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # LLM usage tracking
    tokens_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Timestamps
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    document: Mapped["Document | None"] = relationship("Document", lazy="selectin")
    triggered_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        Index("ix_extraction_jobs_workspace_status", "workspace_id", "status"),
        Index("ix_extraction_jobs_document", "document_id"),
    )
