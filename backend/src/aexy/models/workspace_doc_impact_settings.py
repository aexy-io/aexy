"""Whether Aexy writes into your pull requests, and who decides.

A notification is addressed to one person, so it belongs in that person's
notification preferences and it does. A comment on a pull request is not: it is
one shared artifact that every reviewer sees, and there is no honest way to
reconcile four developers' opinions about whether it exists. Any resolution rule
— "anybody who wants it gets it", "the author's preference wins" — is a surprise
to the other three.

So this is a workspace decision, taken by an admin, which also matches who can
grant the GitHub App permission it depends on. The cost is real and worth saying
in the settings copy: an author who dislikes bot comments cannot opt out
individually, the same way branch protection is not a personal preference.

An absent row means the documented default — notifications on, GitHub writes off.
No backfill, so there is nothing to keep in sync.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class CheckRunConclusion:
    """`neutral` never blocks a merge. `action_required` does.

    Advisory by default: a check that fails because a screenshot might be stale
    would teach a team to make it non-required within a week, and then it is
    worse than advisory — it is ignored *and* red.
    """

    NEUTRAL = "neutral"
    ACTION_REQUIRED = "action_required"

    ALL = (NEUTRAL, ACTION_REQUIRED)


class WorkspaceDocImpactSettings(Base):
    """One row per workspace, or none."""

    __tablename__ = "workspace_doc_impact_settings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # The master switch. Default on, because the in-app notification is not
    # externally visible and is the whole point of the feature.
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Both default FALSE. These write into a customer's pull requests, and a
    # deploy must not start doing that on anybody's behalf.
    pr_comment_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    check_run_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    check_run_conclusion: Mapped[str] = mapped_column(
        String(20), default=CheckRunConclusion.NEUTRAL, nullable=False
    )

    # Denormalised so the settings banner is one row read rather than a scan of
    # every impact row. Set the first time a write is refused, cleared on the
    # first success — the person who can fix a missing App permission is on the
    # settings screen, not reading a pull request.
    github_write_block_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_write_blocked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    updated_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# The shape an absent row stands for. Read by the service and returned by the API
# so "never configured" and "configured to the defaults" answer identically.
DEFAULT_DOC_IMPACT_SETTINGS = {
    "enabled": True,
    "pr_comment_enabled": False,
    "check_run_enabled": False,
    "check_run_conclusion": CheckRunConclusion.NEUTRAL,
    "github_write_block_reason": None,
    "github_write_blocked_at": None,
}
