"""Learning analytics and reporting Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ==================== Enums ====================

class SnapshotTypeEnum(str, Enum):
    """Types of analytics snapshots."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class ReportTypeEnum(str, Enum):
    """Types of learning reports."""
    EXECUTIVE_SUMMARY = "executive_summary"
    TEAM_PROGRESS = "team_progress"
    INDIVIDUAL_PROGRESS = "individual_progress"
    COMPLIANCE_STATUS = "compliance_status"
    BUDGET_UTILIZATION = "budget_utilization"
    SKILL_GAP_ANALYSIS = "skill_gap_analysis"
    ROI_ANALYSIS = "roi_analysis"
    CERTIFICATION_TRACKING = "certification_tracking"
    CUSTOM = "custom"


class ReportScheduleFrequencyEnum(str, Enum):
    """Report schedule frequencies."""
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class ReportRunStatusEnum(str, Enum):
    """Report run status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExportFormatEnum(str, Enum):
    """Export file formats."""
    PDF = "pdf"
    CSV = "csv"
    XLSX = "xlsx"


# ==================== Analytics Snapshot Schemas ====================

class AnalyticsSnapshotMetrics(BaseModel):
    """Standard metrics structure for snapshots."""
    learning_hours: float = 0.0
    courses_completed: int = 0
    certifications_earned: int = 0
    active_learners: int = 0
    goal_completion_rate: float = 0.0
    compliance_rate: float = 0.0
    budget_utilization: float = 0.0
    avg_progress_percentage: float = 0.0
    overdue_goals: int = 0
    pending_approvals: int = 0
    skill_distribution: dict[str, int] = {}
    completion_by_type: dict[str, int] = {}


class AnalyticsSnapshotResponse(BaseModel):
    """Analytics snapshot response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    snapshot_date: datetime
    snapshot_type: SnapshotTypeEnum
    team_id: str | None = None
    developer_id: str | None = None
    metrics: dict
    comparison_metrics: dict | None = None
    created_at: datetime


# ==================== Executive Dashboard Schemas ====================

class ExecutiveDashboardMetrics(BaseModel):
    """Executive dashboard metrics."""
    # Learning Activity
    total_learning_hours: float = 0.0
    learning_hours_change: float = 0.0  # % change from previous period
    active_learners: int = 0
    active_learners_change: float = 0.0

    # Completion
    courses_completed: int = 0
    courses_completed_change: float = 0.0
    certifications_earned: int = 0
    certifications_earned_change: float = 0.0

    # Goals
    total_goals: int = 0
    completed_goals: int = 0
    goal_completion_rate: float = 0.0
    overdue_goals: int = 0

    # Compliance
    compliance_rate: float = 0.0
    compliance_rate_change: float = 0.0
    non_compliant_count: int = 0

    # Budget
    total_budget_cents: int = 0
    spent_budget_cents: int = 0
    budget_utilization: float = 0.0


class TrendDataPoint(BaseModel):
    """Single data point for trend charts."""
    date: str
    value: float


class LearningTrends(BaseModel):
    """Learning trends over time."""
    learning_hours: list[TrendDataPoint] = []
    courses_completed: list[TrendDataPoint] = []
    active_learners: list[TrendDataPoint] = []
    goal_completion_rate: list[TrendDataPoint] = []


class SkillGapEntry(BaseModel):
    """Single entry in skill gap analysis."""
    skill_name: str
    required_count: int = 0
    current_count: int = 0
    gap_percentage: float = 0.0
    in_progress_count: int = 0


class SkillGapAnalysis(BaseModel):
    """Skill gap analysis results."""
    skills: list[SkillGapEntry] = []
    total_gaps: int = 0
    critical_gaps: int = 0  # Gaps > 50%


class TeamPerformanceEntry(BaseModel):
    """Team performance entry for comparison."""
    team_id: str
    team_name: str
    learning_hours: float = 0.0
    courses_completed: int = 0
    goal_completion_rate: float = 0.0
    compliance_rate: float = 0.0
    budget_utilization: float = 0.0


class TeamPerformanceComparison(BaseModel):
    """Team performance comparison."""
    teams: list[TeamPerformanceEntry] = []
    workspace_average: dict[str, float] = {}


class ROIMetrics(BaseModel):
    """Return on investment metrics."""
    total_investment_cents: int = 0
    total_courses_completed: int = 0
    total_certifications_earned: int = 0
    cost_per_course_cents: int = 0
    cost_per_certification_cents: int = 0
    estimated_value_generated_cents: int = 0  # Based on skill acquisition
    roi_percentage: float = 0.0


class ExecutiveDashboard(BaseModel):
    """Complete executive dashboard data."""
    metrics: ExecutiveDashboardMetrics
    trends: LearningTrends
    skill_gaps: SkillGapAnalysis
    team_comparison: TeamPerformanceComparison
    roi: ROIMetrics
    period_start: datetime
    period_end: datetime


# ==================== Report Definition Schemas ====================

