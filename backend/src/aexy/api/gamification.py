"""Gamification API endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.gamification_service import GamificationService
from aexy.schemas.gamification import (
    BadgeResponse,
    EarnedBadgeResponse,
    GamificationProfileWithBadges,
    LevelProgress,
    StreakInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gamification", tags=["gamification"])


@router.get("/profile", response_model=GamificationProfileWithBadges)
async def get_gamification_profile(
    developer: Annotated[Developer, Depends(get_current_developer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GamificationProfileWithBadges:
    """Get current user's gamification profile with badges."""
    service = GamificationService(db)
    return await service.get_profile_with_badges(str(developer.id))


@router.get("/badges", response_model=list[BadgeResponse])
async def get_all_badges(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BadgeResponse]:
    """Get all available badges."""
    service = GamificationService(db)
    badges = await service.get_all_badges()
    return [BadgeResponse.model_validate(badge) for badge in badges]


@router.get("/badges/earned", response_model=list[EarnedBadgeResponse])
async def get_earned_badges(
    developer: Annotated[Developer, Depends(get_current_developer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EarnedBadgeResponse]:
    """Get badges earned by the current user."""
    service = GamificationService(db)
    earned = await service.get_earned_badges(str(developer.id))
    return [
        EarnedBadgeResponse(
            id=str(eb.id),
            badge=BadgeResponse.model_validate(eb.badge),
            earned_at=eb.earned_at,
            context=eb.context,
        )
        for eb in earned
    ]


@router.get("/streak", response_model=StreakInfo)
async def get_streak_info(
    developer: Annotated[Developer, Depends(get_current_developer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreakInfo:
    """Get streak information for current user."""
    service = GamificationService(db)
    return await service.get_streak_info(str(developer.id))


@router.get("/level-progress", response_model=LevelProgress)
async def get_level_progress(
    developer: Annotated[Developer, Depends(get_current_developer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LevelProgress:
    """Get level progress for current user."""
    service = GamificationService(db)
    return await service.get_level_progress(str(developer.id))


@router.post("/badges/check", response_model=list[BadgeResponse])
async def check_and_award_badges(
    developer: Annotated[Developer, Depends(get_current_developer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BadgeResponse]:
    """Check and award any newly earned badges."""
    service = GamificationService(db)
    new_badges = await service.check_and_award_badges(str(developer.id))
    return [BadgeResponse.model_validate(badge) for badge in new_badges]


@router.post("/badges/seed")
async def seed_badges(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Seed predefined badges (admin only in production)."""
    service = GamificationService(db)
    created = await service.seed_badges()
    return {
        "message": f"Seeded {len(created)} new badges",
        "badges_created": len(created),
    }
