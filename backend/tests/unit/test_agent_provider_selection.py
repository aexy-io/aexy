"""Regression: every provider must build the right client, and none may guess.

Original bug: ``BaseAgent.llm`` handled only ``gemini`` and ``lmstudio``; every
other provider fell through to ``else -> ChatAnthropic``, so an agent configured
for ``deepseek`` actually ran on Claude and failed when no Anthropic key was
present.

The mapping those tests pinned has since moved. It used to live in three
near-identical copies — ``BaseAgent._plan_llm``, ``AskService._resolve_provider``
and ``get_llm_gateway`` — each with its own per-provider defaults, which is how
one of them ended up forcing ``gemini-1.5-pro`` whenever a configured model name
did not start with ``gemini``. There is now one copy, in ``llm/resolution``, and
these tests pin it there.

The last two tests are the ones that keep it that way.
"""

from __future__ import annotations

import types

import pytest

from aexy.agents.base import BaseAgent
from aexy.llm import resolution as res
from aexy.llm.resolution import LLMNotConfigured
from aexy.services.ask_service import AskService


def _llm_settings(**overrides):
    base = dict(
        llm_provider="claude",
        llm_model="claude-sonnet-5",
        gemini_api_key="gk",
        anthropic_api_key="ak",
        openai_api_key="ok",
        openai_model="gpt-4o-mini",
        deepseek_api_key="dk",
        deepseek_fallback_models="",
        openrouter_api_key="ork",
        openrouter_model="openai/gpt-4o",
        openrouter_fallback_models="",
        ollama_base_url="http://localhost:11434",
        ollama_model="codellama:13b",
        lmstudio_base_url="http://localhost:1234/v1",
        lmstudio_model="qwen/qwen3.5-9b",
        lmstudio_api_key="",
        max_tokens_per_request=4096,
    )
    base.update(overrides)
    return types.SimpleNamespace(**base)


@pytest.fixture
def platform(monkeypatch):
    """Point ``platform_config`` at a settings object under test control."""

    def build(provider: str, **overrides):
        settings = types.SimpleNamespace(
            llm=_llm_settings(llm_provider=provider, **overrides)
        )
        monkeypatch.setattr(
            "aexy.core.config.get_settings", lambda: settings, raising=False
        )
        return res.platform_config()

    return build


class TestProviderMapping:
    def test_deepseek_uses_the_openai_family_and_its_own_base(self, platform) -> None:
        config = platform("deepseek")
        assert res.family_for(config.provider) == "openai"
        api_base, chat_url = res._endpoints(config.provider, config.base_url)
        assert api_base == "https://api.deepseek.com"
        assert chat_url == "https://api.deepseek.com/chat/completions"
        assert config.api_key == "dk"

    def test_openrouter_uses_the_openai_family_and_its_own_base(
        self, platform
    ) -> None:
        config = platform("openrouter")
        assert res.family_for(config.provider) == "openai"
        assert res._endpoints(config.provider, None)[0] == (
            "https://openrouter.ai/api/v1"
        )
        assert config.api_key == "ork"
        assert config.model == "openai/gpt-4o"

    def test_openai_uses_its_own_model_setting(self, platform) -> None:
        config = platform("openai")
        assert (config.api_key, config.model) == ("ok", "gpt-4o-mini")
        assert res._endpoints(config.provider, None)[0] == "https://api.openai.com/v1"

    def test_ollama_speaks_openai_under_v1(self, platform) -> None:
        config = platform("ollama")
        assert res.family_for(config.provider) == "openai"
        assert res._endpoints(config.provider, config.base_url)[0] == (
            "http://localhost:11434/v1"
        )
        # Ollama ignores the key, but an OpenAI-shaped client insists on one.
        assert config.api_key == "ollama"
        assert config.model == "codellama:13b"

    def test_lmstudio_uses_its_configured_base_url(self, platform) -> None:
        config = platform("lmstudio")
        assert res.family_for(config.provider) == "openai"
        assert res._endpoints(config.provider, config.base_url)[0] == (
            "http://localhost:1234/v1"
        )
        assert config.model == "qwen/qwen3.5-9b"

    def test_gemini_and_claude_keep_their_own_families(self, platform) -> None:
        assert res.family_for(platform("gemini").provider) == "gemini"
        assert res.family_for(platform("claude").provider) == "anthropic"
        assert res.family_for("anthropic") == "anthropic"

    def test_an_unknown_provider_raises_rather_than_masquerading_as_claude(
        self,
    ) -> None:
        with pytest.raises(LLMNotConfigured):
            res.family_for("totally-made-up")

    def test_a_provider_with_no_key_is_refused_rather_than_half_built(
        self, platform
    ) -> None:
        # The old code returned None from get_llm_gateway and left every caller
        # to discover that separately.
        with pytest.raises(LLMNotConfigured, match="No API key"):
            platform("openai", openai_api_key="")


class TestAgentModelOverride:
    async def test_an_agents_own_model_is_used_when_the_provider_matches(
        self, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            res,
            "platform_config",
            lambda: res.LLMConfig(
                provider="deepseek", model="deepseek-chat", api_key="dk"
            ),
        )
        resolved = await res.resolve_llm(
            None, "agents.run",
            instance_model="deepseek-reasoner",
            instance_provider="deepseek",
        )
        assert resolved.model == "deepseek-reasoner"
        assert resolved.source == "instance"

    async def test_an_agents_model_for_another_provider_is_ignored(
        self, monkeypatch
    ) -> None:
        # An agent configured for Gemini inside a workspace on Claude runs on
        # Claude: whose credential pays is the workspace's decision, and the
        # agent's provider is only there to say which API its model id belongs to.
        monkeypatch.setattr(
            res,
            "platform_config",
            lambda: res.LLMConfig(
                provider="claude", model="claude-sonnet-5", api_key="ak"
            ),
        )
        resolved = await res.resolve_llm(
            None, "agents.run",
            instance_model="gemini-1.5-pro",
            instance_provider="gemini",
        )
        assert resolved.model == "claude-sonnet-5"
        assert resolved.ignored_override is not None
        assert "gemini" in resolved.ignored_override

    async def test_an_agent_with_no_model_inherits(self, monkeypatch) -> None:
        # The old default was a hardcoded Claude id Anthropic had retired, so
        # every agent nobody had reconfigured pointed at a model that no longer
        # existed. None now means inherit.
        monkeypatch.setattr(
            res,
            "platform_config",
            lambda: res.LLMConfig(
                provider="claude", model="claude-sonnet-5", api_key="ak"
            ),
        )
        resolved = await res.resolve_llm(
            None, "agents.run", instance_model=None, instance_provider="claude"
        )
        assert resolved.model == "claude-sonnet-5"
        assert resolved.source == "platform"


class TestTheMappersAreGone:
    """One copy of the mapping, and no way back to three.

    Both of these existed and both resolved a provider to a model, a key and a
    URL — independently of the gateway and of each other, which is why neither
    honoured the workspace AI kill switch. If either name reappears, the
    duplication has come back.
    """

    def test_the_agent_mapper_is_gone(self) -> None:
        assert not hasattr(BaseAgent, "_plan_llm")

    def test_the_ask_mappers_are_gone(self) -> None:
        assert not hasattr(AskService, "_resolve_provider")
        assert not hasattr(AskService, "_auto_detect")

    def test_the_agent_carries_no_hardcoded_default_model(self) -> None:
        # It was `claude-3-sonnet-20240229`, retired by the time this was found.
        assert not hasattr(BaseAgent, "default_model")
