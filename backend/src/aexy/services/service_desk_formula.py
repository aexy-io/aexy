"""Custom scorecard KPIs: a closed vocabulary, and the interpreter for it.

The six shipped KPIs are functions. This is what lets a desk define a seventh
without one — but deliberately **not** by evaluating an expression somebody
typed. A free-text formula field can be typed into a syntax error, exposes an
evaluator to arbitrary input, cannot be translated, gives no hint what fields
exist, and produces a KPI only its author can read. That last one decides it:
this grades named colleagues, and a rating nobody can audit is worse than none.

What makes a closed vocabulary sufficient is that ``fold_ticket`` already
produces a fixed set of per-ticket facts. A custom KPI is therefore a *sentence*
over those facts, in one of two shapes::

    Average  of  time in Insurer   over tickets where  product is Motor
    Share    of tickets where  hand-offs <= 2   among  closed tickets

Three or four slots, every one a choice from a list. No syntax, so no syntax
errors; no parsing, so nothing to inject; and it reads back as a sentence in
whatever language the reader has.

**The design test this vocabulary had to pass** was expressing the six KPIs that
already ship. Four came out cleanly. The three that did not are the reason for
three features that would otherwise look like over-engineering:

* ``relative_to_desk_average`` — Productivity is a ratio against the cohort, and
  without a normaliser every custom KPI is absolute. Cohort-relative measures are
  the most useful kind on a team scorecard.
* **Setting references** — Zero-Breach compares against the desk's breach target.
  A number typed today silently stops matching when Ops changes the shift, so a
  filter's right-hand side can be ``{"setting": ...}`` instead of a literal.
* ``own_queue`` — Owner-Attributable TAT means "the desk's own queue", which is
  whichever bucket the taxonomy says, not a slug frozen at authoring time.

Evaluation is a fold over the rows the TAT report already produced. There is no
database access here at all, which is what keeps a custom KPI from becoming a
query somebody can aim.
"""

from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from aexy.services.service_desk_clock import Clock
from aexy.services.service_desk_taxonomy import Taxonomy

logger = logging.getLogger(__name__)

_HOUR = 3600.0

# --------------------------------------------------------------------------
# The vocabulary
# --------------------------------------------------------------------------

# How a field's values may be compared, and how a figure over them should read.
KIND_DURATION = "duration"  # hours, on the desk's working clock
KIND_NUMBER = "number"
KIND_BOOLEAN = "boolean"
KIND_CATEGORY = "category"

AGG_SHARE = "share"
AGG_COUNT = "count"
AGG_AVERAGE = "average"
AGG_MEDIAN = "median"
AGG_MIN = "min"
AGG_MAX = "max"
AGG_SUM = "sum"

# `share` and `count` measure tickets, so they take no field; the rest reduce one.
AGGREGATIONS_WITHOUT_FIELD = (AGG_SHARE, AGG_COUNT)
AGGREGATIONS_OVER_FIELD = (AGG_AVERAGE, AGG_MEDIAN, AGG_MIN, AGG_MAX, AGG_SUM)
AGGREGATIONS = AGGREGATIONS_WITHOUT_FIELD + AGGREGATIONS_OVER_FIELD

# Units a result carries, so the UI does not render a 0.83 rate as 83 hours.
UNIT_RATE = "rate"
UNIT_COUNT = "count"
UNIT_HOURS = "hours"
UNIT_RATIO = "ratio"

OPS_ORDERED = ("lt", "lte", "gt", "gte", "eq", "ne")
OPS_EQUALITY = ("eq", "ne")

# The pseudo-field for "whichever bucket this desk works out of". Resolved from
# the taxonomy at evaluation time, so a desk that renames its queue keeps a
# working KPI. See the module docstring.
FIELD_OWN_QUEUE = "own_queue"
# Prefix for a named stakeholder: `stakeholder:insurer`. Expanded from the
# workspace's own taxonomy, exactly like the TAT report's columns.
STAKEHOLDER_PREFIX = "stakeholder:"

