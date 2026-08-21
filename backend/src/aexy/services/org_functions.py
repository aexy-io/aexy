"""The canonical vocabulary for ``Department.function_key``.

A department's ``function_key`` is not a label — it is a routing key. Service
Desk row-level visibility resolves it (a stakeholder bucket names the function
that owes the next action, and only people in the matching department can see
those tickets), the digest resolves it to find a department head to send an
entire desk's open-ticket list to, and ticket auto-assignment resolves it to
pick someone to hand a new request to.

Nothing declared it. It was a free-text box in the department form, and two
independent modules invented their own keys:

* ``onboarding_use_cases`` seeded ``engineering`` / ``marketing`` / ``sales`` /
  ``hr``;
* ``service_desk_industry_templates`` declared ``ops_kam``, ``operations``,
  ``sales``, ``finance``, ``marketing``, ``support``, ``engineering`` and
  ``compliance`` — with ``insurance_broking`` calling Operations ``ops_kam``
  while ``financial_services`` called the same thing ``operations``.

Since the key is unique per workspace, which spelling you got depended on which
template your desk was set up from, and a mismatch has no symptom: the queue
simply shows nothing, which is indistinguishable from a quiet day.

**The set is open.** A registry entry buys a label, a description and a place in
the dropdown; it is not a permission slip. Any organisation with a function we
have not thought of declares ``x_<something>`` and every consumer treats it
identically. What the closed alternative would have bought — a guarantee that
two people can't mean the same thing by two keys — was never available anyway,
since a workspace can rename any department to anything.

**Deliberately no "what this drives" field.** Which functions actually route
anything is a per-workspace fact: it depends on that workspace's
``service_desk_stakeholders`` rows. A static list here would be a second copy of
that, and would start lying the first time an admin edited their taxonomy. The
UI computes it from the workspace instead.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class FunctionSpec:
    """One canonical organisational function."""

    key: str
    label: str
    description: str
    # Retired spellings that still resolve to this function. Read-side only:
    # nothing new is ever written under an alias.
    aliases: tuple[str, ...] = field(default=())


# Ordered as the dropdown should read: the functions most workspaces have first.
FUNCTIONS: tuple[FunctionSpec, ...] = (
    FunctionSpec(
        key="operations",
        label="Operations",
        description="Runs the day-to-day service: fulfilment, servicing, account handling.",
        # `ops_kam` is the insurance-broking spelling, from when this module was
        # an insurance desk and "KAM" (key account manager) was baked into the
        # routing key. Live workspaces hold it in `departments.function_key` and
        # `service_desk_stakeholders.function_key`.
        aliases=("ops_kam",),
    ),
    FunctionSpec(
        key="sales",
        label="Sales",
        description="Owns pipeline, quotes and closing.",
    ),
    FunctionSpec(
        key="marketing",
        label="Marketing",
        description="Owns demand, campaigns and the brand surface.",
    ),
    FunctionSpec(
        key="support",
        label="Support",
        description="Answers inbound customer requests and incidents.",
    ),
    FunctionSpec(
        key="engineering",
        label="Engineering",
        description="Builds and runs the product.",
    ),
    FunctionSpec(
        key="product",
        label="Product",
        description="Decides what gets built and why.",
    ),
    FunctionSpec(
        key="finance",
        label="Finance",
        description="Owns billing, payouts, reconciliation and the books.",
    ),
    FunctionSpec(
        key="legal",
        label="Legal",
        description="Owns contracts, disputes and regulatory correspondence.",
    ),
    FunctionSpec(
        key="compliance",
        label="Compliance",
        description="Owns audits, regulatory filings and internal controls.",
    ),
    FunctionSpec(
        key="hr",
        label="People",
        description="Owns hiring, onboarding, reviews and leave.",
    ),
)

FUNCTIONS_BY_KEY: dict[str, FunctionSpec] = {f.key: f for f in FUNCTIONS}

# Every accepted spelling -> the canonical key. Includes each key as its own
# alias so callers need only one lookup.
_SPELLINGS: dict[str, str] = {
    **{f.key: f.key for f in FUNCTIONS},
    **{alias: f.key for f in FUNCTIONS for alias in f.aliases},
}

# A workspace-specific function nobody standardised. Namespaced so it is obvious
# in the database which keys are ours and which are a customer's, and so adding a
# key to the registry later can never collide with one already in use.
CUSTOM_PREFIX = "x_"
# At least two characters after the prefix, and no leading or trailing
# underscore: `x_` on its own says nothing, and `x_ops_` differing from `x_ops`
# only by punctuation is two keys meaning one function.
_CUSTOM_RE = re.compile(r"^x_[a-z0-9][a-z0-9_]{0,60}[a-z0-9]$")

# Matches the VARCHAR(64) on the column.
MAX_LENGTH = 64


def clean_function_key(raw: str) -> str:
    """Normalise punctuation and case without judging the result.

    Exported so callers comparing a submitted value against a stored one compare
    like with like — "Ops KAM" and "ops_kam" are the same key typed differently,
    and treating them as a change would reject a form nobody edited.
    """
    return raw.strip().lower().replace("-", "_").replace(" ", "_")


def canonical_function_key(raw: str | None) -> str | None:
    """The canonical key for ``raw``, or None if it is not a valid function key.

    Resolves retired spellings, so ``ops_kam`` answers ``operations``. Custom
    ``x_`` keys are their own canonical form.
    """
    if not raw:
        return None
    cleaned = clean_function_key(raw)
    if cleaned in _SPELLINGS:
        return _SPELLINGS[cleaned]
    if _CUSTOM_RE.match(cleaned) and len(cleaned) <= MAX_LENGTH:
        return cleaned
    return None


def is_custom_function_key(key: str) -> bool:
    return key.startswith(CUSTOM_PREFIX)


def function_key_spellings(key: str) -> tuple[str, ...]:
    """Every spelling that means ``key``, for querying rows written earlier.

    A read that compares ``Department.function_key`` to a single string misses a
    workspace still holding the retired spelling. Use this with ``IN`` until the
    normalising migration has run everywhere.
    """
    canonical = canonical_function_key(key)
    if canonical is None:
        return ()
    spec = FUNCTIONS_BY_KEY.get(canonical)
    return (canonical, *spec.aliases) if spec else (canonical,)


def describe_function(key: str | None) -> FunctionSpec | None:
    """The registry entry for ``key``, or None for a custom or unknown key."""
    canonical = canonical_function_key(key)
    return FUNCTIONS_BY_KEY.get(canonical) if canonical else None


def validate_function_key(raw: str | None) -> str | None:
    """Canonical key for a value being *written*, or None when nothing was given.

    Raises ``ValueError`` naming both accepted forms — a rejection that says only
    "invalid" leaves the admin with no way to express a function we don't list.
    """
    if raw is None or not raw.strip():
        return None
    canonical = canonical_function_key(raw)
    if canonical is None:
        raise ValueError(
            f"'{raw}' is not a known function. Use one of: "
            f"{', '.join(sorted(FUNCTIONS_BY_KEY))} — or a custom key of your own "
            f"prefixed with '{CUSTOM_PREFIX}' (lowercase letters, digits and "
            "underscores)."
        )
    return canonical


def canonical_or_grandfathered(raw: str | None, current: str | None = None) -> str | None:
    """Canonicalise a key being written, keeping a stored value the registry predates.

    ``current`` grandfathers what is already in the column: a row carrying a key
    from before this registry existed must still be editable, and rejecting the
    value the form loaded would lock the whole record. Only a *changed* value has
    to be one we recognise.

    Shared by departments and Service Desk stakeholders because the two are
    matched against each other — a stakeholder saved under a spelling a
    department would have canonicalised silently joins to nothing, which is
    indistinguishable from "routing is off".

    Raises ``ValueError`` for an unrecognised new value; callers map that to
    whatever their transport expects.
    """
    if current is not None and raw is not None and clean_function_key(raw) == clean_function_key(current):
        return current
    return validate_function_key(raw)
