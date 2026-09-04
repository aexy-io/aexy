"""Schemas for importing an exported wiki."""

from datetime import datetime

from pydantic import BaseModel, Field


class ImportStartResponse(BaseModel):
    """What the upload returns. The work happens afterwards."""

    job_id: str
    source: str
    total_pages: int
    status: str


class ImportJobResponse(BaseModel):
    id: str
    source: str
    #: pending | scanning | importing | completed | partial | failed
    #:
    #: `partial` is a terminal state, not a failure: one page that would not
    #: convert must not roll back the four thousand that did.
    status: str
    space_id: str | None = None
    archive_name: str | None = None

    total_pages: int = 0
    imported_pages: int = 0
    failed_pages: int = 0

    #: Per-page conversion notes. The reason a lossy page is visible rather
    #: than silently wrong.
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None

    created_at: datetime
    completed_at: datetime | None = None
