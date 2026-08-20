"""Which model a workspace wants for one AI feature, or one whole category.

A table rather than another key in ``workspace.settings``, for two reasons that
both bit somewhere else first.

``workspace.settings`` is one JSONB blob already shared by ``ai_analysis``,
``app_settings``, ``service_desk`` and ``rate_limit_overrides``. Writing a key
means read-modify-write of the whole thing, and the configuration screen this
backs has fifty rows on it — two admins saving at once silently loses one of the
two saves, and neither of them can tell.

And these rows move money. ``updated_by_id`` and ``updated_at`` are the first
thing anybody asks for when a bill jumps, and a blob cannot answer it.

Two scopes in one table rather than two tables: the resolution order reads them
together (feature, then category, then the workspace default), and splitting
them would mean two queries and two places to keep the same uniqueness rule.

**No row means inherit**, at every level. There is no "same as the default"
value to distinguish from "not set" — a Reset deletes the row rather than
writing the value that is currently effective, so the row keeps following the
default when an admin changes it later.
"""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


def _now() -> datetime:
    return datetime.now(UTC)


class OverrideScope:
    """What the ``key`` column names."""

    CATEGORY = "category"
    FEATURE = "feature"

    ALL = (CATEGORY, FEATURE)


class WorkspaceAIModelOverride(Base):
    """One workspace's model choice for one feature or category."""

    __tablename__ = "workspace_ai_model_overrides"
    __table_args__ = (
        # One answer per target. The upsert on this constraint is what makes a
        # save idempotent when two tabs are open on the same row.
        UniqueConstraint(
            "workspace_id", "scope", "key", name="uq_ai_model_override_target"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    """A category id or a feature id from ``llm/features.py``.

    Deliberately not a foreign key to anything: the registry is code, and a
    feature removed from it should leave its row behind harmlessly rather than
    fail a migration. The resolver ignores a key it does not recognise, and the
    settings page does not render one.
    """

    model: Mapped[str] = mapped_column(String(128), nullable=False)

    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    """The provider this model was chosen for.

    Not redundant. A model id belongs to exactly one provider —
    ``claude-sonnet-5`` means nothing to Gemini — so without this a stored choice
    becomes silently wrong the day an admin switches provider at
    ``/settings/ai``, and the failure lands hours later as somebody else's 404
    inside a background job. Stored so the override can be *ignored* when it no
    longer matches, and so the settings page can say that it is being ignored
    rather than showing it as live.
    """

    updated_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Both a Python-side `default` and a `server_default`: the server default
    # covers rows written outside the ORM (the migration's own DEFAULT NOW()),
    # and the Python default means a row created through the ORM carries a real
    # datetime on any backend rather than whatever the dialect renders NOW() as.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_now,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_now,
        onupdate=_now,
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<WorkspaceAIModelOverride {self.scope}:{self.key} "
            f"-> {self.provider}/{self.model}>"
        )
