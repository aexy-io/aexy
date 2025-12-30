"""Gamification service for points, levels, badges, and streaks."""

import logging
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.gamification import (
    Badge,
    DeveloperBadge,
    DeveloperGamification,
    PREDEFINED_BADGES,
)
from devograph.schemas.gamification import (
    BadgeCheckResult,
    BadgeResponse,
    EarnedBadgeResponse,
    GamificationProfileWithBadges,
    LevelProgress,
    StreakInfo,
    get_level_for_points,
    get_level_progress,
)

logger = logging.getLogger(__name__)


# Points configuration
POINTS_CONFIG = {
    "activity_complete": 10,
    "activity_complete_video": 5,
    "activity_complete_course": 25,
    "activity_complete_project": 50,
    "activity_complete_pairing": 20,
    "milestone_complete": 100,
    "path_complete": 500,
    "streak_day_bonus": 5,
    "streak_week_bonus": 50,
    "streak_month_bonus": 200,
}


class GamificationService:
    """Service for gamification features."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize the gamification service."""
        self.db = db

    async def get_or_create_profile(
        self,
        developer_id: str,
    ) -> DeveloperGamification:
        """Get or create a gamification profile for a developer."""
        query = select(DeveloperGamification).where(
            DeveloperGamification.developer_id == developer_id
        ).options(selectinload(DeveloperGamification.earned_badges).selectinload(DeveloperBadge.badge))

        result = await self.db.execute(query)
        profile = result.scalar_one_or_none()

        if not profile:
            profile = DeveloperGamification(developer_id=developer_id)
            self.db.add(profile)
            await self.db.commit()
            await self.db.refresh(profile)
            logger.info(f"Created gamification profile for developer {developer_id}")

        return profile

    async def get_profile_with_badges(
        self,
        developer_id: str,
    ) -> GamificationProfileWithBadges:
        """Get gamification profile with earned badges."""
        profile = await self.get_or_create_profile(developer_id)

        # Get earned badges
        query = (
            select(DeveloperBadge)
            .where(DeveloperBadge.gamification_id == profile.id)
            .options(selectinload(DeveloperBadge.badge))
            .order_by(DeveloperBadge.earned_at.desc())
        )
        result = await self.db.execute(query)
        earned_badges = list(result.scalars().all())

        # Format response
        earned_badge_responses = [
            EarnedBadgeResponse(
                id=str(eb.id),
                badge=BadgeResponse.model_validate(eb.badge),
                earned_at=eb.earned_at,
                context=eb.context,
            )
            for eb in earned_badges
        ]

        return GamificationProfileWithBadges(
            id=str(profile.id),
            developer_id=str(profile.developer_id),
            total_points=profile.total_points,
            level=profile.level,
            level_progress_points=profile.level_progress_points,
            current_streak_days=profile.current_streak_days,
            longest_streak_days=profile.longest_streak_days,
            last_activity_date=profile.last_activity_date,
            activities_completed=profile.activities_completed,
            paths_completed=profile.paths_completed,
            milestones_completed=profile.milestones_completed,
            total_learning_minutes=profile.total_learning_minutes,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
            earned_badges=earned_badge_responses,
            recent_badges=earned_badge_responses[:5],
        )

    async def add_points(
        self,
        developer_id: str,
        points: int,
        source: str,
    ) -> DeveloperGamification:
        """Add points to a developer's profile."""
        profile = await self.get_or_create_profile(developer_id)

        profile.total_points += points
        profile.level_progress_points += points

        # Check for level up
        new_level, _ = get_level_for_points(profile.total_points)
        if new_level > profile.level:
            profile.level = new_level
            logger.info(f"Developer {developer_id} leveled up to {new_level}")

        await self.db.commit()
        await self.db.refresh(profile)

        logger.info(f"Added {points} points to developer {developer_id} (source: {source})")
        return profile

    async def record_activity_completion(
        self,
        developer_id: str,
        activity_type: str,
        time_spent_minutes: int = 0,
    ) -> tuple[DeveloperGamification, list[Badge]]:
        """Record activity completion and award points."""
        profile = await self.get_or_create_profile(developer_id)

        # Determine points based on activity type
        points_key = f"activity_complete_{activity_type}"
        points = POINTS_CONFIG.get(points_key, POINTS_CONFIG["activity_complete"])

        # Update profile
        profile.total_points += points
        profile.activities_completed += 1
        profile.total_learning_minutes += time_spent_minutes

        # Update streak
        today = date.today()
        await self._update_streak(profile, today)

        # Check level
        new_level, _ = get_level_for_points(profile.total_points)
        if new_level > profile.level:
            profile.level = new_level

        await self.db.commit()
        await self.db.refresh(profile)

        # Check for new badges
        new_badges = await self.check_and_award_badges(developer_id)

        return profile, new_badges

    async def record_path_completion(
        self,
        developer_id: str,
    ) -> tuple[DeveloperGamification, list[Badge]]:
        """Record learning path completion."""
        profile = await self.get_or_create_profile(developer_id)

        points = POINTS_CONFIG["path_complete"]
        profile.total_points += points
        profile.paths_completed += 1

        new_level, _ = get_level_for_points(profile.total_points)
        if new_level > profile.level:
            profile.level = new_level

        await self.db.commit()
        await self.db.refresh(profile)

        new_badges = await self.check_and_award_badges(developer_id)
        return profile, new_badges

    async def record_milestone_completion(
        self,
        developer_id: str,
    ) -> tuple[DeveloperGamification, list[Badge]]:
        """Record milestone completion."""
        profile = await self.get_or_create_profile(developer_id)

        points = POINTS_CONFIG["milestone_complete"]
        profile.total_points += points
        profile.milestones_completed += 1

        new_level, _ = get_level_for_points(profile.total_points)
        if new_level > profile.level:
            profile.level = new_level

        await self.db.commit()
        await self.db.refresh(profile)

        new_badges = await self.check_and_award_badges(developer_id)
        return profile, new_badges

    async def _update_streak(
        self,
        profile: DeveloperGamification,
        activity_date: date,
    ) -> None:
        """Update streak based on activity date."""
        if profile.last_activity_date is None:
            # First activity
            profile.current_streak_days = 1
            profile.longest_streak_days = 1
        elif profile.last_activity_date == activity_date:
            # Already recorded today, no change
            pass
        elif profile.last_activity_date == activity_date - timedelta(days=1):
            # Consecutive day
            profile.current_streak_days += 1
            if profile.current_streak_days > profile.longest_streak_days:
                profile.longest_streak_days = profile.current_streak_days

            # Award streak bonuses
            if profile.current_streak_days == 7:
                profile.total_points += POINTS_CONFIG["streak_week_bonus"]
            elif profile.current_streak_days == 30:
                profile.total_points += POINTS_CONFIG["streak_month_bonus"]
            elif profile.current_streak_days > 0:
                profile.total_points += POINTS_CONFIG["streak_day_bonus"]
        else:
            # Streak broken
            profile.current_streak_days = 1

        profile.last_activity_date = activity_date

    async def get_streak_info(
        self,
        developer_id: str,
    ) -> StreakInfo:
        """Get streak information for a developer."""
        profile = await self.get_or_create_profile(developer_id)

        today = date.today()
        is_active_today = profile.last_activity_date == today
        streak_at_risk = (
            profile.current_streak_days > 0
            and not is_active_today
            and profile.last_activity_date == today - timedelta(days=1)
        )

        return StreakInfo(
            current_streak=profile.current_streak_days,
            longest_streak=profile.longest_streak_days,
            last_activity_date=profile.last_activity_date,
            is_active_today=is_active_today,
            streak_at_risk=streak_at_risk,
        )

    async def get_level_progress(
        self,
        developer_id: str,
    ) -> LevelProgress:
        """Get level progress for a developer."""
        profile = await self.get_or_create_profile(developer_id)
        return get_level_progress(profile.total_points)

    # Badge management
    async def seed_badges(self) -> list[Badge]:
        """Seed predefined badges into the database."""
        created_badges = []

        for badge_data in PREDEFINED_BADGES:
            # Check if badge already exists
            query = select(Badge).where(Badge.code == badge_data["code"])
            result = await self.db.execute(query)
            existing = result.scalar_one_or_none()

            if not existing:
                badge = Badge(**badge_data)
                self.db.add(badge)
                created_badges.append(badge)

        if created_badges:
            await self.db.commit()
            logger.info(f"Seeded {len(created_badges)} badges")

        return created_badges

    async def get_all_badges(self) -> list[Badge]:
        """Get all available badges."""
        query = select(Badge).where(Badge.is_active == True).order_by(Badge.category, Badge.rarity)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_earned_badges(
        self,
        developer_id: str,
    ) -> list[DeveloperBadge]:
        """Get all badges earned by a developer."""
        profile = await self.get_or_create_profile(developer_id)

        query = (
            select(DeveloperBadge)
            .where(DeveloperBadge.gamification_id == profile.id)
            .options(selectinload(DeveloperBadge.badge))
            .order_by(DeveloperBadge.earned_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def check_and_award_badges(
        self,
        developer_id: str,
    ) -> list[Badge]:
        """Check if developer has earned any new badges."""
        profile = await self.get_or_create_profile(developer_id)

        # Get already earned badge codes
        earned_query = (
            select(DeveloperBadge.badge_id)
            .where(DeveloperBadge.gamification_id == profile.id)
        )
        earned_result = await self.db.execute(earned_query)
        earned_badge_ids = {row[0] for row in earned_result.fetchall()}

        # Get all active badges
        all_badges = await self.get_all_badges()

        newly_earned = []

        for badge in all_badges:
            if str(badge.id) in earned_badge_ids:
                continue

            if self._check_badge_conditions(badge, profile):
                # Award badge
                developer_badge = DeveloperBadge(
                    gamification_id=profile.id,
                    badge_id=badge.id,
                    context=self._get_badge_context(badge, profile),
                )
                self.db.add(developer_badge)

                # Add badge points
                profile.total_points += badge.points_value

                newly_earned.append(badge)
                logger.info(f"Awarded badge '{badge.code}' to developer {developer_id}")

        if newly_earned:
            # Update level if needed
            new_level, _ = get_level_for_points(profile.total_points)
            if new_level > profile.level:
                profile.level = new_level

            await self.db.commit()

        return newly_earned

    def _check_badge_conditions(
        self,
        badge: Badge,
        profile: DeveloperGamification,
    ) -> bool:
        """Check if a badge's unlock conditions are met."""
        conditions = badge.unlock_conditions
        if not conditions:
            return False

        condition_type = conditions.get("type")

        if condition_type == "activities_completed":
            return profile.activities_completed >= conditions.get("count", 0)
        elif condition_type == "streak":
            return profile.current_streak_days >= conditions.get("days", 0)
        elif condition_type == "paths_completed":
            return profile.paths_completed >= conditions.get("count", 0)
        elif condition_type == "learning_minutes":
            return profile.total_learning_minutes >= conditions.get("minutes", 0)
        elif condition_type == "level":
            return profile.level >= conditions.get("level", 0)

        return False

    def _get_badge_context(
        self,
        badge: Badge,
        profile: DeveloperGamification,
    ) -> dict:
        """Get context for badge earning."""
        conditions = badge.unlock_conditions
        condition_type = conditions.get("type", "")

        if condition_type == "streak":
            return {"streak_days": profile.current_streak_days}
        elif condition_type == "activities_completed":
            return {"activities_count": profile.activities_completed}
        elif condition_type == "learning_minutes":
            return {"minutes": profile.total_learning_minutes}

        return {}
