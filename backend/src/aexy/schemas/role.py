"""Pydantic schemas for Role management."""

from datetime import datetime
from pydantic import BaseModel, Field


class PermissionInfo(BaseModel):
    """Information about a single permission."""

    id: str
    category: str
    description: str
    default_for: list[str] = []


class PermissionCategoryInfo(BaseModel):
    """Permissions grouped by category."""

    category: str
    permissions: list[PermissionInfo]


class PermissionCatalogResponse(BaseModel):
    """Response containing the full permission catalog."""

    permissions: dict[str, dict]
    categories: list[str]


class RoleTemplateResponse(BaseModel):
    """Information about a role template."""

    id: str
    name: str
    description: str
    color: str
    icon: str
    is_system: bool = True
    priority: int
    permissions: list[str]


class RoleCreate(BaseModel):
    """Schema for creating a custom role."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: str = Field(default="#64748b", max_length=50)
    icon: str = Field(default="User", max_length=50)
    based_on_template: str | None = Field(
        default=None,
        description="Template ID to base this role on (admin, manager, developer, etc.)"
    )
    permissions: list[str] = Field(
        default_factory=list,
        description="List of permission IDs"
    )
    priority: int = Field(default=50, ge=0, le=100)


class RoleUpdate(BaseModel):
    """Schema for updating a custom role."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    color: str | None = Field(default=None, max_length=50)
    icon: str | None = Field(default=None, max_length=50)
    permissions: list[str] | None = None
    priority: int | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None


class RoleResponse(BaseModel):
    """Response schema for a role."""

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    color: str
    icon: str
    based_on_template: str | None
    is_system: bool
    permissions: list[str]
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RoleListResponse(BaseModel):
    """Response schema for role list item."""

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    color: str
    icon: str
    is_system: bool
    permission_count: int
    priority: int
    is_active: bool

    class Config:
        from_attributes = True


class RoleSummary(BaseModel):
    """Brief role information for embedding in other responses."""

    id: str
    name: str
    slug: str
    color: str
    icon: str
    is_system: bool

    class Config:
        from_attributes = True
