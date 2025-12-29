"""Unit tests for Profile Sync Service - TDD approach."""

from datetime import datetime, timedelta, timezone

import pytest

from gitraki.models.activity import Commit, PullRequest, CodeReview
from gitraki.models.developer import Developer, GitHubConnection
from gitraki.services.profile_sync import ProfileSyncService


class TestProfileSyncBasic:
    """Test basic profile sync functionality."""

    @pytest.mark.asyncio
    async def test_sync_profile_from_commits(self, db_session):
        """Should sync profile based on commit history."""
        # Create developer with commits
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Add some commits
        for i in range(5):
            commit = Commit(
                sha=f"commit{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"Commit {i}",
                additions=50,
                deletions=10,
                files_changed=3,
                languages=["Python", "TypeScript"],
                file_types=[".py", ".ts"],
                committed_at=datetime.now(timezone.utc),
            )
            db_session.add(commit)
        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        assert result is not None
        assert result.skill_fingerprint is not None
        assert len(result.skill_fingerprint["languages"]) > 0

    @pytest.mark.asyncio
    async def test_sync_profile_from_prs(self, db_session):
        """Should include PR data in profile sync."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Add PRs
        for i in range(3):
            pr = PullRequest(
                github_id=i + 1000,
                number=i + 1,
                repository="owner/repo",
                developer_id=developer.id,
                title=f"Feature {i}",
                state="merged",
                additions=100 + i * 50,
                deletions=20,
                files_changed=5,
                commits_count=3,
                detected_skills=["api", "backend"],
                created_at_github=datetime.now(timezone.utc),
            )
            db_session.add(pr)
        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        assert result.work_patterns is not None
        assert result.work_patterns["average_pr_size"] > 0

    @pytest.mark.asyncio
    async def test_sync_profile_from_reviews(self, db_session):
        """Should include review data in profile sync."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Add reviews
        for i in range(5):
            review = CodeReview(
                github_id=i + 2000,
                repository="owner/repo",
                developer_id=developer.id,
                pull_request_github_id=i + 1000,
                state="APPROVED",
                body="LGTM",
                comments_count=2,
                submitted_at=datetime.now(timezone.utc),
            )
            db_session.add(review)
        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        # Profile should reflect review activity
        assert result is not None


class TestLanguageAggregation:
    """Test language skill aggregation."""

    @pytest.mark.asyncio
    async def test_aggregate_language_from_commits(self, db_session):
        """Should aggregate language usage from commits."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Python commits
        for i in range(10):
            commit = Commit(
                sha=f"py_commit{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"Python commit {i}",
                additions=100,
                deletions=20,
                files_changed=3,
                languages=["Python"],
                committed_at=datetime.now(timezone.utc),
            )
            db_session.add(commit)

        # TypeScript commits
        for i in range(5):
            commit = Commit(
                sha=f"ts_commit{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"TypeScript commit {i}",
                additions=50,
                deletions=10,
                files_changed=2,
                languages=["TypeScript"],
                committed_at=datetime.now(timezone.utc),
            )
            db_session.add(commit)

        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        languages = result.skill_fingerprint["languages"]
        python_skill = next((l for l in languages if l["name"] == "Python"), None)
        ts_skill = next((l for l in languages if l["name"] == "TypeScript"), None)

        assert python_skill is not None
        assert ts_skill is not None
        # Python should have higher proficiency (more commits)
        assert python_skill["proficiency_score"] > ts_skill["proficiency_score"]

    @pytest.mark.asyncio
    async def test_calculate_language_trend(self, db_session):
        """Should calculate language usage trend."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        now = datetime.now(timezone.utc)

        # Recent Python commits
        for i in range(5):
            commit = Commit(
                sha=f"recent_py{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"Recent Python {i}",
                additions=50,
                deletions=10,
                languages=["Python"],
                committed_at=now - timedelta(days=i),
            )
            db_session.add(commit)

        # Old Ruby commits (declining)
        for i in range(5):
            commit = Commit(
                sha=f"old_ruby{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"Old Ruby {i}",
                additions=50,
                deletions=10,
                languages=["Ruby"],
                committed_at=now - timedelta(days=180 + i),  # 6 months ago
            )
            db_session.add(commit)

        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        languages = result.skill_fingerprint["languages"]
        python_skill = next((l for l in languages if l["name"] == "Python"), None)
        ruby_skill = next((l for l in languages if l["name"] == "Ruby"), None)

        assert python_skill["trend"] in ["growing", "stable"]
        assert ruby_skill["trend"] == "declining"


