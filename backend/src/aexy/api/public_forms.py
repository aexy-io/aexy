"""Public Forms API endpoints - No authentication required.

Both the legacy ticket-forms module and the newer Forms module publish their
public pages under the same ``/public/forms/{token}`` URL, and this router is
mounted before the Forms module's public router (see ``api/__init__.py``), so
it receives *all* ``/public/forms/*`` traffic. To keep both systems reachable
this router resolves a token against the ticket-forms table first and then
falls back to the Forms module. Without the fallback, any Forms-module form
returns 404 even when it is active/public.
"""

import logging

import redis.asyncio as redis
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.core.database import get_db
from aexy.schemas.ticketing import (
    PublicFormResponse,
    PublicTicketSubmission,
    PublicSubmissionResponse,
    EmailVerificationRequest,
    TicketFormFieldResponse,
)
from aexy.schemas.forms import (
    PublicFormResponse as FormsPublicFormResponse,
    PublicFormSubmission as FormsPublicSubmission,
    FormFieldResponse,
)
from aexy.services.ticket_form_service import TicketFormService
from aexy.services.ticket_service import TicketService
from aexy.services.forms_service import FormsService
from aexy.services.form_submission_handler import FormSubmissionHandler
from aexy.services.public_form_upload_service import (
    PublicUploadError,
    extract_attachments,
    stage_upload,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/public/forms",
    tags=["Public Forms"],
)

# Anonymous uploads are capped per IP so a public form can't be used as free
# object storage. Deliberately generous — a legitimate submitter attaching a few
# screenshots, plus retries, stays well under it.
UPLOAD_RATE_LIMIT = 30
UPLOAD_RATE_WINDOW = 600  # seconds

_UPLOAD_ERROR_STATUS = {
    "too_large": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    "unsupported_type": status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    "storage_unconfigured": status.HTTP_502_BAD_GATEWAY,
    "upload_failed": status.HTTP_502_BAD_GATEWAY,
}

_redis_client = None


def _get_redis():
    """Lazily build the async Redis client used for the upload rate limit."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url or "redis://localhost:6379/0",
            decode_responses=True,
        )
    return _redis_client


async def _enforce_upload_rate_limit(request: Request) -> None:
    """Best-effort per-IP cap on anonymous uploads.

    Fails open when Redis is unreachable — a cache outage must not take public
    forms down, and the per-file size/type rules still bound the damage.
    """
    ip = request.client.host if request.client else None
    if not ip:
        return
    try:
        client = _get_redis()
        key = f"public_form_uploads:{ip}"
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, UPLOAD_RATE_WINDOW)
    except Exception as exc:  # noqa: BLE001 - fail open, see docstring
        logger.warning("Public form upload rate limit unavailable: %s", exc)
        return
    if count > UPLOAD_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many uploads from this address. Please try again later.",
        )


async def resolve_public_form(db: AsyncSession, public_token: str):
    """Resolve a public token against ticket-forms, then the Forms module.

    Returns ``("ticket", form)`` / ``("forms", form)``, or None when neither
    module has an active form for the token.
    """
    ticket_form = await TicketFormService(db).get_form_by_token(public_token)
    if ticket_form:
        return "ticket", ticket_form

    forms_form = await FormsService(db).get_form_by_public_token(public_token)
    if forms_form:
        return "forms", forms_form

    return None


def _upload_size(upload: UploadFile) -> int:
    """Size of an upload, measured from the spooled file when not reported."""
    if upload.size is not None:
        return upload.size
    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(0)
    return size


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


def forms_form_to_public_response(form) -> FormsPublicFormResponse:
    """Convert a Forms-module Form model to its public response schema.

    Mirrors the builder in ``api/forms.py`` so the shared public page renders
    Forms-module forms identically whether reached here (via the fallback) or
    through the Forms module's own — currently shadowed — router.
    """
    fields = [
        FormFieldResponse(
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
            width=field.width,
            crm_attribute_id=None,  # Don't expose CRM mapping to public
            external_mappings={},  # Don't expose external mappings to public
            created_at=field.created_at,
            updated_at=field.updated_at,
        )
        for field in sorted(form.fields, key=lambda f: f.position)
        if field.is_visible
    ]

    return FormsPublicFormResponse(
        id=str(form.id),
        name=form.name,
        description=form.description,
        auth_mode=form.auth_mode,
        require_email=form.require_email,
        theme=form.theme or {},
        fields=fields,
        conditional_rules=form.conditional_rules or [],
        thank_you_page=form.thank_you_page or {},
    )


@router.get("/{public_token}", response_model=None)
async def get_public_form(
    public_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a public form by its token for rendering.

    This endpoint is publicly accessible without authentication. It resolves
    the token against ticket-forms first, then the Forms module.
    """
    form_service = TicketFormService(db)
    form = await form_service.get_form_by_token(public_token)
    if form:
        return form_to_public_response(form)

    # Fall back to the Forms module (same public URL space).
    forms_service = FormsService(db)
    forms_form = await forms_service.get_form_by_public_token(public_token)
    if forms_form:
        return forms_form_to_public_response(forms_form)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Form not found or inactive",
    )


