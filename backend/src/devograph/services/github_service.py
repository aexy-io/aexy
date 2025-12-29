"""GitHub API integration service."""

from typing import Any

import httpx

from devograph.core.config import get_settings
from devograph.schemas.auth import GitHubAuthResponse, GitHubUserInfo


class GitHubServiceError(Exception):
    """Base exception for GitHub service errors."""

    pass


class GitHubAuthError(GitHubServiceError):
    """Authentication error with GitHub."""

    pass


class GitHubAPIError(GitHubServiceError):
    """Error from GitHub API."""

    pass


class GitHubService:
    """Service for interacting with GitHub API."""

    def __init__(self, access_token: str | None = None) -> None:
        """Initialize GitHub service."""
        self.settings = get_settings()
        self.access_token = access_token
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GitHubService":
        """Async context manager entry."""
        headers = {"Accept": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        self._client = httpx.AsyncClient(
            base_url=self.settings.github_api_base_url,
            headers=headers,
            timeout=30.0,
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()

    def get_oauth_url(self, state: str) -> str:
        """Generate GitHub OAuth authorization URL."""
        scopes = "repo read:org read:user user:email"
        return (
            f"{self.settings.github_oauth_url}/authorize"
            f"?client_id={self.settings.github_client_id}"
            f"&redirect_uri={self.settings.github_redirect_uri}"
            f"&scope={scopes}"
            f"&state={state}"
        )

    async def exchange_code_for_token(self, code: str) -> GitHubAuthResponse:
        """Exchange authorization code for access token."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.settings.github_oauth_url}/access_token",
                data={
                    "client_id": self.settings.github_client_id,
                    "client_secret": self.settings.github_client_secret,
                    "code": code,
                    "redirect_uri": self.settings.github_redirect_uri,
                },
                headers={"Accept": "application/json"},
            )

            if response.status_code != 200:
                raise GitHubAuthError(f"Failed to exchange code: {response.text}")

            data = response.json()
            if "error" in data:
                raise GitHubAuthError(f"GitHub OAuth error: {data.get('error_description', data['error'])}")

            return GitHubAuthResponse(
                access_token=data["access_token"],
                token_type=data.get("token_type", "bearer"),
                scope=data.get("scope", ""),
            )

    async def get_user_info(self) -> GitHubUserInfo:
        """Get authenticated user information."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get("/user")

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get user info: {response.text}")

        data = response.json()
        return GitHubUserInfo(
            id=data["id"],
            login=data["login"],
            name=data.get("name"),
            email=data.get("email"),
            avatar_url=data.get("avatar_url"),
        )

    async def get_user_emails(self) -> list[dict[str, Any]]:
        """Get user's verified email addresses."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get("/user/emails")

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get user emails: {response.text}")

        return response.json()

    async def get_user_repos(self, per_page: int = 100, page: int = 1) -> list[dict[str, Any]]:
        """Get user's repositories."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(
            "/user/repos",
            params={
                "per_page": per_page,
                "page": page,
                "sort": "updated",
                "direction": "desc",
            },
        )

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get repos: {response.text}")

        return response.json()

    async def get_commits(
        self,
        owner: str,
        repo: str,
        author: str | None = None,
        per_page: int = 100,
        page: int = 1,
    ) -> list[dict[str, Any]]:
        """Get commits from a repository."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        params: dict[str, Any] = {"per_page": per_page, "page": page}
        if author:
            params["author"] = author

        response = await self._client.get(f"/repos/{owner}/{repo}/commits", params=params)

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get commits: {response.text}")

        return response.json()

    async def get_commit_details(self, owner: str, repo: str, sha: str) -> dict[str, Any]:
        """Get detailed commit information including file changes."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(f"/repos/{owner}/{repo}/commits/{sha}")

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get commit details: {response.text}")

        return response.json()

    async def get_pull_requests(
        self,
        owner: str,
        repo: str,
        state: str = "all",
        per_page: int = 100,
        page: int = 1,
    ) -> list[dict[str, Any]]:
        """Get pull requests from a repository."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(
            f"/repos/{owner}/{repo}/pulls",
            params={"state": state, "per_page": per_page, "page": page},
        )

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get pull requests: {response.text}")

        return response.json()

    async def get_pull_request_reviews(
        self,
        owner: str,
        repo: str,
        pull_number: int,
    ) -> list[dict[str, Any]]:
        """Get reviews for a pull request."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(f"/repos/{owner}/{repo}/pulls/{pull_number}/reviews")

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get PR reviews: {response.text}")

        return response.json()

    # Organization methods

    async def get_user_orgs(self, per_page: int = 100, page: int = 1) -> list[dict[str, Any]]:
        """Get organizations the authenticated user belongs to."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(
            "/user/orgs",
            params={"per_page": per_page, "page": page},
        )

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get user orgs: {response.text}")

        return response.json()

    async def get_org(self, org: str) -> dict[str, Any]:
        """Get organization details by login name."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(f"/orgs/{org}")

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get org: {response.text}")

        return response.json()

    async def get_org_repos(
        self,
        org: str,
        per_page: int = 100,
        page: int = 1,
        type: str = "all",
    ) -> list[dict[str, Any]]:
        """Get repositories for an organization."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(
            f"/orgs/{org}/repos",
            params={
                "per_page": per_page,
                "page": page,
                "type": type,
                "sort": "updated",
            },
        )

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get org repos: {response.text}")

        return response.json()

    # Webhook methods

    async def create_repo_webhook(
        self,
        owner: str,
        repo: str,
        callback_url: str,
        secret: str,
        events: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create a webhook on a repository."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        if events is None:
            events = ["push", "pull_request", "pull_request_review"]

        response = await self._client.post(
            f"/repos/{owner}/{repo}/hooks",
            json={
                "name": "web",
                "active": True,
                "events": events,
                "config": {
                    "url": callback_url,
                    "content_type": "json",
                    "secret": secret,
                    "insecure_ssl": "0",
                },
            },
        )

        if response.status_code not in (200, 201):
            raise GitHubAPIError(f"Failed to create webhook: {response.text}")

        return response.json()

    async def delete_repo_webhook(self, owner: str, repo: str, hook_id: int) -> None:
        """Delete a webhook from a repository."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.delete(f"/repos/{owner}/{repo}/hooks/{hook_id}")

        if response.status_code != 204:
            raise GitHubAPIError(f"Failed to delete webhook: {response.text}")

    async def get_repo_webhooks(self, owner: str, repo: str) -> list[dict[str, Any]]:
        """Get all webhooks for a repository."""
        if not self._client:
            raise GitHubServiceError("Service not initialized. Use async context manager.")

        response = await self._client.get(f"/repos/{owner}/{repo}/hooks")

        if response.status_code != 200:
            raise GitHubAPIError(f"Failed to get webhooks: {response.text}")

        return response.json()

    # Pagination helpers for historical sync

    async def get_all_user_repos(self) -> list[dict[str, Any]]:
        """Get all repositories the user has access to (handles pagination)."""
        all_repos = []
        page = 1

        while True:
            repos = await self.get_user_repos(per_page=100, page=page)
            if not repos:
                break
            all_repos.extend(repos)
            if len(repos) < 100:
                break
            page += 1

        return all_repos

    async def get_all_org_repos(self, org: str) -> list[dict[str, Any]]:
        """Get all repositories for an organization (handles pagination)."""
        all_repos = []
        page = 1

        while True:
            repos = await self.get_org_repos(org, per_page=100, page=page)
            if not repos:
                break
            all_repos.extend(repos)
            if len(repos) < 100:
                break
            page += 1

        return all_repos

    async def get_all_user_orgs(self) -> list[dict[str, Any]]:
        """Get all organizations the user belongs to (handles pagination)."""
        all_orgs = []
        page = 1

        while True:
            orgs = await self.get_user_orgs(per_page=100, page=page)
            if not orgs:
                break
            all_orgs.extend(orgs)
            if len(orgs) < 100:
                break
            page += 1

        return all_orgs
