"""Public Tickets API endpoints - No authentication required.

Serves a read-only view of a ticket behind a share token (``/public/tickets/
{token}``). Anonymous visitors get a filtered view (no internal notes, no
assignee/team, submitter name only). A visitor who happens to be authenticated
as a member of the ticket's workspace may also post a public reply.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_optional_current_developer
from aexy.api.tickets import safe_attachment, stream_attachment
from aexy.models.developer import Developer
from aexy.schemas.ticketing import (
    PublicTicketComment,
    PublicTicketResponse,
    PublicTicketReply,
    TicketCommentCreate,
    TicketFormFieldResponse,
)
from aexy.services.ticket_service import TicketService, headline_from_field_values
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/public/tickets",
    tags=["Public Tickets"],
)


# Shared with `Ticket.title`, so the public view and the stored headline can
# never disagree about which field is the subject.
def _extract_subject(field_values: dict) -> str | None:
    return headline_from_field_values(field_values)


def shared_ticket_to_response(ticket, *, can_reply: bool) -> PublicTicketResponse:
    """Build the filtered public view of a ticket."""
    field_values = ticket.field_values or {}

    fields = []
    if ticket.form and ticket.form.fields:
        fields = [
            TicketFormFieldResponse(
                id=str(field.id),
                form_id=str(field.form_id),
                name=field.name,
                field_key=field.field_key,
                field_type=field.field_type,
                placeholder=field.placeholder,
                default_value=field.default_value,
                help_text=field.help_text,
                is_required=field.is_required,
                validation_rules=field.validation_rules or {},
                options=field.options,
                position=field.position,
                is_visible=field.is_visible,
                external_mappings={},
                created_at=field.created_at,
                updated_at=field.updated_at,
            )
            for field in sorted(ticket.form.fields, key=lambda f: f.position)
            if field.is_visible
        ]

    responses = [
        PublicTicketComment(
            id=str(r.id),
            author_name=(r.author.name if r.author else None),
            is_staff=r.author_id is not None,
            content=r.content,
            attachments=[safe_attachment(a) for a in (r.attachments or [])],
            created_at=r.created_at,
        )
        for r in sorted(ticket.responses, key=lambda r: r.created_at)
        if not r.is_internal
    ]

    return PublicTicketResponse(
        ticket_number=ticket.ticket_number,
        subject=_extract_subject(field_values),
        status=ticket.status,
        priority=ticket.priority,
        submitter_name=ticket.submitter_name,
        field_values=field_values,
        fields=fields,
        attachments=[safe_attachment(a) for a in (ticket.attachments or [])],
        form_name=ticket.form.name if ticket.form else None,
        workspace_name=ticket.workspace.name if ticket.workspace else None,
        responses=responses,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        can_reply=can_reply,
    )


async def _can_reply(
    ticket, current_user: Developer | None, db: AsyncSession
) -> bool:
    """A logged-in member of the ticket's workspace may reply."""
    if current_user is None:
        return False
    workspace_service = WorkspaceService(db)
    return await workspace_service.check_permission(
        str(ticket.workspace_id), str(current_user.id), "member"
    )


@router.get("/{token}", response_model=PublicTicketResponse)
async def get_shared_ticket(
    token: str,
    password: str | None = Query(default=None),
    current_user: Developer | None = Depends(get_optional_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a ticket by its public share token (read-only)."""
    ticket_service = TicketService(db)
    try:
        ticket, _link = await ticket_service.get_shared_ticket(token, password=password)
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        if code in ("password_required", "invalid_password"):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=code)
        # expired / exhausted
        raise HTTPException(status.HTTP_410_GONE, detail=code)

    can_reply = await _can_reply(ticket, current_user, db)
    return shared_ticket_to_response(ticket, can_reply=can_reply)


@router.post("/{token}/reply", response_model=PublicTicketComment, status_code=status.HTTP_201_CREATED)
async def reply_to_shared_ticket(
    token: str,
    reply: PublicTicketReply,
    password: str | None = Query(default=None),
    current_user: Developer | None = Depends(get_optional_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Post a public reply from the share page.

    Requires an authenticated workspace member — anonymous visitors are
    read-only.
    """
    if current_user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to reply to this ticket",
        )

    ticket_service = TicketService(db)
    try:
        ticket, _link = await ticket_service.get_shared_ticket(token, password=password)
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        if code in ("password_required", "invalid_password"):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=code)
        raise HTTPException(status.HTTP_410_GONE, detail=code)

    if not await _can_reply(ticket, current_user, db):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Not a member of this ticket's workspace",
        )

    response = await ticket_service.add_response(
        ticket_id=ticket.id,
        author_id=str(current_user.id),
        comment_data=TicketCommentCreate(content=reply.content, is_internal=False),
    )
    return PublicTicketComment(
        id=str(response.id),
        author_name=current_user.name,
        is_staff=True,
        content=response.content,
        created_at=response.created_at,
    )


@router.get("/{token}/attachments/{attachment_id}")
async def get_shared_ticket_attachment(
    token: str,
    attachment_id: str,
    password: str | None = Query(default=None),
    range_header: str | None = Header(default=None, alias="Range"),
    db: AsyncSession = Depends(get_db),
):
    """Stream a ticket attachment behind the share token (no auth).

    Access is gated by the same token rules as the ticket view. Internal-note
    attachments are never served here. Downloads do not consume the link's
    use-count (``bump=False``).
    """
    ticket_service = TicketService(db)
    try:
        ticket, _link = await ticket_service.get_shared_ticket(
            token, password=password, bump=False
        )
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        if code in ("password_required", "invalid_password"):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=code)
        raise HTTPException(status.HTTP_410_GONE, detail=code)

    meta = ticket_service.find_ticket_attachment(
        ticket, attachment_id, include_internal=False
    )
    if meta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return stream_attachment(meta, range_header)