class TestDomainAggregation:
    """Test domain expertise aggregation."""

    @pytest.mark.asyncio
    async def test_aggregate_domains_from_prs(self, db_session):
        """Should aggregate domain expertise from PRs."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Payment-related PRs
        for i in range(3):
            pr = PullRequest(
                github_id=i + 100,
                number=i + 1,
                repository="owner/repo",
                developer_id=developer.id,
                title=f"Payment feature {i}",
                state="merged",
                additions=100,
                deletions=20,
                detected_skills=["payment"],
                created_at_github=datetime.now(timezone.utc),
            )
            db_session.add(pr)

        # Auth-related PRs
        for i in range(2):
            pr = PullRequest(
                github_id=i + 200,
                number=i + 10,
                repository="owner/repo",
                developer_id=developer.id,
                title=f"Auth feature {i}",
                state="merged",
                additions=80,
                deletions=15,
                detected_skills=["authentication"],
                created_at_github=datetime.now(timezone.utc),
            )
            db_session.add(pr)

        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        domains = result.skill_fingerprint["domains"]
        assert len(domains) >= 2

        payment_domain = next((d for d in domains if "payment" in d["name"]), None)
        assert payment_domain is not None
        assert payment_domain["confidence_score"] > 0


class TestWorkPatternAnalysis:
    """Test work pattern analysis."""

    @pytest.mark.asyncio
    async def test_calculate_average_pr_size(self, db_session):
        """Should calculate average PR size."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # PRs with varying sizes
        sizes = [100, 200, 300, 400, 500]  # additions + deletions
        for i, size in enumerate(sizes):
            pr = PullRequest(
                github_id=i + 100,
                number=i + 1,
                repository="owner/repo",
                developer_id=developer.id,
                title=f"PR {i}",
                state="merged",
                additions=size,
                deletions=size // 10,
                created_at_github=datetime.now(timezone.utc),
            )
            db_session.add(pr)
        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        # Average should be around 300 (average of additions)
        assert result.work_patterns["average_pr_size"] > 0

    @pytest.mark.asyncio
    async def test_determine_complexity_preference(self, db_session):
        """Should determine complexity preference from PR sizes."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Large PRs indicate complex work preference
        for i in range(5):
            pr = PullRequest(
                github_id=i + 100,
                number=i + 1,
                repository="owner/repo",
                developer_id=developer.id,
                title=f"Large PR {i}",
                state="merged",
                additions=800,
                deletions=100,
                created_at_github=datetime.now(timezone.utc),
            )
            db_session.add(pr)
        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        assert result.work_patterns["preferred_complexity"] == "complex"

    @pytest.mark.asyncio
    async def test_analyze_peak_hours(self, db_session):
        """Should analyze peak productivity hours from commits."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        # Commits at various hours - concentration at 10 AM
        hours = [10, 10, 10, 14, 14, 16, 10, 10]
        for i, hour in enumerate(hours):
            commit_time = datetime.now(timezone.utc).replace(hour=hour)
            commit = Commit(
                sha=f"commit_hour{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"Commit at {hour}",
                additions=50,
                deletions=10,
                committed_at=commit_time,
            )
            db_session.add(commit)
        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        peak_hours = result.work_patterns["peak_productivity_hours"]
        assert 10 in peak_hours  # Most commits at 10 AM


