"""Analysis API endpoints for LLM-powered insights."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.llm.base import AnalysisResult, MatchScore, TaskSignals
from devograph.llm.gateway import get_llm_gateway
from devograph.models.developer import Developer
from devograph.services.code_analyzer import CodeAnalyzer
from devograph.services.peer_benchmarking import PeerBenchmarkingService
from devograph.services.soft_skills_analyzer import SoftSkillsAnalyzer, SoftSkillsProfile
from devograph.services.task_matcher import TaskMatchRequest, TaskMatcher, TaskMatchResult
from devograph.services.whatif_analyzer import WhatIfAnalyzer, WhatIfScenario

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])


# Request/Response models
class AnalyzeCodeRequest(BaseModel):
    """Request to analyze code."""

    code: str = Field(description="Code to analyze")
    file_path: str | None = Field(default=None, description="Optional file path")
    language_hint: str | None = Field(default=None, description="Optional language hint")


class RefreshAnalysisRequest(BaseModel):
    """Request to refresh developer analysis."""

    force: bool = Field(default=False, description="Force re-analysis even if cached")


class DeveloperInsights(BaseModel):
    """LLM-generated insights for a developer."""

    developer_id: str
    skill_summary: str
    strengths: list[str]
    growth_areas: list[str]
    recommended_tasks: list[str]
    soft_skills: SoftSkillsProfile | None = None


class BenchmarkResult(BaseModel):
    """Peer benchmarking result."""

    developer_id: str
    developer_name: str | None
    peer_group_size: int
    percentile_overall: float
    language_comparisons: list[dict[str, Any]]
    framework_comparisons: list[dict[str, Any]]
    domain_comparisons: list[dict[str, Any]]
    strengths: list[str]
    growth_opportunities: list[str]
    recommendations: list[str]


class WhatIfRequest(BaseModel):
    """Request for what-if analysis."""

    scenario_name: str = Field(description="Name for this scenario")
    tasks: list[dict[str, Any]] = Field(description="Tasks to assign")
    proposed_assignments: list[dict[str, str]] = Field(
        description="Proposed assignments [{task_id, developer_id}]"
    )
    current_workloads: dict[str, int] | None = Field(
        default=None, description="Current task count per developer"
    )


class WhatIfResponse(BaseModel):
    """Response from what-if analysis."""

    scenario_id: str
    scenario_name: str
    assignments: list[dict[str, Any]]
    workload_impacts: list[dict[str, Any]]
    team_impact: dict[str, Any]
    recommendations: list[str]


class OptimizeAssignmentsRequest(BaseModel):
    """Request to optimize task assignments."""

    tasks: list[dict[str, Any]] = Field(description="Tasks to assign")
    max_per_developer: int | None = Field(default=None, description="Max tasks per dev")
    current_workloads: dict[str, int] | None = Field(default=None)


class ScenarioComparisonRequest(BaseModel):
    """Request to compare two scenarios."""

    scenario_a: WhatIfRequest
    scenario_b: WhatIfRequest


# Helper functions
def get_code_analyzer() -> CodeAnalyzer:
    """Get code analyzer with LLM gateway."""
    gateway = get_llm_gateway()
    if not gateway:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service not configured",
        )
    return CodeAnalyzer(llm_gateway=gateway)


def get_soft_skills_analyzer() -> SoftSkillsAnalyzer:
    """Get soft skills analyzer with LLM gateway."""
    gateway = get_llm_gateway()
    if not gateway:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service not configured",
        )
    return SoftSkillsAnalyzer(llm_gateway=gateway)


def get_task_matcher() -> TaskMatcher:
    """Get task matcher with LLM gateway."""
    gateway = get_llm_gateway()
    if not gateway:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM service not configured",
        )
    return TaskMatcher(llm_gateway=gateway)


# Endpoints
@router.post("/code", response_model=AnalysisResult)
async def analyze_code(
    request: AnalyzeCodeRequest,
    analyzer: CodeAnalyzer = Depends(get_code_analyzer),
) -> AnalysisResult:
    """Analyze code for skills, frameworks, and domains.

    This endpoint accepts code and returns an analysis of:
    - Programming languages detected
    - Frameworks and libraries used
    - Domain expertise signals
    - Code quality indicators
    """
    try:
        return await analyzer.analyze_code(
            code=request.code,
            file_path=request.file_path,
            language_hint=request.language_hint,
        )
    except Exception as e:
        logger.error(f"Code analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}",
        )


@router.post("/developers/{developer_id}/refresh")
async def refresh_developer_analysis(
    developer_id: str,
    request: RefreshAnalysisRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Trigger on-demand analysis refresh for a developer.

    This will:
    1. Fetch the developer's recent activity
    2. Analyze commits, PRs, and reviews
    3. Update the developer's skill fingerprint
    """
    from devograph.services.profile_sync import ProfileSyncService

    try:
        sync_service = ProfileSyncService()
        developer = await sync_service.sync_developer_profile(developer_id, db)
        await db.commit()

        return {
            "developer_id": developer_id,
            "status": "completed",
            "message": "Analysis refresh completed",
            "skill_fingerprint": developer.skill_fingerprint,
            "work_patterns": developer.work_patterns,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to refresh analysis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis refresh failed: {str(e)}",
        )


