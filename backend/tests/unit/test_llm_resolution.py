"""Which model answers a call, and on whose credential.

This module replaced four independent answers to that question, three of which
also skipped the workspace AI kill switch — so the tests that matter most are
the ordering table and the kill switch, not the happy path.
"""

from __future__ import annotations

import pytest

from aexy.llm import resolution as res
from aexy.llm.base import LLMConfig
from aexy.llm.resolution import LLMNotConfigured, resolve_llm
from aexy.services.workspace_ai_settings_service import AIDisabledError

WORKSPACE = "11111111-1111-1111-1111-111111111111"


def _config(provider: str = "claude", model: str = "platform-model", **kw) -> LLMConfig:
    return LLMConfig(
        provider=provider,
        model=model,
        api_key="k",
        base_url=kw.pop("base_url", None),
        fallback_models=kw.pop("fallback_models", []),
    )


class _WorkspaceAI:
    """Stand-in for `WorkspaceAIConfig`."""

    def __init__(self, enabled: bool = True, config: LLMConfig | None = None) -> None:
        self.enabled = enabled
        self.config = config
        self.allow_platform_fallback = False
        self.effective_source = "workspace" if config else "platform"


@pytest.fixture
def wire(monkeypatch):
    """Control all three inputs the resolver reads, with no database."""

    def build(
        *,
        platform: LLMConfig | None = None,
        workspace: _WorkspaceAI | None = None,
        overrides: dict[tuple[str, str], res._Override] | None = None,
    ):
        monkeypatch.setattr(res, "platform_config", lambda: platform or _config())

        async def _ws(_workspace_id: str):
            return workspace if workspace is not None else _WorkspaceAI()

        async def _ov(_workspace_id: str):
            return overrides or {}

        monkeypatch.setattr(res, "_workspace_ai_config", _ws)
        monkeypatch.setattr(res, "_overrides_for", _ov)

    return build


def _override(model: str, provider: str, scope: str) -> res._Override:
    return res._Override(model=model, provider=provider, scope=scope)  # type: ignore[arg-type]


