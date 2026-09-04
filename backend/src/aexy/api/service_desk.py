"""Service Desk API — taxonomy, master data, ticket listing/manual logging.

Mounted with ``require_app_access("service_desk")``. Email intake does NOT go
through this router — it is driven by the inbound webhook / Gmail sync hooks
(see services/service_desk_intake_service.py).
"""

import asyncio
import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
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
    PublishToCommunityRequest,
    PublishTargetsResponse,
    TicketCommunityTopic,
    StakeholderEmailRequest,
    TicketAttachment,
    AIAccuracy,
    DigestPreview,
    ServiceDeskTicketResponse,
    TicketCount,
    ScorecardBandInput,
    ScorecardConfigResponse,
    ScorecardConfigUpdate,
    ScorecardKPIResponse,
    ScorecardPreviewRequest,
    TicketFilters,
    TicketFieldsUpdate,
)
from aexy.services.service_desk_digest_service import ServiceDeskDigestService
from aexy.services.service_desk_service import ServiceDeskService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from aexy.services.storage_service import content_disposition

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
        unmatched_assignment_value=data.unmatched_assignment,
        working_hours_start=data.working_hours_start,
        working_hours_end=data.working_hours_end,
        ticket_prefix=data.ticket_prefix,
        timezone=data.timezone,
        breach_red_days=data.breach_red_days,
        breach_amber_days=data.breach_amber_days,
        digest_hours=data.digest_hours,
        digest_enabled_value=data.digest_enabled,
        digest_excluded_recipients=data.digest_excluded_recipients,
        digest_extra_recipients=data.digest_extra_recipients,
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
async def get_dashboard(
    workspace_id: str,
    limit: int | None = Query(default=None, ge=1, le=200),
    offset: int | None = Query(default=None, ge=0),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """The queue board, and one page of the tickets behind it.

    `limit`/`offset` page the ticket list only; the stakeholder matrix and the
    open/breaching counts are over everything open. Omitting them returns the
    whole list, which is what the CSV export needs.
    """
    return await ServiceDeskTicketService(db).get_dashboard(
        workspace_id, developer_id=current.id, limit=limit, offset=offset
    )


@router.get("/tickets", response_model=list[ServiceDeskTicketResponse])
async def list_tickets(
    workspace_id: str,
    assigned_to_me: bool = False,
    limit: int | None = Query(default=None, ge=1, le=200),
    offset: int | None = Query(default=None, ge=0),
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Tickets on this desk that the caller may see.

    `assigned_to_me` narrows to the caller's own queue — what the Home dashboard
    asks for. It is a filter within the caller's scope, not a way around it, and
    so is everything in `filters`: the visibility clause is applied first and
    independently, so naming another owner or account cannot widen what comes
    back.
    """
    return await ServiceDeskService(db).list_tickets(
        workspace_id,
        developer_id=current.id,
        assigned_to=str(current.id) if assigned_to_me else None,
        limit=limit,
        offset=offset,
        filters=filters,
    )


# Registered before `/tickets/{ticket_id}`: FastAPI matches in declaration order,
# and a literal path declared after a parameterised one is never reached — the
# request arrives as a lookup for a ticket called "count".
@router.get("/report-options")
async def get_report_options(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """What this desk can group by and measure, in its own vocabulary.

    Served rather than hardcoded in the client so a workspace that calls its
    accounts "Partners" gets a picker that says Partners.
    """
    from aexy.services.service_desk_analytics import report_options

    return await report_options(db, workspace_id)


@router.get("/analytics")
async def get_analytics(
    workspace_id: str,
    dimension: str = Query(..., description="What to group by"),
    measure: str = Query(..., description="What to compute per group"),
    limit: int = Query(default=50, ge=1, le=200),
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """One grouped figure per dimension value, in the caller's own scope.

    Takes the same filters as the ticket list, so a chart and the rows behind it
    are the same question asked two ways.
    """
    from aexy.services.service_desk_analytics import ServiceDeskAnalytics

    return await ServiceDeskAnalytics(db).aggregate(
        workspace_id,
        dimension=dimension,
        measure=measure,
        developer_id=str(current.id),
        filters=filters,
        limit=limit,
    )


@router.get("/reports/tat")
async def get_tat_report(
    workspace_id: str,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """One row per ticket, with the pending ledger unfolded per stakeholder.

    Returns column *descriptors* alongside the rows because the stakeholder
    columns come from this workspace's taxonomy — a client holding its own
    column list would be right for one desk and wrong for every other.

    Same scope and same filters as the ticket list: this is the desk's own work,
    counted, not a wider read with a report label on it.
    """
    from aexy.services.service_desk_reporting import ServiceDeskReporting

    return await ServiceDeskReporting(db).tat_report(
        workspace_id, developer_id=str(current.id), filters=filters
    )


@router.get("/reports/tat/export")
async def export_tat_report(
    workspace_id: str,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """The TAT report as CSV — the screen, in a file."""
    from aexy.services.service_desk_reporting import ServiceDeskReporting

    csv_text, filename = await ServiceDeskReporting(db).export_tat_csv(
        workspace_id, developer_id=str(current.id), filters=filters
    )
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _scorecard_restriction(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> str | None:
    """None if the caller may see the whole desk, else their own developer id.

    A scorecard grades named colleagues, so it is not a ticket list and
    ``resolve_scope_clause`` does not answer the question. Anyone with full desk
    visibility sees every owner; everyone else sees exactly their own row.

    They are not simply denied, because an owner has a legitimate interest in
    their own rating — and the restriction narrows the rows *returned*, never the
    tickets the figures are computed from. Productivity is a ratio against the
    desk average; computed over a cohort of one it would divide a number by
    itself and read 100 forever, which is a wrong number wearing a restricted
    view's clothes.
    """
    from aexy.services.service_desk_service import has_full_service_desk_view

    if await has_full_service_desk_view(db, workspace_id, developer_id):
        return None
    return developer_id


@router.get("/reports/scorecard")
async def get_scorecard(
    workspace_id: str,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Weighted KPI scores and a rating per owner.

    A manager gets every owner. Anyone else gets their own row only, with every
    cohort figure still measured across the whole desk — see
    ``_scorecard_restriction``.
    """
    from aexy.services.service_desk_scorecard import ServiceDeskScorecard

    developer_id = str(current.id)
    return await ServiceDeskScorecard(db).scorecard(
        workspace_id,
        viewer_id=developer_id,
        restrict_to_owner_id=await _scorecard_restriction(db, workspace_id, developer_id),
        filters=filters,
    )


@router.get("/reports/scorecard/export")
async def export_scorecard(
    workspace_id: str,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """The scorecard as CSV, under the same restriction as the screen."""
    from aexy.services.service_desk_scorecard import ServiceDeskScorecard

    developer_id = str(current.id)
    csv_text, filename = await ServiceDeskScorecard(db).export_csv(
        workspace_id,
        viewer_id=developer_id,
        restrict_to_owner_id=await _scorecard_restriction(db, workspace_id, developer_id),
        filters=filters,
    )
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/scorecard/vocabulary")
async def get_scorecard_vocabulary(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(require_manage),
):
    """What a custom KPI may be built out of, in this desk's own nouns.

    Served rather than compiled into the client for the same reason the TAT
    report's columns are: adding a Legal bucket adds "Time in Legal" with no
    frontend release, and a desk that renames its nouns sees its own words.

    Manager-only — it is the builder's palette, and only a manager can build.
    """
    from aexy.services.service_desk_clock import load_clock
    from aexy.services.service_desk_formula import vocabulary
    from aexy.services.service_desk_taxonomy import load_taxonomy

    return vocabulary(
        await load_taxonomy(db, workspace_id, seed=False),
        await load_clock(db, workspace_id),
    )


@router.post("/reports/scorecard/preview")
async def preview_scorecard(
    workspace_id: str,
    data: ScorecardPreviewRequest,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(require_manage),
):
    """Score a config that has not been saved, next to the one that is.

    A POST because the body is a whole proposed config, but it writes nothing.
    Manager-only, and unscoped like the scorecard itself: it returns every
    owner's figures, which is exactly what the impact diff is for — adding a KPI
    rescales every weight and re-grades named people, and that has to be visible
    before anyone commits to it.
    """
    from aexy.services.service_desk_scorecard import ServiceDeskScorecard

    return await ServiceDeskScorecard(db).preview(
        workspace_id,
        draft_kpis=[k.model_dump() for k in data.kpis],
        draft_bands=[b.model_dump() for b in data.bands],
        filters=filters,
    )


@router.get("/reports/scorecard/config", response_model=ScorecardConfigResponse)
async def get_scorecard_config(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """The workspace's KPI weights, curves and rating bands.

    Readable by anyone who can open the desk: an owner being graded should be
    able to see what they are graded on. ``can_manage`` says whether they may
    change it.
    """
    from aexy.services.permission_service import PermissionService
    from aexy.services.service_desk_scorecard import METRICS, metric_catalogue
    from aexy.services.service_desk_scorecard_config import load_scorecard_config

    config = await load_scorecard_config(db, workspace_id)
    can_manage = await PermissionService(db).check_permission(
        workspace_id, str(current.id), "can_manage_service_desk"
    )
    return ScorecardConfigResponse(
        kpis=[
            ScorecardKPIResponse(
                metric_key=k.metric_key,
                label=k.label,
                weight=k.weight,
                direction=k.direction,
                benchmark=k.benchmark,
                penalty_per_unit=k.penalty_per_unit,
                target=k.target,
                threshold=k.threshold,
                enabled=k.enabled,
                source=k.source,
                definition=k.definition,
                definition_version=k.definition_version,
                status=k.status,
                unit=METRICS[k.metric_key].unit if k.metric_key in METRICS else "rate",
            )
            for k in config.kpis
        ],
        bands=[
            ScorecardBandInput(rating=b.rating, min_score=b.min_score, label=b.label)
            for b in config.bands
        ],
        available_metrics=metric_catalogue(),
        can_manage=can_manage,
    )


@router.put("/reports/scorecard/config", response_model=ScorecardConfigResponse)
async def update_scorecard_config(
    workspace_id: str,
    data: ScorecardConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(require_manage),
):
    """Replace the scorecard rules.

    Whole-set, because the enabled weights must total 1 — an invariant across
    rows that only holds between complete writes.
    """
    from aexy.services.service_desk_scorecard import METRICS, metric_catalogue
    from aexy.services.service_desk_scorecard_config import replace_config

    from aexy.services.service_desk_taxonomy import load_taxonomy

    config = await replace_config(
        db,
        workspace_id,
        [k.model_dump() for k in data.kpis],
        [b.model_dump() for b in data.bands],
        await load_taxonomy(db, workspace_id, seed=False),
    )
    logger.info(
        "Scorecard config replaced for workspace %s by %s (%d KPIs, %d bands)",
        workspace_id, current.id, len(data.kpis), len(data.bands),
    )
    return ScorecardConfigResponse(
        kpis=[
            ScorecardKPIResponse(
                metric_key=k.metric_key,
                label=k.label,
                weight=k.weight,
                direction=k.direction,
                benchmark=k.benchmark,
                penalty_per_unit=k.penalty_per_unit,
                target=k.target,
                threshold=k.threshold,
                enabled=k.enabled,
                source=k.source,
                definition=k.definition,
                definition_version=k.definition_version,
                status=k.status,
                unit=METRICS[k.metric_key].unit if k.metric_key in METRICS else "rate",
            )
            for k in config.kpis
        ],
        bands=[
            ScorecardBandInput(rating=b.rating, min_score=b.min_score, label=b.label)
            for b in config.bands
        ],
        available_metrics=metric_catalogue(),
        can_manage=True,
    )


@router.get("/digest/preview", response_model=DigestPreview)
async def preview_digest(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """The caller's own digest as it would be sent right now, plus who gets one.

    The caller's copy, never somebody else's: showing a KAM the desk lead's
    whole-desk digest would mail around the row scope every other read enforces.
    A caller who is not on the recipient list still sees the schedule and the
    list — that is configuration, not ticket data.
    """
    return await ServiceDeskDigestService(db).preview(workspace_id, str(current.id))


@router.post("/digest/send-now")
async def send_digest_now(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(require_manage),
):
    """Send this desk's digest now, to everyone who would normally receive it.

    Restricted to managers, because it mails every member of the desk — a
    "preview" that goes to other people's inboxes is not something an individual
    should be able to trigger. Ignores the schedule but not the off switch: a
    desk that turned the digest off is not asking to be surprised by one.
    """
    sent = await ServiceDeskDigestService(db).send_for_workspace_now(workspace_id)
    return {"sent": sent}


@router.get("/ai-accuracy", response_model=AIAccuracy)
async def ai_accuracy(
    workspace_id: str,
    days: int = Query(default=90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Whether the classifier is worth trusting on this desk's mail.

    Workspace-wide rather than scoped to the caller's own tickets: it answers a
    question about the desk's configuration, not about anyone's queue, and a
    per-KAM sample would be too small to mean anything.
    """
    return await ServiceDeskTicketService(db).ai_accuracy(workspace_id, days=days)


@router.get("/tickets/count", response_model=TicketCount)
async def count_tickets(
    workspace_id: str,
    assigned_to_me: bool = False,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """How many tickets match, for a screen paging through them."""
    total = await ServiceDeskService(db).count_tickets(
        workspace_id,
        developer_id=current.id,
        assigned_to=str(current.id) if assigned_to_me else None,
        filters=filters,
    )
    return TicketCount(total=total)


@router.get("/tickets/export.csv")
async def export_tickets(
    workspace_id: str,
    assigned_to_me: bool = False,
    filters: TicketFilters = Depends(),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """The filtered list as CSV, with turnaround figures.

    Deliberately the same scope and the same filters as the list — it is the
    screen somebody is looking at, in a file. An export that quietly returned
    more than the page it came from would be a permissions bug with a download
    button on it.
    """
    csv_text, filename = await ServiceDeskTicketService(db).export_csv(
        workspace_id,
        developer_id=current.id,
        assigned_to=str(current.id) if assigned_to_me else None,
        filters=filters,
    )
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    return Response(
        content=raw,
        media_type=content_type,
        headers={
            # `attachment`, not inline: this arrived as an inbound MIME part
            # from whoever emailed the desk, so it is a file the reader saves
            # rather than something we render on our own origin.
            "Content-Disposition": content_disposition(filename, "attachment"),
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


# Registered on their own path rather than under `attachments/`, whose remaining
# segment is an int: a name there would 422 before it could ever reach a handler.
@router.post(
    "/tickets/{ticket_id}/uploads",
    response_model=list[TicketAttachment],
    status_code=status.HTTP_201_CREATED,
)
async def upload_ticket_files(
    workspace_id: str,
    ticket_id: str,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Take files to attach to a reply from this ticket.

    Streamed to storage from their spooled temp files, so a large upload is never
    held in memory. Requires write authority on the ticket, as the send does.
    """

    def _size(upload: UploadFile) -> int:
        if upload.size is not None:
            return upload.size
        upload.file.seek(0, 2)
        size = upload.file.tell()
        upload.file.seek(0)
        return size

    return await ServiceDeskTicketService(db).add_outbound_attachments(
        workspace_id,
        ticket_id,
        [(f.filename or "attachment", f.content_type, f.file, _size(f)) for f in files],
        scope_developer_id=current.id,
    )


@router.delete(
    "/tickets/{ticket_id}/uploads/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_ticket_upload(
    workspace_id: str,
    ticket_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Drop a file uploaded to this ticket but not yet sent."""
    await ServiceDeskTicketService(db).remove_outbound_attachment(
        workspace_id, ticket_id, attachment_id, scope_developer_id=current.id
    )


@router.get("/tickets/{ticket_id}/uploads/{attachment_id}")
async def download_ticket_upload(
    workspace_id: str,
    ticket_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Hand back a file uploaded to this ticket, staged or already sent."""
    filename, content_type, raw = await ServiceDeskTicketService(
        db
    ).load_uploaded_attachment(
        workspace_id, ticket_id, attachment_id, scope_developer_id=current.id
    )
    return Response(
        content=raw,
        media_type=content_type,
        headers={
            # Same reasoning as the emailed files: saved, never rendered on our
            # own origin, and not cached by anything shared.
            "Content-Disposition": content_disposition(filename, "attachment"),
            "Cache-Control": "private, no-store",
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
        attachment_ids=data.attachment_ids,
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
        assignee_id=data.assignee_id,
        pending_with=data.pending_with,
        scope_developer_id=current.id,
    )


@router.get("/community/publish-targets", response_model=PublishTargetsResponse)
async def community_publish_targets(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Where a ticket answer may be published, if publishing is switched on.

    Returns ``enabled=false`` with no channels when the workspace has not opted
    in — which is the default — so the ticket UI simply doesn't offer the action
    rather than offering one that 403s.
    """
    from aexy.services.community_publishing_service import CommunityPublishingService

    service = CommunityPublishingService(db)
    channels = await service.target_channels(workspace_id, "service_desk")
    community = await service.linked_community(workspace_id, "service_desk")
    return PublishTargetsResponse(
        enabled=community is not None,
        community_slug=community.community_slug if community is not None else None,
        channels=channels,
    )


@router.post("/tickets/{ticket_id}/publish-to-community", response_model=TicketCommunityTopic)
async def publish_ticket_to_community(
    workspace_id: str,
    ticket_id: str,
    data: PublishToCommunityRequest,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Publish this ticket's answer as a public community thread.

    The body is whatever the operator reviewed and edited in the composer — the
    ticket's own correspondence is never posted as-is, because a customer's email
    contains the customer.
    """
    service = ServiceDeskTicketService(db)
    try:
        return await service.publish_to_community(
            workspace_id,
            ticket_id,
            channel_id=data.channel_id,
            title=data.title,
            content=data.content,
            developer_id=str(current.id),
            scope_developer_id=current.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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
