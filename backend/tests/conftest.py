"""Pytest configuration and fixtures."""

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator, Generator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool, StaticPool

from aexy.core.database import Base, get_db
from aexy.main import app


# Test database URL. Defaults to SQLite in-memory; set TEST_DATABASE_URL to a
# Postgres DSN to exercise the real DB (catches pgvector/JSONB/ARRAY/date_trunc
# behavior SQLite can't). See tests/README or the pytest note for the DSN.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:"
)
_IS_SQLITE = TEST_DATABASE_URL.startswith("sqlite")

# Safety guard: this fixture create_all's then drop_all's the whole schema, so
# it must NEVER run against a real database. Refuse any Postgres target whose
# name isn't clearly a throwaway test DB.
if not _IS_SQLITE and "test" not in TEST_DATABASE_URL.rsplit("/", 1)[-1].lower():
    raise RuntimeError(
        "Refusing to run the schema-dropping test fixtures against "
        f"{TEST_DATABASE_URL!r}: the database name must contain 'test' "
        "(e.g. aexy_test) so drop_all can't wipe a real database."
    )


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


async def _reset_pg_schema(conn):
    """Reset a Postgres test DB to an empty schema, then create all tables.

    `Base.metadata.drop_all` can't be used: `documents` and
    `document_generation_prompts` reference each other, and Postgres (unlike
    SQLite, which ignores the cycle) raises CircularDependencyError trying to
    topologically sort the DROP. Dropping the whole `public` schema with
    CASCADE sidesteps the cycle; pgvector lives in `public`, so re-create it.
    """
    from sqlalchemy import text

    await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
    await conn.execute(text("CREATE SCHEMA public"))
    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _pg_schema_once():
    """For Postgres: build the schema ONCE per session.

    Per-test create_all/drop_all on Postgres is ~2s/test; instead we create the
    schema once here and each test truncates its own writes on teardown (see
    `test_engine`). No-op for SQLite (its in-memory DB is per-engine).
    """
    if _IS_SQLITE:
        yield
        return

    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await _reset_pg_schema(conn)
    await engine.dispose()
    yield


