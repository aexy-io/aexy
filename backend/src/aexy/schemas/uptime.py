"""Pydantic schemas for uptime monitoring module."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


# =============================================================================
# UPTIME MONITOR SCHEMAS
# =============================================================================


class UptimeMonitorBase(BaseModel):
    """Base schema for uptime monitors."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    check_type: UptimeCheckType = UptimeCheckType.HTTP

    # HTTP/WS fields
    url: str | None = Field(None, max_length=2048)

    # TCP fields
    host: str | None = Field(None, max_length=255)
    port: int | None = Field(None, ge=1, le=65535)

    # HTTP settings
    http_method: str = Field(default="GET", pattern="^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)$")
    expected_status_codes: list[int] = Field(default_factory=lambda: [200, 201, 204])
    request_headers: dict[str, str] = Field(default_factory=dict)
    request_body: str | None = None
    verify_ssl: bool = True
    follow_redirects: bool = True

    # WebSocket settings
    ws_message: str | None = None
    ws_expected_response: str | None = None

    # Check configuration
    check_interval_seconds: int = Field(default=300, ge=30, le=86400)
    timeout_seconds: int = Field(default=30, ge=1, le=300)
    consecutive_failures_threshold: int = Field(default=3, ge=1, le=100)

    # Notifications
    notification_channels: list[str] = Field(default_factory=lambda: ["ticket"])
    slack_channel_id: str | None = None
    webhook_url: str | None = Field(None, max_length=2048)
    notify_on_recovery: bool = True

    # Team assignment
    team_id: str | None = None

    @field_validator("expected_status_codes")
    @classmethod
    def validate_status_codes(cls, v: list[int]) -> list[int]:
        """Validate HTTP status codes are in valid range."""
        for code in v:
            if not 100 <= code <= 599:
                raise ValueError(f"Invalid HTTP status code: {code}")
        return v

    @field_validator("notification_channels")
    @classmethod
    def validate_notification_channels(cls, v: list[str]) -> list[str]:
        """Validate notification channels."""
        valid_channels = {"ticket", "slack", "webhook", "email"}
        for channel in v:
            if channel not in valid_channels:
                raise ValueError(f"Invalid notification channel: {channel}. Valid: {valid_channels}")
        return v

    @model_validator(mode="after")
    def validate_check_type_fields(self) -> "UptimeMonitorBase":
        """Validate required fields based on check type."""
        if self.check_type == UptimeCheckType.HTTP:
            if not self.url:
                raise ValueError("URL is required for HTTP checks")
        elif self.check_type == UptimeCheckType.TCP:
            if not self.host or not self.port:
                raise ValueError("Host and port are required for TCP checks")
        elif self.check_type == UptimeCheckType.WEBSOCKET:
            if not self.url:
                raise ValueError("URL is required for WebSocket checks")
        return self


class UptimeMonitorCreate(UptimeMonitorBase):
    """Schema for creating an uptime monitor."""
    pass


class UptimeMonitorUpdate(BaseModel):
    """Schema for updating an uptime monitor (all fields optional)."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    check_type: UptimeCheckType | None = None
    url: str | None = Field(None, max_length=2048)
    host: str | None = Field(None, max_length=255)
    port: int | None = Field(None, ge=1, le=65535)
    http_method: str | None = Field(None, pattern="^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)$")
    expected_status_codes: list[int] | None = None
    request_headers: dict[str, str] | None = None
    request_body: str | None = None
    verify_ssl: bool | None = None
    follow_redirects: bool | None = None
    ws_message: str | None = None
    ws_expected_response: str | None = None
    check_interval_seconds: int | None = Field(None, ge=30, le=86400)
    timeout_seconds: int | None = Field(None, ge=1, le=300)
    consecutive_failures_threshold: int | None = Field(None, ge=1, le=100)
    notification_channels: list[str] | None = None
    slack_channel_id: str | None = None
    webhook_url: str | None = Field(None, max_length=2048)
    notify_on_recovery: bool | None = None
    team_id: str | None = None
    is_active: bool | None = None


class UptimeMonitorResponse(BaseModel):
    """Response schema for uptime monitor."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    check_type: str
    url: str | None
    host: str | None
    port: int | None
    http_method: str
    expected_status_codes: list[int]
    request_headers: dict[str, Any]
    request_body: str | None
    verify_ssl: bool
    follow_redirects: bool
    ws_message: str | None
    ws_expected_response: str | None
    check_interval_seconds: int
    timeout_seconds: int
    consecutive_failures_threshold: int
    current_status: str
    last_check_at: datetime | None
    next_check_at: datetime | None
    consecutive_failures: int
    last_response_time_ms: int | None
    last_error_message: str | None
    notification_channels: list[str]
    slack_channel_id: str | None
    webhook_url: str | None
    notify_on_recovery: bool
    team_id: str | None
    is_active: bool
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime


