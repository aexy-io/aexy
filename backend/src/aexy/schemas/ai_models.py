"""Request and response shapes for the AI model configuration page."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ModelOption(BaseModel):
    """One suggested model for the picker."""

    id: str
    label: str
    note: str
    #: True when this is a default this codebase already ships, so it is known to
    #: work against this integration rather than merely plausible.
    in_use_here: bool = False


class ModelChoice(BaseModel):
    """A stored override, with the provider it was chosen for."""

    model: str
    provider: str


class FeatureModel(BaseModel):
    """One AI feature, and what it will actually run on."""

    id: str
    name: str
    description: str
    kind: str
    #: The app this belongs to, so the page can hide what a workspace cannot use.
    app: str | None = None

    #: False for a feature whose model cannot safely be changed from a screen.
    #: Shown read-only with ``reason_fixed`` rather than hidden — somebody
    #: looking for embeddings should find out why they are not a dropdown.
    configurable: bool = True
    reason_fixed: str | None = None

    #: Set when this feature is switched off in this deployment, with the reason.
    #: Reported rather than hidden: these are the features whose call sites were
    #: broken for their entire existence, and a page that quietly omitted them
    #: would repeat the failure it exists to prevent. The model can still be
    #: configured — it just will not run until the switch is set.
    dormant_reason: str | None = None

    override: ModelChoice | None = None

    #: What a call for this feature would resolve to right now.
    effective_model: str
    effective_provider: str

    #: ``platform`` | ``workspace`` | ``category`` | ``feature``. The badge that
    #: lets a reader tell an inherited value from a chosen one.
    source: str

    #: Set when a stored override is NOT being applied, with the reason. The page
    #: must render such a row as ignored rather than as live — that is the whole
    #: point of recording a provider alongside a model.
    ignored_reason: str | None = None


class CategoryModels(BaseModel):
    """A group of features configured together."""

    id: str
    name: str
    description: str

    override: ModelChoice | None = None
    ignored_reason: str | None = None

    features: list[FeatureModel] = Field(default_factory=list)


class WorkspaceDefault(BaseModel):
    """What everything inherits from when it has no override of its own."""

    provider: str
    model: str
    #: ``workspace`` when the workspace supplied its own provider and model,
    #: ``platform`` when it is running on the deployment's.
    source: str


class AIModelsResponse(BaseModel):
    """Everything the configuration page renders."""

    #: Null when no provider has a usable credential at all, which the page
    #: should render as "AI is not set up" rather than as an empty picker.
    workspace_default: WorkspaceDefault | None = None

    #: Suggestions for the provider actually serving this workspace, so the
    #: picker cannot offer Claude ids to a Gemini workspace. Empty is fine — free
    #: text is first class, and the list is a convenience.
    catalog: list[ModelOption] = Field(default_factory=list)

    categories: list[CategoryModels] = Field(default_factory=list)

    can_manage: bool = False

    #: True when the workspace has AI switched off entirely. The page still
    #: renders — it just says so, and points at /settings/ai.
    ai_disabled: bool = False


class SetModelRequest(BaseModel):
    """Choose a model for one category or one feature.

    The provider is deliberately absent: the server fills it in from the
    provider actually serving the workspace. A client naming the pair could
    store a combination that silently never applies.
    """

    scope: str = Field(pattern="^(category|feature)$")
    key: str
    model: str
