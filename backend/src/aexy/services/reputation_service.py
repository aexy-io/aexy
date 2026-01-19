"""Reputation service for domain health scoring and ISP tracking."""

import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.email_infrastructure import (
    SendingDomain,
    DomainHealth,
    ISPMetrics,
    ProviderEventLog,
    DomainHealthStatus,
    EventType,
    ISP_DOMAINS,
)

logger = logging.getLogger(__name__)


# Health score weights
WEIGHT_BOUNCE = 0.35
WEIGHT_COMPLAINT = 0.35
WEIGHT_DELIVERY = 0.15
WEIGHT_ENGAGEMENT = 0.15

# Thresholds for health status
HEALTH_THRESHOLDS = {
    DomainHealthStatus.EXCELLENT: 90,
    DomainHealthStatus.GOOD: 70,
    DomainHealthStatus.FAIR: 50,
    DomainHealthStatus.POOR: 30,
    DomainHealthStatus.CRITICAL: 0,
}


class ReputationService:
    """Service for managing domain reputation and health."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db

    # -------------------------------------------------------------------------
    # HEALTH CALCULATION
    # -------------------------------------------------------------------------

    async def calculate_domain_health(
        self,
        domain_id: str,
        date: datetime | None = None,
    ) -> DomainHealth:
        """
        Calculate and store health metrics for a domain for a given date.

        This aggregates all events for the day and computes health scores.
        """
        if date is None:
            date = datetime.now(timezone.utc)

        # Get start and end of day
        day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        # Get domain
        result = await self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        # Aggregate events for the day
        events = await self._get_domain_events(domain_id, day_start, day_end)

        # Count events by type
        sent = events.get(EventType.SEND.value, 0)
        delivered = events.get(EventType.DELIVERY.value, 0)
        bounced = events.get(EventType.BOUNCE.value, 0)
        complaints = events.get(EventType.COMPLAINT.value, 0)
        rejects = events.get(EventType.REJECT.value, 0)
        opens = events.get(EventType.OPEN.value, 0)
        clicks = events.get(EventType.CLICK.value, 0)
        unsubscribes = events.get(EventType.UNSUBSCRIBE.value, 0)

        # Get bounce types
        hard_bounces, soft_bounces = await self._count_bounce_types(
            domain_id, day_start, day_end
        )

        # Calculate rates
        delivery_rate = delivered / sent if sent > 0 else None
        bounce_rate = bounced / sent if sent > 0 else None
        complaint_rate = complaints / sent if sent > 0 else None
        open_rate = opens / delivered if delivered > 0 else None
        click_rate = clicks / delivered if delivered > 0 else None

        # Calculate health score
        health_score, score_factors = self._calculate_health_score(
            sent=sent,
            delivered=delivered,
            bounced=bounced,
            hard_bounces=hard_bounces,
            complaints=complaints,
            opens=opens,
            clicks=clicks,
        )

        health_status = self._get_health_status(health_score)

        # Check for existing entry
        result = await self.db.execute(
            select(DomainHealth).where(
                and_(
                    DomainHealth.domain_id == domain_id,
                    DomainHealth.date == day_start,
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.total_sent = sent
            existing.total_delivered = delivered
            existing.total_bounced = bounced
            existing.hard_bounces = hard_bounces
            existing.soft_bounces = soft_bounces
            existing.complaints = complaints
            existing.rejects = rejects
            existing.opens = opens
            existing.unique_opens = opens  # Simplified
            existing.clicks = clicks
            existing.unique_clicks = clicks  # Simplified
            existing.unsubscribes = unsubscribes
            existing.delivery_rate = delivery_rate
            existing.bounce_rate = bounce_rate
            existing.complaint_rate = complaint_rate
            existing.open_rate = open_rate
            existing.click_rate = click_rate
            existing.health_score = health_score
            existing.health_status = health_status
            existing.score_factors = score_factors
            health_entry = existing
        else:
            # Create new
            health_entry = DomainHealth(
                id=str(uuid4()),
                domain_id=domain_id,
                date=day_start,
                total_sent=sent,
                total_delivered=delivered,
                total_bounced=bounced,
                hard_bounces=hard_bounces,
                soft_bounces=soft_bounces,
                complaints=complaints,
                rejects=rejects,
                opens=opens,
                unique_opens=opens,
                clicks=clicks,
                unique_clicks=clicks,
                unsubscribes=unsubscribes,
                delivery_rate=delivery_rate,
                bounce_rate=bounce_rate,
                complaint_rate=complaint_rate,
                open_rate=open_rate,
                click_rate=click_rate,
                health_score=health_score,
                health_status=health_status,
                score_factors=score_factors,
            )
            self.db.add(health_entry)

        # Update domain's current health
        domain.health_score = health_score
        domain.health_status = health_status

        await self.db.commit()
        await self.db.refresh(health_entry)

        logger.info(f"Calculated health for domain {domain_id}: score={health_score}")
        return health_entry

    def _calculate_health_score(
        self,
        sent: int,
        delivered: int,
        bounced: int,
        hard_bounces: int,
        complaints: int,
        opens: int,
        clicks: int,
    ) -> tuple[int, dict]:
        """
        Calculate health score (0-100) based on metrics.

        Returns:
            Tuple of (score, factors_breakdown)
        """
        if sent == 0:
            return 100, {"note": "No emails sent"}

        # Bounce factor (0-100, lower bounce = higher score)
        bounce_rate = bounced / sent
        hard_bounce_rate = hard_bounces / sent

        # Penalize hard bounces more severely
        bounce_factor = 100 - (bounce_rate * 500) - (hard_bounce_rate * 500)
        bounce_factor = max(0, min(100, bounce_factor))

        # Complaint factor (0-100)
        complaint_rate = complaints / sent
        # 0.1% complaint rate = 0 score
        complaint_factor = 100 - (complaint_rate * 100000)
        complaint_factor = max(0, min(100, complaint_factor))

        # Delivery factor (0-100)
        delivery_rate = delivered / sent
        delivery_factor = delivery_rate * 100

        # Engagement factor (0-100)
        if delivered > 0:
            open_rate = opens / delivered
            click_rate = clicks / delivered

            # Good engagement: 20%+ opens, 2%+ clicks
            engagement_factor = min(100, (open_rate * 200) + (click_rate * 1000))
        else:
            engagement_factor = 50  # Neutral if no delivered emails

        # Weighted score
        score = (
            bounce_factor * WEIGHT_BOUNCE +
            complaint_factor * WEIGHT_COMPLAINT +
            delivery_factor * WEIGHT_DELIVERY +
            engagement_factor * WEIGHT_ENGAGEMENT
        )

        score = int(max(0, min(100, score)))

        factors = {
            "bounce_factor": int(bounce_factor),
            "complaint_factor": int(complaint_factor),
            "delivery_factor": int(delivery_factor),
            "engagement_factor": int(engagement_factor),
            "bounce_rate": bounce_rate,
            "complaint_rate": complaint_rate,
            "delivery_rate": delivery_rate,
        }

        return score, factors

    def _get_health_status(self, score: int) -> str:
        """Get health status from score."""
        if score >= HEALTH_THRESHOLDS[DomainHealthStatus.EXCELLENT]:
            return DomainHealthStatus.EXCELLENT.value
        elif score >= HEALTH_THRESHOLDS[DomainHealthStatus.GOOD]:
            return DomainHealthStatus.GOOD.value
        elif score >= HEALTH_THRESHOLDS[DomainHealthStatus.FAIR]:
            return DomainHealthStatus.FAIR.value
        elif score >= HEALTH_THRESHOLDS[DomainHealthStatus.POOR]:
            return DomainHealthStatus.POOR.value
        else:
            return DomainHealthStatus.CRITICAL.value

    async def _get_domain_events(
        self,
        domain_id: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, int]:
        """Get event counts for a domain in a time range."""
        result = await self.db.execute(
            select(
                ProviderEventLog.event_type,
                func.count(ProviderEventLog.id),
            )
            .where(
                and_(
                    ProviderEventLog.domain_id == domain_id,
                    ProviderEventLog.created_at >= start,
                    ProviderEventLog.created_at < end,
                )
            )
            .group_by(ProviderEventLog.event_type)
        )

        return {row[0]: row[1] for row in result.all()}

    async def _count_bounce_types(
        self,
        domain_id: str,
        start: datetime,
        end: datetime,
    ) -> tuple[int, int]:
        """Count hard and soft bounces."""
        result = await self.db.execute(
            select(
                ProviderEventLog.bounce_type,
                func.count(ProviderEventLog.id),
            )
            .where(
                and_(
                    ProviderEventLog.domain_id == domain_id,
                    ProviderEventLog.event_type == EventType.BOUNCE.value,
                    ProviderEventLog.created_at >= start,
                    ProviderEventLog.created_at < end,
                )
            )
            .group_by(ProviderEventLog.bounce_type)
        )

        counts = {row[0]: row[1] for row in result.all()}
        return counts.get("hard", 0), counts.get("soft", 0)

    # -------------------------------------------------------------------------
    # ISP TRACKING
    # -------------------------------------------------------------------------

    async def calculate_isp_metrics(
        self,
        domain_id: str,
        date: datetime | None = None,
    ) -> list[ISPMetrics]:
        """Calculate ISP-specific metrics for a domain."""
        if date is None:
            date = datetime.now(timezone.utc)

        day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        # Get events grouped by recipient ISP
        isp_events = await self._get_isp_events(domain_id, day_start, day_end)

        metrics_list = []

        for isp, events in isp_events.items():
            sent = events.get(EventType.SEND.value, 0)
            delivered = events.get(EventType.DELIVERY.value, 0)
            bounced = events.get(EventType.BOUNCE.value, 0)
            complaints = events.get(EventType.COMPLAINT.value, 0)
            opens = events.get(EventType.OPEN.value, 0)
            clicks = events.get(EventType.CLICK.value, 0)

            # Calculate rates
            delivery_rate = delivered / sent if sent > 0 else None
            bounce_rate = bounced / sent if sent > 0 else None
            complaint_rate = complaints / sent if sent > 0 else None
            open_rate = opens / delivered if delivered > 0 else None

            # Calculate ISP health score
            health_score, _ = self._calculate_health_score(
                sent=sent,
                delivered=delivered,
                bounced=bounced,
                hard_bounces=0,  # Simplified
                complaints=complaints,
                opens=opens,
                clicks=clicks,
            )

            # Check for existing entry
            result = await self.db.execute(
                select(ISPMetrics).where(
                    and_(
                        ISPMetrics.domain_id == domain_id,
                        ISPMetrics.isp == isp,
                        ISPMetrics.date == day_start,
                    )
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.sent = sent
                existing.delivered = delivered
                existing.bounced = bounced
                existing.complaints = complaints
                existing.opens = opens
                existing.clicks = clicks
                existing.delivery_rate = delivery_rate
                existing.bounce_rate = bounce_rate
                existing.complaint_rate = complaint_rate
                existing.open_rate = open_rate
                existing.health_score = health_score
                metrics_list.append(existing)
            else:
                metrics = ISPMetrics(
                    id=str(uuid4()),
                    domain_id=domain_id,
                    isp=isp,
                    date=day_start,
                    sent=sent,
                    delivered=delivered,
                    bounced=bounced,
                    complaints=complaints,
                    opens=opens,
                    clicks=clicks,
                    delivery_rate=delivery_rate,
                    bounce_rate=bounce_rate,
                    complaint_rate=complaint_rate,
                    open_rate=open_rate,
                    health_score=health_score,
                )
                self.db.add(metrics)
                metrics_list.append(metrics)

        await self.db.commit()

        logger.info(f"Calculated ISP metrics for domain {domain_id}: {len(metrics_list)} ISPs")
        return metrics_list

    async def _get_isp_events(
        self,
        domain_id: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, dict[str, int]]:
        """Get events grouped by recipient ISP."""
        result = await self.db.execute(
            select(
                ProviderEventLog.recipient_email,
                ProviderEventLog.event_type,
            )
            .where(
                and_(
                    ProviderEventLog.domain_id == domain_id,
                    ProviderEventLog.created_at >= start,
                    ProviderEventLog.created_at < end,
                    ProviderEventLog.recipient_email.isnot(None),
                )
            )
        )

        # Group by ISP
        isp_events: dict[str, dict[str, int]] = {}

        for row in result.all():
            email = row[0]
            event_type = row[1]

            isp = self._detect_isp(email)
            if isp not in isp_events:
                isp_events[isp] = {}

            if event_type not in isp_events[isp]:
                isp_events[isp][event_type] = 0

            isp_events[isp][event_type] += 1

        return isp_events

    def _detect_isp(self, email: str) -> str:
        """Detect ISP from email address."""
        if not email or "@" not in email:
            return "other"

        domain = email.split("@")[1].lower()

        for isp, domains in ISP_DOMAINS.items():
            if domain in domains:
                return isp

        return "other"

    # -------------------------------------------------------------------------
    # HEALTH HISTORY & SUMMARY
    # -------------------------------------------------------------------------

    async def get_health_history(
        self,
        domain_id: str,
        days: int = 30,
    ) -> list[DomainHealth]:
        """Get health history for a domain."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(DomainHealth)
            .where(
                and_(
                    DomainHealth.domain_id == domain_id,
                    DomainHealth.date >= since,
                )
            )
            .order_by(DomainHealth.date.desc())
        )
        return list(result.scalars().all())

    async def get_health_summary(
        self,
        domain_id: str,
    ) -> dict:
        """Get health summary with trends and recommendations."""
        # Get domain
        result = await self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        # Get last 7 and 30 days
        last_7 = await self.get_health_history(domain_id, days=7)
        last_30 = await self.get_health_history(domain_id, days=30)

        # Calculate trend
        trend = "stable"
        if len(last_7) >= 2:
            recent_avg = sum(h.health_score for h in last_7[:3]) / min(3, len(last_7))
            older_avg = sum(h.health_score for h in last_7[-3:]) / min(3, len(last_7))

            if recent_avg > older_avg + 5:
                trend = "improving"
            elif recent_avg < older_avg - 5:
                trend = "declining"

        # Aggregate metrics
        def aggregate(entries: list[DomainHealth]) -> dict:
            if not entries:
                return {}
            return {
                "total_sent": sum(e.total_sent for e in entries),
                "total_delivered": sum(e.total_delivered for e in entries),
                "total_bounced": sum(e.total_bounced for e in entries),
                "complaints": sum(e.complaints for e in entries),
                "opens": sum(e.opens for e in entries),
                "clicks": sum(e.clicks for e in entries),
                "avg_health_score": int(sum(e.health_score for e in entries) / len(entries)),
            }

        # Generate recommendations
        recommendations = []

        if domain.health_score < 70:
            recommendations.append("Review bounce rates and clean your email list")

        if last_7 and sum(h.complaints for h in last_7) > 0:
            recommendations.append("Monitor complaint rates - consider reviewing email content and frequency")

        if last_7 and sum(h.hard_bounces for h in last_7) > sum(h.total_sent for h in last_7) * 0.02:
            recommendations.append("High hard bounce rate detected - verify email addresses before sending")

        if domain.warming_status == "in_progress":
            recommendations.append("Continue warming process - maintain consistent sending volumes")

        return {
            "domain_id": domain.id,
            "current_health_score": domain.health_score,
            "current_health_status": domain.health_status,
            "trend": trend,
            "last_7_days": aggregate(last_7),
            "last_30_days": aggregate(last_30),
            "recommendations": recommendations,
        }

    async def get_isp_summary(
        self,
        domain_id: str,
        days: int = 7,
    ) -> dict:
        """Get ISP-specific metrics summary."""
        since = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(ISPMetrics)
            .where(
                and_(
                    ISPMetrics.domain_id == domain_id,
                    ISPMetrics.date >= since,
                )
            )
            .order_by(ISPMetrics.isp, ISPMetrics.date.desc())
        )
        metrics = list(result.scalars().all())

        # Group by ISP
        isp_data: dict[str, dict] = {}
        warnings = []

        for m in metrics:
            if m.isp not in isp_data:
                isp_data[m.isp] = {
                    "sent": 0,
                    "delivered": 0,
                    "bounced": 0,
                    "complaints": 0,
                    "opens": 0,
                    "clicks": 0,
                    "health_scores": [],
                }

            isp_data[m.isp]["sent"] += m.sent
            isp_data[m.isp]["delivered"] += m.delivered
            isp_data[m.isp]["bounced"] += m.bounced
            isp_data[m.isp]["complaints"] += m.complaints
            isp_data[m.isp]["opens"] += m.opens
            isp_data[m.isp]["clicks"] += m.clicks
            isp_data[m.isp]["health_scores"].append(m.health_score)

        # Calculate averages and detect issues
        for isp, data in isp_data.items():
            if data["health_scores"]:
                data["avg_health_score"] = int(sum(data["health_scores"]) / len(data["health_scores"]))
                del data["health_scores"]

                if data["avg_health_score"] < 70:
                    warnings.append({
                        "isp": isp,
                        "issue": "low_health_score",
                        "score": data["avg_health_score"],
                    })

            if data["sent"] > 0:
                bounce_rate = data["bounced"] / data["sent"]
                if bounce_rate > 0.05:
                    warnings.append({
                        "isp": isp,
                        "issue": "high_bounce_rate",
                        "rate": bounce_rate,
                    })

        return {
            "domain_id": domain_id,
            "period": f"last_{days}_days",
            "metrics_by_isp": isp_data,
            "warnings": warnings,
        }

    # -------------------------------------------------------------------------
    # AUTO-PAUSE ON CRITICAL HEALTH
    # -------------------------------------------------------------------------

    async def check_and_pause_unhealthy_domains(
        self,
        workspace_id: str | None = None,
    ) -> list[str]:
        """
        Check domains and auto-pause those with critical health.

        Returns list of paused domain IDs.
        """
        from aexy.models.email_infrastructure import DomainStatus

        query = select(SendingDomain).where(
            and_(
                SendingDomain.health_status == DomainHealthStatus.CRITICAL.value,
                SendingDomain.status.in_([
                    DomainStatus.ACTIVE.value,
                    DomainStatus.WARMING.value,
                    DomainStatus.VERIFIED.value,
                ]),
            )
        )

        if workspace_id:
            query = query.where(SendingDomain.workspace_id == workspace_id)

        result = await self.db.execute(query)
        domains = list(result.scalars().all())

        paused = []
        for domain in domains:
            domain.status = DomainStatus.PAUSED.value
            paused.append(domain.id)
            logger.warning(f"Auto-paused domain {domain.domain} due to critical health")

        if paused:
            await self.db.commit()

        return paused

    # -------------------------------------------------------------------------
    # EVENT RECORDING
    # -------------------------------------------------------------------------

    async def record_send_event(
        self,
        workspace_id: str,
        domain_id: str,
        provider_id: str,
        message_id: str,
        recipient_email: str,
    ) -> None:
        """Record a send event for metrics tracking."""
        event = ProviderEventLog(
            id=str(uuid4()),
            workspace_id=workspace_id,
            domain_id=domain_id,
            provider_id=provider_id,
            event_type=EventType.SEND.value,
            message_id=message_id,
            recipient_email=recipient_email,
            raw_payload={},
            event_timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
        await self.db.commit()

    # -------------------------------------------------------------------------
    # SYNC METHODS (for Celery tasks)
    # -------------------------------------------------------------------------

    def record_send_event_sync(
        self,
        domain_id: str,
        event_type: str,
        recipient_email: str,
        message_id: str | None = None,
        provider_id: str | None = None,
    ) -> None:
        """
        Sync version to record send/delivery events for metrics tracking.

        Args:
            domain_id: The sending domain ID
            event_type: Event type (send, delivery, bounce, etc.)
            recipient_email: Recipient email address
            message_id: Provider message ID
            provider_id: Provider ID (optional)
        """
        # Get domain for workspace_id
        result = self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if not domain:
            logger.warning(f"Domain {domain_id} not found for event recording")
            return

        event = ProviderEventLog(
            id=str(uuid4()),
            workspace_id=domain.workspace_id,
            domain_id=domain_id,
            provider_id=provider_id or domain.provider_id,
            event_type=event_type,
            message_id=message_id,
            recipient_email=recipient_email,
            raw_payload={},
            event_timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
        self.db.commit()
