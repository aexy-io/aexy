"""Monthly engineering contribution report, built from synced GitHub data.

What this is for: the report an engineering lead writes by hand at month end —
who worked on what, how the load was shared, where the process is leaking time.
Everything here comes from the repo sync; nothing is asked of the team.

Three commitments shape the arithmetic, because a report about people's work is
read as a judgement about people whether or not it was meant that way:

  * **Count the work, not the git plumbing.** Bots and merge commits are out.
    Line counts are source lines — lockfiles, `dist/`, vendored trees and
    generated output do not count as somebody's writing.
  * **A change ported to three branches is one change.** Deduplicated on
    `content_hash`, which survives a cherry-pick where `sha` does not.
  * **Say what could not be measured.** Every figure that rests on incomplete
    data carries a caveat in `limitations`, and the renderer prints them. A
    number nobody can audit is worse than a gap somebody can.

Commit volume is a weak proxy for contribution and the report says so in its
own text: branching style and editor choice move it by multiples. The per-member
narrative lines are the part worth reading.
"""

from __future__ import annotations

import calendar
import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from aexy.models.activity import CodeReview, Commit, PullRequest
from aexy.models.developer import Developer
from aexy.models.repository import Repository, WorkspaceRepository
from aexy.services.contribution_filters import human_commit_filters

logger = logging.getLogger(__name__)

# Subjects that tell a reader nothing. Deliberately narrow: "fix login redirect"
# is a fine short message and must not be flagged, while "code changes" and
# "update" are the ones that make a history unbisectable.
_LOW_SIGNAL_SUBJECTS = re.compile(
    r"^\s*(?:"
    r"code\s*(?:changes?|review|cleanup)?"
    r"|changes?|update[sd]?|fix(?:e[sd])?|minor(?:\s+\w+)?|misc"
    r"|wip|temp|test(?:ing)?|asdf|\.+"
    r"|merge\s*conflicts?\s*(?:resolved?)?"
    r"|resolved?\s*merge\s*conflicts?"
    r"|final|latest|new|changes\s*done"
    r")\s*[.!]*\s*$",
    re.IGNORECASE,
)


@dataclass
class MemberRow:
    developer_id: str
    name: str
    commits: int
    source_additions: int
    source_deletions: int
    prs_authored: int
    prs_merged_by_them: int
    reviews_given: int
    active_days: int
    repositories: list[str]
    low_signal_subjects: int
    reverts: int
    ported_commits: int


@dataclass
class RepoSyncState:
    """Freshness of one adopted repository, whether or not it had commits.

    The report is only as current as the last sync, and "no commits in July"
    and "never synced" look identical on the page unless it says which.
    """

    repository_id: str
    full_name: str
    sync_status: str
    last_synced_at: datetime | None
    covers_period: bool
    has_adopter: bool


@dataclass
class RepoRow:
    full_name: str
    commits: int
    source_additions: int
    source_deletions: int
    contributors: list[tuple[str, int]]
    last_synced_at: datetime | None


@dataclass
class MonthlyEngineeringReport:
    workspace_id: str
    workspace_name: str
    month: str
    period_start: datetime
    period_end: datetime
    timezone_name: str

    contributors: int
    commits: int
    commits_before_dedup: int
    ported_commits: int
    bot_commits_excluded: int
    merge_commits_excluded: int
    prs_merged: int
    source_additions: int
    source_deletions: int
    active_repositories: int
    active_days: int

    # Empty when the report covers the whole workspace; otherwise the
    # departments it was narrowed to. Every total above is computed over that
    # narrower set, so this is not decoration — it is what the numbers mean.
    scope_departments: list[str] = field(default_factory=list)

    members: list[MemberRow] = field(default_factory=list)
    repositories: list[RepoRow] = field(default_factory=list)
    repository_sync_state: list[RepoSyncState] = field(default_factory=list)
    observations: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)


