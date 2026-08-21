"""Which model answers a call, and on whose credential. One place.

Before this module there were four live answers to "which model does this run
on?" and one dead one:

* ``LLMGateway`` honoured ``WorkspaceAISettings``, for the 28 modules behind it.
* ``BaseAgent._plan_llm`` built its own from ``settings.llm``, ignoring the
  workspace entirely — including a default model id that had been retired.
* ``AskService._resolve_provider`` did the same again, with its own hardcoded
  per-provider defaults.
* The vision path read ``VISION_MODEL`` and was not workspace-aware.
* ``workspace.settings["ai_analysis"]["model_tier"]`` had an admin dropdown and
  no reader anywhere.

Three of those also meant the workspace AI **kill switch** and
bring-your-own-key did not apply: ``ensure_ai_enabled`` had no callers outside
the gateway, so "no AI on our data" was true of services and false of agents and
Ask. That was the reason to consolidate — a model-configuration screen would
have been decorating a governance hole.

So: one function, ``resolve_llm``, and three thin adapters that build their own
client from what it returns. It answers four questions together because they are
one decision — is AI allowed here, whose key, which model, and which client
shape to construct.

Resolution order, and this is the only place it exists:

1. the **instance's** own model, where one exists — an individual agent row, the
   one case where per-instance configuration is legitimate, because two agents
   in one workspace genuinely do different work
2. the workspace's override for this **feature**
3. the workspace's override for the feature's **category**
4. the workspace's own provider and model (``WorkspaceAISettings``)
5. the platform default (``settings.llm``)

Note what the instance level does *not* get to do: choose a provider. An agent
configured for Gemini inside a workspace using its own Claude credential runs on
Claude, because whose key pays is the workspace's decision and the agent's
provider is only there to say which provider its model id belongs to.

An override applies only while its recorded provider matches the provider
actually serving the call. A model id belongs to one provider, so a stored
choice goes silently wrong the day an admin switches, and the failure would
otherwise land hours later as somebody else's 404 inside a background job.
``ResolvedLLM.ignored_override`` carries why, so a settings screen can say a
choice is being ignored rather than showing it as live.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from aexy.llm.base import LLMConfig
from aexy.llm.features import FEATURES_BY_ID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.services.workspace_ai_settings_service import WorkspaceAIConfig

logger = logging.getLogger(__name__)

Family = Literal["anthropic", "openai", "gemini"]
Source = Literal["platform", "workspace", "category", "feature", "instance"]

# Providers whose wire protocol is OpenAI's. They differ only in base URL and
# credential, which is why one client covers all five.
_OPENAI_COMPATIBLE = frozenset(
    {"openai", "deepseek", "openrouter", "ollama", "lmstudio"}
)

_ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_OPENAI_BASE_URL = "https://api.openai.com/v1"
_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class LLMNotConfigured(RuntimeError):
    """No provider has a usable credential, so no AI call can be made at all.

    Distinct from ``AIDisabledError``, which means a workspace chose to turn AI
    off. This one means nobody ever set it up — a different message, and a
    different fix.
    """


@dataclass(frozen=True)
class ResolvedLLM:
    """Everything a caller needs to build a client and explain its choice."""

    config: LLMConfig

    family: Family
    """Which client shape to construct. ``'openai'`` covers every
    OpenAI-compatible provider, which is what makes one adapter serve five."""

    api_base: str | None
    """Base URL for an OpenAI-compatible or Gemini client, or None for the
    provider's own default. What LangChain's ``base_url`` wants."""

    chat_completions_url: str | None
    """The full endpoint for a raw streaming POST, for callers that do not use a
    client library. None for Anthropic and Gemini, whose streaming endpoints are
    a different shape entirely."""

    source: Source
    """Where the model came from. Rendered as a badge on the settings page, and
    the reason a reader can tell an inherited value from a chosen one."""

    ignored_override: str | None = None
    """Why a stored override did not apply, when one existed and did not."""

    ignored_scope: Source | None = None
    """Which level the ignored override was stored at.

    So a settings screen can put the explanation where the setting lives. Without
    it, every feature in a category whose override is being ignored repeats the
    category's sentence — the same message five times in one card, which reads as
    five problems instead of one."""

    allow_platform_fallback: bool = False
    """Whether the workspace agreed to fall back to the platform credential when
    its own turns out to be unusable. Read by whoever constructs the client,
    because that is where a bad key is discovered."""

    @property
    def model(self) -> str:
        return self.config.model

    @property
    def provider(self) -> str:
        return self.config.provider


def family_for(provider: str) -> Family:
    """Which client shape a provider needs.

    Raises rather than defaulting to Anthropic, which is what
    ``BaseAgent._plan_llm`` did and how a typo in a provider name became a bill
    on the wrong account.
    """
    name = (provider or "").lower().strip()
    if name in ("claude", "anthropic"):
        return "anthropic"
    if name == "gemini":
        return "gemini"
    if name in _OPENAI_COMPATIBLE:
        return "openai"
    raise LLMNotConfigured(f"Unsupported LLM provider: {provider!r}")


def _endpoints(provider: str, base_url: str | None) -> tuple[str | None, str | None]:
    """``(api_base, chat_completions_url)`` for a provider."""
    name = (provider or "").lower().strip()

    if name in ("claude", "anthropic"):
        return None, _ANTHROPIC_MESSAGES_URL
    if name == "gemini":
        return _GEMINI_BASE_URL, None

    if name == "openai":
        api_base = _OPENAI_BASE_URL
    elif name == "deepseek":
        api_base = _DEEPSEEK_BASE_URL
    elif name == "openrouter":
        api_base = _OPENROUTER_BASE_URL
    elif name == "ollama":
        # Ollama speaks OpenAI's protocol under /v1.
        api_base = f"{(base_url or 'http://localhost:11434').rstrip('/')}/v1"
    elif name == "lmstudio":
        api_base = (base_url or "http://localhost:1234/v1").rstrip("/")
    else:
        raise LLMNotConfigured(f"Unsupported LLM provider: {provider!r}")

    return api_base, f"{api_base}/chat/completions"


def platform_config() -> LLMConfig:
    """The platform's own provider, model and credential, from the environment.

    Extracted so resolution does not have to go through the gateway singleton to
    find out what the default is — and so ``get_llm_gateway`` and every adapter
    read the same builder rather than three near-identical copies of it.

    Raises ``LLMNotConfigured`` when the configured provider has no credential,
    where the old code returned None from ``get_llm_gateway`` and left every
    caller to discover it separately.
    """
    from aexy.core.config import get_settings

    settings = get_settings()
    if not hasattr(settings, "llm"):
        raise LLMNotConfigured("LLM settings are not configured")

    llm = settings.llm
    provider = (llm.llm_provider or "").lower().strip()

    api_key: str | None = None
    base_url: str | None = None
    model = llm.llm_model

    if provider in ("claude", "anthropic"):
        api_key = llm.anthropic_api_key
    elif provider == "gemini":
        api_key = llm.gemini_api_key
    elif provider == "openai":
        api_key = llm.openai_api_key
        model = llm.openai_model or model
    elif provider == "openrouter":
        api_key = llm.openrouter_api_key
        model = llm.openrouter_model or model
    elif provider == "deepseek":
        api_key = llm.deepseek_api_key
    elif provider == "ollama":
        base_url = llm.ollama_base_url
        model = llm.ollama_model or model
        # Ollama needs no key, but an OpenAI-shaped client insists on a
        # non-empty one.
        api_key = "ollama"
    elif provider == "lmstudio":
        base_url = llm.lmstudio_base_url
        model = llm.lmstudio_model or model
        api_key = llm.lmstudio_api_key or "not-needed"
    else:
        raise LLMNotConfigured(f"Unknown LLM provider: {provider!r}")

    if not api_key:
        raise LLMNotConfigured(
            f"No API key configured for the {provider} provider"
        )

    fallback_models: list[str] = []
    if provider == "openrouter" and llm.openrouter_fallback_models:
        fallback_models = [
            m.strip() for m in llm.openrouter_fallback_models.split(",") if m.strip()
        ]
    elif provider == "deepseek" and llm.deepseek_fallback_models:
        fallback_models = [
            m.strip() for m in llm.deepseek_fallback_models.split(",") if m.strip()
        ]

    return LLMConfig(
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=base_url,
        max_tokens=llm.max_tokens_per_request,
        temperature=0.0,
        fallback_models=fallback_models,
    )


@dataclass(frozen=True)
class _Override:
    model: str
    provider: str
    scope: Source


async def _overrides_for(
    workspace_id: str, session: AsyncSession | None = None
) -> dict[tuple[str, str], _Override]:
    """Every override this workspace has, keyed by ``(scope, key)``.

    One query for the whole workspace rather than one per lookup: this runs
    before every LLM call, and the working set is a handful of rows.

    **Its own session by default, never the caller's.** On the runtime path a
    lookup on the caller's session would autoflush their pending objects
    mid-analysis, and a statement that then failed would poison their
    transaction — the same reasoning ``LLMGateway._ensure_ai_enabled`` follows.

    ``session`` is for the settings API, which has to read a write it has just
    made. Its own session is a separate transaction and cannot see the request
    session's uncommitted flush, so building the response that way returns the
    state from *before* the save — a picker that visibly does nothing. The API
    passes its session; nothing else should.
    """
    from sqlalchemy import select

    from aexy.core.database import get_async_session
    from aexy.models.ai_model_override import WorkspaceAIModelOverride

    # Four columns, not the entity. This runs before every LLM call, so there is
    # no reason to hydrate timestamps and an identity-map entry to read a model
    # name — and loading the whole row made the read depend on every column
    # round-tripping, which is a wider contract than this needs.
    query = select(
        WorkspaceAIModelOverride.scope,
        WorkspaceAIModelOverride.key,
        WorkspaceAIModelOverride.model,
        WorkspaceAIModelOverride.provider,
    ).where(WorkspaceAIModelOverride.workspace_id == workspace_id)
    try:
        if session is not None:
            rows = (await session.execute(query)).all()
        else:
            async with get_async_session() as own:
                rows = (await own.execute(query)).all()
    except Exception as exc:
        # Degrading to the workspace default is the right failure here: the
        # alternative is that an unreachable database stops every AI call in the
        # product to avoid using a slightly different model.
        #
        # With the traceback, because this catch is broad enough to swallow a
        # programming error as easily as a dropped connection — and a silently
        # ignored override is exactly the failure this module exists to remove.
        logger.warning(
            "Could not read AI model overrides: %s", exc, exc_info=True
        )
        return {}

    return {
        (row.scope, row.key): _Override(
            model=row.model, provider=row.provider, scope=row.scope
        )
        for row in rows
        # A scope the code no longer knows about, left by an older client. The
        # settings page will not render it either.
        if row.scope in ("category", "feature")
    }


async def resolve_llm(
    workspace_id: str | None,
    feature: str | None = None,
    *,
    base: LLMConfig | None = None,
    instance_model: str | None = None,
    instance_provider: str | None = None,
) -> ResolvedLLM:
    """The model, credential and client shape for one call.

    ``workspace_id is None`` means platform-level work with no workspace context,
    which skips both the kill switch and any override — there is nobody to have
    configured one.

    ``base`` is the config to fall back on when the workspace has none of its
    own — the caller's already-built provider, where there is one. Passed rather
    than always rebuilt from the environment for a reason that is not an
    optimisation: a deployment with no platform credential but a workspace that
    brought its own key must resolve, and reading ``platform_config()`` first
    would refuse it before ever looking at the workspace.

    ``instance_model`` / ``instance_provider`` are for a configured instance that
    carries its own model, which today means one agent row. Both are needed:
    without the provider there is nothing to check the model against, and an
    unchecked model is the silent-wrong case this whole design removes.

    Raises:
        AIDisabledError: the workspace has AI switched off.
        LLMNotConfigured: nothing has a usable credential — neither the
            workspace, nor ``base``, nor the environment.
    """
    source: Source = "platform"

    if not workspace_id:
        return _apply_instance(
            _build(base or platform_config(), source),
            instance_model,
            instance_provider,
        )

    from aexy.services.workspace_ai_settings_service import AIDisabledError

    resolved = await _workspace_ai_config(workspace_id)
    if not resolved.enabled:
        raise AIDisabledError(
            f"AI is disabled for workspace {workspace_id} by its administrators"
        )
    fallback = bool(resolved.allow_platform_fallback)
    if resolved.config is not None:
        # The workspace's own provider and credential. Note what is NOT read
        # here: the platform config, which may not exist at all.
        base_config = resolved.config
        source = "workspace"
    else:
        base_config = base or platform_config()

    overrides = await _overrides_for(workspace_id) if feature else {}
    config, chosen, ignored, ignored_scope = _choose(
        base_config, source, overrides, feature
    )
    result = _build(
        config,
        chosen,
        ignored_override=ignored,
        allow_platform_fallback=fallback,
        ignored_scope=ignored_scope,
    )
    return _apply_instance(result, instance_model, instance_provider)


def _apply_instance(
    resolved: ResolvedLLM, model: str | None, provider: str | None
) -> ResolvedLLM:
    """The instance's own model, when it has one that fits the provider in play."""
    if not model or not provider:
        return resolved

    if provider.lower().strip() != resolved.config.provider:
        # An agent configured for one provider inside a workspace using another.
        # Its model id would mean nothing on this API, so the workspace's answer
        # stands and the reason is recorded for whoever renders the agent.
        return ResolvedLLM(
            config=resolved.config,
            family=resolved.family,
            api_base=resolved.api_base,
            chat_completions_url=resolved.chat_completions_url,
            source=resolved.source,
            ignored_override=(
                f"{model} was configured for {provider}, and this workspace runs "
                f"on {resolved.config.provider}"
            ),
            allow_platform_fallback=resolved.allow_platform_fallback,
        )

    if resolved.config.model == model:
        return resolved

    return _build(
        resolved.config.model_copy(update={"model": model, "fallback_models": []}),
        "instance",
        allow_platform_fallback=resolved.allow_platform_fallback,
    )


