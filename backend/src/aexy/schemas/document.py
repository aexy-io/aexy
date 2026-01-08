"""Document-related Pydantic schemas for the documentation system."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# Document Types
DocumentStatus = Literal["draft", "generating", "generated", "failed"]
DocumentLinkType = Literal["file", "directory"]
DocumentPermission = Literal["view", "comment", "edit", "admin"]
DocumentVisibility = Literal["private", "workspace", "public"]
DocumentNotificationType = Literal["comment", "mention", "share", "edit"]
TemplateCategory = Literal[
    "api_docs", "readme", "function_docs", "module_docs", "guides", "changelog", "custom"
]
DocumentSpaceRole = Literal["admin", "editor", "viewer"]


# ==================== Document Schemas ====================


class DocumentCreate(BaseModel):
    """Schema for creating a document."""

    title: str = Field(default="Untitled", max_length=500)
    content: dict[str, Any] | None = None
    parent_id: str | None = None
    template_id: str | None = None
    space_id: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    cover_image: str | None = Field(default=None, max_length=500)
    visibility: DocumentVisibility = "workspace"


class DocumentUpdate(BaseModel):
    """Schema for updating a document."""

    title: str | None = Field(default=None, max_length=500)
    content: dict[str, Any] | None = None
    icon: str | None = Field(default=None, max_length=50)
    cover_image: str | None = Field(default=None, max_length=500)
    visibility: DocumentVisibility | None = None
    is_auto_save: bool = False


class DocumentResponse(BaseModel):
    """Schema for document response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    parent_id: str | None = None
    title: str
    content: dict[str, Any]
    content_text: str | None = None
    icon: str | None = None
    cover_image: str | None = None
    is_template: bool = False
    is_published: bool = False
    published_at: datetime | None = None
    visibility: DocumentVisibility = "workspace"
    generation_status: DocumentStatus = "draft"
    last_generated_at: datetime | None = None
    created_by_id: str | None = None
    created_by_name: str | None = None
    created_by_avatar: str | None = None
    last_edited_by_id: str | None = None
    last_edited_by_name: str | None = None
    position: int = 0
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    """Schema for document list item (lightweight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    parent_id: str | None = None
    title: str
    icon: str | None = None
    generation_status: DocumentStatus = "draft"
    created_at: datetime
    updated_at: datetime


class DocumentTreeItem(BaseModel):
    """Schema for document tree item."""

    id: str
    title: str
    icon: str | None = None
    parent_id: str | None = None
    space_id: str | None = None
    space_name: str | None = None
    position: int
    visibility: DocumentVisibility = "workspace"
    created_by_id: str | None = None
    is_favorited: bool = False
    has_children: bool = False
    children: list["DocumentTreeItem"] = Field(default_factory=list)
    created_at: str
    updated_at: str


class DocumentMoveRequest(BaseModel):
    """Schema for moving a document in the tree."""

    new_parent_id: str | None = None
    position: int = Field(ge=0)


class DocumentDuplicateRequest(BaseModel):
    """Schema for duplicating a document."""

    include_children: bool = False


class DocumentSearchRequest(BaseModel):
    """Schema for searching documents."""

    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# ==================== Version Schemas ====================


class DocumentVersionResponse(BaseModel):
    """Schema for document version response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    version_number: int
    content: dict[str, Any]
    content_diff: dict[str, Any] | None = None
    created_by_id: str | None = None
    created_by_name: str | None = None
    created_by_avatar: str | None = None
    change_summary: str | None = None
    is_auto_save: bool = False
    is_auto_generated: bool = False
    created_at: datetime


class RestoreVersionRequest(BaseModel):
    """Schema for restoring a document version."""

    version_id: str


# ==================== Template Schemas ====================


class TemplateCreate(BaseModel):
    """Schema for creating a template."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: TemplateCategory = "custom"
    icon: str | None = Field(default=None, max_length=50)
    content_template: dict[str, Any] = Field(default_factory=dict)
    prompt_template: str = Field(min_length=1)
    system_prompt: str | None = None
    variables: list[str] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    """Schema for updating a template."""

    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    category: TemplateCategory | None = None
    icon: str | None = Field(default=None, max_length=50)
    content_template: dict[str, Any] | None = None
    prompt_template: str | None = None
    system_prompt: str | None = None
    variables: list[str] | None = None
    is_active: bool | None = None


class TemplateResponse(BaseModel):
    """Schema for template response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str | None = None
    name: str
    description: str | None = None
    category: TemplateCategory
    icon: str | None = None
    content_template: dict[str, Any]
    prompt_template: str
    system_prompt: str | None = None
    variables: list[str]
    is_system: bool = False
    is_active: bool = True
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    """Schema for template list item."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    category: TemplateCategory
    icon: str | None = None
    is_system: bool = False
    variables: list[str]


# ==================== Code Link Schemas ====================


class CodeLinkCreate(BaseModel):
    """Schema for creating a code link."""

    repository_id: str
    path: str = Field(max_length=1000)
    link_type: DocumentLinkType = "file"
    branch: str = Field(default="main", max_length=255)
    section_id: str | None = Field(default=None, max_length=100)


class CodeLinkResponse(BaseModel):
    """Schema for code link response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    repository_id: str
    repository_name: str | None = None
    path: str
    link_type: DocumentLinkType
    branch: str
    document_section_id: str | None = None
    last_commit_sha: str | None = None
    last_content_hash: str | None = None
    last_synced_at: datetime | None = None
    has_pending_changes: bool = False
    created_at: datetime
    updated_at: datetime


