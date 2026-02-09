"""Analytics Dashboard Service for team-wide analytics and visualizations."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.developer import Developer
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.analytics import (
    SkillHeatmapCell,
    SkillHeatmapData,
    ActivityHeatmapData,
    ProductivityMetric,
    ProductivityTrends,
    WorkloadItem,
    WorkloadDistribution,
    CollaborationEdge,
    CollaborationGraph,
    DateRange,
    MemberActivityDay,
    MemberRepoStat,
    MemberGitHubStats,
    TeamActivityDay,
    TopRepoStat,
    GitHubAnalyticsSummary,
    WorkspaceGitHubAnalytics,
)


class AnalyticsDashboardService:
    """Service for team-wide analytics and visualizations."""

    async def generate_skill_heatmap(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        skills: list[str] | None = None,
        max_skills: int = 15,
    ) -> SkillHeatmapData:
        """Generate a skill heatmap for team members.

        Args:
            developer_ids: List of developer IDs
            db: Database session
            skills: Specific skills to include (None = auto-detect top skills)
            max_skills: Maximum number of skills to include

        Returns:
            SkillHeatmapData with developers, skills, and proficiency cells
        """
        # Get developers
        stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(stmt)
        developers = list(result.scalars().all())

        # Build developer info list
        dev_info = [
            {
                "id": dev.id,
                "name": dev.name or dev.email,
                "avatar_url": dev.avatar_url,
            }
            for dev in developers
        ]

        # Collect all skills if not specified
        if skills is None:
            skill_counts: dict[str, int] = defaultdict(int)
            for dev in developers:
                fingerprint = dev.skill_fingerprint or {}
                for lang in fingerprint.get("languages", []):
                    if lang.get("name"):
                        skill_counts[lang["name"]] += 1
                for fw in fingerprint.get("frameworks", []):
                    if fw.get("name"):
                        skill_counts[fw["name"]] += 1

            # Get top skills by frequency
            skills = [
                skill for skill, _ in sorted(
                    skill_counts.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:max_skills]
            ]

        # Build heatmap cells
        cells: list[SkillHeatmapCell] = []
        for dev in developers:
            fingerprint = dev.skill_fingerprint or {}

            # Build skill lookup
            skill_lookup: dict[str, dict[str, Any]] = {}
            for lang in fingerprint.get("languages", []):
                if lang.get("name"):
                    skill_lookup[lang["name"]] = {
                        "proficiency": lang.get("proficiency_score", 0),
                        "trend": lang.get("trend"),
                    }
            for fw in fingerprint.get("frameworks", []):
                if fw.get("name"):
                    # Frameworks don't have proficiency, estimate from usage
                    skill_lookup[fw["name"]] = {
                        "proficiency": min(100, fw.get("usage_count", 0) * 10),
                        "trend": None,
                    }

            # Create cell for each skill
            for skill in skills:
                skill_data = skill_lookup.get(skill, {"proficiency": 0, "trend": None})
                cells.append(
                    SkillHeatmapCell(
                        developer_id=dev.id,
                        developer_name=dev.name or dev.email,
                        skill=skill,
                        proficiency=skill_data["proficiency"],
                        trend=skill_data["trend"],
                    )
                )

        return SkillHeatmapData(
            developers=dev_info,
            skills=skills,
            cells=cells,
            generated_at=datetime.now(timezone.utc),
        )

    async def generate_activity_heatmap(
        self,
        developer_id: str,
        db: AsyncSession,
        days: int = 365,
    ) -> ActivityHeatmapData:
        """Generate an activity heatmap (GitHub contribution graph style).

        Args:
            developer_id: Developer ID
            db: Database session
            days: Number of days to include

        Returns:
            ActivityHeatmapData with daily activity counts
        """
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)

        # Count commits per day
        commit_stmt = (
            select(
                func.date(Commit.committed_at).label("date"),
                func.count(Commit.id).label("count"),
            )
            .where(
                and_(
                    Commit.developer_id == developer_id,
                    Commit.committed_at >= start_date,
                    Commit.committed_at <= end_date,
                )
            )
            .group_by(func.date(Commit.committed_at))
        )
        result = await db.execute(commit_stmt)
        commit_counts = {str(row.date): row.count for row in result}

        # Count PRs per day
        pr_stmt = (
            select(
                func.date(PullRequest.created_at).label("date"),
                func.count(PullRequest.id).label("count"),
            )
            .where(
                and_(
                    PullRequest.developer_id == developer_id,
                    PullRequest.created_at >= start_date,
                    PullRequest.created_at <= end_date,
                )
            )
            .group_by(func.date(PullRequest.created_at))
        )
        result = await db.execute(pr_stmt)
        pr_counts = {str(row.date): row.count for row in result}

        # Build daily data
        data: list[dict] = []
        max_count = 0
        current = start_date

        while current <= end_date:
            date_str = current.strftime("%Y-%m-%d")
            count = commit_counts.get(date_str, 0) + pr_counts.get(date_str, 0)
            max_count = max(max_count, count)

            # Calculate level (0-4) for visualization
            level = 0
            if count > 0:
                level = min(4, 1 + count // 3)

            data.append({
                "date": date_str,
                "count": count,
                "level": level,
            })
            current += timedelta(days=1)

        return ActivityHeatmapData(
            developer_id=developer_id,
            data=data,
            max_count=max_count,
            total_days=days,
        )

    async def get_productivity_trends(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        date_range: DateRange,
        group_by: str = "week",
    ) -> ProductivityTrends:
        """Get productivity trends over time.

        Args:
            developer_ids: List of developer IDs
            db: Database session
            date_range: Start and end dates
            group_by: Grouping interval ("day", "week", "month")

        Returns:
            ProductivityTrends with time-series data
        """
        # Determine date truncation
        if group_by == "day":
            date_trunc = func.date(Commit.committed_at)
        elif group_by == "month":
            date_trunc = func.date_trunc("month", Commit.committed_at)
        else:  # week
            date_trunc = func.date_trunc("week", Commit.committed_at)

        # Get commit metrics
        commit_stmt = (
            select(
                date_trunc.label("period"),
                func.count(Commit.id).label("commits"),
                func.sum(Commit.additions).label("additions"),
                func.sum(Commit.deletions).label("deletions"),
            )
            .where(
                and_(
                    Commit.developer_id.in_(developer_ids),
                    Commit.committed_at >= date_range.start_date,
                    Commit.committed_at <= date_range.end_date,
                )
            )
            .group_by(date_trunc)
            .order_by(date_trunc)
        )
        commit_result = await db.execute(commit_stmt)
        commit_data = {str(row.period): row for row in commit_result}

        # Get PR metrics
        pr_stmt = (
            select(
                func.date_trunc(group_by, PullRequest.created_at).label("period"),
                func.count(PullRequest.id).label("prs_opened"),
                func.sum(
                    func.cast(PullRequest.state == "merged", type_=Integer)
                ).label("prs_merged"),
            )
            .where(
                and_(
                    PullRequest.developer_id.in_(developer_ids),
                    PullRequest.created_at >= date_range.start_date,
                    PullRequest.created_at <= date_range.end_date,
                )
            )
            .group_by(func.date_trunc(group_by, PullRequest.created_at))
        )
        from sqlalchemy import Integer
        pr_result = await db.execute(pr_stmt)
        pr_data = {str(row.period): row for row in pr_result}

        # Get review metrics
        review_stmt = (
            select(
                func.date_trunc(group_by, CodeReview.submitted_at).label("period"),
                func.count(CodeReview.id).label("reviews"),
            )
            .where(
                and_(
                    CodeReview.developer_id.in_(developer_ids),
                    CodeReview.submitted_at >= date_range.start_date,
                    CodeReview.submitted_at <= date_range.end_date,
                )
            )
            .group_by(func.date_trunc(group_by, CodeReview.submitted_at))
        )
        review_result = await db.execute(review_stmt)
        review_data = {str(row.period): row for row in review_result}

        # Combine into time series
        all_periods = sorted(
            set(commit_data.keys()) | set(pr_data.keys()) | set(review_data.keys())
        )

        data: list[ProductivityMetric] = []
        total_commits = 0
        total_prs = 0
        total_reviews = 0
        total_additions = 0
        total_deletions = 0

        for period in all_periods:
            commit_row = commit_data.get(period)
            pr_row = pr_data.get(period)
            review_row = review_data.get(period)

            commits = commit_row.commits if commit_row else 0
            additions = commit_row.additions or 0 if commit_row else 0
            deletions = commit_row.deletions or 0 if commit_row else 0
            prs_opened = pr_row.prs_opened if pr_row else 0
            prs_merged = pr_row.prs_merged or 0 if pr_row else 0
            reviews = review_row.reviews if review_row else 0

            total_commits += commits
            total_prs += prs_opened
            total_reviews += reviews
            total_additions += additions
            total_deletions += deletions

            data.append(
                ProductivityMetric(
                    date=datetime.fromisoformat(period) if period else datetime.now(timezone.utc),
                    commits=commits,
                    prs_opened=prs_opened,
                    prs_merged=prs_merged,
                    reviews_given=reviews,
                    lines_added=additions,
                    lines_removed=deletions,
                )
            )

        return ProductivityTrends(
            developer_id=developer_ids[0] if len(developer_ids) == 1 else None,
            data=data,
            summary={
                "total_commits": total_commits,
                "total_prs": total_prs,
                "total_reviews": total_reviews,
                "total_lines_added": total_additions,
                "total_lines_removed": total_deletions,
                "average_commits_per_period": total_commits / len(data) if data else 0,
            },
        )

    async def get_workload_distribution(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        days: int = 30,
    ) -> WorkloadDistribution:
        """Get workload distribution across team members.

        Args:
            developer_ids: List of developer IDs
            db: Database session
            days: Number of recent days to consider

        Returns:
            WorkloadDistribution with per-developer workload
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Get developers
        dev_stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(dev_stmt)
        developers = {dev.id: dev for dev in result.scalars().all()}

        items: list[WorkloadItem] = []
        total_workload = 0.0

        for dev_id in developer_ids:
            dev = developers.get(dev_id)
            if not dev:
                continue

            # Count active PRs (open)
            active_prs_stmt = (
                select(func.count(PullRequest.id))
                .where(
                    and_(
                        PullRequest.developer_id == dev_id,
                        PullRequest.state == "open",
                    )
                )
            )
            active_prs = (await db.execute(active_prs_stmt)).scalar() or 0

            # Count pending reviews (reviews requested on others' PRs)
            pending_reviews_stmt = (
                select(func.count(CodeReview.id))
                .where(
                    and_(
                        CodeReview.developer_id == dev_id,
                        CodeReview.state == "pending",
                    )
                )
            )
            pending_reviews = (await db.execute(pending_reviews_stmt)).scalar() or 0

            # Count recent commits
            recent_commits_stmt = (
                select(func.count(Commit.id))
                .where(
                    and_(
                        Commit.developer_id == dev_id,
                        Commit.committed_at >= cutoff,
                    )
                )
            )
            recent_commits = (await db.execute(recent_commits_stmt)).scalar() or 0

            # Calculate workload score (0-1)
            # Weighted: active PRs (0.4), pending reviews (0.3), recent commits (0.3)
            workload_score = min(1.0, (
                (active_prs * 0.1) +
                (pending_reviews * 0.15) +
                (recent_commits * 0.02)
            ))

            total_workload += workload_score

            items.append(
                WorkloadItem(
                    developer_id=dev_id,
                    developer_name=dev.name or dev.email,
                    active_prs=active_prs,
                    pending_reviews=pending_reviews,
                    recent_commits=recent_commits,
                    workload_score=workload_score,
                )
            )

        # Calculate imbalance
        avg_workload = total_workload / len(items) if items else 0
        variance = sum((item.workload_score - avg_workload) ** 2 for item in items) / len(items) if items else 0
        imbalance_score = min(1.0, variance * 4)  # Scale variance to 0-1

        return WorkloadDistribution(
            items=items,
            total_workload=total_workload,
            average_workload=avg_workload,
            imbalance_score=imbalance_score,
        )

    async def get_collaboration_network(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        days: int = 90,
    ) -> CollaborationGraph:
        """Get collaboration network graph.

        Args:
            developer_ids: List of developer IDs
            db: Database session
            days: Number of days to analyze

        Returns:
            CollaborationGraph with nodes and edges
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Get developers
        dev_stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(dev_stmt)
        developers = {dev.id: dev for dev in result.scalars().all()}

        # Track collaboration: (dev_a, dev_b) -> interaction count
        collaborations: dict[tuple[str, str], int] = defaultdict(int)

        # Get PR reviews: reviewer -> PR author
        review_stmt = (
            select(CodeReview.developer_id, PullRequest.developer_id)
            .join(PullRequest, CodeReview.pull_request_id == PullRequest.id)
            .where(
                and_(
                    CodeReview.developer_id.in_(developer_ids),
                    PullRequest.developer_id.in_(developer_ids),
                    CodeReview.submitted_at >= cutoff,
                    CodeReview.developer_id != PullRequest.developer_id,
                )
            )
        )
        result = await db.execute(review_stmt)
        for reviewer_id, author_id in result:
            # Normalize edge direction (smaller ID first)
            edge = tuple(sorted([reviewer_id, author_id]))
            collaborations[edge] += 1

        # Build nodes
        degree_count: dict[str, int] = defaultdict(int)
        for (dev_a, dev_b), count in collaborations.items():
            degree_count[dev_a] += count
            degree_count[dev_b] += count

        nodes = [
            {
                "id": dev_id,
                "name": developers[dev_id].name or developers[dev_id].email if dev_id in developers else dev_id,
                "avatar_url": developers[dev_id].avatar_url if dev_id in developers else None,
                "degree": degree_count.get(dev_id, 0),
            }
            for dev_id in developer_ids
            if dev_id in developers
        ]

        # Build edges
        edges = [
            CollaborationEdge(
                source_id=edge[0],
                target_id=edge[1],
                weight=min(1.0, count / 10),  # Normalize to 0-1
                interactions=count,
            )
            for edge, count in collaborations.items()
            if count > 0
        ]

        # Calculate graph density
        n = len(nodes)
        max_edges = n * (n - 1) / 2 if n > 1 else 1
        density = len(edges) / max_edges if max_edges > 0 else 0

        return CollaborationGraph(
            nodes=nodes,
            edges=edges,
            density=density,
        )

    async def get_code_quality_metrics(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get code quality metrics for developers.

        Args:
            developer_ids: List of developer IDs
            db: Database session
            days: Number of days to analyze

        Returns:
            Dictionary with quality metrics
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        metrics: dict[str, Any] = {
            "developers": [],
            "summary": {},
        }

        total_prs = 0
        total_merged = 0
        total_review_cycles = 0

        for dev_id in developer_ids:
            # Get PR merge rate
            pr_stmt = (
                select(
                    func.count(PullRequest.id).label("total"),
                    func.sum(
                        func.cast(PullRequest.state == "merged", type_=Integer)
                    ).label("merged"),
                )
                .where(
                    and_(
                        PullRequest.developer_id == dev_id,
                        PullRequest.created_at >= cutoff,
                    )
                )
            )
            from sqlalchemy import Integer
            result = await db.execute(pr_stmt)
            row = result.one()

            pr_total = row.total or 0
            pr_merged = row.merged or 0
            merge_rate = pr_merged / pr_total if pr_total > 0 else 0

            total_prs += pr_total
            total_merged += pr_merged

            # Get average review cycles (approximation based on review count per PR)
            review_stmt = (
                select(func.avg(func.count(CodeReview.id)))
                .join(PullRequest, CodeReview.pull_request_id == PullRequest.id)
                .where(
                    and_(
                        PullRequest.developer_id == dev_id,
                        PullRequest.created_at >= cutoff,
                    )
                )
                .group_by(PullRequest.id)
            )
            # This is a simplified approach
            avg_reviews = 1.5  # Default estimate

            metrics["developers"].append({
                "developer_id": dev_id,
                "prs_created": pr_total,
                "prs_merged": pr_merged,
                "merge_rate": merge_rate,
                "avg_review_cycles": avg_reviews,
            })

        metrics["summary"] = {
            "total_prs": total_prs,
            "total_merged": total_merged,
            "overall_merge_rate": total_merged / total_prs if total_prs > 0 else 0,
        }

        return metrics

    async def get_workspace_github_analytics(
        self,
        workspace_id: str,
        db: AsyncSession,
        days: int = 30,
    ) -> WorkspaceGitHubAnalytics:
        """Get GitHub analytics for all members in a workspace.

        Args:
            workspace_id: Workspace ID
            db: Database session
            days: Number of days to analyze

        Returns:
            WorkspaceGitHubAnalytics with per-member and team-level stats
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Get active workspace members
        member_stmt = (
            select(WorkspaceMember)
            .where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                )
            )
        )
        result = await db.execute(member_stmt)
        members = list(result.scalars().all())
        developer_ids = [str(m.developer_id) for m in members]

        if not developer_ids:
            return WorkspaceGitHubAnalytics(
                summary=GitHubAnalyticsSummary(),
                members=[],
                activity_timeline=[],
                period_days=days,
                generated_at=datetime.now(timezone.utc),
            )

        # Get developers info
        dev_stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(dev_stmt)
        developers = {str(dev.id): dev for dev in result.scalars().all()}

        # === Per-member commit stats ===
        commit_stats_stmt = (
            select(
                Commit.developer_id,
                func.count(Commit.id).label("commit_count"),
                func.coalesce(func.sum(Commit.additions), 0).label("additions"),
                func.coalesce(func.sum(Commit.deletions), 0).label("deletions"),
                func.max(Commit.committed_at).label("last_commit_at"),
            )
            .where(
                and_(
                    Commit.developer_id.in_(developer_ids),
                    Commit.committed_at >= cutoff,
                )
            )
            .group_by(Commit.developer_id)
        )
        result = await db.execute(commit_stats_stmt)
        commit_stats = {str(row.developer_id): row for row in result}

        # === Per-member PR stats ===
        from sqlalchemy import Integer as SAInteger, case
        pr_stats_stmt = (
            select(
                PullRequest.developer_id,
                func.count(PullRequest.id).label("pr_count"),
                func.sum(case((PullRequest.state == "merged", 1), else_=0)).label("pr_merged"),
                func.coalesce(func.sum(PullRequest.additions), 0).label("pr_additions"),
                func.coalesce(func.sum(PullRequest.deletions), 0).label("pr_deletions"),
            )
            .where(
                and_(
                    PullRequest.developer_id.in_(developer_ids),
                    PullRequest.created_at_github >= cutoff,
                )
            )
            .group_by(PullRequest.developer_id)
        )
        result = await db.execute(pr_stats_stmt)
        pr_stats = {str(row.developer_id): row for row in result}

        # === Per-member review stats ===
        review_stats_stmt = (
            select(
                CodeReview.developer_id,
                func.count(CodeReview.id).label("review_count"),
            )
            .where(
                and_(
                    CodeReview.developer_id.in_(developer_ids),
                    CodeReview.submitted_at >= cutoff,
                )
            )
            .group_by(CodeReview.developer_id)
        )
        result = await db.execute(review_stats_stmt)
        review_stats = {str(row.developer_id): row for row in result}

        # === Per-member top repos (commits) ===
        repo_commit_stmt = (
            select(
                Commit.developer_id,
                Commit.repository,
                func.count(Commit.id).label("count"),
                func.coalesce(func.sum(Commit.additions), 0).label("adds"),
                func.coalesce(func.sum(Commit.deletions), 0).label("dels"),
            )
            .where(
                and_(
                    Commit.developer_id.in_(developer_ids),
                    Commit.committed_at >= cutoff,
                )
            )
            .group_by(Commit.developer_id, Commit.repository)
        )
        result = await db.execute(repo_commit_stmt)
        member_repo_commits: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"commits": 0, "prs": 0, "additions": 0, "deletions": 0}))
        for row in result:
            dev_id = str(row.developer_id)
            member_repo_commits[dev_id][row.repository]["commits"] = row.count
            member_repo_commits[dev_id][row.repository]["additions"] = row.adds
            member_repo_commits[dev_id][row.repository]["deletions"] = row.dels

        # === Per-member top repos (PRs) ===
        repo_pr_stmt = (
            select(
                PullRequest.developer_id,
                PullRequest.repository,
                func.count(PullRequest.id).label("count"),
            )
            .where(
                and_(
                    PullRequest.developer_id.in_(developer_ids),
                    PullRequest.created_at_github >= cutoff,
                )
            )
            .group_by(PullRequest.developer_id, PullRequest.repository)
        )
        result = await db.execute(repo_pr_stmt)
        for row in result:
            dev_id = str(row.developer_id)
            member_repo_commits[dev_id][row.repository]["prs"] = row.count

        # === Daily activity per member (for sparklines) ===
        daily_commit_stmt = (
            select(
                Commit.developer_id,
                func.date(Commit.committed_at).label("day"),
                func.count(Commit.id).label("count"),
            )
            .where(
                and_(
                    Commit.developer_id.in_(developer_ids),
                    Commit.committed_at >= cutoff,
                )
            )
            .group_by(Commit.developer_id, func.date(Commit.committed_at))
        )
        result = await db.execute(daily_commit_stmt)
        member_daily_commits: dict[str, dict[str, int]] = defaultdict(dict)
        for row in result:
            member_daily_commits[str(row.developer_id)][str(row.day)] = row.count

        daily_pr_stmt = (
            select(
                PullRequest.developer_id,
                func.date(PullRequest.created_at_github).label("day"),
                func.count(PullRequest.id).label("count"),
            )
            .where(
                and_(
                    PullRequest.developer_id.in_(developer_ids),
                    PullRequest.created_at_github >= cutoff,
                )
            )
            .group_by(PullRequest.developer_id, func.date(PullRequest.created_at_github))
        )
        result = await db.execute(daily_pr_stmt)
        member_daily_prs: dict[str, dict[str, int]] = defaultdict(dict)
        for row in result:
            member_daily_prs[str(row.developer_id)][str(row.day)] = row.count

        # === Build member stats ===
        member_list: list[MemberGitHubStats] = []
        total_commits = 0
        total_prs = 0
        total_prs_merged = 0
        total_reviews = 0
        total_additions = 0
        total_deletions = 0
        active_contributors = 0

        # For team timeline
        team_daily_commits: dict[str, int] = defaultdict(int)
        team_daily_prs_opened: dict[str, int] = defaultdict(int)
        team_daily_reviews: dict[str, int] = defaultdict(int)

        # Daily reviews for timeline
        daily_review_stmt = (
            select(
                func.date(CodeReview.submitted_at).label("day"),
                func.count(CodeReview.id).label("count"),
            )
            .where(
                and_(
                    CodeReview.developer_id.in_(developer_ids),
                    CodeReview.submitted_at >= cutoff,
                )
            )
            .group_by(func.date(CodeReview.submitted_at))
        )
        result = await db.execute(daily_review_stmt)
        for row in result:
            team_daily_reviews[str(row.day)] = row.count

        # Daily merged PRs for timeline
        daily_merged_stmt = (
            select(
                func.date(PullRequest.merged_at).label("day"),
                func.count(PullRequest.id).label("count"),
            )
            .where(
                and_(
                    PullRequest.developer_id.in_(developer_ids),
                    PullRequest.merged_at >= cutoff,
                    PullRequest.state == "merged",
                )
            )
            .group_by(func.date(PullRequest.merged_at))
        )
        result = await db.execute(daily_merged_stmt)
        team_daily_merged: dict[str, int] = {}
        for row in result:
            team_daily_merged[str(row.day)] = row.count

        # Global repo stats for top repos
        global_repo_stats: dict[str, dict] = defaultdict(lambda: {"commits": 0, "prs": 0, "contributors": set()})

        for dev_id in developer_ids:
            dev = developers.get(dev_id)
            if not dev:
                continue

            c_stats = commit_stats.get(dev_id)
            p_stats = pr_stats.get(dev_id)
            r_stats = review_stats.get(dev_id)

            commits = c_stats.commit_count if c_stats else 0
            additions = (c_stats.additions or 0) if c_stats else 0
            deletions = (c_stats.deletions or 0) if c_stats else 0
            last_commit = c_stats.last_commit_at if c_stats else None

            prs_created = p_stats.pr_count if p_stats else 0
            prs_merged = (p_stats.pr_merged or 0) if p_stats else 0
            pr_adds = (p_stats.pr_additions or 0) if p_stats else 0
            pr_dels = (p_stats.pr_deletions or 0) if p_stats else 0

            reviews = r_stats.review_count if r_stats else 0

            total_commits += commits
            total_prs += prs_created
            total_prs_merged += prs_merged
            total_reviews += reviews
            total_additions += additions + pr_adds
            total_deletions += deletions + pr_dels

            if commits > 0 or prs_created > 0:
                active_contributors += 1

            # Build top repos for this member
            repos = member_repo_commits.get(dev_id, {})
            top_repos = sorted(repos.items(), key=lambda x: x[1]["commits"] + x[1]["prs"], reverse=True)[:5]
            repo_stats_list = [
                MemberRepoStat(
                    repository=repo,
                    commits=data["commits"],
                    prs=data["prs"],
                    additions=data["additions"],
                    deletions=data["deletions"],
                )
                for repo, data in top_repos
            ]

            # Update global repo stats
            for repo, data in repos.items():
                global_repo_stats[repo]["commits"] += data["commits"]
                global_repo_stats[repo]["prs"] += data["prs"]
                global_repo_stats[repo]["contributors"].add(dev_id)

            # Build daily activity trend
            all_days = set(member_daily_commits.get(dev_id, {}).keys()) | set(member_daily_prs.get(dev_id, {}).keys())
            activity_trend = []
            for day in sorted(all_days):
                c = member_daily_commits.get(dev_id, {}).get(day, 0)
                p = member_daily_prs.get(dev_id, {}).get(day, 0)
                activity_trend.append(MemberActivityDay(date=day, commits=c, prs=p))
                team_daily_commits[day] += c
                team_daily_prs_opened[day] += p

            member_list.append(MemberGitHubStats(
                developer_id=dev_id,
                name=dev.name or dev.email,
                email=dev.email,
                avatar_url=dev.avatar_url,
                commits=commits,
                prs_created=prs_created,
                prs_merged=prs_merged,
                reviews_given=reviews,
                additions=additions + pr_adds,
                deletions=deletions + pr_dels,
                top_repositories=repo_stats_list,
                last_commit_at=last_commit,
                activity_trend=activity_trend,
            ))

        # Sort members by total activity (commits + PRs)
        member_list.sort(key=lambda m: m.commits + m.prs_created, reverse=True)

        # Build top repositories
        top_global_repos = sorted(
            global_repo_stats.items(),
            key=lambda x: x[1]["commits"] + x[1]["prs"],
            reverse=True,
        )[:10]
        top_repos_list = [
            TopRepoStat(
                repository=repo,
                commits=data["commits"],
                prs=data["prs"],
                contributors=len(data["contributors"]),
            )
            for repo, data in top_global_repos
        ]

        # Build team activity timeline
        all_dates = set(team_daily_commits.keys()) | set(team_daily_prs_opened.keys()) | set(team_daily_reviews.keys())
        activity_timeline = []
        current = cutoff
        while current <= datetime.now(timezone.utc):
            date_str = current.strftime("%Y-%m-%d")
            activity_timeline.append(TeamActivityDay(
                date=date_str,
                commits=team_daily_commits.get(date_str, 0),
                prs_opened=team_daily_prs_opened.get(date_str, 0),
                prs_merged=team_daily_merged.get(date_str, 0),
                reviews=team_daily_reviews.get(date_str, 0),
            ))
            current += timedelta(days=1)

        return WorkspaceGitHubAnalytics(
            summary=GitHubAnalyticsSummary(
                total_commits=total_commits,
                total_prs=total_prs,
                total_prs_merged=total_prs_merged,
                total_reviews=total_reviews,
                total_additions=total_additions,
                total_deletions=total_deletions,
                active_contributors=active_contributors,
                top_repositories=top_repos_list,
            ),
            members=member_list,
            activity_timeline=activity_timeline,
            period_days=days,
            generated_at=datetime.now(timezone.utc),
        )
