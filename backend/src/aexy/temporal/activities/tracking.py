"""Temporal activities for tracking: standups, blockers, time aggregation, patterns.

Replaces: aexy.processing.tracking_tasks
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class SendStandupRemindersInput:
    pass


@dataclass
class AggregateDailyStandupsInput:
    team_id: str | None = None


@dataclass
class CheckOverdueBlockersInput:
    pass


@dataclass
class AnalyzeActivityPatternsInput:
    developer_id: str


@dataclass
class AggregateTimeEntriesInput:
    sprint_id: str


@dataclass
class GenerateSprintProgressReportInput:
    sprint_id: str


@dataclass
class SyncSlackChannelInput:
    integration_id: str
    channel_id: str
    team_id: str | None = None
    sprint_id: str | None = None


@dataclass
class SyncAllSlackChannelsInput:
    integration_id: str


@dataclass
class ImportSlackHistoryInput:
    integration_id: str
    channel_ids: list[str] | None = None
    days_back: int = 30
    team_id: str | None = None
    sprint_id: str | None = None


@dataclass
class MapSlackUsersInput:
    integration_id: str


@dataclass
class CheckTimeEntryThresholdsInput:
    """Check if developers' daily logged time crosses configured thresholds."""
    min_hours_per_day: float = 4.0
    max_hours_per_day: float = 12.0


@activity.defn
async def send_standup_reminders(input: SendStandupRemindersInput) -> dict[str, Any]:
    """Send standup reminders to configured channels."""
    logger.info("Sending standup reminders")

    from aexy.processing.tracking_tasks import _send_standup_reminders
    return await _send_standup_reminders()


@activity.defn
async def aggregate_daily_standups(input: AggregateDailyStandupsInput) -> dict[str, Any]:
    """Aggregate daily standups into sprint summaries."""
    logger.info(f"Aggregating daily standups for team {input.team_id or 'all'}")

    from aexy.processing.tracking_tasks import _aggregate_daily_standups
    return await _aggregate_daily_standups(input.team_id)


@activity.defn
async def check_overdue_blockers(input: CheckOverdueBlockersInput) -> dict[str, Any]:
    """Check for blockers that have been active too long."""
    logger.info("Checking overdue blockers")

    from aexy.processing.tracking_tasks import _check_overdue_blockers
    return await _check_overdue_blockers()


@activity.defn
async def analyze_activity_patterns(input: AnalyzeActivityPatternsInput) -> dict[str, Any]:
    """Analyze developer activity patterns."""
    logger.info(f"Analyzing activity patterns for developer {input.developer_id}")

    from aexy.processing.tracking_tasks import _analyze_activity_patterns
    return await _analyze_activity_patterns(input.developer_id)


@activity.defn
async def aggregate_time_entries(input: AggregateTimeEntriesInput) -> dict[str, Any]:
    """Aggregate time entries for sprint reporting."""
    logger.info(f"Aggregating time entries for sprint {input.sprint_id}")

    from aexy.processing.tracking_tasks import _aggregate_time_entries
    return await _aggregate_time_entries(input.sprint_id)


@activity.defn
async def generate_sprint_progress_report(input: GenerateSprintProgressReportInput) -> dict[str, Any]:
    """Generate daily sprint progress report."""
    logger.info(f"Generating sprint progress report for {input.sprint_id}")

    from aexy.processing.tracking_tasks import _generate_sprint_progress_report
    return await _generate_sprint_progress_report(input.sprint_id)


@activity.defn
async def sync_slack_channel(input: SyncSlackChannelInput) -> dict[str, Any]:
    """Sync a single Slack channel (incremental)."""
    logger.info(f"Syncing Slack channel {input.channel_id}")

    from aexy.processing.tracking_tasks import _sync_slack_channel
    return await _sync_slack_channel(input.integration_id, input.channel_id, input.team_id, input.sprint_id)


@activity.defn
async def sync_all_slack_channels(input: SyncAllSlackChannelsInput) -> dict[str, Any]:
    """Sync all configured Slack channels for an integration."""
    logger.info(f"Syncing all channels for integration {input.integration_id}")

    from aexy.processing.tracking_tasks import _sync_all_slack_channels
    return await _sync_all_slack_channels(input.integration_id)


@activity.defn
async def import_slack_history(input: ImportSlackHistoryInput) -> dict[str, Any]:
    """Full import of Slack history."""
    logger.info(f"Importing Slack history for integration {input.integration_id}")

    from aexy.processing.tracking_tasks import _import_slack_history
    return await _import_slack_history(
        input.integration_id, input.channel_ids, input.days_back, input.team_id, input.sprint_id
    )


@activity.defn
async def map_slack_users(input: MapSlackUsersInput) -> dict[str, Any]:
    """Auto-map Slack users to developers based on email."""
    logger.info(f"Mapping Slack users for integration {input.integration_id}")

    from aexy.processing.tracking_tasks import _map_slack_users
    return await _map_slack_users(input.integration_id)


@activity.defn
async def check_time_entry_thresholds(input: CheckTimeEntryThresholdsInput) -> dict[str, Any]:
    """Check if any developer's daily logged hours cross thresholds and dispatch automation triggers."""
    from datetime import date, timezone, datetime
    from sqlalchemy import select, func

    from aexy.models.tracking import TimeEntry
    from aexy.models.team import Team, TeamMember
    from aexy.services.automation_service import dispatch_automation_event

    logger.info("Checking time entry thresholds")
    today = date.today()
    triggered = 0

    async with async_session_maker() as db:
        # Get daily hours per developer (grouped)
        result = await db.execute(
            select(
                TimeEntry.developer_id,
                TimeEntry.workspace_id,
                func.sum(TimeEntry.hours).label("total_hours"),
            )
            .where(func.date(TimeEntry.created_at) == today)
            .group_by(TimeEntry.developer_id, TimeEntry.workspace_id)
        )
        rows = result.fetchall()

        for row in rows:
            dev_id = str(row.developer_id)
            workspace_id = str(row.workspace_id) if row.workspace_id else None
            total_hours = float(row.total_hours or 0)

            if not workspace_id:
                continue

            # Check if below minimum or above maximum threshold
            threshold_type = None
            if total_hours < input.min_hours_per_day:
                threshold_type = "below_minimum"
            elif total_hours > input.max_hours_per_day:
                threshold_type = "above_maximum"

            if threshold_type:
                try:
                    await dispatch_automation_event(
                        db=db,
                        workspace_id=workspace_id,
                        module="tracking",
                        trigger_type="time_entry.threshold",
                        entity_id=dev_id,
                        trigger_data={
                            "developer_id": dev_id,
                            "date": str(today),
                            "total_hours": total_hours,
                            "threshold_type": threshold_type,
                            "min_threshold": input.min_hours_per_day,
                            "max_threshold": input.max_hours_per_day,
                        },
                    )
                    triggered += 1
                except Exception:
                    logger.warning(f"Failed to dispatch time_entry.threshold for dev {dev_id}", exc_info=True)

    return {"developers_checked": len(rows), "thresholds_triggered": triggered}