class UptimeMonitorSummary(BaseModel):
    """Summary response for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    check_type: str
    url: str | None
    host: str | None
    port: int | None
    current_status: str
    last_check_at: datetime | None
    last_response_time_ms: int | None
    consecutive_failures: int
    is_active: bool


# =============================================================================
# UPTIME CHECK SCHEMAS
# =============================================================================


class UptimeCheckResponse(BaseModel):
    """Response schema for individual check result."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    monitor_id: str
    is_up: bool
    status_code: int | None
    response_time_ms: int | None
    error_message: str | None
    error_type: str | None
    ssl_expiry_days: int | None
    ssl_issuer: str | None
    checked_at: datetime


class UptimeCheckListResponse(BaseModel):
    """Paginated list of checks."""
    items: list[UptimeCheckResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# =============================================================================
# UPTIME INCIDENT SCHEMAS
# =============================================================================


class UptimeIncidentCreate(BaseModel):
    """Schema for manually creating an incident (rare use case)."""
    monitor_id: str
    first_error_message: str | None = None
    first_error_type: str | None = None


class UptimeIncidentUpdate(BaseModel):
    """Schema for updating an incident."""
    root_cause: str | None = None
    resolution_notes: str | None = None


class UptimeIncidentResolve(BaseModel):
    """Schema for manually resolving an incident."""
    resolution_notes: str | None = None
    root_cause: str | None = None


class UptimeIncidentResponse(BaseModel):
    """Response schema for uptime incident."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    monitor_id: str
    workspace_id: str
    ticket_id: str | None
    status: str
    started_at: datetime
    resolved_at: datetime | None
    first_error_message: str | None
    first_error_type: str | None
    last_error_message: str | None
    last_error_type: str | None
    total_checks: int
    failed_checks: int
    root_cause: str | None
    resolution_notes: str | None
    acknowledged_at: datetime | None
    acknowledged_by_id: str | None
    created_at: datetime
    updated_at: datetime

    # Computed fields
    duration_seconds: int | None = None

    @model_validator(mode="after")
    def compute_duration(self) -> "UptimeIncidentResponse":
        """Compute incident duration."""
        if self.resolved_at:
            self.duration_seconds = int((self.resolved_at - self.started_at).total_seconds())
        elif self.started_at:
            self.duration_seconds = int((datetime.now(self.started_at.tzinfo) - self.started_at).total_seconds())
        return self


class UptimeIncidentWithMonitor(UptimeIncidentResponse):
    """Incident response with monitor details."""
    monitor_name: str | None = None
    monitor_url: str | None = None
    monitor_host: str | None = None
    monitor_check_type: str | None = None


class UptimeIncidentListResponse(BaseModel):
    """Paginated list of incidents."""
    items: list[UptimeIncidentWithMonitor]
    total: int
    page: int
    page_size: int
    has_more: bool


# =============================================================================
# STATISTICS SCHEMAS
# =============================================================================


class UptimeMonitorStats(BaseModel):
    """Statistics for a single monitor."""
    monitor_id: str
    monitor_name: str
    uptime_percentage_24h: float
    uptime_percentage_7d: float
    uptime_percentage_30d: float
    avg_response_time_ms_24h: float | None
    avg_response_time_ms_7d: float | None
    total_checks_24h: int
    total_checks_7d: int
    total_incidents_30d: int
    current_status: str
    last_check_at: datetime | None


class WorkspaceUptimeStats(BaseModel):
    """Aggregate statistics for a workspace."""
    total_monitors: int
    active_monitors: int
    monitors_up: int
    monitors_down: int
    monitors_degraded: int
    monitors_paused: int
    ongoing_incidents: int
    resolved_incidents_24h: int
    avg_uptime_percentage_24h: float
    avg_uptime_percentage_7d: float
    avg_response_time_ms_24h: float | None


# =============================================================================
# TEST CHECK SCHEMA
# =============================================================================


class TestCheckRequest(BaseModel):
    """Request to run an immediate test check."""
    pass  # No additional fields needed - uses monitor configuration


class TestCheckResponse(BaseModel):
    """Response from a test check."""
    is_up: bool
    status_code: int | None
    response_time_ms: int | None
    error_message: str | None
    error_type: str | None
    ssl_expiry_days: int | None
    ssl_issuer: str | None
    checked_at: datetime
