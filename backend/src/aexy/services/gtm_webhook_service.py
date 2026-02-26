"""GTM Webhook Service — manage outbound webhooks and deliver GTM events."""

import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_webhook import GTMWebhook, GTMWebhookDelivery

logger = logging.getLogger(__name__)

# GTM event types that can trigger webhooks
GTM_EVENT_TYPES = [
    "lead.scored",
    "lead.routed",
    "lead.assigned",
    "sequence.enrolled",
    "sequence.completed",
    "sequence.replied",
    "sla.breached",
    "visitor.identified",
    "competitor.change_detected",
    "health.score_changed",
]


class GTMWebhookService:
    """Manage GTM webhook subscriptions and deliver events."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CRUD
    # =========================================================================

    async def create_webhook(
        self,
        workspace_id: str,
        name: str,
        url: str,
        events: list[str],
        description: str | None = None,
        headers: dict | None = None,
    ) -> GTMWebhook:
        """Create a new webhook subscription."""
        import secrets

        webhook = GTMWebhook(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            url=url,
            events=events,
            secret=secrets.token_hex(32),
            headers=headers or {},
        )
        self.db.add(webhook)
        await self.db.commit()
        await self.db.refresh(webhook)
        logger.info("Created GTM webhook %s for workspace %s", webhook.id, workspace_id)
        return webhook

    async def list_webhooks(
        self, workspace_id: str,
    ) -> list[GTMWebhook]:
        """List all webhooks for a workspace."""
        result = await self.db.execute(
            select(GTMWebhook)
            .where(GTMWebhook.workspace_id == workspace_id)
            .order_by(GTMWebhook.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_webhook(
        self, workspace_id: str, webhook_id: str,
    ) -> GTMWebhook | None:
        """Get a single webhook by ID."""
        return await self.db.scalar(
            select(GTMWebhook).where(and_(
                GTMWebhook.workspace_id == workspace_id,
                GTMWebhook.id == webhook_id,
            ))
        )

    async def update_webhook(
        self, workspace_id: str, webhook_id: str, **kwargs,
    ) -> GTMWebhook | None:
        """Update webhook fields."""
        webhook = await self.get_webhook(workspace_id, webhook_id)
        if not webhook:
            return None

        allowed = {"name", "description", "url", "events", "headers", "is_active"}
        for key, value in kwargs.items():
            if key in allowed and value is not None:
                setattr(webhook, key, value)

        await self.db.commit()
        await self.db.refresh(webhook)
        return webhook

    async def delete_webhook(
        self, workspace_id: str, webhook_id: str,
    ) -> bool:
        """Delete a webhook."""
        webhook = await self.get_webhook(workspace_id, webhook_id)
        if not webhook:
            return False
        await self.db.delete(webhook)
        await self.db.commit()
        return True

    async def rotate_secret(
        self, workspace_id: str, webhook_id: str,
    ) -> GTMWebhook | None:
        """Generate a new signing secret for the webhook."""
        import secrets

        webhook = await self.get_webhook(workspace_id, webhook_id)
        if not webhook:
            return None
        webhook.secret = secrets.token_hex(32)
        await self.db.commit()
        await self.db.refresh(webhook)
        return webhook

    async def list_deliveries(
        self,
        workspace_id: str,
        webhook_id: str,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[GTMWebhookDelivery], int]:
        """List delivery attempts for a webhook."""
        # Verify webhook belongs to workspace
        webhook = await self.get_webhook(workspace_id, webhook_id)
        if not webhook:
            return [], 0

        base = GTMWebhookDelivery.webhook_id == webhook_id
        total = await self.db.scalar(
            select(func.count(GTMWebhookDelivery.id)).where(base)
        ) or 0

        result = await self.db.execute(
            select(GTMWebhookDelivery)
            .where(base)
            .order_by(GTMWebhookDelivery.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        return list(result.scalars().all()), total

    # =========================================================================
    # EVENT DELIVERY
    # =========================================================================

    async def emit_event(
        self,
        workspace_id: str,
        event_type: str,
        event_data: dict,
    ) -> list[str]:
        """Emit a GTM event to all matching active webhooks.

        Returns list of delivery IDs created.
        """
        # Find active webhooks that subscribe to this event type
        webhooks = (await self.db.execute(
            select(GTMWebhook).where(and_(
                GTMWebhook.workspace_id == workspace_id,
                GTMWebhook.is_active == True,  # noqa: E712
            ))
        )).scalars().all()

        delivery_ids = []
        for webhook in webhooks:
            # Check event match: exact match or wildcard "*"
            if event_type not in webhook.events and "*" not in webhook.events:
                continue

            delivery_id = await self._deliver_to_webhook(webhook, event_type, event_data)
            if delivery_id:
                delivery_ids.append(delivery_id)

        return delivery_ids

    async def _deliver_to_webhook(
        self,
        webhook: GTMWebhook,
        event_type: str,
        event_data: dict,
    ) -> str | None:
        """Deliver a single event to a webhook endpoint."""
        delivery_id = str(uuid4())
        now = datetime.now(timezone.utc)

        payload = {
            "id": delivery_id,
            "type": event_type,
            "timestamp": now.isoformat(),
            "data": event_data,
        }
        payload_json = json.dumps(payload, default=str)

        # HMAC-SHA256 signature
        signature = hmac.new(
            webhook.secret.encode("utf-8"),
            payload_json.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Build headers
        headers = {
            "Content-Type": "application/json",
            "X-Webhook-Signature": f"sha256={signature}",
            "X-Webhook-Event": event_type,
            "X-Webhook-Id": delivery_id,
            **(webhook.headers or {}),
        }

        # Deliver
        status = "pending"
        response_code = None
        response_body = None
        error_message = None
        duration_ms = None
        delivered_at = None

        try:
            start = time.monotonic()
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(webhook.url, content=payload_json, headers=headers)
            duration_ms = int((time.monotonic() - start) * 1000)
            response_code = resp.status_code
            response_body = resp.text[:2000] if resp.text else None

            if 200 <= resp.status_code < 300:
                status = "success"
                delivered_at = datetime.now(timezone.utc)
            else:
                status = "failed"
                error_message = f"HTTP {resp.status_code}"

        except Exception as e:
            status = "failed"
            error_message = str(e)[:500]
            logger.warning("Webhook delivery failed for %s: %s", webhook.id, e)

        # Record delivery
        delivery = GTMWebhookDelivery(
            id=delivery_id,
            webhook_id=webhook.id,
            event_type=event_type,
            payload=payload,
            status=status,
            response_status_code=response_code,
            response_body=response_body,
            error_message=error_message,
            duration_ms=duration_ms,
            delivered_at=delivered_at,
        )
        self.db.add(delivery)

        # Update webhook stats
        webhook.total_deliveries += 1
        if status == "success":
            webhook.successful_deliveries += 1
        else:
            webhook.failed_deliveries += 1
        webhook.last_delivery_at = now

        await self.db.commit()
        return delivery_id


class GTMProviderHealthService:
    """Record and query provider health metrics (hourly buckets)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_request(
        self,
        workspace_id: str,
        provider_slot: str,
        provider_name: str,
        latency_ms: int,
        success: bool,
        error: str | None = None,
    ) -> None:
        """Record a single provider API call into the current hourly bucket."""
        from aexy.models.gtm_webhook import GTMProviderHealthMetric

        # Truncate to current hour
        now = datetime.now(timezone.utc)
        bucket = now.replace(minute=0, second=0, microsecond=0)

        # Find or create bucket
        metric = await self.db.scalar(
            select(GTMProviderHealthMetric).where(and_(
                GTMProviderHealthMetric.workspace_id == workspace_id,
                GTMProviderHealthMetric.provider_slot == provider_slot,
                GTMProviderHealthMetric.bucket_hour == bucket,
            ))
        )

        if metric is None:
            metric = GTMProviderHealthMetric(
                id=str(uuid4()),
                workspace_id=workspace_id,
                provider_slot=provider_slot,
                provider_name=provider_name,
                bucket_hour=bucket,
            )
            self.db.add(metric)

        metric.total_requests += 1
        if success:
            metric.successful_requests += 1
        else:
            metric.failed_requests += 1
            if error:
                metric.last_error = error[:500]

        # Running average latency
        prev_total = metric.total_requests - 1
        if prev_total > 0:
            metric.avg_latency_ms = int(
                (metric.avg_latency_ms * prev_total + latency_ms) / metric.total_requests
            )
        else:
            metric.avg_latency_ms = latency_ms

        metric.max_latency_ms = max(metric.max_latency_ms, latency_ms)
        # Approximate p95 — shift toward new value if it's high
        if latency_ms > metric.p95_latency_ms:
            metric.p95_latency_ms = int(
                metric.p95_latency_ms * 0.95 + latency_ms * 0.05
            )

        await self.db.commit()

    async def get_health_summary(
        self, workspace_id: str, hours: int = 24,
    ) -> list[dict]:
        """Return per-provider health summary for the last N hours."""
        from aexy.models.gtm_webhook import GTMProviderHealthMetric

        cutoff = datetime.now(timezone.utc).replace(
            minute=0, second=0, microsecond=0,
        )
        cutoff = cutoff.replace(hour=cutoff.hour - min(hours, cutoff.hour))

        rows = (await self.db.execute(
            select(
                GTMProviderHealthMetric.provider_name,
                GTMProviderHealthMetric.provider_slot,
                func.sum(GTMProviderHealthMetric.total_requests).label("total"),
                func.sum(GTMProviderHealthMetric.successful_requests).label("success"),
                func.sum(GTMProviderHealthMetric.failed_requests).label("failed"),
                func.avg(GTMProviderHealthMetric.avg_latency_ms).label("avg_latency"),
                func.max(GTMProviderHealthMetric.p95_latency_ms).label("p95_latency"),
                func.max(GTMProviderHealthMetric.max_latency_ms).label("max_latency"),
            ).where(and_(
                GTMProviderHealthMetric.workspace_id == workspace_id,
                GTMProviderHealthMetric.bucket_hour >= cutoff,
            )).group_by(
                GTMProviderHealthMetric.provider_name,
                GTMProviderHealthMetric.provider_slot,
            )
        )).all()

        return [
            {
                "provider_name": r[0],
                "provider_slot": r[1],
                "total_requests": r[2] or 0,
                "successful_requests": r[3] or 0,
                "failed_requests": r[4] or 0,
                "success_rate": round((r[3] or 0) / r[2] * 100, 1) if r[2] else 100.0,
                "avg_latency_ms": round(r[5] or 0),
                "p95_latency_ms": r[6] or 0,
                "max_latency_ms": r[7] or 0,
            }
            for r in rows
        ]
