"""Data Table Service — shared engine for tables, fields, records, views, and authorization.

CRM, Standalone Tables, Document Databases, and Sprint fields all delegate
their table/record CRUD to this service. Module-specific logic (automations,
activity logging, domain events) stays in the module service.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_, or_, cast, Numeric
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.crm import (
    CRMObject,
    CRMAttribute,
    CRMRecord,
    CRMList,
    CRMListEntry,
    CRMAttributeType,
    TableCollaborator,
)


# =============================================================================
# CONSTANTS
# =============================================================================

# Permission hierarchy (higher number = more access)
PERMISSION_LEVELS = {
    "view": 1,
    "comment": 2,
    "edit": 3,
    "manage": 4,
    "admin": 5,
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class TableAccess:
    """Resolved access for a user on a specific table."""
    permission: str  # 'view', 'comment', 'edit', 'manage', 'admin'
    hidden_columns: list[str] = field(default_factory=list)
    readonly_columns: list[str] = field(default_factory=list)
    row_filter: list[dict] | None = None

    @property
    def level(self) -> int:
        return PERMISSION_LEVELS.get(self.permission, 0)

    def can(self, min_perm: str) -> bool:
        return self.level >= PERMISSION_LEVELS.get(min_perm, 0)


# =============================================================================
# SLUG HELPERS
# =============================================================================

def _generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:100]


def _generate_attribute_slug(name: str) -> str:
    """Generate an attribute slug (snake_case)."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return slug[:100]


# =============================================================================
# AUTHORIZATION SERVICE
# =============================================================================

