"""Team event member model for booking module."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, UniqueConstraint, func, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.booking.event_type import EventType


class AssignmentType(str, Enum):
    """How team members are assigned to bookings."""

    ROUND_ROBIN = "round_robin"  # Rotate through team members
    COLLECTIVE = "collective"  # All members must be available
    ALL_HANDS = "all_hands"  # All team members attend the meeting together


class TeamEventMember(Base):
    """Team event member model.

    Links users to team events with assignment rules.
    """

    __tablename__ = "booking_team_event_members"

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
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Assignment settings
    assignment_type: Mapped[str] = mapped_column(
        String(50),
        default=AssignmentType.ROUND_ROBIN.value,
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # For round-robin tracking
    last_assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    assignment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    event_type: Mapped["EventType"] = relationship(
        "EventType",
        back_populates="team_members",
        lazy="selectin",
    )
    user: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("event_type_id", "user_id", name="uq_team_event_member"),
    )
