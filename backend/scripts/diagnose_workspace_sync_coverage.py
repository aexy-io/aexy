#!/usr/bin/env python3
"""Cross-repo + cross-author sync coverage diagnostic for a workspace.

Answers: across every repo this workspace has adopted, did sync land
recent data? Are commits being attributed to the right developer_ids?
Is the D1 multi-branch walk surfacing previously-missed feature-branch
commits?

Per-repo report:
  oldest / newest committed_at, 7d + 30d activity, distinct author count,
  count of commits with NULL author_github_login (alias-map blind spots),
  and `d1_backfill` — commits inserted recently with OLD authoring
  dates, which is the strongest signal that the multi-branch walk just
  surfaced commits that a default-branch-only sync missed.

Workspace-wide report:
  top-30 author leaderboard by author_github_login (last 90d),
  and an identity-drift check — any login showing up under multiple
  developer_ids, which is the smoking gun for attribution bugs.

Usage:
    docker exec aexy-backend python scripts/diagnose_workspace_sync_coverage.py <workspace_id>

Or piped over stdin (no file deploy needed):
    cat scripts/diagnose_workspace_sync_coverage.py | \\
        docker exec -i aexy-backend python - <workspace_id>
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
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

from sqlalchemy import distinct, func, select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.activity import Commit  # noqa: E402
from aexy.models.repository import Repository, WorkspaceRepository  # noqa: E402


async def diagnose(workspace_id: str) -> int:
    async with async_session_maker() as db:
        # All repos this workspace has adopted.
        repos = (
            await db.execute(
                select(
                    Repository.id,
                    Repository.full_name,
                    Repository.owner_login,
                    Repository.is_archived,
                    Repository.language,
                )
                .join(
                    WorkspaceRepository,
                    WorkspaceRepository.repository_id == Repository.id,
                )
                .where(
                    WorkspaceRepository.workspace_id == workspace_id,
                    WorkspaceRepository.is_active == True,  # noqa: E712
                )
                .order_by(Repository.full_name)
            )
        ).all()
        if not repos:
            print(f"No adopted repositories for workspace {workspace_id}")
            return 1
        print(
            f"\n=== Workspace {workspace_id} — {len(repos)} adopted repos ===\n"
        )

        now = datetime.datetime.now(datetime.timezone.utc)
        d7 = now - datetime.timedelta(days=7)
        d30 = now - datetime.timedelta(days=30)

        grand_total = 0
        for r in repos:
            full = r.full_name
            total = (
                await db.execute(
                    select(func.count(Commit.id)).where(
                        Commit.repository == full
                    )
                )
            ).scalar_one()
            if total == 0:
                print(f"  {full:50s} EMPTY (no commits in DB)")
                continue
            grand_total += total

            min_dt, max_dt, max_created = (
                await db.execute(
                    select(
                        func.min(Commit.committed_at),
                        func.max(Commit.committed_at),
                        func.max(Commit.created_at),
                    ).where(Commit.repository == full)
                )
            ).one()

            # Commits inserted very recently with old commit dates — signal
            # that D1's branch walk surfaced previously-missed feature-branch
            # commits. If this is non-zero, D1 is doing its job. If it's
            # zero everywhere despite recent re-syncs, D1 may not be
            # deployed or there's nothing new to find.
            d1_backfill = (
                await db.execute(
                    select(func.count(Commit.id)).where(
                        Commit.repository == full,
                        Commit.created_at >= now - datetime.timedelta(days=2),
                        Commit.committed_at < now - datetime.timedelta(days=30),
                    )
                )
            ).scalar_one()

            authors = (
                await db.execute(
                    select(
                        func.count(distinct(Commit.author_github_login))
                    ).where(Commit.repository == full)
                )
            ).scalar_one()
            null_authors = (
                await db.execute(
                    select(func.count(Commit.id)).where(
                        Commit.repository == full,
                        Commit.author_github_login.is_(None),
                    )
                )
            ).scalar_one()
            n7 = (
                await db.execute(
                    select(func.count(Commit.id)).where(
                        Commit.repository == full,
                        Commit.committed_at >= d7,
                    )
                )
            ).scalar_one()
            n30 = (
                await db.execute(
                    select(func.count(Commit.id)).where(
                        Commit.repository == full,
                        Commit.committed_at >= d30,
                    )
                )
            ).scalar_one()

            tag = "ARCH" if r.is_archived else "    "
            print(
                f"  [{tag}] {full:50s} {total:6d} commits  "
                f"oldest={min_dt.date()}  newest={max_dt.date()}  "
                f"7d={n7:4d}  30d={n30:5d}  authors={authors:3d}"
                f"  null_login={null_authors:4d}"
                f"  d1_backfill={d1_backfill}"
            )

        print(f"\n  TOTAL across workspace: {grand_total} commits\n")

        # Author leaderboard across the workspace (raw — no alias merging).
        d90 = now - datetime.timedelta(days=90)
        rows = (
            await db.execute(
                select(
                    Commit.author_github_login,
                    func.count(Commit.id),
                    func.min(Commit.committed_at),
                    func.max(Commit.committed_at),
                )
                .join(Repository, Repository.full_name == Commit.repository)
                .join(
                    WorkspaceRepository,
                    WorkspaceRepository.repository_id == Repository.id,
                )
                .where(
                    WorkspaceRepository.workspace_id == workspace_id,
                    WorkspaceRepository.is_active == True,  # noqa: E712
                    Commit.committed_at >= d90,
                )
                .group_by(Commit.author_github_login)
                .order_by(func.count(Commit.id).desc())
                .limit(30)
            )
        ).all()
        print(
            "=== Top 30 authors across workspace "
            "(last 90d, by author_github_login) ==="
        )
        for login, n, first, last in rows:
            print(
                f"  {(login or '<NULL>')[:30]:30s}  {n:5d}  "
                f"first={first.date()}  last={last.date()}"
            )

        # Identity drift: same login showing up under multiple developer_ids.
        # That's the smoking gun for attribution bugs.
        drift = (
            await db.execute(
                select(
                    Commit.author_github_login,
                    func.count(distinct(Commit.developer_id)).label("dups"),
                    func.count(Commit.id),
                )
                .join(Repository, Repository.full_name == Commit.repository)
                .join(
                    WorkspaceRepository,
                    WorkspaceRepository.repository_id == Repository.id,
                )
                .where(
                    WorkspaceRepository.workspace_id == workspace_id,
                    WorkspaceRepository.is_active == True,  # noqa: E712
                    Commit.author_github_login.is_not(None),
                )
                .group_by(Commit.author_github_login)
                .having(func.count(distinct(Commit.developer_id)) > 1)
                .order_by(func.count(Commit.id).desc())
            )
        ).all()
        if drift:
            print(
                "\n=== Identity drift (same login, multiple developer_ids) ==="
            )
            for login, dups, n in drift:
                print(
                    f"  {login:30s} dev_ids={dups}  total_commits={n}"
                )
        else:
            print("\n=== No identity drift detected ===")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "workspace_id",
        help="UUID of the workspace to diagnose",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(diagnose(args.workspace_id)))


if __name__ == "__main__":
    main()
