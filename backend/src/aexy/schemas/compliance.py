"""Compliance and certification Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# Enums
class AssignmentStatusEnum(str, Enum):
    """Training assignment status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    WAIVED = "waived"


class CertificationStatusEnum(str, Enum):
    """Developer certification status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    EXPIRING_SOON = "expiring_soon"
    REVOKED = "revoked"


class AppliesToEnum(str, Enum):
    """Training applies to types."""
    ALL = "all"
    TEAM = "team"
    ROLE = "role"
    INDIVIDUAL = "individual"


class AuditActionTypeEnum(str, Enum):
    """Audit log action types."""
    # Training actions
    TRAINING_CREATED = "training_created"
    TRAINING_UPDATED = "training_updated"
    TRAINING_DELETED = "training_deleted"
    TRAINING_ASSIGNED = "training_assigned"
    TRAINING_COMPLETED = "training_completed"
    TRAINING_WAIVED = "training_waived"
    TRAINING_ACKNOWLEDGED = "training_acknowledged"
    # Certification actions
    CERTIFICATION_ADDED = "certification_added"
    CERTIFICATION_UPDATED = "certification_updated"
    CERTIFICATION_EXPIRED = "certification_expired"
    CERTIFICATION_RENEWED = "certification_renewed"
    CERTIFICATION_REVOKED = "certification_revoked"
    # Goal actions
    GOAL_CREATED = "goal_created"
    GOAL_UPDATED = "goal_updated"
    GOAL_COMPLETED = "goal_completed"
    # Approval actions
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_APPROVED = "approval_approved"
    APPROVAL_REJECTED = "approval_rejected"


# ==================== Mandatory Training Schemas ====================

class MandatoryTrainingBase(BaseModel):
    """Base mandatory training schema."""
    name: str = Field(max_length=255)
    description: str | None = None
    applies_to_type: AppliesToEnum = AppliesToEnum.ALL
    applies_to_ids: list[str] = []
    due_days_after_assignment: int = Field(default=30, ge=1)
    recurring_months: int | None = Field(default=None, ge=1)
    fixed_due_date: datetime | None = None


class MandatoryTrainingCreate(MandatoryTrainingBase):
    """Schema for creating mandatory training."""
    learning_path_id: str | None = None
    extra_data: dict = {}


class MandatoryTrainingUpdate(BaseModel):
    """Schema for updating mandatory training."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    applies_to_type: AppliesToEnum | None = None
    applies_to_ids: list[str] | None = None
    due_days_after_assignment: int | None = Field(default=None, ge=1)
    recurring_months: int | None = None
    fixed_due_date: datetime | None = None
    learning_path_id: str | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class MandatoryTrainingResponse(MandatoryTrainingBase):
    """Mandatory training response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    learning_path_id: str | None = None
    is_active: bool
    extra_data: dict = {}
    created_at: datetime
    updated_at: datetime
    created_by_id: str | None = None


class MandatoryTrainingWithStats(MandatoryTrainingResponse):
    """Mandatory training with completion statistics."""
    total_assignments: int = 0
    completed_assignments: int = 0
    overdue_assignments: int = 0
    in_progress_assignments: int = 0
    completion_rate: float = 0.0


# ==================== Training Assignment Schemas ====================

class TrainingAssignmentBase(BaseModel):
    """Base training assignment schema."""
    due_date: datetime


class TrainingAssignmentCreate(TrainingAssignmentBase):
    """Schema for creating a training assignment."""
    mandatory_training_id: str
    developer_id: str
    extra_data: dict = {}


class TrainingAssignmentBulkCreate(BaseModel):
    """Schema for bulk creating training assignments."""
    mandatory_training_id: str
    developer_ids: list[str] = Field(min_length=1)
    due_date: datetime | None = None  # If not set, uses training default


class TrainingAssignmentUpdate(BaseModel):
    """Schema for updating a training assignment."""
    due_date: datetime | None = None
    status: AssignmentStatusEnum | None = None
    progress_percentage: int | None = Field(default=None, ge=0, le=100)
    extra_data: dict | None = None


class TrainingAssignmentAcknowledge(BaseModel):
    """Schema for acknowledging a training assignment."""
    pass  # Just a marker, acknowledged_at is set server-side


class TrainingAssignmentWaive(BaseModel):
    """Schema for waiving a training assignment."""
    reason: str = Field(min_length=10, max_length=1000)


class TrainingAssignmentComplete(BaseModel):
    """Schema for completing a training assignment."""
    notes: str | None = None


class TrainingAssignmentResponse(TrainingAssignmentBase):
    """Training assignment response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    mandatory_training_id: str
    developer_id: str
    workspace_id: str
    status: AssignmentStatusEnum
    progress_percentage: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    acknowledged_at: datetime | None = None
    waived_by_id: str | None = None
    waived_at: datetime | None = None
    waiver_reason: str | None = None
    extra_data: dict = {}
    reminder_sent_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TrainingAssignmentWithDetails(TrainingAssignmentResponse):
    """Training assignment with training and developer details."""
    training_name: str = ""
    training_description: str | None = None
    developer_name: str = ""
    developer_email: str = ""
    learning_path_id: str | None = None
    days_until_due: int | None = None
    is_overdue: bool = False


