"""Booking model for booking module."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.workspace import Workspace
    from aexy.models.developer import Developer
    from aexy.models.booking.event_type import EventType
    from aexy.models.booking.booking_attendee import BookingAttendee


class BookingStatus(str, Enum):
    """Status of a booking."""

    PENDING = "pending"  # Awaiting confirmation (e.g., payment)
    CONFIRMED = "confirmed"  # Booking is confirmed
    CANCELLED = "cancelled"  # Booking was cancelled
    COMPLETED = "completed"  # Meeting has occurred
    NO_SHOW = "no_show"  # Invitee didn't show up


class PaymentStatus(str, Enum):
    """Payment status for paid bookings."""

    NONE = "none"  # No payment required
    PENDING = "pending"  # Payment initiated but not completed
    PAID = "paid"  # Payment completed
    REFUNDED = "refunded"  # Payment was refunded
    FAILED = "failed"  # Payment failed


class Booking(Base):
    """Booking model.

    Represents a scheduled meeting between a host and invitee.
    """

    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    event_type_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("booking_event_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Host (the person offering the meeting)
    host_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Invitee (the person booking the meeting)
    invitee_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    invitee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    invitee_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Scheduling
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(String(100), nullable=False)

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default=BookingStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Meeting location
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    meeting_link: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Custom question responses (JSONB)
    answers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Cancellation details
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(50), nullable=True)  # host, invitee, system
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Payment details
    payment_status: Mapped[str] = mapped_column(
        String(20),
        default=PaymentStatus.NONE.value,
        nullable=False,
    )
    payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)  # In cents
    payment_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    # External calendar integration
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calendar_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Reminders
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Secure token for invitee actions (cancel, reschedule)
    action_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

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
    event_type: Mapped["EventType"] = relationship(
        "EventType",
        back_populates="bookings",
        lazy="selectin",
    )
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    host: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")
    attendees: Mapped[list["BookingAttendee"]] = relationship(
        "BookingAttendee",
        back_populates="booking",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
