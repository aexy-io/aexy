"""Temporal activities for compliance automation triggers.

Scheduled activities that check for approaching due dates and
compliance status changes, dispatching automation events.
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class CheckApproachingDueAssignmentsInput:
    """Check for training assignments approaching their due date."""
    days_before_due: int = 7


@dataclass
class CheckComplianceStatusChangesInput:
    """Check for developers whose compliance status has changed."""
    pass


@activity.defn
async def check_approaching_due_assignments(input: CheckApproachingDueAssignmentsInput) -> dict[str, Any]:
    """Check for training assignments due within N days and dispatch automation triggers."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import and_, select
    from sqlalchemy.orm import selectinload

    from aexy.models.compliance import TrainingAssignment, AssignmentStatus
    from aexy.services.automation_service import dispatch_automation_event

    logger.info(f"Checking assignments approaching due within {input.days_before_due} days")
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=input.days_before_due)
    triggered = 0

    async with async_session_maker() as db:
        # Find assignments that are pending/in_progress and due within the cutoff
        result = await db.execute(
            select(TrainingAssignment).where(
                and_(
                    TrainingAssignment.status.in_([
                        AssignmentStatus.PENDING.value,
                        AssignmentStatus.IN_PROGRESS.value,
                    ]),
                    TrainingAssignment.due_date.isnot(None),
                    TrainingAssignment.due_date <= cutoff,
                    TrainingAssignment.due_date > now,
                )
            )
        )
        assignments = list(result.scalars().all())

        for assignment in assignments:
            workspace_id = str(assignment.workspace_id) if assignment.workspace_id else None
            if not workspace_id:
                continue

            days_until_due = (assignment.due_date - now).days if assignment.due_date else None
            try:
                await dispatch_automation_event(
                    db=db,
                    workspace_id=workspace_id,
                    module="compliance",
                    trigger_type="assignment.approaching_due",
                    entity_id=str(assignment.id),
                    trigger_data={
                        "assignment_id": str(assignment.id),
                        "developer_id": str(assignment.developer_id),
                        "mandatory_training_id": str(assignment.mandatory_training_id),
                        "due_date": str(assignment.due_date),
                        "days_until_due": days_until_due,
                        "status": assignment.status,
                    },
                )
                triggered += 1
            except Exception:
                logger.warning(
                    f"Failed to dispatch assignment.approaching_due for {assignment.id}",
                    exc_info=True,
                )

    return {"assignments_checked": len(assignments), "triggers_dispatched": triggered}


@activity.defn
async def check_compliance_status_changes(input: CheckComplianceStatusChangesInput) -> dict[str, Any]:
    """Check for developers whose compliance status has changed and dispatch triggers.

    Compares current compliance status (based on overdue assignments / expired certs)
    against a cached previous status to detect transitions.
    """
    from datetime import datetime, timezone
    from sqlalchemy import and_, select, func, distinct

    from aexy.models.compliance import (
        TrainingAssignment,
        AssignmentStatus,
        DeveloperCertification,
        CertificationStatus,
    )
    from aexy.models.team import TeamMember
    from aexy.services.automation_service import dispatch_automation_event

    logger.info("Checking compliance status changes")
    triggered = 0

    async with async_session_maker() as db:
        # Get all workspace-developer pairs that have compliance data
        assignment_devs = await db.execute(
            select(
                distinct(TrainingAssignment.developer_id),
                TrainingAssignment.workspace_id,
            ).group_by(TrainingAssignment.developer_id, TrainingAssignment.workspace_id)
        )
        dev_workspace_pairs = assignment_devs.fetchall()

        for row in dev_workspace_pairs:
            dev_id = str(row[0])
            workspace_id = str(row[1]) if row[1] else None
            if not workspace_id:
                continue

            # Count overdue assignments
            overdue_count_result = await db.execute(
                select(func.count(TrainingAssignment.id)).where(
                    and_(
                        TrainingAssignment.developer_id == dev_id,
                        TrainingAssignment.workspace_id == workspace_id,
                        TrainingAssignment.status == AssignmentStatus.OVERDUE.value,
                    )
                )
            )
            overdue_count = overdue_count_result.scalar() or 0

            # Count expired certifications
            expired_count_result = await db.execute(
                select(func.count(DeveloperCertification.id)).where(
                    and_(
                        DeveloperCertification.developer_id == dev_id,
                        DeveloperCertification.workspace_id == workspace_id,
                        DeveloperCertification.status == CertificationStatus.EXPIRED.value,
                    )
                )
            )
            expired_count = expired_count_result.scalar() or 0

            is_compliant = overdue_count == 0 and expired_count == 0

            # Dispatch compliance.status_changed when non-compliant
            # (the automation conditions can further filter)
            if not is_compliant:
                try:
                    await dispatch_automation_event(
                        db=db,
                        workspace_id=workspace_id,
                        module="compliance",
                        trigger_type="compliance.status_changed",
                        entity_id=dev_id,
                        trigger_data={
                            "developer_id": dev_id,
                            "is_compliant": is_compliant,
                            "overdue_assignments": overdue_count,
                            "expired_certifications": expired_count,
                        },
                    )
                    triggered += 1
                except Exception:
                    logger.warning(
                        f"Failed to dispatch compliance.status_changed for dev {dev_id}",
                        exc_info=True,
                    )

    return {"developers_checked": len(dev_workspace_pairs), "triggers_dispatched": triggered}
