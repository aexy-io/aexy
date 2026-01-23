"""Event type model for booking module."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.workspace import Workspace
    from aexy.models.developer import Developer
    from aexy.models.booking.booking import Booking
    from aexy.models.booking.team_event_member import TeamEventMember


class LocationType(str, Enum):
    """Location type for meetings."""

    ZOOM = "zoom"
    GOOGLE_MEET = "google_meet"
    MICROSOFT_TEAMS = "microsoft_teams"
    PHONE = "phone"
    IN_PERSON = "in_person"
    CUSTOM = "custom"


class EventType(Base):
    """Event type model for booking module.

    Represents a type of meeting that can be booked (e.g., "30 min meeting",
    "Technical Interview", "Coffee chat").
    """

    __tablename__ = "booking_event_types"

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
    owner_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # Meeting settings
    location_type: Mapped[str] = mapped_column(
        String(50),
        default=LocationType.GOOGLE_MEET.value,
        nullable=False,
    )
    custom_location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    color: Mapped[str] = mapped_column(String(7), default="#3B82F6", nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_team_event: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Buffer times
    buffer_before: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    buffer_after: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Scheduling constraints
    min_notice_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    max_future_days: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Custom intake questions (JSONB array)
    questions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Payment settings (FREE tier only)
    payment_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payment_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)  # In cents
    payment_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)

    # Confirmation
    confirmation_message: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    owner: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    bookings: Mapped[list["Booking"]] = relationship(
        "Booking",
        back_populates="event_type",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    team_members: Mapped[list["TeamEventMember"]] = relationship(
        "TeamEventMember",
        back_populates="event_type",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_booking_event_type_slug"),
    )
