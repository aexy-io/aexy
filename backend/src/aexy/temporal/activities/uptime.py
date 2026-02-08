"""Temporal activities for uptime monitoring.

Replaces: aexy.processing.uptime_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class ProcessDueChecksInput:
    pass


@dataclass
class ExecuteCheckInput:
    monitor_id: str


@dataclass
class SendUptimeNotificationInput:
    monitor_id: str
    incident_id: str
    notification_type: str


@dataclass
class CleanupOldChecksInput:
    retention_days: int = 30


@dataclass
class RunTestCheckInput:
    monitor_id: str


@activity.defn
async def process_due_checks(input: ProcessDueChecksInput) -> dict[str, Any]:
    """Process all monitors that are due for a check."""
    logger.info("Processing due uptime checks")

    from aexy.services.uptime_service import UptimeService
    from aexy.temporal.client import get_temporal_client
    from aexy.temporal.task_queues import TaskQueue
    from datetime import timedelta, datetime, timezone

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)
            monitors = await service.get_due_monitors(limit=100)

            if not monitors:
                return {"dispatched": 0}

            dispatched = 0
            client = await get_temporal_client()

            for monitor in monitors:
                try:
                    now = datetime.now(timezone.utc)
                    monitor.next_check_at = now + timedelta(
                        seconds=monitor.check_interval_seconds
                    )

                    from aexy.temporal.dispatch import dispatch
                    await dispatch(
                        "execute_check",
                        ExecuteCheckInput(monitor_id=str(monitor.id)),
                        task_queue=TaskQueue.OPERATIONS,
                    )
                    dispatched += 1
                except Exception as e:
                    logger.error(f"Failed to dispatch check for monitor {monitor.id}: {e}")

            await db.commit()
            return {"dispatched": dispatched}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def execute_check(input: ExecuteCheckInput) -> dict[str, Any]:
    """Execute an uptime check for a specific monitor."""
    logger.info(f"Executing uptime check for monitor {input.monitor_id}")

    from aexy.services.uptime_service import UptimeService, MonitorNotFoundError
    from aexy.services.uptime_checker import get_uptime_checker

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)
            checker = get_uptime_checker()

            monitor = await service.get_monitor(input.monitor_id)
            if not monitor:
                return {"error": "Monitor not found"}

            if not monitor.is_active:
                return {"status": "skipped", "reason": "paused"}

            check_result = await checker.check(monitor)
            check, incident, is_new_incident = await service.record_check_result(
                input.monitor_id, check_result,
            )
            await db.commit()

            status = "UP" if check_result.is_up else "DOWN"

            # Dispatch notifications if needed
            if incident and is_new_incident:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue
                await dispatch(
                    "send_uptime_notification",
                    SendUptimeNotificationInput(
                        monitor_id=input.monitor_id,
                        incident_id=str(incident.id),
                        notification_type="incident",
                    ),
                    task_queue=TaskQueue.OPERATIONS,
                )
            elif incident and incident.resolved_at and monitor.notify_on_recovery:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue
                await dispatch(
                    "send_uptime_notification",
                    SendUptimeNotificationInput(
                        monitor_id=input.monitor_id,
                        incident_id=str(incident.id),
                        notification_type="recovery",
                    ),
                    task_queue=TaskQueue.OPERATIONS,
                )

            return {
                "status": status,
                "response_time_ms": check_result.response_time_ms,
            }
        except MonitorNotFoundError:
            return {"error": "Monitor not found"}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def send_uptime_notification(input: SendUptimeNotificationInput) -> dict[str, Any]:
    """Send notifications for uptime incidents."""
    logger.info(f"Sending {input.notification_type} notification for incident {input.incident_id}")

    import httpx
    from aexy.services.uptime_service import UptimeService
    from aexy.services.slack_helpers import (
        NOTIFICATION_CHANNEL_SLACK,
        NOTIFICATION_CHANNEL_WEBHOOK,
        get_slack_integration_for_workspace,
        get_workspace_notification_channel,
    )

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)
            monitor = await service.get_monitor(input.monitor_id)
            incident = await service.get_incident(input.incident_id)

            if not monitor or not incident:
                return {"error": "Monitor or incident not found"}

            channels = monitor.notification_channels or []
            endpoint = monitor.url or f"{monitor.host}:{monitor.port}"

            if input.notification_type == "incident":
                title = f"[DOWN] {monitor.name} is down"
                color = "#dc3545"
            else:
                title = f"[RECOVERED] {monitor.name} is back up"
                color = "#28a745"

            if NOTIFICATION_CHANNEL_SLACK in channels:
                slack_channel_id = monitor.slack_channel_id
                if not slack_channel_id:
                    slack_channel_id = await get_workspace_notification_channel(
                        db, str(monitor.workspace_id)
                    )
                if slack_channel_id:
                    integration = await get_slack_integration_for_workspace(
                        db, str(monitor.workspace_id)
                    )
                    if integration and integration.bot_token:
                        async with httpx.AsyncClient(timeout=30) as client:
                            await client.post(
                                "https://slack.com/api/chat.postMessage",
                                headers={
                                    "Authorization": f"Bearer {integration.bot_token}",
                                    "Content-Type": "application/json",
                                },
                                json={
                                    "channel": slack_channel_id,
                                    "attachments": [{"color": color, "title": title, "text": f"Endpoint: {endpoint}"}],
                                },
                            )

            if NOTIFICATION_CHANNEL_WEBHOOK in channels and monitor.webhook_url:
                async with httpx.AsyncClient(timeout=30) as client:
                    await client.post(
                        monitor.webhook_url,
                        json={
                            "type": input.notification_type,
                            "monitor": {"id": monitor.id, "name": monitor.name},
                            "incident": {"id": incident.id, "status": incident.status},
                        },
                        headers={"Content-Type": "application/json"},
                    )

            return {"status": "sent", "type": input.notification_type}
        except Exception as e:
            logger.error(f"Error sending notification: {e}")
            raise


@activity.defn
async def cleanup_old_checks(input: CleanupOldChecksInput) -> dict[str, Any]:
    """Clean up old check records."""
    logger.info(f"Cleaning up old uptime checks (retention: {input.retention_days} days)")

    from aexy.services.uptime_service import UptimeService

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)
            deleted = await service.cleanup_old_checks(input.retention_days)
            await db.commit()
            return {"deleted": deleted}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def run_test_check(input: RunTestCheckInput) -> dict[str, Any]:
    """Run an immediate test check for a monitor (no recording)."""
    logger.info(f"Running test check for monitor {input.monitor_id}")

    from aexy.services.uptime_service import UptimeService
    from aexy.services.uptime_checker import get_uptime_checker

    async with async_session_maker() as db:
        service = UptimeService(db)
        checker = get_uptime_checker()

        monitor = await service.get_monitor(input.monitor_id)
        if not monitor:
            return {"error": "Monitor not found"}

        check_result = await checker.check(monitor)
        return {
            "is_up": check_result.is_up,
            "status_code": check_result.status_code,
            "response_time_ms": check_result.response_time_ms,
            "error_message": check_result.error_message,
        }
