"""Workspace AI-analysis settings.

The setting lives under `Workspace.settings["ai_analysis"]` (JSONB), so this
module is just a typed accessor + default policy. Phase 2 ships two knobs;
sampling and per-workspace token budget come later.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.repository import WorkspaceRepository
from aexy.models.workspace import Workspace

Mode = Literal["off", "on"]
ModelTier = Literal["haiku", "sonnet"]

# Default policy when a workspace has never been touched. AI is on, cheap
# model — turning it off is an opt-out, not opt-in, since the only side-effect
# of "on" is reads (no payloads leave when the artifact is gated by Layer-0
# or by a missing LLM gateway).
DEFAULT_MODE: Mode = "on"
DEFAULT_MODEL_TIER: ModelTier = "haiku"


@dataclass(frozen=True)
class AISettings:
    mode: Mode
    model_tier: ModelTier

    @property
    def enabled(self) -> bool:
        return self.mode == "on"

    def to_dict(self) -> dict[str, Any]:
        return {"mode": self.mode, "model_tier": self.model_tier}


def _coerce(raw: Any) -> AISettings:
    """Parse a workspace's settings.ai_analysis block, falling back to defaults."""
    if not isinstance(raw, dict):
        return AISettings(mode=DEFAULT_MODE, model_tier=DEFAULT_MODEL_TIER)
    mode = raw.get("mode")
    if mode not in ("off", "on"):
        mode = DEFAULT_MODE
    tier = raw.get("model_tier")
    if tier not in ("haiku", "sonnet"):
        tier = DEFAULT_MODEL_TIER
    return AISettings(mode=mode, model_tier=tier)


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
