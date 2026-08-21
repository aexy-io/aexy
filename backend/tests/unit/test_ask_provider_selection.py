"""Regression: the Ask chat must honour the configured provider — and the workspace.

Original bug: ``AskService`` ignored ``settings.llm.llm_provider`` and auto-picked
the first available API key in the order Anthropic > OpenAI > Gemini. A
deployment configured for ``deepseek`` therefore called Gemini, and when the
Gemini key was suspended, AI chat silently failed to stream anything.

Ask no longer resolves its own provider. It reads ``llm/resolution``, the same
function the gateway and the agents read, which is what finally makes the
workspace AI kill switch and bring-your-own-key apply here — they never did
before, because this service never asked.

Two behaviour changes worth stating, both improvements:

* ``_auto_detect`` is gone. "First available key wins" was the original bug in a
  different costume: a deployment set to DeepSeek with no DeepSeek key now gets a
  refusal it can act on, instead of a bill on somebody else's provider.
* The resolution happens per request rather than at construction, because which
  model and whose credential are workspace decisions.
"""

from __future__ import annotations

import types

import pytest

from aexy.llm import resolution as res
from aexy.llm.resolution import LLMNotConfigured
from aexy.services.ask_service import (
    DEEPSEEK_API_URL,
    OPENAI_API_URL,
    OPENROUTER_API_URL,
    AskService,
)
from aexy.services.workspace_ai_settings_service import AIDisabledError

WORKSPACE = "11111111-1111-1111-1111-111111111111"


def _llm(**overrides):
    base = dict(
        llm_provider="",
        llm_model="",
        openai_api_key="",
        openai_model="",
        gemini_api_key="",
        gemini_model="",
        deepseek_api_key="",
        deepseek_fallback_models="",
        openrouter_api_key="",
        openrouter_model="",
        openrouter_fallback_models="",
        ollama_base_url="http://localhost:11434",
        ollama_model="",
        lmstudio_base_url="http://localhost:1234/v1",
        lmstudio_model="qwen/qwen3.5-9b",
        lmstudio_api_key="",
        anthropic_api_key="",
        max_tokens_per_request=4096,
    )
    base.update(overrides)
    return types.SimpleNamespace(**base)


@pytest.fixture
def env(monkeypatch):
    """Point the resolver's platform config at settings under test control."""

    def build(**overrides):
        settings = types.SimpleNamespace(llm=_llm(**overrides))
        monkeypatch.setattr(
            "aexy.core.config.get_settings", lambda: settings, raising=False
        )

    return build


@pytest.fixture
def no_workspace_settings(monkeypatch):
    """A workspace with AI on and no provider of its own, and no overrides."""

    class _WorkspaceAI:
        enabled = True
        config = None
        allow_platform_fallback = False

    async def _ws(_workspace_id: str):
        return _WorkspaceAI()

    async def _ov(_workspace_id: str):
        return {}

    monkeypatch.setattr(res, "_workspace_ai_config", _ws)
    monkeypatch.setattr(res, "_overrides_for", _ov)


async def _resolve(env_kwargs: dict) -> AskService:
    service = AskService(db=None)  # type: ignore[arg-type]
    error = await service._resolve(WORKSPACE)
    assert error is None, error
    return service


class TestProviderIsHonoured:
    async def test_deepseek_is_honoured_over_an_available_gemini_key(
        self, env, no_workspace_settings
    ) -> None:
        # The exact production scenario: provider=deepseek, and a Gemini key is
        # also set. The old behaviour picked Gemini.
        env(
            llm_provider="deepseek",
            llm_model="deepseek-chat",
            deepseek_api_key="dk",
            gemini_api_key="gk",
        )
        service = await _resolve({})
        assert service._provider == "openai"
        assert service._api_key == "dk"
        assert service._model == "deepseek-chat"
        assert service._api_url == DEEPSEEK_API_URL

    async def test_claude_uses_the_anthropic_path(
        self, env, no_workspace_settings
    ) -> None:
        env(
            llm_provider="claude",
            llm_model="claude-sonnet-4-20250514",
            anthropic_api_key="ak",
        )
        service = await _resolve({})
        assert service._provider == "anthropic"
        assert service._api_key == "ak"
        assert service._model == "claude-sonnet-4-20250514"

    async def test_openrouter_routes_through_the_openai_path(
        self, env, no_workspace_settings
    ) -> None:
        env(
            llm_provider="openrouter",
            openrouter_api_key="ok",
            openrouter_model="openai/gpt-4o",
        )
        service = await _resolve({})
        assert service._provider == "openai"
        assert service._api_url == OPENROUTER_API_URL

    async def test_openai_uses_the_openai_url(
        self, env, no_workspace_settings
    ) -> None:
        env(llm_provider="openai", openai_api_key="ok", openai_model="gpt-4o-mini")
        service = await _resolve({})
        assert service._api_url == OPENAI_API_URL

    async def test_lmstudio_needs_no_key_and_uses_its_local_url(
        self, env, no_workspace_settings
    ) -> None:
        env(llm_provider="lmstudio")
        service = await _resolve({})
        assert service._provider == "openai"
        # Non-empty placeholder, so the Authorization header stays valid.
        assert service._api_key
        assert service._api_url == "http://localhost:1234/v1/chat/completions"


