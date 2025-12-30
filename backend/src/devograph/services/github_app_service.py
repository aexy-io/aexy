"""GitHub App service for installation-based authentication."""

import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.core.config import settings
from devograph.models.developer import GitHubConnection, GitHubInstallation


class GitHubAppError(Exception):
    """GitHub App related error."""

    pass


class GitHubAppService:
    """Service for GitHub App authentication and installation management."""

    def __init__(self, db: AsyncSession | None = None):
        self.db = db
        self.app_id = settings.github_app_id
        self.private_key = settings.get_github_private_key()
        self.api_base_url = settings.github_api_base_url

    def _generate_jwt(self) -> str:
        """Generate a JWT for GitHub App authentication.

        JWT is valid for up to 10 minutes.
        """
        if not self.app_id or not self.private_key:
            raise GitHubAppError(
                "GitHub App ID and Private Key must be configured. "
                "Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY in .env"
            )

        now = int(time.time())
        payload = {
            "iat": now - 60,  # Issued 60 seconds ago to account for clock drift
            "exp": now + (9 * 60),  # Expires in 9 minutes
            "iss": self.app_id,
        }

        return jwt.encode(payload, self.private_key, algorithm="RS256")

    async def get_installation_access_token(
        self,
        installation_id: int,
    ) -> tuple[str, datetime]:
        """Get an installation access token for API calls.

        Returns (token, expires_at).
        """
        app_jwt = self._generate_jwt()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.api_base_url}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )

            if response.status_code != 201:
                raise GitHubAppError(
                    f"Failed to get installation token: {response.status_code} - {response.text}"
                )

            data = response.json()
            expires_at = datetime.fromisoformat(
                data["expires_at"].replace("Z", "+00:00")
            )

            return data["token"], expires_at

    async def get_app_installations(self) -> list[dict[str, Any]]:
        """Get all installations of this GitHub App."""
        app_jwt = self._generate_jwt()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_base_url}/app/installations",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )

            if response.status_code != 200:
                raise GitHubAppError(
                    f"Failed to get installations: {response.status_code} - {response.text}"
                )

            return response.json()

    async def get_installation_by_account(
        self,
        account_type: str,  # "users" or "orgs"
        account_name: str,
    ) -> dict[str, Any] | None:
        """Get installation for a specific account."""
        app_jwt = self._generate_jwt()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_base_url}/{account_type}/{account_name}/installation",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )

            if response.status_code == 404:
                return None

            if response.status_code != 200:
                raise GitHubAppError(
                    f"Failed to get installation: {response.status_code} - {response.text}"
                )

            return response.json()

    async def get_installation_repositories(
        self,
        installation_id: int,
    ) -> list[dict[str, Any]]:
        """Get repositories accessible to an installation."""
        token, _ = await self.get_installation_access_token(installation_id)

        all_repos = []
        page = 1

        async with httpx.AsyncClient() as client:
            while True:
                response = await client.get(
                    f"{self.api_base_url}/installation/repositories",
                    params={"per_page": 100, "page": page},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )

                if response.status_code != 200:
                    raise GitHubAppError(
                        f"Failed to get repos: {response.status_code} - {response.text}"
                    )

                data = response.json()
                repos = data.get("repositories", [])
                all_repos.extend(repos)

                if len(repos) < 100:
                    break
                page += 1

        return all_repos

    async def sync_user_installations(
        self,
        github_connection_id: str,
        github_username: str,
    ) -> list[GitHubInstallation]:
        """Sync installations for a user from GitHub.

        Checks if the user has installed the app and stores installation info.
        """
        if not self.db:
            raise GitHubAppError("Database session required for sync")

        # Check for user installation
        user_installation = await self.get_installation_by_account(
            "users",
            github_username,
        )

        installations = []

        if user_installation:
            # Upsert user installation
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.installation_id == user_installation["id"]
            )
            result = await self.db.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                existing.account_login = user_installation["account"]["login"]
                existing.repository_selection = user_installation.get(
                    "repository_selection", "selected"
                )
                existing.permissions = user_installation.get("permissions")
                existing.is_active = user_installation.get("suspended_at") is None
                existing.updated_at = datetime.now(timezone.utc)
                installations.append(existing)
            else:
                new_install = GitHubInstallation(
                    id=str(uuid4()),
                    github_connection_id=github_connection_id,
                    installation_id=user_installation["id"],
                    account_id=user_installation["account"]["id"],
                    account_login=user_installation["account"]["login"],
                    account_type=user_installation["account"]["type"],
                    repository_selection=user_installation.get(
                        "repository_selection", "selected"
                    ),
                    permissions=user_installation.get("permissions"),
                    is_active=user_installation.get("suspended_at") is None,
                )
                self.db.add(new_install)
                installations.append(new_install)

        # Also check org installations the user might have access to
        # This is done via the main installations list filtered by user access
        all_installations = await self.get_app_installations()

        for inst in all_installations:
            if inst["account"]["type"] == "Organization":
                # Check if this installation already exists (by installation_id only)
                stmt = select(GitHubInstallation).where(
                    GitHubInstallation.installation_id == inst["id"],
                )
                result = await self.db.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing installation
                    existing.account_login = inst["account"]["login"]
                    existing.repository_selection = inst.get("repository_selection", "selected")
                    existing.permissions = inst.get("permissions")
                    existing.is_active = inst.get("suspended_at") is None
                    existing.updated_at = datetime.now(timezone.utc)
                    installations.append(existing)
                else:
                    new_install = GitHubInstallation(
                        id=str(uuid4()),
                        github_connection_id=github_connection_id,
                        installation_id=inst["id"],
                        account_id=inst["account"]["id"],
                        account_login=inst["account"]["login"],
                        account_type=inst["account"]["type"],
                        repository_selection=inst.get("repository_selection", "selected"),
                        permissions=inst.get("permissions"),
                        is_active=inst.get("suspended_at") is None,
                    )
                    self.db.add(new_install)
                    installations.append(new_install)

        await self.db.flush()
        return installations

    async def get_user_installations(
        self,
        developer_id: str,
    ) -> list[GitHubInstallation]:
        """Get all installations for a developer."""
        if not self.db:
            raise GitHubAppError("Database session required")

        stmt = (
            select(GitHubInstallation)
            .join(GitHubConnection)
            .where(GitHubConnection.developer_id == developer_id)
            .where(GitHubInstallation.is_active == True)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_installation_token_for_developer(
        self,
        developer_id: str,
        account_login: str | None = None,
    ) -> tuple[str, int] | None:
        """Get an installation access token for a developer.

        If account_login is provided, gets token for that specific installation.
        Otherwise, returns the first available installation token.

        Returns (token, installation_id) or None if no installation found.
        """
        if not self.db:
            raise GitHubAppError("Database session required")

        stmt = (
            select(GitHubInstallation)
            .join(GitHubConnection)
            .where(GitHubConnection.developer_id == developer_id)
            .where(GitHubInstallation.is_active == True)
        )

        if account_login:
            stmt = stmt.where(GitHubInstallation.account_login == account_login)

        result = await self.db.execute(stmt)
        installation = result.scalar_one_or_none()

        if not installation:
            return None

        token, _ = await self.get_installation_access_token(installation.installation_id)
        return token, installation.installation_id

    def get_app_install_url(self, state: str | None = None) -> str:
        """Get the URL to install the GitHub App."""
        if settings.github_app_install_url:
            url = settings.github_app_install_url
            if state:
                url += f"?state={state}"
            return url

        # Fallback: construct from app ID
        # Note: This requires knowing the app's slug/name
        raise GitHubAppError(
            "GITHUB_APP_INSTALL_URL must be configured. "
            "Set it to https://github.com/apps/YOUR-APP-NAME/installations/new"
        )

    async def handle_installation_webhook(
        self,
        action: str,
        installation_data: dict[str, Any],
        sender: dict[str, Any],
    ) -> None:
        """Handle GitHub App installation webhooks.

        Actions: created, deleted, suspend, unsuspend, new_permissions_accepted
        """
        if not self.db:
            raise GitHubAppError("Database session required")

        installation_id = installation_data["id"]
        account = installation_data["account"]

        if action == "deleted":
            # Remove installation
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
            result = await self.db.execute(stmt)
            installation = result.scalar_one_or_none()
            if installation:
                await self.db.delete(installation)

        elif action == "suspend":
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
            result = await self.db.execute(stmt)
            installation = result.scalar_one_or_none()
            if installation:
                installation.is_active = False
                installation.suspended_at = datetime.now(timezone.utc)

        elif action == "unsuspend":
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
            result = await self.db.execute(stmt)
            installation = result.scalar_one_or_none()
            if installation:
                installation.is_active = True
                installation.suspended_at = None

        await self.db.commit()
