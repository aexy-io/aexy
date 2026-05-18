#!/usr/bin/env python3
"""One-shot identity-drift resolver for a single workspace.

`diagnose_workspace_sync_coverage.py` surfaces the same `author_github_login`
showing up under multiple `developer_id`s — every duplicate is either a ghost
the OAuth-callback dedup missed, or a step-3 commit-resolver pseudo-ghost
that grew an arbitrary email so the username-only merge couldn't see it.

This script iterates every WorkspaceMember in a workspace, looks up their
GitHub username, and runs `merge_ghost_into_developer` (which uses the
widened, data-driven matcher from `_find_orphan_candidates`). After that
pass, an aliased login may still own commits with `developer_id` pointing
at a deleted pseudo-ghost — wait, no: merge UPDATEs the rows before
deleting. The widened matcher is the load-bearing part.

Idempotent: a clean run reports zero merged ghosts.

Usage:
    docker exec aexy-backend python scripts/resolve_workspace_drift.py \\
        <workspace_id> [--dry-run]

Pipe-form (no file deploy needed):
    cat scripts/resolve_workspace_drift.py | docker exec -i aexy-backend \\
        python - <workspace_id>
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Resolve src whether run as a file or piped via `python -` (no __file__).
try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
except NameError:
    for candidate in ("/app/src", os.path.join(os.getcwd(), "src")):
        if os.path.isdir(candidate):
            sys.path.insert(0, candidate)
            break

from sqlalchemy import select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.developer import Developer, GitHubConnection  # noqa: E402
from aexy.models.workspace import WorkspaceMember  # noqa: E402
from aexy.services.developer_service import DeveloperService  # noqa: E402


async def resolve(workspace_id: str, dry_run: bool) -> int:
    total = {
        "commits": 0,
        "prs": 0,
        "reviews": 0,
        "ghosts_merged": 0,
        "members_examined": 0,
        "members_without_github": 0,
    }

    async with async_session_maker() as db:
        # Every member of this workspace with a resolvable GitHub username.
        rows = (
            await db.execute(
                select(
                    Developer.id,
                    Developer.name,
                    GitHubConnection.github_username,
                )
                .join(
                    WorkspaceMember,
                    WorkspaceMember.developer_id == Developer.id,
                )
                .outerjoin(
                    GitHubConnection,
                    GitHubConnection.developer_id == Developer.id,
                )
                .where(WorkspaceMember.workspace_id == workspace_id)
                .order_by(Developer.name)
            )
        ).all()

        if not rows:
            print(f"No members found for workspace {workspace_id}")
            return 1

        print(
            f"\n=== Resolving identity drift for workspace "
            f"{workspace_id} — {len(rows)} members ===\n"
        )

        service = DeveloperService(db)

        for developer_id, name, github_username in rows:
            total["members_examined"] += 1
            if not github_username:
                total["members_without_github"] += 1
                print(
                    f"  SKIP {(name or '<unnamed>')[:30]:30s}  "
                    f"(no GitHubConnection)"
                )
                continue

            # Preview first so we can log non-trivial merges even on dry-run.
            preview = await service.preview_ghost_match(
                canonical_developer_id=str(developer_id),
                github_username=github_username,
            )
            if not preview["ghost_id"]:
                # Nothing to do — already cleanly attributed.
                continue

            if dry_run:
                print(
                    f"  [dry-run] @{github_username:25s} → "
                    f"{(name or '<unnamed>')[:25]:25s}  would reclaim: "
                    f"{preview['commits']} commits, "
                    f"{preview['prs']} PRs, "
                    f"{preview['reviews']} reviews"
                )
                total["commits"] += preview["commits"]
                total["prs"] += preview["prs"]
                total["reviews"] += preview["reviews"]
                total["ghosts_merged"] += 1
                continue

            result = await service.merge_ghost_into_developer(
                canonical_developer_id=str(developer_id),
                github_username=github_username,
            )
            if result["ghost_deleted"]:
                # Commit each member's merge in its own txn so a later
                # failure doesn't undo the work we already did.
                await db.commit()
                total["commits"] += result["commits"]
                total["prs"] += result["prs"]
                total["reviews"] += result["reviews"]
                total["ghosts_merged"] += result["ghost_deleted"]
                print(
                    f"  MERGED @{github_username:25s} → "
                    f"{(name or '<unnamed>')[:25]:25s}  reclaimed: "
                    f"{result['commits']} commits, "
                    f"{result['prs']} PRs, "
                    f"{result['reviews']} reviews "
                    f"({result['ghost_deleted']} ghost rows)"
                )

    mode = "[dry-run] " if dry_run else ""
    print(
        f"\n{mode}Examined {total['members_examined']} members "
        f"({total['members_without_github']} without GitHub). "
        f"Merged {total['ghosts_merged']} ghost rows. "
        f"Reclaimed {total['commits']} commits, "
        f"{total['prs']} PRs, {total['reviews']} reviews."
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "workspace_id",
        help="UUID of the workspace to resolve",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be merged without making changes.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(resolve(args.workspace_id, args.dry_run)))


if __name__ == "__main__":
    main()