# ==================== Certification Schemas ====================

class CertificationBase(BaseModel):
    """Base certification schema."""
    name: str = Field(max_length=255)
    description: str | None = None
    issuing_authority: str = Field(max_length=255)
    validity_months: int | None = Field(default=None, ge=1)
    renewal_required: bool = False
    category: str | None = Field(default=None, max_length=100)
    skill_tags: list[str] = []


class CertificationCreate(CertificationBase):
    """Schema for creating a certification."""
    prerequisites: list[str] = []  # List of certification IDs
    is_required: bool = False
    external_url: str | None = None
    logo_url: str | None = None
    extra_data: dict = {}


class CertificationUpdate(BaseModel):
    """Schema for updating a certification."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    issuing_authority: str | None = Field(default=None, max_length=255)
    validity_months: int | None = None
    renewal_required: bool | None = None
    category: str | None = None
    skill_tags: list[str] | None = None
    prerequisites: list[str] | None = None
    is_required: bool | None = None
    external_url: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class CertificationResponse(CertificationBase):
    """Certification response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    prerequisites: list[str] = []
    is_required: bool
    external_url: str | None = None
    logo_url: str | None = None
    extra_data: dict = {}
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by_id: str | None = None


class CertificationWithStats(CertificationResponse):
    """Certification with holder statistics."""
    total_holders: int = 0
    active_holders: int = 0
    expiring_soon_count: int = 0
    expired_count: int = 0


# ==================== Developer Certification Schemas ====================

class DeveloperCertificationBase(BaseModel):
    """Base developer certification schema."""
    issued_date: datetime
    expiry_date: datetime | None = None
    credential_id: str | None = Field(default=None, max_length=255)
    verification_url: str | None = None
    certificate_url: str | None = None


class DeveloperCertificationCreate(DeveloperCertificationBase):
    """Schema for creating a developer certification."""
    certification_id: str
    developer_id: str
    score: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    extra_data: dict = {}


class DeveloperCertificationUpdate(BaseModel):
    """Schema for updating a developer certification."""
    issued_date: datetime | None = None
    expiry_date: datetime | None = None
    credential_id: str | None = None
    verification_url: str | None = None
    certificate_url: str | None = None
    status: CertificationStatusEnum | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    extra_data: dict | None = None


class DeveloperCertificationVerify(BaseModel):
    """Schema for verifying a developer certification."""
    verification_url: str | None = None
    notes: str | None = None


class DeveloperCertificationRenew(BaseModel):
    """Schema for renewing a developer certification."""
    new_issued_date: datetime
    new_expiry_date: datetime | None = None
    new_credential_id: str | None = None
    new_verification_url: str | None = None
    new_certificate_url: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)


