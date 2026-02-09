"""Compliance document center API endpoints."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.compliance_document import (
    DocumentCreate,
    DocumentFilters,
    DocumentListResponse,
    DocumentMoveRequest,
    DocumentResponse,
    DocumentStatusEnum,
    DocumentUpdate,
    EntityDocumentsResponse,
    EntityTypeEnum,
    FolderCreate,
    FolderResponse,
    FolderUpdate,
    LinkCreateRequest,
    LinkResponse,
    TagAddRequest,
    TagListResponse,
    UploadUrlRequest,
    UploadUrlResponse,
)
from aexy.services.compliance_document_service import ComplianceDocumentService
from aexy.services.workspace_service import WorkspaceService


# --- Document Router ---

router = APIRouter(
    prefix="/workspaces/{workspace_id}/compliance/documents",
    tags=["Compliance Documents"],
)


async def _verify_access(
    workspace_id: str, current_user: Developer, db: AsyncSession, role: str = "viewer"
):
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, str(current_user.id), role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{role.capitalize()} permission required",
        )


def _doc_to_response(doc, download_url: str | None = None) -> DocumentResponse:
    tags = [t.tag for t in doc.tags] if doc.tags else []
    return DocumentResponse(
        id=str(doc.id),
        workspace_id=str(doc.workspace_id),
        folder_id=str(doc.folder_id) if doc.folder_id else None,
        name=doc.name,
        description=doc.description,
        file_key=doc.file_key,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        status=doc.status,
        version=doc.version,
        uploaded_by=str(doc.uploaded_by) if doc.uploaded_by else None,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        archived_at=doc.archived_at,
        tags=tags,
        download_url=download_url,
    )


# --- Upload URL ---

@router.post("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    workspace_id: str,
    request: UploadUrlRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a presigned URL for uploading a compliance document."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)

    try:
        result = service.generate_upload_url(
            workspace_id=workspace_id,
            filename=request.filename,
            content_type=request.content_type,
            file_size=request.file_size,
        )
        return UploadUrlResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# --- Direct Upload ---

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document_directly(
    workspace_id: str,
    file: UploadFile = File(...),
    name: str = Form(None),
    description: str = Form(None),
    folder_id: str = Form(None),
    tags: str = Form(None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Upload a compliance document directly through the backend."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)

    # Check file size via Content-Length header before reading into memory
    from aexy.core.config import get_settings
    _settings = get_settings()
    max_bytes = _settings.compliance_max_file_size_mb * 1024 * 1024
    if file.size and file.size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {_settings.compliance_max_file_size_mb}MB",
        )
    file_data = await file.read()
    if len(file_data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {_settings.compliance_max_file_size_mb}MB",
        )
    content_type = file.content_type or "application/octet-stream"

    try:
        result = service.upload_file_directly(
            workspace_id=workspace_id,
            filename=file.filename or "unnamed",
            content_type=content_type,
            file_data=file_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = await service.create_document(
        workspace_id,
        DocumentCreate(
            name=name or file.filename or "unnamed",
            description=description,
            folder_id=folder_id,
            file_key=result["file_key"],
            file_size=result["file_size"],
            mime_type=content_type,
            tags=tag_list,
        ),
        str(current_user.id),
    )

    download_url = service.generate_download_url(doc.file_key)
    return _doc_to_response(doc, download_url)


# --- Document CRUD ---

@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    workspace_id: str,
    data: DocumentCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Register a new compliance document after upload."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    doc = await service.create_document(workspace_id, data, str(current_user.id))
    download_url = service.generate_download_url(doc.file_key)
    return _doc_to_response(doc, download_url)


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    workspace_id: str,
    folder_id: str | None = Query(None),
    status_filter: DocumentStatusEnum | None = Query(None, alias="status"),
    mime_type: str | None = Query(None),
    tags: str | None = Query(None, description="Comma-separated tags"),
    search: str | None = Query(None),
    uploaded_by: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List compliance documents with filters."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)

    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    filters = DocumentFilters(
        folder_id=folder_id,
        status=status_filter,
        mime_type=mime_type,
        tags=tag_list,
        search=search,
        uploaded_by=uploaded_by,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    documents, total = await service.list_documents(workspace_id, filters)
    items = [_doc_to_response(doc) for doc in documents]

    return DocumentListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.get("/by-entity/{entity_type}/{entity_id}", response_model=EntityDocumentsResponse)
async def get_entity_documents(
    workspace_id: str,
    entity_type: EntityTypeEnum,
    entity_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all documents linked to a specific entity."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    results = await service.get_entity_documents(
        workspace_id, entity_type.value, entity_id
    )

    documents = []
    links = []
    for doc, link in results:
        documents.append(_doc_to_response(doc))
        links.append(LinkResponse.model_validate(link))

    return EntityDocumentsResponse(documents=documents, links=links)


@router.get("/tags/all", response_model=TagListResponse)
async def list_workspace_tags(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all unique tags used across compliance documents in this workspace."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    tags = await service.list_workspace_tags(workspace_id)
    return TagListResponse(tags=tags)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a single compliance document."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    doc = await service.get_document(workspace_id, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    download_url = service.generate_download_url(doc.file_key)
    return _doc_to_response(doc, download_url)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    workspace_id: str,
    document_id: str,
    data: DocumentUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a compliance document's metadata."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    doc = await service.update_document(workspace_id, document_id, data)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc)


@router.post("/{document_id}/move", response_model=DocumentResponse)
async def move_document(
    workspace_id: str,
    document_id: str,
    data: DocumentMoveRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Move a document to a different folder."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    try:
        doc = await service.move_document(workspace_id, document_id, data.folder_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc)


@router.post("/{document_id}/archive", response_model=DocumentResponse)
async def archive_document(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Archive a compliance document."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    doc = await service.archive_document(workspace_id, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a compliance document."""
    await _verify_access(workspace_id, current_user, db, "admin")
    service = ComplianceDocumentService(db)
    if not await service.delete_document(workspace_id, document_id):
        raise HTTPException(status_code=404, detail="Document not found")


