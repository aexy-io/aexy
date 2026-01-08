"""On-call scheduling models.

This module provides models for:
- OnCallConfig (team on-call settings)
- OnCallSchedule (individual shifts)
- OnCallSwapRequest (shift swap requests)
- GoogleCalendarToken (OAuth tokens for calendar sync)
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.team import Team


class SwapRequestStatus(str, Enum):
    """Status of a swap request."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"


class OnCallConfig(Base):
    """On-call configuration for a team.

    Controls whether on-call is enabled for a team and its settings.
    Each team can have at most one on-call configuration.
    """

    __tablename__ = "oncall_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Whether on-call is enabled
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timezone for schedule display and notifications
    timezone: Mapped[str] = mapped_column(String(100), default="UTC", nullable=False)

    # Default shift duration when creating new schedules
    default_shift_duration_hours: Mapped[int] = mapped_column(
        Integer, default=24, nullable=False
    )

    # Google Calendar integration
    google_calendar_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Slack channel for on-call alerts
    slack_channel_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Notification settings
    notify_before_shift_minutes: Mapped[int] = mapped_column(
        Integer, default=30, nullable=False
    )  # Send reminder X minutes before shift starts
    notify_on_shift_change: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
    team: Mapped["Team"] = relationship(
        "Team",
        lazy="selectin",
    )
    schedules: Mapped[list["OnCallSchedule"]] = relationship(
        "OnCallSchedule",
        back_populates="config",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class OnCallSchedule(Base):
    """An on-call schedule/shift for a developer.

    Represents a specific time period when a developer is on-call.
    Supports overrides (when one developer takes over another's shift).
    """

    __tablename__ = "oncall_schedules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    config_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("oncall_configs.id", ondelete="CASCADE"),
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    # Schedule times (stored in UTC)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # Override tracking
    is_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    original_developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Google Calendar sync
    google_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Notification tracking
    shift_start_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shift_end_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Who created this schedule
    created_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
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
    config: Mapped["OnCallConfig"] = relationship(
        "OnCallConfig",
        back_populates="schedules",
        lazy="selectin",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
        lazy="selectin",
    )
    original_developer: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[original_developer_id],
        lazy="selectin",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )
    swap_requests: Mapped[list["OnCallSwapRequest"]] = relationship(
        "OnCallSwapRequest",
        back_populates="schedule",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class OnCallSwapRequest(Base):
    """A request to swap an on-call shift with another team member.

    Supports self-service swaps where team members can trade shifts.
    """

    __tablename__ = "oncall_swap_requests"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    schedule_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("oncall_schedules.id", ondelete="CASCADE"),
        index=True,
    )

    # Who is requesting the swap (current shift owner)
    requester_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    # Who they want to swap with
    target_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    # Request status
    status: Mapped[str] = mapped_column(
        String(50),
        default=SwapRequestStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Optional message with the request
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Response tracking
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    response_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    schedule: Mapped["OnCallSchedule"] = relationship(
        "OnCallSchedule",
        back_populates="swap_requests",
        lazy="selectin",
    )
    requester: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[requester_id],
        lazy="selectin",
    )
    target: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[target_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "schedule_id", "requester_id", "target_id",
            name="uq_swap_request_schedule_requester_target"
        ),
    )


class GoogleCalendarToken(Base):
    """OAuth tokens for Google Calendar integration.

    Stores access and refresh tokens for syncing on-call schedules
    to Google Calendar. One token per workspace (shared by admins).
    """

    __tablename__ = "google_calendar_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Who connected the calendar
    connected_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # OAuth tokens (should be encrypted in production)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_expiry: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Google account info
    calendar_email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    connected_by: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
