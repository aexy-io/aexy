"""Tickets API endpoints."""

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.core.database import get_db
from aexy.services.storage_service import get_storage_service, parse_byte_range
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.ticketing import (
    TicketUpdate,
    TicketAssign,
    TicketFilters,
    TicketResponse as TicketResponseSchema,
    TicketListResponse,
    TicketCommentCreate,
    TicketCommentResponse,
    TicketShareCreate,
    TicketShareUpdate,
    TicketShareResponse,
    TicketStatus,
    TicketPriority,
)
from aexy.services.ticket_service import TicketService
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/tickets",
    tags=["Tickets"],
)


def safe_attachment(meta: dict) -> dict:
    """Public-safe attachment metadata (drops the private storage key)."""
    return {
        "id": meta.get("id"),
        "filename": meta.get("filename"),
        "size": meta.get("size"),
        "type": meta.get("type"),
    }


def stream_attachment(meta: dict, range_header: str | None = None) -> StreamingResponse:
    """Stream an attachment from storage without buffering it in memory.

    Honors HTTP Range requests (206) so large media can be seeked/resumed.
    """
    key = TicketService.attachment_key(meta)
    byte_range = parse_byte_range(range_header)
    result = get_storage_service().get_object_stream(key, byte_range=byte_range) if key else None
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found",
        )

    filename = (meta.get("filename") or "attachment").replace('"', "")
    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Accept-Ranges": "bytes",
    }
    if result["content_length"] is not None:
        headers["Content-Length"] = str(result["content_length"])

    status_code = status.HTTP_200_OK
    if byte_range is not None and result.get("content_range"):
        headers["Content-Range"] = result["content_range"]
        status_code = status.HTTP_206_PARTIAL_CONTENT

    return StreamingResponse(
        result["iter"],
        media_type=result["content_type"],
        headers=headers,
        status_code=status_code,
    )


def ticket_to_response(ticket) -> TicketResponseSchema:
    """Convert Ticket model to response schema."""
    return TicketResponseSchema(
        id=str(ticket.id),
        form_id=str(ticket.form_id),
        workspace_id=str(ticket.workspace_id),
        ticket_number=ticket.ticket_number,
        submitter_email=ticket.submitter_email,
        submitter_name=ticket.submitter_name,
        email_verified=ticket.email_verified,
        field_values=ticket.field_values or {},
        attachments=[safe_attachment(a) for a in (ticket.attachments or [])],
        status=ticket.status,
        priority=ticket.priority,
        severity=ticket.severity,
        assignee_id=str(ticket.assignee_id) if ticket.assignee_id else None,
        team_id=str(ticket.team_id) if ticket.team_id else None,
        external_issues=ticket.external_issues or [],
        linked_task_id=str(ticket.linked_task_id) if ticket.linked_task_id else None,
        first_response_at=ticket.first_response_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        sla_due_at=ticket.sla_due_at,
        sla_breached=ticket.sla_breached,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        form_name=ticket.form.name if ticket.form else None,
        assignee_name=ticket.assignee.name if ticket.assignee else None,
        team_name=ticket.team.name if ticket.team else None,
    )


def ticket_to_list_response(ticket) -> TicketListResponse:
    """Convert Ticket model to list response schema."""
    return TicketListResponse(
        id=str(ticket.id),
        form_id=str(ticket.form_id),
        ticket_number=ticket.ticket_number,
        submitter_email=ticket.submitter_email,
        submitter_name=ticket.submitter_name,
        status=ticket.status,
        priority=ticket.priority,
        severity=ticket.severity,
        assignee_id=str(ticket.assignee_id) if ticket.assignee_id else None,
        sla_breached=ticket.sla_breached,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        form_name=ticket.form.name if ticket.form else None,
        assignee_name=ticket.assignee.name if ticket.assignee else None,
    )


def comment_to_response(response) -> TicketCommentResponse:
    """Convert TicketResponse model to response schema."""
    return TicketCommentResponse(
        id=str(response.id),
        ticket_id=str(response.ticket_id),
        author_id=str(response.author_id) if response.author_id else None,
        author_email=response.author_email,
        is_internal=response.is_internal,
        content=response.content,
        attachments=[safe_attachment(a) for a in (response.attachments or [])],
        old_status=response.old_status,
        new_status=response.new_status,
        created_at=response.created_at,
        author_name=response.author.name if response.author else None,
    )


