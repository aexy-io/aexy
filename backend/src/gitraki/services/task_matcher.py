"""Task Matcher service for intelligent developer-task matching."""

import json
import logging
from typing import Any

from pydantic import BaseModel, Field

from gitraki.llm.base import MatchScore, TaskSignals
from gitraki.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)


class TaskMatchRequest(BaseModel):
    """Request for task matching."""

    title: str
    description: str
    source: str = Field(default="unknown", description="jira, linear, github")
    labels: list[str] = Field(default_factory=list)
    priority: str | None = None
    estimated_points: int | None = None


class RankedCandidate(BaseModel):
    """A developer ranked for a task."""

    developer_id: str
    developer_name: str | None = None
    match_score: MatchScore
    rank: int


class TaskMatchResult(BaseModel):
    """Result of task matching."""

    task_signals: TaskSignals
    candidates: list[RankedCandidate]
    recommendations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class TaskMatcher:
    """Service for matching developers to tasks using LLM intelligence."""

    # Weights for different matching dimensions
    MATCH_WEIGHTS = {
        "skill_fit": 0.35,
        "experience_fit": 0.25,
        "availability": 0.15,
        "growth_opportunity": 0.15,
        "team_dynamics": 0.10,
    }

    def __init__(self, llm_gateway: LLMGateway) -> None:
        """Initialize the task matcher.

        Args:
            llm_gateway: The LLM gateway for analysis.
        """
        self.llm = llm_gateway

    async def extract_task_signals(
        self,
        request: TaskMatchRequest,
    ) -> TaskSignals:
        """Extract skill signals from a task description.

        Args:
            request: The task match request.

        Returns:
            Extracted task signals.
        """
        # Format task for LLM
        task_json = json.dumps({
            "title": request.title,
            "description": request.description,
            "source": request.source,
            "labels": request.labels,
        })

        return await self.llm.extract_task_signals(task_json)

    async def score_developer(
        self,
        task_signals: TaskSignals,
        developer: dict[str, Any],
    ) -> MatchScore:
        """Score how well a developer matches a task.

        Args:
            task_signals: Extracted task signals.
            developer: Developer profile with skills.

        Returns:
            Match score.
        """
        # Prepare developer skills for matching
        skills = {
            "developer_id": str(developer.get("id", "")),
            "languages": developer.get("skill_fingerprint", {}).get("languages", []),
            "frameworks": developer.get("skill_fingerprint", {}).get("frameworks", []),
            "domains": developer.get("skill_fingerprint", {}).get("domains", []),
            "recent_activity": self._summarize_recent_activity(developer),
        }

        return await self.llm.score_match(task_signals, skills)

    def _summarize_recent_activity(self, developer: dict[str, Any]) -> str:
        """Summarize developer's recent activity.

        Args:
            developer: Developer data.

        Returns:
            Activity summary string.
        """
        work_patterns = developer.get("work_patterns", {})
        growth = developer.get("growth_trajectory", {})

        parts = []

        if complexity := work_patterns.get("preferred_complexity"):
            parts.append(f"prefers {complexity} complexity tasks")

        if skills_6m := growth.get("skills_acquired_6m", []):
            parts.append(f"recently learned: {', '.join(skills_6m[:3])}")

        if velocity := growth.get("learning_velocity", 0):
            if velocity > 1:
                parts.append("high learning velocity")
            elif velocity > 0.5:
                parts.append("moderate learning velocity")

        return "; ".join(parts) if parts else "no recent activity data"

    async def match_task(
        self,
        request: TaskMatchRequest,
        developers: list[dict[str, Any]],
    ) -> TaskMatchResult:
        """Match a task to the best developers.

        Args:
            request: The task to match.
            developers: List of available developers.

        Returns:
            Match result with ranked candidates.
        """
        # Extract task signals
        task_signals = await self.extract_task_signals(request)

        # Score all developers
        candidates: list[RankedCandidate] = []
        for developer in developers:
            try:
                score = await self.score_developer(task_signals, developer)
                candidates.append(
                    RankedCandidate(
                        developer_id=str(developer.get("id", "")),
                        developer_name=developer.get("name"),
                        match_score=score,
                        rank=0,  # Will be set after sorting
                    )
                )
            except Exception as e:
                logger.warning(f"Failed to score developer {developer.get('id')}: {e}")

        # Sort by overall score
        candidates.sort(key=lambda c: c.match_score.overall_score, reverse=True)

        # Set ranks
        for i, candidate in enumerate(candidates):
            candidate.rank = i + 1

        # Generate recommendations and warnings
        recommendations, warnings = self._generate_insights(task_signals, candidates)

        return TaskMatchResult(
            task_signals=task_signals,
            candidates=candidates,
            recommendations=recommendations,
            warnings=warnings,
        )

    def _generate_insights(
        self,
        task_signals: TaskSignals,
        candidates: list[RankedCandidate],
    ) -> tuple[list[str], list[str]]:
        """Generate recommendations and warnings.

        Args:
            task_signals: Task signals.
            candidates: Ranked candidates.

        Returns:
            Tuple of (recommendations, warnings).
        """
        recommendations = []
        warnings = []

        if not candidates:
            warnings.append("No developers available for matching")
            return recommendations, warnings

        top_candidate = candidates[0]
        top_score = top_candidate.match_score

        # Check if top match is strong
        if top_score.overall_score >= 80:
            recommendations.append(
                f"{top_candidate.developer_name or top_candidate.developer_id} "
                f"is an excellent match with {top_score.overall_score:.0f}% score"
            )
        elif top_score.overall_score >= 60:
            recommendations.append(
                f"{top_candidate.developer_name or top_candidate.developer_id} "
                f"is a good match with {top_score.overall_score:.0f}% score"
            )
        else:
            warnings.append(
                f"Best match score is only {top_score.overall_score:.0f}%. "
                "Consider hiring or training to fill skill gaps."
            )

        # Check for growth opportunity
        for candidate in candidates[:3]:
            if candidate.match_score.growth_opportunity >= 70:
                recommendations.append(
                    f"{candidate.developer_name or candidate.developer_id} "
                    "has high growth potential with this task"
                )

        # Check for skill gaps
        if top_score.gaps:
            warnings.append(
                f"Skill gaps to address: {', '.join(top_score.gaps[:3])}"
            )

        # Check if task is complex with no strong matches
        if task_signals.complexity == "high" and top_score.overall_score < 70:
            recommendations.append(
                "Consider pair programming for this complex task"
            )

        return recommendations, warnings

    async def bulk_match(
        self,
        tasks: list[TaskMatchRequest],
        developers: list[dict[str, Any]],
    ) -> dict[str, TaskMatchResult]:
        """Match multiple tasks to developers.

        Args:
            tasks: List of tasks to match.
            developers: List of available developers.

        Returns:
            Dict mapping task title to match result.
        """
        results = {}

        for task in tasks:
            try:
                result = await self.match_task(task, developers)
                results[task.title] = result
            except Exception as e:
                logger.error(f"Failed to match task '{task.title}': {e}")

        return results

    async def optimize_assignments(
        self,
        tasks: list[TaskMatchRequest],
        developers: list[dict[str, Any]],
        constraints: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """Find optimal task-developer assignments.

        Uses a greedy algorithm to assign tasks to developers,
        respecting constraints like workload limits.

        Args:
            tasks: List of tasks to assign.
            developers: List of available developers.
            constraints: Optional constraints (e.g., max tasks per developer).

        Returns:
            Dict mapping task title to assigned developer ID.
        """
        constraints = constraints or {}
        max_tasks_per_dev = constraints.get("max_tasks_per_developer", 3)

        # Track assignments
        assignments: dict[str, str] = {}
        developer_load: dict[str, int] = {str(d.get("id", "")): 0 for d in developers}

        # Match all tasks first
        all_matches = await self.bulk_match(tasks, developers)

        # Sort tasks by priority/complexity (harder tasks first)
        sorted_tasks = sorted(
            tasks,
            key=lambda t: (
                1 if all_matches.get(t.title, TaskMatchResult(
                    task_signals=TaskSignals(),
                    candidates=[],
                )).task_signals.complexity == "high" else 2
            ),
        )

        # Greedy assignment
        for task in sorted_tasks:
            match_result = all_matches.get(task.title)
            if not match_result or not match_result.candidates:
                continue

            # Find best available developer
            for candidate in match_result.candidates:
                dev_id = candidate.developer_id
                if developer_load.get(dev_id, 0) < max_tasks_per_dev:
                    assignments[task.title] = dev_id
                    developer_load[dev_id] = developer_load.get(dev_id, 0) + 1
                    break

        return assignments
