"""Pydantic schemas for product feedback."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FeedbackKindLiteral = Literal["suggestion", "problem", "question", "app_request"]
FeedbackStatusLiteral = Literal["new", "triaged", "planned", "shipped", "declined"]


class FeedbackCreate(BaseModel):
    """What the composer sends."""

    kind: FeedbackKindLiteral = "suggestion"
    subject: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=1, max_length=5000)
    # Route, app id, release, locale. Whatever the client puts here is shown to
    # the author before they send, so it is theirs to include, not ours to
    # collect quietly.
    context: dict = Field(default_factory=dict)


class FeedbackBoardItem(BaseModel):
    """One item as the shared board shows it.

    Carries no author and no workspace. The board is visible across workspaces
    so that ten teams asking for the same thing reads as one item with a count —
    which only works if wanting something does not also disclose who you are or
    where you work.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    subject: str
    body: str
    status: str
    vote_count: int
    created_at: datetime
    # Whether the caller has voted for it, so the button can render correctly
    # without a second request.
    voted: bool = False
    # True on the caller's own items, which is the only authorship the board
    # discloses — and only to the person who already knows.
    mine: bool = False


class FeedbackAdminItem(FeedbackBoardItem):
    """The same item with everything a platform admin needs to act on it."""

    workspace_id: str
    workspace_name: str | None = None
    developer_id: str
    developer_name: str | None = None
    developer_email: str | None = None
    context: dict = Field(default_factory=dict)
    admin_note: str | None = None
    reviewed_by_id: str | None = None
    reviewed_at: datetime | None = None
    updated_at: datetime


class FeedbackListResponse(BaseModel):
    items: list[FeedbackBoardItem]
    total: int


class FeedbackAdminListResponse(BaseModel):
    items: list[FeedbackAdminItem]
    total: int


class FeedbackReview(BaseModel):
    """A platform admin's answer. Both fields optional — a note is not a status
    change, and a status change does not require a note."""

    status: FeedbackStatusLiteral | None = None
    admin_note: str | None = Field(default=None, max_length=2000)


class FeedbackVoteResponse(BaseModel):
    feedback_id: str
    voted: bool
    vote_count: int
