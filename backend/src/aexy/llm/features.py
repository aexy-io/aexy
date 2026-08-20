"""Every place in the product that calls a language model.

The single source of truth for what an AI *feature* is, in the same spirit as
``models/app_definitions.py``'s ``APP_CATALOG``: a stable id, a name an admin
recognises, and the category they will reason about it in.

Why a registry rather than letting each feature name itself at the call site.
"Which model does this run on?" had four live answers in this codebase and one
dead one, and no way to enumerate them — so there was no screen that could show
an admin what their workspace was actually spending on. A feature id passed at
the call site and resolved centrally makes that list exist, and makes a new
feature inherit the workspace's answer the day it is written instead of hard
-coding a default nobody revisits.

**Ids are stored in the database** (``workspace_ai_model_overrides.key``), so
renaming one orphans a workspace's configuration. Add and deprecate; do not
rename.

The category is what the settings page groups by, and it follows where a person
finds the feature in the product — not which module the code lives in. Sprint
retros and hiring-timeline estimates share a service module and belong on
different screens.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

FeatureKind = Literal["text", "vision", "embedding"]


@dataclass(frozen=True)
class AICategory:
    """A group of features that get configured together.

    Coarse on purpose. Thirty pickers on one screen is a wall nobody reads,
    while "the cheap model for analysis, the strong one for contracts" is two
    decisions — so the category carries the default and a feature only overrides
    it when it genuinely differs.
    """

    id: str
    name: str
    description: str


AI_CATEGORIES: tuple[AICategory, ...] = (
    AICategory(
        id="code_analysis",
        name="Code analysis",
        description=(
            "Reading commits, pull requests and diffs. High volume and mostly "
            "summarisation, so the cheapest capable model usually wins here."
        ),
    ),
    AICategory(
        id="documentation",
        name="Documentation",
        description=(
            "Writing and editing pages and Word documents. Output a person "
            "reads and signs off, so worth a stronger model than analysis."
        ),
    ),
    AICategory(
        id="crm",
        name="Sales and marketing",
        description=(
            "Outbound email, reply classification and competitor tracking. "
            "Some of this leaves the building under your name."
        ),
    ),
    AICategory(
        id="service_desk",
        name="Service desk",
        description=(
            "Classifying and matching incoming tickets. Latency-sensitive and "
            "high volume — a slow model is felt by the person waiting."
        ),
    ),
    AICategory(
        id="hiring",
        name="Hiring",
        description=(
            "Job descriptions, interview rubrics and screening questions. "
            "Output that affects candidates, so accuracy over cost."
        ),
    ),
    AICategory(
        id="insights",
        name="Insights and digests",
        description=(
            "Narratives, retros, anomaly detection and periodic digests. Runs "
            "on a schedule rather than on a click, so cost adds up quietly."
        ),
    ),
    AICategory(
        id="agents",
        name="Agents and assistants",
        description=(
            "Conversational surfaces and tool-using agents. These run many "
            "turns per task, so the model choice multiplies."
        ),
    ),
    AICategory(
        id="media",
        name="Files and images",
        description=(
            "Reading uploaded documents, spreadsheets and screenshots. Uses a "
            "vision-capable model where one is configured."
        ),
    ),
)

CATEGORY_IDS: frozenset[str] = frozenset(category.id for category in AI_CATEGORIES)


@dataclass(frozen=True)
class AIFeature:
    """One thing the product does with a language model."""

    id: str
    name: str
    description: str
    category: str
    kind: FeatureKind = "text"
    app: str | None = None
    """The ``APP_CATALOG`` app this belongs to, so the settings page can hide a
    feature a workspace has no access to rather than offering a model for
    something it cannot use. None means it is not app-gated."""

    configurable: bool = True
    """False for a feature whose model cannot safely be changed from a screen.
    Shown read-only with the reason, rather than hidden — an admin looking for
    embeddings should find out why they are not a dropdown."""

    reason_fixed: str | None = None

    dormant_reason: str | None = None
    """Set when this feature is off by default and must be switched on.

    For features whose call sites were broken for their entire existence: they
    raised on every invocation, were swallowed, and so never once ran. Repairing
    the call is not the same decision as *starting to spend money on it*, and a
    fix that silently began billing an operator for five analyses they had never
    seen run would be a worse surprise than the bug.

    Off by default, opt-in per feature through ``AI_ENABLE_DORMANT_FEATURES``.
    Surfaced on the settings page rather than hidden — a feature that is not
    running should say so, which is the whole principle this module was built on.
    """


AI_FEATURES: tuple[AIFeature, ...] = (
    # ── Code analysis ──────────────────────────────────────────────────────
    AIFeature(
        id="code.analyze",
        name="Code analysis",
        description="Reading a file or diff for languages, frameworks and patterns.",
        category="code_analysis",
        app="insights",
    ),
    AIFeature(
        id="code.commit_message",
        name="Commit analysis",
        description="Summarising what a commit did and how substantial it was.",
        category="code_analysis",
        app="insights",
        dormant_reason=(
            "This never ran: the call passed `prompt=` and `provider=`, "
            "which `call_llm` has never accepted, so it raised TypeError "
            "every time and the surrounding `except Exception` hid it. "
            "Commit summaries fall back to the non-AI path while this is "
            "off."
        ),
    ),
    AIFeature(
        id="code.contribution_insights",
        name="Contribution insights",
        description="Narrating a developer's contribution history.",
        category="code_analysis",
        app="insights",
    ),
    AIFeature(
        id="code.review_summary",
        name="Code review summary",
        description="Summarising the review activity on a pull request.",
        category="code_analysis",
        app="insights",
    ),
    AIFeature(
        id="code.task_pr_alignment",
        name="Task and PR alignment",
        description="Checking whether a pull request does what its task asked for.",
        category="code_analysis",
        app="sprints",
    ),
    # ── Documentation ──────────────────────────────────────────────────────
    AIFeature(
        id="docs.generate",
        name="Document generation",
        description="Writing a page from code, a repository or a template.",
        category="documentation",
        app="docs",
    ),
    AIFeature(
        id="docs.suggest_improvements",
        name="Document improvements",
        description="Answering what is unclear, incomplete or missing on a page.",
        category="documentation",
        app="docs",
    ),
    AIFeature(
        id="docs.docx_edit",
        name="Word document editing",
        description=(
            "Drafting tracked-changes edits to a .docx, including answering "
            "comments left by reviewers."
        ),
        category="documentation",
        app="docs",
    ),
    AIFeature(
        id="docs.docx_intake",
        name="Word document to issues",
        description=(
            "Reading a Word document for work items — requirements, review "
            "findings, action points — and proposing them as issues."
        ),
        category="documentation",
        app="docs",
    ),
    AIFeature(
        id="docs.knowledge_extraction",
        name="Knowledge extraction",
        description="Pulling entities and relationships out of a page for the graph.",
        category="documentation",
        app="docs",
    ),
    # ── Sales and marketing ────────────────────────────────────────────────
    AIFeature(
        id="crm.email_personalisation",
        name="Outreach personalisation",
        description="Personalising a sequence email for one contact.",
        category="crm",
        app="crm",
    ),
    AIFeature(
        id="crm.writing_style_email",
        name="Email drafting in your voice",
        description="Writing an email that matches a learned writing style.",
        category="crm",
        app="crm",
    ),
    AIFeature(
        id="crm.reply_classification",
        name="Reply classification",
        description="Deciding whether a reply is interested, an objection or a bounce.",
        category="crm",
        app="crm",
    ),
    AIFeature(
        id="crm.competitor_change",
        name="Competitor change classification",
        description="Judging whether a change on a competitor's site matters.",
        category="crm",
        app="crm",
    ),
    AIFeature(
        id="crm.battle_card",
        name="Battle cards",
        description="Writing a competitive positioning card.",
        category="crm",
        app="crm",
    ),
    # ── Service desk ───────────────────────────────────────────────────────
    AIFeature(
        id="service_desk.classify",
        name="Ticket classification",
        description="Assigning a category, priority and queue to an incoming ticket.",
        category="service_desk",
        app="service_desk",
    ),
    AIFeature(
        id="service_desk.ticket_match",
        name="Duplicate ticket matching",
        description="Finding the existing ticket a new message belongs to.",
        category="service_desk",
        app="service_desk",
    ),
    # ── Hiring ─────────────────────────────────────────────────────────────
    AIFeature(
        id="hiring.job_description",
        name="Job descriptions",
        description="Drafting a job description from a role and a skill set.",
        category="hiring",
        app="hiring",
    ),
    AIFeature(
        id="hiring.interview_rubric",
        name="Interview rubrics",
        description="Building a scoring rubric for an interview loop.",
        category="hiring",
        app="hiring",
    ),
    AIFeature(
        id="hiring.roadmap_skills",
        name="Roadmap skill extraction",
        description="Reading a roadmap to work out which skills it will need.",
        category="hiring",
        app="hiring",
    ),
    AIFeature(
        id="hiring.question_generation",
        name="Interview questions",
        description="Generating screening and interview questions.",
        category="hiring",
        app="hiring",
    ),
    AIFeature(
        id="hiring.questionnaire_columns",
        name="Questionnaire column detection",
        description="Working out what the columns in an uploaded sheet mean.",
        category="hiring",
        app="hiring",
    ),
    # ── Insights and digests ───────────────────────────────────────────────
    AIFeature(
        id="insights.team_narrative",
        name="Team narrative",
        description="The written summary of how a team is doing.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.developer_narrative",
        name="Developer narrative",
        description="The written summary of one developer's period.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.anomalies",
        name="Anomaly detection",
        description="Spotting unusual movement in delivery metrics.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.root_causes",
        name="Root cause analysis",
        description="Explaining why a metric moved.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.one_on_one_prep",
        name="One-on-one preparation",
        description="Preparing talking points for a manager's next one-on-one.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.sprint_retro",
        name="Sprint retrospectives",
        description="Drafting a retro from what actually happened in the sprint.",
        category="insights",
        app="sprints",
    ),
    AIFeature(
        id="insights.team_trajectory",
        name="Team trajectory",
        description="Projecting where a team's delivery is heading.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.team_composition",
        name="Team composition advice",
        description="Recommending how to shape a team for its roadmap.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.hiring_timeline",
        name="Hiring timeline estimates",
        description="Estimating how long a set of roles will take to fill.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.developer_digest",
        name="Developer digest",
        description="The scheduled per-developer summary email.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.repo_health",
        name="Repository health digest",
        description="The scheduled per-repository health summary.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.review_period",
        name="Review period summaries",
        description="Composing a developer's or team's performance-review period.",
        category="insights",
        app="reviews",
    ),
    AIFeature(
        id="insights.attrition_risk",
        name="Attrition risk",
        description="Assessing how likely a developer is to leave.",
        category="insights",
        app="insights",
        dormant_reason=(
            "This never ran: `analyze()` was called with a `system_prompt=` "
            "keyword it has never had, so it raised TypeError on every "
            "invocation. Turning it on starts real LLM spend on every "
            "developer analysed."
        ),
    ),
    AIFeature(
        id="insights.burnout_risk",
        name="Burnout risk",
        description="Assessing sustained overload from delivery signals.",
        category="insights",
        app="insights",
        dormant_reason=(
            "This never ran — same broken `system_prompt=` keyword as "
            "attrition risk. Turning it on starts real LLM spend per "
            "developer."
        ),
    ),
    AIFeature(
        id="insights.performance_trajectory",
        name="Performance trajectory",
        description="Projecting a developer's trajectory from their history.",
        category="insights",
        app="insights",
        dormant_reason=(
            "This never ran — same broken `system_prompt=` keyword as "
            "attrition risk. Turning it on starts real LLM spend per "
            "developer."
        ),
    ),
    AIFeature(
        id="insights.team_health",
        name="Team health",
        description="Assessing a team's health from its delivery and review signals.",
        category="insights",
        app="insights",
        dormant_reason=(
            "This never ran — same broken `system_prompt=` keyword as "
            "attrition risk. Turning it on starts real LLM spend per team "
            "analysed."
        ),
    ),
    AIFeature(
        id="insights.soft_skills",
        name="Collaboration signals",
        description="Reading review comments for collaboration and communication.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.learning_path",
        name="Learning paths",
        description="Building a personalised learning path towards a role.",
        category="insights",
        app="learning",
    ),
    AIFeature(
        id="insights.stretch_assignment",
        name="Stretch assignments",
        description="Suggesting work that would grow a specific skill.",
        category="insights",
        app="learning",
    ),
    AIFeature(
        id="insights.tracker_journal",
        name="Tracker journal",
        description="Narrating what changed in a tracked metric over time.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.tracker_enrich",
        name="Tracker enrichment",
        description="Attributing tracked events to the change that caused them.",
        category="insights",
        app="insights",
    ),
    AIFeature(
        id="insights.tracker_qa",
        name="Ask about a tracker",
        description="Answering a question about a tracker's data in prose.",
        category="insights",
        app="insights",
    ),
    # ── Agents and assistants ──────────────────────────────────────────────
    AIFeature(
        id="agents.run",
        name="Agents",
        description=(
            "Tool-using agents. An individual agent can override this on its "
            "own configuration page, which is why this is the default rather "
            "than the last word."
        ),
        category="agents",
        app="agents",
    ),
    AIFeature(
        id="agents.ask",
        name="Ask Aexy",
        description="The conversational assistant in the sidebar and chat.",
        category="agents",
    ),
    AIFeature(
        id="agents.chat_mention",
        name="Agent mentions in chat",
        description="An agent answering because somebody mentioned it in a channel.",
        category="agents",
        app="agents",
    ),
    AIFeature(
        id="agents.workflow_generation",
        name="Workflow generation",
        description="Drafting an automation from a one-line description.",
        category="agents",
        app="automations",
    ),
    # ── Files and images ───────────────────────────────────────────────────
    AIFeature(
        id="media.file_metadata",
        name="File understanding",
        description=(
            "Reading an uploaded file to tag, summarise and index it. Runs on "
            "every upload, so it is usually the highest-volume feature here."
        ),
        category="media",
        app="drive",
    ),
    AIFeature(
        id="media.vision",
        name="Image and screenshot reading",
        description="Describing images, screenshots and scanned pages.",
        category="media",
        kind="vision",
        app="drive",
    ),
    AIFeature(
        id="media.embeddings",
        name="Search embeddings",
        description="Turning text into vectors for semantic search.",
        category="media",
        kind="embedding",
        configurable=False,
        reason_fixed=(
            "Changing the embedding model invalidates every vector already "
            "stored, so it is a migration rather than a setting. Ask an "
            "administrator to re-index if you need to change it."
        ),
    ),
)

# Features that legitimately have no call site passing their id, with the reason.
#
# An explicit list rather than a silent gap, so the drift test can be strict
# about everything else. The same shape as `UNWIRED_EVENTS` in
# `test_notification_event_emitters.py`, and for the same reason: "not wired yet"
# and "cannot be wired" look identical from outside, and only one of them is a
# bug.
EXPECTED_UNWIRED: dict[str, str] = {
    "media.embeddings": (
        "Embeddings do not go through the gateway's analyze/call_llm path at all "
        "— they are their own provider call — and the model is not changeable "
        "from a screen anyway (see `configurable`)."
    ),
    "media.vision": (
        "The vision path builds a `VisionProvider` from VISION_PROVIDER and "
        "VISION_MODEL, a different class hierarchy from `LLMProvider`, so it "
        "resolves nothing through `resolve_llm` yet. Listed here rather than "
        "omitted from the registry because the settings page should still show "
        "an admin what images are read with."
    ),
}


DORMANT_FEATURES: frozenset[str] = frozenset(
    f.id for f in AI_FEATURES if f.dormant_reason
)


def enabled_dormant() -> frozenset[str]:
    """Which dormant features this deployment has switched on.

    ``AI_ENABLE_DORMANT_FEATURES`` takes a comma-separated list of feature ids,
    or ``all``. Read per call rather than cached at import so a deployment can
    change it without a code change, and so tests can set it.
    """
    from aexy.core.config import get_settings

    raw = getattr(getattr(get_settings(), "llm", None), "ai_enable_dormant_features", "")
    if not raw:
        return frozenset()
    wanted = {part.strip() for part in raw.split(",") if part.strip()}
    if "all" in wanted:
        return DORMANT_FEATURES
    unknown = wanted - DORMANT_FEATURES
    if unknown:
        # Named but not dormant, or misspelt. Logged rather than ignored: an
        # operator who typed an id to switch something on deserves to know it did
        # nothing.
        import logging

        logging.getLogger(__name__).warning(
            "AI_ENABLE_DORMANT_FEATURES names %s, which %s dormant; ignored",
            sorted(unknown),
            "is not" if len(unknown) == 1 else "are not",
        )
    return frozenset(wanted & DORMANT_FEATURES)


def is_dormant(feature_id: str | None) -> str | None:
    """The reason this feature is switched off, or None if it may run."""
    if not feature_id:
        return None
    entry = FEATURES_BY_ID.get(feature_id)
    if entry is None or not entry.dormant_reason:
        return None
    if feature_id in enabled_dormant():
        return None
    return entry.dormant_reason


FEATURES_BY_ID: dict[str, AIFeature] = {feature.id: feature for feature in AI_FEATURES}
FEATURE_IDS: frozenset[str] = frozenset(FEATURES_BY_ID)


def feature(feature_id: str) -> AIFeature:
    """Look one up, refusing an id that is not registered.

    A ``KeyError`` here means a call site named a feature the registry does not
    have — which the drift test catches at build time, so reaching this at
    runtime means the registry and the code disagree and the settings page is
    already lying about something.
    """
    try:
        return FEATURES_BY_ID[feature_id]
    except KeyError:
        raise KeyError(
            f"Unknown AI feature {feature_id!r}. Register it in llm/features.py."
        ) from None


def category_of(feature_id: str) -> str:
    """The category a feature inherits its model from when it has no override."""
    return feature(feature_id).category


def features_in(category_id: str) -> tuple[AIFeature, ...]:
    return tuple(f for f in AI_FEATURES if f.category == category_id)
