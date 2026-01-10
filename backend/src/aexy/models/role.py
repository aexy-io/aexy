"""Custom Role model for flexible role definitions at workspace level."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4
import re

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.workspace import Workspace


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug[:100]


class CustomRole(Base):
    """
    Custom role definition at workspace level.

    Roles define what permissions a user has within a workspace or project.
    System roles are created from templates and cannot be deleted.
    Custom roles can be created by admins based on templates or from scratch.
    """

    __tablename__ = "custom_roles"

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

    # Role metadata
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Visual customization
    color: Mapped[str] = mapped_column(String(50), default="#64748b", nullable=False)
    icon: Mapped[str] = mapped_column(String(50), default="User", nullable=False)

    # Based on template (for easy reset/reference)
    # Values: "admin", "manager", "developer", "hr", "support", "sales", "viewer", or None
    based_on_template: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # System role (cannot be deleted or have permissions modified)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Permissions list: ["can_invite_members", "can_view_crm", ...]
    permissions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Priority for hierarchy (higher = more permissions/authority)
    # Used when comparing roles: admin=100, manager=80, developer=60, viewer=10
    priority: Mapped[int] = mapped_column(Integer, default=50, nullable=False)

    # Active status (soft delete)
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
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_workspace_role_slug"),
    )

    def has_permission(self, permission: str) -> bool:
        """Check if this role has a specific permission."""
        return permission in self.permissions

    def has_any_permission(self, permissions: list[str]) -> bool:
        """Check if this role has any of the specified permissions."""
        return bool(set(self.permissions) & set(permissions))

    def has_all_permissions(self, permissions: list[str]) -> bool:
        """Check if this role has all of the specified permissions."""
        return set(permissions).issubset(set(self.permissions))

    def __repr__(self) -> str:
        return f"<CustomRole {self.name} ({self.slug}) in workspace {self.workspace_id}>"
