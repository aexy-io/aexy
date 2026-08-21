"""Tests for `AgentService.preview_prompt` (UX-EDT-018).

The preview is the most important "read-only" surface for the edit
page — it MUST NOT run tools (side effects) and MUST NOT persist an
execution row. These tests pin both invariants in place so a future
refactor can't accidentally turn the preview into a hot path.

Setup mirrors the stream-message tests: JSONB→TEXT under SQLite,
stub `workspaces`/`developers` tables to satisfy selectin loaders,
fake AgentBuilder that captures its build args + yields canned
astream events.
"""

from __future__ import annotations

from uuid import uuid4
from typing import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import Column, MetaData, String, Table, select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

# Side-effect import: registers the JSONB→TEXT compile hook the
# preview tests rely on. Without this, agent tables can't be created
# under SQLite.
from tests.unit import test_inbox_thread_chain  # noqa: F401

from aexy.models.agent import (
    AgentConversation,
    AgentMessage,
    CRMAgent,
    CRMAgentExecution,
)
from aexy.services.agent_service import AgentService


# ---------------------------------------------------------------------------
# SQLite compatibility (same shims as stream tests)
# ---------------------------------------------------------------------------


# The JSONB→TEXT compile hook is already registered by the
# thread-chain test module; re-registering would raise. Keep this
# import-only so the registration carries over.


from aexy.models.workspace import Workspace

_stub_meta = MetaData()
# A stand-in `workspaces` with no foreign keys, so the agent tables can be
# created without pulling in half the schema.
#
# Its columns are DERIVED from the real model rather than listed here. They used
# to be typed out by name, which meant every column added to `Workspace` broke
# these two files with "no such column" — a hand-copied schema drifts the moment
# somebody touches the real one, and the failure lands on a test that has nothing
# to do with the change.
#
# Everything is String because nothing here reads a workspace's values; the table
# exists so the rows the agent tables reference can exist.
_workspaces_stub = Table(
    "workspaces",
    _stub_meta,
    Column("id", String, primary_key=True),
    *(
        Column(column.name, String)
        for column in Workspace.__table__.columns
        if column.name != "id"
    ),
)
_developers_stub = Table(
    "developers",
    _stub_meta,
    Column("id", String, primary_key=True),
)


_AGENT_TABLES = (
    CRMAgent.__table__,
    CRMAgentExecution.__table__,
    AgentConversation.__table__,
    AgentMessage.__table__,
)


@pytest_asyncio.fixture(scope="function")
async def preview_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(_stub_meta.create_all)
        for t in _AGENT_TABLES:
            await conn.run_sync(t.create)
    yield engine
    async with engine.begin() as conn:
        for t in reversed(_AGENT_TABLES):
            await conn.run_sync(t.drop)
        await conn.run_sync(_stub_meta.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(preview_engine):
    maker = async_sessionmaker(
        preview_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with maker() as session:
        yield session


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeAgent:
    def __init__(self, events: list[dict]):
        self._events = events

    async def astream(self, **_kwargs) -> AsyncIterator[dict]:  # noqa: ANN401
        for event in self._events:
            yield event


class _FakeBuilder:
    """Captures the `build_from_config` kwargs so the test can pin
    that `tools=[]` is passed (the preview's read-only contract)."""

    def __init__(self, events: list[dict]):
        self._events = events
        self.build_calls: list[dict] = []

    def __call__(self, *args, **kwargs):
        return self

    def build_from_config(self, **config):
        self.build_calls.append(config)
        return _FakeAgent(self._events)


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------


async def _seed_agent(db: AsyncSession, **overrides) -> CRMAgent:
    agent = CRMAgent(
        id=str(uuid4()),
        workspace_id=str(uuid4()),
        name="Test",
        agent_type="support",
        llm_provider="anthropic",
        model="claude-3-5-sonnet-20241022",
        tools=["reply", "send_email", "escalate"],  # NON-empty in prod
        is_active=True,
        is_system=False,
        **overrides,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


# ---------------------------------------------------------------------------
# Read-only invariants
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_disables_tools_even_when_agent_has_tools(monkeypatch, db_session):
    """The agent has tools configured; the preview must STILL build
    with tools=[]. This is the read-only safety invariant — previews
    cannot have side effects."""
    agent = await _seed_agent(db_session)
    builder = _FakeBuilder([
        {"type": "text_delta", "text": "ok"},
        {"type": "assistant_end", "content": "ok", "tool_calls": [], "usage_metadata": None},
    ])
    monkeypatch.setattr("aexy.services.agent_service.AgentBuilder", builder)

    service = AgentService(db_session)
    await service.preview_prompt(agent_id=agent.id, sample_input="hi")

    assert len(builder.build_calls) == 1
    cfg = builder.build_calls[0]
    # The critical invariant: tools must be the empty list even
    # though the agent record had three.
    assert cfg["tools"] == []
    # Agent's other config still flows through.
    assert cfg["llm_provider"] == "anthropic"
    assert cfg["model"] == "claude-3-5-sonnet-20241022"


@pytest.mark.asyncio
async def test_preview_does_not_persist_execution(monkeypatch, db_session):
    """Preview MUST NOT write a CRMAgentExecution row — that table
    feeds the agent's `total_executions` counters and the executions
    list. Previews are throw-away."""
    agent = await _seed_agent(db_session)
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder",
        _FakeBuilder([
            {"type": "text_delta", "text": "hello"},
            {"type": "assistant_end", "content": "hello", "tool_calls": [], "usage_metadata": None},
        ]),
    )

    service = AgentService(db_session)
    await service.preview_prompt(agent_id=agent.id, sample_input="hi")

    executions = (
        await db_session.execute(select(CRMAgentExecution))
    ).scalars().all()
    assert executions == []


@pytest.mark.asyncio
async def test_preview_does_not_persist_messages(monkeypatch, db_session):
    """Preview MUST NOT write any AgentMessage rows — those belong
    to real conversations, not throwaway test runs."""
    agent = await _seed_agent(db_session)
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder",
        _FakeBuilder([
            {"type": "text_delta", "text": "hello"},
            {"type": "assistant_end", "content": "hello", "tool_calls": [], "usage_metadata": None},
        ]),
    )

    service = AgentService(db_session)
    await service.preview_prompt(agent_id=agent.id, sample_input="hi")

    messages = (await db_session.execute(select(AgentMessage))).scalars().all()
    assert messages == []


@pytest.mark.asyncio
async def test_preview_does_not_bump_agent_counters(monkeypatch, db_session):
    """`agent.total_executions` / `agent.successful_executions` are
    feedback signals on the agent's home page. Previews mustn't
    skew those numbers."""
    agent = await _seed_agent(db_session)
    initial_total = agent.total_executions
    initial_success = agent.successful_executions
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder",
        _FakeBuilder([
            {"type": "text_delta", "text": "hello"},
            {"type": "assistant_end", "content": "hello", "tool_calls": [], "usage_metadata": None},
        ]),
    )

    service = AgentService(db_session)
    await service.preview_prompt(agent_id=agent.id, sample_input="hi")

    await db_session.refresh(agent)
    assert agent.total_executions == initial_total
    assert agent.successful_executions == initial_success


