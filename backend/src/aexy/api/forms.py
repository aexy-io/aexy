"""Forms API endpoints - Standalone forms module with multi-destination support."""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.forms import (
    FormCreate,
    FormUpdate,
    FormResponse,
    FormListResponse,
    FormFieldCreate,
    FormFieldUpdate,
    FormFieldResponse,
    FieldReorder,
    TicketConfigCreate,
    TicketConfigResponse,
    CRMMappingCreate,
    CRMMappingResponse,
    DealConfigCreate,
    DealConfigResponse,
    AutomationLinkCreate,
    AutomationLinkResponse,
    FormDuplicate,
    FormSubmissionResponse,
    FormSubmissionListResponse,
    FormSubmissionFilters,
    PublicFormResponse,
    PublicFormSubmission,
    PublicSubmissionResponse,
    EmailVerificationRequest,
    FormTemplateInfo,
)
from aexy.services.forms_service import FormsService
from aexy.services.form_submission_handler import FormSubmissionHandler
from aexy.services.workspace_service import WorkspaceService


# =============================================================================
# AUTHENTICATED ROUTES (Admin)
# =============================================================================

router = APIRouter(
    prefix="/workspaces/{workspace_id}/forms",
    tags=["Forms"],
)


def form_to_response(form, include_fields: bool = True) -> FormResponse:
    """Convert Form model to response schema."""
    fields = None
    if include_fields and form.fields:
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
                crm_attribute_id=str(field.crm_attribute_id) if field.crm_attribute_id else None,
                external_mappings=field.external_mappings or {},
                created_at=field.created_at,
                updated_at=field.updated_at,
            )
            for field in sorted(form.fields, key=lambda f: f.position)
        ]

    return FormResponse(
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
        auto_create_ticket=form.auto_create_ticket,
        default_team_id=str(form.default_team_id) if form.default_team_id else None,
        ticket_assignment_mode=form.ticket_assignment_mode,
        auto_create_record=form.auto_create_record,
        crm_object_id=str(form.crm_object_id) if form.crm_object_id else None,
        auto_create_deal=form.auto_create_deal,
        deal_pipeline_id=str(form.deal_pipeline_id) if form.deal_pipeline_id else None,
        trigger_automations=form.trigger_automations,
        destinations=form.destinations or [],
        conditional_rules=form.conditional_rules or [],
        submission_count=form.submission_count,
        created_by_id=str(form.created_by_id) if form.created_by_id else None,
        created_at=form.created_at,
        updated_at=form.updated_at,
        fields=fields,
        crm_object_name=form.crm_object.name if form.crm_object else None,
        default_team_name=form.default_team.name if form.default_team else None,
    )


