"""What a pull request did to the pages that describe its code.

The existing sync machinery answers "is this page behind its code", after the
merge, for the person who wrote the page. This answers a different question, for
a different person, at a different time: "which pages did *your* change just make
wrong", for the author, while they are still in the branch and fixing it is
cheap.

Two tables rather than one because the two questions have different subjects.
The header is per pull request — one artifact per PR on the GitHub side, one
notification per PR on ours. The items are per document, because a document is
what a person reads, judges and dismisses; storing them as an array on the header
would mean dismissal had nowhere to record who said no, or when.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class DocImpactState:
    """A pull request is open, or it merged. It does not go back."""

    OPEN = "open"
    MERGED = "merged"


class GitHubWriteStatus:
    """How an attempt to write into the pull request itself went.

    `permission_missing` is separate from `failed` on purpose: one is a thing an
    org admin can fix in thirty seconds and the page can say so precisely, the
    other is ours to investigate. Collapsing them would mean showing every
    customer the same unhelpful "could not post" either way.
    """

    PENDING = "pending"
    POSTED = "posted"
    SKIPPED = "skipped"
    PERMISSION_MISSING = "permission_missing"
    FAILED = "failed"


class PullRequestDocImpact(Base):
    """One pull request, and the documentation it affects.

    Keyed on (repository, number) rather than on a workspace. A repository can be
    adopted by more than one workspace, but a pull request has exactly one comment
    thread and one checks list — so a workspace-scoped header would post two
    comments on one PR and neither would be wrong to delete. Workspace scoping
    happens on the items, which carry it denormalised.
    """

    __tablename__ = "pull_request_doc_impacts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    # No standalone index: the unique constraint below leads with this column,
    # so it already serves the webhook's only lookup. A second index here would
    # cost every write to save nothing.
    repository_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    pull_request_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Nullable, and deliberately so: the evaluation can arrive before PR
    # ingestion has committed its row, and losing the evaluation over a race
    # would mean the author is told nothing at all.
    pull_request_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("pull_requests.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Snapshot, so the page renders when there is no local `pull_requests` row.
    title: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SET NULL, never CASCADE: losing the author must not delete the record of
    # which pages their merge left behind.
    author_developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # An external contributor synced from GitHub has no account here. The login
    # is then the only way to name them, mirroring `PullRequest.merged_by_login`.
    author_login: Mapped[str | None] = mapped_column(String(255), nullable=True)

    head_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), default=DocImpactState.OPEN, nullable=False
    )

    # Substantive paths only, so the page can say "3 of 34 changed files are
    # described by a page here" and have both numbers mean something.
    changed_path_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # The high-water mark of what the author has already been told about. It
    # never shrinks, which is the entire noise-control rule: a later push
    # notifies only when the affected set *grew*, so reverting a file and
    # re-adding it in the next commit cannot re-notify.
    #
    # This is why the impact is a table and not a query over `notifications`:
    # `create_notification` writes no row at all when the recipient has in-app
    # notifications off, so "no prior notification" would be indistinguishable
    # from "never evaluated" — and the PR comment would re-post on every push,
    # forever, for exactly the people who had opted out of hearing about it.
    notified_document_ids: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )
    notified_open_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notified_merged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # The identity of a GitHub artifact, which must survive independently of
    # whether anybody was notified. One comment per pull request, edited in
    # place: the message states current state rather than announcing an event, so
    # a new comment per push would be a worse version of the same sentence, and a
    # bot that posts on every push is the surest way to get an integration
    # switched off.
    pr_comment_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    pr_comment_status: Mapped[str] = mapped_column(
        String(32), default=GitHubWriteStatus.PENDING, nullable=False
    )
    pr_comment_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # A check run belongs to a commit, so the sha it was created for is stored
    # beside it. A new head sha needs a new run — updating the old one would
    # leave the new commit unannotated.
    check_run_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    check_run_head_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    check_run_status: Mapped[str] = mapped_column(
        String(32), default=GitHubWriteStatus.PENDING, nullable=False
    )
    check_run_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    merged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    items: Mapped[list["PullRequestDocImpactItem"]] = relationship(
        "PullRequestDocImpactItem",
        back_populates="impact",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    # The webhook looks a pull request up by repository and number, never by id,
    # and this constraint's leading column is that lookup. It is the upsert key
    # and the access path in one.
    __table_args__ = (
        UniqueConstraint(
            "repository_id", "pull_request_number", name="uq_pr_doc_impact"
        ),
    )


class PullRequestDocImpactItem(Base):
    """One affected document within one pull request.

    The unit a person reasons about. Several code links on the same document
    collapse into one row — being told the same page twice because it watches two
    paths is noise, and the paths that matched are all in `matched` anyway.
    """

    __tablename__ = "pull_request_doc_impact_items"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    impact_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("pull_request_doc_impacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalised from the document so a read can scope to a workspace without
    # joining, and so a repository shared by two workspaces cannot leak one's
    # pages into the other's page.
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # [{code_link_id, path, link_type, branch, matched_paths: [...]}]
    #
    # Unioned across pushes rather than replaced: a second commit that touches
    # one more file must not make the card forget the file from the first. What
    # the author needs to see is everything this pull request did, not everything
    # its most recent commit did.
    matched: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # "No update needed", per pull request per document, attributed. The
    # affordance the feature lives or dies on: without a way to say no, the only
    # way to stop being asked is to mute the whole category.
    dismissed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    dismissed_by_developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    dismiss_reason: Mapped[str | None] = mapped_column(String(280), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    impact: Mapped["PullRequestDocImpact"] = relationship(
        "PullRequestDocImpact", back_populates="items"
    )

    __table_args__ = (
        UniqueConstraint("impact_id", "document_id", name="uq_pr_doc_impact_item"),
    )