# ---------------------------------------------------------------------------
# Return shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_returns_content_and_duration(monkeypatch, db_session):
    agent = await _seed_agent(db_session)
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder",
        _FakeBuilder([
            {"type": "text_delta", "text": "Sure! "},
            {"type": "text_delta", "text": "Here you go."},
            {
                "type": "assistant_end",
                "content": "Sure! Here you go.",
                "tool_calls": [],
                "usage_metadata": {"input_tokens": 50, "output_tokens": 10, "total_tokens": 60},
            },
        ]),
    )

    service = AgentService(db_session)
    result = await service.preview_prompt(agent_id=agent.id, sample_input="hi")
    assert result["content"] == "Sure! Here you go."
    assert result["duration_ms"] >= 0
    assert result["input_tokens"] == 50
    assert result["output_tokens"] == 10
    # claude-3-5-sonnet @ ($3 / $15) per 1M: 50*3 + 10*15 = 300 / 1M
    assert result["cost_usd"] == pytest.approx(0.0003, abs=1e-6)


@pytest.mark.asyncio
async def test_preview_accumulates_streaming_text_when_no_assistant_end(
    monkeypatch, db_session
):
    """If the agent stream ends without an explicit assistant_end
    event, the preview should still surface whatever text_deltas
    arrived."""
    agent = await _seed_agent(db_session)
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder",
        _FakeBuilder([
            {"type": "text_delta", "text": "Partial"},
            {"type": "text_delta", "text": " reply"},
        ]),
    )

    service = AgentService(db_session)
    result = await service.preview_prompt(agent_id=agent.id, sample_input="hi")
    assert result["content"] == "Partial reply"
    assert result["input_tokens"] is None
    assert result["cost_usd"] is None


# ---------------------------------------------------------------------------
# Error path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_raises_on_unknown_agent(db_session):
    service = AgentService(db_session)
    with pytest.raises(ValueError, match="not found"):
        await service.preview_prompt(agent_id=str(uuid4()), sample_input="hi")


@pytest.mark.asyncio
async def test_preview_raises_on_agent_stream_error(monkeypatch, db_session):
    """If the agent stream yields {"type":"error"}, the preview lifts
    it to a RuntimeError so the endpoint can surface it as HTTP 500."""
    agent = await _seed_agent(db_session)
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder",
        _FakeBuilder([{"type": "error", "message": "rate limit"}]),
    )
    service = AgentService(db_session)
    with pytest.raises(RuntimeError, match="rate limit"):
        await service.preview_prompt(agent_id=agent.id, sample_input="hi")