@router.get("/developers/{developer_id}/insights", response_model=DeveloperInsights | None)
async def get_developer_insights(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
) -> DeveloperInsights | None:
    """Get LLM-generated insights for a developer.

    Returns a comprehensive analysis including:
    - Skill summary
    - Strengths and growth areas
    - Recommended task types
    - Soft skills profile

    Returns null if no analysis has been performed yet.
    """
    from uuid import UUID

    try:
        dev_uuid = UUID(developer_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid developer ID format",
        )

    # Fetch developer with skill data
    result = await db.execute(select(Developer).where(Developer.id == dev_uuid))
    developer = result.scalar_one_or_none()

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    # Check if developer has any skill data
    skill_fingerprint = developer.skill_fingerprint
    if not skill_fingerprint:
        return None  # No analysis performed yet

    # Extract strengths from top languages/frameworks
    strengths = []
    growth_areas = []
    recommended_tasks = []

    languages = skill_fingerprint.get("languages", [])
    frameworks = skill_fingerprint.get("frameworks", [])
    domains = skill_fingerprint.get("domains", [])

    # Top languages as strengths
    for lang in sorted(languages, key=lambda x: x.get("proficiency_score", 0), reverse=True)[:3]:
        if lang.get("proficiency_score", 0) > 50:
            strengths.append(lang.get("name", ""))

    # Top frameworks as strengths
    for fw in sorted(frameworks, key=lambda x: x.get("proficiency_score", 0), reverse=True)[:2]:
        if fw.get("proficiency_score", 0) > 50:
            strengths.append(fw.get("name", ""))

    # Domains with high confidence as strengths
    for domain in domains:
        if domain.get("confidence_score", 0) > 0.6:
            strengths.append(domain.get("name", "").replace("_", " ").title())

    # Generate skill summary
    if strengths:
        skill_summary = f"Proficient in {', '.join(strengths[:3])}."
    else:
        skill_summary = "Profile analysis in progress. Enable repositories and sync data to generate insights."

    # Remove duplicates and empty strings
    strengths = list(filter(None, dict.fromkeys(strengths)))

    if not strengths:
        return None  # No meaningful data yet

    return DeveloperInsights(
        developer_id=developer_id,
        skill_summary=skill_summary,
        strengths=strengths[:5],
        growth_areas=growth_areas,
        recommended_tasks=recommended_tasks,
        soft_skills=None,
    )


@router.post("/match/task", response_model=TaskMatchResult)
async def match_task_to_developers(
    task: TaskMatchRequest,
    workspace_id: str | None = None,
    team_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    matcher: TaskMatcher = Depends(get_task_matcher),
) -> TaskMatchResult:
    """Find the best developer matches for a task.

    Analyzes the task description to extract required skills,
    then scores all available developers for the best match.

    Args:
        task: Task to match
        workspace_id: Optional workspace to filter developers
        team_id: Optional team to filter developers
    """
    from devograph.models.workspace import WorkspaceMember

    try:
        # Fetch developers based on filters
        if workspace_id:
            # Get developers from workspace
            stmt = (
                select(Developer)
                .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
                .where(WorkspaceMember.workspace_id == workspace_id)
                .where(Developer.skill_fingerprint.isnot(None))
            )
        else:
            # Get all developers with skill fingerprints
            stmt = select(Developer).where(Developer.skill_fingerprint.isnot(None))

        result = await db.execute(stmt)
        developers = result.scalars().all()

        if not developers:
            task_signals = await matcher.extract_task_signals(task)
            return TaskMatchResult(
                task_signals=task_signals,
                candidates=[],
                recommendations=[],
                warnings=["No developers with skill profiles found. Developers need to sync their repositories first."],
            )

        # Convert to dicts for matcher
        developer_dicts = [
            {
                "id": str(dev.id),
                "name": dev.name or dev.email,
                "skill_fingerprint": dev.skill_fingerprint or {},
                "work_patterns": dev.work_patterns or {},
                "growth_trajectory": dev.growth_trajectory or {},
            }
            for dev in developers
        ]

        # Run matching
        return await matcher.match_task(task, developer_dicts)

    except Exception as e:
        logger.error(f"Task matching failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Matching failed: {str(e)}",
        )


