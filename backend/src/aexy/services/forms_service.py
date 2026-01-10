"""Forms service for managing standalone forms with multi-destination support."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.forms import (
    Form,
    FormField,
    FormSubmission,
    FormAutomationLink,
    FormTemplateType,
    FormFieldType,
    FormSubmissionStatus,
    TicketAssignmentMode,
)
from aexy.models.crm import CRMObject, CRMAttribute, CRMAutomation
from aexy.schemas.forms import (
    FormCreate,
    FormUpdate,
    FormFieldCreate,
    FormFieldUpdate,
    TicketConfigCreate,
    CRMMappingCreate,
    DealConfigCreate,
    AutomationLinkCreate,
    FormDuplicate,
)


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '_', text)
    return text.strip('_')


# =============================================================================
# FORM TEMPLATES
# =============================================================================

FORM_TEMPLATES = {
    "bug_report": {
        "name": "Bug Report",
        "description": "Report a bug or issue",
        "suggested_crm_object": None,
        "fields": [
            {
                "name": "Title",
                "field_key": "title",
                "field_type": "text",
                "placeholder": "Brief description of the bug",
                "is_required": True,
                "validation_rules": {"min_length": 5, "max_length": 200},
                "external_mappings": {"github": "title", "jira": "summary", "linear": "title"},
            },
            {
                "name": "Description",
                "field_key": "description",
                "field_type": "textarea",
                "placeholder": "Detailed description of the issue",
                "is_required": True,
                "validation_rules": {"min_length": 20},
                "external_mappings": {"github": "body", "jira": "description", "linear": "description"},
            },
            {
                "name": "Steps to Reproduce",
                "field_key": "steps_to_reproduce",
                "field_type": "textarea",
                "placeholder": "1. Go to...\n2. Click on...\n3. See error",
                "is_required": False,
            },
            {
                "name": "Severity",
                "field_key": "severity",
                "field_type": "select",
                "is_required": True,
                "options": [
                    {"value": "low", "label": "Low"},
                    {"value": "medium", "label": "Medium"},
                    {"value": "high", "label": "High"},
                    {"value": "critical", "label": "Critical"},
                ],
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
            },
        ],
    },
    "feature_request": {
        "name": "Feature Request",
        "description": "Suggest a new feature or improvement",
        "suggested_crm_object": None,
        "fields": [
            {
                "name": "Feature Title",
                "field_key": "title",
                "field_type": "text",
                "placeholder": "Brief title for your feature request",
                "is_required": True,
                "validation_rules": {"min_length": 5, "max_length": 200},
            },
            {
                "name": "Description",
                "field_key": "description",
                "field_type": "textarea",
                "placeholder": "Describe the feature you'd like to see",
                "is_required": True,
            },
            {
                "name": "Priority",
                "field_key": "priority",
                "field_type": "select",
                "is_required": True,
                "options": [
                    {"value": "nice_to_have", "label": "Nice to have"},
                    {"value": "would_help", "label": "Would help"},
                    {"value": "important", "label": "Important"},
                    {"value": "critical", "label": "Critical"},
                ],
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
            },
        ],
    },
    "support": {
        "name": "Support Request",
        "description": "Get help with an issue",
        "suggested_crm_object": None,
        "fields": [
            {
                "name": "Subject",
                "field_key": "title",
                "field_type": "text",
                "placeholder": "What do you need help with?",
                "is_required": True,
            },
            {
                "name": "Category",
                "field_key": "category",
                "field_type": "select",
                "is_required": True,
                "options": [
                    {"value": "account", "label": "Account & Billing"},
                    {"value": "technical", "label": "Technical Issue"},
                    {"value": "usage", "label": "How to Use"},
                    {"value": "other", "label": "Other"},
                ],
            },
            {
                "name": "Description",
                "field_key": "description",
                "field_type": "textarea",
                "placeholder": "Please describe your issue",
                "is_required": True,
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
            },
        ],
    },
    "contact": {
        "name": "Contact Us",
        "description": "General contact form",
        "suggested_crm_object": "person",
        "fields": [
            {
                "name": "Full Name",
                "field_key": "name",
                "field_type": "text",
                "placeholder": "Your full name",
                "is_required": True,
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
            },
            {
                "name": "Phone",
                "field_key": "phone",
                "field_type": "phone",
                "placeholder": "+1 (555) 000-0000",
                "is_required": False,
            },
            {
                "name": "Company",
                "field_key": "company",
                "field_type": "text",
                "placeholder": "Your company name",
                "is_required": False,
            },
            {
                "name": "Message",
                "field_key": "message",
                "field_type": "textarea",
                "placeholder": "How can we help you?",
                "is_required": True,
            },
        ],
    },
    "lead_capture": {
        "name": "Lead Capture",
        "description": "Capture leads for sales pipeline",
        "suggested_crm_object": "person",
        "fields": [
            {
                "name": "Full Name",
                "field_key": "name",
                "field_type": "text",
                "placeholder": "Your full name",
                "is_required": True,
            },
            {
                "name": "Work Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "you@company.com",
                "is_required": True,
            },
            {
                "name": "Company",
                "field_key": "company",
                "field_type": "text",
                "placeholder": "Company name",
                "is_required": True,
            },
            {
                "name": "Job Title",
                "field_key": "job_title",
                "field_type": "text",
                "placeholder": "Your role",
                "is_required": False,
            },
            {
                "name": "Company Size",
                "field_key": "company_size",
                "field_type": "select",
                "is_required": False,
                "options": [
                    {"value": "1-10", "label": "1-10 employees"},
                    {"value": "11-50", "label": "11-50 employees"},
                    {"value": "51-200", "label": "51-200 employees"},
                    {"value": "201-500", "label": "201-500 employees"},
                    {"value": "500+", "label": "500+ employees"},
                ],
            },
            {
                "name": "How did you hear about us?",
                "field_key": "source",
                "field_type": "select",
                "is_required": False,
                "options": [
                    {"value": "search", "label": "Search Engine"},
                    {"value": "social", "label": "Social Media"},
                    {"value": "referral", "label": "Referral"},
                    {"value": "blog", "label": "Blog Post"},
                    {"value": "other", "label": "Other"},
                ],
            },
        ],
    },
    "feedback": {
        "name": "Feedback",
        "description": "Collect user feedback",
        "suggested_crm_object": None,
        "fields": [
            {
                "name": "How would you rate your experience?",
                "field_key": "rating",
                "field_type": "select",
                "is_required": True,
                "options": [
                    {"value": "5", "label": "Excellent"},
                    {"value": "4", "label": "Good"},
                    {"value": "3", "label": "Average"},
                    {"value": "2", "label": "Poor"},
                    {"value": "1", "label": "Very Poor"},
                ],
            },
            {
                "name": "What did you like?",
                "field_key": "likes",
                "field_type": "textarea",
                "placeholder": "Tell us what you enjoyed",
                "is_required": False,
            },
            {
                "name": "What could be improved?",
                "field_key": "improvements",
                "field_type": "textarea",
                "placeholder": "Tell us what we can do better",
                "is_required": False,
            },
            {
                "name": "Email (optional)",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": False,
            },
        ],
    },
}


class FormsService:
    """Service for managing forms with multi-destination support."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # FORM CRUD
    # =========================================================================

    async def create_form(
        self,
        workspace_id: str,
        created_by_id: str,
        form_data: FormCreate,
    ) -> Form:
        """Create a new form."""
        # Generate slug from name
        slug = slugify(form_data.name)

        # Ensure slug is unique within workspace
        existing = await self._get_form_by_slug(workspace_id, slug)
        if existing:
            slug = f"{slug}_{str(uuid4())[:8]}"

        form = Form(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=form_data.name,
            slug=slug,
            description=form_data.description,
            template_type=form_data.template_type,
            auth_mode=form_data.auth_mode,
            require_email=form_data.require_email,
            theme=form_data.theme.model_dump() if form_data.theme else {},
            success_message=form_data.success_message,
            redirect_url=form_data.redirect_url,
            destinations=[d.model_dump() for d in form_data.destinations] if form_data.destinations else [],
            conditional_rules=[r.model_dump() for r in form_data.conditional_rules] if form_data.conditional_rules else [],
            created_by_id=created_by_id,
        )
        self.db.add(form)
        await self.db.flush()

        # Create fields if provided
        if form_data.fields:
            for i, field_data in enumerate(form_data.fields):
                await self._create_field(form.id, field_data, position=i)

        await self.db.refresh(form)
        return form

    async def create_form_from_template(
        self,
        workspace_id: str,
        created_by_id: str,
        template_type: str,
        name: str | None = None,
    ) -> Form:
        """Create a form from a pre-built template."""
        if template_type not in FORM_TEMPLATES:
            raise ValueError(f"Unknown template type: {template_type}")

        template = FORM_TEMPLATES[template_type]
        form_name = name or template["name"]

        # Generate slug
        slug = slugify(form_name)
        existing = await self._get_form_by_slug(workspace_id, slug)
        if existing:
            slug = f"{slug}_{str(uuid4())[:8]}"

        form = Form(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=form_name,
            slug=slug,
            description=template["description"],
            template_type=template_type,
            created_by_id=created_by_id,
        )
        self.db.add(form)
        await self.db.flush()

        # Create template fields
        for i, field_data in enumerate(template["fields"]):
            field = FormField(
                id=str(uuid4()),
                form_id=form.id,
                name=field_data["name"],
                field_key=field_data["field_key"],
                field_type=field_data.get("field_type", "text"),
                placeholder=field_data.get("placeholder"),
                help_text=field_data.get("help_text"),
                is_required=field_data.get("is_required", False),
                validation_rules=field_data.get("validation_rules", {}),
                options=field_data.get("options"),
                position=i,
                external_mappings=field_data.get("external_mappings", {}),
            )
            self.db.add(field)

        await self.db.refresh(form)
        return form

    async def get_form(self, form_id: str, include_fields: bool = True) -> Form | None:
        """Get a form by ID."""
        query = select(Form).where(Form.id == form_id)
        if include_fields:
            query = query.options(selectinload(Form.fields))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_form_by_public_token(self, public_token: str) -> Form | None:
        """Get a form by its public URL token."""
        query = (
            select(Form)
            .where(Form.public_url_token == public_token)
            .where(Form.is_active == True)
            .options(selectinload(Form.fields))
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_forms(
        self,
        workspace_id: str,
        is_active: bool | None = None,
        template_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Form], int]:
        """List forms for a workspace."""
        query = select(Form).where(Form.workspace_id == workspace_id)

        if is_active is not None:
            query = query.where(Form.is_active == is_active)
        if template_type:
            query = query.where(Form.template_type == template_type)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query)

        # Get paginated results
        query = query.order_by(Form.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        forms = list(result.scalars().all())

        return forms, total or 0

    async def update_form(self, form_id: str, form_data: FormUpdate) -> Form | None:
        """Update a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        update_data = form_data.model_dump(exclude_unset=True)

        # Handle nested objects
        if "theme" in update_data and update_data["theme"]:
            update_data["theme"] = form_data.theme.model_dump()
        if "conditional_rules" in update_data and update_data["conditional_rules"]:
            update_data["conditional_rules"] = [r.model_dump() for r in form_data.conditional_rules]
        if "destinations" in update_data and update_data["destinations"]:
            update_data["destinations"] = [d.model_dump() for d in form_data.destinations]

        for key, value in update_data.items():
            setattr(form, key, value)

        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def delete_form(self, form_id: str) -> bool:
        """Delete a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return False

        await self.db.delete(form)
        await self.db.flush()
        return True

    async def duplicate_form(
        self,
        form_id: str,
        new_name: str,
        created_by_id: str,
    ) -> Form | None:
        """Duplicate a form with all its fields."""
        original = await self.get_form(form_id, include_fields=True)
        if not original:
            return None

        # Generate new slug
        slug = slugify(new_name)
        existing = await self._get_form_by_slug(original.workspace_id, slug)
        if existing:
            slug = f"{slug}_{str(uuid4())[:8]}"

        # Create new form
        new_form = Form(
            id=str(uuid4()),
            workspace_id=original.workspace_id,
            name=new_name,
            slug=slug,
            description=original.description,
            template_type=original.template_type,
            auth_mode=original.auth_mode,
            require_email=original.require_email,
            theme=original.theme,
            success_message=original.success_message,
            redirect_url=original.redirect_url,
            auto_create_ticket=original.auto_create_ticket,
            ticket_config=original.ticket_config,
            default_team_id=original.default_team_id,
            ticket_assignment_mode=original.ticket_assignment_mode,
            ticket_assignee_id=original.ticket_assignee_id,
            default_severity=original.default_severity,
            default_priority=original.default_priority,
            ticket_field_mappings=original.ticket_field_mappings,
            auto_create_record=original.auto_create_record,
            crm_object_id=original.crm_object_id,
            crm_field_mappings=original.crm_field_mappings,
            record_owner_id=original.record_owner_id,
            auto_create_deal=original.auto_create_deal,
            deal_pipeline_id=original.deal_pipeline_id,
            deal_stage_id=original.deal_stage_id,
            deal_field_mappings=original.deal_field_mappings,
            link_deal_to_record=original.link_deal_to_record,
            trigger_automations=original.trigger_automations,
            destinations=original.destinations,
            conditional_rules=original.conditional_rules,
            created_by_id=created_by_id,
        )
        self.db.add(new_form)
        await self.db.flush()

        # Duplicate fields
        for field in original.fields:
            new_field = FormField(
                id=str(uuid4()),
                form_id=new_form.id,
                name=field.name,
                field_key=field.field_key,
                field_type=field.field_type,
                placeholder=field.placeholder,
                default_value=field.default_value,
                help_text=field.help_text,
                is_required=field.is_required,
                validation_rules=field.validation_rules,
                options=field.options,
                position=field.position,
                is_visible=field.is_visible,
                width=field.width,
                crm_attribute_id=field.crm_attribute_id,
                external_mappings=field.external_mappings,
            )
            self.db.add(new_field)

        await self.db.refresh(new_form)
        return new_form

    # =========================================================================
    # FIELD MANAGEMENT
    # =========================================================================

    async def add_field(
        self,
        form_id: str,
        field_data: FormFieldCreate,
    ) -> FormField:
        """Add a field to a form."""
        # Get max position
        query = select(func.max(FormField.position)).where(FormField.form_id == form_id)
        max_pos = await self.db.scalar(query) or -1

        return await self._create_field(form_id, field_data, position=max_pos + 1)

    async def _create_field(
        self,
        form_id: str,
        field_data: FormFieldCreate,
        position: int,
    ) -> FormField:
        """Create a form field."""
        field = FormField(
            id=str(uuid4()),
            form_id=form_id,
            name=field_data.name,
            field_key=field_data.field_key,
            field_type=field_data.field_type,
            placeholder=field_data.placeholder,
            default_value=field_data.default_value,
            help_text=field_data.help_text,
            is_required=field_data.is_required,
            validation_rules=field_data.validation_rules.model_dump() if field_data.validation_rules else {},
            options=[o.model_dump() for o in field_data.options] if field_data.options else None,
            position=field_data.position if field_data.position is not None else position,
            is_visible=field_data.is_visible,
            width=field_data.width,
            crm_attribute_id=field_data.crm_attribute_id,
            external_mappings=field_data.external_mappings.model_dump() if field_data.external_mappings else {},
        )
        self.db.add(field)
        await self.db.flush()
        await self.db.refresh(field)
        return field

    async def update_field(
        self,
        field_id: str,
        field_data: FormFieldUpdate,
    ) -> FormField | None:
        """Update a form field."""
        query = select(FormField).where(FormField.id == field_id)
        result = await self.db.execute(query)
        field = result.scalar_one_or_none()

        if not field:
            return None

        update_data = field_data.model_dump(exclude_unset=True)

        # Handle nested objects
        if "validation_rules" in update_data and update_data["validation_rules"]:
            update_data["validation_rules"] = field_data.validation_rules.model_dump()
        if "options" in update_data and update_data["options"]:
            update_data["options"] = [o.model_dump() for o in field_data.options]
        if "external_mappings" in update_data and update_data["external_mappings"]:
            update_data["external_mappings"] = field_data.external_mappings.model_dump()

        for key, value in update_data.items():
            setattr(field, key, value)

        await self.db.flush()
        await self.db.refresh(field)
        return field

    async def delete_field(self, field_id: str) -> bool:
        """Delete a form field."""
        query = select(FormField).where(FormField.id == field_id)
        result = await self.db.execute(query)
        field = result.scalar_one_or_none()

        if not field:
            return False

        await self.db.delete(field)
        await self.db.flush()
        return True

    async def reorder_fields(self, form_id: str, field_ids: list[str]) -> list[FormField]:
        """Reorder form fields."""
        query = select(FormField).where(FormField.form_id == form_id)
        result = await self.db.execute(query)
        fields = {f.id: f for f in result.scalars().all()}

        for i, field_id in enumerate(field_ids):
            if field_id in fields:
                fields[field_id].position = i

        await self.db.flush()

        # Return ordered fields
        return sorted(fields.values(), key=lambda f: f.position)

    # =========================================================================
    # TICKET CONFIGURATION
    # =========================================================================

    async def configure_ticket(
        self,
        form_id: str,
        config: TicketConfigCreate,
    ) -> Form | None:
        """Configure ticket creation for a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        form.auto_create_ticket = config.auto_create_ticket
        form.default_team_id = config.default_team_id
        form.ticket_assignment_mode = config.ticket_assignment_mode
        form.ticket_assignee_id = config.ticket_assignee_id
        form.default_priority = config.default_priority
        form.default_severity = config.default_severity
        form.ticket_field_mappings = config.ticket_field_mappings or {}
        form.ticket_config = config.ticket_config or {}

        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def disable_ticket(self, form_id: str) -> Form | None:
        """Disable ticket creation for a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        form.auto_create_ticket = False
        await self.db.flush()
        await self.db.refresh(form)
        return form

    # =========================================================================
    # CRM MAPPING CONFIGURATION
    # =========================================================================

    async def configure_crm_mapping(
        self,
        form_id: str,
        config: CRMMappingCreate,
    ) -> Form | None:
        """Configure CRM record creation for a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        # Validate CRM object exists
        query = select(CRMObject).where(CRMObject.id == config.crm_object_id)
        result = await self.db.execute(query)
        crm_object = result.scalar_one_or_none()
        if not crm_object:
            raise ValueError(f"CRM object not found: {config.crm_object_id}")

        form.auto_create_record = config.auto_create_record
        form.crm_object_id = config.crm_object_id
        form.crm_field_mappings = config.crm_field_mappings
        form.record_owner_id = config.record_owner_id

        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def remove_crm_mapping(self, form_id: str) -> Form | None:
        """Remove CRM mapping from a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        form.auto_create_record = False
        form.crm_object_id = None
        form.crm_field_mappings = {}
        form.record_owner_id = None

        await self.db.flush()
        await self.db.refresh(form)
        return form

    # =========================================================================
    # DEAL CONFIGURATION
    # =========================================================================

    async def configure_deal(
        self,
        form_id: str,
        config: DealConfigCreate,
    ) -> Form | None:
        """Configure deal creation for a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        form.auto_create_deal = config.auto_create_deal
        form.deal_pipeline_id = config.deal_pipeline_id
        form.deal_stage_id = config.deal_stage_id
        form.deal_field_mappings = config.deal_field_mappings or {}
        form.link_deal_to_record = config.link_deal_to_record

        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def disable_deal(self, form_id: str) -> Form | None:
        """Disable deal creation for a form."""
        form = await self.get_form(form_id, include_fields=False)
        if not form:
            return None

        form.auto_create_deal = False
        await self.db.flush()
        await self.db.refresh(form)
        return form

    # =========================================================================
    # AUTOMATION LINKING
    # =========================================================================

    async def link_automation(
        self,
        form_id: str,
        config: AutomationLinkCreate,
    ) -> FormAutomationLink:
        """Link an automation to a form."""
        # Check if link already exists
        query = select(FormAutomationLink).where(
            and_(
                FormAutomationLink.form_id == form_id,
                FormAutomationLink.automation_id == config.automation_id,
            )
        )
        result = await self.db.execute(query)
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing link
            existing.is_active = True
            existing.conditions = config.conditions or []
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        # Create new link
        link = FormAutomationLink(
            id=str(uuid4()),
            form_id=form_id,
            automation_id=config.automation_id,
            conditions=config.conditions or [],
        )
        self.db.add(link)
        await self.db.flush()
        await self.db.refresh(link)
        return link

    async def unlink_automation(self, form_id: str, automation_id: str) -> bool:
        """Unlink an automation from a form."""
        query = select(FormAutomationLink).where(
            and_(
                FormAutomationLink.form_id == form_id,
                FormAutomationLink.automation_id == automation_id,
            )
        )
        result = await self.db.execute(query)
        link = result.scalar_one_or_none()

        if not link:
            return False

        await self.db.delete(link)
        await self.db.flush()
        return True

    async def list_form_automations(self, form_id: str) -> list[FormAutomationLink]:
        """List all automations linked to a form."""
        query = (
            select(FormAutomationLink)
            .where(FormAutomationLink.form_id == form_id)
            .where(FormAutomationLink.is_active == True)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # =========================================================================
    # TEMPLATES
    # =========================================================================

    def get_templates(self) -> dict:
        """Get all available form templates."""
        return FORM_TEMPLATES

    def get_template(self, template_type: str) -> dict | None:
        """Get a specific form template."""
        return FORM_TEMPLATES.get(template_type)

    # =========================================================================
    # HELPERS
    # =========================================================================

    async def _get_form_by_slug(self, workspace_id: str, slug: str) -> Form | None:
        """Get a form by workspace and slug."""
        query = select(Form).where(
            and_(Form.workspace_id == workspace_id, Form.slug == slug)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def increment_submission_count(self, form_id: str) -> None:
        """Increment the submission count for a form."""
        form = await self.get_form(form_id, include_fields=False)
        if form:
            form.submission_count += 1
            await self.db.flush()
