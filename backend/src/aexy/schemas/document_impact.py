"""Schemas for the per-pull-request documentation impact page."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ImpactScreenshotSpot(BaseModel):
    """One image, and the section of the page it sits in.

    `label` and `heading` are both nullable and both stay data: a `data:` URI has
    no filename and an image before the first heading has no section. The client
    renders the shorter line rather than the server inventing a word for it.
    """

    heading: str | None = None
    label: str | None = None


class ImpactScreenshots(BaseModel):
    count: int = 0
    spots: list[ImpactScreenshotSpot] = Field(default_factory=list)


class ImpactGuidance(BaseModel):
    """An id and its parameters. Never prose.

    The whole reason this is translatable. `/review`'s group headings are
    server-rendered English (`review_items.py:_group`) and cannot be translated
    for exactly that reason — a precedent this deliberately does not follow.
    """

    id: str
    params: dict = Field(default_factory=dict)


class ImpactLink(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code_link_id: str
    path: str
    link_type: str
    branch: str
    sync_mode: str
    template_category: str | None = None
    has_pending_changes: bool = False
    last_synced_at: datetime | None = None
    owner_developer_id: str | None = None
    # Named, not counted: "auth.py changed" tells the author whether this is
    # about them; "2 files changed" does not.
    matched_paths: list[str] = Field(default_factory=list)


class ImpactItem(BaseModel):
    document_id: str
    document_title: str
    document_icon: str | None = None
    document_updated_at: datetime | None = None
    # needs_review | edited | proposal_pending | dismissed
    status: str
    links: list[ImpactLink] = Field(default_factory=list)
    screenshots: ImpactScreenshots = Field(default_factory=ImpactScreenshots)
    guidance: list[ImpactGuidance] = Field(default_factory=list)
    proposal_id: str | None = None
    dismissed_at: datetime | None = None
    dismissed_by_developer_id: str | None = None
    dismissed_by_name: str | None = None
    dismiss_reason: str | None = None


class DocImpactResponse(BaseModel):
    """Always a 200, even when there is nothing.

    `analyzed` is false when no evaluation exists — a pull request from before
    this shipped, or one in a repository nothing documents. That is the most
    ordinary situation in the product, and answering it with a 404 would put a
    red error in front of somebody for whom nothing is wrong.
    """

    analyzed: bool
    repository_id: str
    # "acme/app". Without it the page can only say "#412", which is useless to
    # anybody with pull requests open in more than one repository — and it is the
    # only thing needed to link back to the pull request itself, since GitHub's
    # URL is derivable from the name and the number.
    repository_full_name: str | None = None
    pull_request_number: int
    repository_document_count: int = 0
    items: list[ImpactItem] = Field(default_factory=list)

    impact_id: str | None = None
    pull_request_title: str | None = None
    state: str | None = None
    head_sha: str | None = None
    author_developer_id: str | None = None
    author_login: str | None = None
    changed_path_count: int = 0
    detected_at: datetime | None = None
    merged_at: datetime | None = None

    # How the attempt to write into the pull request itself went, so the page can
    # say "the App needs Pull requests: write on acme" precisely rather than
    # failing silently.
    pr_comment_status: str | None = None
    pr_comment_error: str | None = None
    check_run_status: str | None = None
    check_run_error: str | None = None


class ImpactDismissRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=280)


class DocImpactSettingsResponse(BaseModel):
    """The workspace's decision about writing into pull requests.

    An absent row and a row configured to the defaults answer identically, so no
    client has to know which it got.
    """

    enabled: bool
    pr_comment_enabled: bool
    check_run_enabled: bool
    check_run_conclusion: str
    # Set the first time a GitHub write was refused, cleared on the first
    # success. The banner this drives is on the settings screen, because the
    # person who can grant an App permission is there — not in a pull request.
    github_write_block_reason: str | None = None
    github_write_blocked_at: datetime | None = None


class DocImpactSettingsUpdate(BaseModel):
    """Every field optional: a PATCH-shaped PUT, so toggling one control cannot
    silently reset the others to whatever the client last read."""

    enabled: bool | None = None
    pr_comment_enabled: bool | None = None
    check_run_enabled: bool | None = None
    check_run_conclusion: str | None = None
