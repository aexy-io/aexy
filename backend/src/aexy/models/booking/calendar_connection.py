"""Calendar connection model for booking module."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class CalendarProvider(str, Enum):
    """Supported calendar providers."""

    GOOGLE = "google"
    MICROSOFT = "microsoft"


class CalendarConnection(Base):
    """Calendar connection model.

    Represents a connected external calendar (Google, Microsoft).
    """

    __tablename__ = "booking_calendar_connections"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Provider info
    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    calendar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    calendar_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # OAuth tokens (should be encrypted in production)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Calendar settings
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    check_conflicts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    create_events: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Sync tracking
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sync_token: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
    user: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
