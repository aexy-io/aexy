"""Pydantic schemas for Google Integration (Gmail & Calendar sync)."""

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


# =============================================================================
# Connection & Status
# =============================================================================

class GoogleIntegrationConnectResponse(BaseModel):
    """Response for getting Google OAuth URL."""

    auth_url: str = Field(description="URL to redirect user for Google OAuth")


class GoogleIntegrationStatusResponse(BaseModel):
    """Google integration connection status."""

    is_connected: bool
    google_email: str | None = None
    gmail_sync_enabled: bool = False
    calendar_sync_enabled: bool = False
    gmail_last_sync_at: datetime | None = None
    calendar_last_sync_at: datetime | None = None
    messages_synced: int = 0
    events_synced: int = 0
    last_error: str | None = None
    granted_scopes: list[str] = []


class GoogleIntegrationSettingsUpdate(BaseModel):
    """Update sync settings."""

    gmail_sync_enabled: bool | None = None
    calendar_sync_enabled: bool | None = None
    sync_settings: dict[str, Any] | None = None  # labels, calendars, privacy


# =============================================================================
# Gmail
# =============================================================================

class GmailSyncRequest(BaseModel):
    """Request to trigger Gmail sync."""

    full_sync: bool = False  # If True, start full sync; else incremental
    max_messages: int = Field(default=500, ge=1, le=5000)


class GmailSyncResponse(BaseModel):
    """Response from Gmail sync."""

    status: str  # running, completed, error
    messages_synced: int = 0
    full_sync_completed: bool = False
    history_id: str | None = None
    error: str | None = None


class EmailRecipient(BaseModel):
    """Email recipient info."""

    email: str
    name: str | None = None


class SyncedEmailResponse(BaseModel):
    """Synced email response."""

    id: str
    gmail_id: str
    gmail_thread_id: str | None = None
    subject: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    to_emails: list[EmailRecipient] = []
    cc_emails: list[EmailRecipient] = []
    snippet: str | None = None
    body_text: str | None = None
    body_html: str | None = None
    labels: list[str] = []
    is_read: bool = False
    is_starred: bool = False
    has_attachments: bool = False
    gmail_date: datetime | None = None
    linked_records: list[dict[str, Any]] = []
    ai_summary: str | None = None
    created_at: datetime


class SyncedEmailListResponse(BaseModel):
    """List of synced emails with pagination."""

    emails: list[SyncedEmailResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class EmailSendRequest(BaseModel):
    """Request to send an email."""

    to: str
    subject: str
    body_html: str
    reply_to_message_id: str | None = None


class EmailSendResponse(BaseModel):
    """Response from sending email."""

    message_id: str
    thread_id: str | None = None


class EmailLinkRequest(BaseModel):
    """Request to link email to a CRM record."""

    record_id: str
    link_type: str = "manual"  # manual, from, to, mentioned


# =============================================================================
# Calendar
# =============================================================================

class CalendarInfo(BaseModel):
    """Google Calendar info."""

    id: str
    name: str
    description: str | None = None
    is_primary: bool = False
    access_role: str | None = None
    color: str | None = None


class CalendarListResponse(BaseModel):
    """List of available calendars."""

    calendars: list[CalendarInfo]


class CalendarSyncRequest(BaseModel):
    """Request to trigger calendar sync."""

    calendar_ids: list[str] | None = None  # If None, sync all enabled calendars


class CalendarSyncResponse(BaseModel):
    """Response from calendar sync."""

    status: str
    events_synced: int = 0
    calendars_synced: list[str] = []
    error: str | None = None


class EventAttendee(BaseModel):
    """Calendar event attendee."""

    email: str
    name: str | None = None
    response_status: str | None = None  # accepted, tentative, declined, needsAction


class SyncedEventResponse(BaseModel):
    """Synced calendar event response."""

    id: str
    google_event_id: str
    google_calendar_id: str | None = None
    title: str | None = None
    description: str | None = None
    location: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_all_day: bool = False
    timezone: str | None = None
    attendees: list[EventAttendee] = []
    organizer_email: str | None = None
    status: str | None = None  # confirmed, tentative, cancelled
    html_link: str | None = None
    conference_data: dict[str, Any] | None = None
    linked_records: list[dict[str, Any]] = []
    crm_activity_id: str | None = None
    created_at: datetime


class SyncedEventListResponse(BaseModel):
    """List of synced events with pagination."""

    events: list[SyncedEventResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class EventCreateRequest(BaseModel):
    """Request to create a calendar event."""

    calendar_id: str
    title: str
    description: str | None = None
    location: str | None = None
    start_time: datetime
    end_time: datetime
    is_all_day: bool = False
    attendee_emails: list[str] = []
    record_id: str | None = None  # Link to CRM record


class EventCreateResponse(BaseModel):
    """Response from creating event."""

    event_id: str
    google_event_id: str
    html_link: str | None = None


class EventLinkRequest(BaseModel):
    """Request to link event to a CRM record."""

    record_id: str
    link_type: str = "manual"  # manual, attendee, organizer


# =============================================================================
# Contact Enrichment
# =============================================================================

class ContactEnrichRequest(BaseModel):
    """Request to enrich contacts from emails."""

    email_ids: list[str] | None = None  # If None, process all unprocessed
    auto_create_contacts: bool = True
    enrich_existing: bool = True


class ContactEnrichResponse(BaseModel):
    """Response from contact enrichment."""

    emails_processed: int = 0
    contacts_created: int = 0
    contacts_enriched: int = 0
    companies_created: int = 0
    errors: int = 0


class RecordEnrichResponse(BaseModel):
    """Response from enriching a specific record."""

    enriched: bool
    enrichments: dict[str, Any] = {}
    classification: dict[str, Any] = {}
    emails_analyzed: int = 0
