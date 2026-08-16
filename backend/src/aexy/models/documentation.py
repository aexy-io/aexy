"""Documentation models for Notion-like document management with AI generation."""

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
from sqlalchemy.sql import func, text

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.repository import Repository
    from aexy.models.workspace import Workspace


class DocumentStatus(str, Enum):
    """Status of document generation."""

    DRAFT = "draft"
    GENERATING = "generating"
    GENERATED = "generated"
    FAILED = "failed"


class DocumentVisibility(str, Enum):
    """Document visibility levels."""

    PRIVATE = "private"  # Only creator can see (and explicit collaborators)
    WORKSPACE = "workspace"  # All workspace members can see
    PUBLIC = "public"  # Anyone with link can view (when is_published=True)


class DocumentLinkType(str, Enum):
    """Type of code link."""

    FILE = "file"
    DIRECTORY = "directory"


class DocumentPermission(str, Enum):
    """Document access permission levels."""

    VIEW = "view"
    COMMENT = "comment"
    EDIT = "edit"
    ADMIN = "admin"


class TemplateCategory(str, Enum):
    """Categories for documentation templates."""

    API_DOCS = "api_docs"
    README = "readme"
    FUNCTION_DOCS = "function_docs"
    MODULE_DOCS = "module_docs"
    GUIDES = "guides"
    CHANGELOG = "changelog"
    CUSTOM = "custom"
    # For the documents that are not about code — a PRD, a postmortem, meeting
    # notes. The frontend's `TemplateCategory` union and the template picker's
    # labels have carried "general" since they were written; this enum was the
    # side that never had it, so the two could not agree on a value the client
    # was already prepared to send.
    GENERAL = "general"


class DocumentSpaceRole(str, Enum):
    """Roles for document space membership."""

    ADMIN = "admin"  # Manage space settings, add/remove members
    EDITOR = "editor"  # Create/edit documents in space
    VIEWER = "viewer"  # View documents only


class DocumentSpace(Base):
    """Document spaces for organizing documents within a workspace (like Notion teamspaces)."""

    __tablename__ = "document_spaces"

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

    # Space info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Emoji or icon name
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Hex color

    # Space flags
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Settings (JSON for extensibility)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Authorship
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
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
    created_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")
    members: Mapped[list["DocumentSpaceMember"]] = relationship(
        "DocumentSpaceMember",
        back_populates="space",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        back_populates="space",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_document_space_workspace_slug"),
        Index("ix_document_spaces_workspace_default", "workspace_id", "is_default"),
    )


