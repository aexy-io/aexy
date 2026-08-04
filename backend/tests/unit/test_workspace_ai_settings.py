"""Workspace AI governance — kill switch, BYO provider, plan gating.

The interesting behaviour is not CRUD; it is what happens at the *edges*:
a workspace with no row, a workspace that turned AI off and then downgraded, a
provider selected without a key, and a key that must never come back out of the
API.
"""

from __future__ import annotations

import os

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.plan import PlanTier
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.models.workspace_ai_settings import WorkspaceAISettings
from aexy.schemas.workspace_ai_settings import AISettingsUpdate
from aexy.services import workspace_ai_settings_service as svc
from aexy.services.workspace_ai_settings_service import (
    AIDisabledError,
    WorkspaceAISettingsService,
    ensure_ai_enabled,
    is_ai_enabled,
    resolve_ai_config,
)

_IS_SQLITE = os.environ.get("TEST_DATABASE_URL", "sqlite").startswith("sqlite")

_n = {"i": 0}


def _uniq(prefix: str) -> str:
    _n["i"] += 1
    return f"{prefix}-{_n['i']}"


@pytest.fixture
def plan_tier(monkeypatch):
    """Control the workspace's billed tier without inserting a ``Plan`` row.

    ``Plan.llm_provider_access`` is a Postgres ARRAY, which the default SQLite
    test database cannot bind — so a real plan row would make every test here
    Postgres-only. The tier lookup itself is covered separately (see
    ``test_workspace_plan_tier_reads_the_workspace_plan``, Postgres only).
    """
    state = {"tier": PlanTier.PRO.value}

    async def _fake(db, workspace_id):
        return state["tier"]

    monkeypatch.setattr(svc, "workspace_plan_tier", _fake)
    return state


async def _workspace(db: AsyncSession) -> tuple[Workspace, Developer, Developer]:
    """A workspace with an owner (admin rank) and a plain member."""
    owner = Developer(email=f"{_uniq('owner')}@example.com", name="Owner")
    member = Developer(email=f"{_uniq('member')}@example.com", name="Member")
    db.add_all([owner, member])
    await db.flush()

    slug = _uniq("ws")
    ws = Workspace(name=slug, slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()

    db.add_all(
        [
            WorkspaceMember(
                workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
            ),
            WorkspaceMember(
                workspace_id=ws.id, developer_id=member.id, role="member", status="active"
            ),
        ]
    )
    await db.flush()
    return ws, owner, member


# ----------------------------------------------------------------- defaults


@pytest.mark.asyncio
async def test_workspace_with_no_row_keeps_platform_behaviour(db_session: AsyncSession, plan_tier):
    """The absence of a row must mean "nothing changed", not "no AI"."""
    ws, owner, _ = await _workspace(db_session)

    resolved = await resolve_ai_config(db_session, ws.id)
    assert resolved.enabled is True
    assert resolved.config is None  # platform default provider
    assert resolved.source == "platform"

    view = await WorkspaceAISettingsService(db_session).get(ws.id, owner.id)
    assert view.ai_enabled is True
    assert view.has_api_key is False
    assert view.effective_source == "platform"


# --------------------------------------------------------------- kill switch


@pytest.mark.asyncio
async def test_kill_switch_disables_and_records_who(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)

    view = await service.update(
        ws.id,
        AISettingsUpdate(ai_enabled=False, disabled_reason="Pending DPA review"),
        owner.id,
    )
    assert view.ai_enabled is False
    assert view.disabled_reason == "Pending DPA review"
    assert view.disabled_at is not None
    assert view.effective_source == "disabled"

    assert await is_ai_enabled(db_session, ws.id) is False
    with pytest.raises(HTTPException) as exc:
        await ensure_ai_enabled(db_session, ws.id)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_re_enabling_clears_the_disabled_timestamp(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)

    await service.update(ws.id, AISettingsUpdate(ai_enabled=False), owner.id)
    view = await service.update(ws.id, AISettingsUpdate(ai_enabled=True), owner.id)

    assert view.ai_enabled is True
    assert view.disabled_at is None


@pytest.mark.asyncio
async def test_disabled_stays_disabled_after_a_downgrade(db_session: AsyncSession, plan_tier):
    """Editing is Pro-only; *enforcement* is not.

    A workspace whose subscription lapses must not silently resume sending its
    data to an LLM — that is the one failure mode this switch exists to prevent.
    """
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)
    await service.update(ws.id, AISettingsUpdate(ai_enabled=False), owner.id)

    plan_tier["tier"] = PlanTier.FREE.value  # subscription lapses

    assert await is_ai_enabled(db_session, ws.id) is False
    # ...and they can no longer turn it back on without upgrading.
    with pytest.raises(HTTPException) as exc:
        await service.update(ws.id, AISettingsUpdate(ai_enabled=True), owner.id)
    assert exc.value.status_code == 402


