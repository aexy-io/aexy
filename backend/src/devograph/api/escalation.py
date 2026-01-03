"""Escalation Matrix API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.ticketing import (
    EscalationMatrixCreate,
    EscalationMatrixUpdate,
    EscalationMatrixResponse,
    TicketEscalationResponse,
)
from devograph.services.ticket_service import TicketService
from devograph.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/escalation-matrices",
    tags=["Escalation"],
)


def matrix_to_response(matrix) -> EscalationMatrixResponse:
    """Convert EscalationMatrix model to response schema."""
    return EscalationMatrixResponse(
        id=str(matrix.id),
        workspace_id=str(matrix.workspace_id),
        name=matrix.name,
        description=matrix.description,
        severity_levels=matrix.severity_levels or [],
        rules=matrix.rules or [],
        form_ids=matrix.form_ids,
        team_ids=matrix.team_ids,
        priority_order=matrix.priority_order,
        is_active=matrix.is_active,
        created_at=matrix.created_at,
        updated_at=matrix.updated_at,
    )


def escalation_to_response(escalation) -> TicketEscalationResponse:
    """Convert TicketEscalation model to response schema."""
    return TicketEscalationResponse(
        id=str(escalation.id),
        ticket_id=str(escalation.ticket_id),
        escalation_matrix_id=str(escalation.escalation_matrix_id),
        level=escalation.level,
        triggered_at=escalation.triggered_at,
        notified_users=escalation.notified_users or [],
        notified_channels=escalation.notified_channels or [],
        acknowledged_at=escalation.acknowledged_at,
        acknowledged_by_id=str(escalation.acknowledged_by_id) if escalation.acknowledged_by_id else None,
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


# ==================== Escalation Matrix Endpoints ====================

@router.get("", response_model=list[EscalationMatrixResponse])
async def list_escalation_matrices(
    workspace_id: str,
    active_only: bool = Query(default=True),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List escalation matrices for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    matrices = await ticket_service.list_escalation_matrices(
        workspace_id=workspace_id,
        active_only=active_only,
    )

    return [matrix_to_response(m) for m in matrices]


@router.post("", response_model=EscalationMatrixResponse, status_code=status.HTTP_201_CREATED)
async def create_escalation_matrix(
    workspace_id: str,
    data: EscalationMatrixCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an escalation matrix."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    ticket_service = TicketService(db)
    matrix = await ticket_service.create_escalation_matrix(
        workspace_id=workspace_id,
        data=data,
    )
    await db.commit()

    return matrix_to_response(matrix)


@router.get("/{matrix_id}", response_model=EscalationMatrixResponse)
async def get_escalation_matrix(
    workspace_id: str,
    matrix_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get an escalation matrix by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    matrix = await ticket_service.get_escalation_matrix(matrix_id)

    if not matrix or str(matrix.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escalation matrix not found",
        )

    return matrix_to_response(matrix)


@router.patch("/{matrix_id}", response_model=EscalationMatrixResponse)
async def update_escalation_matrix(
    workspace_id: str,
    matrix_id: str,
    data: EscalationMatrixUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an escalation matrix."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    ticket_service = TicketService(db)
    matrix = await ticket_service.get_escalation_matrix(matrix_id)

    if not matrix or str(matrix.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escalation matrix not found",
        )

    updated = await ticket_service.update_escalation_matrix(matrix_id, data)
    await db.commit()

    return matrix_to_response(updated)


@router.delete("/{matrix_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_escalation_matrix(
    workspace_id: str,
    matrix_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an escalation matrix."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    ticket_service = TicketService(db)
    matrix = await ticket_service.get_escalation_matrix(matrix_id)

    if not matrix or str(matrix.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escalation matrix not found",
        )

    await ticket_service.delete_escalation_matrix(matrix_id)
    await db.commit()


# ==================== Ticket Escalation Endpoints ====================

escalation_ticket_router = APIRouter(
    prefix="/workspaces/{workspace_id}/tickets/{ticket_id}/escalations",
    tags=["Escalation"],
)


@escalation_ticket_router.get("", response_model=list[TicketEscalationResponse])
async def list_ticket_escalations(
    workspace_id: str,
    ticket_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List escalations for a ticket."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    escalations = await ticket_service.list_ticket_escalations(ticket_id)
    return [escalation_to_response(e) for e in escalations]


@escalation_ticket_router.post("/{escalation_id}/acknowledge", response_model=TicketEscalationResponse)
async def acknowledge_escalation(
    workspace_id: str,
    ticket_id: str,
    escalation_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge an escalation."""
    await check_workspace_permission(workspace_id, current_user, db)

    ticket_service = TicketService(db)
    ticket = await ticket_service.get_ticket(ticket_id)

    if not ticket or str(ticket.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    escalation = await ticket_service.acknowledge_escalation(
        escalation_id=escalation_id,
        acknowledged_by_id=str(current_user.id),
    )

    if not escalation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escalation not found",
        )

    await db.commit()
    return escalation_to_response(escalation)
