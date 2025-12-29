"""Unit tests for DeveloperService - TDD approach."""

import pytest

from gitraki.models.developer import Developer, GitHubConnection
from gitraki.schemas.developer import DeveloperCreate, DeveloperUpdate, SkillFingerprint, LanguageSkill
from gitraki.services.developer_service import (
    DeveloperAlreadyExistsError,
    DeveloperNotFoundError,
    DeveloperService,
    DeveloperServiceError,
)


class TestDeveloperCreation:
    """Test developer creation functionality."""

    @pytest.mark.asyncio
    async def test_create_developer(self, db_session):
        """Should create a new developer."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com", name="Test Dev")

        developer = await service.create(data)

        assert developer.id is not None
        assert developer.email == "dev@example.com"
        assert developer.name == "Test Dev"

    @pytest.mark.asyncio
    async def test_create_developer_without_name(self, db_session):
        """Should create developer without name."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com")

        developer = await service.create(data)

        assert developer.email == "dev@example.com"
        assert developer.name is None

    @pytest.mark.asyncio
    async def test_create_duplicate_developer_raises_error(self, db_session):
        """Should raise error when creating duplicate developer."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com", name="Test Dev")

        await service.create(data)

        with pytest.raises(DeveloperAlreadyExistsError):
            await service.create(data)


class TestDeveloperRetrieval:
    """Test developer retrieval functionality."""

    @pytest.mark.asyncio
    async def test_get_by_id(self, db_session):
        """Should retrieve developer by ID."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com", name="Test Dev")
        created = await service.create(data)

        developer = await service.get_by_id(created.id)

        assert developer.id == created.id
        assert developer.email == "dev@example.com"

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self, db_session):
        """Should raise error when developer not found."""
        service = DeveloperService(db_session)

        with pytest.raises(DeveloperNotFoundError):
            await service.get_by_id("nonexistent-id")

    @pytest.mark.asyncio
    async def test_get_by_email(self, db_session):
        """Should retrieve developer by email."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com", name="Test Dev")
        await service.create(data)

        developer = await service.get_by_email("dev@example.com")

        assert developer is not None
        assert developer.email == "dev@example.com"

    @pytest.mark.asyncio
    async def test_get_by_email_not_found(self, db_session):
        """Should return None when email not found."""
        service = DeveloperService(db_session)

        developer = await service.get_by_email("nonexistent@example.com")

        assert developer is None


class TestDeveloperUpdate:
    """Test developer update functionality."""

    @pytest.mark.asyncio
    async def test_update_developer_name(self, db_session):
        """Should update developer name."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com", name="Old Name")
        created = await service.create(data)

        update_data = DeveloperUpdate(name="New Name")
        updated = await service.update(created.id, update_data)

        assert updated.name == "New Name"

    @pytest.mark.asyncio
    async def test_update_skill_fingerprint(self, db_session):
        """Should update developer skill fingerprint."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com")
        created = await service.create(data)

        fingerprint = SkillFingerprint(
            languages=[
                LanguageSkill(
                    name="Python",
                    proficiency_score=85.0,
                    lines_of_code=10000,
                    commits_count=100,
                )
            ]
        )
        update_data = DeveloperUpdate(skill_fingerprint=fingerprint)
        updated = await service.update(created.id, update_data)

        assert updated.skill_fingerprint is not None
        assert updated.skill_fingerprint["languages"][0]["name"] == "Python"

    @pytest.mark.asyncio
    async def test_update_nonexistent_developer(self, db_session):
        """Should raise error when updating nonexistent developer."""
        service = DeveloperService(db_session)
        update_data = DeveloperUpdate(name="New Name")

        with pytest.raises(DeveloperNotFoundError):
            await service.update("nonexistent-id", update_data)


class TestGitHubConnection:
    """Test GitHub connection functionality."""

    @pytest.mark.asyncio
    async def test_connect_github_to_developer(self, db_session):
        """Should connect GitHub account to developer."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com")
        created = await service.create(data)

        connection = await service.connect_github(
            developer_id=created.id,
            github_id=12345,
            github_username="testuser",
            access_token="token123",
            github_name="Test User",
            github_avatar_url="https://github.com/avatar.png",
            scopes=["repo", "read:user"],
        )

        assert connection.github_id == 12345
        assert connection.github_username == "testuser"
        assert connection.developer_id == created.id

    @pytest.mark.asyncio
    async def test_connect_github_updates_avatar(self, db_session):
        """Should update developer avatar when GitHub connected."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com")
        created = await service.create(data)
        assert created.avatar_url is None

        await service.connect_github(
            developer_id=created.id,
            github_id=12345,
            github_username="testuser",
            access_token="token123",
            github_avatar_url="https://github.com/avatar.png",
        )

        # Refresh to get updated data
        developer = await service.get_by_id(created.id)
        assert developer.avatar_url == "https://github.com/avatar.png"

    @pytest.mark.asyncio
    async def test_get_by_github_id(self, db_session):
        """Should retrieve developer by GitHub ID."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com")
        created = await service.create(data)
        await service.connect_github(
            developer_id=created.id,
            github_id=12345,
            github_username="testuser",
            access_token="token123",
        )

        developer = await service.get_by_github_id(12345)

        assert developer is not None
        assert developer.id == created.id

    @pytest.mark.asyncio
    async def test_get_by_github_username(self, db_session):
        """Should retrieve developer by GitHub username."""
        service = DeveloperService(db_session)
        data = DeveloperCreate(email="dev@example.com")
        created = await service.create(data)
        await service.connect_github(
            developer_id=created.id,
            github_id=12345,
            github_username="testuser",
            access_token="token123",
        )

        developer = await service.get_by_github_username("testuser")

        assert developer is not None
        assert developer.id == created.id

    @pytest.mark.asyncio
    async def test_connect_github_already_connected_to_other(self, db_session):
        """Should raise error when GitHub already connected to another developer."""
        service = DeveloperService(db_session)

        # Create first developer and connect GitHub
        dev1 = await service.create(DeveloperCreate(email="dev1@example.com"))
        await service.connect_github(
            developer_id=dev1.id,
            github_id=12345,
            github_username="testuser",
            access_token="token123",
        )

        # Create second developer and try to connect same GitHub
        dev2 = await service.create(DeveloperCreate(email="dev2@example.com"))

        with pytest.raises(DeveloperServiceError):
            await service.connect_github(
                developer_id=dev2.id,
                github_id=12345,
                github_username="testuser",
                access_token="token456",
            )


