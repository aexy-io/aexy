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
any one customer's name is not.

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

from aexy.services.org_functions import canonical_function_key

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


# ---------------------------------------------------------------------------
# Performance scorecard — the KPI set a desk grades its owners on.
# ---------------------------------------------------------------------------

# Direction of merit. Which one a KPI uses decides which scoring curve applies,
# so it is part of the vocabulary rather than a free-text note.
HIGHER_IS_BETTER = "higher_is_better"
LOWER_IS_BETTER = "lower_is_better"
DIRECTIONS = (HIGHER_IS_BETTER, LOWER_IS_BETTER)

# How a KPI's raw figure should be read, so a UI does not render 0.83 as 83
# hours. Mirrors `service_desk_analytics.Measure.unit`.
UNIT_RATIO = "ratio"
UNIT_RATE = "rate"
UNIT_HOURS = "hours"

# The metric vocabulary. A template may enable, weight, relabel and retune any
# of these; it may not invent one, because each needs a computation. The
# compute functions live in `services/service_desk_scorecard.py`, which asserts
# at import that it implements every key declared here — the dependency runs
# that way round so this module stays free of database imports.
METRIC_PRODUCTIVITY = "productivity"
METRIC_FIRST_RESPONSE = "first_response"
METRIC_HANDSHAKE_EFFICIENCY = "handshake_efficiency"
METRIC_OWNER_TAT = "owner_attributable_tat"
METRIC_ZERO_BREACH = "zero_breach"
METRIC_NOT_REOPENED = "not_reopened"

METRIC_KEYS = (
    METRIC_PRODUCTIVITY,
    METRIC_FIRST_RESPONSE,
    METRIC_HANDSHAKE_EFFICIENCY,
    METRIC_OWNER_TAT,
    METRIC_ZERO_BREACH,
    METRIC_NOT_REOPENED,
)


@dataclass(frozen=True)
class ScorecardKPISpec:
    """One weighted KPI on the owner scorecard.

    Everything a score depends on is here, which is the point: the weights, the
    benchmarks and the slope of the penalty were numbers typed into a
    business's opinion, and reproducing them as module constants would have
    moved the problem rather than solved it. A workspace edits rows seeded from this.
    """

    metric_key: str
    label: str
    weight: float
    direction: str
    unit: str
    # LOWER_IS_BETTER only: full marks at or under `benchmark`, then
    # `penalty_per_unit` points off for every unit over it.
    benchmark: float | None = None
    penalty_per_unit: float | None = None
    # HIGHER_IS_BETTER only: the value that scores 100.
    target: float | None = None
    # A number inside the metric's own question, for the metrics that ask one:
    # "resolved in at most N hand-offs". Distinct from `benchmark`, which grades
    # the resulting figure — this one decides which tickets count in the first
    # place. Only the metrics declaring `uses_threshold` read it.
    threshold: float | None = None
    enabled: bool = True


@dataclass(frozen=True)
class ScorecardBandSpec:
    """One rating band: a floor on the weighted total, and what to call it."""

    rating: int
    min_score: float
    label: str


