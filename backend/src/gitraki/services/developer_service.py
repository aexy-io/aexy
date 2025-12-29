"""Developer profile service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gitraki.models.developer import Developer, GitHubConnection
from gitraki.schemas.developer import DeveloperCreate, DeveloperUpdate


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
            .options(selectinload(Developer.github_connection))
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
            .options(selectinload(Developer.github_connection))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_github_id(self, github_id: int) -> Developer | None:
        """Get developer by GitHub ID."""
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_id == github_id)
            .options(selectinload(Developer.github_connection))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_github_username(self, username: str) -> Developer | None:
        """Get developer by GitHub username."""
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_username == username)
            .options(selectinload(Developer.github_connection))
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
            .options(selectinload(Developer.github_connection))
            .offset(skip)
            .limit(limit)
            .order_by(Developer.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
