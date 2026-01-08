"""What-if analysis service for simulating task assignments."""

import logging
from dataclasses import dataclass, field
from typing import Any

from aexy.llm.base import MatchScore, TaskSignals
from aexy.models.developer import Developer

logger = logging.getLogger(__name__)


@dataclass
class AssignmentSimulation:
    """A simulated task assignment."""

    task_id: str
    task_title: str
    developer_id: str
    developer_name: str | None
    match_score: float
    skill_match: float
    growth_opportunity: float


@dataclass
class WorkloadImpact:
    """Impact on developer workload."""

    developer_id: str
    developer_name: str | None
    current_tasks: int
    assigned_tasks: int
    total_tasks: int
    workload_status: str  # "underloaded", "balanced", "overloaded"
    estimated_hours: float


@dataclass
class TeamImpact:
    """Impact on team metrics."""

    total_tasks: int
    assigned_tasks: int
    unassigned_tasks: int
    average_match_score: float
    skill_coverage: dict[str, float]  # skill -> coverage percentage
    growth_distribution: dict[str, int]  # developer_id -> growth tasks count
    warnings: list[str]


@dataclass
class WhatIfScenario:
    """A complete what-if scenario with assignments."""

    scenario_id: str
    scenario_name: str
    assignments: list[AssignmentSimulation]
    workload_impacts: list[WorkloadImpact]
    team_impact: TeamImpact
    recommendations: list[str]
    comparison_to_baseline: dict[str, Any] | None = None


@dataclass
class ScenarioComparison:
    """Comparison between two scenarios."""

    scenario_a_id: str
    scenario_b_id: str
    match_score_delta: float
    workload_balance_delta: float
    growth_opportunity_delta: float
    better_scenario: str
    reasoning: str


