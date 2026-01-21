"""Learning integrations database models.

Models for HR system sync, SCORM/xAPI LMS integration, and calendar sync.
"""

from enum import Enum as PyEnum
from datetime import datetime

from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Float,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from aexy.core.database import Base


# ==================== Enums ====================

class HRProviderType(str, PyEnum):
    """HR system provider types."""
    WORKDAY = "workday"
    BAMBOOHR = "bamboohr"
    SAP_SUCCESSFACTORS = "sap_successfactors"
    ADP = "adp"
    CUSTOM_API = "custom_api"


class LMSProviderType(str, PyEnum):
    """External LMS provider types."""
    SCORM_CLOUD = "scorm_cloud"
    CORNERSTONE = "cornerstone"
    LINKEDIN_LEARNING = "linkedin_learning"
    UDEMY_BUSINESS = "udemy_business"
    COURSERA = "coursera"
    CUSTOM = "custom"


class IntegrationStatus(str, PyEnum):
    """Integration connection status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    PENDING_SETUP = "pending_setup"


class SyncStatus(str, PyEnum):
    """Sync operation status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class SCORMVersion(str, PyEnum):
    """SCORM specification versions."""
    SCORM_12 = "scorm_1.2"
    SCORM_2004_2ND = "scorm_2004_2nd"
    SCORM_2004_3RD = "scorm_2004_3rd"
    SCORM_2004_4TH = "scorm_2004_4th"


class SCORMCompletionStatus(str, PyEnum):
    """SCORM completion status values."""
    NOT_ATTEMPTED = "not_attempted"
    INCOMPLETE = "incomplete"
    COMPLETED = "completed"
    PASSED = "passed"
    FAILED = "failed"
    UNKNOWN = "unknown"


class XAPIVerbType(str, PyEnum):
    """Common xAPI verbs."""
    LAUNCHED = "launched"
    INITIALIZED = "initialized"
    COMPLETED = "completed"
    PASSED = "passed"
    FAILED = "failed"
    ANSWERED = "answered"
    EXPERIENCED = "experienced"
    ATTEMPTED = "attempted"
    PROGRESSED = "progressed"
    SCORED = "scored"


class CalendarProviderType(str, PyEnum):
    """Calendar provider types."""
    GOOGLE_CALENDAR = "google_calendar"
    OUTLOOK = "outlook"
    APPLE = "apple"


# ==================== HR Integration Models ====================

class HRIntegration(Base):
    """HR system integration configuration."""
    __tablename__ = "hr_integrations"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)

    provider = Column(Enum(HRProviderType), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Connection configuration (encrypted in practice)
    api_base_url = Column(String(500), nullable=True)
    api_key_encrypted = Column(Text, nullable=True)
    oauth_credentials = Column(JSONB, nullable=True, default=dict)

    # Sync settings
    sync_employees = Column(Boolean, default=True)
    sync_departments = Column(Boolean, default=True)
    sync_managers = Column(Boolean, default=True)
    sync_terminations = Column(Boolean, default=True)
    sync_frequency_hours = Column(Integer, default=24)

    # Field mappings (HR field -> our field)
    field_mappings = Column(JSONB, nullable=True, default=dict)

    # Status
    status = Column(Enum(IntegrationStatus), default=IntegrationStatus.PENDING_SETUP)
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_status = Column(Enum(SyncStatus), nullable=True)
    last_sync_error = Column(Text, nullable=True)
    last_sync_stats = Column(JSONB, nullable=True, default=dict)

    is_active = Column(Boolean, default=True)
    extra_data = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    workspace = relationship("Workspace", backref="hr_integrations")
    created_by = relationship("Developer", foreign_keys=[created_by_id])
    sync_logs = relationship("HRSyncLog", back_populates="integration", cascade="all, delete-orphan")


class HRSyncLog(Base):
    """Log of HR sync operations."""
    __tablename__ = "hr_sync_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    integration_id = Column(UUID(as_uuid=False), ForeignKey("hr_integrations.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)

    status = Column(Enum(SyncStatus), nullable=False)
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Statistics
    employees_created = Column(Integer, default=0)
    employees_updated = Column(Integer, default=0)
    employees_deactivated = Column(Integer, default=0)
    errors_count = Column(Integer, default=0)

    error_details = Column(JSONB, nullable=True, default=list)
    extra_data = Column(JSONB, nullable=True, default=dict)

    # Relationships
    integration = relationship("HRIntegration", back_populates="sync_logs")


