"""Industry templates: the vocabulary a Service Desk starts life with.

The module used to *be* an insurance desk. ``RequestType`` and ``PendingWith``
were Python enums, so "who can a ticket be pending with" was a deploy-time
decision — no workspace could add a Legal stakeholder or a Refund request type
without a migration. Three master-data tables were named after insurance
counterparties, and row-level visibility was wired to department function keys
like ``ops_kam`` by a dict no admin could see, let alone edit.

The schema underneath is generic now (``service_desk_stakeholders`` and
``service_desk_request_types``, both per workspace). This file is the catalogue
of starting points that populates it, so a new desk isn't a blank page.

**No template contains company-identifying data.** A template describes a
*shape* — the stakeholders a claims desk hands off between, the request types a
support desk triages into. Names, mailboxes, real accounts and staff are
supplied when a template is applied; the desk's own name defaults to the
workspace name. That separation is the point: "insurance broking" is reusable,
"Bimaplan" is not.

Two rules hold the whole design together:

* Code branches on ``semantics``, never on ``slug`` or ``label``. A workspace
  renaming "Insurer" to "Underwriter" must not change TAT maths. Same reason
  ``WorkspaceStatusCategory.semantics`` exists for sprint statuses.
* The ``insurance_broking`` slugs are frozen at the legacy enum values
  (``kam``, ``insurer``, ``third_party``, …). Existing rows in
  ``service_desk_tickets.pending_with`` and ``ticket_pending_segments`` hold
  those strings, so reusing them is what lets a live desk adopt this without a
  data rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Stakeholder semantics — the stable contract every consumer branches on.
# ---------------------------------------------------------------------------

# Someone inside the company owes the next action. Routes to a department via
# `function_key`, which is what row-level visibility scopes on.
SEMANTIC_INTERNAL = "internal"
# A counterparty outside the company owes the next action. The clock still runs
# (waiting on a third party is still the requester waiting), but nobody internal
# is assigned.
SEMANTIC_EXTERNAL = "external"
# Terminal. The breach clock stops here and the ticket leaves the open queues.
SEMANTIC_CLOSED = "closed"

SEMANTICS = (SEMANTIC_INTERNAL, SEMANTIC_EXTERNAL, SEMANTIC_CLOSED)


# ---------------------------------------------------------------------------
# Terminology — the user-facing nouns for the three master-data tables.
# ---------------------------------------------------------------------------

# Generic defaults. A template overrides the keys its industry names differently;
# anything it omits falls back to these, so adding a key here can't break a
# template that predates it.
DEFAULT_TERMINOLOGY: dict[str, str] = {
    "account": "Account",
    "accounts": "Accounts",
    "vendor": "Vendor",
    "vendors": "Vendors",
    "product": "Product",
    "products": "Products",
    "owner": "Owner",
    "owners": "Owners",
}

TERMINOLOGY_KEYS = tuple(DEFAULT_TERMINOLOGY)


@dataclass(frozen=True)
class StakeholderSpec:
    """One "pending with" bucket a ticket can sit in."""

    slug: str
    label: str
    semantics: str
    # Which department owns this bucket, matched against
    # `Department.function_key`. Only meaningful for internal stakeholders —
    # it's what decides whose tickets a Finance user can see.
    function_key: str | None = None


@dataclass(frozen=True)
class RequestTypeSpec:
    """One triage category for an incoming request."""

    slug: str
    label: str
    is_default: bool = False


@dataclass(frozen=True)
class DepartmentSpec:
    """A department to create if the workspace hasn't got one for this function.

    Applying a template shouldn't leave internal stakeholders pointing at
    function keys no department claims — visibility would silently resolve to
    "nobody" with nothing on screen to explain it.
    """

    name: str
    function_key: str


@dataclass(frozen=True)
class IndustryTemplate:
    slug: str
    name: str
    description: str
    terminology: dict[str, str]
    stakeholders: tuple[StakeholderSpec, ...]
    request_types: tuple[RequestTypeSpec, ...]
    departments: tuple[DepartmentSpec, ...]

    def resolved_terminology(self) -> dict[str, str]:
        """Template labels over the generic defaults."""
        return {**DEFAULT_TERMINOLOGY, **self.terminology}

    @property
    def default_request_type(self) -> RequestTypeSpec:
        """What untriaged mail becomes. First `is_default`, else the first row."""
        return next((r for r in self.request_types if r.is_default), self.request_types[0])

    @property
    def closed_stakeholder(self) -> StakeholderSpec:
        return next(s for s in self.stakeholders if s.semantics == SEMANTIC_CLOSED)


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------

# Insurance broking. Slugs are the legacy enum values on purpose — see the
# module docstring. `ops_kam` likewise stays as the operations function key,
# because existing Department rows use it.
INSURANCE_BROKING = IndustryTemplate(
    slug="insurance_broking",
    name="Insurance Broking",
    description=(
        "Policy servicing and claims for a distribution business: requests move "
        "between the servicing team, the insurer, and the distribution partner."
    ),
    terminology={
        "account": "Partner",
        "accounts": "Partners",
        "vendor": "Insurer",
        "vendors": "Insurers",
        "product": "Line of Business",
        "products": "Lines of Business",
        "owner": "KAM",
        "owners": "KAMs",
    },
    stakeholders=(
        StakeholderSpec("kam", "KAM", SEMANTIC_INTERNAL, "ops_kam"),
        StakeholderSpec("insurer", "Insurer", SEMANTIC_EXTERNAL),
        StakeholderSpec("partner", "Partner", SEMANTIC_EXTERNAL),
        StakeholderSpec("sales", "Sales", SEMANTIC_INTERNAL, "sales"),
        StakeholderSpec("third_party", "Third Party", SEMANTIC_EXTERNAL),
        StakeholderSpec("finance", "Finance", SEMANTIC_INTERNAL, "finance"),
        StakeholderSpec("marketing", "Marketing", SEMANTIC_INTERNAL, "marketing"),
        StakeholderSpec("closed", "Closed", SEMANTIC_CLOSED),
    ),
    request_types=(
        RequestTypeSpec("query", "Query", is_default=True),
        RequestTypeSpec("policy_issuance", "Policy Issuance"),
        RequestTypeSpec("claims", "Claims"),
        RequestTypeSpec("payout", "Payout"),
    ),
    departments=(
        DepartmentSpec("Operations", "ops_kam"),
        DepartmentSpec("Sales", "sales"),
        DepartmentSpec("Finance", "finance"),
        DepartmentSpec("Marketing", "marketing"),
    ),
)

SOFTWARE_SUPPORT = IndustryTemplate(
    slug="software_support",
    name="Software Support",
    description=(
        "Customer support for a software product: triage into bugs and requests, "
        "hand off to engineering, escalate to upstream vendors."
    ),
    terminology={
        "account": "Customer",
        "accounts": "Customers",
        "owner": "Account Manager",
        "owners": "Account Managers",
    },
    stakeholders=(
        StakeholderSpec("support", "Support", SEMANTIC_INTERNAL, "support"),
        StakeholderSpec("engineering", "Engineering", SEMANTIC_INTERNAL, "engineering"),
        StakeholderSpec("customer", "Customer", SEMANTIC_EXTERNAL),
        StakeholderSpec("vendor", "Vendor", SEMANTIC_EXTERNAL),
        StakeholderSpec("sales", "Sales", SEMANTIC_INTERNAL, "sales"),
        StakeholderSpec("finance", "Finance", SEMANTIC_INTERNAL, "finance"),
        StakeholderSpec("closed", "Closed", SEMANTIC_CLOSED),
    ),
    request_types=(
        RequestTypeSpec("question", "Question", is_default=True),
        RequestTypeSpec("bug", "Bug"),
        RequestTypeSpec("feature_request", "Feature Request"),
        RequestTypeSpec("incident", "Incident"),
        RequestTypeSpec("access_request", "Access Request"),
    ),
    departments=(
        DepartmentSpec("Support", "support"),
        DepartmentSpec("Engineering", "engineering"),
        DepartmentSpec("Sales", "sales"),
        DepartmentSpec("Finance", "finance"),
    ),
)

FINANCIAL_SERVICES = IndustryTemplate(
    slug="financial_services",
    name="Financial Services",
    description=(
        "Client servicing for a regulated financial business: onboarding, "
        "transaction queries and disputes, with a compliance hand-off."
    ),
    terminology={
        "account": "Client",
        "accounts": "Clients",
        "vendor": "Provider",
        "vendors": "Providers",
        "owner": "Relationship Manager",
        "owners": "Relationship Managers",
    },
    stakeholders=(
        StakeholderSpec("operations", "Operations", SEMANTIC_INTERNAL, "operations"),
        StakeholderSpec("client", "Client", SEMANTIC_EXTERNAL),
        StakeholderSpec("provider", "Provider", SEMANTIC_EXTERNAL),
        StakeholderSpec("compliance", "Compliance", SEMANTIC_INTERNAL, "compliance"),
        StakeholderSpec("finance", "Finance", SEMANTIC_INTERNAL, "finance"),
        StakeholderSpec("closed", "Closed", SEMANTIC_CLOSED),
    ),
    request_types=(
        RequestTypeSpec("query", "Query", is_default=True),
        RequestTypeSpec("onboarding", "Onboarding"),
        RequestTypeSpec("transaction_dispute", "Transaction Dispute"),
        RequestTypeSpec("statement_request", "Statement Request"),
        RequestTypeSpec("account_closure", "Account Closure"),
    ),
    departments=(
        DepartmentSpec("Operations", "operations"),
        DepartmentSpec("Compliance", "compliance"),
        DepartmentSpec("Finance", "finance"),
    ),
)

GENERIC = IndustryTemplate(
    slug="generic",
    name="General Service Desk",
    description=(
        "A minimal starting point with no industry assumptions — rename these or "
        "add your own once you can see how requests actually flow."
    ),
    terminology={},
    stakeholders=(
        StakeholderSpec("support", "Support", SEMANTIC_INTERNAL, "support"),
        StakeholderSpec("requester", "Requester", SEMANTIC_EXTERNAL),
        StakeholderSpec("vendor", "Vendor", SEMANTIC_EXTERNAL),
        StakeholderSpec("finance", "Finance", SEMANTIC_INTERNAL, "finance"),
        StakeholderSpec("closed", "Closed", SEMANTIC_CLOSED),
    ),
    request_types=(
        RequestTypeSpec("request", "Request", is_default=True),
        RequestTypeSpec("issue", "Issue"),
        RequestTypeSpec("change", "Change"),
    ),
    departments=(
        DepartmentSpec("Support", "support"),
        DepartmentSpec("Finance", "finance"),
    ),
)

INDUSTRY_TEMPLATES: tuple[IndustryTemplate, ...] = (
    GENERIC,
    SOFTWARE_SUPPORT,
    INSURANCE_BROKING,
    FINANCIAL_SERVICES,
)

# What a workspace gets when it has no template and no legacy data. Deliberately
# the neutral one — guessing an industry is worse than asking.
DEFAULT_TEMPLATE_SLUG = GENERIC.slug

# What the migration backfills for workspaces that already ran the desk: their
# rows literally contain these slugs.
LEGACY_TEMPLATE_SLUG = INSURANCE_BROKING.slug

_BY_SLUG = {t.slug: t for t in INDUSTRY_TEMPLATES}


def list_templates() -> tuple[IndustryTemplate, ...]:
    return INDUSTRY_TEMPLATES


def get_template(slug: str | None) -> IndustryTemplate | None:
    """The named template, or None. Callers decide whether absence is an error."""
    return _BY_SLUG.get((slug or "").strip().lower()) if slug else None


def _validate() -> None:
    """Fail at import if a template is malformed.

    These are authoring mistakes, not runtime conditions: a template with two
    closed buckets or an internal stakeholder pointing at a function key no
    department in the template claims would produce a desk that half-works, with
    the symptom (tickets invisible to the team that owns them) appearing far from
    the cause.
    """
    seen: set[str] = set()
    for t in INDUSTRY_TEMPLATES:
        if t.slug in seen:
            raise ValueError(f"duplicate industry template slug: {t.slug}")
        seen.add(t.slug)

        if unknown := set(t.terminology) - set(TERMINOLOGY_KEYS):
            raise ValueError(f"{t.slug}: unknown terminology keys {sorted(unknown)}")

        slugs = [s.slug for s in t.stakeholders]
        if len(slugs) != len(set(slugs)):
            raise ValueError(f"{t.slug}: duplicate stakeholder slugs")
        if bad := [s.slug for s in t.stakeholders if s.semantics not in SEMANTICS]:
            raise ValueError(f"{t.slug}: invalid semantics on {bad}")

        closed = [s for s in t.stakeholders if s.semantics == SEMANTIC_CLOSED]
        if len(closed) != 1:
            raise ValueError(f"{t.slug}: expected exactly one closed stakeholder, got {len(closed)}")

        # An internal bucket with no function key can never be scoped to a team.
        if orphan := [s.slug for s in t.stakeholders if s.semantics == SEMANTIC_INTERNAL and not s.function_key]:
            raise ValueError(f"{t.slug}: internal stakeholders without function_key: {orphan}")
        # ...and one pointing at a function no department provides scopes to nobody.
        provided = {d.function_key for d in t.departments}
        if missing := {
            s.function_key
            for s in t.stakeholders
            if s.semantics == SEMANTIC_INTERNAL and s.function_key not in provided
        }:
            raise ValueError(f"{t.slug}: no department for function keys {sorted(missing)}")

        rt_slugs = [r.slug for r in t.request_types]
        if not rt_slugs:
            raise ValueError(f"{t.slug}: needs at least one request type")
        if len(rt_slugs) != len(set(rt_slugs)):
            raise ValueError(f"{t.slug}: duplicate request type slugs")
        if len([r for r in t.request_types if r.is_default]) > 1:
            raise ValueError(f"{t.slug}: more than one default request type")


_validate()
