"""Ticket form service for managing ticket forms and form fields."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.ticketing import (
    TicketForm,
    TicketFormField,
    Ticket,
    TicketResponse as TicketResponseModel,
    TicketStatus,
    TicketFieldType,
    TicketFormTemplateType,
)
from devograph.schemas.ticketing import (
    TicketFormCreate,
    TicketFormUpdate,
    TicketFormFieldCreate,
    TicketFormFieldUpdate,
)


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '_', text)
    return text.strip('_')


# Pre-built form templates
FORM_TEMPLATES = {
    "bug_report": {
        "name": "Bug Report",
        "description": "Report a bug or issue",
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
                "external_mappings": {"github": "body", "jira": "description", "linear": "description"},
            },
            {
                "name": "Expected Behavior",
                "field_key": "expected_behavior",
                "field_type": "textarea",
                "placeholder": "What should have happened?",
                "is_required": False,
            },
            {
                "name": "Actual Behavior",
                "field_key": "actual_behavior",
                "field_type": "textarea",
                "placeholder": "What actually happened?",
                "is_required": False,
            },
            {
                "name": "Severity",
                "field_key": "severity",
                "field_type": "select",
                "is_required": True,
                "options": [
                    {"value": "low", "label": "Low - Minor inconvenience"},
                    {"value": "medium", "label": "Medium - Affects workflow"},
                    {"value": "high", "label": "High - Major functionality broken"},
                    {"value": "critical", "label": "Critical - System down"},
                ],
                "external_mappings": {"jira": "priority"},
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
                "help_text": "We'll use this to follow up with you",
            },
            {
                "name": "Screenshots",
                "field_key": "screenshots",
                "field_type": "file",
                "is_required": False,
                "validation_rules": {"allowed_file_types": ["image/png", "image/jpeg", "image/gif"], "max_file_size_mb": 10},
                "help_text": "Attach any relevant screenshots",
            },
        ],
    },
    "feature_request": {
        "name": "Feature Request",
        "description": "Suggest a new feature or improvement",
        "fields": [
            {
                "name": "Feature Title",
                "field_key": "title",
                "field_type": "text",
                "placeholder": "Brief title for your feature request",
                "is_required": True,
                "validation_rules": {"min_length": 5, "max_length": 200},
                "external_mappings": {"github": "title", "jira": "summary", "linear": "title"},
            },
            {
                "name": "Description",
                "field_key": "description",
                "field_type": "textarea",
                "placeholder": "Describe the feature you'd like to see",
                "is_required": True,
                "validation_rules": {"min_length": 20},
                "external_mappings": {"github": "body", "jira": "description", "linear": "description"},
            },
            {
                "name": "Problem it solves",
                "field_key": "problem",
                "field_type": "textarea",
                "placeholder": "What problem does this feature solve?",
                "is_required": False,
            },
            {
                "name": "Proposed Solution",
                "field_key": "solution",
                "field_type": "textarea",
                "placeholder": "How would you like this to work?",
                "is_required": False,
            },
            {
                "name": "Priority",
                "field_key": "priority",
                "field_type": "select",
                "is_required": True,
                "options": [
                    {"value": "nice_to_have", "label": "Nice to have"},
                    {"value": "would_help", "label": "Would help my workflow"},
                    {"value": "important", "label": "Important - Blocking my work"},
                    {"value": "critical", "label": "Critical - Need it urgently"},
                ],
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
                "help_text": "We'll notify you when this is implemented",
            },
        ],
    },
    "support": {
        "name": "Support Request",
        "description": "Get help with an issue",
        "fields": [
            {
                "name": "Subject",
                "field_key": "title",
                "field_type": "text",
                "placeholder": "What do you need help with?",
                "is_required": True,
                "validation_rules": {"min_length": 5, "max_length": 200},
                "external_mappings": {"github": "title", "jira": "summary", "linear": "title"},
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
                    {"value": "integration", "label": "Integrations"},
                    {"value": "other", "label": "Other"},
                ],
                "external_mappings": {"github": "labels", "jira": "labels"},
            },
            {
                "name": "Description",
                "field_key": "description",
                "field_type": "textarea",
                "placeholder": "Please describe your issue or question in detail",
                "is_required": True,
                "validation_rules": {"min_length": 20},
                "external_mappings": {"github": "body", "jira": "description", "linear": "description"},
            },
            {
                "name": "Email",
                "field_key": "email",
                "field_type": "email",
                "placeholder": "your@email.com",
                "is_required": True,
                "help_text": "We'll respond to this email",
            },
            {
                "name": "Attachments",
                "field_key": "attachments",
                "field_type": "file",
                "is_required": False,
                "validation_rules": {"max_file_size_mb": 10},
                "help_text": "Attach any relevant files or screenshots",
            },
        ],
    },
}


class TicketFormService:
    """Service for managing ticket forms and fields."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Form CRUD ====================

    async def create_form(
        self,
        workspace_id: str,
        created_by_id: str,
        form_data: TicketFormCreate,
    ) -> TicketForm:
        """Create a new ticket form.

        Args:
            workspace_id: Workspace ID.
            created_by_id: Developer ID creating the form.
            form_data: Form creation data.

        Returns:
            Created TicketForm.
        """
        # Generate slug from name
        slug = slugify(form_data.name)

        # Ensure slug is unique within workspace
        existing = await self._get_form_by_slug(workspace_id, slug)
        if existing:
            slug = f"{slug}_{str(uuid4())[:8]}"

        form = TicketForm(
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
            auto_create_task=form_data.auto_create_task,
            default_team_id=form_data.default_team_id,
            conditional_rules=[r.model_dump() for r in form_data.conditional_rules] if form_data.conditional_rules else [],
            created_by_id=created_by_id,
        )
        self.db.add(form)
        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def create_form_from_template(
        self,
        workspace_id: str,
        created_by_id: str,
        template_type: str,
        name: str | None = None,
    ) -> TicketForm:
        """Create a form from a pre-built template.

        Args:
            workspace_id: Workspace ID.
            created_by_id: Developer ID creating the form.
            template_type: Template type (bug_report, feature_request, support).
            name: Optional custom name for the form.

        Returns:
            Created TicketForm with fields.
        """
        if template_type not in FORM_TEMPLATES:
            raise ValueError(f"Unknown template type: {template_type}")

        template = FORM_TEMPLATES[template_type]

        # Create form
        form_data = TicketFormCreate(
            name=name or template["name"],
            description=template["description"],
            template_type=template_type,
        )
        form = await self.create_form(workspace_id, created_by_id, form_data)

        # Create fields from template
        for position, field_data in enumerate(template["fields"]):
            field = TicketFormField(
                id=str(uuid4()),
                form_id=form.id,
                name=field_data["name"],
                field_key=field_data["field_key"],
                field_type=field_data["field_type"],
                placeholder=field_data.get("placeholder"),
                default_value=field_data.get("default_value"),
                help_text=field_data.get("help_text"),
                is_required=field_data.get("is_required", False),
                validation_rules=field_data.get("validation_rules", {}),
                options=field_data.get("options"),
                position=position,
                external_mappings=field_data.get("external_mappings", {}),
            )
            self.db.add(field)

        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def get_form(self, form_id: str) -> TicketForm | None:
        """Get a form by ID with fields."""
        stmt = (
            select(TicketForm)
            .where(TicketForm.id == form_id)
            .options(selectinload(TicketForm.fields))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_form_by_token(self, public_token: str) -> TicketForm | None:
        """Get a form by its public URL token."""
        stmt = (
            select(TicketForm)
            .where(
                and_(
                    TicketForm.public_url_token == public_token,
                    TicketForm.is_active == True,
                )
            )
            .options(selectinload(TicketForm.fields))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_form_by_slug(self, workspace_id: str, slug: str) -> TicketForm | None:
        """Get a form by slug within a workspace."""
        stmt = select(TicketForm).where(
            and_(
                TicketForm.workspace_id == workspace_id,
                TicketForm.slug == slug,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_forms(
        self,
        workspace_id: str,
        is_active: bool | None = None,
    ) -> list[TicketForm]:
        """List all forms for a workspace.

        Args:
            workspace_id: Workspace ID.
            is_active: Optional filter by active status.

        Returns:
            List of TicketForms.
        """
        stmt = (
            select(TicketForm)
            .where(TicketForm.workspace_id == workspace_id)
            .order_by(TicketForm.created_at.desc())
        )

        if is_active is not None:
            stmt = stmt.where(TicketForm.is_active == is_active)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_form(
        self,
        form_id: str,
        form_data: TicketFormUpdate,
    ) -> TicketForm | None:
        """Update a form."""
        form = await self.get_form(form_id)
        if not form:
            return None

        update_data = form_data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if field == "theme" and value:
                value = value if isinstance(value, dict) else value.model_dump()
            elif field == "destinations" and value:
                value = [d if isinstance(d, dict) else d.model_dump() for d in value]
            elif field == "conditional_rules" and value:
                value = [r if isinstance(r, dict) else r.model_dump() for r in value]
            setattr(form, field, value)

        await self.db.flush()
        await self.db.refresh(form)
        return form

    async def delete_form(self, form_id: str) -> bool:
        """Delete a form and all associated fields/tickets."""
        form = await self.get_form(form_id)
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
    ) -> TicketForm | None:
        """Duplicate a form with all its fields.

        Args:
            form_id: Source form ID.
            new_name: Name for the duplicated form.
            created_by_id: Developer ID creating the duplicate.

        Returns:
            Duplicated TicketForm.
        """
        source = await self.get_form(form_id)
        if not source:
            return None

        # Create new form
        slug = slugify(new_name)
        existing = await self._get_form_by_slug(source.workspace_id, slug)
        if existing:
            slug = f"{slug}_{str(uuid4())[:8]}"

        new_form = TicketForm(
            id=str(uuid4()),
            workspace_id=source.workspace_id,
            name=new_name,
            slug=slug,
            description=source.description,
            template_type=source.template_type,
            auth_mode=source.auth_mode,
            require_email=source.require_email,
            theme=source.theme,
            success_message=source.success_message,
            redirect_url=source.redirect_url,
            destinations=source.destinations,
            auto_create_task=source.auto_create_task,
            default_team_id=source.default_team_id,
            conditional_rules=source.conditional_rules,
            created_by_id=created_by_id,
        )
        self.db.add(new_form)

        # Duplicate fields
        for field in source.fields:
            new_field = TicketFormField(
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
                external_mappings=field.external_mappings,
            )
            self.db.add(new_field)

        await self.db.flush()
        await self.db.refresh(new_form)
        return new_form

    # ==================== Field CRUD ====================

    async def add_field(
        self,
        form_id: str,
        field_data: TicketFormFieldCreate,
    ) -> TicketFormField:
        """Add a field to a form.

        Args:
            form_id: Form ID.
            field_data: Field creation data.

        Returns:
            Created TicketFormField.
        """
        # Get current max position
        stmt = (
            select(func.max(TicketFormField.position))
            .where(TicketFormField.form_id == form_id)
        )
        result = await self.db.execute(stmt)
        max_position = result.scalar() or -1

        position = field_data.position if field_data.position is not None else max_position + 1

        field = TicketFormField(
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
            position=position,
            is_visible=field_data.is_visible,
            external_mappings=field_data.external_mappings.model_dump() if field_data.external_mappings else {},
        )
        self.db.add(field)
        await self.db.flush()
        await self.db.refresh(field)
        return field

    async def get_field(self, field_id: str) -> TicketFormField | None:
        """Get a field by ID."""
        stmt = select(TicketFormField).where(TicketFormField.id == field_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_fields(self, form_id: str) -> list[TicketFormField]:
        """List all fields for a form."""
        stmt = (
            select(TicketFormField)
            .where(TicketFormField.form_id == form_id)
            .order_by(TicketFormField.position)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_field(
        self,
        field_id: str,
        field_data: TicketFormFieldUpdate,
    ) -> TicketFormField | None:
        """Update a field."""
        field = await self.get_field(field_id)
        if not field:
            return None

        update_data = field_data.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            if key == "validation_rules" and value:
                value = value if isinstance(value, dict) else value.model_dump()
            elif key == "options" and value:
                value = [o if isinstance(o, dict) else o.model_dump() for o in value]
            elif key == "external_mappings" and value:
                value = value if isinstance(value, dict) else value.model_dump()
            setattr(field, key, value)

        await self.db.flush()
        await self.db.refresh(field)
        return field

    async def delete_field(self, field_id: str) -> bool:
        """Delete a field."""
        field = await self.get_field(field_id)
        if not field:
            return False

        await self.db.delete(field)
        await self.db.flush()
        return True

    async def reorder_fields(self, form_id: str, field_ids: list[str]) -> list[TicketFormField]:
        """Reorder fields in a form.

        Args:
            form_id: Form ID.
            field_ids: List of field IDs in desired order.

        Returns:
            List of reordered fields.
        """
        fields = await self.list_fields(form_id)
        field_map = {f.id: f for f in fields}

        for position, field_id in enumerate(field_ids):
            if field_id in field_map:
                field_map[field_id].position = position

        await self.db.flush()
        return await self.list_fields(form_id)

    # ==================== Template Methods ====================

    def get_available_templates(self) -> dict:
        """Get available form templates."""
        return {
            key: {
                "name": template["name"],
                "description": template["description"],
                "field_count": len(template["fields"]),
            }
            for key, template in FORM_TEMPLATES.items()
        }

    # ==================== Stats ====================

    async def increment_submission_count(self, form_id: str) -> None:
        """Increment the submission count for a form."""
        form = await self.get_form(form_id)
        if form:
            form.submission_count += 1
            await self.db.flush()
