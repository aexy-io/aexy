"""Temporal scheduled detection activities for the tracking automation module.

These activities run on a schedule and emit automation events for detection-based
triggers like missed standups, stale blockers, time anomalies, etc.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# Input dataclasses
# =============================================================================

@dataclass
class CheckMissedStandupsInput:
    pass


@dataclass
class CheckTimeEntryThresholdsInput:
    pass


@dataclass
class CheckStaleBlockersInput:
    pass


@dataclass
class DetectBlockerPatternsInput:
    pass


@dataclass
class CheckTimeAnomaliesInput:
    pass


@dataclass
class CheckStandupParticipationInput:
    pass


# =============================================================================
# Helper: iterate active workspaces
# =============================================================================

async def _get_active_workspace_ids(db) -> list[str]:
    """Return IDs of all active workspaces."""
    from sqlalchemy import select
    from aexy.models.workspace import Workspace

    result = await db.execute(
        select(Workspace.id).where(Workspace.is_active.is_(True))
    )
    return [r[0] for r in result.all()]


# =============================================================================
# Activities
# =============================================================================

@activity.defn
async def check_missed_standups(input: CheckMissedStandupsInput) -> dict[str, Any]:
    """For each team, find members who haven't submitted a standup today.

    Emits standup.missed for each developer who missed the standup.
    """
    logger.info("Running check_missed_standups")

    from sqlalchemy import select, and_
    from aexy.models.team import Team, TeamMember
    from aexy.models.tracking import DeveloperStandup
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_tracking_config

    total_events = 0
    today = date.today()

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_tracking_config(db, ws_id)

            # Get all teams in this workspace
            teams_q = await db.execute(
                select(Team).where(Team.workspace_id == ws_id)
            )
            teams = list(teams_q.scalars().all())

            for team in teams:
                # Get team members
                members_q = await db.execute(
                    select(TeamMember.developer_id).where(
                        TeamMember.team_id == team.id
                    )
                )
                member_ids = [r[0] for r in members_q.all()]
                if not member_ids:
                    continue

                # Get developers who submitted today
                submitted_q = await db.execute(
                    select(DeveloperStandup.developer_id).where(
                        and_(
                            DeveloperStandup.team_id == team.id,
                            DeveloperStandup.standup_date == today,
                        )
                    )
                )
                submitted_ids = {r[0] for r in submitted_q.all()}

                # Emit for missing
                for dev_id in member_ids:
                    if dev_id not in submitted_ids:
                        await dispatch_automation_event(
                            db=db,
                            workspace_id=ws_id,
                            module="tracking",
                            trigger_type="standup.missed",
                            entity_id=dev_id,
                            trigger_data={
                                "developer_id": dev_id,
                                "team_id": team.id,
                                "date": str(today),
                                "deadline_hour": config["standup_deadline_hour"],
                            },
                        )
                        total_events += 1

    logger.info(f"check_missed_standups emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_time_entry_thresholds(input: CheckTimeEntryThresholdsInput) -> dict[str, Any]:
    """Check daily/weekly time entry totals against thresholds.

    Emits time_entry.threshold with direction=over or under.
    """
    logger.info("Running check_time_entry_thresholds")

    from sqlalchemy import select, func, and_
    from aexy.models.tracking import TimeEntry
    from aexy.models.team import TeamMember
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_tracking_config

    total_events = 0
    today = date.today()
    is_friday = today.weekday() == 4

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_tracking_config(db, ws_id)
            daily_min = config["time_entry_daily_min_minutes"]
            daily_max = config["time_entry_daily_max_minutes"]
            weekly_min = config["time_entry_weekly_min_minutes"]

            # Get all developers with time entries in this workspace today
            daily_q = await db.execute(
                select(
                    TimeEntry.developer_id,
                    func.sum(TimeEntry.duration_minutes).label("total"),
                ).where(
                    and_(
                        TimeEntry.workspace_id == ws_id,
                        TimeEntry.entry_date == today,
                    )
                ).group_by(TimeEntry.developer_id)
            )

            for dev_id, total in daily_q.all():
                if total < daily_min:
                    await dispatch_automation_event(
                        db=db, workspace_id=ws_id, module="tracking",
                        trigger_type="time_entry.threshold",
                        entity_id=dev_id,
                        trigger_data={
                            "developer_id": dev_id, "period": "daily",
                            "direction": "under", "total_minutes": total,
                            "threshold_minutes": daily_min,
                        },
                    )
                    total_events += 1
                elif total > daily_max:
                    await dispatch_automation_event(
                        db=db, workspace_id=ws_id, module="tracking",
                        trigger_type="time_entry.threshold",
                        entity_id=dev_id,
                        trigger_data={
                            "developer_id": dev_id, "period": "daily",
                            "direction": "over", "total_minutes": total,
                            "threshold_minutes": daily_max,
                        },
                    )
                    total_events += 1

            # Weekly check on Fridays
            if is_friday:
                week_start = today - timedelta(days=today.weekday())
                weekly_q = await db.execute(
                    select(
                        TimeEntry.developer_id,
                        func.sum(TimeEntry.duration_minutes).label("total"),
                    ).where(
                        and_(
                            TimeEntry.workspace_id == ws_id,
                            TimeEntry.entry_date >= week_start,
                            TimeEntry.entry_date <= today,
                        )
                    ).group_by(TimeEntry.developer_id)
                )
                for dev_id, total in weekly_q.all():
                    if total < weekly_min:
                        await dispatch_automation_event(
                            db=db, workspace_id=ws_id, module="tracking",
                            trigger_type="time_entry.threshold",
                            entity_id=dev_id,
                            trigger_data={
                                "developer_id": dev_id, "period": "weekly",
                                "direction": "under", "total_minutes": total,
                                "threshold_minutes": weekly_min,
                            },
                        )
                        total_events += 1

    logger.info(f"check_time_entry_thresholds emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_stale_blockers(input: CheckStaleBlockersInput) -> dict[str, Any]:
    """Find active blockers that haven't been updated in stale_days.

    Emits blocker.stale for each stale blocker.
    """
    logger.info("Running check_stale_blockers")

    from sqlalchemy import select, and_
    from aexy.models.tracking import Blocker, BlockerStatus
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_tracking_config

    total_events = 0
    now = datetime.now(timezone.utc)

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_tracking_config(db, ws_id)
            stale_days = config["blocker_stale_days"]
            cutoff = now - timedelta(days=stale_days)

            stale_q = await db.execute(
                select(Blocker).where(
                    and_(
                        Blocker.workspace_id == ws_id,
                        Blocker.status == BlockerStatus.ACTIVE.value,
                        Blocker.updated_at < cutoff,
                    )
                )
            )
            for blocker in stale_q.scalars().all():
                days_stale = (now - blocker.updated_at).days if blocker.updated_at else stale_days
                await dispatch_automation_event(
                    db=db, workspace_id=ws_id, module="tracking",
                    trigger_type="blocker.stale",
                    entity_id=blocker.id,
                    trigger_data={
                        "developer_id": blocker.developer_id,
                        "team_id": blocker.team_id or "",
                        "description": blocker.description or "",
                        "severity": blocker.severity or "",
                        "days_stale": days_stale,
                    },
                )
                total_events += 1

    logger.info(f"check_stale_blockers emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def detect_blocker_patterns(input: DetectBlockerPatternsInput) -> dict[str, Any]:
    """Detect recurring blocker patterns per team/category.

    Emits blocker.pattern_detected when >=3 blockers of the same category
    appear within 14 days for a team.
    """
    logger.info("Running detect_blocker_patterns")

    from sqlalchemy import select, func, and_
    from aexy.models.tracking import Blocker
    from aexy.services.automation_service import dispatch_automation_event

    total_events = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            pattern_q = await db.execute(
                select(
                    Blocker.team_id,
                    Blocker.category,
                    func.count(Blocker.id).label("cnt"),
                ).where(
                    and_(
                        Blocker.workspace_id == ws_id,
                        Blocker.created_at >= cutoff,
                    )
                ).group_by(Blocker.team_id, Blocker.category).having(
                    func.count(Blocker.id) >= 3
                )
            )

            for team_id, category, count in pattern_q.all():
                if not team_id:
                    continue
                await dispatch_automation_event(
                    db=db, workspace_id=ws_id, module="tracking",
                    trigger_type="blocker.pattern_detected",
                    entity_id=team_id,
                    trigger_data={
                        "team_id": team_id,
                        "category": category or "unknown",
                        "count": count,
                        "period_days": 14,
                    },
                )
                total_events += 1

    logger.info(f"detect_blocker_patterns emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_time_anomalies(input: CheckTimeAnomaliesInput) -> dict[str, Any]:
    """Detect time entry anomalies: weekend work, >2x average.

    Emits time_entry.anomaly for each anomaly found.
    """
    logger.info("Running check_time_anomalies")

    from sqlalchemy import select, func, and_
    from aexy.models.tracking import TimeEntry, DeveloperActivityPattern
    from aexy.services.automation_service import dispatch_automation_event

    total_events = 0
    today = date.today()
    is_weekend = today.weekday() >= 5

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            # Get today's time entries grouped by developer
            daily_q = await db.execute(
                select(
                    TimeEntry.developer_id,
                    func.sum(TimeEntry.duration_minutes).label("total"),
                ).where(
                    and_(
                        TimeEntry.workspace_id == ws_id,
                        TimeEntry.entry_date == today,
                    )
                ).group_by(TimeEntry.developer_id)
            )

            for dev_id, total in daily_q.all():
                anomaly_type = None

                # Weekend work detection
                if is_weekend and total > 0:
                    anomaly_type = "weekend_work"

                # Compare against activity pattern average
                pattern_q = await db.execute(
                    select(DeveloperActivityPattern).where(
                        and_(
                            DeveloperActivityPattern.developer_id == dev_id,
                            DeveloperActivityPattern.workspace_id == ws_id,
                        )
                    )
                )
                pattern = pattern_q.scalar_one_or_none()
                if pattern and hasattr(pattern, "avg_time_logged_per_day") and pattern.avg_time_logged_per_day:
                    if total > pattern.avg_time_logged_per_day * 2:
                        anomaly_type = "excessive_hours"

                if anomaly_type:
                    await dispatch_automation_event(
                        db=db, workspace_id=ws_id, module="tracking",
                        trigger_type="time_entry.anomaly",
                        entity_id=dev_id,
                        trigger_data={
                            "developer_id": dev_id,
                            "anomaly_type": anomaly_type,
                            "total_minutes": total,
                            "date": str(today),
                        },
                    )
                    total_events += 1

    logger.info(f"check_time_anomalies emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_standup_participation(input: CheckStandupParticipationInput) -> dict[str, Any]:
    """Check team standup participation rates.

    Emits participation.low when submitted/total falls below threshold.
    """
    logger.info("Running check_standup_participation")

    from sqlalchemy import select, func, and_
    from aexy.models.team import Team, TeamMember
    from aexy.models.tracking import DeveloperStandup
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_tracking_config

    total_events = 0
    today = date.today()

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_tracking_config(db, ws_id)
            threshold = config["participation_low_threshold"]

            teams_q = await db.execute(
                select(Team).where(Team.workspace_id == ws_id)
            )

            for team in teams_q.scalars().all():
                # Count members
                member_count_q = await db.execute(
                    select(func.count(TeamMember.id)).where(
                        TeamMember.team_id == team.id
                    )
                )
                total_members = member_count_q.scalar() or 0
                if total_members == 0:
                    continue

                # Count submissions
                submitted_q = await db.execute(
                    select(func.count(DeveloperStandup.id)).where(
                        and_(
                            DeveloperStandup.team_id == team.id,
                            DeveloperStandup.standup_date == today,
                        )
                    )
                )
                submitted = submitted_q.scalar() or 0
                rate = submitted / total_members

                if rate < threshold:
                    await dispatch_automation_event(
                        db=db, workspace_id=ws_id, module="tracking",
                        trigger_type="participation.low",
                        entity_id=team.id,
                        trigger_data={
                            "team_id": team.id,
                            "team_name": team.name or "",
                            "submitted": submitted,
                            "total_members": total_members,
                            "participation_rate": round(rate, 2),
                            "threshold": threshold,
                        },
                    )
                    total_events += 1

    logger.info(f"check_standup_participation emitted {total_events} events")
    return {"events_emitted": total_events}
