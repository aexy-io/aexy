"""Document API endpoints for Notion-like documentation."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.access_guard import ensure_app_enabled
from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.documentation import DocumentPermission
from aexy.schemas.document import (
    DocumentCommentCreate,
    DocumentCommentListResponse,
    DocumentCommentResponse,
    DocumentCommentUpdate,
    CodeLinkCreate,
    CodeLinkResponse,
    CodeLinkSyncModeUpdate,
    CodeLinkTransfer,
    CollaboratorAdd,
    CollaboratorResponse,
    CollaboratorUpdate,
    DocumentAncestorResponse,
    DocumentCreate,
    DocumentListResponse,
    DocumentMoveRequest,
    DocumentNeedsUpdateItem,
    MergedChangeItem,
    DocumentResponse,
    DocumentTreeItem,
    DocumentUpdate,
    DocumentVersionResponse,
    GenerateFromCodeRequest,
    GenerateFromRepositoryRequest,
    LinkedDocumentResponse,
    ProposedEditReject,
    ProposedEditResponse,
    ApplySuggestionRequest,
    ProposeMarkdownRequest,
    TemplateCreate,
    TemplateListResponse,
    TemplateResponse,
    TemplateUpdate,
    WorkspaceProposedEdit,
)
from aexy.services.document_comment_service import DocumentCommentService
from aexy.services.github_app_service import (
    GitHubAppError,
    GitHubAppService,
    GitHubServiceAdapter,
)
from aexy.services.document_service import DocumentService
from aexy.services.markdown_to_tiptap import MarkdownError, markdown_to_tiptap
from aexy.services.document_sync_service import DocumentSyncService
from aexy.services.document_generation_service import DocumentGenerationService
from aexy.services.proposed_edits_service import (
    ProposedEditsService,
    compute_content_sha,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.models.documentation import ProposedEditSource, TemplateCategory

router = APIRouter(prefix="/workspaces/{workspace_id}/documents", tags=["Documents"])
template_router = APIRouter(prefix="/templates", tags=["Templates"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace documents."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


def document_to_response(doc) -> DocumentResponse:
    """Convert Document model to response schema."""
    return DocumentResponse(
        id=str(doc.id),
        workspace_id=str(doc.workspace_id),
        parent_id=str(doc.parent_id) if doc.parent_id else None,
        title=doc.title,
        content=doc.content,
        content_text=doc.content_text,
        icon=doc.icon,
        cover_image=doc.cover_image,
        is_template=doc.is_template,
        is_published=doc.is_published,
        published_at=doc.published_at,
        visibility=doc.visibility,
        generation_status=doc.generation_status,
        last_generated_at=doc.last_generated_at,
        created_by_id=str(doc.created_by_id) if doc.created_by_id else None,
        created_by_name=doc.created_by.name if doc.created_by else None,
        created_by_avatar=doc.created_by.avatar_url if doc.created_by else None,
        last_edited_by_id=str(doc.last_edited_by_id) if doc.last_edited_by_id else None,
        last_edited_by_name=doc.last_edited_by.name if doc.last_edited_by else None,
        position=doc.position,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def document_to_list_response(doc) -> DocumentListResponse:
    """Convert Document model to list response schema."""
    return DocumentListResponse(
        id=str(doc.id),
        workspace_id=str(doc.workspace_id),
        parent_id=str(doc.parent_id) if doc.parent_id else None,
        title=doc.title,
        icon=doc.icon,
        generation_status=doc.generation_status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


# ==================== Document CRUD ====================


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    workspace_id: str,
    data: DocumentCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new document."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    document = await service.create_document(
        workspace_id=workspace_id,
        created_by_id=str(current_user.id),
        title=data.title,
        content=data.content,
        parent_id=data.parent_id,
        template_id=data.template_id,
        space_id=data.space_id,
        icon=data.icon,
        cover_image=data.cover_image,
        visibility=data.visibility,
    )

    return document_to_response(document)


@router.get("", response_model=list[DocumentListResponse])
async def list_documents(
    workspace_id: str,
    parent_id: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List documents in a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)

    if search:
        documents = await service.search_documents(
            workspace_id=workspace_id,
            query=search,
            limit=limit,
            offset=offset,
        )
    else:
        # Get flat list at parent level
        tree = await service.get_document_tree(
            workspace_id=workspace_id,
            parent_id=parent_id,
            include_templates=False,
        )
        # Convert tree items to list responses
        return [
            DocumentListResponse(
                id=item["id"],
                workspace_id=workspace_id,
                parent_id=item["parent_id"],
                title=item["title"],
                icon=item["icon"],
                generation_status="draft",
                created_at=datetime.fromisoformat(item["created_at"]),
                updated_at=datetime.fromisoformat(item["updated_at"]),
            )
            for item in tree
        ]

    return [document_to_list_response(doc) for doc in documents]


@router.get("/tree", response_model=list[DocumentTreeItem])
async def get_document_tree(
    workspace_id: str,
    parent_id: str | None = None,
    include_templates: bool = False,
    visibility: str | None = Query(default=None, description="Filter by visibility: private, workspace, public"),
    space_id: str | None = Query(default=None, description="Filter by document space"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get hierarchical document tree for sidebar."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)
    tree = await service.get_document_tree(
        workspace_id=workspace_id,
        developer_id=str(current_user.id),
        parent_id=parent_id,
        include_templates=include_templates,
        visibility=visibility,
        space_id=space_id,
    )

    return tree


# ==================== Favorites ====================
# NOTE: These routes MUST be before /{document_id} routes to avoid path conflicts


@router.get("/favorites", response_model=list[DocumentTreeItem])
async def get_favorites(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get user's favorited documents."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)
    favorites = await service.get_favorites(
        workspace_id=workspace_id,
        developer_id=str(current_user.id),
    )

    return favorites


# ==================== Documentation work list ====================
# NOTE: Every route here MUST stay before /{document_id}, or its literal path
# segment is read as a document id and the endpoint 404s on a lookup for a
# document called "needs-update".


@router.get("/needs-update", response_model=list[DocumentNeedsUpdateItem])
async def list_documents_needing_update(
    workspace_id: str,
    repository_id: str | None = Query(
        default=None, description="Restrict to one repository."
    ),
    include_never_synced: bool = Query(
        default=True,
        description="Include documents linked to code that have never been generated.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List documents whose linked source code has changed since they were written.

    The work list for keeping documentation current: each item names the
    document, the repository path it describes, the commit it has fallen
    behind, and why it is listed. Detecting this is cheap and needs no model —
    it is path matching against pushes — so the platform tracks it centrally
    and leaves the writing to whoever is best placed to do it.

    Intended to be picked up by a coding agent over MCP. An agent working in
    the repository already has the source in context, so the useful division
    is that this endpoint says *what* needs attention and the agent decides
    what the prose should say, submitting the result through
    `POST /{document_id}/proposed-edits` where a human reviews it.

    `pending_proposal_count` is why an agent should read this before writing:
    an item that already has a proposal waiting has been dealt with, and
    generating another only creates a second thing for someone to review.
    """
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    sync_service = DocumentSyncService(db)
    return await sync_service.list_documents_needing_update(
        workspace_id=workspace_id,
        repository_id=repository_id,
        include_never_synced=include_never_synced,
        limit=limit,
    )


