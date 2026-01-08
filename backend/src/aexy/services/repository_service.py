"""Repository and organization management service."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.developer import Developer, GitHubConnection, GitHubInstallation
from aexy.models.repository import (
    DeveloperOrganization,
    DeveloperRepository,
    Organization,
    Repository,
)
from aexy.services.github_service import GitHubService
from aexy.services.github_app_service import GitHubAppService, GitHubAppError


class RepositoryService:
    """Service for managing repository and organization selection."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_repository_by_id(self, repository_id: str) -> Repository | None:
        """Get a repository by its ID."""
        stmt = select(Repository).where(Repository.id == repository_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def sync_user_repos_and_orgs(
        self,
        developer_id: str,
        access_token: str,
    ) -> dict[str, Any]:
        """
        Fetch and store all repos/orgs a user has access to from GitHub.

        Returns summary of synced data.
        """
        import logging
        logger = logging.getLogger(__name__)

        async with GitHubService(access_token=access_token) as gh:
            # Fetch all orgs
            github_orgs = await gh.get_all_user_orgs()
            logger.info(f"Fetched {len(github_orgs)} organizations from GitHub")

            # Fetch all personal repos
            github_repos = await gh.get_all_user_repos()
            logger.info(f"Fetched {len(github_repos)} personal repos from GitHub")

            # Fetch repos for each org
            org_repos: dict[str, list[dict]] = {}
            for org_data in github_orgs:
                org_login = org_data["login"]
                org_repos[org_login] = await gh.get_all_org_repos(org_login)

        # Upsert organizations
        orgs_created = 0
        orgs_updated = 0
        for org_data in github_orgs:
            org = await self._upsert_organization(org_data)
            if org:
                orgs_created += 1
            else:
                orgs_updated += 1

            # Create developer-org relationship
            await self._ensure_developer_organization(developer_id, org_data["id"])

        # Upsert personal repos (no org)
        repos_created = 0
        repos_updated = 0
        for repo_data in github_repos:
            if repo_data["owner"]["type"] == "User":
                repo = await self._upsert_repository(repo_data, None)
                if repo:
                    repos_created += 1
                else:
                    repos_updated += 1

                # Create developer-repo relationship
                await self._ensure_developer_repository(developer_id, repo_data["id"])

        # Upsert org repos
        for org_login, repos in org_repos.items():
            # Get org from DB
            stmt = select(Organization).where(Organization.login == org_login)
            result = await self.db.execute(stmt)
            org = result.scalar_one_or_none()

            if org:
                for repo_data in repos:
                    repo = await self._upsert_repository(repo_data, org.id)
                    if repo:
                        repos_created += 1
                    else:
                        repos_updated += 1

                    await self._ensure_developer_repository(developer_id, repo_data["id"])

        await self.db.commit()

        return {
            "organizations": {"created": orgs_created, "updated": orgs_updated},
            "repositories": {"created": repos_created, "updated": repos_updated},
        }

    async def _upsert_organization(self, org_data: dict) -> Organization | None:
        """Create or update an organization. Returns org if created, None if updated."""
        stmt = select(Organization).where(Organization.github_id == org_data["id"])
        result = await self.db.execute(stmt)
        org = result.scalar_one_or_none()

        if org:
            # Update existing
            org.login = org_data["login"]
            org.name = org_data.get("name") or org_data["login"]
            org.avatar_url = org_data.get("avatar_url")
            org.description = org_data.get("description")
            org.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
            return None
        else:
            # Create new
            org = Organization(
                id=str(uuid4()),
                github_id=org_data["id"],
                login=org_data["login"],
                name=org_data.get("name") or org_data["login"],
                avatar_url=org_data.get("avatar_url"),
                description=org_data.get("description"),
            )
            self.db.add(org)
            await self.db.flush()
            return org

    async def _upsert_repository(
        self,
        repo_data: dict,
        organization_id: str | None,
    ) -> Repository | None:
        """Create or update a repository. Returns repo if created, None if updated."""
        stmt = select(Repository).where(Repository.github_id == repo_data["id"])
        result = await self.db.execute(stmt)
        repo = result.scalar_one_or_none()

        if repo:
            # Update existing
            repo.full_name = repo_data["full_name"]
            repo.name = repo_data["name"]
            repo.owner_login = repo_data["owner"]["login"]
            repo.owner_type = repo_data["owner"]["type"]
            repo.description = repo_data.get("description")
            repo.is_private = repo_data.get("private", False)
            repo.is_fork = repo_data.get("fork", False)
            repo.is_archived = repo_data.get("archived", False)
            repo.default_branch = repo_data.get("default_branch", "main")
            repo.language = repo_data.get("language")
            repo.organization_id = organization_id
            repo.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
            return None
        else:
            # Create new
            repo = Repository(
                id=str(uuid4()),
                github_id=repo_data["id"],
                organization_id=organization_id,
                full_name=repo_data["full_name"],
                name=repo_data["name"],
                owner_login=repo_data["owner"]["login"],
                owner_type=repo_data["owner"]["type"],
                description=repo_data.get("description"),
                is_private=repo_data.get("private", False),
                is_fork=repo_data.get("fork", False),
                is_archived=repo_data.get("archived", False),
                default_branch=repo_data.get("default_branch", "main"),
                language=repo_data.get("language"),
            )
            self.db.add(repo)
            await self.db.flush()
            return repo

    async def _ensure_developer_organization(
        self,
        developer_id: str,
        github_org_id: int,
    ) -> DeveloperOrganization:
        """Ensure a developer-organization relationship exists."""
        # Get org by github_id
        stmt = select(Organization).where(Organization.github_id == github_org_id)
        result = await self.db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            raise ValueError(f"Organization with github_id {github_org_id} not found")

        # Check if relationship exists
        stmt = select(DeveloperOrganization).where(
            DeveloperOrganization.developer_id == developer_id,
            DeveloperOrganization.organization_id == org.id,
        )
        result = await self.db.execute(stmt)
        dev_org = result.scalar_one_or_none()

        if not dev_org:
            dev_org = DeveloperOrganization(
                id=str(uuid4()),
                developer_id=developer_id,
                organization_id=org.id,
                is_enabled=False,
            )
            self.db.add(dev_org)
            await self.db.flush()

        return dev_org

    async def _ensure_developer_repository(
        self,
        developer_id: str,
        github_repo_id: int,
    ) -> DeveloperRepository:
        """Ensure a developer-repository relationship exists."""
        # Get repo by github_id
        stmt = select(Repository).where(Repository.github_id == github_repo_id)
        result = await self.db.execute(stmt)
        repo = result.scalar_one_or_none()

        if not repo:
            raise ValueError(f"Repository with github_id {github_repo_id} not found")

        # Check if relationship exists
        stmt = select(DeveloperRepository).where(
            DeveloperRepository.developer_id == developer_id,
            DeveloperRepository.repository_id == repo.id,
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            dev_repo = DeveloperRepository(
                id=str(uuid4()),
                developer_id=developer_id,
                repository_id=repo.id,
                is_enabled=False,
                sync_status="pending",
                webhook_status="none",
            )
            self.db.add(dev_repo)
            await self.db.flush()

        return dev_repo

    async def get_user_organizations(
        self,
        developer_id: str,
    ) -> list[dict[str, Any]]:
        """Get organizations for a developer with repository counts."""
        stmt = (
            select(DeveloperOrganization)
            .where(DeveloperOrganization.developer_id == developer_id)
            .options(selectinload(DeveloperOrganization.organization))
        )
        result = await self.db.execute(stmt)
        dev_orgs = result.scalars().all()

        orgs = []
        for dev_org in dev_orgs:
            org = dev_org.organization

            # Count repos in org
            stmt = select(Repository).where(Repository.organization_id == org.id)
            result = await self.db.execute(stmt)
            total_repos = len(result.scalars().all())

            # Count enabled repos
            stmt = (
                select(DeveloperRepository)
                .join(Repository)
                .where(
                    Repository.organization_id == org.id,
                    DeveloperRepository.developer_id == developer_id,
                    DeveloperRepository.is_enabled == True,
                )
            )
            result = await self.db.execute(stmt)
            enabled_repos = len(result.scalars().all())

            orgs.append({
                "id": org.id,
                "github_id": org.github_id,
                "login": org.login,
                "name": org.name,
                "avatar_url": org.avatar_url,
                "is_enabled": dev_org.is_enabled,
                "repository_count": total_repos,
                "enabled_repository_count": enabled_repos,
            })

        return orgs

    async def get_repositories(
        self,
        developer_id: str,
        organization_id: str | None = None,
        enabled_only: bool = False,
    ) -> list[dict[str, Any]]:
        """Get repositories for a developer."""
        stmt = (
            select(DeveloperRepository)
            .where(DeveloperRepository.developer_id == developer_id)
            .options(selectinload(DeveloperRepository.repository))
        )

        if enabled_only:
            stmt = stmt.where(DeveloperRepository.is_enabled == True)

        result = await self.db.execute(stmt)
        dev_repos = result.scalars().all()

        repos = []
        for dev_repo in dev_repos:
            repo = dev_repo.repository

            # Filter by org if specified
            if organization_id is not None:
                if repo.organization_id != organization_id:
                    continue
            elif organization_id == "":
                # Empty string means personal repos only
                if repo.organization_id is not None:
                    continue

            repos.append({
                "id": repo.id,
                "github_id": repo.github_id,
                "full_name": repo.full_name,
                "name": repo.name,
                "owner_login": repo.owner_login,
                "owner_type": repo.owner_type,
                "description": repo.description,
                "is_private": repo.is_private,
                "language": repo.language,
                "organization_id": repo.organization_id,
                "is_enabled": dev_repo.is_enabled,
                "sync_status": dev_repo.sync_status,
                "last_sync_at": dev_repo.last_sync_at.isoformat() if dev_repo.last_sync_at else None,
                "commits_synced": dev_repo.commits_synced,
                "prs_synced": dev_repo.prs_synced,
                "reviews_synced": dev_repo.reviews_synced,
                "webhook_status": dev_repo.webhook_status,
            })

        return repos

    async def enable_repository(
        self,
        developer_id: str,
        repository_id: str,
    ) -> DeveloperRepository:
        """Enable a repository for syncing."""
        stmt = select(DeveloperRepository).where(
            DeveloperRepository.developer_id == developer_id,
            DeveloperRepository.repository_id == repository_id,
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            raise ValueError("Repository not found for this developer")

        dev_repo.is_enabled = True
        dev_repo.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(dev_repo)

        return dev_repo

    async def disable_repository(
        self,
        developer_id: str,
        repository_id: str,
    ) -> None:
        """Disable a repository."""
        stmt = select(DeveloperRepository).where(
            DeveloperRepository.developer_id == developer_id,
            DeveloperRepository.repository_id == repository_id,
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            raise ValueError("Repository not found for this developer")

        dev_repo.is_enabled = False
        dev_repo.updated_at = datetime.now(timezone.utc)

        await self.db.commit()

    async def enable_organization(
        self,
        developer_id: str,
        organization_id: str,
    ) -> int:
        """Enable all repositories in an organization. Returns count of repos enabled."""
        # Update org-level toggle
        stmt = select(DeveloperOrganization).where(
            DeveloperOrganization.developer_id == developer_id,
            DeveloperOrganization.organization_id == organization_id,
        )
        result = await self.db.execute(stmt)
        dev_org = result.scalar_one_or_none()

        if not dev_org:
            raise ValueError("Organization not found for this developer")

        dev_org.is_enabled = True
        dev_org.updated_at = datetime.now(timezone.utc)

        # Enable all repos in org
        stmt = (
            select(DeveloperRepository)
            .join(Repository)
            .where(
                Repository.organization_id == organization_id,
                DeveloperRepository.developer_id == developer_id,
            )
        )
        result = await self.db.execute(stmt)
        dev_repos = result.scalars().all()

        count = 0
        for dev_repo in dev_repos:
            if not dev_repo.is_enabled:
                dev_repo.is_enabled = True
                dev_repo.updated_at = datetime.now(timezone.utc)
                count += 1

        await self.db.commit()
        return count

    async def disable_organization(
        self,
        developer_id: str,
        organization_id: str,
    ) -> int:
        """Disable all repositories in an organization. Returns count of repos disabled."""
        # Update org-level toggle
        stmt = select(DeveloperOrganization).where(
            DeveloperOrganization.developer_id == developer_id,
            DeveloperOrganization.organization_id == organization_id,
        )
        result = await self.db.execute(stmt)
        dev_org = result.scalar_one_or_none()

        if not dev_org:
            raise ValueError("Organization not found for this developer")

        dev_org.is_enabled = False
        dev_org.updated_at = datetime.now(timezone.utc)

        # Disable all repos in org
        stmt = (
            select(DeveloperRepository)
            .join(Repository)
            .where(
                Repository.organization_id == organization_id,
                DeveloperRepository.developer_id == developer_id,
            )
        )
        result = await self.db.execute(stmt)
        dev_repos = result.scalars().all()

        count = 0
        for dev_repo in dev_repos:
            if dev_repo.is_enabled:
                dev_repo.is_enabled = False
                dev_repo.updated_at = datetime.now(timezone.utc)
                count += 1

        await self.db.commit()
        return count

    async def get_onboarding_status(self, developer_id: str) -> bool:
        """Check if developer has completed onboarding."""
        stmt = select(Developer).where(Developer.id == developer_id)
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError("Developer not found")

        return developer.has_completed_onboarding

    async def complete_onboarding(self, developer_id: str) -> None:
        """Mark onboarding as complete."""
        stmt = select(Developer).where(Developer.id == developer_id)
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError("Developer not found")

        developer.has_completed_onboarding = True
        developer.updated_at = datetime.now(timezone.utc)

        await self.db.commit()

    async def get_developer_access_token(self, developer_id: str) -> str | None:
        """Get the GitHub access token for a developer."""
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if connection:
            return connection.access_token
        return None

    async def get_github_connection(self, developer_id: str) -> GitHubConnection | None:
        """Get the GitHub connection for a developer."""
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def sync_repos_from_installations(
        self,
        developer_id: str,
    ) -> dict[str, Any]:
        """
        Sync repositories from GitHub App installations.

        Uses installation access tokens to fetch repos the app has access to.
        Returns summary of synced data.
        """
        import logging
        logger = logging.getLogger(__name__)

        app_service = GitHubAppService(self.db)

        # Get user's installations
        installations = await app_service.get_user_installations(developer_id)

        if not installations:
            logger.info("No installations found for developer")
            return {
                "organizations": {"created": 0, "updated": 0},
                "repositories": {"created": 0, "updated": 0},
                "error": "No GitHub App installations found. Please install the app first.",
            }

        repos_created = 0
        repos_updated = 0
        orgs_created = 0
        orgs_updated = 0

        for installation in installations:
            logger.info(f"Fetching repos for installation {installation.installation_id} ({installation.account_login})")

            try:
                # Get repos for this installation
                repos = await app_service.get_installation_repositories(
                    installation.installation_id
                )
                logger.info(f"Found {len(repos)} repositories")

                # Process organization if this is an org installation
                if installation.account_type == "Organization":
                    org_data = {
                        "id": installation.account_id,
                        "login": installation.account_login,
                        "name": installation.account_login,
                        "avatar_url": None,
                        "description": None,
                    }
                    org = await self._upsert_organization(org_data)
                    if org:
                        orgs_created += 1
                    else:
                        orgs_updated += 1

                    await self._ensure_developer_organization(
                        developer_id,
                        installation.account_id,
                    )

                # Process repos
                for repo_data in repos:
                    org_id = None

                    # If repo belongs to an org, get the org ID
                    if repo_data["owner"]["type"] == "Organization":
                        stmt = select(Organization).where(
                            Organization.github_id == repo_data["owner"]["id"]
                        )
                        result = await self.db.execute(stmt)
                        org = result.scalar_one_or_none()
                        if org:
                            org_id = org.id

                    repo = await self._upsert_repository(repo_data, org_id)
                    if repo:
                        repos_created += 1
                    else:
                        repos_updated += 1

                    await self._ensure_developer_repository(
                        developer_id,
                        repo_data["id"],
                    )

            except GitHubAppError as e:
                logger.error(f"Error fetching repos for installation: {e}")
                continue

        await self.db.commit()

        return {
            "organizations": {"created": orgs_created, "updated": orgs_updated},
            "repositories": {"created": repos_created, "updated": repos_updated},
        }
