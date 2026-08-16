"""Pydantic schemas for App Access management."""

from datetime import datetime
from pydantic import BaseModel, Field


# App Catalog Schemas
class ModuleInfo(BaseModel):
    """Information about an app module."""

    id: str
    name: str
    description: str
    # Absent for modules that gate API capabilities rather than pages — the MCP
    # ones have nothing to navigate to. Giving them the app's own route made
    # `/mcp` resolve to one of them, so denying it hid the page from the sidebar.
    route: str | None = None


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
    # "self_serve" (the default) or "contact_support" — whether a workspace can
    # switch this app on for itself, and where to write if it cannot.
    availability: str = "self_serve"
    support_contact: str | None = None


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
    # Whether the API will let this member in, as opposed to whether the app
    # belongs in their navigation. These differ for admins, who can always reach
    # a workspace-enabled app but whose sidebar follows their profile.
    can_access: bool = True
    # Which layer decided `enabled`: workspace_disabled | department |
    # role_fallback | member_template | member_override.
    source: str = "role_fallback"
    source_detail: str | None = None


class AccessDepartmentInfo(BaseModel):
    """A department contributing to a member's access baseline."""

    id: str
    name: str
    is_primary: bool
    has_profile: bool
    access_profile_slug: str | None = None


class EffectiveAccessResponse(BaseModel):
    """Response containing effective app access for a member."""

    apps: dict[str, AppAccessInfo]
    applied_template_id: str | None
    applied_template_name: str | None
    has_custom_overrides: bool
    is_admin: bool
    # Where the baseline came from, so the UI can say "from the Sales
    # department" rather than presenting resolved access as if it were a fact
    # with no author.
    baseline: str = "role_fallback"
    departments: list[AccessDepartmentInfo] = Field(default_factory=list)
    # Sidebar view implied by the primary department; a personal choice wins.
    suggested_persona: str | None = None


class MemberAppAccessUpdate(BaseModel):
    """Schema for updating a member's app access.

    ``app_config`` is a desired picture, not what gets stored: the service diffs
    it against the member's baseline and persists only the differences, so
    everything not mentioned keeps inheriting from their department.
    """

    app_config: dict = Field(
        ...,
        description="App configuration: {app_id: {enabled: bool, modules: {module_id: bool}}}"
    )
    applied_template_id: str | None = Field(
        default=None,
        description="Pin this member to a template as their baseline"
    )
    reasons: dict[str, str] | None = Field(
        default=None,
        description="Optional per-app note explaining an override, kept for audit",
    )


class AccessPreviewRequest(BaseModel):
    """What would somebody see, given this department / profile / role?

    Answers the invite screen's question before the invite is sent, so nobody
    has to send one and then go and look at what the person ended up with.
    """

    department_ids: list[str] = Field(
        default_factory=list,
        description="Departments the person would belong to (union of grants)",
    )
    access_template_id: str | None = Field(
        default=None,
        description="Pin a template instead of using the departments' profiles",
    )
    role: str = Field(
        default="member",
        description="Legacy workspace role, used only when no profile applies",
    )


class AccessPreviewApp(BaseModel):
    """One app in a preview, with the modules that come with it."""

    app_id: str
    name: str
    enabled: bool
    module_names: list[str] = Field(default_factory=list)


class AccessPreviewResponse(BaseModel):
    """Resolved preview: which apps, and where the answer came from."""

    baseline: str
    baseline_detail: str | None = None
    suggested_persona: str | None = None
    apps: list[AccessPreviewApp] = Field(default_factory=list)
    enabled_app_names: list[str] = Field(default_factory=list)


class MemberAppOverride(BaseModel):
    """A single per-app override. Omit an app entirely to inherit it."""

    enabled: bool | None = Field(
        default=None,
        description="True grants, False revokes, null inherits",
    )
    modules: dict[str, bool] | None = Field(
        default=None,
        description="Per-module grants/revokes; omitted modules inherit",
    )


class MemberAppOverridesUpdate(BaseModel):
    """Three-state override write: inherit / grant / revoke, per app."""

    overrides: dict[str, MemberAppOverride] = Field(
        default_factory=dict,
        description="app_id -> override. Apps absent from this map inherit.",
    )
    reasons: dict[str, str] | None = Field(
        default=None,
        description="Optional per-app note explaining an override, kept for audit",
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
    # Where this member's access comes from. `baseline` of "role_fallback" is
    # the signal an admin needs: it means this person's departments carry no
    # profile, so their navigation is being decided by their legacy role.
    baseline: str = "role_fallback"
    department_id: str | None = None
    department_name: str | None = None
    department_count: int = 0


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


# Access Request Schemas
class AppAccessRequestCreate(BaseModel):
    """Schema for creating an app access request."""

    app_id: str = Field(..., min_length=1, max_length=100)
    reason: str | None = Field(default=None, max_length=1000)


class AppAccessRequestReview(BaseModel):
    """Schema for reviewing (approving/rejecting) an access request."""

    notes: str | None = Field(default=None, max_length=1000)


class AppAccessRequestResponse(BaseModel):
    """Response schema for an app access request."""

    id: str
    workspace_id: str
    requester_id: str
    requester_name: str | None = None
    app_id: str
    app_name: str | None = None
    status: str
    reason: str | None = None
    reviewed_by_id: str | None = None
    reviewer_name: str | None = None
    reviewed_at: datetime | None = None
    review_notes: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AppAccessRequestListResponse(BaseModel):
    """Response containing a list of access requests."""

    requests: list[AppAccessRequestResponse]
