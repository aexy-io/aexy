"""Slack tracking service for handling tracking-related slash commands."""

import logging
import re
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.developer import Developer
from devograph.models.integrations import SlackIntegration
from devograph.models.sprint import Sprint, SprintTask
from devograph.models.team import Team, TeamMember
from devograph.models.tracking import (
    Blocker,
    BlockerSeverity,
    BlockerStatus,
    DeveloperStandup,
    TimeEntry,
    TrackingSource,
    WorkLog,
    WorkLogType,
)
from devograph.schemas.integrations import SlackCommandResponse, SlackSlashCommand

logger = logging.getLogger(__name__)


class SlackTrackingService:
    """Service for handling tracking-related Slack slash commands."""

    # Duration parsing patterns
    DURATION_PATTERN = re.compile(
        r"(?:(\d+)\s*h(?:ours?)?)?[\s,]*(?:(\d+)\s*m(?:in(?:utes?)?)?)?",
        re.IGNORECASE,
    )

    # Task reference patterns
    TASK_REF_PATTERNS = [
        re.compile(r"#(\d+)"),  # #123
        re.compile(r"([A-Z]+-\d+)", re.IGNORECASE),  # JIRA-123, LINEAR-123
        re.compile(r"task[:\s]+(\S+)", re.IGNORECASE),  # task:123
    ]

    async def get_developer_from_slack_user(
        self,
        slack_user_id: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> Developer | None:
        """Get developer from Slack user ID using user mappings."""
        developer_id = integration.user_mappings.get(slack_user_id)
        if not developer_id:
            return None

        result = await db.execute(
            select(Developer).where(Developer.id == developer_id)
        )
        return result.scalar_one_or_none()

    async def get_developer_team(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> Team | None:
        """Get the primary team for a developer."""
        result = await db.execute(
            select(TeamMember)
            .where(TeamMember.developer_id == developer_id)
            .limit(1)
        )
        member = result.scalar_one_or_none()
        if not member:
            return None

        result = await db.execute(select(Team).where(Team.id == member.team_id))
        return result.scalar_one_or_none()

    async def get_active_sprint(
        self,
        team_id: str,
        db: AsyncSession,
    ) -> Sprint | None:
        """Get the active sprint for a team."""
        result = await db.execute(
            select(Sprint)
            .where(Sprint.team_id == team_id, Sprint.status == "active")
            .limit(1)
        )
        return result.scalar_one_or_none()

    def parse_duration(self, duration_str: str) -> int | None:
        """Parse a duration string like '2h', '30m', '1h30m' into minutes."""
        match = self.DURATION_PATTERN.match(duration_str.strip())
        if not match:
            return None

        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        total = hours * 60 + minutes

        return total if total > 0 else None

    def extract_task_ref(self, text: str) -> tuple[str | None, str]:
        """Extract task reference from text. Returns (ref, remaining_text)."""
        for pattern in self.TASK_REF_PATTERNS:
            match = pattern.search(text)
            if match:
                ref = match.group(0)
                remaining = text[:match.start()] + text[match.end():]
                return ref.strip(), remaining.strip()
        return None, text

    async def resolve_task_ref(
        self,
        task_ref: str,
        sprint_id: str | None,
        workspace_id: str,
        db: AsyncSession,
    ) -> SprintTask | None:
        """Try to resolve a task reference to an actual SprintTask."""
        # Try to match by external reference or title
        if sprint_id:
            result = await db.execute(
                select(SprintTask)
                .where(
                    SprintTask.sprint_id == sprint_id,
                    SprintTask.external_id.ilike(f"%{task_ref}%"),
                )
                .limit(1)
            )
            task = result.scalar_one_or_none()
            if task:
                return task

        # Try matching by title
        result = await db.execute(
            select(SprintTask)
            .where(SprintTask.title.ilike(f"%{task_ref}%"))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def handle_standup_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph standup command.

        Formats:
        - /devograph standup yesterday: X | today: Y | blockers: Z
        - /devograph standup (opens modal for structured input)
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile. Please ask an admin to set up the mapping.",
            )

        team = await self.get_developer_team(developer.id, db)
        if not team:
            return SlackCommandResponse(
                text=":warning: You are not assigned to any team. Please contact your admin.",
            )

        if not args:
            # Return instructions for inline standup
            return SlackCommandResponse(
                text="""*Submit your standup inline:*

`/devograph standup yesterday: what you did | today: what you'll do | blockers: any blockers`

*Example:*
`/devograph standup yesterday: Fixed auth bug, reviewed PRs | today: Start API refactor | blockers: Waiting for design specs`""",
            )

        # Parse inline standup format
        yesterday = ""
        today = ""
        blockers = ""

        # Split by common delimiters
        parts = re.split(r"\s*\|\s*", args)
        for part in parts:
            part_lower = part.lower().strip()
            if part_lower.startswith("yesterday:"):
                yesterday = part[10:].strip()
            elif part_lower.startswith("today:"):
                today = part[6:].strip()
            elif part_lower.startswith("blockers:") or part_lower.startswith("blocked:"):
                blockers = part.split(":", 1)[1].strip() if ":" in part else ""

        if not yesterday or not today:
            return SlackCommandResponse(
                text=":x: Could not parse standup. Please use format:\n`yesterday: X | today: Y | blockers: Z`",
            )

        # Check for existing standup today
        existing = await db.execute(
            select(DeveloperStandup).where(
                DeveloperStandup.developer_id == developer.id,
                DeveloperStandup.standup_date == date.today(),
            )
        )
        existing_standup = existing.scalar_one_or_none()

        if existing_standup:
            # Update existing
            existing_standup.yesterday_summary = yesterday
            existing_standup.today_plan = today
            existing_standup.blockers_summary = blockers if blockers else None
            existing_standup.source = TrackingSource.SLACK_COMMAND.value
            existing_standup.slack_message_ts = None  # No message TS for commands
            existing_standup.slack_channel_id = command.channel_id
            await db.commit()

            return SlackCommandResponse(
                response_type="ephemeral",
                text=":white_check_mark: *Standup updated!*",
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f":white_check_mark: *Standup updated for {date.today().strftime('%B %d, %Y')}*",
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Yesterday:*\n{yesterday}"},
                            {"type": "mrkdwn", "text": f"*Today:*\n{today}"},
                        ],
                    },
                ]
                + (
                    [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f":warning: *Blockers:*\n{blockers}",
                            },
                        }
                    ]
                    if blockers
                    else []
                ),
            )

        # Get active sprint
        sprint = await self.get_active_sprint(team.id, db)

        # Create new standup
        standup = DeveloperStandup(
            developer_id=developer.id,
            team_id=team.id,
            sprint_id=sprint.id if sprint else None,
            workspace_id=team.workspace_id,
            standup_date=date.today(),
            yesterday_summary=yesterday,
            today_plan=today,
            blockers_summary=blockers if blockers else None,
            source=TrackingSource.SLACK_COMMAND.value,
            slack_channel_id=command.channel_id,
        )
        db.add(standup)
        await db.commit()

        return SlackCommandResponse(
            response_type="ephemeral",
            text=":white_check_mark: *Standup submitted!*",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":white_check_mark: *Standup submitted for {date.today().strftime('%B %d, %Y')}*",
                    },
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Yesterday:*\n{yesterday}"},
                        {"type": "mrkdwn", "text": f"*Today:*\n{today}"},
                    ],
                },
            ]
            + (
                [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f":warning: *Blockers:*\n{blockers}",
                        },
                    }
                ]
                if blockers
                else []
            ),
        )

    async def handle_update_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph update command.

        Format: /devograph update TASK-123 [status] [notes]
        Examples:
        - /devograph update TASK-123 in_progress "Started working"
        - /devograph update #45 done
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile.",
            )

        if not args:
            return SlackCommandResponse(
                text="""*Update a task:*

`/devograph update TASK-REF [status] ["notes"]`

*Examples:*
• `/devograph update #123 in_progress`
• `/devograph update JIRA-456 done "Completed implementation"`
• `/devograph update #789 "Added error handling"`

*Statuses:* todo, in_progress, review, done""",
            )

        # Parse: task_ref [status] ["notes"]
        task_ref, remaining = self.extract_task_ref(args)
        if not task_ref:
            return SlackCommandResponse(
                text=":x: Could not find task reference. Use #123, JIRA-123, etc.",
            )

        # Parse optional status and notes
        status = None
        notes = None

        # Check for quoted notes
        quote_match = re.search(r'"([^"]+)"', remaining)
        if quote_match:
            notes = quote_match.group(1)
            remaining = remaining[:quote_match.start()] + remaining[quote_match.end():]

        # Check for status
        remaining_parts = remaining.strip().split()
        valid_statuses = ["todo", "in_progress", "review", "done", "backlog"]
        for part in remaining_parts:
            if part.lower() in valid_statuses:
                status = part.lower()
                break

        # Try to resolve task
        team = await self.get_developer_team(developer.id, db)
        sprint = await self.get_active_sprint(team.id, db) if team else None

        task = await self.resolve_task_ref(
            task_ref,
            sprint.id if sprint else None,
            team.workspace_id if team else "",
            db,
        )

        # Update task status if found and status provided
        if task and status:
            task.status = status
            await db.commit()

        # Create work log
        log = WorkLog(
            developer_id=developer.id,
            task_id=task.id if task else None,
            sprint_id=sprint.id if sprint else None,
            workspace_id=team.workspace_id if team else "",
            notes=notes or f"Status updated to {status}" if status else "Task update",
            log_type=WorkLogType.UPDATE.value,
            source=TrackingSource.SLACK_COMMAND.value,
            slack_channel_id=command.channel_id,
            external_task_ref=task_ref if not task else None,
        )
        db.add(log)
        await db.commit()

        task_display = task.title if task else task_ref
        status_display = f" → *{status}*" if status else ""

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f":white_check_mark: Updated {task_display}{status_display}",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":white_check_mark: *Task Updated*\n\n*{task_display}*{status_display}",
                    },
                },
            ]
            + (
                [
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"_Notes: {notes}_"},
                    }
                ]
                if notes
                else []
            ),
        )

    async def handle_blocker_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph blocker command.

        Format: /devograph blocker "description" [TASK-REF] [--severity=high]
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile.",
            )

        team = await self.get_developer_team(developer.id, db)
        if not team:
            return SlackCommandResponse(
                text=":warning: You are not assigned to any team.",
            )

        if not args:
            return SlackCommandResponse(
                text="""*Report a blocker:*

`/devograph blocker "description" [TASK-REF] [--severity=level]`

*Examples:*
• `/devograph blocker "Waiting for API access"`
• `/devograph blocker "Database connection issues" #123`
• `/devograph blocker "Need design specs" --severity=high`

*Severity levels:* low, medium (default), high, critical""",
            )

        # Parse severity flag
        severity = BlockerSeverity.MEDIUM
        severity_match = re.search(r"--severity=(\w+)", args, re.IGNORECASE)
        if severity_match:
            try:
                severity = BlockerSeverity(severity_match.group(1).lower())
            except ValueError:
                pass
            args = args[:severity_match.start()] + args[severity_match.end():]

        # Extract description (quoted or not)
        description = ""
        quote_match = re.search(r'"([^"]+)"', args)
        if quote_match:
            description = quote_match.group(1)
            remaining = args[:quote_match.start()] + args[quote_match.end():]
        else:
            remaining = args
            # Take the first significant portion as description
            description = remaining.strip()

        if not description:
            return SlackCommandResponse(
                text=":x: Please provide a blocker description.",
            )

        # Extract task reference
        task_ref, _ = self.extract_task_ref(remaining)
        sprint = await self.get_active_sprint(team.id, db)
        task = None
        if task_ref:
            task = await self.resolve_task_ref(
                task_ref,
                sprint.id if sprint else None,
                team.workspace_id,
                db,
            )

        # Create blocker
        blocker = Blocker(
            developer_id=developer.id,
            task_id=task.id if task else None,
            sprint_id=sprint.id if sprint else None,
            team_id=team.id,
            workspace_id=team.workspace_id,
            description=description,
            severity=severity.value,
            status=BlockerStatus.ACTIVE.value,
            source=TrackingSource.SLACK_COMMAND.value,
            slack_channel_id=command.channel_id,
            external_task_ref=task_ref if not task else None,
        )
        db.add(blocker)
        await db.commit()

        severity_emoji = {
            "low": ":white_circle:",
            "medium": ":large_yellow_circle:",
            "high": ":large_orange_circle:",
            "critical": ":red_circle:",
        }.get(severity.value, ":large_yellow_circle:")

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f":rotating_light: Blocker reported",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":rotating_light: *Blocker Reported*\n\n{description}",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"{severity_emoji} Severity: {severity.value}"
                            + (f" | Task: {task.title if task else task_ref}" if task or task_ref else ""),
                        }
                    ],
                },
            ],
        )

    async def handle_timelog_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph timelog command.

        Format: /devograph timelog TASK-REF DURATION ["description"]
        Examples:
        - /devograph timelog #123 2h "Implemented login"
        - /devograph timelog JIRA-456 30m
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile.",
            )

        if not args:
            return SlackCommandResponse(
                text="""*Log time against a task:*

`/devograph timelog TASK-REF DURATION ["description"]`

*Examples:*
• `/devograph timelog #123 2h`
• `/devograph timelog JIRA-456 1h30m "Fixed bug"`
• `/devograph timelog #789 45m`

*Duration format:* 2h, 30m, 1h30m""",
            )

        # Extract task reference
        task_ref, remaining = self.extract_task_ref(args)
        if not task_ref:
            return SlackCommandResponse(
                text=":x: Could not find task reference. Use #123, JIRA-123, etc.",
            )

        # Extract description (quoted)
        description = None
        quote_match = re.search(r'"([^"]+)"', remaining)
        if quote_match:
            description = quote_match.group(1)
            remaining = remaining[:quote_match.start()] + remaining[quote_match.end():]

        # Parse duration from remaining text
        duration_minutes = None
        for part in remaining.strip().split():
            parsed = self.parse_duration(part)
            if parsed:
                duration_minutes = parsed
                break

        if not duration_minutes:
            return SlackCommandResponse(
                text=":x: Could not parse duration. Use format: 2h, 30m, or 1h30m",
            )

        team = await self.get_developer_team(developer.id, db)
        sprint = await self.get_active_sprint(team.id, db) if team else None
        task = await self.resolve_task_ref(
            task_ref,
            sprint.id if sprint else None,
            team.workspace_id if team else "",
            db,
        )

        # Create time entry
        entry = TimeEntry(
            developer_id=developer.id,
            task_id=task.id if task else None,
            sprint_id=sprint.id if sprint else None,
            workspace_id=team.workspace_id if team else "",
            duration_minutes=duration_minutes,
            description=description,
            entry_date=date.today(),
            source=TrackingSource.SLACK_COMMAND.value,
            slack_message_ts=None,
            external_task_ref=task_ref if not task else None,
        )
        db.add(entry)
        await db.commit()

        # Format duration for display
        hours = duration_minutes // 60
        mins = duration_minutes % 60
        duration_display = ""
        if hours:
            duration_display += f"{hours}h"
        if mins:
            duration_display += f"{mins}m"

        task_display = task.title if task else task_ref

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f":clock1: Logged {duration_display} on {task_display}",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":clock1: *Time Logged*\n\n*{duration_display}* on *{task_display}*",
                    },
                },
            ]
            + (
                [
                    {
                        "type": "context",
                        "elements": [{"type": "mrkdwn", "text": f"_{description}_"}],
                    }
                ]
                if description
                else []
            ),
        )

    async def handle_log_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph log command for work notes.

        Format: /devograph log TASK-REF "notes"
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile.",
            )

        if not args:
            return SlackCommandResponse(
                text="""*Add a work note to a task:*

`/devograph log TASK-REF "notes"`

*Examples:*
• `/devograph log #123 "Discovered edge case with OAuth flow"`
• `/devograph log JIRA-456 "Need to discuss with team"`""",
            )

        # Extract task reference
        task_ref, remaining = self.extract_task_ref(args)

        # Extract notes (quoted or remaining text)
        notes = ""
        quote_match = re.search(r'"([^"]+)"', remaining)
        if quote_match:
            notes = quote_match.group(1)
        else:
            notes = remaining.strip()

        if not notes:
            return SlackCommandResponse(
                text=":x: Please provide notes for the log entry.",
            )

        team = await self.get_developer_team(developer.id, db)
        sprint = await self.get_active_sprint(team.id, db) if team else None
        task = None
        if task_ref:
            task = await self.resolve_task_ref(
                task_ref,
                sprint.id if sprint else None,
                team.workspace_id if team else "",
                db,
            )

        # Create work log
        log = WorkLog(
            developer_id=developer.id,
            task_id=task.id if task else None,
            sprint_id=sprint.id if sprint else None,
            workspace_id=team.workspace_id if team else "",
            notes=notes,
            log_type=WorkLogType.NOTE.value,
            source=TrackingSource.SLACK_COMMAND.value,
            slack_channel_id=command.channel_id,
            external_task_ref=task_ref if not task else None,
        )
        db.add(log)
        await db.commit()

        task_display = task.title if task else (task_ref or "General")

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f":memo: Note added to {task_display}",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":memo: *Work Note Added*\n\nTask: *{task_display}*\n\n_{notes}_",
                    },
                },
            ],
        )

    async def handle_status_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph status command.

        Shows developer's current status: active tasks, today's logs, blockers.
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile.",
            )

        team = await self.get_developer_team(developer.id, db)
        sprint = await self.get_active_sprint(team.id, db) if team else None

        # Get today's standup
        standup_result = await db.execute(
            select(DeveloperStandup).where(
                DeveloperStandup.developer_id == developer.id,
                DeveloperStandup.standup_date == date.today(),
            )
        )
        today_standup = standup_result.scalar_one_or_none()

        # Get active blockers
        blockers_result = await db.execute(
            select(Blocker).where(
                Blocker.developer_id == developer.id,
                Blocker.status == BlockerStatus.ACTIVE.value,
            )
        )
        active_blockers = blockers_result.scalars().all()

        # Get today's time entries
        time_result = await db.execute(
            select(TimeEntry).where(
                TimeEntry.developer_id == developer.id,
                TimeEntry.entry_date == date.today(),
            )
        )
        today_time = time_result.scalars().all()
        total_minutes = sum(e.duration_minutes for e in today_time)
        hours = total_minutes // 60
        mins = total_minutes % 60

        # Get assigned tasks in progress
        if sprint:
            tasks_result = await db.execute(
                select(SprintTask).where(
                    SprintTask.sprint_id == sprint.id,
                    SprintTask.assignee_id == developer.id,
                    SprintTask.status.in_(["in_progress", "review"]),
                )
            )
            active_tasks = tasks_result.scalars().all()
        else:
            active_tasks = []

        blocks: list[dict[str, Any]] = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":bust_in_silhouette: *Your Status*\n_{date.today().strftime('%B %d, %Y')}_",
                },
            },
            {"type": "divider"},
        ]

        # Standup status
        if today_standup:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":white_check_mark: *Standup submitted* at {today_standup.submitted_at.strftime('%I:%M %p')}",
                    },
                }
            )
        else:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": ":x: *Standup not submitted yet*\nUse `/devograph standup` to submit",
                    },
                }
            )

        # Time logged
        time_display = f"{hours}h {mins}m" if hours or mins else "0m"
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":clock1: *Time logged today:* {time_display}",
                },
            }
        )

        # Active tasks
        if active_tasks:
            tasks_text = "\n".join([f"• {t.title} ({t.status})" for t in active_tasks[:5]])
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":clipboard: *Active tasks:*\n{tasks_text}",
                    },
                }
            )

        # Blockers
        if active_blockers:
            blockers_text = "\n".join([f"• {b.description[:50]}..." if len(b.description) > 50 else f"• {b.description}" for b in active_blockers[:3]])
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":rotating_light: *Active blockers ({len(active_blockers)}):*\n{blockers_text}",
                    },
                }
            )
        else:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": ":white_check_mark: *No active blockers*",
                    },
                }
            )

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f"Your status for {date.today().strftime('%B %d')}",
            blocks=blocks,
        )

    async def handle_mytasks_command(
        self,
        command: SlackSlashCommand,
        args: str,
        integration: SlackIntegration,
        db: AsyncSession,
    ) -> SlackCommandResponse:
        """
        Handle /devograph mytasks command.

        Lists developer's tasks in current sprint.
        """
        developer = await self.get_developer_from_slack_user(
            command.user_id, integration, db
        )
        if not developer:
            return SlackCommandResponse(
                text=":warning: Your Slack account is not linked to a Devograph profile.",
            )

        team = await self.get_developer_team(developer.id, db)
        if not team:
            return SlackCommandResponse(
                text=":warning: You are not assigned to any team.",
            )

        sprint = await self.get_active_sprint(team.id, db)
        if not sprint:
            return SlackCommandResponse(
                text=":information_source: No active sprint found for your team.",
            )

        # Get tasks
        status_filter = args.strip().lower() if args else None
        query = select(SprintTask).where(
            SprintTask.sprint_id == sprint.id,
            SprintTask.assignee_id == developer.id,
        )
        if status_filter and status_filter in ["todo", "in_progress", "review", "done", "backlog"]:
            query = query.where(SprintTask.status == status_filter)

        result = await db.execute(query.order_by(SprintTask.status))
        tasks = result.scalars().all()

        if not tasks:
            filter_msg = f" with status '{status_filter}'" if status_filter else ""
            return SlackCommandResponse(
                text=f":information_source: No tasks{filter_msg} assigned to you in the current sprint.",
            )

        # Group by status
        by_status: dict[str, list[SprintTask]] = {}
        for task in tasks:
            by_status.setdefault(task.status, []).append(task)

        status_emoji = {
            "backlog": ":inbox_tray:",
            "todo": ":white_circle:",
            "in_progress": ":large_blue_circle:",
            "review": ":large_purple_circle:",
            "done": ":white_check_mark:",
        }

        blocks: list[dict[str, Any]] = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":clipboard: *Your Tasks*\n_Sprint: {sprint.name}_",
                },
            },
            {"type": "divider"},
        ]

        for status in ["in_progress", "review", "todo", "backlog", "done"]:
            if status in by_status:
                emoji = status_emoji.get(status, ":white_circle:")
                tasks_text = "\n".join([f"• {t.title}" for t in by_status[status][:5]])
                if len(by_status[status]) > 5:
                    tasks_text += f"\n_...and {len(by_status[status]) - 5} more_"

                blocks.append(
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"{emoji} *{status.replace('_', ' ').title()}* ({len(by_status[status])})\n{tasks_text}",
                        },
                    }
                )

        return SlackCommandResponse(
            response_type="ephemeral",
            text=f"Your tasks in {sprint.name}",
            blocks=blocks,
        )