# ==================== LMS/SCORM Integration Models ====================

class LMSIntegration(Base):
    """External LMS integration configuration."""
    __tablename__ = "lms_integrations"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)

    provider = Column(Enum(LMSProviderType), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Connection details
    api_base_url = Column(String(500), nullable=True)
    api_key_encrypted = Column(Text, nullable=True)
    oauth_credentials = Column(JSONB, nullable=True, default=dict)

    # SCORM support
    scorm_support = Column(Boolean, default=False)
    scorm_versions = Column(JSONB, nullable=True, default=list)  # List of supported versions

    # xAPI support
    xapi_support = Column(Boolean, default=False)
    xapi_endpoint = Column(String(500), nullable=True)
    xapi_credentials = Column(JSONB, nullable=True, default=dict)

    # Sync settings
    sync_completions = Column(Boolean, default=True)
    sync_progress = Column(Boolean, default=True)
    sync_frequency_hours = Column(Integer, default=1)

    status = Column(Enum(IntegrationStatus), default=IntegrationStatus.PENDING_SETUP)
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_error = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    extra_data = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    workspace = relationship("Workspace", backref="lms_integrations")
    created_by = relationship("Developer", foreign_keys=[created_by_id])
    scorm_packages = relationship("SCORMPackage", back_populates="integration", cascade="all, delete-orphan")


class SCORMPackage(Base):
    """SCORM course package."""
    __tablename__ = "scorm_packages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    integration_id = Column(UUID(as_uuid=False), ForeignKey("lms_integrations.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(Enum(SCORMVersion), nullable=False, default=SCORMVersion.SCORM_2004_4TH)

    # Package details
    package_url = Column(String(1000), nullable=True)  # S3 or storage URL
    package_size_bytes = Column(Integer, nullable=True)
    launch_url = Column(String(1000), nullable=True)  # Relative path in package

    # Manifest data (parsed from imsmanifest.xml)
    manifest_data = Column(JSONB, nullable=True, default=dict)

    # Completion settings
    passing_score = Column(Float, nullable=True, default=0.7)
    max_attempts = Column(Integer, nullable=True)
    time_limit_minutes = Column(Integer, nullable=True)

    # Linked learning path (optional)
    learning_path_id = Column(UUID(as_uuid=False), ForeignKey("learning_paths.id", ondelete="SET NULL"), nullable=True)

    is_active = Column(Boolean, default=True)
    extra_data = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    workspace = relationship("Workspace", backref="scorm_packages")
    integration = relationship("LMSIntegration", back_populates="scorm_packages")
    learning_path = relationship("LearningPath", backref="scorm_packages")
    created_by = relationship("Developer", foreign_keys=[created_by_id])
    tracking_records = relationship("SCORMTracking", back_populates="package", cascade="all, delete-orphan")


class SCORMTracking(Base):
    """SCORM runtime tracking data for a learner."""
    __tablename__ = "scorm_tracking"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    package_id = Column(UUID(as_uuid=False), ForeignKey("scorm_packages.id", ondelete="CASCADE"), nullable=False, index=True)
    developer_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)

    # SCORM CMI data (Core Model Interface)
    cmi_data = Column(JSONB, nullable=True, default=dict)

    # Status tracking
    completion_status = Column(Enum(SCORMCompletionStatus), default=SCORMCompletionStatus.NOT_ATTEMPTED)
    success_status = Column(String(50), nullable=True)  # passed, failed, unknown

    # Score
    score_raw = Column(Float, nullable=True)
    score_min = Column(Float, nullable=True, default=0)
    score_max = Column(Float, nullable=True, default=100)
    score_scaled = Column(Float, nullable=True)  # Normalized 0-1

    # Time tracking
    total_time_seconds = Column(Integer, default=0)
    session_time_seconds = Column(Integer, default=0)

    # Progress
    progress_measure = Column(Float, nullable=True)  # 0-1

    # Attempts
    attempt_number = Column(Integer, default=1)

    # Timestamps
    first_accessed_at = Column(DateTime, nullable=True)
    last_accessed_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Suspend/bookmark data
    suspend_data = Column(Text, nullable=True)
    location = Column(String(1000), nullable=True)  # Bookmark location

    extra_data = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    package = relationship("SCORMPackage", back_populates="tracking_records")
    developer = relationship("Developer", backref="scorm_tracking")