@router.post("/{public_token}/uploads", status_code=status.HTTP_201_CREATED)
async def upload_public_form_file(
    public_token: str,
    request: Request,
    field_key: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Stage a file for a public form's ``file`` field, ahead of submission.

    The submit endpoint takes JSON, so file bytes can't ride along with it. The
    form page uploads here as soon as a file is picked and puts the returned
    signed ``ref`` into ``field_values[field_key]``; submit then verifies the
    signature and records the object as an attachment.

    Unauthenticated by design — the form page is public — and bounded by a
    per-IP rate limit plus the field's own size and MIME rules.
    """
    resolved = await resolve_public_form(db, public_token)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found or inactive",
        )
    _, form = resolved

    field = next(
        (
            f
            for f in form.fields
            if f.field_key == field_key
            and f.is_visible
            and str(f.field_type) == "file"
        ),
        None,
    )
    if field is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{field_key}' is not a file field on this form",
        )

    await _enforce_upload_rate_limit(request)

    try:
        staged = stage_upload(
            form_id=str(form.id),
            field_key=field_key,
            filename=file.filename or "attachment",
            content_type=file.content_type,
            fileobj=file.file,
            size=_upload_size(file),
            validation_rules=field.validation_rules,
        )
    except PublicUploadError as exc:
        raise HTTPException(
            status_code=_UPLOAD_ERROR_STATUS.get(
                exc.code, status.HTTP_400_BAD_REQUEST
            ),
            detail=exc.message,
        )

    # The storage key stays server-side; the signed ref is the only handle the
    # browser gets.
    return {
        "ref": staged["ref"],
        "filename": staged["filename"],
        "size": staged["size"],
        "type": staged["type"],
    }


@router.post("/{public_token}/submit", response_model=None)
async def submit_ticket(
    public_token: str,
    submission: PublicTicketSubmission,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Submit through a public form.

    This endpoint is publicly accessible without authentication.
    Resolves ticket-forms first, then falls back to the Forms module.
    """
    form_service = TicketFormService(db)
    ticket_service = TicketService(db)

    # Get form
    form = await form_service.get_form_by_token(public_token)

    if not form:
        # Fall back to the Forms module. The shared public page posts the
        # ticket-shaped payload, so translate it into a Forms submission.
        forms_service = FormsService(db)
        forms_form = await forms_service.get_form_by_public_token(public_token)
        if not forms_form:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form not found or inactive",
            )

        if forms_form.require_email and not submission.submitter_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is required for this form",
            )

        # File fields carry signed refs from /uploads; turn them back into
        # attachment rows and leave plain filenames in the submitted data.
        forms_values, forms_attachments = extract_attachments(
            form_id=str(forms_form.id),
            fields=forms_form.fields,
            field_values=submission.field_values,
        )

        handler = FormSubmissionHandler(db)
        try:
            forms_submission = await handler.process_submission(
                form=forms_form,
                submission_data=FormsPublicSubmission(
                    email=submission.submitter_email,
                    name=submission.submitter_name,
                    data=forms_values,
                ),
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                referrer_url=request.headers.get("referer"),
                attachments=forms_attachments,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        return {
            "submission_id": str(forms_submission.id),
            "ticket_number": (
                forms_submission.ticket.ticket_number
                if forms_submission.ticket
                else None
            ),
            "success_message": forms_form.success_message,
            "redirect_url": forms_form.redirect_url,
            "requires_email_verification": forms_form.auth_mode == "email_verification",
        }

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

    # File fields carry signed refs from /uploads; turn them back into
    # attachment rows and leave plain filenames in the stored field values.
    field_values, attachments = extract_attachments(
        form_id=str(form.id),
        fields=form.fields,
        field_values=submission.field_values,
    )
    submission = submission.model_copy(update={"field_values": field_values})

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
        attachments=attachments,
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
    """Verify email for a submission.

    This endpoint is publicly accessible without authentication.
    Resolves ticket-forms first, then falls back to the Forms module.
    """
    form_service = TicketFormService(db)
    ticket_service = TicketService(db)

    # Validate form exists
    form = await form_service.get_form_by_token(public_token)
    if not form:
        # Fall back to the Forms module.
        forms_service = FormsService(db)
        forms_form = await forms_service.get_form_by_public_token(public_token)
        if not forms_form:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form not found",
            )

        handler = FormSubmissionHandler(db)
        forms_submission = await handler.verify_email(verification.token)
        if not forms_submission:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification token",
            )
        return {
            "verified": True,
            "ticket_number": (
                forms_submission.ticket.ticket_number
                if forms_submission.ticket
                else None
            ),
        }

    # Verify email
    ticket = await ticket_service.verify_email(verification.token)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    return {"verified": True, "ticket_number": ticket.ticket_number}