class TestResolutionOrder:
    async def test_no_workspace_gets_the_platform_default(self, wire) -> None:
        wire()
        resolved = await resolve_llm(None, "docs.docx_edit")
        assert resolved.model == "platform-model"
        assert resolved.source == "platform"

    async def test_the_platform_default_when_nothing_is_configured(self, wire) -> None:
        wire()
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "platform-model"
        assert resolved.source == "platform"

    async def test_the_workspace_model_beats_the_platform(self, wire) -> None:
        wire(workspace=_WorkspaceAI(config=_config(model="workspace-model")))
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "workspace-model"
        assert resolved.source == "workspace"

    async def test_a_category_override_beats_the_workspace_model(self, wire) -> None:
        wire(
            workspace=_WorkspaceAI(config=_config(model="workspace-model")),
            overrides={
                ("category", "documentation"): _override(
                    "category-model", "claude", "category"
                )
            },
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "category-model"
        assert resolved.source == "category"

    async def test_a_feature_override_beats_its_category(self, wire) -> None:
        wire(
            overrides={
                ("category", "documentation"): _override(
                    "category-model", "claude", "category"
                ),
                ("feature", "docs.docx_edit"): _override(
                    "feature-model", "claude", "feature"
                ),
            }
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "feature-model"
        assert resolved.source == "feature"

    async def test_a_category_override_does_not_leak_across_categories(
        self, wire
    ) -> None:
        wire(
            overrides={
                ("category", "documentation"): _override("docs-model", "claude", "category")
            }
        )
        resolved = await resolve_llm(WORKSPACE, "crm.battle_card")
        assert resolved.model == "platform-model"
        assert resolved.source == "platform"

    async def test_a_call_with_no_feature_takes_the_workspace_default(
        self, wire
    ) -> None:
        # Not an error. A call site that has not named itself yet must keep
        # working; the drift test is what stops that being permanent.
        wire(
            overrides={
                ("category", "documentation"): _override("docs-model", "claude", "category")
            }
        )
        resolved = await resolve_llm(WORKSPACE, None)
        assert resolved.model == "platform-model"


class TestProviderMismatch:
    async def test_an_override_for_another_provider_is_ignored(self, wire) -> None:
        # A model id belongs to one provider. Applying a Claude id on Gemini
        # would fail as somebody else's 404 hours later inside a background job.
        wire(
            workspace=_WorkspaceAI(config=_config(provider="gemini", model="gemini-x")),
            overrides={
                ("feature", "docs.docx_edit"): _override(
                    "claude-sonnet-5", "claude", "feature"
                )
            },
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "gemini-x"
        assert resolved.source == "workspace"

    async def test_the_mismatch_is_explained_not_just_dropped(self, wire) -> None:
        # So a settings page can say the choice is being ignored rather than
        # rendering it as live.
        wire(
            workspace=_WorkspaceAI(config=_config(provider="gemini", model="gemini-x")),
            overrides={
                ("feature", "docs.docx_edit"): _override(
                    "claude-sonnet-5", "claude", "feature"
                )
            },
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.ignored_override is not None
        assert "claude-sonnet-5" in resolved.ignored_override
        assert "gemini" in resolved.ignored_override

    async def test_a_matching_feature_override_survives_a_mismatched_category(
        self, wire
    ) -> None:
        # The category row is for the wrong provider; the feature row is right.
        # Recording the mismatch must not stop the correct one being found.
        wire(
            overrides={
                ("category", "documentation"): _override("gemini-x", "gemini", "category"),
                ("feature", "docs.docx_edit"): _override(
                    "claude-good", "claude", "feature"
                ),
            }
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "claude-good"
        assert resolved.source == "feature"

    async def test_nothing_is_reported_ignored_when_nothing_was_stored(
        self, wire
    ) -> None:
        wire()
        assert (await resolve_llm(WORKSPACE, "docs.docx_edit")).ignored_override is None


class TestKillSwitch:
    async def test_a_disabled_workspace_is_refused(self, wire) -> None:
        # The regression test for the hole this module closes: before it, agents
        # and Ask resolved their own model and never asked this question, so
        # "no AI on our data" was true of services and false of assistants.
        wire(workspace=_WorkspaceAI(enabled=False))
        with pytest.raises(AIDisabledError):
            await resolve_llm(WORKSPACE, "agents.ask")

    async def test_platform_level_work_is_not_gated(self, wire) -> None:
        # No workspace means nobody to have configured a switch.
        wire(workspace=_WorkspaceAI(enabled=False))
        assert (await resolve_llm(None, "code.analyze")).source == "platform"


class TestFallbacksAreDropped:
    async def test_an_explicit_override_clears_the_fallback_list(self, wire) -> None:
        # Answering a request for a stronger model with the platform's cheaper
        # fallback is the failure this whole mechanism exists to remove.
        wire(
            platform=_config(
                provider="openrouter", fallback_models=["cheap-a", "cheap-b"]
            ),
            overrides={
                ("feature", "docs.docx_edit"): _override(
                    "expensive", "openrouter", "feature"
                )
            },
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "expensive"
        assert resolved.config.fallback_models == []

    async def test_fallbacks_survive_when_no_override_applies(self, wire) -> None:
        wire(
            platform=_config(
                provider="openrouter", fallback_models=["cheap-a", "cheap-b"]
            )
        )
        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.config.fallback_models == ["cheap-a", "cheap-b"]


class TestUnconfigurableFeatures:
    async def test_embeddings_ignore_an_override(self, wire) -> None:
        # Changing the embedding model invalidates every stored vector, so it is
        # a migration rather than a setting. A row written by an older client
        # must not take effect.
        wire(
            overrides={
                ("feature", "media.embeddings"): _override("other", "claude", "feature")
            }
        )
        resolved = await resolve_llm(WORKSPACE, "media.embeddings")
        assert resolved.model == "platform-model"

    async def test_an_unregistered_feature_falls_back_rather_than_raising(
        self, wire
    ) -> None:
        # The drift test catches this at build time. At runtime, a user's request
        # must not fail because the registry is behind the code.
        wire()
        resolved = await resolve_llm(WORKSPACE, "not.a.real.feature")
        assert resolved.model == "platform-model"


class TestClientShape:
    @pytest.mark.parametrize(
        ("provider", "family"),
        [
            ("claude", "anthropic"),
            ("anthropic", "anthropic"),
            ("gemini", "gemini"),
            ("openai", "openai"),
            ("deepseek", "openai"),
            ("openrouter", "openai"),
            ("ollama", "openai"),
            ("lmstudio", "openai"),
        ],
    )
    def test_every_provider_maps_to_a_client(self, provider: str, family: str) -> None:
        assert res.family_for(provider) == family

    def test_an_unknown_provider_raises_rather_than_defaulting(self) -> None:
        # BaseAgent._plan_llm used to fall back to Claude here, which is how a
        # typo in a provider name became a bill on the wrong account.
        with pytest.raises(LLMNotConfigured):
            res.family_for("gpt5-turbo-max")

    async def test_openai_compatible_providers_get_a_chat_endpoint(
        self, wire
    ) -> None:
        wire(platform=_config(provider="deepseek"))
        resolved = await resolve_llm(None, None)
        assert resolved.api_base == "https://api.deepseek.com"
        assert resolved.chat_completions_url == (
            "https://api.deepseek.com/chat/completions"
        )

    async def test_a_local_provider_uses_its_configured_base_url(self, wire) -> None:
        wire(platform=_config(provider="lmstudio", base_url="http://box:1234/v1/"))
        resolved = await resolve_llm(None, None)
        assert resolved.api_base == "http://box:1234/v1"

    async def test_ollama_speaks_openai_under_v1(self, wire) -> None:
        wire(platform=_config(provider="ollama", base_url="http://box:11434"))
        resolved = await resolve_llm(None, None)
        assert resolved.api_base == "http://box:11434/v1"

    async def test_anthropic_has_a_messages_endpoint_not_a_chat_one(
        self, wire
    ) -> None:
        wire(platform=_config(provider="claude"))
        resolved = await resolve_llm(None, None)
        assert resolved.api_base is None
        assert resolved.chat_completions_url.endswith("/v1/messages")


class TestOverrideReadFailures:
    async def test_an_unreadable_override_table_degrades_to_no_overrides(
        self, monkeypatch
    ) -> None:
        # Exercising the real `_overrides_for`, not a stub of it: patching the
        # function under test would bypass the try/except that is the whole
        # behaviour being asserted.
        #
        # Degrading is deliberate. The alternative is that an unreachable
        # database stops every AI call in the product rather than risk using a
        # slightly different model than an admin asked for.
        import aexy.core.database as database

        def _boom(*_args, **_kwargs):
            raise RuntimeError("connection refused")

        monkeypatch.setattr(database, "get_async_session", _boom)
        assert await res._overrides_for(WORKSPACE) == {}

    async def test_a_failed_read_still_resolves_the_workspace_model(
        self, monkeypatch
    ) -> None:
        import aexy.core.database as database

        monkeypatch.setattr(res, "platform_config", lambda: _config())

        async def _ws(_workspace_id: str):
            return _WorkspaceAI(config=_config(model="workspace-model"))

        def _boom(*_args, **_kwargs):
            raise RuntimeError("connection refused")

        monkeypatch.setattr(res, "_workspace_ai_config", _ws)
        monkeypatch.setattr(database, "get_async_session", _boom)

        resolved = await resolve_llm(WORKSPACE, "docs.docx_edit")
        assert resolved.model == "workspace-model"
        assert resolved.source == "workspace"
