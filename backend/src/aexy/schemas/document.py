"""Document-related Pydantic schemas for the documentation system."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# Document Types
DocumentStatus = Literal["draft", "generating", "generated", "failed"]
DocumentLinkType = Literal["file", "directory"]
DocumentPermission = Literal["view", "comment", "edit", "admin"]
DocumentVisibility = Literal["private", "workspace", "public"]
# Kept in step with `TemplateCategory` in models/documentation.py and with the
# frontend union in lib/api.ts. Three hand-maintained copies of one list, and
# "general" was already in the frontend's before it was in either of these.
TemplateCategory = Literal[
    "api_docs",
    "readme",
    "function_docs",
    "module_docs",
    "guides",
    "changelog",
    "custom",
    "general",
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
    # The linked code has changed since this page was written.
    is_behind_code: bool = False
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


class DocumentNeedsUpdateItem(BaseModel):
    """One document whose linked code has moved on without it.

    Shaped for whoever is going to act on it — an agent over MCP, or the
    review inbox — so it carries the repository coordinates needed to go and
    read the code, not just a document id.
    """

    document_id: str
    document_title: str
    document_icon: str | None = None

    code_link_id: str
    repository_id: str
    repository_full_name: str | None = None
    path: str
    link_type: str
    branch: str

    # `code_changed` — a push touched this path since the last sync.
    # `never_synced` — linked to code but never generated from it.
    reason: str
    last_synced_at: datetime | None = None
    last_seen_commit_sha: str | None = None
    owner_developer_id: str | None = None

    # A proposal already waiting for review. Non-zero means this document has
    # been dealt with and writing another update only duplicates the reviewer's
    # work.
    pending_proposal_count: int = 0


class CodeLinkTransfer(BaseModel):
    """Schema for handing a code link's sync to another member."""

    owner_developer_id: str


class GenerateFromCodeRequest(BaseModel):
    """Source code to document, in the request body.

    `code` used to be a query parameter. A 200-line file put roughly 8 KB in
    the request line — past the default ceiling in nginx and in uvicorn's h11
    limits — so pasting a real file returned 414 and the UI said "please try
    again", which could not work because the input was the problem. It also
    wrote the source verbatim into access logs, proxy logs and browser
    history.
    """

    code: str = Field(min_length=1)
    template_category: TemplateCategory = "function_docs"
    file_path: str | None = Field(default=None, max_length=1000)
    language: str | None = Field(default=None, max_length=50)


class GenerateFromRepositoryRequest(BaseModel):
    """Generate from a path in a connected repository.

    `path` may name a file or a directory; `link_type` says which, and decides
    whether the result is written from that one file or from the module around
    it. Previously only directories were reachable, which made three of the
    four documentation types on the screen unreachable by construction.
    """

    repository_id: str
    path: str = Field(default="", max_length=1000)
    link_type: DocumentLinkType = "directory"
    branch: str = Field(default="main", max_length=255)
    template_category: TemplateCategory = "module_docs"
    custom_prompt: str | None = None
    title: str | None = Field(default=None, max_length=500)

    # Where this sits in the tree. A whole-repository pass creates one parent
    # and a child per module, so that later a single module can be revised
    # without rewriting the world.
    parent_id: str | None = None

    # Prose the caller already wrote, in Markdown. When present the server does
    # not generate: an agent running in the working tree has read the actual
    # files and can say more than a server fetching a directory listing and the
    # first 2 KB of a README. The server's job is then the part the agent
    # cannot do — the document, the link, and the tree.
    markdown: str | None = None


class ProposeMarkdownRequest(BaseModel):
    """A proposed rewrite, written in Markdown.

    Markdown rather than editor JSON on purpose: it is a format a writer can
    produce without seeing our schema, and one the server can refuse cleanly
    when it is wrong. Editor JSON fails silently instead — an invalid node
    renders as a blank page.
    """

    markdown: str = Field(min_length=1)
    summary: str | None = Field(default=None, max_length=500)


class CodeLinkSyncModeUpdate(BaseModel):
    """How this document should react when its code changes."""

    sync_mode: Literal["propose", "auto", "off"]


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
    # Whoever set this sync up. Null means orphaned — the owner left and no
    # transfer has run — which is worth surfacing rather than hiding, since
    # such a sync only keeps working while the repository has an installation
    # of its own.
    owner_developer_id: str | None = None
    # propose (default) / auto / off — see DocumentSyncMode.
    sync_mode: str = "propose"
    created_at: datetime
    updated_at: datetime


