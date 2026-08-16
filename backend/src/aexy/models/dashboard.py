"""Dashboard preferences model for customizable dashboards."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


class DashboardPreferences(Base):
    """User dashboard preferences for customizable widgets and layouts."""

    __tablename__ = "dashboard_preferences"

    # Primary Key
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    # Foreign Keys
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Preset type: 'developer', 'manager', 'product', 'hr', 'support', 'sales', 'admin', 'custom'
    preset_type: Mapped[str] = mapped_column(
        String(50),
        default="developer",
        nullable=False,
    )

    # Layout configuration (grid positions, sizes, etc.)
    layout: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # List of visible widget IDs
    visible_widgets: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Ordered list of widget IDs for display order
    widget_order: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Widget size overrides: { widget_id: 'small' | 'medium' | 'large' | 'full' }
    widget_sizes: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Layouts for dashboard surfaces other than the default one, keyed by
    # surface id:
    #   { "my_work": { "preset_type", "visible_widgets", "widget_order", "widget_sizes" } }
    #
    # There is exactly one preferences row per developer, and it also carries
    # sidebar state (pinned items, visit counts, chosen persona). Giving a second
    # dashboard its own row would mean two rows per developer and a
    # MultipleResultsFound the first time anything looked up sidebar prefs by
    # developer alone — so additional surfaces nest here instead, and the columns
    # above stay the default surface's layout.
    surfaces: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
        server_default=text("'{}'"),
    )

    # Getting started checklist: list of completed step IDs
    checklist_progress: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
        server_default=text("'[]'"),
    )

    # Whether the user dismissed the getting started checklist
    checklist_dismissed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default=text("false"),
    )

    # Sidebar page visit counts: { "/crm": 42, "/tracking": 15 }
    sidebar_page_visits: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
        server_default=text("'{}'"),
    )

    # Sidebar pinned items: ["/crm", "/agents"]
    sidebar_pinned_items: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
        server_default=text("'[]'"),
    )

    # Which sidebar view this person has *chosen*. Deliberately separate from
    # preset_type: that is the dashboard widget preset, and using it as the
    # sidebar filter meant everyone's navigation defaulted to "developer"
    # regardless of what they were hired to do. NULL means "derive it from my
    # department", which is the default for everyone who never picks.
    sidebar_persona: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
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
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
