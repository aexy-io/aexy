"""CRM API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.crm import (
    # Object schemas
    CRMObjectCreate,
    CRMObjectUpdate,
    CRMObjectResponse,
    CRMObjectWithAttributesResponse,
    # Attribute schemas
    CRMAttributeCreate,
    CRMAttributeUpdate,
    CRMAttributeResponse,
    AttributeReorder,
    # Record schemas
    CRMRecordCreate,
    CRMRecordUpdate,
    CRMRecordResponse,
    CRMRecordListResponse,
    CRMRecordBulkCreate,
    CRMRecordBulkUpdate,
    CRMRecordBulkDelete,
    # Note schemas
    CRMNoteCreate,
    CRMNoteUpdate,
    CRMNoteResponse,
    # List schemas
    CRMListCreate,
    CRMListUpdate,
    CRMListResponse,
    CRMListEntryCreate,
    CRMListEntryUpdate,
    CRMListEntryResponse,
    # Activity schemas
    CRMActivityResponse,
    CRMActivityFilters,
    # Filter/sort
    FilterCondition,
    SortCondition,
)
from devograph.services.crm_service import (
    CRMObjectService,
    CRMAttributeService,
    CRMRecordService,
    CRMListService,
    CRMNoteService,
    CRMActivityService,
)
from devograph.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/crm",
    tags=["CRM"],
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


# =============================================================================
# OBJECT ENDPOINTS
# =============================================================================

@router.get("/objects", response_model=list[CRMObjectWithAttributesResponse])
async def list_objects(
    workspace_id: str,
    include_inactive: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all CRM objects in a workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMObjectService(db)
    objects = await service.list_objects(workspace_id, include_inactive)

    return [
        CRMObjectWithAttributesResponse(
            id=str(obj.id),
            workspace_id=str(obj.workspace_id),
            name=obj.name,
            slug=obj.slug,
            plural_name=obj.plural_name,
            description=obj.description,
            object_type=obj.object_type,
            icon=obj.icon,
            color=obj.color,
            primary_attribute_id=str(obj.primary_attribute_id) if obj.primary_attribute_id else None,
            settings=obj.settings,
            record_count=obj.record_count,
            is_system=obj.is_system,
            is_active=obj.is_active,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
            attributes=[
                CRMAttributeResponse(
                    id=str(attr.id),
                    object_id=str(attr.object_id),
                    name=attr.name,
                    slug=attr.slug,
                    description=attr.description,
                    attribute_type=attr.attribute_type,
                    config=attr.config,
                    is_required=attr.is_required,
                    is_unique=attr.is_unique,
                    default_value=attr.default_value,
                    position=attr.position,
                    is_visible=attr.is_visible,
                    is_filterable=attr.is_filterable,
                    is_sortable=attr.is_sortable,
                    column_width=attr.column_width,
                    is_system=attr.is_system,
                    created_at=attr.created_at,
                    updated_at=attr.updated_at,
                )
                for attr in obj.attributes
            ],
        )
        for obj in objects
    ]


@router.post("/objects", response_model=CRMObjectResponse, status_code=status.HTTP_201_CREATED)
async def create_object(
    workspace_id: str,
    data: CRMObjectCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new CRM object."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMObjectService(db)
    obj = await service.create_object(
        workspace_id=workspace_id,
        name=data.name,
        plural_name=data.plural_name,
        object_type=data.object_type,
        description=data.description,
        icon=data.icon,
        color=data.color,
        settings=data.settings,
    )

    await db.commit()

    return CRMObjectResponse(
        id=str(obj.id),
        workspace_id=str(obj.workspace_id),
        name=obj.name,
        slug=obj.slug,
        plural_name=obj.plural_name,
        description=obj.description,
        object_type=obj.object_type,
        icon=obj.icon,
        color=obj.color,
        primary_attribute_id=str(obj.primary_attribute_id) if obj.primary_attribute_id else None,
        settings=obj.settings,
        record_count=obj.record_count,
        is_system=obj.is_system,
        is_active=obj.is_active,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


@router.get("/objects/{object_id}", response_model=CRMObjectWithAttributesResponse)
async def get_object(
    workspace_id: str,
    object_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a CRM object by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMObjectService(db)
    obj = await service.get_object(object_id)

    if not obj or str(obj.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found",
        )

    return CRMObjectWithAttributesResponse(
        id=str(obj.id),
        workspace_id=str(obj.workspace_id),
        name=obj.name,
        slug=obj.slug,
        plural_name=obj.plural_name,
        description=obj.description,
        object_type=obj.object_type,
        icon=obj.icon,
        color=obj.color,
        primary_attribute_id=str(obj.primary_attribute_id) if obj.primary_attribute_id else None,
        settings=obj.settings,
        record_count=obj.record_count,
        is_system=obj.is_system,
        is_active=obj.is_active,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
        attributes=[
            CRMAttributeResponse(
                id=str(attr.id),
                object_id=str(attr.object_id),
                name=attr.name,
                slug=attr.slug,
                description=attr.description,
                attribute_type=attr.attribute_type,
                config=attr.config,
                is_required=attr.is_required,
                is_unique=attr.is_unique,
                default_value=attr.default_value,
                position=attr.position,
                is_visible=attr.is_visible,
                is_filterable=attr.is_filterable,
                is_sortable=attr.is_sortable,
                column_width=attr.column_width,
                is_system=attr.is_system,
                created_at=attr.created_at,
                updated_at=attr.updated_at,
            )
            for attr in obj.attributes
        ],
    )


@router.patch("/objects/{object_id}", response_model=CRMObjectResponse)
async def update_object(
    workspace_id: str,
    object_id: str,
    data: CRMObjectUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a CRM object."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMObjectService(db)
    obj = await service.get_object(object_id)

    if not obj or str(obj.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found",
        )

    obj = await service.update_object(
        object_id=object_id,
        name=data.name,
        plural_name=data.plural_name,
        description=data.description,
        icon=data.icon,
        color=data.color,
        primary_attribute_id=data.primary_attribute_id,
        settings=data.settings,
        is_active=data.is_active,
    )

    await db.commit()

    return CRMObjectResponse(
        id=str(obj.id),
        workspace_id=str(obj.workspace_id),
        name=obj.name,
        slug=obj.slug,
        plural_name=obj.plural_name,
        description=obj.description,
        object_type=obj.object_type,
        icon=obj.icon,
        color=obj.color,
        primary_attribute_id=str(obj.primary_attribute_id) if obj.primary_attribute_id else None,
        settings=obj.settings,
        record_count=obj.record_count,
        is_system=obj.is_system,
        is_active=obj.is_active,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


@router.delete("/objects/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_object(
    workspace_id: str,
    object_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a CRM object."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMObjectService(db)
    obj = await service.get_object(object_id)

    if not obj or str(obj.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found",
        )

    try:
        await service.delete_object(object_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/objects/seed-standard", response_model=list[CRMObjectResponse])
async def seed_standard_objects(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Seed standard CRM objects (Company, Person, Deal) for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMObjectService(db)
    objects = await service.seed_standard_objects(workspace_id)

    await db.commit()

    return [
        CRMObjectResponse(
            id=str(obj.id),
            workspace_id=str(obj.workspace_id),
            name=obj.name,
            slug=obj.slug,
            plural_name=obj.plural_name,
            description=obj.description,
            object_type=obj.object_type,
            icon=obj.icon,
            color=obj.color,
            primary_attribute_id=str(obj.primary_attribute_id) if obj.primary_attribute_id else None,
            settings=obj.settings,
            record_count=obj.record_count,
            is_system=obj.is_system,
            is_active=obj.is_active,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )
        for obj in objects
    ]


@router.post("/objects/seed-template")
async def seed_from_template(
    workspace_id: str,
    template_data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Seed CRM objects based on a template selection from onboarding."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    template = template_data.get("template", "blank")
    use_case = template_data.get("use_case")
    use_case_details = template_data.get("use_case_details", [])

    service = CRMObjectService(db)
    attr_service = CRMAttributeService(db)

    created_objects = []

    # Template definitions
    templates = {
        "sales": {
            "objects": [
                {
                    "name": "Company",
                    "plural_name": "Companies",
                    "object_type": "company",
                    "icon": "building",
                    "color": "#3b82f6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Website", "attribute_type": "url"},
                        {"name": "Industry", "attribute_type": "select", "config": {"options": ["Technology", "Finance", "Healthcare", "Retail", "Manufacturing", "Other"]}},
                        {"name": "Size", "attribute_type": "select", "config": {"options": ["1-10", "11-50", "51-200", "201-500", "500+"]}},
                        {"name": "Annual Revenue", "attribute_type": "currency"},
                        {"name": "Description", "attribute_type": "text"},
                    ],
                },
                {
                    "name": "Person",
                    "plural_name": "People",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#10b981",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Phone", "attribute_type": "phone"},
                        {"name": "Title", "attribute_type": "text"},
                        {"name": "LinkedIn", "attribute_type": "url"},
                    ],
                },
                {
                    "name": "Deal",
                    "plural_name": "Deals",
                    "object_type": "deal",
                    "icon": "dollar-sign",
                    "color": "#f59e0b",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Value", "attribute_type": "currency", "is_required": True},
                        {"name": "Stage", "attribute_type": "status", "config": {"options": [
                            {"value": "lead", "label": "Lead", "color": "#6b7280"},
                            {"value": "qualified", "label": "Qualified", "color": "#3b82f6"},
                            {"value": "proposal", "label": "Proposal", "color": "#8b5cf6"},
                            {"value": "negotiation", "label": "Negotiation", "color": "#f59e0b"},
                            {"value": "won", "label": "Won", "color": "#10b981"},
                            {"value": "lost", "label": "Lost", "color": "#ef4444"},
                        ]}},
                        {"name": "Expected Close", "attribute_type": "date"},
                        {"name": "Probability", "attribute_type": "number", "config": {"min": 0, "max": 100, "suffix": "%"}},
                        {"name": "Notes", "attribute_type": "text"},
                    ],
                },
            ],
        },
        "customer-success": {
            "objects": [
                {
                    "name": "Company",
                    "plural_name": "Companies",
                    "object_type": "company",
                    "icon": "building",
                    "color": "#3b82f6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Website", "attribute_type": "url"},
                        {"name": "Contract Start", "attribute_type": "date"},
                        {"name": "Contract End", "attribute_type": "date"},
                        {"name": "MRR", "attribute_type": "currency"},
                        {"name": "Health Score", "attribute_type": "number", "config": {"min": 0, "max": 100}},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "onboarding", "label": "Onboarding", "color": "#3b82f6"},
                            {"value": "healthy", "label": "Healthy", "color": "#10b981"},
                            {"value": "at_risk", "label": "At Risk", "color": "#f59e0b"},
                            {"value": "churned", "label": "Churned", "color": "#ef4444"},
                        ]}},
                    ],
                },
                {
                    "name": "Person",
                    "plural_name": "People",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#10b981",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Phone", "attribute_type": "phone"},
                        {"name": "Role", "attribute_type": "select", "config": {"options": ["Champion", "Decision Maker", "User", "Technical Contact"]}},
                        {"name": "Engagement Level", "attribute_type": "select", "config": {"options": ["High", "Medium", "Low"]}},
                    ],
                },
                {
                    "name": "Task",
                    "plural_name": "Tasks",
                    "object_type": "custom",
                    "icon": "check-square",
                    "color": "#8b5cf6",
                    "attributes": [
                        {"name": "Title", "attribute_type": "text", "is_required": True},
                        {"name": "Due Date", "attribute_type": "date"},
                        {"name": "Priority", "attribute_type": "select", "config": {"options": ["High", "Medium", "Low"]}},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "todo", "label": "To Do", "color": "#6b7280"},
                            {"value": "in_progress", "label": "In Progress", "color": "#3b82f6"},
                            {"value": "done", "label": "Done", "color": "#10b981"},
                        ]}},
                    ],
                },
            ],
        },
        "recruiting": {
            "objects": [
                {
                    "name": "Candidate",
                    "plural_name": "Candidates",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#8b5cf6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Phone", "attribute_type": "phone"},
                        {"name": "LinkedIn", "attribute_type": "url"},
                        {"name": "Resume", "attribute_type": "url"},
                        {"name": "Stage", "attribute_type": "status", "config": {"options": [
                            {"value": "applied", "label": "Applied", "color": "#6b7280"},
                            {"value": "screening", "label": "Screening", "color": "#3b82f6"},
                            {"value": "interview", "label": "Interview", "color": "#8b5cf6"},
                            {"value": "offer", "label": "Offer", "color": "#f59e0b"},
                            {"value": "hired", "label": "Hired", "color": "#10b981"},
                            {"value": "rejected", "label": "Rejected", "color": "#ef4444"},
                        ]}},
                        {"name": "Source", "attribute_type": "select", "config": {"options": ["LinkedIn", "Referral", "Job Board", "Direct", "Agency"]}},
                    ],
                },
                {
                    "name": "Position",
                    "plural_name": "Positions",
                    "object_type": "custom",
                    "icon": "briefcase",
                    "color": "#3b82f6",
                    "attributes": [
                        {"name": "Title", "attribute_type": "text", "is_required": True},
                        {"name": "Department", "attribute_type": "text"},
                        {"name": "Location", "attribute_type": "text"},
                        {"name": "Type", "attribute_type": "select", "config": {"options": ["Full-time", "Part-time", "Contract", "Intern"]}},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "draft", "label": "Draft", "color": "#6b7280"},
                            {"value": "open", "label": "Open", "color": "#10b981"},
                            {"value": "on_hold", "label": "On Hold", "color": "#f59e0b"},
                            {"value": "filled", "label": "Filled", "color": "#3b82f6"},
                            {"value": "closed", "label": "Closed", "color": "#ef4444"},
                        ]}},
                        {"name": "Salary Range", "attribute_type": "text"},
                    ],
                },
                {
                    "name": "Interview",
                    "plural_name": "Interviews",
                    "object_type": "custom",
                    "icon": "calendar",
                    "color": "#f59e0b",
                    "attributes": [
                        {"name": "Title", "attribute_type": "text", "is_required": True},
                        {"name": "Date", "attribute_type": "datetime", "is_required": True},
                        {"name": "Type", "attribute_type": "select", "config": {"options": ["Phone Screen", "Technical", "Behavioral", "Final", "Culture Fit"]}},
                        {"name": "Feedback", "attribute_type": "text"},
                        {"name": "Rating", "attribute_type": "number", "config": {"min": 1, "max": 5}},
                    ],
                },
            ],
        },
        "partnerships": {
            "objects": [
                {
                    "name": "Partner",
                    "plural_name": "Partners",
                    "object_type": "company",
                    "icon": "handshake",
                    "color": "#f59e0b",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Website", "attribute_type": "url"},
                        {"name": "Type", "attribute_type": "select", "config": {"options": ["Technology", "Reseller", "Referral", "Strategic", "Integration"]}},
                        {"name": "Tier", "attribute_type": "select", "config": {"options": ["Platinum", "Gold", "Silver", "Bronze"]}},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "prospect", "label": "Prospect", "color": "#6b7280"},
                            {"value": "negotiating", "label": "Negotiating", "color": "#3b82f6"},
                            {"value": "active", "label": "Active", "color": "#10b981"},
                            {"value": "inactive", "label": "Inactive", "color": "#f59e0b"},
                        ]}},
                        {"name": "Commission Rate", "attribute_type": "number", "config": {"suffix": "%"}},
                    ],
                },
                {
                    "name": "Contact",
                    "plural_name": "Contacts",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#10b981",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Phone", "attribute_type": "phone"},
                        {"name": "Role", "attribute_type": "text"},
                    ],
                },
                {
                    "name": "Deal",
                    "plural_name": "Deals",
                    "object_type": "deal",
                    "icon": "dollar-sign",
                    "color": "#8b5cf6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Value", "attribute_type": "currency"},
                        {"name": "Stage", "attribute_type": "status", "config": {"options": [
                            {"value": "identified", "label": "Identified", "color": "#6b7280"},
                            {"value": "qualified", "label": "Qualified", "color": "#3b82f6"},
                            {"value": "proposal", "label": "Proposal", "color": "#8b5cf6"},
                            {"value": "closed", "label": "Closed", "color": "#10b981"},
                        ]}},
                    ],
                },
            ],
        },
        "startup-fundraising": {
            "objects": [
                {
                    "name": "Investor",
                    "plural_name": "Investors",
                    "object_type": "company",
                    "icon": "building",
                    "color": "#8b5cf6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Website", "attribute_type": "url"},
                        {"name": "Type", "attribute_type": "select", "config": {"options": ["Angel", "Seed", "VC", "PE", "Family Office", "Corporate"]}},
                        {"name": "Focus Areas", "attribute_type": "multiselect", "config": {"options": ["SaaS", "Fintech", "Healthcare", "AI/ML", "Consumer", "Enterprise"]}},
                        {"name": "Check Size", "attribute_type": "text"},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "researching", "label": "Researching", "color": "#6b7280"},
                            {"value": "reached_out", "label": "Reached Out", "color": "#3b82f6"},
                            {"value": "meeting", "label": "Meeting", "color": "#8b5cf6"},
                            {"value": "due_diligence", "label": "Due Diligence", "color": "#f59e0b"},
                            {"value": "term_sheet", "label": "Term Sheet", "color": "#10b981"},
                            {"value": "passed", "label": "Passed", "color": "#ef4444"},
                        ]}},
                    ],
                },
                {
                    "name": "Contact",
                    "plural_name": "Contacts",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#10b981",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Title", "attribute_type": "text"},
                        {"name": "LinkedIn", "attribute_type": "url"},
                        {"name": "Warm Intro", "attribute_type": "checkbox"},
                    ],
                },
            ],
        },
        "vc-deal-flow": {
            "objects": [
                {
                    "name": "Company",
                    "plural_name": "Companies",
                    "object_type": "company",
                    "icon": "building",
                    "color": "#3b82f6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Website", "attribute_type": "url"},
                        {"name": "Sector", "attribute_type": "select", "config": {"options": ["SaaS", "Fintech", "Healthcare", "AI/ML", "Consumer", "Enterprise", "Climate", "Web3"]}},
                        {"name": "Stage", "attribute_type": "select", "config": {"options": ["Pre-seed", "Seed", "Series A", "Series B", "Series C+", "Growth"]}},
                        {"name": "Deal Status", "attribute_type": "status", "config": {"options": [
                            {"value": "sourced", "label": "Sourced", "color": "#6b7280"},
                            {"value": "screening", "label": "Screening", "color": "#3b82f6"},
                            {"value": "meeting", "label": "Meeting", "color": "#8b5cf6"},
                            {"value": "dd", "label": "Due Diligence", "color": "#f59e0b"},
                            {"value": "ic", "label": "IC Review", "color": "#ec4899"},
                            {"value": "invested", "label": "Invested", "color": "#10b981"},
                            {"value": "passed", "label": "Passed", "color": "#ef4444"},
                        ]}},
                        {"name": "Priority", "attribute_type": "select", "config": {"options": ["High", "Medium", "Low"]}},
                        {"name": "ARR", "attribute_type": "currency"},
                        {"name": "Founder", "attribute_type": "text"},
                    ],
                },
                {
                    "name": "Founder",
                    "plural_name": "Founders",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#8b5cf6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email"},
                        {"name": "LinkedIn", "attribute_type": "url"},
                        {"name": "Background", "attribute_type": "text"},
                    ],
                },
            ],
        },
        "content-co-creation": {
            "objects": [
                {
                    "name": "Creator",
                    "plural_name": "Creators",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#ec4899",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email"},
                        {"name": "Platform", "attribute_type": "select", "config": {"options": ["YouTube", "Podcast", "Blog", "Twitter/X", "LinkedIn", "Instagram", "TikTok"]}},
                        {"name": "Audience Size", "attribute_type": "text"},
                        {"name": "Niche", "attribute_type": "text"},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "identified", "label": "Identified", "color": "#6b7280"},
                            {"value": "reached_out", "label": "Reached Out", "color": "#3b82f6"},
                            {"value": "in_discussion", "label": "In Discussion", "color": "#8b5cf6"},
                            {"value": "scheduled", "label": "Scheduled", "color": "#f59e0b"},
                            {"value": "published", "label": "Published", "color": "#10b981"},
                        ]}},
                    ],
                },
                {
                    "name": "Content",
                    "plural_name": "Content",
                    "object_type": "custom",
                    "icon": "file-text",
                    "color": "#14b8a6",
                    "attributes": [
                        {"name": "Title", "attribute_type": "text", "is_required": True},
                        {"name": "Type", "attribute_type": "select", "config": {"options": ["Podcast Episode", "Interview", "Guest Post", "Video", "Webinar", "Newsletter"]}},
                        {"name": "Publish Date", "attribute_type": "date"},
                        {"name": "URL", "attribute_type": "url"},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "idea", "label": "Idea", "color": "#6b7280"},
                            {"value": "in_production", "label": "In Production", "color": "#3b82f6"},
                            {"value": "review", "label": "Review", "color": "#f59e0b"},
                            {"value": "published", "label": "Published", "color": "#10b981"},
                        ]}},
                    ],
                },
            ],
        },
        "employee-onboarding": {
            "objects": [
                {
                    "name": "Employee",
                    "plural_name": "Employees",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#f59e0b",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Start Date", "attribute_type": "date", "is_required": True},
                        {"name": "Department", "attribute_type": "select", "config": {"options": ["Engineering", "Product", "Design", "Sales", "Marketing", "Operations", "Finance", "HR"]}},
                        {"name": "Manager", "attribute_type": "text"},
                        {"name": "Onboarding Status", "attribute_type": "status", "config": {"options": [
                            {"value": "pre_start", "label": "Pre-Start", "color": "#6b7280"},
                            {"value": "week_1", "label": "Week 1", "color": "#3b82f6"},
                            {"value": "week_2", "label": "Week 2", "color": "#8b5cf6"},
                            {"value": "month_1", "label": "Month 1", "color": "#f59e0b"},
                            {"value": "completed", "label": "Completed", "color": "#10b981"},
                        ]}},
                    ],
                },
                {
                    "name": "Task",
                    "plural_name": "Onboarding Tasks",
                    "object_type": "custom",
                    "icon": "check-square",
                    "color": "#10b981",
                    "attributes": [
                        {"name": "Title", "attribute_type": "text", "is_required": True},
                        {"name": "Category", "attribute_type": "select", "config": {"options": ["IT Setup", "HR Paperwork", "Training", "Team Introductions", "Tools Access", "Documentation"]}},
                        {"name": "Due", "attribute_type": "date"},
                        {"name": "Assigned To", "attribute_type": "text"},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "pending", "label": "Pending", "color": "#6b7280"},
                            {"value": "in_progress", "label": "In Progress", "color": "#3b82f6"},
                            {"value": "completed", "label": "Completed", "color": "#10b981"},
                        ]}},
                    ],
                },
            ],
        },
        "outsourcing": {
            "objects": [
                {
                    "name": "Freelancer",
                    "plural_name": "Freelancers",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#8b5cf6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email", "is_required": True},
                        {"name": "Skills", "attribute_type": "multiselect", "config": {"options": ["Design", "Development", "Writing", "Marketing", "Video", "Animation", "Data"]}},
                        {"name": "Rate", "attribute_type": "text"},
                        {"name": "Availability", "attribute_type": "select", "config": {"options": ["Available", "Busy", "Not Available"]}},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "prospect", "label": "Prospect", "color": "#6b7280"},
                            {"value": "vetting", "label": "Vetting", "color": "#3b82f6"},
                            {"value": "approved", "label": "Approved", "color": "#10b981"},
                            {"value": "working", "label": "Working With", "color": "#8b5cf6"},
                            {"value": "inactive", "label": "Inactive", "color": "#f59e0b"},
                        ]}},
                        {"name": "Portfolio", "attribute_type": "url"},
                    ],
                },
                {
                    "name": "Project",
                    "plural_name": "Projects",
                    "object_type": "custom",
                    "icon": "folder",
                    "color": "#3b82f6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Budget", "attribute_type": "currency"},
                        {"name": "Deadline", "attribute_type": "date"},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "planning", "label": "Planning", "color": "#6b7280"},
                            {"value": "in_progress", "label": "In Progress", "color": "#3b82f6"},
                            {"value": "review", "label": "Review", "color": "#f59e0b"},
                            {"value": "completed", "label": "Completed", "color": "#10b981"},
                        ]}},
                    ],
                },
            ],
        },
        "press-outreach": {
            "objects": [
                {
                    "name": "Journalist",
                    "plural_name": "Journalists",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#ec4899",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email"},
                        {"name": "Publication", "attribute_type": "text"},
                        {"name": "Beat", "attribute_type": "select", "config": {"options": ["Tech", "Business", "Finance", "Startups", "Industry", "General"]}},
                        {"name": "Twitter", "attribute_type": "url"},
                        {"name": "Relationship", "attribute_type": "select", "config": {"options": ["Cold", "Warm", "Strong"]}},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "identified", "label": "Identified", "color": "#6b7280"},
                            {"value": "pitched", "label": "Pitched", "color": "#3b82f6"},
                            {"value": "interested", "label": "Interested", "color": "#8b5cf6"},
                            {"value": "covered", "label": "Covered", "color": "#10b981"},
                            {"value": "not_interested", "label": "Not Interested", "color": "#ef4444"},
                        ]}},
                    ],
                },
                {
                    "name": "Campaign",
                    "plural_name": "Campaigns",
                    "object_type": "custom",
                    "icon": "megaphone",
                    "color": "#f59e0b",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Type", "attribute_type": "select", "config": {"options": ["Product Launch", "Funding Announcement", "Partnership", "Executive Hire", "Awards", "Thought Leadership"]}},
                        {"name": "Target Date", "attribute_type": "date"},
                        {"name": "Status", "attribute_type": "status", "config": {"options": [
                            {"value": "planning", "label": "Planning", "color": "#6b7280"},
                            {"value": "outreach", "label": "Outreach", "color": "#3b82f6"},
                            {"value": "live", "label": "Live", "color": "#10b981"},
                            {"value": "completed", "label": "Completed", "color": "#8b5cf6"},
                        ]}},
                    ],
                },
            ],
        },
        "blank": {
            "objects": [
                {
                    "name": "Company",
                    "plural_name": "Companies",
                    "object_type": "company",
                    "icon": "building",
                    "color": "#3b82f6",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Website", "attribute_type": "url"},
                    ],
                },
                {
                    "name": "Person",
                    "plural_name": "People",
                    "object_type": "person",
                    "icon": "user",
                    "color": "#10b981",
                    "attributes": [
                        {"name": "Name", "attribute_type": "text", "is_required": True},
                        {"name": "Email", "attribute_type": "email"},
                    ],
                },
            ],
        },
    }

    template_config = templates.get(template, templates["blank"])

    for obj_config in template_config["objects"]:
        attributes = obj_config.pop("attributes", [])

        # Create object
        obj = await service.create_object(
            workspace_id=workspace_id,
            name=obj_config["name"],
            plural_name=obj_config["plural_name"],
            object_type=obj_config.get("object_type", "custom"),
            description=obj_config.get("description"),
            icon=obj_config.get("icon"),
            color=obj_config.get("color"),
        )

        # Create attributes
        for i, attr_config in enumerate(attributes):
            await attr_service.create_attribute(
                object_id=str(obj.id),
                name=attr_config["name"],
                attribute_type=attr_config["attribute_type"],
                description=attr_config.get("description"),
                is_required=attr_config.get("is_required", False),
                config=attr_config.get("config"),
                display_order=i,
            )

        created_objects.append(obj)

    await db.commit()

    return {
        "objects": [
            {
                "id": str(obj.id),
                "name": obj.name,
                "slug": obj.slug,
                "object_type": obj.object_type,
            }
            for obj in created_objects
        ],
        "message": f"Created {len(created_objects)} objects from {template} template",
    }


# =============================================================================
# ATTRIBUTE ENDPOINTS
# =============================================================================

@router.get("/objects/{object_id}/attributes", response_model=list[CRMAttributeResponse])
async def list_attributes(
    workspace_id: str,
    object_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all attributes for an object."""
    await check_workspace_permission(workspace_id, current_user, db)

    # Verify object belongs to workspace
    obj_service = CRMObjectService(db)
    obj = await obj_service.get_object(object_id)
    if not obj or str(obj.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found",
        )

    service = CRMAttributeService(db)
    attributes = await service.list_attributes(object_id)

    return [
        CRMAttributeResponse(
            id=str(attr.id),
            object_id=str(attr.object_id),
            name=attr.name,
            slug=attr.slug,
            description=attr.description,
            attribute_type=attr.attribute_type,
            config=attr.config,
            is_required=attr.is_required,
            is_unique=attr.is_unique,
            default_value=attr.default_value,
            position=attr.position,
            is_visible=attr.is_visible,
            is_filterable=attr.is_filterable,
            is_sortable=attr.is_sortable,
            column_width=attr.column_width,
            is_system=attr.is_system,
            created_at=attr.created_at,
            updated_at=attr.updated_at,
        )
        for attr in attributes
    ]