@router.post("/match/bulk")
async def bulk_match_tasks(
    tasks: list[TaskMatchRequest],
    workspace_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    matcher: TaskMatcher = Depends(get_task_matcher),
) -> dict[str, TaskMatchResult]:
    """Match multiple tasks to developers.

    Useful for sprint planning where you need to assign
    multiple tasks at once.

    Args:
        tasks: List of tasks to match
        workspace_id: Optional workspace to filter developers
    """
    from devograph.models.workspace import WorkspaceMember

    try:
        # Fetch developers based on filters
        if workspace_id:
            stmt = (
                select(Developer)
                .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
                .where(WorkspaceMember.workspace_id == workspace_id)
                .where(Developer.skill_fingerprint.isnot(None))
            )
        else:
            stmt = select(Developer).where(Developer.skill_fingerprint.isnot(None))

        result = await db.execute(stmt)
        developers = result.scalars().all()

        developer_dicts = [
            {
                "id": str(dev.id),
                "name": dev.name or dev.email,
                "skill_fingerprint": dev.skill_fingerprint or {},
                "work_patterns": dev.work_patterns or {},
                "growth_trajectory": dev.growth_trajectory or {},
            }
            for dev in developers
        ]

        # Match each task
        results = {}
        for task in tasks:
            try:
                match_result = await matcher.match_task(task, developer_dicts)
                results[task.title] = match_result
            except Exception as e:
                logger.warning(f"Failed to match task '{task.title}': {e}")
                task_signals = await matcher.extract_task_signals(task)
                results[task.title] = TaskMatchResult(
                    task_signals=task_signals,
                    candidates=[],
                    recommendations=[],
                    warnings=[f"Matching failed: {str(e)}"],
                )

        return results

    except Exception as e:
        logger.error(f"Bulk task matching failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk matching failed: {str(e)}",
        )