class CodeChangeCheckResponse(BaseModel):
    """Schema for checking code changes."""

    document_id: str
    has_changes: bool
    changed_links: list[CodeLinkResponse] = Field(default_factory=list)
    last_checked_at: datetime


# ==================== Generation Schemas ====================


class GenerateFromCodeRequest(BaseModel):
    """Schema for generating documentation from code."""

    template_id: str
    repository_id: str
    paths: list[str] = Field(min_length=1)
    custom_prompt: str | None = None
    variables: dict[str, Any] = Field(default_factory=dict)


class RegenerateDocumentRequest(BaseModel):
    """Schema for regenerating a document."""

    section_id: str | None = None  # Optional: only regenerate specific section


class GenerationResponse(BaseModel):
    """Schema for generation response."""

    document_id: str
    status: DocumentStatus
    content: dict[str, Any] | None = None
    tokens_used: int = 0
    generation_time_ms: int = 0
    error: str | None = None


# ==================== Collaboration Schemas ====================


class CollaboratorAdd(BaseModel):
    """Schema for adding a collaborator."""

    developer_id: str
    permission: DocumentPermission = "view"


class CollaboratorUpdate(BaseModel):
    """Schema for updating collaborator permission."""

    permission: DocumentPermission


class CollaboratorResponse(BaseModel):
    """Schema for collaborator response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    developer_id: str
    developer_name: str | None = None
    developer_email: str | None = None
    developer_avatar: str | None = None
    permission: DocumentPermission
    invited_by_id: str | None = None
    invited_by_name: str | None = None
    invited_at: datetime


class ActiveCollaboratorResponse(BaseModel):
    """Schema for active collaborator in real-time editing."""

    developer_id: str
    developer_name: str | None = None
    developer_avatar: str | None = None
    color: str
    cursor_position: dict[str, Any] | None = None
    selection: dict[str, Any] | None = None
    last_activity_at: datetime


# ==================== GitHub Sync Schemas ====================


class GitHubSyncRequest(BaseModel):
    """Schema for syncing document to GitHub."""

    repository_id: str
    path: str = Field(max_length=1000)  # e.g., "docs/api.md"
    branch: str = Field(default="main", max_length=255)
    commit_message: str | None = None


class GitHubPullRequest(BaseModel):
    """Schema for pulling document from GitHub."""

    repository_id: str
    path: str = Field(max_length=1000)
    branch: str = Field(default="main", max_length=255)


class GitHubSyncResponse(BaseModel):
    """Schema for GitHub sync response."""

    success: bool
    commit_sha: str | None = None
    commit_url: str | None = None
    error: str | None = None


# ==================== Notification Schemas ====================


class DocumentNotificationResponse(BaseModel):
    """Schema for document notification response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    document_title: str | None = None
    document_icon: str | None = None
    type: DocumentNotificationType
    message: str
    is_read: bool = False
    created_by_id: str | None = None
    created_by_name: str | None = None
    created_by_avatar: str | None = None
    created_at: datetime
    read_at: datetime | None = None


class DocumentNotificationListResponse(BaseModel):
    """Schema for notification list with pagination."""

    notifications: list[DocumentNotificationResponse]
    total: int
    unread_count: int


# ==================== Favorites Schemas ====================


class DocumentFavoriteResponse(BaseModel):
    """Schema for favorite document response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    document_title: str | None = None
    document_icon: str | None = None
    created_at: datetime


# ==================== Ancestors Schemas ====================


class DocumentAncestorResponse(BaseModel):
    """Schema for document ancestor (breadcrumb) response."""

    id: str
    title: str
    icon: str | None = None


# ==================== Document Space Schemas ====================


class DocumentSpaceCreate(BaseModel):
    """Schema for creating a document space."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=20)


class DocumentSpaceUpdate(BaseModel):
    """Schema for updating a document space."""

    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=20)
    is_archived: bool | None = None


class DocumentSpaceResponse(BaseModel):
    """Schema for document space response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_default: bool = False
    is_archived: bool = False
    member_count: int = 0
    document_count: int = 0
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class DocumentSpaceListResponse(BaseModel):
    """Schema for document space list item (lightweight)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    icon: str | None = None
    color: str | None = None
    is_default: bool = False
    is_archived: bool = False
    member_count: int = 0
    document_count: int = 0


class DocumentSpaceMemberAdd(BaseModel):
    """Schema for adding a member to a space."""

    developer_id: str
    role: DocumentSpaceRole = "editor"


class DocumentSpaceMemberUpdate(BaseModel):
    """Schema for updating a space member's role."""

    role: DocumentSpaceRole


class DocumentSpaceMemberResponse(BaseModel):
    """Schema for space member response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    space_id: str
    developer_id: str
    developer_name: str | None = None
    developer_email: str | None = None
    developer_avatar: str | None = None
    role: DocumentSpaceRole
    invited_by_id: str | None = None
    invited_by_name: str | None = None
    joined_at: datetime | None = None
    created_at: datetime
