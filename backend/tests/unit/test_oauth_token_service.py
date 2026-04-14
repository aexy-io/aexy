"""Tests for developer-level Google / Microsoft refresh token rotation."""

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from aexy.models.developer import Developer, GoogleConnection, MicrosoftConnection
from aexy.services.oauth_token_service import (
    RefreshTokenRevokedError,
    TokenRefreshError,
    ensure_valid_google_token,
    ensure_valid_microsoft_token,
)

# Use the real Postgres dev DB for the same reason test_microsoft_auth.py does
# (plans.llm_provider_access is a PG ARRAY that SQLite can't compile).
import os

TEST_PG_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@postgres:5432/aexy",
)


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(TEST_PG_URL, poolclass=NullPool)
    session_maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False,
    )
    async with session_maker() as session:
        yield session
    await engine.dispose()


def _uniq(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture
async def google_conn(db_session):
    dev = Developer(email=f"{_uniq('gdev')}@example.com", name="Google Dev")
    db_session.add(dev)
    await db_session.flush()
    conn = GoogleConnection(
        developer_id=dev.id,
        google_id=_uniq("goog"),
        google_email=dev.email,
        access_token="old-google-access",
        refresh_token="old-google-refresh",
        token_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),  # expired
        scopes=["openid", "email"],
    )
    db_session.add(conn)
    await db_session.commit()
    await db_session.refresh(conn)
    return conn


@pytest_asyncio.fixture
async def microsoft_conn(db_session):
    dev = Developer(email=f"{_uniq('mdev')}@example.com", name="MS Dev")
    db_session.add(dev)
    await db_session.flush()
    conn = MicrosoftConnection(
        developer_id=dev.id,
        microsoft_id=_uniq("ms"),
        microsoft_email=dev.email,
        access_token="old-ms-access",
        refresh_token="old-ms-refresh",
        token_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        scopes=["openid", "profile", "User.Read", "offline_access"],
    )
    db_session.add(conn)
    await db_session.commit()
    await db_session.refresh(conn)
    return conn


def _fake_token_response(status_code: int, body: dict | str = "") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    if isinstance(body, dict):
        resp.json = MagicMock(return_value=body)
        resp.text = str(body)
    else:
        resp.text = body
        resp.json = MagicMock(side_effect=ValueError("not json"))
    return resp


def _mock_httpx(mocker, response):
    fake_client = MagicMock()
    fake_client.post = AsyncMock(return_value=response)
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=None)
    return mocker.patch(
        "aexy.services.oauth_token_service.httpx.AsyncClient",
        return_value=fake_client,
    )


# ============================================================
# Google
# ============================================================


class TestEnsureValidGoogleToken:
    @pytest.mark.asyncio
    async def test_noop_when_token_is_still_fresh(
        self, db_session, google_conn, mocker
    ):
        google_conn.token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db_session.flush()
        spy = _mock_httpx(mocker, _fake_token_response(500, "should not be called"))

        token = await ensure_valid_google_token(db_session, google_conn)

        assert token == "old-google-access"
        spy.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_when_no_refresh_token_available(
        self, db_session, google_conn, mocker
    ):
        google_conn.refresh_token = None
        await db_session.flush()
        spy = _mock_httpx(mocker, _fake_token_response(500, "should not be called"))

        token = await ensure_valid_google_token(db_session, google_conn)
        assert token == "old-google-access"
        spy.assert_not_called()

    @pytest.mark.asyncio
    async def test_refreshes_and_persists_new_tokens(
        self, db_session, google_conn, mocker
    ):
        _mock_httpx(mocker, _fake_token_response(200, {
            "access_token": "fresh-google-access",
            "expires_in": 3600,
            "refresh_token": "rotated-google-refresh",  # Google occasionally rotates
        }))

        token = await ensure_valid_google_token(db_session, google_conn)

        assert token == "fresh-google-access"
        assert google_conn.access_token == "fresh-google-access"
        # Rotated refresh token MUST be persisted
        assert google_conn.refresh_token == "rotated-google-refresh"
        assert google_conn.token_expires_at > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_keeps_old_refresh_token_when_response_omits_it(
        self, db_session, google_conn, mocker
    ):
        _mock_httpx(mocker, _fake_token_response(200, {
            "access_token": "fresh-google-access",
            "expires_in": 3600,
            # no "refresh_token" field — Google's usual behaviour
        }))

        await ensure_valid_google_token(db_session, google_conn)

        assert google_conn.access_token == "fresh-google-access"
        assert google_conn.refresh_token == "old-google-refresh"

    @pytest.mark.asyncio
    async def test_invalid_grant_clears_refresh_token_and_raises(
        self, db_session, google_conn, mocker
    ):
        _mock_httpx(mocker, _fake_token_response(
            400, '{"error":"invalid_grant","error_description":"Token has been expired or revoked."}'
        ))

        with pytest.raises(RefreshTokenRevokedError):
            await ensure_valid_google_token(db_session, google_conn)

        # After commit+refresh, the cleared refresh token should persist
        await db_session.refresh(google_conn)
        assert google_conn.refresh_token is None

    @pytest.mark.asyncio
    async def test_other_http_errors_raise_generic(
        self, db_session, google_conn, mocker
    ):
        _mock_httpx(mocker, _fake_token_response(503, "service down"))

        with pytest.raises(TokenRefreshError):
            await ensure_valid_google_token(db_session, google_conn)

        # Generic failure must NOT clear the refresh token
        assert google_conn.refresh_token == "old-google-refresh"