async def _workspace_ai_config(workspace_id: str) -> WorkspaceAIConfig:
    """The workspace's AI settings, on their own session."""
    from aexy.core.database import get_async_session
    from aexy.services.workspace_ai_settings_service import resolve_ai_config

    async with get_async_session() as session:
        return await resolve_ai_config(session, workspace_id)


@dataclass(frozen=True)
class BatchResolution:
    """What a configuration screen needs in one read.

    ``default`` is the base every feature inherits from — the workspace's own
    provider and model, or the platform's. Returned explicitly rather than
    inferred from one of the features, because a feature carrying an override
    hides the base it overrode.
    """

    default: ResolvedLLM
    features: dict[str, ResolvedLLM]


async def resolve_many(
    workspace_id: str | None,
    feature_ids: Iterable[str],
    *,
    base: LLMConfig | None = None,
    session: AsyncSession | None = None,
) -> BatchResolution:
    """Resolve several features at once, reading the database once.

    For the configuration screen, which shows fifty rows. Calling
    ``resolve_llm`` per row would be fifty workspace-settings lookups and fifty
    override reads to render one page.

    Deliberately sharing ``_choose`` with ``resolve_llm`` rather than
    reimplementing the order: two copies of a precedence rule is how a settings
    page ends up disagreeing with what actually runs, which is the failure this
    whole module exists to remove.

    A disabled workspace resolves normally here rather than raising. The page
    still has to render, and "AI is off" is answered by the workspace's own
    settings screen, not by a model picker.

    ``session`` must be passed by a caller that has just written an override and
    not yet committed — otherwise the result describes the state before the
    write. See ``_overrides_for``.
    """
    ids = list(feature_ids)
    source: Source = "platform"
    fallback = False
    base_config: LLMConfig | None = None

    overrides: dict[tuple[str, str], _Override] = {}
    if workspace_id:
        resolved = await _workspace_ai_config(workspace_id)
        fallback = bool(resolved.allow_platform_fallback)
        if resolved.config is not None:
            base_config = resolved.config
            source = "workspace"
        overrides = await _overrides_for(workspace_id, session)
    if base_config is None:
        base_config = base or platform_config()

    out: dict[str, ResolvedLLM] = {}
    for feature_id in ids:
        config, chosen, ignored, ignored_scope = _choose(
            base_config, source, overrides, feature_id
        )
        out[feature_id] = _build(
            config,
            chosen,
            ignored_override=ignored,
            allow_platform_fallback=fallback,
            ignored_scope=ignored_scope,
        )
    return BatchResolution(
        default=_build(base_config, source, allow_platform_fallback=fallback),
        features=out,
    )