class XAPIStatement(Base):
    """xAPI (Tin Can) statement storage."""
    __tablename__ = "xapi_statements"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    developer_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), nullable=False, index=True)
    integration_id = Column(UUID(as_uuid=False), ForeignKey("lms_integrations.id", ondelete="SET NULL"), nullable=True)

    # Statement components
    statement_id = Column(String(255), nullable=False, unique=True, index=True)  # UUID from statement

    # Actor
    actor_mbox = Column(String(500), nullable=True)
    actor_name = Column(String(255), nullable=True)
    actor_account = Column(JSONB, nullable=True)

    # Verb
    verb_id = Column(String(500), nullable=False)
    verb_display = Column(String(255), nullable=True)
    verb_type = Column(Enum(XAPIVerbType), nullable=True)

    # Object
    object_id = Column(String(500), nullable=False)
    object_type = Column(String(100), nullable=True)  # Activity, Agent, StatementRef, etc.
    object_definition = Column(JSONB, nullable=True)

    # Result
    result_score_scaled = Column(Float, nullable=True)
    result_score_raw = Column(Float, nullable=True)
    result_score_min = Column(Float, nullable=True)
    result_score_max = Column(Float, nullable=True)
    result_success = Column(Boolean, nullable=True)
    result_completion = Column(Boolean, nullable=True)
    result_duration = Column(String(100), nullable=True)  # ISO 8601 duration
    result_response = Column(Text, nullable=True)
    result_extensions = Column(JSONB, nullable=True)

    # Context
    context_registration = Column(String(255), nullable=True)
    context_instructor = Column(JSONB, nullable=True)
    context_team = Column(JSONB, nullable=True)
    context_extensions = Column(JSONB, nullable=True)
    context_statement_ref = Column(String(255), nullable=True)

    # Authority (who made the statement)
    authority = Column(JSONB, nullable=True)

    # Timestamp when the experience occurred
    timestamp = Column(DateTime, nullable=False, index=True)

    # When the statement was stored
    stored = Column(DateTime, default=datetime.utcnow)

    # Full statement JSON for reference
    raw_statement = Column(JSONB, nullable=True)

    extra_data = Column(JSONB, nullable=True, default=dict)

    # Relationships
    developer = relationship("Developer", backref="xapi_statements")
    integration = relationship("LMSIntegration", backref="xapi_statements")


# ==================== Calendar Integration Models ====================

class LearningCalendarIntegration(Base):
    """Calendar integration for learning events."""
    __tablename__ = "learning_calendar_integrations"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    developer_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), nullable=False, index=True)

    provider = Column(Enum(CalendarProviderType), nullable=False)

    # OAuth tokens
    access_token_encrypted = Column(Text, nullable=True)
    refresh_token_encrypted = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)

    # Sync settings
    calendar_id = Column(String(500), nullable=True)  # Specific calendar to sync to
    sync_learning_sessions = Column(Boolean, default=True)
    sync_deadlines = Column(Boolean, default=True)
    sync_certifications = Column(Boolean, default=True)

    # Status
    status = Column(Enum(IntegrationStatus), default=IntegrationStatus.PENDING_SETUP)
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_error = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    extra_data = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    developer = relationship("Developer", backref="learning_calendar_integrations")
    calendar_events = relationship("LearningCalendarEvent", back_populates="integration", cascade="all, delete-orphan")


class LearningCalendarEvent(Base):
    """Synced calendar events for learning activities."""
    __tablename__ = "learning_calendar_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    integration_id = Column(UUID(as_uuid=False), ForeignKey("learning_calendar_integrations.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    developer_id = Column(UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), nullable=False, index=True)

    # External calendar event
    external_event_id = Column(String(500), nullable=True, index=True)

    # Linked entity
    linked_entity_type = Column(String(50), nullable=False)  # learning_goal, training_assignment, certification, etc.
    linked_entity_id = Column(UUID(as_uuid=False), nullable=False)

    # Event details
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    is_all_day = Column(Boolean, default=False)

    # Sync status
    last_synced_at = Column(DateTime, nullable=True)
    sync_error = Column(Text, nullable=True)

    extra_data = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    integration = relationship("LearningCalendarIntegration", back_populates="calendar_events")
    developer = relationship("Developer", backref="learning_calendar_events")
