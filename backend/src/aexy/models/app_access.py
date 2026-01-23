"""App Access Template model for workspace-level app access bundles."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4
import re

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.workspace import Workspace


class AppAccessLogAction(str, Enum):
    """Action types for app access logs."""

    # Template actions
    TEMPLATE_CREATED = "template_created"
    TEMPLATE_UPDATED = "template_updated"
    TEMPLATE_DELETED = "template_deleted"

    # Member access actions
    ACCESS_UPDATED = "access_updated"
    TEMPLATE_APPLIED = "template_applied"
    ACCESS_RESET = "access_reset"
    BULK_TEMPLATE_APPLIED = "bulk_template_applied"

    # Access events
    APP_ACCESS_GRANTED = "app_access_granted"
    APP_ACCESS_REVOKED = "app_access_revoked"
    MODULE_ACCESS_GRANTED = "module_access_granted"
    MODULE_ACCESS_REVOKED = "module_access_revoked"

    # Access attempts (for security monitoring)
    ACCESS_DENIED = "access_denied"


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug[:100]


class AppAccessTemplate(Base):
    """
    App access bundle template at workspace level.

    Templates define which apps and modules a member can access.
    System templates are pre-defined (Engineering, People, Business, Full Access).
    Custom templates can be created by workspace admins.

    App config structure:
    {
        "tracking": {
            "enabled": true,
            "modules": {
                "standups": true,
                "blockers": true,
                "time": false
            }
        },
        "crm": {
            "enabled": true,
            "modules": {
                "inbox": true,
                "agents": false
            }
        },
        "hiring": {
            "enabled": false
        }
    }
    """

    __tablename__ = "app_access_templates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    # workspace_id is NULL for system templates
    workspace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Template metadata
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Visual customization
    icon: Mapped[str] = mapped_column(String(50), default="Package", nullable=False)
    color: Mapped[str] = mapped_column(String(50), default="#6366f1", nullable=False)

    # App configuration: {app_id: {enabled: bool, modules: {module_id: bool}}}
    app_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # System template (cannot be deleted or modified by users)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    workspace: Mapped["Workspace | None"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        # Unique slug per workspace (NULL workspace_id = system templates)
        UniqueConstraint(
            "workspace_id", "slug", name="uq_workspace_app_template_slug"
        ),
    )

    def is_app_enabled(self, app_id: str) -> bool:
        """Check if an app is enabled in this template."""
        app_config = self.app_config.get(app_id, {})
        return app_config.get("enabled", False)

    def is_module_enabled(self, app_id: str, module_id: str) -> bool:
        """Check if a specific module is enabled in this template."""
        app_config = self.app_config.get(app_id, {})
        if not app_config.get("enabled", False):
            return False
        modules = app_config.get("modules", {})
        # If no modules specified, all are enabled when app is enabled
        if not modules:
            return True
        return modules.get(module_id, False)

    def get_enabled_apps(self) -> list[str]:
        """Get list of enabled app IDs."""
        return [
            app_id
            for app_id, config in self.app_config.items()
            if config.get("enabled", False)
        ]

    def get_enabled_modules(self, app_id: str) -> list[str]:
        """Get list of enabled module IDs for an app."""
        app_config = self.app_config.get(app_id, {})
        if not app_config.get("enabled", False):
            return []
        modules = app_config.get("modules", {})
        if not modules:
            # If no modules specified, return empty (implies all enabled)
            return []
        return [mod_id for mod_id, enabled in modules.items() if enabled]

    def __repr__(self) -> str:
        workspace_str = f"workspace {self.workspace_id}" if self.workspace_id else "system"
        return f"<AppAccessTemplate {self.name} ({self.slug}) - {workspace_str}>"


class AppAccessLog(Base):
    """
    Audit log for app access changes.

    Tracks all access-related events for compliance and security monitoring.
    Only available for Enterprise workspaces.

    Log structure:
    - actor_id: Who performed the action (admin)
    - target_id: Affected member (for member-level actions)
    - target_type: "member", "template", or "workspace"
    - action: Type of action performed
    - old_value/new_value: State before/after change
    - extra_data: Additional context (app_id, module_id, etc.)
    """

    __tablename__ = "app_access_logs"

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

    # Who performed the action
    actor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Action type
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Target information
    target_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "member", "template", "workspace"
    target_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True, index=True
    )  # Member or template ID

    # Description of the action
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # State changes (JSONB for flexibility)
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Additional context (app_id, module_id, template_name, etc.)
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Request metadata
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")

    __table_args__ = (
        Index(
            "ix_app_access_logs_workspace_created",
            "workspace_id",
            "created_at",
        ),
        Index(
            "ix_app_access_logs_actor_action",
            "actor_id",
            "action",
        ),
    )

    def __repr__(self) -> str:
        return f"<AppAccessLog {self.action} by {self.actor_id} at {self.created_at}>"
