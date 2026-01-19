"""Email analytics service for campaign and workspace statistics."""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any
from collections import defaultdict

from sqlalchemy import select, and_, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.email_marketing import (
    EmailCampaign,
    CampaignRecipient,
    CampaignAnalytics,
    WorkspaceEmailStats,
    EmailTrackingPixel,
    TrackedLink,
    LinkClick,
    RecipientStatus,
    CampaignStatus,
)

logger = logging.getLogger(__name__)


class EmailAnalyticsService:
    """Service for email campaign and workspace analytics."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db

    # -------------------------------------------------------------------------
    # CAMPAIGN ANALYTICS
    # -------------------------------------------------------------------------

    async def get_campaign_overview(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> dict | None:
        """
        Get comprehensive analytics overview for a campaign.

        Returns:
            Dict with all campaign metrics and derived stats
        """
        # Get campaign
        result = await self.db.execute(
            select(EmailCampaign).where(
                and_(
                    EmailCampaign.id == campaign_id,
                    EmailCampaign.workspace_id == workspace_id,
                )
            )
        )
        campaign = result.scalar_one_or_none()

        if not campaign:
            return None

        # Get recipient status breakdown
        status_breakdown = await self._get_recipient_status_breakdown(campaign_id)

        # Calculate rates
        sent = campaign.sent_count or 0
        delivered = campaign.delivered_count or 0
        unique_opens = campaign.unique_open_count or 0
        unique_clicks = campaign.unique_click_count or 0
        bounces = campaign.bounce_count or 0
        unsubscribes = campaign.unsubscribe_count or 0
        complaints = campaign.complaint_count or 0

        delivery_rate = (delivered / sent * 100) if sent > 0 else 0
        open_rate = (unique_opens / delivered * 100) if delivered > 0 else 0
        click_rate = (unique_clicks / delivered * 100) if delivered > 0 else 0
        click_to_open_rate = (unique_clicks / unique_opens * 100) if unique_opens > 0 else 0
        bounce_rate = (bounces / sent * 100) if sent > 0 else 0
        unsubscribe_rate = (unsubscribes / delivered * 100) if delivered > 0 else 0
        complaint_rate = (complaints / delivered * 100) if delivered > 0 else 0

        return {
            "campaign_id": campaign_id,
            "name": campaign.name,
            "status": campaign.status,
            "started_at": campaign.started_at.isoformat() if campaign.started_at else None,
            "completed_at": campaign.completed_at.isoformat() if campaign.completed_at else None,
            "metrics": {
                "total_recipients": campaign.total_recipients,
                "sent": sent,
                "delivered": delivered,
                "opens": campaign.open_count or 0,
                "unique_opens": unique_opens,
                "clicks": campaign.click_count or 0,
                "unique_clicks": unique_clicks,
                "bounces": bounces,
                "unsubscribes": unsubscribes,
                "complaints": complaints,
            },
            "rates": {
                "delivery_rate": round(delivery_rate, 2),
                "open_rate": round(open_rate, 2),
                "click_rate": round(click_rate, 2),
                "click_to_open_rate": round(click_to_open_rate, 2),
                "bounce_rate": round(bounce_rate, 2),
                "unsubscribe_rate": round(unsubscribe_rate, 2),
                "complaint_rate": round(complaint_rate, 4),
            },
            "status_breakdown": status_breakdown,
        }

    async def get_campaign_timeline(
        self,
        campaign_id: str,
        workspace_id: str,
        granularity: str = "hour",  # hour, day
        days: int = 7,
    ) -> list[dict]:
        """
        Get time-series data for campaign opens/clicks.

        Args:
            campaign_id: Campaign ID
            workspace_id: Workspace ID
            granularity: "hour" or "day"
            days: Number of days to look back

        Returns:
            List of time-series data points
        """
        # Verify campaign belongs to workspace
        campaign_result = await self.db.execute(
            select(EmailCampaign).where(
                and_(
                    EmailCampaign.id == campaign_id,
                    EmailCampaign.workspace_id == workspace_id,
                )
            )
        )
        campaign = campaign_result.scalar_one_or_none()
        if not campaign:
            return []

        # Get stored analytics if available
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(CampaignAnalytics)
            .where(
                and_(
                    CampaignAnalytics.campaign_id == campaign_id,
                    CampaignAnalytics.date >= start_date,
                )
            )
            .order_by(CampaignAnalytics.date.asc(), CampaignAnalytics.hour.asc())
        )
        analytics = result.scalars().all()

        if analytics:
            return [
                {
                    "date": a.date.isoformat(),
                    "hour": a.hour,
                    "sent": a.sent,
                    "delivered": a.delivered,
                    "opened": a.opened,
                    "unique_opens": a.unique_opens,
                    "clicked": a.clicked,
                    "unique_clicks": a.unique_clicks,
                    "bounced": a.bounced,
                    "unsubscribed": a.unsubscribed,
                }
                for a in analytics
            ]

        # Fall back to computing from raw data
        return await self._compute_timeline_from_recipients(
            campaign_id, granularity, days
        )

    async def get_campaign_links(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> list[dict]:
        """
        Get click statistics for all tracked links in a campaign.

        Returns:
            List of links with click counts sorted by total clicks
        """
        # Verify campaign
        campaign_result = await self.db.execute(
            select(EmailCampaign).where(
                and_(
                    EmailCampaign.id == campaign_id,
                    EmailCampaign.workspace_id == workspace_id,
                )
            )
        )
        if not campaign_result.scalar_one_or_none():
            return []

        # Get links
        result = await self.db.execute(
            select(TrackedLink)
            .where(TrackedLink.campaign_id == campaign_id)
            .order_by(TrackedLink.click_count.desc())
        )
        links = result.scalars().all()

        total_clicks = sum(link.click_count for link in links)

        return [
            {
                "id": link.id,
                "original_url": link.original_url,
                "link_name": link.link_name,
                "click_count": link.click_count,
                "unique_click_count": link.unique_click_count,
                "click_percentage": round(
                    (link.click_count / total_clicks * 100) if total_clicks > 0 else 0, 2
                ),
            }
            for link in links
        ]

    async def get_campaign_device_breakdown(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> dict:
        """
        Get device and email client breakdown for campaign opens.

        Returns:
            Dict with device and client statistics
        """
        # Verify campaign
        campaign_result = await self.db.execute(
            select(EmailCampaign).where(
                and_(
                    EmailCampaign.id == campaign_id,
                    EmailCampaign.workspace_id == workspace_id,
                )
            )
        )
        if not campaign_result.scalar_one_or_none():
            return {"devices": {}, "clients": {}, "total_opens": 0}

        # Get tracking pixels
        result = await self.db.execute(
            select(EmailTrackingPixel)
            .where(
                and_(
                    EmailTrackingPixel.campaign_id == campaign_id,
                    EmailTrackingPixel.opened == True,
                )
            )
        )
        pixels = result.scalars().all()

        device_counts = defaultdict(int)
        client_counts = defaultdict(int)

        for pixel in pixels:
            device = pixel.device_type or "unknown"
            client = pixel.email_client or "unknown"
            device_counts[device] += 1
            client_counts[client] += 1

        total = len(pixels)

        return {
            "devices": {
                device: {
                    "count": count,
                    "percentage": round(count / total * 100, 2) if total > 0 else 0,
                }
                for device, count in sorted(
                    device_counts.items(), key=lambda x: x[1], reverse=True
                )
            },
            "clients": {
                client: {
                    "count": count,
                    "percentage": round(count / total * 100, 2) if total > 0 else 0,
                }
                for client, count in sorted(
                    client_counts.items(), key=lambda x: x[1], reverse=True
                )
            },
            "total_opens": total,
        }

    async def get_campaign_geography(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> dict:
        """
        Get geographic breakdown of opens (if IP geolocation available).

        Note: This is a placeholder - requires IP geolocation service integration.
        """
        # TODO: Integrate with IP geolocation service
        return {
            "countries": {},
            "regions": {},
            "note": "Geographic data requires IP geolocation service integration",
        }

    # -------------------------------------------------------------------------
    # WORKSPACE ANALYTICS
    # -------------------------------------------------------------------------

    async def get_workspace_overview(
        self,
        workspace_id: str,
        days: int = 30,
    ) -> dict:
        """
        Get workspace-level email analytics overview.

        Args:
            workspace_id: Workspace ID
            days: Number of days to include

        Returns:
            Dict with workspace email statistics
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Get campaigns in period
        result = await self.db.execute(
            select(EmailCampaign)
            .where(
                and_(
                    EmailCampaign.workspace_id == workspace_id,
                    EmailCampaign.status.in_([
                        CampaignStatus.SENT.value,
                        CampaignStatus.SENDING.value,
                    ]),
                    EmailCampaign.started_at >= start_date,
                )
            )
        )
        campaigns = result.scalars().all()

        # Aggregate metrics
        total_sent = sum(c.sent_count or 0 for c in campaigns)
        total_delivered = sum(c.delivered_count or 0 for c in campaigns)
        total_opens = sum(c.open_count or 0 for c in campaigns)
        total_unique_opens = sum(c.unique_open_count or 0 for c in campaigns)
        total_clicks = sum(c.click_count or 0 for c in campaigns)
        total_unique_clicks = sum(c.unique_click_count or 0 for c in campaigns)
        total_bounces = sum(c.bounce_count or 0 for c in campaigns)
        total_unsubscribes = sum(c.unsubscribe_count or 0 for c in campaigns)
        total_complaints = sum(c.complaint_count or 0 for c in campaigns)

        # Calculate average rates
        avg_open_rate = (total_unique_opens / total_delivered * 100) if total_delivered > 0 else 0
        avg_click_rate = (total_unique_clicks / total_delivered * 100) if total_delivered > 0 else 0
        avg_bounce_rate = (total_bounces / total_sent * 100) if total_sent > 0 else 0

        return {
            "period_days": days,
            "campaigns_sent": len(campaigns),
            "totals": {
                "sent": total_sent,
                "delivered": total_delivered,
                "opens": total_opens,
                "unique_opens": total_unique_opens,
                "clicks": total_clicks,
                "unique_clicks": total_unique_clicks,
                "bounces": total_bounces,
                "unsubscribes": total_unsubscribes,
                "complaints": total_complaints,
            },
            "averages": {
                "open_rate": round(avg_open_rate, 2),
                "click_rate": round(avg_click_rate, 2),
                "bounce_rate": round(avg_bounce_rate, 2),
            },
            "health": self._calculate_sending_health(
                total_bounces, total_complaints, total_sent
            ),
        }

    async def get_workspace_trends(
        self,
        workspace_id: str,
        days: int = 30,
    ) -> list[dict]:
        """
        Get daily trends for workspace email metrics.

        Returns:
            List of daily aggregated stats
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Get stored workspace stats
        result = await self.db.execute(
            select(WorkspaceEmailStats)
            .where(
                and_(
                    WorkspaceEmailStats.workspace_id == workspace_id,
                    WorkspaceEmailStats.period == "daily",
                    WorkspaceEmailStats.period_start >= start_date,
                )
            )
            .order_by(WorkspaceEmailStats.period_start.asc())
        )
        stats = result.scalars().all()

        if stats:
            return [
                {
                    "date": s.period_start.date().isoformat(),
                    "campaigns_sent": s.campaigns_sent,
                    "emails_sent": s.emails_sent,
                    "emails_delivered": s.emails_delivered,
                    "opens": s.total_opens,
                    "clicks": s.total_clicks,
                    "unsubscribes": s.unsubscribes,
                    "open_rate": s.avg_open_rate,
                    "click_rate": s.avg_click_rate,
                    "bounce_rate": s.bounce_rate,
                }
                for s in stats
            ]

        # Fall back to computing from campaigns
        return await self._compute_workspace_trends(workspace_id, days)

    async def get_top_campaigns(
        self,
        workspace_id: str,
        metric: str = "open_rate",
        limit: int = 10,
        days: int = 30,
    ) -> list[dict]:
        """
        Get top performing campaigns by a given metric.

        Args:
            workspace_id: Workspace ID
            metric: Metric to sort by (open_rate, click_rate, sent, opens, clicks)
            limit: Number of campaigns to return
            days: Number of days to look back

        Returns:
            List of top campaigns
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(EmailCampaign)
            .where(
                and_(
                    EmailCampaign.workspace_id == workspace_id,
                    EmailCampaign.status.in_([
                        CampaignStatus.SENT.value,
                        CampaignStatus.SENDING.value,
                    ]),
                    EmailCampaign.started_at >= start_date,
                )
            )
        )
        campaigns = result.scalars().all()

        # Calculate metrics for sorting
        campaign_data = []
        for c in campaigns:
            delivered = c.delivered_count or 0
            unique_opens = c.unique_open_count or 0
            unique_clicks = c.unique_click_count or 0

            open_rate = (unique_opens / delivered * 100) if delivered > 0 else 0
            click_rate = (unique_clicks / delivered * 100) if delivered > 0 else 0

            campaign_data.append({
                "id": c.id,
                "name": c.name,
                "status": c.status,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "sent": c.sent_count or 0,
                "delivered": delivered,
                "unique_opens": unique_opens,
                "unique_clicks": unique_clicks,
                "open_rate": round(open_rate, 2),
                "click_rate": round(click_rate, 2),
            })

        # Sort by requested metric
        if metric in ["open_rate", "click_rate"]:
            campaign_data.sort(key=lambda x: x[metric], reverse=True)
        elif metric in ["sent", "opens", "clicks"]:
            key_map = {"sent": "sent", "opens": "unique_opens", "clicks": "unique_clicks"}
            campaign_data.sort(key=lambda x: x[key_map[metric]], reverse=True)

        return campaign_data[:limit]

    async def get_best_send_times(
        self,
        workspace_id: str,
        days: int = 90,
    ) -> dict:
        """
        Analyze best send times based on historical open/click data.

        Returns:
            Dict with recommended send times by day of week and hour
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Get tracking pixel opens with timestamps
        result = await self.db.execute(
            select(EmailTrackingPixel)
            .where(
                and_(
                    EmailTrackingPixel.workspace_id == workspace_id,
                    EmailTrackingPixel.opened == True,
                    EmailTrackingPixel.first_opened_at >= start_date,
                )
            )
        )
        pixels = result.scalars().all()

        # Aggregate by day of week and hour
        by_day = defaultdict(lambda: {"opens": 0, "total_open_time_hours": 0})
        by_hour = defaultdict(lambda: {"opens": 0})

        for pixel in pixels:
            if pixel.first_opened_at:
                day_name = pixel.first_opened_at.strftime("%A")
                hour = pixel.first_opened_at.hour

                by_day[day_name]["opens"] += 1
                by_hour[hour]["opens"] += 1

        # Find best days and hours
        days_sorted = sorted(
            by_day.items(),
            key=lambda x: x[1]["opens"],
            reverse=True,
        )
        hours_sorted = sorted(
            by_hour.items(),
            key=lambda x: x[1]["opens"],
            reverse=True,
        )

        return {
            "best_days": [
                {"day": day, "opens": data["opens"]}
                for day, data in days_sorted[:3]
            ],
            "best_hours": [
                {"hour": hour, "opens": data["opens"]}
                for hour, data in hours_sorted[:5]
            ],
            "recommendation": self._generate_send_time_recommendation(
                days_sorted, hours_sorted
            ),
            "total_opens_analyzed": len(pixels),
        }

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    async def _get_recipient_status_breakdown(
        self,
        campaign_id: str,
    ) -> dict:
        """Get recipient count by status."""
        result = await self.db.execute(
            select(
                CampaignRecipient.status,
                func.count(CampaignRecipient.id),
            )
            .where(CampaignRecipient.campaign_id == campaign_id)
            .group_by(CampaignRecipient.status)
        )

        breakdown = {}
        for row in result.all():
            breakdown[row[0]] = row[1]

        return breakdown

    async def _compute_timeline_from_recipients(
        self,
        campaign_id: str,
        granularity: str,
        days: int,
    ) -> list[dict]:
        """Compute timeline from recipient data."""
        # Get recipient timestamps
        result = await self.db.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.campaign_id == campaign_id)
        )
        recipients = result.scalars().all()

        # Aggregate by time period
        timeline = defaultdict(lambda: {
            "sent": 0, "delivered": 0, "opened": 0,
            "unique_opens": 0, "clicked": 0, "unique_clicks": 0,
        })

        for r in recipients:
            if r.sent_at:
                if granularity == "hour":
                    key = r.sent_at.replace(minute=0, second=0, microsecond=0)
                else:
                    key = r.sent_at.replace(hour=0, minute=0, second=0, microsecond=0)

                timeline[key]["sent"] += 1

                if r.delivered_at:
                    timeline[key]["delivered"] += 1

                if r.first_opened_at:
                    timeline[key]["unique_opens"] += 1
                    timeline[key]["opened"] += r.open_count

                if r.first_clicked_at:
                    timeline[key]["unique_clicks"] += 1
                    timeline[key]["clicked"] += r.click_count

        return [
            {
                "date": key.isoformat(),
                "hour": key.hour if granularity == "hour" else None,
                **data,
            }
            for key, data in sorted(timeline.items())
        ]

    async def _compute_workspace_trends(
        self,
        workspace_id: str,
        days: int,
    ) -> list[dict]:
        """Compute workspace trends from campaign data."""
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self.db.execute(
            select(EmailCampaign)
            .where(
                and_(
                    EmailCampaign.workspace_id == workspace_id,
                    EmailCampaign.started_at >= start_date,
                )
            )
        )
        campaigns = result.scalars().all()

        # Aggregate by day
        daily = defaultdict(lambda: {
            "campaigns": 0, "sent": 0, "delivered": 0,
            "opens": 0, "clicks": 0, "unsubscribes": 0,
        })

        for c in campaigns:
            if c.started_at:
                day = c.started_at.date()
                daily[day]["campaigns"] += 1
                daily[day]["sent"] += c.sent_count or 0
                daily[day]["delivered"] += c.delivered_count or 0
                daily[day]["opens"] += c.unique_open_count or 0
                daily[day]["clicks"] += c.unique_click_count or 0
                daily[day]["unsubscribes"] += c.unsubscribe_count or 0

        return [
            {
                "date": day.isoformat(),
                "campaigns_sent": data["campaigns"],
                "emails_sent": data["sent"],
                "emails_delivered": data["delivered"],
                "opens": data["opens"],
                "clicks": data["clicks"],
                "unsubscribes": data["unsubscribes"],
                "open_rate": round(
                    data["opens"] / data["delivered"] * 100, 2
                ) if data["delivered"] > 0 else 0,
                "click_rate": round(
                    data["clicks"] / data["delivered"] * 100, 2
                ) if data["delivered"] > 0 else 0,
            }
            for day, data in sorted(daily.items())
        ]

    def _calculate_sending_health(
        self,
        bounces: int,
        complaints: int,
        sent: int,
    ) -> dict:
        """Calculate sending health score and status."""
        if sent == 0:
            return {"score": 100, "status": "excellent", "issues": []}

        bounce_rate = bounces / sent
        complaint_rate = complaints / sent

        issues = []
        score = 100

        # Bounce rate impact
        if bounce_rate > 0.05:
            score -= 30
            issues.append(f"High bounce rate ({bounce_rate:.1%})")
        elif bounce_rate > 0.02:
            score -= 15
            issues.append(f"Elevated bounce rate ({bounce_rate:.1%})")

        # Complaint rate impact
        if complaint_rate > 0.001:
            score -= 40
            issues.append(f"High complaint rate ({complaint_rate:.3%})")
        elif complaint_rate > 0.0005:
            score -= 20
            issues.append(f"Elevated complaint rate ({complaint_rate:.3%})")

        score = max(0, score)

        if score >= 90:
            status = "excellent"
        elif score >= 70:
            status = "good"
        elif score >= 50:
            status = "fair"
        elif score >= 30:
            status = "poor"
        else:
            status = "critical"

        return {
            "score": score,
            "status": status,
            "issues": issues,
        }

    def _generate_send_time_recommendation(
        self,
        days_sorted: list,
        hours_sorted: list,
    ) -> str:
        """Generate human-readable send time recommendation."""
        if not days_sorted or not hours_sorted:
            return "Not enough data for recommendations. Send more campaigns to build engagement patterns."

        best_day = days_sorted[0][0] if days_sorted else "Tuesday"
        best_hour = hours_sorted[0][0] if hours_sorted else 10

        # Format hour nicely
        if best_hour == 0:
            time_str = "12:00 AM"
        elif best_hour < 12:
            time_str = f"{best_hour}:00 AM"
        elif best_hour == 12:
            time_str = "12:00 PM"
        else:
            time_str = f"{best_hour - 12}:00 PM"

        return f"Based on your audience engagement patterns, consider sending on {best_day}s around {time_str} for optimal open rates."