class DocumentSpaceMember(Base):
    """Membership and roles for document spaces."""

    __tablename__ = "document_space_members"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    space_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("document_spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Role in the space
    role: Mapped[str] = mapped_column(
        String(50), default=DocumentSpaceRole.EDITOR.value, nullable=False
    )

    # Invitation tracking
    invited_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    invited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
    space: Mapped["DocumentSpace"] = relationship(
        "DocumentSpace",
        back_populates="members",
        lazy="selectin",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
        lazy="selectin",
    )
    invited_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[invited_by_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("space_id", "developer_id", name="uq_document_space_member"),
        Index("ix_document_space_members_role", "space_id", "role"),
    )


class Document(Base):
    """Core document model storing TipTap JSON content."""

    __tablename__ = "documents"

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
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    space_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("document_spaces.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Document content
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="Untitled")
    content: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    content_text: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Plain text for search

    # Visual customization
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Emoji or icon
    cover_image: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Document type flags
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Visibility (private, workspace, public)
    visibility: Mapped[str] = mapped_column(
        String(20), default=DocumentVisibility.WORKSPACE.value, nullable=False
    )

    # Generation metadata
    generation_prompt_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("document_generation_prompts.id", ondelete="SET NULL"),
        nullable=True,
    )
    generation_status: Mapped[str] = mapped_column(
        String(50), default=DocumentStatus.DRAFT.value, nullable=False
    )
    last_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Authorship
    created_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    last_edited_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Ordering within parent
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    space: Mapped["DocumentSpace | None"] = relationship(
        "DocumentSpace",
        back_populates="documents",
        lazy="selectin",
    )
    parent: Mapped["Document | None"] = relationship(
        "Document",
        remote_side="Document.id",
        back_populates="children",
        lazy="selectin",
    )
    children: Mapped[list["Document"]] = relationship(
        "Document",
        back_populates="parent",
        lazy="selectin",
        order_by="Document.position",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )
    last_edited_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[last_edited_by_id],
        lazy="selectin",
    )
    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="desc(DocumentVersion.version_number)",
    )
    code_links: Mapped[list["DocumentCodeLink"]] = relationship(
        "DocumentCodeLink",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    collaborators: Mapped[list["DocumentCollaborator"]] = relationship(
        "DocumentCollaborator",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    generation_prompt: Mapped["DocumentGenerationPrompt | None"] = relationship(
        "DocumentGenerationPrompt",
        foreign_keys=[generation_prompt_id],
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_documents_workspace_parent", "workspace_id", "parent_id"),
        Index("ix_documents_workspace_template", "workspace_id", "is_template"),
        Index("ix_documents_workspace_space", "workspace_id", "space_id"),
    )


class DocumentVersion(Base):
    """Version history with diffs for documents."""

    __tablename__ = "document_versions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Version info
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)  # Full snapshot
    content_diff: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # Diff from previous

    # Metadata
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_auto_save: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_auto_generated: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped["Document"] = relationship(
        "Document",
        back_populates="versions",
        lazy="selectin",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "document_id", "version_number", name="uq_document_version_number"
        ),
    )


class DocumentTemplate(Base):
    """Reusable documentation templates with prompts."""

    __tablename__ = "document_templates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,  # None = system template
        index=True,
    )

    # Template info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(
        String(50), default=TemplateCategory.CUSTOM.value, nullable=False
    )
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Template content
    content_template: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False
    )  # TipTap JSON template
    prompt_template: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # LLM prompt with placeholders
    system_prompt: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Optional system prompt override
    variables: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )  # Expected variables

    # Template settings
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Authorship
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
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
    workspace: Mapped["Workspace | None"] = relationship("Workspace", lazy="selectin")
    created_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")


class DocumentCodeLink(Base):
    """Links documents to source code for sync and regeneration."""

    __tablename__ = "document_code_links"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    repository_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Link target
    link_type: Mapped[str] = mapped_column(
        String(50), default=DocumentLinkType.FILE.value, nullable=False
    )
    path: Mapped[str] = mapped_column(String(1000), nullable=False)  # Relative path
    branch: Mapped[str] = mapped_column(String(255), default="main", nullable=False)

    # Change tracking
    last_commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    has_pending_changes: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Section linking (optional - link to specific section in document)
    document_section_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # TipTap node ID

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
    document: Mapped["Document"] = relationship(
        "Document",
        back_populates="code_links",
        lazy="selectin",
    )
    repository: Mapped["Repository"] = relationship("Repository", lazy="selectin")

    __table_args__ = (
        Index("ix_code_links_repo_path", "repository_id", "path"),
        UniqueConstraint(
            "document_id",
            "repository_id",
            "path",
            "document_section_id",
            name="uq_document_code_link",
        ),
    )


class DocumentGenerationPrompt(Base):
    """Saved prompts for document generation, enabling regeneration."""

    __tablename__ = "document_generation_prompts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("document_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # The actual prompts used
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # LLM configuration
    llm_provider: Mapped[str] = mapped_column(
        String(50), default="claude", nullable=False
    )
    llm_model: Mapped[str] = mapped_column(
        String(100), default="claude-sonnet-4-20250514", nullable=False
    )
    temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)

    # Variables used for generation
    variables: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    template: Mapped["DocumentTemplate | None"] = relationship(
        "DocumentTemplate", lazy="selectin"
    )


