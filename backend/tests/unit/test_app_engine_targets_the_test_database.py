"""The application's own engine must point at the test database.

`app.dependency_overrides[get_db]` redirects every *injected* session, which is
most of them. It cannot redirect `get_async_session()`, because that is called
directly rather than injected — and roughly forty places call it, among them
`health`, `event_ingestion`, `planning_poker`, `email_tracking`, `automations`,
`crm_automation` and `integrations`. Those built their engine from
`settings.database_url`, which in a developer's `backend/.env` is their own
Postgres.

So two databases were in play during one test run. The demonstrated consequence
was `test_api_health.py::TestHealthEndpoints::test_readiness_check` returning 503
when `DATABASE_URL` pointed at an unreachable host: that test asserted the
developer's database was up, not that the code worked. `integrations.py` reaches
the same helper on paths that commit, so the exposure was not only reads.

The fix is one line in `conftest.py`. These tests exist because nothing else
would notice it being removed — the suite would simply go back to passing for the
wrong reason on any machine with a healthy dev database.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aexy.core.config import get_settings
from aexy.core.database import _pool_kwargs, get_engine, get_sync_engine
from tests.conftest import TEST_DATABASE_URL


class TestWhereTheApplicationLooks:
    def test_settings_point_at_the_test_database(self):
        assert get_settings().database_url == TEST_DATABASE_URL

    def test_the_async_engine_is_built_from_it(self):
        """The engine, not just the setting — `_get_engine` reads settings once
        and caches, so a redirect applied too late would not show up here."""
        assert str(get_engine().url) == TEST_DATABASE_URL

    def test_the_sync_engine_is_built_from_it_too(self):
        """`get_sync_session` is the psycopg2 path used by background work. It
        derives its URL from the same setting, so it followed the async engine to
        the dev database and would follow it back."""
        url = str(get_sync_engine().url)
        # Same database, minus the async driver that create_engine refuses.
        assert url == TEST_DATABASE_URL.replace("sqlite+aiosqlite", "sqlite")


class TestTheRedirectIsWhereItHasToBe:
    def test_conftest_sets_it_at_import_time(self):
        """Not in a fixture. `get_settings` is `lru_cache`d and session-scoped
        fixtures build engines before function-scoped ones run, so a redirect
        installed per-test would arrive after the first engine already existed.
        """
        source = Path("tests/conftest.py").read_text()
        assert "get_settings().database_url = TEST_DATABASE_URL" in source

        line = next(
            index
            for index, text in enumerate(source.splitlines())
            if "get_settings().database_url = TEST_DATABASE_URL" in text
        )
        first_fixture = next(
            index
            for index, text in enumerate(source.splitlines())
            if text.startswith("@pytest")
        )
        assert line < first_fixture, "the redirect must run before any fixture"

    def test_the_drop_guard_now_covers_the_application_too(self):
        """The guard refuses a Postgres target whose name lacks 'test', so
        `drop_all` cannot wipe a real database. It only ever guarded the fixture
        engine; pointing settings at the same URL is what extends it to the ~40
        call sites."""
        assert get_settings().database_url == TEST_DATABASE_URL


class TestPoolArgumentsFollowTheDriver:
    """Redirecting the URL is only half of it: the engine builder passed
    `pool_size`/`max_overflow`, which SQLite's pool raises on rather than
    ignoring. Without this the redirect made every engine construction fail —
    which is how the readiness check stayed at 503 for a completely different
    reason than before."""

    def test_postgres_keeps_its_pool(self):
        kwargs = _pool_kwargs("postgresql+asyncpg://u@h/db")
        assert kwargs["pool_size"] == 10
        assert kwargs["max_overflow"] == 20
        assert kwargs["pool_pre_ping"] is True

    def test_sqlite_gets_none_of_it(self):
        kwargs = _pool_kwargs("sqlite+aiosqlite:///:memory:")
        assert "pool_size" not in kwargs
        assert "max_overflow" not in kwargs

    def test_sqlite_keeps_one_connection(self):
        """Anything but StaticPool hands out a fresh — and therefore empty —
        in-memory database on every checkout."""
        from sqlalchemy.pool import StaticPool

        assert _pool_kwargs("sqlite:///:memory:")["poolclass"] is StaticPool


@pytest.mark.asyncio
async def test_a_direct_session_can_actually_be_opened():
    """End of the chain: the helper the ~40 call sites use has to work, not just
    resolve to the right URL."""
    from sqlalchemy import text

    from aexy.core.database import get_async_session

    async with get_async_session() as session:
        assert (await session.execute(text("SELECT 1"))).scalar() == 1
