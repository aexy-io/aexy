"""Pydantic schemas for the Developer Insights module."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PeriodTypeParam(str, Enum):
    daily = "daily"
    weekly = "weekly"
    sprint = "sprint"
    monthly = "monthly"


# ---------------------------------------------------------------------------
# Metric sub-schemas
# ---------------------------------------------------------------------------

class VelocityMetrics(BaseModel):
    commits_count: int = 0
    prs_merged: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    net_lines: int = 0
    commit_frequency: float = Field(0.0, description="Commits per working day")
    pr_throughput: float = Field(0.0, description="PRs merged per week")
    avg_commit_size: float = Field(0.0, description="Lines changed per commit")


class EfficiencyMetrics(BaseModel):
    avg_pr_cycle_time_hours: float = Field(0.0, description="Created → merged in hours")
    avg_time_to_first_review_hours: float = Field(0.0, description="PR created → first review in hours")
    avg_pr_size: float = Field(0.0, description="Additions + deletions per PR")
    pr_merge_rate: float = Field(0.0, ge=0, le=1, description="Merged / total PRs")
    first_commit_to_merge_hours: float = 0.0
    rework_ratio: float = Field(0.0, ge=0, le=1, description="PRs with >1 changes_requested / total")


class QualityMetrics(BaseModel):
    review_participation_rate: float = Field(0.0, description="Reviews per working day")
    avg_review_depth: float = Field(0.0, description="Comments per review")
    review_turnaround_hours: float = 0.0
    self_merge_rate: float = Field(0.0, ge=0, le=1)


class SustainabilityMetrics(BaseModel):
    weekend_commit_ratio: float = Field(0.0, ge=0, le=1)
    late_night_commit_ratio: float = Field(0.0, ge=0, le=1, description="Commits after 10pm")
    longest_streak_days: int = 0
    avg_daily_active_hours: float = 0.0
    focus_score: float = Field(0.0, ge=0, le=1, description="HHI across repos")


class CollaborationMetrics(BaseModel):
    unique_collaborators: int = 0
    cross_team_pr_ratio: float = Field(0.0, ge=0, le=1)
    review_given_count: int = 0
    review_received_count: int = 0
    knowledge_sharing_score: float = Field(0.0, ge=0, le=1)


class SprintProductivityMetrics(BaseModel):
    tasks_assigned: int = 0
    tasks_completed: int = 0
    story_points_committed: int = 0
    story_points_completed: int = 0
    task_completion_rate: float = Field(0.0, ge=0, le=1)
    avg_cycle_time_hours: float = 0.0
    avg_lead_time_hours: float = 0.0
    sprints_participated: int = 0
    carry_over_tasks: int = 0
    task_type_distribution: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Team metric sub-schemas
# ---------------------------------------------------------------------------

class MemberSummary(BaseModel):
    developer_id: str
    developer_name: str | None = None
    commits_count: int = 0
    prs_merged: int = 0
    lines_changed: int = 0
    reviews_given: int = 0


class TeamDistribution(BaseModel):
    gini_coefficient: float = Field(0.0, ge=0, le=1, description="0=equal, 1=unequal")
    top_contributor_share: float = Field(0.0, ge=0, le=1)
    member_metrics: list[MemberSummary] = []
    bottleneck_developers: list[str] = []


class TeamAggregate(BaseModel):
    total_commits: int = 0
    total_prs_merged: int = 0
    total_lines_changed: int = 0
    total_reviews: int = 0
    avg_commits_per_member: float = 0.0
    avg_prs_per_member: float = 0.0


# ---------------------------------------------------------------------------
# Query params
# ---------------------------------------------------------------------------

class InsightsQueryParams(BaseModel):
    period_type: PeriodTypeParam = PeriodTypeParam.weekly
    start_date: datetime | None = None
    end_date: datetime | None = None
    compare_previous: bool = False


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class DeveloperInsightsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    developer_id: str
    workspace_id: str
    period_start: datetime
    period_end: datetime
    period_type: str

    velocity: VelocityMetrics
    efficiency: EfficiencyMetrics
    quality: QualityMetrics
    sustainability: SustainabilityMetrics
    collaboration: CollaborationMetrics
    sprint: SprintProductivityMetrics | None = None

    raw_counts: dict | None = None
    computed_at: datetime | None = None

    # Optional previous period for comparison
    previous: "DeveloperInsightsResponse | None" = None


class DeveloperSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    workspace_id: str
    period_start: datetime
    period_end: datetime
    period_type: str
    velocity_metrics: dict | None = None
    efficiency_metrics: dict | None = None
    quality_metrics: dict | None = None
    sustainability_metrics: dict | None = None
    collaboration_metrics: dict | None = None
    raw_counts: dict | None = None
    computed_at: datetime | None = None


class TeamInsightsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workspace_id: str
    team_id: str | None = None
    period_start: datetime
    period_end: datetime
    period_type: str
    member_count: int = 0
    aggregate: TeamAggregate
    distribution: TeamDistribution
    computed_at: datetime | None = None


class TeamSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    team_id: str | None = None
    period_start: datetime
    period_end: datetime
    period_type: str
    aggregate_metrics: dict | None = None
    distribution_metrics: dict | None = None
    member_count: int = 0
    computed_at: datetime | None = None


class LeaderboardEntry(BaseModel):
    developer_id: str
    developer_name: str | None = None
    value: float = 0.0
    rank: int = 0


class LeaderboardResponse(BaseModel):
    metric: str
    period_type: str
    period_start: datetime
    period_end: datetime
    entries: list[LeaderboardEntry] = []


class SnapshotGenerateRequest(BaseModel):
    period_type: PeriodTypeParam = PeriodTypeParam.weekly
    start_date: datetime
    end_date: datetime
    developer_ids: list[str] | None = None
    team_id: str | None = None


class SnapshotGenerateResponse(BaseModel):
    developer_snapshots_created: int = 0
    team_snapshot_created: bool = False


# ---------------------------------------------------------------------------
# Settings schemas
# ---------------------------------------------------------------------------

class WorkingHoursConfig(BaseModel):
    start_hour: int = Field(9, ge=0, le=23)
    end_hour: int = Field(18, ge=0, le=23)
    timezone: str = "UTC"
    late_night_threshold_hour: int = Field(22, ge=0, le=23)


class HealthScoreWeights(BaseModel):
    velocity: float = Field(0.2, ge=0, le=1)
    efficiency: float = Field(0.2, ge=0, le=1)
    quality: float = Field(0.2, ge=0, le=1)
    sustainability: float = Field(0.2, ge=0, le=1)
    collaboration: float = Field(0.2, ge=0, le=1)


class InsightSettingsCreate(BaseModel):
    team_id: str | None = None
    working_hours: WorkingHoursConfig | None = None
    health_score_weights: HealthScoreWeights | None = None
    bottleneck_multiplier: float = Field(2.0, ge=1.0, le=10.0)
    auto_generate_snapshots: bool = False
    snapshot_frequency: str = Field("daily", pattern="^(daily|weekly)$")


class InsightSettingsUpdate(BaseModel):
    working_hours: WorkingHoursConfig | None = None
    health_score_weights: HealthScoreWeights | None = None
    bottleneck_multiplier: float | None = Field(None, ge=1.0, le=10.0)
    auto_generate_snapshots: bool | None = None
    snapshot_frequency: str | None = Field(None, pattern="^(daily|weekly)$")


class InsightSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    team_id: str | None = None
    working_hours: dict | None = None
    health_score_weights: dict | None = None
    bottleneck_multiplier: float = 2.0
    auto_generate_snapshots: bool = False
    snapshot_frequency: str = "daily"
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Developer working schedule schemas
# ---------------------------------------------------------------------------

class DeveloperWorkingScheduleCreate(BaseModel):
    timezone: str = "UTC"
    start_hour: int = Field(9, ge=0, le=23)
    end_hour: int = Field(18, ge=0, le=23)
    working_days: list[int] = Field(default=[0, 1, 2, 3, 4], description="0=Mon..6=Sun")
    late_night_threshold_hour: int = Field(22, ge=0, le=23)
    engineering_role: str | None = Field(None, description="junior|mid|senior|staff|principal|lead|architect")


class DeveloperWorkingScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    workspace_id: str
    timezone: str = "UTC"
    start_hour: int = 9
    end_hour: int = 18
    working_days: list[int] | None = None
    late_night_threshold_hour: int = 22
    engineering_role: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Alert rule schemas
# ---------------------------------------------------------------------------

class AlertRuleCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = None
    metric_category: str = Field(..., description="velocity, efficiency, quality, sustainability, collaboration, team")
    metric_name: str = Field(..., max_length=100)
    condition_operator: str = Field(..., pattern="^(gt|lt|gte|lte|eq|change_pct)$")
    condition_value: float
    scope_type: str = Field("team", pattern="^(team|developer|workspace)$")
    scope_id: str | None = None
    severity: str = Field("warning", pattern="^(info|warning|critical)$")
    notification_channels: list[str] | None = None
    is_active: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    description: str | None = None
    condition_operator: str | None = Field(None, pattern="^(gt|lt|gte|lte|eq|change_pct)$")
    condition_value: float | None = None
    severity: str | None = Field(None, pattern="^(info|warning|critical)$")
    notification_channels: list[str] | None = None
    is_active: bool | None = None


class AlertRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_by_id: str
    name: str
    description: str | None = None
    metric_category: str
    metric_name: str
    condition_operator: str
    condition_value: float
    scope_type: str
    scope_id: str | None = None
    severity: str
    notification_channels: list[str] | None = None
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AlertHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_id: str
    workspace_id: str
    developer_id: str | None = None
    team_id: str | None = None
    metric_value: float
    threshold_value: float
    severity: str
    status: str
    message: str | None = None
    acknowledged_by_id: str | None = None
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    triggered_at: datetime | None = None


# ---------------------------------------------------------------------------
# Report schedule schemas
# ---------------------------------------------------------------------------

class ReportScheduleCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = None
    report_type: str = Field("team_weekly", pattern="^(team_weekly|developer_monthly|executive_monthly|custom)$")
    config: dict | None = None
    frequency: str = Field("weekly", pattern="^(daily|weekly|biweekly|monthly)$")
    day_of_week: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=31)
    time_utc: str = Field("09:00", pattern="^[0-2][0-9]:[0-5][0-9]$")
    recipients: list[str] | None = None
    export_format: str = Field("pdf", pattern="^(pdf|csv|xlsx)$")


class ReportScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_by_id: str
    name: str
    description: str | None = None
    report_type: str
    config: dict | None = None
    frequency: str
    day_of_week: int | None = None
    day_of_month: int | None = None
    time_utc: str = "09:00"
    recipients: list[str] | None = None
    export_format: str = "pdf"
    is_active: bool = True
    last_sent_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Saved dashboard schemas
# ---------------------------------------------------------------------------

class SavedDashboardCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = None
    layout: dict | None = None
    widgets: list[dict] | None = None
    default_period_type: str = Field("weekly", pattern="^(daily|weekly|sprint|monthly)$")
    default_team_id: str | None = None
    is_shared: bool = False


class SavedDashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_by_id: str
    name: str
    description: str | None = None
    layout: dict | None = None
    widgets: list[dict] | None = None
    default_period_type: str = "weekly"
    default_team_id: str | None = None
    is_default: bool = False
    is_shared: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Repository Insights schemas
# ---------------------------------------------------------------------------

class RepositoryContributor(BaseModel):
    developer_id: str
    developer_name: str | None = None
    commits_count: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    is_workspace_member: bool = True


class RepositoryInsightsSummary(BaseModel):
    repository: str
    commits_count: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    prs_count: int = 0
    prs_merged: int = 0
    reviews_count: int = 0
    unique_contributors: int = 0
    top_contributors: list[RepositoryContributor] = []
    language: str | None = None
    is_private: bool = False


class RepositoryInsightsListResponse(BaseModel):
    repositories: list[RepositoryInsightsSummary] = []
    total_repositories: int = 0
    period_type: str
    period_start: datetime
    period_end: datetime


class RepositoryDeveloperBreakdown(BaseModel):
    developer_id: str
    developer_name: str | None = None
    commits_count: int = 0
    prs_merged: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    lines_changed: int = 0
    reviews_given: int = 0
    is_workspace_member: bool = True


class RepositoryDetailResponse(BaseModel):
    repository: str
    aggregate: RepositoryInsightsSummary
    developer_breakdown: list[RepositoryDeveloperBreakdown] = []
    period_type: str
    period_start: datetime
    period_end: datetime


class RepositorySyncInfo(BaseModel):
    repository_id: str
    repository_full_name: str
    is_enabled: bool = False
    sync_status: str = "pending"
    last_sync_at: datetime | None = None
    sync_error: str | None = None
    commits_synced: int = 0
    prs_synced: int = 0
    reviews_synced: int = 0


class DeveloperSyncStatus(BaseModel):
    developer_id: str
    developer_name: str | None = None
    repositories: list[RepositorySyncInfo] = []
    is_workspace_member: bool = True


class SyncStatusResponse(BaseModel):
    developers: list[DeveloperSyncStatus] = []
    total_developers: int = 0
