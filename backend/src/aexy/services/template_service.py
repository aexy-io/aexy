"""Template service for email template management and rendering."""

import logging
import re
from datetime import datetime
from typing import Any
from uuid import uuid4

from jinja2 import Environment, BaseLoader, TemplateSyntaxError, UndefinedError
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.email_marketing import EmailTemplate, EmailTemplateType
from aexy.schemas.email_marketing import (
    EmailTemplateCreate,
    EmailTemplateUpdate,
    TemplatePreviewResponse,
)

logger = logging.getLogger(__name__)


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:100]


class TemplateService:
    """Service for email template management and rendering."""

    def __init__(self, db: AsyncSession):
        """Initialize the template service."""
        self.db = db
        self._jinja_env = Environment(
            loader=BaseLoader(),
            autoescape=True,
        )
        # Add common filters
        self._jinja_env.filters["title"] = str.title
        self._jinja_env.filters["upper"] = str.upper
        self._jinja_env.filters["lower"] = str.lower

    # =========================================================================
    # TEMPLATE CRUD
    # =========================================================================

    async def create_template(
        self,
        workspace_id: str,
        data: EmailTemplateCreate,
        created_by_id: str | None = None,
    ) -> EmailTemplate:
        """Create a new email template."""
        # Generate slug if not provided
        slug = data.slug or slugify(data.name)

        # Ensure unique slug within workspace
        slug = await self._ensure_unique_slug(workspace_id, slug)

        template = EmailTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            slug=slug,
            description=data.description,
            template_type=data.template_type,
            category=data.category,
            subject_template=data.subject_template,
            body_html=data.body_html,
            body_text=data.body_text,
            preview_text=data.preview_text,
            variables=[v.model_dump() for v in data.variables],
            visual_definition=data.visual_definition,
            created_by_id=created_by_id,
        )

        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)

        logger.info(f"Created email template: {template.id} ({template.name})")
        return template

    async def get_template(
        self,
        template_id: str,
        workspace_id: str | None = None,
    ) -> EmailTemplate | None:
        """Get an email template by ID."""
        query = select(EmailTemplate).where(EmailTemplate.id == template_id)
        if workspace_id:
            query = query.where(EmailTemplate.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_template_by_slug(
        self,
        workspace_id: str,
        slug: str,
    ) -> EmailTemplate | None:
        """Get an email template by slug."""
        result = await self.db.execute(
            select(EmailTemplate).where(
                and_(
                    EmailTemplate.workspace_id == workspace_id,
                    EmailTemplate.slug == slug,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_templates(
        self,
        workspace_id: str,
        category: str | None = None,
        template_type: str | None = None,
        is_active: bool | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[EmailTemplate], int]:
        """List email templates with optional filters."""
        query = select(EmailTemplate).where(EmailTemplate.workspace_id == workspace_id)

        if category:
            query = query.where(EmailTemplate.category == category)
        if template_type:
            query = query.where(EmailTemplate.template_type == template_type)
        if is_active is not None:
            query = query.where(EmailTemplate.is_active == is_active)

        # Count total
        from sqlalchemy import func
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(EmailTemplate.updated_at.desc())
        query = query.offset(offset).limit(limit)

        result = await self.db.execute(query)
        templates = list(result.scalars().all())

        return templates, total

    async def update_template(
        self,
        template_id: str,
        workspace_id: str,
        data: EmailTemplateUpdate,
    ) -> EmailTemplate | None:
        """Update an email template."""
        template = await self.get_template(template_id, workspace_id)
        if not template:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Handle variables conversion
        if "variables" in update_data and update_data["variables"] is not None:
            update_data["variables"] = [v.model_dump() if hasattr(v, "model_dump") else v for v in update_data["variables"]]

        # Increment version if content changed
        content_fields = {"subject_template", "body_html", "body_text", "visual_definition"}
        if any(field in update_data for field in content_fields):
            template.version += 1

        for field, value in update_data.items():
            setattr(template, field, value)

        await self.db.commit()
        await self.db.refresh(template)

        logger.info(f"Updated email template: {template.id}")
        return template

    async def delete_template(
        self,
        template_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete an email template."""
        template = await self.get_template(template_id, workspace_id)
        if not template:
            return False

        await self.db.delete(template)
        await self.db.commit()

        logger.info(f"Deleted email template: {template_id}")
        return True

    async def duplicate_template(
        self,
        template_id: str,
        workspace_id: str,
        new_name: str | None = None,
        created_by_id: str | None = None,
    ) -> EmailTemplate | None:
        """Duplicate an email template."""
        original = await self.get_template(template_id, workspace_id)
        if not original:
            return None

        name = new_name or f"{original.name} (Copy)"
        slug = await self._ensure_unique_slug(workspace_id, slugify(name))

        duplicate = EmailTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=original.description,
            template_type=original.template_type,
            category=original.category,
            subject_template=original.subject_template,
            body_html=original.body_html,
            body_text=original.body_text,
            preview_text=original.preview_text,
            variables=original.variables,
            visual_definition=original.visual_definition,
            created_by_id=created_by_id,
        )

        self.db.add(duplicate)
        await self.db.commit()
        await self.db.refresh(duplicate)

        logger.info(f"Duplicated email template {template_id} to {duplicate.id}")
        return duplicate

    # =========================================================================
    # TEMPLATE RENDERING
    # =========================================================================

    def render_template(
        self,
        template: EmailTemplate,
        context: dict[str, Any],
    ) -> tuple[str, str, str | None]:
        """
        Render subject, HTML body, and text body with Jinja2.

        Returns:
            Tuple of (subject, html_body, text_body)
        """
        # Merge default variable values with provided context
        full_context = {}
        for var in template.variables:
            if isinstance(var, dict):
                name = var.get("name")
                default = var.get("default")
                if name and name not in context:
                    full_context[name] = default
        full_context.update(context)

        # Render subject
        subject = self._render_string(template.subject_template, full_context)

        # Render HTML body
        html_body = self._render_string(template.body_html, full_context)

        # Render text body if present
        text_body = None
        if template.body_text:
            text_body = self._render_string(template.body_text, full_context)

        return subject, html_body, text_body

    def _render_string(
        self,
        template_string: str,
        context: dict[str, Any],
    ) -> str:
        """Render a single template string with Jinja2."""
        try:
            template = self._jinja_env.from_string(template_string)
            return template.render(**context)
        except (TemplateSyntaxError, UndefinedError) as e:
            logger.warning(f"Template rendering error: {e}")
            # Return original string with simple placeholder substitution
            result = template_string
            for key, value in context.items():
                result = result.replace(f"{{{{ {key} }}}}", str(value))
                result = result.replace(f"{{{{{key}}}}}", str(value))
            return result

    def preview_template(
        self,
        template: EmailTemplate,
        context: dict[str, Any] | None = None,
    ) -> TemplatePreviewResponse:
        """Preview a template with sample or provided context."""
        # Use sample values if no context provided
        if context is None:
            context = {}

        # Generate sample values for missing variables
        sample_context = self._generate_sample_context(template.variables)
        sample_context.update(context)

        subject, html_body, text_body = self.render_template(template, sample_context)

        return TemplatePreviewResponse(
            subject=subject,
            body_html=html_body,
            body_text=text_body,
        )

    def _generate_sample_context(self, variables: list[dict]) -> dict[str, Any]:
        """Generate sample values for template variables."""
        context = {}
        for var in variables:
            if not isinstance(var, dict):
                continue

            name = var.get("name")
            var_type = var.get("type", "string")
            default = var.get("default")

            if name:
                if default is not None:
                    context[name] = default
                elif var_type == "string":
                    context[name] = f"[{name}]"
                elif var_type == "number":
                    context[name] = 123
                elif var_type == "boolean":
                    context[name] = True
                elif var_type == "date":
                    context[name] = datetime.now().strftime("%Y-%m-%d")
                elif var_type == "url":
                    context[name] = "https://example.com"
                else:
                    context[name] = f"[{name}]"

        return context

    # =========================================================================
    # VARIABLE EXTRACTION
    # =========================================================================

    def extract_variables(self, body: str) -> list[dict]:
        """
        Extract {{variable}} placeholders from template.

        Returns list of variable definitions.
        """
        # Match Jinja2 style variables: {{ variable }} or {{ variable|filter }}
        pattern = r"\{\{\s*(\w+)(?:\s*\|\s*\w+)*\s*\}\}"
        matches = re.findall(pattern, body)

        # Get unique variable names
        unique_vars = list(dict.fromkeys(matches))

        return [
            {"name": var, "type": "string", "required": False}
            for var in unique_vars
        ]

    # =========================================================================
    # VALIDATION
    # =========================================================================

    def validate_template(
        self,
        template: EmailTemplate,
        context: dict[str, Any] | None = None,
    ) -> list[str]:
        """
        Validate template renders without errors.

        Returns list of validation errors (empty if valid).
        """
        errors = []

        if context is None:
            context = self._generate_sample_context(template.variables)

        # Try rendering subject
        try:
            subject_tmpl = self._jinja_env.from_string(template.subject_template)
            subject_tmpl.render(**context)
        except TemplateSyntaxError as e:
            errors.append(f"Subject template syntax error: {e}")
        except UndefinedError as e:
            errors.append(f"Subject template missing variable: {e}")

        # Try rendering HTML body
        try:
            html_tmpl = self._jinja_env.from_string(template.body_html)
            html_tmpl.render(**context)
        except TemplateSyntaxError as e:
            errors.append(f"HTML body syntax error: {e}")
        except UndefinedError as e:
            errors.append(f"HTML body missing variable: {e}")

        # Try rendering text body
        if template.body_text:
            try:
                text_tmpl = self._jinja_env.from_string(template.body_text)
                text_tmpl.render(**context)
            except TemplateSyntaxError as e:
                errors.append(f"Text body syntax error: {e}")
            except UndefinedError as e:
                errors.append(f"Text body missing variable: {e}")

        # Check required variables
        for var in template.variables:
            if isinstance(var, dict) and var.get("required"):
                name = var.get("name")
                if name and name not in context:
                    errors.append(f"Required variable '{name}' is missing")

        return errors

    # =========================================================================
    # HELPERS
    # =========================================================================

    async def _ensure_unique_slug(
        self,
        workspace_id: str,
        base_slug: str,
    ) -> str:
        """Ensure slug is unique within workspace, appending number if needed."""
        slug = base_slug
        counter = 1

        while True:
            existing = await self.get_template_by_slug(workspace_id, slug)
            if not existing:
                return slug
            slug = f"{base_slug}-{counter}"
            counter += 1
            if counter > 100:
                # Safety limit
                slug = f"{base_slug}-{uuid4().hex[:8]}"
                return slug
