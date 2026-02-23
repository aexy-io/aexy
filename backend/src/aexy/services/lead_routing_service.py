"""Lead Routing Service — rule-based assignment with round-robin and SLA tracking."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_routing import GTMRoutingRule, GTMLeadAssignment

logger = logging.getLogger(__name__)


class LeadRoutingService:
    """Route leads to reps based on rules and track SLA compliance."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # ROUTING RULE CRUD
    # =========================================================================

    async def create_rule(self, workspace_id: str, data: dict, created_by: str | None = None) -> GTMRoutingRule:
        rule = GTMRoutingRule(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data["name"],
            priority=data.get("priority", 0),
            is_active=data.get("is_active", True),
            conditions=data.get("conditions", []),
            strategy=data.get("strategy", "round_robin"),
            assignee_pool=data.get("assignee_pool", []),
            sla_first_response_minutes=data.get("sla_first_response_minutes"),
            sla_follow_up_minutes=data.get("sla_follow_up_minutes"),
            fallback_assignee_id=data.get("fallback_assignee_id"),
            created_by=created_by,
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def update_rule(self, workspace_id: str, rule_id: str, data: dict) -> GTMRoutingRule | None:
        result = await self.db.execute(
            select(GTMRoutingRule).where(
                and_(GTMRoutingRule.workspace_id == workspace_id, GTMRoutingRule.id == rule_id)
            )
        )
        rule = result.scalar_one_or_none()
        if not rule:
            return None
        for key, value in data.items():
            if value is not None and hasattr(rule, key):
                setattr(rule, key, value)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def delete_rule(self, workspace_id: str, rule_id: str) -> bool:
        result = await self.db.execute(
            delete(GTMRoutingRule).where(
                and_(GTMRoutingRule.workspace_id == workspace_id, GTMRoutingRule.id == rule_id)
            )
        )
        await self.db.commit()
        return result.rowcount > 0

    async def list_rules(self, workspace_id: str) -> list[GTMRoutingRule]:
        result = await self.db.execute(
            select(GTMRoutingRule)
            .where(GTMRoutingRule.workspace_id == workspace_id)
            .order_by(GTMRoutingRule.priority.desc(), GTMRoutingRule.created_at)
        )
        return list(result.scalars().all())

    # =========================================================================
    # LEAD ROUTING
    # =========================================================================

    async def route_lead(self, workspace_id: str, record_id: str, record_values: dict | None = None) -> GTMLeadAssignment | None:
        """Evaluate rules by priority and assign lead to a rep."""
        rules = await self.db.execute(
            select(GTMRoutingRule).where(
                and_(GTMRoutingRule.workspace_id == workspace_id, GTMRoutingRule.is_active == True)
            ).order_by(GTMRoutingRule.priority.desc())
        )
        for rule in rules.scalars().all():
            if self._match_conditions(rule.conditions, record_values or {}):
                assignee_id = await self._pick_assignee(workspace_id, rule)
                if not assignee_id:
                    assignee_id = rule.fallback_assignee_id
                if not assignee_id:
                    continue

                assignment = GTMLeadAssignment(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    record_id=record_id,
                    routing_rule_id=rule.id,
                    assignee_id=assignee_id,
                    sla_first_response_minutes=rule.sla_first_response_minutes,
                    status="pending",
                )
                self.db.add(assignment)
                await self.db.commit()
                await self.db.refresh(assignment)

                # Emit alert
                try:
                    from aexy.services.gtm_alert_service import GTMAlertService
                    alert_svc = GTMAlertService(self.db)
                    await alert_svc.emit_gtm_event(workspace_id, "new_lead", {
                        "record_id": record_id,
                        "assignee_id": assignee_id,
                        "rule_name": rule.name,
                    })
                except Exception as e:
                    logger.error(f"Failed to emit new_lead alert: {e}")

                return assignment
        return None

    async def _pick_assignee(self, workspace_id: str, rule: GTMRoutingRule) -> str | None:
        """Round-robin assignment from pool."""
        pool = rule.assignee_pool
        if not pool:
            return None

        if rule.strategy == "round_robin":
            # Count current active assignments per pool member
            counts = {}
            for member in pool:
                dev_id = member.get("developer_id")
                if not dev_id:
                    continue
                result = await self.db.execute(
                    select(func.count(GTMLeadAssignment.id)).where(
                        and_(
                            GTMLeadAssignment.workspace_id == workspace_id,
                            GTMLeadAssignment.assignee_id == dev_id,
                            GTMLeadAssignment.status.in_(["pending", "contacted"]),
                        )
                    )
                )
                count = result.scalar() or 0
                max_active = member.get("max_active", 999)
                if count < max_active:
                    counts[dev_id] = count

            if not counts:
                return None
            return min(counts, key=counts.get)

        # Fallback: first available
        for member in pool:
            if member.get("developer_id"):
                return member["developer_id"]
        return None

    def _match_conditions(self, conditions: list, record_values: dict) -> bool:
        if not conditions:
            return True
        for cond in conditions:
            field = cond.get("field", "")
            op = cond.get("op", "eq")
            value = cond.get("value")
            actual = record_values.get(field)
            if op == "eq" and actual != value:
                return False
            elif op == "neq" and actual == value:
                return False
            elif op == "in" and actual not in (value or []):
                return False
            elif op == "contains" and (actual is None or value not in str(actual)):
                return False
        return True

    # =========================================================================
    # ASSIGNMENT ACTIONS
    # =========================================================================

    async def record_first_response(self, workspace_id: str, assignment_id: str) -> GTMLeadAssignment | None:
        result = await self.db.execute(
            select(GTMLeadAssignment).where(
                and_(GTMLeadAssignment.workspace_id == workspace_id, GTMLeadAssignment.id == assignment_id)
            )
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return None
        now = datetime.now(timezone.utc)
        assignment.first_response_at = now
        assignment.status = "contacted"
        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment

    async def reassign_lead(self, workspace_id: str, assignment_id: str, new_assignee_id: str, notes: str | None = None) -> GTMLeadAssignment | None:
        result = await self.db.execute(
            select(GTMLeadAssignment).where(
                and_(GTMLeadAssignment.workspace_id == workspace_id, GTMLeadAssignment.id == assignment_id)
            )
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return None
        assignment.assignee_id = new_assignee_id
        assignment.status = "reassigned"
        if notes:
            assignment.notes = notes
        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment

    async def list_assignments(
        self, workspace_id: str, page: int = 1, per_page: int = 50,
        status: str | None = None, assignee_id: str | None = None,
    ) -> tuple[list[GTMLeadAssignment], int]:
        q = select(GTMLeadAssignment).where(GTMLeadAssignment.workspace_id == workspace_id)
        count_q = select(func.count(GTMLeadAssignment.id)).where(GTMLeadAssignment.workspace_id == workspace_id)
        if status:
            q = q.where(GTMLeadAssignment.status == status)
            count_q = count_q.where(GTMLeadAssignment.status == status)
        if assignee_id:
            q = q.where(GTMLeadAssignment.assignee_id == assignee_id)
            count_q = count_q.where(GTMLeadAssignment.assignee_id == assignee_id)
        total = (await self.db.execute(count_q)).scalar() or 0
        q = q.order_by(GTMLeadAssignment.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    # =========================================================================
    # SLA MONITORING
    # =========================================================================

    async def check_sla_breaches(self, workspace_id: str) -> int:
        """Find overdue assignments and mark as breached. Returns count of new breaches."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(GTMLeadAssignment).where(
                and_(
                    GTMLeadAssignment.workspace_id == workspace_id,
                    GTMLeadAssignment.status == "pending",
                    GTMLeadAssignment.sla_breached == False,
                    GTMLeadAssignment.sla_first_response_minutes.isnot(None),
                )
            )
        )
        breach_count = 0
        for assignment in result.scalars().all():
            deadline = assignment.assigned_at + timedelta(minutes=assignment.sla_first_response_minutes)
            if now > deadline:
                assignment.sla_breached = True
                assignment.sla_breach_at = now
                breach_count += 1

                try:
                    from aexy.services.gtm_alert_service import GTMAlertService
                    alert_svc = GTMAlertService(self.db)
                    await alert_svc.emit_gtm_event(workspace_id, "sla_breach", {
                        "assignment_id": assignment.id,
                        "record_id": assignment.record_id,
                        "assignee_id": assignment.assignee_id,
                        "minutes_overdue": int((now - deadline).total_seconds() / 60),
                    })
                except Exception as e:
                    logger.error(f"Failed to emit sla_breach alert: {e}")

        if breach_count:
            await self.db.commit()
        return breach_count

    async def get_sla_dashboard(self, workspace_id: str, days: int = 30) -> dict:
        """Aggregate SLA metrics for the dashboard."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        base = and_(
            GTMLeadAssignment.workspace_id == workspace_id,
            GTMLeadAssignment.created_at >= since,
        )

        total = (await self.db.execute(
            select(func.count(GTMLeadAssignment.id)).where(base)
        )).scalar() or 0

        pending = (await self.db.execute(
            select(func.count(GTMLeadAssignment.id)).where(and_(base, GTMLeadAssignment.status == "pending"))
        )).scalar() or 0

        contacted = (await self.db.execute(
            select(func.count(GTMLeadAssignment.id)).where(and_(base, GTMLeadAssignment.status == "contacted"))
        )).scalar() or 0

        qualified = (await self.db.execute(
            select(func.count(GTMLeadAssignment.id)).where(and_(base, GTMLeadAssignment.status == "qualified"))
        )).scalar() or 0

        breached = (await self.db.execute(
            select(func.count(GTMLeadAssignment.id)).where(and_(base, GTMLeadAssignment.sla_breached == True))
        )).scalar() or 0

        # Avg response time (only for responded assignments)
        avg_resp = (await self.db.execute(
            select(func.avg(
                func.extract("epoch", GTMLeadAssignment.first_response_at - GTMLeadAssignment.assigned_at) / 60
            )).where(and_(base, GTMLeadAssignment.first_response_at.isnot(None)))
        )).scalar() or 0.0

        return {
            "total_assignments": total,
            "pending_count": pending,
            "contacted_count": contacted,
            "qualified_count": qualified,
            "avg_response_minutes": round(float(avg_resp), 1),
            "sla_breach_count": breached,
            "sla_breach_rate": round(breached / total * 100, 1) if total else 0.0,
            "assignments_by_rep": [],
        }