# The default KPI set. Industry-neutral on purpose — "did the owner answer quickly and cleanly"
# is not an insurance question — so templates inherit these unless they say
# otherwise, the same way they inherit DEFAULT_TERMINOLOGY.
#
# On `target` for the three rate KPIs: 1.0 means a perfect rate scores 100, which
# is the reading most desks expect. A desk that wants full marks at, say, 95%
# edits three rows.
DEFAULT_SCORECARD_KPIS: tuple[ScorecardKPISpec, ...] = (
    ScorecardKPISpec(
        METRIC_PRODUCTIVITY,
        "Productivity",
        weight=0.20,
        direction=HIGHER_IS_BETTER,
        unit=UNIT_RATIO,
        # Closed count as a multiple of the desk average, so 1.0 is "at the team
        # average" and scores full marks. Capped, so a high-volume outlier does
        # not stretch the scale for everyone else.
        target=1.0,
    ),
    ScorecardKPISpec(
        METRIC_FIRST_RESPONSE,
        "First Time Response",
        weight=0.20,
        direction=LOWER_IS_BETTER,
        unit=UNIT_HOURS,
        benchmark=4.0,
        penalty_per_unit=10.0,
    ),
    ScorecardKPISpec(
        METRIC_HANDSHAKE_EFFICIENCY,
        "Handshake Efficiency",
        weight=0.20,
        direction=HIGHER_IS_BETTER,
        unit=UNIT_RATE,
        target=1.0,
        # "2 or fewer hand-offs" — the number belongs in the KPI's own title.
        # It was a module constant, which made the one figure on this scorecard
        # a desk could not tune.
        threshold=2.0,
    ),
    ScorecardKPISpec(
        METRIC_OWNER_TAT,
        "Owner-Attributable TAT",
        weight=0.15,
        direction=LOWER_IS_BETTER,
        unit=UNIT_HOURS,
        benchmark=8.0,
        penalty_per_unit=5.0,
    ),
    ScorecardKPISpec(
        METRIC_ZERO_BREACH,
        "Zero-Breach",
        weight=0.15,
        direction=HIGHER_IS_BETTER,
        unit=UNIT_RATE,
        target=1.0,
    ),
    ScorecardKPISpec(
        METRIC_NOT_REOPENED,
        "Not Reopened",
        weight=0.10,
        direction=HIGHER_IS_BETTER,
        unit=UNIT_RATE,
        target=1.0,
    ),
)

# Rating bands, highest first. The lowest band is open-ended downward so no
# weighted total can fall through unrated.
DEFAULT_SCORECARD_BANDS: tuple[ScorecardBandSpec, ...] = (
    ScorecardBandSpec(5, 90.0, "Outstanding"),
    ScorecardBandSpec(4, 75.0, "Exceeds Expectations"),
    ScorecardBandSpec(3, 60.0, "Meets Expectations"),
    ScorecardBandSpec(2, 40.0, "Needs Improvement"),
    ScorecardBandSpec(1, 0.0, "Unsatisfactory"),
)

# Weights are compared against 1.0 with this tolerance. Float addition of six
# two-decimal numbers does not land on exactly 1.0, and rejecting a valid set
# over the last bit would be its own bug.
WEIGHT_SUM_TOLERANCE = 1e-6


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
    # Which master-data table an external bucket speaks for: "account", "vendor",
    # or None. Only meaningful for external stakeholders.
    links_to: str | None = None


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
    # Both default to empty and resolve to the shared sets below. An industry
    # that grades its desk differently overrides them; most do not, and an
    # omitted field must not mean "this template has no scorecard".
    scorecard_kpis: tuple[ScorecardKPISpec, ...] = ()
    scorecard_bands: tuple[ScorecardBandSpec, ...] = ()

    def resolved_terminology(self) -> dict[str, str]:
        """Template labels over the generic defaults."""
        return {**DEFAULT_TERMINOLOGY, **self.terminology}

    def resolved_scorecard_kpis(self) -> tuple[ScorecardKPISpec, ...]:
        """The template's KPI set, or the shared default one."""
        return self.scorecard_kpis or DEFAULT_SCORECARD_KPIS

    def resolved_scorecard_bands(self) -> tuple[ScorecardBandSpec, ...]:
        """The template's rating bands, or the shared default ones."""
        return self.scorecard_bands or DEFAULT_SCORECARD_BANDS

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