class TestRefusals:
    async def test_a_configured_provider_with_no_key_refuses_rather_than_switching(
        self, env, no_workspace_settings
    ) -> None:
        # The behaviour change, and the point of it: silently answering on a
        # different provider's key is the original bug wearing a fallback's
        # clothes. A refusal is something an operator can act on.
        env(llm_provider="deepseek", gemini_api_key="gk")
        service = AskService(db=None)  # type: ignore[arg-type]
        error = await service._resolve(WORKSPACE)
        assert error == "No LLM API key configured"
        assert service._provider == "none"

    async def test_nothing_configured_at_all_refuses(
        self, env, no_workspace_settings
    ) -> None:
        env(llm_provider="claude")
        service = AskService(db=None)  # type: ignore[arg-type]
        assert await service._resolve(WORKSPACE) == "No LLM API key configured"

    @pytest.mark.parametrize(
        "provider", ["deepseek", "openai", "gemini", "openrouter"]
    )
    async def test_every_keyed_provider_refuses_without_its_key(
        self, env, no_workspace_settings, provider: str
    ) -> None:
        env(llm_provider=provider)
        service = AskService(db=None)  # type: ignore[arg-type]
        assert await service._resolve(WORKSPACE) is not None

    async def test_an_unknown_provider_is_refused(
        self, env, no_workspace_settings
    ) -> None:
        env(llm_provider="totally-made-up")
        service = AskService(db=None)  # type: ignore[arg-type]
        assert await service._resolve(WORKSPACE) == "No LLM API key configured"


class TestWorkspaceGovernance:
    async def test_a_workspace_with_ai_off_is_refused(self, env, monkeypatch) -> None:
        # The regression test for the hole this closes. Ask used to resolve from
        # the environment alone and never asked whether AI was allowed, so an
        # organisation that switched AI off still had Ask answering.
        env(llm_provider="claude", anthropic_api_key="ak")

        class _Off:
            enabled = False
            config = None
            allow_platform_fallback = False

        async def _ws(_workspace_id: str):
            return _Off()

        monkeypatch.setattr(res, "_workspace_ai_config", _ws)

        service = AskService(db=None)  # type: ignore[arg-type]
        error = await service._resolve(WORKSPACE)
        assert error is not None
        assert "switched off" in error

    async def test_a_workspace_credential_is_used_over_the_platform(
        self, env, monkeypatch
    ) -> None:
        env(llm_provider="claude", anthropic_api_key="platform-key")

        class _Own:
            enabled = True
            config = res.LLMConfig(
                provider="openai", model="gpt-4o", api_key="workspace-key"
            )
            allow_platform_fallback = False

        async def _ws(_workspace_id: str):
            return _Own()

        async def _ov(_workspace_id: str):
            return {}

        monkeypatch.setattr(res, "_workspace_ai_config", _ws)
        monkeypatch.setattr(res, "_overrides_for", _ov)

        service = await _resolve({})
        assert service._api_key == "workspace-key"
        assert service._model == "gpt-4o"

    async def test_a_model_override_for_ask_is_applied(
        self, env, monkeypatch
    ) -> None:
        env(llm_provider="claude", anthropic_api_key="ak", llm_model="claude-sonnet-5")

        class _On:
            enabled = True
            config = None
            allow_platform_fallback = False

        async def _ws(_workspace_id: str):
            return _On()

        async def _ov(_workspace_id: str):
            return {
                ("feature", "agents.ask"): res._Override(
                    model="claude-opus-5", provider="claude", scope="feature"
                )
            }

        monkeypatch.setattr(res, "_workspace_ai_config", _ws)
        monkeypatch.setattr(res, "_overrides_for", _ov)

        service = await _resolve({})
        assert service._model == "claude-opus-5"


class TestTheAutoDetectFallbackIsGone:
    def test_auto_detect_no_longer_exists(self) -> None:
        # "First available key wins" was the bug this file was written about.
        assert not hasattr(AskService, "_auto_detect")

    def test_platform_config_refuses_rather_than_guessing(self, env) -> None:
        env(llm_provider="deepseek", gemini_api_key="gk")
        with pytest.raises(LLMNotConfigured):
            res.platform_config()


def test_disabled_error_is_importable() -> None:
    # Guards the import the service relies on to distinguish "off" from "unset".
    assert issubclass(AIDisabledError, Exception)