class TableAuthService:
    """Resolve and enforce per-table authorization."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def resolve_access(
        self,
        table_id: str,
        user_id: str,
        workspace_id: str | None = None,
    ) -> TableAccess | None:
        """Resolve a user's effective access on a table.

        Resolution order (highest wins):
        1. Workspace owner/admin → admin
        2. Table creator → admin
        3. Direct developer collaborator
        4. Role-based collaborator
        5. Team-based collaborator
        6. Visibility='workspace' → view for all workspace members
        7. None → no access
        """
        # Fetch the table
        stmt = select(CRMObject).where(CRMObject.id == table_id)
        result = await self.db.execute(stmt)
        table = result.scalar_one_or_none()
        if not table:
            return None

        # Fetch workspace member once (reused for steps 1, 4, 6)
        member = None
        if workspace_id:
            from aexy.models.workspace import WorkspaceMember
            member_stmt = select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.developer_id == user_id,
                WorkspaceMember.status == "active",
            )
            member_result = await self.db.execute(member_stmt)
            member = member_result.scalar_one_or_none()

        # 1. Check if workspace admin/owner
        if member and member.role in ("owner", "admin"):
            return TableAccess(permission="admin")

        # 2. Table creator → admin
        if table.created_by_id == user_id:
            return TableAccess(permission="admin")

        # 3-5. Check collaborators (developer, role, team)
        best_access: TableAccess | None = None

        # Direct developer match
        collab_stmt = select(TableCollaborator).where(
            TableCollaborator.table_id == table_id,
            TableCollaborator.developer_id == user_id,
        )
        collab_result = await self.db.execute(collab_stmt)
        collab = collab_result.scalar_one_or_none()
        if collab:
            best_access = self._collab_to_access(collab)

        # Role-based match (reuse member fetched above)
        if member and member.role_id:
            role_collab_stmt = select(TableCollaborator).where(
                TableCollaborator.table_id == table_id,
                TableCollaborator.role_id == member.role_id,
            )
            role_result = await self.db.execute(role_collab_stmt)
            role_collab = role_result.scalar_one_or_none()
            if role_collab:
                access = self._collab_to_access(role_collab)
                if not best_access or access.level > best_access.level:
                    best_access = access

        # Team-based match
        if workspace_id:
            from aexy.models.team import TeamMember
            team_stmt = select(TeamMember.team_id).where(
                TeamMember.developer_id == user_id,
            )
            team_result = await self.db.execute(team_stmt)
            user_team_ids = [row[0] for row in team_result.all()]

            if user_team_ids:
                team_collab_stmt = select(TableCollaborator).where(
                    TableCollaborator.table_id == table_id,
                    TableCollaborator.team_id.in_(user_team_ids),
                )
                team_collabs_result = await self.db.execute(team_collab_stmt)
                for team_collab in team_collabs_result.scalars().all():
                    access = self._collab_to_access(team_collab)
                    if not best_access or access.level > best_access.level:
                        best_access = access

        if best_access:
            return best_access

        # 6. Visibility fallback — reuse member fetched above
        if table.visibility == "workspace" and member:
            return TableAccess(permission="view")

        # 7. No access
        return None

    async def check_access(
        self,
        table_id: str,
        user_id: str,
        min_perm: str,
        workspace_id: str | None = None,
    ) -> TableAccess:
        """Check access and raise if insufficient. Returns the resolved access."""
        access = await self.resolve_access(table_id, user_id, workspace_id)
        if not access or not access.can(min_perm):
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permission. Requires '{min_perm}' access.",
            )
        return access

    def _collab_to_access(self, collab: TableCollaborator) -> TableAccess:
        return TableAccess(
            permission=collab.permission,
            hidden_columns=collab.hidden_columns or [],
            readonly_columns=collab.readonly_columns or [],
            row_filter=collab.row_filter,
        )

    def validate_write(self, values: dict[str, Any], access: TableAccess) -> None:
        """Reject writes to hidden or readonly columns."""
        from fastapi import HTTPException, status

        for col in access.hidden_columns:
            if col in values:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Column '{col}' is not accessible",
                )
        for col in access.readonly_columns:
            if col in values:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Column '{col}' is read-only for your access level",
                )


# =============================================================================
# DATA TABLE SERVICE — shared CRUD
# =============================================================================

class DataTableService:
    """Shared CRUD for table definitions, fields, records, and views.

    Module-agnostic. CRM, Docs, Sprints, Standalone all call this.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.auth = TableAuthService(db)

    # -------------------------------------------------------------------------
    # TABLE CRUD
    # -------------------------------------------------------------------------

    async def create_table(
        self,
        workspace_id: str,
        name: str,
        plural_name: str,
        scope: str = "standalone",
        object_type: str = "custom",
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        settings: dict | None = None,
        visibility: str = "workspace",
        row_access_mode: str = "all",
        created_by_id: str | None = None,
        document_id: str | None = None,
    ) -> CRMObject:
        """Create a new data table."""
        base_slug = _generate_slug(name)
        slug = base_slug
        counter = 1
        while True:
            existing = await self.db.execute(
                select(CRMObject).where(
                    CRMObject.workspace_id == workspace_id,
                    CRMObject.slug == slug,
                )
            )
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        table = CRMObject(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            plural_name=plural_name,
            description=description,
            object_type=object_type,
            icon=icon,
            color=color,
            settings=settings or {},
            scope=scope,
            visibility=visibility,
            row_access_mode=row_access_mode,
            created_by_id=created_by_id,
            document_id=document_id,
            is_system=False,
            is_active=True,
        )
        self.db.add(table)
        await self.db.flush()
        await self.db.refresh(table)
        return table

    async def get_table(self, table_id: str) -> CRMObject | None:
        """Get a table by ID with attributes eagerly loaded."""
        stmt = (
            select(CRMObject)
            .where(CRMObject.id == table_id)
            .options(selectinload(CRMObject.attributes))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_tables(
        self,
        workspace_id: str,
        scope: str | None = None,
        visibility: str | None = None,
        user_id: str | None = None,
        include_inactive: bool = False,
    ) -> list[CRMObject]:
        """List tables, optionally filtered by scope/visibility."""
        stmt = (
            select(CRMObject)
            .where(CRMObject.workspace_id == workspace_id)
            .options(selectinload(CRMObject.attributes))
        )
        if scope:
            stmt = stmt.where(CRMObject.scope == scope)
        if visibility:
            stmt = stmt.where(CRMObject.visibility == visibility)
        if not include_inactive:
            stmt = stmt.where(CRMObject.is_active == True)

        # For private tables, only show if user is creator or collaborator
        if user_id:
            stmt = stmt.where(
                or_(
                    CRMObject.visibility != "private",
                    CRMObject.created_by_id == user_id,
                    CRMObject.id.in_(
                        select(TableCollaborator.table_id).where(
                            TableCollaborator.developer_id == user_id
                        )
                    ),
                )
            )

        stmt = stmt.order_by(CRMObject.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_table(
        self, table_id: str, **kwargs: Any,
    ) -> CRMObject | None:
        """Update table properties."""
        table = await self.get_table(table_id)
        if not table:
            return None

        allowed_fields = {
            "name", "plural_name", "description", "icon", "color",
            "primary_attribute_id", "settings", "is_active",
            "visibility", "row_access_mode", "audit_config",
        }
        for key, value in kwargs.items():
            if key in allowed_fields:
                setattr(table, key, value)

        await self.db.flush()
        await self.db.refresh(table)
        return table

    async def delete_table(self, table_id: str) -> bool:
        """Soft-delete a table."""
        table = await self.get_table(table_id)
        if not table:
            return False
        if table.is_system:
            raise ValueError("Cannot delete system tables")

        table.is_active = False
        await self.db.flush()
        return True

    # -------------------------------------------------------------------------
    # FIELD CRUD
    # -------------------------------------------------------------------------

    async def add_field(
        self,
        table_id: str,
        name: str,
        field_type: str = "text",
        slug: str | None = None,
        description: str | None = None,
        config: dict | None = None,
        is_required: bool = False,
        is_unique: bool = False,
        default_value: str | None = None,
        position: int | None = None,
        is_visible: bool = True,
        is_filterable: bool = True,
        is_sortable: bool = True,
        column_width: int | None = None,
        is_system: bool = False,
    ) -> CRMAttribute:
        """Add a field to a table."""
        if not slug:
            base_slug = _generate_attribute_slug(name)
            slug = base_slug
            counter = 1
            while True:
                existing = await self.db.execute(
                    select(CRMAttribute).where(
                        CRMAttribute.object_id == table_id,
                        CRMAttribute.slug == slug,
                    )
                )
                if not existing.scalar_one_or_none():
                    break
                slug = f"{base_slug}_{counter}"
                counter += 1

        if position is None:
            result = await self.db.execute(
                select(func.max(CRMAttribute.position))
                .where(CRMAttribute.object_id == table_id)
            )
            max_pos = result.scalar() or 0
            position = max_pos + 1

        attr = CRMAttribute(
            id=str(uuid4()),
            object_id=table_id,
            name=name,
            slug=slug,
            description=description,
            attribute_type=field_type,
            config=config or {},
            is_required=is_required,
            is_unique=is_unique,
            default_value=default_value,
            position=position,
            is_visible=is_visible,
            is_filterable=is_filterable,
            is_sortable=is_sortable,
            column_width=column_width,
            is_system=is_system,
        )
        self.db.add(attr)
        await self.db.flush()
        await self.db.refresh(attr)
        return attr

    async def update_field(
        self, field_id: str, **kwargs: Any,
    ) -> CRMAttribute | None:
        """Update a field's properties."""
        stmt = select(CRMAttribute).where(CRMAttribute.id == field_id)
        result = await self.db.execute(stmt)
        attr = result.scalar_one_or_none()
        if not attr:
            return None

        allowed = {
            "name", "description", "config", "is_required", "default_value",
            "position", "is_visible", "is_filterable", "is_sortable", "column_width",
        }
        for key, value in kwargs.items():
            if key in allowed and value is not None:
                setattr(attr, key, value)

        await self.db.flush()
        await self.db.refresh(attr)
        return attr

    async def reorder_fields(
        self, table_id: str, field_ids: list[str],
    ) -> list[CRMAttribute]:
        """Reorder fields by setting position from the list order."""
        for position, field_id in enumerate(field_ids):
            stmt = select(CRMAttribute).where(
                CRMAttribute.id == field_id,
                CRMAttribute.object_id == table_id,
            )
            result = await self.db.execute(stmt)
            attr = result.scalar_one_or_none()
            if attr:
                attr.position = position

        await self.db.flush()

        # Return updated list
        stmt = (
            select(CRMAttribute)
            .where(CRMAttribute.object_id == table_id)
            .order_by(CRMAttribute.position)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_field(self, field_id: str) -> bool:
        """Delete a field."""
        stmt = select(CRMAttribute).where(CRMAttribute.id == field_id)
        result = await self.db.execute(stmt)
        attr = result.scalar_one_or_none()
        if not attr:
            return False
        if attr.is_system:
            raise ValueError("Cannot delete system fields")

        await self.db.delete(attr)
        await self.db.flush()
        return True

    # -------------------------------------------------------------------------
    # RECORD CRUD
    # -------------------------------------------------------------------------

    async def create_record(
        self,
        table_id: str,
        workspace_id: str,
        values: dict[str, Any],
        owner_id: str | None = None,
        created_by_id: str | None = None,
    ) -> CRMRecord:
        """Create a record in a table."""
        table = await self.get_table(table_id)
        if not table:
            raise ValueError("Table not found")

        display_name = self._compute_display_name(table, values)

        record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=table_id,
            values=values,
            display_name=display_name,
            owner_id=owner_id,
            created_by_id=created_by_id,
            is_archived=False,
        )
        self.db.add(record)
        table.record_count = table.record_count + 1

        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def get_record(self, record_id: str) -> CRMRecord | None:
        """Get a record by ID."""
        stmt = (
            select(CRMRecord)
            .where(CRMRecord.id == record_id)
            .options(
                selectinload(CRMRecord.object).selectinload(CRMObject.attributes),
                selectinload(CRMRecord.owner),
                selectinload(CRMRecord.created_by),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_records(
        self,
        table_id: str,
        workspace_id: str,
        filters: list[dict] | None = None,
        sorts: list[dict] | None = None,
        include_archived: bool = False,
        limit: int = 50,
        offset: int = 0,
        access: TableAccess | None = None,
        user_id: str | None = None,
    ) -> tuple[list[CRMRecord], int]:
        """List records with filtering, sorting, pagination, and row security."""
        table = await self.get_table(table_id)

        stmt = (
            select(CRMRecord)
            .where(
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.object_id == table_id,
            )
        )
        if not include_archived:
            stmt = stmt.where(CRMRecord.is_archived == False)

        # Row-level security
        if table and access:
            stmt = self._apply_row_security(stmt, table, access, user_id=user_id)

        # Apply filters
        if filters:
            stmt = self._apply_filters(stmt, filters)

        # Count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Sort
        stmt = self._apply_sorts(stmt, sorts)

        # Paginate
        stmt = stmt.limit(limit).offset(offset)

        result = await self.db.execute(stmt)
        records = list(result.scalars().all())

        return records, total

    async def update_record(
        self,
        record_id: str,
        values: dict[str, Any] | None = None,
        owner_id: str | None = None,
    ) -> CRMRecord | None:
        """Update a record's values."""
        record = await self.get_record(record_id)
        if not record:
            return None

        old_values = record.values.copy()

        if values is not None:
            new_values = {**record.values, **values}
            record.values = new_values

            # Recompute display name
            table = record.object
            if table:
                record.display_name = self._compute_display_name(table, new_values)

        if owner_id is not None:
            record.owner_id = owner_id

        await self.db.flush()
        await self.db.refresh(record)

        # Return changes for callers that need them (events, activity logging)
        changes = []
        if values:
            for key, new_val in values.items():
                old_val = old_values.get(key)
                if old_val != new_val:
                    changes.append({"field": key, "old": old_val, "new": new_val})

        # Attach changes as transient attribute for caller inspection
        record._changes = changes  # type: ignore[attr-defined]
        return record

    async def delete_record(
        self,
        record_id: str,
        permanent: bool = False,
    ) -> bool:
        """Delete or archive a record."""
        record = await self.get_record(record_id)
        if not record:
            return False

        if permanent:
            table = await self.get_table(record.object_id)
            if table:
                table.record_count = max(0, table.record_count - 1)
            await self.db.delete(record)
        else:
            record.is_archived = True
            record.archived_at = datetime.now(timezone.utc)

        await self.db.flush()
        return True

    async def bulk_delete_records(
        self,
        record_ids: list[str],
        permanent: bool = False,
        table_id: str | None = None,
        max_batch: int = 100,
    ) -> int:
        """Bulk delete records. Validates table ownership if table_id provided."""
        if len(record_ids) > max_batch:
            raise ValueError(f"Bulk delete limited to {max_batch} records at a time")

        # If table_id given, validate all records belong to it in one query
        if table_id:
            stmt = select(CRMRecord.id).where(
                CRMRecord.id.in_(record_ids),
                CRMRecord.object_id == table_id,
            )
            result = await self.db.execute(stmt)
            valid_ids = {str(row[0]) for row in result.all()}
            record_ids = [rid for rid in record_ids if rid in valid_ids]

        deleted = 0
        for record_id in record_ids:
            if await self.delete_record(record_id, permanent):
                deleted += 1
        return deleted

    # -------------------------------------------------------------------------
    # VIEW CRUD
    # -------------------------------------------------------------------------

    async def create_view(
        self,
        table_id: str,
        workspace_id: str,
        name: str,
        view_type: str = "table",
        filters: list[dict] | None = None,
        sorts: list[dict] | None = None,
        visible_attributes: list[str] | None = None,
        column_config: list[dict] | None = None,
        group_by_attribute: str | None = None,
        kanban_settings: dict | None = None,
        is_private: bool = False,
        owner_id: str | None = None,
    ) -> CRMList:
        """Create a saved view on a table."""
        base_slug = _generate_slug(name)
        slug = base_slug
        counter = 1
        while True:
            existing = await self.db.execute(
                select(CRMList).where(
                    CRMList.workspace_id == workspace_id,
                    CRMList.slug == slug,
                )
            )
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        view = CRMList(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=table_id,
            name=name,
            slug=slug,
            view_type=view_type,
            filters=filters or [],
            sorts=sorts or [],
            visible_attributes=visible_attributes or [],
            column_config=column_config or [],
            group_by_attribute=group_by_attribute,
            kanban_settings=kanban_settings or {},
            is_private=is_private,
            owner_id=owner_id,
        )
        self.db.add(view)
        await self.db.flush()
        await self.db.refresh(view)
        return view

    async def get_view(self, view_id: str, workspace_id: str | None = None) -> CRMList | None:
        """Get a single saved view by ID, optionally scoped to a workspace."""
        stmt = select(CRMList).where(CRMList.id == view_id)
        if workspace_id:
            stmt = stmt.where(CRMList.workspace_id == workspace_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    _VIEW_ALLOWED_FIELDS = {
        "name", "slug", "description", "icon", "color", "view_type",
        "filters", "sorts", "visible_attributes", "column_config",
        "group_by_attribute", "kanban_settings", "date_attribute",
        "end_date_attribute", "is_private",
    }

    async def update_view(self, view_id: str, workspace_id: str | None = None, **kwargs) -> CRMList | None:
        """Update a saved view with an explicit allowlist of mutable fields."""
        stmt = select(CRMList).where(CRMList.id == view_id)
        if workspace_id:
            stmt = stmt.where(CRMList.workspace_id == workspace_id)
        result = await self.db.execute(stmt)
        view = result.scalar_one_or_none()
        if not view:
            return None

        for key, value in kwargs.items():
            if key in self._VIEW_ALLOWED_FIELDS:
                setattr(view, key, value)

        await self.db.flush()
        await self.db.refresh(view)
        return view

    async def delete_view(self, view_id: str, workspace_id: str | None = None) -> bool:
        """Delete a saved view, optionally scoped to a workspace."""
        stmt = select(CRMList).where(CRMList.id == view_id)
        if workspace_id:
            stmt = stmt.where(CRMList.workspace_id == workspace_id)
        result = await self.db.execute(stmt)
        view = result.scalar_one_or_none()
        if not view:
            return False
        await self.db.delete(view)
        await self.db.flush()
        return True

    async def list_views(
        self,
        table_id: str,
        workspace_id: str,
        user_id: str | None = None,
    ) -> list[CRMList]:
        """List saved views for a table."""
        stmt = select(CRMList).where(
            CRMList.workspace_id == workspace_id,
            CRMList.object_id == table_id,
        )
        if user_id:
            stmt = stmt.where(
                or_(
                    CRMList.is_private == False,
                    CRMList.owner_id == user_id,
                )
            )
        stmt = stmt.order_by(CRMList.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # -------------------------------------------------------------------------
    # COLLABORATOR MANAGEMENT
    # -------------------------------------------------------------------------

    async def add_collaborator(
        self,
        table_id: str,
        permission: str = "view",
        developer_id: str | None = None,
        role_id: str | None = None,
        team_id: str | None = None,
        hidden_columns: list[str] | None = None,
        readonly_columns: list[str] | None = None,
        row_filter: list[dict] | None = None,
        created_by_id: str | None = None,
    ) -> TableCollaborator:
        """Add a collaborator to a table."""
        targets = sum(1 for x in [developer_id, role_id, team_id] if x is not None)
        if targets != 1:
            raise ValueError("Exactly one of developer_id, role_id, or team_id must be set")

        collab = TableCollaborator(
            id=str(uuid4()),
            table_id=table_id,
            developer_id=developer_id,
            role_id=role_id,
            team_id=team_id,
            permission=permission,
            hidden_columns=hidden_columns or [],
            readonly_columns=readonly_columns or [],
            row_filter=row_filter,
            created_by_id=created_by_id,
        )
        self.db.add(collab)
        await self.db.flush()
        await self.db.refresh(collab)
        return collab

    async def update_collaborator(
        self,
        collaborator_id: str,
        permission: str | None = None,
        hidden_columns: list[str] | None = None,
        readonly_columns: list[str] | None = None,
        row_filter: list[dict] | None = None,
    ) -> TableCollaborator | None:
        """Update a collaborator's permission/restrictions."""
        stmt = select(TableCollaborator).where(TableCollaborator.id == collaborator_id)
        result = await self.db.execute(stmt)
        collab = result.scalar_one_or_none()
        if not collab:
            return None

        if permission is not None:
            collab.permission = permission
        if hidden_columns is not None:
            collab.hidden_columns = hidden_columns
        if readonly_columns is not None:
            collab.readonly_columns = readonly_columns
        if row_filter is not None:
            collab.row_filter = row_filter

        await self.db.flush()
        await self.db.refresh(collab)
        return collab

    async def remove_collaborator(self, collaborator_id: str) -> bool:
        """Remove a collaborator."""
        stmt = select(TableCollaborator).where(TableCollaborator.id == collaborator_id)
        result = await self.db.execute(stmt)
        collab = result.scalar_one_or_none()
        if not collab:
            return False
        await self.db.delete(collab)
        await self.db.flush()
        return True

    async def list_collaborators(self, table_id: str) -> list[TableCollaborator]:
        """List all collaborators on a table."""
        stmt = (
            select(TableCollaborator)
            .where(TableCollaborator.table_id == table_id)
            .order_by(TableCollaborator.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # -------------------------------------------------------------------------
    # INTERNAL HELPERS
    # -------------------------------------------------------------------------

    def _compute_display_name(
        self, table: CRMObject, values: dict[str, Any],
    ) -> str | None:
        """Compute display_name from the primary attribute or first text field."""
        if table.primary_attribute_id:
            for attr in (table.attributes or []):
                if attr.id == table.primary_attribute_id:
                    val = values.get(attr.slug, "")
                    return str(val)[:500] if val else None

        # Fallback: first text attribute with a value
        for attr in (table.attributes or []):
            if attr.attribute_type == CRMAttributeType.TEXT.value:
                val = values.get(attr.slug, "")
                if val:
                    return str(val)[:500]

        return None

    @staticmethod
    def _escape_like(value: str) -> str:
        """Escape special LIKE/ILIKE characters to prevent wildcard injection."""
        return str(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    def _apply_filters(self, stmt, filters: list[dict]):
        """Apply JSONB filter conditions to a query."""
        for f in filters:
            attr = f.get("attribute")
            op = f.get("operator")
            value = f.get("value")

            if not attr or not op:
                continue

            if op == "equals":
                stmt = stmt.where(CRMRecord.values[attr].astext == str(value))
            elif op == "not_equals":
                stmt = stmt.where(CRMRecord.values[attr].astext != str(value))
            elif op == "contains":
                escaped = self._escape_like(value)
                stmt = stmt.where(CRMRecord.values[attr].astext.ilike(f"%{escaped}%"))
            elif op == "not_contains":
                escaped = self._escape_like(value)
                stmt = stmt.where(~CRMRecord.values[attr].astext.ilike(f"%{escaped}%"))
            elif op == "starts_with":
                escaped = self._escape_like(value)
                stmt = stmt.where(CRMRecord.values[attr].astext.ilike(f"{escaped}%"))
            elif op == "ends_with":
                escaped = self._escape_like(value)
                stmt = stmt.where(CRMRecord.values[attr].astext.ilike(f"%{escaped}"))
            elif op == "gt":
                stmt = stmt.where(
                    cast(CRMRecord.values[attr].astext, Numeric) > float(value)
                )
            elif op == "gte":
                stmt = stmt.where(
                    cast(CRMRecord.values[attr].astext, Numeric) >= float(value)
                )
            elif op == "lt":
                stmt = stmt.where(
                    cast(CRMRecord.values[attr].astext, Numeric) < float(value)
                )
            elif op == "lte":
                stmt = stmt.where(
                    cast(CRMRecord.values[attr].astext, Numeric) <= float(value)
                )
            elif op == "is_empty":
                stmt = stmt.where(
                    or_(
                        CRMRecord.values[attr].is_(None),
                        CRMRecord.values[attr].astext == "",
                    )
                )
            elif op == "is_not_empty":
                stmt = stmt.where(
                    and_(
                        CRMRecord.values[attr].isnot(None),
                        CRMRecord.values[attr].astext != "",
                    )
                )
            elif op == "in":
                if isinstance(value, list):
                    stmt = stmt.where(
                        CRMRecord.values[attr].astext.in_([str(v) for v in value])
                    )
            elif op == "not_in":
                if isinstance(value, list):
                    stmt = stmt.where(
                        ~CRMRecord.values[attr].astext.in_([str(v) for v in value])
                    )

        return stmt

    def _apply_sorts(self, stmt, sorts: list[dict] | None):
        """Apply sort conditions to a query."""
        if sorts:
            for s in sorts:
                attr = s.get("attribute")
                direction = s.get("direction", "asc")
                if not attr:
                    continue

                if attr == "created_at":
                    col = CRMRecord.created_at
                elif attr == "updated_at":
                    col = CRMRecord.updated_at
                elif attr == "display_name":
                    col = CRMRecord.display_name
                else:
                    col = CRMRecord.values[attr]

                stmt = stmt.order_by(col.desc() if direction == "desc" else col.asc())
        else:
            stmt = stmt.order_by(CRMRecord.created_at.desc())

        return stmt

    def _apply_row_security(
        self, stmt, table: CRMObject, access: TableAccess,
        user_id: str | None = None,
    ):
        """Apply row-level security filters based on table config and access."""
        mode = table.row_access_mode

        if mode == "owner_only" and user_id:
            # Only show records owned by or created by this user
            # Admins bypass this filter
            if not access.can("admin"):
                stmt = stmt.where(
                    or_(
                        CRMRecord.owner_id == user_id,
                        CRMRecord.created_by_id == user_id,
                    )
                )
        elif mode == "rule_based" and access.row_filter:
            stmt = self._apply_filters(stmt, access.row_filter)

        return stmt

