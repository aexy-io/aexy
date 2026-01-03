"""Tickets API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.ticketing import (
    TicketUpdate,
    TicketAssign,
    TicketFilters,
    TicketResponse as TicketResponseSchema,
    TicketListResponse,
    TicketCommentCreate,
    TicketCommentResponse,
    TicketStatus,
    TicketPriority,
)
from devograph.services.ticket_service import TicketService
from devograph.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/tickets",
    tags=["Tickets"],
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
        attachments=ticket.attachments or [],
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
        attachments=response.attachments or [],
        old_status=response.old_status,
        new_status=response.new_status,
        created_at=response.created_at,
        author_name=response.author.name if response.author else None,
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

    ticket_service = TicketService(db)
    tickets, total = await ticket_service.list_tickets(
        workspace_id=workspace_id,
        filters=filters,
        limit=limit,
        offset=offset,
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
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
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
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
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
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
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
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    await ticket_service.delete_ticket(ticket_id)


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
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

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
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
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
