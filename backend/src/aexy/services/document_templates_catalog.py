"""The system document templates, defined in code rather than seeded as rows.

Every workspace gets the same set and it changes when this file ships, so these
are not workspace data — seeding them into each database would mean a migration
to fix a typo and would let the same template drift between deployments. The
service-desk industry templates are the precedent (see
``service_desk_industry_templates``): a static catalogue, a lookup, and a
validator that fails at import on an authoring mistake.

A workspace that wants its own version of one of these forks it into a real
``DocumentTemplate`` row through ``DocumentService.duplicate_template``, which is
where per-workspace editing lives. Ids carry the ``sys:`` prefix so they can
never be confused with a row's UUID.

``content`` is TipTap JSON, the same shape ``Document.content`` holds, so
``create_document(template_id=…)`` can use it directly without conversion.
"""

from dataclasses import dataclass, field

from aexy.models.documentation import TemplateCategory

SYSTEM_TEMPLATE_PREFIX = "sys:"


# --------------------------------------------------------------- TipTap builders
#
# The templates below are content, and content written as raw ProseMirror JSON is
# unreadable and unreviewable — the API-doc template this replaces was 60 lines of
# nested dicts for eight headings. These keep the catalogue looking like the
# document it produces.


def _text(value: str, *marks: str) -> dict:
    node: dict = {"type": "text", "text": value}
    if marks:
        node["marks"] = [{"type": mark} for mark in marks]
    return node


def h(level: int, value: str) -> dict:
    return {"type": "heading", "attrs": {"level": level}, "content": [_text(value)]}


def p(*parts: str | dict) -> dict:
    """A paragraph. Bare strings become plain text; pass ``_text`` for marks."""
    content = [_text(part) if isinstance(part, str) else part for part in parts]
    # TipTap treats a paragraph with an empty content array as an empty
    # paragraph, which is what a blank line in a template should be.
    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}


def bullets(*items: str) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {"type": "listItem", "content": [p(item)]} for item in items
        ],
    }


def todos(*items: str) -> dict:
    """A task list — the checkboxes a runbook or a meeting note actually wants."""
    return {
        "type": "taskList",
        "content": [
            {
                "type": "taskItem",
                "attrs": {"checked": False},
                "content": [p(item)],
            }
            for item in items
        ],
    }


def code(language: str, value: str) -> dict:
    return {
        "type": "codeBlock",
        "attrs": {"language": language},
        "content": [_text(value)],
    }


def quote(value: str) -> dict:
    return {"type": "blockquote", "content": [p(value)]}


def table(headers: list[str], rows: int = 2) -> dict:
    """A header row plus ``rows`` empty rows, which is what a template can offer."""

    def cell(kind: str, text: str = "") -> dict:
        return {"type": kind, "attrs": {"colspan": 1, "rowspan": 1}, "content": [p(text)]}

    return {
        "type": "table",
        "content": [
            {"type": "tableRow", "content": [cell("tableHeader", head) for head in headers]},
            *[
                {"type": "tableRow", "content": [cell("tableCell") for _ in headers]}
                for _ in range(rows)
            ],
        ],
    }


def doc(*nodes: dict) -> dict:
    return {"type": "doc", "content": list(nodes)}


# --------------------------------------------------------------------- catalogue


@dataclass(frozen=True)
class SystemTemplate:
    """One code-defined starting point for a document."""

    slug: str
    name: str
    description: str
    category: TemplateCategory
    icon: str
    content: dict
    # The LLM prompt for generating this document type from code. Documents
    # created by hand ignore it; ``document_generation_service`` does not, and
    # ``DocumentTemplate.prompt_template`` is NOT NULL — so a template with no
    # sensible prompt would break the moment somebody pointed AI at it.
    prompt: str
    variables: tuple[str, ...] = field(default_factory=tuple)

    @property
    def id(self) -> str:
        return f"{SYSTEM_TEMPLATE_PREFIX}{self.slug}"


BLANK = SystemTemplate(
    slug="blank",
    name="Blank",
    description="An empty page",
    category=TemplateCategory.GENERAL,
    icon="📄",
    content=doc(p()),
    prompt="Write documentation for the following:\n\n{context}",
)

PRD = SystemTemplate(
    slug="prd",
    name="Product requirements",
    description="Problem, users, scope and success measures for a piece of work",
    category=TemplateCategory.GENERAL,
    icon="📋",
    content=doc(
        h(1, "Product requirements"),
        quote("Owner · Status · Target release — fill these in and delete this line."),
        h(2, "Problem"),
        p("What is wrong today, for whom, and how you know. Evidence beats assertion."),
        h(2, "Who this is for"),
        p("The specific users affected, and roughly how many."),
        h(2, "Goals"),
        bullets("A change in user behaviour or outcome", "Another one"),
        h(2, "Non-goals"),
        p("What this deliberately does not do. This section prevents the most rework."),
        h(2, "Proposal"),
        p("What is being built, at the level a reader can disagree with."),
        h(2, "Success measures"),
        table(["Measure", "Today", "Target"]),
        h(2, "Open questions"),
        todos("Question still to answer"),
    ),
    prompt=(
        "Write a product requirements document for the following. Cover the problem, "
        "the affected users, goals, non-goals, the proposal and how success is "
        "measured. Be concrete and avoid marketing language.\n\n{context}"
    ),
    variables=("context",),
)

