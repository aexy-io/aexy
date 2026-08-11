"""Google Integration models for Gmail and Calendar sync."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
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
    # Not unique. A workspace has one Google account per address, not one
    # account: several people each sync their own mailbox, and a shared desk
    # address is its own row again. It was unique because the original design
    # was "the workspace connects Google" — which made the second person to
    # connect silently replace the first.
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
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

    # Auto-sync interval in minutes. 0 means off — a real choice, offered as
    # "Off" in the settings UI — which is why the default is not 0.
    #
    # It used to be. `check_auto_sync_integrations` only picks up integrations
    # with an interval above zero, so a freshly connected account had
    # `gmail_sync_enabled = True`, said "Connected", and then never synced.
    # Nothing surfaced that; the person simply waited for mail that was not
    # coming, and the only cure lived on an admin-gated settings page.
    #
    # 15 minutes matches a preset in that UI, so the choice reads as selected
    # rather than as some custom value nobody picked. Reconnecting does not
    # touch the column, so somebody who chose "Off" keeps it.
    auto_sync_interval_minutes: Mapped[int] = mapped_column(default=15)
    auto_sync_calendar_interval_minutes: Mapped[int] = mapped_column(default=15)

    # Sync settings (JSON) - labels to sync, calendars to sync, privacy options
    sync_settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    # What this account syncs.
    #
    # ``all`` is the whole INBOX minus the exclusion rules — subtractive, so you
    # have to predict what to keep out and anything you forget is already in the
    # workspace before you notice. ``opt_in`` inverts it: nothing is stored
    # until a thread is marked, either here or by applying ``opt_in_label`` in
    # Gmail.
    #
    # Default stays ``all`` because it is what every existing account does, and
    # a migration that quietly stopped syncing mailboxes would look exactly like
    # an outage.
    sync_mode: Mapped[str] = mapped_column(String(16), default="all", server_default="all")

    # The Gmail label that opts a thread in without leaving Gmail. Held per
    # account rather than per workspace: it is the owner's own mailbox they are
    # labelling, and two people may already use different names.
    opt_in_label: Mapped[str] = mapped_column(
        String(255), default="Aexy", server_default="Aexy"
    )

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

    __table_args__ = (
        # One row per address per workspace. Declared here and not only in the
        # migration: an index production has and the tests do not is how
        # `uq_task_assignees_one_primary` stayed green while every reassignment
        # failed.
        UniqueConstraint(
            "workspace_id", "google_email", name="uq_google_integration_address"
        ),
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


class GoogleSyncExclusionRule(Base):
    """An address or domain this account never syncs into Aexy.

    Connecting a personal mailbox to a shared workspace is only a reasonable
    thing to ask if some of it can be kept out. A rule is evaluated before a
    message becomes a ``SyncedEmail`` row, so excluded mail leaves no body,
    snippet or attachment preview behind to be scrubbed later.

    Keyed on the *integration*, not the workspace: the person who connected the
    mailbox owns the decision, and a workspace-scoped rule would be one somebody
    else could delete.
    """

    __tablename__ = "google_sync_exclusion_rules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalised so an admin's "show me this workspace's exclusions" does not
    # have to join through integrations, and so the row survives being read
    # after its integration is gone in an audit context.
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # "address" | "domain"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Normalised lowercase on the way in; a domain is stored bare ("acme.com"),
    # never "@acme.com", so matching is one comparison rather than two shapes.
    value: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # "participants" (default) | "sender"
    #
    # Sender-only leaves your own replies to a hidden domain in place — they
    # carry the counterparty in `to_emails`, not `from_email` — so hiding a
    # correspondent that way still exposes half the thread. Participants is the
    # honest default; sender-only is the narrower deliberate choice.
    match_scope: Mapped[str] = mapped_column(
        String(16), nullable=False, default="participants"
    )

    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    integration: Mapped["GoogleIntegration"] = relationship("GoogleIntegration")

    __table_args__ = (
        UniqueConstraint(
            "integration_id", "kind", "value", name="uq_google_sync_exclusion"
        ),
    )


class GoogleSyncHiddenMessage(Base):
    """One message this account hid, and a tombstone so it stays hidden.

    ``_sync_message`` treats the presence of a ``SyncedEmail`` row as "already
    seen" — it is the dedup marker. So deleting a hidden message's row is not
    enough: the next full sync would import it again and the user would watch
    something they hid come back.

    This table is what remains after the row is deleted. It holds no content,
    only the Gmail id, which is what both the dedup check and the hide need.
    """

    __tablename__ = "google_sync_hidden_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gmail_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Which rule hid it, when a retroactive purge did the hiding. Null for a
    # one-off click-hide. Deliberately SET NULL rather than CASCADE: deleting a
    # rule must not resurrect the mail it already removed.
    rule_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_sync_exclusion_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    hidden_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "integration_id", "gmail_id", name="uq_google_sync_hidden_message"
        ),
    )


class GoogleSyncExclusionAudit(Base):
    """Who did what to a mailbox's exclusions, and who looked.

    Exclusions are visible to workspace admins by policy, which makes the list
    itself revealing: a set of hidden domains reads as a set of things somebody
    would rather their manager not see. The symmetry is that looking is recorded
    too — ``exclusions_viewed`` is written when an admin opens somebody's list.

    The owner is not notified of a view. That is deliberate: the record exists so
    the access can be reviewed later, not so it can be watched live.

    Separate from ``app_access_logs`` despite the shared vocabulary — that table
    is documented as Enterprise-only, and an audit trail that some workspaces
    silently do not keep is not an audit trail.
    """

    __tablename__ = "google_sync_exclusion_audit"

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
    # No FK: the entry has to outlive the integration it describes, or
    # disconnecting Google would erase the record of what was excluded.
    integration_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True, index=True
    )
    actor_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # exclusion_rule_created | exclusion_rule_deleted | message_hidden |
    # exclusions_viewed
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # The rule's value, or the Gmail id. Null for a view.
    target: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extra_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )


class GoogleThreadOptIn(Base):
    """One thread an opt-in account has agreed to sync.

    On an ``opt_in`` account this row is the whole permission: without it a
    thread's messages are never stored, only indexed by
    :class:`GoogleThreadIndex`. A thread carrying the account's ``opt_in_label``
    in Gmail counts as marked too, so the row is not the only way to say yes —
    which is why the sync checks both rather than treating this table as
    authoritative.

    Kept even when the thread's messages are later removed. Somebody who
    marked a thread, unmarked it, then marked it again should get their mail
    back rather than be told it is already synced.
    """

    __tablename__ = "google_thread_optins"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gmail_thread_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    marked_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "integration_id", "gmail_thread_id", name="uq_google_thread_optin"
        ),
    )


class GoogleThreadIndex(Base):
    """What an opt-in account knows about a thread it has not synced.

    Opt-in has a bootstrapping problem: if nothing is stored, there is nothing
    to browse and nothing to point at when saying "sync that one". This table is
    the answer — subject, participants and timing, never bodies and never
    attachments.

    That is a real disclosure and not a loophole: a subject line and who you
    correspond with can be as revealing as the message. It exists only on
    accounts whose owner chose ``opt_in``, the exclusion rules are applied
    before a row is written, and unlike ``synced_emails`` nothing here is
    reachable from the CRM.
    """

    __tablename__ = "google_thread_index"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("google_integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gmail_thread_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Addresses seen on the thread, deduplicated. No display names: they add
    # nothing to the decision and are one more thing being stored.
    participants: Mapped[list[str]] = mapped_column(JSONB, default=list)
    message_count: Mapped[int] = mapped_column(default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

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

    __table_args__ = (
        UniqueConstraint(
            "integration_id", "gmail_thread_id", name="uq_google_thread_index"
        ),
    )