@router.post("/objects/{object_id}/attributes", response_model=CRMAttributeResponse, status_code=status.HTTP_201_CREATED)
async def create_attribute(
    workspace_id: str,
    object_id: str,
    data: CRMAttributeCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new attribute."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    # Verify object belongs to workspace
    obj_service = CRMObjectService(db)
    obj = await obj_service.get_object(object_id)
    if not obj or str(obj.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found",
        )

    service = CRMAttributeService(db)
    attr = await service.create_attribute(
        object_id=object_id,
        name=data.name,
        slug=data.slug,
        attribute_type=data.attribute_type,
        description=data.description,
        config=data.config.model_dump() if data.config else None,
        is_required=data.is_required,
        is_unique=data.is_unique,
        default_value=data.default_value,
        position=data.position,
        is_visible=data.is_visible,
        is_filterable=data.is_filterable,
        is_sortable=data.is_sortable,
        column_width=data.column_width,
    )

    await db.commit()

    return CRMAttributeResponse(
        id=str(attr.id),
        object_id=str(attr.object_id),
        name=attr.name,
        slug=attr.slug,
        description=attr.description,
        attribute_type=attr.attribute_type,
        config=attr.config,
        is_required=attr.is_required,
        is_unique=attr.is_unique,
        default_value=attr.default_value,
        position=attr.position,
        is_visible=attr.is_visible,
        is_filterable=attr.is_filterable,
        is_sortable=attr.is_sortable,
        column_width=attr.column_width,
        is_system=attr.is_system,
        created_at=attr.created_at,
        updated_at=attr.updated_at,
    )


@router.patch("/objects/{object_id}/attributes/{attribute_id}", response_model=CRMAttributeResponse)
async def update_attribute(
    workspace_id: str,
    object_id: str,
    attribute_id: str,
    data: CRMAttributeUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an attribute."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMAttributeService(db)
    attr = await service.get_attribute(attribute_id)

    if not attr or str(attr.object_id) != object_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute not found",
        )

    attr = await service.update_attribute(
        attribute_id=attribute_id,
        name=data.name,
        description=data.description,
        config=data.config.model_dump() if data.config else None,
        is_required=data.is_required,
        default_value=data.default_value,
        position=data.position,
        is_visible=data.is_visible,
        is_filterable=data.is_filterable,
        is_sortable=data.is_sortable,
        column_width=data.column_width,
    )

    await db.commit()

    return CRMAttributeResponse(
        id=str(attr.id),
        object_id=str(attr.object_id),
        name=attr.name,
        slug=attr.slug,
        description=attr.description,
        attribute_type=attr.attribute_type,
        config=attr.config,
        is_required=attr.is_required,
        is_unique=attr.is_unique,
        default_value=attr.default_value,
        position=attr.position,
        is_visible=attr.is_visible,
        is_filterable=attr.is_filterable,
        is_sortable=attr.is_sortable,
        column_width=attr.column_width,
        is_system=attr.is_system,
        created_at=attr.created_at,
        updated_at=attr.updated_at,
    )


@router.delete("/objects/{object_id}/attributes/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attribute(
    workspace_id: str,
    object_id: str,
    attribute_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an attribute."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMAttributeService(db)
    attr = await service.get_attribute(attribute_id)

    if not attr or str(attr.object_id) != object_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute not found",
        )

    try:
        await service.delete_attribute(attribute_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/objects/{object_id}/attributes/reorder", response_model=list[CRMAttributeResponse])
async def reorder_attributes(
    workspace_id: str,
    object_id: str,
    data: AttributeReorder,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reorder attributes."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = CRMAttributeService(db)
    attributes = await service.reorder_attributes(object_id, data.attribute_ids)

    await db.commit()

    return [
        CRMAttributeResponse(
            id=str(attr.id),
            object_id=str(attr.object_id),
            name=attr.name,
            slug=attr.slug,
            description=attr.description,
            attribute_type=attr.attribute_type,
            config=attr.config,
            is_required=attr.is_required,
            is_unique=attr.is_unique,
            default_value=attr.default_value,
            position=attr.position,
            is_visible=attr.is_visible,
            is_filterable=attr.is_filterable,
            is_sortable=attr.is_sortable,
            column_width=attr.column_width,
            is_system=attr.is_system,
            created_at=attr.created_at,
            updated_at=attr.updated_at,
        )
        for attr in attributes
    ]


# =============================================================================
# RECORD ENDPOINTS
# =============================================================================

@router.get("/objects/{object_id}/records")
async def list_records(
    workspace_id: str,
    object_id: str,
    include_archived: bool = False,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List records for an object."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMRecordService(db)
    records, total = await service.list_records(
        workspace_id=workspace_id,
        object_id=object_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )

    return {
        "records": [
            CRMRecordListResponse(
                id=str(r.id),
                object_id=str(r.object_id),
                values=r.values,
                display_name=r.display_name,
                owner_id=str(r.owner_id) if r.owner_id else None,
                is_archived=r.is_archived,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in records
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/objects/{object_id}/records", response_model=CRMRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_record(
    workspace_id: str,
    object_id: str,
    data: CRMRecordCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMRecordService(db)

    try:
        record = await service.create_record(
            workspace_id=workspace_id,
            object_id=object_id,
            values=data.values,
            owner_id=data.owner_id or str(current_user.id),
            created_by_id=str(current_user.id),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()

    return CRMRecordResponse(
        id=str(record.id),
        workspace_id=str(record.workspace_id),
        object_id=str(record.object_id),
        values=record.values,
        display_name=record.display_name,
        owner_id=str(record.owner_id) if record.owner_id else None,
        created_by_id=str(record.created_by_id) if record.created_by_id else None,
        is_archived=record.is_archived,
        archived_at=record.archived_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("/objects/{object_id}/records/{record_id}", response_model=CRMRecordResponse)
async def get_record(
    workspace_id: str,
    object_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a record by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMRecordService(db)
    record = await service.get_record(record_id)

    if not record or str(record.workspace_id) != workspace_id or str(record.object_id) != object_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Record not found",
        )

    return CRMRecordResponse(
        id=str(record.id),
        workspace_id=str(record.workspace_id),
        object_id=str(record.object_id),
        values=record.values,
        display_name=record.display_name,
        owner_id=str(record.owner_id) if record.owner_id else None,
        created_by_id=str(record.created_by_id) if record.created_by_id else None,
        is_archived=record.is_archived,
        archived_at=record.archived_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
        owner_name=record.owner.name if record.owner else None,
        created_by_name=record.created_by.name if record.created_by else None,
    )


@router.patch("/objects/{object_id}/records/{record_id}", response_model=CRMRecordResponse)
async def update_record(
    workspace_id: str,
    object_id: str,
    record_id: str,
    data: CRMRecordUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMRecordService(db)
    record = await service.get_record(record_id)

    if not record or str(record.workspace_id) != workspace_id or str(record.object_id) != object_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Record not found",
        )

    record = await service.update_record(
        record_id=record_id,
        values=data.values,
        owner_id=data.owner_id,
        updated_by_id=str(current_user.id),
    )

    await db.commit()

    return CRMRecordResponse(
        id=str(record.id),
        workspace_id=str(record.workspace_id),
        object_id=str(record.object_id),
        values=record.values,
        display_name=record.display_name,
        owner_id=str(record.owner_id) if record.owner_id else None,
        created_by_id=str(record.created_by_id) if record.created_by_id else None,
        is_archived=record.is_archived,
        archived_at=record.archived_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.delete("/objects/{object_id}/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    workspace_id: str,
    object_id: str,
    record_id: str,
    permanent: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a record (archive by default)."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMRecordService(db)
    record = await service.get_record(record_id)

    if not record or str(record.workspace_id) != workspace_id or str(record.object_id) != object_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Record not found",
        )

    await service.delete_record(record_id, permanent, str(current_user.id))
    await db.commit()


# =============================================================================
# NOTE ENDPOINTS
# =============================================================================

@router.get("/records/{record_id}/notes", response_model=list[CRMNoteResponse])
async def list_notes(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List notes for a record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMNoteService(db)
    notes = await service.list_notes(record_id)

    return [
        CRMNoteResponse(
            id=str(note.id),
            record_id=str(note.record_id),
            content=note.content,
            author_id=str(note.author_id) if note.author_id else None,
            is_pinned=note.is_pinned,
            created_at=note.created_at,
            updated_at=note.updated_at,
            author_name=note.author.name if note.author else None,
        )
        for note in notes
    ]


@router.post("/records/{record_id}/notes", response_model=CRMNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    workspace_id: str,
    record_id: str,
    data: CRMNoteCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a note on a record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMNoteService(db)
    note = await service.create_note(
        record_id=record_id,
        content=data.content,
        author_id=str(current_user.id),
        is_pinned=data.is_pinned,
    )

    await db.commit()

    return CRMNoteResponse(
        id=str(note.id),
        record_id=str(note.record_id),
        content=note.content,
        author_id=str(note.author_id) if note.author_id else None,
        is_pinned=note.is_pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.patch("/records/{record_id}/notes/{note_id}", response_model=CRMNoteResponse)
async def update_note(
    workspace_id: str,
    record_id: str,
    note_id: str,
    data: CRMNoteUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a note."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMNoteService(db)
    note = await service.update_note(
        note_id=note_id,
        content=data.content,
        is_pinned=data.is_pinned,
    )

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    await db.commit()

    return CRMNoteResponse(
        id=str(note.id),
        record_id=str(note.record_id),
        content=note.content,
        author_id=str(note.author_id) if note.author_id else None,
        is_pinned=note.is_pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.delete("/records/{record_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    workspace_id: str,
    record_id: str,
    note_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a note."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMNoteService(db)
    if not await service.delete_note(note_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    await db.commit()


# =============================================================================
# ACTIVITY ENDPOINTS
# =============================================================================

@router.get("/records/{record_id}/activities")
async def list_activities(
    workspace_id: str,
    record_id: str,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List activities for a record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMActivityService(db)
    activities, total = await service.list_activities(
        record_id=record_id,
        limit=limit,
        offset=offset,
    )

    return {
        "activities": [
            CRMActivityResponse(
                id=str(a.id),
                workspace_id=str(a.workspace_id),
                record_id=str(a.record_id),
                activity_type=a.activity_type,
                actor_type=a.actor_type,
                actor_id=a.actor_id,
                actor_name=a.actor_name,
                title=a.title,
                description=a.description,
                metadata=a.metadata,
                occurred_at=a.occurred_at,
                created_at=a.created_at,
            )
            for a in activities
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# =============================================================================
# LIST ENDPOINTS
# =============================================================================

@router.get("/lists", response_model=list[CRMListResponse])
async def list_lists(
    workspace_id: str,
    object_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all CRM lists in a workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMListService(db)
    lists = await service.list_lists(
        workspace_id=workspace_id,
        object_id=object_id,
        include_private=True,
        user_id=str(current_user.id),
    )

    return [
        CRMListResponse(
            id=str(lst.id),
            workspace_id=str(lst.workspace_id),
            object_id=str(lst.object_id),
            name=lst.name,
            slug=lst.slug,
            description=lst.description,
            icon=lst.icon,
            color=lst.color,
            view_type=lst.view_type,
            filters=lst.filters,
            sorts=lst.sorts,
            visible_attributes=lst.visible_attributes,
            group_by_attribute=lst.group_by_attribute,
            kanban_settings=lst.kanban_settings,
            date_attribute=lst.date_attribute,
            end_date_attribute=lst.end_date_attribute,
            is_private=lst.is_private,
            owner_id=str(lst.owner_id) if lst.owner_id else None,
            entry_count=lst.entry_count,
            created_at=lst.created_at,
            updated_at=lst.updated_at,
        )
        for lst in lists
    ]


@router.post("/lists", response_model=CRMListResponse, status_code=status.HTTP_201_CREATED)
async def create_list(
    workspace_id: str,
    data: CRMListCreate,
    object_id: str = Query(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new CRM list."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMListService(db)
    lst = await service.create_list(
        workspace_id=workspace_id,
        object_id=object_id,
        name=data.name,
        description=data.description,
        icon=data.icon,
        color=data.color,
        view_type=data.view_type,
        filters=[f.model_dump() for f in data.filters] if data.filters else None,
        sorts=[s.model_dump() for s in data.sorts] if data.sorts else None,
        visible_attributes=data.visible_attributes,
        group_by_attribute=data.group_by_attribute,
        kanban_settings=data.kanban_settings.model_dump() if data.kanban_settings else None,
        date_attribute=data.date_attribute,
        end_date_attribute=data.end_date_attribute,
        is_private=data.is_private,
        owner_id=str(current_user.id),
    )

    await db.commit()

    return CRMListResponse(
        id=str(lst.id),
        workspace_id=str(lst.workspace_id),
        object_id=str(lst.object_id),
        name=lst.name,
        slug=lst.slug,
        description=lst.description,
        icon=lst.icon,
        color=lst.color,
        view_type=lst.view_type,
        filters=lst.filters,
        sorts=lst.sorts,
        visible_attributes=lst.visible_attributes,
        group_by_attribute=lst.group_by_attribute,
        kanban_settings=lst.kanban_settings,
        date_attribute=lst.date_attribute,
        end_date_attribute=lst.end_date_attribute,
        is_private=lst.is_private,
        owner_id=str(lst.owner_id) if lst.owner_id else None,
        entry_count=lst.entry_count,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@router.get("/lists/{list_id}", response_model=CRMListResponse)
async def get_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a CRM list by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMListService(db)
    lst = await service.get_list(list_id)

    if not lst or str(lst.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found",
        )

    return CRMListResponse(
        id=str(lst.id),
        workspace_id=str(lst.workspace_id),
        object_id=str(lst.object_id),
        name=lst.name,
        slug=lst.slug,
        description=lst.description,
        icon=lst.icon,
        color=lst.color,
        view_type=lst.view_type,
        filters=lst.filters,
        sorts=lst.sorts,
        visible_attributes=lst.visible_attributes,
        group_by_attribute=lst.group_by_attribute,
        kanban_settings=lst.kanban_settings,
        date_attribute=lst.date_attribute,
        end_date_attribute=lst.end_date_attribute,
        is_private=lst.is_private,
        owner_id=str(lst.owner_id) if lst.owner_id else None,
        entry_count=lst.entry_count,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@router.patch("/lists/{list_id}", response_model=CRMListResponse)
async def update_list(
    workspace_id: str,
    list_id: str,
    data: CRMListUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a CRM list."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMListService(db)
    lst = await service.get_list(list_id)

    if not lst or str(lst.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    if "filters" in update_data and update_data["filters"]:
        update_data["filters"] = [f.model_dump() if hasattr(f, "model_dump") else f for f in update_data["filters"]]
    if "sorts" in update_data and update_data["sorts"]:
        update_data["sorts"] = [s.model_dump() if hasattr(s, "model_dump") else s for s in update_data["sorts"]]
    if "kanban_settings" in update_data and update_data["kanban_settings"]:
        update_data["kanban_settings"] = update_data["kanban_settings"].model_dump() if hasattr(update_data["kanban_settings"], "model_dump") else update_data["kanban_settings"]

    lst = await service.update_list(list_id, **update_data)

    await db.commit()

    return CRMListResponse(
        id=str(lst.id),
        workspace_id=str(lst.workspace_id),
        object_id=str(lst.object_id),
        name=lst.name,
        slug=lst.slug,
        description=lst.description,
        icon=lst.icon,
        color=lst.color,
        view_type=lst.view_type,
        filters=lst.filters,
        sorts=lst.sorts,
        visible_attributes=lst.visible_attributes,
        group_by_attribute=lst.group_by_attribute,
        kanban_settings=lst.kanban_settings,
        date_attribute=lst.date_attribute,
        end_date_attribute=lst.end_date_attribute,
        is_private=lst.is_private,
        owner_id=str(lst.owner_id) if lst.owner_id else None,
        entry_count=lst.entry_count,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@router.delete("/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a CRM list."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = CRMListService(db)
    lst = await service.get_list(list_id)

    if not lst or str(lst.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found",
        )

    await service.delete_list(list_id)
    await db.commit()