# Values a filter may reference instead of a literal number. They resolve
# against the workspace's live settings, so a threshold cannot go stale.
SETTING_BREACH_TARGET_HOURS = "breach_target_hours"
SETTING_WORKING_DAY_HOURS = "working_day_hours"
SETTINGS = (SETTING_BREACH_TARGET_HOURS, SETTING_WORKING_DAY_HOURS)


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    kind: str
    # How to pull it off a folded ticket row. Durations come out in hours.
    getter: Any = None


def _hours(seconds: int | None) -> float | None:
    return None if seconds is None else round(seconds / _HOUR, 4)


# Fixed fields. Per-stakeholder ones are appended per workspace by `vocabulary`.
BASE_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("first_response", "First response time", KIND_DURATION,
              lambda r: _hours(r.first_response_seconds)),
    FieldSpec("longest_stage", "Longest single stage", KIND_DURATION,
              lambda r: _hours(r.max_stage_seconds)),
    FieldSpec("current_stage", "Time in current stage", KIND_DURATION,
              lambda r: _hours(r.current_stage_seconds)),
    # Wall clock, unlike every other duration here — it is what the requester
    # waited, and the label has to say so or the two get compared.
    FieldSpec("total_elapsed", "Total elapsed time", KIND_DURATION,
              lambda r: _hours(r.overall_seconds)),
    FieldSpec("handshakes", "Hand-offs", KIND_NUMBER, lambda r: float(r.handshakes)),
    FieldSpec("is_closed", "Closed", KIND_BOOLEAN, lambda r: bool(r.is_closed)),
    FieldSpec("reopened", "Reopened", KIND_BOOLEAN, lambda r: bool(r.reopened)),
    FieldSpec("zero_breach", "Zero-breach", KIND_BOOLEAN, lambda r: bool(r.zero_breach)),
    FieldSpec("request_type", "Request type", KIND_CATEGORY, lambda r: r.request_type),
    FieldSpec("pending_with", "Pending with", KIND_CATEGORY, lambda r: r.pending_with),
    FieldSpec("breach_level", "Breach level", KIND_CATEGORY, lambda r: r.breach_level),
    FieldSpec("account", "Account", KIND_CATEGORY, lambda r: r.account),
    FieldSpec("product", "Product", KIND_CATEGORY, lambda r: r.product),
    FieldSpec("vendor", "Vendor", KIND_CATEGORY, lambda r: r.vendor),
)

_BASE_BY_KEY = {f.key: f for f in BASE_FIELDS}


def _stakeholder_getter(slug: str):
    return lambda r: _hours(r.stakeholder_seconds.get(slug, 0))


def resolve_field(key: str, taxonomy: Taxonomy) -> FieldSpec | None:
    """One field, with per-workspace ones resolved against the taxonomy."""
    if key in _BASE_BY_KEY:
        return _BASE_BY_KEY[key]
    if key == FIELD_OWN_QUEUE:
        slug = taxonomy.default_stakeholder_slug
        if slug is None:
            return None
        return FieldSpec(
            FIELD_OWN_QUEUE, "Time in the desk's own queue", KIND_DURATION,
            _stakeholder_getter(slug),
        )
    if key.startswith(STAKEHOLDER_PREFIX):
        slug = key[len(STAKEHOLDER_PREFIX):]
        s = taxonomy.stakeholder(slug)
        if s is None or taxonomy.is_closed(slug):
            return None
        return FieldSpec(key, f"Time in {s.label}", KIND_DURATION, _stakeholder_getter(slug))
    return None


