"""Contribution service for aggregating GitHub activity data."""

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.llm.gateway import LLMGateway
from devograph.models.activity import Commit, PullRequest, CodeReview
from devograph.models.developer import Developer
from devograph.models.review import ContributionSummary

logger = logging.getLogger(__name__)

# LLM prompt for generating contribution insights
CONTRIBUTION_INSIGHTS_PROMPT = """Analyze the following GitHub contribution metrics for {developer_name} over the period {period_start} to {period_end}:

## Metrics Summary
- Total Commits: {total_commits}
- Pull Requests Created: {prs_created}
- Pull Requests Merged: {prs_merged}
- Code Reviews Given: {reviews_given}
- Lines Added: {lines_added}
- Lines Deleted: {lines_deleted}

## Languages Used
{languages}

## Skills Demonstrated
{skills}

## Top Repositories
{repositories}

Generate a 2-3 paragraph professional summary highlighting:
1. Key achievements and impact during this period
2. Collaboration patterns (code reviews given vs received, PR engagement)
3. Technical growth areas demonstrated
4. Consistent work patterns observed

Use a growth-oriented, appreciative tone suitable for a performance review."""


@dataclass
class ContributionMetrics:
    """Aggregated contribution metrics."""

    total_commits: int
    commits_by_repo: dict[str, int]
    commits_by_month: dict[str, int]
    prs_created: int
    prs_merged: int
    prs_closed: int
    avg_time_to_merge_hours: float | None
    avg_pr_comments: float | None
    reviews_given: int
    reviews_approved: int
    reviews_changes_requested: int
    reviews_commented: int
    avg_comments_per_review: float | None
    lines_added: int
    lines_deleted: int
    languages: dict[str, float]  # language -> percentage
    skills_demonstrated: list[str]


@dataclass
class ContributionHighlight:
    """Notable contribution."""

    type: str  # "pr", "commit", "review"
    id: str
    title: str
    impact: str | None
    additions: int | None
    deletions: int | None
    url: str | None


