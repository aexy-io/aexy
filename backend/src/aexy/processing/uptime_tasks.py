"""Celery tasks for uptime monitoring.

These tasks handle:
- Processing due uptime checks
- Executing individual endpoint checks
- Sending notifications (Slack, webhook)
- Cleaning up old check records
"""

import logging
from datetime import datetime, timezone

from aexy.processing.celery_app import celery_app
from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# MAIN SCHEDULED TASK - Process Due Checks
# =============================================================================


@celery_app.task(name="aexy.processing.uptime_tasks.process_due_checks")
def process_due_checks():
    """Process all monitors that are due for a check.

    This task runs every minute and:
    1. Queries monitors where next_check_at <= now and is_active = True
    2. Dispatches individual execute_check tasks for each monitor
    3. Updates next_check_at to prevent duplicate processing
    """
    from aexy.processing.tasks import run_async
    run_async(_process_due_checks_async())


async def _process_due_checks_async():
    """Async implementation of processing due checks."""
    from aexy.services.uptime_service import UptimeService
    from datetime import timedelta

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)

            # Get monitors due for checking
            monitors = await service.get_due_monitors(limit=100)

            if not monitors:
                return

            logger.info(f"Found {len(monitors)} monitors due for checks")

            # Dispatch individual check tasks
            dispatched = 0
            for monitor in monitors:
                try:
                    # Update next_check_at immediately to prevent duplicate dispatches
                    now = datetime.now(timezone.utc)
                    monitor.next_check_at = now + timedelta(
                        seconds=monitor.check_interval_seconds
                    )

                    # Dispatch the check task
                    execute_check.delay(str(monitor.id))
                    dispatched += 1

                except Exception as e:
                    logger.error(f"Failed to dispatch check for monitor {monitor.id}: {e}")

            await db.commit()
            logger.info(f"Dispatched {dispatched} check tasks")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing due checks: {e}")
            raise


# =============================================================================
# INDIVIDUAL CHECK EXECUTION
# =============================================================================


@celery_app.task(
    name="aexy.processing.uptime_tasks.execute_check",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def execute_check(self, monitor_id: str):
    """Execute an uptime check for a specific monitor.

    Args:
        monitor_id: The monitor ID to check.

    This task:
    1. Loads the monitor configuration
    2. Executes the appropriate check (HTTP/TCP/WebSocket)
    3. Records the result
    4. Handles incident creation/resolution
    5. Triggers notifications if needed
    """
    from aexy.processing.tasks import run_async

    try:
        run_async(_execute_check_async(monitor_id))
    except Exception as e:
        logger.error(f"Check failed for monitor {monitor_id}: {e}")
        raise self.retry(exc=e)


async def _execute_check_async(monitor_id: str):
    """Async implementation of check execution."""
    from aexy.services.uptime_service import UptimeService, MonitorNotFoundError
    from aexy.services.uptime_checker import get_uptime_checker

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)
            checker = get_uptime_checker()

            # Load monitor
            monitor = await service.get_monitor(monitor_id)
            if not monitor:
                logger.warning(f"Monitor {monitor_id} not found, skipping check")
                return

            if not monitor.is_active:
                logger.debug(f"Monitor {monitor_id} is paused, skipping check")
                return

            # Execute the check
            logger.debug(f"Executing {monitor.check_type} check for {monitor.name}")
            check_result = await checker.check(monitor)

            # Record the result (handles incidents and tickets internally)
            check, incident, is_new_incident = await service.record_check_result(
                monitor_id,
                check_result,
            )

            await db.commit()

            # Log the result
            status = "UP" if check_result.is_up else "DOWN"
            response_time = f" ({check_result.response_time_ms}ms)" if check_result.response_time_ms else ""
            logger.info(f"Check {monitor.name}: {status}{response_time}")

            # Send notifications if needed
            if incident and is_new_incident:
                # New incident - send alert notification
                send_uptime_notification.delay(
                    monitor_id=monitor_id,
                    incident_id=str(incident.id),
                    notification_type="incident",
                )
            elif incident and incident.resolved_at:
                # Incident resolved - send recovery notification
                if monitor.notify_on_recovery:
                    send_uptime_notification.delay(
                        monitor_id=monitor_id,
                        incident_id=str(incident.id),
                        notification_type="recovery",
                    )

        except MonitorNotFoundError:
            logger.warning(f"Monitor {monitor_id} not found")
        except Exception as e:
            await db.rollback()
            logger.error(f"Error executing check for monitor {monitor_id}: {e}")
            raise