def vocabulary(taxonomy: Taxonomy, clock: Clock) -> dict:
    """Everything the builder may offer, in this workspace's own nouns.

    Served rather than compiled into the client for the same reason the TAT
    report's columns are: a desk that adds a Legal bucket gets "Time in Legal"
    with no frontend release, and one that renames its nouns sees its own words.
    """
    term = taxonomy.term
    fields: list[dict] = []
    for f in BASE_FIELDS:
        label = {
            "account": term("account"),
            "product": term("product"),
            "vendor": term("vendor"),
        }.get(f.key, f.label)
        fields.append({"key": f.key, "label": label, "kind": f.kind})

    own = resolve_field(FIELD_OWN_QUEUE, taxonomy)
    if own is not None:
        fields.append({"key": own.key, "label": own.label, "kind": own.kind})
    for s in taxonomy.stakeholders:
        if taxonomy.is_closed(s.slug):
            continue
        fields.append(
            {
                "key": f"{STAKEHOLDER_PREFIX}{s.slug}",
                "label": f"Time in {s.label}",
                "kind": KIND_DURATION,
            }
        )

    return {
        "fields": fields,
        "aggregations": [
            {"key": AGG_SHARE, "label": "Share", "takes_field": False, "unit": UNIT_RATE},
            {"key": AGG_COUNT, "label": "Count", "takes_field": False, "unit": UNIT_COUNT},
            {"key": AGG_AVERAGE, "label": "Average", "takes_field": True, "unit": None},
            {"key": AGG_MEDIAN, "label": "Median", "takes_field": True, "unit": None},
            {"key": AGG_MIN, "label": "Minimum", "takes_field": True, "unit": None},
            {"key": AGG_MAX, "label": "Maximum", "takes_field": True, "unit": None},
            {"key": AGG_SUM, "label": "Total", "takes_field": True, "unit": None},
        ],
        # Which comparisons each kind of field allows, so the builder cannot
        # offer "greater than" on a request type.
        "operators": {
            KIND_DURATION: list(OPS_ORDERED),
            KIND_NUMBER: list(OPS_ORDERED),
            KIND_BOOLEAN: list(OPS_EQUALITY),
            KIND_CATEGORY: list(OPS_EQUALITY),
        },
        # Live values a filter can point at instead of a number that goes stale.
        "settings": [
            {
                "key": SETTING_BREACH_TARGET_HOURS,
                "label": "the breach target",
                "value": round(clock.breach_red_days * clock.working_day_seconds / _HOUR, 2),
                "unit": UNIT_HOURS,
            },
            {
                "key": SETTING_WORKING_DAY_HOURS,
                "label": "one working day",
                "value": round(clock.working_day_seconds / _HOUR, 2),
                "unit": UNIT_HOURS,
            },
        ],
        # Category fields get their options from the workspace, so the builder
        # offers real values rather than a free-text box that never matches.
        "options": {
            "request_type": [{"value": r.slug, "label": r.label} for r in taxonomy.request_types],
            "pending_with": [{"value": s.slug, "label": s.label} for s in taxonomy.stakeholders],
            "breach_level": [
                {"value": "green", "label": "Green"},
                {"value": "amber", "label": "Amber"},
                {"value": "red", "label": "Red"},
            ],
        },
    }


# --------------------------------------------------------------------------
# The definition
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Filter:
    field: str
    op: str
    value: Any


@dataclass(frozen=True)
class Definition:
    aggregation: str
    field: str | None = None
    # `share` only: what makes a ticket count toward the numerator.
    condition: tuple[Filter, ...] = ()
    # Which tickets are in scope at all — the denominator for `share`.
    population: tuple[Filter, ...] = ()
    # Divide by the desk-wide mean, turning an absolute figure into "how this
    # owner compares". Applied by the caller across all owners, not here: a
    # cohort of one cannot be computed from one owner's tickets.
    relative_to_desk_average: bool = False

    def unit(self) -> str:
        if self.relative_to_desk_average:
            return UNIT_RATIO
        if self.aggregation == AGG_SHARE:
            return UNIT_RATE
        if self.aggregation == AGG_COUNT:
            return UNIT_COUNT
        return UNIT_HOURS if self.field and self.field != "handshakes" else UNIT_COUNT


def parse(raw: Any) -> Definition:
    """A stored/submitted dict as a Definition. Shape only — see `validate`."""
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="A custom KPI needs a definition object")

    def filters(key: str) -> tuple[Filter, ...]:
        items = raw.get(key) or []
        if not isinstance(items, list):
            raise HTTPException(status_code=422, detail=f"{key} must be a list of conditions")
        out = []
        for item in items:
            if not isinstance(item, dict) or "field" not in item or "op" not in item:
                raise HTTPException(
                    status_code=422, detail=f"Each {key} entry needs a field, an operator and a value"
                )
            out.append(Filter(str(item["field"]), str(item["op"]), item.get("value")))
        return tuple(out)

    return Definition(
        aggregation=str(raw.get("aggregation") or ""),
        field=raw.get("field") or None,
        condition=filters("condition"),
        population=filters("population"),
        relative_to_desk_average=bool(raw.get("relative_to_desk_average")),
    )


