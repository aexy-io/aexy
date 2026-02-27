"""GTM Alert Service — match GTM events to alert configs and dispatch notifications."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_alerts import GTMAlertConfig, GTMAlertLog

logger = logging.getLogger(__name__)


class GTMAlertService:
    """Matches GTM events against alert configs and dispatches via Temporal."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # ALERT CONFIG CRUD
    # =========================================================================

    async def create_alert_config(self, workspace_id: str, data: dict, created_by: str | None = None) -> GTMAlertConfig:
        config = GTMAlertConfig(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data["name"],
            event_type=data["event_type"],
            conditions=data.get("conditions", {}),
            channel_type=data.get("channel_type", "slack"),
            channel_config=data.get("channel_config", {}),
            message_template=data.get("message_template"),
            is_active=data.get("is_active", True),
            created_by=created_by,
        )
        self.db.add(config)
        await self.db.flush()
        return config

    async def update_alert_config(self, workspace_id: str, alert_id: str, data: dict) -> GTMAlertConfig | None:
        result = await self.db.execute(
            select(GTMAlertConfig).where(
                and_(GTMAlertConfig.workspace_id == workspace_id, GTMAlertConfig.id == alert_id)
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            return None
        for key, value in data.items():
            if value is not None and hasattr(config, key):
                setattr(config, key, value)
        await self.db.flush()
        return config

    async def delete_alert_config(self, workspace_id: str, alert_id: str) -> bool:
        result = await self.db.execute(
            delete(GTMAlertConfig).where(
                and_(GTMAlertConfig.workspace_id == workspace_id, GTMAlertConfig.id == alert_id)
            )
        )
        await self.db.flush()
        return result.rowcount > 0

    async def list_alert_configs(self, workspace_id: str, event_type: str | None = None) -> list[GTMAlertConfig]:
        q = select(GTMAlertConfig).where(GTMAlertConfig.workspace_id == workspace_id)
        if event_type:
            q = q.where(GTMAlertConfig.event_type == event_type)
        q = q.order_by(GTMAlertConfig.created_at.desc())
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get_alert_config(self, workspace_id: str, alert_id: str) -> GTMAlertConfig | None:
        result = await self.db.execute(
            select(GTMAlertConfig).where(
                and_(GTMAlertConfig.workspace_id == workspace_id, GTMAlertConfig.id == alert_id)
            )
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # EVENT EMISSION
    # =========================================================================

    async def emit_gtm_event(self, workspace_id: str, event_type: str, event_data: dict) -> list[str]:
        """Match event against active configs and dispatch alerts. Returns list of log IDs."""
        configs = await self.db.execute(
            select(GTMAlertConfig).where(
                and_(
                    GTMAlertConfig.workspace_id == workspace_id,
                    GTMAlertConfig.event_type == event_type,
                    GTMAlertConfig.is_active.is_(True),
                )
            )
        )
        matching_configs = list(configs.scalars().all())
        log_ids = []

        for config in matching_configs:
            if not self._match_conditions(config.conditions, event_data):
                continue

            log = GTMAlertLog(
                id=str(uuid4()),
                workspace_id=workspace_id,
                alert_config_id=config.id,
                event_type=event_type,
                event_data=event_data,
                channel_type=config.channel_type,
                delivery_status="pending",
            )
            self.db.add(log)
            log_ids.append(log.id)

        if log_ids:
            await self.db.flush()
            # Dispatch delivery via Temporal
            try:
                from aexy.temporal.dispatch import dispatch
                for log_id in log_ids:
                    await dispatch(
                        "send_gtm_alert",
                        {"workspace_id": workspace_id, "alert_log_id": log_id},
                    )
            except Exception as e:
                logger.error(f"Failed to dispatch alert: {e}")

            # Send in-app notifications to alert config creators
            try:
                from aexy.services.notification_service import notify_gtm_alert

                notified_ids: set[str] = set()
                for config in matching_configs:
                    if config.created_by and config.created_by not in notified_ids:
                        summary = event_data.get("summary", event_data.get("name", event_type))
                        await notify_gtm_alert(
                            db=self.db,
                            recipient_id=config.created_by,
                            event_type_name=event_type,
                            summary=str(summary)[:200],
                            workspace_id=workspace_id,
                        )
                        notified_ids.add(config.created_by)
            except Exception as e:
                logger.warning(f"Failed to send GTM in-app notification: {e}")

        # Fan-out to outbound GTM webhooks
        # Map internal event types to webhook event types
        webhook_event_map = {
            "new_lead": "lead.routed",
            "lead_scored": "lead.scored",
            "lead_assigned": "lead.assigned",
            "sla_breach": "sla.breached",
            "health_drop": "health.score_changed",
            "competitor_alert": "competitor.change_detected",
            "sequence_completed": "sequence.completed",
            "sequence_replied": "sequence.replied",
            "sequence_enrolled": "sequence.enrolled",
            "visitor_identified": "visitor.identified",
        }
        webhook_event = webhook_event_map.get(event_type, event_type)
        try:
            from aexy.services.gtm_webhook_service import GTMWebhookService
            webhook_svc = GTMWebhookService(self.db)
            await webhook_svc.emit_event(workspace_id, webhook_event, event_data)
        except Exception as e:
            logger.error("Failed to emit webhook for %s: %s", webhook_event, e)

        return log_ids

    def _match_conditions(self, conditions: dict, event_data: dict) -> bool:
        """Check if event_data matches all conditions. Empty conditions = always match."""
        if not conditions:
            return True
        rules = conditions.get("rules", [])
        if not rules:
            return True
        for rule in rules:
            field = rule.get("field", "")
            op = rule.get("op", "eq")
            value = rule.get("value")
            actual = event_data.get(field)
            if op == "eq" and actual != value:
                return False
            elif op == "neq" and actual == value:
                return False
            elif op == "gt" and (actual is None or actual <= value):
                return False
            elif op == "lt" and (actual is None or actual >= value):
                return False
            elif op == "contains" and (actual is None or value not in str(actual)):
                return False
        return True

    # =========================================================================
    # ALERT LOGS
    # =========================================================================

    async def list_alert_logs(
        self, workspace_id: str, page: int = 1, per_page: int = 50,
        event_type: str | None = None, alert_config_id: str | None = None,
    ) -> tuple[list[GTMAlertLog], int]:
        q = select(GTMAlertLog).where(GTMAlertLog.workspace_id == workspace_id)
        count_q = select(func.count(GTMAlertLog.id)).where(GTMAlertLog.workspace_id == workspace_id)
        if event_type:
            q = q.where(GTMAlertLog.event_type == event_type)
            count_q = count_q.where(GTMAlertLog.event_type == event_type)
        if alert_config_id:
            q = q.where(GTMAlertLog.alert_config_id == alert_config_id)
            count_q = count_q.where(GTMAlertLog.alert_config_id == alert_config_id)
        total = (await self.db.execute(count_q)).scalar() or 0
        q = q.order_by(GTMAlertLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def mark_alert_delivered(self, log_id: str, status: str = "sent", error: str | None = None) -> None:
        await self.db.execute(
            update(GTMAlertLog).where(GTMAlertLog.id == log_id).values(
                delivery_status=status,
                error_message=error,
                sent_at=datetime.now(timezone.utc),
            )
        )
        await self.db.flush()