# =============================================================================
# NOTIFICATION DISPATCH
# =============================================================================


@celery_app.task(
    name="aexy.processing.uptime_tasks.send_uptime_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_uptime_notification(
    self,
    monitor_id: str,
    incident_id: str,
    notification_type: str,
):
    """Send notifications for uptime incidents.

    Args:
        monitor_id: The monitor ID.
        incident_id: The incident ID.
        notification_type: Either "incident" or "recovery".

    This task sends notifications via configured channels:
    - Slack (using existing Slack integration)
    - Webhook (custom HTTP POST)
    - Email (using existing email system)
    """
    from aexy.processing.tasks import run_async

    try:
        run_async(_send_notification_async(monitor_id, incident_id, notification_type))
    except Exception as e:
        logger.error(f"Notification failed for incident {incident_id}: {e}")
        raise self.retry(exc=e)


async def _send_notification_async(
    monitor_id: str,
    incident_id: str,
    notification_type: str,
):
    """Async implementation of notification sending."""
    import httpx
    from aexy.services.uptime_service import UptimeService

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)

            # Load monitor and incident
            monitor = await service.get_monitor(monitor_id)
            incident = await service.get_incident(incident_id)

            if not monitor or not incident:
                logger.warning(
                    f"Monitor or incident not found: {monitor_id}, {incident_id}"
                )
                return

            channels = monitor.notification_channels or []
            endpoint = monitor.url or f"{monitor.host}:{monitor.port}"

            # Build notification message
            if notification_type == "incident":
                title = f"[DOWN] {monitor.name} is down"
                message = f"""**Uptime Alert: Service Down**

**Monitor:** {monitor.name}
**Type:** {monitor.check_type.upper()}
**Endpoint:** {endpoint}
**Error:** {incident.first_error_message or 'Unknown error'}
**Started:** {incident.started_at.isoformat()}

Incident ID: {incident.id}
"""
                color = "#dc3545"  # Red
            else:
                # Recovery
                duration_seconds = 0
                if incident.resolved_at and incident.started_at:
                    duration_seconds = int(
                        (incident.resolved_at - incident.started_at).total_seconds()
                    )

                if duration_seconds < 60:
                    duration_str = f"{duration_seconds} seconds"
                elif duration_seconds < 3600:
                    duration_str = f"{duration_seconds // 60} minutes"
                else:
                    hours = duration_seconds // 3600
                    minutes = (duration_seconds % 3600) // 60
                    duration_str = f"{hours}h {minutes}m"

                title = f"[RECOVERED] {monitor.name} is back up"
                message = f"""**Uptime Alert: Service Recovered**

**Monitor:** {monitor.name}
**Type:** {monitor.check_type.upper()}
**Endpoint:** {endpoint}
**Duration:** {duration_str}
**Resolved:** {incident.resolved_at.isoformat() if incident.resolved_at else 'N/A'}

Incident ID: {incident.id}
"""
                color = "#28a745"  # Green

            # Send to Slack
            if "slack" in channels and monitor.slack_channel_id:
                await _send_slack_notification(
                    db,
                    monitor.workspace_id,
                    monitor.slack_channel_id,
                    title,
                    message,
                    color,
                )

            # Send to webhook
            if "webhook" in channels and monitor.webhook_url:
                await _send_webhook_notification(
                    monitor.webhook_url,
                    {
                        "type": notification_type,
                        "monitor": {
                            "id": monitor.id,
                            "name": monitor.name,
                            "check_type": monitor.check_type,
                            "url": monitor.url,
                            "host": monitor.host,
                            "port": monitor.port,
                        },
                        "incident": {
                            "id": incident.id,
                            "status": incident.status,
                            "started_at": incident.started_at.isoformat(),
                            "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
                            "error_message": incident.first_error_message,
                            "error_type": incident.first_error_type,
                        },
                    },
                )

            logger.info(
                f"Sent {notification_type} notifications for monitor {monitor.name}"
            )

        except Exception as e:
            logger.error(f"Error sending notification: {e}")
            raise


