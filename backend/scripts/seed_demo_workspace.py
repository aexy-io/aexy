"""Create the demo account and fill its workspace, in one command.

This is the second half of the fresh-clone path: `docker compose up -d` brings
the stack up, this gives you something to sign in to and something to look at
once you are in. The account it provisions is the one `/auth/demo/login`
authenticates, so the two always agree.

    docker compose exec backend python scripts/seed_demo_workspace.py

Idempotent — every row is looked up before it is written, so re-running adds
nothing. Content seeding is delegated to `seed_marketing_demo.py` (fictional
CRM records, an active sprint, two automations, a review cycle, three docs) and
is refused unless the target really is the demo workspace, so pointing this at
a production database cannot drop fictional deals into a real customer's
records.

    --no-content    provision the account only, leave the workspace empty
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import update  # noqa: E402

from aexy.core.config import get_settings  # noqa: E402
from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.crm import CRMAutomation  # noqa: E402
from aexy.services.crm_service import CRMObjectService  # noqa: E402
from aexy.services.demo_login_service import (  # noqa: E402
    DEMO_WORKSPACE_NAME,
    ensure_demo_account,
)

def redacted_dsn(dsn: str) -> str:
    """The DSN with any password removed — safe to print."""
    if "@" in dsn and "://" in dsn:
        scheme, rest = dsn.split("://", 1)
        creds, host = rest.rsplit("@", 1)
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:***@{host}"
    return dsn


def is_demo_workspace(workspace) -> bool:
    """Guard against seeding fictional data into a real workspace.

    The demo account is found by email, and an operator could have pointed
    `AEXY_DEMO_EMAIL` at an address that already belongs to a real developer
    who owns a real workspace. Name or slug is enough to tell the two apart.
    """
    return (
        workspace.name == DEMO_WORKSPACE_NAME
        or (workspace.slug or "").startswith("demo")
    )


async def deactivate_automations(db, workspace_id: str) -> int:
    """Leave the seeded automations switched off, and say how many.

    `seed_marketing_demo.seed_automations` creates them with `is_active=True` —
    correct for the screenshots it exists for, wrong here. One of the two runs an
    agent on every lead that gets created, so an enabled copy in a workspace
    strangers can sign into is a way to spend the operator's LLM budget by
    filling in a form. They still show the trigger, the actions and a run
    history, which is the part worth looking at.

    Returns the number switched off, so a re-run reports 0 rather than implying
    it did work.
    """
    result = await db.execute(
        update(CRMAutomation)
        .where(
            CRMAutomation.workspace_id == workspace_id,
            CRMAutomation.is_active.is_(True),
        )
        .values(is_active=False)
    )
    return result.rowcount or 0


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-content",
        action="store_true",
        help="provision the account only; do not seed CRM/sprint/docs content",
    )
    args = parser.parse_args()
    settings = get_settings()

    print(f"Database: {redacted_dsn(settings.database_url)}")

    async with async_session_maker() as db:
        developer, workspace = await ensure_demo_account(
            db, settings.demo_login_email
        )
        print(f"Account:   {developer.name!r} <{developer.email}> ({developer.id})")
        print(f"Workspace: {workspace.name!r} ({workspace.id})")

        if args.no_content:
            print("\nSkipping content (--no-content).")
        elif not is_demo_workspace(workspace):
            print(
                f"\nRefusing to seed content: {workspace.name!r} does not look like "
                f"a demo workspace.\nAEXY_DEMO_EMAIL "
                f"({settings.demo_login_email}) resolves to a developer who owns "
                "it.\nPoint AEXY_DEMO_EMAIL at an unused address, or re-run with "
                "--no-content.",
                file=sys.stderr,
            )
            return 1
        else:
            # Imported here rather than at module scope so --no-content works on
            # an install that never copied the marketing seeder.
            import seed_marketing_demo as content

            print()
            # `seed_crm` below needs the company/person/deal/lead objects to
            # exist and skips itself silently when they do not — and nothing
            # creates them for a new workspace; in the product they arrive when
            # someone opens the CRM and calls
            # POST /workspaces/{id}/crm/objects/seed-standard. Call the same
            # service here so the demo CRM is the standard schema, not a
            # near-copy of it that drifts.
            objects = await CRMObjectService(db).seed_standard_objects(workspace.id)
            print(f"CRM schema: {len(objects)} standard object(s)")
            await content.seed_crm(db, workspace.id, developer)
            await content.seed_planning(db, workspace, developer)
            await content.seed_automations(db, workspace.id, developer)
            await content.seed_reviews(db, workspace.id, developer)
            await content.seed_docs(db, workspace.id, developer)
            paused = await deactivate_automations(db, workspace.id)
            if paused:
                print(f"Automations: {paused} left switched off")
            await db.commit()
            print(f"Content:   {len(content.created)} created, "
                  f"{len(content.skipped)} already present")

    if not settings.demo_login_enabled:
        print(
            "\nNote: AEXY_DEMO_LOGIN is not set, so /auth/demo/login will refuse "
            "this account.\nSet AEXY_DEMO_LOGIN=true on the backend to sign in "
            "with it."
        )
    else:
        print(
            f"\nSign in at {settings.frontend_url}/login\n"
            f"  email:    {settings.demo_login_email}\n"
            f"  password: {settings.demo_login_password}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