class CollaborationSession(Base):
    """Active real-time collaboration sessions."""

    __tablename__ = "collaboration_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Session state (stored in Redis for real-time, persisted here for recovery)
    cursor_position: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    selection: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    color: Mapped[str] = mapped_column(
        String(7), default="#3B82F6", nullable=False
    )  # User cursor color

    # Connection tracking
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    document: Mapped["Document"] = relationship("Document", lazy="selectin")
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        Index("ix_collab_sessions_document_active", "document_id", "is_active"),
    )


class DocumentCollaborator(Base):
    """Document-level permissions for sharing."""

    __tablename__ = "document_collaborators"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Permission level
    permission: Mapped[str] = mapped_column(
        String(50), default=DocumentPermission.VIEW.value, nullable=False
    )

    # Invitation tracking
    invited_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped["Document"] = relationship(
        "Document",
        back_populates="collaborators",
        lazy="selectin",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
        lazy="selectin",
    )
    invited_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[invited_by_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "document_id", "developer_id", name="uq_document_collaborator"
        ),
    )


class DocumentSyncQueue(Base):
    """Queue for documents pending regeneration (mid-tier batch sync)."""

    __tablename__ = "document_sync_queue"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Trigger info
    triggered_by_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Processing state
    status: Mapped[str] = mapped_column(
        String(50), default="pending", nullable=False
    )  # pending, processing, completed, failed
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    document: Mapped["Document"] = relationship("Document", lazy="selectin")


class DocumentGitHubSync(Base):
    """Configuration for syncing documents to/from GitHub repositories."""

    __tablename__ = "document_github_sync"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    repository_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Sync target
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)  # e.g., docs/README.md
    branch: Mapped[str] = mapped_column(String(255), default="main", nullable=False)

    # Sync direction
    sync_direction: Mapped[str] = mapped_column(
        String(20), default="bidirectional", nullable=False
    )  # export_only, import_only, bidirectional

    # Sync state
    last_exported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_export_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_import_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA256 of content

    # Auto-sync settings
    auto_export: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_import: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    document: Mapped["Document"] = relationship("Document", lazy="selectin")
    repository: Mapped["Repository"] = relationship("Repository", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("document_id", "repository_id", "file_path", name="uq_document_github_sync"),
    )


class DocumentFavorite(Base):
    """User's favorited documents for quick access."""

    __tablename__ = "document_favorites"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", lazy="selectin")
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("document_id", "developer_id", name="uq_document_favorite"),
        Index("ix_document_favorites_developer", "developer_id"),
    )


