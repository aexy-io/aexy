"""Profile Sync Service - Analyzes activity and updates developer profiles."""

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gitraki.models.activity import Commit, PullRequest, CodeReview
from gitraki.models.developer import Developer


class ProfileSyncService:
    """Service for syncing developer profiles from activity data."""

    async def sync_developer_profile(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> Developer:
        """Sync a developer's profile based on their activity.

        Args:
            developer_id: Developer ID to sync
            db: Database session

        Returns:
            Updated Developer with skill fingerprint, work patterns, and growth trajectory
        """
        # Get developer
        stmt = select(Developer).where(Developer.id == developer_id)
        result = await db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        # Get activity data
        commits = await self._get_commits(developer_id, db)
        pull_requests = await self._get_pull_requests(developer_id, db)
        reviews = await self._get_reviews(developer_id, db)

        # Build skill fingerprint
        skill_fingerprint = self._build_skill_fingerprint(commits, pull_requests)

        # Analyze work patterns
        work_patterns = self._analyze_work_patterns(commits, pull_requests, reviews)

        # Calculate growth trajectory
        growth_trajectory = self._calculate_growth_trajectory(commits)

        # Update developer
        developer.skill_fingerprint = skill_fingerprint
        developer.work_patterns = work_patterns
        developer.growth_trajectory = growth_trajectory

        await db.flush()
        await db.refresh(developer)

        return developer

    async def _get_commits(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> list[Commit]:
        """Get commits for a developer."""
        stmt = (
            select(Commit)
            .where(Commit.developer_id == developer_id)
            .order_by(Commit.committed_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def _get_pull_requests(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> list[PullRequest]:
        """Get pull requests for a developer."""
        stmt = (
            select(PullRequest)
            .where(PullRequest.developer_id == developer_id)
            .order_by(PullRequest.created_at_github.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def _get_reviews(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> list[CodeReview]:
        """Get code reviews for a developer."""
        stmt = (
            select(CodeReview)
            .where(CodeReview.developer_id == developer_id)
            .order_by(CodeReview.submitted_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    def _build_skill_fingerprint(
        self,
        commits: list[Commit],
        pull_requests: list[PullRequest],
    ) -> dict[str, Any]:
        """Build skill fingerprint from activity."""
        languages = self._aggregate_languages(commits)
        domains = self._aggregate_domains(pull_requests)
        frameworks = self._detect_frameworks(commits, pull_requests)

        return {
            "languages": languages,
            "frameworks": frameworks,
            "domains": domains,
            "tools": [],  # Would need additional analysis
        }

    def _aggregate_languages(self, commits: list[Commit]) -> list[dict[str, Any]]:
        """Aggregate language skills from commits."""
        if not commits:
            return []

        now = datetime.now(timezone.utc)
        six_months_ago = now - timedelta(days=180)

        # Count language usage
        language_commits: Counter[str] = Counter()
        language_lines: Counter[str] = Counter()
        recent_language_commits: Counter[str] = Counter()
        old_language_commits: Counter[str] = Counter()

        for commit in commits:
            languages = commit.languages or []
            additions = commit.additions or 0
            committed_at = commit.committed_at

            # Make committed_at timezone-aware if it isn't
            if committed_at and committed_at.tzinfo is None:
                committed_at = committed_at.replace(tzinfo=timezone.utc)

            for lang in languages:
                language_commits[lang] += 1
                language_lines[lang] += additions

                if committed_at and committed_at > six_months_ago:
                    recent_language_commits[lang] += 1
                else:
                    old_language_commits[lang] += 1

        total_commits = sum(language_commits.values())
        total_lines = sum(language_lines.values())

        if total_commits == 0:
            return []

        # Build language skills
        skills = []
        for lang, commit_count in language_commits.items():
            lines = language_lines.get(lang, 0)

            # Calculate proficiency score
            commit_ratio = commit_count / total_commits
            lines_ratio = lines / total_lines if total_lines > 0 else 0
            score = (commit_ratio * 0.6 + lines_ratio * 0.4) * 100
            score = min(100, score + min(10, commit_count / 10))

            # Calculate trend
            recent = recent_language_commits.get(lang, 0)
            old = old_language_commits.get(lang, 0)

            if old == 0 and recent > 0:
                trend = "growing"
            elif recent == 0 and old > 0:
                trend = "declining"
            elif recent > old:
                trend = "growing"
            elif recent < old * 0.5:
                trend = "declining"
            else:
                trend = "stable"

            skills.append({
                "name": lang,
                "proficiency_score": round(score, 1),
                "lines_of_code": lines,
                "commits_count": commit_count,
                "trend": trend,
            })

        # Sort by proficiency
        skills.sort(key=lambda x: x["proficiency_score"], reverse=True)
        return skills

    def _aggregate_domains(self, pull_requests: list[PullRequest]) -> list[dict[str, Any]]:
        """Aggregate domain expertise from PRs."""
        if not pull_requests:
            return []

        domain_counts: Counter[str] = Counter()

        for pr in pull_requests:
            skills = pr.detected_skills or []
            for skill in skills:
                domain_counts[skill] += 1

        total = sum(domain_counts.values())
        if total == 0:
            return []

        domains = []
        for domain, count in domain_counts.most_common(5):
            confidence = min(100, (count / total) * 100 + count * 5)
            domains.append({
                "name": domain,
                "confidence_score": round(confidence, 1),
            })

        return domains

    def _detect_frameworks(
        self,
        commits: list[Commit],
        pull_requests: list[PullRequest],
    ) -> list[dict[str, Any]]:
        """Detect frameworks from activity."""
        # Placeholder - would need file content analysis
        return []

    def _analyze_work_patterns(
        self,
        commits: list[Commit],
        pull_requests: list[PullRequest],
        reviews: list[CodeReview],
    ) -> dict[str, Any]:
        """Analyze work patterns from activity."""
        # Calculate average PR size
        pr_sizes = []
        for pr in pull_requests:
            size = (pr.additions or 0) + (pr.deletions or 0)
            if size > 0:
                pr_sizes.append(size)

        avg_pr_size = int(sum(pr_sizes) / len(pr_sizes)) if pr_sizes else 0

        # Determine complexity preference
        if avg_pr_size > 500:
            complexity = "complex"
        elif avg_pr_size > 150:
            complexity = "medium"
        else:
            complexity = "simple"

        # Analyze peak hours
        hours: list[int] = []
        for commit in commits:
            if commit.committed_at:
                hours.append(commit.committed_at.hour)

        hour_counts = Counter(hours)
        peak_hours = [h for h, _ in hour_counts.most_common(3)]

        # Determine collaboration style based on review activity
        review_count = len(reviews)
        pr_count = len(pull_requests)

        if review_count > pr_count * 2:
            collab_style = "collaborative"
        elif review_count < pr_count * 0.5:
            collab_style = "solo"
        else:
            collab_style = "balanced"

        return {
            "preferred_complexity": complexity,
            "collaboration_style": collab_style,
            "peak_productivity_hours": peak_hours,
            "average_pr_size": avg_pr_size,
            "average_review_turnaround_hours": 0.0,  # Would need timestamp analysis
        }

    def _calculate_growth_trajectory(self, commits: list[Commit]) -> dict[str, Any]:
        """Calculate growth trajectory from commit history."""
        if not commits:
            return {
                "skills_acquired_6m": [],
                "skills_acquired_12m": [],
                "skills_declining": [],
                "learning_velocity": 0.0,
            }

        now = datetime.now(timezone.utc)
        six_months_ago = now - timedelta(days=180)
        twelve_months_ago = now - timedelta(days=365)

        # Track languages by time period
        recent_languages: set[str] = set()
        old_languages: set[str] = set()
        mid_languages: set[str] = set()

        for commit in commits:
            languages = commit.languages or []
            committed_at = commit.committed_at

            if committed_at and committed_at.tzinfo is None:
                committed_at = committed_at.replace(tzinfo=timezone.utc)

            if not committed_at:
                continue

            for lang in languages:
                if committed_at > six_months_ago:
                    recent_languages.add(lang)
                elif committed_at > twelve_months_ago:
                    mid_languages.add(lang)
                else:
                    old_languages.add(lang)

        # Skills acquired in last 6 months (not in older periods)
        all_old = old_languages | mid_languages
        skills_acquired_6m = list(recent_languages - all_old)

        # Skills acquired in last 12 months
        skills_acquired_12m = list((recent_languages | mid_languages) - old_languages)

        # Skills declining (in old but not recent)
        skills_declining = list(old_languages - recent_languages)

        # Learning velocity (new skills per month in last 6 months)
        velocity = len(skills_acquired_6m) / 6.0 if skills_acquired_6m else 0.0

        return {
            "skills_acquired_6m": skills_acquired_6m,
            "skills_acquired_12m": skills_acquired_12m,
            "skills_declining": skills_declining,
            "learning_velocity": round(velocity, 2),
        }

    async def sync_all_profiles(self, db: AsyncSession) -> int:
        """Sync all developer profiles.

        Args:
            db: Database session

        Returns:
            Number of profiles synced
        """
        stmt = select(Developer.id)
        result = await db.execute(stmt)
        developer_ids = [row[0] for row in result.all()]

        count = 0
        for dev_id in developer_ids:
            try:
                await self.sync_developer_profile(dev_id, db)
                count += 1
            except Exception:
                # Log error but continue
                pass

        return count
