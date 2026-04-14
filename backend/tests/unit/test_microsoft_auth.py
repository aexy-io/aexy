"""Tests for Microsoft (Entra ID) OAuth login + CRM connect flow.

Runs against the real Postgres database (aexy-postgres container) because
the `plans.llm_provider_access` column is a PostgreSQL ARRAY that SQLite
can't compile. Each test runs inside a transaction that is rolled back on
teardown, so the shared dev database stays clean.

Covers:
1. DeveloperService.get_or_create_by_microsoft — new user, existing
   user found by microsoft_id, existing user found by email (attach),
   scope merging on re-login (CRM scopes preserved).
2. API endpoints — scope selection, state handling, error paths.
"""

import json
import os
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from aexy.core.database import get_db
from aexy.main import app
from aexy.models.developer import Developer, MicrosoftConnection
from aexy.services.developer_service import DeveloperService, DeveloperServiceError


# Default to the dev container's postgres; override via env for CI.
TEST_PG_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@postgres:5432/aexy",
)


# Override the shared SQLite fixtures from conftest.py for this file only.
# Use the real Postgres dev DB because `plans.llm_provider_access` is an
# ARRAY that SQLite cannot compile. Every test uses `_uniq(...)` IDs so
# re-runs never collide; residual rows in the dev DB are harmless and
# are easy to spot (microsoft_id prefix is `aad-...`).
@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    # Per-test engine: pytest-asyncio gives each test its own event loop,
    # and asyncpg connections are bound to the loop they were created on,
    # so reusing a module-level engine causes cross-loop errors on the
    # second test. NullPool avoids keeping pooled connections alive.
    engine = create_async_engine(TEST_PG_URL, poolclass=NullPool)
    session_maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False,
    )
    async with session_maker() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# Unique-suffix helper so re-runs against the shared DB don't collide.
