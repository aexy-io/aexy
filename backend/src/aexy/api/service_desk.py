"""Bimaplan Service Desk API — master data + ticket listing/manual logging.

Mounted with ``require_app_access("service_desk")``. Email intake does NOT go
through this router — it is driven by the inbound webhook / Gmail sync hooks
(see services/service_desk_intake_service.py).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.service_desk import (
    InsurerCreate,
    InsurerResponse,
    InsurerUpdate,
    LOBCreate,
    LOBResponse,
    MailboxCreate,
    MailboxResponse,
    ConvertToTaskRequest,
    ConvertToTaskResponse,
    MailboxUpdate,
    ManualTicketCreate,
    PartnerCreate,
    PartnerResponse,
    PartnerUpdate,
    PendingWithUpdate,
    ServiceDeskDashboard,
    ServiceDeskSettings,
    ServiceDeskSettingsUpdate,
    ServiceDeskTemplate,
    ServiceDeskTemplateUpdate,
    ServiceDeskTicketDetail,
    ServiceDeskTicketResponse,
    TicketFieldsUpdate,
)
from aexy.services.service_desk_service import ServiceDeskService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

router = APIRouter(prefix="/workspaces/{workspace_id}/service-desk", tags=["Service Desk"])


async def require_manage(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
) -> Developer:
    """Gate mutations on ``can_manage_service_desk``.

    Router-level guards only establish app-enablement and workspace membership,
    so without this any member — a viewer included — could rewrite the master
    data that drives auto-assignment, flip the AI toggle, or edit the
    customer-facing email templates.
    """
    from aexy.services.permission_service import PermissionService

    if not await PermissionService(db).check_permission(
        workspace_id, str(current.id), "can_manage_service_desk"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage the service desk",
        )
    return current


# ------------------------------------------------------------------ settings

@router.get("/settings", response_model=ServiceDeskSettings)
async def get_settings(workspace_id: str, db: AsyncSession = Depends(get_db), current: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).get_settings(workspace_id, developer_id=current.id)


@router.patch("/settings", response_model=ServiceDeskSettings)
async def update_settings(workspace_id: str, data: ServiceDeskSettingsUpdate, db: AsyncSession = Depends(get_db), current: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_settings(
        workspace_id,
        ai_classification_enabled=data.ai_classification_enabled,
        working_hours_start=data.working_hours_start,
        working_hours_end=data.working_hours_end,
        developer_id=str(current.id),
    )


@router.get("/templates", response_model=list[ServiceDeskTemplate])
async def list_templates(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    from aexy.services.service_desk_templates import list_sd_templates

    return await list_sd_templates(db, workspace_id)


@router.patch("/templates/{key}", response_model=ServiceDeskTemplate)
async def update_template(
    workspace_id: str,
    key: str,
    data: ServiceDeskTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(require_manage),
):
    from aexy.services.service_desk_templates import upsert_sd_template

    try:
        return await upsert_sd_template(db, workspace_id, key, data.subject, data.body, current.id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown template")


# ------------------------------------------------------------------ partners

@router.get("/partners", response_model=list[PartnerResponse])
async def list_partners(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_partners(workspace_id)


@router.post("/partners", response_model=PartnerResponse, status_code=status.HTTP_201_CREATED)
async def create_partner(workspace_id: str, data: PartnerCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_partner(workspace_id, data)


@router.patch("/partners/{partner_id}", response_model=PartnerResponse)
async def update_partner(workspace_id: str, partner_id: str, data: PartnerUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_partner(workspace_id, partner_id, data)


@router.delete("/partners/{partner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_partner(workspace_id: str, partner_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_partner(workspace_id, partner_id)


# ------------------------------------------------------------------ insurers

@router.get("/insurers", response_model=list[InsurerResponse])
async def list_insurers(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_insurers(workspace_id)


@router.post("/insurers", response_model=InsurerResponse, status_code=status.HTTP_201_CREATED)
async def create_insurer(workspace_id: str, data: InsurerCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_insurer(workspace_id, data)


@router.patch("/insurers/{insurer_id}", response_model=InsurerResponse)
async def update_insurer(workspace_id: str, insurer_id: str, data: InsurerUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_insurer(workspace_id, insurer_id, data)


@router.delete("/insurers/{insurer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_insurer(workspace_id: str, insurer_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_insurer(workspace_id, insurer_id)


# ------------------------------------------------------------------ LOBs

@router.get("/lobs", response_model=list[LOBResponse])
async def list_lobs(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_lobs(workspace_id)


@router.post("/lobs", response_model=LOBResponse, status_code=status.HTTP_201_CREATED)
async def create_lob(workspace_id: str, data: LOBCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_lob(workspace_id, data)


@router.delete("/lobs/{lob_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lob(workspace_id: str, lob_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_lob(workspace_id, lob_id)


# ------------------------------------------------------------------ mailboxes

@router.get("/mailboxes", response_model=list[MailboxResponse])
async def list_mailboxes(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_mailboxes(workspace_id)


@router.post("/mailboxes", response_model=MailboxResponse, status_code=status.HTTP_201_CREATED)
async def create_mailbox(workspace_id: str, data: MailboxCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_mailbox(workspace_id, data)


@router.patch("/mailboxes/{mailbox_id}", response_model=MailboxResponse)
async def update_mailbox(workspace_id: str, mailbox_id: str, data: MailboxUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_mailbox(workspace_id, mailbox_id, data)


@router.delete("/mailboxes/{mailbox_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mailbox(workspace_id: str, mailbox_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_mailbox(workspace_id, mailbox_id)


# ------------------------------------------------------------------ tickets

@router.get("/dashboard", response_model=ServiceDeskDashboard)
async def get_dashboard(workspace_id: str, db: AsyncSession = Depends(get_db), current: Developer = Depends(get_current_developer)):
    return await ServiceDeskTicketService(db).get_dashboard(workspace_id, developer_id=current.id)


@router.get("/tickets", response_model=list[ServiceDeskTicketResponse])
async def list_tickets(workspace_id: str, db: AsyncSession = Depends(get_db), current: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_tickets(workspace_id, developer_id=current.id)


@router.post("/tickets/manual", status_code=status.HTTP_201_CREATED)
async def create_manual_ticket(workspace_id: str, data: ManualTicketCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    ticket_id = await ServiceDeskService(db).create_manual_ticket(workspace_id, data)
    return {"ticket_id": ticket_id}


@router.get("/tickets/{ticket_id}", response_model=ServiceDeskTicketDetail)
async def get_ticket(workspace_id: str, ticket_id: str, db: AsyncSession = Depends(get_db), current: Developer = Depends(get_current_developer)):
    return await ServiceDeskTicketService(db).get_detail(
        workspace_id, ticket_id, scope_developer_id=current.id
    )


@router.patch("/tickets/{ticket_id}/pending-with", response_model=ServiceDeskTicketDetail)
async def change_pending_with(
    workspace_id: str,
    ticket_id: str,
    data: PendingWithUpdate,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    return await ServiceDeskTicketService(db).change_pending_with(
        workspace_id,
        ticket_id,
        data.pending_with,
        changed_by_id=current.id,
        note=data.note,
        scope_developer_id=current.id,
    )


@router.post("/tickets/{ticket_id}/convert-to-task", response_model=ConvertToTaskResponse)
async def convert_to_task(
    workspace_id: str,
    ticket_id: str,
    data: ConvertToTaskRequest,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    return await ServiceDeskTicketService(db).convert_to_task(
        workspace_id,
        ticket_id,
        data.project_id,
        data.sprint_id,
        data.title,
        data.priority,
        scope_developer_id=current.id,
    )


@router.patch("/tickets/{ticket_id}", response_model=ServiceDeskTicketDetail)
async def update_ticket_fields(
    workspace_id: str,
    ticket_id: str,
    data: TicketFieldsUpdate,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    return await ServiceDeskTicketService(db).update_fields(
        workspace_id, ticket_id, data, scope_developer_id=current.id
    )
