"""Slack history import and continuous sync service."""

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.integrations import SlackIntegration
from devograph.models.tracking import (
    DeveloperStandup,
    WorkLog,
    Blocker,
    SlackChannelConfig,
    TrackingSource,
    WorkLogType,
    BlockerSeverity,
    BlockerCategory,
)
from devograph.services.slack_message_parser import SlackMessageParser, ParsedMessage

logger = logging.getLogger(__name__)


class SlackHistorySyncService:
    """Service for importing Slack history and continuous sync."""

    SLACK_API_BASE = "https://slack.com/api"
    MESSAGES_PER_PAGE = 200  # Max allowed by Slack API

    def __init__(self):
        self.parser = SlackMessageParser()

    async def get_channels(
        self,
        integration: SlackIntegration,
        types: str = "public_channel,private_channel",
    ) -> list[dict]:
        """Get list of channels the bot has access to."""
        channels = []
        cursor = None

        async with httpx.AsyncClient() as client:
            while True:
                params = {
                    "types": types,
                    "limit": 200,
                    "exclude_archived": "true",
                }
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{self.SLACK_API_BASE}/conversations.list",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                    params=params,
                )
                data = response.json()

                if not data.get("ok"):
                    logger.error(f"Failed to fetch channels: {data.get('error')}")
                    break

                channels.extend(data.get("channels", []))

                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

        return channels

    async def get_channel_members(
        self,
        integration: SlackIntegration,
        channel_id: str,
    ) -> list[str]:
        """Get list of user IDs in a channel."""
        members = []
        cursor = None

        async with httpx.AsyncClient() as client:
            while True:
                params = {"channel": channel_id, "limit": 200}
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{self.SLACK_API_BASE}/conversations.members",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                    params=params,
                )
                data = response.json()

                if not data.get("ok"):
                    logger.error(f"Failed to fetch members: {data.get('error')}")
                    break

                members.extend(data.get("members", []))

                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

        return members

    async def get_user_info(
        self,
        integration: SlackIntegration,
        user_id: str,
    ) -> dict | None:
        """Get user information from Slack."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.SLACK_API_BASE}/users.info",
                headers={"Authorization": f"Bearer {integration.bot_token}"},
                params={"user": user_id},
            )
            data = response.json()

            if data.get("ok"):
                return data.get("user")
            return None

    async def fetch_channel_history(
        self,
        integration: SlackIntegration,
        channel_id: str,
        oldest: datetime | None = None,
        latest: datetime | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        """Fetch message history from a channel."""
        messages = []
        cursor = None
        fetched = 0

        async with httpx.AsyncClient() as client:
            while True:
                params: dict[str, Any] = {
                    "channel": channel_id,
                    "limit": min(self.MESSAGES_PER_PAGE, limit - fetched if limit else self.MESSAGES_PER_PAGE),
                }
                if cursor:
                    params["cursor"] = cursor
                if oldest:
                    params["oldest"] = str(oldest.timestamp())
                if latest:
                    params["latest"] = str(latest.timestamp())

                response = await client.get(
                    f"{self.SLACK_API_BASE}/conversations.history",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                    params=params,
                )
                data = response.json()

                if not data.get("ok"):
                    error = data.get("error")
                    if error == "not_in_channel":
                        # Try to join the channel
                        await self._join_channel(integration, channel_id, client)
                        continue
                    logger.error(f"Failed to fetch history: {error}")
                    break

                batch = data.get("messages", [])
                messages.extend(batch)
                fetched += len(batch)

                if limit and fetched >= limit:
                    break

                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor or not data.get("has_more"):
                    break

        return messages

    async def _join_channel(
        self,
        integration: SlackIntegration,
        channel_id: str,
        client: httpx.AsyncClient,
    ) -> bool:
        """Join a channel."""
        response = await client.post(
            f"{self.SLACK_API_BASE}/conversations.join",
            headers={"Authorization": f"Bearer {integration.bot_token}"},
            json={"channel": channel_id},
        )
        data = response.json()
        return data.get("ok", False)

    async def import_channel_history(
        self,
        integration: SlackIntegration,
        channel_id: str,
        db: AsyncSession,
        days_back: int = 30,
        team_id: str | None = None,
        sprint_id: str | None = None,
    ) -> dict:
        """Import and parse channel history into tracking data."""
        oldest = datetime.utcnow() - timedelta(days=days_back)
        messages = await self.fetch_channel_history(
            integration, channel_id, oldest=oldest
        )

        stats = {
            "total_messages": len(messages),
            "standups_imported": 0,
            "work_logs_imported": 0,
            "blockers_imported": 0,
            "skipped": 0,
        }

        # Get user mappings
        user_mappings = integration.user_mappings or {}

        for msg in messages:
            # Skip bot messages and system messages
            if msg.get("bot_id") or msg.get("subtype"):
                stats["skipped"] += 1
                continue

            user_id = msg.get("user")
            if not user_id:
                stats["skipped"] += 1
                continue

            # Map Slack user to developer
            developer_id = user_mappings.get(user_id)
            if not developer_id:
                stats["skipped"] += 1
                continue

            text = msg.get("text", "")
            ts = msg.get("ts", "")
            message_time = datetime.fromtimestamp(float(ts)) if ts else datetime.utcnow()

            # Parse the message
            parsed = self.parser.parse_message(text)

            # Check if we already imported this message
            existing = await self._message_exists(db, channel_id, ts)
            if existing:
                stats["skipped"] += 1
                continue

            # Create tracking records based on parsed content
            if parsed.standup_content:
                standup = DeveloperStandup(
                    developer_id=developer_id,
                    team_id=team_id,
                    sprint_id=sprint_id,
                    workspace_id=integration.organization_id,
                    standup_date=message_time.date(),
                    yesterday_summary=parsed.standup_content.yesterday,
                    today_plan=parsed.standup_content.today,
                    blockers_summary=parsed.standup_content.blockers,
                    source=TrackingSource.SLACK_CHANNEL,
                    slack_message_ts=ts,
                    slack_channel_id=channel_id,
                )
                db.add(standup)
                stats["standups_imported"] += 1

            if parsed.blocker_mentions:
                for blocker in parsed.blocker_mentions:
                    blocker_record = Blocker(
                        developer_id=developer_id,
                        team_id=team_id,
                        sprint_id=sprint_id,
                        description=blocker.description,
                        severity=BlockerSeverity.MEDIUM,
                        category=BlockerCategory.TECHNICAL,
                        status="active",
                        source=TrackingSource.SLACK_CHANNEL,
                        slack_message_ts=ts,
                        slack_channel_id=channel_id,
                    )
                    db.add(blocker_record)
                    stats["blockers_imported"] += 1

            # Create work log for task references
            if parsed.task_references:
                for task_ref in parsed.task_references:
                    work_log = WorkLog(
                        developer_id=developer_id,
                        task_id=None,  # Would need to resolve task_ref.task_key to actual ID
                        sprint_id=sprint_id,
                        notes=f"[{task_ref.task_key}] {task_ref.context or text[:200]}",
                        log_type=WorkLogType.NOTE,
                        source=TrackingSource.SLACK_CHANNEL,
                        slack_message_ts=ts,
                        slack_channel_id=channel_id,
                        logged_at=message_time,
                    )
                    db.add(work_log)
                    stats["work_logs_imported"] += 1

        await db.commit()
        return stats

    async def _message_exists(
        self,
        db: AsyncSession,
        channel_id: str,
        message_ts: str,
    ) -> bool:
        """Check if a message has already been imported."""
        # Check standups
        result = await db.execute(
            select(DeveloperStandup).where(
                and_(
                    DeveloperStandup.slack_channel_id == channel_id,
                    DeveloperStandup.slack_message_ts == message_ts,
                )
            )
        )
        if result.scalar_one_or_none():
            return True

        # Check work logs
        result = await db.execute(
            select(WorkLog).where(
                and_(
                    WorkLog.slack_channel_id == channel_id,
                    WorkLog.slack_message_ts == message_ts,
                )
            )
        )
        if result.scalar_one_or_none():
            return True

        # Check blockers
        result = await db.execute(
            select(Blocker).where(
                and_(
                    Blocker.slack_channel_id == channel_id,
                    Blocker.slack_message_ts == message_ts,
                )
            )
        )
        if result.scalar_one_or_none():
            return True

        return False

    async def get_last_sync_timestamp(
        self,
        channel_id: str,
        db: AsyncSession,
    ) -> datetime | None:
        """Get the timestamp of the last synced message for a channel."""
        # Check the most recent message across all tracking tables
        latest = None

        for model in [DeveloperStandup, WorkLog, Blocker]:
            result = await db.execute(
                select(model)
                .where(model.slack_channel_id == channel_id)
                .order_by(model.created_at.desc())
                .limit(1)
            )
            record = result.scalar_one_or_none()
            if record and record.slack_message_ts:
                ts = datetime.fromtimestamp(float(record.slack_message_ts))
                if latest is None or ts > latest:
                    latest = ts

        return latest

    async def sync_channel_updates(
        self,
        integration: SlackIntegration,
        channel_id: str,
        db: AsyncSession,
        team_id: str | None = None,
        sprint_id: str | None = None,
    ) -> dict:
        """Sync only new messages since last sync (continuous sync)."""
        last_sync = await self.get_last_sync_timestamp(channel_id, db)

        if last_sync:
            # Add 1 second to avoid re-importing the same message
            oldest = last_sync + timedelta(seconds=1)
        else:
            # First sync - get last 7 days
            oldest = datetime.utcnow() - timedelta(days=7)

        messages = await self.fetch_channel_history(
            integration, channel_id, oldest=oldest
        )

        if not messages:
            return {"synced": 0, "message": "No new messages"}

        return await self.import_channel_history(
            integration, channel_id, db,
            days_back=0,  # We already filtered by oldest
            team_id=team_id,
            sprint_id=sprint_id,
        )

    async def full_import(
        self,
        integration: SlackIntegration,
        db: AsyncSession,
        channel_ids: list[str] | None = None,
        days_back: int = 30,
        team_id: str | None = None,
        sprint_id: str | None = None,
    ) -> dict:
        """Full import from multiple channels."""
        if not channel_ids:
            # Get all configured channels
            result = await db.execute(
                select(SlackChannelConfig).where(
                    SlackChannelConfig.integration_id == integration.id
                )
            )
            configs = result.scalars().all()
            channel_ids = [c.channel_id for c in configs]

        if not channel_ids:
            # Get all channels the bot has access to
            channels = await self.get_channels(integration)
            channel_ids = [c["id"] for c in channels]

        total_stats = {
            "channels_processed": 0,
            "total_messages": 0,
            "standups_imported": 0,
            "work_logs_imported": 0,
            "blockers_imported": 0,
            "skipped": 0,
            "errors": [],
        }

        for channel_id in channel_ids:
            try:
                stats = await self.import_channel_history(
                    integration, channel_id, db,
                    days_back=days_back,
                    team_id=team_id,
                    sprint_id=sprint_id,
                )
                total_stats["channels_processed"] += 1
                total_stats["total_messages"] += stats["total_messages"]
                total_stats["standups_imported"] += stats["standups_imported"]
                total_stats["work_logs_imported"] += stats["work_logs_imported"]
                total_stats["blockers_imported"] += stats["blockers_imported"]
                total_stats["skipped"] += stats["skipped"]
            except Exception as e:
                logger.error(f"Error importing channel {channel_id}: {e}")
                total_stats["errors"].append({"channel": channel_id, "error": str(e)})

        return total_stats

    async def setup_channel_monitoring(
        self,
        integration: SlackIntegration,
        channel_id: str,
        channel_name: str,
        team_id: str,
        db: AsyncSession,
        channel_type: str = "team",
        auto_parse_standups: bool = True,
        auto_parse_task_refs: bool = True,
        auto_parse_blockers: bool = True,
    ) -> SlackChannelConfig:
        """Configure a channel for monitoring."""
        # Check if already configured
        result = await db.execute(
            select(SlackChannelConfig).where(
                and_(
                    SlackChannelConfig.integration_id == integration.id,
                    SlackChannelConfig.channel_id == channel_id,
                )
            )
        )
        config = result.scalar_one_or_none()

        if config:
            # Update existing config
            config.auto_parse_standups = auto_parse_standups
            config.auto_parse_task_refs = auto_parse_task_refs
            config.auto_parse_blockers = auto_parse_blockers
            config.is_active = True
        else:
            # Create new config
            config = SlackChannelConfig(
                integration_id=integration.id,
                team_id=team_id,
                channel_id=channel_id,
                channel_name=channel_name,
                channel_type=channel_type,
                auto_parse_standups=auto_parse_standups,
                auto_parse_task_refs=auto_parse_task_refs,
                auto_parse_blockers=auto_parse_blockers,
            )
            db.add(config)

        await db.commit()
        await db.refresh(config)
        return config

    async def map_slack_users_to_developers(
        self,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> dict:
        """Auto-map Slack users to developers based on email."""
        from devograph.models.developer import Developer

        # Get all Slack workspace users
        members = []
        cursor = None

        async with httpx.AsyncClient() as client:
            while True:
                params = {"limit": 200}
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{self.SLACK_API_BASE}/users.list",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                    params=params,
                )
                data = response.json()

                if not data.get("ok"):
                    break

                members.extend(data.get("members", []))

                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

        # Get all developers
        result = await db.execute(select(Developer))
        developers = {d.email.lower(): d.id for d in result.scalars().all() if d.email}

        # Map users
        mappings = dict(integration.user_mappings or {})
        mapped = 0
        already_mapped = 0

        for member in members:
            if member.get("is_bot") or member.get("deleted"):
                continue

            slack_user_id = member.get("id")
            email = member.get("profile", {}).get("email", "").lower()

            if slack_user_id in mappings:
                already_mapped += 1
                continue

            if email and email in developers:
                mappings[slack_user_id] = developers[email]
                mapped += 1

        # Save mappings
        integration.user_mappings = mappings
        await db.commit()

        return {
            "total_slack_users": len([m for m in members if not m.get("is_bot") and not m.get("deleted")]),
            "total_developers": len(developers),
            "newly_mapped": mapped,
            "already_mapped": already_mapped,
            "unmapped": len([m for m in members if not m.get("is_bot") and not m.get("deleted")]) - mapped - already_mapped,
        }
