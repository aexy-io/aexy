"""Whether AI analysis runs for a workspace.

Lives under `Workspace.settings["ai_analysis"]` (JSONB), so this module is a
typed accessor plus a default policy.

There was a `model_tier: "haiku" | "sonnet"` setting here, with an admin dropdown
behind it, and **no reader anywhere**: the gateway resolved its model from
`WorkspaceAISettings` and had no idea this existed. It was removed rather than
wired up — making it live would have silently downgraded every workspace showing
the default `haiku` while actually running the platform's model, and no
configuration can depend on a control that never had an effect.

Model choice is at `/settings/ai/models` now, per AI feature, resolved in
`llm/resolution.py` alongside the kill switch and the workspace credential.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.repository import WorkspaceRepository
from aexy.models.workspace import Workspace

Mode = Literal["off", "on"]

# Default policy when a workspace has never been touched. AI is on — turning it
# off is an opt-out, not opt-in, since the only side-effect of "on" is reads (no
# payloads leave when the artifact is gated by Layer-0 or by a missing LLM
# gateway).
DEFAULT_MODE: Mode = "on"


@dataclass(frozen=True)
class AISettings:
    mode: Mode

    @property
    def enabled(self) -> bool:
        return self.mode == "on"

    def to_dict(self) -> dict[str, Any]:
        return {"mode": self.mode}


def _coerce(raw: Any) -> AISettings:
    """Parse a workspace's settings.ai_analysis block, falling back to defaults.

    A `model_tier` key left behind by an older client is ignored rather than
    migrated away: it never did anything, so there is nothing to preserve, and
    deleting rows to tidy a blob is not worth a migration.
    """
    if not isinstance(raw, dict):
        return AISettings(mode=DEFAULT_MODE)
    mode = raw.get("mode")
    if mode not in ("off", "on"):
        mode = DEFAULT_MODE
    return AISettings(mode=mode)


def settings_for_workspace(workspace: Workspace) -> AISettings:
    """Read the AI settings off a loaded workspace row."""
    return _coerce((workspace.settings or {}).get("ai_analysis"))


def merge_settings(existing: dict[str, Any] | None, update: AISettings) -> dict[str, Any]:
    """Return a new settings dict with ai_analysis replaced."""
    base = dict(existing or {})
    base["ai_analysis"] = update.to_dict()
    return base


async def any_adopter_enables_ai(
    db: AsyncSession,
    repository_id: str,
) -> bool:
    """True iff at least one workspace that has adopted this repo has AI = on.

    A repo can be adopted by multiple workspaces. The artifact's analysis is
    shared (commits/PRs are global rows). We err on the side of analyzing if
    any adopter wants it — the off-toggle workspaces simply don't pay for or
    surface the result on their UI.
    """
    stmt = (
        select(Workspace.settings)
        .join(
            WorkspaceRepository,
            WorkspaceRepository.workspace_id == Workspace.id,
        )
        .where(
            WorkspaceRepository.repository_id == repository_id,
            WorkspaceRepository.is_active == True,  # noqa: E712
            Workspace.is_active == True,  # noqa: E712
        )
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        # Nobody's actively adopting this repo — no signal to produce.
        return False
    for (settings_json,) in rows:
        if _coerce((settings_json or {}).get("ai_analysis")).enabled:
            return True
    return False
