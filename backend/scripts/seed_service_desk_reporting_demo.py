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
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

sys.path.insert(0, "/app/src")

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


async def main() -> None:
    async with get_async_session() as db:
        first = Developer(id=str(uuid4()), email=f"dana@{DOMAIN}", name="Dana")
        second = Developer(id=str(uuid4()), email=f"rowan@{DOMAIN}", name="Rowan")
        db.add_all([first, second])
        await db.flush()

        workspace = Workspace(
            id=str(uuid4()), name="Northwind", slug="northwind", owner_id=first.id
        )
        # Terminology set explicitly so the reports demonstrate that every label
        # comes from the workspace rather than from a template default.
        workspace.settings = {
            "service_desk": {
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
        }
        db.add(workspace)
        await db.flush()

        for developer in (first, second):
            db.add(
                WorkspaceMember(
                    workspace_id=workspace.id,
                    developer_id=developer.id,
                    role="admin",
                    status="active",
                )
            )

        form = TicketForm(
            id=str(uuid4()),
            workspace_id=workspace.id,
            name="Service Desk",
            slug="sd",
            created_by_id=first.id,
        )
        account = ServiceDeskAccount(
            id=str(uuid4()), workspace_id=workspace.id, name="Northwind Ltd"
        )
        product = ServiceDeskProduct(
            id=str(uuid4()), workspace_id=workspace.id, name="Standard Cover"
        )
        db.add_all([form, account, product])
        await db.flush()
        await seed_taxonomy(db, workspace.id, get_template("insurance_broking"))

        counter = 0

        async def ticket(owner: Developer, stages: list[tuple[str, float]], subject: str) -> None:
            """One ticket whose ledger is ``stages`` — (stakeholder slug, hours)."""
            nonlocal counter
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
    asyncio.run(main())
