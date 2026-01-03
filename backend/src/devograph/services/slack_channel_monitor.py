"""Slack channel monitor service for automatic parsing of messages."""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.developer import Developer
from devograph.models.integrations import SlackIntegration
from devograph.models.sprint import Sprint, SprintTask
from devograph.models.team import TeamMember
from devograph.models.tracking import (
    Blocker,
    BlockerStatus,
    DeveloperStandup,
    SlackChannelConfig,
    TrackingSource,
    WorkLog,
    WorkLogType,
)
from devograph.services.slack_message_parser import (
    BlockerMention,
    ParsedMessage,
    SlackMessageParser,
    StandupContent,
    TaskReference,
)

logger = logging.getLogger(__name__)


class SlackChannelMonitorService:
    """Monitors designated Slack channels for tracking data."""

    def __init__(self):
        self.parser = SlackMessageParser()

    async def get_channel_config(
        self,
        channel_id: str,
        integration_id: str,
        db: AsyncSession,
    ) -> SlackChannelConfig | None:
        """Get channel configuration if it exists and is active."""
        result = await db.execute(
            select(SlackChannelConfig).where(
                SlackChannelConfig.channel_id == channel_id,
                SlackChannelConfig.integration_id == integration_id,
                SlackChannelConfig.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_developer_from_slack_user(
        self,
        slack_user_id: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> Developer | None:
        """Get developer from Slack user ID."""
        developer_id = integration.user_mappings.get(slack_user_id)
        if not developer_id:
            return None

        result = await db.execute(
            select(Developer).where(Developer.id == developer_id)
        )
        return result.scalar_one_or_none()

    async def get_developer_team_and_sprint(
        self,
        developer_id: str,
        team_id: str | None,
        db: AsyncSession,
    ) -> tuple[str | None, str | None, str | None]:
        """Get team_id, workspace_id, and active sprint_id for a developer."""
        if team_id:
            # Use the team from channel config
            query = select(Sprint).where(
                Sprint.team_id == team_id,
                Sprint.status == "active",
            )
            result = await db.execute(query)
            sprint = result.scalar_one_or_none()

            # Get workspace from team
            from devograph.models.team import Team
            team_result = await db.execute(select(Team).where(Team.id == team_id))
            team = team_result.scalar_one_or_none()
            workspace_id = team.workspace_id if team else None

            return team_id, workspace_id, sprint.id if sprint else None

        # Fall back to developer's team
        result = await db.execute(
            select(TeamMember).where(TeamMember.developer_id == developer_id).limit(1)
        )
        member = result.scalar_one_or_none()
        if not member:
            return None, None, None

        from devograph.models.team import Team
        team_result = await db.execute(select(Team).where(Team.id == member.team_id))
        team = team_result.scalar_one_or_none()
        if not team:
            return None, None, None

        sprint_result = await db.execute(
            select(Sprint).where(
                Sprint.team_id == team.id,
                Sprint.status == "active",
            )
        )
        sprint = sprint_result.scalar_one_or_none()

        return team.id, team.workspace_id, sprint.id if sprint else None

    async def resolve_task_ref(
        self,
        task_ref: TaskReference,
        sprint_id: str | None,
        workspace_id: str | None,
        db: AsyncSession,
    ) -> SprintTask | None:
        """Resolve a task reference to an actual SprintTask."""
        if not workspace_id:
            return None

        # Try external_id match first
        query = select(SprintTask).where(
            SprintTask.external_id.ilike(f"%{task_ref.ref_string}%")
        )
        if sprint_id:
            query = query.where(SprintTask.sprint_id == sprint_id)

        result = await db.execute(query.limit(1))
        task = result.scalar_one_or_none()
        if task:
            return task

        # Try issue number if available
        if task_ref.issue_number:
            result = await db.execute(
                select(SprintTask).where(
                    SprintTask.external_id.ilike(f"%{task_ref.issue_number}%")
                ).limit(1)
            )
            task = result.scalar_one_or_none()
            if task:
                return task

        return None

    async def process_channel_message(
        self,
        channel_id: str,
        message: dict,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> dict:
        """
        Process a message from a monitored channel.

        Args:
            channel_id: Slack channel ID
            message: Slack message event data
            integration: SlackIntegration instance
            db: Database session

        Returns:
            Processing result with created records
        """
        result = {
            "processed": False,
            "standup_created": False,
            "blockers_created": 0,
            "work_logs_created": 0,
            "errors": [],
        }

        # Get channel config
        config = await self.get_channel_config(channel_id, integration.id, db)
        if not config:
            result["errors"].append("Channel not configured for monitoring")
            return result

        # Get message text
        text = message.get("text", "")
        if not text or len(text) < 10:
            return result

        # Skip bot messages
        if message.get("bot_id") or message.get("subtype") == "bot_message":
            return result

        # Get the message author
        user_id = message.get("user")
        if not user_id:
            return result

        developer = await self.get_developer_from_slack_user(user_id, integration, db)
        if not developer:
            logger.debug(f"No developer mapping for Slack user {user_id}")
            return result

        # Get team and sprint context
        team_id, workspace_id, sprint_id = await self.get_developer_team_and_sprint(
            developer.id, config.team_id, db
        )

        if not team_id or not workspace_id:
            result["errors"].append("Could not determine team for developer")
            return result

        # Parse the message
        parsed = self.parser.parse_message(text)
        message_ts = message.get("ts")

        # Process standup if detected and enabled
        if parsed.is_standup and parsed.standup_content and config.auto_parse_standups:
            try:
                standup = await self._process_standup(
                    developer_id=developer.id,
                    team_id=team_id,
                    workspace_id=workspace_id,
                    sprint_id=sprint_id,
                    content=parsed.standup_content,
                    message_ts=message_ts,
                    channel_id=channel_id,
                    db=db,
                )
                if standup:
                    result["standup_created"] = True
            except Exception as e:
                logger.error(f"Error processing standup: {e}")
                result["errors"].append(f"Standup error: {str(e)}")

        # Process blockers if detected and enabled
        if parsed.blocker_mentions and config.auto_parse_blockers:
            for blocker_mention in parsed.blocker_mentions:
                try:
                    blocker = await self._process_blocker(
                        developer_id=developer.id,
                        team_id=team_id,
                        workspace_id=workspace_id,
                        sprint_id=sprint_id,
                        mention=blocker_mention,
                        message_ts=message_ts,
                        channel_id=channel_id,
                        db=db,
                    )
                    if blocker:
                        result["blockers_created"] += 1
                except Exception as e:
                    logger.error(f"Error processing blocker: {e}")
                    result["errors"].append(f"Blocker error: {str(e)}")

        # Process task references if enabled
        if parsed.task_references and config.auto_parse_task_refs:
            for task_ref in parsed.task_references:
                try:
                    work_log = await self._process_task_reference(
                        developer_id=developer.id,
                        workspace_id=workspace_id,
                        sprint_id=sprint_id,
                        task_ref=task_ref,
                        message_text=text,
                        message_ts=message_ts,
                        channel_id=channel_id,
                        db=db,
                    )
                    if work_log:
                        result["work_logs_created"] += 1
                except Exception as e:
                    logger.error(f"Error processing task reference: {e}")
                    result["errors"].append(f"Task ref error: {str(e)}")

        result["processed"] = True
        return result

    async def _process_standup(
        self,
        developer_id: str,
        team_id: str,
        workspace_id: str,
        sprint_id: str | None,
        content: StandupContent,
        message_ts: str | None,
        channel_id: str,
        db: AsyncSession,
    ) -> DeveloperStandup | None:
        """Process a detected standup message."""
        today = date.today()

        # Check for existing standup today
        existing = await db.execute(
            select(DeveloperStandup).where(
                DeveloperStandup.developer_id == developer_id,
                DeveloperStandup.standup_date == today,
            )
        )
        existing_standup = existing.scalar_one_or_none()

        if existing_standup:
            # Update existing standup only if from Slack channel (same source)
            if existing_standup.source == TrackingSource.SLACK_CHANNEL.value:
                existing_standup.yesterday_summary = content.yesterday
                existing_standup.today_plan = content.today
                existing_standup.blockers_summary = content.blockers
                existing_standup.slack_message_ts = message_ts
                existing_standup.slack_channel_id = channel_id
                await db.commit()
                return existing_standup
            else:
                # Don't overwrite command/web submissions
                return None

        # Create new standup
        standup = DeveloperStandup(
            developer_id=developer_id,
            team_id=team_id,
            sprint_id=sprint_id,
            workspace_id=workspace_id,
            standup_date=today,
            yesterday_summary=content.yesterday,
            today_plan=content.today,
            blockers_summary=content.blockers,
            source=TrackingSource.SLACK_CHANNEL.value,
            slack_message_ts=message_ts,
            slack_channel_id=channel_id,
        )
        db.add(standup)
        await db.commit()
        await db.refresh(standup)

        logger.info(f"Created standup for developer {developer_id} from channel {channel_id}")
        return standup

    async def _process_blocker(
        self,
        developer_id: str,
        team_id: str,
        workspace_id: str,
        sprint_id: str | None,
        mention: BlockerMention,
        message_ts: str | None,
        channel_id: str,
        db: AsyncSession,
    ) -> Blocker | None:
        """Process a blocker mention."""
        # Check for similar active blockers to avoid duplicates
        existing = await db.execute(
            select(Blocker).where(
                Blocker.developer_id == developer_id,
                Blocker.status == BlockerStatus.ACTIVE.value,
                Blocker.description.ilike(f"%{mention.description[:50]}%"),
            )
        )
        if existing.scalar_one_or_none():
            # Similar blocker already exists
            return None

        # Resolve task if referenced
        task_id = None
        if mention.task_ref:
            from devograph.services.slack_message_parser import TaskReference, TaskRefType
            task_ref = TaskReference(
                ref_type=TaskRefType.GENERIC,
                ref_string=mention.task_ref,
            )
            task = await self.resolve_task_ref(task_ref, sprint_id, workspace_id, db)
            if task:
                task_id = task.id

        blocker = Blocker(
            developer_id=developer_id,
            task_id=task_id,
            sprint_id=sprint_id,
            team_id=team_id,
            workspace_id=workspace_id,
            description=mention.description,
            severity=mention.severity,
            status=BlockerStatus.ACTIVE.value,
            source=TrackingSource.SLACK_CHANNEL.value,
            slack_message_ts=message_ts,
            slack_channel_id=channel_id,
            external_task_ref=mention.task_ref if not task_id else None,
        )
        db.add(blocker)
        await db.commit()
        await db.refresh(blocker)

        logger.info(f"Created blocker for developer {developer_id}: {mention.description[:50]}")
        return blocker

    async def _process_task_reference(
        self,
        developer_id: str,
        workspace_id: str,
        sprint_id: str | None,
        task_ref: TaskReference,
        message_text: str,
        message_ts: str | None,
        channel_id: str,
        db: AsyncSession,
    ) -> WorkLog | None:
        """Process a task reference in a message."""
        # Only create work log for significant messages
        if len(message_text) < 20:
            return None

        # Resolve the task
        task = await self.resolve_task_ref(task_ref, sprint_id, workspace_id, db)

        # Determine log type based on message content
        log_type = WorkLogType.NOTE.value
        text_lower = message_text.lower()
        if any(kw in text_lower for kw in ["completed", "done", "finished", "merged"]):
            log_type = WorkLogType.PROGRESS.value
        elif "?" in message_text:
            log_type = WorkLogType.QUESTION.value
        elif any(kw in text_lower for kw in ["decided", "decision", "agreed"]):
            log_type = WorkLogType.DECISION.value

        # Create work log
        work_log = WorkLog(
            developer_id=developer_id,
            task_id=task.id if task else None,
            sprint_id=sprint_id,
            workspace_id=workspace_id,
            notes=message_text[:1000],  # Limit notes length
            log_type=log_type,
            source=TrackingSource.SLACK_CHANNEL.value,
            slack_message_ts=message_ts,
            slack_channel_id=channel_id,
            external_task_ref=task_ref.ref_string if not task else None,
        )
        db.add(work_log)
        await db.commit()
        await db.refresh(work_log)

        logger.debug(f"Created work log for task {task_ref.ref_string}")
        return work_log

    async def is_monitored_channel(
        self,
        channel_id: str,
        integration_id: str,
        db: AsyncSession,
    ) -> bool:
        """Check if a channel is configured for monitoring."""
        config = await self.get_channel_config(channel_id, integration_id, db)
        return config is not None
