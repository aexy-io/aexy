"""Database configuration and session management."""

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from aexy.core.config import get_settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class."""

    pass


# Store engine per-process to handle Celery fork workers correctly.
# asyncpg connections cannot be shared across forked processes.
_engine_cache: dict[int, tuple] = {}


def _get_engine():
    """Get or create the async engine for the current process.

    This ensures each forked Celery worker gets its own engine instance,
    avoiding asyncpg connection conflicts across processes.
    """
    pid = os.getpid()
    if pid not in _engine_cache:
        settings = get_settings()
        engine = create_async_engine(
            settings.database_url,
            echo=settings.database_echo,
            pool_pre_ping=True,
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
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


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


# Synchronous database support for Celery tasks
_sync_engine_cache: dict[int, tuple] = {}


def _get_sync_engine():
    """Get or create the sync engine for the current process.

    This ensures each forked Celery worker gets its own engine instance.
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
    """Get a synchronous database session for Celery tasks.

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
