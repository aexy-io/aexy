"""Set up the Service Desk for a workspace from an industry template.

Applies a template's taxonomy (stakeholders + request types) and the departments
its internal stakeholders route to, registers a shared mailbox, and — optionally —
loads sample master data from a JSON file.

This replaced ``an earlier customer-specific seed script``, which hardcoded one company's
staff names, ``@northwind.example`` email addresses, eight insurance lines of business
and three named partners. None of that belonged in a script shipped to everyone:
a template describes a *shape*, and the names are yours.

Usage:
    # Minimum: give a workspace a working desk
    docker exec aexy-backend python scripts/seed_service_desk.py \\
        --workspace <workspace_id> --template software_support \\
        --mailbox support@example.com

    # List the templates first
    docker exec aexy-backend python scripts/seed_service_desk.py --list-templates

    # With your own accounts/products/people
    docker exec aexy-backend python scripts/seed_service_desk.py \\
        --workspace <id> --template insurance_broking \\
        --mailbox operations@example.com --sample-data my-desk.json

Sample-data JSON (every key optional):
    {
      "desk_name": "Acme Operations",
      "products":  ["Widgets", "Gadgets"],
      "owners":    [{"name": "Alex", "email": "alex@example.com"}],
      "accounts":  [{"name": "Globex", "domains": ["globex.com"], "owner": "alex@example.com"}],
      "vendors":   [{"name": "Initech", "domains": ["initech.com"]}]
    }

``--sample-data`` creates real ``Developer`` rows and real workspace memberships
for anyone under "owners", so it is opt-in and never runs by default.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from aexy.core.database import get_async_session
from aexy.models.developer import Developer
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.organization import MembershipCreate
from aexy.schemas.service_desk import (
    AccountCreate,
    MailboxCreate,
    ProductCreate,
    VendorCreate,
)
from aexy.services.organization_service import OrganizationService
from aexy.services.service_desk_industry_templates import (
    SEMANTIC_INTERNAL,
    get_template,
    list_templates,
)
from aexy.services.service_desk_service import ServiceDeskService


async def _get_or_create_developer(session, name: str, email: str) -> Developer:
    dev = (
        await session.execute(select(Developer).where(Developer.email == email))
    ).scalar_one_or_none()
    if dev is None:
        dev = Developer(id=str(uuid4()), email=email, name=name)
        session.add(dev)
        await session.flush()
    return dev


async def _ensure_workspace_member(session, workspace_id: str, developer_id: str) -> None:
    """Department membership alone is not enough to be a usable owner.

    Auto-assignment (``_random_owner``) only picks developers who are *active
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
        # Re-seeding should bring a previously removed owner back into play.
        existing.status = "active"
        await session.flush()


