"""Seed a Service Desk with enough history for the reports to say something.

The reporting pages only mean anything against tickets that have actually moved
between stakeholders, and a fresh desk has none. This builds a small desk whose
ledger exercises every measure the TAT report and the scorecard compute: a
clean ticket, a fast one, one that sat a long time with an external party, one
still open past the breach target, and one that was reopened.

It backs `frontend/e2e/service-desk-reports.live.spec.ts`, whose assertions name
figures produced here — change the stages below and that spec needs updating too.

    docker cp scripts/seed_service_desk_reporting_demo.py aexy-backend:/tmp/
    docker exec aexy-backend python /tmp/seed_service_desk_reporting_demo.py

With no arguments it builds its own "Northwind" workspace, which is what that
spec wants: a desk nobody else is writing to. Pass `--workspace <id>` to put the
same history into a workspace that already exists — how the documentation
screenshots get a desk to photograph inside the demo workspace, so the docs show
one product rather than a different sample company per module.

Idempotent either way. Every row is looked up before it is written and the
tickets are matched by subject, so a second run adds nothing — the first version
of this script created its two developers unconditionally and died on a unique
violation the moment anybody ran it twice.
"""

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

sys.path.insert(0, "/app/src")

from sqlalchemy import func, select  # noqa: E402

from aexy.core.database import get_async_session  # noqa: E402
from aexy.models.developer import Developer  # noqa: E402
from aexy.models.service_desk import (  # noqa: E402
    ServiceDeskAccount,
    ServiceDeskProduct,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm  # noqa: E402
from aexy.models.workspace import Workspace, WorkspaceMember  # noqa: E402
from aexy.services.service_desk_industry_templates import get_template  # noqa: E402
from aexy.services.service_desk_taxonomy import seed_taxonomy  # noqa: E402

# A Wednesday at 10:30 in the default shift, so durations added to it are not
# silently clipped at the 18:30 close and the arithmetic stays readable.
BASE = datetime(2026, 8, 26, 5, 0, tzinfo=timezone.utc)

DOMAIN = "northwind.example"


#: Applied only to a workspace that has no Service Desk settings of its own.
#: Set explicitly rather than left to the template so the reports demonstrate
#: that every label comes from the workspace.
DESK_SETTINGS = {
    "industry_template": "insurance_broking",
    "terminology": {
        "account": "Partner",
        "accounts": "Partners",
        "vendor": "Insurer",
        "vendors": "Insurers",
        "product": "Line of Business",
        "products": "Lines of Business",
        "owner": "KAM",
        "owners": "KAMs",
    },
}


async def _developer(db, email: str, name: str) -> Developer:
    """The person, created only if this database has never seen them.

    `developers.email` is unique, and inserting unconditionally is what made a
    second run of this script impossible.
    """
    found = (
        await db.execute(select(Developer).where(Developer.email == email))
    ).scalar_one_or_none()
    if found:
        return found

    made = Developer(id=str(uuid4()), email=email, name=name)
    db.add(made)
    await db.flush()
    return made


async def _member(db, workspace_id: str, developer_id: str) -> None:
    found = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.developer_id == developer_id,
            )
        )
    ).scalar_one_or_none()
    if found:
        return

    db.add(
        WorkspaceMember(
            workspace_id=workspace_id,
            developer_id=developer_id,
            role="admin",
            status="active",
        )
    )


async def _workspace(db, workspace_id: str | None, owner: Developer) -> Workspace:
    """The desk's home: an existing workspace, or a fresh Northwind."""
    if workspace_id:
        found = (
            await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ).scalar_one_or_none()
        if found is None:
            sys.exit(f"no workspace {workspace_id} in this database")

        # Never clobber a desk that is already configured — this script exists
        # to add history, and rewriting somebody's terminology while doing it
        # would relabel every screen they have.
        settings = dict(found.settings or {})
        if not settings.get("service_desk"):
            settings["service_desk"] = DESK_SETTINGS
            found.settings = settings
        return found

    made = Workspace(
        id=str(uuid4()), name="Northwind", slug="northwind", owner_id=owner.id
    )
    made.settings = {"service_desk": DESK_SETTINGS}
    db.add(made)
    await db.flush()
    return made


