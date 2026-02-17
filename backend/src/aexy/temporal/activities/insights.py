"""Temporal activities for developer insights snapshot generation.

Periodically checks workspaces with auto_generate_snapshots enabled
and triggers snapshot computation for their developers.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)

# Frequency string to timedelta mapping
SNAPSHOT_FREQUENCY_MAP = {
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
    "biweekly": timedelta(weeks=2),
    "monthly": timedelta(days=30),
}


def _get_period_boundaries(frequency: str) -> tuple[datetime, datetime]:
    """Compute the period start/end based on frequency.

    Returns the most recent completed period boundaries.
    For daily: yesterday 00:00 to today 00:00
    For weekly: last Monday 00:00 to this Monday 00:00
    For biweekly: two Mondays ago to this Monday
    For monthly: first of last month to first of this month
    """
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if frequency == "daily":
        end = today
        start = end - timedelta(days=1)
    elif frequency == "weekly":
        # Go back to Monday of this week
        days_since_monday = today.weekday()
        this_monday = today - timedelta(days=days_since_monday)
        end = this_monday
        start = end - timedelta(weeks=1)
    elif frequency == "biweekly":
        days_since_monday = today.weekday()
        this_monday = today - timedelta(days=days_since_monday)
        end = this_monday
        start = end - timedelta(weeks=2)
    elif frequency == "monthly":
        first_of_this_month = today.replace(day=1)
        end = first_of_this_month
        # First of last month
        if first_of_this_month.month == 1:
            start = first_of_this_month.replace(year=first_of_this_month.year - 1, month=12)
        else:
            start = first_of_this_month.replace(month=first_of_this_month.month - 1)
    else:
        # Default to weekly
        days_since_monday = today.weekday()
        this_monday = today - timedelta(days=days_since_monday)
        end = this_monday
        start = end - timedelta(weeks=1)

    return start, end


def _frequency_to_period_type(frequency: str) -> str:
    """Map snapshot frequency to PeriodType enum value."""
    return {
        "daily": "daily",
        "weekly": "weekly",
        "biweekly": "weekly",
        "monthly": "monthly",
    }.get(frequency, "weekly")


@dataclass
class AutoGenerateSnapshotsInput:
    """Input for the periodic snapshot generation check activity."""

    pass


@activity.defn
async def auto_generate_snapshots(input: AutoGenerateSnapshotsInput) -> dict[str, Any]:
    """Check workspaces with auto-snapshot enabled and generate snapshots.

    Runs periodically via Temporal schedule. For each workspace with
    auto_generate_snapshots=True, generates developer and team snapshots
    based on the configured snapshot_frequency.
    """
    logger.info("Checking for workspaces that need auto-snapshot generation")

    from sqlalchemy import select

    from aexy.models.developer_insights import InsightSettings, PeriodType
    from aexy.models.workspace import WorkspaceMember
    from aexy.services.developer_insights_service import DeveloperInsightsService

    snapshots_generated = 0
    workspaces_processed = 0

    async with async_session_maker() as db:
        # Find all settings with auto_generate_snapshots enabled
        result = await db.execute(
            select(InsightSettings).where(
                InsightSettings.auto_generate_snapshots == True,  # noqa: E712
            )
        )
        settings_list = result.scalars().all()

        if not settings_list:
            logger.info("No workspaces with auto-snapshot generation enabled")
            return {"workspaces_processed": 0, "snapshots_generated": 0}

        service = DeveloperInsightsService(db)

        for settings in settings_list:
            try:
                workspace_id = settings.workspace_id
                frequency = settings.snapshot_frequency or "weekly"
                period_type_str = _frequency_to_period_type(frequency)
                period_type = PeriodType(period_type_str)

                # Get period boundaries
                start, end = _get_period_boundaries(frequency)

                # Get all developers in this workspace
                dev_result = await db.execute(
                    select(WorkspaceMember.developer_id).where(
                        WorkspaceMember.workspace_id == workspace_id,
                    )
                )
                dev_ids = [row[0] for row in dev_result.all()]

                if not dev_ids:
                    logger.debug(f"No developers found for workspace {workspace_id}")
                    continue

                # Generate developer snapshots
                for dev_id in dev_ids:
                    try:
                        await service.save_developer_snapshot(
                            dev_id, workspace_id, period_type, start, end,
                        )
                        snapshots_generated += 1
                    except Exception:
                        logger.exception(
                            f"Failed to generate snapshot for developer {dev_id} "
                            f"in workspace {workspace_id}"
                        )

                # Generate team snapshot if multiple developers
                if len(dev_ids) > 1:
                    try:
                        await service.save_team_snapshot(
                            workspace_id, settings.team_id, period_type, start, end, dev_ids,
                        )
                        snapshots_generated += 1
                    except Exception:
                        logger.exception(
                            f"Failed to generate team snapshot for workspace {workspace_id}"
                        )

                await db.commit()
                workspaces_processed += 1

                logger.info(
                    f"Auto-generated snapshots for workspace {workspace_id} "
                    f"({len(dev_ids)} developers, frequency={frequency})"
                )

            except Exception:
                logger.exception(
                    f"Failed to process auto-snapshots for settings {settings.id}"
                )

    logger.info(
        f"Auto-snapshot check complete: {workspaces_processed} workspaces, "
        f"{snapshots_generated} snapshots generated"
    )
    return {
        "workspaces_processed": workspaces_processed,
        "snapshots_generated": snapshots_generated,
    }
