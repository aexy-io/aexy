"""Sprint planning service for AI-powered task assignment and optimization."""

import logging
from typing import Any
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.sprint import Sprint, SprintTask
from aexy.models.team import TeamMember
from aexy.models.developer import Developer
from aexy.llm.gateway import LLMGateway
from aexy.services.task_matcher import TaskMatcher, TaskMatchRequest, RankedCandidate
from aexy.services.whatif_analyzer import WhatIfAnalyzer, WhatIfScenario

logger = logging.getLogger(__name__)


@dataclass
class AssignmentSuggestion:
    """AI-generated task assignment suggestion."""

    task_id: str
    task_title: str
    suggested_developer_id: str
    suggested_developer_name: str | None
    confidence: float
    reasoning: str
    alternative_developers: list[dict]


@dataclass
class OptimizationResult:
    """Result of sprint optimization."""

    original_score: float
    optimized_score: float
    improvement: float
    changes: list[dict]
    scenario: WhatIfScenario | None
    recommendations: list[str]


@dataclass
class CapacityAnalysis:
    """Analysis of sprint capacity vs commitment."""

    total_capacity_hours: int
    committed_hours: int
    utilization_rate: float
    overcommitted: bool
    per_member_capacity: list[dict]
    recommendations: list[str]


@dataclass
class CompletionPrediction:
    """Prediction of sprint completion."""

    predicted_completion_rate: float
    confidence: float
    risk_factors: list[str]
    at_risk_tasks: list[dict]
    recommendations: list[str]


