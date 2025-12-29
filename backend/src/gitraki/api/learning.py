"""Learning path API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gitraki.core.database import get_db
from gitraki.llm.gateway import get_llm_gateway
from gitraki.schemas.career import (
    LearningActivity,
    LearningMilestoneResponse,
    LearningPathGenerate,
    LearningPathResponse,
    MilestoneStatus,
    PathProgressUpdate,
    StretchAssignment,
    TrajectoryStatus,
)
from gitraki.services.developer_service import DeveloperService
from gitraki.services.learning_path import LearningPathService

router = APIRouter(prefix="/learning")


@router.get("/paths", response_model=list[LearningPathResponse])
async def list_learning_paths(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all learning paths for a developer.

    Args:
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        List of learning paths.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)
    paths = await service.get_developer_paths(developer_id)

    return [
        LearningPathResponse(
            id=str(p.id),
            developer_id=str(p.developer_id),
            target_role_id=str(p.target_role_id) if p.target_role_id else None,
            target_role_name=p.target_role.name if p.target_role else None,
            skill_gaps=p.skill_gaps or {},
            phases=p.phases or [],
            milestones=[],  # Loaded separately
            status=p.status,
            progress_percentage=p.progress_percentage,
            trajectory_status=p.trajectory_status,
            estimated_success_probability=p.estimated_success_probability,
            risk_factors=p.risk_factors or [],
            recommendations=p.recommendations or [],
            started_at=p.started_at,
            target_completion=p.target_completion,
            actual_completion=p.actual_completion,
            generated_by_model=p.generated_by_model,
            last_regenerated_at=p.last_regenerated_at,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in paths
    ]


@router.post("/paths", response_model=LearningPathResponse, status_code=status.HTTP_201_CREATED)
async def generate_learning_path(
    data: LearningPathGenerate,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate a new learning path for a developer.

    Args:
        data: Path generation parameters.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Generated learning path.
    """
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(developer_id)

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)

    try:
        path = await service.generate_learning_path(
            developer=developer,
            target_role_id=data.target_role_id,
            timeline_months=data.timeline_months,
            include_external_resources=data.include_external_resources,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return LearningPathResponse(
        id=str(path.id),
        developer_id=str(path.developer_id),
        target_role_id=str(path.target_role_id) if path.target_role_id else None,
        target_role_name=None,
        skill_gaps=path.skill_gaps or {},
        phases=path.phases or [],
        milestones=[],
        status=path.status,
        progress_percentage=path.progress_percentage,
        trajectory_status=path.trajectory_status,
        estimated_success_probability=path.estimated_success_probability,
        risk_factors=path.risk_factors or [],
        recommendations=path.recommendations or [],
        started_at=path.started_at,
        target_completion=path.target_completion,
        actual_completion=path.actual_completion,
        generated_by_model=path.generated_by_model,
        last_regenerated_at=path.last_regenerated_at,
        created_at=path.created_at,
        updated_at=path.updated_at,
    )


@router.get("/paths/{path_id}", response_model=LearningPathResponse)
async def get_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a learning path by ID.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        Learning path with milestones.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)
    path = await service.get_learning_path(path_id)

    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    # Get milestones
    milestones = await service.get_milestones(path_id)
    milestone_responses = [
        LearningMilestoneResponse(
            id=str(m.id),
            learning_path_id=str(m.learning_path_id),
            skill_name=m.skill_name,
            target_score=m.target_score,
            current_score=m.current_score,
            status=MilestoneStatus(m.status),
            target_date=m.target_date,
            completed_date=m.completed_date,
            recommended_activities=m.recommended_activities or [],
            completed_activities=m.completed_activities or [],
            sequence=m.sequence,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in milestones
    ]

    return LearningPathResponse(
        id=str(path.id),
        developer_id=str(path.developer_id),
        target_role_id=str(path.target_role_id) if path.target_role_id else None,
        target_role_name=path.target_role.name if path.target_role else None,
        skill_gaps=path.skill_gaps or {},
        phases=path.phases or [],
        milestones=milestone_responses,
        status=path.status,
        progress_percentage=path.progress_percentage,
        trajectory_status=path.trajectory_status,
        estimated_success_probability=path.estimated_success_probability,
        risk_factors=path.risk_factors or [],
        recommendations=path.recommendations or [],
        started_at=path.started_at,
        target_completion=path.target_completion,
        actual_completion=path.actual_completion,
        generated_by_model=path.generated_by_model,
        last_regenerated_at=path.last_regenerated_at,
        created_at=path.created_at,
        updated_at=path.updated_at,
    )


@router.post("/paths/{path_id}/regenerate", response_model=LearningPathResponse)
async def regenerate_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Regenerate a learning path with updated data.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        Updated learning path.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)

    # Get the path first
    path = await service.get_learning_path(path_id)
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    # Get the developer
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(str(path.developer_id))

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    # Regenerate
    updated_path = await service.regenerate_path(path_id, developer)

    if not updated_path:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to regenerate path",
        )

    return LearningPathResponse(
        id=str(updated_path.id),
        developer_id=str(updated_path.developer_id),
        target_role_id=str(updated_path.target_role_id) if updated_path.target_role_id else None,
        target_role_name=updated_path.target_role.name if updated_path.target_role else None,
        skill_gaps=updated_path.skill_gaps or {},
        phases=updated_path.phases or [],
        milestones=[],
        status=updated_path.status,
        progress_percentage=updated_path.progress_percentage,
        trajectory_status=updated_path.trajectory_status,
        estimated_success_probability=updated_path.estimated_success_probability,
        risk_factors=updated_path.risk_factors or [],
        recommendations=updated_path.recommendations or [],
        started_at=updated_path.started_at,
        target_completion=updated_path.target_completion,
        actual_completion=updated_path.actual_completion,
        generated_by_model=updated_path.generated_by_model,
        last_regenerated_at=updated_path.last_regenerated_at,
        created_at=updated_path.created_at,
        updated_at=updated_path.updated_at,
    )


