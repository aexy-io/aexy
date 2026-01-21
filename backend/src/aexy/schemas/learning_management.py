"""Learning management Pydantic schemas for manager controls."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ==================== Enums ====================

class GoalStatusEnum(str, Enum):
    """Learning goal status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"


class GoalTypeEnum(str, Enum):
    """Learning goal types."""
    COURSE_COMPLETION = "course_completion"
    HOURS_SPENT = "hours_spent"
    SKILL_ACQUISITION = "skill_acquisition"
    CERTIFICATION = "certification"
    PATH_COMPLETION = "path_completion"
    CUSTOM = "custom"


class ApprovalStatusEnum(str, Enum):
    """Course approval status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ApprovalRequestTypeEnum(str, Enum):
    """Types of approval requests."""
    COURSE = "course"
    CERTIFICATION = "certification"
    CONFERENCE = "conference"
    TRAINING = "training"
    OTHER = "other"


class TransactionTypeEnum(str, Enum):
    """Budget transaction types."""
    ALLOCATION = "allocation"
    ADJUSTMENT = "adjustment"
    EXPENSE = "expense"
    REFUND = "refund"
    TRANSFER_IN = "transfer_in"
    TRANSFER_OUT = "transfer_out"


# ==================== Learning Goal Schemas ====================

class LearningGoalBase(BaseModel):
    """Base learning goal schema."""
    title: str = Field(max_length=255)
    description: str | None = None
    goal_type: GoalTypeEnum = GoalTypeEnum.CUSTOM
    due_date: datetime | None = None
    priority: int = Field(default=0, ge=0, le=4)
    is_visible_to_developer: bool = True


class LearningGoalCreate(LearningGoalBase):
    """Schema for creating a learning goal."""
    developer_id: str
    target_config: dict = {}
    target_value: int = Field(default=0, ge=0)
    notes: str | None = None
    extra_data: dict = {}


class LearningGoalUpdate(BaseModel):
    """Schema for updating a learning goal."""
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    goal_type: GoalTypeEnum | None = None
    target_config: dict | None = None
    target_value: int | None = Field(default=None, ge=0)
    due_date: datetime | None = None
    priority: int | None = Field(default=None, ge=0, le=4)
    is_visible_to_developer: bool | None = None
    status: GoalStatusEnum | None = None
    notes: str | None = None
    extra_data: dict | None = None


class LearningGoalProgressUpdate(BaseModel):
    """Schema for updating goal progress."""
    current_value: int = Field(ge=0)
    progress_data: dict = {}
    notes: str | None = None


class LearningGoalResponse(LearningGoalBase):
    """Learning goal response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    set_by_id: str
    target_config: dict = {}
    progress_percentage: int
    progress_data: dict = {}
    current_value: int
    target_value: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    status: GoalStatusEnum
    notes: str | None = None
    extra_data: dict = {}
    created_at: datetime
    updated_at: datetime


class LearningGoalWithDetails(LearningGoalResponse):
    """Learning goal with developer and manager details."""
    developer_name: str = ""
    developer_email: str = ""
    set_by_name: str = ""
    set_by_email: str = ""
    days_until_due: int | None = None
    is_overdue: bool = False


# ==================== Course Approval Request Schemas ====================

class CourseApprovalRequestBase(BaseModel):
    """Base course approval request schema."""
    request_type: ApprovalRequestTypeEnum = ApprovalRequestTypeEnum.COURSE
    course_title: str = Field(max_length=500)
    course_provider: str | None = Field(default=None, max_length=255)
    course_url: str | None = None
    course_description: str | None = None
    estimated_cost_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="USD", max_length=3)
    estimated_hours: int | None = Field(default=None, ge=1)
    justification: str | None = None
    skills_to_gain: list[str] = []


class CourseApprovalRequestCreate(CourseApprovalRequestBase):
    """Schema for creating a course approval request."""
    approver_id: str | None = None  # If not set, goes to default approver
    linked_goal_id: str | None = None
    extra_data: dict = {}


class CourseApprovalRequestUpdate(BaseModel):
    """Schema for updating a course approval request (before decision)."""
    course_title: str | None = Field(default=None, max_length=500)
    course_provider: str | None = None
    course_url: str | None = None
    course_description: str | None = None
    estimated_cost_cents: int | None = Field(default=None, ge=0)
    currency: str | None = None
    estimated_hours: int | None = None
    justification: str | None = None
    skills_to_gain: list[str] | None = None
    linked_goal_id: str | None = None
    extra_data: dict | None = None