class WhatIfAnalyzer:
    """Service for what-if analysis of task assignments."""

    # Workload thresholds (tasks per week)
    UNDERLOADED_THRESHOLD = 2
    OVERLOADED_THRESHOLD = 6
    HOURS_PER_TASK = 8  # Average hours per task

    def __init__(self) -> None:
        """Initialize the what-if analyzer."""
        self._scenarios: dict[str, WhatIfScenario] = {}

    def create_scenario(
        self,
        scenario_name: str,
        tasks: list[dict[str, Any]],
        developers: list[Developer],
        proposed_assignments: list[dict[str, str]],  # [{task_id, developer_id}]
        current_workloads: dict[str, int] | None = None,
    ) -> WhatIfScenario:
        """Create a what-if scenario with proposed assignments.

        Args:
            scenario_name: Name for this scenario.
            tasks: List of tasks with signals.
            developers: Available developers.
            proposed_assignments: Proposed task->developer assignments.
            current_workloads: Current task count per developer.

        Returns:
            WhatIfScenario with full analysis.
        """
        import uuid
        scenario_id = str(uuid.uuid4())[:8]

        current_workloads = current_workloads or {}

        # Build lookup maps
        task_map = {t.get("id") or t.get("task_id"): t for t in tasks}
        dev_map = {str(d.id): d for d in developers}

        # Process assignments
        assignments: list[AssignmentSimulation] = []
        dev_assigned_tasks: dict[str, int] = {}

        for assignment in proposed_assignments:
            task_id = assignment.get("task_id", "")
            developer_id = assignment.get("developer_id", "")

            task = task_map.get(task_id)
            developer = dev_map.get(developer_id)

            if not task or not developer:
                continue

            # Calculate match score
            match_score, skill_match, growth = self._calculate_match(task, developer)

            assignments.append(AssignmentSimulation(
                task_id=task_id,
                task_title=task.get("title", "Unknown"),
                developer_id=developer_id,
                developer_name=developer.name,
                match_score=match_score,
                skill_match=skill_match,
                growth_opportunity=growth,
            ))

            dev_assigned_tasks[developer_id] = dev_assigned_tasks.get(developer_id, 0) + 1

        # Calculate workload impacts
        workload_impacts = []
        for developer in developers:
            dev_id = str(developer.id)
            current = current_workloads.get(dev_id, 0)
            assigned = dev_assigned_tasks.get(dev_id, 0)
            total = current + assigned

            status = "balanced"
            if total < self.UNDERLOADED_THRESHOLD:
                status = "underloaded"
            elif total > self.OVERLOADED_THRESHOLD:
                status = "overloaded"

            workload_impacts.append(WorkloadImpact(
                developer_id=dev_id,
                developer_name=developer.name,
                current_tasks=current,
                assigned_tasks=assigned,
                total_tasks=total,
                workload_status=status,
                estimated_hours=total * self.HOURS_PER_TASK,
            ))

        # Calculate team impact
        team_impact = self._calculate_team_impact(
            tasks, assignments, developers, workload_impacts
        )

        # Generate recommendations
        recommendations = self._generate_recommendations(
            assignments, workload_impacts, team_impact
        )

        scenario = WhatIfScenario(
            scenario_id=scenario_id,
            scenario_name=scenario_name,
            assignments=assignments,
            workload_impacts=workload_impacts,
            team_impact=team_impact,
            recommendations=recommendations,
        )

        self._scenarios[scenario_id] = scenario
        return scenario

    def compare_scenarios(
        self,
        scenario_a: WhatIfScenario,
        scenario_b: WhatIfScenario,
    ) -> ScenarioComparison:
        """Compare two scenarios to determine which is better.

        Args:
            scenario_a: First scenario.
            scenario_b: Second scenario.

        Returns:
            ScenarioComparison with analysis.
        """
        # Calculate metrics for both scenarios
        avg_match_a = scenario_a.team_impact.average_match_score
        avg_match_b = scenario_b.team_impact.average_match_score

        # Workload balance (lower is better - standard deviation of task counts)
        workload_a = self._calculate_workload_balance(scenario_a.workload_impacts)
        workload_b = self._calculate_workload_balance(scenario_b.workload_impacts)

        # Growth distribution (higher average is better)
        growth_a = sum(
            a.growth_opportunity for a in scenario_a.assignments
        ) / max(len(scenario_a.assignments), 1)
        growth_b = sum(
            a.growth_opportunity for a in scenario_b.assignments
        ) / max(len(scenario_b.assignments), 1)

        # Determine better scenario
        score_a = avg_match_a * 0.5 - workload_a * 0.3 + growth_a * 0.2
        score_b = avg_match_b * 0.5 - workload_b * 0.3 + growth_b * 0.2

        better = scenario_a.scenario_id if score_a > score_b else scenario_b.scenario_id

        # Generate reasoning
        reasons = []
        if abs(avg_match_a - avg_match_b) > 0.05:
            better_match = "A" if avg_match_a > avg_match_b else "B"
            reasons.append(f"Scenario {better_match} has better skill matching")
        if abs(workload_a - workload_b) > 0.5:
            better_balance = "A" if workload_a < workload_b else "B"
            reasons.append(f"Scenario {better_balance} has more balanced workload")
        if abs(growth_a - growth_b) > 0.05:
            better_growth = "A" if growth_a > growth_b else "B"
            reasons.append(f"Scenario {better_growth} provides more growth opportunities")

        if not reasons:
            reasons.append("Both scenarios are roughly equivalent")

        return ScenarioComparison(
            scenario_a_id=scenario_a.scenario_id,
            scenario_b_id=scenario_b.scenario_id,
            match_score_delta=round(avg_match_a - avg_match_b, 3),
            workload_balance_delta=round(workload_a - workload_b, 2),
            growth_opportunity_delta=round(growth_a - growth_b, 3),
            better_scenario=better,
            reasoning="; ".join(reasons),
        )

    def optimize_assignments(
        self,
        tasks: list[dict[str, Any]],
        developers: list[Developer],
        constraints: dict[str, Any] | None = None,
    ) -> WhatIfScenario:
        """Generate an optimized assignment scenario.

        Args:
            tasks: Tasks to assign.
            developers: Available developers.
            constraints: Optional constraints (max_per_dev, required_assignments, etc.)

        Returns:
            Optimized WhatIfScenario.
        """
        constraints = constraints or {}
        max_per_dev = constraints.get("max_per_dev", self.OVERLOADED_THRESHOLD)
        current_workloads = constraints.get("current_workloads", {})

        # Calculate all match scores
        match_scores: list[tuple[str, str, float, float, float]] = []  # task_id, dev_id, score, skill, growth

        for task in tasks:
            task_id = task.get("id") or task.get("task_id")
            for developer in developers:
                dev_id = str(developer.id)
                score, skill, growth = self._calculate_match(task, developer)
                match_scores.append((task_id, dev_id, score, skill, growth))

        # Sort by score descending
        match_scores.sort(key=lambda x: x[2], reverse=True)

        # Greedy assignment with constraints
        assignments = []
        assigned_tasks: set[str] = set()
        dev_task_counts: dict[str, int] = {str(d.id): current_workloads.get(str(d.id), 0) for d in developers}

        for task_id, dev_id, score, skill, growth in match_scores:
            if task_id in assigned_tasks:
                continue

            if dev_task_counts.get(dev_id, 0) >= max_per_dev:
                continue

            assignments.append({"task_id": task_id, "developer_id": dev_id})
            assigned_tasks.add(task_id)
            dev_task_counts[dev_id] = dev_task_counts.get(dev_id, 0) + 1

        return self.create_scenario(
            scenario_name="Optimized Assignment",
            tasks=tasks,
            developers=developers,
            proposed_assignments=assignments,
            current_workloads=current_workloads,
        )

    def _calculate_match(
        self,
        task: dict[str, Any],
        developer: Developer,
    ) -> tuple[float, float, float]:
        """Calculate match score between task and developer.

        Returns:
            Tuple of (overall_score, skill_match, growth_opportunity).
        """
        fingerprint = developer.skill_fingerprint or {}

        # Extract developer skills
        dev_languages = {
            s.get("name", "").lower(): s.get("proficiency_score", 0)
            for s in (fingerprint.get("languages") or [])
        }
        dev_frameworks = {
            s.get("name", "").lower(): s.get("proficiency_score", 0)
            for s in (fingerprint.get("frameworks") or [])
        }
        dev_domains = {
            s.get("name", "").lower(): s.get("confidence_score", 0)
            for s in (fingerprint.get("domains") or [])
        }

        # Get task requirements
        task_signals = task.get("signals") or task.get("task_signals") or {}
        required_skills = [s.lower() for s in (task_signals.get("required_skills") or [])]
        preferred_skills = [s.lower() for s in (task_signals.get("preferred_skills") or [])]
        domain = (task_signals.get("domain") or "").lower()

        # Calculate skill match
        skill_matches = 0
        skill_gaps = 0

        for skill in required_skills:
            if skill in dev_languages:
                skill_matches += dev_languages[skill] / 100
            elif skill in dev_frameworks:
                skill_matches += dev_frameworks[skill] / 100
            else:
                skill_gaps += 1

        for skill in preferred_skills:
            if skill in dev_languages or skill in dev_frameworks:
                skill_matches += 0.5

        total_required = len(required_skills) or 1
        skill_match = min(skill_matches / total_required, 1.0)

        # Domain match
        domain_match = 0.5  # Default
        if domain and domain in dev_domains:
            domain_match = dev_domains[domain] / 100

        # Growth opportunity (inverse of skill match for skills they don't have)
        growth_opportunity = 0.0
        if skill_gaps > 0 and skill_match > 0.3:  # They can do it but will learn
            growth_opportunity = min(skill_gaps / total_required, 0.5)

        # Overall score
        overall = skill_match * 0.6 + domain_match * 0.2 + growth_opportunity * 0.2

        return round(overall, 3), round(skill_match, 3), round(growth_opportunity, 3)

    def _calculate_team_impact(
        self,
        tasks: list[dict[str, Any]],
        assignments: list[AssignmentSimulation],
        developers: list[Developer],
        workload_impacts: list[WorkloadImpact],
    ) -> TeamImpact:
        """Calculate the impact on the team."""
        assigned_task_ids = {a.task_id for a in assignments}
        unassigned = [
            t for t in tasks
            if (t.get("id") or t.get("task_id")) not in assigned_task_ids
        ]

        # Average match score
        avg_match = sum(a.match_score for a in assignments) / max(len(assignments), 1)

        # Skill coverage
        skill_coverage: dict[str, float] = {}
        for task in tasks:
            signals = task.get("signals") or task.get("task_signals") or {}
            for skill in (signals.get("required_skills") or []):
                if skill not in skill_coverage:
                    # Check if any developer has this skill
                    coverage = 0.0
                    for dev in developers:
                        fp = dev.skill_fingerprint or {}
                        all_skills = (
                            [s.get("name", "") for s in (fp.get("languages") or [])] +
                            [s.get("name", "") for s in (fp.get("frameworks") or [])]
                        )
                        if skill.lower() in [s.lower() for s in all_skills]:
                            coverage = 1.0
                            break
                    skill_coverage[skill] = coverage

        # Growth distribution
        growth_dist = {}
        for a in assignments:
            if a.growth_opportunity > 0.1:
                growth_dist[a.developer_id] = growth_dist.get(a.developer_id, 0) + 1

        # Warnings
        warnings = []
        overloaded = [w for w in workload_impacts if w.workload_status == "overloaded"]
        if overloaded:
            names = [w.developer_name or w.developer_id for w in overloaded[:3]]
            warnings.append(f"Overloaded developers: {', '.join(names)}")

        uncovered_skills = [s for s, c in skill_coverage.items() if c < 0.5]
        if uncovered_skills:
            warnings.append(f"Skills not covered: {', '.join(uncovered_skills[:3])}")

        if unassigned:
            warnings.append(f"{len(unassigned)} tasks remain unassigned")

        return TeamImpact(
            total_tasks=len(tasks),
            assigned_tasks=len(assignments),
            unassigned_tasks=len(unassigned),
            average_match_score=round(avg_match, 3),
            skill_coverage=skill_coverage,
            growth_distribution=growth_dist,
            warnings=warnings,
        )

    def _calculate_workload_balance(
        self,
        workload_impacts: list[WorkloadImpact],
    ) -> float:
        """Calculate workload balance score (standard deviation)."""
        if not workload_impacts:
            return 0.0

        task_counts = [w.total_tasks for w in workload_impacts]
        mean = sum(task_counts) / len(task_counts)
        variance = sum((x - mean) ** 2 for x in task_counts) / len(task_counts)
        return variance ** 0.5

    def _generate_recommendations(
        self,
        assignments: list[AssignmentSimulation],
        workload_impacts: list[WorkloadImpact],
        team_impact: TeamImpact,
    ) -> list[str]:
        """Generate recommendations for the scenario."""
        recommendations = []

        # Low match scores
        low_matches = [a for a in assignments if a.match_score < 0.5]
        if low_matches:
            recommendations.append(
                f"{len(low_matches)} assignments have low match scores. "
                "Consider reassigning or providing support."
            )

        # Workload imbalance
        overloaded = [w for w in workload_impacts if w.workload_status == "overloaded"]
        underloaded = [w for w in workload_impacts if w.workload_status == "underloaded"]

        if overloaded and underloaded:
            recommendations.append(
                "Workload is unbalanced. Consider redistributing tasks from "
                f"{overloaded[0].developer_name} to {underloaded[0].developer_name}."
            )

        # Growth opportunities
        no_growth = [w for w in workload_impacts if w.developer_id not in team_impact.growth_distribution]
        if no_growth and len(no_growth) < len(workload_impacts):
            recommendations.append(
                "Some developers have no growth assignments. "
                "Consider assigning stretch tasks."
            )

        if not recommendations:
            recommendations.append("Assignment plan looks balanced and well-matched.")

        return recommendations
