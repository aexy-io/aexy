"""Learning activity tracking service."""

import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.learning_activity import LearningActivityLog, LearningTimeSession
from aexy.schemas.learning_activity import (
    ActivityCompleteRequest,
    ActivityFilter,
    ActivityLogCreate,
    ActivityLogUpdate,
    ActivityProgressUpdate,
    ActivityStats,
    ActivityStatus,
    DailyActivitySummary,
    TimeSessionCreate,
)

logger = logging.getLogger(__name__)


class LearningActivityService:
    """Service for tracking learning activities."""

    # Points configuration
    POINTS_CONFIG = {
        "video": 5,
        "reading": 10,
        "course": 25,
        "task": 15,
        "pairing": 20,
        "project": 50,
    }

    def __init__(self, db: AsyncSession) -> None:
        """Initialize the learning activity service."""
        self.db = db

    async def create_activity(
        self,
        developer_id: str,
        data: ActivityLogCreate,
    ) -> LearningActivityLog:
        """Create a new activity log entry."""
        activity = LearningActivityLog(
            developer_id=developer_id,
            learning_path_id=data.learning_path_id,
            milestone_id=data.milestone_id,
            activity_type=data.activity_type.value,
            title=data.title,
            description=data.description,
            source=data.source.value,
            external_id=data.external_id,
            external_url=data.external_url,
            thumbnail_url=data.thumbnail_url,
            estimated_duration_minutes=data.estimated_duration_minutes,
            tags=data.tags,
            skill_tags=data.skill_tags,
            extra_data=data.extra_data,
            status="not_started",
            progress_percentage=0,
        )

        self.db.add(activity)
        await self.db.commit()
        await self.db.refresh(activity)

        logger.info(f"Created activity {activity.id} for developer {developer_id}")
        return activity

    async def get_activity(
        self,
        activity_id: str,
        developer_id: str | None = None,
    ) -> LearningActivityLog | None:
        """Get an activity by ID."""
        query = select(LearningActivityLog).where(
            LearningActivityLog.id == activity_id
        )

        if developer_id:
            query = query.where(LearningActivityLog.developer_id == developer_id)

        query = query.options(selectinload(LearningActivityLog.time_sessions))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_activities(
        self,
        developer_id: str,
        filters: ActivityFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LearningActivityLog], int]:
        """List activities with optional filters and pagination."""
        query = select(LearningActivityLog).where(
            LearningActivityLog.developer_id == developer_id
        )

        if filters:
            if filters.activity_type:
                query = query.where(
                    LearningActivityLog.activity_type == filters.activity_type.value
                )
            if filters.source:
                query = query.where(
                    LearningActivityLog.source == filters.source.value
                )
            if filters.status:
                query = query.where(
                    LearningActivityLog.status == filters.status.value
                )
            if filters.learning_path_id:
                query = query.where(
                    LearningActivityLog.learning_path_id == filters.learning_path_id
                )
            if filters.milestone_id:
                query = query.where(
                    LearningActivityLog.milestone_id == filters.milestone_id
                )
            if filters.from_date:
                query = query.where(
                    LearningActivityLog.created_at >= filters.from_date
                )
            if filters.to_date:
                query = query.where(
                    LearningActivityLog.created_at <= filters.to_date
                )
            if filters.skill_tags:
                query = query.where(
                    LearningActivityLog.skill_tags.contains(filters.skill_tags)
                )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningActivityLog.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        activities = list(result.scalars().all())

        return activities, total

    async def update_activity(
        self,
        activity_id: str,
        developer_id: str,
        data: ActivityLogUpdate,
    ) -> LearningActivityLog | None:
        """Update an activity."""
        activity = await self.get_activity(activity_id, developer_id)
        if not activity:
            return None

        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if value is not None:
                if field == "status":
                    setattr(activity, field, value.value if hasattr(value, "value") else value)
                else:
                    setattr(activity, field, value)

        await self.db.commit()
        await self.db.refresh(activity)
        return activity

    async def delete_activity(
        self,
        activity_id: str,
        developer_id: str,
    ) -> bool:
        """Delete an activity."""
        activity = await self.get_activity(activity_id, developer_id)
        if not activity:
            return False

        await self.db.delete(activity)
        await self.db.commit()
        return True

    async def start_activity(
        self,
        activity_id: str,
        developer_id: str,
    ) -> LearningActivityLog | None:
        """Start an activity."""
        activity = await self.get_activity(activity_id, developer_id)
        if not activity:
            return None

        if activity.status == "not_started":
            activity.status = "in_progress"
            activity.started_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(activity)

        return activity

    async def update_progress(
        self,
        activity_id: str,
        developer_id: str,
        data: ActivityProgressUpdate,
    ) -> LearningActivityLog | None:
        """Update activity progress."""
        activity = await self.get_activity(activity_id, developer_id)
        if not activity:
            return None

        # Start if not started
        if activity.status == "not_started":
            activity.status = "in_progress"
            activity.started_at = datetime.utcnow()

        activity.progress_percentage = data.progress_percentage

        if data.notes:
            activity.notes = data.notes

        await self.db.commit()
        await self.db.refresh(activity)
        return activity

    async def complete_activity(
        self,
        activity_id: str,
        developer_id: str,
        data: ActivityCompleteRequest | None = None,
    ) -> LearningActivityLog | None:
        """Complete an activity and award points."""
        activity = await self.get_activity(activity_id, developer_id)
        if not activity:
            return None

        activity.status = "completed"
        activity.progress_percentage = 100
        activity.completed_at = datetime.utcnow()

        # Award points based on activity type
        points = self.POINTS_CONFIG.get(activity.activity_type, 10)
        activity.points_earned = points

        if data:
            if data.rating:
                activity.rating = data.rating
            if data.notes:
                activity.notes = data.notes

        await self.db.commit()
        await self.db.refresh(activity)

        logger.info(
            f"Completed activity {activity_id} for developer {developer_id}, "
            f"awarded {points} points"
        )

        return activity

    # Time session management
    async def start_time_session(
        self,
        activity_id: str,
        developer_id: str,
        data: TimeSessionCreate | None = None,
    ) -> LearningTimeSession | None:
        """Start a new time tracking session."""
        activity = await self.get_activity(activity_id, developer_id)
        if not activity:
            return None

        # End any existing open sessions
        await self._end_open_sessions(activity_id, developer_id)

        # Start activity if not started
        if activity.status == "not_started":
            activity.status = "in_progress"
            activity.started_at = datetime.utcnow()

        session = LearningTimeSession(
            activity_log_id=activity_id,
            developer_id=developer_id,
            notes=data.notes if data else None,
        )

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        return session

    async def end_time_session(
        self,
        activity_id: str,
        developer_id: str,
        notes: str | None = None,
    ) -> LearningTimeSession | None:
        """End the current time tracking session."""
        # Find open session
        query = select(LearningTimeSession).where(
            and_(
                LearningTimeSession.activity_log_id == activity_id,
                LearningTimeSession.developer_id == developer_id,
                LearningTimeSession.ended_at.is_(None),
            )
        )

        result = await self.db.execute(query)
        session = result.scalar_one_or_none()

        if not session:
            return None

        session.ended_at = datetime.utcnow()
        session.duration_minutes = int(
            (session.ended_at - session.started_at).total_seconds() / 60
        )

        if notes:
            session.notes = notes

        # Update activity total time
        activity = await self.get_activity(activity_id, developer_id)
        if activity:
            activity.actual_time_spent_minutes += session.duration_minutes

        await self.db.commit()
        await self.db.refresh(session)

        return session

    async def _end_open_sessions(
        self,
        activity_id: str,
        developer_id: str,
    ) -> None:
        """End any open time sessions for an activity."""
        query = select(LearningTimeSession).where(
            and_(
                LearningTimeSession.activity_log_id == activity_id,
                LearningTimeSession.developer_id == developer_id,
                LearningTimeSession.ended_at.is_(None),
            )
        )

        result = await self.db.execute(query)
        sessions = result.scalars().all()

        now = datetime.utcnow()
        for session in sessions:
            session.ended_at = now
            session.duration_minutes = int(
                (now - session.started_at).total_seconds() / 60
            )

        await self.db.commit()

    # Statistics
    async def get_activity_stats(
        self,
        developer_id: str,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> ActivityStats:
        """Get aggregate activity statistics for a developer."""
        query = select(LearningActivityLog).where(
            LearningActivityLog.developer_id == developer_id
        )

        if from_date:
            query = query.where(LearningActivityLog.created_at >= from_date)
        if to_date:
            query = query.where(LearningActivityLog.created_at <= to_date)

        result = await self.db.execute(query)
        activities = list(result.scalars().all())

        total = len(activities)
        completed = sum(1 for a in activities if a.status == "completed")
        in_progress = sum(1 for a in activities if a.status == "in_progress")
        total_time = sum(a.actual_time_spent_minutes for a in activities)
        total_points = sum(a.points_earned for a in activities)

        # Calculate average rating for rated activities
        rated = [a for a in activities if a.rating is not None]
        avg_rating = sum(a.rating for a in rated) / len(rated) if rated else None

        # Group by type and source
        by_type: dict[str, int] = {}
        by_source: dict[str, int] = {}

        for activity in activities:
            by_type[activity.activity_type] = by_type.get(activity.activity_type, 0) + 1
            by_source[activity.source] = by_source.get(activity.source, 0) + 1

        completion_rate = completed / total if total > 0 else 0.0

        return ActivityStats(
            total_activities=total,
            completed_activities=completed,
            in_progress_activities=in_progress,
            total_time_spent_minutes=total_time,
            total_points_earned=total_points,
            average_rating=avg_rating,
            activities_by_type=by_type,
            activities_by_source=by_source,
            completion_rate=completion_rate,
        )

    async def get_daily_summaries(
        self,
        developer_id: str,
        days: int = 30,
    ) -> list[DailyActivitySummary]:
        """Get daily activity summaries for calendar/heatmap view."""
        start_date = datetime.utcnow() - timedelta(days=days)

        query = select(LearningActivityLog).where(
            and_(
                LearningActivityLog.developer_id == developer_id,
                LearningActivityLog.created_at >= start_date,
            )
        )

        result = await self.db.execute(query)
        activities = list(result.scalars().all())

        # Group by date
        daily_data: dict[str, dict[str, Any]] = {}

        for activity in activities:
            date_str = activity.created_at.date().isoformat()

            if date_str not in daily_data:
                daily_data[date_str] = {
                    "activities_count": 0,
                    "time_spent_minutes": 0,
                    "points_earned": 0,
                }

            daily_data[date_str]["activities_count"] += 1
            daily_data[date_str]["time_spent_minutes"] += activity.actual_time_spent_minutes
            daily_data[date_str]["points_earned"] += activity.points_earned

        return [
            DailyActivitySummary(
                date=date_str,
                activities_count=data["activities_count"],
                time_spent_minutes=data["time_spent_minutes"],
                points_earned=data["points_earned"],
            )
            for date_str, data in sorted(daily_data.items())
        ]

    async def get_activities_for_path(
        self,
        developer_id: str,
        learning_path_id: str,
    ) -> list[LearningActivityLog]:
        """Get all activities for a specific learning path."""
        query = select(LearningActivityLog).where(
            and_(
                LearningActivityLog.developer_id == developer_id,
                LearningActivityLog.learning_path_id == learning_path_id,
            )
        ).order_by(LearningActivityLog.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_activities_for_milestone(
        self,
        developer_id: str,
        milestone_id: str,
    ) -> list[LearningActivityLog]:
        """Get all activities for a specific milestone."""
        query = select(LearningActivityLog).where(
            and_(
                LearningActivityLog.developer_id == developer_id,
                LearningActivityLog.milestone_id == milestone_id,
            )
        ).order_by(LearningActivityLog.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())