@router.get("/merged-changes", response_model=list[MergedChangeItem])
async def list_merged_changes(
    workspace_id: str,
    repository_id: str | None = Query(
        default=None, description="Restrict to one repository."
    ),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Recently merged pull requests, as candidates for documentation.

    The counterpart to `/needs-update`, which can only find pages that already
    exist and have fallen behind. Most documentation gaps are not stale pages —
    they are changes nobody ever wrote about, and there was no queue for those.

    Merged is the moment worth catching: the person who would know has the whole
    change in their head, and will not in a fortnight.

    Says nothing about whether a change is already documented. `pull_requests`
    does not record the files a pull request touched, so that claim would be a
    guess, and a wrong "already documented" is worse than no badge at all.
    """
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    sync_service = DocumentSyncService(db)
    return await sync_service.list_merged_changes(
        workspace_id=workspace_id,
        repository_id=repository_id,
        limit=limit,
    )


@router.get("/proposed-edits", response_model=list[WorkspaceProposedEdit])
async def list_workspace_proposed_edits(
    workspace_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Every AI-proposed document edit in this workspace awaiting review.

    Until this existed a proposal could only be found by opening the document
    it belonged to, so the only way to discover one was to already suspect it
    was there. That is workable when a person regenerates a single page and
    goes to look; it fails completely once a repository documents itself
    module by module and a single merge leaves proposals on a dozen pages.

    Oldest first — the proposal that has been waiting longest is the one
    holding a document wrong for the longest.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    from sqlalchemy import select as _select
    from sqlalchemy.orm import selectinload as _selectinload

    from aexy.models.documentation import Document as _Doc
    from aexy.models.proposed_change import ProposedChange as _DPE
    from aexy.models.documentation import ProposedEditStatus as _Status

    stmt = (
        _select(_DPE)
        .join(_Doc, _DPE.document_id == _Doc.id)
        .options(_selectinload(_DPE.document))
        .where(_Doc.workspace_id == workspace_id)
        .where(_DPE.status == _Status.PENDING.value)
        .order_by(_DPE.proposed_at.asc())
        .limit(limit)
    )
    proposals = list((await db.execute(stmt)).scalars().all())

    out: list[WorkspaceProposedEdit] = []
    for proposal in proposals:
        document = proposal.document
        if not document:
            continue
        base = _to_proposed_edit_response(
            proposal,
            # Staleness is per-document and each proposal carries the sha it
            # was written against, so it costs nothing extra here.
            is_stale=bool(proposal.base_content_sha)
            and proposal.base_content_sha != compute_content_sha(document.content),
        )
        out.append(
            WorkspaceProposedEdit(
                **base.model_dump(),
                document_title=document.title,
                document_icon=document.icon,
            )
        )
    return out


# ==================== Comments ====================
# NOTE: These routes MUST be before /{document_id} routes to avoid path conflicts


def _comment_to_response(comment) -> DocumentCommentResponse:
    """One comment, with its replies nested for a root comment.

    Only a root comment's ``replies`` is read. Threading is one level, so a reply
    has none — and touching the attribute on a reply loaded via ``selectinload``
    triggers a lazy load that raises MissingGreenlet on an async session, turning
    every thread with a reply in it into a 500.
    """
    replies = (
        [
            _comment_to_response(reply)
            for reply in sorted(comment.replies or [], key=lambda r: r.created_at)
        ]
        if comment.parent_id is None
        else []
    )
    return DocumentCommentResponse(
        id=str(comment.id),
        document_id=str(comment.document_id),
        parent_id=str(comment.parent_id) if comment.parent_id else None,
        author_id=str(comment.author_id) if comment.author_id else None,
        author_name=comment.author.name if comment.author else None,
        author_avatar=comment.author.avatar_url if comment.author else None,
        content=comment.content,
        anchor_id=comment.anchor_id,
        quoted_text=comment.quoted_text,
        is_resolved=comment.is_resolved,
        resolved_by_id=str(comment.resolved_by_id) if comment.resolved_by_id else None,
        resolved_at=comment.resolved_at,
        is_deleted=comment.is_deleted,
        is_edited=comment.is_edited,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        replies=replies,
    )


@router.get("/{document_id}/comments", response_model=DocumentCommentListResponse)
async def list_document_comments(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List a document's comment threads."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentCommentService(db)
    roots, total, unresolved = await service.list_comments(
        workspace_id=workspace_id,
        document_id=document_id,
        developer_id=str(current_user.id),
    )
    return DocumentCommentListResponse(
        comments=[_comment_to_response(c) for c in roots],
        total=total,
        unresolved_count=unresolved,
    )


@router.post(
    "/{document_id}/comments",
    response_model=DocumentCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_document_comment(
    workspace_id: str,
    document_id: str,
    data: DocumentCommentCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Post a comment, or a reply to an existing thread."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentCommentService(db)
    comment = await service.create_comment(
        workspace_id=workspace_id,
        document_id=document_id,
        author_id=str(current_user.id),
        content=data.content,
        parent_id=data.parent_id,
        anchor_id=data.anchor_id,
        quoted_text=data.quoted_text,
    )
    return _comment_to_response(comment)


@router.patch(
    "/{document_id}/comments/{comment_id}", response_model=DocumentCommentResponse
)
async def update_document_comment(
    workspace_id: str,
    document_id: str,
    comment_id: str,
    data: DocumentCommentUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Edit your own comment."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentCommentService(db)
    comment = await service.update_comment(
        workspace_id=workspace_id,
        document_id=document_id,
        comment_id=comment_id,
        developer_id=str(current_user.id),
        content=data.content,
    )
    return _comment_to_response(comment)


@router.delete(
    "/{document_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_document_comment(
    workspace_id: str,
    document_id: str,
    comment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete your own comment, keeping its place in the thread."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentCommentService(db)
    await service.delete_comment(
        workspace_id=workspace_id,
        document_id=document_id,
        comment_id=comment_id,
        developer_id=str(current_user.id),
    )


@router.post(
    "/{document_id}/comments/{comment_id}/resolve",
    response_model=DocumentCommentResponse,
)
async def resolve_document_comment(
    workspace_id: str,
    document_id: str,
    comment_id: str,
    resolved: bool = Query(default=True),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resolve or reopen a thread."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentCommentService(db)
    comment = await service.set_resolved(
        workspace_id=workspace_id,
        document_id=document_id,
        comment_id=comment_id,
        developer_id=str(current_user.id),
        resolved=resolved,
    )
    return _comment_to_response(comment)


# ==================== Document CRUD (parameterized routes) ====================


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a document by ID."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)
    document = await service.get_document(document_id, workspace_id)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    return document_to_response(document)


def is_agent_request(request: Request) -> bool:
    """Did this come from an agent acting for someone, or from a person?

    Reads the `actor` claim of the verified token, recorded on the request by
    `get_current_developer_id`. It used to read a request header, which the
    caller sets — so an agent holding an ordinary token and calling this API
    directly wrote straight through, and the review gate was opt-in by the
    agent. A forged header could only ever *restrict* the forger, so it was
    never an escalation path; the hole was the other direction, in the promise
    that an agent's write always lands as a proposal.

    Only endpoints depending on `get_current_developer` (or
    `get_current_developer_id`) can read this — those are what record the claim.
    On an optional-auth route it would read as "a person", so an endpoint that
    wants this decision has to require authentication first.
    """
    from aexy.api.developers import AGENT_ACTOR

    return getattr(request.state, "token_actor", None) == AGENT_ACTOR


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    workspace_id: str,
    document_id: str,
    data: DocumentUpdate,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a document.

    A person editing writes straight through. An agent rewriting the *body* of
    a document that already has one does not: that content is proposed, and
    somebody approves it. An agent has no way to know which sentences a human
    wrote and cared about, and a silent overwrite leaves nothing to compare
    against — the version history records what changed but never that anyone
    disagreed.

    Title, icon and visibility still apply directly for an agent. They are
    small, obvious and trivially reversible; making someone approve a rename
    is the kind of friction that gets a gate switched off.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Check document exists in workspace
    existing = await service.get_document(document_id, workspace_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if (
        data.content is not None
        and is_agent_request(request)
        and (existing.content or {}).get("content")
    ):
        proposed_edits = ProposedEditsService(db)
        await proposed_edits.create_proposal(
            document_id=document_id,
            source=ProposedEditSource.MANUAL_AI_EDIT,
            proposed_content=data.content,
            proposed_by_id=str(current_user.id),
        )
        await db.commit()
        # The document is returned unchanged, deliberately. An agent that read
        # back its own write and saw its text would report success for a change
        # nobody has approved yet.
        return document_to_response(existing)

    document = await service.update_document(
        document_id=document_id,
        updated_by_id=str(current_user.id),
        title=data.title,
        content=data.content,
        icon=data.icon,
        cover_image=data.cover_image,
        visibility=data.visibility,
        is_auto_save=data.is_auto_save,
    )

    return document_to_response(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and its children."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    deleted = await service.delete_document(document_id, workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )


@router.post("/{document_id}/move", response_model=DocumentResponse)
async def move_document(
    workspace_id: str,
    document_id: str,
    data: DocumentMoveRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Move a document to a new parent and/or position."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    document = await service.move_document(
        document_id=document_id,
        workspace_id=workspace_id,
        new_parent_id=data.new_parent_id,
        position=data.position,
    )

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    return document_to_response(document)


@router.post("/{document_id}/duplicate", response_model=DocumentResponse)
async def duplicate_document(
    workspace_id: str,
    document_id: str,
    include_children: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a document."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    document = await service.duplicate_document(
        document_id=document_id,
        workspace_id=workspace_id,
        duplicated_by_id=str(current_user.id),
        include_children=include_children,
    )

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    return document_to_response(document)


# ==================== Version History ====================


@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
async def get_version_history(
    workspace_id: str,
    document_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get version history for a document."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)

    # Verify document exists in workspace
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    versions = await service.get_version_history(document_id, limit, offset)

    return [
        DocumentVersionResponse(
            id=str(v.id),
            document_id=str(v.document_id),
            version_number=v.version_number,
            content=v.content,
            content_diff=v.content_diff,
            created_by_id=str(v.created_by_id) if v.created_by_id else None,
            created_by_name=v.created_by.name if v.created_by else None,
            created_by_avatar=v.created_by.avatar_url if v.created_by else None,
            change_summary=v.change_summary,
            is_auto_save=v.is_auto_save,
            is_auto_generated=v.is_auto_generated,
            created_at=v.created_at,
        )
        for v in versions
    ]


@router.post("/{document_id}/restore/{version_id}", response_model=DocumentResponse)
async def restore_version(
    workspace_id: str,
    document_id: str,
    version_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Restore a document to a previous version."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Verify document exists in workspace
    existing = await service.get_document(document_id, workspace_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    document = await service.restore_version(
        document_id=document_id,
        version_id=version_id,
        restored_by_id=str(current_user.id),
    )

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )

    return document_to_response(document)


# ==================== Code Links ====================


def _code_link_to_response(link) -> CodeLinkResponse:
    """One shape for a code link, however it was reached.

    Three byte-identical constructions had accumulated across create, list and
    transfer; a fourth was about to. Each new column on the model meant finding
    every copy, and the one that got missed would silently serve a default.
    """
    return CodeLinkResponse(
        id=str(link.id),
        document_id=str(link.document_id),
        repository_id=str(link.repository_id),
        repository_name=link.repository.full_name if link.repository else None,
        path=link.path,
        link_type=link.link_type,
        branch=link.branch,
        document_section_id=link.document_section_id,
        last_commit_sha=link.last_commit_sha,
        last_content_hash=link.last_content_hash,
        last_synced_at=link.last_synced_at,
        has_pending_changes=link.has_pending_changes,
        owner_developer_id=(
            str(link.owner_developer_id) if link.owner_developer_id else None
        ),
        sync_mode=link.sync_mode,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


@router.post("/{document_id}/code-links", response_model=CodeLinkResponse)
async def create_code_link(
    workspace_id: str,
    document_id: str,
    data: CodeLinkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a link between document and source code."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Verify document exists in workspace
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    link = await service.create_code_link(
        document_id=document_id,
        repository_id=data.repository_id,
        path=data.path,
        link_type=data.link_type,
        branch=data.branch,
        section_id=data.section_id,
        owner_developer_id=str(current_user.id),
    )

    return _code_link_to_response(link)


@router.get("/{document_id}/code-links", response_model=list[CodeLinkResponse])
async def get_code_links(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all code links for a document."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)

    # Verify document exists in workspace
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    links = await service.get_code_links(document_id)

    return [
        _code_link_to_response(link)
        for link in links
    ]


@router.delete(
    "/{document_id}/code-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_code_link(
    workspace_id: str,
    document_id: str,
    link_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a code link."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    deleted = await service.delete_code_link(link_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code link not found",
        )


@router.patch(
    "/{document_id}/code-links/{link_id}/sync-mode", response_model=CodeLinkResponse
)
async def set_code_link_sync_mode(
    workspace_id: str,
    document_id: str,
    link_id: str,
    data: CodeLinkSyncModeUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Choose what happens to this document when its code changes.

    `propose` queues an update for review — the default, and the only safe
    answer for a page people have written by hand. `auto` applies updates
    without asking, and is honoured only where the update was derived from the
    existing prose; a full regeneration falls back to proposing, because it
    cannot know a human wrote anything. `off` stops watching entirely,
    including the "behind" badge — a document nobody wants updated should not
    keep being reported as wrong.

    The off switch is not a concession. A queue that fills faster than anyone
    drains it is one people stop opening, and that costs more than the setting.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    link = await service.set_code_link_sync_mode(
        link_id=link_id,
        document_id=document_id,
        sync_mode=data.sync_mode,
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code link not found",
        )

    return _code_link_to_response(link)


@router.post(
    "/{document_id}/code-links/{link_id}/transfer", response_model=CodeLinkResponse
)
async def transfer_code_link_owner(
    workspace_id: str,
    document_id: str,
    link_id: str,
    data: CodeLinkTransfer,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Hand a sync to someone else.

    Departure is handled automatically, but people change teams long before
    they leave, and a sync whose owner has moved on is one whose plan tier and
    GitHub access no longer reflect who is actually looking after it.

    The new owner must be a member of this workspace: ownership carries a
    credential fallback, so handing a sync to an outsider would be a way to read
    a repository through someone else's installation.

    Who may move it: the current owner, handing on their own sync, or an admin.
    Any member could before, which is a wider grant than it looks — ownership
    decides the plan tier the sync runs on and whose LLM spend it is, so an
    unrestricted transfer is a way to bill a colleague for real-time
    regeneration you are not entitled to, and to reach a repository through the
    installation of whoever you assigned it to. The same reasoning already gates
    agent-action approval to admins.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    workspace_service = WorkspaceService(db)

    link_now = await service.get_code_link(link_id, document_id)
    if not link_now:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code link not found",
        )
    is_current_owner = str(link_now.owner_developer_id or "") == str(current_user.id)
    if not is_current_owner and not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only this sync's owner or a workspace admin can transfer it"
            ),
        )
    if not await workspace_service.check_permission(
        workspace_id, data.owner_developer_id, "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new owner must be a member of this workspace",
        )

    link = await service.set_code_link_owner(
        link_id=link_id,
        document_id=document_id,
        owner_developer_id=data.owner_developer_id,
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code link not found",
        )

    return _code_link_to_response(link)


# ==================== Collaborators ====================


@router.post("/{document_id}/collaborators", response_model=CollaboratorResponse)
async def add_collaborator(
    workspace_id: str,
    document_id: str,
    data: CollaboratorAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a collaborator to a document."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Verify document exists and user has admin permission
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Only creator or admin can add collaborators
    if document.created_by_id != str(current_user.id):
        has_permission = await service.check_permission(
            document_id, str(current_user.id), DocumentPermission.ADMIN.value
        )
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to add collaborators",
            )

    collaborator = await service.add_collaborator(
        document_id=document_id,
        developer_id=data.developer_id,
        permission=data.permission,
        invited_by_id=str(current_user.id),
    )

    return CollaboratorResponse(
        id=str(collaborator.id),
        document_id=str(collaborator.document_id),
        developer_id=str(collaborator.developer_id),
        developer_name=collaborator.developer.name if collaborator.developer else None,
        developer_email=collaborator.developer.email if collaborator.developer else None,
        developer_avatar=collaborator.developer.avatar_url
        if collaborator.developer
        else None,
        permission=collaborator.permission,
        invited_by_id=str(collaborator.invited_by_id)
        if collaborator.invited_by_id
        else None,
        invited_by_name=collaborator.invited_by.name
        if collaborator.invited_by
        else None,
        invited_at=collaborator.invited_at,
    )


@router.patch(
    "/{document_id}/collaborators/{developer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def update_collaborator(
    workspace_id: str,
    document_id: str,
    developer_id: str,
    data: CollaboratorUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a collaborator's permission."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Verify permission to update
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.created_by_id != str(current_user.id):
        has_permission = await service.check_permission(
            document_id, str(current_user.id), DocumentPermission.ADMIN.value
        )
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update collaborators",
            )

    updated = await service.update_collaborator_permission(
        document_id=document_id,
        developer_id=developer_id,
        permission=data.permission,
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collaborator not found",
        )


@router.delete(
    "/{document_id}/collaborators/{developer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_collaborator(
    workspace_id: str,
    document_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a collaborator from a document."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Verify permission
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if document.created_by_id != str(current_user.id):
        has_permission = await service.check_permission(
            document_id, str(current_user.id), DocumentPermission.ADMIN.value
        )
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to remove collaborators",
            )

    removed = await service.remove_collaborator(
        document_id=document_id,
        developer_id=developer_id,
    )

    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collaborator not found",
        )


# ==================== AI Generation ====================


async def _repository_reader(db: AsyncSession, repository_id: str, developer_id: str):
    """Resolve a repository and a client the generation service can call.

    Access is resolved against the repository account first and the requesting
    developer second — the same order the background sync uses, so an
    interactive generation and an automated one succeed and fail together
    rather than for different reasons.
    """
    from aexy.services.repository_service import RepositoryService

    repo = await RepositoryService(db).get_repository_by_id(repository_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found"
        )

    app_service = GitHubAppService(db)
    access = await app_service.resolve_repository_access(repo, developer_id)
    if not access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"No GitHub App installation covers {repo.owner_login}. "
                "Install the app for that account first."
            ),
        )

    installation_id, _token = access
    return repo, GitHubServiceAdapter(
        app_service=app_service,
        installation_id=installation_id,
        owner=repo.owner_login,
        repo=repo.name,
    )


def _generation_http_error(exc: Exception) -> HTTPException:
    """Map an LLM failure onto a status a caller can act on.

    Rate limiting and an unavailable provider call for different responses —
    wait, versus try later or check configuration — and collapsing both into a
    500 tells the user to do the one thing that cannot help.
    """
    from aexy.llm.base import LLMAPIError, LLMRateLimitError

    if isinstance(exc, LLMRateLimitError):
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI service rate limit exceeded. Please wait a few minutes and try again.",
        )
    if isinstance(exc, LLMAPIError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service error: {str(exc)}",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Failed to generate documentation: {str(exc)}",
    )


@router.post("/{document_id}/generate")
async def generate_documentation(
    workspace_id: str,
    document_id: str,
    template_category: str = Query(default="function_docs"),
    apply: bool = Query(
        default=False,
        description=(
            "Legacy escape hatch: when true, overwrite the document "
            "directly (pre-0.8.26 behaviour). Default false routes the "
            "generated content into the proposed-edits review queue, "
            "where the user approves or rejects before it lands."
        ),
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Generate documentation for a document from linked code.

    Default behaviour (apply=false): generates docs and creates a
    `pending` DocumentProposedEdit row instead of overwriting the
    document. Caller is expected to review and approve through the
    proposed-edits endpoints below.

    Legacy behaviour (apply=true): overwrites `document.content`
    immediately. Use only for migrations / scripted runs that have
    already pre-vetted the output.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)

    # Get the document
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Get code links
    code_links = await doc_service.get_code_links(document_id)
    if not code_links:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No code links found. Please link source code to this document first.",
        )

    # For now, use the first code link
    code_link = code_links[0]

    # Get the category enum
    try:
        category = TemplateCategory(template_category)
    except ValueError:
        category = TemplateCategory.FUNCTION_DOCS

    # Generate documentation
    gen_service = DocumentGenerationService(db, workspace_id=workspace_id)

    try:
        # Import GitHub service to fetch code
        from aexy.services.github_service import GitHubService

        github_service = GitHubService(db)

        # Fetch repository info
        if not code_link.repository:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repository not found for code link",
            )

        content = await gen_service.generate_from_repository(
            github_service=github_service,
            repository_full_name=code_link.repository.full_name,
            path=code_link.path,
            template_category=category,
            branch=code_link.branch or "main",
            developer_id=str(current_user.id),
        )

        if apply:
            # Legacy overwrite path. The audit flagged this as user-
            # hostile (no preview, no rollback short of version history)
            # — kept here only for callers that explicitly opt in.
            updated_doc = await doc_service.update_document(
                document_id=document_id,
                updated_by_id=str(current_user.id),
                content=content,
            )
            updated_doc.generation_status = "generated"
            updated_doc.last_generated_at = datetime.now(timezone.utc)
            await db.commit()

            return {
                "status": "success",
                "applied": True,
                "document_id": document_id,
                "content": content,
            }

        # New default: route through the proposed-edit queue.
        proposed_edits = ProposedEditsService(db)
        proposal = await proposed_edits.create_proposal(
            document_id=document_id,
            source=ProposedEditSource.REGENERATE,
            proposed_content=content,
            proposed_by_id=str(current_user.id),
        )
        await db.commit()

        return {
            "status": "proposed",
            "applied": False,
            "document_id": document_id,
            "proposed_edit_id": proposal.id,
            "content": content,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate documentation: {str(e)}",
        )


@router.post("/generate-from-code")
async def generate_from_code(
    workspace_id: str,
    data: GenerateFromCodeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Generate documentation from source code pasted into the request body.

    Produces content only; nothing is saved. Pasted code has no repository
    path to point at, so there is nothing to keep it in sync with afterwards —
    for a document that stays current, use `/from-repository`.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    gen_service = DocumentGenerationService(db, workspace_id=workspace_id)
    category = TemplateCategory(data.template_category)

    try:
        content = await gen_service.generate_from_code(
            code=data.code,
            template_category=category,
            file_path=data.file_path,
            language=data.language,
            developer_id=str(current_user.id),
        )

        return {
            "status": "success",
            "content": gen_service.ensure_renderable(content, category),
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate documentation: {str(e)}",
        )


async def _repository_or_404(db: AsyncSession, repository_id: str):
    from aexy.services.repository_service import RepositoryService

    repo = await RepositoryService(db).get_repository_by_id(repository_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found"
        )
    return repo


async def _create_linked_document(
    *,
    db: AsyncSession,
    doc_service: DocumentService,
    data: GenerateFromRepositoryRequest,
    repo,
    content: dict,
    category: TemplateCategory,
    developer_id: str,
    workspace_id: str,
) -> LinkedDocumentResponse:
    """The document, its link and its place in the tree, in one transaction."""
    document = await doc_service.create_document(
        workspace_id=workspace_id,
        created_by_id=developer_id,
        title=data.title or f"{repo.name}/{data.path}".rstrip("/"),
        content=content,
        # A whole-repository pass hangs a child under a parent overview, so one
        # module can later be revised without touching the rest.
        parent_id=data.parent_id,
        icon="📁" if data.link_type == "directory" else "📄",
    )
    link = await doc_service.create_code_link(
        document_id=str(document.id),
        repository_id=data.repository_id,
        path=data.path,
        link_type=data.link_type,
        branch=data.branch,
        owner_developer_id=developer_id,
        template_category=category.value,
    )
    # The prose was written from the tip of this branch, so that is the base
    # the next change should be diffed against.
    link.last_synced_at = datetime.now(timezone.utc)
    document.generation_status = "generated"
    document.last_generated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(link)

    return LinkedDocumentResponse(
        document=document_to_response(document),
        code_link=_code_link_to_response(link),
    )


async def _revise_linked_document(
    *,
    db: AsyncSession,
    data: GenerateFromRepositoryRequest,
    link,
    gen_service: DocumentGenerationService,
    developer_id: str,
    workspace_id: str,
) -> LinkedDocumentResponse:
    """This path is already documented, so propose rather than duplicate.

    Returns the existing document unchanged. The rewrite waits in the review
    queue — a re-run over a repository somebody has already reviewed must not
    silently replace their edits with a fresh generation, and it must not
    create a second document for the same module either.
    """
    doc_service = DocumentService(db)
    document = await doc_service.get_document(str(link.document_id), workspace_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{data.path} is linked to a document that no longer exists. "
                "Remove the stale link and try again."
            ),
        )

    if data.markdown is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{data.path} is already documented by \"{document.title}\". "
                "Send `markdown` to propose a revision, or use the regenerate "
                "endpoint on that document."
            ),
        )

    try:
        content = markdown_to_tiptap(data.markdown)
    except MarkdownError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    proposed_edits = ProposedEditsService(db)
    await proposed_edits.create_proposal(
        document_id=str(document.id),
        source=ProposedEditSource.MANUAL_AI_EDIT,
        proposed_content=content,
        proposed_by_id=developer_id,
        diff_summary={"summary": f"Re-documented {data.path}"},
    )
    await db.commit()
    await db.refresh(link)

    return LinkedDocumentResponse(
        document=document_to_response(document),
        code_link=_code_link_to_response(link),
    )


@router.post(
    "/from-repository",
    response_model=LinkedDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_document_from_repository(
    workspace_id: str,
    data: GenerateFromRepositoryRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Write a document from a repository path, and link it to that path.

    The link is the point. Generation already knows the repository, the branch
    and the path; creating the document without recording them throws away the
    only thing that lets it ever be told the code has moved. Every piece of
    machinery behind this — change detection, the review queue, the freshness
    badge, the work list an agent reads — keys off `document_code_links`, and
    until this endpoint existed nothing in the product wrote a row to it.

    One transaction, deliberately. Two client calls would leave a half-created
    state on any failure: a document that looks generated and will never
    notice a change, which is precisely the failure being removed.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)
    gen_service = DocumentGenerationService(db, workspace_id=workspace_id)
    category = TemplateCategory(data.template_category)

    # Already documented? Then this is a revision, not a second document.
    # A whole-repository pass is re-run — after a refactor, or because the
    # first attempt was thin — and creating a parallel document per module
    # each time would bury the reviewed one under near-duplicates nobody can
    # tell apart.
    existing = await doc_service.find_code_link(
        workspace_id=workspace_id,
        repository_id=data.repository_id,
        path=data.path,
    )
    if existing is not None:
        return await _revise_linked_document(
            db=db,
            data=data,
            link=existing,
            gen_service=gen_service,
            developer_id=str(current_user.id),
            workspace_id=workspace_id,
        )

    if data.markdown is not None:
        # The caller wrote it. Nothing to generate, and nothing to pay for.
        try:
            content = markdown_to_tiptap(data.markdown)
        except MarkdownError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            )
        repo = await _repository_or_404(db, data.repository_id)
        return await _create_linked_document(
            db=db,
            doc_service=doc_service,
            data=data,
            repo=repo,
            content=content,
            category=category,
            developer_id=str(current_user.id),
            workspace_id=workspace_id,
        )

    repo, github_adapter = await _repository_reader(
        db, repository_id=data.repository_id, developer_id=str(current_user.id)
    )

    try:
        if data.link_type == "file":
            # A single file is documented from its own contents; the category
            # is meaningful here, which is why the UI only offers it for files.
            content = await gen_service.generate_from_repository(
                github_service=github_adapter,
                repository_full_name=repo.full_name,
                path=data.path,
                template_category=category,
                branch=data.branch,
                developer_id=str(current_user.id),
            )
        else:
            content = await gen_service.generate_module_documentation(
                github_service=github_adapter,
                repository_full_name=repo.full_name,
                directory_path=data.path or ".",
                branch=data.branch,
                developer_id=str(current_user.id),
                custom_prompt=data.custom_prompt,
            )
    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API error: {str(e)}",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise _generation_http_error(e)

    return await _create_linked_document(
        db=db,
        doc_service=doc_service,
        data=data,
        repo=repo,
        content=gen_service.ensure_renderable(content, category),
        category=category,
        developer_id=str(current_user.id),
        workspace_id=workspace_id,
    )


@router.post("/generate-from-repository")
async def generate_from_repository(
    workspace_id: str,
    repository_id: str = Query(..., description="Repository ID"),
    path: str = Query("", description="Directory path within repository"),
    branch: str = Query("main", description="Branch name"),
    template_category: str = Query(
        default="module_docs",
        deprecated=True,
        description=(
            "Ignored. This endpoint always produces module documentation; "
            "`generate_module_documentation` takes no template. Kept so existing "
            "callers do not break."
        ),
    ),
    custom_prompt: str | None = Query(default=None, description="Custom instructions for documentation generation"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Generate documentation from a repository directory.

    Analyzes the directory structure and key files to generate comprehensive documentation.
    Optionally accepts a custom prompt to guide the AI generation.

    Always generates *module* documentation. `template_category` was converted to a
    `TemplateCategory` here and then never passed on — the downstream
    `generate_module_documentation` has no such parameter — so a caller asking for
    `api_docs` silently got module docs. The parameter is marked deprecated rather
    than removed, and the dead conversion is gone; honouring it means giving the
    service a template argument, which is a larger change than making the current
    behaviour honest.
    """
    from aexy.services.github_app_service import GitHubAppError
    from aexy.services.repository_service import RepositoryService

    await check_workspace_permission(workspace_id, current_user, db, "member")

    repo_service = RepositoryService(db)
    app_service = GitHubAppService(db)

    try:
        # Get the repository
        repo = await repo_service.get_repository_by_id(repository_id)
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found",
            )

        # Get installation token for the developer
        token_result = await app_service.get_installation_token_for_developer(
            str(current_user.id), repo.owner_login
        )
        if not token_result:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No GitHub App installation found. Please install the app first.",
            )

        _, installation_id = token_result

        # Create adapter for the document generation service
        github_adapter = GitHubServiceAdapter(
            app_service=app_service,
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
        )

        gen_service = DocumentGenerationService(db, workspace_id=workspace_id)

        # Generate documentation
        content = await gen_service.generate_module_documentation(
            github_service=github_adapter,
            repository_full_name=repo.full_name,
            directory_path=path or ".",
            branch=branch,
            developer_id=str(current_user.id),
            custom_prompt=custom_prompt,
        )

        return {
            "status": "success",
            "content": content,
            "repository": repo.full_name,
            "path": path or ".",
            "branch": branch,
        }

    except HTTPException:
        raise
    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"GitHub API error: {str(e)}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        from aexy.llm.base import LLMRateLimitError, LLMAPIError

        # Check for LLM-specific errors
        if isinstance(e, LLMRateLimitError):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI service rate limit exceeded. Please wait a few minutes and try again.",
            )
        if isinstance(e, LLMAPIError):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"AI service error: {str(e)}",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate documentation: {str(e)}",
        )