class TestGrowthTrajectory:
    """Test growth trajectory calculation."""

    @pytest.mark.asyncio
    async def test_detect_new_skills(self, db_session):
        """Should detect newly acquired skills."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        now = datetime.now(timezone.utc)

        # Old commits with Python only
        for i in range(5):
            commit = Commit(
                sha=f"old_py{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message="Old Python",
                languages=["Python"],
                committed_at=now - timedelta(days=200),
            )
            db_session.add(commit)

        # Recent commits with Python + Go (new skill)
        for i in range(5):
            commit = Commit(
                sha=f"new_go{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message="New Go",
                languages=["Go"],
                committed_at=now - timedelta(days=i),
            )
            db_session.add(commit)

        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        acquired = result.growth_trajectory["skills_acquired_6m"]
        assert "Go" in acquired

    @pytest.mark.asyncio
    async def test_calculate_learning_velocity(self, db_session):
        """Should calculate learning velocity."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        now = datetime.now(timezone.utc)

        # Commits showing progression through multiple languages
        languages_by_month = [
            ["Python"],  # 6 months ago
            ["Python", "JavaScript"],  # 5 months ago
            ["Python", "JavaScript"],  # 4 months ago
            ["Python", "JavaScript", "Go"],  # 3 months ago
            ["Python", "JavaScript", "Go"],  # 2 months ago
            ["Python", "JavaScript", "Go", "Rust"],  # 1 month ago
        ]

        for month, langs in enumerate(languages_by_month):
            for lang in langs:
                commit = Commit(
                    sha=f"commit_{month}_{lang}",
                    repository="owner/repo",
                    developer_id=developer.id,
                    message=f"{lang} work",
                    languages=[lang],
                    committed_at=now - timedelta(days=(6 - month) * 30),
                )
                db_session.add(commit)

        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        velocity = result.growth_trajectory["learning_velocity"]
        assert velocity > 0


class TestFullProfileSync:
    """Test complete profile sync integration."""

    @pytest.mark.asyncio
    async def test_full_profile_sync(self, db_session):
        """Should perform complete profile sync with all components."""
        # Create developer with GitHub connection
        developer = Developer(email="test@example.com", name="Test User")
        db_session.add(developer)
        await db_session.flush()

        connection = GitHubConnection(
            developer_id=developer.id,
            github_id=12345,
            github_username="testuser",
            access_token="token",
        )
        db_session.add(connection)

        now = datetime.now(timezone.utc)

        # Add diverse activity
        for i in range(10):
            commit = Commit(
                sha=f"commit_{i}",
                repository="owner/repo",
                developer_id=developer.id,
                message=f"Feature {i}",
                additions=50 + i * 10,
                deletions=10,
                languages=["Python"] if i < 7 else ["TypeScript"],
                committed_at=now - timedelta(days=i * 5),
            )
            db_session.add(commit)

        for i in range(5):
            pr = PullRequest(
                github_id=i + 1000,
                number=i + 1,
                repository="owner/repo",
                developer_id=developer.id,
                title=f"Add payment feature {i}" if i < 3 else f"Fix auth bug {i}",
                state="merged",
                additions=150,
                deletions=30,
                detected_skills=["payment"] if i < 3 else ["authentication"],
                created_at_github=now - timedelta(days=i * 10),
            )
            db_session.add(pr)

        for i in range(3):
            review = CodeReview(
                github_id=i + 2000,
                repository="owner/repo",
                developer_id=developer.id,
                pull_request_github_id=i + 3000,
                state="APPROVED",
                comments_count=3,
                submitted_at=now - timedelta(days=i * 5),
            )
            db_session.add(review)

        await db_session.flush()

        service = ProfileSyncService()
        result = await service.sync_developer_profile(developer.id, db_session)

        # Verify complete profile
        assert result.skill_fingerprint is not None
        assert result.work_patterns is not None
        assert result.growth_trajectory is not None

        # Verify skill fingerprint
        assert len(result.skill_fingerprint["languages"]) >= 2
        assert len(result.skill_fingerprint["domains"]) >= 1

        # Verify work patterns
        assert result.work_patterns["average_pr_size"] > 0
        assert result.work_patterns["preferred_complexity"] in ["simple", "medium", "complex"]

        # Verify growth trajectory
        assert "skills_acquired_6m" in result.growth_trajectory