@router.get("/paths/{path_id}/progress", response_model=PathProgressUpdate)
async def get_path_progress(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get progress summary for a learning path.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        Progress update summary.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)

    # Get the path
    path = await service.get_learning_path(path_id)
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    # Get the developer and update progress
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(str(path.developer_id))

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    update = await service.update_progress(path_id, developer)

    if not update:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update progress",
        )

    return PathProgressUpdate(
        path_id=update.path_id,
        previous_progress=update.previous_progress,
        new_progress=update.new_progress,
        milestones_completed=update.milestones_completed,
        skills_improved=update.skills_improved,
        trajectory_status=TrajectoryStatus(update.trajectory_status),
    )


@router.get("/paths/{path_id}/milestones", response_model=list[LearningMilestoneResponse])
async def get_path_milestones(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get milestones for a learning path.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        List of milestones.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)

    # Verify path exists
    path = await service.get_learning_path(path_id)
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    milestones = await service.get_milestones(path_id)

    return [
        LearningMilestoneResponse(
            id=str(m.id),
            learning_path_id=str(m.learning_path_id),
            skill_name=m.skill_name,
            target_score=m.target_score,
            current_score=m.current_score,
            status=MilestoneStatus(m.status),
            target_date=m.target_date,
            completed_date=m.completed_date,
            recommended_activities=m.recommended_activities or [],
            completed_activities=m.completed_activities or [],
            sequence=m.sequence,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in milestones
    ]


@router.get("/paths/{path_id}/activities", response_model=list[LearningActivity])
async def get_recommended_activities(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get recommended activities for a learning path.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        List of recommended activities.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)

    # Verify path exists
    path = await service.get_learning_path(path_id)
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    activities = await service.get_recommended_activities(path_id)

    return [
        LearningActivity(
            type=a.type,
            description=a.description,
            source=a.source,
            url=a.url,
            estimated_hours=a.estimated_hours,
        )
        for a in activities
    ]


@router.get("/developers/{developer_id}/stretch-tasks", response_model=list[StretchAssignment])
async def get_stretch_assignments(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get stretch assignment recommendations for a developer.

    Args:
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        List of stretch assignments.
    """
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(developer_id)

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)

    # TODO: Get actual available tasks from task sources
    # For now, return empty list if no active path
    active_path = await service.get_active_path(developer_id)
    if not active_path:
        return []

    # In a real implementation, we'd fetch tasks from Jira/Linear/GitHub
    available_tasks: list[dict[str, Any]] = []
    assignments = await service.get_stretch_assignments(developer, available_tasks)

    return [
        StretchAssignment(
            task_id=a.task_id,
            task_title=a.task_title,
            source=a.source,
            skill_growth=a.skill_growth,
            alignment_score=a.alignment_score,
            challenge_level=a.challenge_level,
        )
        for a in assignments
    ]


@router.post("/paths/{path_id}/pause")
async def pause_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Pause a learning path.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        Success status.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)
    success = await service.pause_path(path_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    return {"status": "paused", "path_id": path_id}


@router.post("/paths/{path_id}/resume")
async def resume_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused learning path.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        Success status.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)
    success = await service.resume_path(path_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    return {"status": "active", "path_id": path_id}


@router.post("/paths/{path_id}/abandon")
async def abandon_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Abandon a learning path.

    Args:
        path_id: Learning path UUID.
        db: Database session.

    Returns:
        Success status.
    """
    llm_gateway = get_llm_gateway()
    service = LearningPathService(db, llm_gateway)
    success = await service.abandon_path(path_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found",
        )

    return {"status": "abandoned", "path_id": path_id}
