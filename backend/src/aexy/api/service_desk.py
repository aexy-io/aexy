"""Service Desk API — taxonomy, master data, ticket listing/manual logging.

Mounted with ``require_app_access("service_desk")``. Email intake does NOT go
through this router — it is driven by the inbound webhook / Gmail sync hooks
(see services/service_desk_intake_service.py).
"""

import asyncio
import logging
import re
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
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
    HumanSplitRequest,
    HumanSplitResponse,
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
    StakeholderEmailRequest,
    ServiceDeskTicketResponse,
    TicketFieldsUpdate,
)
from aexy.services.service_desk_service import ServiceDeskService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

logger = logging.getLogger(__name__)

# How long the manual-ticket response will wait on Temporal before giving up and
# sending the receipt itself. Generous for starting a workflow, short enough that
# an operator on a call does not notice it.
_RECEIPT_DISPATCH_TIMEOUT = 5.0

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
        ai_attachment_previews_enabled=data.ai_attachment_previews_enabled,
        public_ticket_links_enabled=data.public_ticket_links_enabled,
        auto_split_enabled=data.auto_split_enabled,
        working_hours_start=data.working_hours_start,
        working_hours_end=data.working_hours_end,
        ticket_prefix=data.ticket_prefix,
        timezone=data.timezone,
        breach_red_days=data.breach_red_days,
        breach_amber_days=data.breach_amber_days,
        digest_hours=data.digest_hours,
        intake_poll_minutes=data.intake_poll_minutes,
        terminology=data.terminology,
        desk_name=data.desk_name,
        test_sla=data.test_sla,
        clear_test_sla=data.clear_test_sla,
        desk_department_id=data.desk_department_id,
        ignored_senders=data.ignored_senders,
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
async def list_tickets(
    workspace_id: str,
    assigned_to_me: bool = False,
    limit: int | None = Query(default=None, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Tickets on this desk that the caller may see.

    `assigned_to_me` narrows to the caller's own queue — what the Home dashboard
    asks for. It is a filter within the caller's scope, not a way around it.
    """
    return await ServiceDeskService(db).list_tickets(
        workspace_id,
        developer_id=current.id,
        assigned_to=str(current.id) if assigned_to_me else None,
        limit=limit,
    )


@router.post("/tickets/manual", status_code=status.HTTP_201_CREATED)
async def create_manual_ticket(
    workspace_id: str,
    data: ManualTicketCreate,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Log a request that arrived by phone or WhatsApp.

    Somebody is on the line, so the response waits for nothing but the ticket
    itself: the requester's acknowledgement is an SMTP round trip and is handed
    to Temporal to send afterwards.
    """
    from aexy.services.service_desk_service import can_create_manual_ticket

    if not await can_create_manual_ticket(db, workspace_id, str(current.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a member of the desk's owning team or a Service Desk manager can log a manual ticket",
        )
    ticket_id = await ServiceDeskService(db).create_manual_ticket(workspace_id, data)
    await _queue_manual_ticket_receipt(ticket_id, background)
    return {"ticket_id": ticket_id}


async def _queue_manual_ticket_receipt(ticket_id: str, background: BackgroundTasks) -> None:
    """Hand the acknowledgement to Temporal, or send it in-process if it cannot.

    Named after the ticket and started with ``reject_duplicate_id``, so the
    requester cannot be acknowledged twice — the default policy only refuses a
    start while the first is still running, which would let a receipt that had
    already completed be sent again.

    The in-process fallback is for a deployment with no reachable Temporal, where
    a dropped receipt is worse than one that does not survive a restart. It keeps
    the request fast either way, which is the part the operator notices.
    """
    from temporalio.exceptions import WorkflowAlreadyStartedError

    from aexy.services.service_desk_intake_service import acknowledge_ticket_in_background
    from aexy.temporal.activities.service_desk import SendServiceDeskReceiptInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    try:
        # Bounded here as well as in `dispatch`, which carries its own default
        # deadline for the same reason. Not redundancy: that one is the infra
        # backstop for every caller, this one is the promise made to somebody
        # holding a phone, and it should not silently move when the shared
        # default is retuned for workers. Whichever is shorter wins, and the
        # fallback below is reached either way.
        await asyncio.wait_for(
            dispatch(
                "send_service_desk_receipt",
                SendServiceDeskReceiptInput(ticket_id=ticket_id),
                task_queue=TaskQueue.EMAIL,
                workflow_id=f"send_service_desk_receipt-{ticket_id}",
                reject_duplicate_id=True,
            ),
            timeout=_RECEIPT_DISPATCH_TIMEOUT,
        )
    except WorkflowAlreadyStartedError:
        logger.info("Service desk: receipt for %s already queued", ticket_id)
    except Exception as exc:  # noqa: BLE001 — a receipt must not fail the ticket
        # On a timeout the start may in fact have landed, so this can acknowledge
        # a requester twice. Deliberate: a duplicate receipt is an annoyance, a
        # request that never returns is an outage, and a dropped receipt is the
        # thing this whole path exists to prevent.
        logger.warning(
            "Service desk: Temporal unavailable for the receipt for %s, sending in-process (%s)",
            ticket_id,
            exc,
        )
        background.add_task(acknowledge_ticket_in_background, ticket_id)


@router.get("/tickets/{ticket_id}", response_model=ServiceDeskTicketDetail)
async def get_ticket(workspace_id: str, ticket_id: str, db: AsyncSession = Depends(get_db), current: Developer = Depends(get_current_developer)):
    return await ServiceDeskTicketService(db).get_detail(
        workspace_id, ticket_id, scope_developer_id=current.id
    )


@router.get("/tickets/{ticket_id}/attachments/{index}")
async def download_ticket_attachment(
    workspace_id: str,
    ticket_id: str,
    index: int,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Hand back one of the ticket's own attachments.

    The bytes are never stored — they are re-fetched from the message the file
    arrived on, so this needs the same connected mailbox that forwarding does.
    Visibility is the only gate: whoever may open the ticket may open its files.
    """
    filename, content_type, raw = await ServiceDeskTicketService(db).load_attachment(
        workspace_id, ticket_id, index, scope_developer_id=current.id
    )
    # Both forms: the plain one for clients that ignore RFC 5987, and the encoded
    # one so a name with spaces or Devanagari in it survives. Quotes and anything
    # outside printable ASCII go from the plain form — it sits inside a header —
    # and a name that was entirely non-ASCII would leave it empty, which some
    # clients read as "no name given" and answer with the last URL segment: `0`.
    ascii_fallback = re.sub(r'[^\x20-\x7e]', "_", filename).replace('"', "").strip()
    return Response(
        content=raw,
        media_type=content_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_fallback or "attachment"}"; '
                f"filename*=UTF-8''{quote(filename)}"
            ),
            # A ticket's file is one person's document, not something a shared
            # cache should keep a copy of.
            "Cache-Control": "private, no-store",
            # The content type came off an inbound MIME part, so it is chosen by
            # whoever emailed the desk. `Content-Disposition: attachment` already
            # stops the browser rendering a `text/html` "register" as a page on
            # our own origin; this stops it sniffing its way there anyway.
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/tickets/{ticket_id}/split", response_model=HumanSplitResponse)
async def split_detected_issues(
    workspace_id: str,
    ticket_id: str,
    data: HumanSplitRequest,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    return await ServiceDeskTicketService(db).split_detected_issues(
        workspace_id,
        ticket_id,
        data.issue_indexes,
        split_by_id=current.id,
        scope_developer_id=current.id,
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


@router.post("/tickets/{ticket_id}/email", response_model=ServiceDeskTicketDetail)
async def email_stakeholder(
    workspace_id: str,
    ticket_id: str,
    data: StakeholderEmailRequest,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Send a ticket email from the watched mailbox.

    Requires write authority on the ticket (``can_edit_ticket``): the assigned
    owner, a member of the non-default queue the ticket is currently with, or a
    Service Desk manager.
    """
    return await ServiceDeskTicketService(db).email_stakeholder(
        workspace_id,
        ticket_id,
        data.to,
        data.subject,
        data.body,
        sender_id=str(current.id),
        attachment_filenames=data.attachment_filenames,
        move_ticket=data.move_ticket,
        scope_developer_id=current.id,
        cc_emails=data.cc,
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
    service = ServiceDeskTicketService(db)
    detail = await service.update_fields(
        workspace_id, ticket_id, data, scope_developer_id=current.id
    )
    # Same ordering as the pending-with handler: commit first, then send. A
    # reassignment through this form now notifies the new owner, and telling them
    # a ticket is theirs before the change is durable is the failure this
    # sequence exists to prevent.
    await db.commit()
    await service.flush_notifications()
    return detail