async def _send_slack_notification(
    db,
    workspace_id: str,
    channel_id: str,
    title: str,
    message: str,
    color: str,
):
    """Send a Slack notification using the workspace's Slack integration."""
    try:
        from sqlalchemy import select
        from aexy.models.integrations import SlackIntegration

        # Get Slack integration for workspace
        stmt = select(SlackIntegration).where(
            SlackIntegration.workspace_id == workspace_id
        )
        result = await db.execute(stmt)
        integration = result.scalar_one_or_none()

        if not integration or not integration.bot_token:
            logger.warning(
                f"No Slack integration found for workspace {workspace_id}"
            )
            return

        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={
                    "Authorization": f"Bearer {integration.bot_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "channel": channel_id,
                    "attachments": [
                        {
                            "color": color,
                            "title": title,
                            "text": message,
                            "mrkdwn_in": ["text"],
                        }
                    ],
                },
            )

            if response.status_code != 200:
                logger.error(f"Slack API error: {response.text}")
            else:
                data = response.json()
                if not data.get("ok"):
                    logger.error(f"Slack API error: {data.get('error')}")

    except Exception as e:
        logger.error(f"Failed to send Slack notification: {e}")


async def _send_webhook_notification(webhook_url: str, payload: dict):
    """Send a webhook notification."""
    try:
        import httpx

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

            if response.status_code >= 400:
                logger.warning(
                    f"Webhook returned {response.status_code}: {response.text[:200]}"
                )
            else:
                logger.debug(f"Webhook delivered to {webhook_url}")

    except Exception as e:
        logger.error(f"Failed to send webhook notification to {webhook_url}: {e}")


# =============================================================================
# CLEANUP TASK
# =============================================================================


@celery_app.task(name="aexy.processing.uptime_tasks.cleanup_old_checks")
def cleanup_old_checks(retention_days: int = 30):
    """Clean up old check records.

    Args:
        retention_days: Number of days to retain check records.

    This task runs daily and deletes check records older than the retention period
    to prevent database bloat.
    """
    from aexy.processing.tasks import run_async
    run_async(_cleanup_old_checks_async(retention_days))


async def _cleanup_old_checks_async(retention_days: int):
    """Async implementation of cleanup."""
    from aexy.services.uptime_service import UptimeService

    async with async_session_maker() as db:
        try:
            service = UptimeService(db)
            deleted_count = await service.cleanup_old_checks(retention_days)
            await db.commit()

            if deleted_count > 0:
                logger.info(
                    f"Cleaned up {deleted_count} old uptime checks "
                    f"(older than {retention_days} days)"
                )

        except Exception as e:
            await db.rollback()
            logger.error(f"Error cleaning up old checks: {e}")
            raise


# =============================================================================
# MANUAL CHECK TRIGGER
# =============================================================================


@celery_app.task(name="aexy.processing.uptime_tasks.run_test_check")
def run_test_check(monitor_id: str) -> dict:
    """Run an immediate test check for a monitor.

    Args:
        monitor_id: The monitor ID to check.

    Returns:
        Dict with check result.

    This task is used for manual/test checks triggered from the API.
    It does NOT record the result to the database or trigger incidents.
    """
    from aexy.processing.tasks import run_async
    return run_async(_run_test_check_async(monitor_id))


async def _run_test_check_async(monitor_id: str) -> dict:
    """Async implementation of test check."""
    from aexy.services.uptime_service import UptimeService
    from aexy.services.uptime_checker import get_uptime_checker

    async with async_session_maker() as db:
        service = UptimeService(db)
        checker = get_uptime_checker()

        monitor = await service.get_monitor(monitor_id)
        if not monitor:
            return {"error": "Monitor not found"}

        check_result = await checker.check(monitor)

        return {
            "is_up": check_result.is_up,
            "status_code": check_result.status_code,
            "response_time_ms": check_result.response_time_ms,
            "error_message": check_result.error_message,
            "error_type": check_result.error_type,
            "ssl_expiry_days": check_result.ssl_expiry_days,
            "ssl_issuer": check_result.ssl_issuer,
            "checked_at": check_result.checked_at.isoformat() if check_result.checked_at else None,
        }
