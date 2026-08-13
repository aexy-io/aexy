"""What counts as somebody's contribution, in one place.

Every surface that reports on git activity has to answer the same three
questions — are bots in, are merge commits in, and which line counts — and
they have to answer them identically or two screens in the same product
disagree about how much work happened. These helpers are the answer, so the
monthly report and the per-developer summary cannot drift apart.
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, func

from aexy.models.activity import Commit

# Rows whose `author_class` was never set — webhook-ingested commits, and
# anything synced before Layer-0 enrichment existed — are treated as human.
# The alternative silently drops real work from every total, which is the
# worse failure: an over-count is visible in the report, an under-count is not.
_UNCLASSIFIED_IS_HUMAN = True


def human_commit_filters() -> list[ColumnElement[bool]]:
    """Bots and merge commits excluded, as a list of WHERE clauses."""
    author = (
        Commit.author_class.is_distinct_from("bot")
        if _UNCLASSIFIED_IS_HUMAN
        else Commit.author_class == "human"
    )
    return [author, Commit.is_merge.is_(False)]


def source_additions() -> ColumnElement[int]:
    """Lines added, source files only, falling back to the raw count.

    `source_additions` is NULL on any commit synced before the split, so the
    fallback keeps history countable. A report that quotes these numbers should
    also report how many rows fell back — see `unmeasured_churn_filter`.
    """
    return func.coalesce(Commit.source_additions, Commit.additions)


def source_deletions() -> ColumnElement[int]:
    return func.coalesce(Commit.source_deletions, Commit.deletions)


def unmeasured_churn_filter() -> ColumnElement[bool]:
    """Commits whose line counts still include lockfiles and generated output."""
    return Commit.source_additions.is_(None)
