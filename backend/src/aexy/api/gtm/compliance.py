"""GTM Compliance API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    RecordConsentRequest,
    ConsentStatusResponse,
    SendPermissionCheck,
    AddSuppressionRequest,
    SuppressionListResponse,
    ComplianceAuditListResponse,
    ErasureRequest,
    UnsubscribeRequest,
)
from aexy.services.gtm_compliance_service import GTMComplianceService

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/compliance/check", response_model=SendPermissionCheck)
async def check_send_permission(
    workspace_id: str,
    email: str = Query(...),
    record_id: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Check if we're allowed to send to this contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    result = await service.check_send_permission(workspace_id, email, record_id=record_id)
    return result


@router.post("/compliance/consent", response_model=ConsentStatusResponse, status_code=201)
async def record_consent(
    workspace_id: str,
    data: RecordConsentRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Record consent for a contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    await service.record_consent(
        workspace_id=workspace_id,
        email=data.email,
        consent_type=data.consent_type.value,
        source=data.consent_source,
        jurisdiction=data.jurisdiction.value,
        record_id=data.record_id,
    )
    await db.commit()
    return await service.get_consent_status(workspace_id, data.email)


@router.get("/compliance/consent/{email}", response_model=ConsentStatusResponse)
async def get_consent_status(
    workspace_id: str,
    email: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get consent status for a contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    return await service.get_consent_status(workspace_id, email)


@router.delete("/compliance/consent/{email}")
async def revoke_consent(
    workspace_id: str,
    email: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoke consent for a contact."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    revoked = await service.revoke_consent(workspace_id, email)
    if not revoked:
        raise HTTPException(status_code=404, detail="No active consent found for this email")
    await db.commit()
    return {"success": True}


@router.get("/compliance/suppression", response_model=SuppressionListResponse)
async def list_suppression(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List suppression list entries."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    entries, total = await service.list_suppression(workspace_id, page=page, per_page=per_page)
    return {
        "entries": [
            {
                "id": str(e.id),
                "email": e.email,
                "domain": e.domain,
                "reason": e.reason,
                "source": e.source,
                "added_at": e.added_at.isoformat() if e.added_at else None,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/compliance/suppression", status_code=201)
async def add_suppression(
    workspace_id: str,
    data: AddSuppressionRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add an email to the suppression list."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    entry = await service.add_to_suppression(
        workspace_id=workspace_id,
        email=data.email,
        reason=data.reason.value,
        source=data.source,
        added_by=str(current_user.id),
    )
    await db.commit()
    return {
        "id": str(entry.id),
        "email": entry.email,
        "domain": entry.domain,
        "reason": entry.reason,
        "source": entry.source,
    }


@router.delete("/compliance/suppression/{email}")
async def remove_suppression(
    workspace_id: str,
    email: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove an email from the suppression list."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    removed = await service.remove_from_suppression(workspace_id, email)
    if not removed:
        raise HTTPException(status_code=404, detail="Email not found on suppression list")
    await db.commit()
    return {"success": True}


@router.post("/compliance/unsubscribe")
async def process_unsubscribe(
    workspace_id: str,
    data: UnsubscribeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Process an unsubscribe: suppression + consent revocation."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    result = await service.process_unsubscribe(workspace_id, data.email)
    await db.commit()
    return result


@router.post("/compliance/erasure")
async def process_erasure(
    workspace_id: str,
    data: ErasureRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """GDPR right-to-erasure: delete all contact data."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    if not data.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erasure request must have confirm=true. This action is irreversible.",
        )

    service = GTMComplianceService(db)
    result = await service.process_erasure_request(workspace_id, data.email)
    await db.commit()
    return result


@router.get("/compliance/audit", response_model=ComplianceAuditListResponse)
async def list_audit_log(
    workspace_id: str,
    email: str | None = Query(default=None),
    action: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List compliance audit log entries."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMComplianceService(db)
    entries, total = await service.list_audit_log(
        workspace_id, email=email, action=action, page=page, per_page=per_page,
    )
    return {
        "entries": [
            {
                "id": str(e.id),
                "email": e.email,
                "action": e.action,
                "reason": e.reason,
                "jurisdiction": e.jurisdiction,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
