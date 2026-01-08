"""Unit tests for GitHubService - TDD approach with mocking."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from aexy.services.github_service import (
    GitHubAPIError,
    GitHubAuthError,
    GitHubService,
    GitHubServiceError,
)


class TestOAuthURL:
    """Test OAuth URL generation."""

    def test_get_oauth_url_includes_client_id(self):
        """Should include client_id in OAuth URL."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_client_id = "test_client_id"
            mock_settings.return_value.github_redirect_uri = "http://localhost/callback"
            mock_settings.return_value.github_oauth_url = "https://github.com/login/oauth"

            service = GitHubService()
            url = service.get_oauth_url("test_state")

            assert "client_id=test_client_id" in url

    def test_get_oauth_url_includes_state(self):
        """Should include state parameter in OAuth URL."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_client_id = "test_client_id"
            mock_settings.return_value.github_redirect_uri = "http://localhost/callback"
            mock_settings.return_value.github_oauth_url = "https://github.com/login/oauth"

            service = GitHubService()
            url = service.get_oauth_url("my_state_123")

            assert "state=my_state_123" in url

    def test_get_oauth_url_includes_scopes(self):
        """Should include required scopes in OAuth URL."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_client_id = "test_client_id"
            mock_settings.return_value.github_redirect_uri = "http://localhost/callback"
            mock_settings.return_value.github_oauth_url = "https://github.com/login/oauth"

            service = GitHubService()
            url = service.get_oauth_url("state")

            assert "scope=" in url
            assert "repo" in url
            assert "read:org" in url
            assert "read:user" in url


class TestCodeExchange:
    """Test OAuth code exchange."""

    @pytest.mark.asyncio
    async def test_exchange_code_success(self):
        """Should exchange code for access token."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_client_id = "client_id"
            mock_settings.return_value.github_client_secret = "client_secret"
            mock_settings.return_value.github_redirect_uri = "http://localhost/callback"
            mock_settings.return_value.github_oauth_url = "https://github.com/login/oauth"

            with patch("httpx.AsyncClient") as mock_client_class:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "access_token": "gho_test_token",
                    "token_type": "bearer",
                    "scope": "repo,read:user",
                }

                mock_client = AsyncMock()
                mock_client.__aenter__.return_value = mock_client
                mock_client.__aexit__.return_value = None
                mock_client.post = AsyncMock(return_value=mock_response)
                mock_client_class.return_value = mock_client

                service = GitHubService()
                result = await service.exchange_code_for_token("auth_code")

                assert result.access_token == "gho_test_token"
                assert result.scope == "repo,read:user"

    @pytest.mark.asyncio
    async def test_exchange_code_error(self):
        """Should raise error on OAuth failure."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_client_id = "client_id"
            mock_settings.return_value.github_client_secret = "client_secret"
            mock_settings.return_value.github_redirect_uri = "http://localhost/callback"
            mock_settings.return_value.github_oauth_url = "https://github.com/login/oauth"

            with patch("httpx.AsyncClient") as mock_client_class:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "error": "bad_verification_code",
                    "error_description": "The code passed is incorrect",
                }

                mock_client = AsyncMock()
                mock_client.__aenter__.return_value = mock_client
                mock_client.__aexit__.return_value = None
                mock_client.post = AsyncMock(return_value=mock_response)
                mock_client_class.return_value = mock_client

                service = GitHubService()
                with pytest.raises(GitHubAuthError):
                    await service.exchange_code_for_token("bad_code")


class TestGetUserInfo:
    """Test getting user info from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_user_info_success(self):
        """Should return user info from GitHub."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_api_base_url = "https://api.github.com"

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "id": 12345,
                "login": "testuser",
                "name": "Test User",
                "email": "test@example.com",
                "avatar_url": "https://github.com/avatar.png",
            }

            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = AsyncMock()
                mock_client.get = AsyncMock(return_value=mock_response)
                mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

                service = GitHubService(access_token="test_token")
                async with service:
                    service._client = mock_client
                    result = await service.get_user_info()

                assert result.id == 12345
                assert result.login == "testuser"
                assert result.name == "Test User"

    @pytest.mark.asyncio
    async def test_get_user_info_not_initialized(self):
        """Should raise error when service not initialized."""
        service = GitHubService()

        with pytest.raises(GitHubServiceError):
            await service.get_user_info()