class ContributionService:
    """Service for aggregating and analyzing GitHub contributions."""

    def __init__(
        self,
        db: AsyncSession,
        llm_gateway: LLMGateway | None = None,
    ) -> None:
        """Initialize the contribution service.

        Args:
            db: Database session.
            llm_gateway: LLM gateway for generating insights.
        """
        self.db = db
        self.llm_gateway = llm_gateway

    async def generate_contribution_summary(
        self,
        developer_id: str,
        period_start: date,
        period_end: date,
        period_type: str = "annual",
    ) -> ContributionSummary:
        """Generate a contribution summary for a developer over a period.

        Args:
            developer_id: Developer ID.
            period_start: Start of the period.
            period_end: End of the period.
            period_type: Type of period (monthly, quarterly, annual, custom).

        Returns:
            ContributionSummary with aggregated metrics and insights.
        """
        # Check for existing summary
        existing = await self._get_existing_summary(
            developer_id, period_start, period_end
        )
        if existing:
            return existing

        # Aggregate metrics
        metrics = await self._aggregate_metrics(developer_id, period_start, period_end)

        # Get highlights
        highlights = await self._get_highlights(developer_id, period_start, period_end)

        # Generate AI insights if LLM is available
        ai_insights = None
        if self.llm_gateway:
            developer = await self.db.get(Developer, developer_id)
            if developer:
                ai_insights = await self._generate_ai_insights(
                    developer.name or developer.email,
                    period_start,
                    period_end,
                    metrics,
                )

        # Create and save summary
        summary = ContributionSummary(
            id=str(uuid4()),
            developer_id=developer_id,
            period_start=period_start,
            period_end=period_end,
            period_type=period_type,
            metrics=self._metrics_to_dict(metrics),
            highlights=[self._highlight_to_dict(h) for h in highlights],
            ai_insights=ai_insights,
            generated_at=datetime.utcnow(),
        )

        self.db.add(summary)
        await self.db.flush()

        return summary

    async def get_contribution_summary(
        self,
        developer_id: str,
        period_start: date | None = None,
        period_end: date | None = None,
        period_type: str = "annual",
    ) -> ContributionSummary | None:
        """Get or generate a contribution summary.

        Args:
            developer_id: Developer ID.
            period_start: Start of period (defaults to start of year).
            period_end: End of period (defaults to today).
            period_type: Type of period.

        Returns:
            ContributionSummary or None.
        """
        # Default to current year
        if period_start is None:
            period_start = date(date.today().year, 1, 1)
        if period_end is None:
            period_end = date.today()

        # Check for existing
        existing = await self._get_existing_summary(
            developer_id, period_start, period_end
        )
        if existing:
            return existing

        # Generate new summary
        return await self.generate_contribution_summary(
            developer_id, period_start, period_end, period_type
        )

    async def get_contribution_highlights(
        self,
        developer_id: str,
        period_start: date,
        period_end: date,
        limit: int = 10,
    ) -> list[ContributionHighlight]:
        """Get notable contributions for a period.

        Args:
            developer_id: Developer ID.
            period_start: Start of period.
            period_end: End of period.
            limit: Maximum highlights to return.

        Returns:
            List of ContributionHighlight.
        """
        return await self._get_highlights(developer_id, period_start, period_end, limit)

    async def _get_existing_summary(
        self,
        developer_id: str,
        period_start: date,
        period_end: date,
    ) -> ContributionSummary | None:
        """Get existing summary if available."""
        stmt = select(ContributionSummary).where(
            and_(
                ContributionSummary.developer_id == developer_id,
                ContributionSummary.period_start == period_start,
                ContributionSummary.period_end == period_end,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _aggregate_metrics(
        self,
        developer_id: str,
        period_start: date,
        period_end: date,
    ) -> ContributionMetrics:
        """Aggregate all contribution metrics for a period."""
        # Convert dates to datetime for comparison
        start_dt = datetime.combine(period_start, datetime.min.time())
        end_dt = datetime.combine(period_end, datetime.max.time())

        # Aggregate commits
        commits_stmt = select(
            func.count(Commit.id).label("total"),
            func.sum(Commit.additions).label("additions"),
            func.sum(Commit.deletions).label("deletions"),
        ).where(
            and_(
                Commit.developer_id == developer_id,
                Commit.committed_at >= start_dt,
                Commit.committed_at <= end_dt,
            )
        )
        commits_result = await self.db.execute(commits_stmt)
        commits_row = commits_result.one()

        # Commits by repository
        commits_by_repo_stmt = (
            select(
                Commit.repository,
                func.count(Commit.id).label("count"),
            )
            .where(
                and_(
                    Commit.developer_id == developer_id,
                    Commit.committed_at >= start_dt,
                    Commit.committed_at <= end_dt,
                )
            )
            .group_by(Commit.repository)
        )
        commits_by_repo_result = await self.db.execute(commits_by_repo_stmt)
        commits_by_repo = {row.repository: row.count for row in commits_by_repo_result}

        # Commits by month
        commits_by_month_stmt = (
            select(
                func.to_char(Commit.committed_at, 'YYYY-MM').label("month"),
                func.count(Commit.id).label("count"),
            )
            .where(
                and_(
                    Commit.developer_id == developer_id,
                    Commit.committed_at >= start_dt,
                    Commit.committed_at <= end_dt,
                )
            )
            .group_by(func.to_char(Commit.committed_at, 'YYYY-MM'))
            .order_by(func.to_char(Commit.committed_at, 'YYYY-MM'))
        )
        commits_by_month_result = await self.db.execute(commits_by_month_stmt)
        commits_by_month = {row.month: row.count for row in commits_by_month_result}

        # Aggregate pull requests
        prs_stmt = select(
            func.count(PullRequest.id).label("total"),
            func.sum(case((PullRequest.merged_at.isnot(None), 1), else_=0)).label("merged"),
            func.sum(case((PullRequest.state == "closed", 1), else_=0)).label("closed"),
            func.sum(PullRequest.additions).label("additions"),
            func.sum(PullRequest.deletions).label("deletions"),
            func.avg(PullRequest.comments_count).label("avg_comments"),
        ).where(
            and_(
                PullRequest.developer_id == developer_id,
                PullRequest.created_at >= start_dt,
                PullRequest.created_at <= end_dt,
            )
        )
        prs_result = await self.db.execute(prs_stmt)
        prs_row = prs_result.one()

        # Aggregate code reviews
        reviews_stmt = select(
            func.count(CodeReview.id).label("total"),
            func.sum(case((CodeReview.state == "approved", 1), else_=0)).label("approved"),
            func.sum(case((CodeReview.state == "changes_requested", 1), else_=0)).label("changes_requested"),
            func.sum(case((CodeReview.state == "commented", 1), else_=0)).label("commented"),
            func.avg(CodeReview.comments_count).label("avg_comments"),
        ).where(
            and_(
                CodeReview.developer_id == developer_id,
                CodeReview.submitted_at >= start_dt,
                CodeReview.submitted_at <= end_dt,
            )
        )
        reviews_result = await self.db.execute(reviews_stmt)
        reviews_row = reviews_result.one()

        # Get languages from commits
        languages_stmt = (
            select(Commit.languages)
            .where(
                and_(
                    Commit.developer_id == developer_id,
                    Commit.committed_at >= start_dt,
                    Commit.committed_at <= end_dt,
                    Commit.languages.isnot(None),
                )
            )
        )
        languages_result = await self.db.execute(languages_stmt)

        # Aggregate language percentages
        language_counts: dict[str, int] = {}
        total_files = 0
        for row in languages_result:
            if row.languages:
                for lang, count in row.languages.items():
                    language_counts[lang] = language_counts.get(lang, 0) + count
                    total_files += count

        languages = {}
        if total_files > 0:
            languages = {
                lang: round((count / total_files) * 100, 1)
                for lang, count in sorted(
                    language_counts.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:10]
            }

        # Get skills from developer profile
        developer = await self.db.get(Developer, developer_id)
        skills_demonstrated = []
        if developer and developer.skill_fingerprint:
            fp = developer.skill_fingerprint
            if "languages" in fp:
                skills_demonstrated.extend(
                    [s.get("name", "") for s in fp["languages"][:5] if s.get("name")]
                )
            if "frameworks" in fp:
                skills_demonstrated.extend(
                    [s.get("name", "") for s in fp["frameworks"][:5] if s.get("name")]
                )

        return ContributionMetrics(
            total_commits=commits_row.total or 0,
            commits_by_repo=commits_by_repo,
            commits_by_month=commits_by_month,
            prs_created=prs_row.total or 0,
            prs_merged=prs_row.merged or 0,
            prs_closed=prs_row.closed or 0,
            avg_time_to_merge_hours=None,  # Would need more complex query
            avg_pr_comments=float(prs_row.avg_comments) if prs_row.avg_comments else None,
            reviews_given=reviews_row.total or 0,
            reviews_approved=reviews_row.approved or 0,
            reviews_changes_requested=reviews_row.changes_requested or 0,
            reviews_commented=reviews_row.commented or 0,
            avg_comments_per_review=float(reviews_row.avg_comments) if reviews_row.avg_comments else None,
            lines_added=(commits_row.additions or 0) + (prs_row.additions or 0),
            lines_deleted=(commits_row.deletions or 0) + (prs_row.deletions or 0),
            languages=languages,
            skills_demonstrated=skills_demonstrated,
        )

    async def _get_highlights(
        self,
        developer_id: str,
        period_start: date,
        period_end: date,
        limit: int = 10,
    ) -> list[ContributionHighlight]:
        """Get notable contributions."""
        start_dt = datetime.combine(period_start, datetime.min.time())
        end_dt = datetime.combine(period_end, datetime.max.time())

        highlights = []

        # Get largest PRs
        prs_stmt = (
            select(PullRequest)
            .where(
                and_(
                    PullRequest.developer_id == developer_id,
                    PullRequest.created_at >= start_dt,
                    PullRequest.created_at <= end_dt,
                    PullRequest.merged_at.isnot(None),
                )
            )
            .order_by((PullRequest.additions + PullRequest.deletions).desc())
            .limit(limit // 2)
        )
        prs_result = await self.db.execute(prs_stmt)
        for pr in prs_result.scalars():
            highlights.append(ContributionHighlight(
                type="pr",
                id=str(pr.id),
                title=pr.title,
                impact=f"Merged PR with {pr.additions}+ / {pr.deletions}- lines",
                additions=pr.additions,
                deletions=pr.deletions,
                url=pr.html_url,
            ))

        # Get significant reviews
        reviews_stmt = (
            select(CodeReview)
            .where(
                and_(
                    CodeReview.developer_id == developer_id,
                    CodeReview.submitted_at >= start_dt,
                    CodeReview.submitted_at <= end_dt,
                    CodeReview.comments_count > 2,
                )
            )
            .order_by(CodeReview.comments_count.desc())
            .limit(limit // 2)
        )
        reviews_result = await self.db.execute(reviews_stmt)
        for review in reviews_result.scalars():
            highlights.append(ContributionHighlight(
                type="review",
                id=str(review.id),
                title=f"Code review ({review.state})",
                impact=f"Provided {review.comments_count} comments",
                additions=None,
                deletions=None,
                url=None,
            ))

        return highlights[:limit]

    async def _generate_ai_insights(
        self,
        developer_name: str,
        period_start: date,
        period_end: date,
        metrics: ContributionMetrics,
    ) -> str | None:
        """Generate AI insights using LLM."""
        if not self.llm_gateway:
            return None

        try:
            prompt = CONTRIBUTION_INSIGHTS_PROMPT.format(
                developer_name=developer_name,
                period_start=period_start.isoformat(),
                period_end=period_end.isoformat(),
                total_commits=metrics.total_commits,
                prs_created=metrics.prs_created,
                prs_merged=metrics.prs_merged,
                reviews_given=metrics.reviews_given,
                lines_added=metrics.lines_added,
                lines_deleted=metrics.lines_deleted,
                languages=", ".join(f"{k}: {v}%" for k, v in metrics.languages.items()),
                skills=", ".join(metrics.skills_demonstrated) or "Not available",
                repositories=", ".join(list(metrics.commits_by_repo.keys())[:5]) or "Not available",
            )

            result = await self.llm_gateway.analyze(
                analysis_type="contribution_summary",
                context=prompt,
                data={},
            )

            return result.get("summary", result.get("content", str(result)))
        except Exception as e:
            logger.error(f"Failed to generate AI insights: {e}")
            return None

    def _metrics_to_dict(self, metrics: ContributionMetrics) -> dict[str, Any]:
        """Convert metrics to dictionary."""
        return {
            "commits": {
                "total": metrics.total_commits,
                "by_repo": metrics.commits_by_repo,
                "by_month": metrics.commits_by_month,
            },
            "pull_requests": {
                "created": metrics.prs_created,
                "merged": metrics.prs_merged,
                "closed": metrics.prs_closed,
                "avg_time_to_merge_hours": metrics.avg_time_to_merge_hours,
                "avg_comments": metrics.avg_pr_comments,
            },
            "code_reviews": {
                "given": metrics.reviews_given,
                "approved": metrics.reviews_approved,
                "changes_requested": metrics.reviews_changes_requested,
                "commented": metrics.reviews_commented,
                "avg_comments_per_review": metrics.avg_comments_per_review,
            },
            "lines": {
                "additions": metrics.lines_added,
                "deletions": metrics.lines_deleted,
                "net": metrics.lines_added - metrics.lines_deleted,
            },
            "languages": metrics.languages,
            "skills_demonstrated": metrics.skills_demonstrated,
        }

    def _highlight_to_dict(self, highlight: ContributionHighlight) -> dict[str, Any]:
        """Convert highlight to dictionary."""
        return {
            "type": highlight.type,
            "id": highlight.id,
            "title": highlight.title,
            "impact": highlight.impact,
            "additions": highlight.additions,
            "deletions": highlight.deletions,
            "url": highlight.url,
        }
