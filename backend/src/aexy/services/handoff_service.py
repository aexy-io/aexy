"""Handoff Service — CS-to-Sales handoff with SLA tracking and deal conversion."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_handoff import GTMHandoff

logger = logging.getLogger(__name__)


class HandoffService:
    """Manage CS-to-Sales handoffs with context, SLA, and conversion tracking."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_handoff(self, workspace_id: str, data: dict, created_by: str) -> GTMHandoff:
        handoff = GTMHandoff(
            id=str(uuid4()),
            workspace_id=workspace_id,
            record_id=data["record_id"],
            created_by=created_by,
            assigned_to=data["assigned_to"],
            handoff_type=data.get("handoff_type", "expansion"),
            title=data["title"],
            context=data.get("context"),
            estimated_value=data.get("estimated_value"),
            products=data.get("products", []),
            signals=data.get("signals", []),
            sla_accept_minutes=data.get("sla_accept_minutes", 120),
            status="pending",
        )
        self.db.add(handoff)
        await self.db.commit()
        await self.db.refresh(handoff)

        # Emit alert
        try:
            from aexy.services.gtm_alert_service import GTMAlertService
            alert_svc = GTMAlertService(self.db)
            await alert_svc.emit_gtm_event(workspace_id, "new_handoff", {
                "handoff_id": handoff.id,
                "record_id": handoff.record_id,
                "assigned_to": handoff.assigned_to,
                "title": handoff.title,
                "estimated_value": handoff.estimated_value,
            })
        except Exception as e:
            logger.error(f"Failed to emit new_handoff alert: {e}")

        return handoff

    async def accept_handoff(self, workspace_id: str, handoff_id: str) -> GTMHandoff | None:
        result = await self.db.execute(
            select(GTMHandoff).where(
                and_(GTMHandoff.workspace_id == workspace_id, GTMHandoff.id == handoff_id)
            )
        )
        handoff = result.scalar_one_or_none()
        if not handoff or handoff.status != "pending":
            return None
        handoff.status = "accepted"
        handoff.accepted_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(handoff)
        return handoff

    async def decline_handoff(self, workspace_id: str, handoff_id: str, reason: str) -> GTMHandoff | None:
        result = await self.db.execute(
            select(GTMHandoff).where(
                and_(GTMHandoff.workspace_id == workspace_id, GTMHandoff.id == handoff_id)
            )
        )
        handoff = result.scalar_one_or_none()
        if not handoff or handoff.status != "pending":
            return None
        handoff.status = "declined"
        handoff.declined_reason = reason
        await self.db.commit()
        await self.db.refresh(handoff)
        return handoff

    async def convert_to_deal(self, workspace_id: str, handoff_id: str, deal_data: dict) -> GTMHandoff | None:
        result = await self.db.execute(
            select(GTMHandoff).where(
                and_(GTMHandoff.workspace_id == workspace_id, GTMHandoff.id == handoff_id)
            )
        )
        handoff = result.scalar_one_or_none()
        if not handoff or handoff.status not in ("accepted", "in_progress"):
            return None

        # Create CRM deal
        deal_id = str(uuid4())
        handoff.status = "converted"
        handoff.deal_id = deal_id
        handoff.outcome_notes = deal_data.get("notes")
        await self.db.commit()
        await self.db.refresh(handoff)
        return handoff

    async def list_handoffs(
        self, workspace_id: str, page: int = 1, per_page: int = 50,
        status: str | None = None, assigned_to: str | None = None,
    ) -> tuple[list[GTMHandoff], int]:
        q = select(GTMHandoff).where(GTMHandoff.workspace_id == workspace_id)
        count_q = select(func.count(GTMHandoff.id)).where(GTMHandoff.workspace_id == workspace_id)
        if status:
            q = q.where(GTMHandoff.status == status)
            count_q = count_q.where(GTMHandoff.status == status)
        if assigned_to:
            q = q.where(GTMHandoff.assigned_to == assigned_to)
            count_q = count_q.where(GTMHandoff.assigned_to == assigned_to)
        total = (await self.db.execute(count_q)).scalar() or 0
        q = q.order_by(GTMHandoff.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def get_handoff(self, workspace_id: str, handoff_id: str) -> GTMHandoff | None:
        result = await self.db.execute(
            select(GTMHandoff).where(
                and_(GTMHandoff.workspace_id == workspace_id, GTMHandoff.id == handoff_id)
            )
        )
        return result.scalar_one_or_none()

    async def get_handoff_analytics(self, workspace_id: str, days: int = 90) -> dict:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        base = and_(GTMHandoff.workspace_id == workspace_id, GTMHandoff.created_at >= since)

        total = (await self.db.execute(select(func.count(GTMHandoff.id)).where(base))).scalar() or 0
        pending = (await self.db.execute(
            select(func.count(GTMHandoff.id)).where(and_(base, GTMHandoff.status == "pending"))
        )).scalar() or 0
        accepted = (await self.db.execute(
            select(func.count(GTMHandoff.id)).where(and_(base, GTMHandoff.status.in_(["accepted", "in_progress"])))
        )).scalar() or 0
        converted = (await self.db.execute(
            select(func.count(GTMHandoff.id)).where(and_(base, GTMHandoff.status == "converted"))
        )).scalar() or 0
        declined = (await self.db.execute(
            select(func.count(GTMHandoff.id)).where(and_(base, GTMHandoff.status == "declined"))
        )).scalar() or 0
        breached = (await self.db.execute(
            select(func.count(GTMHandoff.id)).where(and_(base, GTMHandoff.sla_breached.is_(True)))
        )).scalar() or 0

        avg_accept = (await self.db.execute(
            select(func.avg(
                func.extract("epoch", GTMHandoff.accepted_at - GTMHandoff.created_at) / 60
            )).where(and_(base, GTMHandoff.accepted_at.isnot(None)))
        )).scalar() or 0.0

        total_value = (await self.db.execute(
            select(func.sum(GTMHandoff.estimated_value)).where(
                and_(base, GTMHandoff.status == "converted")
            )
        )).scalar() or 0.0

        return {
            "total_handoffs": total,
            "pending_count": pending,
            "accepted_count": accepted,
            "converted_count": converted,
            "declined_count": declined,
            "avg_accept_minutes": round(float(avg_accept), 1),
            "conversion_rate": round(converted / total * 100, 1) if total else 0.0,
            "total_converted_value": float(total_value),
            "sla_breach_rate": round(breached / total * 100, 1) if total else 0.0,
        }
