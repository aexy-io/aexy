"""Team and team membership models.

A *team* is a delivery unit — who gets asked for a standup, who a blocker
escalates to, whose sprint board a task lands on, who approves a leave request.
It is deliberately not a *department* (``models/organization.py``), which is org
structure and decides what a person can see. One person is on many teams and in
one primary department, and access resolution reads only the latter.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class TeamMemberRole(str, Enum):
    """A person's role within a team.

    Declared here because the vocabulary was previously only a trailing comment
    reading ``"lead" | "member"``, which three separate places then disagreed
    with: ``project_service`` wrote ``"admin"``, ``tracking_tasks`` escalated to
    ``lead``/``manager``/``admin``, and the Teams settings page had labels for
    only two of them — so a project creator rendered as the raw i18n key
    ``settingsTeams.roles.admin``.

    ``LEAD`` is the one with teeth: ``review_service`` and
    ``leave_request_service`` both look for exactly ``role == "lead"`` when they
    need someone accountable, so a senior person recorded under any other value
    is invisible to both.
    """

    LEAD = "lead"
    MANAGER = "manager"
    MEMBER = "member"


#: Roles that may be *written*. Reads must stay tolerant of anything already in
#: the column — "admin" rows exist in databases created before this was pinned
#: down, and `tracking_tasks` still honours them for escalation.
TEAM_MEMBER_ROLES: frozenset[str] = frozenset(role.value for role in TeamMemberRole)


class Team(Base):
    """Team model - groups developers within a workspace."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Team type
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual"
    )  # "manual" | "repo_based" | "auto_sync"

    # Org rollup: which department this delivery team belongs to (nullable —
    # existing teams roll up to no department). See models/organization.py.
    department_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Which Service Desk bucket a ticket moves to when its work lands on this
    # board — set only to *override* what the department above would resolve to.
    #
    # A slug, not a foreign key, for the same reason `ServiceDeskTicket.
    # pending_with` is one: retiring a bucket must not either erase this or be
    # made impossible by it. Resolution normally goes board → department →
    # `Department.function_key` → `ServiceDeskStakeholder.function_key`, and that
    # is the path to prefer, since it keeps one org axis rather than two. This
    # exists for the board the org chart cannot describe — a shared triage board
    # two departments both feed, say — and is deliberately the narrower case.
    desk_stakeholder_slug: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )

    # For repo_based teams - list of repository IDs
    source_repository_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Settings (JSONB for flexibility)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="teams",
        lazy="selectin",
    )
    members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember",
        back_populates="team",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_workspace_team_slug"),
    )


class TeamMember(Base):
    """Team membership model - tracks who belongs to a team."""

    __tablename__ = "team_members"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Role within team. See TEAM_MEMBER_ROLES for the vocabulary and why it is
    # declared in one place rather than in a comment per file.
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default=TeamMemberRole.MEMBER.value
    )

    # Source of membership
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual"
    )  # "manual" | "repo_contributor" | "github_team"

    # When they joined
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    team: Mapped["Team"] = relationship(
        "Team",
        back_populates="members",
        lazy="selectin",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("team_id", "developer_id", name="uq_team_member"),
    )