@router.get("/developers/{developer_id}/benchmark", response_model=BenchmarkResult)
async def get_peer_benchmark(
    developer_id: str,
    team_id: str | None = None,
    domain: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> BenchmarkResult:
    """Get peer benchmarking for a developer.

    Compares the developer's skills against their peers
    (team or organization-wide) and provides percentile rankings.
    """
    from uuid import UUID

    try:
        dev_uuid = UUID(developer_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid developer ID format",
        )

    # Fetch developer
    result = await db.execute(select(Developer).where(Developer.id == dev_uuid))
    developer = result.scalar_one_or_none()

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    # Fetch peers (all developers or team members)
    if team_id:
        # TODO: Filter by team when team membership is implemented
        peer_result = await db.execute(select(Developer))
    else:
        peer_result = await db.execute(select(Developer))

    peers = list(peer_result.scalars().all())

    # Run benchmarking
    service = PeerBenchmarkingService()
    benchmark = service.benchmark_developer(
        developer=developer,
        peer_developers=peers,
        filter_by_domain=domain,
    )

    return BenchmarkResult(
        developer_id=developer_id,
        developer_name=benchmark.developer_name,
        peer_group_size=benchmark.peer_group_size,
        percentile_overall=benchmark.overall_percentile,
        language_comparisons=[
            {
                "skill": c.skill_name,
                "score": c.developer_score,
                "peer_avg": c.peer_average,
                "percentile": c.percentile,
                "delta": c.delta,
            }
            for c in benchmark.language_comparisons
        ],
        framework_comparisons=[
            {
                "skill": c.skill_name,
                "score": c.developer_score,
                "peer_avg": c.peer_average,
                "percentile": c.percentile,
                "delta": c.delta,
            }
            for c in benchmark.framework_comparisons
        ],
        domain_comparisons=[
            {
                "skill": c.skill_name,
                "score": c.developer_score,
                "peer_avg": c.peer_average,
                "percentile": c.percentile,
                "delta": c.delta,
            }
            for c in benchmark.domain_comparisons
        ],
        strengths=benchmark.strengths,
        growth_opportunities=benchmark.growth_opportunities,
        recommendations=benchmark.recommendations,
    )


@router.get("/developers/{developer_id}/soft-skills", response_model=SoftSkillsProfile | None)
async def get_soft_skills_profile(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
) -> SoftSkillsProfile | None:
    """Get soft skills profile for a developer.

    Analyzes PR descriptions, code reviews, and comments
    to assess communication, mentorship, collaboration, and leadership.

    Returns null if no soft skills analysis has been performed yet.
    """
    from uuid import UUID

    try:
        dev_uuid = UUID(developer_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid developer ID format",
        )

    # Fetch developer
    result = await db.execute(select(Developer).where(Developer.id == dev_uuid))
    developer = result.scalar_one_or_none()

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    # Check if developer has soft skills data in their profile
    # This would be populated by the analysis pipeline
    # For now, return None to indicate no analysis performed
    return None


@router.get("/tasks/{task_id}/signals", response_model=TaskSignals)
async def get_task_signals(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> TaskSignals:
    """Get extracted signals for a task.

    Shows what skills, complexity, and domain the LLM
    extracted from the task description.
    """
    # TODO: Fetch from database
    return TaskSignals(
        required_skills=[],
        preferred_skills=[],
        domain=None,
        complexity="medium",
    )


# What-if Analysis Endpoints
@router.post("/whatif/scenario", response_model=WhatIfResponse)
async def create_whatif_scenario(
    request: WhatIfRequest,
    db: AsyncSession = Depends(get_db),
) -> WhatIfResponse:
    """Create a what-if scenario to simulate task assignments.

    Analyzes the impact of proposed assignments on:
    - Match quality scores
    - Developer workload balance
    - Team skill coverage
    - Growth opportunities
    """
    # Fetch all developers
    result = await db.execute(select(Developer))
    developers = list(result.scalars().all())

    if not developers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No developers available for assignment",
        )

    analyzer = WhatIfAnalyzer()
    scenario = analyzer.create_scenario(
        scenario_name=request.scenario_name,
        tasks=request.tasks,
        developers=developers,
        proposed_assignments=request.proposed_assignments,
        current_workloads=request.current_workloads,
    )

    return WhatIfResponse(
        scenario_id=scenario.scenario_id,
        scenario_name=scenario.scenario_name,
        assignments=[
            {
                "task_id": a.task_id,
                "task_title": a.task_title,
                "developer_id": a.developer_id,
                "developer_name": a.developer_name,
                "match_score": a.match_score,
                "skill_match": a.skill_match,
                "growth_opportunity": a.growth_opportunity,
            }
            for a in scenario.assignments
        ],
        workload_impacts=[
            {
                "developer_id": w.developer_id,
                "developer_name": w.developer_name,
                "current_tasks": w.current_tasks,
                "assigned_tasks": w.assigned_tasks,
                "total_tasks": w.total_tasks,
                "workload_status": w.workload_status,
                "estimated_hours": w.estimated_hours,
            }
            for w in scenario.workload_impacts
        ],
        team_impact={
            "total_tasks": scenario.team_impact.total_tasks,
            "assigned_tasks": scenario.team_impact.assigned_tasks,
            "unassigned_tasks": scenario.team_impact.unassigned_tasks,
            "average_match_score": scenario.team_impact.average_match_score,
            "skill_coverage": scenario.team_impact.skill_coverage,
            "growth_distribution": scenario.team_impact.growth_distribution,
            "warnings": scenario.team_impact.warnings,
        },
        recommendations=scenario.recommendations,
    )


@router.post("/whatif/optimize", response_model=WhatIfResponse)
async def optimize_assignments(
    request: OptimizeAssignmentsRequest,
    db: AsyncSession = Depends(get_db),
) -> WhatIfResponse:
    """Generate an optimized assignment scenario.

    Uses a greedy algorithm to assign tasks to developers
    based on skill match, experience, and workload balance.
    """
    result = await db.execute(select(Developer))
    developers = list(result.scalars().all())

    if not developers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No developers available for assignment",
        )

    constraints = {}
    if request.max_per_developer:
        constraints["max_per_dev"] = request.max_per_developer
    if request.current_workloads:
        constraints["current_workloads"] = request.current_workloads

    analyzer = WhatIfAnalyzer()
    scenario = analyzer.optimize_assignments(
        tasks=request.tasks,
        developers=developers,
        constraints=constraints,
    )

    return WhatIfResponse(
        scenario_id=scenario.scenario_id,
        scenario_name=scenario.scenario_name,
        assignments=[
            {
                "task_id": a.task_id,
                "task_title": a.task_title,
                "developer_id": a.developer_id,
                "developer_name": a.developer_name,
                "match_score": a.match_score,
                "skill_match": a.skill_match,
                "growth_opportunity": a.growth_opportunity,
            }
            for a in scenario.assignments
        ],
        workload_impacts=[
            {
                "developer_id": w.developer_id,
                "developer_name": w.developer_name,
                "current_tasks": w.current_tasks,
                "assigned_tasks": w.assigned_tasks,
                "total_tasks": w.total_tasks,
                "workload_status": w.workload_status,
                "estimated_hours": w.estimated_hours,
            }
            for w in scenario.workload_impacts
        ],
        team_impact={
            "total_tasks": scenario.team_impact.total_tasks,
            "assigned_tasks": scenario.team_impact.assigned_tasks,
            "unassigned_tasks": scenario.team_impact.unassigned_tasks,
            "average_match_score": scenario.team_impact.average_match_score,
            "skill_coverage": scenario.team_impact.skill_coverage,
            "growth_distribution": scenario.team_impact.growth_distribution,
            "warnings": scenario.team_impact.warnings,
        },
        recommendations=scenario.recommendations,
    )