def _choose(
    base: LLMConfig,
    base_source: Source,
    overrides: dict[tuple[str, str], _Override],
    feature: str | None,
) -> tuple[LLMConfig, Source, str | None, Source | None]:
    """Apply the feature and category levels to a base config.

    The precedence rule itself, in one place, so ``resolve_llm`` and
    ``resolve_many`` cannot drift apart.
    """
    override, ignored, ignored_scope = _pick(overrides, feature, base.provider)
    if override is None:
        return base, base_source, ignored, ignored_scope
    return (
        # Fallbacks are dropped on an explicit choice. The provider's fallback
        # list was chosen for the model it sat beside, and quietly answering a
        # request for a stronger model with the cheaper fallback is the same
        # class of failure as a control that looks live and is not.
        base.model_copy(update={"model": override.model, "fallback_models": []}),
        override.scope,
        None,
        None,
    )


def _pick(
    overrides: dict[tuple[str, str], _Override], feature: str | None, provider: str
) -> tuple[_Override | None, str | None, Source | None]:
    """The override that applies, why one that existed did not, and at what level."""
    if feature is None:
        return None, None, None

    registered = FEATURES_BY_ID.get(feature)
    if registered is None:
        # A call site naming an unregistered feature. The drift test catches this
        # at build time, so reaching here means the registry and the code
        # disagree — log it and fall back rather than failing the user's request.
        logger.warning("Unknown AI feature %r; using the workspace default", feature)
        return None, None, None
    if not registered.configurable:
        return None, None, None

    candidates = [
        overrides.get(("feature", feature)),
        overrides.get(("category", registered.category)),
    ]

    mismatch: str | None = None
    mismatch_scope: Source | None = None
    for candidate in candidates:
        if candidate is None:
            continue
        if candidate.provider == provider:
            return candidate, None, None
        # Recorded rather than returned: a category override for the wrong
        # provider should not stop a correct feature override below it from
        # being found, and the settings page wants to know either way — but it
        # needs to know *where*, so it can explain the problem once, next to the
        # setting that has it.
        if mismatch is None:
            mismatch = (
                f"{candidate.model} was chosen for {candidate.provider}, and this "
                f"workspace now uses {provider}"
            )
            mismatch_scope = candidate.scope
    return None, mismatch, mismatch_scope


def _build(
    config: LLMConfig,
    source: Source,
    ignored_override: str | None = None,
    allow_platform_fallback: bool = False,
    ignored_scope: Source | None = None,
) -> ResolvedLLM:
    api_base, chat_url = _endpoints(config.provider, config.base_url)
    return ResolvedLLM(
        config=config,
        family=family_for(config.provider),
        api_base=api_base,
        chat_completions_url=chat_url,
        source=source,
        ignored_override=ignored_override,
        allow_platform_fallback=allow_platform_fallback,
        ignored_scope=ignored_scope,
    )