@router.post("/{document_id}/suggest-improvements")
async def suggest_improvements(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get AI-powered improvement suggestions for a document."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    doc_service = DocumentService(db)

    # Get the document
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    gen_service = DocumentGenerationService(db, workspace_id=workspace_id)

    try:
        suggestions = await gen_service.suggest_improvements(
            documentation=document.content,
            developer_id=str(current_user.id),
        )

        return {
            "status": "success",
            "document_id": document_id,
            "suggestions": suggestions,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze documentation: {str(e)}",
        )


@router.post("/{document_id}/suggest-improvements/apply")
async def apply_suggestion(
    workspace_id: str,
    document_id: str,
    data: ApplySuggestionRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Take an improvement suggestion produced by `suggest-improvements`,
    run it through `update_documentation`, and land the result as a
    pending proposed-edit (source=suggest_improvements). The user
    approves through the same banner UI as regenerate flows.

    Does not mutate the document — the proposal queue is the user's
    confirmation step.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    gen_service = DocumentGenerationService(db, workspace_id=workspace_id)
    try:
        # No linked code is required — improvements act on the
        # documentation itself, not on a referenced repo path. We pass
        # the existing content as both "old" and "new" code stand-ins
        # so the update prompt has the right context to rewrite.
        update_result = await gen_service.update_documentation(
            existing_doc=document.content or {"type": "doc", "content": []},
            old_code="",
            new_code="",
            language=None,
            changes_summary=data.suggestion_summary,
            developer_id=str(current_user.id),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply suggestion: {str(e)}",
        )

    proposed_content = update_result.get("updated_doc") or update_result
    if not isinstance(proposed_content, dict):
        proposed_content = {"type": "doc", "content": []}

    proposed_edits = ProposedEditsService(db)
    proposal = await proposed_edits.create_proposal(
        document_id=document_id,
        source=ProposedEditSource.SUGGEST_IMPROVEMENTS,
        proposed_content=proposed_content,
        proposed_by_id=str(current_user.id),
        diff_summary={"suggestion": data.suggestion_summary},
    )
    await db.commit()

    return {
        "status": "proposed",
        "document_id": document_id,
        "proposed_edit_id": proposal.id,
    }


# ==================== GitHub Sync ====================


@router.post("/{document_id}/github-sync")
async def setup_github_sync(
    workspace_id: str,
    document_id: str,
    repository_id: str = Query(..., description="Repository ID to sync with"),
    file_path: str = Query(..., description="Path in repo (e.g., docs/README.md)"),
    branch: str = Query(default="main"),
    sync_direction: str = Query(default="bidirectional", description="export_only, import_only, or bidirectional"),
    auto_export: bool = Query(default=False),
    auto_import: bool = Query(default=False),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Set up GitHub sync for a document."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)

    # Verify document exists
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    from aexy.services.github_sync_service import GitHubSyncService

    sync_service = GitHubSyncService(db)
    sync_config = await sync_service.setup_sync(
        document_id=document_id,
        repository_id=repository_id,
        file_path=file_path,
        branch=branch,
        sync_direction=sync_direction,
        auto_export=auto_export,
        auto_import=auto_import,
    )

    return {
        "id": str(sync_config.id),
        "document_id": str(sync_config.document_id),
        "repository_id": str(sync_config.repository_id),
        "file_path": sync_config.file_path,
        "branch": sync_config.branch,
        "sync_direction": sync_config.sync_direction,
        "auto_export": sync_config.auto_export,
        "auto_import": sync_config.auto_import,
        "created_at": sync_config.created_at.isoformat(),
    }


@router.get("/{document_id}/github-sync")
async def get_github_sync_configs(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all GitHub sync configurations for a document."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    from aexy.services.github_sync_service import GitHubSyncService

    sync_service = GitHubSyncService(db)
    configs = await sync_service.get_sync_configs(document_id)

    return [
        {
            "id": str(config.id),
            "document_id": str(config.document_id),
            "repository_id": str(config.repository_id),
            "repository_name": config.repository.full_name if config.repository else None,
            "file_path": config.file_path,
            "branch": config.branch,
            "sync_direction": config.sync_direction,
            "auto_export": config.auto_export,
            "auto_import": config.auto_import,
            "last_exported_at": config.last_exported_at.isoformat() if config.last_exported_at else None,
            "last_imported_at": config.last_imported_at.isoformat() if config.last_imported_at else None,
            "last_export_commit": config.last_export_commit,
            "last_import_commit": config.last_import_commit,
            "created_at": config.created_at.isoformat(),
        }
        for config in configs
    ]


@router.post("/{document_id}/github-sync/{sync_id}/export")
async def export_to_github(
    workspace_id: str,
    document_id: str,
    sync_id: str,
    commit_message: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Export document to GitHub as markdown."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    from aexy.services.github_sync_service import GitHubSyncService

    sync_service = GitHubSyncService(db)

    try:
        result = await sync_service.export_to_github(
            sync_id=sync_id,
            developer_id=str(current_user.id),
            commit_message=commit_message,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export: {str(e)}",
        )


@router.post("/{document_id}/github-sync/{sync_id}/import")
async def import_from_github(
    workspace_id: str,
    document_id: str,
    sync_id: str,
    create_version: bool = Query(default=True, description="Create version before overwriting"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import document from GitHub markdown file."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    from aexy.services.github_sync_service import GitHubSyncService

    sync_service = GitHubSyncService(db)

    try:
        result = await sync_service.import_from_github(
            sync_id=sync_id,
            developer_id=str(current_user.id),
            create_version=create_version,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import: {str(e)}",
        )


@router.delete("/{document_id}/github-sync/{sync_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_github_sync(
    workspace_id: str,
    document_id: str,
    sync_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a GitHub sync configuration."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    from aexy.services.github_sync_service import GitHubSyncService

    sync_service = GitHubSyncService(db)
    deleted = await sync_service.delete_sync(sync_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync configuration not found",
        )


@router.post("/{document_id}/favorite")
async def toggle_favorite(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Toggle favorite status for a document."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)

    # Verify document exists
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    is_favorited = await service.toggle_favorite(
        document_id=document_id,
        developer_id=str(current_user.id),
    )

    return {"is_favorited": is_favorited}


# ==================== Ancestors (Breadcrumbs) ====================


@router.get("/{document_id}/ancestors", response_model=list[DocumentAncestorResponse])
async def get_ancestors(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get ancestors of a document for breadcrumb navigation."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)

    # Verify document exists
    document = await service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    ancestors = await service.get_ancestors(document_id)
    return ancestors


# ==================== Templates Router ====================


def _template_to_response(template) -> TemplateResponse:
    """One row — or one catalogue entry wearing a row's shape — as the API sees it.

    The same fifteen lines were written out at each of the four endpoints that
    return a template, which is three more places to forget a new field in.
    """
    return TemplateResponse(
        id=str(template.id),
        workspace_id=str(template.workspace_id) if template.workspace_id else None,
        name=template.name,
        description=template.description,
        category=template.category,
        icon=template.icon,
        content_template=template.content_template,
        prompt_template=template.prompt_template,
        system_prompt=template.system_prompt,
        variables=template.variables,
        is_system=template.is_system,
        is_active=template.is_active,
        created_by_id=str(template.created_by_id) if template.created_by_id else None,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@template_router.get("", response_model=list[TemplateListResponse])
async def list_templates(
    workspace_id: str | None = None,
    category: str | None = None,
    include_system: bool = True,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available templates."""
    # Templates are part of the docs module: when scoped to a workspace, honor
    # its module toggle. Unscoped calls (system templates only) stay open.
    if workspace_id:
        await ensure_app_enabled(db, workspace_id, "docs")

    service = DocumentService(db)
    templates = await service.list_templates(
        workspace_id=workspace_id,
        category=category,
        include_system=include_system,
    )

    return [
        TemplateListResponse(
            id=str(t.id),
            name=t.name,
            description=t.description,
            category=t.category,
            icon=t.icon,
            is_system=t.is_system,
            variables=t.variables,
        )
        for t in templates
    ]


@template_router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a template by ID."""
    service = DocumentService(db)
    template = await service.get_template(template_id)

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # Workspace-owned templates are gated by the docs module toggle; system
    # templates (no workspace) stay open.
    if template.workspace_id:
        await ensure_app_enabled(db, str(template.workspace_id), "docs")

    return _template_to_response(template)


@template_router.post(
    "", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED
)
async def create_template(
    data: TemplateCreate,
    workspace_id: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom template."""
    await ensure_app_enabled(db, workspace_id, "docs")
    # Check workspace permission
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to create templates in this workspace",
        )

    service = DocumentService(db)
    template = await service.create_template(
        workspace_id=workspace_id,
        created_by_id=str(current_user.id),
        name=data.name,
        category=data.category,
        content_template=data.content_template,
        prompt_template=data.prompt_template,
        variables=data.variables,
        description=data.description,
        icon=data.icon,
        system_prompt=data.system_prompt,
    )

    return _template_to_response(template)


@template_router.post("/{template_id}/duplicate", response_model=TemplateResponse)
async def duplicate_template(
    template_id: str,
    workspace_id: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a template for customization."""
    await ensure_app_enabled(db, workspace_id, "docs")
    # Check workspace permission
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to create templates in this workspace",
        )

    service = DocumentService(db)
    template = await service.duplicate_template(
        template_id=template_id,
        workspace_id=workspace_id,
        duplicated_by_id=str(current_user.id),
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    return _template_to_response(template)


async def _require_template_author(
    workspace_id: str, current_user: Developer, db: AsyncSession
) -> None:
    """Same gate as creating one: a member may curate this workspace's templates."""
    await ensure_app_enabled(db, workspace_id, "docs")
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to manage templates in this workspace",
        )


@template_router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: str,
    data: TemplateUpdate,
    workspace_id: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Rename or re-body one of this workspace's own templates.

    A system template is not editable — it ships with the code. Forking it
    (`POST /{id}/duplicate`) is what gives a workspace a version it can change,
    so this 404s on a `sys:` id rather than pretending to save.
    """
    await _require_template_author(workspace_id, current_user, db)

    # `exclude_unset` so an omitted field is left alone while an explicit `null`
    # clears it — the two are different requests and should not collapse.
    template = await DocumentService(db).update_workspace_template(
        template_id,
        workspace_id,
        data.model_dump(exclude_unset=True),
    )
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found in this workspace",
        )

    return _template_to_response(template)


@template_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    workspace_id: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Retire one of this workspace's templates.

    Deactivates rather than deletes, so a mis-click is recoverable in the database
    even though the UI stops offering it. System templates cannot be retired: they
    are not rows, and hiding one per workspace would need a preference this does
    not have.
    """
    await _require_template_author(workspace_id, current_user, db)

    if not await DocumentService(db).delete_workspace_template(template_id, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found in this workspace",
        )


# =============================================================================
# Proposed Edits — AI suggestion review queue
# =============================================================================
#
# Sits between AI-generated content and the canonical document. The
# legacy {doc_id}/generate path now defaults to creating a proposal
# (see `apply=true` query param for back-compat). Once we have the
# approval/reject flow nailed down, sync + suggest_improvements will
# also route through this queue.


def _to_proposed_edit_response(
    proposal,
    is_stale: bool,
) -> ProposedEditResponse:
    return ProposedEditResponse(
        id=str(proposal.id),
        document_id=str(proposal.document_id),
        source=proposal.source,
        proposed_content=proposal.proposed_content,
        base_content_sha=proposal.base_content_sha,
        diff_summary=proposal.diff_summary,
        status=proposal.status,
        proposed_by_id=str(proposal.proposed_by_id) if proposal.proposed_by_id else None,
        proposed_at=proposal.proposed_at,
        reviewed_by_id=str(proposal.reviewed_by_id) if proposal.reviewed_by_id else None,
        reviewed_at=proposal.reviewed_at,
        reason=proposal.reason,
        is_stale=is_stale,
    )


@router.post(
    "/{document_id}/propose",
    response_model=ProposedEditResponse,
    status_code=status.HTTP_201_CREATED,
)
async def propose_document_update(
    workspace_id: str,
    document_id: str,
    data: ProposeMarkdownRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Propose a rewrite of this document, written in Markdown.

    The way anything that is not the editor should write a document. Send
    Markdown; the server decides what the document becomes. Editor JSON is not
    accepted from clients — it would mean trusting an outside writer to know a
    schema it cannot see, and the failure is silent: one invalid node makes the
    editor render a blank page, so a bad write looks like an empty document
    rather than an error.

    Nothing is applied. The result waits in the workspace's review queue with
    a readable diff against the current text. For an agent this is the point:
    you have the source in front of you and can say what the page should now
    say, and the person who owns the page decides whether it does.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    try:
        content = markdown_to_tiptap(data.markdown)
    except MarkdownError as exc:
        # Rejected at the boundary rather than saved and discovered later.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    proposed_edits = ProposedEditsService(db)
    proposal = await proposed_edits.create_proposal(
        document_id=document_id,
        source=ProposedEditSource.MANUAL_AI_EDIT,
        proposed_content=content,
        proposed_by_id=str(current_user.id),
        diff_summary={"summary": data.summary} if data.summary else None,
    )
    await db.commit()

    return _to_proposed_edit_response(
        proposal,
        is_stale=bool(proposal.base_content_sha)
        and proposal.base_content_sha != compute_content_sha(document.content),
    )


@router.get(
    "/{document_id}/proposed-edits",
    response_model=list[ProposedEditResponse],
)
async def list_proposed_edits(
    workspace_id: str,
    document_id: str,
    status_filter: str | None = Query(default="pending", alias="status"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List proposed edits for a document.

    Defaults to status=pending (the FE banner's hot path). Pass
    `?status=all` to retrieve the full audit trail (approved /
    rejected / superseded). Pass `?status=approved` etc. for a
    specific bucket.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    proposed_edits = ProposedEditsService(db)
    if status_filter == "pending" or status_filter is None:
        proposals = await proposed_edits.list_pending(document_id)
    else:
        from sqlalchemy import select as _select

        from aexy.models.proposed_change import ProposedChange as _DPE

        stmt = _select(_DPE).where(_DPE.entity_type == "document").where(_DPE.entity_id == document_id)
        if status_filter != "all":
            stmt = stmt.where(_DPE.status == status_filter)
        stmt = stmt.order_by(_DPE.created_at.desc())
        result = await db.execute(stmt)
        proposals = list(result.scalars().all())

    # Compute current content sha once; stale check just compares
    # against it.
    current_sha = compute_content_sha(document.content)
    return [
        _to_proposed_edit_response(
            p,
            is_stale=bool(p.base_content_sha) and p.base_content_sha != current_sha,
        )
        for p in proposals
    ]


@router.post(
    "/{document_id}/proposed-edits/{proposal_id}/approve",
    response_model=ProposedEditResponse,
)
async def approve_proposed_edit(
    workspace_id: str,
    document_id: str,
    proposal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending proposal — applies it to the document and
    creates a new DocumentVersion in the process. Idempotent: calling
    approve on an already-resolved proposal returns its current row
    without re-applying.
    """
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    proposed_edits = ProposedEditsService(db)
    proposal = await proposed_edits.get_proposal(proposal_id)
    if not proposal or proposal.document_id != document_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proposed edit not found"
        )

    approved = await proposed_edits.approve(proposal_id, str(current_user.id))
    await db.commit()
    # Recompute stale after approval (it's False post-apply because
    # we just wrote the content).
    return _to_proposed_edit_response(approved, is_stale=False)


@router.post(
    "/{document_id}/proposed-edits/{proposal_id}/reject",
    response_model=ProposedEditResponse,
)
async def reject_proposed_edit(
    workspace_id: str,
    document_id: str,
    proposal_id: str,
    body: ProposedEditReject,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending proposal — leaves the document untouched and
    records an optional human-readable reason."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    doc_service = DocumentService(db)
    document = await doc_service.get_document(document_id, workspace_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    proposed_edits = ProposedEditsService(db)
    proposal = await proposed_edits.get_proposal(proposal_id)
    if not proposal or proposal.document_id != document_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proposed edit not found"
        )

    rejected = await proposed_edits.reject(
        proposal_id, str(current_user.id), body.reason
    )
    await db.commit()
    # Stale flag is computed against the (unchanged) doc content.
    current_sha = compute_content_sha(document.content)
    is_stale = bool(rejected.base_content_sha) and rejected.base_content_sha != current_sha
    return _to_proposed_edit_response(rejected, is_stale=is_stale)
