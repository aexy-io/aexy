"""Gamification models for learning engagement."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


class DeveloperGamification(Base):
    """Gamification profile for a developer.

    Tracks points, level, streaks, and aggregate stats.
    """

    __tablename__ = "developer_gamification"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Points and level
    total_points: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    level_progress_points: Mapped[int] = mapped_column(Integer, default=0)

    # Streak tracking
    current_streak_days: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Aggregate stats
    activities_completed: Mapped[int] = mapped_column(Integer, default=0)
    paths_completed: Mapped[int] = mapped_column(Integer, default=0)
    milestones_completed: Mapped[int] = mapped_column(Integer, default=0)
    total_learning_minutes: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="gamification",
    )
    earned_badges: Mapped[list["DeveloperBadge"]] = relationship(
        "DeveloperBadge",
        back_populates="gamification",
        cascade="all, delete-orphan",
    )


class Badge(Base):
    """Badge definition.

    Defines available badges that developers can earn.
    """

    __tablename__ = "badges"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(50))  # Icon name or emoji
    category: Mapped[str] = mapped_column(
        String(50),
    )  # "achievement", "streak", "skill", "milestone"
    rarity: Mapped[str] = mapped_column(
        String(20),
        default="common",
    )  # "common", "rare", "epic", "legendary"
    points_value: Mapped[int] = mapped_column(Integer, default=10)

    # Unlock conditions stored as JSON
    unlock_conditions: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example: {"type": "streak", "days": 7} or {"type": "activities_completed", "count": 100}

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    earned_by: Mapped[list["DeveloperBadge"]] = relationship(
        "DeveloperBadge",
        back_populates="badge",
    )


class DeveloperBadge(Base):
    """Badge earned by a developer.

    Junction table between developers and badges.
    """

    __tablename__ = "developer_badges"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    gamification_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developer_gamification.id", ondelete="CASCADE"),
        index=True,
    )
    badge_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("badges.id", ondelete="CASCADE"),
        index=True,
    )

    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Context about how badge was earned (optional)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Example: {"activity_id": "...", "streak_days": 7}

    # Relationships
    gamification: Mapped["DeveloperGamification"] = relationship(
        "DeveloperGamification",
        back_populates="earned_badges",
    )
    badge: Mapped["Badge"] = relationship(
        "Badge",
        back_populates="earned_by",
    )


# Predefined badges to seed
PREDEFINED_BADGES = [
    {
        "code": "first_step",
        "name": "First Step",
        "description": "Complete your first learning activity",
        "icon": "footprints",
        "category": "achievement",
        "rarity": "common",
        "points_value": 10,
        "unlock_conditions": {"type": "activities_completed", "count": 1},
    },
    {
        "code": "getting_started",
        "name": "Getting Started",
        "description": "Complete 5 learning activities",
        "icon": "rocket",
        "category": "achievement",
        "rarity": "common",
        "points_value": 25,
        "unlock_conditions": {"type": "activities_completed", "count": 5},
    },
    {
        "code": "dedicated_learner",
        "name": "Dedicated Learner",
        "description": "Complete 25 learning activities",
        "icon": "book-open",
        "category": "achievement",
        "rarity": "rare",
        "points_value": 100,
        "unlock_conditions": {"type": "activities_completed", "count": 25},
    },
    {
        "code": "century_club",
        "name": "Century Club",
        "description": "Complete 100 learning activities",
        "icon": "trophy",
        "category": "achievement",
        "rarity": "epic",
        "points_value": 500,
        "unlock_conditions": {"type": "activities_completed", "count": 100},
    },
    {
        "code": "streak_3",
        "name": "Hat Trick",
        "description": "Maintain a 3-day learning streak",
        "icon": "flame",
        "category": "streak",
        "rarity": "common",
        "points_value": 15,
        "unlock_conditions": {"type": "streak", "days": 3},
    },
    {
        "code": "streak_7",
        "name": "Week Warrior",
        "description": "Maintain a 7-day learning streak",
        "icon": "flame",
        "category": "streak",
        "rarity": "rare",
        "points_value": 50,
        "unlock_conditions": {"type": "streak", "days": 7},
    },
    {
        "code": "streak_30",
        "name": "Monthly Master",
        "description": "Maintain a 30-day learning streak",
        "icon": "fire",
        "category": "streak",
        "rarity": "epic",
        "points_value": 200,
        "unlock_conditions": {"type": "streak", "days": 30},
    },
    {
        "code": "streak_100",
        "name": "Centurion",
        "description": "Maintain a 100-day learning streak",
        "icon": "crown",
        "category": "streak",
        "rarity": "legendary",
        "points_value": 1000,
        "unlock_conditions": {"type": "streak", "days": 100},
    },
    {
        "code": "first_path",
        "name": "Pathfinder",
        "description": "Complete your first learning path",
        "icon": "map",
        "category": "milestone",
        "rarity": "rare",
        "points_value": 200,
        "unlock_conditions": {"type": "paths_completed", "count": 1},
    },
    {
        "code": "time_10h",
        "name": "Time Investor",
        "description": "Spend 10 hours learning",
        "icon": "clock",
        "category": "achievement",
        "rarity": "rare",
        "points_value": 100,
        "unlock_conditions": {"type": "learning_minutes", "minutes": 600},
    },
    {
        "code": "time_50h",
        "name": "Knowledge Seeker",
        "description": "Spend 50 hours learning",
        "icon": "hourglass",
        "category": "achievement",
        "rarity": "epic",
        "points_value": 300,
        "unlock_conditions": {"type": "learning_minutes", "minutes": 3000},
    },
    {
        "code": "level_5",
        "name": "Rising Star",
        "description": "Reach level 5",
        "icon": "star",
        "category": "achievement",
        "rarity": "rare",
        "points_value": 100,
        "unlock_conditions": {"type": "level", "level": 5},
    },
    {
        "code": "level_10",
        "name": "Expert",
        "description": "Reach level 10",
        "icon": "medal",
        "category": "achievement",
        "rarity": "legendary",
        "points_value": 500,
        "unlock_conditions": {"type": "level", "level": 10},
    },
]