class CodeChangeCheckResponse(BaseModel):
    """Schema for checking code changes."""

    document_id: str
    has_changes: bool
    changed_links: list[CodeLinkResponse] = Field(default_factory=list)
    last_checked_at: datetime


# ==================== Generation Schemas ====================


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


# ==================== Comment Schemas ====================


class DocumentCommentCreate(BaseModel):
    """Post a comment, or a reply to one."""

    content: str = Field(min_length=1, max_length=20000)
    # Present means "this is a reply". Only root comments accept replies, so the
    # service rejects a parent that is itself a reply rather than silently
    # flattening it — one level of threading is a decision, not an accident.
    parent_id: str | None = None
    # The passage this thread is about, paired with a `commentAnchor` mark in the
    # document's content. Absent means a comment about the document as a whole,
    # which is what the section at the foot of the page shows. Ignored on a reply:
    # a reply is about whatever its parent was.
    anchor_id: str | None = Field(default=None, max_length=64)
    # The selected text, kept so an anchored thread stays readable after the
    # passage is edited away. Bounded because a selection can be a whole document.
    quoted_text: str | None = Field(default=None, max_length=2000)


class DocumentCommentUpdate(BaseModel):
    """Edit your own comment."""

    content: str = Field(min_length=1, max_length=20000)


class DocumentCommentResponse(BaseModel):
    """A single comment. Replies are nested one level under their root."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    parent_id: str | None = None
    # Null when the author's account was removed; the comment survives so the
    # thread still reads.
    author_id: str | None = None
    author_name: str | None = None
    author_avatar: str | None = None
    # Empty for a deleted comment — the row stays so replies keep their place,
    # but the body does not come back.
    content: str
    # Null on a whole-document comment and on every reply. The client pairs this
    # with the `commentAnchor` marks it can see, and any thread whose id has no
    # mark left is shown as unanchored rather than dropped.
    anchor_id: str | None = None
    quoted_text: str | None = None
    is_resolved: bool = False
    resolved_by_id: str | None = None
    resolved_at: datetime | None = None
    is_deleted: bool = False
    is_edited: bool = False
    created_at: datetime
    updated_at: datetime
    replies: list["DocumentCommentResponse"] = Field(default_factory=list)


class DocumentCommentListResponse(BaseModel):
    """Root comments for a document, each carrying its replies."""

    comments: list[DocumentCommentResponse]
    total: int
    unresolved_count: int


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


# =============================================================================
# Proposed Edits — AI suggestion review queue
# =============================================================================

ProposedEditSourceLiteral = Literal[
    "code_change_sync",
    "regenerate",
    "suggest_improvements",
    "manual_ai_edit",
]

ProposedEditStatusLiteral = Literal[
    "pending",
    "approved",
    "rejected",
    "superseded",
]


class ProposedEditCreate(BaseModel):
    """Payload to create a new proposed edit for a document.

    Created by the regenerate / sync / suggest-improvements service
    paths — not exposed publicly for arbitrary AI output insertion
    (the public surface is the existing generate / suggest endpoints,
    which now route through the service).
    """

    source: ProposedEditSourceLiteral
    proposed_content: dict[str, Any]
    base_content_sha: str | None = None
    diff_summary: dict[str, Any] | None = None


class ProposedEditResponse(BaseModel):
    """Full proposed-edit row as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    source: ProposedEditSourceLiteral
    proposed_content: dict[str, Any]
    base_content_sha: str | None = None
    diff_summary: dict[str, Any] | None = None
    status: ProposedEditStatusLiteral
    proposed_by_id: str | None = None
    proposed_at: datetime
    reviewed_by_id: str | None = None
    reviewed_at: datetime | None = None
    reason: str | None = None
    # Computed: True when base_content_sha != document.content_sha at
    # read-time. Surfaces the merge-conflict badge in the FE.
    is_stale: bool = False


class LinkedDocumentResponse(BaseModel):
    """A generated document and the code link that keeps it honest."""

    document: DocumentResponse
    code_link: CodeLinkResponse


class WorkspaceProposedEdit(ProposedEditResponse):
    """A proposal seen from outside its own document.

    The per-document listing can assume the reader already knows which page
    they are on. A workspace-wide queue cannot: without the title there is
    nothing to decide from but a UUID.
    """

    document_title: str
    document_icon: str | None = None


class ProposedEditReject(BaseModel):
    """Payload for the reject endpoint. Reason is optional but
    encouraged — the FE prompts for it."""

    reason: str | None = None
