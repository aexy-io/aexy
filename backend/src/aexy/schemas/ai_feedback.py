"""Schemas for AI Feedback and Benchmarking."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


# ── Feedback CRUD ─────────────────────────────────────────────────────


class AIFeedbackCreate(BaseModel):
    """Create or update feedback on an AI entity."""

    entity_type: Literal["ask_message", "agent_execution", "automation_run"]
    entity_id: str
    rating: int  # -1 or 1
    comment: str | None = None
    tags: list[str] | None = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: int) -> int:
        if v not in (-1, 1):
            raise ValueError("rating must be -1 or 1")
        return v


class AIFeedbackResponse(BaseModel):
    """Feedback response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_type: str
    entity_id: str
    workspace_id: str
    developer_id: str
    rating: int
    comment: str | None
    tags: str | None
    created_at: datetime
    updated_at: datetime | None = None


# ── Benchmarking Response ─────────────────────────────────────────────


class AskAIMetrics(BaseModel):
    """Metrics for the Ask AI feature."""

    total_conversations: int = 0
    total_messages: int = 0
    avg_latency_ms: float | None = None
    p95_latency_ms: float | None = None
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    token_usage_series: list[dict] = []
    tool_usage: list[dict] = []


class AgentMetrics(BaseModel):
    """Metrics for AI agent executions."""

    total_executions: int = 0
    completed: int = 0
    failed: int = 0
    success_rate: float | None = None
    avg_duration_ms: float | None = None
    top_agents: list[dict] = []


class AutomationMetrics(BaseModel):
    """Metrics for automation runs."""

    total_runs: int = 0
    completed: int = 0
    failed: int = 0
    success_rate: float | None = None
    avg_duration_ms: float | None = None
    by_module: list[dict] = []


class FeedbackSummary(BaseModel):
    """Summary of all AI feedback."""

    total: int = 0
    thumbs_up: int = 0
    thumbs_down: int = 0
    satisfaction_rate: float | None = None
    by_entity_type: list[dict] = []
    recent_negative: list[dict] = []


class VolumeSeries(BaseModel):
    """Time-series data point for AI volume."""

    date: str
    ask_messages: int = 0
    agent_executions: int = 0
    automation_runs: int = 0


class AIBenchmarkingResponse(BaseModel):
    """Full benchmarking dashboard data."""

    ask_ai: AskAIMetrics = AskAIMetrics()
    agents: AgentMetrics = AgentMetrics()
    automations: AutomationMetrics = AutomationMetrics()
    feedback: FeedbackSummary = FeedbackSummary()
    volume_trend: list[VolumeSeries] = []
