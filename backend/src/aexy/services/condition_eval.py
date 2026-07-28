"""Shared condition evaluation for automation steps.

Used by the CRM published executor, the workflow dry-run executor, and the
durable Temporal workflow so operators and field resolution stay consistent.
"""

from __future__ import annotations

from typing import Any


# The twelve comparison operators advertised on condition steps (ConditionOperator
# without the set-membership pair is twelve; we also implement in/not_in and
# between because both FilterOperator and the CRM gate use them).
CONDITION_OPERATORS: frozenset[str] = frozenset(
    {
        "equals",
        "not_equals",
        "contains",
        "not_contains",
        "starts_with",
        "ends_with",
        "is_empty",
        "is_not_empty",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "not_in",
        "between",
        # Aliases builders / Temporal historically wrote
        "greater_than",
        "less_than",
    }
)

# Operators that must be implemented and unit-tested as the "advertised twelve".
ADVERTISED_OPERATORS: tuple[str, ...] = (
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "is_empty",
    "is_not_empty",
    "gt",
    "gte",
    "lt",
    "lte",
)


class UnknownOperatorError(ValueError):
    """Raised when a condition uses an operator the engine does not know."""


def _as_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    return float(value)


def _is_unset(value: Any) -> bool:
    """Whether a field holds no value at all, as opposed to a falsy one."""
    return value is None or value == "" or value == [] or value == {}


def _compare_numeric(actual: Any, expected: Any, compare) -> bool:
    """Numeric comparison that refuses to invent a value for an empty field.

    An unset field is not zero. Coercing it to 0.0 made ``amount < 100`` true
    for every record that has no amount, so a discount/alert automation fired
    on the whole table. Neither side being comparable means the condition is
    simply not satisfied.
    """
    if _is_unset(actual) or _is_unset(expected):
        return False
    try:
        return compare(_as_float(actual), _as_float(expected))
    except (TypeError, ValueError):
        return False


def evaluate_condition(actual: Any, operator: str | None, expected: Any) -> bool:
    """Compare *actual* to *expected* with *operator*.

    Unknown operators raise ``UnknownOperatorError`` — they must not silently
    pass (which would take the true path) or silently fail (which would strand
    every automation on the false path forever).
    """
    op = (operator or "").strip()
    if not op:
        raise UnknownOperatorError("Condition is missing an operator")

    # Normalise aliases
    if op == "greater_than":
        op = "gt"
    elif op == "less_than":
        op = "lt"

    if op not in CONDITION_OPERATORS:
        raise UnknownOperatorError(f"Unknown condition operator: {operator!r}")

    if op == "equals":
        return actual == expected or str(actual) == str(expected)
    if op == "not_equals":
        return not (actual == expected or str(actual) == str(expected))
    if op == "contains":
        return str(expected) in str(actual) if actual is not None else False
    if op == "not_contains":
        return str(expected) not in str(actual) if actual is not None else True
    if op == "starts_with":
        return str(actual).lower().startswith(str(expected).lower()) if actual is not None else False
    if op == "ends_with":
        return str(actual).lower().endswith(str(expected).lower()) if actual is not None else False
    if op == "is_empty":
        return actual is None or actual == "" or actual == [] or actual == {}
    if op == "is_not_empty":
        return not (actual is None or actual == "" or actual == [] or actual == {})
    if op == "gt":
        return _compare_numeric(actual, expected, lambda a, b: a > b)
    if op == "gte":
        return _compare_numeric(actual, expected, lambda a, b: a >= b)
    if op == "lt":
        return _compare_numeric(actual, expected, lambda a, b: a < b)
    if op == "lte":
        return _compare_numeric(actual, expected, lambda a, b: a <= b)
    if op == "in":
        options = expected if isinstance(expected, (list, tuple, set)) else [expected]
        return actual in options
    if op == "not_in":
        options = expected if isinstance(expected, (list, tuple, set)) else [expected]
        return actual not in options
    if op == "between":
        if not isinstance(expected, (list, tuple)) or len(expected) != 2:
            return False
        # Same rule as gt/lt: an unset field is not zero, so it is not "between"
        # anything either.
        if _is_unset(actual):
            return False
        try:
            return _as_float(expected[0]) <= _as_float(actual) <= _as_float(expected[1])
        except (TypeError, ValueError):
            return False

    raise UnknownOperatorError(f"Unknown condition operator: {operator!r}")


def condition_field_key(condition: dict) -> str | None:
    """Field/attribute slug from a condition dict (builder key variance)."""
    raw = (
        condition.get("field")
        or condition.get("attribute")
        or condition.get("attribute_slug")
        or condition.get("field_slug")
        or ""
    )
    raw = str(raw).strip()
    if not raw:
        return None
    # Strip {{record.values.x}} / record.values.x / values.x wrappers
    import re

    m = re.fullmatch(r"(?:\{\{)?(?:record\.)?(?:values\.)?(.+?)(?:\}\})?", raw)
    return m.group(1) if m else raw


def resolve_record_value(record_values: dict | None, field_key: str | None) -> Any:
    """Look up a field on a record.values-like mapping."""
    if not field_key:
        return None
    values = record_values or {}
    if field_key in values:
        return values.get(field_key)
    # Nested path values.foo
    if field_key.startswith("values."):
        return values.get(field_key[len("values.") :])
    return values.get(field_key)


def evaluate_condition_dict(condition: dict, record_values: dict | None) -> bool:
    """Evaluate one condition dict against a record values map."""
    key = condition_field_key(condition)
    actual = resolve_record_value(record_values, key)
    return evaluate_condition(actual, condition.get("operator"), condition.get("value"))


def wait_duration_seconds(data: dict) -> int:
    """Convert a wait node's duration config to seconds.

    Accepts every name the builder and older callers have written so a 7-day
    wait never collapses to 1 day because of a key mismatch.
    """
    amount = data.get("duration_value")
    if amount is None:
        amount = data.get("duration_amount")
    if amount is None:
        amount = data.get("wait_value")
    if amount is None:
        amount = data.get("value")
    if amount is None:
        amount = 1
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        amount = 1

    unit = (
        data.get("duration_unit")
        or data.get("wait_unit")
        or data.get("unit")
        or "days"
    )
    unit = str(unit).lower().strip()
    multipliers = {
        "seconds": 1,
        "second": 1,
        "minutes": 60,
        "minute": 60,
        "hours": 3600,
        "hour": 3600,
        "days": 86400,
        "day": 86400,
    }
    return max(0, amount * multipliers.get(unit, 86400))
