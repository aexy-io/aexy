"""Uptime monitoring models: Monitors, Checks, and Incidents."""

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
    from aexy.models.ticketing import Ticket
    from aexy.models.workspace import Workspace


class UptimeCheckType(str, Enum):
    """Types of uptime checks."""
    HTTP = "http"
    TCP = "tcp"
    WEBSOCKET = "websocket"


class UptimeMonitorStatus(str, Enum):
    """Monitor status states."""
    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    PAUSED = "paused"
    UNKNOWN = "unknown"


class UptimeIncidentStatus(str, Enum):
    """Incident lifecycle statuses."""
    ONGOING = "ongoing"
    RESOLVED = "resolved"


class UptimeErrorType(str, Enum):
    """Error type categories for failed checks."""
    TIMEOUT = "timeout"
    CONNECTION_REFUSED = "connection_refused"
    CONNECTION_RESET = "connection_reset"
    DNS_ERROR = "dns_error"
    SSL_ERROR = "ssl_error"
    SSL_EXPIRED = "ssl_expired"
    INVALID_RESPONSE = "invalid_response"
    UNEXPECTED_STATUS = "unexpected_status"
    WS_HANDSHAKE_FAILED = "ws_handshake_failed"
    WS_UNEXPECTED_RESPONSE = "ws_unexpected_response"
    UNKNOWN = "unknown"


class UptimeMonitor(Base):
    """Configuration for a monitored endpoint."""

    __tablename__ = "uptime_monitors"

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

    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Check type
    check_type: Mapped[str] = mapped_column(
        String(50),
        default=UptimeCheckType.HTTP.value,
        nullable=False,
    )

    # For HTTP/WebSocket checks
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # For TCP checks
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # HTTP-specific settings
    http_method: Mapped[str] = mapped_column(String(10), default="GET", nullable=False)
    expected_status_codes: Mapped[list] = mapped_column(
        JSONB,
        default=lambda: [200, 201, 204],
        nullable=False,
    )
    request_headers: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    verify_ssl: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    follow_redirects: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # WebSocket-specific settings
    ws_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ws_expected_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Check configuration
    check_interval_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    consecutive_failures_threshold: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Current state
    current_status: Mapped[str] = mapped_column(
        String(50),
        default=UptimeMonitorStatus.UNKNOWN.value,
        nullable=False,
    )
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    next_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Notification settings
    notification_channels: Mapped[list] = mapped_column(
        JSONB,
        default=lambda: ["ticket"],
        nullable=False,
    )  # ["ticket", "slack", "webhook"]
    slack_channel_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    notify_on_recovery: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Ticket routing
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Active/inactive toggle
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Creator
    created_by_id: Mapped[str | None] = mapped_column(
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
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    team: Mapped["Team | None"] = relationship("Team", lazy="selectin")
    created_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")
    checks: Mapped[list["UptimeCheck"]] = relationship(
        "UptimeCheck",
        back_populates="monitor",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    incidents: Mapped[list["UptimeIncident"]] = relationship(
        "UptimeIncident",
        back_populates="monitor",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_uptime_monitor_name"),
    )


class UptimeCheck(Base):
    """Individual check result (time-series data)."""

    __tablename__ = "uptime_checks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    monitor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("uptime_monitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Check result
    is_up: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Error details
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # SSL info
    ssl_expiry_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ssl_issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Response details
    response_body_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Timestamp
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    monitor: Mapped["UptimeMonitor"] = relationship("UptimeMonitor", back_populates="checks")


class UptimeIncident(Base):
    """Groups consecutive failures into an incident, linked to a ticket."""

    __tablename__ = "uptime_incidents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    monitor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("uptime_monitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Linked ticket
    ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tickets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Incident status
    status: Mapped[str] = mapped_column(
        String(50),
        default=UptimeIncidentStatus.ONGOING.value,
        nullable=False,
    )

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Error tracking
    first_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_error_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Check counts
    total_checks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_checks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Post-incident details
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Acknowledgment
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_by_id: Mapped[str | None] = mapped_column(
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
    monitor: Mapped["UptimeMonitor"] = relationship("UptimeMonitor", back_populates="incidents")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    ticket: Mapped["Ticket | None"] = relationship("Ticket", lazy="selectin")
    acknowledged_by: Mapped["Developer | None"] = relationship("Developer", lazy="selectin")
