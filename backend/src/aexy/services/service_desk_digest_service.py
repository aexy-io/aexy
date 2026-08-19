"""Service Desk daily digest — per-owner + desk-lead open-ticket summaries.

Each member of the desk team receives their own open tickets; the desk lead (that
department's head, else the workspace owner) receives all open tickets. Sent on
the workspace's own schedule (see temporal/activities/service_desk.py) and
reusable on demand.

"The desk team" is resolved from the workspace's taxonomy — the department behind
its first internal stakeholder — rather than from a hardcoded ``ops_kam``
function key, which only existed in one customer's org chart.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskProduct,
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_clock import DEFAULT_DIGEST_HOURS, load_clock
from aexy.services.service_desk_config import (
    digest_enabled,
    display_id,
    normalise_email_list,
    normalise_id_list,
    ticket_prefix,
)
from aexy.services.service_desk_service import has_full_service_desk_view
from aexy.services.service_desk_links import desk_queue_url
from aexy.services.service_desk_taxonomy import load_taxonomy

logger = logging.getLogger(__name__)

_DAY = 86400.0


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass
class DigestRow:
    display_id: str
    account: str | None
    product: str | None
    request_type: str
    pending_with: str
    days_in_stage: float
    overall_days: float
    breaching: bool
    assignee_id: str | None


@dataclass
class Digest:
    recipient_email: str
    recipient_name: str
    is_desk_lead: bool
    rows: list[DigestRow] = field(default_factory=list)

    @property
    def total_open(self) -> int:
        return len(self.rows)

    @property
    def breaching(self) -> int:
        return sum(1 for r in self.rows if r.breaching)


class ServiceDeskDigestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _open_rows(self, workspace_id: str) -> list[DigestRow]:
        # seed=False: the digest walks every workspace on a schedule, and a
        # read-only report has no business creating taxonomy rows as a side effect.
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        closed_slug = taxonomy.closed_slug

        query = (
            select(ServiceDeskTicket, Ticket, ServiceDeskAccount.name, ServiceDeskProduct.name)
            .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
            .outerjoin(ServiceDeskAccount, ServiceDeskAccount.id == ServiceDeskTicket.account_id)
            .outerjoin(ServiceDeskProduct, ServiceDeskProduct.id == ServiceDeskTicket.product_id)
            .where(ServiceDeskTicket.workspace_id == workspace_id)
        )
        if closed_slug is not None:
            query = query.where(ServiceDeskTicket.pending_with != closed_slug)
        rows = (await self.db.execute(query)).all()
        open_segs = dict(
            (
                await self.db.execute(
                    select(TicketPendingSegment.ticket_id, TicketPendingSegment.entered_at).where(
                        TicketPendingSegment.workspace_id == workspace_id,
                        TicketPendingSegment.exited_at.is_(None),
                    )
                )
            ).all()
        )
        now = datetime.now(timezone.utc)
        clock = await load_clock(self.db, workspace_id)
        # Resolved once for the whole digest — a lookup per row would be a query
        # per open ticket.
        prefix = await ticket_prefix(self.db, workspace_id)
        out: list[DigestRow] = []
        for sd, ticket, account_name, product_name in rows:
            entered = open_segs.get(sd.ticket_id)
            # Working hours in the workspace's timezone, matching the dashboard
            # and ticket detail — a digest that counted nights and weekends would
            # flag a ticket that has had no working time yet.
            stage_seconds = clock.seconds_between(_aware(entered), now) if entered else 0
            stage_days = clock.to_days(stage_seconds)
            overall_days = round(int((now - _aware(ticket.created_at)).total_seconds()) / _DAY, 2)
            out.append(
                DigestRow(
                    display_id=display_id(prefix, ticket.ticket_number),
                    account=account_name,
                    product=product_name,
                    request_type=sd.request_type,
                    pending_with=sd.pending_with,
                    days_in_stage=stage_days,
                    overall_days=overall_days,
                    breaching=clock.is_breaching(stage_seconds, sd.pending_with),
                    assignee_id=ticket.assignee_id,
                )
            )
        return out

    async def build_digests(self, workspace_id: str) -> list[Digest]:
        all_rows = await self._open_rows(workspace_id)
        settings = await self._settings(workspace_id)

        # The desk team: its members get a personal digest, its head gets the lot.
        # The department named in Service Desk settings, or — with none named — the
        # one behind the desk's first internal queue. Deliberately the same
        # resolution intake uses to pick an owner: a workspace where the digest and
        # auto-assignment disagreed about who runs the desk would be worse than
        # either answer on its own.
        #
        # Was pinned to `function_key == "ops_kam"`, so any workspace that didn't
        # happen to name a department that way got no per-person digests at all.
        from aexy.services.service_desk_service import resolve_desk_department

        dept = await resolve_desk_department(self.db, workspace_id)

        digests: list[Digest] = []
        owner_ids: list[str] = []
        if dept is not None:
            # Only people still on the team. Department rows are not removed when
            # someone leaves the workspace (which is exactly why intake's
            # `_random_owner` joins WorkspaceMember), so without this a departed
            # employee keeps receiving the desk's open-ticket list three times a
            # day — including ticket subjects and account names, after they have
            # already lost API access to the same rows.
            member_ids = (
                await self.db.execute(
                    select(DepartmentMember.developer_id)
                    .join(
                        WorkspaceMember,
                        (WorkspaceMember.developer_id == DepartmentMember.developer_id)
                        & (WorkspaceMember.workspace_id == workspace_id),
                    )
                    .where(
                        DepartmentMember.department_id == dept.id,
                        WorkspaceMember.status == "active",
                    )
                    .distinct()
                )
            ).scalars().all()
            # People who asked not to receive it. Membership of the desk
            # department is how work is routed, not a statement about who wants
            # three emails a day — and before this the only way out of the list
            # was to leave the department, which changes routing.
            excluded = set(normalise_id_list(settings.get("digest_excluded_recipients")))
            owner_ids = [dev_id for dev_id in member_ids if str(dev_id) not in excluded]
            for dev_id in owner_ids:
                dev = await self.db.get(Developer, dev_id)
                if not dev or not dev.email:
                    continue
                rows = [r for r in all_rows if r.assignee_id == dev_id]
                digests.append(Digest(dev.email, dev.name or dev.email, False, rows))

        # Desk lead: department head, else workspace owner
        desk_lead_id = dept.head_id if dept else None
        if not desk_lead_id:
            desk_lead_id = (
                await self.db.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
            ).scalar_one_or_none()
        if desk_lead_id:
            head = await self.db.get(Developer, desk_lead_id)
            if head and head.email:
                # Being head of the department is not by itself permission to
                # read every ticket — that is can_view_all_service_desk /
                # can_manage_service_desk. A head without it gets the same
                # assigned-only digest a KAM gets, so the digest can't email
                # around the row scope the API enforces.
                full_view = await has_full_service_desk_view(
                    self.db, workspace_id, desk_lead_id
                )
                if full_view:
                    digests.append(Digest(head.email, head.name or head.email, True, list(all_rows)))
                elif desk_lead_id not in owner_ids:
                    digests.append(
                        Digest(
                            head.email,
                            head.name or head.email,
                            False,
                            [r for r in all_rows if r.assignee_id == desk_lead_id],
                        )
                    )

        # Addresses somebody added by hand: a manager, a client-services lead, an
        # ops mailbox — people who want the desk's summary without being in the
        # department that runs it, which was previously impossible to express.
        #
        # They receive the desk-wide view, so this is a deliberate disclosure
        # rather than a subscription: the settings page says so, and only
        # somebody holding can_manage_service_desk can add one.
        for address in normalise_email_list(settings.get("digest_extra_recipients")):
            if any(d.recipient_email.lower() == address for d in digests):
                continue
            digests.append(Digest(address, address, True, list(all_rows)))

        return digests

    @staticmethod
    def tickets_block(digest: Digest) -> str:
        """The per-ticket lines injected into the (editable) digest template."""
        if not digest.rows:
            return "  (no open tickets)"
        lines = []
        for r in digest.rows:
            flag = " ⚠" if r.breaching else ""
            lines.append(
                f"  {r.display_id} | {r.account or '—'} | {r.product or '—'} | {r.request_type} | "
                f"pending: {r.pending_with} | {r.days_in_stage} working days in stage | "
                f"{r.overall_days}d overall{flag}"
            )
        return "\n".join(lines)

    async def send_workspace_digests(self, workspace_id: str, date_label: str | None = None) -> int:
        from aexy.services.service_desk_links import desk_queue_url
        from aexy.services.service_desk_mailer import SEND_OK, send_service_desk_email
        from aexy.services.service_desk_templates import render_sd

        # The copy quotes the breach threshold, which is per workspace now — and
        # the timestamps are read in the workspace's own timezone, because a
        # digest stamped in UTC arrives labelled with yesterday's date for half
        # the world.
        clock = await load_clock(self.db, workspace_id)
        local_now = datetime.now(timezone.utc).astimezone(clock.tz)
        date_label = date_label or local_now.strftime("%Y-%m-%d")
        # A desk on the default schedule gets three of these a day, and every one
        # of them said "Daily … — <today>" — identical subjects that mail clients
        # thread together, so the 5pm summary hid inside the 9am one.
        time_label = local_now.strftime("%H:%M")
        digests = await self.build_digests(workspace_id)
        mailbox = await self._desk_mailbox(workspace_id)
        sent = 0
        for d in digests:
            subject, body = await render_sd(
                self.db,
                workspace_id,
                "digest",
                {
                    "recipient_name": d.recipient_name,
                    "scope": "across the whole desk" if d.is_desk_lead else "assigned to you",
                    "total_open": d.total_open,
                    "breaching": d.breaching,
                    "breach_days": clock.breach_red_days,
                    "tickets_block": self.tickets_block(d),
                    "date": date_label,
                    "time": time_label,
                    # The in-app queue, not a public share link: every recipient
                    # here is a member of the workspace, and the app applies the
                    # row scope their role actually has.
                    "desk_url": desk_queue_url(),
                },
            )
            try:
                # From the desk's own mailbox where there is one, falling back to
                # the platform sender. The digest used to leave from the
                # deployment's address while signing off as the workspace — an
                # internal mail, so lower stakes than a receipt, but a
                # discrepancy visible in every inbox on the desk.
                #
                # Marked as ours, and as machine-generated, by either route. A
                # desk team member is often the shared ops mailbox itself, so the
                # digest lands in the inbox the desk watches — unmarked, it came
                # back through the sync and opened a ticket whose requester was
                # this application.
                outcome = await send_service_desk_email(
                    self.db, mailbox, d.recipient_email, subject, body
                )
                if outcome != SEND_OK:
                    logger.info(
                        "Service desk: digest to %s not delivered (%s)",
                        d.recipient_email,
                        outcome,
                    )
                    continue
                sent += 1
            except Exception as exc:  # noqa: BLE001 — digest send is best-effort
                logger.info("Service desk: digest to %s skipped (%s)", d.recipient_email, exc)
        return sent

    async def is_due(self, workspace_id: str, now: datetime | None = None) -> bool:
        """Whether this workspace's local clock has just reached a digest hour.

        The schedule fires every half hour for the whole deployment; *when* a desk
        gets its digest is the workspace's own setting, read in the workspace's own
        timezone. Previously one cron sent every digest at 09:00/13:00/17:00
        Asia/Kolkata regardless of where the desk was.

        ``minute < 30`` keeps each hour to a single window, so the 09:00 and 09:30
        firings can't both send the 9 o'clock digest.

        A desk that has switched the digest off is never due. There was no way to
        express that at all: an empty hour list fell back to the default below,
        and the API refused to store one — so the only escape from three emails a
        day was a mail filter.
        """
        sd = await self._settings(workspace_id)
        if not digest_enabled(sd):
            return False
        clock = await load_clock(self.db, workspace_id)
        hours = sd.get("digest_hours")
        if not isinstance(hours, list) or not hours:
            hours = list(DEFAULT_DIGEST_HOURS)
        local = (now or datetime.now(timezone.utc)).astimezone(clock.tz)
        return local.hour in {h for h in hours if isinstance(h, int)} and local.minute < 30

    async def preview(self, workspace_id: str, developer_id: str) -> dict:
        """This desk's digest configuration, and the caller's own copy of it.

        Rendered rather than described, because "who receives this and what does
        it say" is the whole question somebody has when they open the settings —
        and every one of those answers used to require waiting until 5pm.
        """
        from aexy.services.service_desk_clock import DEFAULT_DIGEST_HOURS
        from aexy.services.service_desk_templates import render_sd

        settings = await self._settings(workspace_id)
        clock = await load_clock(self.db, workspace_id)
        digests = await self.build_digests(workspace_id)

        developer = await self.db.get(Developer, developer_id)
        address = (developer.email or "").lower() if developer else ""
        mine = next(
            (d for d in digests if d.recipient_email.lower() == address), None
        )

        subject = body = None
        if mine is not None:
            local_now = datetime.now(timezone.utc).astimezone(clock.tz)
            subject, body = await render_sd(
                self.db,
                workspace_id,
                "digest",
                {
                    "recipient_name": mine.recipient_name,
                    "scope": "across the whole desk" if mine.is_desk_lead else "assigned to you",
                    "total_open": mine.total_open,
                    "breaching": mine.breaching,
                    "breach_days": clock.breach_red_days,
                    "tickets_block": self.tickets_block(mine),
                    "date": local_now.strftime("%Y-%m-%d"),
                    "time": local_now.strftime("%H:%M"),
                    "desk_url": desk_queue_url(),
                },
            )

        return {
            "enabled": digest_enabled(settings),
            "hours": list(settings.get("digest_hours") or DEFAULT_DIGEST_HOURS),
            "timezone": str(clock.tz),
            "recipients": [d.recipient_email for d in digests],
            "subject": subject,
            "body": body,
        }

    async def send_for_workspace_now(self, workspace_id: str) -> int:
        """Send this desk's digest immediately, ignoring the clock.

        Not the off switch, though. A desk that turned the digest off is not
        asking to be surprised by one because somebody opened the settings page
        and pressed a button.
        """
        if not digest_enabled(await self._settings(workspace_id)):
            return 0
        return await self.send_workspace_digests(workspace_id)

    async def _desk_mailbox(self, workspace_id: str) -> ServiceDeskMailbox | None:
        """The mailbox the desk's own mail leaves from, if it has one.

        Oldest active mailbox rather than an arbitrary one, so a workspace with
        two of them sends every digest from the same address instead of
        alternating between them.
        """
        return (
            await self.db.execute(
                select(ServiceDeskMailbox)
                .where(
                    ServiceDeskMailbox.workspace_id == workspace_id,
                    ServiceDeskMailbox.is_active.is_(True),
                )
                .order_by(ServiceDeskMailbox.created_at, ServiceDeskMailbox.id)
                .limit(1)
            )
        ).scalars().first()

    async def _settings(self, workspace_id: str) -> dict:
        ws = await self.db.get(Workspace, workspace_id)
        return ((ws.settings or {}).get("service_desk") or {}) if ws else {}

    async def send_all(self, now: datetime | None = None, only_due: bool = True) -> int:
        """Send digests for every workspace whose local digest hour has arrived.

        Each workspace is isolated: the per-email send was already guarded, but a
        failure in `build_digests` or template rendering escaped and aborted the
        whole activity, so one workspace with (say) a malformed template silently
        cost every workspace after it in the list its digest.

        ``only_due=False`` sends for every desk regardless of the clock — used by
        the "send now" action, not by the schedule.
        """
        workspace_ids = (
            await self.db.execute(select(ServiceDeskMailbox.workspace_id).distinct())
        ).scalars().all()
        total = 0
        for ws_id in workspace_ids:
            try:
                if only_due and not await self.is_due(ws_id, now):
                    continue
                total += await self.send_workspace_digests(ws_id)
            except Exception:  # noqa: BLE001 — one bad workspace must not stop the rest
                logger.exception("Service desk: digest failed for workspace %s", ws_id)
                # The session may need a rollback before the next workspace's
                # queries can run.
                await self.db.rollback()
        return total
