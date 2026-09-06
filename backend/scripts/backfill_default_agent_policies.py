"""Seed the default agent-policy pack into workspaces that predate it.

New workspaces get the pack on creation and any governed MCP call seeds it
lazily, but a workspace whose agents have not written anything since the pack
shipped is still open. This closes them.

    python scripts/backfill_default_agent_policies.py            # seed
    python scripts/backfill_default_agent_policies.py --dry-run  # list only

Only workspaces with no workspace-wide policies at all are touched, so a
workspace that has deactivated or replaced the defaults is left alone.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sqlalchemy import select  # noqa: E402

import aexy.models  # noqa: E402,F401  (register every mapper so FKs resolve)
from aexy.core.database import get_async_session  # noqa: E402
from aexy.models.agent_policy import AgentPolicy  # noqa: E402
from aexy.models.workspace import Workspace  # noqa: E402
from aexy.services.agent_policy_defaults import ensure_default_policies  # noqa: E402


async def main(dry_run: bool) -> int:
    async with get_async_session() as db:
        workspaces = (await db.execute(select(Workspace.id, Workspace.name))).all()
        governed = {
            row[0]
            for row in (
                await db.execute(
                    select(AgentPolicy.workspace_id)
                    .where(AgentPolicy.agent_id.is_(None))
                    .distinct()
                )
            ).all()
        }
        open_workspaces = [(wid, name) for wid, name in workspaces if wid not in governed]

        print(f"{len(workspaces)} workspaces, {len(open_workspaces)} without any agent policy")
        for wid, name in open_workspaces:
            if dry_run:
                print(f"  would seed  {wid}  {name}")
                continue
            rows = await ensure_default_policies(db, str(wid))
            print(f"  seeded {len(rows)}  {wid}  {name}")

        if not dry_run:
            await db.commit()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.dry_run)))