def form_to_list_response(form) -> FormListResponse:
    """Convert Form model to list response schema."""
    return FormListResponse(
        id=str(form.id),
        workspace_id=str(form.workspace_id),
        name=form.name,
        slug=form.slug,
        description=form.description,
        template_type=form.template_type,
        public_url_token=form.public_url_token,
        is_active=form.is_active,
        auth_mode=form.auth_mode,
        auto_create_ticket=form.auto_create_ticket,
        auto_create_record=form.auto_create_record,
        auto_create_deal=form.auto_create_deal,
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


# ==================== Template Endpoints ====================

@router.get("/templates")
async def list_templates(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available form templates."""
    await check_workspace_permission(workspace_id, current_user, db)
    form_service = FormsService(db)
    return form_service.get_templates()


@router.post("/from-template/{template_type}", response_model=FormResponse)
async def create_from_template(
    workspace_id: str,
    template_type: str,
    name: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a form from a template."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    try:
        form = await form_service.create_form_from_template(
            workspace_id=workspace_id,
            created_by_id=str(current_user.id),
            template_type=template_type,
            name=name,
        )
        return form_to_response(form)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ==================== Form CRUD Endpoints ====================

@router.post("", response_model=FormResponse)
async def create_form(
    workspace_id: str,
    form_data: FormCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.create_form(
        workspace_id=workspace_id,
        created_by_id=str(current_user.id),
        form_data=form_data,
    )
    return form_to_response(form)


@router.get("", response_model=list[FormListResponse])
async def list_forms(
    workspace_id: str,
    is_active: bool | None = None,
    template_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List forms in a workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = FormsService(db)
    forms, total = await form_service.list_forms(
        workspace_id=workspace_id,
        is_active=is_active,
        template_type=template_type,
        limit=limit,
        offset=offset,
    )
    return [form_to_list_response(f) for f in forms]


@router.get("/{form_id}", response_model=FormResponse)
async def get_form(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a form by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = FormsService(db)
    form = await form_service.get_form(form_id)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    return form_to_response(form)


@router.patch("/{form_id}", response_model=FormResponse)
async def update_form(
    workspace_id: str,
    form_id: str,
    form_data: FormUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    form = await form_service.update_form(form_id, form_data)
    return form_to_response(form)


@router.delete("/{form_id}")
async def delete_form(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    await form_service.delete_form(form_id)
    return {"status": "deleted"}


@router.post("/{form_id}/duplicate", response_model=FormResponse)
async def duplicate_form(
    workspace_id: str,
    form_id: str,
    data: FormDuplicate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    new_form = await form_service.duplicate_form(
        form_id=form_id,
        new_name=data.name,
        created_by_id=str(current_user.id),
    )
    return form_to_response(new_form)


# ==================== Field Management Endpoints ====================

@router.post("/{form_id}/fields", response_model=FormFieldResponse)
async def add_field(
    workspace_id: str,
    form_id: str,
    field_data: FormFieldCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a field to a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    field = await form_service.add_field(form_id, field_data)
    return FormFieldResponse(
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
        crm_attribute_id=str(field.crm_attribute_id) if field.crm_attribute_id else None,
        external_mappings=field.external_mappings or {},
        created_at=field.created_at,
        updated_at=field.updated_at,
    )


@router.patch("/{form_id}/fields/{field_id}", response_model=FormFieldResponse)
async def update_field(
    workspace_id: str,
    form_id: str,
    field_id: str,
    field_data: FormFieldUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a form field."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    field = await form_service.update_field(field_id, field_data)
    if not field or field.form_id != form_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    return FormFieldResponse(
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
        crm_attribute_id=str(field.crm_attribute_id) if field.crm_attribute_id else None,
        external_mappings=field.external_mappings or {},
        created_at=field.created_at,
        updated_at=field.updated_at,
    )


@router.delete("/{form_id}/fields/{field_id}")
async def delete_field(
    workspace_id: str,
    form_id: str,
    field_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a form field."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    deleted = await form_service.delete_field(field_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    return {"status": "deleted"}


@router.post("/{form_id}/fields/reorder")
async def reorder_fields(
    workspace_id: str,
    form_id: str,
    data: FieldReorder,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reorder form fields."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    fields = await form_service.reorder_fields(form_id, data.field_ids)
    return {"status": "reordered", "field_count": len(fields)}


# ==================== Ticket Configuration Endpoints ====================

@router.post("/{form_id}/ticket-config", response_model=FormResponse)
async def configure_ticket(
    workspace_id: str,
    form_id: str,
    config: TicketConfigCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Configure ticket creation for a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    form = await form_service.configure_ticket(form_id, config)
    return form_to_response(form)


@router.get("/{form_id}/ticket-config", response_model=TicketConfigResponse)
async def get_ticket_config(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket configuration for a form."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    return TicketConfigResponse(
        auto_create_ticket=form.auto_create_ticket,
        default_team_id=str(form.default_team_id) if form.default_team_id else None,
        default_team_name=form.default_team.name if form.default_team else None,
        ticket_assignment_mode=form.ticket_assignment_mode,
        ticket_assignee_id=str(form.ticket_assignee_id) if form.ticket_assignee_id else None,
        ticket_assignee_name=form.ticket_assignee.name if form.ticket_assignee else None,
        default_priority=form.default_priority,
        default_severity=form.default_severity,
        ticket_field_mappings=form.ticket_field_mappings or {},
        ticket_config=form.ticket_config or {},
    )


@router.delete("/{form_id}/ticket-config")
async def disable_ticket(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disable ticket creation for a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    await form_service.disable_ticket(form_id)
    return {"status": "disabled"}


# ==================== CRM Mapping Endpoints ====================

@router.post("/{form_id}/crm-mapping", response_model=FormResponse)
async def configure_crm_mapping(
    workspace_id: str,
    form_id: str,
    config: CRMMappingCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Configure CRM record creation for a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    try:
        form = await form_service.configure_crm_mapping(form_id, config)
        return form_to_response(form)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{form_id}/crm-mapping", response_model=CRMMappingResponse)
async def get_crm_mapping(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get CRM mapping configuration for a form."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    return CRMMappingResponse(
        auto_create_record=form.auto_create_record,
        crm_object_id=str(form.crm_object_id) if form.crm_object_id else None,
        crm_object_name=form.crm_object.name if form.crm_object else None,
        crm_field_mappings=form.crm_field_mappings or {},
        record_owner_id=str(form.record_owner_id) if form.record_owner_id else None,
        record_owner_name=form.record_owner.name if form.record_owner else None,
    )


@router.delete("/{form_id}/crm-mapping")
async def remove_crm_mapping(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove CRM mapping from a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    await form_service.remove_crm_mapping(form_id)
    return {"status": "removed"}


# ==================== Deal Configuration Endpoints ====================

@router.post("/{form_id}/deal-config", response_model=FormResponse)
async def configure_deal(
    workspace_id: str,
    form_id: str,
    config: DealConfigCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Configure deal creation for a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    form = await form_service.configure_deal(form_id, config)
    return form_to_response(form)


@router.get("/{form_id}/deal-config", response_model=DealConfigResponse)
async def get_deal_config(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get deal configuration for a form."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = FormsService(db)
    form = await form_service.get_form(form_id, include_fields=False)
    if not form or form.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    return DealConfigResponse(
        auto_create_deal=form.auto_create_deal,
        deal_pipeline_id=str(form.deal_pipeline_id) if form.deal_pipeline_id else None,
        deal_stage_id=str(form.deal_stage_id) if form.deal_stage_id else None,
        deal_field_mappings=form.deal_field_mappings or {},
        link_deal_to_record=form.link_deal_to_record,
    )


@router.delete("/{form_id}/deal-config")
async def disable_deal(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disable deal creation for a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    await form_service.disable_deal(form_id)
    return {"status": "disabled"}


# ==================== Automation Endpoints ====================

@router.get("/{form_id}/automations", response_model=list[AutomationLinkResponse])
async def list_form_automations(
    workspace_id: str,
    form_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List automations linked to a form."""
    await check_workspace_permission(workspace_id, current_user, db)

    form_service = FormsService(db)
    links = await form_service.list_form_automations(form_id)
    return [
        AutomationLinkResponse(
            id=str(link.id),
            form_id=str(link.form_id),
            automation_id=str(link.automation_id),
            is_active=link.is_active,
            conditions=link.conditions or [],
            created_at=link.created_at,
        )
        for link in links
    ]


@router.post("/{form_id}/automations", response_model=AutomationLinkResponse)
async def link_automation(
    workspace_id: str,
    form_id: str,
    config: AutomationLinkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link an automation to a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    link = await form_service.link_automation(form_id, config)
    return AutomationLinkResponse(
        id=str(link.id),
        form_id=str(link.form_id),
        automation_id=str(link.automation_id),
        is_active=link.is_active,
        conditions=link.conditions or [],
        created_at=link.created_at,
    )


@router.delete("/{form_id}/automations/{automation_id}")
async def unlink_automation(
    workspace_id: str,
    form_id: str,
    automation_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unlink an automation from a form."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    form_service = FormsService(db)
    deleted = await form_service.unlink_automation(form_id, automation_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    return {"status": "unlinked"}


# ==================== Submission Endpoints ====================

@router.get("/{form_id}/submissions", response_model=list[FormSubmissionListResponse])
async def list_submissions(
    workspace_id: str,
    form_id: str,
    status: list[str] | None = None,
    email: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List submissions for a form."""
    await check_workspace_permission(workspace_id, current_user, db)

    handler = FormSubmissionHandler(db)
    submissions, total = await handler.list_submissions(
        form_id=form_id,
        status=status,
        email=email,
        limit=limit,
        offset=offset,
    )

    return [
        FormSubmissionListResponse(
            id=str(s.id),
            form_id=str(s.form_id),
            email=s.email,
            name=s.name,
            is_verified=s.is_verified,
            status=s.status,
            ticket_id=str(s.ticket_id) if s.ticket_id else None,
            crm_record_id=str(s.crm_record_id) if s.crm_record_id else None,
            deal_id=str(s.deal_id) if s.deal_id else None,
            submitted_at=s.submitted_at,
        )
        for s in submissions
    ]


@router.get("/{form_id}/submissions/{submission_id}", response_model=FormSubmissionResponse)
async def get_submission(
    workspace_id: str,
    form_id: str,
    submission_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a submission by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    handler = FormSubmissionHandler(db)
    submission = await handler.get_submission(submission_id)
    if not submission or submission.form_id != form_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    return FormSubmissionResponse(
        id=str(submission.id),
        form_id=str(submission.form_id),
        workspace_id=str(submission.workspace_id),
        data=submission.data,
        attachments=submission.attachments or [],
        email=submission.email,
        name=submission.name,
        is_verified=submission.is_verified,
        verified_at=submission.verified_at,
        status=submission.status,
        processing_errors=submission.processing_errors or [],
        ticket_id=str(submission.ticket_id) if submission.ticket_id else None,
        crm_record_id=str(submission.crm_record_id) if submission.crm_record_id else None,
        deal_id=str(submission.deal_id) if submission.deal_id else None,
        external_issues=submission.external_issues or [],
        automations_triggered=submission.automations_triggered or [],
        ip_address=submission.ip_address,
        user_agent=submission.user_agent,
        referrer_url=submission.referrer_url,
        utm_params=submission.utm_params or {},
        submitted_at=submission.submitted_at,
        processed_at=submission.processed_at,
    )


# =============================================================================
# PUBLIC ROUTES (No Auth Required)
# =============================================================================

public_router = APIRouter(
    prefix="/forms",
    tags=["Public Forms"],
)


@public_router.get("/{public_token}", response_model=PublicFormResponse)
async def get_public_form(
    public_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a public form for rendering."""
    form_service = FormsService(db)
    form = await form_service.get_form_by_public_token(public_token)

    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

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


@public_router.post("/{public_token}/submit", response_model=PublicSubmissionResponse)
async def submit_form(
    public_token: str,
    submission_data: PublicFormSubmission,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Submit a form through public endpoint."""
    form_service = FormsService(db)
    form = await form_service.get_form_by_public_token(public_token)

    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    # Check email requirement
    if form.require_email and not submission_data.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    # Get request metadata
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    referrer_url = request.headers.get("referer")

    try:
        handler = FormSubmissionHandler(db)
        submission = await handler.process_submission(
            form=form,
            submission_data=submission_data,
            ip_address=ip_address,
            user_agent=user_agent,
            referrer_url=referrer_url,
        )

        return PublicSubmissionResponse(
            submission_id=str(submission.id),
            success_message=form.success_message,
            redirect_url=form.redirect_url,
            requires_email_verification=form.auth_mode == "email_verification",
            ticket_number=submission.ticket.ticket_number if submission.ticket else None,
            crm_record_id=str(submission.crm_record_id) if submission.crm_record_id else None,
            deal_id=str(submission.deal_id) if submission.deal_id else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@public_router.post("/{public_token}/verify")
async def verify_email(
    public_token: str,
    data: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify submission email."""
    handler = FormSubmissionHandler(db)
    submission = await handler.verify_email(data.token)

    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired token")

    return {"status": "verified", "submission_id": str(submission.id)}
