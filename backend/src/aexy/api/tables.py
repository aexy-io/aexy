"""Standalone Tables API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.crm import (
    CRMObjectResponse,
    CRMObjectWithAttributesResponse,
    CRMAttributeCreate,
    CRMAttributeUpdate,
    CRMAttributeResponse,
    AttributeReorder,
    CRMRecordCreate,
    CRMRecordUpdate,
    CRMRecordResponse,
    CRMRecordListResponse,
    CRMRecordBulkDelete,
    CRMListCreate,
    CRMListResponse,
    TableCollaboratorCreate,
    TableCollaboratorUpdate,
    TableCollaboratorResponse,
    TableAccessResponse,
)
from aexy.services.data_table_service import DataTableService
from aexy.services.table_audit_service import TableAuditService, TableShareService
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/tables",
    tags=["Tables"],
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
# TABLE CRUD
# =============================================================================

@router.get("", response_model=list[CRMObjectWithAttributesResponse])
async def list_tables(
    workspace_id: str,
    scope: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all tables in a workspace (standalone + CRM)."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    tables = await service.list_tables(
        workspace_id=workspace_id,
        scope=scope,
        user_id=str(current_user.id),
    )

    return [
        CRMObjectWithAttributesResponse(
            id=str(t.id),
            workspace_id=str(t.workspace_id),
            name=t.name,
            slug=t.slug,
            plural_name=t.plural_name,
            description=t.description,
            object_type=t.object_type,
            icon=t.icon,
            color=t.color,
            primary_attribute_id=str(t.primary_attribute_id) if t.primary_attribute_id else None,
            settings=t.settings,
            record_count=t.record_count,
            is_system=t.is_system,
            is_active=t.is_active,
            scope=t.scope,
            visibility=t.visibility,
            row_access_mode=t.row_access_mode,
            created_by_id=str(t.created_by_id) if t.created_by_id else None,
            created_at=t.created_at,
            updated_at=t.updated_at,
            attributes=[
                CRMAttributeResponse(
                    id=str(a.id),
                    object_id=str(a.object_id),
                    name=a.name,
                    slug=a.slug,
                    description=a.description,
                    attribute_type=a.attribute_type,
                    config=a.config,
                    is_required=a.is_required,
                    is_unique=a.is_unique,
                    default_value=a.default_value,
                    position=a.position,
                    is_visible=a.is_visible,
                    is_filterable=a.is_filterable,
                    is_sortable=a.is_sortable,
                    column_width=a.column_width,
                    is_system=a.is_system,
                    created_at=a.created_at,
                    updated_at=a.updated_at,
                )
                for a in (t.attributes or [])
            ],
        )
        for t in tables
    ]


class TableCreate(BaseModel):
    """Schema for creating a standalone table (plural_name optional)."""
    name: str = Field(..., min_length=1, max_length=255)
    plural_name: str | None = None
    description: str | None = None
    object_type: str = "custom"
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    settings: dict | None = None


@router.post("", response_model=CRMObjectWithAttributesResponse, status_code=201)
async def create_table(
    workspace_id: str,
    data: TableCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new standalone table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    table = await service.create_table(
        workspace_id=workspace_id,
        name=data.name,
        plural_name=data.plural_name or data.name,
        scope="standalone",
        object_type=data.object_type or "custom",
        description=data.description,
        icon=data.icon,
        color=data.color,
        settings=data.settings,
        visibility="workspace",
        created_by_id=str(current_user.id),
    )

    await db.commit()
    await db.refresh(table)

    return CRMObjectWithAttributesResponse(
        id=str(table.id),
        workspace_id=str(table.workspace_id),
        name=table.name,
        slug=table.slug,
        plural_name=table.plural_name,
        description=table.description,
        object_type=table.object_type,
        icon=table.icon,
        color=table.color,
        primary_attribute_id=str(table.primary_attribute_id) if table.primary_attribute_id else None,
        settings=table.settings,
        record_count=table.record_count,
        is_system=table.is_system,
        is_active=table.is_active,
        scope=table.scope,
        visibility=table.visibility,
        row_access_mode=table.row_access_mode,
        created_by_id=str(table.created_by_id) if table.created_by_id else None,
        created_at=table.created_at,
        updated_at=table.updated_at,
        attributes=[],
    )


@router.get("/{table_id}", response_model=CRMObjectWithAttributesResponse)
async def get_table(
    workspace_id: str,
    table_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a table with its fields."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    table = await service.get_table(table_id)
    if not table or str(table.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Table not found")

    return CRMObjectWithAttributesResponse(
        id=str(table.id),
        workspace_id=str(table.workspace_id),
        name=table.name,
        slug=table.slug,
        plural_name=table.plural_name,
        description=table.description,
        object_type=table.object_type,
        icon=table.icon,
        color=table.color,
        primary_attribute_id=str(table.primary_attribute_id) if table.primary_attribute_id else None,
        settings=table.settings,
        record_count=table.record_count,
        is_system=table.is_system,
        is_active=table.is_active,
        scope=table.scope,
        visibility=table.visibility,
        row_access_mode=table.row_access_mode,
        created_by_id=str(table.created_by_id) if table.created_by_id else None,
        created_at=table.created_at,
        updated_at=table.updated_at,
        attributes=[
            CRMAttributeResponse(
                id=str(a.id),
                object_id=str(a.object_id),
                name=a.name,
                slug=a.slug,
                description=a.description,
                attribute_type=a.attribute_type,
                config=a.config,
                is_required=a.is_required,
                is_unique=a.is_unique,
                default_value=a.default_value,
                position=a.position,
                is_visible=a.is_visible,
                is_filterable=a.is_filterable,
                is_sortable=a.is_sortable,
                column_width=a.column_width,
                is_system=a.is_system,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
            for a in (table.attributes or [])
        ],
    )


@router.patch("/{table_id}", response_model=CRMObjectResponse)
async def update_table(
    workspace_id: str,
    table_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a table's properties."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(table_id, str(current_user.id), "manage", workspace_id)

    table = await service.update_table(table_id, **data)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    await db.commit()
    return table


@router.delete("/{table_id}", status_code=204)
async def delete_table(
    workspace_id: str,
    table_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a table (soft delete)."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(table_id, str(current_user.id), "admin", workspace_id)

    if not await service.delete_table(table_id):
        raise HTTPException(status_code=404, detail="Table not found")

    await db.commit()


# =============================================================================
# FIELD CRUD
# =============================================================================

@router.get("/{table_id}/fields", response_model=list[CRMAttributeResponse])
async def list_fields(
    workspace_id: str,
    table_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all fields for a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    table = await service.get_table(table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    return [
        CRMAttributeResponse(
            id=str(a.id),
            object_id=str(a.object_id),
            name=a.name,
            slug=a.slug,
            description=a.description,
            attribute_type=a.attribute_type,
            config=a.config,
            is_required=a.is_required,
            is_unique=a.is_unique,
            default_value=a.default_value,
            position=a.position,
            is_visible=a.is_visible,
            is_filterable=a.is_filterable,
            is_sortable=a.is_sortable,
            column_width=a.column_width,
            is_system=a.is_system,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in (table.attributes or [])
    ]


@router.post("/{table_id}/fields", response_model=CRMAttributeResponse, status_code=201)
async def add_field(
    workspace_id: str,
    table_id: str,
    data: CRMAttributeCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a field to a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(table_id, str(current_user.id), "manage", workspace_id)

    field = await service.add_field(
        table_id=table_id,
        name=data.name,
        field_type=data.attribute_type,
        slug=data.slug,
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
    return field


@router.patch("/{table_id}/fields/{field_id}", response_model=CRMAttributeResponse)
async def update_field(
    workspace_id: str,
    table_id: str,
    field_id: str,
    data: CRMAttributeUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a field."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(table_id, str(current_user.id), "manage", workspace_id)

    update_data = data.model_dump(exclude_unset=True)
    if "config" in update_data and update_data["config"] is not None:
        update_data["config"] = update_data["config"]

    field = await service.update_field(field_id, **update_data)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    await db.commit()
    return field


@router.delete("/{table_id}/fields/{field_id}", status_code=204)
async def delete_field(
    workspace_id: str,
    table_id: str,
    field_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a field."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(table_id, str(current_user.id), "manage", workspace_id)

    if not await service.delete_field(field_id):
        raise HTTPException(status_code=404, detail="Field not found")

    await db.commit()


# =============================================================================
# RECORD CRUD
# =============================================================================

@router.get("/{table_id}/records")
async def list_records(
    workspace_id: str,
    table_id: str,
    include_archived: bool = False,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List records in a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    access = await service.auth.check_access(
        table_id, str(current_user.id), "view", workspace_id
    )

    records, total = await service.list_records(
        table_id=table_id,
        workspace_id=workspace_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
        access=access,
    )

    return {
        "records": [
            CRMRecordListResponse(
                id=str(r.id),
                object_id=str(r.object_id),
                values={
                    k: v for k, v in r.values.items()
                    if k not in access.hidden_columns
                },
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


@router.post("/{table_id}/records", status_code=201)
async def create_record(
    workspace_id: str,
    table_id: str,
    data: CRMRecordCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a record in a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    access = await service.auth.check_access(
        table_id, str(current_user.id), "edit", workspace_id
    )
    service.auth.validate_write(data.values, access)

    record = await service.create_record(
        table_id=table_id,
        workspace_id=workspace_id,
        values=data.values,
        owner_id=data.owner_id or str(current_user.id),
        created_by_id=str(current_user.id),
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


@router.patch("/{table_id}/records/{record_id}")
async def update_record(
    workspace_id: str,
    table_id: str,
    record_id: str,
    data: CRMRecordUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    access = await service.auth.check_access(
        table_id, str(current_user.id), "edit", workspace_id
    )
    if data.values:
        service.auth.validate_write(data.values, access)

    record = await service.update_record(
        record_id=record_id,
        values=data.values,
        owner_id=data.owner_id,
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

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


@router.delete("/{table_id}/records/{record_id}", status_code=204)
async def delete_record(
    workspace_id: str,
    table_id: str,
    record_id: str,
    permanent: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a record."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "manage", workspace_id
    )

    if not await service.delete_record(record_id, permanent):
        raise HTTPException(status_code=404, detail="Record not found")

    await db.commit()


@router.post("/{table_id}/records/bulk-delete", status_code=200)
async def bulk_delete_records(
    workspace_id: str,
    table_id: str,
    data: CRMRecordBulkDelete,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete records."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "manage", workspace_id
    )

    deleted = await service.bulk_delete_records(data.record_ids, data.permanent)
    await db.commit()
    return {"deleted": deleted}


# =============================================================================
# TABLE ACCESS
# =============================================================================

@router.get("/{table_id}/access", response_model=TableAccessResponse)
async def get_my_access(
    workspace_id: str,
    table_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's resolved access on a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    access = await service.auth.resolve_access(
        table_id, str(current_user.id), workspace_id
    )
    if not access:
        raise HTTPException(status_code=403, detail="No access to this table")

    return TableAccessResponse(
        permission=access.permission,
        hidden_columns=access.hidden_columns,
        readonly_columns=access.readonly_columns,
    )


# =============================================================================
# COLLABORATOR MANAGEMENT
# =============================================================================

@router.get("/{table_id}/collaborators", response_model=list[TableCollaboratorResponse])
async def list_collaborators(
    workspace_id: str,
    table_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List collaborators on a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    collabs = await service.list_collaborators(table_id)
    return [
        TableCollaboratorResponse(
            id=str(c.id),
            table_id=str(c.table_id),
            developer_id=str(c.developer_id) if c.developer_id else None,
            role_id=str(c.role_id) if c.role_id else None,
            team_id=str(c.team_id) if c.team_id else None,
            permission=c.permission,
            hidden_columns=c.hidden_columns or [],
            readonly_columns=c.readonly_columns or [],
            row_filter=c.row_filter,
            created_at=c.created_at,
            created_by_id=str(c.created_by_id) if c.created_by_id else None,
            developer_name=c.developer.name if c.developer else None,
        )
        for c in collabs
    ]


@router.post("/{table_id}/collaborators", response_model=TableCollaboratorResponse, status_code=201)
async def add_collaborator(
    workspace_id: str,
    table_id: str,
    data: TableCollaboratorCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a collaborator to a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    collab = await service.add_collaborator(
        table_id=table_id,
        permission=data.permission,
        developer_id=data.developer_id,
        role_id=data.role_id,
        team_id=data.team_id,
        hidden_columns=data.hidden_columns,
        readonly_columns=data.readonly_columns,
        row_filter=data.row_filter,
        created_by_id=str(current_user.id),
    )

    await db.commit()
    return TableCollaboratorResponse(
        id=str(collab.id),
        table_id=str(collab.table_id),
        developer_id=str(collab.developer_id) if collab.developer_id else None,
        role_id=str(collab.role_id) if collab.role_id else None,
        team_id=str(collab.team_id) if collab.team_id else None,
        permission=collab.permission,
        hidden_columns=collab.hidden_columns or [],
        readonly_columns=collab.readonly_columns or [],
        row_filter=collab.row_filter,
        created_at=collab.created_at,
        created_by_id=str(collab.created_by_id) if collab.created_by_id else None,
    )


@router.patch("/{table_id}/collaborators/{collaborator_id}", response_model=TableCollaboratorResponse)
async def update_collaborator(
    workspace_id: str,
    table_id: str,
    collaborator_id: str,
    data: TableCollaboratorUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a collaborator's permission/restrictions."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    collab = await service.update_collaborator(
        collaborator_id=collaborator_id,
        permission=data.permission,
        hidden_columns=data.hidden_columns,
        readonly_columns=data.readonly_columns,
        row_filter=data.row_filter,
    )
    if not collab:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    await db.commit()
    return TableCollaboratorResponse(
        id=str(collab.id),
        table_id=str(collab.table_id),
        developer_id=str(collab.developer_id) if collab.developer_id else None,
        role_id=str(collab.role_id) if collab.role_id else None,
        team_id=str(collab.team_id) if collab.team_id else None,
        permission=collab.permission,
        hidden_columns=collab.hidden_columns or [],
        readonly_columns=collab.readonly_columns or [],
        row_filter=collab.row_filter,
        created_at=collab.created_at,
        created_by_id=str(collab.created_by_id) if collab.created_by_id else None,
    )


@router.delete("/{table_id}/collaborators/{collaborator_id}", status_code=204)
async def remove_collaborator(
    workspace_id: str,
    table_id: str,
    collaborator_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a collaborator from a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    if not await service.remove_collaborator(collaborator_id):
        raise HTTPException(status_code=404, detail="Collaborator not found")

    await db.commit()


# =============================================================================
# SHARE LINKS (Phase 5)
# =============================================================================

@router.get("/{table_id}/share-links")
async def list_share_links(
    workspace_id: str,
    table_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all share links for a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    share_svc = TableShareService(db)
    links = await share_svc.list_links(table_id)
    return [
        {
            "id": str(link.id),
            "token": link.token,
            "permission": link.permission,
            "has_password": bool(link.password_hash),
            "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            "max_uses": link.max_uses,
            "use_count": link.use_count,
            "is_active": link.is_active,
            "created_at": link.created_at.isoformat() if link.created_at else None,
        }
        for link in links
    ]


@router.post("/{table_id}/share-links", status_code=201)
async def create_share_link(
    workspace_id: str,
    table_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a share link for a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    share_svc = TableShareService(db)
    link = await share_svc.create_share_link(
        table_id=table_id,
        created_by_id=str(current_user.id),
        permission=data.get("permission", "view"),
        password=data.get("password"),
        expires_at=data.get("expires_at"),
        max_uses=data.get("max_uses"),
        view_id=data.get("view_id"),
        hidden_columns=data.get("hidden_columns"),
        row_filter=data.get("row_filter"),
    )

    await db.commit()
    return {
        "id": str(link.id),
        "token": link.token,
        "permission": link.permission,
        "is_active": link.is_active,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


@router.delete("/{table_id}/share-links/{link_id}", status_code=204)
async def revoke_share_link(
    workspace_id: str,
    table_id: str,
    link_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a share link."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    share_svc = TableShareService(db)
    if not await share_svc.revoke_link(link_id):
        raise HTTPException(status_code=404, detail="Share link not found")

    await db.commit()


# =============================================================================
# AUDIT LOG (Phase 7)
# =============================================================================

@router.get("/{table_id}/audit-log")
async def get_audit_log(
    workspace_id: str,
    table_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    record_id: str | None = Query(None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get audit log for a table."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DataTableService(db)
    await service.auth.check_access(
        table_id, str(current_user.id), "admin", workspace_id
    )

    audit_svc = TableAuditService(db)
    entries, total = await audit_svc.get_table_log(
        table_id=table_id,
        limit=limit,
        offset=offset,
        action_filter=action,
        record_id=record_id,
    )

    return {
        "entries": [
            {
                "id": str(e.id),
                "action": e.action,
                "record_id": str(e.record_id) if e.record_id else None,
                "actor_id": str(e.actor_id),
                "actor_name": e.actor.name if e.actor else None,
                "changes": e.changes,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "total": total,
    }
