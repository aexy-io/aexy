"""Service Desk management service — taxonomy, master data, ticket listing.

CRUD for the workspace's stakeholders and request types, its
accounts/vendors/products/mailboxes (the editable master data that drives intake
auto-assignment), plus listing service-desk tickets and manual logging.
"""

import logging
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import delete, false, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.google_integration import GoogleIntegration
from aexy.models.organization import Department, DepartmentMember
from aexy.services.service_desk_clock import (
    BREACH_AMBER_DAYS,
    BREACH_RED_DAYS,
    DEFAULT_DIGEST_HOURS,
    DEFAULT_TIMEZONE,
    DEFAULT_WORK_END,
    DEFAULT_WORK_START,
)
from aexy.services.service_desk_config import (
    DEFAULT_TICKET_PREFIX,
    display_id,
    normalise_prefix,
    ticket_prefix,
)
from aexy.services.service_desk_industry_templates import get_template, list_templates
from aexy.services.service_desk_taxonomy import Taxonomy, load_taxonomy, seed_taxonomy
from aexy.models.service_desk import (
    ServiceDeskRequestType,
    ServiceDeskStakeholder,
    TicketPendingSegment,
    ServiceDeskVendor,
    ServiceDeskVendorDomain,
    ServiceDeskProduct,
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskTicket,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace
from aexy.schemas.service_desk import (
    InboundEmail,
    VendorCreate,
    VendorResponse,
    VendorUpdate,
    ProductCreate,
    ProductResponse,
    MailboxCreate,
    MailboxResponse,
    MailboxUpdate,
    ManualTicketCreate,
    AccountCreate,
    AccountResponse,
    AccountUpdate,
    ServiceDeskTicketResponse,
    TestSLAOverride,
)


logger = logging.getLogger(__name__)


async def _caller_functions(db: AsyncSession, workspace_id: str, developer_id: str) -> set[str]:
    """The ``function_key``s of every department the caller belongs to."""
    return set(
        (
            await db.execute(
                select(Department.function_key)
                .join(DepartmentMember, DepartmentMember.department_id == Department.id)
                .where(
                    Department.workspace_id == workspace_id,
                    DepartmentMember.developer_id == developer_id,
                    Department.function_key.isnot(None),
                )
            )
        ).scalars().all()
    )


def _assignment_only_function(taxonomy: Taxonomy) -> str | None:
    """The one function whose queue is by assignment rather than by bucket.

    Every ticket nobody has picked up parks on the workspace's default
    stakeholder, so honouring that bucket as a shared queue would show each
    member of that team everyone else's work — the exact leak this scope exists
    to prevent. Was the literal ``"ops_kam"``, which silently did nothing for a
    workspace whose operations team was called anything else.
    """
    return taxonomy.internal_function_keys.get(taxonomy.default_stakeholder_slug or "")


async def has_full_service_desk_view(db: AsyncSession, workspace_id: str, developer_id: str) -> bool:
    """Whether the caller may see every Service Desk ticket in the workspace.

    Two separate capabilities grant it, which is the whole point of the split:
    an Ops Lead needs to see everything without being able to reconfigure the
    desk, so full visibility is its own permission rather than a side effect of
    the management one.
    """
    from aexy.services.permission_service import PermissionService

    perms = PermissionService(db)
    return await perms.check_permission(
        workspace_id, developer_id, "can_view_all_service_desk"
    ) or await perms.check_permission(
        workspace_id, developer_id, "can_manage_service_desk"
    )


async def can_edit_ticket(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    *,
    assignee_id: str | None,
    pending_with: str,
) -> bool:
    """Whether the caller may *change* this ticket, as opposed to read it.

    The companion to ``resolve_scope_clause``, and deliberately a separate
    question: an Ops Lead holds ``can_view_all_service_desk`` so every row is
    visible to them, but watching the desk is not owning the work, so seeing a
    ticket must never imply being allowed to reclassify or hand it off.

    Three ways to hold write authority:

    * ``can_manage_service_desk`` — the desk manager acts on anything.
    * assignment — the KAM who owns this ticket triages and hands it off,
      without needing workspace-wide management.
    * the ticket is parked in a *non-Ops* function queue the caller belongs to —
      Finance handed a payout query has to be able to answer and hand it back.

    The default bucket is excluded from the queue rule for the same reason it is
    excluded from the view scope: every unhandled ticket sits there, so honouring
    it as a queue would hand each of that team's members everyone else's ticket.
    """
    from aexy.services.permission_service import PermissionService

    if await PermissionService(db).check_permission(
        workspace_id, developer_id, "can_manage_service_desk"
    ):
        return True
    if assignee_id is not None and str(assignee_id) == str(developer_id):
        return True
    taxonomy = await load_taxonomy(db, workspace_id, seed=False)
    function_key = taxonomy.internal_function_keys.get(pending_with)
    if function_key is None or function_key == _assignment_only_function(taxonomy):
        return False
    return function_key in await _caller_functions(db, workspace_id, developer_id)


async def can_create_manual_ticket(db: AsyncSession, workspace_id: str, developer_id: str) -> bool:
    """Whether the caller may log a phone/WhatsApp request as a ticket.

    Manual logging is KAM/manager work. The same visibility-is-not-authority
    split as ``can_edit_ticket``: an Ops Lead's ``can_view_all_service_desk``
    is deliberately read-only, and plain module-view is weaker still, so
    neither may create tickets.
    """
    from aexy.services.permission_service import PermissionService

    if await PermissionService(db).check_permission(
        workspace_id, developer_id, "can_manage_service_desk"
    ):
        return True
    taxonomy = await load_taxonomy(db, workspace_id, seed=False)
    owner_function = _assignment_only_function(taxonomy)
    if owner_function is None:
        return False
    return owner_function in await _caller_functions(db, workspace_id, developer_id)


async def resolve_scope_clause(db: AsyncSession, workspace_id: str, developer_id: str):
    """Row-level visibility for the caller (BRD §11 / plan §10).

    The single server-side authority for which Service Desk rows a caller may
    see: list, dashboard, detail, every by-id mutation, the split endpoint and
    the generic ticket paths all resolve through here, so visibility can only be
    changed in one place.

    Returns None when the caller may see everything. Otherwise a SQLAlchemy
    clause restricting to tickets pending with a *non-Ops* function the caller
    belongs to (Finance, Sales, Marketing keep their queues), plus tickets
    assigned to them personally. A caller with no relevant function sees nothing.
    """
    if await has_full_service_desk_view(db, workspace_id, developer_id):
        return None

    taxonomy = await load_taxonomy(db, workspace_id, seed=False)
    functions = await _caller_functions(db, workspace_id, developer_id)
    owner_function = _assignment_only_function(taxonomy)
    pending_values = {
        slug
        for slug, fk in taxonomy.internal_function_keys.items()
        if fk in functions and fk != owner_function
    }

    clauses = []
    if pending_values:
        clauses.append(ServiceDeskTicket.pending_with.in_(pending_values))
    # Anyone who owns a stakeholder queue also sees what is assigned to them
    # personally — previously gated on the literal "ops_kam" function key.
    if functions & set(taxonomy.internal_function_keys.values()):
        clauses.append(Ticket.assignee_id == developer_id)
    if not clauses:
        return false()
    return or_(*clauses)


async def describe_scope(db: AsyncSession, workspace_id: str, developer_id: str) -> str:
    """``"all"`` | ``"assigned"`` | ``"function"`` | ``"none"`` — how wide the view is.

    The clause returned by ``resolve_scope_clause`` can't be introspected by the
    UI, and an empty ticket list is ambiguous three ways: someone who was never
    added to a department, someone in the default bucket with nothing assigned
    today, and a genuinely quiet workspace all look identical. Naming the scope
    lets the page say which one it is instead of implying there is no work.
    """
    if await has_full_service_desk_view(db, workspace_id, developer_id):
        return "all"
    taxonomy = await load_taxonomy(db, workspace_id, seed=False)
    functions = await _caller_functions(db, workspace_id, developer_id)
    owner_function = _assignment_only_function(taxonomy)
    if any(
        fk in functions
        for fk in taxonomy.internal_function_keys.values()
        if fk != owner_function
    ):
        return "function"
    if owner_function is not None and owner_function in functions:
        return "assigned"
    return "none"


async def generic_ticket_scope_clause(db: AsyncSession, workspace_id: str, developer_id: str):
    """The same authority, expressed for queries over the shared ``Ticket`` table.

    Service Desk tickets are rows in the generic ticketing table, so the generic
    Tickets module, Ask AI and anything else querying ``Ticket`` would otherwise
    hand a KAM every ticket the Service Desk scope denies them. Returns None when
    nothing needs restricting, else a clause admitting non-Service-Desk rows plus
    the Service Desk rows this caller may see.
    """
    from aexy.services.permission_service import PermissionService

    if await PermissionService(db).check_permission(
        workspace_id, developer_id, "can_view_service_desk"
    ):
        clause = await resolve_scope_clause(db, workspace_id, developer_id)
        if clause is None:
            return None
    else:
        # No module access at all: Service Desk rows are invisible here too,
        # otherwise revoking the module would only hide its own pages.
        clause = false()

    in_scope = (
        select(ServiceDeskTicket.ticket_id)
        .where(ServiceDeskTicket.ticket_id == Ticket.id, clause)
        .exists()
    )
    is_sd = (
        select(ServiceDeskTicket.ticket_id)
        .where(ServiceDeskTicket.ticket_id == Ticket.id)
        .exists()
    )
    return or_(~is_sd, in_scope)


async def is_service_desk_ticket_visible(
    db: AsyncSession, workspace_id: str, ticket_id: str, developer_id: str
) -> bool:
    """Whether a single ``Ticket`` row is reachable by this caller.

    For the by-id generic paths, which fetch one ticket and then act on it.
    Non-Service-Desk tickets are always visible here — this guard only speaks
    for the Service Desk.
    """
    clause = await generic_ticket_scope_clause(db, workspace_id, developer_id)
    if clause is None:
        return True
    return (
        await db.execute(select(Ticket.id).where(Ticket.id == ticket_id, clause))
    ).scalar_one_or_none() is not None


def _norm_domain(d: str) -> str:
    return d.strip().lower().lstrip("@")


class ServiceDeskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ----------------------------------------------------------- accounts

    @staticmethod
    def _account_response(p: ServiceDeskAccount) -> AccountResponse:
        return AccountResponse(
            id=p.id,
            workspace_id=p.workspace_id,
            name=p.name,
            assigned_owner_id=p.assigned_owner_id,
            is_active=p.is_active,
            domains=[d.domain for d in p.domains],
            created_at=p.created_at,
        )

    async def list_accounts(self, workspace_id: str) -> list[AccountResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskAccount)
                .where(ServiceDeskAccount.workspace_id == workspace_id)
                .order_by(ServiceDeskAccount.name)
            )
        ).scalars().all()
        return [self._account_response(p) for p in rows]

    async def create_account(self, workspace_id: str, data: AccountCreate) -> AccountResponse:
        account = ServiceDeskAccount(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            assigned_owner_id=data.assigned_owner_id,
            is_active=data.is_active,
        )
        self.db.add(account)
        await self.db.flush()
        for dom in data.domains:
            self.db.add(
                ServiceDeskAccountDomain(
                    id=str(uuid4()), workspace_id=workspace_id, account_id=account.id, domain=_norm_domain(dom)
                )
            )
        await self.db.flush()
        await self.db.refresh(account)
        return self._account_response(account)

    async def update_account(self, workspace_id: str, account_id: str, data: AccountUpdate) -> AccountResponse:
        account = await self._get_account(workspace_id, account_id)
        payload = data.model_dump(exclude_unset=True)
        domains = payload.pop("domains", None)
        for k, v in payload.items():
            setattr(account, k, v)
        if domains is not None:
            await self.db.execute(
                delete(ServiceDeskAccountDomain).where(ServiceDeskAccountDomain.account_id == account_id)
            )
            for dom in domains:
                self.db.add(
                    ServiceDeskAccountDomain(
                        id=str(uuid4()), workspace_id=workspace_id, account_id=account_id, domain=_norm_domain(dom)
                    )
                )
        await self.db.flush()
        await self.db.refresh(account)
        return self._account_response(account)

    async def delete_account(self, workspace_id: str, account_id: str) -> None:
        account = await self._get_account(workspace_id, account_id)
        await self.db.delete(account)
        await self.db.flush()

    async def _get_account(self, workspace_id: str, account_id: str) -> ServiceDeskAccount:
        p = (
            await self.db.execute(
                select(ServiceDeskAccount).where(
                    ServiceDeskAccount.id == account_id, ServiceDeskAccount.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if p is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
        return p

    # ----------------------------------------------------------- vendors

    @staticmethod
    def _vendor_response(i: ServiceDeskVendor) -> VendorResponse:
        return VendorResponse(
            id=i.id,
            workspace_id=i.workspace_id,
            name=i.name,
            is_active=i.is_active,
            domains=[d.domain for d in i.domains],
            created_at=i.created_at,
        )

    async def list_vendors(self, workspace_id: str) -> list[VendorResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskVendor)
                .where(ServiceDeskVendor.workspace_id == workspace_id)
                .order_by(ServiceDeskVendor.name)
            )
        ).scalars().all()
        return [self._vendor_response(i) for i in rows]

    async def create_vendor(self, workspace_id: str, data: VendorCreate) -> VendorResponse:
        vendor = ServiceDeskVendor(
            id=str(uuid4()), workspace_id=workspace_id, name=data.name, is_active=data.is_active
        )
        self.db.add(vendor)
        await self.db.flush()
        for dom in data.domains:
            self.db.add(
                ServiceDeskVendorDomain(
                    id=str(uuid4()), workspace_id=workspace_id, vendor_id=vendor.id, domain=_norm_domain(dom)
                )
            )
        await self.db.flush()
        await self.db.refresh(vendor)
        return self._vendor_response(vendor)

    async def update_vendor(self, workspace_id: str, vendor_id: str, data: VendorUpdate) -> VendorResponse:
        vendor = (
            await self.db.execute(
                select(ServiceDeskVendor).where(
                    ServiceDeskVendor.id == vendor_id, ServiceDeskVendor.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if vendor is None:
            raise HTTPException(status_code=404, detail="Vendor not found")
        payload = data.model_dump(exclude_unset=True)
        domains = payload.pop("domains", None)
        for k, v in payload.items():
            setattr(vendor, k, v)
        if domains is not None:
            await self.db.execute(
                delete(ServiceDeskVendorDomain).where(ServiceDeskVendorDomain.vendor_id == vendor_id)
            )
            for dom in domains:
                self.db.add(
                    ServiceDeskVendorDomain(
                        id=str(uuid4()), workspace_id=workspace_id, vendor_id=vendor_id, domain=_norm_domain(dom)
                    )
                )
        await self.db.flush()
        await self.db.refresh(vendor)
        return self._vendor_response(vendor)

    async def delete_vendor(self, workspace_id: str, vendor_id: str) -> None:
        await self.db.execute(
            delete(ServiceDeskVendor).where(
                ServiceDeskVendor.id == vendor_id, ServiceDeskVendor.workspace_id == workspace_id
            )
        )
        await self.db.flush()

    # ----------------------------------------------------------- Products

    async def list_products(self, workspace_id: str) -> list[ProductResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskProduct)
                .where(ServiceDeskProduct.workspace_id == workspace_id)
                .order_by(ServiceDeskProduct.name)
            )
        ).scalars().all()
        return [ProductResponse.model_validate(r) for r in rows]

    async def create_product(self, workspace_id: str, data: ProductCreate) -> ProductResponse:
        product = ServiceDeskProduct(id=str(uuid4()), workspace_id=workspace_id, name=data.name, is_active=data.is_active)
        self.db.add(product)
        await self.db.flush()
        await self.db.refresh(product)
        return ProductResponse.model_validate(product)

    async def delete_product(self, workspace_id: str, product_id: str) -> None:
        await self.db.execute(
            delete(ServiceDeskProduct).where(
                ServiceDeskProduct.id == product_id, ServiceDeskProduct.workspace_id == workspace_id
            )
        )
        await self.db.flush()

    # ----------------------------------------------------------- mailboxes

    async def list_mailboxes(self, workspace_id: str) -> list[MailboxResponse]:
        rows = (
            await self.db.execute(
                select(ServiceDeskMailbox)
                .where(ServiceDeskMailbox.workspace_id == workspace_id)
                .order_by(ServiceDeskMailbox.address)
            )
        ).scalars().all()
        return [MailboxResponse.model_validate(r) for r in rows]

    async def _require_own_integration(self, workspace_id: str, integration_id: str) -> None:
        """The Google integration must belong to THIS workspace.

        ``integration_id`` arrives in the request body and only FKs to
        ``google_integrations.id``, so without this check a manager who knows
        another workspace's integration id could register a mailbox against it —
        and then inbound Gmail sync for that account would file the other
        workspace's mail as tickets *here*, while outbound service-desk mail
        would be sent *as them*.
        """
        from aexy.models.google_integration import GoogleIntegration

        found = (
            await self.db.execute(
                select(GoogleIntegration.id).where(
                    GoogleIntegration.id == integration_id,
                    GoogleIntegration.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if found is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Google integration not found in this workspace",
            )

    async def _require_unclaimed_address(self, workspace_id: str, address: str) -> None:
        """Refuse an address another workspace already receives mail on.

        ``uq_service_desk_mailbox_address`` is per workspace, and the inbound
        webhook resolves ``to`` → mailbox across all workspaces (an inbound POST
        carries no workspace). Registering an address you don't own therefore
        diverted another workspace's mail into your desk — whoever registered it
        first won. Uniqueness across workspaces removes the race entirely.
        """
        clash = (
            await self.db.execute(
                select(ServiceDeskMailbox.workspace_id).where(
                    func.lower(ServiceDeskMailbox.address) == address.lower(),
                    ServiceDeskMailbox.workspace_id != workspace_id,
                )
            )
        ).first()
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "That address is already registered as a service desk mailbox. "
                    "Contact support if you own this domain."
                ),
            )

    async def create_mailbox(self, workspace_id: str, data: MailboxCreate) -> MailboxResponse:
        await self._require_unclaimed_address(workspace_id, data.address)
        integration_id = data.integration_id
        if data.channel == "gmail_sync" and integration_id is None:
            integration_id = (
                await self.db.execute(
                    select(GoogleIntegration.id).where(
                        GoogleIntegration.workspace_id == workspace_id,
                        GoogleIntegration.gmail_sync_enabled.is_(True),
                        GoogleIntegration.is_active.is_(True),
                        func.lower(GoogleIntegration.google_email) == data.address.lower(),
                    )
                )
            ).scalar_one_or_none()
            if integration_id is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Connect and enable Gmail sync for this mailbox address first",
                )
        # Ownership is re-checked on the resolved id, not just the supplied one,
        # so the lookup above can never hand back another workspace's integration.
        if integration_id:
            await self._require_own_integration(workspace_id, integration_id)
        mailbox = ServiceDeskMailbox(
            id=str(uuid4()),
            workspace_id=workspace_id,
            address=data.address.lower(),
            channel=data.channel,
            integration_id=integration_id,
            is_active=data.is_active,
        )
        self.db.add(mailbox)
        await self.db.flush()
        await self.db.refresh(mailbox)
        return MailboxResponse.model_validate(mailbox)

    async def update_mailbox(self, workspace_id: str, mailbox_id: str, data: MailboxUpdate) -> MailboxResponse:
        mailbox = (
            await self.db.execute(
                select(ServiceDeskMailbox).where(
                    ServiceDeskMailbox.id == mailbox_id, ServiceDeskMailbox.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if mailbox is None:
            raise HTTPException(status_code=404, detail="Mailbox not found")
        payload = data.model_dump(exclude_unset=True)
        if payload.get("integration_id"):
            await self._require_own_integration(workspace_id, payload["integration_id"])
        for k, v in payload.items():
            setattr(mailbox, k, v)
        await self.db.flush()
        await self.db.refresh(mailbox)
        return MailboxResponse.model_validate(mailbox)

    async def delete_mailbox(self, workspace_id: str, mailbox_id: str) -> None:
        await self.db.execute(
            delete(ServiceDeskMailbox).where(
                ServiceDeskMailbox.id == mailbox_id, ServiceDeskMailbox.workspace_id == workspace_id
            )
        )
        await self.db.flush()

    # ----------------------------------------------------------- settings

    async def get_settings(self, workspace_id: str, developer_id: str | None = None) -> dict:
        ws = await self.db.get(Workspace, workspace_id)
        sd = ((ws.settings or {}).get("service_desk") or {}) if ws else {}
        can_manage = False
        scope = "all"
        if developer_id is not None:
            from aexy.services.permission_service import PermissionService

            can_manage = await PermissionService(self.db).check_permission(
                workspace_id, developer_id, "can_manage_service_desk"
            )
            scope = await describe_scope(self.db, workspace_id, developer_id)
        hours = sd.get("working_hours") or {}
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        # Do not revive a forgotten test run merely because its JSON is still
        # present. The clock has the same defensive expiry check.
        test_sla = None
        if isinstance(sd.get("test_sla"), dict):
            try:
                test_sla = TestSLAOverride.model_validate(sd["test_sla"])
            except ValueError:
                pass
        return {
            "ai_classification_enabled": bool(sd.get("ai_classification_enabled", False)),
            "auto_split_enabled": bool(sd.get("auto_split_enabled", False)),
            "can_manage": bool(can_manage),
            "scope": scope,
            # Report the values actually in force, defaults included, so the page
            # never shows a blank field for a clock that is definitely running.
            "working_hours_start": hours.get("start") or DEFAULT_WORK_START.strftime("%H:%M"),
            "working_hours_end": hours.get("end") or DEFAULT_WORK_END.strftime("%H:%M"),
            "ticket_prefix": normalise_prefix(sd.get("ticket_prefix")) or DEFAULT_TICKET_PREFIX,
            "timezone": sd.get("timezone") or DEFAULT_TIMEZONE,
            "breach_red_days": float(sd.get("breach_red_days") or BREACH_RED_DAYS),
            "breach_amber_days": float(sd.get("breach_amber_days") or BREACH_AMBER_DAYS),
            "digest_hours": list(sd.get("digest_hours") or DEFAULT_DIGEST_HOURS),
            "industry_template": sd.get("industry_template"),
            # Resolved, not raw: the page should render the labels in force rather
            # than blanks for whatever the workspace hasn't overridden.
            "terminology": dict(taxonomy.terminology),
            # Falls back to the workspace's own name — outbound email copy used to
            # carry a hardcoded company name for every tenant.
            "desk_name": sd.get("desk_name") or (ws.name if ws else None),
            "test_sla": test_sla,
        }

    async def update_settings(
        self,
        workspace_id: str,
        ai_classification_enabled: bool | None = None,
        auto_split_enabled: bool | None = None,
        working_hours_start: str | None = None,
        working_hours_end: str | None = None,
        test_sla: TestSLAOverride | None = None,
        clear_test_sla: bool = False,
        developer_id: str | None = None,
        ticket_prefix: str | None = None,
        timezone: str | None = None,
        breach_red_days: float | None = None,
        breach_amber_days: float | None = None,
        digest_hours: list[int] | None = None,
        terminology: dict[str, str] | None = None,
        desk_name: str | None = None,
    ) -> dict:
        """Patch semantics: only the fields supplied are touched.

        The working window feeds the breach clock, so changing it re-scores every
        open ticket's stage age — hence the audit log line.
        """
        ws = await self.db.get(Workspace, workspace_id)
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        settings = dict(ws.settings or {})
        sd = dict(settings.get("service_desk") or {})

        if ai_classification_enabled is not None:
            sd["ai_classification_enabled"] = bool(ai_classification_enabled)

        if auto_split_enabled is not None:
            # Worth an audit line: turning this on lets intake create a ticket
            # nobody asked for by hand, so "who enabled it and when" matters.
            sd["auto_split_enabled"] = bool(auto_split_enabled)
            logger.info(
                "Service desk auto-split for workspace %s set to %s by %s",
                workspace_id, bool(auto_split_enabled), developer_id or "unknown",
            )

        if working_hours_start or working_hours_end:
            hours = dict(sd.get("working_hours") or {})
            before = (
                hours.get("start") or DEFAULT_WORK_START.strftime("%H:%M"),
                hours.get("end") or DEFAULT_WORK_END.strftime("%H:%M"),
            )
            if working_hours_start:
                hours["start"] = working_hours_start
            if working_hours_end:
                hours["end"] = working_hours_end
            # One field at a time must still leave a forward window; the schema
            # can only check a pair sent together.
            if hours["end"] <= hours["start"]:
                raise HTTPException(
                    status_code=400,
                    detail="Working hours end must be later than the start",
                )
            sd["working_hours"] = hours
            logger.info(
                "Service desk working hours for workspace %s changed from %s-%s to %s-%s by %s",
                workspace_id, before[0], before[1], hours["start"], hours["end"],
                developer_id or "unknown",
            )

        if ticket_prefix is not None:
            normalised = normalise_prefix(ticket_prefix)
            if normalised is None:
                raise HTTPException(
                    status_code=400,
                    detail="Ticket prefix must be 1-10 letters/digits starting with a letter",
                )
            # Not stored on the ticket — display ids are rendered from
            # ticket_number — so changing this relabels every existing ticket in
            # the workspace. Subject-line threading keeps accepting the old
            # prefix (see service_desk_config), so live email threads survive it.
            if normalised != (normalise_prefix(sd.get("ticket_prefix")) or DEFAULT_TICKET_PREFIX):
                logger.info(
                    "Service desk ticket prefix for workspace %s changed from %s to %s by %s",
                    workspace_id,
                    normalise_prefix(sd.get("ticket_prefix")) or DEFAULT_TICKET_PREFIX,
                    normalised,
                    developer_id or "unknown",
                )
            sd["ticket_prefix"] = normalised

        if timezone is not None:
            sd["timezone"] = timezone

        # Re-scores every open ticket, so validate the pair against whatever is
        # already stored rather than only against a pair sent together.
        if breach_red_days is not None or breach_amber_days is not None:
            red = float(
                breach_red_days
                if breach_red_days is not None
                else sd.get("breach_red_days") or BREACH_RED_DAYS
            )
            amber = float(
                breach_amber_days
                if breach_amber_days is not None
                else sd.get("breach_amber_days") or BREACH_AMBER_DAYS
            )
            if amber >= red:
                raise HTTPException(
                    status_code=400,
                    detail="Amber threshold must be lower than the red threshold",
                )
            sd["breach_red_days"] = red
            sd["breach_amber_days"] = amber

        if digest_hours is not None:
            # Sorted so the digest activity can compare against the current local
            # hour without caring what order the UI sent them in.
            sd["digest_hours"] = sorted(set(digest_hours))

        if terminology is not None:
            # Merged, not replaced: the settings page can send one relabelled noun
            # without clearing the rest. A blank value resets that key to the
            # generic default rather than storing an empty label.
            merged = dict(sd.get("terminology") or {})
            for key, value in terminology.items():
                if value and value.strip():
                    merged[key] = value.strip()
                else:
                    merged.pop(key, None)
            sd["terminology"] = merged

        if desk_name is not None:
            # Empty means "go back to using the workspace name".
            cleaned = desk_name.strip()
            if cleaned:
                sd["desk_name"] = cleaned
            else:
                sd.pop("desk_name", None)

        if clear_test_sla:
            removed = sd.pop("test_sla", None) is not None
            logger.info(
                "Service desk test SLA removed for workspace %s by %s (was_present=%s)",
                workspace_id, developer_id or "unknown", removed,
            )
        elif test_sla is not None:
            # Pydantic has already enforced a timezone-aware future expiry of
            # no more than 24 hours, plus a red threshold after amber.
            sd["test_sla"] = test_sla.model_dump(mode="json")
            logger.info(
                "Service desk test SLA enabled for workspace %s until %s by %s",
                workspace_id, test_sla.expires_at.isoformat(), developer_id or "unknown",
            )

        settings["service_desk"] = sd
        ws.settings = settings  # reassign so SQLAlchemy tracks the JSONB change
        await self.db.flush()
        # Only a manager reaches this endpoint, so both capabilities are true by
        # construction — a manager's scope is always "all".
        return await self.get_settings(workspace_id, developer_id) | {
            "can_manage": True,
            "scope": "all",
        }

    # ------------------------------------------------------ industry templates

    @staticmethod
    def list_industry_templates() -> list[dict]:
        """The catalogue of starting points. Static — no workspace data involved."""
        return [
            {
                "slug": t.slug,
                "name": t.name,
                "description": t.description,
                "terminology": t.resolved_terminology(),
                "stakeholders": [
                    {
                        "slug": s.slug,
                        "label": s.label,
                        "semantics": s.semantics,
                        "function_key": s.function_key,
                    }
                    for s in t.stakeholders
                ],
                "request_types": [
                    {"slug": r.slug, "label": r.label, "is_default": r.is_default}
                    for r in t.request_types
                ],
                "departments": [d.name for d in t.departments],
            }
            for t in list_templates()
        ]

    async def apply_industry_template(
        self,
        workspace_id: str,
        template_slug: str,
        *,
        apply_terminology: bool = False,
        create_departments: bool = True,
        developer_id: str | None = None,
    ) -> dict:
        """Seed a template's taxonomy into this workspace.

        Additive by design — see ``seed_taxonomy``. Re-applying is therefore safe
        and is the supported way to pick up a stakeholder added to a template
        later, without touching buckets that tickets already sit in.
        """
        template = get_template(template_slug)
        if template is None:
            known = ", ".join(t.slug for t in list_templates())
            raise HTTPException(
                status_code=404,
                detail=f"Unknown industry template {template_slug!r} (known: {known})",
            )

        ws = await self.db.get(Workspace, workspace_id)
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found")

        added_s, added_r = await seed_taxonomy(self.db, workspace_id, template)

        # Internal stakeholders route to a department by function key. Without the
        # department, row-level visibility matches nobody and the queue looks
        # empty with nothing on screen to explain why.
        created: list[str] = []
        if create_departments:
            created = await self._ensure_template_departments(workspace_id, template)

        settings = dict(ws.settings or {})
        sd = dict(settings.get("service_desk") or {})
        sd["industry_template"] = template.slug
        if apply_terminology:
            sd["terminology"] = template.resolved_terminology()
        settings["service_desk"] = sd
        ws.settings = settings  # reassign so SQLAlchemy tracks the JSONB change
        await self.db.flush()

        logger.info(
            "Applied service desk template %s to workspace %s by %s "
            "(+%d stakeholders, +%d request types, departments=%s, terminology=%s)",
            template.slug, workspace_id, developer_id or "unknown",
            added_s, added_r, created, apply_terminology,
        )
        return {
            "template_slug": template.slug,
            "stakeholders_added": added_s,
            "request_types_added": added_r,
            "departments_created": created,
            "terminology_applied": apply_terminology,
        }

    async def _ensure_template_departments(self, workspace_id: str, template) -> list[str]:
        """Create any department the template's stakeholders route to. Idempotent."""
        existing = {
            fk
            for fk in (
                await self.db.execute(
                    select(Department.function_key).where(
                        Department.workspace_id == workspace_id,
                        Department.function_key.isnot(None),
                    )
                )
            ).scalars().all()
        }
        needed = {
            s.function_key
            for s in template.stakeholders
            if s.semantics == "internal" and s.function_key
        }
        # Through OrganizationService rather than constructing Department rows
        # here: it owns unique-slug resolution, the materialised path/depth, and
        # the one-department-per-function-key check.
        from aexy.schemas.organization import DepartmentCreate
        from aexy.services.organization_service import OrganizationService

        org = OrganizationService(self.db)
        created: list[str] = []
        for spec in template.departments:
            if spec.function_key not in needed or spec.function_key in existing:
                continue
            await org.create_department(
                workspace_id,
                DepartmentCreate(name=spec.name, function_key=spec.function_key),
            )
            existing.add(spec.function_key)
            created.append(spec.name)
        return created

    # ----------------------------------------------------------- taxonomy

    async def list_stakeholders(self, workspace_id: str) -> list[ServiceDeskStakeholder]:
        # Deliberately does NOT seed. An empty list is how the UI knows the desk
        # has never been set up, so it can offer the industry-template picker
        # instead of an empty queue board with no columns. Seeding here made every
        # desk look configured the moment anyone opened it, which silently
        # replaced that choice with the neutral default.
        #
        # Intake still seeds as a last resort (see `load_taxonomy` in
        # `create_ticket`) so an email to an unconfigured desk is never dropped.
        return list(
            (
                await self.db.execute(
                    select(ServiceDeskStakeholder)
                    .where(ServiceDeskStakeholder.workspace_id == workspace_id)
                    .order_by(ServiceDeskStakeholder.position, ServiceDeskStakeholder.slug)
                )
            ).scalars().all()
        )

    async def create_stakeholder(self, workspace_id: str, data) -> ServiceDeskStakeholder:
        if data.semantics == "closed":
            clash = (
                await self.db.execute(
                    select(ServiceDeskStakeholder.slug).where(
                        ServiceDeskStakeholder.workspace_id == workspace_id,
                        ServiceDeskStakeholder.semantics == "closed",
                    )
                )
            ).scalars().first()
            if clash is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"This workspace already has a terminal stakeholder ({clash!r}). "
                        "A second one would make 'closed' ambiguous for the breach clock."
                    ),
                )
        row = ServiceDeskStakeholder(
            id=str(uuid4()),
            workspace_id=workspace_id,
            slug=data.slug,
            label=data.label,
            semantics=data.semantics,
            function_key=data.function_key,
            position=data.position,
            is_active=data.is_active,
        )
        self.db.add(row)
        try:
            await self.db.flush()
        except IntegrityError:
            raise HTTPException(
                status_code=409, detail=f"A stakeholder with slug {data.slug!r} already exists"
            ) from None
        return row

    async def update_stakeholder(self, workspace_id: str, stakeholder_id: str, data):
        row = await self._get_stakeholder(workspace_id, stakeholder_id)
        payload = data.model_dump(exclude_unset=True)

        if payload.get("semantics") == "closed" and row.semantics != "closed":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Changing a stakeholder to terminal would silently close every ticket "
                    "sitting in it. Create a terminal stakeholder instead."
                ),
            )
        # Retiring the terminal bucket leaves nothing to close tickets into.
        if row.semantics == "closed" and payload.get("is_active") is False:
            raise HTTPException(
                status_code=409,
                detail="The terminal stakeholder cannot be deactivated — tickets could never be closed.",
            )
        for k, v in payload.items():
            setattr(row, k, v)
        await self.db.flush()
        return row

    async def delete_stakeholder(self, workspace_id: str, stakeholder_id: str) -> None:
        """Refuses while tickets or ledger history still reference the slug.

        Deleting anyway would leave rows pointing at a bucket nothing can resolve:
        the tickets would drop out of every queue and their TAT history would stop
        making sense. Deactivating hides it from pickers while keeping history
        readable, which is what a caller almost always means.
        """
        row = await self._get_stakeholder(workspace_id, stakeholder_id)
        if row.semantics == "closed":
            raise HTTPException(
                status_code=409,
                detail="The terminal stakeholder cannot be deleted — tickets could never be closed.",
            )
        in_use = (
            await self.db.execute(
                select(func.count(ServiceDeskTicket.id)).where(
                    ServiceDeskTicket.workspace_id == workspace_id,
                    ServiceDeskTicket.pending_with == row.slug,
                )
            )
        ).scalar() or 0
        history = (
            await self.db.execute(
                select(func.count(TicketPendingSegment.id)).where(
                    TicketPendingSegment.workspace_id == workspace_id,
                    TicketPendingSegment.pending_with == row.slug,
                )
            )
        ).scalar() or 0
        if in_use or history:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{row.label} is referenced by {in_use} open ticket(s) and {history} "
                    "history entry(ies). Deactivate it instead to hide it from new work "
                    "while keeping past tickets readable."
                ),
            )
        await self.db.delete(row)
        await self.db.flush()

    async def _get_stakeholder(self, workspace_id: str, stakeholder_id: str) -> ServiceDeskStakeholder:
        row = (
            await self.db.execute(
                select(ServiceDeskStakeholder).where(
                    ServiceDeskStakeholder.id == stakeholder_id,
                    ServiceDeskStakeholder.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Stakeholder not found")
        return row

    async def list_request_types(self, workspace_id: str) -> list[ServiceDeskRequestType]:
        # Non-seeding, for the same reason as `list_stakeholders`.
        return list(
            (
                await self.db.execute(
                    select(ServiceDeskRequestType)
                    .where(ServiceDeskRequestType.workspace_id == workspace_id)
                    .order_by(ServiceDeskRequestType.position, ServiceDeskRequestType.slug)
                )
            ).scalars().all()
        )

    async def create_request_type(self, workspace_id: str, data) -> ServiceDeskRequestType:
        if data.is_default:
            await self._clear_default_request_type(workspace_id)
        row = ServiceDeskRequestType(
            id=str(uuid4()),
            workspace_id=workspace_id,
            slug=data.slug,
            label=data.label,
            is_default=data.is_default,
            position=data.position,
            is_active=data.is_active,
        )
        self.db.add(row)
        try:
            await self.db.flush()
        except IntegrityError:
            raise HTTPException(
                status_code=409, detail=f"A request type with slug {data.slug!r} already exists"
            ) from None
        return row

    async def update_request_type(self, workspace_id: str, request_type_id: str, data):
        row = await self._get_request_type(workspace_id, request_type_id)
        payload = data.model_dump(exclude_unset=True)
        # Only one row may carry the flag, so clear the incumbent before setting
        # it here — otherwise the partial unique index rejects the write.
        if payload.get("is_default"):
            await self._clear_default_request_type(workspace_id, except_id=row.id)
        for k, v in payload.items():
            setattr(row, k, v)
        await self.db.flush()
        return row

    async def delete_request_type(self, workspace_id: str, request_type_id: str) -> None:
        row = await self._get_request_type(workspace_id, request_type_id)
        in_use = (
            await self.db.execute(
                select(func.count(ServiceDeskTicket.id)).where(
                    ServiceDeskTicket.workspace_id == workspace_id,
                    ServiceDeskTicket.request_type == row.slug,
                )
            )
        ).scalar() or 0
        if in_use:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{row.label} is used by {in_use} ticket(s). Deactivate it instead to "
                    "keep it off new tickets while leaving existing ones readable."
                ),
            )
        await self.db.delete(row)
        await self.db.flush()

    async def _get_request_type(self, workspace_id: str, request_type_id: str) -> ServiceDeskRequestType:
        row = (
            await self.db.execute(
                select(ServiceDeskRequestType).where(
                    ServiceDeskRequestType.id == request_type_id,
                    ServiceDeskRequestType.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Request type not found")
        return row

    async def _clear_default_request_type(self, workspace_id: str, except_id: str | None = None) -> None:
        stmt = select(ServiceDeskRequestType).where(
            ServiceDeskRequestType.workspace_id == workspace_id,
            ServiceDeskRequestType.is_default.is_(True),
        )
        if except_id:
            stmt = stmt.where(ServiceDeskRequestType.id != except_id)
        for row in (await self.db.execute(stmt)).scalars().all():
            row.is_default = False
        await self.db.flush()

    # ----------------------------------------------------------- tickets

    async def list_tickets(
        self, workspace_id: str, developer_id: str | None = None
    ) -> list[ServiceDeskTicketResponse]:
        query = (
            select(ServiceDeskTicket, Ticket, ServiceDeskAccount)
            .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
            .outerjoin(ServiceDeskAccount, ServiceDeskAccount.id == ServiceDeskTicket.account_id)
            .where(ServiceDeskTicket.workspace_id == workspace_id)
            .order_by(Ticket.created_at.desc())
        )
        if developer_id is not None:
            clause = await resolve_scope_clause(self.db, workspace_id, developer_id)
            if clause is not None:
                query = query.where(clause)
        rows = (await self.db.execute(query)).all()
        prefix = await ticket_prefix(workspace_id=workspace_id, db=self.db)
        out: list[ServiceDeskTicketResponse] = []
        for sd, ticket, account in rows:
            out.append(
                ServiceDeskTicketResponse(
                    id=sd.id,
                    ticket_id=sd.ticket_id,
                    workspace_id=sd.workspace_id,
                    ticket_number=ticket.ticket_number,
                    display_id=display_id(prefix, ticket.ticket_number),
                    subject=(ticket.field_values or {}).get("subject"),
                    requester_email=ticket.submitter_email,
                    requester_name=ticket.submitter_name,
                    status=ticket.status,
                    product_id=sd.product_id,
                    account_id=sd.account_id,
                    account_name=account.name if account else None,
                    vendor_id=sd.vendor_id,
                    assigned_owner_id=ticket.assignee_id,
                    request_type=sd.request_type,
                    pending_with=sd.pending_with,
                    origin=sd.origin,
                    needs_triage=sd.needs_triage,
                    ai_confidence=sd.ai_confidence,
                    created_at=sd.created_at,
                )
            )
        return out

    async def create_manual_ticket(self, workspace_id: str, data: ManualTicketCreate) -> str:
        """Log a phone/WhatsApp request as a ticket (same fields, origin=manual)."""
        from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

        # A manual ticket has no mailbox. It used to pass a synthetic, unsaved
        # ServiceDeskMailbox — which would now violate the mailbox_id FK — and
        # intake handles None directly (outbound falls back to EmailService).
        intake = ServiceDeskIntakeService(self.db)
        email = InboundEmail(
            to="manual@local",
            from_email=data.requester_email or "manual@local",
            from_name=data.requester_name,
            subject=data.subject,
            body_text=data.body,
        )
        ticket = await intake.create_ticket(workspace_id, email, None, source="service_desk_manual")
        # override AI defaults with the explicitly-provided fields
        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
            )
        ).scalar_one()
        sd.origin = "manual"
        # `request_type` is optional on the wire: there is no universal default to
        # hardcode any more, so omitting it means "the workspace's default", which
        # intake has already applied. Only override when one was actually sent —
        # assigning None straight through violated the NOT NULL column.
        if data.request_type is not None:
            taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
            if not taxonomy.has_request_type(data.request_type):
                known = ", ".join(r.slug for r in taxonomy.request_types) or "none configured"
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Unknown request type {data.request_type!r} for this workspace "
                        f"(known: {known})"
                    ),
                )
            sd.request_type = data.request_type
        # These ids come from the request body — confirm they are ours.
        if data.product_id:
            await self._require_own(ServiceDeskProduct, workspace_id, data.product_id, "Product")
            sd.product_id = data.product_id
        if data.account_id:
            await self._require_own(ServiceDeskAccount, workspace_id, data.account_id, "Account")
            sd.account_id = data.account_id
        await self.db.flush()

        # Commit before the acknowledgement goes out, so a rollback can't leave
        # the requester holding a receipt for a ticket that never existed.
        await self.db.commit()
        await intake.flush_notifications()
        return ticket.id

    async def _require_own(self, model, workspace_id: str, row_id: str, label: str) -> None:
        found = (
            await self.db.execute(
                select(model.id).where(model.id == row_id, model.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()
        if found is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found in this workspace"
            )
