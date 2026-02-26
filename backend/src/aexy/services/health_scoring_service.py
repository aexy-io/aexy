"""Customer health scoring service — multi-factor scoring, trend tracking, and dashboards."""

import hashlib
import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import CRMObject, CRMRecord
from aexy.models.gtm_health import GTMHealthScore, GTMHealthConfig

logger = logging.getLogger(__name__)


def _hash_sub_score(record_id: str, factor: str, floor: int = 20, ceiling: int = 95) -> int:
    """Deterministic placeholder sub-score derived from record_id + factor name."""
    digest = hashlib.sha256(f"{record_id}:{factor}".encode()).hexdigest()
    value = int(digest[:8], 16) % (ceiling - floor + 1) + floor
    return value


class HealthScoringService:
    """Compute, store, and query customer health scores."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CONFIG
    # =========================================================================

    async def get_config(self, workspace_id: str) -> GTMHealthConfig:
        """Return the workspace health config, creating a default if missing."""
        result = await self.db.execute(
            select(GTMHealthConfig).where(GTMHealthConfig.workspace_id == workspace_id)
        )
        config = result.scalar_one_or_none()
        if config is None:
            config = GTMHealthConfig(
                id=str(uuid4()),
                workspace_id=workspace_id,
            )
            self.db.add(config)
            await self.db.commit()
            await self.db.refresh(config)
        return config

    async def update_config(self, workspace_id: str, data: dict) -> GTMHealthConfig:
        """Update mutable config fields and return the refreshed config."""
        config = await self.get_config(workspace_id)
        allowed = {"weights", "healthy_threshold", "at_risk_threshold", "critical_threshold", "is_active"}
        for key, value in data.items():
            if key in allowed and value is not None:
                setattr(config, key, value)
        await self.db.commit()
        await self.db.refresh(config)
        return config

    # =========================================================================
    # SCORING
    # =========================================================================

    async def score_customer(self, workspace_id: str, record_id: str) -> GTMHealthScore:
        """Compute health score for a single customer record and upsert it."""
        config = await self.get_config(workspace_id)

        # --- compute sub-scores (deterministic placeholders) ---
        engagement = _hash_sub_score(record_id, "engagement")
        usage = _hash_sub_score(record_id, "usage")
        support = _hash_sub_score(record_id, "support")
        nps = _hash_sub_score(record_id, "nps")
        payment = _hash_sub_score(record_id, "payment")

        weights = config.weights
        total_weight = sum(weights.values()) or 1
        total_score = int(round(
            (engagement * weights.get("engagement", 25)
             + usage * weights.get("usage", 30)
             + support * weights.get("support", 20)
             + nps * weights.get("nps", 15)
             + payment * weights.get("payment", 10))
            / total_weight
        ))
        total_score = max(0, min(100, total_score))

        # --- derive health_status from thresholds ---
        if total_score >= config.healthy_threshold:
            health_status = "healthy"
        elif total_score >= config.at_risk_threshold:
            health_status = "neutral"
        elif total_score >= config.critical_threshold:
            health_status = "at_risk"
        else:
            health_status = "critical"

        # --- upsert ---
        result = await self.db.execute(
            select(GTMHealthScore).where(
                and_(
                    GTMHealthScore.workspace_id == workspace_id,
                    GTMHealthScore.record_id == record_id,
                )
            )
        )
        existing = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)

        if existing is not None:
            previous_score = existing.total_score
            score_delta = total_score - previous_score

            # --- trend ---
            if score_delta > 5:
                trend = "improving"
            elif score_delta < -5:
                trend = "declining"
            else:
                trend = "stable"

            # --- append to score_history ---
            history = list(existing.score_history or [])
            history.append({"score": total_score, "date": now.isoformat()})
            # keep last 90 entries
            if len(history) > 90:
                history = history[-90:]

            existing.engagement_score = engagement
            existing.usage_score = usage
            existing.support_score = support
            existing.nps_score = nps
            existing.payment_score = payment
            existing.total_score = total_score
            existing.health_status = health_status
            existing.trend = trend
            existing.previous_score = previous_score
            existing.score_delta = score_delta
            existing.scoring_factors = {
                "engagement": engagement,
                "usage": usage,
                "support": support,
                "nps": nps,
                "payment": payment,
            }
            existing.score_history = history
            existing.last_scored_at = now

            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        else:
            score = GTMHealthScore(
                id=str(uuid4()),
                workspace_id=workspace_id,
                record_id=record_id,
                engagement_score=engagement,
                usage_score=usage,
                support_score=support,
                nps_score=nps,
                payment_score=payment,
                total_score=total_score,
                health_status=health_status,
                trend="stable",
                previous_score=0,
                score_delta=total_score,
                scoring_factors={
                    "engagement": engagement,
                    "usage": usage,
                    "support": support,
                    "nps": nps,
                    "payment": payment,
                },
                score_history=[{"score": total_score, "date": now.isoformat()}],
                last_scored_at=now,
            )
            self.db.add(score)
            await self.db.commit()
            await self.db.refresh(score)
            return score

    async def batch_score_customers(self, workspace_id: str) -> int:
        """Score all company records in the workspace. Returns count scored."""
        # Find the company object for this workspace
        obj_result = await self.db.execute(
            select(CRMObject.id).where(
                and_(
                    CRMObject.workspace_id == workspace_id,
                    CRMObject.slug == "company",
                )
            )
        )
        company_object_id = obj_result.scalar_one_or_none()
        if company_object_id is None:
            logger.warning("No company object found for workspace %s", workspace_id)
            return 0

        # Get all record IDs for that object
        records_result = await self.db.execute(
            select(CRMRecord.id).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.object_id == company_object_id,
                )
            )
        )
        record_ids = [row[0] for row in records_result.all()]

        count = 0
        for record_id in record_ids:
            try:
                await self.score_customer(workspace_id, record_id)
                count += 1
            except Exception:
                logger.exception("Failed to score record %s", record_id)

        logger.info("Batch scored %d/%d company records for workspace %s", count, len(record_ids), workspace_id)
        return count

    # =========================================================================
    # HEALTH DROPS
    # =========================================================================

    async def detect_health_drops(self, workspace_id: str) -> list[str]:
        """Find scores with significant drops and emit alert events. Returns alert log IDs."""
        result = await self.db.execute(
            select(GTMHealthScore).where(
                and_(
                    GTMHealthScore.workspace_id == workspace_id,
                    GTMHealthScore.score_delta < -10,
                )
            )
        )
        dropped = list(result.scalars().all())
        if not dropped:
            return []

        from aexy.services.gtm_alert_service import GTMAlertService

        alert_svc = GTMAlertService(self.db)
        all_log_ids: list[str] = []

        for score in dropped:
            log_ids = await alert_svc.emit_gtm_event(
                workspace_id=workspace_id,
                event_type="health_drop",
                event_data={
                    "record_id": score.record_id,
                    "total_score": score.total_score,
                    "previous_score": score.previous_score,
                    "score_delta": score.score_delta,
                    "health_status": score.health_status,
                },
            )
            all_log_ids.extend(log_ids)

        logger.info(
            "Detected %d health drops for workspace %s, emitted %d alerts",
            len(dropped), workspace_id, len(all_log_ids),
        )
        return all_log_ids

    # =========================================================================
    # DASHBOARD & QUERIES
    # =========================================================================

    async def get_health_dashboard(self, workspace_id: str) -> dict:
        """Aggregate health metrics for the workspace dashboard."""
        base = GTMHealthScore.workspace_id == workspace_id

        # Counts by status
        status_q = (
            select(
                GTMHealthScore.health_status,
                func.count(GTMHealthScore.id).label("cnt"),
            )
            .where(base)
            .group_by(GTMHealthScore.health_status)
        )
        status_result = await self.db.execute(status_q)
        status_distribution: dict[str, int] = {row.health_status: row.cnt for row in status_result}

        total_customers = sum(status_distribution.values())
        healthy = status_distribution.get("healthy", 0)
        neutral = status_distribution.get("neutral", 0)
        at_risk = status_distribution.get("at_risk", 0)
        critical = status_distribution.get("critical", 0)

        # Average score
        avg_q = select(func.avg(GTMHealthScore.total_score)).where(base)
        avg_score = (await self.db.execute(avg_q)).scalar() or 0
        avg_score = round(float(avg_score), 1)

        # Trend counts
        trend_q = (
            select(
                GTMHealthScore.trend,
                func.count(GTMHealthScore.id).label("cnt"),
            )
            .where(base)
            .group_by(GTMHealthScore.trend)
        )
        trend_result = await self.db.execute(trend_q)
        trend_counts: dict[str, int] = {row.trend: row.cnt for row in trend_result}

        improving = trend_counts.get("improving", 0)
        declining = trend_counts.get("declining", 0)

        # Recent drops (top 10 by largest negative delta)
        drops_q = (
            select(GTMHealthScore)
            .where(and_(base, GTMHealthScore.score_delta < -10))
            .order_by(GTMHealthScore.score_delta.asc())
            .limit(10)
        )
        drops_result = await self.db.execute(drops_q)
        recent_drops = [
            {
                "record_id": s.record_id,
                "total_score": s.total_score,
                "previous_score": s.previous_score,
                "score_delta": s.score_delta,
                "health_status": s.health_status,
            }
            for s in drops_result.scalars().all()
        ]

        return {
            "total_customers": total_customers,
            "healthy_count": healthy,
            "neutral_count": neutral,
            "at_risk_count": at_risk,
            "critical_count": critical,
            "avg_score": avg_score,
            "improving_count": improving,
            "declining_count": declining,
            "status_distribution": [
                {"status": status, "count": count}
                for status, count in status_distribution.items()
            ],
            "recent_drops": recent_drops,
        }

    async def list_health_scores(
        self,
        workspace_id: str,
        page: int = 1,
        per_page: int = 50,
        health_status: str | None = None,
    ) -> tuple[list[GTMHealthScore], int]:
        """Paginated listing of health scores with optional status filter."""
        base_filter = GTMHealthScore.workspace_id == workspace_id
        q = select(GTMHealthScore).where(base_filter)
        count_q = select(func.count(GTMHealthScore.id)).where(base_filter)

        if health_status:
            q = q.where(GTMHealthScore.health_status == health_status)
            count_q = count_q.where(GTMHealthScore.health_status == health_status)

        total = (await self.db.execute(count_q)).scalar() or 0

        q = (
            q.order_by(GTMHealthScore.total_score.asc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def get_health_score(self, workspace_id: str, record_id: str) -> GTMHealthScore | None:
        """Get the health score for a single record."""
        result = await self.db.execute(
            select(GTMHealthScore).where(
                and_(
                    GTMHealthScore.workspace_id == workspace_id,
                    GTMHealthScore.record_id == record_id,
                )
            )
        )
        return result.scalar_one_or_none()
