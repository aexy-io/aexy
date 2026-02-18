"""Visual email template builder API routes."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict, Field

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.visual_builder_service import VisualBuilderService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/visual-builder", tags=["visual-builder"])


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


# =============================================================================
# SCHEMAS
# =============================================================================

class BlockCreate(BaseModel):
    """Schema for creating a block."""
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=50)
    description: str | None = None
    block_type: str = Field(..., max_length=30)
    category: str = Field(default="content", max_length=30)
    block_schema: dict | None = Field(default=None, alias="schema")
    default_props: dict | None = None
    html_template: str = Field(..., min_length=1)
    icon: str | None = None


class BlockUpdate(BaseModel):
    """Schema for updating a block."""
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, max_length=100)
    description: str | None = None
    block_schema: dict | None = Field(default=None, alias="schema")
    default_props: dict | None = None
    html_template: str | None = None
    icon: str | None = None
    is_active: bool | None = None


class BlockResponse(BaseModel):
    """Schema for block response."""
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    workspace_id: str | None
    name: str
    slug: str
    description: str | None
    block_type: str
    category: str
    block_schema: dict = Field(alias="schema")
    default_props: dict
    html_template: str
    icon: str | None
    is_active: bool
    is_system: bool


class DesignCreate(BaseModel):
    """Schema for creating a design."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    design_json: dict = Field(...)
    template_id: str | None = None


class DesignUpdate(BaseModel):
    """Schema for updating a design."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    design_json: dict | None = None


class DesignResponse(BaseModel):
    """Schema for design response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    template_id: str | None
    name: str
    description: str | None
    design_json: dict
    rendered_html: str | None
    thumbnail_url: str | None
    is_draft: bool
    version: int
    created_by_id: str | None
    last_edited_by_id: str | None


class RenderRequest(BaseModel):
    """Schema for render request."""
    design_json: dict = Field(...)
    context: dict | None = None


class RenderResponse(BaseModel):
    """Schema for render response."""
    html: str


class ConvertToTemplateRequest(BaseModel):
    """Schema for converting design to template."""
    template_name: str | None = None


# =============================================================================
# BLOCK ROUTES
# =============================================================================