def share_to_response(link) -> TicketShareResponse:
    """Convert a TicketShareLink model to its response schema (with full URL)."""
    base = settings.frontend_url.rstrip("/")
    return TicketShareResponse(
        id=str(link.id),
        ticket_id=str(link.ticket_id),
        token=link.token,
        url=f"{base}/public/tickets/{link.token}",
        is_active=link.is_active,
        has_password=bool(link.password_hash),
        expires_at=link.expires_at,
        max_uses=link.max_uses,
        use_count=link.use_count,
        created_at=link.created_at,
    )


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this workspace",
        )


# ==================== Ticket Endpoints ====================

@router.get("")
async def list_tickets(
    workspace_id: str,
    form_id: str | None = None,
    status_filter: list[TicketStatus] | None = Query(default=None, alias="status"),
    priority_filter: list[TicketPriority] | None = Query(default=None, alias="priority"),
    assignee_id: str | None = None,
    team_id: str | None = None,
    submitter_email: str | None = None,
    sla_breached: bool | None = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List tickets in a workspace with filters."""
    await check_workspace_permission(workspace_id, current_user, db)

    filters = TicketFilters(
        form_id=form_id,
        status=status_filter,
        priority=priority_filter,
        assignee_id=assignee_id,
        team_id=team_id,
        submitter_email=submitter_email,
        sla_breached=sla_breached,
    )

    # The source-based exclusion below opts Service Desk tickets back IN when a
    # form_id is given, and the desk's own form has a guessable slug — so the
    # row scope has to be applied here too, not just relied upon.
    from aexy.services.service_desk_service import generic_ticket_scope_clause

    ticket_service = TicketService(db)
    tickets, total = await ticket_service.list_tickets(
        workspace_id=workspace_id,
        filters=filters,
        limit=limit,
        offset=offset,
        visibility_clause=await generic_ticket_scope_clause(
            db, workspace_id, str(current_user.id)
        ),
    )

    return {
        "tickets": [ticket_to_list_response(t) for t in tickets],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/stats")
async def get_stats(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket statistics for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    return await ticket_service.get_stats(workspace_id)


@router.get("/{ticket_id}", response_model=TicketResponseSchema)
async def get_ticket(
    workspace_id: str,
    ticket_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a ticket by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    ticket = await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id)
    )
    return ticket_to_response(ticket)


@router.get("/number/{ticket_number}", response_model=TicketResponseSchema)
async def get_ticket_by_number(
    workspace_id: str,
    ticket_number: int,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a ticket by its number."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    ticket = await ticket_service.get_ticket_by_number(workspace_id, ticket_number)

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )
    # Same row scope as the by-id path — a ticket number is just as guessable.
    ticket = await _get_owned_ticket(
        workspace_id, str(ticket.id), ticket_service, db, str(current_user.id)
    )
    return ticket_to_response(ticket)


@router.patch("/{ticket_id}", response_model=TicketResponseSchema)
async def update_ticket(
    workspace_id: str,
    ticket_id: str,
    update_data: TicketUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a ticket."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    updated = await ticket_service.update_ticket(
        ticket_id=ticket_id,
        update_data=update_data,
        updated_by_id=str(current_user.id),
    )
    return ticket_to_response(updated)


@router.post("/{ticket_id}/assign", response_model=TicketResponseSchema)
async def assign_ticket(
    workspace_id: str,
    ticket_id: str,
    assign_data: TicketAssign,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Assign a ticket to a developer or team."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    updated = await ticket_service.assign_ticket(
        ticket_id=ticket_id,
        assignee_id=assign_data.assignee_id,
        team_id=assign_data.team_id,
        assigned_by_id=str(current_user.id),
    )
    return ticket_to_response(updated)


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    workspace_id: str,
    ticket_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a ticket."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    await ticket_service.delete_ticket(ticket_id)


# ==================== Public Share Link Endpoints ====================

async def _get_owned_ticket(
    workspace_id, ticket_id, ticket_service, db, developer_id, for_edit: bool = False
):
    """Fetch a ticket and confirm this caller may reach it (or 404).

    Service Desk tickets are rows in this same table, and the generic module has
    no notion of the desk's row scope — so without this check a KAM restricted to
    their own queue could read, mutate, download attachments from, comment on or
    convert *any* Service Desk ticket by id here, whatever the Service Desk API
    refuses them. 404 rather than 403 so ids outside scope stay unenumerable.
    """
    from aexy.services.service_desk_service import (
        can_edit_ticket,
        is_service_desk_ticket_visible,
    )

    ticket = await ticket_service.get_ticket(ticket_id)
    if (
        not ticket
        or str(ticket.workspace_id) != workspace_id
        or not await is_service_desk_ticket_visible(
            db, workspace_id, str(ticket.id), developer_id
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )
    if for_edit:
        from aexy.models.service_desk import ServiceDeskTicket

        sd = (
            await db.execute(
                select(ServiceDeskTicket).where(
                    ServiceDeskTicket.ticket_id == ticket_id,
                    ServiceDeskTicket.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if sd is not None and not await can_edit_ticket(
            db,
            workspace_id,
            developer_id,
            assignee_id=ticket.assignee_id,
            pending_with=sd.pending_with,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can view this Service Desk ticket but not change it",
            )
    return ticket


@router.get("/{ticket_id}/share", response_model=TicketShareResponse | None)
async def get_ticket_share(
    workspace_id: str,
    ticket_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the current share link for a ticket, or null if not shared."""
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id)
    )

    link = await ticket_service.get_share_link(ticket_id)
    return share_to_response(link) if link else None


