#!/usr/bin/env python3
"""Targeted diagnostic: for a given github_username + date window,
explain why the team-insights `commits_count` for that user looks wrong.

Answers three mutually-exclusive questions, in order:
  (A) Did the user actually author any commits in this window? If no,
      team-insights is correct — they merged PRs as a maintainer, didn't
      author code.
  (B) Are there commits in the window attributed to a pseudo-ghost
      Developer row (login matches, developer_id does NOT match canonical)?
      If yes, the widened ghost-merge should reclaim them.
  (C) Are there commits whose `author_github_login` is NULL (so the
      data-driven matcher can't see them) but whose `author_email` looks
      like the user's? If yes, we need an email-driven backfill.

Usage (pipe-form, no file deploy needed):
    cat scripts/diagnose_recent_commits.py | docker exec -i aexy-backend \\
        python - --github-username bhanuc \\
                 --from 2026-05-11 --to 2026-05-18 \\
                 [--workspace-id <uuid>]

Defaults to the last 7 days if --from/--to omitted.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import os
import sys
from pathlib import Path

try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
except NameError:
    for candidate in ("/app/src", os.path.join(os.getcwd(), "src")):
        if os.path.isdir(candidate):
            sys.path.insert(0, candidate)
            break

from sqlalchemy import and_, distinct, func, or_, select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.activity import Commit, PullRequest  # noqa: E402
from aexy.models.developer import Developer, GitHubConnection  # noqa: E402
from aexy.models.repository import Repository, WorkspaceRepository  # noqa: E402


async def diagnose(
    github_username: str | None,
    developer_id: str | None,
    from_dt: datetime.datetime,
    to_dt: datetime.datetime,
    workspace_id: str | None,
) -> int:
    async with async_session_maker() as db:
        # Resolve canonical Developer row from either flag.
        canonical: Developer | None = None
        if developer_id:
            canonical = await db.get(Developer, developer_id)
            if canonical is None:
                print(f"No Developer with id {developer_id}")
                return 1
            # If we only got developer_id, still need the github_username
            # for the commit-attribution matchers below.
            if not github_username:
                conn = (
                    await db.execute(
                        select(GitHubConnection).where(
                            GitHubConnection.developer_id == canonical.id
                        )
                    )
                ).scalar_one_or_none()
                if conn is None or not conn.github_username:
                    print(
                        f"Developer {developer_id} has no GitHubConnection — "
                        "pass --github-username explicitly to diagnose."
                    )
                    return 1
                github_username = conn.github_username
        elif github_username:
            canonical = (
                await db.execute(
                    select(Developer)
                    .join(
                        GitHubConnection,
                        GitHubConnection.developer_id == Developer.id,
                    )
                    .where(
                        func.lower(GitHubConnection.github_username)
                        == github_username.lower()
                    )
                )
            ).scalar_one_or_none()
            if canonical is None:
                print(f"No canonical Developer for @{github_username}")
                return 1
        else:
            print("Pass either --developer-id or --github-username")
            return 1
        # `github_username` is non-None from here on.
        assert github_username is not None

        print(
            f"\n=== Commit attribution for @{github_username} "
            f"{from_dt.date()} → {to_dt.date()} ==="
        )
        print(f"  canonical developer_id: {canonical.id}")
        print(f"  canonical email:        {canonical.email!r}")

        # Repo filter (when scoped to a workspace).
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
            print(f"  scoped to {len(repo_full_names)} workspace repos")

        def in_window(stmt):
            stmt = stmt.where(
                Commit.committed_at >= from_dt, Commit.committed_at < to_dt
            )
            if repo_full_names is not None:
                stmt = stmt.where(Commit.repository.in_(repo_full_names))
            return stmt

        # --- PRs merged by this user in window (sanity-check the "6 PRs") ---
        pr_stmt = select(
            PullRequest.id,
            PullRequest.number,
            PullRequest.title,
            PullRequest.repository,
            PullRequest.merged_at,
            PullRequest.developer_id,
        ).where(
            PullRequest.developer_id == canonical.id,
            PullRequest.merged_at >= from_dt,
            PullRequest.merged_at < to_dt,
        )
        if repo_full_names is not None:
            pr_stmt = pr_stmt.where(PullRequest.repository.in_(repo_full_names))
        prs = (await db.execute(pr_stmt)).all()
        print(f"\n  PRs attributed to canonical, merged in window: {len(prs)}")
        for pr in prs[:15]:
            print(
                f"    #{pr.number:5d}  {pr.repository}  "
                f"merged={pr.merged_at.date()}  — {pr.title[:60]}"
            )

        # --- (A) Commits attributed directly to canonical in window ---
        own = (
            await db.execute(
                in_window(
                    select(func.count(Commit.id)).where(
                        Commit.developer_id == canonical.id
                    )
                )
            )
        ).scalar_one()
        print(f"\n  (A) Commits on canonical row in window: {own}")

        # --- (B) Commits on OTHER developer_ids whose author_github_login
        # matches us — pseudo-ghost candidates the widened merger would
        # reclaim. ---
        ghost_rows = (
            await db.execute(
                in_window(
                    select(
                        Commit.developer_id,
                        Commit.author_email,
                        Commit.author_github_login,
                        func.count(Commit.id),
                    ).where(
                        Commit.developer_id != canonical.id,
                        func.lower(Commit.author_github_login)
                        == github_username.lower(),
                    )
                ).group_by(
                    Commit.developer_id,
                    Commit.author_email,
                    Commit.author_github_login,
                )
            )
        ).all()
        b_total = sum(r[3] for r in ghost_rows)
        print(
            f"  (B) Commits on OTHER developer_ids w/ matching "
            f"author_github_login: {b_total}"
        )
        for dev_id, email, login, n in ghost_rows:
            dev = await db.get(Developer, dev_id)
            has_conn = (
                await db.execute(
                    select(GitHubConnection.id)
                    .where(GitHubConnection.developer_id == dev_id)
                    .limit(1)
                )
            ).first() is not None
            tag = "REAL-ACCOUNT" if has_conn else "PSEUDO-GHOST"
            print(
                f"      [{tag}] dev_id={dev_id} count={n}"
                f"  dev_name={(dev.name if dev else None)!r}"
                f"  dev_email={(dev.email if dev else None)!r}"
                f"  commit_email={email!r}"
            )

        # --- (C) Commits in window with NULL author_github_login whose
        # author_email looks like ours (canonical email match or no-reply
        # pattern). These are invisible to the data-driven matcher. ---
        lower_user = github_username.lower()
        noreply_legacy = f"{lower_user}@users.noreply.github.com"
        noreply_modern = f"%+{lower_user}@users.noreply.github.com"
        email_clauses = [
            func.lower(Commit.author_email) == noreply_legacy,
            func.lower(Commit.author_email).like(noreply_modern),
        ]
        if canonical.email:
            email_clauses.append(
                func.lower(Commit.author_email) == canonical.email.lower()
            )
        null_login_rows = (
            await db.execute(
                in_window(
                    select(
                        Commit.developer_id,
                        Commit.author_email,
                        func.count(Commit.id),
                    ).where(
                        Commit.author_github_login.is_(None),
                        or_(*email_clauses),
                    )
                ).group_by(Commit.developer_id, Commit.author_email)
            )
        ).all()
        c_total = sum(r[2] for r in null_login_rows)
        print(
            f"\n  (C) Commits in window w/ NULL author_github_login "
            f"but matching email: {c_total}"
        )
        for dev_id, email, n in null_login_rows:
            dev = await db.get(Developer, dev_id)
            mark = "CANONICAL" if dev_id == canonical.id else "OTHER"
            print(
                f"      [{mark}] dev_id={dev_id} count={n}"
                f"  dev_name={(dev.name if dev else None)!r}"
                f"  commit_email={email!r}"
            )

        # --- Verdict ---
        print("\n=== Verdict ===")
        if own + b_total + c_total == 0:
            if not prs:
                print(
                    "  No commits AND no PRs attributed to you in this window."
                    " The team-insights window is likely outside your activity."
                )
            else:
                print(
                    f"  PRs merged: {len(prs)}, commits authored: 0."
                    " Most likely you merged maintainer-side without"
                    " authoring code. team-insights is CORRECT."
                )
        elif own > 0 and b_total == 0 and c_total == 0:
            print(
                "  All commits are on the canonical row."
                " team-insights should already show them — refetch the API."
            )
        elif b_total > 0:
            print(
                f"  {b_total} commits are on pseudo-ghost rows."
                " Run the workspace drift CLI (or claim-commits) — the"
                " widened ghost-merge from task #66 will reclaim them."
            )
        elif c_total > 0:
            print(
                f"  {c_total} commits have NULL author_github_login but"
                " matching email. Need an email-driven backfill — neither"
                " the widened merge nor alias_map sees these."
            )
        else:
            print("  Mixed signal — see breakdown above.")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    # Accept either flag; require at least one.
    parser.add_argument(
        "--github-username",
        help="GitHub login of the developer to diagnose",
    )
    parser.add_argument(
        "--developer-id",
        help="Developer UUID (alternative to --github-username)",
    )
    parser.add_argument(
        "--from",
        dest="from_str",
        help="ISO date (YYYY-MM-DD), default = 7 days ago",
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
    if not args.github_username and not args.developer_id:
        parser.error("Pass --github-username or --developer-id")

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
        else to_dt - datetime.timedelta(days=7)
    )
    sys.exit(
        asyncio.run(
            diagnose(
                args.github_username,
                args.developer_id,
                from_dt,
                to_dt,
                args.workspace_id,
            )
        )
    )


if __name__ == "__main__":
    main()
