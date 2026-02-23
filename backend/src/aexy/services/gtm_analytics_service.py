"""GTM analytics service for pipeline, channel, attribution, sequence, and trend reporting."""

import logging
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, case, and_, Date
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm import (
    LeadScore,
    BehavioralEvent,
    VisitorSession,
    LifecycleStage,
)
from aexy.models.gtm_outreach import (
    OutreachSequence,
    OutreachEnrollment,
    OutreachStepExecution,
)

logger = logging.getLogger(__name__)

# Ordered pipeline stages from top-of-funnel to bottom.
STAGE_ORDER = [
    LifecycleStage.ANONYMOUS.value,
    LifecycleStage.KNOWN.value,
    LifecycleStage.LEAD.value,
    LifecycleStage.MQL.value,
    LifecycleStage.SQL.value,
    LifecycleStage.OPPORTUNITY.value,
    LifecycleStage.CUSTOMER.value,
]

# Stages that count as a conversion for attribution purposes.
CONVERSION_STAGES = {
    LifecycleStage.MQL.value,
    LifecycleStage.SQL.value,
    LifecycleStage.OPPORTUNITY.value,
    LifecycleStage.CUSTOMER.value,
}


def _safe_rate(numerator: float, denominator: float) -> float:
    """Return percentage rate, guarding against division by zero."""
    if denominator == 0:
        return 0.0
    return round(numerator / denominator * 100, 2)


