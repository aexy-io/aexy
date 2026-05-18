#!/usr/bin/env python3
"""Inspect the commit-level author identity inside a given PR.

Answers: when team-insights shows N PRs merged but 0 commits authored
for a developer, who actually authored the commits inside those PRs?
Reveals whether the commits were signed off by an agent (no GitHub
login + noreply email), by the human with a different email, or by
a collaborator with a different GitHub identity.

Usage:
    docker exec aexy-backend python scripts/diagnose_pr_commits.py \\
        --repo <owner>/<repo> --pr <number>

Multiple PRs at once:
    docker exec aexy-backend python scripts/diagnose_pr_commits.py \\
        --repo <owner>/<repo> --pr 123 --pr 124 --pr 125

Pipe-form (no file deploy needed):
    cat scripts/diagnose_pr_commits.py | docker exec -i aexy-backend \\
        python - --repo <owner>/<repo> --pr <number>
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import os
import sys
from collections import Counter
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
from aexy.models.developer import Developer, GitHubConnection  # noqa: E402


async def inspect_pr(db, repo: str, number: int) -> dict[str, int]:
    """Print every commit inside `repo#number` plus a tag for who authored.

    Joins on the PR-author's branch window: commits in this repo whose
    committed_at sits between the PR's first push and merge timestamp.
    That's a loose join (we don't have an explicit PR↔Commit linking
    table), but it's tight enough for the question of "who authored the
    commits this PR represents".
    """
    pr = (
        await db.execute(
            select(PullRequest).where(
                PullRequest.repository == repo,
                PullRequest.number == number,
            )
        )
    ).scalar_one_or_none()
    if pr is None:
        print(f"  PR not found: {repo}#{number}")
        return {}

    # Resolve PR author for context.
    pr_author = await db.get(Developer, pr.developer_id) if pr.developer_id else None
    pr_author_conn = (
        await db.execute(
            select(GitHubConnection.github_username).where(
                GitHubConnection.developer_id == pr.developer_id
            )
        )
    ).scalar_one_or_none() if pr.developer_id else None

    print(
        f"\n=== {repo}#{number}  "
        f"merged={pr.merged_at.date() if pr.merged_at else '—'}  "
        f"author={pr_author.name if pr_author else None!r:20s} "
        f"github={pr_author_conn!r}"
    )
    print(f"     title: {pr.title[:90]}")

    # Window for commits we'll consider "inside" this PR. We don't have
    # a join table, so we use [created_at − 7d, merged_at + 1h].
    window_start = pr.created_at - datetime.timedelta(days=7)
    window_end = (pr.merged_at or pr.updated_at) + datetime.timedelta(hours=1)

    rows = (
        await db.execute(
            select(
                Commit.sha,
                Commit.author_email,
                Commit.author_github_login,
                Commit.author_class,
                Commit.developer_id,
                Commit.message,
                Commit.committed_at,
            )
            .where(
                Commit.repository == repo,
                Commit.committed_at >= window_start,
                Commit.committed_at <= window_end,
            )
            .order_by(Commit.committed_at.asc())
            .limit(100)
        )
    ).all()

    if not rows:
        print(f"     (no commits in repo within window {window_start.date()} → {window_end.date()})")
        return {"commits": 0}

    by_login: Counter[str] = Counter()
    by_email: Counter[str] = Counter()
    agent_count = 0
    print(
        f"     commits in window ({len(rows)} total, showing top 12 by time):"
    )
    for r in rows[:12]:
        login = r.author_github_login or "<NULL>"
        email = r.author_email or "<NULL>"
        first_line = (r.message or "").splitlines()[0][:70]
        # Prefer the stored author_class (set by sync at attribution time)
        # but fall back to heuristics on email/login for older rows
        # where the column may be NULL.
        is_agent = (
            r.author_class == "bot"
            or "noreply@anthropic.com" in (email or "").lower()
            or "claude" in (email or "").lower()
            or "github-actions" in (login or "").lower()
            or "[bot]" in (login or "").lower()
        )
        tag = (
            f" [{r.author_class}]"
            if r.author_class
            else (" [AGENT?]" if is_agent else "")
        )
        if is_agent:
            agent_count += 1
        print(
            f"        {r.sha[:8]}  {r.committed_at.date()}  "
            f"login={login:25s} email={email:35s}{tag}"
        )
        print(f"            “{first_line}”")
        by_login[login] += 1
        by_email[email] += 1

    print(f"     unique commit-author logins:")
    for login, n in by_login.most_common():
        print(f"        {login:30s} {n:4d}")
    print(f"     unique commit-author emails:")
    for email, n in by_email.most_common():
        print(f"        {email:50s} {n:4d}")
    return {"commits": len(rows), "agent": agent_count}


async def main_async(repo: str, prs: list[int]) -> int:
    grand = Counter()
    async with async_session_maker() as db:
        for num in prs:
            stats = await inspect_pr(db, repo, num)
            grand["commits"] += stats.get("commits", 0)
            grand["agent"] += stats.get("agent", 0)

    print(
        f"\n=== Summary across {len(prs)} PRs in {repo} ===\n"
        f"  total commits in windows:         {grand['commits']}\n"
        f"  flagged AGENT/bot authored:       {grand['agent']}"
    )
    if grand["commits"] and grand["agent"] / grand["commits"] > 0.5:
        print(
            "\n  Verdict: majority of commits are agent/bot authored —\n"
            "  team-insights will continue to show 0 for the human PR\n"
            "  author unless we credit commits per-PR-author."
        )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo",
        required=True,
        help="owner/name of the repository (e.g., acme/codebase)",
    )
    parser.add_argument(
        "--pr",
        type=int,
        action="append",
        required=True,
        help="PR number; pass multiple times for multiple PRs",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main_async(args.repo, args.pr)))


if __name__ == "__main__":
    main()