@router.post("/{ticket_id}/share", response_model=TicketShareResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket_share(
    workspace_id: str,
    ticket_id: str,
    share_data: TicketShareCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create or enable a public share link for a ticket."""
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    ticket = await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    link = await ticket_service.create_or_enable_share_link(
        ticket,
        created_by_id=str(current_user.id),
        expires_at=share_data.expires_at,
        password=share_data.password,
        max_uses=share_data.max_uses,
    )
    return share_to_response(link)


@router.patch("/{ticket_id}/share", response_model=TicketShareResponse)
async def update_ticket_share(
    workspace_id: str,
    ticket_id: str,
    share_data: TicketShareUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a ticket's share link (toggle, expiry, password, regenerate)."""
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    link = await ticket_service.update_share_link(
        ticket_id,
        is_active=share_data.is_active,
        expires_at=share_data.expires_at,
        password=share_data.password,
        max_uses=share_data.max_uses,
        regenerate=share_data.regenerate,
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found",
        )
    return share_to_response(link)


@router.delete("/{ticket_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_ticket_share(
    workspace_id: str,
    ticket_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (delete) a ticket's public share link."""
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )
    await ticket_service.revoke_share_link(ticket_id)


# ==================== Attachment Endpoints ====================

@router.post("/{ticket_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_ticket_attachments(
    workspace_id: str,
    ticket_id: str,
    files: list[UploadFile] = File(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Upload one or more files as ticket-level attachments.

    Files are streamed to storage from their spooled temp files, so large
    uploads don't load into memory. Rejects files over the configured cap.
    """
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    ticket = await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    def _size(f: UploadFile) -> int:
        if f.size is not None:
            return f.size
        f.file.seek(0, 2)
        size = f.file.tell()
        f.file.seek(0)
        return size

    payload = [
        (f.filename or "attachment", f.content_type, f.file, _size(f)) for f in files
    ]
    try:
        created = await ticket_service.add_ticket_attachments(ticket, payload)
    except ValueError as exc:
        code = str(exc)
        if code == "too_large":
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {settings.ticket_max_attachment_mb} MB limit",
            )
        detail = (
            "File storage is not configured on this deployment"
            if code == "storage_unconfigured"
            else "Failed to upload attachment"
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    return [safe_attachment(m) for m in created]


@router.get("/{ticket_id}/attachments/{attachment_id}")
async def download_ticket_attachment(
    workspace_id: str,
    ticket_id: str,
    attachment_id: str,
    range_header: str | None = Header(default=None, alias="Range"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Stream a ticket attachment (workspace members; includes internal notes)."""
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    ticket = await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id)
    )

    meta = ticket_service.find_ticket_attachment(ticket, attachment_id, include_internal=True)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return stream_attachment(meta, range_header)


@router.delete("/{ticket_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket_attachment(
    workspace_id: str,
    ticket_id: str,
    attachment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a ticket-level attachment."""
    await check_workspace_permission(workspace_id, current_user, db)
    ticket_service = TicketService(db)
    ticket = await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    if not await ticket_service.remove_ticket_attachment(ticket, attachment_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")


# ==================== Response/Comment Endpoints ====================

@router.get("/{ticket_id}/responses", response_model=list[TicketCommentResponse])
async def list_responses(
    workspace_id: str,
    ticket_id: str,
    include_internal: bool = True,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List responses for a ticket."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    await _get_owned_ticket(workspace_id, ticket_id, ticket_service, db, str(current_user.id))

    responses = await ticket_service.list_responses(
        ticket_id=ticket_id,
        include_internal=include_internal,
    )
    return [comment_to_response(r) for r in responses]


@router.post("/{ticket_id}/responses", response_model=TicketCommentResponse, status_code=status.HTTP_201_CREATED)
async def add_response(
    workspace_id: str,
    ticket_id: str,
    comment_data: TicketCommentCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a response to a ticket."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    try:
        response = await ticket_service.add_response(
            ticket_id=ticket_id,
            author_id=str(current_user.id),
            comment_data=comment_data,
        )
        return comment_to_response(response)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ==================== Task Creation from Ticket ====================

from pydantic import BaseModel, Field


class CreateTaskFromTicketRequest(BaseModel):
    """Request to create a sprint task from a ticket."""
    sprint_id: str | None = None  # Optional: assign to specific sprint
    project_id: str  # Required: project for the task
    title: str | None = None  # Override title (defaults to ticket summary)
    priority: str = "medium"


def _plain_text_to_tiptap_doc(lines: list[str]) -> dict:
    """Build a minimal TipTap document from plain-text lines.

    The task detail editor renders ``description_json`` (TipTap), so tasks
    created from a ticket need a doc — one paragraph per line, empty lines
    become empty paragraphs.
    """
    content: list[dict] = []
    for line in lines:
        if line:
            content.append({"type": "paragraph", "content": [{"type": "text", "text": line}]})
        else:
            content.append({"type": "paragraph"})
    if not content:
        content.append({"type": "paragraph"})
    return {"type": "doc", "content": content}


class TaskFromTicketResponse(BaseModel):
    """Response after creating task from ticket."""
    task_id: str
    task_title: str
    linked: bool


@router.post("/{ticket_id}/create-task", response_model=TaskFromTicketResponse)
async def create_task_from_ticket(
    workspace_id: str,
    ticket_id: str,
    request_data: CreateTaskFromTicketRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a sprint task from a ticket and link them."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    ticket = await _get_owned_ticket(
        workspace_id, ticket_id, ticket_service, db, str(current_user.id), for_edit=True
    )

    # Check if ticket already has a linked task
    if ticket.linked_task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket already has a linked task",
        )

    # Import here to avoid circular imports
    from uuid import uuid4
    from aexy.models.sprint import SprintTask
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # Build title from ticket data
    task_title = request_data.title
    if not task_title:
        # Try to get title from field_values
        field_values = ticket.field_values or {}
        task_title = (
            field_values.get("title")
            or field_values.get("subject")
            or field_values.get("summary")
            or f"Ticket #{ticket.ticket_number}"
        )

    # Build description from ticket data. Produce clean plain-text lines and a
    # matching TipTap ``description_json`` doc — the task editor renders
    # ``description_json``, so a task created with only the plain ``description``
    # would show an empty body.
    field_values = ticket.field_values or {}
    description_lines: list[str] = []
    if ticket.submitter_email:
        description_lines.append(f"From: {ticket.submitter_name or ticket.submitter_email}")
    description_lines.append(f"Ticket: TKT-{ticket.ticket_number}")
    body = field_values.get("description") or field_values.get("details")
    if body:
        description_lines.append("")
        description_lines.extend(str(body).split("\n"))

    description = "\n".join(description_lines)
    description_json = _plain_text_to_tiptap_doc(description_lines)

    # Create the task directly. team_id must be set from the request's
    # project_id: a project-level (no-sprint) task with a null team_id is
    # orphaned — it belongs to no board and can't be opened via deep links.
    task = SprintTask(
        id=str(uuid4()),
        sprint_id=request_data.sprint_id,  # Can be None for project-level tasks
        team_id=request_data.project_id,
        workspace_id=workspace_id,
        source_type="ticket",
        source_id=str(ticket.id),
        title=task_title,
        description=description,
        description_json=description_json,
        priority=request_data.priority,
        labels=[],
        status="backlog",
    )
    db.add(task)
    await db.flush()

    # Re-fetch with relationships
    stmt = (
        select(SprintTask)
        .where(SprintTask.id == task.id)
        .options(selectinload(SprintTask.assignee))
    )
    result = await db.execute(stmt)
    task = result.scalar_one()

    # Link the ticket to the task
    from aexy.schemas.ticketing import TicketUpdate
    await ticket_service.update_ticket(
        ticket_id=ticket_id,
        update_data=TicketUpdate(linked_task_id=str(task.id)),
        updated_by_id=str(current_user.id),
    )

    await db.commit()

    return TaskFromTicketResponse(
        task_id=str(task.id),
        task_title=task.title,
        linked=True,
    )
