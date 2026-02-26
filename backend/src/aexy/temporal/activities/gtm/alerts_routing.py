"""GTM alerts and lead routing activities.

Activities:
    - send_gtm_alert: Deliver a GTM alert via configured channel
    - route_new_lead: Route a new lead through routing rules engine
    - check_sla_breaches: Check for SLA breaches
"""

import logging
from dataclasses import dataclass, field

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# INPUT DATACLASSES
# =============================================================================

@dataclass
class SendGTMAlertInput:
    workspace_id: str
    alert_log_id: str


@dataclass
class RouteNewLeadInput:
    workspace_id: str
    record_id: str
    record_values: dict = field(default_factory=dict)


@dataclass
class CheckSLABreachesInput:
    workspace_id: str = ""


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="send_gtm_alert")
async def send_gtm_alert(input: SendGTMAlertInput) -> dict:
    """Deliver a GTM alert via the configured channel (Slack, etc.)."""
    from aexy.services.gtm_alert_service import GTMAlertService
    from aexy.models.gtm_alerts import GTMAlertConfig, GTMAlertLog

    logger.info(f"Sending GTM alert log_id={input.alert_log_id}")

    async with async_session_maker() as db:
        from sqlalchemy import select, and_
        result = await db.execute(
            select(GTMAlertLog).where(GTMAlertLog.id == input.alert_log_id)
        )
        log = result.scalar_one_or_none()
        if not log:
            return {"status": "not_found"}

        config_result = await db.execute(
            select(GTMAlertConfig).where(GTMAlertConfig.id == log.alert_config_id)
        )
        config = config_result.scalar_one_or_none()
        if not config:
            return {"status": "config_not_found"}

        try:
            if config.channel_type == "slack":
                from string import Template
                from aexy.temporal.dispatch import dispatch
                channel = config.channel_config.get("channel", "#gtm-alerts")
                template_str = config.message_template or f"GTM Alert: {log.event_type}"
                # Use string.Template ($variable syntax) instead of str.format() to
                # prevent format string injection via event_data keys/values.
                message = Template(template_str).safe_substitute(log.event_data) if log.event_data else template_str
                await dispatch("send_slack_message", {
                    "workspace_id": input.workspace_id,
                    "channel": channel,
                    "text": message,
                })

            alert_svc = GTMAlertService(db)
            await alert_svc.mark_alert_delivered(input.alert_log_id, "sent")
            return {"status": "sent"}
        except Exception as e:
            logger.error(f"Failed to send alert: {e}")
            alert_svc = GTMAlertService(db)
            await alert_svc.mark_alert_delivered(input.alert_log_id, "failed", str(e))
            return {"status": "failed", "error": str(e)}


@activity.defn(name="route_new_lead")
async def route_new_lead(input: RouteNewLeadInput) -> dict:
    """Route a new lead through the routing rules engine."""
    from aexy.services.lead_routing_service import LeadRoutingService

    logger.info(f"Routing lead record_id={input.record_id}")

    async with async_session_maker() as db:
        service = LeadRoutingService(db)
        assignment = await service.route_lead(
            input.workspace_id, input.record_id, input.record_values,
        )

    if assignment:
        return {"assigned": True, "assignee_id": assignment.assignee_id, "assignment_id": assignment.id}
    return {"assigned": False}


@activity.defn(name="check_sla_breaches")
async def check_sla_breaches(input: CheckSLABreachesInput) -> dict:
    """Check for SLA breaches across all workspaces (or one)."""
    from aexy.services.lead_routing_service import LeadRoutingService

    logger.info("Checking SLA breaches")

    if input.workspace_id:
        async with async_session_maker() as db:
            service = LeadRoutingService(db)
            count = await service.check_sla_breaches(input.workspace_id)
    else:
        # Check all workspaces — each in its own session for isolation
        async with async_session_maker() as db:
            from aexy.models.workspace import Workspace
            from sqlalchemy import select
            ws_result = await db.execute(select(Workspace.id))
            ws_ids = [ws_id for (ws_id,) in ws_result.all()]

        count = 0
        for ws_id in ws_ids:
            try:
                async with async_session_maker() as db:
                    service = LeadRoutingService(db)
                    count += await service.check_sla_breaches(ws_id)
            except Exception:
                logger.exception(f"SLA breach check failed for workspace {ws_id}")

    return {"breaches_found": count}
