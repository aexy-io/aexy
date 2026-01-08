"""Developer profile service."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.developer import Developer, GitHubConnection, GoogleConnection
from aexy.schemas.developer import DeveloperCreate, DeveloperUpdate


class DeveloperServiceError(Exception):
    """Base exception for developer service errors."""

    pass


class DeveloperNotFoundError(DeveloperServiceError):
    """Developer not found error."""

    pass


class DeveloperAlreadyExistsError(DeveloperServiceError):
    """Developer already exists error."""

    pass


class DeveloperService:
    """Service for managing developer profiles."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize developer service."""
        self.db = db

    async def get_by_id(self, developer_id: str) -> Developer:
        """Get developer by ID."""
        stmt = (
            select(Developer)
            .where(Developer.id == developer_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
            )
        )
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise DeveloperNotFoundError(f"Developer with ID {developer_id} not found")

        return developer

    async def get_by_email(self, email: str) -> Developer | None:
        """Get developer by email."""
        stmt = (
            select(Developer)
            .where(Developer.email == email)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_github_id(self, github_id: int) -> Developer | None:
        """Get developer by GitHub ID."""
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_id == github_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_github_username(self, username: str) -> Developer | None:
        """Get developer by GitHub username."""
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_username == username)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_google_id(self, google_id: str) -> Developer | None:
        """Get developer by Google ID."""
        stmt = (
            select(Developer)
            .join(GoogleConnection)
            .where(GoogleConnection.google_id == google_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, data: DeveloperCreate) -> Developer:
        """Create a new developer."""
        existing = await self.get_by_email(data.email)
        if existing:
            raise DeveloperAlreadyExistsError(f"Developer with email {data.email} already exists")

        developer = Developer(
            email=data.email,
            name=data.name,
        )
        self.db.add(developer)
        await self.db.flush()
        await self.db.refresh(developer)
        return developer

    async def update(self, developer_id: str, data: DeveloperUpdate) -> Developer:
        """Update a developer profile."""
        developer = await self.get_by_id(developer_id)

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                if hasattr(value, "model_dump"):
                    setattr(developer, field, value.model_dump())
                else:
                    setattr(developer, field, value)

        await self.db.flush()
        await self.db.refresh(developer)
        return developer

    async def connect_github(
        self,
        developer_id: str,
        github_id: int,
        github_username: str,
        access_token: str,
        github_name: str | None = None,
        github_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> GitHubConnection:
        """Connect a GitHub account to a developer."""
        developer = await self.get_by_id(developer_id)

        # Check if GitHub account is already connected to another developer
        existing = await self.get_by_github_id(github_id)
        if existing and existing.id != developer_id:
            raise DeveloperServiceError(
                f"GitHub account {github_username} is already connected to another developer"
            )

        connection = GitHubConnection(
            developer_id=developer.id,
            github_id=github_id,
            github_username=github_username,
            github_name=github_name,
            github_avatar_url=github_avatar_url,
            access_token=access_token,
            scopes=scopes,
        )
        self.db.add(connection)
        await self.db.flush()

        # Update developer avatar if not set
        if not developer.avatar_url and github_avatar_url:
            developer.avatar_url = github_avatar_url
            await self.db.flush()

        await self.db.refresh(connection)
        return connection

    async def get_or_create_by_github(
        self,
        github_id: int,
        github_username: str,
        email: str,
        access_token: str,
        github_name: str | None = None,
        github_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> Developer:
        """Get or create developer from GitHub OAuth."""
        # Try to find by GitHub ID first
        developer = await self.get_by_github_id(github_id)
        if developer:
            # Update access token
            if developer.github_connection:
                developer.github_connection.access_token = access_token
                if scopes:
                    developer.github_connection.scopes = scopes
                await self.db.flush()
            return developer

        # Try to find by email
        developer = await self.get_by_email(email)
        if developer:
            # Connect GitHub to existing developer
            await self.connect_github(
                developer_id=developer.id,
                github_id=github_id,
                github_username=github_username,
                access_token=access_token,
                github_name=github_name,
                github_avatar_url=github_avatar_url,
                scopes=scopes,
            )
            await self.db.refresh(developer)
            return developer

        # Create new developer
        developer = Developer(
            email=email,
            name=github_name,
            avatar_url=github_avatar_url,
        )
        self.db.add(developer)
        await self.db.flush()

        # Connect GitHub
        await self.connect_github(
            developer_id=developer.id,
            github_id=github_id,
            github_username=github_username,
            access_token=access_token,
            github_name=github_name,
            github_avatar_url=github_avatar_url,
            scopes=scopes,
        )

        await self.db.refresh(developer, ["github_connection"])
        return developer

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[Developer]:
        """List all developers with pagination."""
        stmt = (
            select(Developer)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
            )
            .offset(skip)
            .limit(limit)
            .order_by(Developer.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def connect_google(
        self,
        developer_id: str,
        google_id: str,
        google_email: str,
        access_token: str,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
        google_name: str | None = None,
        google_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> GoogleConnection:
        """Connect a Google account to a developer."""
        developer = await self.get_by_id(developer_id)

        # Check if Google account is already connected to another developer
        existing = await self.get_by_google_id(google_id)
        if existing and existing.id != developer_id:
            raise DeveloperServiceError(
                f"Google account {google_email} is already connected to another developer"
            )

        # Check if developer already has a Google connection
        if developer.google_connection:
            # Update tokens only if new scopes include CRM scopes or existing has none
            existing_scopes = set(developer.google_connection.scopes or [])
            new_scopes = set(scopes or [])

            # CRM-specific scopes that we want to preserve
            crm_scopes = {
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/calendar",
            }

            existing_has_crm = bool(existing_scopes & crm_scopes)
            new_has_crm = bool(new_scopes & crm_scopes)

            # Only update tokens if:
            # 1. New login has CRM scopes (broader permission), OR
            # 2. Existing doesn't have CRM scopes (nothing to preserve)
            if new_has_crm or not existing_has_crm:
                developer.google_connection.access_token = access_token
                if refresh_token:
                    developer.google_connection.refresh_token = refresh_token
                if token_expires_at:
                    developer.google_connection.token_expires_at = token_expires_at

            # Always merge scope lists
            if scopes:
                developer.google_connection.scopes = list(existing_scopes | new_scopes)

            await self.db.flush()
            await self.db.refresh(developer.google_connection)
            return developer.google_connection

        connection = GoogleConnection(
            developer_id=developer.id,
            google_id=google_id,
            google_email=google_email,
            google_name=google_name,
            google_avatar_url=google_avatar_url,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            scopes=scopes,
        )
        self.db.add(connection)
        await self.db.flush()

        # Update developer avatar if not set
        if not developer.avatar_url and google_avatar_url:
            developer.avatar_url = google_avatar_url
            await self.db.flush()

        await self.db.refresh(connection)
        return connection

    async def get_or_create_by_google(
        self,
        google_id: str,
        google_email: str,
        access_token: str,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
        google_name: str | None = None,
        google_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> Developer:
        """Get or create developer from Google OAuth."""
        # Try to find by Google ID first
        developer = await self.get_by_google_id(google_id)
        if developer:
            # Update tokens only if new scopes include CRM scopes or existing has none
            if developer.google_connection:
                existing_scopes = set(developer.google_connection.scopes or [])
                new_scopes = set(scopes or [])

                # CRM-specific scopes that we want to preserve
                crm_scopes = {
                    "https://www.googleapis.com/auth/gmail.readonly",
                    "https://www.googleapis.com/auth/calendar",
                }

                existing_has_crm = bool(existing_scopes & crm_scopes)
                new_has_crm = bool(new_scopes & crm_scopes)

                # Only update tokens if:
                # 1. New login has CRM scopes (broader permission), OR
                # 2. Existing doesn't have CRM scopes (nothing to preserve)
                if new_has_crm or not existing_has_crm:
                    developer.google_connection.access_token = access_token
                    if refresh_token:
                        developer.google_connection.refresh_token = refresh_token
                    if token_expires_at:
                        developer.google_connection.token_expires_at = token_expires_at

                # Always merge scope lists
                if scopes:
                    developer.google_connection.scopes = list(existing_scopes | new_scopes)

                await self.db.flush()
            return developer

        # Try to find by email
        developer = await self.get_by_email(google_email)
        if developer:
            # Connect Google to existing developer
            await self.connect_google(
                developer_id=developer.id,
                google_id=google_id,
                google_email=google_email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                google_name=google_name,
                google_avatar_url=google_avatar_url,
                scopes=scopes,
            )
            await self.db.refresh(developer)
            return developer

        # Create new developer
        developer = Developer(
            email=google_email,
            name=google_name,
            avatar_url=google_avatar_url,
        )
        self.db.add(developer)
        await self.db.flush()

        # Connect Google
        await self.connect_google(
            developer_id=developer.id,
            google_id=google_id,
            google_email=google_email,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            google_name=google_name,
            google_avatar_url=google_avatar_url,
            scopes=scopes,
        )

        await self.db.refresh(developer, ["google_connection"])
        return developer