class TestGetOrCreateByGitHub:
    """Test get_or_create_by_github functionality."""

    @pytest.mark.asyncio
    async def test_creates_new_developer(self, db_session):
        """Should create new developer from GitHub OAuth."""
        service = DeveloperService(db_session)

        developer = await service.get_or_create_by_github(
            github_id=12345,
            github_username="testuser",
            email="dev@example.com",
            access_token="token123",
            github_name="Test User",
            github_avatar_url="https://github.com/avatar.png",
        )

        assert developer.id is not None
        assert developer.email == "dev@example.com"
        assert developer.name == "Test User"
        assert developer.github_connection is not None
        assert developer.github_connection.github_id == 12345

    @pytest.mark.asyncio
    async def test_returns_existing_by_github_id(self, db_session):
        """Should return existing developer if GitHub ID matches."""
        service = DeveloperService(db_session)

        # Create first time
        dev1 = await service.get_or_create_by_github(
            github_id=12345,
            github_username="testuser",
            email="dev@example.com",
            access_token="token123",
        )

        # Get again with same GitHub ID
        dev2 = await service.get_or_create_by_github(
            github_id=12345,
            github_username="testuser",
            email="dev@example.com",
            access_token="newtoken",
        )

        assert dev1.id == dev2.id

    @pytest.mark.asyncio
    async def test_connects_github_to_existing_by_email(self, db_session):
        """Should connect GitHub to existing developer if email matches."""
        service = DeveloperService(db_session)

        # Create developer without GitHub
        existing = await service.create(DeveloperCreate(email="dev@example.com"))

        # OAuth with same email
        developer = await service.get_or_create_by_github(
            github_id=12345,
            github_username="testuser",
            email="dev@example.com",
            access_token="token123",
        )

        assert developer.id == existing.id
        assert developer.github_connection is not None

    @pytest.mark.asyncio
    async def test_updates_token_on_re_auth(self, db_session):
        """Should update access token on re-authentication."""
        service = DeveloperService(db_session)

        # First auth
        await service.get_or_create_by_github(
            github_id=12345,
            github_username="testuser",
            email="dev@example.com",
            access_token="old_token",
        )

        # Re-auth with new token
        developer = await service.get_or_create_by_github(
            github_id=12345,
            github_username="testuser",
            email="dev@example.com",
            access_token="new_token",
        )

        assert developer.github_connection.access_token == "new_token"


class TestListDevelopers:
    """Test listing developers."""

    @pytest.mark.asyncio
    async def test_list_all_developers(self, db_session):
        """Should list all developers."""
        service = DeveloperService(db_session)
        await service.create(DeveloperCreate(email="dev1@example.com"))
        await service.create(DeveloperCreate(email="dev2@example.com"))
        await service.create(DeveloperCreate(email="dev3@example.com"))

        developers = await service.list_all()

        assert len(developers) == 3

    @pytest.mark.asyncio
    async def test_list_with_pagination(self, db_session):
        """Should support pagination."""
        service = DeveloperService(db_session)
        for i in range(10):
            await service.create(DeveloperCreate(email=f"dev{i}@example.com"))

        page1 = await service.list_all(skip=0, limit=5)
        page2 = await service.list_all(skip=5, limit=5)

        assert len(page1) == 5
        assert len(page2) == 5
        # Should be different developers
        page1_ids = {d.id for d in page1}
        page2_ids = {d.id for d in page2}
        assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.asyncio
    async def test_list_empty(self, db_session):
        """Should return empty list when no developers."""
        service = DeveloperService(db_session)

        developers = await service.list_all()

        assert developers == []
