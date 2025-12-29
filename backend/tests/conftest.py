"""Pytest configuration and fixtures."""

import asyncio
from collections.abc import AsyncGenerator, Generator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from gitraki.core.database import Base, get_db
from gitraki.main import app


# Test database URL (SQLite for testing)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test HTTP client with database override."""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def sample_github_user() -> dict[str, Any]:
    """Sample GitHub user data."""
    return {
        "id": 12345,
        "login": "testuser",
        "name": "Test User",
        "email": "test@example.com",
        "avatar_url": "https://github.com/images/testuser.png",
    }


@pytest.fixture
def sample_commit() -> dict[str, Any]:
    """Sample GitHub commit data."""
    return {
        "sha": "abc123def456",
        "commit": {
            "author": {
                "name": "Test User",
                "email": "test@example.com",
                "date": "2024-01-15T10:30:00Z",
            },
            "message": "feat: Add new authentication feature",
        },
        "files": [
            {
                "filename": "src/auth.py",
                "additions": 50,
                "deletions": 10,
                "changes": 60,
            },
            {
                "filename": "src/utils.ts",
                "additions": 20,
                "deletions": 5,
                "changes": 25,
            },
        ],
    }


@pytest.fixture
def sample_pull_request() -> dict[str, Any]:
    """Sample GitHub pull request data."""
    return {
        "id": 98765,
        "number": 42,
        "title": "Add payment integration with Stripe",
        "body": "This PR adds Stripe payment processing for subscriptions.",
        "state": "merged",
        "additions": 200,
        "deletions": 50,
        "changed_files": 10,
        "commits": 5,
        "comments": 3,
        "review_comments": 8,
        "created_at": "2024-01-10T09:00:00Z",
        "updated_at": "2024-01-12T15:00:00Z",
        "merged_at": "2024-01-12T16:00:00Z",
    }


@pytest.fixture
def sample_commits_batch() -> list[dict[str, Any]]:
    """Batch of sample commits for analysis."""
    return [
        {
            "sha": "commit1",
            "commit": {
                "author": {"date": "2024-01-15T10:00:00Z"},
                "message": "feat: Add user authentication",
            },
            "files": [
                {"filename": "src/auth.py", "additions": 100, "deletions": 20},
                {"filename": "src/models.py", "additions": 50, "deletions": 10},
            ],
        },
        {
            "sha": "commit2",
            "commit": {
                "author": {"date": "2024-01-15T14:00:00Z"},
                "message": "fix: Fix payment processing bug",
            },
            "files": [
                {"filename": "src/payments.ts", "additions": 30, "deletions": 15},
            ],
        },
        {
            "sha": "commit3",
            "commit": {
                "author": {"date": "2024-01-16T09:00:00Z"},
                "message": "docs: Update API documentation",
            },
            "files": [
                {"filename": "docs/api.md", "additions": 50, "deletions": 5},
            ],
        },
        {
            "sha": "commit4",
            "commit": {
                "author": {"date": "2024-01-16T16:00:00Z"},
                "message": "feat: Add data pipeline for ML training",
            },
            "files": [
                {"filename": "pipeline/etl.py", "additions": 200, "deletions": 0},
                {"filename": "pipeline/transform.py", "additions": 150, "deletions": 0},
            ],
        },
    ]


@pytest.fixture
def sample_pull_requests_batch() -> list[dict[str, Any]]:
    """Batch of sample PRs for analysis."""
    return [
        {
            "id": 1,
            "number": 10,
            "title": "Add Stripe payment integration",
            "body": "Implement checkout flow with Stripe API",
            "state": "merged",
            "additions": 300,
            "deletions": 50,
        },
        {
            "id": 2,
            "number": 11,
            "title": "Fix authentication bug in OAuth flow",
            "body": "JWT token was not being refreshed properly",
            "state": "merged",
            "additions": 50,
            "deletions": 30,
        },
        {
            "id": 3,
            "number": 12,
            "title": "Add data pipeline for analytics",
            "body": "ETL pipeline using Airflow for metrics",
            "state": "open",
            "additions": 500,
            "deletions": 0,
        },
    ]