@router.post("/blocks", response_model=BlockResponse, status_code=status.HTTP_201_CREATED)
async def create_block(
    workspace_id: str,
    data: BlockCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new visual block."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = VisualBuilderService(db)
    block = await service.create_block(
        workspace_id=workspace_id,
        name=data.name,
        slug=data.slug,
        description=data.description,
        block_type=data.block_type,
        category=data.category,
        schema=data.block_schema,
        default_props=data.default_props,
        html_template=data.html_template,
        icon=data.icon,
    )

    return block


@router.get("/blocks", response_model=list[BlockResponse])
async def list_blocks(
    workspace_id: str,
    category: str | None = None,
    block_type: str | None = None,
    include_system: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List available visual blocks."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    blocks = await service.list_blocks(
        workspace_id=workspace_id,
        category=category,
        block_type=block_type,
        include_system=include_system,
    )

    return blocks


@router.get("/blocks/{block_id}", response_model=BlockResponse)
async def get_block(
    workspace_id: str,
    block_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a visual block by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    block = await service.get_block(block_id, workspace_id)

    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found",
        )

    return block


@router.patch("/blocks/{block_id}", response_model=BlockResponse)
async def update_block(
    workspace_id: str,
    block_id: str,
    data: BlockUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a visual block."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = VisualBuilderService(db)
    block = await service.update_block(
        block_id=block_id,
        workspace_id=workspace_id,
        **data.model_dump(exclude_unset=True, by_alias=True),
    )

    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found or cannot be edited",
        )

    return block


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_block(
    workspace_id: str,
    block_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a visual block."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = VisualBuilderService(db)
    deleted = await service.delete_block(block_id, workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found or cannot be deleted",
        )


# =============================================================================
# DESIGN ROUTES
# =============================================================================

@router.post("/designs", response_model=DesignResponse, status_code=status.HTTP_201_CREATED)
async def create_design(
    workspace_id: str,
    data: DesignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new email design."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    design = await service.create_design(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        design_json=data.design_json,
        template_id=data.template_id,
        created_by_id=current_user.id,
    )

    return design


@router.get("/designs", response_model=list[DesignResponse])
async def list_designs(
    workspace_id: str,
    is_draft: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List saved email designs."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    offset = (page - 1) * page_size
    designs = await service.list_designs(
        workspace_id=workspace_id,
        is_draft=is_draft,
        limit=page_size,
        offset=offset,
    )

    return designs


@router.get("/designs/{design_id}", response_model=DesignResponse)
async def get_design(
    workspace_id: str,
    design_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an email design by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    design = await service.get_design(design_id, workspace_id)

    if not design:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Design not found",
        )

    return design


@router.patch("/designs/{design_id}", response_model=DesignResponse)
async def update_design(
    workspace_id: str,
    design_id: str,
    data: DesignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update an email design."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    design = await service.update_design(
        design_id=design_id,
        workspace_id=workspace_id,
        name=data.name,
        design_json=data.design_json,
        edited_by_id=current_user.id,
        description=data.description,
    )

    if not design:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Design not found",
        )

    return design


@router.delete("/designs/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_design(
    workspace_id: str,
    design_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete an email design."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    deleted = await service.delete_design(design_id, workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Design not found",
        )


# =============================================================================
# RENDER ROUTES
# =============================================================================

@router.post("/render", response_model=RenderResponse)
async def render_design(
    workspace_id: str,
    data: RenderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Render a design JSON to HTML."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    html = await service.render_design(
        design_json=data.design_json,
        context=data.context,
        workspace_id=workspace_id,
    )

    return RenderResponse(html=html)


@router.post("/designs/{design_id}/render", response_model=RenderResponse)
async def render_saved_design(
    workspace_id: str,
    design_id: str,
    context: dict | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Render a saved design to HTML."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)
    design = await service.get_design(design_id, workspace_id)

    if not design:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Design not found",
        )

    html = await service.render_design(
        design_json=design.design_json,
        context=context,
        workspace_id=workspace_id,
    )

    # Update rendered HTML cache
    design.rendered_html = html
    await db.commit()

    return RenderResponse(html=html)


# =============================================================================
# CONVERSION ROUTES
# =============================================================================

@router.post("/designs/{design_id}/convert-to-template")
async def convert_design_to_template(
    workspace_id: str,
    design_id: str,
    data: ConvertToTemplateRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Convert a design to an email template."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)

    try:
        template = await service.design_to_template(
            design_id=design_id,
            workspace_id=workspace_id,
            template_name=data.template_name if data else None,
            created_by_id=current_user.id,
        )

        return {
            "status": "success",
            "template_id": template.id,
            "template_name": template.name,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post("/templates/{template_id}/edit")
async def create_design_from_template(
    workspace_id: str,
    template_id: str,
    design_name: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a design from a template for editing."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = VisualBuilderService(db)

    try:
        design = await service.template_to_design(
            template_id=template_id,
            workspace_id=workspace_id,
            design_name=design_name,
            created_by_id=current_user.id,
        )

        return DesignResponse.model_validate(design)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# =============================================================================
# BLOCK TYPES
# =============================================================================

@router.get("/block-types")
async def list_block_types(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get available block types with their schemas."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.models.email_marketing import BlockType

    return {
        "categories": {
            "layout": ["container", "section", "column", "divider", "spacer"],
            "content": ["header", "text", "image", "button", "link"],
            "rich": ["hero", "feature", "card", "testimonial", "pricing", "footer", "social"],
            "dynamic": ["variable", "conditional", "loop"],
        },
        "types": [{"value": t.value, "label": t.name.replace("_", " ").title()} for t in BlockType],
    }
