"""Service for visual email template builder."""

import logging
import re
from uuid import uuid4
from datetime import datetime, timezone

from jinja2 import Environment, BaseLoader, TemplateSyntaxError
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.email_marketing import (
    VisualTemplateBlock,
    SavedEmailDesign,
    EmailTemplate,
    BlockType,
)

logger = logging.getLogger(__name__)


class VisualBuilderService:
    """Service for managing visual email builder."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._jinja_env = Environment(loader=BaseLoader())

    # =========================================================================
    # BLOCK MANAGEMENT
    # =========================================================================

    async def create_block(
        self,
        workspace_id: str | None,
        name: str,
        block_type: str,
        html_template: str,
        slug: str | None = None,
        description: str | None = None,
        category: str = "content",
        schema: dict | None = None,
        default_props: dict | None = None,
        icon: str | None = None,
        is_system: bool = False,
    ) -> VisualTemplateBlock:
        """Create a new visual block."""
        if not slug:
            slug = self._generate_slug(name)

        # Ensure unique slug within workspace
        existing = await self.db.execute(
            select(VisualTemplateBlock)
            .where(VisualTemplateBlock.workspace_id == workspace_id)
            .where(VisualTemplateBlock.slug == slug)
        )
        if existing.scalar_one_or_none():
            slug = f"{slug}-{str(uuid4())[:8]}"

        block = VisualTemplateBlock(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            block_type=block_type,
            category=category,
            schema=schema or self._get_default_schema(block_type),
            default_props=default_props or {},
            html_template=html_template,
            icon=icon,
            is_system=is_system,
        )
        self.db.add(block)
        await self.db.commit()
        await self.db.refresh(block)

        return block

    async def get_block(
        self,
        block_id: str,
        workspace_id: str | None = None,
    ) -> VisualTemplateBlock | None:
        """Get a block by ID."""
        query = select(VisualTemplateBlock).where(VisualTemplateBlock.id == block_id)
        if workspace_id:
            query = query.where(
                or_(
                    VisualTemplateBlock.workspace_id == workspace_id,
                    VisualTemplateBlock.workspace_id.is_(None),
                )
            )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_blocks(
        self,
        workspace_id: str,
        category: str | None = None,
        block_type: str | None = None,
        include_system: bool = True,
    ) -> list[VisualTemplateBlock]:
        """List available blocks for a workspace."""
        query = (
            select(VisualTemplateBlock)
            .where(VisualTemplateBlock.is_active == True)
            .where(
                or_(
                    VisualTemplateBlock.workspace_id == workspace_id,
                    VisualTemplateBlock.workspace_id.is_(None),  # System blocks
                )
            )
            .order_by(
                VisualTemplateBlock.category.asc(),
                VisualTemplateBlock.display_order.asc(),
            )
        )

        if category:
            query = query.where(VisualTemplateBlock.category == category)

        if block_type:
            query = query.where(VisualTemplateBlock.block_type == block_type)

        if not include_system:
            query = query.where(VisualTemplateBlock.is_system == False)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_block(
        self,
        block_id: str,
        workspace_id: str,
        **updates,
    ) -> VisualTemplateBlock | None:
        """Update a block."""
        block = await self.get_block(block_id, workspace_id)
        if not block or block.is_system:
            return None

        for key, value in updates.items():
            if hasattr(block, key) and value is not None:
                setattr(block, key, value)

        await self.db.commit()
        await self.db.refresh(block)
        return block

    async def delete_block(
        self,
        block_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a block."""
        block = await self.get_block(block_id, workspace_id)
        if not block or block.is_system:
            return False

        await self.db.delete(block)
        await self.db.commit()
        return True

    # =========================================================================
    # DESIGN MANAGEMENT
    # =========================================================================

    async def create_design(
        self,
        workspace_id: str,
        name: str,
        design_json: dict,
        template_id: str | None = None,
        description: str | None = None,
        created_by_id: str | None = None,
    ) -> SavedEmailDesign:
        """Create a new saved design."""
        design = SavedEmailDesign(
            id=str(uuid4()),
            workspace_id=workspace_id,
            template_id=template_id,
            name=name,
            description=description,
            design_json=design_json,
            created_by_id=created_by_id,
            last_edited_by_id=created_by_id,
        )
        self.db.add(design)
        await self.db.commit()
        await self.db.refresh(design)

        return design

    async def get_design(
        self,
        design_id: str,
        workspace_id: str,
    ) -> SavedEmailDesign | None:
        """Get a design by ID."""
        result = await self.db.execute(
            select(SavedEmailDesign)
            .where(SavedEmailDesign.id == design_id)
            .where(SavedEmailDesign.workspace_id == workspace_id)
        )
        return result.scalar_one_or_none()

    async def list_designs(
        self,
        workspace_id: str,
        is_draft: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SavedEmailDesign]:
        """List saved designs for a workspace."""
        query = (
            select(SavedEmailDesign)
            .where(SavedEmailDesign.workspace_id == workspace_id)
            .order_by(SavedEmailDesign.updated_at.desc())
            .offset(offset)
            .limit(limit)
        )

        if is_draft is not None:
            query = query.where(SavedEmailDesign.is_draft == is_draft)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_design(
        self,
        design_id: str,
        workspace_id: str,
        design_json: dict | None = None,
        name: str | None = None,
        edited_by_id: str | None = None,
        **updates,
    ) -> SavedEmailDesign | None:
        """Update a design."""
        design = await self.get_design(design_id, workspace_id)
        if not design:
            return None

        if design_json is not None:
            design.design_json = design_json
            design.version += 1

        if name is not None:
            design.name = name

        if edited_by_id:
            design.last_edited_by_id = edited_by_id

        for key, value in updates.items():
            if hasattr(design, key) and value is not None:
                setattr(design, key, value)

        await self.db.commit()
        await self.db.refresh(design)
        return design

    async def delete_design(
        self,
        design_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a design."""
        design = await self.get_design(design_id, workspace_id)
        if not design:
            return False

        await self.db.delete(design)
        await self.db.commit()
        return True

    # =========================================================================
    # RENDERING
    # =========================================================================

    async def render_design(
        self,
        design_json: dict,
        context: dict | None = None,
        workspace_id: str | None = None,
    ) -> str:
        """
        Render a visual design JSON to HTML.

        Args:
            design_json: The design structure
            context: Template variables for rendering
            workspace_id: Workspace ID for loading blocks

        Returns:
            Rendered HTML string
        """
        context = context or {}

        # Get global styles
        global_styles = design_json.get("styles", {})

        # Render body content
        body_content = await self._render_blocks(
            blocks=design_json.get("blocks", []),
            context=context,
            workspace_id=workspace_id,
        )

        # Wrap in email structure
        html = self._wrap_email_html(
            body_content=body_content,
            styles=global_styles,
            preheader=design_json.get("preheader", ""),
        )

        return html

    async def _render_blocks(
        self,
        blocks: list[dict],
        context: dict,
        workspace_id: str | None = None,
    ) -> str:
        """Render a list of blocks to HTML."""
        rendered_parts = []

        for block_data in blocks:
            block_type = block_data.get("type")
            props = block_data.get("props", {})
            children = block_data.get("children", [])

            # Get block template
            html_template = await self._get_block_template(
                block_type, workspace_id
            )

            if not html_template:
                # Use default rendering
                html_template = self._get_default_block_html(block_type)

            # Render children if any
            children_html = ""
            if children:
                children_html = await self._render_blocks(
                    children, context, workspace_id
                )

            # Merge props with context
            render_context = {
                **context,
                **props,
                "children": children_html,
            }

            # Render block
            try:
                template = self._jinja_env.from_string(html_template)
                rendered = template.render(**render_context)
                rendered_parts.append(rendered)
            except TemplateSyntaxError as e:
                logger.error(f"Template error in block {block_type}: {e}")
                rendered_parts.append(f"<!-- Error rendering {block_type} -->")

        return "\n".join(rendered_parts)

    async def _get_block_template(
        self,
        block_type: str,
        workspace_id: str | None,
    ) -> str | None:
        """Get HTML template for a block type."""
        query = (
            select(VisualTemplateBlock)
            .where(VisualTemplateBlock.block_type == block_type)
            .where(VisualTemplateBlock.is_active == True)
        )

        if workspace_id:
            query = query.where(
                or_(
                    VisualTemplateBlock.workspace_id == workspace_id,
                    VisualTemplateBlock.workspace_id.is_(None),
                )
            )
        else:
            query = query.where(VisualTemplateBlock.workspace_id.is_(None))

        result = await self.db.execute(query.limit(1))
        block = result.scalar_one_or_none()

        if block:
            return block.html_template
        return None

    def _get_default_block_html(self, block_type: str) -> str:
        """Get default HTML for built-in block types."""
        defaults = {
            "container": '<div style="{{style|default(\'\')}}">{{children}}</div>',
            "section": '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding: {{padding|default(\'20px\')}};">{{children}}</td></tr></table>',
            "column": '<td style="width: {{width|default(\'100%\')}}; vertical-align: top;">{{children}}</td>',
            "divider": '<hr style="border: none; border-top: {{thickness|default(\'1px\')}} solid {{color|default(\'#e0e0e0\')}}; margin: {{margin|default(\'20px 0\')}};">',
            "spacer": '<div style="height: {{height|default(\'20px\')}};"></div>',
            "header": '<h{{level|default(1)}} style="color: {{color|default(\'#333\')}}; font-size: {{fontSize|default(\'24px\')}}; margin: {{margin|default(\'0 0 10px 0\')}};">{{text}}</h{{level|default(1)}}>',
            "text": '<p style="color: {{color|default(\'#666\')}}; font-size: {{fontSize|default(\'16px\')}}; line-height: {{lineHeight|default(\'1.6\')}}; margin: {{margin|default(\'0 0 10px 0\')}};">{{text}}</p>',
            "image": '<img src="{{src}}" alt="{{alt|default(\'\')}}}" width="{{width|default(\'100%\')}}" style="max-width: 100%; height: auto; display: block;">',
            "button": '<a href="{{href|default(\'#\')}}" style="display: inline-block; padding: {{padding|default(\'12px 24px\')}}; background-color: {{backgroundColor|default(\'#007bff\')}}; color: {{color|default(\'#ffffff\')}}; text-decoration: none; border-radius: {{borderRadius|default(\'4px\')}}; font-weight: {{fontWeight|default(\'600\')}};">{{text}}</a>',
            "link": '<a href="{{href}}" style="color: {{color|default(\'#007bff\')}}};">{{text}}</a>',
            "hero": '''
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: {{backgroundColor|default('#f8f9fa')}};">
                    <tr><td style="padding: {{padding|default('60px 20px')}}; text-align: center;">
                        {% if image %}<img src="{{image}}" alt="" style="max-width: 100%; margin-bottom: 20px;">{% endif %}
                        <h1 style="color: {{titleColor|default('#333')}}; margin: 0 0 15px 0;">{{title}}</h1>
                        {% if subtitle %}<p style="color: {{subtitleColor|default('#666')}}; font-size: 18px; margin: 0 0 25px 0;">{{subtitle}}</p>{% endif %}
                        {% if buttonText %}<a href="{{buttonHref|default('#')}}" style="display: inline-block; padding: 14px 32px; background-color: {{buttonColor|default('#007bff')}}; color: #fff; text-decoration: none; border-radius: 4px;">{{buttonText}}</a>{% endif %}
                    </td></tr>
                </table>
            ''',
            "footer": '''
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: {{backgroundColor|default('#f8f9fa')}};">
                    <tr><td style="padding: {{padding|default('30px 20px')}}; text-align: center;">
                        <p style="color: {{textColor|default('#999')}}; font-size: 12px; margin: 0;">{{text}}</p>
                        {% if unsubscribeUrl %}<p style="margin: 10px 0 0 0;"><a href="{{unsubscribeUrl}}" style="color: {{linkColor|default('#999')}}; font-size: 12px;">Unsubscribe</a></p>{% endif %}
                    </td></tr>
                </table>
            ''',
            "social": '''
                <div style="text-align: {{align|default('center')}};">
                    {% for link in links %}
                    <a href="{{link.url}}" style="display: inline-block; margin: 0 8px;">
                        <img src="{{link.icon}}" alt="{{link.name}}" width="24" height="24">
                    </a>
                    {% endfor %}
                </div>
            ''',
            "variable": '{{{{value}}}}',
            "conditional": '{% if {{condition}} %}{{children}}{% endif %}',
            "loop": '{% for item in {{items}} %}{{children}}{% endfor %}',
        }
        return defaults.get(block_type, '<div>{{children}}</div>')

    def _wrap_email_html(
        self,
        body_content: str,
        styles: dict,
        preheader: str = "",
    ) -> str:
        """Wrap body content in full email HTML structure."""
        bg_color = styles.get("backgroundColor", "#f5f5f5")
        font_family = styles.get("fontFamily", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
        max_width = styles.get("maxWidth", "600px")

        return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title></title>
    <style type="text/css">
        body {{ margin: 0; padding: 0; width: 100%; background-color: {bg_color}; }}
        table {{ border-collapse: collapse; }}
        img {{ border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
        a {{ color: inherit; }}
        @media only screen and (max-width: 620px) {{
            .wrapper {{ width: 100% !important; padding: 10px !important; }}
            .content {{ padding: 20px !important; }}
        }}
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: {bg_color}; font-family: {font_family};">
    {f'<div style="display: none; max-height: 0; overflow: hidden;">{preheader}</div>' if preheader else ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: {bg_color};">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table class="wrapper" width="{max_width}" cellpadding="0" cellspacing="0" style="max-width: {max_width}; width: 100%; background-color: #ffffff;">
                    <tr>
                        <td class="content">
                            {body_content}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>'''

    # =========================================================================
    # TEMPLATE CONVERSION
    # =========================================================================

    async def design_to_template(
        self,
        design_id: str,
        workspace_id: str,
        template_name: str | None = None,
        created_by_id: str | None = None,
    ) -> EmailTemplate:
        """Convert a saved design to an email template."""
        design = await self.get_design(design_id, workspace_id)
        if not design:
            raise ValueError(f"Design {design_id} not found")

        # Render HTML
        html = await self.render_design(design.design_json, workspace_id=workspace_id)

        # Create template
        template = EmailTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=template_name or design.name,
            slug=self._generate_slug(template_name or design.name),
            description=design.description,
            template_type="visual",
            category="general",
            subject_template="",
            body_html=html,
            visual_definition=design.design_json,
            created_by_id=created_by_id,
        )
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)

        # Update design to link to template
        design.template_id = template.id
        design.is_draft = False
        await self.db.commit()

        return template

    async def template_to_design(
        self,
        template_id: str,
        workspace_id: str,
        design_name: str | None = None,
        created_by_id: str | None = None,
    ) -> SavedEmailDesign:
        """Create a design from an existing template for editing."""
        result = await self.db.execute(
            select(EmailTemplate)
            .where(EmailTemplate.id == template_id)
            .where(EmailTemplate.workspace_id == workspace_id)
        )
        template = result.scalar_one_or_none()

        if not template:
            raise ValueError(f"Template {template_id} not found")

        design_json = template.visual_definition
        if not design_json:
            # Convert HTML to basic design structure
            design_json = {
                "styles": {},
                "blocks": [
                    {
                        "type": "text",
                        "props": {"text": template.body_html},
                    }
                ],
            }

        return await self.create_design(
            workspace_id=workspace_id,
            name=design_name or f"Edit: {template.name}",
            design_json=design_json,
            template_id=template_id,
            created_by_id=created_by_id,
        )

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _generate_slug(self, name: str) -> str:
        """Generate slug from name."""
        slug = name.lower()
        slug = re.sub(r"[^a-z0-9]+", "-", slug)
        slug = slug.strip("-")
        return slug

    def _get_default_schema(self, block_type: str) -> dict:
        """Get default JSON schema for a block type."""
        schemas = {
            "text": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "title": "Text Content"},
                    "color": {"type": "string", "format": "color", "title": "Text Color"},
                    "fontSize": {"type": "string", "title": "Font Size"},
                    "lineHeight": {"type": "string", "title": "Line Height"},
                },
                "required": ["text"],
            },
            "header": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "title": "Heading Text"},
                    "level": {"type": "integer", "minimum": 1, "maximum": 6, "title": "Heading Level"},
                    "color": {"type": "string", "format": "color", "title": "Text Color"},
                    "fontSize": {"type": "string", "title": "Font Size"},
                },
                "required": ["text"],
            },
            "image": {
                "type": "object",
                "properties": {
                    "src": {"type": "string", "format": "uri", "title": "Image URL"},
                    "alt": {"type": "string", "title": "Alt Text"},
                    "width": {"type": "string", "title": "Width"},
                    "link": {"type": "string", "format": "uri", "title": "Link URL"},
                },
                "required": ["src"],
            },
            "button": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "title": "Button Text"},
                    "href": {"type": "string", "format": "uri", "title": "Link URL"},
                    "backgroundColor": {"type": "string", "format": "color", "title": "Background Color"},
                    "color": {"type": "string", "format": "color", "title": "Text Color"},
                    "borderRadius": {"type": "string", "title": "Border Radius"},
                },
                "required": ["text", "href"],
            },
            "hero": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "title": "Title"},
                    "subtitle": {"type": "string", "title": "Subtitle"},
                    "image": {"type": "string", "format": "uri", "title": "Hero Image"},
                    "buttonText": {"type": "string", "title": "Button Text"},
                    "buttonHref": {"type": "string", "format": "uri", "title": "Button Link"},
                    "backgroundColor": {"type": "string", "format": "color", "title": "Background Color"},
                },
                "required": ["title"],
            },
        }
        return schemas.get(block_type, {"type": "object", "properties": {}})


# =========================================================================
# DEFAULT SYSTEM BLOCKS
# =========================================================================

DEFAULT_BLOCKS = [
    {
        "name": "Text Block",
        "slug": "text",
        "block_type": "text",
        "category": "content",
        "icon": "type",
        "description": "A paragraph of text",
        "default_props": {"text": "Enter your text here...", "color": "#333333", "fontSize": "16px"},
    },
    {
        "name": "Heading",
        "slug": "header",
        "block_type": "header",
        "category": "content",
        "icon": "heading",
        "description": "A heading (H1-H6)",
        "default_props": {"text": "Heading", "level": 1, "color": "#333333"},
    },
    {
        "name": "Image",
        "slug": "image",
        "block_type": "image",
        "category": "content",
        "icon": "image",
        "description": "An image with optional link",
        "default_props": {"src": "", "alt": "", "width": "100%"},
    },
    {
        "name": "Button",
        "slug": "button",
        "block_type": "button",
        "category": "content",
        "icon": "mouse-pointer",
        "description": "A call-to-action button",
        "default_props": {"text": "Click Here", "href": "#", "backgroundColor": "#007bff", "color": "#ffffff"},
    },
    {
        "name": "Divider",
        "slug": "divider",
        "block_type": "divider",
        "category": "layout",
        "icon": "minus",
        "description": "A horizontal line divider",
        "default_props": {"thickness": "1px", "color": "#e0e0e0"},
    },
    {
        "name": "Spacer",
        "slug": "spacer",
        "block_type": "spacer",
        "category": "layout",
        "icon": "move-vertical",
        "description": "Vertical spacing",
        "default_props": {"height": "20px"},
    },
    {
        "name": "Hero Section",
        "slug": "hero",
        "block_type": "hero",
        "category": "rich",
        "icon": "layout",
        "description": "A hero banner with title and CTA",
        "default_props": {"title": "Welcome", "subtitle": "", "buttonText": "Learn More", "buttonHref": "#"},
    },
    {
        "name": "Footer",
        "slug": "footer",
        "block_type": "footer",
        "category": "rich",
        "icon": "dock",
        "description": "Email footer with unsubscribe link",
        "default_props": {"text": "© 2024 Company. All rights reserved.", "unsubscribeUrl": "{{unsubscribe_url}}"},
    },
    {
        "name": "Social Links",
        "slug": "social",
        "block_type": "social",
        "category": "rich",
        "icon": "share-2",
        "description": "Social media icons",
        "default_props": {"links": [], "align": "center"},
    },
    {
        "name": "Container",
        "slug": "container",
        "block_type": "container",
        "category": "layout",
        "icon": "box",
        "description": "A container for other blocks",
        "default_props": {"style": ""},
    },
    {
        "name": "Section",
        "slug": "section",
        "block_type": "section",
        "category": "layout",
        "icon": "square",
        "description": "A section with padding",
        "default_props": {"padding": "20px"},
    },
    {
        "name": "Column",
        "slug": "column",
        "block_type": "column",
        "category": "layout",
        "icon": "columns",
        "description": "A column within a row",
        "default_props": {"width": "100%"},
    },
    {
        "name": "Link",
        "slug": "link",
        "block_type": "link",
        "category": "content",
        "icon": "link",
        "description": "A text hyperlink",
        "default_props": {"text": "Click here", "href": "#", "color": "#007bff"},
    },
    {
        "name": "Variable",
        "slug": "variable",
        "block_type": "variable",
        "category": "dynamic",
        "icon": "code",
        "description": "Dynamic variable placeholder",
        "default_props": {"value": "recipient_name"},
    },
    {
        "name": "Conditional",
        "slug": "conditional",
        "block_type": "conditional",
        "category": "dynamic",
        "icon": "git-branch",
        "description": "Show content conditionally",
        "default_props": {"condition": "show_section"},
    },
    {
        "name": "Loop",
        "slug": "loop",
        "block_type": "loop",
        "category": "dynamic",
        "icon": "repeat",
        "description": "Repeat content for each item",
        "default_props": {"items": "items"},
    },
]