# ============================================================
# Microsoft
# ============================================================


class TestEnsureValidMicrosoftToken:
    @pytest.mark.asyncio
    async def test_refreshes_and_rotates_refresh_token(
        self, db_session, microsoft_conn, mocker
    ):
        _mock_httpx(mocker, _fake_token_response(200, {
            "access_token": "fresh-ms-access",
            "expires_in": 3600,
            "refresh_token": "rotated-ms-refresh",  # MS always rotates
        }))

        token = await ensure_valid_microsoft_token(db_session, microsoft_conn)

        assert token == "fresh-ms-access"
        assert microsoft_conn.access_token == "fresh-ms-access"
        assert microsoft_conn.refresh_token == "rotated-ms-refresh"
        assert microsoft_conn.token_expires_at > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_sends_stored_scopes_on_refresh(
        self, db_session, microsoft_conn, mocker
    ):
        captured: dict = {}
        fake_client = MagicMock()
        async def _post(url, data=None, headers=None):
            captured["url"] = url
            captured["data"] = data
            return _fake_token_response(200, {
                "access_token": "fresh", "expires_in": 3600,
            })
        fake_client.post = AsyncMock(side_effect=_post)
        fake_client.__aenter__ = AsyncMock(return_value=fake_client)
        fake_client.__aexit__ = AsyncMock(return_value=None)
        mocker.patch(
            "aexy.services.oauth_token_service.httpx.AsyncClient",
            return_value=fake_client,
        )

        await ensure_valid_microsoft_token(db_session, microsoft_conn)

        assert captured["data"]["grant_type"] == "refresh_token"
        assert captured["data"]["scope"] == "openid profile User.Read offline_access"
        assert "login.microsoftonline.com" in captured["url"]

    @pytest.mark.asyncio
    async def test_invalid_grant_clears_refresh_token_and_raises(
        self, db_session, microsoft_conn, mocker
    ):
        _mock_httpx(mocker, _fake_token_response(
            400, '{"error":"invalid_grant","error_description":"AADSTS70008: The refresh token has expired."}'
        ))

        with pytest.raises(RefreshTokenRevokedError):
            await ensure_valid_microsoft_token(db_session, microsoft_conn)

        await db_session.refresh(microsoft_conn)
        assert microsoft_conn.refresh_token is None

    @pytest.mark.asyncio
    async def test_noop_when_token_is_still_fresh(
        self, db_session, microsoft_conn, mocker
    ):
        microsoft_conn.token_expires_at = datetime.now(timezone.utc) + timedelta(
            hours=1
        )
        await db_session.flush()
        spy = _mock_httpx(mocker, _fake_token_response(500, "unused"))

        token = await ensure_valid_microsoft_token(db_session, microsoft_conn)
        assert token == "old-ms-access"
        spy.assert_not_called()