class CourseApprovalDecision(BaseModel):
    """Schema for approving or rejecting a request."""
    approved: bool
    reason: str | None = Field(default=None, max_length=1000)
    actual_cost_cents: int | None = Field(default=None, ge=0)


class CourseApprovalRequestResponse(CourseApprovalRequestBase):
    """Course approval request response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    requester_id: str
    approver_id: str | None = None
    status: ApprovalStatusEnum
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    decision_reason: str | None = None
    decided_by_id: str | None = None
    actual_cost_cents: int | None = None
    linked_goal_id: str | None = None
    budget_transaction_id: str | None = None
    extra_data: dict = {}
    created_at: datetime
    updated_at: datetime


class CourseApprovalRequestWithDetails(CourseApprovalRequestResponse):
    """Course approval request with user details."""
    requester_name: str = ""
    requester_email: str = ""
    approver_name: str | None = None
    approver_email: str | None = None
    decided_by_name: str | None = None
    decided_by_email: str | None = None
    linked_goal_title: str | None = None
    days_pending: int | None = None


# ==================== Learning Budget Schemas ====================

class LearningBudgetBase(BaseModel):
    """Base learning budget schema."""
    name: str = Field(max_length=255)
    description: str | None = None
    fiscal_year: int
    fiscal_quarter: int | None = Field(default=None, ge=1, le=4)
    budget_cents: int = Field(ge=0)
    currency: str = Field(default="USD", max_length=3)
    allow_overspend: bool = False
    overspend_limit_cents: int | None = Field(default=None, ge=0)
    auto_approve_under_cents: int | None = Field(default=None, ge=0)
    requires_manager_approval: bool = True


class LearningBudgetCreate(LearningBudgetBase):
    """Schema for creating a learning budget."""
    developer_id: str | None = None
    team_id: str | None = None
    extra_data: dict = {}


class LearningBudgetUpdate(BaseModel):
    """Schema for updating a learning budget."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    budget_cents: int | None = Field(default=None, ge=0)
    allow_overspend: bool | None = None
    overspend_limit_cents: int | None = None
    auto_approve_under_cents: int | None = None
    requires_manager_approval: bool | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class LearningBudgetAdjustment(BaseModel):
    """Schema for adjusting budget amount."""
    amount_cents: int  # Positive to add, negative to subtract
    reason: str = Field(min_length=5, max_length=500)


class LearningBudgetTransfer(BaseModel):
    """Schema for transferring budget between budgets."""
    source_budget_id: str
    target_budget_id: str
    amount_cents: int = Field(gt=0)
    reason: str = Field(min_length=5, max_length=500)


class LearningBudgetResponse(LearningBudgetBase):
    """Learning budget response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str | None = None
    team_id: str | None = None
    spent_cents: int
    reserved_cents: int
    is_active: bool
    extra_data: dict = {}
    created_at: datetime
    updated_at: datetime
    created_by_id: str | None = None


class LearningBudgetWithDetails(LearningBudgetResponse):
    """Learning budget with computed fields and details."""
    remaining_cents: int = 0
    utilization_percentage: float = 0.0
    developer_name: str | None = None
    developer_email: str | None = None
    team_name: str | None = None
    created_by_name: str | None = None
    total_transactions: int = 0
    pending_approvals_count: int = 0
    pending_approvals_total_cents: int = 0


# ==================== Budget Transaction Schemas ====================

class LearningBudgetTransactionCreate(BaseModel):
    """Schema for creating a budget transaction (internal use)."""
    budget_id: str
    transaction_type: TransactionTypeEnum
    amount_cents: int
    currency: str = Field(default="USD", max_length=3)
    description: str | None = None
    approval_request_id: str | None = None
    related_transaction_id: str | None = None
    extra_data: dict = {}


class LearningBudgetTransactionResponse(BaseModel):
    """Budget transaction response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    budget_id: str
    workspace_id: str
    transaction_type: TransactionTypeEnum
    amount_cents: int
    currency: str
    description: str | None = None
    approval_request_id: str | None = None
    related_transaction_id: str | None = None
    created_by_id: str | None = None
    balance_after_cents: int
    extra_data: dict = {}
    created_at: datetime


