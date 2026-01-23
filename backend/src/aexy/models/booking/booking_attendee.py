"""Booking attendee model for booking module."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.booking.booking import Booking


class AttendeeStatus(str, Enum):
    """Status of an attendee's RSVP."""

    PENDING = "pending"  # Awaiting response
    CONFIRMED = "confirmed"  # Accepted the invitation
    DECLINED = "declined"  # Declined the invitation


class BookingAttendee(Base):
    """Booking attendee model.

    Represents a team member attending a booking.
    Used for ALL_HANDS team events where all team members attend.
    """

    __tablename__ = "booking_attendees"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    booking_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # RSVP status
    status: Mapped[str] = mapped_column(
        String(20),
        default=AttendeeStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Token for RSVP actions (sent in email)
    response_token: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )

    # When the attendee responded
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
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
    booking: Mapped["Booking"] = relationship(
        "Booking",
        back_populates="attendees",
        lazy="selectin",
    )
    user: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("booking_id", "user_id", name="uq_booking_attendee"),
    )
