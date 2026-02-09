"""Analytics and reporting Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# Enums
class WidgetType(str, Enum):
    """Report widget types."""

    LINE_CHART = "line_chart"
    BAR_CHART = "bar_chart"
    PIE_CHART = "pie_chart"
    HEATMAP = "heatmap"
    TABLE = "table"
    KPI = "kpi"
    KPI_SINGLE = "kpi_single"
    KPI_TREND = "kpi_trend"
    SKILL_MATRIX = "skill_matrix"
    NETWORK_GRAPH = "network_graph"
    NETWORK = "network"
    GAUGE = "gauge"


class MetricType(str, Enum):
    """Available metric types for analytics."""

    COMMITS = "commits"
    PULL_REQUESTS = "prs"
    PRS_MERGED = "prs_merged"
    CODE_REVIEWS = "reviews"
    REVIEWS_GIVEN = "reviews_given"
    VELOCITY = "velocity"
    SKILL_GROWTH = "skill_growth"
    SKILL_COVERAGE = "skill_coverage"
    WORKLOAD = "workload"
    COLLABORATION = "collaboration"
    REVIEW_TURNAROUND = "review_turnaround"
    CODE_QUALITY = "code_quality"
    CODE_COMPLEXITY = "code_complexity"
    BUS_FACTOR = "bus_factor"
    TEAM_HEALTH = "team_health"
    ATTRITION_RISK = "attrition_risk"
    ACTIVITY = "activity"


class ScheduleFrequency(str, Enum):
    """Report schedule frequency."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class DeliveryMethod(str, Enum):
    """Report delivery method."""

    EMAIL = "email"
    SLACK = "slack"
    BOTH = "both"


class ExportFormat(str, Enum):
    """Export file format."""

    PDF = "pdf"
    CSV = "csv"
    XLSX = "xlsx"
    JSON = "json"


class ExportType(str, Enum):
    """Type of content to export."""

    REPORT = "report"
    DEVELOPER_PROFILE = "developer_profile"
    TEAM_ANALYTICS = "team_analytics"
    SPRINT_TASKS = "sprint_tasks"
    SPRINT_REPORT = "sprint_report"
    PROJECT_BACKLOG = "project_backlog"


class ExportStatus(str, Enum):
    """Export job status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class InsightType(str, Enum):
    """Predictive insight types."""

    ATTRITION_RISK = "attrition_risk"
    BURNOUT_RISK = "burnout_risk"
    PERFORMANCE_TRAJECTORY = "performance_trajectory"
    TEAM_HEALTH = "team_health"
    SKILL_GAPS = "skill_gaps"


class RiskLevel(str, Enum):
    """Risk level classification."""

    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class Trajectory(str, Enum):
    """Performance trajectory types."""

    ACCELERATING = "accelerating"
    STEADY = "steady"
    PLATEAUING = "plateauing"
    DECLINING = "declining"


class HealthGrade(str, Enum):
    """Team health grade."""

    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


# Widget schemas
class WidgetPosition(BaseModel):
    """Widget position in report layout."""

    x: int = 0
    y: int = 0
    width: int = 6
    height: int = 4


class WidgetConfig(BaseModel):
    """Configuration for a report widget."""

    id: str
    type: WidgetType
    title: str
    metric: MetricType | None = None
    config: dict = {}
    position: WidgetPosition = WidgetPosition()


class ReportFilters(BaseModel):
    """Report filter configuration."""

    date_range_days: int = 30
    team_ids: list[str] = []
    developer_ids: list[str] = []
    skills: list[str] = []


class ReportLayout(BaseModel):
    """Report layout configuration."""

    columns: int = 12
    row_height: int = 50


# Report CRUD schemas
class CustomReportBase(BaseModel):
    """Base custom report schema."""

    name: str
    description: str | None = None
    widgets: list[WidgetConfig] = []
    filters: ReportFilters = ReportFilters()
    layout: ReportLayout = ReportLayout()
    is_template: bool = False
    is_public: bool = False


class CustomReportCreate(CustomReportBase):
    """Create custom report request."""

    pass


class CustomReportUpdate(BaseModel):
    """Update custom report request."""

    name: str | None = None
    description: str | None = None
    widgets: list[WidgetConfig] | None = None
    filters: ReportFilters | None = None
    layout: ReportLayout | None = None
    is_public: bool | None = None


class CustomReportResponse(CustomReportBase):
    """Custom report response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    creator_id: str
    organization_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ReportTemplateResponse(BaseModel):
    """Report template response."""

    id: str
    name: str
    description: str | None = None
    widgets: list[WidgetConfig]
    preview_url: str | None = None


