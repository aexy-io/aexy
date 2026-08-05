"""Service Desk API — taxonomy, master data, ticket listing/manual logging.

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
    ApplyIndustryTemplateRequest,
    ApplyIndustryTemplateResponse,
    IndustryTemplateResponse,
    RequestTypeCreate,
    RequestTypeResponse,
    RequestTypeUpdate,
    StakeholderCreate,
    StakeholderResponse,
    StakeholderUpdate,
    VendorCreate,
    VendorResponse,
    VendorUpdate,
    ProductCreate,
    ProductResponse,
    MailboxCreate,
    MailboxResponse,
    ConvertToTaskRequest,
    ConvertToTaskResponse,
    MailboxUpdate,
    ManualTicketCreate,
    AccountCreate,
    AccountResponse,
    AccountUpdate,
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
        ticket_prefix=data.ticket_prefix,
        timezone=data.timezone,
        breach_red_days=data.breach_red_days,
        breach_amber_days=data.breach_amber_days,
        digest_hours=data.digest_hours,
        terminology=data.terminology,
        desk_name=data.desk_name,
        desk_department_id=data.desk_department_id,
        developer_id=str(current.id),
    )


# ------------------------------------------------------- industry templates

@router.get("/industry-templates", response_model=list[IndustryTemplateResponse])
async def list_industry_templates(workspace_id: str, _: Developer = Depends(get_current_developer)):
    """The starting points a desk can be set up from.

    Static catalogue — no workspace data is read, so any member may list them
    (the picker is shown during first-run setup before anything is configured).
    """
    return ServiceDeskService.list_industry_templates()


@router.post("/industry-templates/apply", response_model=ApplyIndustryTemplateResponse)
async def apply_industry_template(
    workspace_id: str,
    data: ApplyIndustryTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(require_manage),
):
    return await ServiceDeskService(db).apply_industry_template(
        workspace_id,
        data.template_slug,
        apply_terminology=data.apply_terminology,
        create_departments=data.create_departments,
        developer_id=str(current.id),
    )


# ------------------------------------------------------------------ taxonomy

@router.get("/stakeholders", response_model=list[StakeholderResponse])
async def list_stakeholders(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    """Readable by any member: the ticket UI needs the labels to render at all."""
    return await ServiceDeskService(db).list_stakeholders(workspace_id)


@router.post("/stakeholders", response_model=StakeholderResponse, status_code=status.HTTP_201_CREATED)
async def create_stakeholder(workspace_id: str, data: StakeholderCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_stakeholder(workspace_id, data)


@router.patch("/stakeholders/{stakeholder_id}", response_model=StakeholderResponse)
async def update_stakeholder(workspace_id: str, stakeholder_id: str, data: StakeholderUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_stakeholder(workspace_id, stakeholder_id, data)


@router.delete("/stakeholders/{stakeholder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stakeholder(workspace_id: str, stakeholder_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_stakeholder(workspace_id, stakeholder_id)


@router.get("/request-types", response_model=list[RequestTypeResponse])
async def list_request_types(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_request_types(workspace_id)


@router.post("/request-types", response_model=RequestTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_request_type(workspace_id: str, data: RequestTypeCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_request_type(workspace_id, data)


@router.patch("/request-types/{request_type_id}", response_model=RequestTypeResponse)
async def update_request_type(workspace_id: str, request_type_id: str, data: RequestTypeUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_request_type(workspace_id, request_type_id, data)


@router.delete("/request-types/{request_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request_type(workspace_id: str, request_type_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_request_type(workspace_id, request_type_id)


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


# ------------------------------------------------------------------ accounts

@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_accounts(workspace_id)


@router.post("/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(workspace_id: str, data: AccountCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_account(workspace_id, data)


@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(workspace_id: str, account_id: str, data: AccountUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_account(workspace_id, account_id, data)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(workspace_id: str, account_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_account(workspace_id, account_id)


# ------------------------------------------------------------------ vendors

@router.get("/vendors", response_model=list[VendorResponse])
async def list_vendors(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_vendors(workspace_id)


@router.post("/vendors", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
async def create_vendor(workspace_id: str, data: VendorCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_vendor(workspace_id, data)


@router.patch("/vendors/{vendor_id}", response_model=VendorResponse)
async def update_vendor(workspace_id: str, vendor_id: str, data: VendorUpdate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).update_vendor(workspace_id, vendor_id, data)


@router.delete("/vendors/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(workspace_id: str, vendor_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_vendor(workspace_id, vendor_id)


# ------------------------------------------------------------------ products

@router.get("/products", response_model=list[ProductResponse])
async def list_products(workspace_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(get_current_developer)):
    return await ServiceDeskService(db).list_products(workspace_id)


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(workspace_id: str, data: ProductCreate, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    return await ServiceDeskService(db).create_product(workspace_id, data)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(workspace_id: str, product_id: str, db: AsyncSession = Depends(get_db), _: Developer = Depends(require_manage)):
    await ServiceDeskService(db).delete_product(workspace_id, product_id)


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
    service = ServiceDeskTicketService(db)
    detail = await service.change_pending_with(
        workspace_id,
        ticket_id,
        data.pending_with,
        changed_by_id=current.id,
        note=data.note,
        scope_developer_id=current.id,
    )
    # Commit before the closure email goes out. `get_db` would otherwise commit
    # only after this handler returns, so mail sent inside the service told the
    # requester their ticket was resolved before that was durable — the same
    # ordering the intake service already gets right.
    await db.commit()
    await service.flush_notifications()
    return detail


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
