"""Learning integrations Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ==================== Enums ====================

class HRProviderTypeEnum(str, Enum):
    """HR system provider types."""
    WORKDAY = "workday"
    BAMBOOHR = "bamboohr"
    SAP_SUCCESSFACTORS = "sap_successfactors"
    ADP = "adp"
    CUSTOM_API = "custom_api"


class LMSProviderTypeEnum(str, Enum):
    """External LMS provider types."""
    SCORM_CLOUD = "scorm_cloud"
    CORNERSTONE = "cornerstone"
    LINKEDIN_LEARNING = "linkedin_learning"
    UDEMY_BUSINESS = "udemy_business"
    COURSERA = "coursera"
    CUSTOM = "custom"


class IntegrationStatusEnum(str, Enum):
    """Integration connection status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    PENDING_SETUP = "pending_setup"


class SyncStatusEnum(str, Enum):
    """Sync operation status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class SCORMVersionEnum(str, Enum):
    """SCORM specification versions."""
    SCORM_12 = "scorm_1.2"
    SCORM_2004_2ND = "scorm_2004_2nd"
    SCORM_2004_3RD = "scorm_2004_3rd"
    SCORM_2004_4TH = "scorm_2004_4th"


class SCORMCompletionStatusEnum(str, Enum):
    """SCORM completion status values."""
    NOT_ATTEMPTED = "not_attempted"
    INCOMPLETE = "incomplete"
    COMPLETED = "completed"
    PASSED = "passed"
    FAILED = "failed"
    UNKNOWN = "unknown"


class XAPIVerbTypeEnum(str, Enum):
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


class CalendarProviderTypeEnum(str, Enum):
    """Calendar provider types."""
    GOOGLE_CALENDAR = "google_calendar"
    OUTLOOK = "outlook"
    APPLE = "apple"


# ==================== HR Integration Schemas ====================

class HRIntegrationCreate(BaseModel):
    """Schema for creating an HR integration."""
    provider: HRProviderTypeEnum
    name: str = Field(max_length=255)
    description: str | None = None
    api_base_url: str | None = None
    api_key: str | None = None  # Will be encrypted before storage
    oauth_credentials: dict = {}
    sync_employees: bool = True
    sync_departments: bool = True
    sync_managers: bool = True
    sync_terminations: bool = True
    sync_frequency_hours: int = Field(default=24, ge=1, le=168)
    field_mappings: dict = {}
    extra_data: dict = {}


class HRIntegrationUpdate(BaseModel):
    """Schema for updating an HR integration."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    api_base_url: str | None = None
    api_key: str | None = None
    oauth_credentials: dict | None = None
    sync_employees: bool | None = None
    sync_departments: bool | None = None
    sync_managers: bool | None = None
    sync_terminations: bool | None = None
    sync_frequency_hours: int | None = None
    field_mappings: dict | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class HRIntegrationResponse(BaseModel):
    """HR integration response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    provider: HRProviderTypeEnum
    name: str
    description: str | None = None
    api_base_url: str | None = None
    sync_employees: bool
    sync_departments: bool
    sync_managers: bool
    sync_terminations: bool
    sync_frequency_hours: int
    field_mappings: dict
    status: IntegrationStatusEnum
    last_sync_at: datetime | None = None
    last_sync_status: SyncStatusEnum | None = None
    last_sync_error: str | None = None
    last_sync_stats: dict
    is_active: bool
    extra_data: dict
    created_at: datetime
    updated_at: datetime
    created_by_id: str | None = None


class HRSyncLogResponse(BaseModel):
    """HR sync log response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    integration_id: str
    workspace_id: str
    status: SyncStatusEnum
    started_at: datetime
    completed_at: datetime | None = None
    employees_created: int
    employees_updated: int
    employees_deactivated: int
    errors_count: int
    error_details: list
    extra_data: dict


# ==================== LMS Integration Schemas ====================

class LMSIntegrationCreate(BaseModel):
    """Schema for creating an LMS integration."""
    provider: LMSProviderTypeEnum
    name: str = Field(max_length=255)
    description: str | None = None
    api_base_url: str | None = None
    api_key: str | None = None
    oauth_credentials: dict = {}
    scorm_support: bool = False
    scorm_versions: list[str] = []
    xapi_support: bool = False
    xapi_endpoint: str | None = None
    xapi_credentials: dict = {}
    sync_completions: bool = True
    sync_progress: bool = True
    sync_frequency_hours: int = Field(default=1, ge=1, le=24)
    extra_data: dict = {}


