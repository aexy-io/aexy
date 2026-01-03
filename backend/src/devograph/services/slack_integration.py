"""Slack integration service for notifications, slash commands, and bot interactions."""

import hashlib
import hmac
import logging
import time
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.config import settings
from devograph.models.developer import Developer
from devograph.models.integrations import SlackIntegration, SlackNotificationLog
from devograph.schemas.integrations import (
    SlackCommandResponse,
    SlackCommandType,
    SlackIntegrationResponse,
    SlackIntegrationUpdate,
    SlackMessage,
    SlackNotificationResponse,
    SlackNotificationType,
    SlackOAuthCallback,
    SlackSlashCommand,
)
from devograph.services.slack_tracking_service import SlackTrackingService
from devograph.services.slack_channel_monitor import SlackChannelMonitorService

logger = logging.getLogger(__name__)


class SlackIntegrationService:
    """Service for Slack integration: OAuth, messaging, commands."""

    SLACK_API_BASE = "https://slack.com/api"
    SLACK_OAUTH_URL = "https://slack.com/oauth/v2/authorize"

    def __init__(self):
        self.client_id = settings.slack_client_id
        self.client_secret = settings.slack_client_secret
        self.signing_secret = settings.slack_signing_secret
        self.redirect_uri = settings.slack_redirect_uri
        # Initialize tracking services
        self.tracking_service = SlackTrackingService()
        self.channel_monitor = SlackChannelMonitorService()

    # OAuth Flow
    def get_install_url(self, state: str) -> str:
        """Generate Slack OAuth installation URL."""
        scopes = [
            "chat:write",
            "chat:write.public",
            "commands",
            "users:read",
            "channels:read",
            "groups:read",
            "im:read",
            "mpim:read",
        ]

        params = {
            "client_id": self.client_id,
            "scope": ",".join(scopes),
            "redirect_uri": self.redirect_uri,
            "state": state,
        }
        return f"{self.SLACK_OAUTH_URL}?{urlencode(params)}"

    async def complete_oauth(
        self,
        callback: SlackOAuthCallback,
        installer_id: str,
        organization_id: str,
        db: AsyncSession,
    ) -> SlackIntegrationResponse:
        """Complete OAuth flow and store integration."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.SLACK_API_BASE}/oauth.v2.access",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": callback.code,
                    "redirect_uri": self.redirect_uri,
                },
            )
            data = response.json()

        if not data.get("ok"):
            raise ValueError(f"Slack OAuth failed: {data.get('error', 'Unknown error')}")

        # Check if integration already exists for this team
        existing = await db.execute(
            select(SlackIntegration).where(SlackIntegration.team_id == data["team"]["id"])
        )
        integration = existing.scalar_one_or_none()

        if integration:
            # Update existing integration
            integration.bot_token = data["access_token"]
            integration.bot_user_id = data.get("bot_user_id")
            integration.scope = data.get("scope")
            integration.is_active = True
            integration.installed_by = installer_id
        else:
            # Create new integration
            integration = SlackIntegration(
                organization_id=organization_id,
                team_id=data["team"]["id"],
                team_name=data["team"]["name"],
                bot_token=data["access_token"],
                bot_user_id=data.get("bot_user_id"),
                app_id=data.get("app_id"),
                scope=data.get("scope"),
                installed_by=installer_id,
            )
            db.add(integration)

        await db.commit()
        await db.refresh(integration)
        return SlackIntegrationResponse.model_validate(integration)

    async def uninstall(self, integration_id: str, db: AsyncSession) -> bool:
        """Uninstall Slack integration."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return False

        # Revoke the token
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.SLACK_API_BASE}/auth.revoke",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                )
        except Exception as e:
            logger.warning(f"Failed to revoke Slack token: {e}")

        await db.delete(integration)
        await db.commit()
        return True

    # Integration Management
    async def get_integration(
        self, integration_id: str, db: AsyncSession
    ) -> SlackIntegration | None:
        """Get integration by ID."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        return result.scalar_one_or_none()

    async def get_integration_by_team(
        self, team_id: str, db: AsyncSession
    ) -> SlackIntegration | None:
        """Get integration by Slack team ID."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.team_id == team_id)
        )
        return result.scalar_one_or_none()

    async def get_integration_by_org(
        self, organization_id: str, db: AsyncSession
    ) -> SlackIntegration | None:
        """Get integration by organization ID."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    async def update_integration(
        self, integration_id: str, data: SlackIntegrationUpdate, db: AsyncSession
    ) -> SlackIntegrationResponse | None:
        """Update integration settings."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return None

        if data.default_channel_id is not None:
            integration.default_channel_id = data.default_channel_id
        if data.notification_settings is not None:
            integration.notification_settings = data.notification_settings
        if data.is_active is not None:
            integration.is_active = data.is_active

        await db.commit()
        await db.refresh(integration)
        return SlackIntegrationResponse.model_validate(integration)

    # Messaging
    async def send_message(
        self,
        integration: SlackIntegration,
        channel_id: str,
        message: SlackMessage,
        notification_type: SlackNotificationType,
        db: AsyncSession,
    ) -> SlackNotificationResponse:
        """Send a message to a Slack channel."""
        payload: dict[str, Any] = {
            "channel": channel_id,
            "text": message.text,
        }

        if message.blocks:
            payload["blocks"] = [block.model_dump(exclude_none=True) for block in message.blocks]
        if message.attachments:
            payload["attachments"] = message.attachments
        if message.thread_ts:
            payload["thread_ts"] = message.thread_ts

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.SLACK_API_BASE}/chat.postMessage",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                    json=payload,
                )
                data = response.json()

            # Log the notification
            log_entry = SlackNotificationLog(
                integration_id=integration.id,
                channel_id=channel_id,
                message_ts=data.get("ts"),
                notification_type=notification_type.value,
                content_summary=message.text[:200] if message.text else None,
                status="sent" if data.get("ok") else "failed",
                error_message=data.get("error") if not data.get("ok") else None,
            )
            db.add(log_entry)
            await db.commit()

            return SlackNotificationResponse(
                success=data.get("ok", False),
                message_ts=data.get("ts"),
                channel_id=channel_id,
                error=data.get("error"),
            )
        except Exception as e:
            logger.error(f"Failed to send Slack message: {e}")
            # Log the failure
            log_entry = SlackNotificationLog(
                integration_id=integration.id,
                channel_id=channel_id,
                notification_type=notification_type.value,
                content_summary=message.text[:200] if message.text else None,
                status="failed",
                error_message=str(e),
            )
            db.add(log_entry)
            await db.commit()

            return SlackNotificationResponse(
                success=False,
                channel_id=channel_id,
                error=str(e),
            )

    async def send_report_notification(
        self,
        integration: SlackIntegration,
        report_name: str,
        report_url: str,
        db: AsyncSession,
    ) -> SlackNotificationResponse:
        """Send a report notification."""
        channel_id = (
            integration.notification_settings.get("reports")
            or integration.default_channel_id
        )

        if not channel_id:
            return SlackNotificationResponse(
                success=False,
                channel_id="",
                error="No channel configured for reports",
            )

        message = SlackMessage(
            text=f"New report available: {report_name}",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":bar_chart: *New Report Available*\n\n*{report_name}*",
                    },
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "View Report"},
                            "url": report_url,
                            "style": "primary",
                        }
                    ],
                },
            ],
        )

        return await self.send_message(
            integration, channel_id, message, SlackNotificationType.REPORT, db
        )

    async def send_alert_notification(
        self,
        integration: SlackIntegration,
        alert_type: str,
        alert_message: str,
        severity: str,
        db: AsyncSession,
    ) -> SlackNotificationResponse:
        """Send an alert notification (e.g., attrition risk)."""
        channel_id = (
            integration.notification_settings.get("alerts")
            or integration.default_channel_id
        )

        if not channel_id:
            return SlackNotificationResponse(
                success=False,
                channel_id="",
                error="No channel configured for alerts",
            )

        severity_emoji = {
            "critical": ":red_circle:",
            "high": ":large_orange_circle:",
            "medium": ":large_yellow_circle:",
            "low": ":white_circle:",
        }.get(severity.lower(), ":white_circle:")

        message = SlackMessage(
            text=f"{alert_type}: {alert_message}",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"{severity_emoji} *{alert_type}*\n\n{alert_message}",
                    },
                },
            ],
        )

        return await self.send_message(
            integration, channel_id, message, SlackNotificationType.ALERT, db
        )

    # Slash Commands
    async def handle_slash_command(
        self,
        command: SlackSlashCommand,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle incoming slash command."""
        integration = await self.get_integration_by_team(command.team_id, db)
        if not integration or not integration.is_active:
            return SlackCommandResponse(
                text="Devograph is not installed in this workspace. Please install it first.",
            )

        # Parse the command
        parts = command.text.strip().split(maxsplit=1)
        subcommand = parts[0].lower() if parts else "help"
        args = parts[1] if len(parts) > 1 else ""

        try:
            cmd_type = SlackCommandType(subcommand)
        except ValueError:
            cmd_type = SlackCommandType.HELP

        # Route to appropriate handler
        handlers = {
            # Existing commands
            SlackCommandType.PROFILE: self._handle_profile_command,
            SlackCommandType.MATCH: self._handle_match_command,
            SlackCommandType.TEAM: self._handle_team_command,
            SlackCommandType.INSIGHTS: self._handle_insights_command,
            SlackCommandType.REPORT: self._handle_report_command,
            SlackCommandType.HELP: self._handle_help_command,
            # Tracking commands
            SlackCommandType.STANDUP: self.tracking_service.handle_standup_command,
            SlackCommandType.UPDATE: self.tracking_service.handle_update_command,
            SlackCommandType.BLOCKER: self.tracking_service.handle_blocker_command,
            SlackCommandType.TIMELOG: self.tracking_service.handle_timelog_command,
            SlackCommandType.LOG: self.tracking_service.handle_log_command,
            SlackCommandType.STATUS: self.tracking_service.handle_status_command,
            SlackCommandType.MYTASKS: self.tracking_service.handle_mytasks_command,
        }

        handler = handlers.get(cmd_type, self._handle_help_command)
        return await handler(command, args, integration, db)

    async def _handle_profile_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle /devograph profile @user command."""
        # Extract user mention or username
        username = args.strip().lstrip("@<>").split("|")[0] if args else None

        if not username:
            # Try to get the requester's mapped developer profile
            developer_id = integration.user_mappings.get(command.user_id)
            if developer_id:
                result = await db.execute(
                    select(Developer).where(Developer.id == developer_id)
                )
                developer = result.scalar_one_or_none()
            else:
                developer = None
        else:
            # Search for developer by username
            result = await db.execute(
                select(Developer).where(Developer.github_username == username)
            )
            developer = result.scalar_one_or_none()

        if not developer:
            return SlackCommandResponse(
                text=f"Developer not found. Make sure the user exists in Devograph.",
            )

        # Build profile response
        skills_text = ", ".join(developer.skills[:5]) if developer.skills else "No skills recorded"
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":bust_in_silhouette: *Developer Profile*",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Name:*\n{developer.name or developer.github_username}"},
                    {"type": "mrkdwn", "text": f"*GitHub:*\n@{developer.github_username}"},
                    {"type": "mrkdwn", "text": f"*Seniority:*\n{developer.seniority_level or 'Unknown'}"},
                    {"type": "mrkdwn", "text": f"*Top Skills:*\n{skills_text}"},
                ],
            },
        ]

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f"Profile: {developer.name or developer.github_username}",
            blocks=blocks,
        )

    async def _handle_match_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle /devograph match "task description" command."""
        if not args:
            return SlackCommandResponse(
                text='Please provide a task description. Example: `/devograph match "Fix authentication bug in OAuth flow"`',
            )

        # This would integrate with the task matching service
        # For now, return a placeholder response
        return SlackCommandResponse(
            response_type="in_channel",
            text=f":mag: *Task Matching*\n\nSearching for best matches for: _{args}_\n\n_Please use the web interface for full matching results._",
        )

    async def _handle_team_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle /devograph team command."""
        # Get developer count
        result = await db.execute(select(Developer))
        developers = result.scalars().all()

        if not developers:
            return SlackCommandResponse(
                text="No developers found in your organization.",
            )

        # Aggregate skill counts
        skill_counts: dict[str, int] = {}
        for dev in developers:
            for skill in dev.skills or []:
                skill_counts[skill] = skill_counts.get(skill, 0) + 1

        top_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        skills_text = "\n".join([f"• {skill}: {count}" for skill, count in top_skills])

        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":busts_in_silhouette: *Team Overview*\n\n*Total Developers:* {len(developers)}",
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Top Skills:*\n{skills_text}",
                },
            },
        ]

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f"Team Overview: {len(developers)} developers",
            blocks=blocks,
        )

    async def _handle_insights_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle /devograph insights command."""
        return SlackCommandResponse(
            response_type="ephemeral",
            text=":crystal_ball: *Team Insights*\n\n_Use the Devograph web dashboard for detailed predictive insights including attrition risk, burnout indicators, and performance trajectories._",
        )

    async def _handle_report_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle /devograph report command."""
        return SlackCommandResponse(
            response_type="ephemeral",
            text=":bar_chart: *Reports*\n\n_Use the Devograph web dashboard to create and schedule custom reports. Scheduled reports can be delivered to Slack channels automatically._",
        )

    async def _handle_help_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """Handle /devograph help command."""
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": ":wave: *Devograph Commands*",
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": """*Profile & Team:*
• `/devograph profile [@user]` - View developer profile
• `/devograph team` - Team skill overview
• `/devograph insights` - Team health summary