class LearningBudgetTransactionWithDetails(LearningBudgetTransactionResponse):
    """Budget transaction with additional details."""
    created_by_name: str | None = None
    created_by_email: str | None = None
    approval_request_title: str | None = None


# ==================== Manager Dashboard Schemas ====================

class TeamLearningProgress(BaseModel):
    """Team learning progress summary."""
    team_id: str
    team_name: str
    total_members: int
    members_with_goals: int
    total_goals: int
    completed_goals: int
    in_progress_goals: int
    overdue_goals: int
    goal_completion_rate: float = 0.0
    total_hours_spent: float = 0.0
    avg_hours_per_member: float = 0.0
    total_certifications_earned: int = 0
    compliance_rate: float = 0.0


class DeveloperLearningProgress(BaseModel):
    """Individual developer learning progress."""
    developer_id: str
    developer_name: str
    developer_email: str
    total_goals: int = 0
    completed_goals: int = 0
    in_progress_goals: int = 0
    overdue_goals: int = 0
    goal_completion_rate: float = 0.0
    hours_spent_this_period: float = 0.0
    certifications_earned: int = 0
    active_certifications: int = 0
    pending_approval_requests: int = 0
    budget_utilization_percentage: float = 0.0
    is_compliant: bool = True


class ManagerDashboardOverview(BaseModel):
    """Manager dashboard overview."""
    total_team_members: int = 0
    total_active_goals: int = 0
    goals_completed_this_period: int = 0
    goals_overdue: int = 0
    overall_goal_completion_rate: float = 0.0
    pending_approval_requests: int = 0
    total_budget_cents: int = 0
    spent_budget_cents: int = 0
    reserved_budget_cents: int = 0
    budget_utilization_percentage: float = 0.0
    team_compliance_rate: float = 0.0
    certifications_expiring_soon: int = 0


class ApprovalQueueItem(BaseModel):
    """Item in the approval queue."""
    request: CourseApprovalRequestWithDetails
    budget_available: bool = True
    budget_remaining_cents: int | None = None
    auto_approve_eligible: bool = False


class ApprovalQueue(BaseModel):
    """Manager's approval queue."""
    items: list[ApprovalQueueItem]
    total: int
    total_pending_cost_cents: int = 0


# ==================== Pagination & List Schemas ====================

class LearningGoalList(BaseModel):
    """Paginated list of learning goals."""
    items: list[LearningGoalWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class CourseApprovalRequestList(BaseModel):
    """Paginated list of course approval requests."""
    items: list[CourseApprovalRequestWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class LearningBudgetList(BaseModel):
    """Paginated list of learning budgets."""
    items: list[LearningBudgetWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class LearningBudgetTransactionList(BaseModel):
    """Paginated list of budget transactions."""
    items: list[LearningBudgetTransactionWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class TeamLearningProgressList(BaseModel):
    """List of team learning progress."""
    items: list[TeamLearningProgress]
    total: int


class DeveloperLearningProgressList(BaseModel):
    """Paginated list of developer learning progress."""
    items: list[DeveloperLearningProgress]
    total: int
    page: int
    page_size: int
    has_more: bool


# ==================== Filter Schemas ====================

class LearningGoalFilter(BaseModel):
    """Filter options for learning goals."""
    developer_id: str | None = None
    set_by_id: str | None = None
    goal_type: GoalTypeEnum | None = None
    status: GoalStatusEnum | None = None
    is_overdue: bool | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


class CourseApprovalRequestFilter(BaseModel):
    """Filter options for course approval requests."""
    requester_id: str | None = None
    approver_id: str | None = None
    request_type: ApprovalRequestTypeEnum | None = None
    status: ApprovalStatusEnum | None = None
    min_cost_cents: int | None = None
    max_cost_cents: int | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


class LearningBudgetFilter(BaseModel):
    """Filter options for learning budgets."""
    developer_id: str | None = None
    team_id: str | None = None
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
    is_active: bool | None = None


class BudgetTransactionFilter(BaseModel):
    """Filter options for budget transactions."""
    budget_id: str | None = None
    transaction_type: TransactionTypeEnum | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
