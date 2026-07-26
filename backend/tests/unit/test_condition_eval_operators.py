"""US-4.1: every advertised condition operator, plus loud failure on unknown."""

import pytest

from aexy.services.condition_eval import (
    ADVERTISED_OPERATORS,
    UnknownOperatorError,
    evaluate_condition,
    evaluate_condition_dict,
    wait_duration_seconds,
)


@pytest.mark.parametrize(
    "operator,actual,expected,result",
    [
        ("equals", "a", "a", True),
        ("equals", "a", "b", False),
        ("not_equals", "a", "b", True),
        ("not_equals", "a", "a", False),
        ("contains", "hello world", "world", True),
        ("contains", "hello", "z", False),
        ("not_contains", "hello", "z", True),
        ("not_contains", "hello", "ell", False),
        ("starts_with", "Pipeline", "pipe", True),
        ("starts_with", "Pipeline", "x", False),
        ("ends_with", "report.csv", ".csv", True),
        ("ends_with", "report.csv", ".txt", False),
        ("is_empty", None, None, True),
        ("is_empty", "", None, True),
        ("is_empty", "x", None, False),
        ("is_not_empty", "x", None, True),
        ("is_not_empty", "", None, False),
        ("gt", 10, 3, True),
        ("gt", 2, 3, False),
        ("gte", 3, 3, True),
        ("gte", 2, 3, False),
        ("lt", 1, 5, True),
        ("lt", 9, 5, False),
        ("lte", 5, 5, True),
        ("lte", 6, 5, False),
    ],
)
def test_advertised_operator(operator, actual, expected, result):
    assert operator in ADVERTISED_OPERATORS
    assert evaluate_condition(actual, operator, expected) is result


def test_twelve_advertised_operators_are_implemented():
    assert len(ADVERTISED_OPERATORS) == 12
    for op in ADVERTISED_OPERATORS:
        # Smoke: each operator accepts a call without raising
        evaluate_condition("x", op, "x" if op not in {"is_empty", "is_not_empty", "gt", "gte", "lt", "lte"} else 1)


def test_unknown_operator_fails_loudly():
    with pytest.raises(UnknownOperatorError, match="Unknown condition operator"):
        evaluate_condition("a", "definitely_not_an_operator", "a")


def test_missing_operator_fails_loudly():
    with pytest.raises(UnknownOperatorError):
        evaluate_condition("a", None, "a")


def test_field_alias_attribute_and_field_keys_both_resolve():
    values = {"stage": "won"}
    assert evaluate_condition_dict(
        {"attribute": "stage", "operator": "equals", "value": "won"}, values
    )
    assert evaluate_condition_dict(
        {"field": "record.values.stage", "operator": "equals", "value": "won"}, values
    )
    assert evaluate_condition_dict(
        {"field": "{{record.values.stage}}", "operator": "equals", "value": "won"}, values
    )


@pytest.mark.parametrize(
    "data,seconds",
    [
        ({"duration_value": 7, "duration_unit": "days"}, 7 * 86400),
        ({"duration_amount": 7, "duration_unit": "days"}, 7 * 86400),
        ({"wait_value": 3, "wait_unit": "hours"}, 3 * 3600),
        ({"duration_value": 30, "duration_unit": "minutes"}, 30 * 60),
        ({"duration_value": 0, "duration_unit": "days"}, 0),
        ({"duration_value": 2, "duration_unit": "hours"}, 2 * 3600),
    ],
)
def test_wait_duration_honours_unit_and_key_aliases(data, seconds):
    assert wait_duration_seconds(data) == seconds
