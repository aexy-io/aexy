"""Developer Insights Service - computes velocity, efficiency, quality,
sustainability, collaboration, and team distribution metrics."""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)

from sqlalchemy import select, func, and_, case, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from zoneinfo import ZoneInfo

from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.notification import Notification, NotificationEventType
from aexy.models.developer_insights import (
    DeveloperMetricsSnapshot,
    DeveloperWorkingSchedule,
    InsightAlertHistory,
    InsightAlertRule,
    InsightSettings,
    TeamMetricsSnapshot,
    PeriodType,
)
from aexy.models.sprint import Sprint, SprintTask
from aexy.models.team import TeamMember
from aexy.models.workspace import WorkspaceMember


# ---------------------------------------------------------------------------
# Data classes for structured return values
# ---------------------------------------------------------------------------

@dataclass
class VelocityMetrics:
    commits_count: int = 0
    prs_merged: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    net_lines: int = 0
    commit_frequency: float = 0.0  # commits per working day
    pr_throughput: float = 0.0  # PRs merged per week
    avg_commit_size: float = 0.0  # lines changed per commit

    def to_dict(self) -> dict:
        return {
            "commits_count": self.commits_count,
            "prs_merged": self.prs_merged,
            "lines_added": self.lines_added,
            "lines_removed": self.lines_removed,
            "net_lines": self.net_lines,
            "commit_frequency": round(self.commit_frequency, 2),
            "pr_throughput": round(self.pr_throughput, 2),
            "avg_commit_size": round(self.avg_commit_size, 2),
        }


@dataclass
class EfficiencyMetrics:
    avg_pr_cycle_time_hours: float = 0.0
    avg_time_to_first_review_hours: float = 0.0
    avg_pr_size: float = 0.0
    pr_merge_rate: float = 0.0
    first_commit_to_merge_hours: float = 0.0
    rework_ratio: float = 0.0

    def to_dict(self) -> dict:
        return {
            "avg_pr_cycle_time_hours": round(self.avg_pr_cycle_time_hours, 2),
            "avg_time_to_first_review_hours": round(self.avg_time_to_first_review_hours, 2),
            "avg_pr_size": round(self.avg_pr_size, 2),
            "pr_merge_rate": round(self.pr_merge_rate, 2),
            "first_commit_to_merge_hours": round(self.first_commit_to_merge_hours, 2),
            "rework_ratio": round(self.rework_ratio, 2),
        }


@dataclass
class QualityMetrics:
    review_participation_rate: float = 0.0
    avg_review_depth: float = 0.0  # comments per review
    review_turnaround_hours: float = 0.0
    self_merge_rate: float = 0.0

    def to_dict(self) -> dict:
        return {
            "review_participation_rate": round(self.review_participation_rate, 2),
            "avg_review_depth": round(self.avg_review_depth, 2),
            "review_turnaround_hours": round(self.review_turnaround_hours, 2),
            "self_merge_rate": round(self.self_merge_rate, 2),
        }


@dataclass
class SustainabilityMetrics:
    weekend_commit_ratio: float = 0.0
    late_night_commit_ratio: float = 0.0  # after 10pm
    longest_streak_days: int = 0
    avg_daily_active_hours: float = 0.0
    focus_score: float = 0.0  # single-repo concentration

    def to_dict(self) -> dict:
        return {
            "weekend_commit_ratio": round(self.weekend_commit_ratio, 2),
            "late_night_commit_ratio": round(self.late_night_commit_ratio, 2),
            "longest_streak_days": self.longest_streak_days,
            "avg_daily_active_hours": round(self.avg_daily_active_hours, 2),
            "focus_score": round(self.focus_score, 2),
        }


@dataclass
class CollaborationMetrics:
    unique_collaborators: int = 0
    cross_team_pr_ratio: float = 0.0
    review_given_count: int = 0
    review_received_count: int = 0
    knowledge_sharing_score: float = 0.0

    def to_dict(self) -> dict:
        return {
            "unique_collaborators": self.unique_collaborators,
            "cross_team_pr_ratio": round(self.cross_team_pr_ratio, 2),
            "review_given_count": self.review_given_count,
            "review_received_count": self.review_received_count,
            "knowledge_sharing_score": round(self.knowledge_sharing_score, 2),
        }


@dataclass
class SprintProductivityMetrics:
    tasks_assigned: int = 0
    tasks_completed: int = 0
    story_points_committed: int = 0
    story_points_completed: int = 0
    task_completion_rate: float = 0.0
    avg_cycle_time_hours: float = 0.0
    avg_lead_time_hours: float = 0.0
    sprints_participated: int = 0
    carry_over_tasks: int = 0
    task_type_distribution: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "tasks_assigned": self.tasks_assigned,
            "tasks_completed": self.tasks_completed,
            "story_points_committed": self.story_points_committed,
            "story_points_completed": self.story_points_completed,
            "task_completion_rate": round(self.task_completion_rate, 2),
            "avg_cycle_time_hours": round(self.avg_cycle_time_hours, 2),
            "avg_lead_time_hours": round(self.avg_lead_time_hours, 2),
            "sprints_participated": self.sprints_participated,
            "carry_over_tasks": self.carry_over_tasks,
            "task_type_distribution": self.task_type_distribution,
        }


@dataclass
class MemberSummary:
    developer_id: str
    commits_count: int = 0
    prs_merged: int = 0
    lines_changed: int = 0
    reviews_given: int = 0

    def to_dict(self) -> dict:
        return {
            "developer_id": self.developer_id,
            "commits_count": self.commits_count,
            "prs_merged": self.prs_merged,
            "lines_changed": self.lines_changed,
            "reviews_given": self.reviews_given,
        }


@dataclass
class TeamDistribution:
    gini_coefficient: float = 0.0
    top_contributor_share: float = 0.0
    member_metrics: list[MemberSummary] = field(default_factory=list)
    bottleneck_developers: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "gini_coefficient": round(self.gini_coefficient, 4),
            "top_contributor_share": round(self.top_contributor_share, 2),
            "member_metrics": [m.to_dict() for m in self.member_metrics],
            "bottleneck_developers": self.bottleneck_developers,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _working_days_in_range(start: datetime, end: datetime) -> int:
    """Count weekdays between two dates (inclusive)."""
    days = 0
    current = start.date() if isinstance(start, datetime) else start
    end_d = end.date() if isinstance(end, datetime) else end
    while current <= end_d:
        if current.weekday() < 5:
            days += 1
        current += timedelta(days=1)
    return max(days, 1)


def _weeks_in_range(start: datetime, end: datetime) -> float:
    delta = (end - start).total_seconds()
    weeks = delta / (7 * 86400)
    return max(weeks, 1.0 / 7)