class DeveloperCertificationResponse(DeveloperCertificationBase):
    """Developer certification response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    certification_id: str
    workspace_id: str
    status: CertificationStatusEnum
    verified_at: datetime | None = None
    verified_by_id: str | None = None
    score: int | None = None
    extra_data: dict = {}
    notes: str | None = None
    renewal_reminder_sent_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DeveloperCertificationWithDetails(DeveloperCertificationResponse):
    """Developer certification with certification and developer details."""
    certification_name: str = ""
    certification_issuing_authority: str = ""
    developer_name: str = ""
    developer_email: str = ""
    days_until_expiry: int | None = None
    is_expired: bool = False
    is_expiring_soon: bool = False  # Within 30 days


# ==================== Audit Log Schemas ====================

class LearningAuditLogResponse(BaseModel):
    """Audit log response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    actor_id: str
    action_type: AuditActionTypeEnum
    target_type: str
    target_id: str
    old_value: dict | None = None
    new_value: dict | None = None
    description: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    extra_data: dict = {}
    created_at: datetime


class LearningAuditLogWithActor(LearningAuditLogResponse):
    """Audit log with actor details."""
    actor_name: str = ""
    actor_email: str = ""


# ==================== Compliance Report Schemas ====================

class ComplianceOverview(BaseModel):
    """Overall compliance overview for a workspace."""
    total_mandatory_trainings: int = 0
    active_mandatory_trainings: int = 0
    total_assignments: int = 0
    completed_assignments: int = 0
    overdue_assignments: int = 0
    in_progress_assignments: int = 0
    pending_assignments: int = 0
    waived_assignments: int = 0
    overall_completion_rate: float = 0.0
    total_certifications: int = 0
    active_certifications: int = 0
    expired_certifications: int = 0
    expiring_soon_certifications: int = 0


class DeveloperComplianceStatus(BaseModel):
    """Compliance status for a single developer."""
    developer_id: str
    developer_name: str
    developer_email: str
    total_assignments: int = 0
    completed_assignments: int = 0
    overdue_assignments: int = 0
    in_progress_assignments: int = 0
    pending_assignments: int = 0
    completion_rate: float = 0.0
    total_certifications: int = 0
    active_certifications: int = 0
    expired_certifications: int = 0
    expiring_soon_certifications: int = 0
    is_compliant: bool = True  # No overdue assignments and no expired required certs


class OverdueReport(BaseModel):
    """Report of overdue training assignments."""
    assignments: list[TrainingAssignmentWithDetails]
    total: int
    by_training: dict[str, int] = {}  # training_id -> count
    by_team: dict[str, int] = {}  # team_id -> count


class ExpiringCertificationsReport(BaseModel):
    """Report of expiring certifications."""
    certifications: list[DeveloperCertificationWithDetails]
    total: int
    by_certification: dict[str, int] = {}  # certification_id -> count
    by_days_until_expiry: dict[str, int] = {}  # "0-7", "8-14", "15-30" -> count


# ==================== Pagination & List Schemas ====================

class MandatoryTrainingList(BaseModel):
    """Paginated list of mandatory trainings."""
    items: list[MandatoryTrainingWithStats]
    total: int
    page: int
    page_size: int
    has_more: bool


class TrainingAssignmentList(BaseModel):
    """Paginated list of training assignments."""
    items: list[TrainingAssignmentWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class CertificationList(BaseModel):
    """Paginated list of certifications."""
    items: list[CertificationWithStats]
    total: int
    page: int
    page_size: int
    has_more: bool


class DeveloperCertificationList(BaseModel):
    """Paginated list of developer certifications."""
    items: list[DeveloperCertificationWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class AuditLogList(BaseModel):
    """Paginated list of audit logs."""
    items: list[LearningAuditLogWithActor]
    total: int
    page: int
    page_size: int
    has_more: bool


# ==================== Filter Schemas ====================

class TrainingAssignmentFilter(BaseModel):
    """Filter options for training assignments."""
    mandatory_training_id: str | None = None
    developer_id: str | None = None
    status: AssignmentStatusEnum | None = None
    is_overdue: bool | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


class DeveloperCertificationFilter(BaseModel):
    """Filter options for developer certifications."""
    certification_id: str | None = None
    developer_id: str | None = None
    status: CertificationStatusEnum | None = None
    is_expiring_soon: bool | None = None
    is_expired: bool | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


class AuditLogFilter(BaseModel):
    """Filter options for audit logs."""
    action_type: AuditActionTypeEnum | None = None
    target_type: str | None = None
    target_id: str | None = None
    actor_id: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