class DocumentComment(Base):
    """A comment on a document, optionally a reply within a thread.

    ``DocumentPermission.COMMENT`` has existed since the docs module was written —
    a permission level an admin could grant on a document that had nothing to
    comment *with*. This is that feature.

    Threading is one level deep: a root comment plus replies pointing at it via
    ``parent_id``. Arbitrary nesting reads badly in a side panel and makes
    "who is in this conversation?" — the question the notification recipients
    depend on — a recursive walk instead of one query.

    ``content`` is rich text in the same shape task comments and ticket replies
    use, so ``extract_mentioned_user_ids`` finds ``mention:user:{uuid}`` hrefs in
    it and document mentions notify through the same path as every other mention
    in the product.

    Deletion is soft. A hard delete of a root comment would take its replies with
    it and leave the other participants' words gone with no trace, so a deleted
    comment keeps its position in the thread and stops rendering its body.
    """

    __tablename__ = "document_comments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Replies point at their root comment. CASCADE rather than SET NULL: a reply
    # whose parent vanished would surface as a second root comment answering
    # nothing. Soft delete is what keeps threads intact in normal use.
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("document_comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    author_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Which passage this thread is about. The same id is carried by a
    # `commentAnchor` mark inside `Document.content`, and that pairing is the only
    # link between the two — positions are not stored, because every edit above a
    # comment would move them.
    #
    # NULL *is* the whole-document comment, which is why anchored threads and the
    # discussion at the foot of the document share one table: the distinction is
    # this field, not a second model. Only ever set on a root comment; a reply
    # belongs to whatever its parent is about.
    #
    # There is deliberately no `is_orphaned` flag. The editor already knows which
    # anchor ids still have marks, so a thread whose passage was edited away is
    # grouped as unanchored from what the client can see. A stored flag would need
    # the server to walk TipTap JSON on every list, and would go stale between.
    #
    # Not `index=True`: that builds a standalone `ix_document_comments_anchor_id`,
    # which nothing queries — the rail always asks for one document's anchors — and
    # which the migration does not create, so `create_all` databases and migrated
    # ones would disagree about their indexes. The composite partial index in
    # `__table_args__` is the one that matches both the query and the migration.
    anchor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # The passage as it read when the comment was made. Shown in the rail and in
    # the unanchored group — a thread whose text is gone is unreadable without it,
    # and it is what makes "this no longer matches the document" legible.
    quoted_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Resolution is a property of the thread, so it is only meaningful on a root
    # comment. Resolving is not deleting — a resolved thread stays readable.
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    document: Mapped["Document"] = relationship("Document", lazy="selectin")
    author: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[author_id],
        lazy="selectin",
    )
    replies: Mapped[list["DocumentComment"]] = relationship(
        "DocumentComment",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="DocumentComment.created_at",
    )

    __table_args__ = (
        # The panel's only read: every comment on a document, oldest first.
        Index("ix_document_comments_document_created", "document_id", "created_at"),
        Index("ix_document_comments_parent", "parent_id"),
        # The rail's read: every anchored thread on one document. Partial, because
        # the whole-document comments are exactly the rows this is never used for.
        # Kept identical to migrate_document_comment_anchors.sql — a database built
        # by create_all and one built by the migration have to agree. On SQLite the
        # postgresql_where is ignored and this degrades to a plain composite index,
        # which is only a test-time difference in speed, not in behaviour.
        Index(
            "ix_document_comments_document_anchor",
            "document_id",
            "anchor_id",
            postgresql_where=text("anchor_id IS NOT NULL"),
        ),
    )


# The `SYSTEM_TEMPLATES` list that used to sit here is gone. It described
# templates to seed as rows, was consumed by nothing, and once
# `services/document_templates_catalog.py` became the real catalogue it was the
# more discoverable of two competing answers to "what are the system templates".


# ---------------------------------------------------------------------------
# Proposed Edits — AI suggestion review queue
# ---------------------------------------------------------------------------
#
# Sits between AI output (regenerate / sync / suggest_improvements / future
# manual_ai_edit) and the canonical Document.content. The previous flow
# overwrote content directly on regenerate; this puts a review step in
# between so the user approves or rejects each proposal.
#
# See backend/scripts/migrate_document_proposed_edits.sql for the schema.


class ProposedEditSource(str, Enum):
    CODE_CHANGE_SYNC = "code_change_sync"
    REGENERATE = "regenerate"
    SUGGEST_IMPROVEMENTS = "suggest_improvements"
    MANUAL_AI_EDIT = "manual_ai_edit"


class ProposedEditStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class DocumentProposedEdit(Base):
    """A pending AI-proposed change to a Document's content.

    The frontend renders these as a banner above the editor (grouped by
    `source`) with section-summary + expandable diff UI. Approving
    replaces `documents.content` and creates a new `DocumentVersion`;
    rejecting records a reason; a fresh proposal supersedes older
    pending ones on the same document.
    """

    __tablename__ = "document_proposed_edits"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source: Mapped[str] = mapped_column(String(40), nullable=False)
    # ProposedEditSource enum value

    # Full proposed TipTap doc; JSONB so the editor schema can evolve
    # without a migration.
    proposed_content: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # SHA of `documents.content` at proposal authoring time. Mismatch
    # at approve-time means the user has hand-edited since — the FE
    # surfaces the merge-conflict UI.
    base_content_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Section-level diff summary the FE renders as the default view.
    # Shape: {"sections_added": [...], "sections_removed": [...],
    #         "headings_changed": [...]}
    diff_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )

    proposed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    proposed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    reviewed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Free-text reason; used for rejects (user explanation) and for
    # 'superseded' (system-recorded: superseded by id=...).
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    document: Mapped["Document"] = relationship("Document", lazy="selectin")
