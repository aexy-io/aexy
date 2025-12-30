"""Learning activity tracking API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.schemas.learning_activity import (
    ActivityCompleteRequest,
    ActivityFilter,
    ActivityHistory,
    ActivityLogCreate,
    ActivityLogResponse,
    ActivityLogUpdate,
    ActivityLogWithSessions,
    ActivityProgressUpdate,
    ActivitySource,
    ActivityStats,
    ActivityStatus,
    ActivityType,
    DailyActivitySummary,
    TimeSessionCreate,
    TimeSessionEnd,
    TimeSessionResponse,
)
from devograph.services.learning_activity_service import LearningActivityService

router = APIRouter(prefix="/learning/activities")


@router.post("", response_model=ActivityLogResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    data: ActivityLogCreate,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a new learning activity.

    Args:
        data: Activity data.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Created activity.
    """
    service = LearningActivityService(db)
    activity = await service.create_activity(developer_id, data)
    return ActivityLogResponse.model_validate(activity)


@router.get("", response_model=ActivityHistory)
async def list_activities(
    developer_id: str,
    activity_type: ActivityType | None = None,
    source: ActivitySource | None = None,
    activity_status: ActivityStatus | None = Query(None, alias="status"),
    learning_path_id: str | None = None,
    milestone_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List learning activities with optional filters.

    Args:
        developer_id: Developer UUID.
        activity_type: Filter by activity type.
        source: Filter by source.
        activity_status: Filter by status.
        learning_path_id: Filter by learning path.
        milestone_id: Filter by milestone.
        page: Page number.
        page_size: Items per page.
        db: Database session.

    Returns:
        Paginated activity list.
    """
    service = LearningActivityService(db)

    filters = ActivityFilter(
        activity_type=activity_type,
        source=source,
        status=activity_status,
        learning_path_id=learning_path_id,
        milestone_id=milestone_id,
    )

    activities, total = await service.list_activities(
        developer_id=developer_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return ActivityHistory(
        activities=[ActivityLogResponse.model_validate(a) for a in activities],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/stats", response_model=ActivityStats)
async def get_activity_stats(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate activity statistics for a developer.

    Args:
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Activity statistics.
    """
    service = LearningActivityService(db)
    return await service.get_activity_stats(developer_id)


@router.get("/daily-summaries", response_model=list[DailyActivitySummary])
async def get_daily_summaries(
    developer_id: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Get daily activity summaries for calendar/heatmap view.

    Args:
        developer_id: Developer UUID.
        days: Number of days to look back.
        db: Database session.

    Returns:
        List of daily summaries.
    """
    service = LearningActivityService(db)
    return await service.get_daily_summaries(developer_id, days)


@router.get("/{activity_id}", response_model=ActivityLogWithSessions)
async def get_activity(
    activity_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific activity with time sessions.

    Args:
        activity_id: Activity UUID.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Activity with time sessions.
    """
    service = LearningActivityService(db)
    activity = await service.get_activity(activity_id, developer_id)

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    return ActivityLogWithSessions.model_validate(activity)


@router.patch("/{activity_id}", response_model=ActivityLogResponse)
async def update_activity(
    activity_id: str,
    data: ActivityLogUpdate,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Update an activity.

    Args:
        activity_id: Activity UUID.
        data: Update data.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Updated activity.
    """
    service = LearningActivityService(db)
    activity = await service.update_activity(activity_id, developer_id, data)

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    return ActivityLogResponse.model_validate(activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete an activity.

    Args:
        activity_id: Activity UUID.
        developer_id: Developer UUID.
        db: Database session.
    """
    service = LearningActivityService(db)
    deleted = await service.delete_activity(activity_id, developer_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )


@router.post("/{activity_id}/start", response_model=ActivityLogResponse)
async def start_activity(
    activity_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Start an activity.

    Args:
        activity_id: Activity UUID.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Started activity.
    """
    service = LearningActivityService(db)
    activity = await service.start_activity(activity_id, developer_id)

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    return ActivityLogResponse.model_validate(activity)


@router.post("/{activity_id}/progress", response_model=ActivityLogResponse)
async def update_progress(
    activity_id: str,
    data: ActivityProgressUpdate,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Update activity progress.

    Args:
        activity_id: Activity UUID.
        data: Progress data.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Updated activity.
    """
    service = LearningActivityService(db)
    activity = await service.update_progress(activity_id, developer_id, data)

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    return ActivityLogResponse.model_validate(activity)


@router.post("/{activity_id}/complete", response_model=ActivityLogResponse)
async def complete_activity(
    activity_id: str,
    data: ActivityCompleteRequest | None = None,
    developer_id: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Complete an activity and earn points.

    Args:
        activity_id: Activity UUID.
        data: Completion data.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Completed activity with points earned.
    """
    service = LearningActivityService(db)
    activity = await service.complete_activity(activity_id, developer_id, data)

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    return ActivityLogResponse.model_validate(activity)


# Time session endpoints
@router.post("/{activity_id}/sessions/start", response_model=TimeSessionResponse)
async def start_time_session(
    activity_id: str,
    data: TimeSessionCreate | None = None,
    developer_id: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Start a time tracking session for an activity.

    Args:
        activity_id: Activity UUID.
        data: Session data.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Started time session.
    """
    service = LearningActivityService(db)
    session = await service.start_time_session(activity_id, developer_id, data)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    return TimeSessionResponse.model_validate(session)


@router.post("/{activity_id}/sessions/end", response_model=TimeSessionResponse)
async def end_time_session(
    activity_id: str,
    data: TimeSessionEnd | None = None,
    developer_id: str = "",
    db: AsyncSession = Depends(get_db),
):
    """End the current time tracking session.

    Args:
        activity_id: Activity UUID.
        data: End session data.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        Ended time session with duration.
    """
    service = LearningActivityService(db)
    notes = data.notes if data else None
    session = await service.end_time_session(activity_id, developer_id, notes)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active session found",
        )

    return TimeSessionResponse.model_validate(session)


# Path-specific endpoints
@router.get("/by-path/{path_id}", response_model=list[ActivityLogResponse])
async def get_activities_for_path(
    path_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all activities for a specific learning path.

    Args:
        path_id: Learning path UUID.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        List of activities.
    """
    service = LearningActivityService(db)
    activities = await service.get_activities_for_path(developer_id, path_id)
    return [ActivityLogResponse.model_validate(a) for a in activities]


@router.get("/by-milestone/{milestone_id}", response_model=list[ActivityLogResponse])
async def get_activities_for_milestone(
    milestone_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all activities for a specific milestone.

    Args:
        milestone_id: Milestone UUID.
        developer_id: Developer UUID.
        db: Database session.

    Returns:
        List of activities.
    """
    service = LearningActivityService(db)
    activities = await service.get_activities_for_milestone(developer_id, milestone_id)
    return [ActivityLogResponse.model_validate(a) for a in activities]