async def _truncate_all_pg(engine) -> None:
    """Fast per-test isolation: empty every table in one CASCADE statement."""
    from sqlalchemy import text

    # Unsorted: order is irrelevant for TRUNCATE ... CASCADE, and sorting trips
    # the documents/document_generation_prompts FK-cycle warning.
    tables = ", ".join(
        f'"{t.name}"' for t in Base.metadata.tables.values()
    )
    if not tables:
        return
    async with engine.begin() as conn:
        await conn.execute(
            text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE")
        )


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create a test database engine (SQLite in-memory or a Postgres test DB)."""
    if _IS_SQLITE:
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
        return

    # Postgres: schema already exists (session fixture). NullPool because
    # pytest-asyncio gives each test its own loop and asyncpg connections are
    # loop-bound. Truncate on teardown for isolation instead of dropping.
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        yield engine
    finally:
        await _truncate_all_pg(engine)
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

async def _attach_github(db_session, developer, *, github_id, github_username):
    """Link a GitHubConnection to a developer.

    GitHub identity moved off Developer onto GitHubConnection; fixtures that
    need a github_id/username create the connection explicitly.
    """
    from aexy.models.developer import GitHubConnection

    db_session.add(
        GitHubConnection(
            developer_id=developer.id,
            github_id=github_id,
            github_username=github_username,
            access_token="test-token",
        )
    )


@pytest_asyncio.fixture
async def sample_developer(db_session: AsyncSession):
    """Create a sample developer (with a linked GitHub connection)."""
    from aexy.models.developer import Developer

    developer = Developer(
        name="Test Developer",
        email="testdev@example.com",
    )
    db_session.add(developer)
    await db_session.flush()
    await _attach_github(db_session, developer, github_id=12345, github_username="testdev")
    await db_session.commit()
    await db_session.refresh(developer)
    return developer


@pytest_asyncio.fixture
async def sample_developers(db_session: AsyncSession):
    """Create multiple sample developers (each with a GitHub connection)."""
    from aexy.models.developer import Developer

    specs = [
        (1001, "dev1", "Developer One", "dev1@example.com"),
        (1002, "dev2", "Developer Two", "dev2@example.com"),
        (1003, "dev3", "Developer Three", "dev3@example.com"),
        (1004, "dev4", "Developer Four", "dev4@example.com"),
    ]

    developers = [Developer(name=name, email=email) for _, _, name, email in specs]
    for dev in developers:
        db_session.add(dev)
    await db_session.flush()

    for dev, (github_id, github_username, _, _) in zip(developers, specs):
        await _attach_github(
            db_session, dev, github_id=github_id, github_username=github_username
        )

    await db_session.commit()
    for dev in developers:
        await db_session.refresh(dev)

    return developers


@pytest_asyncio.fixture
async def sample_team(db_session: AsyncSession, sample_developers):
    """Create a sample team with its members."""
    from aexy.models.team import Team, TeamMember
    from aexy.models.workspace import Workspace

    workspace = Workspace(
        name="Sample WS", slug="sample-ws", owner_id=sample_developers[0].id
    )
    db_session.add(workspace)
    await db_session.flush()

    team = Team(
        workspace_id=workspace.id,
        name="Backend Team",
        slug="backend-team",
        description="Backend development team",
    )
    db_session.add(team)
    await db_session.flush()

    for dev in sample_developers[:3]:
        db_session.add(TeamMember(team_id=team.id, developer_id=dev.id))

    await db_session.commit()
    await db_session.refresh(team)
    return team


@pytest_asyncio.fixture
async def sample_commits_db(db_session: AsyncSession, sample_developer):
    """Create sample commits in the database."""
    from datetime import datetime, timedelta
    from aexy.models.activity import Commit

    commits = []
    base_date = datetime.utcnow() - timedelta(days=30)

    for i in range(10):
        commit = Commit(
            # Commit.sha is String(40) (real git SHAs are 40 hex chars);
            # Postgres enforces the length that SQLite ignores.
            sha=f"{i:040d}",
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
    from datetime import datetime, timedelta
    from aexy.models.activity import PullRequest

    prs = []
    base_date = datetime.utcnow() - timedelta(days=30)

    for i in range(5):
        pr = PullRequest(
            github_id=1000 + i,
            number=i + 1,
            developer_id=sample_developer.id,
            repository="test-repo",
            title=f"PR {i}: Add feature",
            description=f"Description for PR {i}",
            state="merged" if i < 3 else "open",
            additions=100 + i * 20,
            deletions=20 + i * 5,
            files_changed=5 + i,
            commits_count=3 + i,
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
    from datetime import datetime, timedelta
    from aexy.models.activity import CodeReview

    reviews = []
    base_date = datetime.utcnow() - timedelta(days=25)

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
                "id": "w1",
                "type": "heatmap",
                "title": "Skill Heatmap",
                "config": {"show_legend": True},
                "position": {"x": 0, "y": 0, "w": 2, "h": 1},
            },
            {
                "id": "w2",
                "type": "line_chart",
                "title": "Productivity",
                "config": {"period": "7d"},
                "position": {"x": 0, "y": 1, "w": 1, "h": 1},
            },
        ],
        "filters": {
            "date_range_days": 7,
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


# =============================================================================
# CRM automation helpers
# =============================================================================


async def seed_workspace(db: AsyncSession) -> str:
    """Insert a real workspace (and its owner) and return the workspace id.

    `crm_automations.workspace_id` is a genuine foreign key. SQLite leaves
    foreign keys unenforced by default, so a fabricated uuid passes on the
    default test DB and only fails when the same suite is pointed at Postgres
    — which is where these tables actually live. Tests that need an automation
    should build it on top of this rather than inventing an id.

    Raw INSERTs on purpose: the point is a valid FK target, not the whole
    workspace object graph, and the ORM models pull in far more than that.
    """
    workspace_id = str(uuid.uuid4())
    owner_id = str(uuid.uuid4())
    await db.execute(
        sa_text(
            "INSERT INTO developers (id, repos_synced_count, llm_requests_today, "
            "llm_tokens_used_this_month, llm_input_tokens_this_month, "
            "llm_output_tokens_this_month, llm_overage_cost_cents, "
            "has_completed_onboarding) "
            "VALUES (:i, 0, 0, 0, 0, 0, 0, false)"
        ),
        {"i": owner_id},
    )
    await db.execute(
        sa_text(
            "INSERT INTO workspaces (id, name, slug, type, owner_id, settings, "
            "is_active) VALUES (:i, 'test', :s, 'team', :o, '{}', true)"
        ),
        {"i": workspace_id, "s": f"ws-{workspace_id[:8]}", "o": owner_id},
    )
    await db.flush()
    return workspace_id


async def seed_crm_object(db: AsyncSession, workspace_id: str, name: str = "Object") -> str:
    """Insert a CRM object in `workspace_id` and return its id.

    `crm_automations.object_id` is a foreign key too, so an automation bound to
    a made-up object id only inserts on SQLite.

    Built through the ORM rather than raw SQL: CRMObject carries a dozen
    non-null columns with Python-side defaults, and spelling them out by hand
    means the helper breaks every time one is added or renamed.
    """
    from aexy.models.crm import CRMObject

    crm_object = CRMObject(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        name=name,
        plural_name=f"{name}s",
        slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}",
    )
    db.add(crm_object)
    await db.flush()
    return crm_object.id
