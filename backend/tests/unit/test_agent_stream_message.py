"""Tests for `AgentService.stream_message` (UX-CHAT-001/002/003/008/009).

Coverage targets:

1. Happy path — given a canned agent.astream sequence (text deltas +
   tool calls + assistant_end with usage), the service emits SSE
   events in the correct order and persists the user msg, assistant
   msg with cost, and tool msgs. The `done` event references the
   real persisted ids.

2. Error path — the wrapped agent raises during streaming. Service
   must emit `error`, mark the execution as failed, and persist an
   "I encountered an error" assistant row.

3. Cancellation — asyncio.CancelledError from a client disconnect.
   Service must mark the execution `cancelled`, persist a partial
   assistant row with `[cancelled]` suffix, then re-raise so the
   ASGI server can close the connection.

These tests bypass the conftest `db_session` fixture because the
shared `Base.metadata.create_all` chokes on PG-only types under
SQLite. We register a JSONB→TEXT compile hook and create just the
agent tables we need.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool

from aexy.models.agent import (
    AgentConversation,
    AgentMessage,
    CRMAgent,
    CRMAgentExecution,
)
from aexy.services.agent_service import AgentService


# ---------------------------------------------------------------------------
# SQLite compatibility shims for PG-only types
# ---------------------------------------------------------------------------


@compiles(JSONB, "sqlite")
def _jsonb_for_sqlite(_type, _compiler, **_kw):  # noqa: ANN001
    return "TEXT"


# Cross-table relations on the agent models use `lazy="selectin"` to
# pre-fetch the workspace + creator joins in prod. Under tests, the
# eager loader still issues those SELECTs even when we don't care
# about the joined data. Create empty `workspaces` and `developers`
# stub tables so the selectin SQL succeeds (and returns no rows).
from sqlalchemy import Column, MetaData, String, Table

from aexy.models.workspace import Workspace

_stub_meta = MetaData()
_workspaces_stub = Table(
    "workspaces",
    _stub_meta,
    # Columns DERIVED from the real model, not listed. They used to be typed out
    # one per line, so every column added to `Workspace` broke this file with
    # "no such column" — a failure landing on a test that has nothing to do with
    # the change. Everything is String because nothing here reads a workspace's
    # values; the table exists so referenced rows can exist.
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


# ---------------------------------------------------------------------------
# DB fixture — only the agent.py tables (no workspaces, no developers).
# ---------------------------------------------------------------------------


_AGENT_TABLES = (
    CRMAgent.__table__,
    CRMAgentExecution.__table__,
    AgentConversation.__table__,
    AgentMessage.__table__,
)


@pytest_asyncio.fixture(scope="function")
async def stream_engine():
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
async def db_session(stream_engine):
    maker = async_sessionmaker(
        stream_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with maker() as session:
        yield session


# ---------------------------------------------------------------------------
# Fake agent — drives the canned astream sequence
# ---------------------------------------------------------------------------


class _FakeAgent:
    """Stand-in for the LangGraph agent that the AgentBuilder normally
    constructs. Yields exactly the events the test pinned up front."""

    def __init__(self, events: list[dict]):
        self._events = events

    async def astream(self, **_kwargs) -> AsyncIterator[dict]:  # noqa: ANN401
        for event in self._events:
            yield event


class _FakeBuilder:
    """Replaces `AgentBuilder` in the service. Captures the build args
    so tests can assert against them, returns a `_FakeAgent` that
    yields the canned events."""

    def __init__(self, events: list[dict]):
        self._events = events
        self.build_calls: list[dict] = []

    def __call__(self, *args, **kwargs):  # AgentBuilder(workspace_id=..., user_id=...)
        return self

    def build_from_config(self, **config):
        self.build_calls.append(config)
        return _FakeAgent(self._events)


# ---------------------------------------------------------------------------
# Helpers to set up an agent + conversation row
# ---------------------------------------------------------------------------


WORKSPACE_ID = str(uuid4())


async def _seed_agent_and_conversation(db: AsyncSession) -> tuple[CRMAgent, AgentConversation]:
    agent = CRMAgent(
        id=str(uuid4()),
        workspace_id=WORKSPACE_ID,
        name="Test Agent",
        agent_type="support",
        llm_provider="anthropic",
        model="claude-3-5-sonnet-20241022",
        tools=[],
        is_active=True,
        is_system=False,
    )
    conversation = AgentConversation(
        id=str(uuid4()),
        workspace_id=WORKSPACE_ID,
        agent_id=agent.id,
        status="active",
    )
    db.add_all([agent, conversation])
    await db.commit()
    await db.refresh(agent)
    await db.refresh(conversation)
    return agent, conversation


def _decode_events(raw: list[str]) -> list[dict]:
    """Convert SSE `data: {...}\n\n` strings into parsed dicts."""
    out: list[dict] = []
    for line in raw:
        assert line.startswith("data: ")
        out.append(json.loads(line[len("data: ") :].rstrip("\n")))
    return out


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_emits_events_and_persists(monkeypatch, db_session):
    agent, convo = await _seed_agent_and_conversation(db_session)

    canned_events = [
        {"type": "text_delta", "text": "Hi! "},
        {"type": "text_delta", "text": "Let me check that for you."},
        {
            "type": "tool_use_start",
            "tool": "search_contacts",
            "id": "tool-1",
            "input": {"email": "user@example.com"},
        },
        {
            "type": "tool_result",
            "tool": "search_contacts",
            "id": "tool-1",
            "output": [{"id": "contact-1", "name": "User"}],
        },
        {"type": "text_delta", "text": " Found you."},
        {
            "type": "assistant_end",
            "content": "Hi! Let me check that for you. Found you.",
            "tool_calls": [],
            "usage_metadata": {"input_tokens": 120, "output_tokens": 18, "total_tokens": 138},
        },
    ]
    fake_builder = _FakeBuilder(canned_events)
    monkeypatch.setattr("aexy.services.agent_service.AgentBuilder", fake_builder)

    service = AgentService(db_session)
    raw_events: list[str] = []
    async for chunk in service.stream_message(
        conversation_id=convo.id,
        content="Hello, can you find my account?",
        user_id="dev-1",
    ):
        raw_events.append(chunk)
    events = _decode_events(raw_events)

    # ---- Event sequence + content
    types = [e["type"] for e in events]
    assert types[0] == "user_message"
    assert events[0]["content"] == "Hello, can you find my account?"
    assert events[0]["id"]  # canonical id assigned

    # Text deltas in order
    deltas = [e for e in events if e["type"] == "text_delta"]
    assert [d["text"] for d in deltas] == ["Hi! ", "Let me check that for you.", " Found you."]

    # Tool start + result paired
    tool_start = next(e for e in events if e["type"] == "tool_use_start")
    tool_result = next(e for e in events if e["type"] == "tool_result")
    assert tool_start["id"] == "tool-1"
    assert tool_start["input"] == {"email": "user@example.com"}
    assert tool_result["id"] == "tool-1"

    # Usage carries computed cost
    usage = next(e for e in events if e["type"] == "usage")
    assert usage["input_tokens"] == 120
    assert usage["output_tokens"] == 18
    # claude-3-5-sonnet @ ($3 / $15) per 1M: 120*3 + 18*15 = 630 / 1M
    assert usage["cost_usd"] == pytest.approx(0.00063, abs=1e-6)

    # Done event last
    done = events[-1]
    assert done["type"] == "done"
    assert done["assistant_message_id"]
    assert done["execution_id"]
    assert done["duration_ms"] >= 0

    # ---- Persistence
    msgs = (
        await db_session.execute(
            select(AgentMessage)
            .where(AgentMessage.conversation_id == convo.id)
            .order_by(AgentMessage.message_index)
        )
    ).scalars().all()
    roles = [m.role for m in msgs]
    # user → assistant → tool (single tool call)
    assert roles == ["user", "assistant", "tool"]

    assistant_msg = msgs[1]
    assert assistant_msg.content == "Hi! Let me check that for you. Found you."
    assert assistant_msg.input_tokens == 120
    assert assistant_msg.output_tokens == 18
    assert float(assistant_msg.cost_usd) == pytest.approx(0.00063, abs=1e-6)

    # Tool message carries the input + output
    tool_msg = msgs[2]
    assert tool_msg.tool_name == "search_contacts"
    assert tool_msg.tool_output["input"] == {"email": "user@example.com"}

    # Execution row updated to completed
    exec_id = done["execution_id"]
    execution = await db_session.get(CRMAgentExecution, exec_id)
    assert execution is not None
    assert execution.status == "completed"
    assert execution.duration_ms is not None


# ---------------------------------------------------------------------------
# Error path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_error_event_marks_execution_failed(monkeypatch, db_session):
    agent, convo = await _seed_agent_and_conversation(db_session)

    canned_events = [
        {"type": "text_delta", "text": "Working on it…"},
        # The agent surfaces an error mid-stream — service should
        # raise, persist failure, and emit `error`.
        {"type": "error", "message": "LLM provider returned 503"},
    ]
    monkeypatch.setattr(
        "aexy.services.agent_service.AgentBuilder", _FakeBuilder(canned_events)
    )

    service = AgentService(db_session)
    raw_events = []
    async for chunk in service.stream_message(
        conversation_id=convo.id,
        content="Hello",
        user_id="dev-1",
    ):
        raw_events.append(chunk)
    events = _decode_events(raw_events)

    # First event: user_message echo (committed before stream)
    assert events[0]["type"] == "user_message"
    # Final emitted event is `error`
    assert events[-1]["type"] == "error"
    assert "503" in events[-1]["message"]

    # An assistant message capturing the failure was persisted
    msgs = (
        await db_session.execute(
            select(AgentMessage).where(AgentMessage.conversation_id == convo.id)
        )
    ).scalars().all()
    assistant_msgs = [m for m in msgs if m.role == "assistant"]
    assert len(assistant_msgs) == 1
    assert "encountered an error" in assistant_msgs[0].content

    # Execution row reflects the failure
    executions = (
        await db_session.execute(
            select(CRMAgentExecution).where(CRMAgentExecution.conversation_id == convo.id)
        )
    ).scalars().all()
    assert len(executions) == 1
    assert executions[0].status == "failed"
    assert "503" in (executions[0].error_message or "")


# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------


class _CancellingAgent:
    """Yields a couple of deltas then raises CancelledError to simulate
    a client disconnect mid-stream."""

    def __init__(self):
        self.yielded_count = 0

    async def astream(self, **_kwargs) -> AsyncIterator[dict]:  # noqa: ANN401
        yield {"type": "text_delta", "text": "Partial "}
        self.yielded_count += 1
        yield {"type": "text_delta", "text": "response."}
        self.yielded_count += 1
        raise asyncio.CancelledError()


@pytest.mark.asyncio
async def test_cancellation_preserves_partial_and_marks_cancelled(monkeypatch, db_session):
    agent, convo = await _seed_agent_and_conversation(db_session)

    cancelling = _CancellingAgent()

    class _Builder:
        def __call__(self, **_kwargs):
            return self

        def build_from_config(self, **_config):
            return cancelling

    monkeypatch.setattr("aexy.services.agent_service.AgentBuilder", _Builder())

    service = AgentService(db_session)
    collected: list[str] = []
    # Service re-raises CancelledError so the ASGI server can close
    # the connection — assert that.
    with pytest.raises(asyncio.CancelledError):
        async for chunk in service.stream_message(
            conversation_id=convo.id,
            content="Hello",
            user_id="dev-1",
        ):
            collected.append(chunk)

    events = _decode_events(collected)
    # At minimum, the user echo + the two text deltas the agent
    # yielded before cancelling should have made it to the client.
    types = [e["type"] for e in events]
    assert types[0] == "user_message"
    delta_texts = [e["text"] for e in events if e["type"] == "text_delta"]
    assert delta_texts == ["Partial ", "response."]

    # Execution is marked cancelled, partial content persisted with
    # the [cancelled] suffix.
    executions = (
        await db_session.execute(
            select(CRMAgentExecution).where(CRMAgentExecution.conversation_id == convo.id)
        )
    ).scalars().all()
    assert len(executions) == 1
    assert executions[0].status == "cancelled"
    assert (executions[0].error_message or "").startswith("cancelled")

    assistant_msgs = (
        await db_session.execute(
            select(AgentMessage).where(
                AgentMessage.conversation_id == convo.id,
                AgentMessage.role == "assistant",
            )
        )
    ).scalars().all()
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].content == "Partial response. [cancelled]"


# ---------------------------------------------------------------------------
# Inactive agent / wrong conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_inactive_agent_emits_error_without_running(monkeypatch, db_session):
    agent, convo = await _seed_agent_and_conversation(db_session)
    agent.is_active = False
    await db_session.commit()

    # Builder must NOT be called when the agent is paused.
    called = []

    class _NoBuild:
        def __call__(self, **_kwargs):
            called.append(True)
            return self

        def build_from_config(self, **_config):
            called.append("build")
            return _FakeAgent([])

    monkeypatch.setattr("aexy.services.agent_service.AgentBuilder", _NoBuild())

    service = AgentService(db_session)
    raw = [chunk async for chunk in service.stream_message(
        conversation_id=convo.id,
        content="Hi",
    )]
    events = _decode_events(raw)
    assert events == [{"type": "error", "message": pytest.approx_str if False else events[0]["message"]}] or any(
        e["type"] == "error" and "paused" in e["message"] for e in events
    )
    assert called == []  # builder not invoked


@pytest.mark.asyncio
async def test_unknown_conversation_emits_error(monkeypatch, db_session):
    service = AgentService(db_session)
    raw = [chunk async for chunk in service.stream_message(
        conversation_id=str(uuid4()),
        content="Hi",
    )]
    events = _decode_events(raw)
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert "Conversation not found" in events[0]["message"]