DESIGN_DOC = SystemTemplate(
    slug="design-doc",
    name="Design doc / RFC",
    description="A technical proposal with the alternatives that were rejected",
    category=TemplateCategory.MODULE_DOCS,
    icon="🏗",
    content=doc(
        h(1, "Design: "),
        quote("Author · Reviewers · Status — fill these in and delete this line."),
        h(2, "Summary"),
        p("The change in a paragraph, for somebody who will not read the rest."),
        h(2, "Context"),
        p("The system as it is now, and why it cannot stay that way."),
        h(2, "Proposal"),
        p("The design. Diagrams and schemas belong here."),
        h(2, "Alternatives considered"),
        p(
            "Each alternative and why it was not chosen. A design doc without this "
            "section cannot be reviewed — only agreed with."
        ),
        h(2, "Risks and migration"),
        bullets("What could go wrong, and what happens then", "How existing data moves"),
        h(2, "Rollout"),
        todos("Step", "Step"),
    ),
    prompt=(
        "Write a technical design document for the following. Include a summary, the "
        "current context, the proposed design, alternatives considered with reasons "
        "for rejection, risks, and a rollout plan.\n\n{context}"
    ),
    variables=("context",),
)

RUNBOOK = SystemTemplate(
    slug="runbook",
    name="Runbook",
    description="How to operate a service, and what to do when it breaks",
    category=TemplateCategory.GUIDES,
    icon="📕",
    content=doc(
        h(1, "Runbook: "),
        quote("Service owner · On-call rotation · Escalation — fill these in."),
        h(2, "What this service does"),
        p("One paragraph, in terms of what breaks for users when it is down."),
        h(2, "Health checks"),
        bullets("Dashboard link", "Alert that fires", "What healthy looks like"),
        h(2, "Common failures"),
        h(3, "Symptom"),
        p("What you will see."),
        p("Diagnosis:"),
        code("bash", "# the command that confirms it"),
        p("Fix:"),
        todos("Step to take", "How to confirm it worked"),
        h(2, "Escalation"),
        p("Who to wake, at what threshold, and what to tell them."),
    ),
    prompt=(
        "Write an operational runbook for the following service. Cover what it does, "
        "how to check its health, the common failure modes with diagnosis commands "
        "and fixes, and when to escalate.\n\n{context}"
    ),
    variables=("context",),
)

POSTMORTEM = SystemTemplate(
    slug="postmortem",
    name="Postmortem",
    description="What happened, why, and what changes — blameless",
    category=TemplateCategory.GENERAL,
    icon="🔥",
    content=doc(
        h(1, "Postmortem: "),
        quote("Date · Duration · Author — fill these in and delete this line."),
        h(2, "Impact"),
        p("Who was affected, how, and for how long. Numbers, not adjectives."),
        h(2, "Timeline"),
        table(["Time", "Event"], rows=4),
        h(2, "Root cause"),
        p(
            "The condition that made this possible, not the person who typed. Keep "
            "asking why until the answer is a system property."
        ),
        h(2, "What went well"),
        bullets("Detection, mitigation or tooling that helped"),
        h(2, "What did not"),
        bullets("Where time was lost"),
        h(2, "Actions"),
        p("Each with an owner. An action without one does not happen."),
        todos("Action — owner", "Action — owner"),
    ),
    prompt=(
        "Write a blameless postmortem for the following incident. Cover impact, a "
        "timeline, the root cause as a system property rather than human error, what "
        "helped, what did not, and owned follow-up actions.\n\n{context}"
    ),
    variables=("context",),
)

MEETING_NOTES = SystemTemplate(
    slug="meeting-notes",
    name="Meeting notes",
    description="Decisions and owned actions, not a transcript",
    category=TemplateCategory.GENERAL,
    icon="🗒",
    content=doc(
        h(1, "Meeting notes"),
        quote("Date · Attendees — fill these in and delete this line."),
        h(2, "Decisions"),
        p("What was actually decided. This is the part people come back for."),
        bullets("Decision"),
        h(2, "Actions"),
        todos("Action — owner — due", "Action — owner — due"),
        h(2, "Discussion"),
        p("Context worth keeping. Everything else can be left out."),
        h(2, "Parked"),
        bullets("Raised, not resolved, worth returning to"),
    ),
    prompt=(
        "Summarise the following meeting into decisions, owned actions with dates, "
        "the discussion worth keeping, and parked items.\n\n{context}"
    ),
    variables=("context",),
)