class GTMAnalyticsService:
    """Computes analytics from existing GTM tables for dashboards and reports."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -------------------------------------------------------------------------
    # 1. PIPELINE ANALYTICS
    # -------------------------------------------------------------------------

    async def get_pipeline_analytics(
        self, workspace_id: str, days: int = 30
    ) -> dict:
        """
        Return pipeline funnel data grouped by lifecycle stage.

        Each stage includes its count and the conversion rate from the previous
        stage (count / previous_stage_count).
        """
        # Count records per lifecycle stage.
        stmt = (
            select(
                LeadScore.lifecycle_stage,
                func.count(LeadScore.id).label("cnt"),
            )
            .where(LeadScore.workspace_id == workspace_id)
            .group_by(LeadScore.lifecycle_stage)
        )
        result = await self.db.execute(stmt)
        stage_counts: dict[str, int] = {row.lifecycle_stage: row.cnt for row in result}

        # Build ordered stage list with conversion rates.
        stages: list[dict] = []
        previous_count: int | None = None
        for stage in STAGE_ORDER:
            count = stage_counts.get(stage, 0)
            conversion_rate = (
                _safe_rate(count, previous_count) if previous_count is not None else 0.0
            )
            stages.append(
                {
                    "stage": stage,
                    "count": count,
                    "conversion_rate": conversion_rate,
                }
            )
            previous_count = count

        total_leads = sum(s["count"] for s in stages)

        # Leads created within the reporting window.
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        period_stmt = (
            select(func.count(LeadScore.id))
            .where(
                and_(
                    LeadScore.workspace_id == workspace_id,
                    LeadScore.created_at >= cutoff,
                )
            )
        )
        period_result = await self.db.execute(period_stmt)
        period_new = period_result.scalar() or 0

        return {
            "stages": stages,
            "total_leads": total_leads,
            "period_new": period_new,
        }

    # -------------------------------------------------------------------------
    # 2. CHANNEL ANALYTICS
    # -------------------------------------------------------------------------

    async def get_channel_analytics(
        self, workspace_id: str, days: int = 30
    ) -> dict:
        """
        Return outreach performance metrics grouped by channel (email,
        linkedin, sms) for the given time window.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        stmt = (
            select(
                OutreachStepExecution.channel,
                func.count(OutreachStepExecution.id).label("total_sent"),
                func.count(OutreachStepExecution.delivered_at).label("delivered"),
                func.count(OutreachStepExecution.opened_at).label("opened"),
                func.count(OutreachStepExecution.clicked_at).label("clicked"),
                func.count(OutreachStepExecution.replied_at).label("replied"),
                func.sum(
                    case((OutreachStepExecution.status == "bounced", 1), else_=0)
                ).label("bounced"),
            )
            .where(
                and_(
                    OutreachStepExecution.workspace_id == workspace_id,
                    OutreachStepExecution.created_at >= cutoff,
                )
            )
            .group_by(OutreachStepExecution.channel)
        )
        result = await self.db.execute(stmt)

        channels: list[dict] = []
        for row in result:
            total = row.total_sent or 0
            channels.append(
                {
                    "channel": row.channel,
                    "total_sent": total,
                    "delivered": row.delivered or 0,
                    "opened": row.opened or 0,
                    "clicked": row.clicked or 0,
                    "replied": row.replied or 0,
                    "bounced": row.bounced or 0,
                    "open_rate": _safe_rate(row.opened or 0, total),
                    "click_rate": _safe_rate(row.clicked or 0, total),
                    "reply_rate": _safe_rate(row.replied or 0, total),
                    "bounce_rate": _safe_rate(row.bounced or 0, total),
                }
            )

        return {"channels": channels}

    # -------------------------------------------------------------------------
    # 3. ATTRIBUTION ANALYTICS
    # -------------------------------------------------------------------------

    async def get_attribution_analytics(
        self, workspace_id: str, model: str = "linear", days: int = 90
    ) -> dict:
        """
        Simplified multi-touch attribution.

        For each channel we count total touchpoints associated with converted
        records (lifecycle_stage in mql/sql/opportunity/customer), then apply
        the chosen attribution model to distribute conversion credit.

        Supported models: first_touch, last_touch, linear, u_shaped, time_decay.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Step 1: Get converted record IDs.
        converted_stmt = (
            select(LeadScore.record_id)
            .where(
                and_(
                    LeadScore.workspace_id == workspace_id,
                    LeadScore.lifecycle_stage.in_(list(CONVERSION_STAGES)),
                )
            )
        )
        converted_result = await self.db.execute(converted_stmt)
        converted_ids = [row.record_id for row in converted_result]

        if not converted_ids:
            return {"channels": [], "model": model, "total_conversions": 0}

        # Step 2: Gather touchpoints per converted record.
        # We collect (record_id, channel, timestamp) from two sources.
        # Source A: BehavioralEvent — use utm_source as channel.
        behavioral_stmt = (
            select(
                BehavioralEvent.record_id,
                BehavioralEvent.utm_source.label("channel"),
                BehavioralEvent.occurred_at.label("touch_time"),
            )
            .where(
                and_(
                    BehavioralEvent.workspace_id == workspace_id,
                    BehavioralEvent.record_id.in_(converted_ids),
                    BehavioralEvent.utm_source.isnot(None),
                    BehavioralEvent.occurred_at >= cutoff,
                )
            )
        )

        # Source B: OutreachStepExecution — use channel column.
        # Join through enrollment to get record_id.
        outreach_stmt = (
            select(
                OutreachEnrollment.record_id,
                OutreachStepExecution.channel.label("channel"),
                OutreachStepExecution.created_at.label("touch_time"),
            )
            .join(
                OutreachEnrollment,
                OutreachStepExecution.enrollment_id == OutreachEnrollment.id,
            )
            .where(
                and_(
                    OutreachStepExecution.workspace_id == workspace_id,
                    OutreachEnrollment.record_id.in_(converted_ids),
                    OutreachStepExecution.created_at >= cutoff,
                )
            )
        )

        behavioral_result = await self.db.execute(behavioral_stmt)
        outreach_result = await self.db.execute(outreach_stmt)

        # Assemble touchpoints grouped by record_id.
        # Each touchpoint is (channel, timestamp).
        record_touches: dict[str, list[tuple[str, datetime]]] = {}
        for row in behavioral_result:
            record_touches.setdefault(row.record_id, []).append(
                (row.channel, row.touch_time)
            )
        for row in outreach_result:
            record_touches.setdefault(row.record_id, []).append(
                (row.channel, row.touch_time)
            )

        # Sort each record's touchpoints chronologically.
        for touches in record_touches.values():
            touches.sort(key=lambda t: t[1])

        # Step 3: Apply attribution model.
        channel_credit: dict[str, float] = {}

        for record_id, touches in record_touches.items():
            if not touches:
                continue

            credits = self._compute_credits(touches, model)
            for channel, credit in credits.items():
                channel_credit[channel] = channel_credit.get(channel, 0.0) + credit

        total_attributed = sum(channel_credit.values())
        channels = [
            {
                "channel": ch,
                "attributed_conversions": round(credit, 2),
                "percentage": _safe_rate(credit, total_attributed),
            }
            for ch, credit in sorted(
                channel_credit.items(), key=lambda x: x[1], reverse=True
            )
        ]

        return {
            "channels": channels,
            "model": model,
            "total_conversions": len(converted_ids),
        }

    @staticmethod
    def _compute_credits(
        touches: list[tuple[str, datetime]], model: str
    ) -> dict[str, float]:
        """
        Distribute 1.0 unit of conversion credit across channels based on
        the chosen attribution model.
        """
        n = len(touches)
        credits: dict[str, float] = {}

        if model == "first_touch":
            ch = touches[0][0]
            credits[ch] = credits.get(ch, 0.0) + 1.0

        elif model == "last_touch":
            ch = touches[-1][0]
            credits[ch] = credits.get(ch, 0.0) + 1.0

        elif model == "linear":
            weight = 1.0 / n
            for ch, _ in touches:
                credits[ch] = credits.get(ch, 0.0) + weight

        elif model == "u_shaped":
            if n == 1:
                credits[touches[0][0]] = credits.get(touches[0][0], 0.0) + 1.0
            elif n == 2:
                for ch, _ in touches:
                    credits[ch] = credits.get(ch, 0.0) + 0.5
            else:
                # 40% first, 40% last, 20% split among middle.
                first_ch = touches[0][0]
                last_ch = touches[-1][0]
                credits[first_ch] = credits.get(first_ch, 0.0) + 0.4
                credits[last_ch] = credits.get(last_ch, 0.0) + 0.4
                middle_weight = 0.2 / (n - 2)
                for ch, _ in touches[1:-1]:
                    credits[ch] = credits.get(ch, 0.0) + middle_weight

        elif model == "time_decay":
            # Exponential decay with 7-day half-life from the most recent touch.
            half_life_seconds = 7 * 86400
            decay_rate = math.log(2) / half_life_seconds
            latest_time = touches[-1][1]
            raw_weights: list[tuple[str, float]] = []
            for ch, ts in touches:
                age_seconds = max((latest_time - ts).total_seconds(), 0)
                weight = math.exp(-decay_rate * age_seconds)
                raw_weights.append((ch, weight))
            total_weight = sum(w for _, w in raw_weights)
            if total_weight > 0:
                for ch, w in raw_weights:
                    credits[ch] = credits.get(ch, 0.0) + w / total_weight
            else:
                # Fallback to linear if all weights are zero.
                weight = 1.0 / n
                for ch, _ in touches:
                    credits[ch] = credits.get(ch, 0.0) + weight

        else:
            # Unknown model — default to linear.
            logger.warning("Unknown attribution model '%s', falling back to linear", model)
            weight = 1.0 / n
            for ch, _ in touches:
                credits[ch] = credits.get(ch, 0.0) + weight

        return credits

    # -------------------------------------------------------------------------
    # 4. SEQUENCE ANALYTICS
    # -------------------------------------------------------------------------

    async def get_sequence_analytics(
        self, workspace_id: str, days: int = 30
    ) -> dict:
        """
        Compare all outreach sequences in the workspace. Returns per-sequence
        enrollment/reply/completion metrics and average steps completed.
        """
        # Get all sequences for the workspace.
        seq_stmt = (
            select(OutreachSequence)
            .where(OutreachSequence.workspace_id == workspace_id)
            .order_by(OutreachSequence.created_at.desc())
        )
        seq_result = await self.db.execute(seq_stmt)
        sequences = seq_result.scalars().all()

        if not sequences:
            return {"sequences": []}

        sequence_ids = [s.id for s in sequences]

        # Compute average steps completed per sequence from step executions.
        # We count distinct step_index per enrollment, then average per sequence.
        avg_steps_stmt = (
            select(
                OutreachEnrollment.sequence_id,
                func.avg(OutreachEnrollment.current_step_index).label("avg_steps"),
            )
            .where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.sequence_id.in_(sequence_ids),
                )
            )
            .group_by(OutreachEnrollment.sequence_id)
        )
        avg_result = await self.db.execute(avg_steps_stmt)
        avg_steps_map: dict[str, float] = {
            row.sequence_id: round(float(row.avg_steps), 2) if row.avg_steps else 0.0
            for row in avg_result
        }

        result_list: list[dict] = []
        for seq in sequences:
            enrolled = seq.enrolled_count or 0
            result_list.append(
                {
                    "id": seq.id,
                    "name": seq.name,
                    "status": seq.status,
                    "enrolled_count": enrolled,
                    "active_count": seq.active_count or 0,
                    "completed_count": seq.completed_count or 0,
                    "replied_count": seq.replied_count or 0,
                    "bounced_count": seq.bounced_count or 0,
                    "reply_rate": _safe_rate(seq.replied_count or 0, enrolled),
                    "completion_rate": _safe_rate(seq.completed_count or 0, enrolled),
                    "avg_steps_completed": avg_steps_map.get(seq.id, 0.0),
                }
            )

        return {"sequences": result_list}

    # -------------------------------------------------------------------------
    # 5. TREND ANALYTICS
    # -------------------------------------------------------------------------

    async def get_trend_analytics(
        self, workspace_id: str, days: int = 30, interval: str = "day"
    ) -> dict:
        """
        Return time-series data for visitors, leads, emails sent, and replies.

        The *interval* parameter is passed to PostgreSQL's date_trunc (e.g.
        'day', 'week', 'month').
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Shared date-truncation expressions (used in GROUP BY / ORDER BY).
        visitor_date = func.date_trunc(interval, VisitorSession.started_at).cast(Date)
        lead_date = func.date_trunc(interval, LeadScore.created_at).cast(Date)
        email_date = func.date_trunc(interval, OutreachStepExecution.created_at).cast(Date)
        reply_date = func.date_trunc(interval, OutreachStepExecution.replied_at).cast(Date)

        # Visitors per date bucket.
        visitors_stmt = (
            select(
                visitor_date.label("date"),
                func.count(VisitorSession.id).label("count"),
            )
            .where(
                and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.started_at >= cutoff,
                )
            )
            .group_by(visitor_date)
            .order_by(visitor_date)
        )

        # Leads per date bucket.
        leads_stmt = (
            select(
                lead_date.label("date"),
                func.count(LeadScore.id).label("count"),
            )
            .where(
                and_(
                    LeadScore.workspace_id == workspace_id,
                    LeadScore.created_at >= cutoff,
                )
            )
            .group_by(lead_date)
            .order_by(lead_date)
        )

        # Emails sent per date bucket.
        emails_sent_stmt = (
            select(
                email_date.label("date"),
                func.count(OutreachStepExecution.id).label("count"),
            )
            .where(
                and_(
                    OutreachStepExecution.workspace_id == workspace_id,
                    OutreachStepExecution.channel == "email",
                    OutreachStepExecution.created_at >= cutoff,
                )
            )
            .group_by(email_date)
            .order_by(email_date)
        )

        # Replies per date bucket.
        replies_stmt = (
            select(
                reply_date.label("date"),
                func.count(OutreachStepExecution.id).label("count"),
            )
            .where(
                and_(
                    OutreachStepExecution.workspace_id == workspace_id,
                    OutreachStepExecution.status == "replied",
                    OutreachStepExecution.replied_at >= cutoff,
                )
            )
            .group_by(reply_date)
            .order_by(reply_date)
        )

        # Execute queries sequentially (AsyncSession is not safe for concurrent use).
        visitors_res = await self._execute_trend_query(visitors_stmt)
        leads_res = await self._execute_trend_query(leads_stmt)
        emails_res = await self._execute_trend_query(emails_sent_stmt)
        replies_res = await self._execute_trend_query(replies_stmt)

        return {
            "visitors": visitors_res,
            "leads": leads_res,
            "emails_sent": emails_res,
            "replies": replies_res,
        }

    async def _execute_trend_query(self, stmt) -> list[dict]:
        """Execute a trend query and return [{date, count}, ...]."""
        result = await self.db.execute(stmt)
        return [
            {
                "date": str(row.date) if row.date else None,
                "count": row.count,
            }
            for row in result
        ]

    # -------------------------------------------------------------------------
    # 6. WEEKLY REPORT DATA
    # -------------------------------------------------------------------------

    async def get_weekly_report_data(self, workspace_id: str) -> dict:
        """
        Aggregate data for the weekly report email. Calls the individual
        analytics methods and computes top-line KPIs.
        """
        pipeline = await self.get_pipeline_analytics(workspace_id, days=7)
        channels = await self.get_channel_analytics(workspace_id, days=7)
        sequences = await self.get_sequence_analytics(workspace_id, days=7)
        trends = await self.get_trend_analytics(workspace_id, days=7, interval="day")

        # Compute summary KPIs.
        total_visitors = sum(d["count"] for d in trends.get("visitors", []))
        total_new_leads = pipeline.get("period_new", 0)
        total_emails_sent = sum(d["count"] for d in trends.get("emails_sent", []))
        total_replies = sum(d["count"] for d in trends.get("replies", []))

        # Overall reply rate across all channels.
        total_channel_sent = sum(
            ch.get("total_sent", 0) for ch in channels.get("channels", [])
        )
        total_channel_replied = sum(
            ch.get("replied", 0) for ch in channels.get("channels", [])
        )
        overall_reply_rate = _safe_rate(total_channel_replied, total_channel_sent)

        summary = {
            "total_visitors": total_visitors,
            "total_new_leads": total_new_leads,
            "total_emails_sent": total_emails_sent,
            "total_replies": total_replies,
            "overall_reply_rate": overall_reply_rate,
            "active_sequences": sum(
                1
                for s in sequences.get("sequences", [])
                if s.get("status") == "active"
            ),
            "pipeline_total": pipeline.get("total_leads", 0),
        }

        return {
            "pipeline": pipeline,
            "channels": channels,
            "sequences": sequences,
            "trends": trends,
            "summary": summary,
        }