async def main(workspace_id: str | None = None) -> None:
    async with get_async_session() as db:
        first = await _developer(db, f"dana@{DOMAIN}", "Dana")
        second = await _developer(db, f"rowan@{DOMAIN}", "Rowan")

        workspace = await _workspace(db, workspace_id, first)

        for developer in (first, second):
            await _member(db, workspace.id, developer.id)

        form = (
            await db.execute(
                select(TicketForm).where(
                    TicketForm.workspace_id == workspace.id, TicketForm.slug == "sd"
                )
            )
        ).scalar_one_or_none()
        if form is None:
            form = TicketForm(
                id=str(uuid4()),
                workspace_id=workspace.id,
                name="Service Desk",
                slug="sd",
                created_by_id=first.id,
            )
            db.add(form)

        account = (
            await db.execute(
                select(ServiceDeskAccount).where(
                    ServiceDeskAccount.workspace_id == workspace.id,
                    ServiceDeskAccount.name == "Northwind Ltd",
                )
            )
        ).scalar_one_or_none()
        if account is None:
            account = ServiceDeskAccount(
                id=str(uuid4()), workspace_id=workspace.id, name="Northwind Ltd"
            )
            db.add(account)

        product = (
            await db.execute(
                select(ServiceDeskProduct).where(
                    ServiceDeskProduct.workspace_id == workspace.id,
                    ServiceDeskProduct.name == "Standard Cover",
                )
            )
        ).scalar_one_or_none()
        if product is None:
            product = ServiceDeskProduct(
                id=str(uuid4()), workspace_id=workspace.id, name="Standard Cover"
            )
            db.add(product)

        await db.flush()
        await seed_taxonomy(db, workspace.id, get_template("insurance_broking"))

        # Continue the workspace's own numbering rather than starting at 1:
        # `uq_ticket_number` is (workspace_id, ticket_number), so seeding into a
        # workspace that already has tickets collides on the first insert.
        highest = (
            await db.execute(
                select(func.max(Ticket.ticket_number)).where(
                    Ticket.workspace_id == workspace.id
                )
            )
        ).scalar()

        # Matched on subject, so a second run into the same workspace adds
        # nothing rather than a second copy of the same five tickets.
        seeded = {
            title
            for title in (
                await db.execute(
                    select(Ticket.title).where(Ticket.workspace_id == workspace.id)
                )
            )
            .scalars()
            .all()
        }

        counter = highest or 0

        async def ticket(owner: Developer, stages: list[tuple[str, float]], subject: str) -> None:
            """One ticket whose ledger is ``stages`` — (stakeholder slug, hours)."""
            nonlocal counter
            if subject in seeded:
                return
            counter += 1
            row = Ticket(
                id=str(uuid4()),
                workspace_id=workspace.id,
                form_id=form.id,
                ticket_number=counter,
                submitter_email=f"sam@{DOMAIN}",
                submitter_name="Sam",
                assignee_id=owner.id,
                title=subject,
                field_values={"subject": subject},
            )
            db.add(row)
            # The segments carry a foreign key to the ticket, so it has to exist
            # before they are added.
            await db.flush()
            # `created_at` has a server default of now(), so it must be set AFTER
            # the insert. Leave it and the ticket looks created today and closed
            # last week, which the report faithfully renders as a negative TAT.
            row.created_at = BASE

            cursor = BASE
            for index, (slug, hours) in enumerate(stages):
                is_last = index == len(stages) - 1
                exited = None if is_last and slug != "closed" else cursor + timedelta(hours=hours)
                db.add(
                    TicketPendingSegment(
                        id=str(uuid4()),
                        workspace_id=workspace.id,
                        ticket_id=row.id,
                        pending_with=slug,
                        entered_at=cursor,
                        exited_at=exited,
                    )
                )
                cursor += timedelta(hours=hours)

            if stages[-1][0] == "closed":
                row.closed_at = cursor
            db.add(
                ServiceDeskTicket(
                    id=str(uuid4()),
                    ticket_id=row.id,
                    workspace_id=workspace.id,
                    account_id=account.id,
                    product_id=product.id,
                    request_type="claims" if counter % 2 else "query",
                    pending_with=stages[-1][0],
                )
            )

        # A clean two-hop ticket, and a one-touch one.
        await ticket(first, [("kam", 2), ("insurer", 3), ("closed", 0)], "Documents pending")
        await ticket(first, [("kam", 1), ("closed", 0)], "Status check on batch")
        # 30 wall-clock hours with the insurer is 14 working hours on a 9h shift:
        # the split the TAT report exists to show.
        await ticket(
            first, [("kam", 3), ("insurer", 30), ("kam", 1), ("closed", 0)], "Payout invoice"
        )
        # Still open, so its current stage runs past the breach target.
        await ticket(second, [("kam", 6), ("partner", 4)], "New batch for issuance")
        # Closed, reopened by a reply, closed again — two visits to the terminal
        # bucket, which is what "Reopened?" counts.
        await ticket(
            second,
            [("kam", 2), ("insurer", 5), ("closed", 0), ("kam", 1), ("closed", 0)],
            "Reopened request",
        )

        await db.commit()
        print("WORKSPACE_ID:", workspace.id)
        print("DEVELOPER_ID:", first.id)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--workspace",
        help="seed into this existing workspace instead of creating Northwind",
    )
    asyncio.run(main(parser.parse_args().workspace))
