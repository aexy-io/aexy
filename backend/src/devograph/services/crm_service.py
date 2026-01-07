"""CRM service for managing objects, records, lists, and activities."""

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.crm import (
    CRMObject,
    CRMAttribute,
    CRMRecord,
    CRMRecordRelation,
    CRMNote,
    CRMList,
    CRMListEntry,
    CRMActivity,
    CRMObjectType,
    CRMAttributeType,
)


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:100]


def generate_attribute_slug(name: str) -> str:
    """Generate an attribute slug (snake_case)."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return slug[:100]


class CRMObjectService:
    """Service for CRM object CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_object(
        self,
        workspace_id: str,
        name: str,
        plural_name: str,
        object_type: str = CRMObjectType.CUSTOM.value,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        settings: dict | None = None,
    ) -> CRMObject:
        """Create a new CRM object."""
        # Generate unique slug
        base_slug = generate_slug(name)
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

        obj = CRMObject(
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
            is_system=object_type != CRMObjectType.CUSTOM.value,
            is_active=True,
        )
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def get_object(self, object_id: str) -> CRMObject | None:
        """Get a CRM object by ID."""
        stmt = (
            select(CRMObject)
            .where(CRMObject.id == object_id)
            .options(selectinload(CRMObject.attributes))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_object_by_slug(
        self, workspace_id: str, slug: str
    ) -> CRMObject | None:
        """Get a CRM object by slug."""
        stmt = (
            select(CRMObject)
            .where(
                CRMObject.workspace_id == workspace_id,
                CRMObject.slug == slug,
            )
            .options(selectinload(CRMObject.attributes))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_objects(
        self,
        workspace_id: str,
        include_inactive: bool = False,
    ) -> list[CRMObject]:
        """List all CRM objects in a workspace."""
        stmt = (
            select(CRMObject)
            .where(CRMObject.workspace_id == workspace_id)
            .options(selectinload(CRMObject.attributes))
        )

        if not include_inactive:
            stmt = stmt.where(CRMObject.is_active == True)

        stmt = stmt.order_by(CRMObject.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_object(
        self,
        object_id: str,
        name: str | None = None,
        plural_name: str | None = None,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        primary_attribute_id: str | None = None,
        settings: dict | None = None,
        is_active: bool | None = None,
    ) -> CRMObject | None:
        """Update a CRM object."""
        obj = await self.get_object(object_id)
        if not obj:
            return None

        if name is not None:
            obj.name = name
        if plural_name is not None:
            obj.plural_name = plural_name
        if description is not None:
            obj.description = description
        if icon is not None:
            obj.icon = icon
        if color is not None:
            obj.color = color
        if primary_attribute_id is not None:
            obj.primary_attribute_id = primary_attribute_id
        if settings is not None:
            obj.settings = settings
        if is_active is not None:
            obj.is_active = is_active

        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def delete_object(self, object_id: str) -> bool:
        """Delete a CRM object (soft delete)."""
        obj = await self.get_object(object_id)
        if not obj:
            return False

        if obj.is_system:
            raise ValueError("Cannot delete system objects")

        obj.is_active = False
        await self.db.flush()
        return True

    async def seed_standard_objects(self, workspace_id: str) -> list[CRMObject]:
        """Seed standard CRM objects for a workspace."""
        objects = []

        # Companies
        company = await self.create_object(
            workspace_id=workspace_id,
            name="Company",
            plural_name="Companies",
            object_type=CRMObjectType.COMPANY.value,
            icon="building-2",
            color="#3B82F6",
            settings={"enableActivities": True, "enableNotes": True},
        )
        objects.append(company)

        # Create company attributes
        attr_service = CRMAttributeService(self.db)
        await attr_service.create_attribute(
            object_id=company.id,
            name="Name",
            attribute_type=CRMAttributeType.TEXT.value,
            is_required=True,
            is_system=True,
        )
        await attr_service.create_attribute(
            object_id=company.id,
            name="Website",
            attribute_type=CRMAttributeType.URL.value,
        )
        await attr_service.create_attribute(
            object_id=company.id,
            name="Industry",
            attribute_type=CRMAttributeType.SELECT.value,
            config={"options": [
                {"value": "technology", "label": "Technology"},
                {"value": "healthcare", "label": "Healthcare"},
                {"value": "finance", "label": "Finance"},
                {"value": "education", "label": "Education"},
                {"value": "media", "label": "Media & Entertainment"},
                {"value": "retail", "label": "Retail"},
                {"value": "other", "label": "Other"},
            ]},
        )
        await attr_service.create_attribute(
            object_id=company.id,
            name="Size",
            attribute_type=CRMAttributeType.SELECT.value,
            config={"options": [
                {"value": "1-10", "label": "1-10"},
                {"value": "11-50", "label": "11-50"},
                {"value": "51-200", "label": "51-200"},
                {"value": "201-500", "label": "201-500"},
                {"value": "501-1000", "label": "501-1000"},
                {"value": "1000+", "label": "1000+"},
            ]},
        )
        await attr_service.create_attribute(
            object_id=company.id,
            name="Description",
            attribute_type=CRMAttributeType.TEXTAREA.value,
        )

        # People
        person = await self.create_object(
            workspace_id=workspace_id,
            name="Person",
            plural_name="People",
            object_type=CRMObjectType.PERSON.value,
            icon="user",
            color="#10B981",
            settings={"enableActivities": True, "enableNotes": True},
        )
        objects.append(person)

        await attr_service.create_attribute(
            object_id=person.id,
            name="First Name",
            attribute_type=CRMAttributeType.TEXT.value,
            is_required=True,
            is_system=True,
        )
        await attr_service.create_attribute(
            object_id=person.id,
            name="Last Name",
            attribute_type=CRMAttributeType.TEXT.value,
        )
        await attr_service.create_attribute(
            object_id=person.id,
            name="Email",
            attribute_type=CRMAttributeType.EMAIL.value,
        )
        await attr_service.create_attribute(
            object_id=person.id,
            name="Phone",
            attribute_type=CRMAttributeType.PHONE.value,
        )
        await attr_service.create_attribute(
            object_id=person.id,
            name="Title",
            attribute_type=CRMAttributeType.TEXT.value,
        )
        await attr_service.create_attribute(
            object_id=person.id,
            name="Company",
            attribute_type=CRMAttributeType.RECORD_REFERENCE.value,
            config={"targetObjectId": company.id, "allowMultiple": False},
        )

        # Deals
        deal = await self.create_object(
            workspace_id=workspace_id,
            name="Deal",
            plural_name="Deals",
            object_type=CRMObjectType.DEAL.value,
            icon="handshake",
            color="#F59E0B",
            settings={"enableActivities": True, "enableNotes": True},
        )
        objects.append(deal)

        await attr_service.create_attribute(
            object_id=deal.id,
            name="Name",
            attribute_type=CRMAttributeType.TEXT.value,
            is_required=True,
            is_system=True,
        )
        await attr_service.create_attribute(
            object_id=deal.id,
            name="Value",
            attribute_type=CRMAttributeType.CURRENCY.value,
            config={"currencyCode": "USD"},
        )
        await attr_service.create_attribute(
            object_id=deal.id,
            name="Stage",
            attribute_type=CRMAttributeType.STATUS.value,
            config={"options": [
                {"value": "lead", "label": "Lead", "color": "#6B7280"},
                {"value": "qualified", "label": "Qualified", "color": "#3B82F6"},
                {"value": "proposal", "label": "Proposal", "color": "#F59E0B"},
                {"value": "negotiation", "label": "Negotiation", "color": "#8B5CF6"},
                {"value": "won", "label": "Won", "color": "#10B981"},
                {"value": "lost", "label": "Lost", "color": "#EF4444"},
            ]},
        )
        await attr_service.create_attribute(
            object_id=deal.id,
            name="Close Date",
            attribute_type=CRMAttributeType.DATE.value,
        )
        await attr_service.create_attribute(
            object_id=deal.id,
            name="Probability",
            attribute_type=CRMAttributeType.NUMBER.value,
            config={"min": 0, "max": 100, "format": "percentage"},
        )
        await attr_service.create_attribute(
            object_id=deal.id,
            name="Company",
            attribute_type=CRMAttributeType.RECORD_REFERENCE.value,
            config={"targetObjectId": company.id, "allowMultiple": False},
        )
        await attr_service.create_attribute(
            object_id=deal.id,
            name="Contacts",
            attribute_type=CRMAttributeType.RECORD_REFERENCE.value,
            config={"targetObjectId": person.id, "allowMultiple": True},
        )

        return objects


class CRMAttributeService:
    """Service for CRM attribute CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_attribute(
        self,
        object_id: str,
        name: str,
        attribute_type: str = CRMAttributeType.TEXT.value,
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
        """Create a new attribute."""
        # Generate slug if not provided
        if not slug:
            base_slug = generate_attribute_slug(name)
            slug = base_slug
            counter = 1

            while True:
                existing = await self.db.execute(
                    select(CRMAttribute).where(
                        CRMAttribute.object_id == object_id,
                        CRMAttribute.slug == slug,
                    )
                )
                if not existing.scalar_one_or_none():
                    break
                slug = f"{base_slug}_{counter}"
                counter += 1

        # Get position if not provided
        if position is None:
            result = await self.db.execute(
                select(func.max(CRMAttribute.position))
                .where(CRMAttribute.object_id == object_id)
            )
            max_pos = result.scalar() or 0
            position = max_pos + 1

        attr = CRMAttribute(
            id=str(uuid4()),
            object_id=object_id,
            name=name,
            slug=slug,
            description=description,
            attribute_type=attribute_type,
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

    async def get_attribute(self, attribute_id: str) -> CRMAttribute | None:
        """Get an attribute by ID."""
        stmt = select(CRMAttribute).where(CRMAttribute.id == attribute_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_attributes(self, object_id: str) -> list[CRMAttribute]:
        """List all attributes for an object."""
        stmt = (
            select(CRMAttribute)
            .where(CRMAttribute.object_id == object_id)
            .order_by(CRMAttribute.position)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_attribute(
        self,
        attribute_id: str,
        name: str | None = None,
        description: str | None = None,
        config: dict | None = None,
        is_required: bool | None = None,
        default_value: str | None = None,
        position: int | None = None,
        is_visible: bool | None = None,
        is_filterable: bool | None = None,
        is_sortable: bool | None = None,
        column_width: int | None = None,
    ) -> CRMAttribute | None:
        """Update an attribute."""
        attr = await self.get_attribute(attribute_id)
        if not attr:
            return None

        if name is not None:
            attr.name = name
        if description is not None:
            attr.description = description
        if config is not None:
            attr.config = config
        if is_required is not None:
            attr.is_required = is_required
        if default_value is not None:
            attr.default_value = default_value
        if position is not None:
            attr.position = position
        if is_visible is not None:
            attr.is_visible = is_visible
        if is_filterable is not None:
            attr.is_filterable = is_filterable
        if is_sortable is not None:
            attr.is_sortable = is_sortable
        if column_width is not None:
            attr.column_width = column_width

        await self.db.flush()
        await self.db.refresh(attr)
        return attr

    async def delete_attribute(self, attribute_id: str) -> bool:
        """Delete an attribute."""
        attr = await self.get_attribute(attribute_id)
        if not attr:
            return False

        if attr.is_system:
            raise ValueError("Cannot delete system attributes")

        await self.db.delete(attr)
        await self.db.flush()
        return True

    async def reorder_attributes(
        self, object_id: str, attribute_ids: list[str]
    ) -> list[CRMAttribute]:
        """Reorder attributes."""
        for position, attr_id in enumerate(attribute_ids):
            await self.db.execute(
                select(CRMAttribute)
                .where(
                    CRMAttribute.id == attr_id,
                    CRMAttribute.object_id == object_id,
                )
            )
            # Update position
            stmt = (
                select(CRMAttribute)
                .where(CRMAttribute.id == attr_id)
            )
            result = await self.db.execute(stmt)
            attr = result.scalar_one_or_none()
            if attr:
                attr.position = position

        await self.db.flush()
        return await self.list_attributes(object_id)


class CRMRecordService:
    """Service for CRM record CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_record(
        self,
        workspace_id: str,
        object_id: str,
        values: dict[str, Any],
        owner_id: str | None = None,
        created_by_id: str | None = None,
    ) -> CRMRecord:
        """Create a new record."""
        # Get object to compute display name
        obj_service = CRMObjectService(self.db)
        obj = await obj_service.get_object(object_id)
        if not obj:
            raise ValueError("Object not found")

        # Compute display name from primary attribute
        display_name = None
        if obj.primary_attribute_id:
            attr_service = CRMAttributeService(self.db)
            primary_attr = await attr_service.get_attribute(obj.primary_attribute_id)
            if primary_attr:
                display_name = str(values.get(primary_attr.slug, ""))[:500]

        # Fallback to first text value
        if not display_name:
            for attr in obj.attributes:
                if attr.attribute_type == CRMAttributeType.TEXT.value:
                    display_name = str(values.get(attr.slug, ""))[:500]
                    break

        record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=object_id,
            values=values,
            display_name=display_name,
            owner_id=owner_id,
            created_by_id=created_by_id,
            is_archived=False,
        )
        self.db.add(record)

        # Update object record count
        obj.record_count = obj.record_count + 1

        await self.db.flush()
        await self.db.refresh(record)

        # Log activity
        await self._log_activity(
            workspace_id=workspace_id,
            record_id=record.id,
            activity_type="record.created",
            actor_id=created_by_id,
            metadata={"values": values},
        )

        # Trigger CRM events (automations and webhooks)
        try:
            from devograph.services.crm_events import CRMEventService
            event_service = CRMEventService(self.db)
            await event_service.emit_record_created(
                workspace_id=workspace_id,
                object_id=object_id,
                record_id=record.id,
                values=values,
                created_by_id=created_by_id,
            )
        except Exception:
            # Don't fail record creation if event triggering fails
            pass

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
        workspace_id: str,
        object_id: str,
        filters: list[dict] | None = None,
        sorts: list[dict] | None = None,
        include_archived: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CRMRecord], int]:
        """List records with filtering and sorting."""
        stmt = (
            select(CRMRecord)
            .where(
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.object_id == object_id,
            )
        )

        if not include_archived:
            stmt = stmt.where(CRMRecord.is_archived == False)

        # Apply filters (basic implementation - can be extended)
        if filters:
            for f in filters:
                attr = f.get("attribute")
                op = f.get("operator")
                value = f.get("value")

                if attr and op:
                    # Use JSONB operators for filtering
                    if op == "equals":
                        stmt = stmt.where(
                            CRMRecord.values[attr].astext == str(value)
                        )
                    elif op == "not_equals":
                        stmt = stmt.where(
                            CRMRecord.values[attr].astext != str(value)
                        )
                    elif op == "contains":
                        stmt = stmt.where(
                            CRMRecord.values[attr].astext.ilike(f"%{value}%")
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

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Apply sorting
        if sorts:
            for s in sorts:
                attr = s.get("attribute")
                direction = s.get("direction", "asc")
                if attr:
                    if attr == "created_at":
                        if direction == "desc":
                            stmt = stmt.order_by(CRMRecord.created_at.desc())
                        else:
                            stmt = stmt.order_by(CRMRecord.created_at.asc())
                    elif attr == "updated_at":
                        if direction == "desc":
                            stmt = stmt.order_by(CRMRecord.updated_at.desc())
                        else:
                            stmt = stmt.order_by(CRMRecord.updated_at.asc())
                    else:
                        # Sort by JSONB field
                        if direction == "desc":
                            stmt = stmt.order_by(CRMRecord.values[attr].desc())
                        else:
                            stmt = stmt.order_by(CRMRecord.values[attr].asc())
        else:
            stmt = stmt.order_by(CRMRecord.created_at.desc())

        # Apply pagination
        stmt = stmt.limit(limit).offset(offset)

        result = await self.db.execute(stmt)
        records = list(result.scalars().all())

        return records, total

    async def update_record(
        self,
        record_id: str,
        values: dict[str, Any] | None = None,
        owner_id: str | None = None,
        updated_by_id: str | None = None,
    ) -> CRMRecord | None:
        """Update a record."""
        record = await self.get_record(record_id)
        if not record:
            return None

        old_values = record.values.copy()

        if values is not None:
            # Merge values
            new_values = {**record.values, **values}
            record.values = new_values

            # Update display name
            obj = record.object
            if obj and obj.primary_attribute_id:
                attr_service = CRMAttributeService(self.db)
                primary_attr = await attr_service.get_attribute(obj.primary_attribute_id)
                if primary_attr:
                    record.display_name = str(new_values.get(primary_attr.slug, ""))[:500]

        if owner_id is not None:
            record.owner_id = owner_id

        await self.db.flush()
        await self.db.refresh(record)

        # Log activity
        changes = []
        for key, new_val in (values or {}).items():
            old_val = old_values.get(key)
            if old_val != new_val:
                changes.append({"field": key, "old": old_val, "new": new_val})

        if changes:
            await self._log_activity(
                workspace_id=record.workspace_id,
                record_id=record.id,
                activity_type="record.updated",
                actor_id=updated_by_id,
                metadata={"changes": changes},
            )

            # Trigger CRM events (automations and webhooks)
            try:
                from devograph.services.crm_events import CRMEventService
                event_service = CRMEventService(self.db)
                await event_service.emit_record_updated(
                    workspace_id=record.workspace_id,
                    object_id=record.object_id,
                    record_id=record.id,
                    old_values=old_values,
                    new_values=record.values,
                    changes=changes,
                    updated_by_id=updated_by_id,
                )
            except Exception:
                # Don't fail record update if event triggering fails
                pass

        return record

    async def delete_record(
        self,
        record_id: str,
        permanent: bool = False,
        deleted_by_id: str | None = None,
    ) -> bool:
        """Delete a record (archive by default)."""
        record = await self.get_record(record_id)
        if not record:
            return False

        # Save record info for event triggering
        workspace_id = record.workspace_id
        object_id = record.object_id
        record_values = record.values.copy()

        if permanent:
            # Update object record count
            obj_service = CRMObjectService(self.db)
            obj = await obj_service.get_object(record.object_id)
            if obj:
                obj.record_count = max(0, obj.record_count - 1)

            await self.db.delete(record)
        else:
            record.is_archived = True
            record.archived_at = datetime.now(timezone.utc)

            await self._log_activity(
                workspace_id=record.workspace_id,
                record_id=record.id,
                activity_type="record.deleted",
                actor_id=deleted_by_id,
                metadata={"permanent": permanent},
            )

        await self.db.flush()

        # Trigger CRM events (automations and webhooks)
        try:
            from devograph.services.crm_events import CRMEventService
            event_service = CRMEventService(self.db)
            await event_service.emit_record_deleted(
                workspace_id=workspace_id,
                object_id=object_id,
                record_id=record_id,
                values=record_values,
                permanent=permanent,
                deleted_by_id=deleted_by_id,
            )
        except Exception:
            # Don't fail record deletion if event triggering fails
            pass

        return True

    async def bulk_create_records(
        self,
        workspace_id: str,
        object_id: str,
        records_data: list[dict],
        created_by_id: str | None = None,
    ) -> list[CRMRecord]:
        """Bulk create records."""
        records = []
        for data in records_data:
            record = await self.create_record(
                workspace_id=workspace_id,
                object_id=object_id,
                values=data.get("values", {}),
                owner_id=data.get("owner_id"),
                created_by_id=created_by_id,
            )
            records.append(record)
        return records

    async def bulk_update_records(
        self,
        record_ids: list[str],
        values: dict[str, Any],
        updated_by_id: str | None = None,
    ) -> int:
        """Bulk update records."""
        updated = 0
        for record_id in record_ids:
            record = await self.update_record(
                record_id=record_id,
                values=values,
                updated_by_id=updated_by_id,
            )
            if record:
                updated += 1
        return updated

    async def bulk_delete_records(
        self,
        record_ids: list[str],
        permanent: bool = False,
        deleted_by_id: str | None = None,
    ) -> int:
        """Bulk delete records."""
        deleted = 0
        for record_id in record_ids:
            if await self.delete_record(record_id, permanent, deleted_by_id):
                deleted += 1
        return deleted

    async def _log_activity(
        self,
        workspace_id: str,
        record_id: str,
        activity_type: str,
        actor_id: str | None = None,
        metadata: dict | None = None,
    ) -> CRMActivity:
        """Log an activity for a record."""
        activity = CRMActivity(
            id=str(uuid4()),
            workspace_id=workspace_id,
            record_id=record_id,
            activity_type=activity_type,
            actor_type="user" if actor_id else "system",
            actor_id=actor_id,
            metadata=metadata or {},
            occurred_at=datetime.now(timezone.utc),
        )
        self.db.add(activity)
        await self.db.flush()
        return activity


class CRMListService:
    """Service for CRM list operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_list(
        self,
        workspace_id: str,
        object_id: str,
        name: str,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        view_type: str = "table",
        filters: list[dict] | None = None,
        sorts: list[dict] | None = None,
        visible_attributes: list[str] | None = None,
        group_by_attribute: str | None = None,
        kanban_settings: dict | None = None,
        date_attribute: str | None = None,
        end_date_attribute: str | None = None,
        is_private: bool = False,
        owner_id: str | None = None,
    ) -> CRMList:
        """Create a new list."""
        # Generate unique slug
        base_slug = generate_slug(name)
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

        lst = CRMList(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=object_id,
            name=name,
            slug=slug,
            description=description,
            icon=icon,
            color=color,
            view_type=view_type,
            filters=filters or [],
            sorts=sorts or [],
            visible_attributes=visible_attributes or [],
            group_by_attribute=group_by_attribute,
            kanban_settings=kanban_settings or {},
            date_attribute=date_attribute,
            end_date_attribute=end_date_attribute,
            is_private=is_private,
            owner_id=owner_id,
        )
        self.db.add(lst)
        await self.db.flush()
        await self.db.refresh(lst)
        return lst

    async def get_list(self, list_id: str) -> CRMList | None:
        """Get a list by ID."""
        stmt = select(CRMList).where(CRMList.id == list_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_lists(
        self,
        workspace_id: str,
        object_id: str | None = None,
        include_private: bool = False,
        user_id: str | None = None,
    ) -> list[CRMList]:
        """List all lists in a workspace."""
        stmt = select(CRMList).where(CRMList.workspace_id == workspace_id)

        if object_id:
            stmt = stmt.where(CRMList.object_id == object_id)

        if not include_private:
            stmt = stmt.where(
                or_(
                    CRMList.is_private == False,
                    CRMList.owner_id == user_id,
                )
            )

        stmt = stmt.order_by(CRMList.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_list(
        self,
        list_id: str,
        **kwargs,
    ) -> CRMList | None:
        """Update a list."""
        lst = await self.get_list(list_id)
        if not lst:
            return None

        for key, value in kwargs.items():
            if value is not None and hasattr(lst, key):
                setattr(lst, key, value)

        await self.db.flush()
        await self.db.refresh(lst)
        return lst

    async def delete_list(self, list_id: str) -> bool:
        """Delete a list."""
        lst = await self.get_list(list_id)
        if not lst:
            return False

        await self.db.delete(lst)
        await self.db.flush()
        return True

    async def add_entry(
        self,
        list_id: str,
        record_id: str,
        position: int | None = None,
        list_values: dict | None = None,
        added_by_id: str | None = None,
    ) -> CRMListEntry:
        """Add a record to a list."""
        # Check if already in list
        existing = await self.db.execute(
            select(CRMListEntry).where(
                CRMListEntry.list_id == list_id,
                CRMListEntry.record_id == record_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Record is already in this list")

        # Get position if not provided
        if position is None:
            result = await self.db.execute(
                select(func.max(CRMListEntry.position))
                .where(CRMListEntry.list_id == list_id)
            )
            max_pos = result.scalar() or 0
            position = max_pos + 1

        entry = CRMListEntry(
            id=str(uuid4()),
            list_id=list_id,
            record_id=record_id,
            position=position,
            list_values=list_values or {},
            added_by_id=added_by_id,
        )
        self.db.add(entry)

        # Update list entry count
        lst = await self.get_list(list_id)
        if lst:
            lst.entry_count = lst.entry_count + 1

        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def remove_entry(self, list_id: str, record_id: str) -> bool:
        """Remove a record from a list."""
        stmt = delete(CRMListEntry).where(
            CRMListEntry.list_id == list_id,
            CRMListEntry.record_id == record_id,
        )
        result = await self.db.execute(stmt)

        if result.rowcount > 0:
            # Update list entry count
            lst = await self.get_list(list_id)
            if lst:
                lst.entry_count = max(0, lst.entry_count - 1)
            await self.db.flush()
            return True

        return False

    async def get_entries(
        self,
        list_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CRMListEntry], int]:
        """Get entries in a list."""
        # Get total count
        count_result = await self.db.execute(
            select(func.count(CRMListEntry.id))
            .where(CRMListEntry.list_id == list_id)
        )
        total = count_result.scalar() or 0

        # Get entries
        stmt = (
            select(CRMListEntry)
            .where(CRMListEntry.list_id == list_id)
            .order_by(CRMListEntry.position)
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        entries = list(result.scalars().all())

        return entries, total


class CRMNoteService:
    """Service for CRM notes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_note(
        self,
        record_id: str,
        content: str,
        author_id: str | None = None,
        is_pinned: bool = False,
    ) -> CRMNote:
        """Create a note on a record."""
        note = CRMNote(
            id=str(uuid4()),
            record_id=record_id,
            content=content,
            author_id=author_id,
            is_pinned=is_pinned,
        )
        self.db.add(note)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def get_note(self, note_id: str) -> CRMNote | None:
        """Get a note by ID."""
        stmt = (
            select(CRMNote)
            .where(CRMNote.id == note_id)
            .options(selectinload(CRMNote.author))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_notes(self, record_id: str) -> list[CRMNote]:
        """List all notes for a record."""
        stmt = (
            select(CRMNote)
            .where(CRMNote.record_id == record_id)
            .options(selectinload(CRMNote.author))
            .order_by(CRMNote.is_pinned.desc(), CRMNote.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_note(
        self,
        note_id: str,
        content: str | None = None,
        is_pinned: bool | None = None,
    ) -> CRMNote | None:
        """Update a note."""
        note = await self.get_note(note_id)
        if not note:
            return None

        if content is not None:
            note.content = content
        if is_pinned is not None:
            note.is_pinned = is_pinned

        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def delete_note(self, note_id: str) -> bool:
        """Delete a note."""
        note = await self.get_note(note_id)
        if not note:
            return False

        await self.db.delete(note)
        await self.db.flush()
        return True


class CRMActivityService:
    """Service for CRM activities."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_activities(
        self,
        record_id: str,
        activity_types: list[str] | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CRMActivity], int]:
        """List activities for a record."""
        stmt = select(CRMActivity).where(CRMActivity.record_id == record_id)

        if activity_types:
            stmt = stmt.where(CRMActivity.activity_type.in_(activity_types))

        # Get total count
        count_result = await self.db.execute(
            select(func.count(CRMActivity.id))
            .where(CRMActivity.record_id == record_id)
        )
        total = count_result.scalar() or 0

        # Get activities
        stmt = stmt.order_by(CRMActivity.occurred_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        activities = list(result.scalars().all())

        return activities, total

    async def create_activity(
        self,
        workspace_id: str,
        record_id: str,
        activity_type: str,
        title: str | None = None,
        description: str | None = None,
        actor_type: str = "user",
        actor_id: str | None = None,
        actor_name: str | None = None,
        metadata: dict | None = None,
        occurred_at: datetime | None = None,
    ) -> CRMActivity:
        """Create an activity."""
        activity = CRMActivity(
            id=str(uuid4()),
            workspace_id=workspace_id,
            record_id=record_id,
            activity_type=activity_type,
            title=title,
            description=description,
            actor_type=actor_type,
            actor_id=actor_id,
            actor_name=actor_name,
            metadata=metadata or {},
            occurred_at=occurred_at or datetime.now(timezone.utc),
        )
        self.db.add(activity)
        await self.db.flush()
        await self.db.refresh(activity)
        return activity
