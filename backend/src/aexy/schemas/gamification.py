"""Gamification Pydantic schemas."""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class BadgeCategory(str, Enum):
    """Badge category types."""

    ACHIEVEMENT = "achievement"
    STREAK = "streak"
    SKILL = "skill"
    MILESTONE = "milestone"


class BadgeRarity(str, Enum):
    """Badge rarity levels."""

    COMMON = "common"
    RARE = "rare"
    EPIC = "epic"
    LEGENDARY = "legendary"


# Badge schemas
class BadgeBase(BaseModel):
    """Base badge schema."""

    code: str
    name: str
    description: str
    icon: str
    category: BadgeCategory
    rarity: BadgeRarity = BadgeRarity.COMMON
    points_value: int = 10


class BadgeResponse(BadgeBase):
    """Badge response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    unlock_conditions: dict = {}
    is_active: bool = True
    created_at: datetime


class EarnedBadgeResponse(BaseModel):
    """Earned badge response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    badge: BadgeResponse
    earned_at: datetime
    context: dict | None = None


# Gamification Profile schemas
class GamificationProfileResponse(BaseModel):
    """Gamification profile response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    total_points: int
    level: int
    level_progress_points: int
    current_streak_days: int
    longest_streak_days: int
    last_activity_date: date | None
    activities_completed: int
    paths_completed: int
    milestones_completed: int
    total_learning_minutes: int
    created_at: datetime
    updated_at: datetime


class GamificationProfileWithBadges(GamificationProfileResponse):
    """Gamification profile with earned badges."""

    earned_badges: list[EarnedBadgeResponse] = []
    recent_badges: list[EarnedBadgeResponse] = []  # Last 5 earned


# Level system
class LevelInfo(BaseModel):
    """Level information."""

    level: int
    name: str
    min_points: int
    max_points: int | None  # None for max level


class LevelProgress(BaseModel):
    """Current level progress."""

    current_level: int
    current_level_name: str
    points_in_level: int
    points_for_next_level: int
    progress_percentage: float = Field(ge=0, le=100)
    next_level: int | None


# Streak information
class StreakInfo(BaseModel):
    """Streak information."""

    current_streak: int
    longest_streak: int
    last_activity_date: date | None
    is_active_today: bool
    streak_at_risk: bool  # True if no activity today and streak > 0


# Points event
class PointsEvent(BaseModel):
    """Points earned event."""

    points: int
    source: str  # "activity_complete", "badge_earned", "streak_bonus"
    description: str
    timestamp: datetime


class PointsHistory(BaseModel):
    """Points history response."""

    events: list[PointsEvent]
    total_points: int


# Badge check result
class BadgeCheckResult(BaseModel):
    """Result of badge check."""

    newly_earned: list[BadgeResponse]
    already_earned: list[str]  # Badge codes
    close_to_earning: list[dict]  # Badges close to unlock with progress


# Leaderboard
class LeaderboardEntry(BaseModel):
    """Leaderboard entry."""

    rank: int
    developer_id: str
    developer_name: str | None
    developer_avatar: str | None
    points: int
    level: int
    streak_days: int


class LeaderboardResponse(BaseModel):
    """Leaderboard response."""

    scope: str  # "global", "workspace", "team"
    period: str  # "all_time", "monthly", "weekly"
    entries: list[LeaderboardEntry]
    user_rank: int | None  # Current user's rank
    total_participants: int


# Level thresholds
LEVEL_THRESHOLDS = [
    (1, 0, "Beginner"),
    (2, 100, "Learner"),
    (3, 300, "Student"),
    (4, 600, "Practitioner"),
    (5, 1000, "Skilled"),
    (6, 1500, "Proficient"),
    (7, 2200, "Advanced"),
    (8, 3000, "Expert"),
    (9, 4000, "Master"),
    (10, 5500, "Grandmaster"),
]


def get_level_for_points(points: int) -> tuple[int, str]:
    """Get level and name for given points."""
    level = 1
    name = "Beginner"
    for lvl, threshold, lvl_name in LEVEL_THRESHOLDS:
        if points >= threshold:
            level = lvl
            name = lvl_name
    return level, name


def get_level_progress(points: int) -> LevelProgress:
    """Calculate level progress."""
    current_level, current_name = get_level_for_points(points)

    # Find current and next level thresholds
    current_threshold = 0
    next_threshold = None
    next_level = None

    for i, (lvl, threshold, _) in enumerate(LEVEL_THRESHOLDS):
        if lvl == current_level:
            current_threshold = threshold
            if i + 1 < len(LEVEL_THRESHOLDS):
                next_level = LEVEL_THRESHOLDS[i + 1][0]
                next_threshold = LEVEL_THRESHOLDS[i + 1][1]
            break

    points_in_level = points - current_threshold
    points_for_next = (next_threshold - current_threshold) if next_threshold else 0

    progress = (points_in_level / points_for_next * 100) if points_for_next > 0 else 100

    return LevelProgress(
        current_level=current_level,
        current_level_name=current_name,
        points_in_level=points_in_level,
        points_for_next_level=points_for_next,
        progress_percentage=min(progress, 100),
        next_level=next_level,
    )