def to_dict(definition: Definition) -> dict:
    return {
        "aggregation": definition.aggregation,
        "field": definition.field,
        "condition": [{"field": f.field, "op": f.op, "value": f.value} for f in definition.condition],
        "population": [{"field": f.field, "op": f.op, "value": f.value} for f in definition.population],
        "relative_to_desk_average": definition.relative_to_desk_average,
    }


def validate(definition: Definition, taxonomy: Taxonomy) -> None:
    """Reject anything the builder would not have offered.

    Every slot is checked against the same vocabulary the UI was served, so a
    hand-crafted request cannot reach a field the builder does not show. This is
    the whole security story: there is no expression to sanitise because there
    is no expression.
    """
    if definition.aggregation not in AGGREGATIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown aggregation (known: {', '.join(AGGREGATIONS)})",
        )

    if definition.aggregation in AGGREGATIONS_OVER_FIELD:
        if not definition.field:
            raise HTTPException(
                status_code=422, detail=f"'{definition.aggregation}' needs a field to measure"
            )
        spec = resolve_field(definition.field, taxonomy)
        if spec is None:
            raise HTTPException(status_code=422, detail=f"Unknown field {definition.field!r}")
        if spec.kind not in (KIND_DURATION, KIND_NUMBER):
            raise HTTPException(
                status_code=422,
                detail=f"'{definition.aggregation}' needs a numeric field, and {spec.label} is not one",
            )
    elif definition.field:
        raise HTTPException(
            status_code=422,
            detail=f"'{definition.aggregation}' counts tickets and takes no field",
        )

    if definition.aggregation == AGG_SHARE and not definition.condition:
        raise HTTPException(
            status_code=422, detail="A share needs at least one condition saying what counts"
        )
    if definition.aggregation != AGG_SHARE and definition.condition:
        raise HTTPException(
            status_code=422,
            detail="Only a share takes a condition; narrow the tickets with the population instead",
        )

    for group in (definition.condition, definition.population):
        for f in group:
            spec = resolve_field(f.field, taxonomy)
            if spec is None:
                raise HTTPException(status_code=422, detail=f"Unknown field {f.field!r}")
            allowed = OPS_ORDERED if spec.kind in (KIND_DURATION, KIND_NUMBER) else OPS_EQUALITY
            if f.op not in allowed:
                raise HTTPException(
                    status_code=422,
                    detail=f"{spec.label} cannot be compared with '{f.op}'",
                )
            _validate_value(spec, f.value)


def _validate_value(spec: FieldSpec, value: Any) -> None:
    if isinstance(value, dict):
        if value.get("setting") not in SETTINGS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown setting reference (known: {', '.join(SETTINGS)})",
            )
        if spec.kind not in (KIND_DURATION, KIND_NUMBER):
            raise HTTPException(
                status_code=422, detail=f"{spec.label} cannot be compared against a setting"
            )
        return
    if spec.kind in (KIND_DURATION, KIND_NUMBER):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise HTTPException(status_code=422, detail=f"{spec.label} needs a number")
    elif spec.kind == KIND_BOOLEAN:
        if not isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"{spec.label} needs yes or no")
    elif not isinstance(value, str) or not value.strip():
        # An empty category value passes every other check and then matches
        # nothing, so the KPI scores None for everybody with nothing on screen
        # saying the filter was never finished. Caught here instead.
        raise HTTPException(status_code=422, detail=f"{spec.label} needs a value")


# --------------------------------------------------------------------------
# Evaluation
# --------------------------------------------------------------------------


def _setting_value(key: str, clock: Clock) -> float:
    if key == SETTING_BREACH_TARGET_HOURS:
        return clock.breach_red_days * clock.working_day_seconds / _HOUR
    return clock.working_day_seconds / _HOUR