class ReportDateRange(BaseModel):
    """Date range configuration for reports."""
    type: str = "last_30_days"  # "last_7_days", "last_30_days", "last_90_days", "custom"
    start_date: datetime | None = None
    end_date: datetime | None = None


class ReportFilters(BaseModel):
    """Filters for report data."""
    team_ids: list[str] = []
    developer_ids: list[str] = []
    goal_types: list[str] = []
    include_inactive: bool = False


class ReportConfig(BaseModel):
    """Report configuration."""
    date_range: ReportDateRange = ReportDateRange()
    filters: ReportFilters = ReportFilters()
    metrics: list[str] = []  # Specific metrics to include
    group_by: str | None = None  # "team", "developer", "goal_type", etc.
    include_charts: bool = True
    include_raw_data: bool = False


class ReportDefinitionCreate(BaseModel):
    """Schema for creating a report definition."""
    name: str = Field(max_length=255)
    description: str | None = None
    report_type: ReportTypeEnum
    config: ReportConfig = ReportConfig()
    is_scheduled: bool = False
    schedule_frequency: ReportScheduleFrequencyEnum | None = None
    schedule_day: int | None = Field(default=None, ge=0, le=31)
    schedule_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    recipients: list[str] = []
    export_format: ExportFormatEnum = ExportFormatEnum.PDF
    extra_data: dict = {}


class ReportDefinitionUpdate(BaseModel):
    """Schema for updating a report definition."""
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    report_type: ReportTypeEnum | None = None
    config: ReportConfig | None = None
    is_scheduled: bool | None = None
    schedule_frequency: ReportScheduleFrequencyEnum | None = None
    schedule_day: int | None = None
    schedule_time: str | None = None
    recipients: list[str] | None = None
    export_format: ExportFormatEnum | None = None
    is_active: bool | None = None
    extra_data: dict | None = None


class ReportDefinitionResponse(BaseModel):
    """Report definition response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_by_id: str | None = None
    name: str
    description: str | None = None
    report_type: ReportTypeEnum
    config: dict
    is_scheduled: bool
    schedule_frequency: ReportScheduleFrequencyEnum | None = None
    schedule_day: int | None = None
    schedule_time: str | None = None
    next_run_at: datetime | None = None
    recipients: list[str]
    export_format: str
    is_active: bool
    extra_data: dict
    created_at: datetime
    updated_at: datetime


class ReportDefinitionWithDetails(ReportDefinitionResponse):
    """Report definition with additional details."""
    created_by_name: str | None = None
    created_by_email: str | None = None
    last_run_at: datetime | None = None
    last_run_status: ReportRunStatusEnum | None = None
    total_runs: int = 0


# ==================== Report Run Schemas ====================

class ReportRunResponse(BaseModel):
    """Report run response schema."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    report_definition_id: str
    workspace_id: str
    status: ReportRunStatusEnum
    triggered_by: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result_file_path: str | None = None
    result_file_size_bytes: int | None = None
    result_file_format: str | None = None
    metrics_summary: dict | None = None
    error_message: str | None = None
    extra_data: dict
    created_at: datetime


class ReportRunWithDetails(ReportRunResponse):
    """Report run with additional details."""
    report_name: str = ""
    report_type: ReportTypeEnum | None = None
    duration_seconds: int | None = None


class ReportRunRequest(BaseModel):
    """Request to trigger a report run."""
    report_definition_id: str
    config_overrides: ReportConfig | None = None  # Optional overrides


# ==================== Completion Rate Schemas ====================

class CompletionRateEntry(BaseModel):
    """Completion rate entry for a period."""
    period: str  # e.g., "2024-01", "Week 1", etc.
    total: int
    completed: int
    rate: float


class CompletionRateReport(BaseModel):
    """Completion rate report."""
    entries: list[CompletionRateEntry]
    overall_rate: float
    period_type: str  # "daily", "weekly", "monthly"


# ==================== Pagination & List Schemas ====================

class AnalyticsSnapshotList(BaseModel):
    """Paginated list of analytics snapshots."""
    items: list[AnalyticsSnapshotResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class ReportDefinitionList(BaseModel):
    """Paginated list of report definitions."""
    items: list[ReportDefinitionWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


class ReportRunList(BaseModel):
    """Paginated list of report runs."""
    items: list[ReportRunWithDetails]
    total: int
    page: int
    page_size: int
    has_more: bool


# ==================== Filter Schemas ====================

class AnalyticsSnapshotFilter(BaseModel):
    """Filter options for analytics snapshots."""
    snapshot_type: SnapshotTypeEnum | None = None
    team_id: str | None = None
    developer_id: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None


class ReportDefinitionFilter(BaseModel):
    """Filter options for report definitions."""
    report_type: ReportTypeEnum | None = None
    is_scheduled: bool | None = None
    is_active: bool | None = None
    created_by_id: str | None = None


class ReportRunFilter(BaseModel):
    """Filter options for report runs."""
    report_definition_id: str | None = None
    status: ReportRunStatusEnum | None = None
    triggered_by: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