# Insurance broking. Stakeholder *slugs* are the legacy enum values on purpose —
# see the module docstring; `service_desk_tickets.pending_with` holds them.
#
# The function key does NOT get that treatment. It used to be `ops_kam`, which
# made this the one template that named Operations differently from every other,
# and since the key is unique per workspace the spelling you got depended on
# which template your desk started from. It is `operations` here now;
# `org_functions` keeps `ops_kam` as a retired spelling that still resolves, and
# migrate_org_function_keys.sql moves existing rows forward.
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
        StakeholderSpec("kam", "KAM", SEMANTIC_INTERNAL, "operations"),
        StakeholderSpec("insurer", "Insurer", SEMANTIC_EXTERNAL, links_to="vendor"),
        StakeholderSpec("partner", "Partner", SEMANTIC_EXTERNAL, links_to="account"),
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
        DepartmentSpec("Operations", "operations"),
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
        # Every key a template ships has to be one the registry knows, in its
        # canonical spelling. Two templates naming the same function differently
        # is exactly how `ops_kam` and `operations` came to coexist, and the
        # symptom — a queue that silently shows nothing — points nowhere near
        # this file.
        for key in sorted(provided | {s.function_key for s in t.stakeholders if s.function_key}):
            canonical = canonical_function_key(key)
            if canonical is None:
                raise ValueError(f"{t.slug}: '{key}' is not a declared function (see org_functions)")
            if canonical != key:
                raise ValueError(
                    f"{t.slug}: '{key}' is a retired spelling of '{canonical}' — templates "
                    "must ship the canonical key"
                )

        rt_slugs = [r.slug for r in t.request_types]
        if not rt_slugs:
            raise ValueError(f"{t.slug}: needs at least one request type")
        if len(rt_slugs) != len(set(rt_slugs)):
            raise ValueError(f"{t.slug}: duplicate request type slugs")
        if len([r for r in t.request_types if r.is_default]) > 1:
            raise ValueError(f"{t.slug}: more than one default request type")

        # The scorecard set, resolved so a template inheriting the defaults is
        # validated too — a bad default would otherwise only fail for whichever
        # template happened to override it.
        kpis = t.resolved_scorecard_kpis()
        keys = [k.metric_key for k in kpis]
        if len(keys) != len(set(keys)):
            raise ValueError(f"{t.slug}: duplicate scorecard metric keys")
        if unknown := set(keys) - set(METRIC_KEYS):
            raise ValueError(f"{t.slug}: unknown scorecard metrics {sorted(unknown)}")
        for k in kpis:
            if k.direction not in DIRECTIONS:
                raise ValueError(f"{t.slug}: {k.metric_key} has invalid direction {k.direction!r}")
            if k.weight <= 0:
                raise ValueError(f"{t.slug}: {k.metric_key} has a non-positive weight")
            # A curve missing its numbers scores every owner identically, which
            # looks like a working report rather than a misconfigured one.
            if k.direction == LOWER_IS_BETTER and (k.benchmark is None or k.penalty_per_unit is None):
                raise ValueError(
                    f"{t.slug}: {k.metric_key} is lower-is-better and needs benchmark + penalty_per_unit"
                )
            if k.direction == HIGHER_IS_BETTER and not k.target:
                raise ValueError(f"{t.slug}: {k.metric_key} is higher-is-better and needs a positive target")

        # Enabled weights must sum to 1. At 0.9 every score is silently deflated
        # by a tenth and the rating bands quietly become stricter — a wrong
        # number that looks exactly like a right one.
        total = sum(k.weight for k in kpis if k.enabled)
        if abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
            raise ValueError(f"{t.slug}: enabled scorecard weights sum to {total}, expected 1.0")

        bands = t.resolved_scorecard_bands()
        if not bands:
            raise ValueError(f"{t.slug}: needs at least one rating band")
        ratings = [b.rating for b in bands]
        if len(ratings) != len(set(ratings)):
            raise ValueError(f"{t.slug}: duplicate rating values")
        # Highest first, and the last one open-ended downward, so every possible
        # total lands in exactly one band.
        floors = [b.min_score for b in bands]
        if floors != sorted(floors, reverse=True):
            raise ValueError(f"{t.slug}: rating bands must be ordered highest score first")
        if bands[-1].min_score > 0:
            raise ValueError(f"{t.slug}: the lowest rating band must start at 0")


_validate()
