"""Document API endpoints for Notion-like documentation."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.api.developers import get_current_developer
from devograph.core.database import get_db
from devograph.models.developer import Developer
from devograph.models.documentation import DocumentPermission
from devograph.schemas.document import (
    CodeLinkCreate,
    CodeLinkResponse,
    CollaboratorAdd,
    CollaboratorResponse,
    CollaboratorUpdate,
    DocumentCreate,
    DocumentListResponse,
    DocumentMoveRequest,
    DocumentResponse,
    DocumentTreeItem,
    DocumentUpdate,
    DocumentVersionResponse,
    TemplateCreate,
    TemplateListResponse,
    TemplateResponse,
)
from devograph.services.document_service import DocumentService
from devograph.services.document_generation_service import DocumentGenerationService
from devograph.services.workspace_service import WorkspaceService
from devograph.models.documentation import TemplateCategory

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
        icon=data.icon,
        cover_image=data.cover_image,
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
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get hierarchical document tree for sidebar."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = DocumentService(db)
    tree = await service.get_document_tree(
        workspace_id=workspace_id,
        parent_id=parent_id,
        include_templates=include_templates,
    )

    return tree


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


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    workspace_id: str,
    document_id: str,
    data: DocumentUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a document."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = DocumentService(db)

    # Check document exists in workspace
    existing = await service.get_document(document_id, workspace_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    document = await service.update_document(
        document_id=document_id,
        updated_by_id=str(current_user.id),
        title=data.title,
        content=data.content,
        icon=data.icon,
        cover_image=data.cover_image,
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
    )

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
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


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
        CodeLinkResponse(
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
            created_at=link.created_at,
            updated_at=link.updated_at,
        )
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


@router.post("/{document_id}/generate")
async def generate_documentation(
    workspace_id: str,
    document_id: str,
    template_category: str = Query(default="function_docs"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Generate documentation for a document from linked code."""
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
    gen_service = DocumentGenerationService(db)

    try:
        # Import GitHub service to fetch code
        from devograph.services.github_service import GitHubService

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

        # Update the document with generated content
        updated_doc = await doc_service.update_document(
            document_id=document_id,
            updated_by_id=str(current_user.id),
            content=content,
        )

        # Update generation status
        updated_doc.generation_status = "generated"
        updated_doc.last_generated_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "status": "success",
            "document_id": document_id,
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
    code: str = Query(..., description="Source code to document"),
    template_category: str = Query(default="function_docs"),
    file_path: str | None = Query(default=None),
    language: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Generate documentation from provided source code."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    try:
        category = TemplateCategory(template_category)
    except ValueError:
        category = TemplateCategory.FUNCTION_DOCS

    gen_service = DocumentGenerationService(db)

    try:
        content = await gen_service.generate_from_code(
            code=code,
            template_category=category,
            file_path=file_path,
            language=language,
            developer_id=str(current_user.id),
        )

        return {
            "status": "success",
            "content": content,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate documentation: {str(e)}",
        )


class GitHubServiceAdapter:
    """Adapter to wrap GitHubAppService with the interface expected by DocumentGenerationService."""

    def __init__(self, app_service: "GitHubAppService", installation_id: int, owner: str, repo: str):
        self.app_service = app_service
        self.installation_id = installation_id
        self.owner = owner
        self.repo = repo

    def _normalize_path(self, path: str) -> str:
        """Normalize path - convert '.' or '/' to empty string for root."""
        if path in (".", "/", "./"):
            return ""
        return path.strip("/")

    async def get_directory_contents(
        self, repository_full_name: str, path: str, branch: str
    ) -> list[dict]:
        """Get directory contents."""
        normalized_path = self._normalize_path(path)
        return await self.app_service.get_repository_contents(
            installation_id=self.installation_id,
            owner=self.owner,
            repo=self.repo,
            path=normalized_path,
            ref=branch,
        )

    async def get_file_content(
        self, repository_full_name: str, path: str, branch: str
    ) -> dict | None:
        """Get file content."""
        return await self.app_service.get_file_content(
            installation_id=self.installation_id,
            owner=self.owner,
            repo=self.repo,
            path=path,
            ref=branch,
        )


@router.post("/generate-from-repository")
async def generate_from_repository(
    workspace_id: str,
    repository_id: str = Query(..., description="Repository ID"),
    path: str = Query("", description="Directory path within repository"),
    branch: str = Query("main", description="Branch name"),
    template_category: str = Query(default="module_docs"),
    custom_prompt: str | None = Query(default=None, description="Custom instructions for documentation generation"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Generate documentation from a repository directory.

    Analyzes the directory structure and key files to generate comprehensive documentation.
    Optionally accepts a custom prompt to guide the AI generation.
    """
    from devograph.services.github_app_service import GitHubAppService, GitHubAppError
    from devograph.services.repository_service import RepositoryService

    await check_workspace_permission(workspace_id, current_user, db, "member")

    try:
        category = TemplateCategory(template_category)
    except ValueError:
        category = TemplateCategory.MODULE_DOCS

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

        gen_service = DocumentGenerationService(db)

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
        from devograph.llm.base import LLMRateLimitError, LLMAPIError

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

    gen_service = DocumentGenerationService(db)

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

    from devograph.services.github_sync_service import GitHubSyncService

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

    from devograph.services.github_sync_service import GitHubSyncService

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

    from devograph.services.github_sync_service import GitHubSyncService

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

    from devograph.services.github_sync_service import GitHubSyncService

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

    from devograph.services.github_sync_service import GitHubSyncService

    sync_service = GitHubSyncService(db)
    deleted = await sync_service.delete_sync(sync_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync configuration not found",
        )


# ==================== Templates Router ====================


@template_router.get("", response_model=list[TemplateListResponse])
async def list_templates(
    workspace_id: str | None = None,
    category: str | None = None,
    include_system: bool = True,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available templates."""
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


@template_router.post("/{template_id}/duplicate", response_model=TemplateResponse)
async def duplicate_template(
    template_id: str,
    workspace_id: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a template for customization."""
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
