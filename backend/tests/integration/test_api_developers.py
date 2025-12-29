"""Integration tests for developer API endpoints."""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from gitraki.core.config import get_settings
from gitraki.schemas.developer import DeveloperCreate
from gitraki.services.developer_service import DeveloperService

settings = get_settings()


def create_test_token(developer_id: str) -> str:
    """Create a test JWT token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    to_encode = {
        "sub": developer_id,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


class TestDeveloperMeEndpoint:
    """Test /developers/me endpoint."""

    @pytest.mark.asyncio
    async def test_get_me_authenticated(self, client, db_session):
        """Should return current developer profile when authenticated."""
        # Create a developer
        service = DeveloperService(db_session)
        developer = await service.create(
            DeveloperCreate(email="test@example.com", name="Test User")
        )
        await db_session.commit()

        token = create_test_token(developer.id)

        response = await client.get(
            "/api/v1/developers/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"

    @pytest.mark.asyncio
    async def test_get_me_unauthenticated(self, client):
        """Should return 403 when not authenticated."""
        response = await client.get("/api/v1/developers/me")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_get_me_invalid_token(self, client):
        """Should return 401 with invalid token."""
        response = await client.get(
            "/api/v1/developers/me",
            headers={"Authorization": "Bearer invalid_token"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_not_found(self, client):
        """Should return 404 when developer not in database."""
        token = create_test_token("nonexistent-id")

        response = await client.get(
            "/api/v1/developers/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404


class TestUpdateMeEndpoint:
    """Test PATCH /developers/me endpoint."""

    @pytest.mark.asyncio
    async def test_update_name(self, client, db_session):
        """Should update developer name."""
        service = DeveloperService(db_session)
        developer = await service.create(
            DeveloperCreate(email="test@example.com", name="Old Name")
        )
        await db_session.commit()

        token = create_test_token(developer.id)

        response = await client.patch(
            "/api/v1/developers/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "New Name"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"

    @pytest.mark.asyncio
    async def test_update_skill_fingerprint(self, client, db_session):
        """Should update skill fingerprint."""
        service = DeveloperService(db_session)
        developer = await service.create(DeveloperCreate(email="test@example.com"))
        await db_session.commit()

        token = create_test_token(developer.id)

        response = await client.patch(
            "/api/v1/developers/me",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "skill_fingerprint": {
                    "languages": [
                        {
                            "name": "Python",
                            "proficiency_score": 85,
                            "lines_of_code": 10000,
                            "commits_count": 100,
                            "trend": "growing",
                        }
                    ],
                    "frameworks": [],
                    "domains": [],
                    "tools": ["Git", "Docker"],
                }
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["skill_fingerprint"]["languages"][0]["name"] == "Python"
        assert data["skill_fingerprint"]["tools"] == ["Git", "Docker"]


class TestGetDeveloperEndpoint:
    """Test GET /developers/{id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_developer_by_id(self, client, db_session):
        """Should return developer by ID."""
        service = DeveloperService(db_session)
        auth_dev = await service.create(DeveloperCreate(email="auth@example.com"))
        target_dev = await service.create(
            DeveloperCreate(email="target@example.com", name="Target Dev")
        )
        await db_session.commit()

        token = create_test_token(auth_dev.id)

        response = await client.get(
            f"/api/v1/developers/{target_dev.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "target@example.com"
        assert data["name"] == "Target Dev"

    @pytest.mark.asyncio
    async def test_get_developer_not_found(self, client, db_session):
        """Should return 404 for nonexistent developer."""
        service = DeveloperService(db_session)
        auth_dev = await service.create(DeveloperCreate(email="auth@example.com"))
        await db_session.commit()

        token = create_test_token(auth_dev.id)

        response = await client.get(
            "/api/v1/developers/nonexistent-id",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404


class TestListDevelopersEndpoint:
    """Test GET /developers endpoint."""

    @pytest.mark.asyncio
    async def test_list_developers(self, client, db_session):
        """Should list all developers."""
        service = DeveloperService(db_session)
        auth_dev = await service.create(DeveloperCreate(email="auth@example.com"))
        await service.create(DeveloperCreate(email="dev1@example.com"))
        await service.create(DeveloperCreate(email="dev2@example.com"))
        await db_session.commit()

        token = create_test_token(auth_dev.id)

        response = await client.get(
            "/api/v1/developers/",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_list_developers_pagination(self, client, db_session):
        """Should support pagination."""
        service = DeveloperService(db_session)
        auth_dev = await service.create(DeveloperCreate(email="auth@example.com"))
        for i in range(10):
            await service.create(DeveloperCreate(email=f"dev{i}@example.com"))
        await db_session.commit()

        token = create_test_token(auth_dev.id)

        response = await client.get(
            "/api/v1/developers/?skip=0&limit=5",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5

    @pytest.mark.asyncio
    async def test_list_developers_unauthenticated(self, client):
        """Should require authentication."""
        response = await client.get("/api/v1/developers/")

        assert response.status_code == 403
