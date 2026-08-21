"""Workspace settings for AI editing of Word documents.

Lives under ``Workspace.settings["docx_ai"]`` (JSONB), so this module is a typed
accessor and a default policy — no table, no migration. The dedicated tables in
this codebase earned one for a specific reason: an encrypted credential
(``workspace_ai_settings``) or state written by background jobs
(``workspace_doc_impact_settings``). These are plain preferences and neither
applies.

**Which model this runs on is not here.** It is at ``/settings/ai/models``,
along with every other AI feature, keyed on the registry id ``docs.docx_edit``.
A model picker on this page would have been a second place to look and a second
place to be wrong — which is exactly the problem that page exists to fix.

An absent block means the documented defaults, and there is no backfill: "never
configured" and "configured to the defaults" answer identically.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.workspace import Workspace

Mode = Literal["off", "on"]

# On by default. The feature is reactive — it drafts when a person asks, or when
# somebody tags the handle in a comment — so "on" costs nothing until used, and
# an opt-in switch would mean the feature silently does nothing for every
# workspace that never found this page.
DEFAULT_MODE: Mode = "on"
DEFAULT_COMMENT_TRIGGER = True
DEFAULT_COMMENT_TRIGGER_HANDLE = "aexy"
DEFAULT_ALLOW_AI_COMMENTS = True
DEFAULT_AI_AUTHOR_LABEL = "Aexy AI"
DEFAULT_NOTIFY_OWNER = True

# A cap, not a target. The reason it is a setting rather than a constant is that
# it shapes what a reviewer is handed: twenty-five tracked changes is a document
# somebody can read through, and two hundred is a rewrite wearing a redline's
# clothes.
DEFAULT_MAX_OPS = 25
MIN_MAX_OPS = 1
MAX_MAX_OPS = 50

# Letters, digits, dot, dash and underscore — what reads as a mention when
# somebody types it into a Word comment, and what can go straight into a regex
# without escaping.
_VALID_HANDLE = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,31}$")

_AUTHOR_LABEL_MAX = 64

SETTINGS_KEY = "docx_ai"


def normalise_handle(value: Any) -> str | None:
    """The mention handle without its ``@``, or None when it is not one.

    Returns None rather than raising, matching ``service_desk_config``: a bad
    value in a JSONB blob should degrade to the default, while the same value
    arriving through the API should be rejected there, where a person is
    waiting to be told.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip().lstrip("@")
    return candidate if _VALID_HANDLE.match(candidate) else None


def normalise_author_label(value: Any) -> str | None:
    """The name to put on AI redlines and comments, or None when unusable."""
    if not isinstance(value, str):
        return None
    candidate = " ".join(value.split())
    return candidate[:_AUTHOR_LABEL_MAX] if candidate else None


@dataclass(frozen=True)
class DocxAiSettings:
    """What a workspace has decided about AI editing of Word documents."""

    mode: Mode = DEFAULT_MODE
    comment_trigger: bool = DEFAULT_COMMENT_TRIGGER
    comment_trigger_handle: str = DEFAULT_COMMENT_TRIGGER_HANDLE
    allow_ai_comments: bool = DEFAULT_ALLOW_AI_COMMENTS
    ai_author_label: str = DEFAULT_AI_AUTHOR_LABEL
    max_ops: int = DEFAULT_MAX_OPS
    notify_owner: bool = DEFAULT_NOTIFY_OWNER

    @property
    def enabled(self) -> bool:
        return self.mode == "on"

    @property
    def mention(self) -> str:
        """The handle as it is written in a comment, e.g. ``@aexy``."""
        return f"@{self.comment_trigger_handle}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "comment_trigger": self.comment_trigger,
            "comment_trigger_handle": self.comment_trigger_handle,
            "allow_ai_comments": self.allow_ai_comments,
            "ai_author_label": self.ai_author_label,
            "max_ops": self.max_ops,
            "notify_owner": self.notify_owner,
        }


def _flag(raw: dict[str, Any], key: str, default: bool) -> bool:
    value = raw.get(key)
    return value if isinstance(value, bool) else default


def _coerce(raw: Any) -> DocxAiSettings:
    """Parse a workspace's ``settings["docx_ai"]`` block, field by field.

    Per-field fallback rather than all-or-nothing: one bad value written by an
    older client should cost that one setting, not silently revert the other
    six to their defaults.
    """
    if not isinstance(raw, dict):
        return DocxAiSettings()

    mode = raw.get("mode")
    if mode not in ("off", "on"):
        mode = DEFAULT_MODE

    max_ops = raw.get("max_ops")
    if not isinstance(max_ops, int) or isinstance(max_ops, bool):
        max_ops = DEFAULT_MAX_OPS
    max_ops = max(MIN_MAX_OPS, min(MAX_MAX_OPS, max_ops))

    return DocxAiSettings(
        mode=mode,
        comment_trigger=_flag(raw, "comment_trigger", DEFAULT_COMMENT_TRIGGER),
        comment_trigger_handle=(
            normalise_handle(raw.get("comment_trigger_handle"))
            or DEFAULT_COMMENT_TRIGGER_HANDLE
        ),
        allow_ai_comments=_flag(raw, "allow_ai_comments", DEFAULT_ALLOW_AI_COMMENTS),
        ai_author_label=(
            normalise_author_label(raw.get("ai_author_label"))
            or DEFAULT_AI_AUTHOR_LABEL
        ),
        max_ops=max_ops,
        notify_owner=_flag(raw, "notify_owner", DEFAULT_NOTIFY_OWNER),
    )


def settings_for_workspace(workspace: Workspace) -> DocxAiSettings:
    """Read the settings off a loaded workspace row."""
    return _coerce((workspace.settings or {}).get(SETTINGS_KEY))


def merge_settings(
    existing: dict[str, Any] | None, update: DocxAiSettings
) -> dict[str, Any]:
    """A new settings dict with the ``docx_ai`` block replaced.

    Returns a copy on purpose. SQLAlchemy does not detect an in-place mutation
    of a JSONB column, so a caller that edited ``workspace.settings`` directly
    would save nothing and see it work until the next process restart.
    """
    base = dict(existing or {})
    base[SETTINGS_KEY] = update.to_dict()
    return base


async def get_settings(db: AsyncSession, workspace_id: str) -> DocxAiSettings:
    """The workspace's settings, or the defaults when it has none."""
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        return DocxAiSettings()
    return settings_for_workspace(workspace)


async def load_settings_isolated(workspace_id: str) -> DocxAiSettings:
    """The same read, on its own session.

    For callers inside a Temporal activity or anywhere else holding a session
    with pending objects. A lookup on the caller's session would autoflush
    those mid-draft, and a statement that then failed would poison the
    caller's transaction — the reasoning ``LLMGateway._workspace_ai`` gives for
    doing exactly this.
    """
    from aexy.core.database import get_async_session

    async with get_async_session() as session:
        return await get_settings(session, workspace_id)
