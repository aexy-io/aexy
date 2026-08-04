"""Organization structure models — hierarchical departments/functions.

A first-class org layer that sits *above* the delivery-focused ``Team`` model
(``models/team.py``). Departments form the org chart (self-referential
``parent_id``), carry a head, headcount, cost center, budget and location, and
support **multi-function membership** (one person may belong to several
departments, exactly one marked primary).

"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class DepartmentMemberRole(str, Enum):
    """A person's role within a department."""

    HEAD = "head"
    MANAGER = "manager"
    MEMBER = "member"


class PositionStatus(str, Enum):
    """Headcount seat status."""

    OPEN = "open"
    FILLED = "filled"


class Department(Base):
    """An organizational unit / function — a node in the org tree."""

    __tablename__ = "departments"

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

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Canonical routing key (e.g. ops_kam / sales / finance / marketing / hr /
    # engineering). Nullable + extensible; drives Service Desk pending-with
    # resolution. Unique per workspace when set (enforced in the migration).
    function_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Hierarchy (org chart). ``path`` is a materialized path of ancestor ids
    # *including self*, e.g. "/<root>/<child>/<self>/", enabling cheap subtree
    # queries via ``path LIKE '<node.path>%'``. ``depth`` = number of ancestors.
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    path: Mapped[str] = mapped_column(Text, nullable=False, default="", index=True)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Head of department
    head_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Org attributes
    cost_center: Mapped[str | None] = mapped_column(String(64), nullable=True)
    budget_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    budget_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    headcount_planned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    head: Mapped["Developer"] = relationship("Developer", lazy="selectin", foreign_keys=[head_id])
    parent: Mapped["Department"] = relationship(
        "Department", remote_side=[id], backref="children", lazy="selectin",
    )
    members: Mapped[list["DepartmentMember"]] = relationship(
        "DepartmentMember",
        back_populates="department",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    positions: Mapped[list["DepartmentPosition"]] = relationship(
        "DepartmentPosition",
        back_populates="department",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_department_slug"),
        # One department per canonical function per workspace. Declared here as
        # well as in the migration because create_all (which builds the schema on
        # app startup) only knows about indexes in the metadata — leaving it
        # migration-only meant a Docker-first environment could write duplicate
        # rows and then the migration's CREATE UNIQUE INDEX could never succeed.
        Index(
            "uq_department_function_key",
            "workspace_id",
            "function_key",
            unique=True,
            postgresql_where=text("function_key IS NOT NULL"),
            sqlite_where=text("function_key IS NOT NULL"),
        ),
    )


class DepartmentMember(Base):
    """Membership of a developer in a department (multi-function capable).

    A developer may hold many rows across departments; exactly one is
    ``is_primary`` per workspace (partial unique index in the migration).
    """

    __tablename__ = "department_members"

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
    department_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role_in_department: Mapped[str] = mapped_column(
        String(20), default=DepartmentMemberRole.MEMBER.value, nullable=False,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allocation_percent: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    department: Mapped["Department"] = relationship("Department", back_populates="members")
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("department_id", "developer_id", name="uq_department_member"),
        # At most one primary department per person per workspace — see the note
        # on Department.__table_args__ for why this is declared here too.
        Index(
            "uq_department_member_primary",
            "workspace_id",
            "developer_id",
            unique=True,
            postgresql_where=text("is_primary"),
            sqlite_where=text("is_primary"),
        ),
    )


class DepartmentPosition(Base):
    """A headcount seat (planned vs filled) within a department — optional."""

    __tablename__ = "department_positions"

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
    department_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=PositionStatus.OPEN.value, nullable=False,
    )
    filled_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    department: Mapped["Department"] = relationship("Department", back_populates="positions")
    filled_by: Mapped["Developer"] = relationship("Developer", lazy="selectin")