# ------------------------------------------------------------- authorization


@pytest.mark.asyncio
async def test_plain_member_cannot_change_settings(db_session: AsyncSession, plan_tier):
    ws, _, member = await _workspace(db_session)
    with pytest.raises(HTTPException) as exc:
        await WorkspaceAISettingsService(db_session).update(
            ws.id, AISettingsUpdate(ai_enabled=False), member.id
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_member_may_still_read_settings(db_session: AsyncSession, plan_tier):
    """Whether AI is on is about the member's own data — readable, not editable."""
    ws, _, member = await _workspace(db_session)
    view = await WorkspaceAISettingsService(db_session).get(ws.id, member.id)
    assert view.can_manage is False
    assert view.ai_enabled is True


@pytest.mark.asyncio
async def test_free_plan_is_refused_with_402(db_session: AsyncSession, plan_tier):
    plan_tier["tier"] = PlanTier.FREE.value
    ws, owner, _ = await _workspace(db_session)
    with pytest.raises(HTTPException) as exc:
        await WorkspaceAISettingsService(db_session).update(
            ws.id, AISettingsUpdate(ai_enabled=False), owner.id
        )
    assert exc.value.status_code == 402

    view = await WorkspaceAISettingsService(db_session).get(ws.id, owner.id)
    assert view.plan_allows is False
    assert view.plan_tier == PlanTier.FREE.value


@pytest.mark.asyncio
async def test_enterprise_plan_is_allowed(db_session: AsyncSession, plan_tier):
    plan_tier["tier"] = PlanTier.ENTERPRISE.value
    ws, owner, _ = await _workspace(db_session)
    view = await WorkspaceAISettingsService(db_session).update(
        ws.id, AISettingsUpdate(ai_enabled=False), owner.id
    )
    assert view.ai_enabled is False
    assert view.plan_allows is True


# ------------------------------------------------------- bring-your-own keys


@pytest.mark.asyncio
async def test_own_provider_resolves_with_the_decrypted_key(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    await WorkspaceAISettingsService(db_session).update(
        ws.id,
        AISettingsUpdate(provider="claude", model="claude-sonnet-4-20250514", api_key="sk-ant-secret9999"),
        owner.id,
    )

    resolved = await resolve_ai_config(db_session, ws.id)
    assert resolved.enabled is True
    assert resolved.source == "workspace"
    assert resolved.config is not None
    assert resolved.config.provider == "claude"
    assert resolved.config.model == "claude-sonnet-4-20250514"
    assert resolved.config.api_key == "sk-ant-secret9999"


@pytest.mark.asyncio
async def test_key_is_encrypted_at_rest_and_never_returned(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    view = await WorkspaceAISettingsService(db_session).update(
        ws.id, AISettingsUpdate(provider="gemini", api_key="AIza-secret-4321"), owner.id
    )

    # The response carries presence and identity, not the value.
    assert view.has_api_key is True
    assert view.key_hint == "4321"
    assert "secret" not in view.model_dump_json()

    stored = await _row(db_session, ws.id)
    assert stored.encrypted_api_key is not None
    assert "AIza-secret-4321" not in str(stored.encrypted_api_key)


@pytest.mark.asyncio
async def test_provider_that_needs_a_key_is_refused_without_one(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    with pytest.raises(HTTPException) as exc:
        await WorkspaceAISettingsService(db_session).update(
            ws.id, AISettingsUpdate(provider="openrouter"), owner.id
        )
    assert exc.value.status_code == 400
    assert "API key" in exc.value.detail


@pytest.mark.asyncio
async def test_self_hosted_provider_needs_no_key(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    view = await WorkspaceAISettingsService(db_session).update(
        ws.id,
        AISettingsUpdate(provider="ollama", base_url="http://ollama.internal:11434", model="llama3"),
        owner.id,
    )
    assert view.provider == "ollama"
    assert view.has_api_key is False
    assert view.effective_source == "workspace"


@pytest.mark.asyncio
async def test_model_can_be_changed_without_re_pasting_the_key(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)
    await service.update(
        ws.id, AISettingsUpdate(provider="claude", api_key="sk-ant-keep-me"), owner.id
    )
    view = await service.update(ws.id, AISettingsUpdate(model="claude-opus-4"), owner.id)

    assert view.model == "claude-opus-4"
    assert view.has_api_key is True
    resolved = await resolve_ai_config(db_session, ws.id)
    assert resolved.config.api_key == "sk-ant-keep-me"


@pytest.mark.asyncio
async def test_clearing_the_provider_also_removes_the_credential(db_session: AsyncSession, plan_tier):
    """An orphaned key installed against no provider is exactly the leftover
    nobody remembers to clean up."""
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)
    await service.update(
        ws.id, AISettingsUpdate(provider="claude", api_key="sk-ant-gone"), owner.id
    )

    view = await service.update(ws.id, AISettingsUpdate(clear_provider=True), owner.id)
    assert view.provider is None
    assert view.has_api_key is False
    assert view.effective_source == "platform"

    stored = await _row(db_session, ws.id)
    assert stored.encrypted_api_key is None
    assert stored.key_hint is None


@pytest.mark.asyncio
async def test_empty_api_key_string_clears_the_stored_credential(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)
    await service.update(
        ws.id, AISettingsUpdate(provider="ollama", base_url="http://x:1", api_key="tok"), owner.id
    )
    view = await service.update(ws.id, AISettingsUpdate(api_key=""), owner.id)
    assert view.has_api_key is False


@pytest.mark.asyncio
async def test_own_provider_without_a_usable_key_does_not_leak_onto_platform_keys(db_session: AsyncSession, plan_tier):
    """The default must be "stop", not "quietly use ours".

    An org configures its own key precisely so its prompts do not travel through
    the platform account; falling back by default would defeat that silently.
    """
    ws, owner, _ = await _workspace(db_session)
    await WorkspaceAISettingsService(db_session).update(
        ws.id, AISettingsUpdate(provider="claude", api_key="sk-ant-x"), owner.id
    )
    stored = await _row(db_session, ws.id)
    stored.encrypted_api_key = None  # simulate a key we can no longer read
    await db_session.flush()

    resolved = await resolve_ai_config(db_session, ws.id)
    assert resolved.enabled is False
    assert resolved.source == "disabled"


@pytest.mark.asyncio
async def test_platform_fallback_is_honoured_when_explicitly_opted_into(db_session: AsyncSession, plan_tier):
    ws, owner, _ = await _workspace(db_session)
    service = WorkspaceAISettingsService(db_session)
    await service.update(
        ws.id,
        AISettingsUpdate(provider="claude", api_key="sk-ant-y", allow_platform_fallback=True),
        owner.id,
    )
    stored = await _row(db_session, ws.id)
    stored.encrypted_api_key = None
    await db_session.flush()

    resolved = await resolve_ai_config(db_session, ws.id)
    assert resolved.enabled is True
    assert resolved.config is None
    assert resolved.source == "platform"


# ------------------------------------------------------------ gateway wiring


@pytest.mark.asyncio
async def test_gateway_refuses_a_disabled_workspace(monkeypatch):
    """The gateway is the choke point, so this is the test that matters most:
    every AI feature routes through it, including Temporal activities."""
    from aexy.llm.gateway import LLMGateway
    from aexy.services.workspace_ai_settings_service import WorkspaceAIConfig

    gateway = LLMGateway(provider=object())

    async def _disabled(self, workspace_id):
        return WorkspaceAIConfig(False, None, False, "disabled")

    monkeypatch.setattr(LLMGateway, "_workspace_ai", _disabled)

    with pytest.raises(AIDisabledError):
        await gateway._resolve_provider("ws-1")
    with pytest.raises(AIDisabledError):
        await gateway._ensure_ai_enabled("ws-1")


@pytest.mark.asyncio
async def test_gateway_without_workspace_context_is_unchanged(monkeypatch):
    """Platform-level analysis has no workspace to consult and must not break."""
    from aexy.llm.gateway import LLMGateway

    platform = object()
    gateway = LLMGateway(provider=platform)

    async def _boom(self, workspace_id):  # must never be reached
        raise AssertionError("workspace settings consulted without a workspace")

    monkeypatch.setattr(LLMGateway, "_workspace_ai", _boom)

    assert await gateway._resolve_provider(None) is platform
    await gateway._ensure_ai_enabled(None)


@pytest.mark.asyncio
async def test_gateway_uses_the_platform_provider_when_none_is_configured(monkeypatch):
    from aexy.llm.gateway import LLMGateway
    from aexy.services.workspace_ai_settings_service import WorkspaceAIConfig

    platform = object()
    gateway = LLMGateway(provider=platform)

    async def _platform(self, workspace_id):
        return WorkspaceAIConfig(True, None, True, "platform")

    monkeypatch.setattr(LLMGateway, "_workspace_ai", _platform)
    assert await gateway._resolve_provider("ws-1") is platform


def test_provider_instances_are_reused_but_rotate_with_the_key():
    """Each provider owns an httpx client, so building one per call would leak
    a connection pool per LLM call."""
    from aexy.llm.base import LLMConfig
    from aexy.llm.gateway import _provider_for_config

    a = LLMConfig(provider="ollama", model="llama3", base_url="http://x:11434")
    b = LLMConfig(provider="ollama", model="llama3", base_url="http://x:11434")
    assert _provider_for_config(a) is _provider_for_config(b)

    rotated = LLMConfig(
        provider="ollama", model="llama3", base_url="http://x:11434", api_key="new"
    )
    assert _provider_for_config(rotated) is not _provider_for_config(a)


# ------------------------------------------------------------ tier resolution


@pytest.mark.asyncio
async def test_unknown_workspace_has_no_tier(db_session: AsyncSession):
    """A missing workspace must resolve to "no tier", not raise: the settings
    read is reachable with any id from the URL."""
    assert await svc.workspace_plan_tier(db_session, "00000000-0000-0000-0000-000000000000") is None


@pytest.mark.skipif(
    _IS_SQLITE,
    reason="Plan.llm_provider_access is a Postgres ARRAY; run with TEST_DATABASE_URL=<pg dsn>",
)
@pytest.mark.asyncio
async def test_workspace_plan_tier_reads_the_workspace_plan(db_session: AsyncSession):
    from aexy.models.plan import Plan

    owner = Developer(email=f"{_uniq('o')}@example.com", name="O")
    db_session.add(owner)
    await db_session.flush()

    plan = Plan(
        name=_uniq("plan"),
        tier=PlanTier.ENTERPRISE.value,
        max_repos=10,
        max_commits_per_repo=100,
        max_prs_per_repo=50,
        sync_history_days=30,
        llm_requests_per_day=100,
        llm_requests_per_minute=10,
        llm_tokens_per_minute=10000,
    )
    db_session.add(plan)
    await db_session.flush()

    slug = _uniq("ws")
    ws = Workspace(name=slug, slug=slug, owner_id=owner.id, plan_id=plan.id)
    db_session.add(ws)
    await db_session.flush()

    assert await svc.workspace_plan_tier(db_session, ws.id) == PlanTier.ENTERPRISE.value


# ------------------------------------------------------------------- helpers


async def _row(db: AsyncSession, workspace_id: str) -> WorkspaceAISettings:
    from sqlalchemy import select

    return (
        await db.execute(
            select(WorkspaceAISettings).where(
                WorkspaceAISettings.workspace_id == workspace_id
            )
        )
    ).scalar_one()


def test_default_model_does_not_cross_providers(monkeypatch):
    """A workspace that picks Claude on a Gemini deployment must not be handed
    the Gemini model name — the API answers "model not found", which reads as a
    bug in the feature rather than a misconfiguration."""
    from types import SimpleNamespace

    from aexy.core import config as core_config

    monkeypatch.setattr(
        core_config,
        "get_settings",
        lambda: SimpleNamespace(
            llm=SimpleNamespace(
                llm_provider="gemini",
                llm_model="gemini-2.0-flash",
                lmstudio_model="qwen/qwen3.5-9b",
            )
        ),
    )

    assert svc._default_model_for("claude") == ""  # provider fills in its own
    assert svc._default_model_for("gemini") == "gemini-2.0-flash"
    assert svc._default_model_for("lmstudio") == "qwen/qwen3.5-9b"