class LMSIntegrationUpdate(BaseModel):
    """Schema for updating an LMS integration."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    api_base_url: str | None = None
    api_key: str | None = None
    oauth_credentials: dict | None = None
    scorm_support: bool | None = None
    scorm_versions: list[str] | None = None
    xapi_support: bool | None = None
    xapi_endpoint: str | None = None
    xapi_credentials: dict | None = None
    sync_completions: bool | None = None
    sync_progress: bool | None = None
    sync_frequency_hours: int | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class LMSIntegrationResponse(BaseModel):
    """LMS integration response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    provider: LMSProviderTypeEnum
    name: str
    description: str | None = None
    api_base_url: str | None = None
    scorm_support: bool
    scorm_versions: list[str]
    xapi_support: bool
    xapi_endpoint: str | None = None
    sync_completions: bool
    sync_progress: bool
    sync_frequency_hours: int
    status: IntegrationStatusEnum
    last_sync_at: datetime | None = None
    last_sync_error: str | None = None
    is_active: bool
    extra_data: dict
    created_at: datetime
    updated_at: datetime
    created_by_id: str | None = None


# ==================== SCORM Package Schemas ====================

class SCORMPackageCreate(BaseModel):
    """Schema for creating a SCORM package."""
    title: str = Field(max_length=500)
    description: str | None = None
    version: SCORMVersionEnum = SCORMVersionEnum.SCORM_2004_4TH
    package_url: str | None = None
    launch_url: str | None = None
    passing_score: float | None = Field(default=0.7, ge=0, le=1)
    max_attempts: int | None = None
    time_limit_minutes: int | None = None
    integration_id: str | None = None
    learning_path_id: str | None = None
    extra_data: dict = {}


class SCORMPackageUpdate(BaseModel):
    """Schema for updating a SCORM package."""
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    package_url: str | None = None
    launch_url: str | None = None
    passing_score: float | None = None
    max_attempts: int | None = None
    time_limit_minutes: int | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class SCORMPackageResponse(BaseModel):
    """SCORM package response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    integration_id: str | None = None
    title: str
    description: str | None = None
    version: SCORMVersionEnum
    package_url: str | None = None
    package_size_bytes: int | None = None
    launch_url: str | None = None
    manifest_data: dict
    passing_score: float | None = None
    max_attempts: int | None = None
    time_limit_minutes: int | None = None
    learning_path_id: str | None = None
    is_active: bool
    extra_data: dict
    created_at: datetime
    updated_at: datetime
    created_by_id: str | None = None


class SCORMPackageWithStats(SCORMPackageResponse):
    """SCORM package with enrollment statistics."""
    total_enrollments: int = 0
    completed_count: int = 0
    passed_count: int = 0
    failed_count: int = 0
    in_progress_count: int = 0
    average_score: float | None = None
    average_time_seconds: int | None = None


# ==================== SCORM Tracking Schemas ====================

class SCORMTrackingUpdate(BaseModel):
    """Schema for updating SCORM tracking data."""
    cmi_data: dict | None = None
    completion_status: SCORMCompletionStatusEnum | None = None
    success_status: str | None = None
    score_raw: float | None = None
    score_scaled: float | None = None
    total_time_seconds: int | None = None
    session_time_seconds: int | None = None
    progress_measure: float | None = None
    suspend_data: str | None = None
    location: str | None = None


class SCORMTrackingResponse(BaseModel):
    """SCORM tracking response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    package_id: str
    developer_id: str
    workspace_id: str
    cmi_data: dict
    completion_status: SCORMCompletionStatusEnum
    success_status: str | None = None
    score_raw: float | None = None
    score_min: float | None = None
    score_max: float | None = None
    score_scaled: float | None = None
    total_time_seconds: int
    session_time_seconds: int
    progress_measure: float | None = None
    attempt_number: int
    first_accessed_at: datetime | None = None
    last_accessed_at: datetime | None = None
    completed_at: datetime | None = None
    suspend_data: str | None = None
    location: str | None = None
    extra_data: dict
    created_at: datetime
    updated_at: datetime


class SCORMTrackingWithDetails(SCORMTrackingResponse):
    """SCORM tracking with additional details."""
    package_title: str = ""
    developer_name: str | None = None
    developer_email: str | None = None


# ==================== xAPI Statement Schemas ====================

class XAPIStatementCreate(BaseModel):
    """Schema for creating an xAPI statement."""
    statement_id: str
    actor_mbox: str | None = None
    actor_name: str | None = None
    actor_account: dict | None = None
    verb_id: str
    verb_display: str | None = None
    object_id: str
    object_type: str | None = None
    object_definition: dict | None = None
    result_score_scaled: float | None = None
    result_score_raw: float | None = None
    result_success: bool | None = None
    result_completion: bool | None = None
    result_duration: str | None = None
    result_response: str | None = None
    result_extensions: dict | None = None
    context_registration: str | None = None
    context_extensions: dict | None = None
    timestamp: datetime
    raw_statement: dict | None = None
    integration_id: str | None = None


