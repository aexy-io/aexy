"""Public API endpoints for shared table access (Phase 5)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.services.table_audit_service import TableShareService
from aexy.services.data_table_service import DataTableService

router = APIRouter(prefix="/public/tables")


@router.get("/{token}")
async def get_shared_table(
    token: str,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get a shared table's schema and records via share link."""
    share_svc = TableShareService(db)
    link = await share_svc.get_by_token(token)
    if not link:
        raise HTTPException(404, "Share link not found or expired")

    # Check password if required
    if link.password_hash:
        if not password or not await share_svc.verify_password(link, password):
            raise HTTPException(403, "Password required")

    # Increment usage
    await share_svc.increment_usage(link.id)

    dts = DataTableService(db)
    table = await dts.get_table(link.table_id)
    if not table:
        raise HTTPException(404, "Table not found")

    # Get fields (excluding hidden columns)
    fields = []
    for attr in (table.attributes or []):
        if attr.slug not in (link.hidden_columns or []):
            fields.append({
                "id": attr.id,
                "name": attr.name,
                "slug": attr.slug,
                "attribute_type": attr.attribute_type,
                "options": attr.config,
                "display_order": attr.position,
            })

    return {
        "id": table.id,
        "name": table.name,
        "description": table.description,
        "icon": table.icon,
        "color": table.color,
        "fields": fields,
        "permission": link.permission,
    }


@router.get("/{token}/records")
async def get_shared_records(
    token: str,
    password: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated records from a shared table."""
    share_svc = TableShareService(db)
    link = await share_svc.get_by_token(token)
    if not link:
        raise HTTPException(404, "Share link not found or expired")

    if link.password_hash:
        if not password or not await share_svc.verify_password(link, password):
            raise HTTPException(403, "Password required")

    dts = DataTableService(db)
    table = await dts.get_table(link.table_id)
    if not table:
        raise HTTPException(404, "Table not found")

    records, total = await dts.list_records(
        table_id=link.table_id,
        workspace_id=str(table.workspace_id),
        offset=skip,
        limit=limit,
        filters=link.row_filter.get("filters", []) if link.row_filter else None,
    )

    # Strip hidden columns
    hidden = set(link.hidden_columns or [])
    cleaned = []
    for r in records:
        cleaned.append({
            "id": r.id,
            "values": {k: v for k, v in r.values.items() if k not in hidden},
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {"records": cleaned, "total": total}


@router.post("/{token}/records")
async def create_shared_record(
    token: str,
    request: Request,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Create a record via edit-enabled share link."""
    share_svc = TableShareService(db)
    link = await share_svc.get_by_token(token)
    if not link:
        raise HTTPException(404, "Share link not found or expired")

    if link.permission != "edit":
        raise HTTPException(403, "This share link is view-only")

    if link.password_hash:
        if not password or not await share_svc.verify_password(link, password):
            raise HTTPException(403, "Password required")

    body = await request.json()
    values = body.get("values", {})

    # Strip hidden columns from input
    hidden = set(link.hidden_columns or [])
    values = {k: v for k, v in values.items() if k not in hidden}

    dts = DataTableService(db)
    table = await dts.get_table(link.table_id)
    if not table:
        raise HTTPException(404, "Table not found")

    record = await dts.create_record(
        table_id=link.table_id,
        workspace_id=str(table.workspace_id),
        values=values,
    )

    await share_svc.increment_usage(link.id)
    await db.commit()

    return {
        "id": record.id,
        "values": {k: v for k, v in record.values.items() if k not in hidden},
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }
