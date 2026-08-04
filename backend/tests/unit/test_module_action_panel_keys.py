"""Panel-declared config keys must be keys the executor reads.

This is the bug this repo keeps re-fixing: the config panel writes `team_channel_id`
and the executor reads `channel_id`; the panel writes `title` and the executor
reads `task_title`; the panel writes `api_url` and the handler reads
`webhook_url`. The step saves, publishes, and then does nothing.

The declarations live in the frontend, so this test reads that file. Parsing
TypeScript from a Python test is unusual, but the two sides of the contract are
in different languages and the contract is what breaks — a test that only looked
at the backend could not see the mismatch at all.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
PANEL_SPEC = (
    REPO
    / "frontend"
    / "src"
    / "components"
    / "workflow-builder"
    / "moduleActionFields.ts"
)
INLINE_EXECUTOR = REPO / "backend" / "src" / "aexy" / "services" / "crm_automation_service.py"
SHARED_ACTIONS = REPO / "backend" / "src" / "aexy" / "services" / "automation_module_actions.py"

# Action id -> the inline method that runs it, where the names differ.
METHOD_ALIASES = {
    "change_priority": "change_ticket_priority",
    "escalate": "escalate_ticket",
    "move_stage": "move_candidate_stage",
}


def _panel_specs(source: str) -> dict[str, set[str]]:
    """Action id -> config keys the panel writes."""
    shared_fields = {
        match.group(1): match.group(2)
        for match in re.finditer(
            r'const (\w+): ModuleActionField = \{\s*key: "(\w+)"', source
        )
    }

    start = source.index("export const MODULE_ACTION_FIELDS")
    body = source[source.index("{", start) :]

    specs: dict[str, set[str]] = {}
    for match in re.finditer(r"\n  (\w+): \{", body):
        opening = match.end() - 1
        depth, index = 0, opening
        while index < len(body):
            if body[index] == "{":
                depth += 1
            elif body[index] == "}":
                depth -= 1
                if depth == 0:
                    break
            index += 1
        block = body[opening : index + 1]

        keys = set(re.findall(r'key: "(\w+)"', block))
        for name, key in shared_fields.items():
            if re.search(rf"[\[\s,]{name}[,\]\s]", block):
                keys.add(key)
        specs[match.group(1)] = keys
    return specs


def _inline_reads(source: str) -> dict[str, set[str]]:
    reads: dict[str, set[str]] = {}
    for name in set(re.findall(r"async def (_action_\w+)\(", source)):
        body = re.search(
            r"async def " + name + r"\(.*?(?=\n    async def |\n    @staticmethod|\Z)",
            source,
            re.S,
        )
        reads[name] = set(re.findall(r'config\.get\(\s*"(\w+)"', body.group(0)))
    return reads


def _shared_reads(source: str) -> dict[str, set[str]]:
    adapters: dict[str, set[str]] = {}
    for match in re.finditer(
        r"async def _act_(\w+)\(ctx: ModuleActionContext\) -> dict:"
        r"(.*?)(?=\nasync def |\n# ==|\nMODULE_ACTION_ADAPTERS)",
        source,
        re.S,
    ):
        keys: set[str] = set()
        for group in re.findall(r"ctx\.(?:text|raw|entity_id)\(([^)]*)\)", match.group(2)):
            keys |= set(re.findall(r'"(\w+)"', group))
        adapters[match.group(1)] = keys
    return adapters


@pytest.fixture(scope="module")
def contract():
    if not PANEL_SPEC.exists():  # pragma: no cover - backend-only checkouts
        pytest.skip("frontend panel declarations are not in this checkout")
    return (
        _panel_specs(PANEL_SPEC.read_text()),
        _inline_reads(INLINE_EXECUTOR.read_text()),
        _shared_reads(SHARED_ACTIONS.read_text()),
    )


def test_every_panel_key_is_read_by_its_executor(contract):
    specs, inline_reads, shared_reads = contract
    problems = []

    for action, panel_keys in sorted(specs.items()):
        if action in shared_reads:
            known = shared_reads[action]
        else:
            method = "_action_" + METHOD_ALIASES.get(action, action)
            known = inline_reads.get(method, set())
            if not known:
                problems.append(f"{action}: no executor found ({method})")
                continue
        unread = sorted(key for key in panel_keys if key not in known)
        if unread:
            problems.append(
                f"{action}: panel writes {unread}, executor reads {sorted(known)}"
            )

    assert not problems, "panel/executor key mismatches:\n" + "\n".join(problems)


def test_the_panel_declares_something_for_every_shared_action(contract):
    """A shared module action with no panel cannot be configured."""
    specs, _inline_reads, shared_reads = contract

    missing = sorted(set(shared_reads) - set(specs))
    # remove_from_sprint takes only the entity id, which the panel does declare.
    assert not missing, f"module actions with no config panel: {missing}"
