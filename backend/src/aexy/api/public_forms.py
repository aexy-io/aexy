"""Public Forms API endpoints - No authentication required."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.schemas.ticketing import (
    PublicFormResponse,
    PublicTicketSubmission,
    PublicSubmissionResponse,
    EmailVerificationRequest,
    TicketFormFieldResponse,
)
from aexy.services.ticket_form_service import TicketFormService
from aexy.services.ticket_service import TicketService


router = APIRouter(
    prefix="/public/forms",
    tags=["Public Forms"],
)


def form_to_public_response(form) -> PublicFormResponse:
    """Convert TicketForm model to public response schema (no sensitive data)."""
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
            external_mappings={},  # Don't expose external mappings publicly
            created_at=field.created_at,
            updated_at=field.updated_at,
        )
        for field in sorted(form.fields, key=lambda f: f.position)
        if field.is_visible
    ]

    return PublicFormResponse(
        id=str(form.id),
        name=form.name,
        description=form.description,
        auth_mode=form.auth_mode,
        require_email=form.require_email,
        theme=form.theme or {},
        fields=fields,
        conditional_rules=form.conditional_rules or [],
    )


@router.get("/{public_token}", response_model=PublicFormResponse)
async def get_public_form(
    public_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a public form by its token for rendering.

    This endpoint is publicly accessible without authentication.
    """
    form_service = TicketFormService(db)
    form = await form_service.get_form_by_token(public_token)

    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found or inactive",
        )

    return form_to_public_response(form)


@router.post("/{public_token}/submit", response_model=PublicSubmissionResponse)
async def submit_ticket(
    public_token: str,
    submission: PublicTicketSubmission,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Submit a ticket through a public form.

    This endpoint is publicly accessible without authentication.
    Rate limited to prevent abuse.
    """
    form_service = TicketFormService(db)
    ticket_service = TicketService(db)

    # Get form
    form = await form_service.get_form_by_token(public_token)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found or inactive",
        )

    # Validate required email
    if form.require_email and not submission.submitter_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required for this form",
        )

    # Validate required fields
    required_fields = [f for f in form.fields if f.is_required and f.is_visible]
    for field in required_fields:
        value = submission.field_values.get(field.field_key)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Field '{field.name}' is required",
            )

    # Get request metadata
    source_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    referrer_url = request.headers.get("referer")

    # Create ticket
    ticket = await ticket_service.create_ticket(
        form_id=str(form.id),
        workspace_id=str(form.workspace_id),
        submission=submission,
        source_ip=source_ip,
        user_agent=user_agent,
        referrer_url=referrer_url,
    )

    # Increment submission count
    await form_service.increment_submission_count(str(form.id))

    # Determine if email verification is required
    requires_verification = (
        form.auth_mode == "email_verification"
        and submission.submitter_email
        and not ticket.email_verified
    )

    return PublicSubmissionResponse(
        ticket_id=str(ticket.id),
        ticket_number=ticket.ticket_number,
        success_message=form.success_message,
        redirect_url=form.redirect_url,
        requires_email_verification=requires_verification,
    )


@router.post("/{public_token}/verify-email")
async def verify_email(
    public_token: str,
    verification: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify email for a ticket submission.

    This endpoint is publicly accessible without authentication.
    """
    form_service = TicketFormService(db)
    ticket_service = TicketService(db)

    # Validate form exists
    form = await form_service.get_form_by_token(public_token)
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Verify email
    ticket = await ticket_service.verify_email(verification.token)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    return {"verified": True, "ticket_number": ticket.ticket_number}
