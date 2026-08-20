"""Request and response shapes for AI editing of Word documents."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DocxAiSettingsResponse(BaseModel):
    """A workspace's decision about AI editing, plus what the reader may do.

    A workspace that has never opened the settings page and one configured to
    the defaults answer identically, so no client has to know which it got.

    ``can_manage`` is computed here rather than derived in the browser from a
    role: hiding a control was never access control, and the page needs to be
    able to render itself read-only for a member who may look but not change.
    """

    mode: str
    comment_trigger: bool
    comment_trigger_handle: str
    allow_ai_comments: bool
    ai_author_label: str
    max_ops: int
    notify_owner: bool

    can_manage: bool

    #: What a draft would actually run on, resolved from /settings/ai/models.
    #: Read-only here — shown so an admin on this page can see the answer without
    #: leaving it, and told where to change it.
    effective_provider: str | None = None
    effective_model: str | None = None


class DocxAiSettingsUpdate(BaseModel):
    """Every field optional: a PATCH, so toggling one control cannot silently
    reset the others to whatever the client last read."""

    mode: str | None = Field(default=None, pattern="^(on|off)$")
    comment_trigger: bool | None = None
    comment_trigger_handle: str | None = None
    allow_ai_comments: bool | None = None
    ai_author_label: str | None = None
    max_ops: int | None = None
    notify_owner: bool | None = None
