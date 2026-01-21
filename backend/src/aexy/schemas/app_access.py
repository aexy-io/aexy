"""Pydantic schemas for App Access management."""

from datetime import datetime
from pydantic import BaseModel, Field


# App Catalog Schemas
class ModuleInfo(BaseModel):
    """Information about an app module."""

    id: str
    name: str
    description: str
    route: str


class AppInfo(BaseModel):
    """Information about an app in the catalog."""

    id: str
    name: str
    description: str
    icon: str
    category: str
    base_route: str
    required_permission: str | None
    modules: list[ModuleInfo]


class AppCatalogResponse(BaseModel):
    """Response containing the full app catalog."""

    apps: list[AppInfo]


# Template Schemas
class AppAccessTemplateCreate(BaseModel):
    """Schema for creating a custom app access template."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    icon: str = Field(default="Package", max_length=50)
    color: str = Field(default="#6366f1", max_length=50)
    app_config: dict = Field(
        ...,
        description="App configuration: {app_id: {enabled: bool, modules: {module_id: bool}}}"
    )


class AppAccessTemplateUpdate(BaseModel):
    """Schema for updating a custom app access template."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=50)
    app_config: dict | None = None
    is_active: bool | None = None


class AppAccessTemplateResponse(BaseModel):
    """Response schema for an app access template."""

    id: str
    workspace_id: str | None
    name: str
    slug: str
    description: str | None
    icon: str
    color: str
    app_config: dict
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AppAccessTemplateListResponse(BaseModel):
    """Response schema for template list item."""

    id: str
    workspace_id: str | None
    name: str
    slug: str
    description: str | None
    icon: str
    color: str
    app_config: dict
    is_system: bool
    is_active: bool

    class Config:
        from_attributes = True


# Member Access Schemas
class ModuleAccessInfo(BaseModel):
    """Access information for a module."""

    module_id: str
    enabled: bool


class AppAccessInfo(BaseModel):
    """Access information for an app."""

    app_id: str
    enabled: bool
    modules: dict[str, bool]


class EffectiveAccessResponse(BaseModel):
    """Response containing effective app access for a member."""

    apps: dict[str, AppAccessInfo]
    applied_template_id: str | None
    applied_template_name: str | None
    has_custom_overrides: bool
    is_admin: bool


class MemberAppAccessUpdate(BaseModel):
    """Schema for updating a member's app access."""

    app_config: dict = Field(
        ...,
        description="App configuration: {app_id: {enabled: bool, modules: {module_id: bool}}}"
    )
    applied_template_id: str | None = Field(
        default=None,
        description="Template ID if applying a template"
    )


class ApplyTemplateRequest(BaseModel):
    """Request to apply a template to a member."""

    template_id: str = Field(..., description="Template ID to apply")


class BulkApplyTemplateRequest(BaseModel):
    """Request to apply a template to multiple members."""

    developer_ids: list[str] = Field(
        ...,
        min_length=1,
        description="List of developer IDs to apply template to"
    )
    template_id: str = Field(..., description="Template ID to apply")


class BulkApplyTemplateResponse(BaseModel):
    """Response for bulk template application."""

    success_count: int
    failed_count: int
    applied_developer_ids: list[str]


# Access Matrix Schemas
class AppAccessSummary(BaseModel):
    """Summary of a member's access to an app (for matrix view)."""

    status: str = Field(
        ...,
        description="Access status: 'full', 'partial', or 'none'"
    )


class MemberAccessMatrixEntry(BaseModel):
    """Entry in the access matrix for a single member."""

    developer_id: str
    developer_name: str | None
    developer_email: str | None
    role_name: str | None
    applied_template_id: str | None
    applied_template_name: str | None
    has_custom_overrides: bool
    is_admin: bool
    apps: dict[str, str]  # app_id -> "full" | "partial" | "none"


class AccessMatrixResponse(BaseModel):
    """Response containing the full access matrix."""

    members: list[MemberAccessMatrixEntry]
    apps: list[AppInfo]


# Access Check Schemas
class AccessCheckRequest(BaseModel):
    """Request to check access to an app/module."""

    app_id: str = Field(..., description="App ID to check")
    module_id: str | None = Field(
        default=None,
        description="Optional module ID to check"
    )


class AccessCheckResponse(BaseModel):
    """Response for access check."""

    allowed: bool
    app_id: str
    module_id: str | None
    reason: str | None = None


# Wrapper schemas for API responses
class AppAccessTemplatesListWrapper(BaseModel):
    """Wrapper for templates list response."""

    templates: list[AppAccessTemplateListResponse]


class SystemBundleInfo(BaseModel):
    """Information about a system app bundle."""

    id: str
    name: str
    description: str
    icon: str
    color: str
    app_config: dict


class SystemBundlesResponse(BaseModel):
    """Response containing system bundles."""

    bundles: list[SystemBundleInfo]
