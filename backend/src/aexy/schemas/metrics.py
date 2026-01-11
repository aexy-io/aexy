"""Advanced metrics related Pydantic schemas."""

from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Metric Types
PeriodType = Literal["week", "month", "quarter"]
ItemType = Literal["story", "task", "bug"]


# ==================== Flow Metrics ====================

class CycleTimeDataPoint(BaseModel):
    """Schema for cycle time data point."""

    date: str
    avg_hours: float
    count: int


class CycleTimeResponse(BaseModel):
    """Schema for cycle time metrics."""

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    item_type: ItemType
    # Stats
    avg_cycle_time_hours: float | None = None
    min_cycle_time_hours: float | None = None
    max_cycle_time_hours: float | None = None
    median_cycle_time_hours: float | None = None
    sample_count: int = 0
    # Trend data
    data_points: list[CycleTimeDataPoint] = Field(default_factory=list)


class LeadTimeDataPoint(BaseModel):
    """Schema for lead time data point."""

    date: str
    avg_hours: float
    count: int


class LeadTimeResponse(BaseModel):
    """Schema for lead time metrics."""

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    item_type: ItemType
    # Stats
    avg_lead_time_hours: float | None = None
    min_lead_time_hours: float | None = None
    max_lead_time_hours: float | None = None
    median_lead_time_hours: float | None = None
    sample_count: int = 0
    # Trend data
    data_points: list[LeadTimeDataPoint] = Field(default_factory=list)


class ThroughputDataPoint(BaseModel):
    """Schema for throughput data point."""

    date: str
    stories_completed: int = 0
    tasks_completed: int = 0
    bugs_closed: int = 0
    story_points_completed: int = 0


class ThroughputResponse(BaseModel):
    """Schema for throughput metrics."""

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    # Totals
    total_stories: int = 0
    total_tasks: int = 0
    total_bugs: int = 0
    total_story_points: int = 0
    # Averages per day/week
    avg_stories_per_week: float = 0.0
    avg_tasks_per_week: float = 0.0
    avg_points_per_week: float = 0.0
    # Trend data
    data_points: list[ThroughputDataPoint] = Field(default_factory=list)


# ==================== WIP Metrics ====================

class WIPDataPoint(BaseModel):
    """Schema for WIP data point."""

    date: str
    stories_in_progress: int = 0
    tasks_in_progress: int = 0
    story_points_in_progress: int = 0


class WIPResponse(BaseModel):
    """Schema for WIP (Work In Progress) metrics."""

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    # Current WIP
    current_stories_wip: int = 0
    current_tasks_wip: int = 0
    current_points_wip: int = 0
    # Averages
    avg_stories_wip: float = 0.0
    avg_tasks_wip: float = 0.0
    avg_points_wip: float = 0.0
    # Trend data
    data_points: list[WIPDataPoint] = Field(default_factory=list)


# ==================== Cumulative Flow Diagram ====================

class CFDDataPoint(BaseModel):
    """Schema for CFD (Cumulative Flow Diagram) data point."""

    date: str
    backlog: int = 0
    ready: int = 0
    in_progress: int = 0
    review: int = 0
    done: int = 0


class CFDResponse(BaseModel):
    """Schema for CFD metrics."""

    workspace_id: str
    team_id: str | None = None
    sprint_id: str | None = None
    period_start: date
    period_end: date
    # Status categories
    status_categories: list[str] = Field(default_factory=lambda: ["backlog", "ready", "in_progress", "review", "done"])
    # Data points
    data_points: list[CFDDataPoint] = Field(default_factory=list)


# ==================== Sprint Predictability ====================

class SprintPredictabilityResponse(BaseModel):
    """Schema for sprint predictability metrics."""

    model_config = ConfigDict(from_attributes=True)

    team_id: str
    sprint_id: str
    sprint_name: str | None = None
    # Commitment vs delivery
    committed_stories: int = 0
    delivered_stories: int = 0
    committed_points: int = 0
    delivered_points: int = 0
    # Scores
    story_predictability: float = 0.0
    points_predictability: float = 0.0
    # Scope changes
    stories_added_mid_sprint: int = 0
    stories_removed_mid_sprint: int = 0
    scope_change_percentage: float = 0.0
    # Carry-over
    carry_over_stories: int = 0
    carry_over_points: int = 0
    carry_over_percentage: float = 0.0
    # Cycle time
    avg_cycle_time_hours: float | None = None


class TeamPredictabilityTrend(BaseModel):
    """Schema for team predictability trend over sprints."""

    team_id: str
    team_name: str | None = None
    sprints: list[SprintPredictabilityResponse] = Field(default_factory=list)
    # Averages
    avg_story_predictability: float = 0.0
    avg_points_predictability: float = 0.0
    avg_scope_change: float = 0.0
    avg_carry_over: float = 0.0
    # Trend direction
    is_improving: bool = False


# ==================== Flow Efficiency ====================

class FlowEfficiencyResponse(BaseModel):
    """Schema for flow efficiency metrics."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    # Flow efficiency = active_time / total_time * 100
    avg_flow_efficiency: float | None = None
    # Time breakdown
    avg_backlog_time_hours: float | None = None
    avg_todo_time_hours: float | None = None
    avg_in_progress_time_hours: float | None = None
    avg_review_time_hours: float | None = None
    avg_blocked_time_hours: float | None = None
    # Sample size
    sample_count: int = 0


# ==================== Percentiles ====================

class CycleTimePercentilesResponse(BaseModel):
    """Schema for cycle time percentiles."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    period_type: PeriodType
    item_type: ItemType
    # Sample
    sample_count: int = 0
    # Percentiles (in hours)
    p50_hours: float | None = None
    p75_hours: float | None = None
    p85_hours: float | None = None
    p95_hours: float | None = None
    p99_hours: float | None = None
    # Stats
    avg_hours: float | None = None
    min_hours: float | None = None
    max_hours: float | None = None
    std_dev_hours: float | None = None


# ==================== Release Forecast ====================

class MonteCarloDataPoint(BaseModel):
    """Schema for Monte Carlo simulation data point."""

    percentile: int
    completion_date: date
    remaining_days: int


class ReleaseForecastResponse(BaseModel):
    """Schema for release forecast using Monte Carlo simulation."""

    release_id: str
    release_name: str | None = None
    target_date: date
    # Current state
    remaining_stories: int = 0
    remaining_points: int = 0
    # Historical throughput
    avg_stories_per_week: float = 0.0
    avg_points_per_week: float = 0.0
    # Forecast
    forecasts: list[MonteCarloDataPoint] = Field(default_factory=list)
    # Risk
    on_track_probability: float = 0.0  # Probability of hitting target date
    days_buffer: int = 0  # Days between 85th percentile and target


# ==================== Metrics Dashboard ====================

class MetricsDashboardResponse(BaseModel):
    """Schema for metrics dashboard overview."""

    workspace_id: str
    team_id: str | None = None
    period_start: date
    period_end: date
    # Velocity
    velocity_this_period: int = 0
    velocity_trend: float = 0.0  # Percentage change
    # Throughput
    stories_completed: int = 0
    tasks_completed: int = 0
    bugs_closed: int = 0
    # Cycle time
    avg_cycle_time_hours: float | None = None
    cycle_time_trend: float = 0.0
    # Lead time
    avg_lead_time_hours: float | None = None
    lead_time_trend: float = 0.0
    # Predictability
    avg_predictability: float = 0.0
    predictability_trend: float = 0.0
    # WIP
    current_wip: int = 0
    avg_wip: float = 0.0