async def seed(
    workspace_id: str,
    template_slug: str,
    mailbox: str | None,
    sample_data: dict | None,
) -> None:
    template = get_template(template_slug)
    if template is None:
        known = ", ".join(t.slug for t in list_templates())
        raise SystemExit(f"Unknown template {template_slug!r}. Known: {known}")

    async with get_async_session() as session:
        org = OrganizationService(session)
        sd = ServiceDeskService(session)

        # Taxonomy + the departments its internal stakeholders route to. Doing
        # this through the service keeps the script and the UI on one code path.
        result = await sd.apply_industry_template(
            workspace_id,
            template.slug,
            apply_terminology=True,
            create_departments=True,
        )
        print(
            f"  template {template.name}: +{result['stakeholders_added']} stakeholders, "
            f"+{result['request_types_added']} request types"
        )
        for name in result["departments_created"]:
            print(f"  + department {name}")

        sample_data = sample_data or {}

        if desk_name := sample_data.get("desk_name"):
            await sd.update_settings(workspace_id, desk_name=desk_name)
            print(f"  desk name: {desk_name}")

        # People, into the department behind the template's first internal
        # stakeholder — the team that fields incoming mail.
        owner_ids: dict[str, str] = {}
        owners = sample_data.get("owners") or []
        if owners:
            desk_function = next(
                (
                    s.function_key
                    for s in template.stakeholders
                    if s.semantics == SEMANTIC_INTERNAL and s.function_key
                ),
                None,
            )
            depts = {d.function_key: d.id for d in await org.list_departments(workspace_id) if d.function_key}
            desk_dept_id = depts.get(desk_function) if desk_function else None
            for person in owners:
                email, name = person.get("email"), person.get("name")
                if not email:
                    print(f"  ! skipping owner with no email: {person}")
                    continue
                dev = await _get_or_create_developer(session, name or email, email)
                owner_ids[email] = dev.id
                # Workspace membership first — add_member requires it.
                await _ensure_workspace_member(session, workspace_id, dev.id)
                if desk_dept_id is None:
                    continue
                try:
                    await org.add_member(
                        workspace_id,
                        desk_dept_id,
                        MembershipCreate(developer_id=dev.id, role_in_department="member"),
                    )
                    print(f"  + owner {name or email}")
                except HTTPException as exc:
                    if exc.status_code != 409:  # 409 = already in this department
                        raise
                    print(f"  = owner {name or email} (already on the desk team)")

        products = sample_data.get("products") or []
        if products:
            existing = {row.name for row in await sd.list_products(workspace_id)}
            for name in products:
                if name not in existing:
                    await sd.create_product(workspace_id, ProductCreate(name=name))
            print(f"  {template.resolved_terminology()['products']}: {len(products)} ensured")

        accounts = sample_data.get("accounts") or []
        if accounts:
            existing = {a.name for a in await sd.list_accounts(workspace_id)}
            for entry in accounts:
                name = entry.get("name")
                if not name or name in existing:
                    continue
                await sd.create_account(
                    workspace_id,
                    AccountCreate(
                        name=name,
                        domains=entry.get("domains") or [],
                        assigned_owner_id=owner_ids.get(entry.get("owner") or ""),
                    ),
                )
                print(f"  + account {name}")

        vendors = sample_data.get("vendors") or []
        if vendors:
            existing = {v.name for v in await sd.list_vendors(workspace_id)}
            for entry in vendors:
                name = entry.get("name")
                if not name or name in existing:
                    continue
                await sd.create_vendor(
                    workspace_id,
                    VendorCreate(name=name, domains=entry.get("domains") or []),
                )
                print(f"  + vendor {name}")

        if mailbox:
            existing_mb = {m.address for m in await sd.list_mailboxes(workspace_id)}
            if mailbox not in existing_mb:
                await sd.create_mailbox(workspace_id, MailboxCreate(address=mailbox, channel="webhook"))
                print(f"  + mailbox {mailbox}")

        await session.commit()
        print("Setup complete.")


def _print_templates() -> None:
    for t in list_templates():
        terms = t.resolved_terminology()
        print(f"\n{t.slug}  —  {t.name}")
        print(f"  {t.description}")
        print(f"  stakeholders : {', '.join(s.label for s in t.stakeholders)}")
        print(f"  request types: {', '.join(r.label for r in t.request_types)}")
        print(f"  vocabulary   : {terms['account']} / {terms['vendor']} / {terms['product']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Set up a Service Desk from an industry template")
    parser.add_argument("--workspace", help="Workspace ID to set up")
    parser.add_argument("--template", default="generic", help="Industry template slug")
    parser.add_argument("--mailbox", help="Shared mailbox address to register")
    parser.add_argument("--sample-data", help="Path to a JSON file of accounts/products/owners")
    parser.add_argument("--list-templates", action="store_true", help="Show the catalogue and exit")
    args = parser.parse_args()

    if args.list_templates:
        _print_templates()
        return
    if not args.workspace:
        parser.error("--workspace is required (or pass --list-templates)")

    sample_data = None
    if args.sample_data:
        path = Path(args.sample_data)
        if not path.is_file():
            parser.error(f"--sample-data file not found: {path}")
        sample_data = json.loads(path.read_text())

    try:
        asyncio.run(seed(args.workspace, args.template, args.mailbox, sample_data))
    except Exception as exc:  # noqa: BLE001
        print(f"Setup failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