def month_window(month: str, timezone_name: str) -> tuple[datetime, datetime, ZoneInfo]:
    """Half-open [start, end) for a YYYY-MM in a named timezone, as UTC.

    A month boundary is local, not UTC: a report headed "July, IST" that starts
    at 00:00 UTC on 1 July silently hands the team's 1 July morning to June.
    """
    try:
        year, mon = (int(part) for part in month.split("-", 1))
        tz = ZoneInfo(timezone_name)
    except (ValueError, KeyError) as exc:
        raise ValueError(f"Invalid month {month!r} or timezone {timezone_name!r}") from exc
    if not 1 <= mon <= 12:
        raise ValueError(f"Invalid month {month!r}")

    last_day = calendar.monthrange(year, mon)[1]
    start = datetime(year, mon, 1, tzinfo=tz)
    end = datetime(year, mon, last_day, 23, 59, 59, 999999, tzinfo=tz) + timedelta(
        microseconds=1
    )
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc), tz


@dataclass
class ReportScope:
    """Whose work a reader is entitled to see.

    `developer_ids` of None means the whole workspace — an admin's view.
    Anything else is a subset, and every figure in the report is then computed
    over that subset alone, which is why `departments` exists: a partial total
    that does not announce itself as partial is the easiest way to mislead
    somebody with true numbers.
    """

    developer_ids: set[str] | None
    departments: list[str]

    @property
    def is_workspace_wide(self) -> bool:
        return self.developer_ids is None