*Tracking:*
• `/devograph standup yesterday: X | today: Y | blockers: Z` - Submit standup
• `/devograph update TASK-123 [status] "notes"` - Update task status
• `/devograph blocker "description" [TASK-REF]` - Report a blocker
• `/devograph timelog TASK-123 2h "notes"` - Log time
• `/devograph log TASK-123 "notes"` - Add work note
• `/devograph status` - View your current status
• `/devograph mytasks` - List your sprint tasks

*Other:*
• `/devograph match "task"` - Find best developer for a task
• `/devograph report` - Report information
• `/devograph help` - Show this help message""",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "For full features, visit the Devograph web dashboard.",
                    }
                ],
            },
        ]

        return SlackCommandResponse(
            response_type="ephemeral",
            text="Devograph Commands",
            blocks=blocks,
        )

    # Event Handling
    async def handle_event(
        self,
        event_type: str,
        event_data: dict,
        team_id: str,
        db: AsyncSession,
    ) -> dict:
        """Handle incoming Slack events."""
        integration = await self.get_integration_by_team(team_id, db)
        if not integration or not integration.is_active:
            return {"ok": False, "error": "Integration not found"}

        # Handle different event types
        if event_type == "app_mention":
            return await self._handle_app_mention(event_data, integration, db)
        elif event_type == "message":
            # Ignore bot messages to prevent loops
            if event_data.get("bot_id") or event_data.get("subtype") == "bot_message":
                return {"ok": True}

            # Check if this is a channel message (not DM)
            channel_id = event_data.get("channel", "")
            channel_type = event_data.get("channel_type", "")

            # Process channel messages through monitor if configured
            if channel_type in ("channel", "group") or channel_id.startswith("C"):
                is_monitored = await self.channel_monitor.is_monitored_channel(
                    channel_id, integration.id, db
                )
                if is_monitored:
                    try:
                        result = await self.channel_monitor.process_channel_message(
                            channel_id, event_data, integration, db
                        )
                        logger.debug(f"Channel monitor result: {result}")
                    except Exception as e:
                        logger.error(f"Error processing channel message: {e}")

            # Handle direct messages
            if channel_type == "im" or channel_id.startswith("D"):
                return await self._handle_direct_message(event_data, integration, db)

        return {"ok": True}

    async def _handle_app_mention(
        self,
        event_data: dict,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> dict:
        """Handle @devograph mentions."""
        channel = event_data.get("channel")
        thread_ts = event_data.get("thread_ts") or event_data.get("ts")

        message = SlackMessage(
            text="Hi! Use `/devograph help` to see available commands.",
            thread_ts=thread_ts,
        )

        await self.send_message(
            integration, channel, message, SlackNotificationType.COMMAND_RESPONSE, db
        )
        return {"ok": True}

    async def _handle_direct_message(
        self,
        event_data: dict,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> dict:
        """Handle direct messages to the bot."""
        channel = event_data.get("channel")

        message = SlackMessage(
            text="Hi! I'm Devograph. Use `/devograph help` in any channel to see available commands.",
        )

        await self.send_message(
            integration, channel, message, SlackNotificationType.COMMAND_RESPONSE, db
        )
        return {"ok": True}

    # Request Verification
    def verify_request(
        self,
        timestamp: str,
        signature: str,
        body: bytes,
    ) -> bool:
        """Verify that a request came from Slack."""
        if not self.signing_secret:
            logger.warning("No Slack signing secret configured")
            return False

        # Check timestamp to prevent replay attacks
        request_time = int(timestamp)
        current_time = int(time.time())
        if abs(current_time - request_time) > 60 * 5:
            return False

        # Compute signature
        sig_basestring = f"v0:{timestamp}:{body.decode()}"
        computed_signature = (
            "v0="
            + hmac.new(
                self.signing_secret.encode(),
                sig_basestring.encode(),
                hashlib.sha256,
            ).hexdigest()
        )

        return hmac.compare_digest(computed_signature, signature)

    # User Mapping
    async def map_user(
        self,
        integration_id: str,
        slack_user_id: str,
        developer_id: str,
        db: AsyncSession,
    ) -> bool:
        """Map a Slack user to a Devograph developer."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return False

        mappings = dict(integration.user_mappings)
        mappings[slack_user_id] = developer_id
        integration.user_mappings = mappings

        await db.commit()
        return True

    async def unmap_user(
        self,
        integration_id: str,
        slack_user_id: str,
        db: AsyncSession,
    ) -> bool:
        """Remove a Slack user mapping."""
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return False

        mappings = dict(integration.user_mappings)
        if slack_user_id in mappings:
            del mappings[slack_user_id]
            integration.user_mappings = mappings
            await db.commit()

        return True

    async def get_notification_logs(
        self,
        integration_id: str,
        db: AsyncSession,
        limit: int = 50,
    ) -> list[SlackNotificationLog]:
        """Get notification logs for an integration."""
        result = await db.execute(
            select(SlackNotificationLog)
            .where(SlackNotificationLog.integration_id == integration_id)
            .order_by(SlackNotificationLog.sent_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
