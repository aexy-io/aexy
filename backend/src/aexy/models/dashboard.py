"""Dashboard preferences model for customizable dashboards."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
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