async def resolve_report_scope(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> ReportScope | None:
    """What this reader may see, or None if they may not see it at all.

    This is a per-person table of how much each colleague wrote, merged and
    reviewed. Read by the people who run the team it is a management tool;
    read by everybody it is a leaderboard, and the numbers are too easy to
    misread for that — commit volume tracks branching style as much as effort,
    and none of the work that leaves no git trace appears at all.

    Owners and admins answer for the workspace and see all of it. A department
    head answers for their department and sees their department: the people in
    it, plus themselves. Being head of one team is not a reason to read
    another team's numbers.
    """
    from aexy.services.org_hierarchy import (
        developers_in_departments,
        headed_department_ids,
        headed_department_names,
    )
    from aexy.services.workspace_service import WorkspaceService

    workspace_service = WorkspaceService(db)
    if await workspace_service.check_permission(workspace_id, developer_id, "admin"):
        return ReportScope(developer_ids=None, departments=[])
    # Membership first: a Department row is not a way into a workspace you
    # were removed from.
    if not await workspace_service.check_permission(workspace_id, developer_id, "member"):
        return None

    headed = await headed_department_ids(db, workspace_id, developer_id)
    if not headed:
        return None

    members = await developers_in_departments(db, workspace_id, headed)
    # Themselves, always: a head whose own row is missing from the department
    # table would get a report of their team that leaves out their own work.
    members.add(str(developer_id))
    return ReportScope(
        developer_ids=members,
        departments=await headed_department_names(db, workspace_id, headed),
    )


async def can_read_report(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> bool:
    """Owners, admins, and anyone who heads a department."""
    return await resolve_report_scope(db, workspace_id, developer_id) is not None


class EngineeringReportService:
    """Builds `MonthlyEngineeringReport` for a workspace."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_monthly(
        self,
        workspace_id: str,
        month: str,
        timezone_name: str = "UTC",
        scope: ReportScope | None = None,
    ) -> MonthlyEngineeringReport:
        """Build the report, optionally narrowed to one reader's people.

        `scope=None` means the whole workspace. A narrowed report is not the
        workspace report with rows hidden: every total is recomputed over the
        people in scope, and `scope_departments` records whose report it is.
        """
        scope = scope or ReportScope(developer_ids=None, departments=[])
        people = scope.developer_ids
        start, end, tz = month_window(month, timezone_name)

        workspace_name, repos = await self._repositories_in_scope(workspace_id)
        report = MonthlyEngineeringReport(
            workspace_id=workspace_id,
            workspace_name=workspace_name,
            month=month,
            period_start=start,
            period_end=end,
            timezone_name=timezone_name,
            contributors=0,
            commits=0,
            commits_before_dedup=0,
            ported_commits=0,
            bot_commits_excluded=0,
            merge_commits_excluded=0,
            prs_merged=0,
            source_additions=0,
            source_deletions=0,
            active_repositories=0,
            active_days=0,
            scope_departments=list(scope.departments),
        )
        report.repository_sync_state = _sync_state(repos, end)
        if not repos:
            report.limitations.append(
                "No repositories are adopted into this workspace, so there is "
                "nothing to report on."
            )
            return report

        full_names = [r.full_name for r in repos]
        commits = await self._commits(full_names, start, end, people)
        excluded = await self._excluded_counts(full_names, start, end, people)
        report.bot_commits_excluded, report.merge_commits_excluded = excluded

        kept, ported = _dedupe_ports(commits)
        report.commits_before_dedup = len(commits)
        report.ported_commits = ported
        report.commits = len(kept)

        prs = await self._pull_requests(full_names, start, end, people)
        reviewer_ids = await self._reviews(full_names, start, end, people)

        await self._fill_members(report, kept, prs, reviewer_ids, tz, people)
        self._fill_repositories(report, kept, repos)
        self._fill_totals(report, kept, prs, tz)
        self._fill_observations(report, kept, prs)
        await self._fill_limitations(report, kept, prs, repos)
        return report

    # ── data ──────────────────────────────────────────────────────────────
    async def _repositories_in_scope(
        self, workspace_id: str
    ) -> tuple[str, list[Repository]]:
        from aexy.models.workspace import Workspace

        workspace = await self.db.get(Workspace, workspace_id)
        rows = (
            await self.db.execute(
                select(
                    Repository,
                    WorkspaceRepository.last_sync_at,
                    WorkspaceRepository.sync_status,
                    WorkspaceRepository.adopted_by_developer_id,
                )
                .join(
                    WorkspaceRepository,
                    WorkspaceRepository.repository_id == Repository.id,
                )
                .where(
                    WorkspaceRepository.workspace_id == workspace_id,
                    WorkspaceRepository.is_active.is_(True),
                )
            )
        ).all()
        repos = []
        for repo, last_sync_at, sync_status, adopter_id in rows:
            # Stashed on the instance rather than joined into every later query;
            # the report only needs them for the freshness panel and caveat.
            repo._last_sync_at = last_sync_at  # type: ignore[attr-defined]
            repo._sync_status = sync_status  # type: ignore[attr-defined]
            repo._adopter_id = adopter_id  # type: ignore[attr-defined]
            repos.append(repo)
        return (workspace.name if workspace else workspace_id), repos

    async def _commits(
        self,
        repositories: list[str],
        start: datetime,
        end: datetime,
        people: set[str] | None = None,
    ) -> list[Commit]:
        # `load_only` because the wide columns on this table are the expensive
        # ones and the report reads none of them: `patch_sample` holds up to
        # 50KB of diff per commit, and a busy month is thousands of rows.
        return list(
            (
                await self.db.execute(
                    select(Commit)
                    .options(
                        load_only(
                            Commit.developer_id,
                            Commit.repository,
                            Commit.message,
                            Commit.additions,
                            Commit.deletions,
                            Commit.source_additions,
                            Commit.source_deletions,
                            Commit.is_revert,
                            Commit.content_hash,
                            Commit.committed_at,
                        )
                    )
                    .where(
                        Commit.repository.in_(repositories),
                        Commit.committed_at >= start,
                        Commit.committed_at < end,
                        *human_commit_filters(),
                        *_people_filter(Commit.developer_id, people),
                    )
                )
            )
            .scalars()
            .all()
        )

    async def _excluded_counts(
        self,
        repositories: list[str],
        start: datetime,
        end: datetime,
        people: set[str] | None = None,
    ) -> tuple[int, int]:
        """Bots and merges, counted so the report can show its own subtractions."""
        rows = list(
            (
                await self.db.execute(
                    select(Commit.author_class, Commit.is_merge).where(
                        Commit.repository.in_(repositories),
                        Commit.committed_at >= start,
                        Commit.committed_at < end,
                        *_people_filter(Commit.developer_id, people),
                    )
                )
            ).all()
        )
        bots = sum(1 for author_class, _ in rows if author_class == "bot")
        merges = sum(
            1 for author_class, is_merge in rows if is_merge and author_class != "bot"
        )
        return bots, merges

    async def _pull_requests(
        self,
        repositories: list[str],
        start: datetime,
        end: datetime,
        people: set[str] | None = None,
    ) -> list[PullRequest]:
        # Same reasoning as `_commits`: `embedding` is a 1024-float vector and
        # `ai_analysis` a JSON blob, neither of which this report looks at.
        return list(
            (
                await self.db.execute(
                    select(PullRequest)
                    .options(
                        load_only(
                            PullRequest.developer_id,
                            PullRequest.repository,
                            PullRequest.merged_at,
                            PullRequest.merged_by_developer_id,
                            PullRequest.comments_count,
                            PullRequest.review_comments_count,
                        )
                    )
                    .where(
                        PullRequest.repository.in_(repositories),
                        PullRequest.merged_at >= start,
                        PullRequest.merged_at < end,
                        # Either end counts: a PR one of these people wrote, or
                        # one they merged. Dropping the second would erase the
                        # integration load the report exists to show.
                        *(
                            [
                                or_(
                                    PullRequest.developer_id.in_(people),
                                    PullRequest.merged_by_developer_id.in_(people),
                                )
                            ]
                            if people is not None
                            else []
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )

    async def _reviews(
        self,
        repositories: list[str],
        start: datetime,
        end: datetime,
        people: set[str] | None = None,
    ) -> list[str]:
        """Reviewer ids only — the report counts reviews, it does not read them."""
        rows = (
            (
                await self.db.execute(
                    select(CodeReview.developer_id).where(
                        CodeReview.repository.in_(repositories),
                        CodeReview.submitted_at >= start,
                        CodeReview.submitted_at < end,
                    )
                )
            )
            .scalars()
            .all()
        )
        return [str(developer_id) for developer_id in rows]

    # ── shaping ───────────────────────────────────────────────────────────
    async def _fill_members(
        self,
        report: MonthlyEngineeringReport,
        commits: list[Commit],
        prs: list[PullRequest],
        reviewer_ids: list[str],
        tz: ZoneInfo,
        people: set[str] | None = None,
    ) -> None:
        by_dev: dict[str, dict] = defaultdict(
            lambda: {
                "commits": 0,
                "additions": 0,
                "deletions": 0,
                "repos": set(),
                "days": set(),
                "low_signal": 0,
                "reverts": 0,
                "ported": 0,
            }
        )
        for commit in commits:
            entry = by_dev[str(commit.developer_id)]
            entry["commits"] += 1
            entry["additions"] += _additions(commit)
            entry["deletions"] += _deletions(commit)
            entry["repos"].add(commit.repository)
            entry["days"].add(_as_utc(commit.committed_at).astimezone(tz).date())
            if _is_low_signal(commit.message):
                entry["low_signal"] += 1
            if commit.is_revert:
                entry["reverts"] += 1
            entry["ported"] += getattr(commit, "_ported_copies", 0)

        authored: dict[str, int] = defaultdict(int)
        merged: dict[str, int] = defaultdict(int)
        for pr in prs:
            authored[str(pr.developer_id)] += 1
            if pr.merged_by_developer_id:
                merged[str(pr.merged_by_developer_id)] += 1

        reviewed: dict[str, int] = defaultdict(int)
        for reviewer_id in reviewer_ids:
            reviewed[reviewer_id] += 1

        developer_ids = set(by_dev) | set(authored) | set(merged) | set(reviewed)
        if people is not None:
            # A PR is in scope when somebody here wrote it *or* merged it, so a
            # head merging another team's work drags that author in with it.
            # Their merge belongs in this report; the author does not.
            developer_ids &= people
        names = await self._developer_names(developer_ids)

        for developer_id in developer_ids:
            entry = by_dev.get(developer_id)
            report.members.append(
                MemberRow(
                    developer_id=developer_id,
                    name=names.get(developer_id, "Unknown"),
                    commits=entry["commits"] if entry else 0,
                    source_additions=entry["additions"] if entry else 0,
                    source_deletions=entry["deletions"] if entry else 0,
                    prs_authored=authored.get(developer_id, 0),
                    prs_merged_by_them=merged.get(developer_id, 0),
                    reviews_given=reviewed.get(developer_id, 0),
                    active_days=len(entry["days"]) if entry else 0,
                    repositories=sorted(entry["repos"]) if entry else [],
                    low_signal_subjects=entry["low_signal"] if entry else 0,
                    reverts=entry["reverts"] if entry else 0,
                    ported_commits=entry["ported"] if entry else 0,
                )
            )
        report.members.sort(key=lambda m: (-m.commits, m.name))
        report.contributors = sum(1 for m in report.members if m.commits)

    async def _developer_names(self, developer_ids: set[str]) -> dict[str, str]:
        if not developer_ids:
            return {}
        rows = (
            await self.db.execute(
                select(Developer.id, Developer.name, Developer.email).where(
                    Developer.id.in_(developer_ids)
                )
            )
        ).all()
        return {
            str(dev_id): (name or email or "Unknown") for dev_id, name, email in rows
        }

    def _fill_repositories(
        self,
        report: MonthlyEngineeringReport,
        commits: list[Commit],
        repos: list[Repository],
    ) -> None:
        by_repo: dict[str, dict] = defaultdict(
            lambda: {"commits": 0, "additions": 0, "deletions": 0, "devs": defaultdict(int)}
        )
        for commit in commits:
            entry = by_repo[commit.repository]
            entry["commits"] += 1
            entry["additions"] += _additions(commit)
            entry["deletions"] += _deletions(commit)
            entry["devs"][str(commit.developer_id)] += 1

        names = {m.developer_id: m.name for m in report.members}
        last_sync = {
            r.full_name: getattr(r, "_last_sync_at", None) for r in repos
        }
        for full_name, entry in by_repo.items():
            report.repositories.append(
                RepoRow(
                    full_name=full_name,
                    commits=entry["commits"],
                    source_additions=entry["additions"],
                    source_deletions=entry["deletions"],
                    contributors=[
                        (names.get(dev_id, "Unknown"), count)
                        for dev_id, count in sorted(
                            entry["devs"].items(), key=lambda kv: -kv[1]
                        )
                    ],
                    last_synced_at=last_sync.get(full_name),
                )
            )
        report.repositories.sort(key=lambda r: -r.commits)
        report.active_repositories = len(report.repositories)

    def _fill_totals(
        self,
        report: MonthlyEngineeringReport,
        commits: list[Commit],
        prs: list[PullRequest],
        tz: ZoneInfo,
    ) -> None:
        report.source_additions = sum(_additions(c) for c in commits)
        report.source_deletions = sum(_deletions(c) for c in commits)
        report.prs_merged = len(prs)
        report.active_days = len(
            {_as_utc(c.committed_at).astimezone(tz).date() for c in commits}
        )

    def _fill_observations(
        self,
        report: MonthlyEngineeringReport,
        commits: list[Commit],
        prs: list[PullRequest],
    ) -> None:
        if not report.commits:
            return

        top_repo = report.repositories[0] if report.repositories else None
        if top_repo and len(report.repositories) > 1:
            share = round(top_repo.commits / report.commits * 100)
            if share >= 60:
                report.observations.append(
                    f"**Concentration.** {top_repo.full_name} absorbed {share}% of "
                    f"all commits. Everyone works in it, which makes it the "
                    f"repository where review load and merge conflicts accumulate."
                )

        if report.ported_commits:
            share = round(report.ported_commits / report.commits_before_dedup * 100)
            report.observations.append(
                f"**Porting overhead.** {report.ported_commits} of "
                f"{report.commits_before_dedup} commits ({share}%) were the same "
                f"change landed on more than one branch. That is real time spent "
                f"moving work between branches rather than doing new work."
            )

        mergers = sorted(
            (m for m in report.members if m.prs_merged_by_them),
            key=lambda m: -m.prs_merged_by_them,
        )
        if report.prs_merged and len(mergers) >= 2:
            top_two = mergers[0].prs_merged_by_them + mergers[1].prs_merged_by_them
            share = round(top_two / report.prs_merged * 100)
            if share >= 70:
                report.observations.append(
                    f"**Integration is carried by two people.** {mergers[0].name} "
                    f"and {mergers[1].name} merged {share}% of all pull requests. "
                    f"That is a review bottleneck and a leave/handover risk."
                )

        sloppy = [
            m
            for m in report.members
            if m.commits >= 10 and m.low_signal_subjects / m.commits >= 0.25
        ]
        if sloppy:
            names = ", ".join(
                f"{m.name} ({m.low_signal_subjects}/{m.commits})" for m in sloppy
            )
            report.observations.append(
                f"**Commit-message quality is uneven.** A quarter or more of these "
                f"contributors' subjects carry no information — {names}. Their work "
                f"is substantial and their history is hard to audit or bisect, which "
                f"is the cheapest process fix available."
            )

        reverts = sum(m.reverts for m in report.members)
        if reverts:
            report.observations.append(
                f"**{reverts} revert{'s' if reverts != 1 else ''} landed this month.** "
                f"Worth checking how many were same-day: a change that ships and is "
                f"pulled within hours usually means a missing pre-merge check rather "
                f"than a bad decision."
            )

        unreviewed = sum(
            1 for pr in prs if not (pr.review_comments_count or pr.comments_count)
        )
        if prs and unreviewed / len(prs) >= 0.5:
            share = round(unreviewed / len(prs) * 100)
            report.observations.append(
                f"**{share}% of merged pull requests carry no comments.** Either "
                f"review is happening somewhere git cannot see it, or it is not "
                f"happening."
            )

    async def _fill_limitations(
        self,
        report: MonthlyEngineeringReport,
        commits: list[Commit],
        prs: list[PullRequest],
        repos: list[Repository],
    ) -> None:
        undeduped = sum(1 for c in commits if not c.content_hash)
        if undeduped:
            report.limitations.append(
                f"{undeduped} commits have no content fingerprint (synced before it "
                f"was recorded, or a merge with no diff) and could not be checked "
                f"for porting. Each is counted once."
            )

        unmeasured = sum(1 for c in commits if c.source_additions is None)
        if unmeasured:
            report.limitations.append(
                f"{unmeasured} commits predate source-only line counting, so their "
                f"lines still include lockfiles and generated output. Line totals "
                f"are an over-count by that much."
            )

        if prs:
            no_merger = sum(1 for pr in prs if not pr.merged_by_developer_id)
            if no_merger:
                report.limitations.append(
                    f"{no_merger} of {len(prs)} merged pull requests have no "
                    f"recorded merger — merged before that was captured, or merged "
                    f"by someone with no account here. Those merges are missing "
                    f"from the integration-load column."
                )

        stale = [
            r.full_name
            for r in repos
            if _as_utc(getattr(r, "_last_sync_at", None)) is None
            or _as_utc(getattr(r, "_last_sync_at")) < report.period_end
        ]
        if stale:
            report.limitations.append(
                f"Last sync predates the end of the period for: {', '.join(sorted(stale)[:8])}"
                f"{' and others' if len(stale) > 8 else ''}. Work that landed after "
                f"the last sync is not in these figures."
            )

        if report.scope_departments:
            report.limitations.insert(
                0,
                "This report covers "
                f"{', '.join(report.scope_departments)} only — every figure "
                "above is that department's, not the workspace's. Work those "
                "people did with colleagues elsewhere still counts here; work "
                "the rest of the workspace did does not appear at all.",
            )

        report.limitations.append(
            "Commit counts reflect branching style as much as output, and the "
            "review effort visible here is only what reached GitHub. Incident "
            "response, pairing, design and coordination leave no git trace at all."
        )


# ── helpers ───────────────────────────────────────────────────────────────
def _people_filter(column, people: set[str] | None) -> list:
    """Restrict a query to a set of developers, or not at all.

    `None` and the empty set mean different things and must not be conflated:
    None is "the whole workspace", while an empty set is a head whose
    department has nobody in it, and their report should be empty rather than
    everybody's.
    """
    if people is None:
        return []
    return [column.in_(people)]


def _as_utc(value: datetime | None) -> datetime | None:
    """Timestamps come back timezone-aware from Postgres and naive from SQLite.

    Everything is stored in UTC either way, so a naive value is read as UTC
    rather than left to blow up the first time it meets an aware one.
    """
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _additions(commit: Commit) -> int:
    value = commit.source_additions
    return int(value if value is not None else (commit.additions or 0))


def _deletions(commit: Commit) -> int:
    value = commit.source_deletions
    return int(value if value is not None else (commit.deletions or 0))


def _is_low_signal(message: str | None) -> bool:
    if not message:
        return True
    subject = message.strip().splitlines()[0] if message.strip() else ""
    return bool(_LOW_SIGNAL_SUBJECTS.match(subject))


def _sync_state(repos: list[Repository], period_end: datetime) -> list[RepoSyncState]:
    """Per-repository freshness, so the page can offer a sync before reporting."""
    states = []
    for repo in repos:
        last = _as_utc(getattr(repo, "_last_sync_at", None))
        states.append(
            RepoSyncState(
                repository_id=str(repo.id),
                full_name=repo.full_name,
                sync_status=getattr(repo, "_sync_status", "unknown") or "unknown",
                last_synced_at=last,
                covers_period=last is not None and last >= period_end,
                has_adopter=bool(getattr(repo, "_adopter_id", None)),
            )
        )
    states.sort(key=lambda s: (s.covers_period, s.full_name))
    return states


def _dedupe_ports(commits: list[Commit]) -> tuple[list[Commit], int]:
    """Collapse the same change landed on several branches into one commit.

    Keyed on (repository, content_hash, author) and keeping the earliest,
    matching how a person would count: the port is the same work as the
    original, and it belongs to whoever wrote it. A commit with no fingerprint
    is kept as-is — unknown is not the same as unique, and `limitations` says
    how many.

    Repository is in the key because a port is a port *within* a repo. The same
    one-line change made in two repositories — a shared header, an identical
    dependency bump — is two pieces of work, and collapsing them would quietly
    delete one from somebody's month. A genuine cross-repo port is counted
    twice as a result, which is the error worth having: an over-count shows up
    in the table where somebody can argue with it.

    Each survivor carries `_ported_copies` so the per-member table can show how
    much of somebody's month was spent moving work between branches.
    """
    by_key: dict[tuple[str, str, str], Commit] = {}
    kept: list[Commit] = []
    ported = 0

    for commit in sorted(commits, key=lambda c: _as_utc(c.committed_at)):
        commit._ported_copies = 0  # type: ignore[attr-defined]
        if not commit.content_hash:
            kept.append(commit)
            continue
        key = (commit.repository, commit.content_hash, str(commit.developer_id))
        first = by_key.get(key)
        if first is None:
            by_key[key] = commit
            kept.append(commit)
            continue
        first._ported_copies += 1  # type: ignore[attr-defined]
        ported += 1

    return kept, ported
