"""Unit tests for Team Service - TDD approach."""

from datetime import datetime, timezone

import pytest

from aexy.models.developer import Developer
from aexy.models.activity import Commit, PullRequest
from aexy.services.team_service import TeamService


class TestTeamAggregation:
    """Test team-level aggregation."""

    @pytest.mark.asyncio
    async def test_aggregate_team_skills(self, db_session):
        """Should aggregate skills across team members."""
        # Create team members
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        dev1.skill_fingerprint = {
            "languages": [
                {"name": "Python", "proficiency_score": 90, "commits_count": 100},
                {"name": "JavaScript", "proficiency_score": 60, "commits_count": 30},
            ],
            "domains": [{"name": "backend", "confidence_score": 85}],
            "frameworks": [],
            "tools": [],
        }

        dev2 = Developer(email="dev2@example.com", name="Dev 2")
        dev2.skill_fingerprint = {
            "languages": [
                {"name": "TypeScript", "proficiency_score": 85, "commits_count": 80},
                {"name": "Python", "proficiency_score": 50, "commits_count": 20},
            ],
            "domains": [{"name": "frontend", "confidence_score": 80}],
            "frameworks": [],
            "tools": [],
        }

        db_session.add(dev1)
        db_session.add(dev2)
        await db_session.flush()

        service = TeamService()
        team_profile = await service.aggregate_team_skills(
            developer_ids=[dev1.id, dev2.id],
            db=db_session,
        )

        assert "languages" in team_profile
        assert "domains" in team_profile

        # Python should appear (both know it)
        python = next((l for l in team_profile["languages"] if l["name"] == "Python"), None)
        assert python is not None
        assert python["developer_count"] == 2

    @pytest.mark.asyncio
    async def test_identify_skill_gaps(self, db_session):
        """Should identify skills with low coverage."""
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        dev1.skill_fingerprint = {
            "languages": [
                {"name": "Python", "proficiency_score": 90, "commits_count": 100},
            ],
            "domains": [],
            "frameworks": [],
            "tools": [],
        }

        db_session.add(dev1)
        await db_session.flush()

        service = TeamService()
        # Assume we need TypeScript, Go, and Kubernetes
        required_skills = ["TypeScript", "Go", "Kubernetes"]

        gaps = await service.identify_skill_gaps(
            developer_ids=[dev1.id],
            required_skills=required_skills,
            db=db_session,
        )

        assert "TypeScript" in gaps
        assert "Go" in gaps
        assert "Kubernetes" in gaps
        assert "Python" not in gaps

    @pytest.mark.asyncio
    async def test_calculate_bus_factor(self, db_session):
        """Should calculate bus factor for skills."""
        # Only dev1 knows Python
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        dev1.skill_fingerprint = {
            "languages": [
                {"name": "Python", "proficiency_score": 90, "commits_count": 100},
            ],
            "domains": [],
            "frameworks": [],
            "tools": [],
        }

        # Both know JavaScript
        dev2 = Developer(email="dev2@example.com", name="Dev 2")
        dev2.skill_fingerprint = {
            "languages": [
                {"name": "JavaScript", "proficiency_score": 80, "commits_count": 80},
            ],
            "domains": [],
            "frameworks": [],
            "tools": [],
        }

        dev3 = Developer(email="dev3@example.com", name="Dev 3")
        dev3.skill_fingerprint = {
            "languages": [
                {"name": "JavaScript", "proficiency_score": 70, "commits_count": 60},
            ],
            "domains": [],
            "frameworks": [],
            "tools": [],
        }

        db_session.add(dev1)
        db_session.add(dev2)
        db_session.add(dev3)
        await db_session.flush()

        service = TeamService()
        bus_factor = await service.calculate_bus_factor(
            developer_ids=[dev1.id, dev2.id, dev3.id],
            db=db_session,
        )

        # Python has bus factor of 1 (only dev1)
        assert bus_factor.get("Python", 0) == 1
        # JavaScript has bus factor of 2
        assert bus_factor.get("JavaScript", 0) == 2


