"""Team Service for team-level analytics and aggregation."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.developer import Developer


class TeamService:
    """Service for team-level analytics and aggregation."""

    async def aggregate_team_skills(
        self,
        developer_ids: list[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Aggregate skills across team members.

        Args:
            developer_ids: List of developer IDs in the team
            db: Database session

        Returns:
            Aggregated team skill profile
        """
        # Get all developers
        stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(stmt)
        developers = list(result.scalars().all())

        # Aggregate languages
        language_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"total_score": 0, "developer_count": 0, "total_commits": 0}
        )

        # Aggregate domains
        domain_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"total_score": 0, "developer_count": 0}
        )

        # Aggregate frameworks
        framework_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"category": "", "developer_count": 0}
        )

        # Aggregate tools
        tools: set[str] = set()

        for dev in developers:
            fingerprint = dev.skill_fingerprint or {}

            # Languages
            for lang in fingerprint.get("languages", []):
                name = lang.get("name", "")
                if name:
                    language_data[name]["total_score"] += lang.get("proficiency_score", 0)
                    language_data[name]["developer_count"] += 1
                    language_data[name]["total_commits"] += lang.get("commits_count", 0)

            # Domains
            for domain in fingerprint.get("domains", []):
                name = domain.get("name", "")
                if name:
                    domain_data[name]["total_score"] += domain.get("confidence_score", 0)
                    domain_data[name]["developer_count"] += 1

            # Frameworks
            for fw in fingerprint.get("frameworks", []):
                name = fw.get("name", "")
                if name:
                    framework_data[name]["category"] = fw.get("category", "")
                    framework_data[name]["developer_count"] += 1

            # Tools
            for tool in fingerprint.get("tools", []):
                tools.add(tool)

        # Build aggregated results
        languages = [
            {
                "name": name,
                "average_proficiency": data["total_score"] / data["developer_count"],
                "developer_count": data["developer_count"],
                "total_commits": data["total_commits"],
            }
            for name, data in language_data.items()
        ]
        languages.sort(key=lambda x: x["developer_count"], reverse=True)

        domains = [
            {
                "name": name,
                "average_confidence": data["total_score"] / data["developer_count"],
                "developer_count": data["developer_count"],
            }
            for name, data in domain_data.items()
        ]
        domains.sort(key=lambda x: x["developer_count"], reverse=True)

        frameworks = [
            {
                "name": name,
                "category": data["category"],
                "developer_count": data["developer_count"],
            }
            for name, data in framework_data.items()
        ]
        frameworks.sort(key=lambda x: x["developer_count"], reverse=True)

        return {
            "languages": languages,
            "domains": domains,
            "frameworks": frameworks,
            "tools": list(tools),
        }

    async def identify_skill_gaps(
        self,
        developer_ids: list[str],
        required_skills: list[str],
        db: AsyncSession,
    ) -> list[str]:
        """Identify skills that the team is missing.

        Args:
            developer_ids: List of developer IDs
            required_skills: Skills that are required
            db: Database session

        Returns:
            List of missing skills
        """
        team_skills = await self.aggregate_team_skills(developer_ids, db)

        # Get all skills the team has
        team_skill_names: set[str] = set()

        for lang in team_skills.get("languages", []):
            team_skill_names.add(lang["name"])

        for domain in team_skills.get("domains", []):
            team_skill_names.add(domain["name"])

        for fw in team_skills.get("frameworks", []):
            team_skill_names.add(fw["name"])

        for tool in team_skills.get("tools", []):
            team_skill_names.add(tool)

        # Find gaps
        required_set = set(required_skills)
        gaps = required_set - team_skill_names

        return list(gaps)

    async def calculate_bus_factor(
        self,
        developer_ids: list[str],
        db: AsyncSession,
    ) -> dict[str, int]:
        """Calculate bus factor for each skill.

        Bus factor = number of developers who know a skill.
        Low bus factor (1) = high risk.

        Args:
            developer_ids: List of developer IDs
            db: Database session

        Returns:
            Dict mapping skill name to bus factor
        """
        stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(stmt)
        developers = list(result.scalars().all())

        skill_developers: dict[str, set[str]] = defaultdict(set)

        for dev in developers:
            fingerprint = dev.skill_fingerprint or {}

            for lang in fingerprint.get("languages", []):
                name = lang.get("name", "")
                if name:
                    skill_developers[name].add(dev.id)

        return {skill: len(devs) for skill, devs in skill_developers.items()}

    async def calculate_team_velocity(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        days: int = 30,
    ) -> dict[str, Any]:
        """Calculate team velocity metrics.

        Args:
            developer_ids: List of developer IDs
            db: Database session
            days: Number of days to consider

        Returns:
            Velocity metrics
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Count merged PRs
        pr_stmt = (
            select(func.count(PullRequest.id), func.sum(PullRequest.additions), func.sum(PullRequest.deletions))
            .where(PullRequest.developer_id.in_(developer_ids))
            .where(PullRequest.merged_at.isnot(None))
        )
        pr_result = await db.execute(pr_stmt)
        pr_row = pr_result.one()

        merged_prs = pr_row[0] or 0
        total_additions = pr_row[1] or 0
        total_deletions = pr_row[2] or 0

        # Count commits
        commit_stmt = (
            select(func.count(Commit.id))
            .where(Commit.developer_id.in_(developer_ids))
        )
        commit_result = await db.execute(commit_stmt)
        total_commits = commit_result.scalar() or 0

        return {
            "merged_prs": merged_prs,
            "total_additions": total_additions,
            "total_deletions": total_deletions,
            "total_commits": total_commits,
            "period_days": days,
        }

    async def calculate_commit_distribution(
        self,
        developer_ids: list[str],
        db: AsyncSession,
    ) -> dict[str, dict[str, Any]]:
        """Calculate commit distribution across team.

        Args:
            developer_ids: List of developer IDs
            db: Database session

        Returns:
            Dict mapping developer ID to commit stats
        """
        stmt = (
            select(Commit.developer_id, func.count(Commit.id))
            .where(Commit.developer_id.in_(developer_ids))
            .group_by(Commit.developer_id)
        )
        result = await db.execute(stmt)
        rows = result.all()

        total_commits = sum(row[1] for row in rows)

        distribution = {}
        for dev_id, commits in rows:
            percentage = (commits / total_commits * 100) if total_commits > 0 else 0
            distribution[dev_id] = {
                "commits": commits,
                "percentage": round(percentage, 1),
            }

        # Add zero entries for developers with no commits
        for dev_id in developer_ids:
            if dev_id not in distribution:
                distribution[dev_id] = {"commits": 0, "percentage": 0.0}

        return distribution

    async def calculate_skill_coverage(
        self,
        developer_ids: list[str],
        required_skills: list[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Calculate skill coverage percentage.

        Args:
            developer_ids: List of developer IDs
            required_skills: Skills that are required
            db: Database session

        Returns:
            Coverage statistics
        """
        team_skills = await self.aggregate_team_skills(developer_ids, db)

        # Get all skills the team has
        team_skill_names: set[str] = set()

        for lang in team_skills.get("languages", []):
            team_skill_names.add(lang["name"])

        for domain in team_skills.get("domains", []):
            team_skill_names.add(domain["name"])

        for fw in team_skills.get("frameworks", []):
            team_skill_names.add(fw["name"])

        for tool in team_skills.get("tools", []):
            team_skill_names.add(tool)

        required_set = set(required_skills)
        covered = required_set & team_skill_names
        missing = required_set - team_skill_names

        total = len(required_skills)
        covered_count = len(covered)
        percentage = (covered_count / total * 100) if total > 0 else 0

        return {
            "covered": covered_count,
            "total": total,
            "percentage": round(percentage, 1),
            "covered_skills": list(covered),
            "missing_skills": list(missing),
        }

    async def generate_team_profile(
        self,
        developer_ids: list[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Generate complete team profile.

        Args:
            developer_ids: List of developer IDs
            db: Database session

        Returns:
            Complete team profile
        """
        skill_summary = await self.aggregate_team_skills(developer_ids, db)
        bus_factor = await self.calculate_bus_factor(developer_ids, db)
        metrics = await self.calculate_team_velocity(developer_ids, db)
        distribution = await self.calculate_commit_distribution(developer_ids, db)

        # Identify bus factor risks (skills with factor of 1)
        bus_factor_risks = [skill for skill, factor in bus_factor.items() if factor == 1]

        return {
            "team_size": len(developer_ids),
            "skill_summary": skill_summary,
            "metrics": metrics,
            "commit_distribution": distribution,
            "bus_factor": bus_factor,
            "bus_factor_risks": bus_factor_risks,
        }