# --- Tags ---

@router.post("/{document_id}/tags", response_model=TagListResponse)
async def add_tags(
    workspace_id: str,
    document_id: str,
    data: TagAddRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add tags to a compliance document."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    try:
        tags = await service.add_tags(workspace_id, document_id, data.tags)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return TagListResponse(tags=tags)


@router.delete("/{document_id}/tags/{tag}")
async def remove_tag(
    workspace_id: str,
    document_id: str,
    tag: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a tag from a compliance document."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    if not await service.remove_tag(workspace_id, document_id, tag):
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"ok": True}


# --- Links ---

@router.post("/{document_id}/links", response_model=LinkResponse, status_code=status.HTTP_201_CREATED)
async def link_document(
    workspace_id: str,
    document_id: str,
    data: LinkCreateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link a compliance document to an entity (reminder, certification, etc.)."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    try:
        link = await service.link_document(
            workspace_id, document_id, data, str(current_user.id)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return LinkResponse.model_validate(link)


@router.get("/{document_id}/links", response_model=list[LinkResponse])
async def get_document_links(
    workspace_id: str,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all entity links for a compliance document."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    links = await service.get_document_links(workspace_id, document_id)
    return [LinkResponse.model_validate(link) for link in links]


@router.delete("/{document_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_document(
    workspace_id: str,
    document_id: str,
    link_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove an entity link from a compliance document."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    if not await service.unlink_document(workspace_id, document_id, link_id):
        raise HTTPException(status_code=404, detail="Link not found")


# --- Folder Router ---

folder_router = APIRouter(
    prefix="/workspaces/{workspace_id}/compliance/folders",
    tags=["Compliance Folders"],
)


@folder_router.post("/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    workspace_id: str,
    data: FolderCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a compliance document folder."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    try:
        folder = await service.create_folder(workspace_id, data, str(current_user.id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return FolderResponse.model_validate(folder)


@folder_router.get("/", response_model=list[FolderResponse])
async def list_folders(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all compliance folders."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    folders = await service.list_folders(workspace_id)
    return [FolderResponse.model_validate(f) for f in folders]


@folder_router.get("/tree")
async def get_folder_tree(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the full folder tree with document counts."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    return await service.get_folder_tree(workspace_id)


@folder_router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(
    workspace_id: str,
    folder_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific compliance folder."""
    await _verify_access(workspace_id, current_user, db)
    service = ComplianceDocumentService(db)
    folder = await service.get_folder(workspace_id, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse.model_validate(folder)


@folder_router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    workspace_id: str,
    folder_id: str,
    data: FolderUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a compliance folder."""
    await _verify_access(workspace_id, current_user, db, "member")
    service = ComplianceDocumentService(db)
    folder = await service.update_folder(workspace_id, folder_id, data)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse.model_validate(folder)


@folder_router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    workspace_id: str,
    folder_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an empty compliance folder."""
    await _verify_access(workspace_id, current_user, db, "admin")
    service = ComplianceDocumentService(db)
    try:
        if not await service.delete_folder(workspace_id, folder_id):
            raise HTTPException(status_code=404, detail="Folder not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