class XAPIStatementResponse(BaseModel):
    """xAPI statement response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    integration_id: str | None = None
    statement_id: str
    actor_mbox: str | None = None
    actor_name: str | None = None
    verb_id: str
    verb_display: str | None = None
    verb_type: XAPIVerbTypeEnum | None = None
    object_id: str
    object_type: str | None = None
    result_score_scaled: float | None = None
    result_success: bool | None = None
    result_completion: bool | None = None
    result_duration: str | None = None
    timestamp: datetime
    stored: datetime
    extra_data: dict


# ==================== Calendar Integration Schemas ====================

class CalendarIntegrationCreate(BaseModel):
    """Schema for creating a calendar integration."""
    provider: CalendarProviderTypeEnum
    calendar_id: str | None = None
    sync_learning_sessions: bool = True
    sync_deadlines: bool = True
    sync_certifications: bool = True
    extra_data: dict = {}


class CalendarIntegrationUpdate(BaseModel):
    """Schema for updating a calendar integration."""
    calendar_id: str | None = None
    sync_learning_sessions: bool | None = None
    sync_deadlines: bool | None = None
    sync_certifications: bool | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class CalendarIntegrationResponse(BaseModel):
    """Calendar integration response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    provider: CalendarProviderTypeEnum
    calendar_id: str | None = None
    sync_learning_sessions: bool
    sync_deadlines: bool
    sync_certifications: bool
    status: IntegrationStatusEnum
    last_sync_at: datetime | None = None
    last_sync_error: str | None = None
    is_active: bool
    extra_data: dict
    created_at: datetime
    updated_at: datetime


class CalendarEventCreate(BaseModel):
    """Schema for creating a calendar event."""
    linked_entity_type: str
    linked_entity_id: str
    title: str = Field(max_length=500)
    description: str | None = None
    start_time: datetime
    end_time: datetime | None = None
    is_all_day: bool = False
    extra_data: dict = {}


class CalendarEventResponse(BaseModel):
    """Calendar event response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    integration_id: str
    workspace_id: str
    developer_id: str
    external_event_id: str | None = None
    linked_entity_type: str
    linked_entity_id: str
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime | None = None
    is_all_day: bool
    last_synced_at: datetime | None = None
    sync_error: str | None = None
    extra_data: dict
    created_at: datetime
    updated_at: datetime


# ==================== Integration Overview Schemas ====================

class IntegrationsOverview(BaseModel):
    """Overview of all learning integrations."""
    hr_integrations_count: int = 0
    hr_integrations_active: int = 0
    lms_integrations_count: int = 0
    lms_integrations_active: int = 0
    scorm_packages_count: int = 0
    scorm_packages_active: int = 0
    calendar_integrations_count: int = 0
    calendar_integrations_active: int = 0
    total_xapi_statements: int = 0
    last_hr_sync_at: datetime | None = None
    last_lms_sync_at: datetime | None = None


# ==================== Filter Schemas ====================

class HRIntegrationFilter(BaseModel):
    """Filter options for HR integrations."""
    provider: HRProviderTypeEnum | None = None
    status: IntegrationStatusEnum | None = None
    is_active: bool | None = None


class LMSIntegrationFilter(BaseModel):
    """Filter options for LMS integrations."""
    provider: LMSProviderTypeEnum | None = None
    scorm_support: bool | None = None
    xapi_support: bool | None = None
    status: IntegrationStatusEnum | None = None
    is_active: bool | None = None


class SCORMPackageFilter(BaseModel):
    """Filter options for SCORM packages."""
    integration_id: str | None = None
    version: SCORMVersionEnum | None = None
    is_active: bool | None = None


class SCORMTrackingFilter(BaseModel):
    """Filter options for SCORM tracking."""
    package_id: str | None = None
    developer_id: str | None = None
    completion_status: SCORMCompletionStatusEnum | None = None


class XAPIStatementFilter(BaseModel):
    """Filter options for xAPI statements."""
    developer_id: str | None = None
    verb_id: str | None = None
    verb_type: XAPIVerbTypeEnum | None = None
    object_id: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


# ==================== List Schemas ====================

class HRIntegrationList(BaseModel):
    """Paginated list of HR integrations."""
    items: list[HRIntegrationResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class LMSIntegrationList(BaseModel):
    """Paginated list of LMS integrations."""
    items: list[LMSIntegrationResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class SCORMPackageList(BaseModel):
    """Paginated list of SCORM packages."""
    items: list[SCORMPackageWithStats]
    total: int
    page: int
    page_size: int
    has_more: bool


class SCORMTrackingList(BaseModel):
    """Paginated list of SCORM tracking records."""
    items: list[SCORMTrackingWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class XAPIStatementList(BaseModel):
    """Paginated list of xAPI statements."""
    items: list[XAPIStatementResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class CalendarIntegrationList(BaseModel):
    """Paginated list of calendar integrations."""
    items: list[CalendarIntegrationResponse]
    total: int
    page: int
    page_size: int
    has_more: bool
