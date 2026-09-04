"""Schemas for knowledge-base governance: lifecycle, audit, analytics, portal."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ==================== Lifecycle ====================


class DocumentLifecycleUpdate(BaseModel):
    """All optional: this endpoint sets whichever of these the caller means."""

    owner_id: str | None = None
    review_due_at: datetime | None = None
    is_archived: bool | None = None

    # Marking a page verified is deliberately separate from editing it. Most
    # pages that need confirming need no change, and a workflow that records
    # freshness only as a side effect of an edit gives people a reason to make
    # pointless ones.
    mark_verified: bool = False
    next_review_in_days: int | None = Field(default=None, ge=1, le=1095)


class DocumentLifecycleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: str
    owner_id: str | None = None
    owner_name: str | None = None
    review_due_at: datetime | None = None
    last_verified_at: datetime | None = None
    last_verified_by_id: str | None = None
    is_archived: bool = False
    is_overdue: bool = False


class ReviewQueueItem(BaseModel):
    id: str
    title: str
    icon: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    review_due_at: datetime | None = None
    last_verified_at: datetime | None = None
    days_overdue: int = 0
    updated_at: datetime


# ==================== Analytics ====================


class DocumentStatsResponse(BaseModel):
    document_id: str
    views: int = 0
    unique_readers: int = 0
    last_viewed_at: datetime | None = None
    total_dwell_seconds: int = 0


class MostReadItem(BaseModel):
    document_id: str
    title: str
    views: int
    readers: int


class NeverReadItem(BaseModel):
    document_id: str
    title: str
    updated_at: datetime


class WorkspaceStatsResponse(BaseModel):
    period_days: int
    most_read: list[MostReadItem] = Field(default_factory=list)
    # The list that earns its place: a knowledge base's real problem is rarely
    # its popular pages.
    never_read: list[NeverReadItem] = Field(default_factory=list)


# ==================== Audit ====================


class DocumentAuditEventResponse(BaseModel):
    id: str
    document_id: str | None = None
    document_title: str | None = None
    action: str
    actor_id: str | None = None
    actor_name: str | None = None
    actor_email: str | None = None
    actor_kind: str = "user"
    ip_address: str | None = None
    user_agent: str | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    context: dict[str, Any] | None = None
    created_at: datetime


# ==================== Publishing ====================


class PublishRequest(BaseModel):
    audience: Literal["public", "workspace"] = "public"
    slug: str | None = Field(default=None, max_length=180)


class PublishResponse(BaseModel):
    document_id: str
    slug: str
    audience: str
    published_at: datetime
    url: str


class PortalArticleResponse(BaseModel):
    """What an anonymous reader gets.

    Nothing internal is on this shape — no workspace id, no author, no space,
    no version history. Reusing `DocumentResponse` for the portal would have
    published an author's name and email to the open internet because the
    serialiser happened to include them.
    """

    slug: str
    title: str
    content: dict[str, Any]
    published_at: datetime
    updated_at: datetime


class PortalSearchResult(BaseModel):
    slug: str
    title: str
    snippet: str | None = None


class PublicationStatus(BaseModel):
    document_id: str
    is_published: bool
    slug: str | None = None
    audience: str | None = None
    published_at: datetime | None = None
    # The source has changed since the snapshot was taken. The counterweight to
    # publishing being a snapshot rather than a live mirror.
    is_stale: bool = False
