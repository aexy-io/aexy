#!/usr/bin/env python3
"""List every PR a developer authored in a window, grouped by repo.

Useful when team-insights shows `commits=0` and you want to know which
repos to dig into next — pass each `repo + pr_number` it prints into
`diagnose_pr_commits.py` to see who actually authored the commits.

Usage:
    docker exec aexy-backend python scripts/diagnose_developer_prs_by_repo.py \\
        --developer-id <developer-uuid> \\
        --from 2026-04-18 --to 2026-05-18 \\
        --workspace-id f67c7124-38e4-4a4b-8e89-da56e413ef13
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import os
import sys
from collections import defaultdict
from pathlib import Path

try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
except NameError:
    for candidate in ("/app/src", os.path.join(os.getcwd(), "src")):
        if os.path.isdir(candidate):
            sys.path.insert(0, candidate)
            break

from sqlalchemy import select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.activity import Commit, PullRequest  # noqa: E402
from aexy.models.repository import Repository, WorkspaceRepository  # noqa: E402


async def main_async(
    developer_id: str,
    from_dt: datetime.datetime,
    to_dt: datetime.datetime,
    workspace_id: str | None,
) -> int:
    async with async_session_maker() as db:
        # Optional workspace filter — limits to repos this workspace adopted.
        repo_full_names: list[str] | None = None
        if workspace_id:
            rows = (
                await db.execute(
                    select(Repository.full_name)
                    .join(
                        WorkspaceRepository,
                        WorkspaceRepository.repository_id == Repository.id,
                    )
                    .where(
                        WorkspaceRepository.workspace_id == workspace_id,
                        WorkspaceRepository.is_active == True,  # noqa: E712
                    )
                )
            ).all()
            repo_full_names = [r[0] for r in rows]

        # PRs the developer authored, merged in window.
        stmt = (
            select(
                PullRequest.repository,
                PullRequest.number,
                PullRequest.title,
                PullRequest.merged_at,
            )
            .where(
                PullRequest.developer_id == developer_id,
                PullRequest.merged_at >= from_dt,
                PullRequest.merged_at < to_dt,
            )
            .order_by(PullRequest.repository, PullRequest.merged_at)
        )
        if repo_full_names is not None:
            stmt = stmt.where(PullRequest.repository.in_(repo_full_names))
        prs = (await db.execute(stmt)).all()

        if not prs:
            print(
                f"No PRs found for developer {developer_id} merged in "
                f"{from_dt.date()} → {to_dt.date()}"
            )
            return 0

        by_repo: dict[str, list] = defaultdict(list)
        for pr in prs:
            by_repo[pr.repository].append(pr)

        print(
            f"\n=== PRs by repo for developer {developer_id}, "
            f"{from_dt.date()} → {to_dt.date()} ({len(prs)} total) ===\n"
        )

        # Also count commits this developer authored per repo, so we can
        # tell at a glance whether the disconnect is "no commits anywhere"
        # vs "commits in some repos, not others."
        commit_counts: dict[str, int] = {}
        for repo in by_repo:
            n = (
                await db.execute(
                    select(__import__("sqlalchemy").func.count(Commit.id)).where(
                        Commit.developer_id == developer_id,
                        Commit.repository == repo,
                        Commit.committed_at >= from_dt,
                        Commit.committed_at < to_dt,
                    )
                )
            ).scalar_one()
            commit_counts[repo] = n

        for repo, repo_prs in sorted(by_repo.items()):
            print(
                f"  {repo:40s}  {len(repo_prs):3d} PRs  "
                f"commits-authored-by-you-here: {commit_counts.get(repo, 0)}"
            )
            for pr in repo_prs[:8]:
                print(
                    f"      #{pr.number:5d}  merged={pr.merged_at.date()}  "
                    f"— {pr.title[:65]}"
                )
            if len(repo_prs) > 8:
                print(f"      …and {len(repo_prs) - 8} more")

        print(
            "\nTo dig into one repo, run:\n"
            "  cat scripts/diagnose_pr_commits.py | "
            "docker exec -i aexy-backend python - \\\n"
            "    --repo <repo> --pr <num1> --pr <num2> ..."
        )

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--developer-id", required=True)
    parser.add_argument(
        "--from",
        dest="from_str",
        help="ISO date (YYYY-MM-DD), default = 30 days ago",
    )
    parser.add_argument(
        "--to",
        dest="to_str",
        help="ISO date (YYYY-MM-DD), default = today",
    )
    parser.add_argument(
        "--workspace-id",
        help="Optional: scope to repos in this workspace",
    )
    args = parser.parse_args()

    now = datetime.datetime.now(datetime.timezone.utc)
    to_dt = (
        datetime.datetime.fromisoformat(args.to_str).replace(
            tzinfo=datetime.timezone.utc
        )
        if args.to_str
        else now
    )
    from_dt = (
        datetime.datetime.fromisoformat(args.from_str).replace(
            tzinfo=datetime.timezone.utc
        )
        if args.from_str
        else to_dt - datetime.timedelta(days=30)
    )
    sys.exit(
        asyncio.run(
            main_async(args.developer_id, from_dt, to_dt, args.workspace_id)
        )
    )


if __name__ == "__main__":
    main()