ONBOARDING = SystemTemplate(
    slug="onboarding",
    name="Onboarding guide",
    description="A new joiner's first week, in order",
    category=TemplateCategory.GUIDES,
    icon="🚀",
    content=doc(
        h(1, "Onboarding: "),
        p("Welcome. Work down this page in order; it should take about a day."),
        h(2, "Access you need"),
        todos("Repository access", "Environment credentials", "Calendars and channels"),
        h(2, "Run it locally"),
        code("bash", "# clone, install, start"),
        p("You are set up when:"),
        bullets("The observable thing that proves it works"),
        h(2, "How the system fits together"),
        p("The three or four pieces worth knowing on day one, and nothing more."),
        h(2, "Your first change"),
        p("A small, real, reviewable task — shipping something beats reading."),
        h(2, "Who to ask"),
        table(["Topic", "Person"]),
    ),
    prompt=(
        "Write an onboarding guide for a new engineer joining the following project. "
        "Cover access, local setup with a concrete success check, the architecture "
        "worth knowing on day one, a first task, and who to ask.\n\n{context}"
    ),
    variables=("context",),
)

API_REFERENCE = SystemTemplate(
    slug="api-reference",
    name="API reference",
    description="Endpoints, parameters, responses and auth",
    category=TemplateCategory.API_DOCS,
    icon="📡",
    content=doc(
        h(1, "API reference"),
        p("Base URL, versioning, and what a caller needs before their first request."),
        h(2, "Authentication"),
        p("The scheme, where the credential goes, and how it expires."),
        h(2, "Endpoints"),
        h(3, "GET /api/resource"),
        p("What it returns and when you would call it."),
        h(4, "Parameters"),
        bullets("param — required — what it does"),
        h(4, "Response"),
        code("json", '{\n  "data": [],\n  "status": "success"\n}'),
        h(4, "Errors"),
        table(["Status", "Meaning", "What to do"]),
        h(2, "Rate limits"),
        p("The limit, the window, and the response when it is exceeded."),
    ),
    prompt=(
        "Write API reference documentation for the following. Cover authentication, "
        "each endpoint with its parameters, an example response, the errors it can "
        "return, and rate limits.\n\n{context}"
    ),
    variables=("context",),
)

README = SystemTemplate(
    slug="readme",
    name="README",
    description="What a project is, how to run it, how to contribute",
    category=TemplateCategory.README,
    icon="📖",
    content=doc(
        h(1, "Project name"),
        p("What it does, in one sentence somebody outside the team would understand."),
        h(2, "Getting started"),
        h(3, "Requirements"),
        bullets("Runtime and version", "Services it needs"),
        h(3, "Install"),
        code("bash", "# install and run"),
        h(2, "Usage"),
        code("bash", "# the smallest useful example"),
        h(2, "Configuration"),
        table(["Variable", "Default", "What it controls"]),
        h(2, "Development"),
        p("How to run the tests, and how to submit a change."),
    ),
    prompt=(
        "Write a README for the following project. Cover what it does, requirements, "
        "installation, a usage example, configuration, and how to run the tests and "
        "contribute.\n\n{context}"
    ),
    variables=("context",),
)

# Order is display order in the picker: Blank first because it is the escape
# hatch, then the documents an engineering team writes most often.
SYSTEM_TEMPLATES: tuple[SystemTemplate, ...] = (
    BLANK,
    PRD,
    DESIGN_DOC,
    RUNBOOK,
    POSTMORTEM,
    MEETING_NOTES,
    ONBOARDING,
    API_REFERENCE,
    README,
)

_BY_ID = {template.id: template for template in SYSTEM_TEMPLATES}


def list_system_templates(category: str | None = None) -> tuple[SystemTemplate, ...]:
    """The catalogue, optionally narrowed to one category."""
    if category is None:
        return SYSTEM_TEMPLATES
    return tuple(t for t in SYSTEM_TEMPLATES if t.category.value == category)


def is_system_template_id(template_id: str | None) -> bool:
    return bool(template_id) and str(template_id).startswith(SYSTEM_TEMPLATE_PREFIX)


def get_system_template(template_id: str | None) -> SystemTemplate | None:
    """The catalogue entry for an id, or None. Callers decide whether that is an error."""
    return _BY_ID.get(str(template_id).strip()) if template_id else None


def _validate() -> None:
    """Fail at import on an authoring mistake rather than in the picker.

    A duplicate slug would silently shadow a template, and an empty prompt would
    only surface when somebody pointed the generator at it — far from the cause.
    """
    seen: set[str] = set()
    for template in SYSTEM_TEMPLATES:
        if template.slug in seen:
            raise ValueError(f"duplicate system template slug: {template.slug!r}")
        seen.add(template.slug)
        if not template.prompt.strip():
            raise ValueError(f"system template {template.slug!r} has no prompt")
        if template.content.get("type") != "doc" or not template.content.get("content"):
            raise ValueError(f"system template {template.slug!r} has no content")


_validate()