class SprintPlanningService:
    """Service for AI-powered sprint planning and optimization."""

    # Default hours per story point
    HOURS_PER_POINT = 4
    # Default capacity per developer per sprint (2-week sprint)
    DEFAULT_DEVELOPER_CAPACITY_HOURS = 60

    def __init__(self, db: AsyncSession, llm_gateway: LLMGateway | None = None):
        """Initialize the sprint planning service.

        Args:
            db: Database session.
            llm_gateway: Optional LLM gateway for AI analysis.
        """
        self.db = db
        self.llm = llm_gateway
        self.task_matcher = TaskMatcher(llm_gateway) if llm_gateway else None
        self.whatif_analyzer = WhatIfAnalyzer()

    async def suggest_assignments(self, sprint_id: str) -> list[AssignmentSuggestion]:
        """Get AI-powered assignment suggestions for unassigned tasks.

        Args:
            sprint_id: Sprint ID.

        Returns:
            List of assignment suggestions.
        """
        sprint = await self._get_sprint_with_tasks(sprint_id)
        if not sprint:
            return []

        # Get unassigned tasks
        unassigned_tasks = [t for t in sprint.tasks if not t.assignee_id]
        if not unassigned_tasks:
            return []

        # Get team members
        team_members = await self._get_team_members(sprint.team_id)
        if not team_members:
            return []

        suggestions = []

        for task in unassigned_tasks:
            suggestion = await self._suggest_assignment_for_task(
                task, team_members, sprint.tasks
            )
            if suggestion:
                suggestions.append(suggestion)

        return suggestions

    async def _suggest_assignment_for_task(
        self,
        task: SprintTask,
        team_members: list[Developer],
        all_tasks: list[SprintTask],
    ) -> AssignmentSuggestion | None:
        """Generate assignment suggestion for a single task."""
        if not self.task_matcher:
            # Fallback to simple round-robin if no LLM
            return self._simple_assignment_suggestion(task, team_members, all_tasks)

        try:
            # Create task match request
            request = TaskMatchRequest(
                title=task.title,
                description=task.description or "",
                source=task.source_type,
                labels=task.labels or [],
                priority=task.priority,
                estimated_points=task.story_points,
            )

            # Extract task signals
            task_signals = await self.task_matcher.extract_task_signals(request)

            # Score each team member
            candidates: list[RankedCandidate] = []
            for member in team_members:
                developer_profile = self._developer_to_profile(member, all_tasks)
                score = await self.task_matcher.score_developer(
                    task_signals, developer_profile
                )
                candidates.append(
                    RankedCandidate(
                        developer_id=str(member.id),
                        developer_name=member.name,
                        match_score=score,
                        rank=0,
                    )
                )

            # Sort by score
            candidates.sort(
                key=lambda c: c.match_score.overall_score, reverse=True
            )
            for i, c in enumerate(candidates):
                c.rank = i + 1

            if not candidates:
                return None

            best = candidates[0]
            alternatives = [
                {
                    "developer_id": c.developer_id,
                    "developer_name": c.developer_name,
                    "score": c.match_score.overall_score,
                }
                for c in candidates[1:4]  # Top 3 alternatives
            ]

            return AssignmentSuggestion(
                task_id=str(task.id),
                task_title=task.title,
                suggested_developer_id=best.developer_id,
                suggested_developer_name=best.developer_name,
                confidence=best.match_score.confidence,
                reasoning=best.match_score.explanation or "Best skill and availability match",
                alternative_developers=alternatives,
            )

        except Exception as e:
            logger.error(f"Error generating suggestion for task {task.id}: {e}")
            return self._simple_assignment_suggestion(task, team_members, all_tasks)

    def _simple_assignment_suggestion(
        self,
        task: SprintTask,
        team_members: list[Developer],
        all_tasks: list[SprintTask],
    ) -> AssignmentSuggestion | None:
        """Simple assignment without AI - based on workload balance."""
        if not team_members:
            return None

        # Count current assignments
        workload = {}
        for t in all_tasks:
            if t.assignee_id:
                workload[t.assignee_id] = workload.get(t.assignee_id, 0) + 1

        # Find member with lowest workload
        sorted_members = sorted(
            team_members,
            key=lambda m: workload.get(str(m.id), 0),
        )

        best = sorted_members[0]
        alternatives = [
            {
                "developer_id": str(m.id),
                "developer_name": m.name,
                "score": 0.5,
            }
            for m in sorted_members[1:4]
        ]

        return AssignmentSuggestion(
            task_id=str(task.id),
            task_title=task.title,
            suggested_developer_id=str(best.id),
            suggested_developer_name=best.name,
            confidence=0.6,
            reasoning="Assigned based on workload balance (AI unavailable)",
            alternative_developers=alternatives,
        )

    async def optimize_sprint(self, sprint_id: str) -> OptimizationResult:
        """Optimize task assignments to balance workload and skill fit.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Optimization result with suggestions.
        """
        sprint = await self._get_sprint_with_tasks(sprint_id)
        if not sprint:
            return OptimizationResult(
                original_score=0,
                optimized_score=0,
                improvement=0,
                changes=[],
                scenario=None,
                recommendations=["Sprint not found"],
            )

        team_members = await self._get_team_members(sprint.team_id)
        if not team_members:
            return OptimizationResult(
                original_score=0,
                optimized_score=0,
                improvement=0,
                changes=[],
                scenario=None,
                recommendations=["No team members found"],
            )

        # Get current assignments
        current_assignments = [
            {"task_id": str(t.id), "developer_id": t.assignee_id}
            for t in sprint.tasks
            if t.assignee_id
        ]

        # Calculate current workload balance
        current_workload = self._calculate_workload(sprint.tasks)
        original_score = self._calculate_balance_score(current_workload, team_members)

        # Try to improve by reassigning overloaded developers' tasks
        proposed_changes = await self._generate_optimization_proposals(
            sprint.tasks, team_members, current_workload
        )

        if not proposed_changes:
            return OptimizationResult(
                original_score=original_score,
                optimized_score=original_score,
                improvement=0,
                changes=[],
                scenario=None,
                recommendations=["Sprint is already well-balanced"],
            )

        # Create what-if scenario
        proposed_assignments = [
            {"task_id": c["task_id"], "developer_id": c["new_developer_id"]}
            for c in proposed_changes
        ] + [
            a for a in current_assignments
            if a["task_id"] not in [c["task_id"] for c in proposed_changes]
        ]

        tasks_data = [
            {
                "id": str(t.id),
                "title": t.title,
                "story_points": t.story_points or 1,
            }
            for t in sprint.tasks
        ]

        scenario = self.whatif_analyzer.create_scenario(
            scenario_name=f"Optimized {sprint.name}",
            tasks=tasks_data,
            developers=team_members,
            proposed_assignments=proposed_assignments,
            current_workloads=current_workload,
        )

        optimized_score = scenario.team_impact.average_match_score if scenario else original_score

        return OptimizationResult(
            original_score=original_score,
            optimized_score=optimized_score,
            improvement=optimized_score - original_score,
            changes=proposed_changes,
            scenario=scenario,
            recommendations=scenario.recommendations if scenario else [],
        )

    async def _generate_optimization_proposals(
        self,
        tasks: list[SprintTask],
        team_members: list[Developer],
        current_workload: dict[str, int],
    ) -> list[dict]:
        """Generate proposals to optimize task distribution."""
        proposals = []

        # Find overloaded members
        avg_workload = sum(current_workload.values()) / len(team_members) if team_members else 0
        overloaded = [
            dev_id for dev_id, count in current_workload.items()
            if count > avg_workload * 1.5
        ]
        underloaded = [
            str(m.id) for m in team_members
            if current_workload.get(str(m.id), 0) < avg_workload * 0.5
        ]

        if not overloaded or not underloaded:
            return []

        # Try to move tasks from overloaded to underloaded
        for dev_id in overloaded:
            dev_tasks = [t for t in tasks if t.assignee_id == dev_id]
            for task in dev_tasks[:2]:  # Move up to 2 tasks
                if underloaded:
                    target = underloaded[0]
                    proposals.append({
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "current_developer_id": dev_id,
                        "new_developer_id": target,
                        "reason": "Workload rebalancing",
                    })
                    # Update tracking
                    current_workload[dev_id] = current_workload.get(dev_id, 0) - 1
                    current_workload[target] = current_workload.get(target, 0) + 1
                    if current_workload.get(target, 0) >= avg_workload:
                        underloaded.remove(target)

        return proposals

    async def analyze_capacity(self, sprint_id: str) -> CapacityAnalysis:
        """Analyze sprint capacity vs commitment.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Capacity analysis.
        """
        sprint = await self._get_sprint_with_tasks(sprint_id)
        if not sprint:
            return CapacityAnalysis(
                total_capacity_hours=0,
                committed_hours=0,
                utilization_rate=0,
                overcommitted=False,
                per_member_capacity=[],
                recommendations=["Sprint not found"],
            )

        team_members = await self._get_team_members(sprint.team_id)

        # Calculate capacity
        total_capacity = (
            sprint.capacity_hours
            if sprint.capacity_hours
            else len(team_members) * self.DEFAULT_DEVELOPER_CAPACITY_HOURS
        )

        # Calculate committed hours (from story points)
        total_points = sum(t.story_points or 0 for t in sprint.tasks)
        committed_hours = total_points * self.HOURS_PER_POINT

        utilization = committed_hours / total_capacity if total_capacity > 0 else 0
        overcommitted = utilization > 1.0

        # Per-member analysis
        per_member = []
        for member in team_members:
            member_tasks = [t for t in sprint.tasks if t.assignee_id == str(member.id)]
            member_points = sum(t.story_points or 0 for t in member_tasks)
            member_hours = member_points * self.HOURS_PER_POINT
            member_capacity = self.DEFAULT_DEVELOPER_CAPACITY_HOURS

            per_member.append({
                "developer_id": str(member.id),
                "developer_name": member.name,
                "assigned_tasks": len(member_tasks),
                "assigned_points": member_points,
                "committed_hours": member_hours,
                "capacity_hours": member_capacity,
                "utilization": member_hours / member_capacity if member_capacity > 0 else 0,
            })

        # Recommendations
        recommendations = []
        if overcommitted:
            recommendations.append(
                f"Sprint is overcommitted by {int((utilization - 1) * 100)}%. Consider removing tasks."
            )
        elif utilization < 0.7:
            recommendations.append(
                f"Sprint has spare capacity ({int((1 - utilization) * 100)}%). Consider adding more tasks."
            )

        for pm in per_member:
            if pm["utilization"] > 1.2:
                recommendations.append(
                    f"{pm['developer_name']} is overloaded. Consider redistributing tasks."
                )

        return CapacityAnalysis(
            total_capacity_hours=total_capacity,
            committed_hours=committed_hours,
            utilization_rate=round(utilization, 2),
            overcommitted=overcommitted,
            per_member_capacity=per_member,
            recommendations=recommendations,
        )

    async def predict_completion(self, sprint_id: str) -> CompletionPrediction:
        """Predict sprint completion likelihood.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Completion prediction.
        """
        sprint = await self._get_sprint_with_tasks(sprint_id)
        if not sprint:
            return CompletionPrediction(
                predicted_completion_rate=0,
                confidence=0,
                risk_factors=[],
                at_risk_tasks=[],
                recommendations=["Sprint not found"],
            )

        # Get historical velocity
        from aexy.services.sprint_analytics_service import SprintAnalyticsService
        analytics = SprintAnalyticsService(self.db)
        velocity_data = await analytics.get_team_velocity(sprint.team_id, num_sprints=5)

        # Current progress
        total_points = sum(t.story_points or 0 for t in sprint.tasks)
        completed_points = sum(
            t.story_points or 0 for t in sprint.tasks if t.status == "done"
        )
        remaining_points = total_points - completed_points

        # Calculate days remaining
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        if sprint.end_date:
            days_remaining = (sprint.end_date - now).days
        else:
            days_remaining = 14  # Default

        # Predict based on velocity
        avg_velocity = velocity_data.get("average_velocity", 0)
        if avg_velocity > 0 and days_remaining > 0:
            points_per_day = avg_velocity / 10  # Assuming 10-day sprint
            predicted_completion = (completed_points + points_per_day * days_remaining) / total_points
        else:
            predicted_completion = completed_points / total_points if total_points > 0 else 0

        predicted_rate = min(1.0, predicted_completion)

        # Calculate confidence based on data availability
        confidence = 0.8 if len(velocity_data.get("sprints", [])) >= 3 else 0.5

        # Identify risk factors
        risk_factors = []
        at_risk_tasks = []

        # Check for unassigned tasks
        unassigned = [t for t in sprint.tasks if not t.assignee_id]
        if unassigned:
            risk_factors.append(f"{len(unassigned)} tasks are unassigned")
            for t in unassigned[:5]:
                at_risk_tasks.append({
                    "task_id": str(t.id),
                    "title": t.title,
                    "risk": "Unassigned",
                })

        # Check for blocked tasks
        blocked = [t for t in sprint.tasks if t.status == "blocked" or "blocked" in (t.labels or [])]
        if blocked:
            risk_factors.append(f"{len(blocked)} tasks may be blocked")

        # Check capacity
        capacity = await self.analyze_capacity(sprint_id)
        if capacity.overcommitted:
            risk_factors.append("Sprint is overcommitted")

        # Recommendations
        recommendations = []
        if predicted_rate < 0.8:
            recommendations.append(
                "Sprint is at risk of not completing. Consider reducing scope."
            )
        if unassigned:
            recommendations.append("Assign unassigned tasks to avoid bottlenecks.")
        if capacity.overcommitted:
            recommendations.append("Consider removing lower priority tasks.")

        return CompletionPrediction(
            predicted_completion_rate=round(predicted_rate, 2),
            confidence=confidence,
            risk_factors=risk_factors,
            at_risk_tasks=at_risk_tasks,
            recommendations=recommendations or ["Sprint is on track for completion."],
        )

    async def get_assignment_explanation(
        self, task_id: str, developer_id: str
    ) -> str:
        """Get an explanation for why a developer is suited for a task.

        Args:
            task_id: Task ID.
            developer_id: Developer ID.

        Returns:
            Explanation string.
        """
        if not self.task_matcher or not self.llm:
            return "AI explanation not available."

        # Get task and developer
        stmt = select(SprintTask).where(SprintTask.id == task_id)
        result = await self.db.execute(stmt)
        task = result.scalar_one_or_none()

        stmt = select(Developer).where(Developer.id == developer_id)
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not task or not developer:
            return "Task or developer not found."

        try:
            request = TaskMatchRequest(
                title=task.title,
                description=task.description or "",
                source=task.source_type,
                labels=task.labels or [],
            )

            task_signals = await self.task_matcher.extract_task_signals(request)
            developer_profile = self._developer_to_profile(developer, [])
            score = await self.task_matcher.score_developer(task_signals, developer_profile)

            return score.explanation or "This developer is a good match based on their skills and experience."

        except Exception as e:
            logger.error(f"Error generating explanation: {e}")
            return "Unable to generate explanation."

    # Private helpers
    async def _get_sprint_with_tasks(self, sprint_id: str) -> Sprint | None:
        """Get sprint with tasks loaded."""
        stmt = (
            select(Sprint)
            .where(Sprint.id == sprint_id)
            .options(selectinload(Sprint.tasks).selectinload(SprintTask.assignee))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_team_members(self, team_id: str) -> list[Developer]:
        """Get all developers in a team."""
        stmt = (
            select(Developer)
            .join(TeamMember, TeamMember.developer_id == Developer.id)
            .where(TeamMember.team_id == team_id)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def _developer_to_profile(
        self, developer: Developer, all_tasks: list[SprintTask]
    ) -> dict[str, Any]:
        """Convert developer model to profile dict for matching."""
        # Count current assignments
        current_tasks = len([
            t for t in all_tasks if t.assignee_id == str(developer.id)
        ])

        return {
            "id": str(developer.id),
            "name": developer.name,
            "skills": [],  # Would come from developer profile
            "current_tasks": current_tasks,
            "availability": max(0, 6 - current_tasks),  # Assume 6 task capacity
        }

    def _calculate_workload(self, tasks: list[SprintTask]) -> dict[str, int]:
        """Calculate task count per developer."""
        workload = {}
        for task in tasks:
            if task.assignee_id:
                workload[task.assignee_id] = workload.get(task.assignee_id, 0) + 1
        return workload

    def _calculate_balance_score(
        self, workload: dict[str, int], team_members: list[Developer]
    ) -> float:
        """Calculate how balanced the workload is (0-1)."""
        if not team_members:
            return 0

        member_ids = [str(m.id) for m in team_members]
        loads = [workload.get(mid, 0) for mid in member_ids]

        if not loads or max(loads) == 0:
            return 1.0

        avg = sum(loads) / len(loads)
        if avg == 0:
            return 1.0

        # Calculate coefficient of variation
        variance = sum((l - avg) ** 2 for l in loads) / len(loads)
        cv = (variance ** 0.5) / avg

        # Convert to 0-1 score (lower CV = higher score)
        return max(0, 1 - cv)
