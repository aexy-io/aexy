"""Unit tests for Data Ingestion Service - TDD approach."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from gitraki.services.ingestion_service import IngestionService
from gitraki.models.developer import Developer
from gitraki.models.activity import Commit, PullRequest, CodeReview


class TestCommitIngestion:
    """Test commit ingestion functionality."""

    @pytest.mark.asyncio
    async def test_ingest_single_commit(self, db_session):
        """Should ingest a single commit and create record."""
        service = IngestionService()

        commit_data = {
            "id": "abc123def456789",
            "message": "feat: Add new authentication feature",
            "author": {
                "name": "Test User",
                "email": "test@example.com",
            },
            "timestamp": "2024-01-15T10:30:00Z",
            "added": ["src/auth.py"],
            "modified": ["src/utils.py"],
            "removed": [],
        }

        result = await service.ingest_commit(
            repository="owner/repo",
            commit=commit_data,
            db=db_session,
        )

        assert result is not None
        assert result.sha == "abc123def456789"
        assert result.repository == "owner/repo"
        assert result.message == "feat: Add new authentication feature"

    @pytest.mark.asyncio
    async def test_ingest_commit_extracts_languages(self, db_session):
        """Should extract languages from file extensions."""
        service = IngestionService()

        commit_data = {
            "id": "abc123",
            "message": "Add feature",
            "author": {"name": "Test", "email": "test@example.com"},
            "timestamp": "2024-01-15T10:30:00Z",
            "added": ["src/main.py", "src/utils.py"],
            "modified": ["frontend/app.tsx"],
            "removed": [],
        }

        result = await service.ingest_commit(
            repository="owner/repo",
            commit=commit_data,
            db=db_session,
        )

        assert "Python" in result.languages
        assert "TypeScript" in result.languages

    @pytest.mark.asyncio
    async def test_ingest_commits_batch(self, db_session):
        """Should ingest multiple commits in batch."""
        service = IngestionService()

        commits = [
            {
                "id": "commit1",
                "message": "First commit",
                "author": {"name": "Test", "email": "test@example.com"},
                "timestamp": "2024-01-15T10:00:00Z",
                "added": ["file1.py"],
                "modified": [],
                "removed": [],
            },
            {
                "id": "commit2",
                "message": "Second commit",
                "author": {"name": "Test", "email": "test@example.com"},
                "timestamp": "2024-01-15T11:00:00Z",
                "added": ["file2.py"],
                "modified": [],
                "removed": [],
            },
        ]

        results = await service.ingest_commits(
            repository="owner/repo",
            commits=commits,
            sender={"login": "testuser", "id": 123},
            db=db_session,
        )

        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_ingest_commit_links_to_developer(self, db_session):
        """Should link commit to existing developer by email."""
        # Create a developer first
        developer = Developer(
            email="test@example.com",
            name="Test User",
        )
        db_session.add(developer)
        await db_session.flush()

        service = IngestionService()

        commit_data = {
            "id": "abc123",
            "message": "Add feature",
            "author": {"name": "Test", "email": "test@example.com"},
            "timestamp": "2024-01-15T10:30:00Z",
            "added": ["file.py"],
            "modified": [],
            "removed": [],
        }

        result = await service.ingest_commit(
            repository="owner/repo",
            commit=commit_data,
            db=db_session,
        )

        assert result.developer_id == developer.id

    @pytest.mark.asyncio
    async def test_skip_duplicate_commit(self, db_session):
        """Should skip already ingested commits."""
        service = IngestionService()

        commit_data = {
            "id": "abc123",
            "message": "Add feature",
            "author": {"name": "Test", "email": "test@example.com"},
            "timestamp": "2024-01-15T10:30:00Z",
            "added": ["file.py"],
            "modified": [],
            "removed": [],
        }

        # Ingest first time
        result1 = await service.ingest_commit(
            repository="owner/repo",
            commit=commit_data,
            db=db_session,
        )

        # Ingest second time - should return existing
        result2 = await service.ingest_commit(
            repository="owner/repo",
            commit=commit_data,
            db=db_session,
        )

        assert result1.id == result2.id


class TestPullRequestIngestion:
    """Test pull request ingestion functionality."""

    @pytest.mark.asyncio
    async def test_ingest_pr_opened(self, db_session):
        """Should ingest a new pull request."""
        service = IngestionService()

        pr_data = {
            "id": 98765,
            "number": 42,
            "title": "Add payment integration",
            "body": "This PR adds Stripe integration",
            "state": "open",
            "user": {"login": "testuser", "id": 123},
            "additions": 200,
            "deletions": 50,
            "changed_files": 10,
            "commits": 5,
            "comments": 3,
            "review_comments": 8,
            "created_at": "2024-01-10T09:00:00Z",
            "updated_at": "2024-01-12T15:00:00Z",
        }

        result = await service.ingest_pull_request(
            repository="owner/repo",
            pull_request=pr_data,
            action="opened",
            sender={"login": "testuser", "id": 123},
            db=db_session,
        )

        assert result is not None
        assert result.github_id == 98765
        assert result.number == 42
        assert result.title == "Add payment integration"
        assert result.additions == 200
        assert result.deletions == 50

    @pytest.mark.asyncio
    async def test_ingest_pr_merged(self, db_session):
        """Should update PR when merged."""
        service = IngestionService()

        # First create the PR
        pr_data = {
            "id": 98765,
            "number": 42,
            "title": "Add feature",
            "body": "Description",
            "state": "open",
            "user": {"login": "testuser", "id": 123},
            "additions": 100,
            "deletions": 20,
            "changed_files": 5,
            "commits": 3,
            "created_at": "2024-01-10T09:00:00Z",
        }

        await service.ingest_pull_request(
            repository="owner/repo",
            pull_request=pr_data,
            action="opened",
            sender={"login": "testuser", "id": 123},
            db=db_session,
        )

        # Now merge it
        pr_data["state"] = "closed"
        pr_data["merged_at"] = "2024-01-12T16:00:00Z"

        result = await service.ingest_pull_request(
            repository="owner/repo",
            pull_request=pr_data,
            action="closed",
            sender={"login": "testuser", "id": 123},
            db=db_session,
        )

        assert result.state == "closed"
        assert result.merged_at is not None

    @pytest.mark.asyncio
    async def test_ingest_pr_extracts_skills(self, db_session):
        """Should extract detected skills from PR content."""
        service = IngestionService()

        pr_data = {
            "id": 98765,
            "number": 42,
            "title": "Add Stripe payment integration",
            "body": "Implement checkout flow with OAuth authentication",
            "state": "open",
            "user": {"login": "testuser", "id": 123},
            "additions": 100,
            "deletions": 20,
            "changed_files": 5,
            "commits": 3,
            "created_at": "2024-01-10T09:00:00Z",
        }

        result = await service.ingest_pull_request(
            repository="owner/repo",
            pull_request=pr_data,
            action="opened",
            sender={"login": "testuser", "id": 123},
            db=db_session,
        )

        # Should detect payment and auth domains
        assert result.detected_skills is not None
        assert any("payment" in s.lower() for s in result.detected_skills)

    @pytest.mark.asyncio
    async def test_ingest_pr_links_to_developer(self, db_session):
        """Should link PR to developer by GitHub ID."""
        # Create developer with GitHub connection
        from gitraki.models.developer import GitHubConnection

        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        connection = GitHubConnection(
            developer_id=developer.id,
            github_id=123,
            github_username="testuser",
            access_token="token",
        )
        db_session.add(connection)
        await db_session.flush()

        service = IngestionService()

        pr_data = {
            "id": 98765,
            "number": 42,
            "title": "Add feature",
            "state": "open",
            "user": {"login": "testuser", "id": 123},
            "additions": 100,
            "deletions": 20,
            "changed_files": 5,
            "commits": 3,
            "created_at": "2024-01-10T09:00:00Z",
        }

        result = await service.ingest_pull_request(
            repository="owner/repo",
            pull_request=pr_data,
            action="opened",
            sender={"login": "testuser", "id": 123},
            db=db_session,
        )

        assert result.developer_id == developer.id


class TestReviewIngestion:
    """Test code review ingestion functionality."""

    @pytest.mark.asyncio
    async def test_ingest_review(self, db_session):
        """Should ingest a code review."""
        service = IngestionService()

        review_data = {
            "id": 555,
            "user": {"login": "reviewer", "id": 456},
            "body": "LGTM! Great work.",
            "state": "APPROVED",
            "submitted_at": "2024-01-15T14:00:00Z",
        }

        pr_data = {
            "id": 98765,
            "number": 42,
        }

        result = await service.ingest_review(
            repository="owner/repo",
            review=review_data,
            pull_request=pr_data,
            sender={"login": "reviewer", "id": 456},
            db=db_session,
        )

        assert result is not None
        assert result.github_id == 555
        assert result.state == "APPROVED"
        assert result.pull_request_github_id == 98765

    @pytest.mark.asyncio
    async def test_ingest_review_with_comments(self, db_session):
        """Should capture review comment count."""
        service = IngestionService()

        review_data = {
            "id": 555,
            "user": {"login": "reviewer", "id": 456},
            "body": "Please fix the issues mentioned in comments.",
            "state": "CHANGES_REQUESTED",
            "submitted_at": "2024-01-15T14:00:00Z",
        }

        result = await service.ingest_review(
            repository="owner/repo",
            review=review_data,
            pull_request={"id": 98765, "number": 42},
            sender={"login": "reviewer", "id": 456},
            db=db_session,
        )

        assert result.state == "CHANGES_REQUESTED"


class TestDeveloperLookup:
    """Test developer lookup functionality."""

    @pytest.mark.asyncio
    async def test_find_developer_by_email(self, db_session):
        """Should find developer by email."""
        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        service = IngestionService()
        found = await service.find_developer_by_email("test@example.com", db_session)

        assert found is not None
        assert found.id == developer.id

    @pytest.mark.asyncio
    async def test_find_developer_by_github_id(self, db_session):
        """Should find developer by GitHub ID."""
        from gitraki.models.developer import GitHubConnection

        developer = Developer(email="test@example.com", name="Test")
        db_session.add(developer)
        await db_session.flush()

        connection = GitHubConnection(
            developer_id=developer.id,
            github_id=123,
            github_username="testuser",
            access_token="token",
        )
        db_session.add(connection)
        await db_session.flush()

        service = IngestionService()
        found = await service.find_developer_by_github_id(123, db_session)

        assert found is not None
        assert found.id == developer.id

    @pytest.mark.asyncio
    async def test_return_none_for_unknown_developer(self, db_session):
        """Should return None for unknown developer."""
        service = IngestionService()

        by_email = await service.find_developer_by_email("unknown@example.com", db_session)
        by_github = await service.find_developer_by_github_id(99999, db_session)

        assert by_email is None
        assert by_github is None


class TestLanguageExtraction:
    """Test language extraction from file paths."""

    def test_extract_languages_from_files(self):
        """Should extract languages from file paths."""
        service = IngestionService()

        files = ["src/main.py", "src/utils.py", "frontend/app.tsx", "README.md"]
        languages = service.extract_languages(files)

        assert "Python" in languages
        assert "TypeScript" in languages
        assert len(languages) == 2  # README.md doesn't count

    def test_extract_file_types(self):
        """Should extract file types/extensions."""
        service = IngestionService()

        files = ["src/main.py", "config.yaml", "Dockerfile", "package.json"]
        file_types = service.extract_file_types(files)

        assert ".py" in file_types
        assert ".yaml" in file_types
        assert ".json" in file_types

    def test_empty_files_list(self):
        """Should handle empty files list."""
        service = IngestionService()

        languages = service.extract_languages([])
        file_types = service.extract_file_types([])

        assert languages == []
        assert file_types == []


class TestSkillExtraction:
    """Test skill extraction from PR content."""

    def test_extract_skills_from_pr_title(self):
        """Should extract skills from PR title."""
        service = IngestionService()

        skills = service.extract_skills_from_pr(
            title="Add Stripe payment integration",
            body="",
        )

        assert any("payment" in s.lower() for s in skills)

    def test_extract_skills_from_pr_body(self):
        """Should extract skills from PR body."""
        service = IngestionService()

        skills = service.extract_skills_from_pr(
            title="Add feature",
            body="Implement OAuth2 authentication with JWT tokens",
        )

        assert any("auth" in s.lower() for s in skills)

    def test_extract_multiple_skills(self):
        """Should extract multiple skills."""
        service = IngestionService()

        skills = service.extract_skills_from_pr(
            title="Add payment API with auth",
            body="Uses Stripe for payments and OAuth for authentication. Includes Docker setup.",
        )

        assert len(skills) >= 2
