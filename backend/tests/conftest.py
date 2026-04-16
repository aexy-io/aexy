"""Pytest configuration and fixtures."""

import asyncio
from collections.abc import AsyncGenerator, Generator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from aexy.core.database import Base, get_db
from aexy.main import app

# Patch PostgreSQL-specific types to compile on SQLite (for testing)
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
from sqlalchemy import JSON

_pg_text_types = ['TSVECTOR', 'CITEXT', 'INET', 'MACADDR', 'CIDR', 'REGCLASS', 'ENUM']
_pg_json_types = ['ARRAY', 'JSONB', 'HSTORE']
for _t in _pg_text_types:
    if not hasattr(SQLiteTypeCompiler, f'visit_{_t}'):
        setattr(SQLiteTypeCompiler, f'visit_{_t}', lambda self, type_, **kw: "TEXT")
for _t in _pg_json_types:
    if not hasattr(SQLiteTypeCompiler, f'visit_{_t}'):
        setattr(SQLiteTypeCompiler, f'visit_{_t}', lambda self, type_, **kw: self.visit_JSON(JSON(), **kw))


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


# Phase 4 Fixtures

@pytest_asyncio.fixture
async def sample_developer(db_session: AsyncSession):
    """Create a sample developer in the database."""
    from aexy.models.developer import Developer

    developer = Developer(
        name="Test Developer",
        email="testdev@example.com",
        skill_fingerprint={
            "languages": [
                {"name": "Python", "proficiency_score": 80, "commits_count": 100},
                {"name": "TypeScript", "proficiency_score": 60, "commits_count": 50},
                {"name": "React", "proficiency_score": 50, "commits_count": 30},
            ],
            "domains": [{"name": "backend", "confidence_score": 85}],
            "frameworks": [],
            "tools": ["PostgreSQL"],
        },
    )
    db_session.add(developer)
    await db_session.commit()
    await db_session.refresh(developer)
    return developer


@pytest_asyncio.fixture
async def sample_developers(db_session: AsyncSession):
    """Create multiple sample developers."""
    from aexy.models.developer import Developer

    developers = [
        Developer(
            name="Developer One",
            email="dev1@example.com",
            skill_fingerprint={
                "languages": [
                    {"name": "Python", "proficiency_score": 90, "commits_count": 200},
                    {"name": "FastAPI", "proficiency_score": 70, "commits_count": 80},
                ],
                "domains": [{"name": "backend", "confidence_score": 85}],
                "frameworks": [],
                "tools": ["PostgreSQL"],
            },
        ),
        Developer(
            name="Developer Two",
            email="dev2@example.com",
            skill_fingerprint={
                "languages": [
                    {"name": "TypeScript", "proficiency_score": 85, "commits_count": 150},
                    {"name": "React", "proficiency_score": 75, "commits_count": 100},
                ],
                "domains": [{"name": "frontend", "confidence_score": 80}],
                "frameworks": [],
                "tools": ["Node.js"],
            },
        ),
        Developer(
            name="Developer Three",
            email="dev3@example.com",
            skill_fingerprint={
                "languages": [
                    {"name": "Python", "proficiency_score": 60, "commits_count": 80},
                    {"name": "Django", "proficiency_score": 50, "commits_count": 40},
                ],
                "domains": [{"name": "backend", "confidence_score": 60}],
                "frameworks": [],
                "tools": ["Redis"],
            },
        ),
        Developer(
            name="Developer Four",
            email="dev4@example.com",
            skill_fingerprint={
                "languages": [
                    {"name": "Go", "proficiency_score": 80, "commits_count": 120},
                ],
                "domains": [{"name": "infrastructure", "confidence_score": 85}],
                "frameworks": [],
                "tools": ["Kubernetes", "Docker"],
            },
        ),
    ]

    for dev in developers:
        db_session.add(dev)

    await db_session.commit()

    for dev in developers:
        await db_session.refresh(dev)

    return developers


@pytest_asyncio.fixture
async def sample_team(db_session: AsyncSession, sample_developers):
    """Create a sample team with developers."""
    from aexy.models.team import Team

    team = Team(
        name="Backend Team",
        description="Backend development team",
        developer_ids=[dev.id for dev in sample_developers[:3]],
    )
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    return team


