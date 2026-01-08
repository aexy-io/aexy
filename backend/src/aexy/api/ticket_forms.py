"""Ticket Forms API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.ticketing import (
    TicketFormCreate,
    TicketFormUpdate,
    TicketFormResponse,
    TicketFormListResponse,
    TicketFormFieldCreate,
    TicketFormFieldUpdate,
    TicketFormFieldResponse,
    FieldReorder,
)
from aexy.services.ticket_form_service import TicketFormService
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/ticket-forms",
    tags=["Ticket Forms"],
)


def form_to_response(form, include_fields: bool = True) -> TicketFormResponse:
    """Convert TicketForm model to response schema."""
    fields = None
    if include_fields and form.fields:
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
                external_mappings=field.external_mappings or {},
                created_at=field.created_at,
                updated_at=field.updated_at,
            )
            for field in sorted(form.fields, key=lambda f: f.position)
        ]

    return TicketFormResponse(
        id=str(form.id),
        workspace_id=str(form.workspace_id),
        name=form.name,
        slug=form.slug,
        description=form.description,
        template_type=form.template_type,
        public_url_token=form.public_url_token,
        is_active=form.is_active,
        auth_mode=form.auth_mode,
        require_email=form.require_email,
        theme=form.theme or {},
        success_message=form.success_message,
        redirect_url=form.redirect_url,
        destinations=form.destinations or [],
        auto_create_task=form.auto_create_task,
        default_team_id=str(form.default_team_id) if form.default_team_id else None,
        conditional_rules=form.conditional_rules or [],
        submission_count=form.submission_count,
        created_by_id=str(form.created_by_id) if form.created_by_id else None,
        created_at=form.created_at,
        updated_at=form.updated_at,
        fields=fields,
    )


def form_to_list_response(form) -> TicketFormListResponse:
    """Convert TicketForm model to list response schema."""
    return TicketFormListResponse(
        id=str(form.id),
        workspace_id=str(form.workspace_id),
        name=form.name,
        slug=form.slug,
        description=form.description,
        template_type=form.template_type,
        public_url_token=form.public_url_token,
        is_active=form.is_active,
        auth_mode=form.auth_mode,
        submission_count=form.submission_count,
        created_at=form.created_at,
        updated_at=form.updated_at,
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


# ==================== Form Endpoints ====================

@router.get("/templates")
async def list_templates(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available form templates."""
    await check_workspace_permission(workspace_id, current_user, db)
    form_service = TicketFormService(db)
    return form_service.get_available_templates()


@router.post("/from-template/{template_type}", response_model=TicketFormResponse)
async def create_from_template(
    workspace_id: str,
    template_type: str,
    name: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a form from a template."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    try:
        form = await form_service.create_form_from_template(
            workspace_id=workspace_id,
            created_by_id=str(current_user.id),
            template_type=template_type,
            name=name,
        )
        return form_to_response(form)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=list[TicketFormListResponse])
async def list_forms(
    workspace_id: str,
    is_active: bool | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all ticket forms in a workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = TicketFormService(db)
    forms = await form_service.list_forms(workspace_id, is_active)
    return [form_to_list_response(form) for form in forms]


@router.post("", response_model=TicketFormResponse, status_code=status.HTTP_201_CREATED)
async def create_form(
    workspace_id: str,
    form_data: TicketFormCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new ticket form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.create_form(
        workspace_id=workspace_id,
        created_by_id=str(current_user.id),
        form_data=form_data,
    )
    return form_to_response(form)


@router.get("/{form_id}", response_model=TicketFormResponse)
async def get_form(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a ticket form by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    return form_to_response(form)


@router.patch("/{form_id}", response_model=TicketFormResponse)
async def update_form(
    workspace_id: str,
    form_id: str,
    form_data: TicketFormUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a ticket form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    updated = await form_service.update_form(form_id, form_data)
    return form_to_response(updated)


@router.delete("/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a ticket form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    await form_service.delete_form(form_id)


@router.post("/{form_id}/duplicate", response_model=TicketFormResponse)
async def duplicate_form(
    workspace_id: str,
    form_id: str,
    new_name: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a ticket form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    duplicated = await form_service.duplicate_form(
        form_id=form_id,
        new_name=new_name,
        created_by_id=str(current_user.id),
    )
    return form_to_response(duplicated)


# ==================== Field Endpoints ====================

@router.get("/{form_id}/fields", response_model=list[TicketFormFieldResponse])
async def list_fields(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all fields in a form."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    fields = await form_service.list_fields(form_id)
    return [
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
            external_mappings=field.external_mappings or {},
            created_at=field.created_at,
            updated_at=field.updated_at,
        )
        for field in fields
    ]


@router.post("/{form_id}/fields", response_model=TicketFormFieldResponse, status_code=status.HTTP_201_CREATED)
async def add_field(
    workspace_id: str,
    form_id: str,
    field_data: TicketFormFieldCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a field to a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    field = await form_service.add_field(form_id, field_data)
    return TicketFormFieldResponse(
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
        external_mappings=field.external_mappings or {},
        created_at=field.created_at,
        updated_at=field.updated_at,
    )


@router.patch("/{form_id}/fields/{field_id}", response_model=TicketFormFieldResponse)
async def update_field(
    workspace_id: str,
    form_id: str,
    field_id: str,
    field_data: TicketFormFieldUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a form field."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    field = await form_service.get_field(field_id)
    if not field or str(field.form_id) != form_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field not found",
        )

    updated = await form_service.update_field(field_id, field_data)
    return TicketFormFieldResponse(
        id=str(updated.id),
        form_id=str(updated.form_id),
        name=updated.name,
        field_key=updated.field_key,
        field_type=updated.field_type,
        placeholder=updated.placeholder,
        default_value=updated.default_value,
        help_text=updated.help_text,
        is_required=updated.is_required,
        validation_rules=updated.validation_rules or {},
        options=updated.options,
        position=updated.position,
        is_visible=updated.is_visible,
        external_mappings=updated.external_mappings or {},
        created_at=updated.created_at,
        updated_at=updated.updated_at,
    )


@router.delete("/{form_id}/fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_field(
    workspace_id: str,
    form_id: str,
    field_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a form field."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    field = await form_service.get_field(field_id)
    if not field or str(field.form_id) != form_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field not found",
        )

    await form_service.delete_field(field_id)


@router.patch("/{form_id}/fields/reorder", response_model=list[TicketFormFieldResponse])
async def reorder_fields(
    workspace_id: str,
    form_id: str,
    reorder_data: FieldReorder,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reorder form fields."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = TicketFormService(db)
    form = await form_service.get_form(form_id)

    if not form or str(form.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    fields = await form_service.reorder_fields(form_id, reorder_data.field_ids)
    return [
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
            external_mappings=field.external_mappings or {},
            created_at=field.created_at,
            updated_at=field.updated_at,
        )
        for field in fields
    ]