# Scheduled report schemas
class ScheduledReportCreate(BaseModel):
    """Create scheduled report request."""

    report_id: str
    schedule: ScheduleFrequency
    day_of_week: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=31)
    time_utc: str = "09:00"  # HH:MM format
    recipients: list[str] = []
    delivery_method: DeliveryMethod = DeliveryMethod.EMAIL
    export_format: ExportFormat = ExportFormat.PDF


class ScheduledReportUpdate(BaseModel):
    """Update scheduled report request."""

    schedule: ScheduleFrequency | None = None
    day_of_week: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=31)
    time_utc: str | None = None
    recipients: list[str] | None = None
    delivery_method: DeliveryMethod | None = None
    export_format: ExportFormat | None = None
    is_active: bool | None = None


class ScheduledReportResponse(BaseModel):
    """Scheduled report response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    report_id: str
    schedule: str
    day_of_week: int | None = None
    day_of_month: int | None = None
    time_utc: str
    recipients: list[str]
    delivery_method: str
    export_format: str
    is_active: bool
    last_sent_at: datetime | None = None
    next_run_at: datetime


# Export schemas
class ExportRequest(BaseModel):
    """Request to create an export job."""

    export_type: ExportType
    format: ExportFormat
    config: dict = {}  # Type-specific configuration


class ExportJobResponse(BaseModel):
    """Export job response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    export_type: str
    format: str
    status: str
    file_path: str | None = None
    file_size_bytes: int | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime


# Analytics data schemas
class DateRange(BaseModel):
    """Date range for analytics queries."""

    start_date: datetime
    end_date: datetime


class SkillHeatmapCell(BaseModel):
    """Single cell in skill heatmap."""

    developer_id: str
    developer_name: str
    skill: str
    proficiency: int = Field(ge=0, le=100)
    trend: str | None = None  # "growing", "stable", "declining"


class SkillHeatmapData(BaseModel):
    """Skill heatmap data response."""

    developers: list[dict]  # [{id, name, avatar_url}]
    skills: list[str]
    cells: list[SkillHeatmapCell]
    generated_at: datetime


class ActivityHeatmapData(BaseModel):
    """Activity heatmap (contribution graph style)."""

    developer_id: str
    data: list[dict]  # [{date, count, level}]
    max_count: int
    total_days: int


class ProductivityMetric(BaseModel):
    """Single productivity data point."""

    date: datetime
    commits: int = 0
    prs_opened: int = 0
    prs_merged: int = 0
    reviews_given: int = 0
    lines_added: int = 0
    lines_removed: int = 0


class ProductivityTrends(BaseModel):
    """Productivity trends response."""

    developer_id: str | None = None  # Null for team
    data: list[ProductivityMetric]
    summary: dict  # Aggregated stats


class WorkloadItem(BaseModel):
    """Workload distribution for a developer."""

    developer_id: str
    developer_name: str
    active_prs: int
    pending_reviews: int
    recent_commits: int
    workload_score: float = Field(ge=0, le=1)


class WorkloadDistribution(BaseModel):
    """Team workload distribution response."""

    items: list[WorkloadItem]
    total_workload: float
    average_workload: float
    imbalance_score: float = Field(ge=0, le=1)  # 0 = balanced, 1 = highly imbalanced


class CollaborationEdge(BaseModel):
    """Collaboration between two developers."""

    source_id: str
    target_id: str
    weight: float  # Collaboration strength
    interactions: int  # Total interactions


class CollaborationGraph(BaseModel):
    """Collaboration network graph."""

    nodes: list[dict]  # [{id, name, avatar_url, degree}]
    edges: list[CollaborationEdge]
    density: float  # Graph density


# Predictive insights schemas
class RiskFactor(BaseModel):
    """Individual risk factor in predictive analysis."""

    factor: str
    weight: float = Field(ge=0, le=1)
    evidence: str
    trend: str | None = None  # "improving", "stable", "declining"


class AttritionRiskAnalysis(BaseModel):
    """Attrition risk analysis result."""

    developer_id: str
    risk_score: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    factors: list[RiskFactor]
    positive_signals: list[str]
    recommendations: list[str]
    suggested_actions: list[str]
    analyzed_at: datetime


class BurnoutRiskAssessment(BaseModel):
    """Burnout risk assessment result."""

    developer_id: str
    risk_score: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    indicators: list[str]
    factors: list[RiskFactor]
    recommendations: list[str]
    analyzed_at: datetime


