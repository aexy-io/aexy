"""Render a `MonthlyEngineeringReport` as markdown.

Separate from the service on purpose: the numbers are testable without caring
how they are laid out, and a caller who wants to build their own view (a page,
a slide, a Slack post) takes the dataclass and ignores this file.

Layout follows the report an engineering lead would write by hand — summary,
per-member table, per-repository table, observations, then the caveats. The
caveats are last but never optional: they are what makes the rest quotable.
"""

from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from aexy.services.engineering_report import MonthlyEngineeringReport

_MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)


def render_markdown(report: MonthlyEngineeringReport) -> str:
    year, month = (int(p) for p in report.month.split("-"))
    # The window is stored in UTC; printing those dates on a report headed
    # "Asia/Kolkata" shows a July report starting on 30 June.
    tz = ZoneInfo(report.timezone_name)
    first_day = report.period_start.astimezone(tz).date()
    last_day = (report.period_end.astimezone(tz) - timedelta(microseconds=1)).date()
    lines: list[str] = [
        f"# Engineering Contribution Report — {_MONTHS[month - 1]} {year}",
        "",
        f"**Workspace:** {report.workspace_name}  ",
        f"**Period:** {first_day} – {last_day} ({report.timezone_name})  ",
        f"**Repositories:** {report.active_repositories or 'none with activity'}",
        "",
    ]
    if report.scope_departments:
        # Immediately under the title, not in a footnote: a departmental total
        # pasted into a thread without this line reads as the whole company's.
        lines += [
            f"> **Scope: {', '.join(report.scope_departments)}.** Every figure "
            "below counts only the people in "
            f"{'these departments' if len(report.scope_departments) > 1 else 'this department'}.",
            "",
        ]

    if not report.commits:
        lines += [
            "No commits landed in this period.",
            "",
            *_limitations(report),
        ]
        return "\n".join(lines)

    lines += [
        "## Summary",
        "",
        "| | |",
        "|---|---|",
        f"| Contributors | **{report.contributors}** |",
        f"| Commits (deduplicated, human) | **{report.commits}** |",
        f"| Pull requests merged | **{report.prs_merged}** |",
        f"| Source lines added / removed | **+{report.source_additions:,} / "
        f"−{report.source_deletions:,}** |",
        f"| Active repositories | {report.active_repositories} |",
        f"| Active working days | {report.active_days} |",
    ]
    if report.ported_commits:
        lines.append(
            f"| Ported commits (same change, another branch) | {report.ported_commits} |"
        )
    if report.bot_commits_excluded:
        lines.append(f"| Automated commits (excluded) | {report.bot_commits_excluded} |")
    if report.merge_commits_excluded:
        lines.append(f"| Merge commits (excluded) | {report.merge_commits_excluded} |")

    lines += [
        "",
        "Line counts are source lines: lockfiles, vendored trees, build output "
        "and generated code are excluded.",
        "",
        "## Contribution by member",
        "",
        "Both PR columns count pull requests that **merged** this month: "
        '"theirs" is the ones they wrote, "merged by them" is the ones they '
        "pressed merge on — integration and review load, which is a different "
        "job from writing them.",
        "",
        "| # | Member | Commits | Share | +src | −src | PRs theirs | PRs merged by them "
        "| Reviews | Active days | Repos |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for index, member in enumerate(report.members, start=1):
        share = round(member.commits / report.commits * 100) if report.commits else 0
        lines.append(
            f"| {index} | **{member.name}** | {member.commits} | {share}% | "
            f"{member.source_additions:,} | {member.source_deletions:,} | "
            f"{member.prs_authored} | {member.prs_merged_by_them or '—'} | "
            f"{member.reviews_given or '—'} | {member.active_days} | "
            f"{len(member.repositories)} |"
        )
    lines += [
        f"| | **Team** | **{report.commits}** | 100% | "
        f"**{report.source_additions:,}** | **{report.source_deletions:,}** | "
        f"| **{report.prs_merged}** | | {report.active_days} | "
        f"{report.active_repositories} |",
        "",
        "> **Read the commit counts with care.** Volume reflects branching style "
        "as much as output — a team that ports each change onto two branches, or "
        "a person who commits from the GitHub web editor, produces several times "
        "the commits for the same work.",
        "",
    ]

    if report.repositories:
        lines += [
            "## Activity by repository",
            "",
            "| Repository | Commits | +src | −src | Main contributors |",
            "|---|---:|---:|---:|---|",
        ]
        for repo in report.repositories:
            contributors = ", ".join(
                f"{name} ({count})" for name, count in repo.contributors[:5]
            )
            lines.append(
                f"| `{repo.full_name}` | {repo.commits} | {repo.source_additions:,} "
                f"| {repo.source_deletions:,} | {contributors} |"
            )
        lines.append("")

    if report.observations:
        lines += ["## Observations", ""]
        lines += [f"{obs}\n" for obs in report.observations]

    lines += _limitations(report)
    return "\n".join(lines)


def _limitations(report: MonthlyEngineeringReport) -> list[str]:
    lines = [
        "## Methodology",
        "",
        f"Built from synced GitHub data for the repositories adopted into "
        f"{report.workspace_name}. Commits are counted by commit date in "
        f"{report.timezone_name} — the date the work landed, which is not always "
        f"the date it was written.",
        "",
        "- **Bots and merge commits are excluded.** A release bot's version bumps "
        "and a merge's combined diff are not somebody's contribution.",
        "- **Ports are deduplicated.** The same change cherry-picked onto another "
        "branch is counted once, against whoever wrote it. Deduplication is by "
        "diff content, so it survives the new commit SHA a cherry-pick gets.",
        "- **Lines are source lines.** Lockfiles, `dist/`, `build/`, `vendor/`, "
        "`node_modules/`, coverage output, minified bundles and generated code do "
        "not count.",
        "- **Identities are merged** where a developer's alternate commit emails "
        "are recorded against their account.",
        "",
    ]
    if report.limitations:
        lines += ["### Known limitations", ""]
        lines += [f"{i}. {text}" for i, text in enumerate(report.limitations, start=1)]
        lines.append("")
    return lines