@router.post("/whatif/compare")
async def compare_scenarios(
    request: ScenarioComparisonRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Compare two assignment scenarios.

    Analyzes which scenario is better based on:
    - Match scores
    - Workload balance
    - Growth opportunities
    """
    result = await db.execute(select(Developer))
    developers = list(result.scalars().all())

    if not developers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No developers available",
        )

    analyzer = WhatIfAnalyzer()

    # Create both scenarios
    scenario_a = analyzer.create_scenario(
        scenario_name=request.scenario_a.scenario_name,
        tasks=request.scenario_a.tasks,
        developers=developers,
        proposed_assignments=request.scenario_a.proposed_assignments,
        current_workloads=request.scenario_a.current_workloads,
    )

    scenario_b = analyzer.create_scenario(
        scenario_name=request.scenario_b.scenario_name,
        tasks=request.scenario_b.tasks,
        developers=developers,
        proposed_assignments=request.scenario_b.proposed_assignments,
        current_workloads=request.scenario_b.current_workloads,
    )

    # Compare them
    comparison = analyzer.compare_scenarios(scenario_a, scenario_b)

    return {
        "scenario_a": {
            "id": comparison.scenario_a_id,
            "name": request.scenario_a.scenario_name,
            "avg_match_score": scenario_a.team_impact.average_match_score,
        },
        "scenario_b": {
            "id": comparison.scenario_b_id,
            "name": request.scenario_b.scenario_name,
            "avg_match_score": scenario_b.team_impact.average_match_score,
        },
        "comparison": {
            "match_score_delta": comparison.match_score_delta,
            "workload_balance_delta": comparison.workload_balance_delta,
            "growth_opportunity_delta": comparison.growth_opportunity_delta,
            "better_scenario": comparison.better_scenario,
            "reasoning": comparison.reasoning,
        },
    }


@router.get("/team/skill-gaps")
async def get_team_skill_gaps(
    target_skills: str,  # Comma-separated list
    team_id: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Analyze team skill gaps for target skills.

    Identifies:
    - Missing skills (gaps)
    - At-risk skills (only one expert)
    - Well-covered skills
    """
    skills_list = [s.strip() for s in target_skills.split(",") if s.strip()]

    if not skills_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No target skills provided",
        )

    result = await db.execute(select(Developer))
    developers = list(result.scalars().all())

    service = PeerBenchmarkingService()
    gaps = service.get_team_skill_gaps(developers, skills_list)

    return gaps