class TestGetUserEmails:
    """Test getting user emails from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_user_emails_success(self):
        """Should return user emails from GitHub."""
        with patch("aexy.services.github_service.get_settings") as mock_settings:
            mock_settings.return_value.github_api_base_url = "https://api.github.com"

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = [
                {"email": "primary@example.com", "primary": True, "verified": True},
                {"email": "secondary@example.com", "primary": False, "verified": True},
            ]

            service = GitHubService(access_token="test_token")
            service._client = MagicMock()
            service._client.get = AsyncMock(return_value=mock_response)

            result = await service.get_user_emails()

            assert len(result) == 2
            assert result[0]["email"] == "primary@example.com"


class TestGetRepos:
    """Test getting repositories from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_user_repos_success(self):
        """Should return user repositories."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"id": 1, "name": "repo1", "full_name": "user/repo1"},
            {"id": 2, "name": "repo2", "full_name": "user/repo2"},
        ]

        service = GitHubService(access_token="test_token")
        service._client = MagicMock()
        service._client.get = AsyncMock(return_value=mock_response)

        result = await service.get_user_repos()

        assert len(result) == 2
        assert result[0]["name"] == "repo1"


class TestGetCommits:
    """Test getting commits from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_commits_success(self):
        """Should return commits from repository."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"sha": "abc123", "commit": {"message": "Initial commit"}},
            {"sha": "def456", "commit": {"message": "Add feature"}},
        ]

        service = GitHubService(access_token="test_token")
        service._client = MagicMock()
        service._client.get = AsyncMock(return_value=mock_response)

        result = await service.get_commits("owner", "repo")

        assert len(result) == 2
        assert result[0]["sha"] == "abc123"

    @pytest.mark.asyncio
    async def test_get_commits_with_author_filter(self):
        """Should pass author filter to API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []

        service = GitHubService(access_token="test_token")
        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        service._client = mock_client

        await service.get_commits("owner", "repo", author="testuser")

        # Verify the author param was included
        call_kwargs = mock_client.get.call_args[1]
        assert call_kwargs["params"]["author"] == "testuser"


class TestGetPullRequests:
    """Test getting pull requests from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_pull_requests_success(self):
        """Should return pull requests from repository."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"id": 1, "number": 10, "title": "Feature PR", "state": "merged"},
            {"id": 2, "number": 11, "title": "Fix PR", "state": "open"},
        ]

        service = GitHubService(access_token="test_token")
        service._client = MagicMock()
        service._client.get = AsyncMock(return_value=mock_response)

        result = await service.get_pull_requests("owner", "repo")

        assert len(result) == 2
        assert result[0]["title"] == "Feature PR"

    @pytest.mark.asyncio
    async def test_get_pull_requests_api_error(self):
        """Should raise error on API failure."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Rate limit exceeded"

        service = GitHubService(access_token="test_token")
        service._client = MagicMock()
        service._client.get = AsyncMock(return_value=mock_response)

        with pytest.raises(GitHubAPIError):
            await service.get_pull_requests("owner", "repo")


class TestGetCommitDetails:
    """Test getting commit details from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_commit_details_success(self):
        """Should return detailed commit information."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "sha": "abc123",
            "commit": {"message": "Add feature"},
            "stats": {"additions": 100, "deletions": 20},
            "files": [
                {"filename": "src/main.py", "additions": 50, "deletions": 10},
            ],
        }

        service = GitHubService(access_token="test_token")
        service._client = MagicMock()
        service._client.get = AsyncMock(return_value=mock_response)

        result = await service.get_commit_details("owner", "repo", "abc123")

        assert result["sha"] == "abc123"
        assert len(result["files"]) == 1


class TestGetPRReviews:
    """Test getting PR reviews from GitHub API."""

    @pytest.mark.asyncio
    async def test_get_pr_reviews_success(self):
        """Should return reviews for a pull request."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"id": 1, "state": "APPROVED", "body": "LGTM"},
            {"id": 2, "state": "CHANGES_REQUESTED", "body": "Please fix X"},
        ]

        service = GitHubService(access_token="test_token")
        service._client = MagicMock()
        service._client.get = AsyncMock(return_value=mock_response)

        result = await service.get_pull_request_reviews("owner", "repo", 10)

        assert len(result) == 2
        assert result[0]["state"] == "APPROVED"
