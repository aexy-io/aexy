"""Celery tasks for tracking: standups, blockers, time aggregation, and patterns."""

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any

from celery import shared_task

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async coroutine in a sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coro)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_standup_reminders_task(self) -> dict[str, Any]:
    """
    Send standup reminders to configured channels.
    Should run daily around 9 AM (configurable per channel).
    """
    logger.info("Sending standup reminders")

    try:
        result = run_async(_send_standup_reminders())
        return result
    except Exception as exc:
        logger.error(f"Standup reminders failed: {exc}")
        raise self.retry(exc=exc)


async def _send_standup_reminders() -> dict[str, Any]:
    """Async implementation of standup reminder sending."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.models.integrations import SlackIntegration
    from aexy.models.tracking import SlackChannelConfig, ChannelType
    from aexy.schemas.integrations import SlackMessage, SlackNotificationType
    from aexy.services.slack_integration import SlackIntegrationService

    slack_service = SlackIntegrationService()
    sent_count = 0
    errors = []

    async with async_session_maker() as db:
        # Get all active standup channels
        result = await db.execute(
            select(SlackChannelConfig).where(
                SlackChannelConfig.is_active == True,
                SlackChannelConfig.channel_type == ChannelType.STANDUP.value,
            )
        )
        configs = result.scalars().all()

        for config in configs:
            try:
                # Get the integration
                int_result = await db.execute(
                    select(SlackIntegration).where(
                        SlackIntegration.id == config.integration_id,
                        SlackIntegration.is_active == True,
                    )
                )
                integration = int_result.scalar_one_or_none()
                if not integration:
                    continue

                # Send reminder
                message = SlackMessage(
                    text=":sunrise: Good morning! Time for standup. Share your update:",
                    blocks=[
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": ":sunrise: *Good morning!* Time for standup.\n\n"
                                "Share your update using:\n"
                                "`/aexy standup yesterday: ... | today: ... | blockers: ...`\n\n"
                                "Or just post in this format:\n"
                                "```Yesterday: what you did\nToday: what you'll do\nBlockers: any blockers```",
                            },
                        },
                    ],
                )

                await slack_service.send_message(
                    integration,
                    config.channel_id,
                    message,
                    SlackNotificationType.DIGEST,
                    db,
                )
                sent_count += 1

            except Exception as e:
                logger.error(f"Error sending reminder to channel {config.channel_id}: {e}")
                errors.append(str(e))

    return {
        "sent_count": sent_count,
        "errors": errors,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def aggregate_daily_standups_task(self, team_id: str | None = None) -> dict[str, Any]:
    """
    Aggregate daily standups into sprint summaries.
    Should run at end of day (6 PM).
    """
    logger.info(f"Aggregating daily standups for team {team_id or 'all'}")

    try:
        result = run_async(_aggregate_daily_standups(team_id))
        return result
    except Exception as exc:
        logger.error(f"Standup aggregation failed: {exc}")
        raise self.retry(exc=exc)


async def _aggregate_daily_standups(team_id: str | None) -> dict[str, Any]:
    """Async implementation of standup aggregation."""
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.models.team import Team, TeamMember
    from aexy.models.tracking import (
        DeveloperStandup,
        StandupSummary,
        Blocker,
        BlockerStatus,
    )

    today = date.today()
    summaries_created = 0

    async with async_session_maker() as db:
        # Get teams to process
        if team_id:
            teams_result = await db.execute(select(Team).where(Team.id == team_id))
            teams = [teams_result.scalar_one_or_none()]
            teams = [t for t in teams if t]
        else:
            teams_result = await db.execute(select(Team))
            teams = teams_result.scalars().all()

        for team in teams:
            # Count team members
            members_result = await db.execute(
                select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
            )
            total_members = members_result.scalar() or 0

            if total_members == 0:
                continue

            # Get today's standups for this team
            standups_result = await db.execute(
                select(DeveloperStandup).where(
                    DeveloperStandup.team_id == team.id,
                    DeveloperStandup.standup_date == today,
                )
            )
            standups = standups_result.scalars().all()

            # Get active blockers
            blockers_result = await db.execute(
                select(Blocker).where(
                    Blocker.team_id == team.id,
                    Blocker.status == BlockerStatus.ACTIVE.value,
                )
            )
            active_blockers = blockers_result.scalars().all()

            # Get new blockers from today
            new_blockers_result = await db.execute(
                select(func.count(Blocker.id)).where(
                    Blocker.team_id == team.id,
                    func.date(Blocker.reported_at) == today,
                )
            )
            new_blockers_count = new_blockers_result.scalar() or 0

            # Aggregate content
            combined_yesterday = "\n".join([
                f"• {s.yesterday_summary[:200]}" for s in standups if s.yesterday_summary
            ])
            combined_today = "\n".join([
                f"• {s.today_plan[:200]}" for s in standups if s.today_plan
            ])
            combined_blockers = "\n".join([
                f"• {s.blockers_summary[:200]}" for s in standups if s.blockers_summary
            ])

            # Calculate sentiment
            sentiments = [s.sentiment_score for s in standups if s.sentiment_score is not None]
            avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else None

            team_mood = None
            if avg_sentiment is not None:
                if avg_sentiment > 0.3:
                    team_mood = "positive"
                elif avg_sentiment < -0.3:
                    team_mood = "concerned"
                else:
                    team_mood = "neutral"

            # Check for existing summary
            existing = await db.execute(
                select(StandupSummary).where(
                    StandupSummary.team_id == team.id,
                    StandupSummary.summary_date == today,
                )
            )
            summary = existing.scalar_one_or_none()

            if summary:
                # Update existing
                summary.total_team_members = total_members
                summary.standups_submitted = len(standups)
                summary.participation_rate = len(standups) / total_members if total_members > 0 else 0
                summary.combined_yesterday = combined_yesterday or None
                summary.combined_today = combined_today or None
                summary.combined_blockers = combined_blockers or None
                summary.active_blockers_count = len(active_blockers)
                summary.new_blockers_count = new_blockers_count
                summary.avg_sentiment_score = avg_sentiment
                summary.team_mood = team_mood
            else:
                # Create new summary
                # Get active sprint for the team
                from aexy.models.sprint import Sprint
                sprint_result = await db.execute(
                    select(Sprint).where(
                        Sprint.team_id == team.id,
                        Sprint.status == "active",
                    )
                )
                sprint = sprint_result.scalar_one_or_none()

                summary = StandupSummary(
                    sprint_id=sprint.id if sprint else None,
                    team_id=team.id,
                    workspace_id=team.workspace_id,
                    summary_date=today,
                    total_team_members=total_members,
                    standups_submitted=len(standups),
                    participation_rate=len(standups) / total_members if total_members > 0 else 0,
                    combined_yesterday=combined_yesterday or None,
                    combined_today=combined_today or None,
                    combined_blockers=combined_blockers or None,
                    active_blockers_count=len(active_blockers),
                    new_blockers_count=new_blockers_count,
                    avg_sentiment_score=avg_sentiment,
                    team_mood=team_mood,
                )
                db.add(summary)
                summaries_created += 1

        await db.commit()

    return {
        "teams_processed": len(teams),
        "summaries_created": summaries_created,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def check_overdue_blockers_task(self) -> dict[str, Any]:
    """
    Check for blockers that have been active too long.
    Sends escalation notifications for high-severity blockers older than 24h.
    Should run every 4 hours.
    """
    logger.info("Checking overdue blockers")

    try:
        result = run_async(_check_overdue_blockers())
        return result
    except Exception as exc:
        logger.error(f"Overdue blockers check failed: {exc}")
        raise self.retry(exc=exc)


async def _check_overdue_blockers() -> dict[str, Any]:
    """Async implementation of overdue blocker check."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.models.tracking import Blocker, BlockerStatus, BlockerSeverity
    from aexy.models.notification import Notification, NotificationEventType
    from aexy.models.team import TeamMember

    cutoff_critical = datetime.utcnow() - timedelta(hours=4)
    cutoff_high = datetime.utcnow() - timedelta(hours=24)
    cutoff_medium = datetime.utcnow() - timedelta(hours=48)

    notifications_sent = 0
    escalated = 0

    async with async_session_maker() as db:
        # Find overdue blockers
        blockers_result = await db.execute(
            select(Blocker).where(
                Blocker.status == BlockerStatus.ACTIVE.value,
            )
        )
        blockers = blockers_result.scalars().all()

        for blocker in blockers:
            is_overdue = False
            if blocker.severity == BlockerSeverity.CRITICAL.value:
                is_overdue = blocker.reported_at < cutoff_critical
            elif blocker.severity == BlockerSeverity.HIGH.value:
                is_overdue = blocker.reported_at < cutoff_high
            elif blocker.severity == BlockerSeverity.MEDIUM.value:
                is_overdue = blocker.reported_at < cutoff_medium

            if is_overdue and blocker.status != BlockerStatus.ESCALATED.value:
                # Mark as escalated
                blocker.status = BlockerStatus.ESCALATED.value
                blocker.escalated_at = datetime.utcnow()
                escalated += 1

                # Find team lead/manager to notify
                leader_result = await db.execute(
                    select(TeamMember).where(
                        TeamMember.team_id == blocker.team_id,
                        TeamMember.role.in_(["lead", "manager", "admin"]),
                    ).limit(1)
                )
                leader = leader_result.scalar_one_or_none()

                if leader:
                    blocker.escalated_to_id = leader.developer_id

                    # Create notification
                    notification = Notification(
                        developer_id=leader.developer_id,
                        event_type=NotificationEventType.GOAL_AT_RISK.value,  # Reusing existing type
                        title="Blocker Escalated",
                        message=f"Blocker has been active too long: {blocker.description[:100]}",
                        context={
                            "blocker_id": blocker.id,
                            "severity": blocker.severity,
                            "reported_by": blocker.developer_id,
                        },
                    )
                    db.add(notification)
                    notifications_sent += 1

        await db.commit()

    return {
        "escalated": escalated,
        "notifications_sent": notifications_sent,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def analyze_activity_patterns_task(self, developer_id: str) -> dict[str, Any]:
    """
    Analyze developer activity patterns from standups, work logs, and time entries.
    """
    logger.info(f"Analyzing activity patterns for developer {developer_id}")

    try:
        result = run_async(_analyze_activity_patterns(developer_id))
        return result
    except Exception as exc:
        logger.error(f"Activity pattern analysis failed: {exc}")
        raise self.retry(exc=exc)


async def _analyze_activity_patterns(developer_id: str) -> dict[str, Any]:
    """Async implementation of activity pattern analysis."""
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.models.tracking import (
        DeveloperStandup,
        WorkLog,
        TimeEntry,
        Blocker,
        BlockerStatus,
        DeveloperActivityPattern,
    )
    from aexy.models.team import TeamMember
    from aexy.models.sprint import Sprint

    period_end = date.today()
    period_start = period_end - timedelta(days=30)

    async with async_session_maker() as db:
        # Get developer's team and workspace
        member_result = await db.execute(
            select(TeamMember).where(TeamMember.developer_id == developer_id).limit(1)
        )
        member = member_result.scalar_one_or_none()
        if not member:
            return {"error": "Developer not in any team"}

        from aexy.models.team import Team
        team_result = await db.execute(select(Team).where(Team.id == member.team_id))
        team = team_result.scalar_one_or_none()
        if not team:
            return {"error": "Team not found"}

        # Get active sprint
        sprint_result = await db.execute(
            select(Sprint).where(
                Sprint.team_id == team.id,
                Sprint.status == "active",
            )
        )
        sprint = sprint_result.scalar_one_or_none()

        # Analyze standups
        standups_result = await db.execute(
            select(DeveloperStandup).where(
                DeveloperStandup.developer_id == developer_id,
                DeveloperStandup.standup_date >= period_start,
                DeveloperStandup.standup_date <= period_end,
            )
        )
        standups = standups_result.scalars().all()

        # Calculate standup metrics
        business_days = sum(1 for i in range(31) if (period_start + timedelta(days=i)).weekday() < 5)
        standup_count = len(standups)
        standup_consistency = standup_count / business_days if business_days > 0 else 0

        # Calculate average standup time
        standup_times = [s.submitted_at.time() for s in standups if s.submitted_at]
        avg_standup_time = None
        if standup_times:
            avg_minutes = sum(t.hour * 60 + t.minute for t in standup_times) / len(standup_times)
            avg_standup_time = datetime.strptime(f"{int(avg_minutes // 60):02d}:{int(avg_minutes % 60):02d}", "%H:%M").time()

        # Calculate standup streak
        streak = 0
        check_date = period_end
        while check_date >= period_start:
            if check_date.weekday() < 5:  # Skip weekends
                has_standup = any(s.standup_date == check_date for s in standups)
                if has_standup:
                    streak += 1
                else:
                    break
            check_date -= timedelta(days=1)

        # Analyze work logs
        logs_result = await db.execute(
            select(WorkLog).where(
                WorkLog.developer_id == developer_id,
                WorkLog.logged_at >= datetime.combine(period_start, datetime.min.time()),
                WorkLog.logged_at <= datetime.combine(period_end, datetime.max.time()),
            )
        )
        logs = logs_result.scalars().all()
        avg_logs_per_day = len(logs) / 30 if logs else 0

        # Analyze time entries
        time_result = await db.execute(
            select(TimeEntry).where(
                TimeEntry.developer_id == developer_id,
                TimeEntry.entry_date >= period_start,
                TimeEntry.entry_date <= period_end,
            )
        )
        time_entries = time_result.scalars().all()
        total_time = sum(t.duration_minutes for t in time_entries)
        avg_time_per_day = total_time // 30 if time_entries else 0

        # Analyze blockers
        blockers_result = await db.execute(
            select(Blocker).where(
                Blocker.developer_id == developer_id,
                Blocker.reported_at >= datetime.combine(period_start, datetime.min.time()),
            )
        )
        blockers = blockers_result.scalars().all()
        blocker_frequency = len(blockers) / 4  # per week

        # Calculate avg resolution time
        resolved_blockers = [b for b in blockers if b.resolved_at]
        avg_resolution_hours = None
        if resolved_blockers:
            total_hours = sum(
                (b.resolved_at - b.reported_at).total_seconds() / 3600
                for b in resolved_blockers
            )
            avg_resolution_hours = total_hours / len(resolved_blockers)

        # Check for existing pattern record
        existing = await db.execute(
            select(DeveloperActivityPattern).where(
                DeveloperActivityPattern.developer_id == developer_id,
                DeveloperActivityPattern.period_start == period_start,
                DeveloperActivityPattern.period_end == period_end,
            )
        )
        pattern = existing.scalar_one_or_none()

        if pattern:
            # Update
            pattern.avg_standup_time = avg_standup_time
            pattern.standup_consistency_score = standup_consistency
            pattern.standup_streak_days = streak
            pattern.avg_work_logs_per_day = avg_logs_per_day
            pattern.avg_time_logged_per_day = avg_time_per_day
            pattern.blocker_frequency = blocker_frequency
            pattern.avg_blocker_resolution_hours = avg_resolution_hours
        else:
            # Create
            pattern = DeveloperActivityPattern(
                developer_id=developer_id,
                sprint_id=sprint.id if sprint else None,
                workspace_id=team.workspace_id,
                avg_standup_time=avg_standup_time,
                standup_consistency_score=standup_consistency,
                standup_streak_days=streak,
                avg_work_logs_per_day=avg_logs_per_day,
                avg_time_logged_per_day=avg_time_per_day,
                blocker_frequency=blocker_frequency,
                avg_blocker_resolution_hours=avg_resolution_hours,
                period_start=period_start,
                period_end=period_end,
            )
            db.add(pattern)

        await db.commit()

    return {
        "developer_id": developer_id,
        "standup_consistency": standup_consistency,
        "standup_streak": streak,
        "avg_time_per_day": avg_time_per_day,
        "blocker_frequency": blocker_frequency,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def aggregate_time_entries_task(self, sprint_id: str) -> dict[str, Any]:
    """
    Aggregate time entries for sprint reporting.
    """
    logger.info(f"Aggregating time entries for sprint {sprint_id}")

    try:
        result = run_async(_aggregate_time_entries(sprint_id))
        return result
    except Exception as exc:
        logger.error(f"Time entry aggregation failed: {exc}")
        raise self.retry(exc=exc)


async def _aggregate_time_entries(sprint_id: str) -> dict[str, Any]:
    """Async implementation of time entry aggregation."""
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.models.tracking import TimeEntry
    from aexy.models.sprint import Sprint, SprintTask

    async with async_session_maker() as db:
        # Get sprint
        sprint_result = await db.execute(
            select(Sprint).where(Sprint.id == sprint_id)
        )
        sprint = sprint_result.scalar_one_or_none()
        if not sprint:
            return {"error": "Sprint not found"}

        # Aggregate by developer
        by_developer = await db.execute(
            select(
                TimeEntry.developer_id,
                func.sum(TimeEntry.duration_minutes).label("total_minutes"),
                func.count(TimeEntry.id).label("entry_count"),
            )
            .where(TimeEntry.sprint_id == sprint_id)
            .group_by(TimeEntry.developer_id)
        )
        developer_totals = {
            row.developer_id: {"minutes": row.total_minutes, "entries": row.entry_count}
            for row in by_developer
        }

        # Aggregate by task
        by_task = await db.execute(
            select(
                TimeEntry.task_id,
                func.sum(TimeEntry.duration_minutes).label("total_minutes"),
                func.count(TimeEntry.id).label("entry_count"),
            )
            .where(TimeEntry.sprint_id == sprint_id, TimeEntry.task_id.isnot(None))
            .group_by(TimeEntry.task_id)
        )
        task_totals = {
            row.task_id: {"minutes": row.total_minutes, "entries": row.entry_count}
            for row in by_task
        }

        # Get total
        total_result = await db.execute(
            select(func.sum(TimeEntry.duration_minutes)).where(TimeEntry.sprint_id == sprint_id)
        )
        total_minutes = total_result.scalar() or 0

    return {
        "sprint_id": sprint_id,
        "total_minutes": total_minutes,
        "by_developer": developer_totals,
        "by_task": task_totals,
    }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_sprint_progress_report_task(self, sprint_id: str) -> dict[str, Any]:
    """
    Generate daily sprint progress from individual updates.
    Should run at 5 PM daily.
    """
    logger.info(f"Generating sprint progress report for {sprint_id}")

    try:
        result = run_async(_generate_sprint_progress_report(sprint_id))
        return result
    except Exception as exc:
        logger.error(f"Sprint progress report failed: {exc}")
        raise self.retry(exc=exc)


async def _generate_sprint_progress_report(sprint_id: str) -> dict[str, Any]:
    """Async implementation of sprint progress report generation."""
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.models.sprint import Sprint, SprintTask
    from aexy.models.tracking import DeveloperStandup, WorkLog, TimeEntry, Blocker, BlockerStatus

    today = date.today()

    async with async_session_maker() as db:
        # Get sprint
        sprint_result = await db.execute(
            select(Sprint).where(Sprint.id == sprint_id)
        )
        sprint = sprint_result.scalar_one_or_none()
        if not sprint:
            return {"error": "Sprint not found"}

        # Count tasks by status
        tasks_result = await db.execute(
            select(SprintTask.status, func.count(SprintTask.id))
            .where(SprintTask.sprint_id == sprint_id)
            .group_by(SprintTask.status)
        )
        task_counts = {row[0]: row[1] for row in tasks_result}

        # Count standups today
        standups_result = await db.execute(
            select(func.count(DeveloperStandup.id)).where(
                DeveloperStandup.sprint_id == sprint_id,
                DeveloperStandup.standup_date == today,
            )
        )
        standups_today = standups_result.scalar() or 0

        # Count active blockers
        blockers_result = await db.execute(
            select(func.count(Blocker.id)).where(
                Blocker.sprint_id == sprint_id,
                Blocker.status == BlockerStatus.ACTIVE.value,
            )
        )
        active_blockers = blockers_result.scalar() or 0

        # Time logged today
        time_result = await db.execute(
            select(func.sum(TimeEntry.duration_minutes)).where(
                TimeEntry.sprint_id == sprint_id,
                TimeEntry.entry_date == today,
            )
        )
        time_today = time_result.scalar() or 0

        # Work logs today
        logs_result = await db.execute(
            select(func.count(WorkLog.id)).where(
                WorkLog.sprint_id == sprint_id,
                func.date(WorkLog.logged_at) == today,
            )
        )
        logs_today = logs_result.scalar() or 0

    return {
        "sprint_id": sprint_id,
        "date": today.isoformat(),
        "task_counts": task_counts,
        "standups_today": standups_today,
        "active_blockers": active_blockers,
        "time_logged_today": time_today,
        "work_logs_today": logs_today,
    }


# ==================== Slack Sync Tasks ====================


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_slack_channel_task(
    self,
    integration_id: str,
    channel_id: str,
    team_id: str | None = None,
    sprint_id: str | None = None,
) -> dict[str, Any]:
    """
    Sync a single Slack channel (incremental sync).
    Can be triggered manually or by scheduler.
    """
    logger.info(f"Syncing Slack channel {channel_id}")

    try:
        result = run_async(_sync_slack_channel(integration_id, channel_id, team_id, sprint_id))
        return result
    except Exception as exc:
        logger.error(f"Slack channel sync failed: {exc}")
        raise self.retry(exc=exc)


async def _sync_slack_channel(
    integration_id: str,
    channel_id: str,
    team_id: str | None,
    sprint_id: str | None,
) -> dict[str, Any]:
    """Async implementation of Slack channel sync."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.integrations import SlackIntegration
    from aexy.services.slack_history_sync import SlackHistorySyncService

    sync_service = SlackHistorySyncService()

    async with async_session_maker() as db:
        # Get integration
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"error": "Integration not found"}

        # Sync channel
        stats = await sync_service.sync_channel_updates(
            integration, channel_id, db, team_id, sprint_id
        )
        return stats


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def sync_all_slack_channels_task(self, integration_id: str) -> dict[str, Any]:
    """
    Sync all configured Slack channels for an integration.
    Should run every 15-30 minutes for continuous sync.
    """
    logger.info(f"Syncing all channels for integration {integration_id}")

    try:
        result = run_async(_sync_all_slack_channels(integration_id))
        return result
    except Exception as exc:
        logger.error(f"Slack all-channel sync failed: {exc}")
        raise self.retry(exc=exc)


async def _sync_all_slack_channels(integration_id: str) -> dict[str, Any]:
    """Async implementation of all-channel sync."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.integrations import SlackIntegration
    from aexy.models.tracking import SlackChannelConfig
    from aexy.services.slack_history_sync import SlackHistorySyncService

    sync_service = SlackHistorySyncService()

    async with async_session_maker() as db:
        # Get integration
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"error": "Integration not found"}

        # Get configured channels
        channels_result = await db.execute(
            select(SlackChannelConfig).where(
                SlackChannelConfig.integration_id == integration_id,
                SlackChannelConfig.is_active == True,
            )
        )
        configs = channels_result.scalars().all()

        total_stats = {
            "channels_synced": 0,
            "messages_processed": 0,
            "standups_imported": 0,
            "work_logs_imported": 0,
            "blockers_imported": 0,
            "errors": [],
        }

        for config in configs:
            try:
                stats = await sync_service.sync_channel_updates(
                    integration, config.channel_id, db, config.team_id
                )
                total_stats["channels_synced"] += 1
                total_stats["messages_processed"] += stats.get("total_messages", 0)
                total_stats["standups_imported"] += stats.get("standups_imported", 0)
                total_stats["work_logs_imported"] += stats.get("work_logs_imported", 0)
                total_stats["blockers_imported"] += stats.get("blockers_imported", 0)
            except Exception as e:
                logger.error(f"Error syncing channel {config.channel_id}: {e}")
                total_stats["errors"].append({"channel": config.channel_id, "error": str(e)})

        return total_stats


@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def import_slack_history_task(
    self,
    integration_id: str,
    channel_ids: list[str] | None = None,
    days_back: int = 30,
    team_id: str | None = None,
    sprint_id: str | None = None,
) -> dict[str, Any]:
    """
    Full import of Slack history. One-time operation.
    """
    logger.info(f"Importing Slack history for integration {integration_id}, days_back={days_back}")

    try:
        result = run_async(_import_slack_history(
            integration_id, channel_ids, days_back, team_id, sprint_id
        ))
        return result
    except Exception as exc:
        logger.error(f"Slack history import failed: {exc}")
        raise self.retry(exc=exc)


async def _import_slack_history(
    integration_id: str,
    channel_ids: list[str] | None,
    days_back: int,
    team_id: str | None,
    sprint_id: str | None,
) -> dict[str, Any]:
    """Async implementation of full Slack history import."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.integrations import SlackIntegration
    from aexy.services.slack_history_sync import SlackHistorySyncService

    sync_service = SlackHistorySyncService()

    async with async_session_maker() as db:
        # Get integration
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"error": "Integration not found"}

        # Full import
        stats = await sync_service.full_import(
            integration, db, channel_ids, days_back, team_id, sprint_id
        )
        return stats


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def map_slack_users_task(self, integration_id: str) -> dict[str, Any]:
    """
    Auto-map Slack users to developers based on email.
    """
    logger.info(f"Mapping Slack users for integration {integration_id}")

    try:
        result = run_async(_map_slack_users(integration_id))
        return result
    except Exception as exc:
        logger.error(f"Slack user mapping failed: {exc}")
        raise self.retry(exc=exc)


async def _map_slack_users(integration_id: str) -> dict[str, Any]:
    """Async implementation of Slack user mapping."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.integrations import SlackIntegration
    from aexy.services.slack_history_sync import SlackHistorySyncService

    sync_service = SlackHistorySyncService()

    async with async_session_maker() as db:
        # Get integration
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"error": "Integration not found"}

        # Map users
        stats = await sync_service.map_slack_users_to_developers(integration, db)
        return stats