def _resolve_value(value: Any, clock: Clock) -> Any:
    """A literal, or the live value of the setting it points at."""
    if isinstance(value, dict) and "setting" in value:
        return _setting_value(str(value["setting"]), clock)
    return value


def _matches(row, filters: tuple[Filter, ...], taxonomy: Taxonomy, clock: Clock) -> bool:
    """Every filter must hold. Filters are AND-ed; there is deliberately no OR.

    An OR needs grouping to be unambiguous, grouping needs parentheses, and
    parentheses are the point at which a builder becomes an expression editor.
    Two conditions worth OR-ing are usually two KPIs.
    """
    for f in filters:
        spec = resolve_field(f.field, taxonomy)
        if spec is None:
            # A field that has since been deleted — a retired stakeholder, say.
            # The ticket cannot match a question that no longer has an answer.
            return False
        actual = spec.getter(row)
        expected = _resolve_value(f.value, clock)
        if actual is None:
            # A ticket with no value for the field genuinely *is* "not X", so
            # `ne` matches it. Everything else needs something to compare and
            # does not. Returning False for `ne` too would silently drop every
            # unattributed ticket from a population the author meant to include
            # — and tickets with no account are common enough that the TAT
            # report gives them their own bucket.
            if f.op != "ne":
                return False
            continue
        if f.op == "eq" and actual != expected:
            return False
        if f.op == "ne" and actual == expected:
            return False
        if f.op in ("lt", "lte", "gt", "gte"):
            try:
                a, b = float(actual), float(expected)
            except (TypeError, ValueError):
                return False
            if f.op == "lt" and not a < b:
                return False
            if f.op == "lte" and not a <= b:
                return False
            if f.op == "gt" and not a > b:
                return False
            if f.op == "gte" and not a >= b:
                return False
    return True


def evaluate(
    definition: Definition, tickets: list, taxonomy: Taxonomy, clock: Clock
) -> float | None:
    """The raw figure for one owner, or None when nothing was eligible.

    None rather than 0 throughout, for the reason the whole module holds to:
    "this owner had no tickets that qualified" and "this owner scored zero" are
    different facts, and conflating them rates somebody Unsatisfactory for a
    quiet month.

    ``relative_to_desk_average`` is NOT applied here — it needs every owner's
    figure, so ``normalise_to_cohort`` does it once the caller has them all.
    """
    population = [t for t in tickets if _matches(t, definition.population, taxonomy, clock)]
    if not population:
        return None

    if definition.aggregation == AGG_COUNT:
        return float(len(population))

    if definition.aggregation == AGG_SHARE:
        matching = sum(
            1 for t in population if _matches(t, definition.condition, taxonomy, clock)
        )
        return round(matching / len(population), 4)

    spec = resolve_field(definition.field or "", taxonomy)
    if spec is None:
        return None
    values = [v for v in (spec.getter(t) for t in population) if v is not None]
    if not values:
        return None

    if definition.aggregation == AGG_AVERAGE:
        return round(sum(values) / len(values), 4)
    if definition.aggregation == AGG_MEDIAN:
        return round(statistics.median(values), 4)
    if definition.aggregation == AGG_MIN:
        return round(min(values), 4)
    if definition.aggregation == AGG_MAX:
        return round(max(values), 4)
    return round(sum(values), 4)  # AGG_SUM


def normalise_to_cohort(values: dict[str, float | None]) -> dict[str, float | None]:
    """Turn absolute figures into multiples of the desk mean.

    Separate from ``evaluate`` because it is the one operation that cannot be
    computed from one owner's tickets. Applied across every owner on the desk
    even when only one row is returned — a cohort of one divides a number by
    itself and reads 1.00 forever, which is a wrong number rather than a
    restricted view. Same rule as Productivity's, for the same reason.
    """
    present = [v for v in values.values() if v is not None]
    if not present:
        return {k: None for k in values}
    mean = sum(present) / len(present)
    if mean == 0:
        # Everyone scored zero. A ratio against it is undefined, and reporting
        # 1.00x ("everybody is average") would read as a working figure.
        return {k: None for k in values}
    return {k: (None if v is None else round(v / mean, 4)) for k, v in values.items()}
