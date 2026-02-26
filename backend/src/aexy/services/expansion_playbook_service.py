"""Expansion Playbook service for upsell/cross-sell automation."""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_expansion import GTMExpansionPlaybook, GTMExpansionEnrollment

logger = logging.getLogger(__name__)


class ExpansionPlaybookService:
    """Service for managing expansion playbooks and enrollments."""

    def __init__(self, db: AsyncSession):
        """Initialize the expansion playbook service."""
        self.db = db

    # =========================================================================
    # PLAYBOOK CRUD
    # =========================================================================

    async def create_playbook(
        self,
        workspace_id: str,
        data: dict[str, Any],
        created_by: str | None = None,
    ) -> GTMExpansionPlaybook:
        """Create a new expansion playbook."""
        playbook = GTMExpansionPlaybook(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data["name"],
            description=data.get("description"),
            playbook_type=data.get("playbook_type", "upsell"),
            trigger_conditions=data.get("trigger_conditions", []),
            target_product=data.get("target_product", {}),
            steps=data.get("steps", []),
            status=data.get("status", "draft"),
            is_active=data.get("is_active", True),
            created_by=created_by,
        )

        self.db.add(playbook)
        await self.db.commit()
        await self.db.refresh(playbook)

        logger.info(f"Created expansion playbook: {playbook.id} ({playbook.name})")
        return playbook

    async def update_playbook(
        self,
        workspace_id: str,
        playbook_id: str,
        data: dict[str, Any],
    ) -> GTMExpansionPlaybook | None:
        """Update an existing expansion playbook."""
        playbook = await self.get_playbook(workspace_id, playbook_id)
        if not playbook:
            return None

        allowed_fields = {
            "name", "description", "playbook_type", "trigger_conditions",
            "target_product", "steps", "status", "is_active",
        }
        for key, value in data.items():
            if key in allowed_fields:
                setattr(playbook, key, value)

        await self.db.commit()
        await self.db.refresh(playbook)

        logger.info(f"Updated expansion playbook: {playbook_id}")
        return playbook

    async def delete_playbook(
        self,
        workspace_id: str,
        playbook_id: str,
    ) -> bool:
        """Delete an expansion playbook and its enrollments."""
        playbook = await self.get_playbook(workspace_id, playbook_id)
        if not playbook:
            return False

        # Delete associated enrollments first
        await self.db.execute(
            delete(GTMExpansionEnrollment).where(
                and_(
                    GTMExpansionEnrollment.workspace_id == workspace_id,
                    GTMExpansionEnrollment.playbook_id == playbook_id,
                )
            )
        )

        await self.db.delete(playbook)
        await self.db.commit()

        logger.info(f"Deleted expansion playbook: {playbook_id}")
        return True

    async def list_playbooks(
        self,
        workspace_id: str,
    ) -> list[GTMExpansionPlaybook]:
        """List all expansion playbooks for a workspace."""
        result = await self.db.execute(
            select(GTMExpansionPlaybook)
            .where(GTMExpansionPlaybook.workspace_id == workspace_id)
            .order_by(GTMExpansionPlaybook.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_playbook(
        self,
        workspace_id: str,
        playbook_id: str,
    ) -> GTMExpansionPlaybook | None:
        """Get a playbook by ID."""
        result = await self.db.execute(
            select(GTMExpansionPlaybook).where(
                and_(
                    GTMExpansionPlaybook.id == playbook_id,
                    GTMExpansionPlaybook.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # TRIGGER EVALUATION
    # =========================================================================

    async def evaluate_triggers(
        self,
        workspace_id: str,
        record_id: str,
        health_score: float,
    ) -> list[str]:
        """Evaluate all active playbooks for a record and return matching playbook IDs.

        Checks each active playbook's trigger_conditions against the provided
        health_score. Only returns playbooks where the record is not already
        enrolled (active enrollment).
        """
        # Fetch all active playbooks for this workspace
        result = await self.db.execute(
            select(GTMExpansionPlaybook).where(
                and_(
                    GTMExpansionPlaybook.workspace_id == workspace_id,
                    GTMExpansionPlaybook.is_active.is_(True),
                    GTMExpansionPlaybook.status == "active",
                )
            )
        )
        playbooks = list(result.scalars().all())

        if not playbooks:
            return []

        # Get existing active enrollments for this record
        enrollment_result = await self.db.execute(
            select(GTMExpansionEnrollment.playbook_id).where(
                and_(
                    GTMExpansionEnrollment.workspace_id == workspace_id,
                    GTMExpansionEnrollment.record_id == record_id,
                    GTMExpansionEnrollment.status == "active",
                )
            )
        )
        enrolled_playbook_ids = set(enrollment_result.scalars().all())

        matching_ids: list[str] = []

        for playbook in playbooks:
            # Skip if already enrolled
            if playbook.id in enrolled_playbook_ids:
                continue

            # Evaluate trigger conditions
            if self._matches_trigger_conditions(
                playbook.trigger_conditions, health_score, record_id
            ):
                matching_ids.append(playbook.id)

        logger.info(
            f"Trigger evaluation for record {record_id}: "
            f"{len(matching_ids)}/{len(playbooks)} playbooks matched"
        )
        return matching_ids

    def _matches_trigger_conditions(
        self,
        conditions: list[dict[str, Any]],
        health_score: float,
        record_id: str,
    ) -> bool:
        """Check if trigger conditions match the given health_score/record.

        Conditions are a list of dicts, each with:
          - field: the field to evaluate (e.g. "health_score")
          - operator: comparison operator ("gte", "lte", "gt", "lt", "eq")
          - value: the threshold value

        All conditions must match (AND logic).
        """
        if not conditions:
            return False

        operators = {
            "gte": lambda a, b: a >= b,
            "lte": lambda a, b: a <= b,
            "gt": lambda a, b: a > b,
            "lt": lambda a, b: a < b,
            "eq": lambda a, b: a == b,
            "ne": lambda a, b: a != b,
        }

        for condition in conditions:
            field = condition.get("field", "")
            operator = condition.get("operator", "")
            value = condition.get("value")

            if value is None:
                return False

            op_func = operators.get(operator)
            if not op_func:
                logger.warning(f"Unknown trigger operator: {operator}")
                return False

            # Resolve the field value
            if field == "health_score":
                field_value = health_score
            elif field == "record_id":
                field_value = record_id
            else:
                # Unknown field — cannot evaluate, condition fails
                logger.warning(f"Unknown trigger field: {field}")
                return False

            try:
                # Use string comparison for UUID/record_id fields;
                # float() on a UUID raises ValueError.
                if field == "record_id":
                    if not op_func(str(field_value), str(value)):
                        return False
                else:
                    if not op_func(field_value, float(value)):
                        return False
            except (ValueError, TypeError):
                return False

        return True

    # =========================================================================
    # ENROLLMENT MANAGEMENT
    # =========================================================================

    async def enroll_customer(
        self,
        workspace_id: str,
        playbook_id: str,
        record_id: str,
        assigned_to: str | None = None,
        trigger_data: dict[str, Any] | None = None,
    ) -> GTMExpansionEnrollment:
        """Enroll a customer in an expansion playbook."""
        enrollment = GTMExpansionEnrollment(
            id=str(uuid4()),
            workspace_id=workspace_id,
            playbook_id=playbook_id,
            record_id=record_id,
            assigned_to=assigned_to,
            status="active",
            current_step_index=0,
            trigger_data=trigger_data or {},
            outcome={},
        )

        self.db.add(enrollment)

        # Increment total_enrollments on the playbook
        await self.db.execute(
            update(GTMExpansionPlaybook)
            .where(
                and_(
                    GTMExpansionPlaybook.id == playbook_id,
                    GTMExpansionPlaybook.workspace_id == workspace_id,
                )
            )
            .values(total_enrollments=GTMExpansionPlaybook.total_enrollments + 1)
        )

        await self.db.commit()
        await self.db.refresh(enrollment)

        logger.info(
            f"Enrolled record {record_id} in playbook {playbook_id} "
            f"(enrollment {enrollment.id})"
        )
        return enrollment

    async def advance_enrollment(
        self,
        workspace_id: str,
        enrollment_id: str,
    ) -> GTMExpansionEnrollment | None:
        """Advance an enrollment to the next step.

        If the enrollment has passed the last step, mark it as completed.
        """
        result = await self.db.execute(
            select(GTMExpansionEnrollment).where(
                and_(
                    GTMExpansionEnrollment.id == enrollment_id,
                    GTMExpansionEnrollment.workspace_id == workspace_id,
                )
            )
        )
        enrollment = result.scalar_one_or_none()
        if not enrollment:
            return None

        if enrollment.status != "active":
            logger.warning(
                f"Cannot advance enrollment {enrollment_id}: status is {enrollment.status}"
            )
            return enrollment

        # Get the playbook to check total steps
        playbook = await self.get_playbook(workspace_id, enrollment.playbook_id)
        if not playbook:
            logger.error(
                f"Playbook {enrollment.playbook_id} not found for enrollment {enrollment_id}"
            )
            return enrollment

        total_steps = len(playbook.steps) if playbook.steps else 0
        next_step = enrollment.current_step_index + 1

        if next_step >= total_steps:
            # Past the last step — mark as completed
            enrollment.status = "completed"
            enrollment.completed_at = datetime.now(timezone.utc)
            enrollment.current_step_index = next_step
            logger.info(f"Enrollment {enrollment_id} completed all steps")
        else:
            enrollment.current_step_index = next_step
            logger.info(
                f"Advanced enrollment {enrollment_id} to step {next_step}/{total_steps}"
            )

        await self.db.commit()
        await self.db.refresh(enrollment)
        return enrollment

    async def record_outcome(
        self,
        workspace_id: str,
        enrollment_id: str,
        status: str,
        deal_id: str | None = None,
        revenue: float | None = None,
        notes: str | None = None,
    ) -> GTMExpansionEnrollment | None:
        """Record the outcome of an enrollment.

        If status is 'won', update the playbook's conversion_count and
        total_revenue_generated.
        """
        result = await self.db.execute(
            select(GTMExpansionEnrollment).where(
                and_(
                    GTMExpansionEnrollment.id == enrollment_id,
                    GTMExpansionEnrollment.workspace_id == workspace_id,
                )
            )
        )
        enrollment = result.scalar_one_or_none()
        if not enrollment:
            return None

        # Update enrollment status and outcome
        enrollment.status = status
        if status in ("completed", "won", "lost"):
            enrollment.completed_at = datetime.now(timezone.utc)

        outcome_data: dict[str, Any] = dict(enrollment.outcome) if enrollment.outcome else {}
        if deal_id is not None:
            outcome_data["deal_id"] = deal_id
        if revenue is not None:
            outcome_data["revenue"] = revenue
        if notes is not None:
            outcome_data["notes"] = notes
        enrollment.outcome = outcome_data

        # If won, update playbook aggregate metrics
        if status == "won":
            update_values: dict[str, Any] = {
                "conversion_count": GTMExpansionPlaybook.conversion_count + 1,
            }
            if revenue:
                update_values["total_revenue_generated"] = (
                    GTMExpansionPlaybook.total_revenue_generated + revenue
                )

            await self.db.execute(
                update(GTMExpansionPlaybook)
                .where(
                    and_(
                        GTMExpansionPlaybook.id == enrollment.playbook_id,
                        GTMExpansionPlaybook.workspace_id == workspace_id,
                    )
                )
                .values(**update_values)
            )

        await self.db.commit()
        await self.db.refresh(enrollment)

        logger.info(
            f"Recorded outcome for enrollment {enrollment_id}: "
            f"status={status}, deal_id={deal_id}, revenue={revenue}"
        )
        return enrollment

    # =========================================================================
    # ENROLLMENT LISTING
    # =========================================================================

    async def list_enrollments(
        self,
        workspace_id: str,
        page: int = 1,
        per_page: int = 25,
        playbook_id: str | None = None,
        status: str | None = None,
    ) -> tuple[list[GTMExpansionEnrollment], int]:
        """List enrollments with pagination and optional filters.

        Returns a tuple of (enrollments, total_count).
        """
        base_conditions = [GTMExpansionEnrollment.workspace_id == workspace_id]
        if playbook_id:
            base_conditions.append(GTMExpansionEnrollment.playbook_id == playbook_id)
        if status:
            base_conditions.append(GTMExpansionEnrollment.status == status)

        where_clause = and_(*base_conditions)

        # Total count
        count_result = await self.db.execute(
            select(func.count(GTMExpansionEnrollment.id)).where(where_clause)
        )
        total = count_result.scalar() or 0

        # Paginated results
        offset = (page - 1) * per_page
        result = await self.db.execute(
            select(GTMExpansionEnrollment)
            .where(where_clause)
            .order_by(GTMExpansionEnrollment.enrolled_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        enrollments = list(result.scalars().all())

        return enrollments, total

    # =========================================================================
    # ANALYTICS
    # =========================================================================

    async def get_playbook_analytics(
        self,
        workspace_id: str,
    ) -> dict[str, Any]:
        """Get aggregate analytics across all playbooks in a workspace.

        Returns:
            - total_playbooks: count of all playbooks
            - active_playbooks: count of active playbooks
            - total_enrollments: sum across all playbooks
            - total_conversions: sum of conversion_count
            - total_revenue: sum of total_revenue_generated
            - conversion_rate: overall conversion rate (conversions / enrollments)
            - by_type: breakdown by playbook_type
        """
        # Aggregate totals
        totals_result = await self.db.execute(
            select(
                func.count(GTMExpansionPlaybook.id).label("total_playbooks"),
                func.count(
                    func.nullif(GTMExpansionPlaybook.is_active, False)
                ).label("active_playbooks"),
                func.coalesce(
                    func.sum(GTMExpansionPlaybook.total_enrollments), 0
                ).label("total_enrollments"),
                func.coalesce(
                    func.sum(GTMExpansionPlaybook.conversion_count), 0
                ).label("total_conversions"),
                func.coalesce(
                    func.sum(GTMExpansionPlaybook.total_revenue_generated), 0.0
                ).label("total_revenue"),
            ).where(GTMExpansionPlaybook.workspace_id == workspace_id)
        )
        totals = totals_result.one()

        total_enrollments = int(totals.total_enrollments)
        total_conversions = int(totals.total_conversions)
        conversion_rate = (
            (total_conversions / total_enrollments * 100.0)
            if total_enrollments > 0
            else 0.0
        )

        # Breakdown by playbook type
        type_result = await self.db.execute(
            select(
                GTMExpansionPlaybook.playbook_type,
                func.count(GTMExpansionPlaybook.id).label("count"),
                func.coalesce(
                    func.sum(GTMExpansionPlaybook.total_enrollments), 0
                ).label("enrollments"),
                func.coalesce(
                    func.sum(GTMExpansionPlaybook.conversion_count), 0
                ).label("conversions"),
                func.coalesce(
                    func.sum(GTMExpansionPlaybook.total_revenue_generated), 0.0
                ).label("revenue"),
            )
            .where(GTMExpansionPlaybook.workspace_id == workspace_id)
            .group_by(GTMExpansionPlaybook.playbook_type)
        )
        type_rows = type_result.all()

        by_type = {}
        for row in type_rows:
            type_enrollments = int(row.enrollments)
            type_conversions = int(row.conversions)
            by_type[row.playbook_type] = {
                "count": int(row.count),
                "enrollments": type_enrollments,
                "conversions": type_conversions,
                "revenue": float(row.revenue),
                "conversion_rate": (
                    (type_conversions / type_enrollments * 100.0)
                    if type_enrollments > 0
                    else 0.0
                ),
            }

        return {
            "total_playbooks": int(totals.total_playbooks),
            "active_playbooks": int(totals.active_playbooks),
            "total_enrollments": total_enrollments,
            "total_conversions": total_conversions,
            "total_revenue": float(totals.total_revenue),
            "conversion_rate": round(conversion_rate, 2),
            "by_type": by_type,
        }