def compute_gini(values: list[float]) -> float:
    """Compute Gini coefficient for a list of values. 0 = perfect equality, 1 = max inequality."""
    if not values or all(v == 0 for v in values):
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    cumsum = 0.0
    for i, v in enumerate(sorted_vals):
        cumsum += (2 * (i + 1) - n - 1) * v
    total = sum(sorted_vals)
    if total == 0:
        return 0.0
    return cumsum / (n * total)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class DeveloperInsightsService:
    """Computes and persists developer/team performance metrics."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # Velocity
    # -----------------------------------------------------------------------
    async def compute_velocity_metrics(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> VelocityMetrics:
        # Commits aggregate
        commits_stmt = select(
            func.count(Commit.id).label("count"),
            func.coalesce(func.sum(Commit.additions), 0).label("additions"),
            func.coalesce(func.sum(Commit.deletions), 0).label("deletions"),
        ).where(
            and_(
                Commit.developer_id == developer_id,
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        )
        commits_result = await self.db.execute(commits_stmt)
        c = commits_result.one()

        # PRs merged
        prs_stmt = select(
            func.count(PullRequest.id).label("merged"),
        ).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.merged_at.isnot(None),
                PullRequest.merged_at >= start,
                PullRequest.merged_at <= end,
            )
        )
        prs_result = await self.db.execute(prs_stmt)
        prs_merged = prs_result.scalar() or 0

        commits_count = c.count or 0
        lines_added = c.additions or 0
        lines_removed = c.deletions or 0
        total_lines_changed = lines_added + lines_removed

        working_days = _working_days_in_range(start, end)
        weeks = _weeks_in_range(start, end)

        return VelocityMetrics(
            commits_count=commits_count,
            prs_merged=prs_merged,
            lines_added=lines_added,
            lines_removed=lines_removed,
            net_lines=lines_added - lines_removed,
            commit_frequency=commits_count / working_days if working_days else 0,
            pr_throughput=prs_merged / weeks if weeks else 0,
            avg_commit_size=total_lines_changed / commits_count if commits_count else 0,
        )

    # -----------------------------------------------------------------------
    # Efficiency
    # -----------------------------------------------------------------------
    async def compute_efficiency_metrics(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> EfficiencyMetrics:
        # All PRs in range (by created_at_github)
        prs_stmt = select(PullRequest).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.created_at_github >= start,
                PullRequest.created_at_github <= end,
            )
        )
        prs_result = await self.db.execute(prs_stmt)
        prs = list(prs_result.scalars().all())

        if not prs:
            return EfficiencyMetrics()

        total_prs = len(prs)
        merged_prs = [p for p in prs if p.merged_at]
        merge_count = len(merged_prs)

        # Cycle time: created_at_github → merged_at
        cycle_times = []
        for p in merged_prs:
            dt = (p.merged_at - p.created_at_github).total_seconds() / 3600
            cycle_times.append(dt)

        # Time to first review (batch query)
        pr_github_ids = [p.github_id for p in prs]
        first_review_stmt = select(
            CodeReview.pull_request_github_id,
            func.min(CodeReview.submitted_at),
        ).where(
            CodeReview.pull_request_github_id.in_(pr_github_ids),
        ).group_by(CodeReview.pull_request_github_id)
        first_review_result = await self.db.execute(first_review_stmt)
        first_review_map = {row[0]: row[1] for row in first_review_result.all()}

        first_review_times = []
        pr_created_map = {p.github_id: p.created_at_github for p in prs}
        for gh_id, first_review_at in first_review_map.items():
            if first_review_at and gh_id in pr_created_map:
                dt = (first_review_at - pr_created_map[gh_id]).total_seconds() / 3600
                first_review_times.append(dt)

        # Average PR size
        avg_pr_size = sum(p.additions + p.deletions for p in prs) / total_prs if total_prs else 0

        # Rework ratio (batch query): PRs with > 1 changes_requested review
        changes_requested_stmt = select(
            CodeReview.pull_request_github_id,
            func.count(CodeReview.id),
        ).where(
            and_(
                CodeReview.pull_request_github_id.in_(pr_github_ids),
                CodeReview.state == "changes_requested",
            )
        ).group_by(CodeReview.pull_request_github_id)
        cr_result = await self.db.execute(changes_requested_stmt)
        cr_counts = {row[0]: row[1] for row in cr_result.all()}
        rework_count = sum(1 for gh_id in pr_github_ids if cr_counts.get(gh_id, 0) > 1)

        # First commit to merge (batch query): fetch all relevant commits at once
        first_commit_to_merge_times = []
        if merged_prs:
            min_lookback = min(p.created_at_github - timedelta(days=14) for p in merged_prs)
            max_merge = max(p.merged_at for p in merged_prs)
            repos = list(set(p.repository for p in merged_prs if p.repository))

            if repos:
                all_commits_stmt = select(
                    Commit.repository,
                    Commit.committed_at,
                ).where(
                    and_(
                        Commit.developer_id == developer_id,
                        Commit.repository.in_(repos),
                        Commit.committed_at >= min_lookback,
                        Commit.committed_at <= max_merge,
                    )
                )
                commits_result = await self.db.execute(all_commits_stmt)
                commits_by_repo: dict[str, list[datetime]] = {}
                for c_repo, c_time in commits_result.all():
                    commits_by_repo.setdefault(c_repo, []).append(c_time)

                for p in merged_prs:
                    repo_commits = commits_by_repo.get(p.repository, [])
                    lookback = p.created_at_github - timedelta(days=14)
                    valid = [c for c in repo_commits if lookback <= c <= p.merged_at]
                    if valid:
                        earliest = min(valid)
                        dt = (p.merged_at - earliest).total_seconds() / 3600
                    else:
                        dt = (p.merged_at - p.created_at_github).total_seconds() / 3600
                    first_commit_to_merge_times.append(dt)

        return EfficiencyMetrics(
            avg_pr_cycle_time_hours=sum(cycle_times) / len(cycle_times) if cycle_times else 0,
            avg_time_to_first_review_hours=sum(first_review_times) / len(first_review_times) if first_review_times else 0,
            avg_pr_size=avg_pr_size,
            pr_merge_rate=merge_count / total_prs if total_prs else 0,
            first_commit_to_merge_hours=sum(first_commit_to_merge_times) / len(first_commit_to_merge_times) if first_commit_to_merge_times else 0,
            rework_ratio=rework_count / total_prs if total_prs else 0,
        )

    # -----------------------------------------------------------------------
    # PR Size Analysis
    # -----------------------------------------------------------------------
    @staticmethod
    def classify_pr_size(additions: int, deletions: int) -> str:
        total = additions + deletions
        if total <= 10:
            return "trivial"
        elif total <= 100:
            return "small"
        elif total <= 400:
            return "medium"
        elif total <= 1000:
            return "large"
        else:
            return "massive"

    async def compute_pr_size_distribution(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Analyze PR sizes and return distribution + details.

        Returns {"distribution": {"trivial": n, ...}, "avg_size": float,
                 "median_size": float, "prs": [{"id", "title", "size", "category"}]}
        """
        prs_stmt = select(PullRequest).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.created_at_github >= start,
                PullRequest.created_at_github <= end,
            )
        )
        result = await self.db.execute(prs_stmt)
        prs = list(result.scalars().all())

        if not prs:
            return {
                "distribution": {"trivial": 0, "small": 0, "medium": 0, "large": 0, "massive": 0},
                "avg_size": 0,
                "median_size": 0,
                "total_prs": 0,
                "prs": [],
            }

        distribution = {"trivial": 0, "small": 0, "medium": 0, "large": 0, "massive": 0}
        pr_details = []
        sizes = []

        for p in prs:
            size = p.additions + p.deletions
            cat = self.classify_pr_size(p.additions, p.deletions)
            distribution[cat] += 1
            sizes.append(size)
            pr_details.append({
                "id": str(p.id),
                "title": p.title,
                "additions": p.additions,
                "deletions": p.deletions,
                "size": size,
                "category": cat,
                "state": p.state,
            })

        sizes.sort()
        if not sizes:
            median = 0
        elif len(sizes) % 2 == 1:
            median = sizes[len(sizes) // 2]
        else:
            mid = len(sizes) // 2
            median = (sizes[mid - 1] + sizes[mid]) / 2

        return {
            "distribution": distribution,
            "avg_size": round(sum(sizes) / len(sizes), 1) if sizes else 0,
            "median_size": median,
            "total_prs": len(prs),
            "prs": sorted(pr_details, key=lambda x: x["size"], reverse=True),
        }

    # -----------------------------------------------------------------------
    # Code Churn / Rework Detection
    # -----------------------------------------------------------------------
    async def compute_code_churn(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
        churn_window_days: int = 7,
    ) -> dict:
        """Detect code churn: deletions on files the developer recently added to.

        Approximation: For commits in the period, count deletions in the same repo
        within `churn_window_days` of a prior addition-heavy commit.

        Returns {"churn_rate": float, "total_additions": int, "total_deletions": int,
                 "churn_deletions": int, "per_repo": [{repo, additions, deletions, churn_deletions, churn_rate}]}
        """
        commits_stmt = select(Commit).where(
            and_(
                Commit.developer_id == developer_id,
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        ).order_by(Commit.committed_at)
        result = await self.db.execute(commits_stmt)
        commits = list(result.scalars().all())

        if not commits:
            return {
                "churn_rate": 0.0,
                "total_additions": 0,
                "total_deletions": 0,
                "churn_deletions": 0,
                "per_repo": [],
            }

        # Group by repo
        repo_commits: dict[str, list] = {}
        for c in commits:
            repo_commits.setdefault(c.repository, []).append(c)

        total_additions = 0
        total_deletions = 0
        total_churn_deletions = 0
        per_repo = []

        for repo, repo_coms in repo_commits.items():
            repo_additions = sum(c.additions for c in repo_coms)
            repo_deletions = sum(c.deletions for c in repo_coms)
            churn_deletions = 0

            # For each commit with deletions, check if there was an
            # addition-heavy commit to the same repo within churn_window_days before
            for i, c in enumerate(repo_coms):
                if c.deletions == 0:
                    continue
                window_start = c.committed_at - timedelta(days=churn_window_days)
                prior_additions = sum(
                    pc.additions
                    for pc in repo_coms[:i]
                    if pc.committed_at >= window_start and pc.additions > 0
                )
                if prior_additions > 0:
                    # Churn = deletions that happen shortly after additions
                    churn_deletions += min(c.deletions, prior_additions)

            total_additions += repo_additions
            total_deletions += repo_deletions
            total_churn_deletions += churn_deletions

            churn_rate = churn_deletions / repo_additions if repo_additions > 0 else 0.0
            per_repo.append({
                "repository": repo,
                "additions": repo_additions,
                "deletions": repo_deletions,
                "churn_deletions": churn_deletions,
                "churn_rate": round(churn_rate, 3),
            })

        overall_churn_rate = total_churn_deletions / total_additions if total_additions > 0 else 0.0

        return {
            "churn_rate": round(overall_churn_rate, 3),
            "total_additions": total_additions,
            "total_deletions": total_deletions,
            "churn_deletions": total_churn_deletions,
            "per_repo": sorted(per_repo, key=lambda x: x["churn_deletions"], reverse=True),
        }

    # -----------------------------------------------------------------------
    # Quality
    # -----------------------------------------------------------------------
    async def compute_quality_metrics(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> QualityMetrics:
        # Reviews given by this developer
        reviews_given_stmt = select(
            func.count(CodeReview.id).label("count"),
            func.coalesce(func.sum(CodeReview.comments_count), 0).label("total_comments"),
        ).where(
            and_(
                CodeReview.developer_id == developer_id,
                CodeReview.submitted_at >= start,
                CodeReview.submitted_at <= end,
            )
        )
        reviews_result = await self.db.execute(reviews_given_stmt)
        r = reviews_result.one()
        reviews_count = r.count or 0
        total_comments = r.total_comments or 0

        # Review participation: reviews given / PRs in team that needed review
        # Simplified: count of reviews given is already useful
        # For participation rate, compute reviews_given / total_prs_in_workspace_by_others
        # For now use reviews_count as absolute; rate is reviews/working_days
        working_days = _working_days_in_range(start, end)
        participation_rate = reviews_count / working_days if working_days else 0

        # Avg review depth = comments per review
        avg_depth = total_comments / reviews_count if reviews_count else 0

        # Review turnaround: avg time from PR created to review submitted
        turnaround_stmt = select(
            CodeReview.submitted_at,
            CodeReview.pull_request_github_id,
        ).where(
            and_(
                CodeReview.developer_id == developer_id,
                CodeReview.submitted_at >= start,
                CodeReview.submitted_at <= end,
            )
        )
        turnaround_result = await self.db.execute(turnaround_stmt)
        turnaround_rows = turnaround_result.all()

        turnaround_hours = []
        for row in turnaround_rows:
            pr_stmt = select(PullRequest.created_at_github).where(
                PullRequest.github_id == row.pull_request_github_id,
            )
            pr_result = await self.db.execute(pr_stmt)
            pr_created = pr_result.scalar()
            if pr_created and row.submitted_at:
                dt = (row.submitted_at - pr_created).total_seconds() / 3600
                if dt >= 0:
                    turnaround_hours.append(dt)

        avg_turnaround = sum(turnaround_hours) / len(turnaround_hours) if turnaround_hours else 0

        # Self-merge rate: PRs by developer that were merged without any review from others
        own_prs_stmt = select(PullRequest).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.merged_at.isnot(None),
                PullRequest.merged_at >= start,
                PullRequest.merged_at <= end,
            )
        )
        own_prs_result = await self.db.execute(own_prs_stmt)
        own_prs = list(own_prs_result.scalars().all())

        self_merged = 0
        if own_prs:
            own_pr_ids = [p.github_id for p in own_prs]
            other_review_stmt = select(
                CodeReview.pull_request_github_id,
                func.count(CodeReview.id),
            ).where(
                and_(
                    CodeReview.pull_request_github_id.in_(own_pr_ids),
                    CodeReview.developer_id != developer_id,
                )
            ).group_by(CodeReview.pull_request_github_id)
            other_result = await self.db.execute(other_review_stmt)
            other_counts = {row[0]: row[1] for row in other_result.all()}
            self_merged = sum(1 for p in own_prs if other_counts.get(p.github_id, 0) == 0)

        self_merge_rate = self_merged / len(own_prs) if own_prs else 0

        return QualityMetrics(
            review_participation_rate=participation_rate,
            avg_review_depth=avg_depth,
            review_turnaround_hours=avg_turnaround,
            self_merge_rate=self_merge_rate,
        )

    # -----------------------------------------------------------------------
    # Working Schedule Helpers
    # -----------------------------------------------------------------------
    async def _get_working_schedule(
        self,
        developer_id: str,
        workspace_id: str | None = None,
    ) -> tuple[str, list[int], int]:
        """Get developer's working schedule config (timezone, working_days, late_night_hour).

        Falls back to workspace settings, then to defaults.
        """
        # Try developer-specific schedule
        if workspace_id:
            dev_sched_stmt = select(DeveloperWorkingSchedule).where(
                and_(
                    DeveloperWorkingSchedule.developer_id == developer_id,
                    DeveloperWorkingSchedule.workspace_id == workspace_id,
                )
            )
            result = await self.db.execute(dev_sched_stmt)
            dev_sched = result.scalar_one_or_none()
            if dev_sched:
                working_days = dev_sched.working_days or [0, 1, 2, 3, 4]
                return dev_sched.timezone, working_days, dev_sched.late_night_threshold_hour

            # Try workspace-level settings
            ws_settings_stmt = select(InsightSettings).where(
                and_(
                    InsightSettings.workspace_id == workspace_id,
                    InsightSettings.team_id == None,
                )
            )
            ws_result = await self.db.execute(ws_settings_stmt)
            ws_settings = ws_result.scalar_one_or_none()
            if ws_settings and ws_settings.working_hours:
                wh = ws_settings.working_hours
                return (
                    wh.get("timezone", "UTC"),
                    [0, 1, 2, 3, 4],
                    wh.get("late_night_threshold_hour", 22),
                )

        # Defaults
        return "UTC", [0, 1, 2, 3, 4], 22

    # -----------------------------------------------------------------------
    # Sustainability
    # -----------------------------------------------------------------------
    async def compute_sustainability_metrics(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
        workspace_id: str | None = None,
    ) -> SustainabilityMetrics:
        # Load developer's working schedule config
        tz_name, working_days, late_night_hour = await self._get_working_schedule(
            developer_id, workspace_id
        )
        try:
            tz = ZoneInfo(tz_name)
        except (KeyError, ValueError):
            tz = ZoneInfo("UTC")

        # Get all commits in range
        commits_stmt = select(
            Commit.committed_at,
            Commit.repository,
        ).where(
            and_(
                Commit.developer_id == developer_id,
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        ).order_by(Commit.committed_at)
        commits_result = await self.db.execute(commits_stmt)
        commits = commits_result.all()

        if not commits:
            return SustainabilityMetrics()

        total = len(commits)

        # Convert to developer's timezone for accurate weekend/late-night detection
        def _to_local(dt: datetime) -> datetime:
            if dt.tzinfo is None:
                return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
            return dt.astimezone(tz)

        # Weekend ratio (based on developer's configured working days)
        weekend_count = sum(
            1 for c in commits if _to_local(c.committed_at).weekday() not in working_days
        )
        weekend_ratio = weekend_count / total

        # Late night ratio (based on developer's configured late night threshold)
        late_count = sum(
            1 for c in commits if _to_local(c.committed_at).hour >= late_night_hour
        )
        late_ratio = late_count / total

        # Longest streak (consecutive calendar days with commits)
        commit_dates = sorted({c.committed_at.date() for c in commits})
        longest_streak = 1
        current_streak = 1
        for i in range(1, len(commit_dates)):
            if (commit_dates[i] - commit_dates[i - 1]).days == 1:
                current_streak += 1
                longest_streak = max(longest_streak, current_streak)
            else:
                current_streak = 1

        # Average daily active hours
        # Group commits by date and compute hour spread
        from collections import defaultdict
        daily_hours: dict[object, list[int]] = defaultdict(list)
        for c in commits:
            daily_hours[c.committed_at.date()].append(c.committed_at.hour)

        spreads = []
        for hours in daily_hours.values():
            if hours:
                spreads.append(max(hours) - min(hours) + 1)
        avg_active_hours = sum(spreads) / len(spreads) if spreads else 0

        # Focus score: HHI (Herfindahl-Hirschman Index) across repos
        repo_counts: dict[str, int] = defaultdict(int)
        for c in commits:
            repo_counts[c.repository] += 1
        if repo_counts:
            shares = [count / total for count in repo_counts.values()]
            focus_score = sum(s * s for s in shares)
        else:
            focus_score = 0

        return SustainabilityMetrics(
            weekend_commit_ratio=weekend_ratio,
            late_night_commit_ratio=late_ratio,
            longest_streak_days=longest_streak if len(commit_dates) > 0 else 0,
            avg_daily_active_hours=avg_active_hours,
            focus_score=focus_score,
        )

    # -----------------------------------------------------------------------
    # Collaboration
    # -----------------------------------------------------------------------
    async def compute_collaboration_metrics(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> CollaborationMetrics:
        # Reviews given by this developer
        reviews_given_stmt = select(func.count(CodeReview.id)).where(
            and_(
                CodeReview.developer_id == developer_id,
                CodeReview.submitted_at >= start,
                CodeReview.submitted_at <= end,
            )
        )
        reviews_given = (await self.db.execute(reviews_given_stmt)).scalar() or 0

        # Reviews received on this developer's PRs
        own_pr_ids_stmt = select(PullRequest.github_id).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.created_at_github >= start,
                PullRequest.created_at_github <= end,
            )
        )
        own_pr_ids_result = await self.db.execute(own_pr_ids_stmt)
        own_pr_github_ids = [row[0] for row in own_pr_ids_result.all()]

        reviews_received = 0
        reviewer_ids: set[str] = set()
        if own_pr_github_ids:
            reviews_received_stmt = select(
                func.count(CodeReview.id),
            ).where(
                and_(
                    CodeReview.pull_request_github_id.in_(own_pr_github_ids),
                    CodeReview.developer_id != developer_id,
                )
            )
            reviews_received = (await self.db.execute(reviews_received_stmt)).scalar() or 0

            # Unique reviewers on my PRs
            reviewers_stmt = select(distinct(CodeReview.developer_id)).where(
                and_(
                    CodeReview.pull_request_github_id.in_(own_pr_github_ids),
                    CodeReview.developer_id != developer_id,
                )
            )
            reviewers_result = await self.db.execute(reviewers_stmt)
            reviewer_ids = {row[0] for row in reviewers_result.all()}

        # Unique people I reviewed
        reviewed_pr_authors_stmt = select(distinct(CodeReview.pull_request_github_id)).where(
            and_(
                CodeReview.developer_id == developer_id,
                CodeReview.submitted_at >= start,
                CodeReview.submitted_at <= end,
            )
        )
        reviewed_result = await self.db.execute(reviewed_pr_authors_stmt)
        reviewed_pr_github_ids = [row[0] for row in reviewed_result.all()]

        reviewed_author_ids: set[str] = set()
        if reviewed_pr_github_ids:
            authors_stmt = select(distinct(PullRequest.developer_id)).where(
                PullRequest.github_id.in_(reviewed_pr_github_ids),
            )
            authors_result = await self.db.execute(authors_stmt)
            reviewed_author_ids = {row[0] for row in authors_result.all()} - {developer_id}

        unique_collaborators = len(reviewer_ids | reviewed_author_ids)

        # Cross-team PR ratio: PRs touching repos outside developer's primary repo
        repos_stmt = select(Commit.repository, func.count(Commit.id)).where(
            and_(
                Commit.developer_id == developer_id,
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        ).group_by(Commit.repository).order_by(func.count(Commit.id).desc())
        repos_result = await self.db.execute(repos_stmt)
        repos = repos_result.all()

        if repos and len(repos) > 1:
            primary_repo = repos[0][0]
            # PRs on non-primary repos
            total_dev_prs_stmt = select(func.count(PullRequest.id)).where(
                and_(
                    PullRequest.developer_id == developer_id,
                    PullRequest.created_at_github >= start,
                    PullRequest.created_at_github <= end,
                )
            )
            total_dev_prs = (await self.db.execute(total_dev_prs_stmt)).scalar() or 0
            cross_prs_stmt = select(func.count(PullRequest.id)).where(
                and_(
                    PullRequest.developer_id == developer_id,
                    PullRequest.created_at_github >= start,
                    PullRequest.created_at_github <= end,
                    PullRequest.repository != primary_repo,
                )
            )
            cross_prs = (await self.db.execute(cross_prs_stmt)).scalar() or 0
            cross_team_pr_ratio = cross_prs / total_dev_prs if total_dev_prs else 0
        else:
            cross_team_pr_ratio = 0.0

        # Knowledge sharing score: normalized(reviews_given * unique_collaborators)
        # Simple heuristic: min(1.0, (reviews_given * unique_collaborators) / 50)
        raw_sharing = reviews_given * max(unique_collaborators, 1)
        knowledge_sharing_score = min(1.0, raw_sharing / 50)

        return CollaborationMetrics(
            unique_collaborators=unique_collaborators,
            cross_team_pr_ratio=cross_team_pr_ratio,
            review_given_count=reviews_given,
            review_received_count=reviews_received,
            knowledge_sharing_score=knowledge_sharing_score,
        )

    # -----------------------------------------------------------------------
    # Sprint Productivity
    # -----------------------------------------------------------------------
    async def compute_sprint_metrics(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> SprintProductivityMetrics:
        """Compute sprint/task-based productivity metrics for a developer."""

        # Get all tasks assigned to this developer in the period
        tasks_stmt = select(SprintTask).where(
            and_(
                SprintTask.assignee_id == developer_id,
                SprintTask.created_at >= start,
                SprintTask.created_at <= end,
            )
        )
        result = await self.db.execute(tasks_stmt)
        tasks = result.scalars().all()

        if not tasks:
            return SprintProductivityMetrics()

        tasks_assigned = len(tasks)
        tasks_completed = sum(1 for t in tasks if t.status == "done")
        story_points_committed = sum(t.story_points or 0 for t in tasks)
        story_points_completed = sum(
            t.story_points or 0 for t in tasks if t.status == "done"
        )

        # Completion rate
        task_completion_rate = (
            tasks_completed / tasks_assigned if tasks_assigned > 0 else 0.0
        )

        # Average cycle time (only completed tasks with cycle_time)
        cycle_times = [
            t.cycle_time_hours for t in tasks
            if t.status == "done" and t.cycle_time_hours is not None
        ]
        avg_cycle_time = (
            sum(cycle_times) / len(cycle_times) if cycle_times else 0.0
        )

        # Average lead time
        lead_times = [
            t.lead_time_hours for t in tasks
            if t.status == "done" and t.lead_time_hours is not None
        ]
        avg_lead_time = (
            sum(lead_times) / len(lead_times) if lead_times else 0.0
        )

        # Sprints participated in
        sprint_ids = set(t.sprint_id for t in tasks if t.sprint_id)
        sprints_participated = len(sprint_ids)

        # Carry-over tasks (not done in their sprint period)
        carry_over = sum(
            1 for t in tasks
            if t.status != "done"
            and t.sprint_id is not None
        )

        # Task type distribution
        type_dist: dict[str, int] = {}
        for t in tasks:
            tt = t.task_type or "task"
            type_dist[tt] = type_dist.get(tt, 0) + 1

        return SprintProductivityMetrics(
            tasks_assigned=tasks_assigned,
            tasks_completed=tasks_completed,
            story_points_committed=story_points_committed,
            story_points_completed=story_points_completed,
            task_completion_rate=task_completion_rate,
            avg_cycle_time_hours=avg_cycle_time,
            avg_lead_time_hours=avg_lead_time,
            sprints_participated=sprints_participated,
            carry_over_tasks=carry_over,
            task_type_distribution=type_dist,
        )

    # -----------------------------------------------------------------------
    # Bus Factor
    # -----------------------------------------------------------------------
    async def compute_bus_factor(
        self,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
        threshold: float = 0.8,
    ) -> dict:
        """Compute bus factor per repository.

        Bus factor = minimum developers covering `threshold` (default 80%) of commits.
        Returns {repo: {"bus_factor": int, "top_contributors": [{dev_id, commits, share}]}}
        """
        if not developer_ids:
            return {}

        # Get commit counts per (repo, developer)
        stmt = select(
            Commit.repository,
            Commit.developer_id,
            func.count(Commit.id).label("commit_count"),
        ).where(
            and_(
                Commit.developer_id.in_(developer_ids),
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        ).group_by(Commit.repository, Commit.developer_id)

        result = await self.db.execute(stmt)
        rows = result.all()

        if not rows:
            return {}

        # Group by repo
        from collections import defaultdict
        repo_devs: dict[str, list[tuple[str, int]]] = defaultdict(list)
        for repo, dev_id, count in rows:
            repo_devs[repo].append((dev_id, count))

        bus_factors: dict[str, dict] = {}
        for repo, dev_counts in repo_devs.items():
            total = sum(c for _, c in dev_counts)
            if total == 0:
                bus_factors[repo] = {"bus_factor": 0, "top_contributors": []}
                continue

            # Sort by commits descending
            sorted_devs = sorted(dev_counts, key=lambda x: x[1], reverse=True)

            # Find minimum devs covering threshold of commits
            cumulative = 0
            bus_factor = 0
            top_contributors = []
            for dev_id, count in sorted_devs:
                cumulative += count
                bus_factor += 1
                top_contributors.append({
                    "developer_id": dev_id,
                    "commits": count,
                    "share": round(count / total, 3),
                })
                if cumulative / total >= threshold:
                    break

            bus_factors[repo] = {
                "bus_factor": bus_factor,
                "total_commits": total,
                "top_contributors": top_contributors,
            }

        return bus_factors

    # -----------------------------------------------------------------------
    # Team Distribution
    # -----------------------------------------------------------------------
    # Role expectation multipliers for role-weighted Gini calculation.
    # Higher multiplier means the role is expected to handle more load,
    # so their raw load is normalized down (divided by the multiplier).
    ROLE_EXPECTATIONS: dict[str, float] = {
        "junior": 0.6,
        "mid": 0.8,
        "senior": 1.0,
        "staff": 1.2,
        "principal": 1.3,
        "lead": 1.1,
        "architect": 1.1,
    }

    async def compute_team_distribution(
        self,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
        workspace_id: str | None = None,
        role_weighted: bool = False,
    ) -> TeamDistribution:
        if not developer_ids:
            return TeamDistribution()

        member_summaries: list[MemberSummary] = []
        total_loads: list[float] = []

        # Batch query: commits per developer
        c_stmt = select(
            Commit.developer_id,
            func.count(Commit.id),
            func.coalesce(func.sum(Commit.additions + Commit.deletions), 0),
        ).where(
            and_(
                Commit.developer_id.in_(developer_ids),
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        ).group_by(Commit.developer_id)
        c_result = await self.db.execute(c_stmt)
        commit_data = {row[0]: (row[1], row[2]) for row in c_result.all()}

        # Batch query: PRs merged per developer
        pr_stmt = select(
            PullRequest.developer_id,
            func.count(PullRequest.id),
        ).where(
            and_(
                PullRequest.developer_id.in_(developer_ids),
                PullRequest.merged_at.isnot(None),
                PullRequest.merged_at >= start,
                PullRequest.merged_at <= end,
            )
        ).group_by(PullRequest.developer_id)
        pr_result = await self.db.execute(pr_stmt)
        pr_data = {row[0]: row[1] for row in pr_result.all()}

        # Batch query: reviews given per developer
        rv_stmt = select(
            CodeReview.developer_id,
            func.count(CodeReview.id),
        ).where(
            and_(
                CodeReview.developer_id.in_(developer_ids),
                CodeReview.submitted_at >= start,
                CodeReview.submitted_at <= end,
            )
        ).group_by(CodeReview.developer_id)
        rv_result = await self.db.execute(rv_stmt)
        review_data = {row[0]: row[1] for row in rv_result.all()}

        for dev_id in developer_ids:
            commits_count, lines = commit_data.get(dev_id, (0, 0))
            prs_merged = pr_data.get(dev_id, 0)
            reviews_given = review_data.get(dev_id, 0)
            summary = MemberSummary(
                developer_id=dev_id,
                commits_count=commits_count,
                prs_merged=prs_merged,
                lines_changed=lines,
                reviews_given=reviews_given,
            )
            member_summaries.append(summary)
            total_loads.append(summary.commits_count + summary.prs_merged * 3 + summary.reviews_given)

        # Gini coefficient
        if role_weighted and workspace_id:
            # Batch lookup of engineering roles
            sched_stmt = select(
                DeveloperWorkingSchedule.developer_id,
                DeveloperWorkingSchedule.engineering_role,
            ).where(
                and_(
                    DeveloperWorkingSchedule.developer_id.in_(developer_ids),
                    DeveloperWorkingSchedule.workspace_id == workspace_id,
                )
            )
            role_result = await self.db.execute(sched_stmt)
            role_map = {row[0]: row[1] for row in role_result.all()}
            role_multipliers: list[float] = []
            for dev_id in developer_ids:
                role = role_map.get(dev_id)
                multiplier = self.ROLE_EXPECTATIONS.get(role, 1.0) if role else 1.0
                role_multipliers.append(multiplier)

            # Normalize each developer's load by their role multiplier
            normalized_loads = [
                load / multiplier for load, multiplier in zip(total_loads, role_multipliers)
            ]
            gini = compute_gini(normalized_loads)
        else:
            gini = compute_gini(total_loads)

        # Top contributor share
        total_load = sum(total_loads)
        top_share = max(total_loads) / total_load if total_load > 0 else 0

        # Bottleneck: developers with > 2x average load
        avg_load = total_load / len(total_loads) if total_loads else 0
        bottlenecks = []
        for i, load in enumerate(total_loads):
            if avg_load > 0 and load > 2 * avg_load:
                bottlenecks.append(developer_ids[i])

        return TeamDistribution(
            gini_coefficient=gini,
            top_contributor_share=top_share,
            member_metrics=member_summaries,
            bottleneck_developers=bottlenecks,
        )

    # -----------------------------------------------------------------------
    # Percentile Rankings
    # -----------------------------------------------------------------------
    async def compute_percentile_rankings(
        self,
        developer_id: str,
        peer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, dict]:
        """Compute percentile rank for a developer within a peer group.

        Returns {metric_name: {"value": float, "percentile": int (0-100), "rank": int, "total": int}}
        """
        if not peer_ids or developer_id not in peer_ids:
            peer_ids = list(set(peer_ids + [developer_id]))

        # Gather key metrics for all peers
        peer_data: dict[str, dict[str, float]] = {}
        for pid in peer_ids:
            vel = await self.compute_velocity_metrics(pid, start, end)
            eff = await self.compute_efficiency_metrics(pid, start, end)
            qual = await self.compute_quality_metrics(pid, start, end)
            collab = await self.compute_collaboration_metrics(pid, start, end)
            peer_data[pid] = {
                "commits": vel.commits_count,
                "prs_merged": vel.prs_merged,
                "lines_changed": vel.lines_added + vel.lines_removed,
                "commit_frequency": vel.commit_frequency,
                "pr_throughput": vel.pr_throughput,
                "pr_merge_rate": eff.pr_merge_rate,
                "avg_pr_cycle_time_hours": eff.avg_pr_cycle_time_hours,
                "review_participation_rate": qual.review_participation_rate,
                "avg_review_depth": qual.avg_review_depth,
                "unique_collaborators": collab.unique_collaborators,
                "reviews_given": collab.review_given_count,
            }

        # For each metric, compute the developer's percentile
        dev_metrics = peer_data.get(developer_id, {})
        n = len(peer_ids)
        rankings: dict[str, dict] = {}

        # Lower-is-better metrics
        lower_is_better = {"avg_pr_cycle_time_hours"}

        for metric_name, dev_value in dev_metrics.items():
            all_values = sorted(
                [(pid, peer_data[pid].get(metric_name, 0)) for pid in peer_ids],
                key=lambda x: x[1],
                reverse=(metric_name not in lower_is_better),
            )

            rank = next(
                (i + 1 for i, (pid, _) in enumerate(all_values) if pid == developer_id),
                n,
            )

            # Percentile: % of peers this developer is better than
            percentile = round(((n - rank) / max(n - 1, 1)) * 100)

            rankings[metric_name] = {
                "value": round(dev_value, 2) if isinstance(dev_value, float) else dev_value,
                "percentile": max(0, min(100, percentile)),
                "rank": rank,
                "total": n,
            }

        return rankings

    # -----------------------------------------------------------------------
    # Health Score
    # -----------------------------------------------------------------------
    async def compute_health_score(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
        workspace_id: str | None = None,
    ) -> dict:
        """Compute a composite health score (0-100) from all metric categories.

        Uses configurable weights from InsightSettings or defaults (20% each).
        Returns {"score": float, "breakdown": {category: {"score": float, "weight": float}}}
        """
        # Load weights from settings
        weights = {
            "velocity": 0.20,
            "efficiency": 0.20,
            "quality": 0.20,
            "sustainability": 0.20,
            "collaboration": 0.20,
        }
        if workspace_id:
            settings_stmt = select(InsightSettings).where(
                and_(
                    InsightSettings.workspace_id == workspace_id,
                    InsightSettings.team_id == None,
                )
            )
            result = await self.db.execute(settings_stmt)
            settings = result.scalar_one_or_none()
            if settings and settings.health_score_weights:
                w = settings.health_score_weights
                weights = {
                    "velocity": w.get("velocity", 0.20),
                    "efficiency": w.get("efficiency", 0.20),
                    "quality": w.get("quality", 0.20),
                    "sustainability": w.get("sustainability", 0.20),
                    "collaboration": w.get("collaboration", 0.20),
                }

        # Compute metrics
        vel = await self.compute_velocity_metrics(developer_id, start, end)
        eff = await self.compute_efficiency_metrics(developer_id, start, end)
        qual = await self.compute_quality_metrics(developer_id, start, end)
        sust = await self.compute_sustainability_metrics(developer_id, start, end, workspace_id=workspace_id)
        collab = await self.compute_collaboration_metrics(developer_id, start, end)

        # Normalize each category to 0-100
        # Velocity: based on activity (commit_frequency + pr_throughput)
        vel_score = min(100, (
            min(vel.commit_frequency / 2.0, 1.0) * 40 +  # up to 2 commits/day = 40pts
            min(vel.pr_throughput / 3.0, 1.0) * 30 +  # up to 3 PRs/week = 30pts
            (30 if vel.commits_count > 0 else 0)  # any activity = 30pts
        ))

        # Efficiency: cycle time + merge rate
        cycle_score = max(0, 100 - min(eff.avg_pr_cycle_time_hours / 2.0, 100))  # lower is better
        eff_score = min(100, (
            cycle_score * 0.4 +
            eff.pr_merge_rate * 100 * 0.4 +
            max(0, 100 - eff.rework_ratio * 100) * 0.2  # lower rework is better
        ))

        # Quality: review participation + depth
        qual_score = min(100, (
            min(qual.review_participation_rate / 1.0, 1.0) * 40 +  # 1 review/day = full
            min(qual.avg_review_depth / 3.0, 1.0) * 30 +  # 3 comments/review = full
            max(0, 100 - qual.self_merge_rate * 100) * 0.3  # lower self-merge is better
        ))

        # Sustainability: lower weekend/late-night is better
        sust_score = min(100, (
            max(0, 100 - sust.weekend_commit_ratio * 200) * 0.35 +  # 0% weekend = 35pts
            max(0, 100 - sust.late_night_commit_ratio * 200) * 0.35 +  # 0% late = 35pts
            min(sust.focus_score * 100, 100) * 0.3  # focus across repos
        ))

        # Collaboration: collaborators + reviews given/received balance
        collab_score = min(100, (
            min(collab.unique_collaborators / 5.0, 1.0) * 40 +  # 5 collaborators = full
            min(collab.review_given_count / 5.0, 1.0) * 30 +  # 5 reviews = full
            collab.knowledge_sharing_score * 100 * 0.3
        ))

        # Weighted total
        breakdown = {
            "velocity": {"score": round(vel_score, 1), "weight": weights["velocity"]},
            "efficiency": {"score": round(eff_score, 1), "weight": weights["efficiency"]},
            "quality": {"score": round(qual_score, 1), "weight": weights["quality"]},
            "sustainability": {"score": round(sust_score, 1), "weight": weights["sustainability"]},
            "collaboration": {"score": round(collab_score, 1), "weight": weights["collaboration"]},
        }

        total = sum(
            breakdown[cat]["score"] * breakdown[cat]["weight"]
            for cat in breakdown
        )

        return {
            "score": round(total, 1),
            "breakdown": breakdown,
        }

    # -----------------------------------------------------------------------
    # Anti-Gaming Detection
    # -----------------------------------------------------------------------
    async def detect_gaming_patterns(
        self,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Detect potential metric gaming patterns.

        Returns {"flags": [{"type": str, "severity": str, "description": str, "evidence": dict}],
                 "risk_level": "none"|"low"|"medium"|"high"}
        """
        flags: list[dict] = []

        # 1. Commit splitting: many tiny commits (avg < 5 lines changed)
        commits_stmt = select(Commit).where(
            and_(
                Commit.developer_id == developer_id,
                Commit.committed_at >= start,
                Commit.committed_at <= end,
            )
        ).order_by(Commit.committed_at)
        result = await self.db.execute(commits_stmt)
        commits = list(result.scalars().all())

        if len(commits) >= 5:
            sizes = [c.additions + c.deletions for c in commits]
            avg_size = sum(sizes) / len(sizes) if sizes else 0
            tiny_count = sum(1 for s in sizes if s <= 5)
            tiny_ratio = tiny_count / len(commits)

            if avg_size < 5 and tiny_ratio > 0.5:
                flags.append({
                    "type": "commit_splitting",
                    "severity": "warning",
                    "description": f"Average commit size is {avg_size:.1f} lines with {tiny_ratio:.0%} tiny commits",
                    "evidence": {
                        "avg_commit_size": round(avg_size, 1),
                        "tiny_commit_count": tiny_count,
                        "total_commits": len(commits),
                        "tiny_ratio": round(tiny_ratio, 2),
                    },
                })

        # 2. Trivial PRs: majority of PRs <= 10 lines
        prs_stmt = select(PullRequest).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.created_at_github >= start,
                PullRequest.created_at_github <= end,
            )
        )
        pr_result = await self.db.execute(prs_stmt)
        prs = list(pr_result.scalars().all())

        if len(prs) >= 3:
            trivial_prs = [p for p in prs if (p.additions + p.deletions) <= 10]
            trivial_ratio = len(trivial_prs) / len(prs)

            if trivial_ratio > 0.6:
                flags.append({
                    "type": "trivial_prs",
                    "severity": "warning",
                    "description": f"{trivial_ratio:.0%} of PRs are trivial (≤10 lines changed)",
                    "evidence": {
                        "trivial_pr_count": len(trivial_prs),
                        "total_prs": len(prs),
                        "trivial_ratio": round(trivial_ratio, 2),
                    },
                })

        # 3. Rubber-stamp reviews: approvals given with 0 comments
        reviews_given_stmt = select(CodeReview).where(
            and_(
                CodeReview.developer_id == developer_id,
                CodeReview.submitted_at >= start,
                CodeReview.submitted_at <= end,
            )
        )
        reviews_result = await self.db.execute(reviews_given_stmt)
        reviews = list(reviews_result.scalars().all())

        if len(reviews) >= 3:
            rubber_stamps = [
                r for r in reviews
                if r.state == "approved" and (r.comments_count or 0) == 0
                and (not r.body or len(r.body.strip()) == 0)
            ]
            rs_ratio = len(rubber_stamps) / len(reviews)

            if rs_ratio > 0.7:
                flags.append({
                    "type": "rubber_stamp_reviews",
                    "severity": "warning",
                    "description": f"{rs_ratio:.0%} of reviews are approvals with no comments",
                    "evidence": {
                        "rubber_stamp_count": len(rubber_stamps),
                        "total_reviews": len(reviews),
                        "rubber_stamp_ratio": round(rs_ratio, 2),
                    },
                })

        # 4. Suspicious commit timing: commits at very regular intervals (bot-like)
        if len(commits) >= 10:
            timestamps = [c.committed_at.timestamp() for c in commits]
            intervals = [timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)]
            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                if avg_interval > 0:
                    # Coefficient of variation — very low = suspiciously regular
                    variance = sum((i - avg_interval) ** 2 for i in intervals) / len(intervals)
                    std_dev = variance ** 0.5
                    cv = std_dev / avg_interval if avg_interval > 0 else 1.0

                    if cv < 0.1 and avg_interval < 3600:  # Very regular, < 1hr apart
                        flags.append({
                            "type": "suspicious_timing",
                            "severity": "info",
                            "description": f"Commits are suspiciously regular (CV={cv:.2f}, avg interval={avg_interval / 60:.0f}min)",
                            "evidence": {
                                "coefficient_of_variation": round(cv, 3),
                                "avg_interval_minutes": round(avg_interval / 60, 1),
                                "commit_count": len(commits),
                            },
                        })

        # 5. Self-merge without review
        self_merged = [
            p for p in prs
            if p.merged_at
        ]
        if self_merged:
            sm_ids = [p.github_id for p in self_merged]
            review_count_stmt = select(
                CodeReview.pull_request_github_id,
                func.count(CodeReview.id),
            ).where(
                CodeReview.pull_request_github_id.in_(sm_ids),
            ).group_by(CodeReview.pull_request_github_id)
            rc_result = await self.db.execute(review_count_stmt)
            review_counts = {row[0]: row[1] for row in rc_result.all()}
            no_review_count = sum(1 for p in self_merged if review_counts.get(p.github_id, 0) == 0)

            if no_review_count > 0 and len(self_merged) > 0:
                sr_ratio = no_review_count / len(self_merged)
                if sr_ratio > 0.5 and no_review_count >= 2:
                    flags.append({
                        "type": "self_merge_no_review",
                        "severity": "warning",
                        "description": f"{no_review_count} merged PRs with zero reviews",
                        "evidence": {
                            "no_review_merged_count": no_review_count,
                            "total_merged": len(self_merged),
                            "ratio": round(sr_ratio, 2),
                        },
                    })

        # Determine overall risk level
        severities = [f["severity"] for f in flags]
        if not flags:
            risk_level = "none"
        elif len(flags) >= 3 or severities.count("warning") >= 2:
            risk_level = "high"
        elif len(flags) >= 2:
            risk_level = "medium"
        else:
            risk_level = "low"

        return {
            "flags": flags,
            "risk_level": risk_level,
            "flags_count": len(flags),
        }

    # -----------------------------------------------------------------------
    # Alert Rule Evaluation
    # -----------------------------------------------------------------------
    async def evaluate_alert_rules(
        self,
        workspace_id: str,
        start: datetime,
        end: datetime,
    ) -> list[dict]:
        """Evaluate all active alert rules for a workspace and create history entries for breaches.

        Returns list of triggered alerts: [{"rule_id", "developer_id", "metric_value", "threshold", "severity", "message"}]
        """
        # Load active rules
        rules_stmt = select(InsightAlertRule).where(
            and_(
                InsightAlertRule.workspace_id == workspace_id,
                InsightAlertRule.is_active == True,
            )
        )
        rules_result = await self.db.execute(rules_stmt)
        rules = list(rules_result.scalars().all())

        if not rules:
            return []

        # Get workspace developers
        ws_member_stmt = select(WorkspaceMember.developer_id).where(
            WorkspaceMember.workspace_id == workspace_id
        )
        ws_result = await self.db.execute(ws_member_stmt)
        all_dev_ids = [row[0] for row in ws_result.all()]

        triggered = []

        # Metric category → compute function mapping
        category_map = {
            "velocity": "compute_velocity_metrics",
            "efficiency": "compute_efficiency_metrics",
            "quality": "compute_quality_metrics",
            "sustainability": "compute_sustainability_metrics",
            "collaboration": "compute_collaboration_metrics",
        }

        for rule in rules:
            compute_fn_name = category_map.get(rule.metric_category)
            if not compute_fn_name:
                continue

            # Determine which developers to evaluate
            if rule.scope_type == "developer" and rule.scope_id:
                dev_ids = [rule.scope_id]
            elif rule.scope_type == "team" and rule.scope_id:
                team_stmt = select(TeamMember.developer_id).where(
                    TeamMember.team_id == rule.scope_id
                )
                team_result = await self.db.execute(team_stmt)
                dev_ids = [row[0] for row in team_result.all()]
            else:
                dev_ids = all_dev_ids

            for dev_id in dev_ids:
                try:
                    compute_fn = getattr(self, compute_fn_name)
                    if compute_fn_name == "compute_sustainability_metrics":
                        metrics = await compute_fn(dev_id, start, end, workspace_id=workspace_id)
                    else:
                        metrics = await compute_fn(dev_id, start, end)

                    metric_value = getattr(metrics, rule.metric_name, None)
                    if metric_value is None:
                        continue

                    # Check condition
                    threshold = rule.condition_value
                    breached = False
                    if rule.condition_operator == "gt":
                        breached = metric_value > threshold
                    elif rule.condition_operator == "lt":
                        breached = metric_value < threshold
                    elif rule.condition_operator == "gte":
                        breached = metric_value >= threshold
                    elif rule.condition_operator == "lte":
                        breached = metric_value <= threshold
                    elif rule.condition_operator == "eq":
                        breached = abs(metric_value - threshold) < 0.001

                    if breached:
                        message = (
                            f"Alert: {rule.name} — {rule.metric_category}.{rule.metric_name} "
                            f"is {metric_value:.2f} ({rule.condition_operator} {threshold})"
                        )
                        alert = InsightAlertHistory(
                            rule_id=rule.id,
                            workspace_id=workspace_id,
                            developer_id=dev_id,
                            metric_value=float(metric_value),
                            threshold_value=threshold,
                            severity=rule.severity,
                            status="triggered",
                            message=message,
                            triggered_at=datetime.now(timezone.utc),
                        )
                        self.db.add(alert)

                        # Create in-app notification for the developer
                        severity_str = rule.severity.value if hasattr(rule.severity, "value") else rule.severity
                        event_type = (
                            NotificationEventType.INSIGHT_ALERT_CRITICAL
                            if severity_str == "critical"
                            else NotificationEventType.INSIGHT_ALERT_WARNING
                        )
                        notification = Notification(
                            id=str(uuid4()),
                            recipient_id=dev_id,
                            event_type=event_type.value,
                            title=f"Insight Alert: {rule.name}",
                            body=message,
                            context={
                                "workspace_id": workspace_id,
                                "rule_id": rule.id,
                                "metric_category": rule.metric_category,
                                "metric_name": rule.metric_name,
                                "action_url": "/insights/alerts",
                            },
                        )
                        self.db.add(notification)

                        triggered.append({
                            "rule_id": rule.id,
                            "rule_name": rule.name,
                            "developer_id": dev_id,
                            "metric_value": round(float(metric_value), 3),
                            "threshold": threshold,
                            "severity": severity_str,
                            "message": message,
                        })
                except Exception as exc:
                    logger.warning("Alert evaluation failed for rule %s dev %s: %s", rule.name, dev_id, exc)
                    continue

        if triggered:
            await self.db.commit()

        return triggered

    # -----------------------------------------------------------------------
    # Velocity Forecasting
    # -----------------------------------------------------------------------
    async def forecast_velocity(
        self,
        developer_id: str,
        period_type: PeriodType,
        periods_back: int = 6,
    ) -> dict:
        """Forecast next period velocity using weighted moving average on snapshots.

        More recent periods get higher weights (exponential decay).
        Returns {"forecast": {metric: value}, "confidence": float, "data_points": int,
                 "historical": [{period_start, period_end, commits, prs_merged, lines_changed}]}
        """
        snapshots = await self.get_developer_snapshots(developer_id, period_type, periods_back)

        if not snapshots:
            return {
                "forecast": {"commits": 0, "prs_merged": 0, "lines_changed": 0},
                "confidence": 0.0,
                "data_points": 0,
                "historical": [],
            }

        # Extract velocity from snapshots (newest first from get_developer_snapshots)
        historical = []
        for s in reversed(snapshots):  # oldest first for weighting
            vel = s.velocity_metrics or {}
            historical.append({
                "period_start": s.period_start.isoformat(),
                "period_end": s.period_end.isoformat(),
                "commits": vel.get("commits_count", 0),
                "prs_merged": vel.get("prs_merged", 0),
                "lines_changed": vel.get("lines_added", 0) + vel.get("lines_removed", 0),
            })

        n = len(historical)
        if n == 0:
            return {
                "forecast": {"commits": 0, "prs_merged": 0, "lines_changed": 0},
                "confidence": 0.0,
                "data_points": 0,
                "historical": [],
            }

        # Exponential weights: more recent = higher weight
        # weight_i = decay^(n - 1 - i), where decay = 0.7
        decay = 0.7
        weights = [decay ** (n - 1 - i) for i in range(n)]
        weight_sum = sum(weights)

        forecast = {}
        for metric in ["commits", "prs_merged", "lines_changed"]:
            values = [h[metric] for h in historical]
            weighted_sum = sum(v * w for v, w in zip(values, weights))
            forecast[metric] = round(weighted_sum / weight_sum, 1) if weight_sum > 0 else 0

        # Confidence: based on data points and consistency
        # More data = higher confidence, less variance = higher confidence
        base_confidence = min(n / 6.0, 1.0)  # 6 periods = full confidence
        # Variance factor for commits
        commit_vals = [h["commits"] for h in historical]
        if len(commit_vals) >= 2 and forecast["commits"] > 0:
            avg = sum(commit_vals) / len(commit_vals)
            variance = sum((v - avg) ** 2 for v in commit_vals) / len(commit_vals)
            cv = (variance ** 0.5) / avg if avg > 0 else 1.0
            consistency = max(0, 1.0 - cv)
        else:
            consistency = 0.5

        confidence = round(base_confidence * 0.6 + consistency * 0.4, 2)

        return {
            "forecast": forecast,
            "confidence": min(confidence, 1.0),
            "data_points": n,
            "historical": historical,
        }

    # -----------------------------------------------------------------------
    # Snapshot Persistence
    # -----------------------------------------------------------------------
    async def save_developer_snapshot(
        self,
        developer_id: str,
        workspace_id: str,
        period_type: PeriodType,
        start: datetime,
        end: datetime,
    ) -> DeveloperMetricsSnapshot:
        """Compute all metrics and persist as a snapshot (upsert)."""
        velocity = await self.compute_velocity_metrics(developer_id, start, end)
        efficiency = await self.compute_efficiency_metrics(developer_id, start, end)
        quality = await self.compute_quality_metrics(developer_id, start, end)
        sustainability = await self.compute_sustainability_metrics(
            developer_id, start, end, workspace_id=workspace_id
        )
        collaboration = await self.compute_collaboration_metrics(developer_id, start, end)
        sprint = await self.compute_sprint_metrics(developer_id, start, end)

        raw_counts = {
            "commits": velocity.commits_count,
            "prs_merged": velocity.prs_merged,
            "lines_added": velocity.lines_added,
            "lines_removed": velocity.lines_removed,
            "reviews_given": collaboration.review_given_count,
            "reviews_received": collaboration.review_received_count,
            "sprint": sprint.to_dict(),
        }

        # Upsert: check for existing snapshot
        existing_stmt = select(DeveloperMetricsSnapshot).where(
            and_(
                DeveloperMetricsSnapshot.developer_id == developer_id,
                DeveloperMetricsSnapshot.workspace_id == workspace_id,
                DeveloperMetricsSnapshot.period_type == period_type,
                DeveloperMetricsSnapshot.period_start == start,
            )
        )
        existing_result = await self.db.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.period_end = end
            existing.velocity_metrics = velocity.to_dict()
            existing.efficiency_metrics = efficiency.to_dict()
            existing.quality_metrics = quality.to_dict()
            existing.sustainability_metrics = sustainability.to_dict()
            existing.collaboration_metrics = collaboration.to_dict()
            existing.raw_counts = raw_counts
            existing.computed_at = func.now()
            snapshot = existing
        else:
            snapshot = DeveloperMetricsSnapshot(
                id=str(uuid4()),
                developer_id=developer_id,
                workspace_id=workspace_id,
                period_start=start,
                period_end=end,
                period_type=period_type,
                velocity_metrics=velocity.to_dict(),
                efficiency_metrics=efficiency.to_dict(),
                quality_metrics=quality.to_dict(),
                sustainability_metrics=sustainability.to_dict(),
                collaboration_metrics=collaboration.to_dict(),
                raw_counts=raw_counts,
            )
            self.db.add(snapshot)

        await self.db.flush()
        return snapshot

    async def save_team_snapshot(
        self,
        workspace_id: str,
        team_id: str | None,
        period_type: PeriodType,
        start: datetime,
        end: datetime,
        developer_ids: list[str],
    ) -> TeamMetricsSnapshot:
        """Compute team-level metrics and persist."""
        distribution = await self.compute_team_distribution(developer_ids, start, end)

        # Aggregate velocity across all members
        total_commits = sum(m.commits_count for m in distribution.member_metrics)
        total_prs = sum(m.prs_merged for m in distribution.member_metrics)
        total_lines = sum(m.lines_changed for m in distribution.member_metrics)
        total_reviews = sum(m.reviews_given for m in distribution.member_metrics)

        aggregate = {
            "total_commits": total_commits,
            "total_prs_merged": total_prs,
            "total_lines_changed": total_lines,
            "total_reviews": total_reviews,
            "avg_commits_per_member": round(total_commits / len(developer_ids), 2) if developer_ids else 0,
            "avg_prs_per_member": round(total_prs / len(developer_ids), 2) if developer_ids else 0,
        }

        # Upsert
        existing_stmt = select(TeamMetricsSnapshot).where(
            and_(
                TeamMetricsSnapshot.workspace_id == workspace_id,
                TeamMetricsSnapshot.team_id == team_id,
                TeamMetricsSnapshot.period_type == period_type,
                TeamMetricsSnapshot.period_start == start,
            )
        )
        existing_result = await self.db.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.period_end = end
            existing.aggregate_metrics = aggregate
            existing.distribution_metrics = distribution.to_dict()
            existing.member_count = len(developer_ids)
            existing.computed_at = func.now()
            snapshot = existing
        else:
            snapshot = TeamMetricsSnapshot(
                id=str(uuid4()),
                workspace_id=workspace_id,
                team_id=team_id,
                period_start=start,
                period_end=end,
                period_type=period_type,
                aggregate_metrics=aggregate,
                distribution_metrics=distribution.to_dict(),
                member_count=len(developer_ids),
            )
            self.db.add(snapshot)

        await self.db.flush()
        return snapshot

    # -----------------------------------------------------------------------
    # Retrieval
    # -----------------------------------------------------------------------
    async def get_developer_snapshots(
        self,
        developer_id: str,
        period_type: PeriodType,
        limit: int = 10,
    ) -> list[DeveloperMetricsSnapshot]:
        stmt = (
            select(DeveloperMetricsSnapshot)
            .where(
                and_(
                    DeveloperMetricsSnapshot.developer_id == developer_id,
                    DeveloperMetricsSnapshot.period_type == period_type,
                )
            )
            .order_by(DeveloperMetricsSnapshot.period_start.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_team_snapshots(
        self,
        workspace_id: str,
        team_id: str | None,
        period_type: PeriodType,
        limit: int = 10,
    ) -> list[TeamMetricsSnapshot]:
        conditions = [
            TeamMetricsSnapshot.workspace_id == workspace_id,
            TeamMetricsSnapshot.period_type == period_type,
        ]
        if team_id:
            conditions.append(TeamMetricsSnapshot.team_id == team_id)
        else:
            conditions.append(TeamMetricsSnapshot.team_id.is_(None))

        stmt = (
            select(TeamMetricsSnapshot)
            .where(and_(*conditions))
            .order_by(TeamMetricsSnapshot.period_start.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Default Alert Templates
    # ------------------------------------------------------------------

    DEFAULT_ALERT_TEMPLATES = [
        {
            "name": "Burnout Risk - High Weekend Activity",
            "description": "Triggers when weekend commit ratio exceeds 30%, indicating potential burnout",
            "metric_category": "sustainability",
            "metric_name": "weekend_commit_ratio",
            "condition_operator": "gt",
            "condition_value": 0.30,
            "severity": "warning",
        },
        {
            "name": "Burnout Risk - Excessive After-Hours",
            "description": "Triggers when late-night commit ratio exceeds 25%",
            "metric_category": "sustainability",
            "metric_name": "late_night_commit_ratio",
            "condition_operator": "gt",
            "condition_value": 0.25,
            "severity": "warning",
        },
        {
            "name": "Velocity Drop",
            "description": "Triggers when weekly commits drop below 5, indicating potential blockers or disengagement",
            "metric_category": "velocity",
            "metric_name": "commits_count",
            "condition_operator": "lt",
            "condition_value": 5.0,
            "severity": "info",
        },
        {
            "name": "Stale PRs - Slow Merge",
            "description": "Triggers when average PR cycle time exceeds 72 hours (3 days)",
            "metric_category": "efficiency",
            "metric_name": "avg_pr_cycle_time",
            "condition_operator": "gt",
            "condition_value": 72.0,
            "severity": "warning",
        },
        {
            "name": "High Self-Merge Rate",
            "description": "Triggers when self-merge rate exceeds 40%, indicating bypassed review process",
            "metric_category": "quality",
            "metric_name": "self_merge_rate",
            "condition_operator": "gt",
            "condition_value": 0.40,
            "severity": "critical",
        },
        {
            "name": "Low Review Participation",
            "description": "Triggers when review participation rate falls below 20%",
            "metric_category": "quality",
            "metric_name": "review_participation_rate",
            "condition_operator": "lt",
            "condition_value": 0.20,
            "severity": "info",
        },
    ]

    async def seed_default_alert_templates(
        self,
        workspace_id: str,
        created_by_id: str,
    ) -> list[InsightAlertRule]:
        """Create default alert rule templates for a workspace.

        Skips templates whose name already exists in the workspace to avoid
        duplicates on repeated calls.
        """
        # Get existing rule names
        stmt = select(InsightAlertRule.name).where(
            InsightAlertRule.workspace_id == workspace_id
        )
        result = await self.db.execute(stmt)
        existing_names = {row[0] for row in result.all()}

        created: list[InsightAlertRule] = []
        for tmpl in self.DEFAULT_ALERT_TEMPLATES:
            if tmpl["name"] in existing_names:
                continue
            rule = InsightAlertRule(
                workspace_id=workspace_id,
                created_by_id=created_by_id,
                scope_type="workspace",
                scope_id=workspace_id,
                is_active=True,
                **tmpl,
            )
            self.db.add(rule)
            created.append(rule)

        if created:
            await self.db.flush()

        return created

    # ------------------------------------------------------------------
    # Role-Based Metric Benchmarking
    # ------------------------------------------------------------------

    async def compute_role_benchmarks(
        self,
        developer_id: str,
        workspace_id: str,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Compute metrics benchmarked against peers with the same engineering role.

        Returns the developer's metrics alongside the role cohort median and
        percentile rank for each key metric.
        """
        import statistics

        # Get developer's own role
        stmt = select(DeveloperWorkingSchedule).where(
            and_(
                DeveloperWorkingSchedule.developer_id == developer_id,
                DeveloperWorkingSchedule.workspace_id == workspace_id,
            )
        )
        result = await self.db.execute(stmt)
        schedule = result.scalar_one_or_none()
        dev_role = schedule.engineering_role if schedule else None

        # Get all workspace members with the same role
        if dev_role:
            stmt = (
                select(DeveloperWorkingSchedule.developer_id)
                .where(
                    and_(
                        DeveloperWorkingSchedule.workspace_id == workspace_id,
                        DeveloperWorkingSchedule.engineering_role == dev_role,
                    )
                )
            )
            result = await self.db.execute(stmt)
            peer_ids = [row[0] for row in result.all()]
        else:
            # No role assigned — fall back to all workspace members
            stmt = select(WorkspaceMember.developer_id).where(
                WorkspaceMember.workspace_id == workspace_id
            )
            result = await self.db.execute(stmt)
            peer_ids = [row[0] for row in result.all()]

        if not peer_ids:
            peer_ids = [developer_id]

        # Compute key metrics for all peers
        metrics_map: dict[str, dict[str, float]] = {}
        for pid in peer_ids:
            vel = await self.compute_velocity_metrics(pid, start, end)
            eff = await self.compute_efficiency_metrics(pid, start, end)
            qual = await self.compute_quality_metrics(pid, start, end)
            metrics_map[pid] = {
                "commits_count": vel.commits_count,
                "prs_merged": vel.prs_merged,
                "commit_frequency": vel.commit_frequency,
                "pr_throughput": vel.pr_throughput,
                "avg_pr_cycle_time": eff.avg_pr_cycle_time_hours,
                "pr_merge_rate": eff.pr_merge_rate,
                "review_participation_rate": qual.review_participation_rate,
                "avg_review_depth": qual.avg_review_depth,
            }

        # Lower-is-better metrics
        lower_is_better = {"avg_pr_cycle_time"}

        # Compute medians and percentiles
        benchmarks: dict[str, dict] = {}
        dev_metrics = metrics_map.get(developer_id, {})

        for metric_name in dev_metrics:
            all_values = sorted([m[metric_name] for m in metrics_map.values()])
            dev_value = dev_metrics[metric_name]

            if len(all_values) > 1:
                median_val = statistics.median(all_values)
                if metric_name in lower_is_better:
                    rank = sum(1 for v in all_values if v < dev_value) + 1
                    percentile = round(((len(all_values) - rank) / (len(all_values) - 1)) * 100, 1)
                else:
                    rank = sum(1 for v in all_values if v > dev_value) + 1
                    percentile = round(((len(all_values) - rank) / (len(all_values) - 1)) * 100, 1)
            else:
                median_val = dev_value
                rank = 1
                percentile = 100.0

            benchmarks[metric_name] = {
                "value": round(dev_value, 2),
                "median": round(median_val, 2),
                "percentile": max(0, percentile),
                "rank": rank,
                "total": len(all_values),
            }

        return {
            "engineering_role": dev_role,
            "peer_count": len(peer_ids),
            "benchmarks": benchmarks,
        }

    # ------------------------------------------------------------------
    # Sprint Capacity Estimation
    # ------------------------------------------------------------------

    async def estimate_sprint_capacity(
        self,
        workspace_id: str,
        team_id: str | None,
        dev_ids: list[str],
        sprint_length_days: int = 14,
        periods_back: int = 4,
    ) -> dict:
        """Estimate next sprint capacity based on historical velocity.

        Uses weighted average of recent sprint-length periods for each developer,
        sums to team capacity, and provides confidence based on variance.
        """
        import statistics

        now = datetime.now(timezone.utc)
        per_dev: list[dict] = []
        team_totals = {"commits": 0.0, "prs_merged": 0.0, "lines_added": 0.0, "story_points": 0.0}

        for dev_id in dev_ids:
            dev_history: list[dict] = []
            for i in range(periods_back):
                end = now - timedelta(days=sprint_length_days * i)
                start = end - timedelta(days=sprint_length_days)
                vel = await self.compute_velocity_metrics(dev_id, start, end)
                sprint = await self.compute_sprint_metrics(dev_id, start, end)
                dev_history.append({
                    "commits": vel.commits_count,
                    "prs_merged": vel.prs_merged,
                    "lines_added": vel.lines_added,
                    "story_points": sprint.story_points_completed,
                })

            # Weighted moving average (more recent = higher weight)
            weights = [0.7 ** i for i in range(len(dev_history))]
            total_weight = sum(weights)

            forecast: dict[str, float] = {}
            for metric in ["commits", "prs_merged", "lines_added", "story_points"]:
                values = [h[metric] for h in dev_history]
                weighted = sum(v * w for v, w in zip(values, weights)) / total_weight if total_weight else 0
                forecast[metric] = round(weighted, 1)
                team_totals[metric] += weighted

            # Confidence: based on coefficient of variation
            commit_values = [h["commits"] for h in dev_history]
            if len(commit_values) > 1 and statistics.mean(commit_values) > 0:
                cv = statistics.stdev(commit_values) / statistics.mean(commit_values)
                confidence = round(max(0, 1 - cv), 2)
            else:
                confidence = 0.5

            per_dev.append({
                "developer_id": dev_id,
                "forecast": forecast,
                "confidence": confidence,
                "data_points": len(dev_history),
            })

        # Team-level confidence: average of individual confidences
        avg_confidence = round(
            sum(d["confidence"] for d in per_dev) / len(per_dev), 2
        ) if per_dev else 0

        return {
            "team_id": team_id,
            "sprint_length_days": sprint_length_days,
            "member_count": len(dev_ids),
            "team_forecast": {k: round(v, 1) for k, v in team_totals.items()},
            "team_confidence": avg_confidence,
            "per_developer": per_dev,
        }

    # ------------------------------------------------------------------
    # Executive Summary
    # ------------------------------------------------------------------

    async def compute_executive_summary(
        self,
        workspace_id: str,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Compute org-wide executive summary.

        Aggregates across all workspace members: total activity, health overview,
        top risks (burnout, bottlenecks), and team-level breakdown.
        """
        # Get all workspace developers
        stmt = select(WorkspaceMember.developer_id).where(
            WorkspaceMember.workspace_id == workspace_id
        )
        result = await self.db.execute(stmt)
        all_dev_ids = [row[0] for row in result.all()]

        if not all_dev_ids:
            return {
                "total_developers": 0,
                "activity": {},
                "health": {},
                "risks": [],
                "top_contributors": [],
            }

        # Aggregate activity
        total_commits = 0
        total_prs = 0
        total_reviews = 0
        total_lines = 0
        dev_summaries: list[dict] = []
        burnout_risks: list[dict] = []
        bottlenecks: list[dict] = []

        for dev_id in all_dev_ids:
            vel = await self.compute_velocity_metrics(dev_id, start, end)
            sus = await self.compute_sustainability_metrics(dev_id, start, end, workspace_id=workspace_id)
            collab = await self.compute_collaboration_metrics(dev_id, start, end)

            total_commits += vel.commits_count
            total_prs += vel.prs_merged
            total_reviews += collab.review_given_count
            total_lines += vel.lines_added + vel.lines_removed

            dev_summaries.append({
                "developer_id": dev_id,
                "commits": vel.commits_count,
                "prs_merged": vel.prs_merged,
                "lines_changed": vel.lines_added + vel.lines_removed,
            })

            # Flag burnout risks
            if sus.weekend_commit_ratio > 0.3 or sus.late_night_commit_ratio > 0.25:
                burnout_risks.append({
                    "developer_id": dev_id,
                    "weekend_ratio": round(sus.weekend_commit_ratio, 2),
                    "late_night_ratio": round(sus.late_night_commit_ratio, 2),
                })

        # Top contributors by commits
        dev_summaries.sort(key=lambda d: d["commits"], reverse=True)
        top_contributors = dev_summaries[:5]

        # Check for bottlenecks (developers with >2x average load)
        if dev_summaries:
            avg_commits = total_commits / len(dev_summaries)
            for d in dev_summaries:
                if avg_commits > 0 and d["commits"] > avg_commits * 2:
                    bottlenecks.append({
                        "developer_id": d["developer_id"],
                        "commits": d["commits"],
                        "ratio_vs_avg": round(d["commits"] / avg_commits, 1),
                    })

        # Compute team distribution for Gini
        distribution = await self.compute_team_distribution(all_dev_ids, start, end)

        return {
            "total_developers": len(all_dev_ids),
            "activity": {
                "total_commits": total_commits,
                "total_prs_merged": total_prs,
                "total_reviews": total_reviews,
                "total_lines_changed": total_lines,
                "avg_commits_per_dev": round(total_commits / len(all_dev_ids), 1),
                "avg_prs_per_dev": round(total_prs / len(all_dev_ids), 1),
            },
            "health": {
                "gini_coefficient": distribution.gini_coefficient,
                "workload_balance": "good" if distribution.gini_coefficient < 0.3 else "moderate" if distribution.gini_coefficient < 0.5 else "poor",
                "burnout_risk_count": len(burnout_risks),
                "bottleneck_count": len(bottlenecks),
            },
            "risks": {
                "burnout": burnout_risks[:5],
                "bottlenecks": bottlenecks[:5],
            },
            "top_contributors": top_contributors,
        }

    # ------------------------------------------------------------------
    # Rotation Impact Forecasting
    # ------------------------------------------------------------------

    async def compute_rotation_impact(
        self,
        team_dev_ids: list[str],
        rotating_dev_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict:
        """Predict velocity impact when specific developers rotate off.

        Computes each rotating developer's share of team output and estimates
        the team velocity dip, adjusted for partial ramp-up of replacements.
        """
        # Compute current team distribution
        distribution = await self.compute_team_distribution(team_dev_ids, start, end)

        total_commits = sum(m.commits_count for m in distribution.member_metrics)
        total_prs = sum(m.prs_merged for m in distribution.member_metrics)
        total_lines = sum(m.lines_changed for m in distribution.member_metrics)

        # Compute departing developers' contribution
        departing_commits = 0
        departing_prs = 0
        departing_lines = 0
        departing_details: list[dict] = []

        for m in distribution.member_metrics:
            if m.developer_id in rotating_dev_ids:
                departing_commits += m.commits_count
                departing_prs += m.prs_merged
                departing_lines += m.lines_changed

                commit_share = round(m.commits_count / total_commits, 3) if total_commits else 0
                departing_details.append({
                    "developer_id": m.developer_id,
                    "commits": m.commits_count,
                    "prs_merged": m.prs_merged,
                    "lines_changed": m.lines_changed,
                    "commit_share": commit_share,
                })

        # Estimated velocity after rotation (assuming no immediate replacement)
        remaining_commits = total_commits - departing_commits
        remaining_prs = total_prs - departing_prs

        # Impact percentages
        commit_impact = round(departing_commits / total_commits, 3) if total_commits else 0
        pr_impact = round(departing_prs / total_prs, 3) if total_prs else 0
        lines_impact = round(departing_lines / total_lines, 3) if total_lines else 0

        # Ramp-up adjusted: new replacements typically produce ~30% in first sprint
        ramp_up_factor = 0.3
        adjusted_commits = remaining_commits + (departing_commits * ramp_up_factor)
        adjusted_prs = remaining_prs + (departing_prs * ramp_up_factor)

        return {
            "team_size": len(team_dev_ids),
            "rotating_count": len(rotating_dev_ids),
            "remaining_count": len(team_dev_ids) - len(rotating_dev_ids),
            "current": {
                "commits": total_commits,
                "prs_merged": total_prs,
                "lines_changed": total_lines,
            },
            "impact": {
                "commit_loss_pct": round(commit_impact * 100, 1),
                "pr_loss_pct": round(pr_impact * 100, 1),
                "lines_loss_pct": round(lines_impact * 100, 1),
            },
            "forecast_without_replacement": {
                "commits": remaining_commits,
                "prs_merged": remaining_prs,
            },
            "forecast_with_replacement": {
                "commits": round(adjusted_commits),
                "prs_merged": round(adjusted_prs),
                "ramp_up_factor": ramp_up_factor,
                "note": "Assumes replacements produce ~30% of departing dev output in first sprint",
            },
            "departing_developers": departing_details,
        }

    # ------------------------------------------------------------------
    # GDPR Data Export
    # ------------------------------------------------------------------

    async def export_developer_data(
        self,
        developer_id: str,
        workspace_id: str,
    ) -> dict:
        """Export all personal insight data for a developer (GDPR compliance).

        Returns snapshots, working schedule, and alert history.
        """
        # Snapshots
        stmt = (
            select(DeveloperMetricsSnapshot)
            .where(
                and_(
                    DeveloperMetricsSnapshot.developer_id == developer_id,
                    DeveloperMetricsSnapshot.workspace_id == workspace_id,
                )
            )
            .order_by(DeveloperMetricsSnapshot.period_start.desc())
        )
        result = await self.db.execute(stmt)
        snapshots = result.scalars().all()

        snapshot_data = [
            {
                "id": s.id,
                "period_start": s.period_start.isoformat() if s.period_start else None,
                "period_end": s.period_end.isoformat() if s.period_end else None,
                "period_type": s.period_type.value if hasattr(s.period_type, "value") else str(s.period_type),
                "velocity_metrics": s.velocity_metrics,
                "efficiency_metrics": s.efficiency_metrics,
                "quality_metrics": s.quality_metrics,
                "sustainability_metrics": s.sustainability_metrics,
                "collaboration_metrics": s.collaboration_metrics,
                "raw_counts": s.raw_counts,
                "computed_at": s.computed_at.isoformat() if s.computed_at else None,
            }
            for s in snapshots
        ]

        # Working schedule
        stmt = select(DeveloperWorkingSchedule).where(
            and_(
                DeveloperWorkingSchedule.developer_id == developer_id,
                DeveloperWorkingSchedule.workspace_id == workspace_id,
            )
        )
        result = await self.db.execute(stmt)
        schedule = result.scalar_one_or_none()

        schedule_data = None
        if schedule:
            schedule_data = {
                "timezone": schedule.timezone,
                "start_hour": schedule.start_hour,
                "end_hour": schedule.end_hour,
                "working_days": schedule.working_days,
                "late_night_threshold_hour": schedule.late_night_threshold_hour,
                "engineering_role": schedule.engineering_role,
            }

        # Alert history for this developer
        stmt = (
            select(InsightAlertHistory)
            .where(
                and_(
                    InsightAlertHistory.developer_id == developer_id,
                    InsightAlertHistory.workspace_id == workspace_id,
                )
            )
            .order_by(InsightAlertHistory.triggered_at.desc())
        )
        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        alert_data = [
            {
                "id": a.id,
                "rule_id": a.rule_id,
                "metric_value": a.metric_value,
                "threshold_value": a.threshold_value,
                "severity": a.severity,
                "status": a.status,
                "message": a.message,
                "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
            }
            for a in alerts
        ]

        return {
            "developer_id": developer_id,
            "workspace_id": workspace_id,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "snapshots": snapshot_data,
            "working_schedule": schedule_data,
            "alert_history": alert_data,
        }
