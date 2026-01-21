"""Base interfaces and types for LLM providers."""

from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class LLMError(Exception):
    """Base exception for LLM errors."""

    pass


class LLMRateLimitError(LLMError):
    """Raised when the LLM API rate limit is exceeded."""

    def __init__(
        self,
        message: str = "API rate limit exceeded. Please try again later.",
        retry_after: datetime | None = None,
        wait_seconds: float = 60,
    ):
        self.message = message
        self.retry_after = retry_after
        self.wait_seconds = wait_seconds
        super().__init__(self.message)


class LLMAPIError(LLMError):
    """Raised when the LLM API returns an error."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AnalysisType(str, Enum):
    """Types of content analysis supported."""

    CODE = "code"
    COMMIT_MESSAGE = "commit_message"
    PR_DESCRIPTION = "pr_description"
    REVIEW_COMMENT = "review_comment"
    TASK_DESCRIPTION = "task_description"
    # Phase 3: Career Intelligence
    LEARNING_PATH = "learning_path"
    MILESTONE_EVALUATION = "milestone_evaluation"
    JOB_DESCRIPTION = "job_description"
    INTERVIEW_RUBRIC = "interview_rubric"
    STRETCH_ASSIGNMENT = "stretch_assignment"
    ROADMAP_SKILLS = "roadmap_skills"
    # Phase 4: Predictive Analytics
    ATTRITION_RISK = "attrition_risk"
    BURNOUT_RISK = "burnout_risk"
    PERFORMANCE_TRAJECTORY = "performance_trajectory"
    TEAM_HEALTH = "team_health"
    # Phase 5: Documentation Generation
    DOC_API = "doc_api"
    DOC_README = "doc_readme"
    DOC_FUNCTION = "doc_function"
    DOC_MODULE = "doc_module"
    DOC_UPDATE = "doc_update"
    DOC_IMPROVEMENT = "doc_improvement"


class LLMConfig(BaseModel):
    """Configuration for an LLM provider."""

    provider: str = Field(description="Provider name: claude, ollama, openai")
    model: str = Field(description="Model identifier")
    api_key: str | None = Field(default=None, description="API key for cloud providers")
    base_url: str | None = Field(default=None, description="Base URL for self-hosted providers")
    max_tokens: int = Field(default=4096, description="Maximum tokens per request")
    temperature: float = Field(default=0.0, description="Sampling temperature")
    timeout: int = Field(default=60, description="Request timeout in seconds")


class LanguageAnalysis(BaseModel):
    """Analysis result for a programming language."""

    name: str
    proficiency_indicators: list[str] = Field(default_factory=list)
    patterns_detected: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class FrameworkAnalysis(BaseModel):
    """Analysis result for a framework/library."""

    name: str
    category: str = Field(default="unknown")
    usage_depth: str = Field(default="basic", description="basic, intermediate, advanced")
    patterns_detected: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class DomainAnalysis(BaseModel):
    """Analysis result for a domain expertise area."""

    name: str
    indicators: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class SoftSkillAnalysis(BaseModel):
    """Analysis result for soft skills indicators."""

    skill: str = Field(description="communication, mentorship, collaboration, leadership")
    score: float = Field(default=0.0, ge=0.0, le=1.0)
    indicators: list[str] = Field(default_factory=list)


class CodeQualityIndicators(BaseModel):
    """Code quality assessment."""

    complexity: str = Field(default="moderate", description="low, moderate, high")
    test_coverage_indicators: list[str] = Field(default_factory=list)
    documentation_quality: str = Field(default="moderate")
    best_practices: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


class AnalysisRequest(BaseModel):
    """Request for LLM analysis."""

    content: str = Field(description="Content to analyze")
    analysis_type: AnalysisType = Field(description="Type of analysis to perform")
    context: dict[str, Any] = Field(default_factory=dict, description="Additional context")
    file_path: str | None = Field(default=None, description="File path for code analysis")
    language_hint: str | None = Field(default=None, description="Hint about programming language")


class AnalysisResult(BaseModel):
    """Result from LLM analysis."""

    languages: list[LanguageAnalysis] = Field(default_factory=list)
    frameworks: list[FrameworkAnalysis] = Field(default_factory=list)
    domains: list[DomainAnalysis] = Field(default_factory=list)
    soft_skills: list[SoftSkillAnalysis] = Field(default_factory=list)
    code_quality: CodeQualityIndicators | None = None
    summary: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    raw_response: str = Field(default="", description="Raw LLM response for debugging")
    tokens_used: int = Field(default=0)
    input_tokens: int = Field(default=0, description="Input tokens consumed")
    output_tokens: int = Field(default=0, description="Output tokens generated")
    provider: str = Field(default="")
    model: str = Field(default="")


class TaskSignals(BaseModel):
    """Extracted signals from a task description."""

    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    domain: str | None = None
    complexity: str = Field(default="medium", description="low, medium, high")
    estimated_effort: str | None = None
    keywords: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class MatchScore(BaseModel):
    """Score for developer-task matching."""

    developer_id: str
    overall_score: float = Field(ge=0.0, le=100.0)
    skill_match: float = Field(ge=0.0, le=100.0)
    experience_match: float = Field(ge=0.0, le=100.0)
    growth_opportunity: float = Field(ge=0.0, le=100.0)
    reasoning: str = Field(default="")
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        """Perform analysis on the given content.

        Args:
            request: The analysis request with content and type.

        Returns:
            Analysis result with extracted insights.
        """
        pass

    @abstractmethod
    async def extract_task_signals(self, task_description: str) -> TaskSignals:
        """Extract skill signals from a task description.

        Args:
            task_description: The task/issue description text.

        Returns:
            Extracted task signals including required skills.
        """
        pass

    @abstractmethod
    async def score_match(
        self,
        task_signals: TaskSignals,
        developer_skills: dict[str, Any],
    ) -> MatchScore:
        """Score how well a developer matches a task.

        Args:
            task_signals: Extracted signals from the task.
            developer_skills: Developer's skill fingerprint.

        Returns:
            Match score with reasoning.
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the provider is healthy and reachable.

        Returns:
            True if healthy, False otherwise.
        """
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get the provider name."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Get the model name."""
        pass
