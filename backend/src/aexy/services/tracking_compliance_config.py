"""Per-workspace threshold configuration for tracking and compliance automation.

Stores thresholds in Workspace.settings JSONB under
`settings.tracking_automation` and `settings.compliance_automation`.
Provides helpers that merge workspace overrides with sensible defaults.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.workspace import Workspace

logger = logging.getLogger(__name__)


TRACKING_DEFAULTS: dict = {
    "standup_deadline_hour": 10,
    "standup_deadline_timezone": "America/New_York",
    "time_entry_daily_min_minutes": 360,   # 6h
    "time_entry_daily_max_minutes": 720,   # 12h
    "time_entry_weekly_min_minutes": 1800, # 30h
    "blocker_stale_days": 3,
    "participation_low_threshold": 0.7,
    "streak_milestones": [7, 14, 30, 60, 90],
    "sentiment_negative_threshold": 0.3,
}

COMPLIANCE_DEFAULTS: dict = {
    "approaching_due_days": [14, 7, 3, 1],
    "certification_expiring_days": [90, 60, 30, 14, 7],
    "bulk_overdue_threshold": 0.8,
}


async def get_tracking_config(db: AsyncSession, workspace_id: str) -> dict:
    """Read tracking automation config, merging workspace overrides over defaults."""
    result = await db.execute(
        select(Workspace.settings).where(Workspace.id == workspace_id)
    )
    settings = result.scalar_one_or_none() or {}
    overrides = settings.get("tracking_automation", {}) if isinstance(settings, dict) else {}
    return {**TRACKING_DEFAULTS, **overrides}


async def get_compliance_config(db: AsyncSession, workspace_id: str) -> dict:
    """Read compliance automation config, merging workspace overrides over defaults."""
    result = await db.execute(
        select(Workspace.settings).where(Workspace.id == workspace_id)
    )
    settings = result.scalar_one_or_none() or {}
    overrides = settings.get("compliance_automation", {}) if isinstance(settings, dict) else {}
    return {**COMPLIANCE_DEFAULTS, **overrides}