class SkillGrowthPrediction(BaseModel):
    """Predicted skill growth."""

    skill: str
    current: int = Field(ge=0, le=100)
    predicted: int = Field(ge=0, le=100)
    timeline: str


class CareerReadiness(BaseModel):
    """Career readiness assessment."""

    next_level: str
    readiness_score: float = Field(ge=0, le=1)
    blockers: list[str]


class PerformanceTrajectory(BaseModel):
    """Performance trajectory prediction."""

    developer_id: str
    trajectory: Trajectory
    confidence: float = Field(ge=0, le=1)
    predicted_growth: list[SkillGrowthPrediction]
    challenges: list[str]
    opportunities: list[str]
    career_readiness: CareerReadiness
    recommendations: list[str]
    analyzed_at: datetime


class TeamRisk(BaseModel):
    """Team-level risk item."""

    risk: str
    severity: RiskLevel
    mitigation: str


class CapacityAssessment(BaseModel):
    """Team capacity assessment."""

    current_utilization: float = Field(ge=0, le=1)
    sustainable_velocity: bool
    bottlenecks: list[str]


class TeamHealthAnalysis(BaseModel):
    """Team health assessment result."""

    team_id: str | None = None
    health_score: float = Field(ge=0, le=1)
    health_grade: HealthGrade
    strengths: list[str]
    risks: list[TeamRisk]
    capacity_assessment: CapacityAssessment
    recommendations: list[str]
    suggested_hires: list[str]
    analyzed_at: datetime


class PredictiveInsightResponse(BaseModel):
    """Generic predictive insight response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str | None = None
    team_id: str | None = None
    insight_type: str
    risk_score: float
    confidence: float
    risk_level: str | None = None
    factors: list[dict]
    recommendations: list[str]
    data_window_days: int
    generated_by_model: str
    generated_at: datetime
    expires_at: datetime


# Request schemas for analytics endpoints
class SkillHeatmapRequest(BaseModel):
    """Request for skill heatmap generation."""

    developer_ids: list[str]
    skills: list[str] | None = None  # None = auto-detect top skills


class ProductivityRequest(BaseModel):
    """Request for productivity trends."""

    developer_ids: list[str]
    date_range: DateRange
    metrics: list[MetricType] = [MetricType.COMMITS, MetricType.PULL_REQUESTS, MetricType.CODE_REVIEWS]


class WorkloadRequest(BaseModel):
    """Request for workload distribution."""

    developer_ids: list[str]


class CollaborationRequest(BaseModel):
    """Request for collaboration network."""

    developer_ids: list[str]
    date_range_days: int = 90


class TeamHealthRequest(BaseModel):
    """Request for team health analysis."""

    developer_ids: list[str]
    include_predictions: bool = True


# Workspace GitHub Analytics schemas

class MemberActivityDay(BaseModel):
    """Daily activity data point for a member."""

    date: str
    commits: int = 0
    prs: int = 0


class MemberRepoStat(BaseModel):
    """Repository-level stats for a member."""

    repository: str
    commits: int = 0
    prs: int = 0
    additions: int = 0
    deletions: int = 0


class MemberGitHubStats(BaseModel):
    """GitHub statistics for a single workspace member."""

    developer_id: str
    name: str
    email: str
    avatar_url: str | None = None
    commits: int = 0
    prs_created: int = 0
    prs_merged: int = 0
    reviews_given: int = 0
    additions: int = 0
    deletions: int = 0
    top_repositories: list[MemberRepoStat] = []
    last_commit_at: datetime | None = None
    activity_trend: list[MemberActivityDay] = []


class TeamActivityDay(BaseModel):
    """Daily activity data point for the team."""

    date: str
    commits: int = 0
    prs_opened: int = 0
    prs_merged: int = 0
    reviews: int = 0


class TopRepoStat(BaseModel):
    """Top repository stats for the workspace."""

    repository: str
    commits: int = 0
    prs: int = 0
    contributors: int = 0


class GitHubAnalyticsSummary(BaseModel):
    """Summary statistics for workspace GitHub analytics."""

    total_commits: int = 0
    total_prs: int = 0
    total_prs_merged: int = 0
    total_reviews: int = 0
    total_additions: int = 0
    total_deletions: int = 0
    active_contributors: int = 0
    top_repositories: list[TopRepoStat] = []


class WorkspaceGitHubAnalytics(BaseModel):
    """Full workspace GitHub analytics response."""

    summary: GitHubAnalyticsSummary
    members: list[MemberGitHubStats]
    activity_timeline: list[TeamActivityDay] = []
    period_days: int = 30
    generated_at: datetime