@pytest_asyncio.fixture
async def sample_commits_db(db_session: AsyncSession, sample_developer):
    """Create sample commits in the database."""
    from datetime import datetime, timedelta, timezone
    from aexy.models.activity import Commit

    commits = []
    base_date = datetime.now(timezone.utc) - timedelta(days=30)

    for i in range(10):
        commit = Commit(
            sha=f"sha_{i}_{sample_developer.id}",
            developer_id=sample_developer.id,
            repository="test-repo",
            message=f"Commit {i}: Feature implementation",
            additions=50 + i * 10,
            deletions=10 + i * 2,
            files_changed=3 + i,
            committed_at=base_date + timedelta(days=i),
        )
        db_session.add(commit)
        commits.append(commit)

    await db_session.commit()
    return commits


@pytest_asyncio.fixture
async def sample_pull_requests_db(db_session: AsyncSession, sample_developer):
    """Create sample pull requests in the database."""
    from datetime import datetime, timedelta, timezone
    from aexy.models.activity import PullRequest

    prs = []
    base_date = datetime.now(timezone.utc) - timedelta(days=30)

    for i in range(5):
        pr = PullRequest(
            github_id=1000 + i,
            number=i + 1,
            developer_id=sample_developer.id,
            repository="test-repo",
            title=f"PR {i}: Add feature",
            body=f"Description for PR {i}",
            state="merged" if i < 3 else "open",
            additions=100 + i * 20,
            deletions=20 + i * 5,
            changed_files=5 + i,
            commits_count=3 + i,
            created_at=base_date + timedelta(days=i * 5),
            created_at_github=base_date + timedelta(days=i * 5),
            merged_at=base_date + timedelta(days=i * 5 + 2) if i < 3 else None,
        )
        db_session.add(pr)
        prs.append(pr)

    await db_session.commit()
    return prs


@pytest_asyncio.fixture
async def sample_reviews_db(db_session: AsyncSession, sample_developer, sample_pull_requests_db):
    """Create sample code reviews in the database."""
    from datetime import datetime, timedelta, timezone
    from aexy.models.activity import CodeReview

    reviews = []
    base_date = datetime.now(timezone.utc) - timedelta(days=25)

    for i, pr in enumerate(sample_pull_requests_db[:3]):
        review = CodeReview(
            github_id=2000 + i,
            pull_request_github_id=pr.github_id,
            developer_id=sample_developer.id,
            repository="test-repo",
            state="approved" if i % 2 == 0 else "changes_requested",
            body=f"Review comment for PR {pr.number}",
            submitted_at=base_date + timedelta(days=i * 3),
        )
        db_session.add(review)
        reviews.append(review)

    await db_session.commit()
    return reviews


@pytest.fixture
def mock_llm_gateway(mocker):
    """Mock the LLM gateway for tests."""
    mock = mocker.patch("aexy.llm.gateway.LLMGateway")
    mock_instance = mock.return_value

    # Default mock response
    mock_instance.analyze.return_value = {
        "risk_score": 0.35,
        "risk_level": "low",
        "confidence": 0.8,
        "factors": [
            {"factor": "stable_activity", "weight": 0.3, "evidence": "Consistent commits"}
        ],
        "recommendations": ["Continue current trajectory"],
    }

    return mock_instance


@pytest.fixture
def sample_report_config() -> dict[str, Any]:
    """Sample report configuration."""
    return {
        "name": "Weekly Team Report",
        "description": "Weekly summary of team performance",
        "widgets": [
            {
                "type": "skill_heatmap",
                "config": {"show_legend": True},
                "position": {"x": 0, "y": 0, "w": 2, "h": 1},
            },
            {
                "type": "productivity_chart",
                "config": {"period": "7d"},
                "position": {"x": 0, "y": 1, "w": 1, "h": 1},
            },
        ],
        "filters": {
            "date_range": "last_7_days",
        },
    }


@pytest.fixture
def sample_slack_command() -> dict[str, Any]:
    """Sample Slack slash command data."""
    return {
        "command": "/aexy",
        "text": "profile @testdev",
        "user_id": "U12345",
        "user_name": "slackuser",
        "channel_id": "C12345",
        "channel_name": "general",
        "team_id": "T12345",
        "team_domain": "testworkspace",
        "response_url": "https://hooks.slack.com/commands/xxx",
        "trigger_id": "123456.789",
    }
