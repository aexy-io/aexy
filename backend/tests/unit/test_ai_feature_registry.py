"""Every LLM call must name the product feature making it.

That is what makes `/settings/ai/models` describe the product rather than a
snapshot of it. Without this test the page silently stops covering a feature the
first time somebody adds one — and the failure is invisible, because a call with
no feature resolves to the workspace default and works fine.

The same shape as `test_notification_event_emitters.py`, which exists for the
same class of drift.
"""

from __future__ import annotations

import ast
import pathlib
import re

import pytest

from aexy.llm.features import (
    AI_CATEGORIES,
    AI_FEATURES,
    CATEGORY_IDS,
    EXPECTED_UNWIRED,
    FEATURE_IDS,
    feature,
)
from aexy.models.app_definitions import APP_CATALOG

SRC = pathlib.Path(__file__).resolve().parents[2] / "src" / "aexy"

# The registry declares; it does not call. Excluded so its own literals do not
# count as call sites.
_DECLARATION_ONLY = {"llm/features.py"}

_FEATURE_KWARG = re.compile(r'feature="([\w.]+)"')
# The agent and Ask adapters call `resolve_llm(workspace_id, "agents.run")`
# positionally, which is idiomatic there and still a call site.
_RESOLVE_POSITIONAL = re.compile(r'resolve_llm\(\s*\n?\s*[\w_.]+,\s*"([\w.]+)"')


def _sources() -> list[tuple[pathlib.Path, str]]:
    out = []
    for path in sorted(SRC.rglob("*.py")):
        relative = path.relative_to(SRC).as_posix()
        if relative in _DECLARATION_ONLY:
            continue
        out.append((path, path.read_text()))
    return out


def _named_features() -> dict[str, list[str]]:
    """Feature id -> the files naming it."""
    found: dict[str, list[str]] = {}
    for path, text in _sources():
        where = path.relative_to(SRC).as_posix()
        for pattern in (_FEATURE_KWARG, _RESOLVE_POSITIONAL):
            for match in pattern.finditer(text):
                found.setdefault(match.group(1), []).append(where)
    return found


class TestTheRegistryIsInternallyConsistent:
    def test_every_feature_is_in_a_declared_category(self) -> None:
        for entry in AI_FEATURES:
            assert entry.category in CATEGORY_IDS, entry.id

    def test_no_category_is_empty(self) -> None:
        # An empty category renders as a card with nothing in it.
        used = {entry.category for entry in AI_FEATURES}
        assert CATEGORY_IDS - used == set()

    def test_feature_ids_are_unique(self) -> None:
        assert len(FEATURE_IDS) == len(AI_FEATURES)

    def test_category_ids_are_unique(self) -> None:
        assert len({c.id for c in AI_CATEGORIES}) == len(AI_CATEGORIES)

    def test_every_app_reference_is_a_real_app(self) -> None:
        # `app` hides a feature from a workspace that cannot use it. A typo would
        # hide it from everyone, silently.
        for entry in AI_FEATURES:
            if entry.app is not None:
                assert entry.app in APP_CATALOG, f"{entry.id} -> {entry.app}"

    def test_every_feature_says_what_it_does(self) -> None:
        for entry in AI_FEATURES:
            assert entry.name.strip()
            assert entry.description.strip()

    def test_a_fixed_feature_explains_why(self) -> None:
        # Shown read-only rather than hidden, so the reason has to exist.
        for entry in AI_FEATURES:
            if not entry.configurable:
                assert entry.reason_fixed, entry.id

    def test_lookup_refuses_an_unknown_id(self) -> None:
        with pytest.raises(KeyError, match="Unknown AI feature"):
            feature("not.a.feature")


class TestEveryCallSiteNamesARegisteredFeature:
    def test_no_call_site_names_an_unregistered_feature(self) -> None:
        unknown = {
            name: files
            for name, files in _named_features().items()
            if name not in FEATURE_IDS
        }
        assert unknown == {}, (
            "These call sites name a feature that is not in llm/features.py, so "
            "the settings page cannot show them: "
            f"{unknown}"
        )

    def test_every_registered_feature_has_a_call_site(self) -> None:
        named = set(_named_features())
        missing = sorted(FEATURE_IDS - named - set(EXPECTED_UNWIRED))
        assert missing == [], (
            "These features are in the registry but nothing passes their id, so "
            "the settings page offers a model for something that will never read "
            "it. Either wire the call site or add it to EXPECTED_UNWIRED with a "
            f"reason: {missing}"
        )

    def test_expected_unwired_entries_are_real_features(self) -> None:
        assert set(EXPECTED_UNWIRED) <= FEATURE_IDS

    def test_expected_unwired_entries_give_a_reason(self) -> None:
        for key, reason in EXPECTED_UNWIRED.items():
            assert len(reason.strip()) > 30, key


class TestNoLLMCallSkipsTheFeature:
    """A gateway call with no feature works — which is why it needs a test.

    It resolves to the workspace default and behaves correctly, so nothing fails.
    It just quietly stops being configurable, and the page stops describing the
    product.
    """

    def _gateway_calls_missing_a_feature(self) -> list[str]:
        offenders: list[str] = []
        for path, text in _sources():
            where = path.relative_to(SRC).as_posix()
            if where.startswith("llm/"):
                # The gateway's own definitions and its internal plumbing.
                continue
            try:
                tree = ast.parse(text)
            except SyntaxError:  # pragma: no cover
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                if not isinstance(func, ast.Attribute):
                    continue
                if func.attr not in ("call_llm", "analyze"):
                    continue
                # `self._call_llm(...)` and other local wrappers are not the
                # gateway; only a call on something named like a gateway counts.
                target = ast.unparse(func.value)
                if not re.search(r"gateway|self\.llm\b", target):
                    continue
                if any(kw.arg == "feature" for kw in node.keywords):
                    continue
                offenders.append(f"{where}:{node.lineno} ({target}.{func.attr})")
        return sorted(offenders)

    def test_every_gateway_call_names_its_feature(self) -> None:
        assert self._gateway_calls_missing_a_feature() == []
