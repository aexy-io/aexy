"""Seed Bimaplan's org structure + Service Desk master data for a workspace.

Idempotent-ish: skips departments/master-data rows that already exist.

Usage:
    docker exec aexy-backend python scripts/seed_bimaplan_service_desk.py --workspace <workspace_id>
    docker exec aexy-backend python scripts/seed_bimaplan_service_desk.py --workspace <id> --mailbox operations@bimaplan.co
"""

import argparse
import asyncio
import sys
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from aexy.core.database import get_async_session
from aexy.models.developer import Developer
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.organization import DepartmentCreate, MembershipCreate
from aexy.schemas.service_desk import InsurerCreate, LOBCreate, MailboxCreate, PartnerCreate
from aexy.services.organization_service import OrganizationService
from aexy.services.service_desk_service import ServiceDeskService

DEPARTMENTS = [
    ("Operations", "ops_kam"),
    ("Sales", "sales"),
    ("Finance", "finance"),
    ("Marketing", "marketing"),
    ("HR", "hr"),
]
KAMS = ["Neha", "Nehal", "Aakanksha", "Paramita"]
LOBS = [
    "Credit Life", "Daily Hospicash", "Personal Accident", "Critical Illness",
    "GMC/GHI", "Travel", "GPA", "GTL",
]
# partner name, domains, KAM name (assigned)
PARTNERS = [
    ("ABC Finance", ["abcfinance.com"], "Neha"),
    ("XYZ NBFC", ["xyznbfc.com"], "Nehal"),
    ("PQR Ltd", ["pqr.co"], "Aakanksha"),
]
INSURERS = [("XYZ Life Insurance", ["xyzlifeinsurance.com"])]


async def _get_or_create_developer(session, name: str) -> Developer:
    email = f"{name.lower()}@bimaplan.co"
    dev = (await session.execute(select(Developer).where(Developer.email == email))).scalar_one_or_none()
    if dev is None:
        dev = Developer(id=str(uuid4()), email=email, name=name)
        session.add(dev)
        await session.flush()
    return dev


async def _ensure_workspace_member(session, workspace_id: str, developer_id: str) -> None:
    """Department membership alone is not enough to be a usable KAM.

    Auto-assignment (``_random_kam``) only picks developers who are *active
    workspace members*, and every Service Desk route sits behind
    ``require_workspace_member``. A developer who exists only as a
    ``DepartmentMember`` would therefore never be assigned a ticket and could
    not open the workspace at all.
    """
    existing = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.developer_id == developer_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            WorkspaceMember(
                workspace_id=workspace_id,
                developer_id=developer_id,
                role="member",
                status="active",
            )
        )
        await session.flush()
    elif existing.status != "active":
        # Re-seeding should bring a previously removed KAM back into play.
        existing.status = "active"
        await session.flush()


async def seed(workspace_id: str, mailbox: str) -> None:
    async with get_async_session() as session:
        org = OrganizationService(session)
        sd = ServiceDeskService(session)

        # Departments (skip existing by function_key)
        existing_depts = await org.list_departments(workspace_id)
        by_fn = {d.function_key: d for d in existing_depts if d.function_key}
        dept_ids: dict[str, str] = {fn: d.id for fn, d in by_fn.items()}
        for name, fn in DEPARTMENTS:
            if fn not in dept_ids:
                created = await org.create_department(workspace_id, DepartmentCreate(name=name, function_key=fn))
                dept_ids[fn] = created.id
                print(f"  + department {name} ({fn})")

        # KAM members into Operations/KAM
        ops_id = dept_ids["ops_kam"]
        kam_dev: dict[str, str] = {}
        for kam in KAMS:
            dev = await _get_or_create_developer(session, kam)
            kam_dev[kam] = dev.id
            # Workspace membership first — add_member now requires it.
            await _ensure_workspace_member(session, workspace_id, dev.id)
            try:
                await org.add_member(workspace_id, ops_id, MembershipCreate(developer_id=dev.id, role_in_department="member"))
                print(f"  + KAM {kam}")
            except HTTPException as exc:
                if exc.status_code != 409:  # 409 = already in this department
                    raise
                print(f"  = KAM {kam} (already in Operations)")

        # LOBs
        existing_lobs = {row.name for row in await sd.list_lobs(workspace_id)}
        for lob in LOBS:
            if lob not in existing_lobs:
                await sd.create_lob(workspace_id, LOBCreate(name=lob))
        print(f"  LOBs: {len(LOBS)} ensured")

        # Partners
        existing_partners = {p.name for p in await sd.list_partners(workspace_id)}
        for name, domains, kam in PARTNERS:
            if name not in existing_partners:
                await sd.create_partner(
                    workspace_id,
                    PartnerCreate(name=name, domains=domains, assigned_kam_id=kam_dev.get(kam)),
                )
                print(f"  + partner {name} → {kam}")

        # Insurers
        existing_ins = {i.name for i in await sd.list_insurers(workspace_id)}
        for name, domains in INSURERS:
            if name not in existing_ins:
                await sd.create_insurer(workspace_id, InsurerCreate(name=name, domains=domains))
                print(f"  + insurer {name}")

        # Mailbox
        existing_mb = {m.address for m in await sd.list_mailboxes(workspace_id)}
        if mailbox not in existing_mb:
            await sd.create_mailbox(workspace_id, MailboxCreate(address=mailbox, channel="webhook"))
            print(f"  + mailbox {mailbox}")

        await session.commit()
        print("Seed complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Bimaplan Service Desk master data")
    parser.add_argument("--workspace", required=True, help="Workspace ID to seed")
    parser.add_argument("--mailbox", default="operations@bimaplan.co", help="Shared mailbox address")
    args = parser.parse_args()
    try:
        asyncio.run(seed(args.workspace, args.mailbox))
    except Exception as exc:  # noqa: BLE001
        print(f"Seed failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