def _uniq(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture
async def service(db_session):
    return DeveloperService(db_session)


class TestGetOrCreateByMicrosoft:
    @pytest.mark.asyncio
    async def test_creates_new_developer_when_none_exists(self, service, db_session):
        mid, email = _uniq("aad-new"), f"{_uniq('alice')}@contoso.com"
        dev = await service.get_or_create_by_microsoft(
            microsoft_id=mid,
            microsoft_email=email,
            access_token="at-1",
            refresh_token="rt-1",
            token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            microsoft_name="Alice Example",
            scopes=["openid", "profile", "email", "User.Read", "offline_access"],
        )
        await db_session.commit()

        assert dev.email == email
        assert dev.name == "Alice Example"
        assert dev.microsoft_connection is not None
        assert dev.microsoft_connection.microsoft_id == mid
        assert dev.microsoft_connection.access_token == "at-1"
        assert dev.microsoft_connection.refresh_token == "rt-1"
        assert "User.Read" in dev.microsoft_connection.scopes

    @pytest.mark.asyncio
    async def test_returns_existing_developer_by_microsoft_id(self, service, db_session):
        mid, email = _uniq("aad-re"), f"{_uniq('bob')}@contoso.com"
        first = await service.get_or_create_by_microsoft(
            microsoft_id=mid, microsoft_email=email, access_token="at-1",
        )
        await db_session.commit()

        second = await service.get_or_create_by_microsoft(
            microsoft_id=mid, microsoft_email=email, access_token="at-2",
        )
        await db_session.commit()

        assert first.id == second.id
        assert second.microsoft_connection.access_token == "at-2"

    @pytest.mark.asyncio
    async def test_profile_fields_sync_on_relogin(self, service, db_session):
        """Name and email updates in Microsoft should propagate on re-login."""
        mid = _uniq("aad-sync")
        await service.get_or_create_by_microsoft(
            microsoft_id=mid,
            microsoft_email=f"old-{mid}@contoso.com",
            microsoft_name="Old Name",
            access_token="at-1",
        )
        await db_session.commit()

        new_email = f"new-{mid}@contoso.com"
        dev = await service.get_or_create_by_microsoft(
            microsoft_id=mid,
            microsoft_email=new_email,
            microsoft_name="New Name",
            access_token="at-2",
        )
        await db_session.commit()

        assert dev.microsoft_connection.microsoft_email == new_email
        assert dev.microsoft_connection.microsoft_name == "New Name"

    @pytest.mark.asyncio
    async def test_attaches_to_existing_developer_with_matching_email(
        self, service, db_session
    ):
        email = f"{_uniq('carol')}@contoso.com"
        existing = Developer(email=email, name="Carol")
        db_session.add(existing)
        await db_session.commit()
        await db_session.refresh(existing)

        dev = await service.get_or_create_by_microsoft(
            microsoft_id=_uniq("aad-attach"),
            microsoft_email=email,
            access_token="at-1",
            scopes=["User.Read"],
        )
        await db_session.commit()

        assert dev.id == existing.id
        assert dev.microsoft_connection is not None

    @pytest.mark.asyncio
    async def test_scope_merge_preserves_crm_scopes_on_plain_relogin(
        self, service, db_session
    ):
        mid, email = _uniq("aad-merge"), f"{_uniq('dave')}@contoso.com"
        await service.get_or_create_by_microsoft(
            microsoft_id=mid,
            microsoft_email=email,
            access_token="crm-token",
            refresh_token="crm-refresh",
            scopes=[
                "openid", "profile", "email", "User.Read", "offline_access",
                "Mail.Read", "Mail.Send", "Calendars.ReadWrite",
            ],
        )
        await db_session.commit()

        dev = await service.get_or_create_by_microsoft(
            microsoft_id=mid,
            microsoft_email=email,
            access_token="basic-token",
            refresh_token="basic-refresh",
            scopes=["openid", "profile", "email", "User.Read", "offline_access"],
        )
        await db_session.commit()

        scopes = set(dev.microsoft_connection.scopes)
        assert "Mail.Read" in scopes
        assert "Calendars.ReadWrite" in scopes
        # Broader CRM token must not be overwritten by a narrower basic login
        assert dev.microsoft_connection.access_token == "crm-token"

    @pytest.mark.asyncio
    async def test_scope_upgrade_to_crm_updates_token(self, service, db_session):
        mid, email = _uniq("aad-up"), f"{_uniq('eve')}@contoso.com"
        await service.get_or_create_by_microsoft(
            microsoft_id=mid, microsoft_email=email,
            access_token="basic-token", scopes=["openid", "User.Read"],
        )
        await db_session.commit()

        dev = await service.get_or_create_by_microsoft(
            microsoft_id=mid, microsoft_email=email,
            access_token="crm-token",
            scopes=["openid", "User.Read", "Mail.Read", "Calendars.ReadWrite"],
        )
        await db_session.commit()

        assert dev.microsoft_connection.access_token == "crm-token"
        assert "Mail.Read" in dev.microsoft_connection.scopes


class TestConnectMicrosoft:
    @pytest.mark.asyncio
    async def test_rejects_linking_account_already_bound_to_another_developer(
        self, service, db_session
    ):
        shared_mid = _uniq("aad-shared")
        # Developer A signs in with Microsoft
        await service.get_or_create_by_microsoft(
            microsoft_id=shared_mid,
            microsoft_email=f"{_uniq('shared')}@contoso.com",
            access_token="at",
        )
        await db_session.commit()

        # Separate developer B (different email, no Microsoft yet)
        dev_b = Developer(email=f"{_uniq('bruce')}@contoso.com", name="Bruce")
        db_session.add(dev_b)
        await db_session.commit()
        await db_session.refresh(dev_b)

        # Cannot reattach A's Microsoft identity onto developer B
        with pytest.raises(DeveloperServiceError, match="already connected"):
            await service.connect_microsoft(
                developer_id=dev_b.id,
                microsoft_id=shared_mid,
                microsoft_email=f"{_uniq('any')}@contoso.com",
                access_token="at-other",
            )


class TestGetByMicrosoftId:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_connection(self, service):
        assert await service.get_by_microsoft_id("nonexistent") is None

    @pytest.mark.asyncio
    async def test_returns_developer_when_microsoft_id_exists(
        self, service, db_session
    ):
        mid, email = _uniq("aad-lookup"), f"{_uniq('frank')}@contoso.com"
        await service.get_or_create_by_microsoft(
            microsoft_id=mid, microsoft_email=email, access_token="at",
        )
        await db_session.commit()

        found = await service.get_by_microsoft_id(mid)
        assert found is not None
        assert found.email == email


# ============================================================
# API endpoint tests
# ============================================================


@pytest.fixture
def configured_settings(mocker):
    """Populate Microsoft OAuth settings so the /login endpoint proceeds."""
    from aexy.api import auth as auth_module

    mocker.patch.object(auth_module.settings, "microsoft_client_id", "test-client")
    mocker.patch.object(auth_module.settings, "microsoft_client_secret", "test-secret")
    mocker.patch.object(
        auth_module.settings,
        "microsoft_auth_redirect_uri",
        "http://localhost:8000/api/v1/auth/microsoft/callback",
    )
    mocker.patch.object(auth_module.settings, "frontend_url", "http://localhost:3000")
    return auth_module


@pytest.fixture
def fake_redis(mocker):
    """Replace the redis client in auth.py with an in-memory dict."""
    from aexy.api import auth as auth_module

    store: dict[str, str] = {}

    class FakeRedis:
        def setex(self, key, ttl, value):
            store[key] = value

        def get(self, key):
            return store.get(key)

        def delete(self, key):
            store.pop(key, None)

    fake = FakeRedis()
    mocker.patch.object(auth_module, "get_redis_client", return_value=fake)
    return fake, store


class TestMicrosoftLoginEndpoint:
    @pytest.mark.asyncio
    async def test_returns_503_when_not_configured(self, client, mocker):
        from aexy.api import auth as auth_module
        mocker.patch.object(auth_module.settings, "microsoft_client_id", "")

        resp = await client.get("/api/v1/auth/microsoft/login")
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_redirects_to_microsoft_authorize_with_basic_scopes(
        self, client, configured_settings, fake_redis
    ):
        resp = await client.get(
            "/api/v1/auth/microsoft/login", follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        location = resp.headers["location"]
        assert location.startswith("https://login.microsoftonline.com/")
        assert "client_id=test-client" in location
        assert "User.Read" in location
        assert "Mail.Read" not in location  # basic login, no CRM scopes
        assert "prompt=select_account" in location

        # State was stored in the fake Redis
        _, store = fake_redis
        assert len(store) == 1
        state_value = json.loads(next(iter(store.values())))
        assert state_value["scope_type"] == "login"

    @pytest.mark.asyncio
    async def test_connect_crm_requests_mail_and_calendar_scopes(
        self, client, configured_settings, fake_redis
    ):
        resp = await client.get(
            "/api/v1/auth/microsoft/connect-crm", follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        location = resp.headers["location"]
        # URL-encoded space is '+' or '%20' depending on encoder
        assert "Mail.Read" in location
        assert "Calendars.ReadWrite" in location
        assert "prompt=consent" in location

        _, store = fake_redis
        state_value = json.loads(next(iter(store.values())))
        assert state_value["scope_type"] == "crm"


class TestMicrosoftCallback:
    @pytest.mark.asyncio
    async def test_rejects_missing_state(self, client, configured_settings):
        resp = await client.get(
            "/api/v1/auth/microsoft/callback?code=xyz", follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        assert "error=invalid_state" in resp.headers["location"]

    @pytest.mark.asyncio
    async def test_surfaces_oauth_error_from_provider(
        self, client, configured_settings
    ):
        resp = await client.get(
            "/api/v1/auth/microsoft/callback?error=access_denied",
            follow_redirects=False,
        )
        assert resp.status_code in (302, 307)
        assert "error=access_denied" in resp.headers["location"]

    @pytest.mark.asyncio
    async def test_happy_path_creates_developer_and_redirects_with_token(
        self, client, configured_settings, fake_redis, db_session, mocker
    ):
        from aexy.api import auth as auth_module

        # Seed a valid state in Redis
        _, store = fake_redis
        state = "happy-state"
        store[f"{auth_module.OAUTH_STATE_PREFIX}{state}"] = json.dumps({
            "created_at": datetime.now(timezone.utc).isoformat(),
            "scope_type": "login",
            "provider": "microsoft",
            "redirect_url": None,
        })

        # Mock the outbound HTTP calls (token exchange + Graph /me)
        token_resp = MagicMock()
        token_resp.status_code = 200
        token_resp.json = MagicMock(return_value={
            "access_token": "ms-access-token",
            "refresh_token": "ms-refresh-token",
            "expires_in": 3600,
        })
        me_resp = MagicMock()
        me_resp.status_code = 200
        mid = _uniq("aad-happy")
        email = f"{_uniq('grace')}@contoso.com"
        me_resp.json = MagicMock(return_value={
            "id": mid,
            "mail": email,
            "displayName": "Grace Hopper",
        })

        fake_client = MagicMock()
        fake_client.post = AsyncMock(return_value=token_resp)
        fake_client.get = AsyncMock(return_value=me_resp)
        fake_client.__aenter__ = AsyncMock(return_value=fake_client)
        fake_client.__aexit__ = AsyncMock(return_value=None)

        mocker.patch("aexy.api.auth.httpx.AsyncClient", return_value=fake_client)

        resp = await client.get(
            f"/api/v1/auth/microsoft/callback?code=the-code&state={state}",
            follow_redirects=False,
        )

        assert resp.status_code in (302, 307)
        location = resp.headers["location"]
        assert location.startswith("http://localhost:3000/auth/callback?token=")

        # Developer row created
        svc = DeveloperService(db_session)
        dev = await svc.get_by_microsoft_id(mid)
        assert dev is not None
        assert dev.email == email
        assert dev.name == "Grace Hopper"
        assert dev.microsoft_connection.access_token == "ms-access-token"
        assert dev.microsoft_connection.refresh_token == "ms-refresh-token"

    @pytest.mark.asyncio
    async def test_falls_back_to_userPrincipalName_when_mail_is_null(
        self, client, configured_settings, fake_redis, db_session, mocker
    ):
        """Personal Microsoft accounts return `mail: null`; we must use userPrincipalName."""
        from aexy.api import auth as auth_module

        _, store = fake_redis
        state = "upn-fallback"
        store[f"{auth_module.OAUTH_STATE_PREFIX}{state}"] = json.dumps({
            "created_at": datetime.now(timezone.utc).isoformat(),
            "scope_type": "login",
            "provider": "microsoft",
            "redirect_url": None,
        })

        token_resp = MagicMock(status_code=200)
        token_resp.json = MagicMock(return_value={
            "access_token": "at", "expires_in": 3600,
        })
        mid = _uniq("aad-personal")
        upn = f"{_uniq('heidi')}@outlook.com"
        me_resp = MagicMock(status_code=200)
        me_resp.json = MagicMock(return_value={
            "id": mid,
            "mail": None,
            "userPrincipalName": upn,
            "displayName": "Heidi",
        })

        fake_client = MagicMock()
        fake_client.post = AsyncMock(return_value=token_resp)
        fake_client.get = AsyncMock(return_value=me_resp)
        fake_client.__aenter__ = AsyncMock(return_value=fake_client)
        fake_client.__aexit__ = AsyncMock(return_value=None)
        mocker.patch("aexy.api.auth.httpx.AsyncClient", return_value=fake_client)

        resp = await client.get(
            f"/api/v1/auth/microsoft/callback?code=c&state={state}",
            follow_redirects=False,
        )
        assert "token=" in resp.headers["location"]

        dev = await DeveloperService(db_session).get_by_microsoft_id(mid)
        assert dev.email == upn
