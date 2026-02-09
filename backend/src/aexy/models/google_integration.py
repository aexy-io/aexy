"""Google Integration models for Gmail and Calendar sync."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.crm import CRMActivity, CRMRecord
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class GoogleIntegration(Base):
    """Google Integration for a workspace (Gmail + Calendar sync)."""

    __tablename__ = "google_integrations"

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
    connected_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # OAuth tokens
    access_token: Mapped[str] = mapped_column(Text)  # Encrypted in production
    refresh_token: Mapped[str] = mapped_column(Text)
    token_expiry: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Google account info
    google_email: Mapped[str] = mapped_column(String(255))
    google_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Granted scopes (JSON array)
    granted_scopes: Mapped[list[str]] = mapped_column(JSONB, default=list)

    # Sync settings
    gmail_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    calendar_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Auto-sync interval in minutes (0 = disabled, min 1 minute when enabled)
    auto_sync_interval_minutes: Mapped[int] = mapped_column(default=0)
    auto_sync_calendar_interval_minutes: Mapped[int] = mapped_column(default=0)

    # Sync settings (JSON) - labels to sync, calendars to sync, privacy options
    sync_settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Gmail sync state
    gmail_history_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gmail_last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Calendar sync state
    calendar_sync_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    calendar_last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="google_integration",
    )
    connected_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[connected_by_id],
    )
    synced_emails: Mapped[list["SyncedEmail"]] = relationship(
        "SyncedEmail",
        back_populates="integration",
        cascade="all, delete-orphan",
    )
    synced_calendar_events: Mapped[list["SyncedCalendarEvent"]] = relationship(
        "SyncedCalendarEvent",
        back_populates="integration",
        cascade="all, delete-orphan",
    )


class SyncedEmail(Base):
    """Synced email from Gmail."""

    __tablename__ = "synced_emails"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        index=True,
    )

    # Gmail identifiers
    gmail_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    gmail_thread_id: Mapped[str | None] = mapped_column(String(255), index=True)

    # Email metadata
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_email: Mapped[str | None] = mapped_column(String(255), index=True)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    to_emails: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    cc_emails: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    bcc_emails: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)

    # Content
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Gmail metadata
    labels: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    gmail_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # AI enrichment
    extracted_contacts: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    signature_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    integration: Mapped["GoogleIntegration"] = relationship(
        "GoogleIntegration",
        back_populates="synced_emails",
    )
    record_links: Mapped[list["SyncedEmailRecordLink"]] = relationship(
        "SyncedEmailRecordLink",
        back_populates="email",
        cascade="all, delete-orphan",
    )


class SyncedEmailRecordLink(Base):
    """Link between synced email and CRM record."""

    __tablename__ = "synced_email_record_links"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    email_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("synced_emails.id", ondelete="CASCADE"),
        index=True,
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        index=True,
    )

    # Link metadata
    link_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # from, to, cc, mentioned
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    email: Mapped["SyncedEmail"] = relationship(
        "SyncedEmail",
        back_populates="record_links",
    )
    record: Mapped["CRMRecord"] = relationship("CRMRecord")

    # Unique constraint
    __table_args__ = (
        {"postgresql_partition_by": None},
    )


class SyncedCalendarEvent(Base):
    """Synced event from Google Calendar."""

    __tablename__ = "synced_calendar_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        index=True,
    )

    # Google Calendar identifiers
    google_event_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), index=True)

    # Event details
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Time
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Participants
    attendees: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    organizer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Status
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # confirmed, tentative, cancelled
    visibility: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Recurrence
    recurrence_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    recurring_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Google metadata
    etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    html_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    conference_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # CRM link
    crm_activity_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_activities.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    integration: Mapped["GoogleIntegration"] = relationship(
        "GoogleIntegration",
        back_populates="synced_calendar_events",
    )
    crm_activity: Mapped["CRMActivity | None"] = relationship("CRMActivity")
    record_links: Mapped[list["SyncedCalendarEventRecordLink"]] = relationship(
        "SyncedCalendarEventRecordLink",
        back_populates="event",
        cascade="all, delete-orphan",
    )


class SyncedCalendarEventRecordLink(Base):
    """Link between synced calendar event and CRM record."""

    __tablename__ = "synced_calendar_event_record_links"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    event_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("synced_calendar_events.id", ondelete="CASCADE"),
        index=True,
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        index=True,
    )

    # Link metadata
    link_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # attendee, organizer, mentioned
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    event: Mapped["SyncedCalendarEvent"] = relationship(
        "SyncedCalendarEvent",
        back_populates="record_links",
    )
    record: Mapped["CRMRecord"] = relationship("CRMRecord")


class EmailSyncCursor(Base):
    """Tracks incremental email sync progress."""

    __tablename__ = "email_sync_cursors"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Sync state
    history_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    full_sync_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    full_sync_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    full_sync_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Progress tracking for full sync
    messages_synced: Mapped[int] = mapped_column(default=0)
    next_page_token: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error tracking
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_count: Mapped[int] = mapped_column(default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    integration: Mapped["GoogleIntegration"] = relationship("GoogleIntegration")


class GoogleSyncJob(Base):
    """Tracks async sync job progress for Gmail and Calendar."""

    __tablename__ = "google_sync_jobs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        index=True,
    )

    # Job type: gmail, calendar
    job_type: Mapped[str] = mapped_column(String(50), index=True)

    # Status: pending, running, completed, failed
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)

    # Progress tracking
    total_items: Mapped[int | None] = mapped_column(nullable=True)
    processed_items: Mapped[int] = mapped_column(default=0)
    progress_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Temporal workflow tracking (column kept as celery_task_id for DB compat)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    @property
    def workflow_run_id(self) -> str | None:
        return self.celery_task_id

    @workflow_run_id.setter
    def workflow_run_id(self, value: str | None):
        self.celery_task_id = value

    # Result
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    integration: Mapped["GoogleIntegration"] = relationship("GoogleIntegration")
