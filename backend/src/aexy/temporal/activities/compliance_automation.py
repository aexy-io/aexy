"""Temporal scheduled detection activities for the compliance automation module.

These activities run on a schedule and emit automation events for detection-based
triggers like approaching due dates, overdue assignments, expiring certifications, etc.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# Input dataclasses
# =============================================================================

@dataclass
class CheckApproachingDueInput:
    pass


@dataclass
class CheckOverdueAssignmentsInput:
    pass


@dataclass
class CheckExpiringCertsInput:
    pass


@dataclass
class CheckExpiredCertsInput:
    pass


@dataclass
class CheckBulkComplianceInput:
    pass


# =============================================================================
# Helper: iterate active workspaces
# =============================================================================

async def _get_active_workspace_ids(db) -> list[str]:
    """Return IDs of all active workspaces."""
    from sqlalchemy import select
    from aexy.models.workspace import Workspace

    result = await db.execute(
        select(Workspace.id).where(Workspace.is_active.is_(True))
    )
    return [r[0] for r in result.all()]


# =============================================================================
# Activities
# =============================================================================

@activity.defn
async def check_approaching_due_assignments(input: CheckApproachingDueInput) -> dict[str, Any]:
    """Find assignments approaching their due date at configured milestones.

    Uses reminder_sent_at for deduplication. Emits assignment.approaching_due.
    """
    logger.info("Running check_approaching_due_assignments")

    from sqlalchemy import select, and_
    from aexy.models.compliance import TrainingAssignment, AssignmentStatus
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_compliance_config

    total_events = 0
    now = datetime.now(timezone.utc)
    today = date.today()

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_compliance_config(db, ws_id)
            milestone_days = config["approaching_due_days"]

            # Find non-completed assignments with a due date
            assignments_q = await db.execute(
                select(TrainingAssignment).where(
                    and_(
                        TrainingAssignment.workspace_id == ws_id,
                        TrainingAssignment.status.in_([
                            AssignmentStatus.PENDING.value,
                            AssignmentStatus.IN_PROGRESS.value,
                        ]),
                        TrainingAssignment.due_date.isnot(None),
                    )
                )
            )

            for assignment in assignments_q.scalars().all():
                days_until = (assignment.due_date.date() - today).days if hasattr(assignment.due_date, 'date') else (assignment.due_date - today).days

                # Check if days_until matches a milestone
                if days_until not in milestone_days:
                    continue

                # Dedup: skip if reminder already sent in last 24h
                if assignment.reminder_sent_at:
                    hours_since = (now - assignment.reminder_sent_at).total_seconds() / 3600
                    if hours_since < 24:
                        continue

                await dispatch_automation_event(
                    db=db, workspace_id=ws_id, module="compliance",
                    trigger_type="assignment.approaching_due",
                    entity_id=assignment.id,
                    trigger_data={
                        "assignment_id": assignment.id,
                        "developer_id": assignment.developer_id,
                        "training_id": assignment.mandatory_training_id,
                        "due_date": str(assignment.due_date),
                        "days_until_due": days_until,
                    },
                )

                # Update dedup timestamp
                assignment.reminder_sent_at = now
                total_events += 1

            await db.commit()

    logger.info(f"check_approaching_due_assignments emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_overdue_assignments(input: CheckOverdueAssignmentsInput) -> dict[str, Any]:
    """Find assignments past their due date.

    Updates status to OVERDUE and emits assignment.overdue.
    """
    logger.info("Running check_overdue_assignments")

    from sqlalchemy import select, and_
    from aexy.models.compliance import TrainingAssignment, AssignmentStatus
    from aexy.services.automation_service import dispatch_automation_event

    total_events = 0
    now = datetime.now(timezone.utc)

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            overdue_q = await db.execute(
                select(TrainingAssignment).where(
                    and_(
                        TrainingAssignment.workspace_id == ws_id,
                        TrainingAssignment.status.in_([
                            AssignmentStatus.PENDING.value,
                            AssignmentStatus.IN_PROGRESS.value,
                        ]),
                        TrainingAssignment.due_date < now,
                    )
                )
            )

            for assignment in overdue_q.scalars().all():
                assignment.status = AssignmentStatus.OVERDUE.value

                await dispatch_automation_event(
                    db=db, workspace_id=ws_id, module="compliance",
                    trigger_type="assignment.overdue",
                    entity_id=assignment.id,
                    trigger_data={
                        "assignment_id": assignment.id,
                        "developer_id": assignment.developer_id,
                        "training_id": assignment.mandatory_training_id,
                        "due_date": str(assignment.due_date),
                        "days_overdue": (now.date() - assignment.due_date.date()).days
                        if hasattr(assignment.due_date, 'date') else 0,
                    },
                )
                total_events += 1

            await db.commit()

    logger.info(f"check_overdue_assignments emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_expiring_certifications(input: CheckExpiringCertsInput) -> dict[str, Any]:
    """Find certifications approaching expiry at configured milestones.

    Uses renewal_reminder_sent_at for deduplication. Emits certification.expiring.
    """
    logger.info("Running check_expiring_certifications")

    from sqlalchemy import select, and_
    from aexy.models.compliance import DeveloperCertification, CertificationStatus
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_compliance_config

    total_events = 0
    now = datetime.now(timezone.utc)
    today = date.today()

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_compliance_config(db, ws_id)
            milestone_days = config["certification_expiring_days"]

            certs_q = await db.execute(
                select(DeveloperCertification).where(
                    and_(
                        DeveloperCertification.workspace_id == ws_id,
                        DeveloperCertification.status.in_([
                            CertificationStatus.ACTIVE.value,
                            CertificationStatus.EXPIRING_SOON.value,
                        ]),
                        DeveloperCertification.expiry_date.isnot(None),
                    )
                )
            )

            for cert in certs_q.scalars().all():
                days_until = (cert.expiry_date.date() - today).days if hasattr(cert.expiry_date, 'date') else 0

                if days_until not in milestone_days:
                    continue

                # Dedup: skip if reminder sent in last 24h
                if cert.renewal_reminder_sent_at:
                    hours_since = (now - cert.renewal_reminder_sent_at).total_seconds() / 3600
                    if hours_since < 24:
                        continue

                await dispatch_automation_event(
                    db=db, workspace_id=ws_id, module="compliance",
                    trigger_type="certification.expiring",
                    entity_id=cert.id,
                    trigger_data={
                        "developer_id": cert.developer_id,
                        "certification_id": cert.certification_id,
                        "expiry_date": str(cert.expiry_date),
                        "days_until_expiry": days_until,
                    },
                )

                cert.renewal_reminder_sent_at = now
                total_events += 1

            await db.commit()

    logger.info(f"check_expiring_certifications emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_expired_certifications(input: CheckExpiredCertsInput) -> dict[str, Any]:
    """Find newly expired certifications.

    Updates status and emits certification.expired.
    """
    logger.info("Running check_expired_certifications")

    from sqlalchemy import select, and_
    from aexy.models.compliance import DeveloperCertification, CertificationStatus
    from aexy.services.automation_service import dispatch_automation_event

    total_events = 0
    now = datetime.now(timezone.utc)

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            expired_q = await db.execute(
                select(DeveloperCertification).where(
                    and_(
                        DeveloperCertification.workspace_id == ws_id,
                        DeveloperCertification.status.in_([
                            CertificationStatus.ACTIVE.value,
                            CertificationStatus.EXPIRING_SOON.value,
                        ]),
                        DeveloperCertification.expiry_date < now,
                    )
                )
            )

            for cert in expired_q.scalars().all():
                cert.status = CertificationStatus.EXPIRED.value

                await dispatch_automation_event(
                    db=db, workspace_id=ws_id, module="compliance",
                    trigger_type="certification.expired",
                    entity_id=cert.id,
                    trigger_data={
                        "developer_id": cert.developer_id,
                        "certification_id": cert.certification_id,
                        "expiry_date": str(cert.expiry_date),
                    },
                )
                total_events += 1

            await db.commit()

    logger.info(f"check_expired_certifications emitted {total_events} events")
    return {"events_emitted": total_events}


@activity.defn
async def check_bulk_compliance_rates(input: CheckBulkComplianceInput) -> dict[str, Any]:
    """Per team: check overdue/total assignment ratio.

    Emits training.bulk_overdue when compliance rate falls below threshold.
    """
    logger.info("Running check_bulk_compliance_rates")

    from sqlalchemy import select, func, and_, case
    from aexy.models.compliance import TrainingAssignment, AssignmentStatus
    from aexy.models.team import Team, TeamMember
    from aexy.services.automation_service import dispatch_automation_event
    from aexy.services.tracking_compliance_config import get_compliance_config

    total_events = 0

    async with async_session_maker() as db:
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            config = await get_compliance_config(db, ws_id)
            threshold = config["bulk_overdue_threshold"]

            teams_q = await db.execute(
                select(Team).where(Team.workspace_id == ws_id)
            )

            for team in teams_q.scalars().all():
                # Get member IDs
                members_q = await db.execute(
                    select(TeamMember.developer_id).where(
                        TeamMember.team_id == team.id
                    )
                )
                member_ids = [r[0] for r in members_q.all()]
                if not member_ids:
                    continue

                # Count assignments for these members
                stats_q = await db.execute(
                    select(
                        func.count(TrainingAssignment.id).label("total"),
                        func.count(
                            case(
                                (TrainingAssignment.status == AssignmentStatus.OVERDUE.value, 1),
                            )
                        ).label("overdue"),
                    ).where(
                        and_(
                            TrainingAssignment.workspace_id == ws_id,
                            TrainingAssignment.developer_id.in_(member_ids),
                        )
                    )
                )
                row = stats_q.one_or_none()
                if not row or row.total == 0:
                    continue

                overdue_rate = row.overdue / row.total
                if overdue_rate >= threshold:
                    await dispatch_automation_event(
                        db=db, workspace_id=ws_id, module="compliance",
                        trigger_type="training.bulk_overdue",
                        entity_id=team.id,
                        trigger_data={
                            "team_id": team.id,
                            "team_name": team.name or "",
                            "total_assignments": row.total,
                            "overdue_assignments": row.overdue,
                            "overdue_rate": round(overdue_rate, 2),
                            "threshold": threshold,
                        },
                    )
                    total_events += 1

    logger.info(f"check_bulk_compliance_rates emitted {total_events} events")
    return {"events_emitted": total_events}
