"""Database configuration and session management."""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

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