class TestTeamMetrics:
    """Test team metrics calculation."""

    @pytest.mark.asyncio
    async def test_calculate_team_velocity(self, db_session):
        """Should calculate team velocity from PRs."""
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        db_session.add(dev1)
        await db_session.flush()

        # Add merged PRs
        for i in range(10):
            pr = PullRequest(
                github_id=i + 100,
                number=i + 1,
                repository="owner/repo",
                developer_id=dev1.id,
                title=f"PR {i}",
                state="closed",
                additions=100,
                deletions=20,
                created_at_github=datetime.now(timezone.utc),
                merged_at=datetime.now(timezone.utc),
            )
            db_session.add(pr)
        await db_session.flush()

        service = TeamService()
        velocity = await service.calculate_team_velocity(
            developer_ids=[dev1.id],
            db=db_session,
        )

        assert velocity["merged_prs"] == 10
        assert velocity["total_additions"] > 0

    @pytest.mark.asyncio
    async def test_calculate_commit_distribution(self, db_session):
        """Should calculate commit distribution across team."""
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        dev2 = Developer(email="dev2@example.com", name="Dev 2")
        db_session.add(dev1)
        db_session.add(dev2)
        await db_session.flush()

        # Dev1: 30 commits, Dev2: 10 commits
        for i in range(30):
            commit = Commit(
                sha=f"dev1_commit_{i}",
                repository="owner/repo",
                developer_id=dev1.id,
                message=f"Commit {i}",
                additions=50,
                committed_at=datetime.now(timezone.utc),
            )
            db_session.add(commit)

        for i in range(10):
            commit = Commit(
                sha=f"dev2_commit_{i}",
                repository="owner/repo",
                developer_id=dev2.id,
                message=f"Commit {i}",
                additions=50,
                committed_at=datetime.now(timezone.utc),
            )
            db_session.add(commit)
        await db_session.flush()

        service = TeamService()
        distribution = await service.calculate_commit_distribution(
            developer_ids=[dev1.id, dev2.id],
            db=db_session,
        )

        assert distribution[dev1.id]["commits"] == 30
        assert distribution[dev2.id]["commits"] == 10
        assert distribution[dev1.id]["percentage"] == 75.0
        assert distribution[dev2.id]["percentage"] == 25.0


class TestTeamProfile:
    """Test complete team profile generation."""

    @pytest.mark.asyncio
    async def test_generate_team_profile(self, db_session):
        """Should generate complete team profile."""
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        dev1.skill_fingerprint = {
            "languages": [
                {"name": "Python", "proficiency_score": 90, "commits_count": 100},
            ],
            "domains": [{"name": "backend", "confidence_score": 85}],
            "frameworks": [{"name": "FastAPI", "category": "web", "proficiency_score": 80}],
            "tools": ["Docker", "Git"],
        }

        dev2 = Developer(email="dev2@example.com", name="Dev 2")
        dev2.skill_fingerprint = {
            "languages": [
                {"name": "TypeScript", "proficiency_score": 85, "commits_count": 80},
            ],
            "domains": [{"name": "frontend", "confidence_score": 80}],
            "frameworks": [{"name": "React", "category": "web", "proficiency_score": 75}],
            "tools": ["Docker", "Kubernetes"],
        }

        db_session.add(dev1)
        db_session.add(dev2)
        await db_session.flush()

        # Add activity
        for i in range(5):
            commit = Commit(
                sha=f"commit_{i}",
                repository="owner/repo",
                developer_id=dev1.id if i < 3 else dev2.id,
                message=f"Commit {i}",
                additions=50,
                committed_at=datetime.now(timezone.utc),
            )
            db_session.add(commit)
        await db_session.flush()

        service = TeamService()
        profile = await service.generate_team_profile(
            developer_ids=[dev1.id, dev2.id],
            db=db_session,
        )

        assert "skill_summary" in profile
        assert "metrics" in profile
        assert "bus_factor_risks" in profile
        assert profile["team_size"] == 2


class TestSkillCoverage:
    """Test skill coverage analysis."""

    @pytest.mark.asyncio
    async def test_calculate_skill_coverage(self, db_session):
        """Should calculate skill coverage percentage."""
        dev1 = Developer(email="dev1@example.com", name="Dev 1")
        dev1.skill_fingerprint = {
            "languages": [
                {"name": "Python", "proficiency_score": 90, "commits_count": 100},
                {"name": "Go", "proficiency_score": 60, "commits_count": 30},
            ],
            "domains": [],
            "frameworks": [],
            "tools": [],
        }

        db_session.add(dev1)
        await db_session.flush()

        service = TeamService()
        required = ["Python", "Go", "Rust", "TypeScript"]

        coverage = await service.calculate_skill_coverage(
            developer_ids=[dev1.id],
            required_skills=required,
            db=db_session,
        )

        # Have Python and Go (2/4 = 50%)
        assert coverage["covered"] == 2
        assert coverage["total"] == 4
        assert coverage["percentage"] == 50.0
        assert "Python" in coverage["covered_skills"]
        assert "Rust" in coverage["missing_skills"]
