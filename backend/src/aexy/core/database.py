"""Database configuration and session management."""

import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)


# SQLite dialect shims so test suites that hit `sqlite+aiosqlite:///:memory:`
# can still compile models declared with PostgreSQL-specific types. Production
# always runs against PostgreSQL, so these shims are inert at runtime; they
# only matter when `tests/conftest.py` builds a transient SQLite schema via
# `Base.metadata.create_all()`. Without them the test suite fails before any
# test body runs (`can't render element of type ARRAY` / `… JSONB`).
@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "JSON"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "JSON"


@compiles(INET, "sqlite")
def _compile_inet_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "VARCHAR(45)"


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class."""

    pass


# Store engine per-process to handle forked workers correctly.
# asyncpg connections cannot be shared across forked processes.
_engine_cache: dict[int, tuple] = {}


def _get_engine():
    """Get or create the async engine for the current process.

    This ensures each forked worker gets its own engine instance,
    avoiding asyncpg connection conflicts across processes.
    """
    pid = os.getpid()
    if pid not in _engine_cache:
        settings = get_settings()
        engine = create_async_engine(
            settings.database_url,
            echo=settings.database_echo,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_recycle=1800,
            pool_timeout=30,
        )
        session_maker = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        _engine_cache[pid] = (engine, session_maker)
    return _engine_cache[pid]


def get_engine():
    """Get the async engine for the current process."""
    return _get_engine()[0]


def async_session_maker():
    """Get a new async session for the current process."""
    _, session_factory = _get_engine()
    return session_factory()


class _EngineProxy:
    """Proxy class for lazy engine access.

    This allows `from database import engine` to work while ensuring
    the actual engine is created lazily (important for Celery fork workers).
    """

    def __getattr__(self, name):
        return getattr(get_engine(), name)

    def begin(self):
        return get_engine().begin()

    def dispose(self):
        return get_engine().dispose()


# For backwards compatibility - allows `from database import engine`
engine = _EngineProxy()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session dependency."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
            # An automation queued an email in the transaction that just
            # committed. Hand it over now so delivery stays near-instant; the
            # scheduled sweep is the backstop if this never runs.
            run_ids = session.info.pop("automation_outbox_pending", None)
            if run_ids:
                _drain_automation_outbox_soon(run_ids)
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _drain_automation_outbox_soon(run_ids: set) -> None:
    """Fire-and-forget drain. Never lets a drain failure affect the response."""
    import asyncio

    async def _drain_each():
        # Imported inside the guarded block: an import failure here must not
        # turn an already-committed request into an error response.
        from aexy.services.automation_email_outbox import drain_outbox

        for run_id in run_ids:
            await drain_outbox(run_id=run_id)

    try:
        if len(_background_drains) >= _MAX_BACKGROUND_DRAINS:
            # Under a spike, let the sweep pick these up rather than opening an
            # unbounded number of database sessions.
            logger.warning("Outbox drains saturated; leaving these to the sweep")
            return
        task = asyncio.create_task(_drain_each())
        # Without a reference the task can be garbage collected mid-flight.
        _background_drains.add(task)
        task.add_done_callback(_background_drains.discard)
    except RuntimeError:
        # No running loop (sync context); the sweep will pick it up.
        logger.debug("No event loop for outbox drain; leaving it to the sweep")


_background_drains: set = set()
_MAX_BACKGROUND_DRAINS = 50


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session as a context manager.

    Usage:
        async with get_async_session() as session:
            result = await session.execute(query)

    This is useful for background tasks and non-FastAPI contexts
    where you need a database session but aren't using Depends().
    """
    session = async_session_maker()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


# Synchronous database support for background tasks
_sync_engine_cache: dict[int, tuple] = {}


def _get_sync_engine():
    """Get or create the sync engine for the current process.

    This ensures each forked worker gets its own engine instance.
    """
    pid = os.getpid()
    if pid not in _sync_engine_cache:
        settings = get_settings()
        # Convert async URL to sync URL (postgresql+asyncpg -> postgresql+psycopg2)
        sync_url = settings.database_url.replace(
            "postgresql+asyncpg", "postgresql+psycopg2"
        ).replace(
            "postgresql://", "postgresql+psycopg2://"
        )
        # Handle case where it's already a sync URL
        if "asyncpg" not in sync_url and "+psycopg2" not in sync_url:
            sync_url = sync_url.replace("postgresql://", "postgresql+psycopg2://")

        sync_engine = create_engine(
            sync_url,
            echo=settings.database_echo,
            pool_pre_ping=True,
        )
        sync_session_factory = sessionmaker(
            bind=sync_engine,
            class_=Session,
            expire_on_commit=False,
        )
        _sync_engine_cache[pid] = (sync_engine, sync_session_factory)
    return _sync_engine_cache[pid]


def get_sync_engine():
    """Get the sync engine for the current process."""
    return _get_sync_engine()[0]


@contextmanager
def get_sync_session() -> Generator[Session, None, None]:
    """Get a synchronous database session for background tasks.

    Usage:
        with get_sync_session() as session:
            result = session.execute(query)
    """
    _, session_factory = _get_sync_engine()
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
