"""Service for multi-channel outreach sequences — CRUD, enrollment, step execution, analytics."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_outreach import (
    OutreachSequence,
    OutreachEnrollment,
    OutreachStepExecution,
    SequenceStatus,
    EnrollmentStatus,
    StepExecutionStatus,
)
from aexy.services.gtm_compliance_service import GTMComplianceService

logger = logging.getLogger(__name__)


class OutreachSequenceService:
    """Service for multi-channel outreach sequence operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # SEQUENCE CRUD
    # =========================================================================

    async def create_sequence(
        self,
        workspace_id: str,
        name: str,
        description: str | None = None,
        steps: list | None = None,
        settings: dict | None = None,
        channels: list | None = None,
        created_by: str | None = None,
    ) -> OutreachSequence:
        """Create a new outreach sequence in draft status."""
        sequence = OutreachSequence(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            steps=steps or [],
            settings=settings or {},
            channels=channels or [],
            created_by=created_by,
            status=SequenceStatus.DRAFT.value,
        )
        self.db.add(sequence)
        await self.db.flush()
        logger.info(f"Created outreach sequence {sequence.id} in workspace {workspace_id}")
        return sequence

    async def update_sequence(
        self,
        workspace_id: str,
        sequence_id: str,
        **kwargs,
    ) -> OutreachSequence:
        """Update an existing outreach sequence.

        Only allows updates when sequence is in draft or paused status.
        """
        sequence = await self.get_sequence(workspace_id, sequence_id)
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")

        if sequence.status not in (SequenceStatus.DRAFT.value, SequenceStatus.PAUSED.value):
            raise ValueError(
                f"Cannot update sequence in {sequence.status} status. "
                "Pause the sequence first."
            )

        allowed_fields = {
            "name", "description", "steps", "settings", "channels", "status",
        }
        for key, value in kwargs.items():
            if key in allowed_fields:
                setattr(sequence, key, value)

        await self.db.flush()
        logger.info(f"Updated outreach sequence {sequence_id}")
        return sequence

    async def get_sequence(
        self,
        workspace_id: str,
        sequence_id: str,
    ) -> OutreachSequence | None:
        """Get a single outreach sequence by ID."""
        result = await self.db.execute(
            select(OutreachSequence).where(
                and_(
                    OutreachSequence.workspace_id == workspace_id,
                    OutreachSequence.id == sequence_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_sequences(
        self,
        workspace_id: str,
        status: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[OutreachSequence], int]:
        """List outreach sequences with pagination and optional status filter.

        Returns:
            Tuple of (sequences, total_count).
        """
        conditions = [OutreachSequence.workspace_id == workspace_id]
        if status:
            conditions.append(OutreachSequence.status == status)

        # Count
        count_query = select(func.count(OutreachSequence.id)).where(and_(*conditions))
        total = (await self.db.execute(count_query)).scalar() or 0

        # Fetch page
        query = (
            select(OutreachSequence)
            .where(and_(*conditions))
            .order_by(OutreachSequence.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await self.db.execute(query)
        sequences = list(result.scalars().all())

        return sequences, total

    async def delete_sequence(
        self,
        workspace_id: str,
        sequence_id: str,
    ) -> bool:
        """Delete a sequence. Only allowed if status is draft or archived."""
        sequence = await self.get_sequence(workspace_id, sequence_id)
        if not sequence:
            return False

        if sequence.status not in (SequenceStatus.DRAFT.value, SequenceStatus.ARCHIVED.value):
            raise ValueError(
                f"Cannot delete sequence in {sequence.status} status. "
                "Archive the sequence first."
            )

        await self.db.delete(sequence)
        await self.db.flush()
        logger.info(f"Deleted outreach sequence {sequence_id}")
        return True

    async def activate_sequence(
        self,
        workspace_id: str,
        sequence_id: str,
    ) -> OutreachSequence:
        """Activate a sequence. Validates that it has at least one step."""
        sequence = await self.get_sequence(workspace_id, sequence_id)
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")

        if sequence.status not in (SequenceStatus.DRAFT.value, SequenceStatus.PAUSED.value):
            raise ValueError(
                f"Cannot activate sequence in {sequence.status} status."
            )

        if not sequence.steps or len(sequence.steps) == 0:
            raise ValueError("Cannot activate a sequence with no steps.")

        sequence.status = SequenceStatus.ACTIVE.value
        await self.db.flush()
        logger.info(f"Activated outreach sequence {sequence_id}")
        return sequence

    async def pause_sequence(
        self,
        workspace_id: str,
        sequence_id: str,
    ) -> OutreachSequence:
        """Pause a sequence and all its active enrollments."""
        sequence = await self.get_sequence(workspace_id, sequence_id)
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")

        if sequence.status != SequenceStatus.ACTIVE.value:
            raise ValueError(
                f"Cannot pause sequence in {sequence.status} status."
            )

        sequence.status = SequenceStatus.PAUSED.value

        # Pause all active enrollments and signal their Temporal workflows
        active_enrollments = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.sequence_id == sequence_id,
                    OutreachEnrollment.status == EnrollmentStatus.ACTIVE.value,
                )
            )
        )).scalars().all()

        from aexy.temporal.client import get_temporal_client
        client = await get_temporal_client()

        for enrollment in active_enrollments:
            enrollment.status = EnrollmentStatus.PAUSED.value
            if enrollment.temporal_workflow_id:
                try:
                    handle = client.get_workflow_handle(enrollment.temporal_workflow_id)
                    await handle.signal("pause")
                except Exception:
                    logger.exception(
                        f"Failed to signal pause for enrollment {enrollment.id}"
                    )

        await self.db.flush()
        logger.info(
            f"Paused outreach sequence {sequence_id} "
            f"({len(active_enrollments)} enrollments paused)"
        )
        return sequence

    # =========================================================================
    # ENROLLMENT MANAGEMENT
    # =========================================================================

    async def enroll_contact(
        self,
        workspace_id: str,
        sequence_id: str,
        record_id: str,
        email: str,
        contact_name: str | None = None,
    ) -> OutreachEnrollment:
        """Enroll a contact into a sequence.

        Validates:
        - Sequence is active
        - Contact is not already enrolled
        - Compliance check passes (suppression list, consent, etc.)
        """
        # Validate sequence is active
        sequence = await self.get_sequence(workspace_id, sequence_id)
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")
        if sequence.status != SequenceStatus.ACTIVE.value:
            raise ValueError(
                f"Cannot enroll in sequence with status {sequence.status}. "
                "Sequence must be active."
            )

        # Check not already enrolled (active or paused)
        existing = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.sequence_id == sequence_id,
                    OutreachEnrollment.record_id == record_id,
                    OutreachEnrollment.status.in_([
                        EnrollmentStatus.ACTIVE.value,
                        EnrollmentStatus.PAUSED.value,
                    ]),
                )
            )
        )).scalar_one_or_none()
        if existing:
            raise ValueError(
                f"Contact {record_id} is already enrolled in sequence {sequence_id}"
            )

        # Compliance check
        compliance = GTMComplianceService(self.db)
        permission = await compliance.check_send_permission(workspace_id, email, record_id)
        if not permission.get("allowed"):
            raise ValueError(
                f"Compliance check failed: {permission.get('reason', 'Unknown reason')}"
            )

        # Create enrollment
        enrollment = OutreachEnrollment(
            id=str(uuid4()),
            workspace_id=workspace_id,
            sequence_id=sequence_id,
            record_id=record_id,
            email=email,
            contact_name=contact_name,
            status=EnrollmentStatus.ACTIVE.value,
            current_step_index=0,
        )
        self.db.add(enrollment)
        await self.db.flush()

        # Start Temporal workflow
        from aexy.temporal.client import get_temporal_client
        from aexy.temporal.activities.gtm import OutreachEnrollmentInput
        from aexy.temporal.task_queues import TaskQueue

        client = await get_temporal_client()
        wf_id = f"outreach-{enrollment.id}"
        await client.start_workflow(
            "OutreachSequenceWorkflow",
            OutreachEnrollmentInput(
                enrollment_id=enrollment.id,
                workspace_id=workspace_id,
                sequence_id=sequence_id,
                steps=sequence.steps,
            ),
            id=wf_id,
            task_queue=TaskQueue.WORKFLOWS,
        )
        enrollment.temporal_workflow_id = wf_id
        await self.db.flush()

        # Update sequence stats
        sequence.enrolled_count += 1
        sequence.active_count += 1
        await self.db.flush()

        logger.info(
            f"Enrolled contact {record_id} ({email}) in sequence {sequence_id}, "
            f"workflow {wf_id}"
        )
        return enrollment

    async def unenroll_contact(
        self,
        workspace_id: str,
        enrollment_id: str,
    ) -> bool:
        """Unenroll a contact from a sequence by signaling the Temporal workflow to exit."""
        enrollment = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.id == enrollment_id,
                )
            )
        )).scalar_one_or_none()

        if not enrollment:
            return False

        if enrollment.status not in (
            EnrollmentStatus.ACTIVE.value,
            EnrollmentStatus.PAUSED.value,
        ):
            return False

        if enrollment.temporal_workflow_id:
            try:
                from aexy.temporal.client import get_temporal_client
                client = await get_temporal_client()
                handle = client.get_workflow_handle(enrollment.temporal_workflow_id)
                await handle.signal("exit_sequence")
            except Exception:
                logger.exception(
                    f"Failed to signal exit for enrollment {enrollment_id}"
                )

        enrollment.status = EnrollmentStatus.EXITED.value
        enrollment.exit_reason = "manual_unenroll"
        enrollment.completed_at = datetime.now(timezone.utc)
        await self.db.flush()
        logger.info(f"Unenrolled contact from enrollment {enrollment_id}")
        return True

    async def pause_enrollment(
        self,
        workspace_id: str,
        enrollment_id: str,
    ) -> bool:
        """Pause an individual enrollment."""
        enrollment = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.id == enrollment_id,
                    OutreachEnrollment.status == EnrollmentStatus.ACTIVE.value,
                )
            )
        )).scalar_one_or_none()

        if not enrollment:
            return False

        enrollment.status = EnrollmentStatus.PAUSED.value

        if enrollment.temporal_workflow_id:
            try:
                from aexy.temporal.client import get_temporal_client
                client = await get_temporal_client()
                handle = client.get_workflow_handle(enrollment.temporal_workflow_id)
                await handle.signal("pause")
            except Exception:
                logger.exception(
                    f"Failed to signal pause for enrollment {enrollment_id}"
                )

        await self.db.flush()
        logger.info(f"Paused enrollment {enrollment_id}")
        return True

    async def resume_enrollment(
        self,
        workspace_id: str,
        enrollment_id: str,
    ) -> bool:
        """Resume a paused enrollment."""
        enrollment = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.id == enrollment_id,
                    OutreachEnrollment.status == EnrollmentStatus.PAUSED.value,
                )
            )
        )).scalar_one_or_none()

        if not enrollment:
            return False

        enrollment.status = EnrollmentStatus.ACTIVE.value

        if enrollment.temporal_workflow_id:
            try:
                from aexy.temporal.client import get_temporal_client
                client = await get_temporal_client()
                handle = client.get_workflow_handle(enrollment.temporal_workflow_id)
                await handle.signal("resume")
            except Exception:
                logger.exception(
                    f"Failed to signal resume for enrollment {enrollment_id}"
                )

        await self.db.flush()
        logger.info(f"Resumed enrollment {enrollment_id}")
        return True

    async def list_enrollments(
        self,
        workspace_id: str,
        sequence_id: str,
        status: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[OutreachEnrollment], int]:
        """List enrollments for a sequence with pagination.

        Returns:
            Tuple of (enrollments, total_count).
        """
        conditions = [
            OutreachEnrollment.workspace_id == workspace_id,
            OutreachEnrollment.sequence_id == sequence_id,
        ]
        if status:
            conditions.append(OutreachEnrollment.status == status)

        count_query = select(func.count(OutreachEnrollment.id)).where(and_(*conditions))
        total = (await self.db.execute(count_query)).scalar() or 0

        query = (
            select(OutreachEnrollment)
            .where(and_(*conditions))
            .order_by(OutreachEnrollment.enrolled_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await self.db.execute(query)
        enrollments = list(result.scalars().all())

        return enrollments, total

    _MAX_BULK_ENROLL = 500

    async def bulk_enroll(
        self,
        workspace_id: str,
        sequence_id: str,
        contacts: list[dict],
    ) -> dict:
        """Bulk enroll multiple contacts into a sequence.

        Each contact dict must have: record_id, email, and optionally contact_name.
        Maximum batch size is 500 contacts.

        Returns:
            dict with enrolled, skipped, and failed counts plus details.
        """
        if len(contacts) > self._MAX_BULK_ENROLL:
            raise ValueError(
                f"Batch size {len(contacts)} exceeds maximum of {self._MAX_BULK_ENROLL}. "
                f"Split into smaller batches."
            )

        enrolled = 0
        skipped = 0
        failed = 0
        errors: list[dict] = []

        for contact in contacts:
            record_id = contact.get("record_id")
            email = contact.get("email")
            contact_name = contact.get("contact_name")

            if not record_id or not email:
                failed += 1
                errors.append({
                    "record_id": record_id,
                    "email": email,
                    "reason": "Missing record_id or email",
                })
                continue

            try:
                await self.enroll_contact(
                    workspace_id=workspace_id,
                    sequence_id=sequence_id,
                    record_id=record_id,
                    email=email,
                    contact_name=contact_name,
                )
                enrolled += 1
            except ValueError as e:
                reason = str(e)
                if "already enrolled" in reason.lower():
                    skipped += 1
                else:
                    failed += 1
                errors.append({
                    "record_id": record_id,
                    "email": email,
                    "reason": reason,
                })
            except Exception as e:
                failed += 1
                errors.append({
                    "record_id": record_id,
                    "email": email,
                    "reason": str(e),
                })

        return {
            "enrolled": enrolled,
            "skipped": skipped,
            "failed": failed,
            "errors": errors,
        }

    # =========================================================================
    # STEP EXECUTION
    # =========================================================================

    async def record_step_execution(
        self,
        enrollment_id: str,
        step_index: int,
        channel: str,
        action: str,
        workspace_id: str | None = None,
    ) -> OutreachStepExecution:
        """Create a step execution record."""
        # Get workspace_id from enrollment, with optional workspace_id for auth
        filters = [OutreachEnrollment.id == enrollment_id]
        if workspace_id:
            filters.append(OutreachEnrollment.workspace_id == workspace_id)
        enrollment = (await self.db.execute(
            select(OutreachEnrollment).where(and_(*filters))
        )).scalar_one_or_none()

        if not enrollment:
            raise ValueError(f"Enrollment {enrollment_id} not found")

        execution = OutreachStepExecution(
            id=str(uuid4()),
            enrollment_id=enrollment_id,
            workspace_id=enrollment.workspace_id,
            step_index=step_index,
            channel=channel,
            action=action,
            status=StepExecutionStatus.PENDING.value,
        )
        self.db.add(execution)
        await self.db.flush()
        return execution

    async def update_step_status(
        self,
        execution_id: str,
        status: str,
        workspace_id: str | None = None,
        **timestamps,
    ) -> OutreachStepExecution:
        """Update a step execution status and optional timestamps.

        Accepted timestamp kwargs: sent_at, delivered_at, opened_at, clicked_at, replied_at.
        Also accepts: provider_message_id, error_message.
        """
        filters = [OutreachStepExecution.id == execution_id]
        if workspace_id:
            filters.append(OutreachStepExecution.workspace_id == workspace_id)
        execution = (await self.db.execute(
            select(OutreachStepExecution).where(and_(*filters))
        )).scalar_one_or_none()

        if not execution:
            raise ValueError(f"Step execution {execution_id} not found")

        execution.status = status

        allowed_fields = {
            "sent_at", "delivered_at", "opened_at", "clicked_at", "replied_at",
            "provider_message_id", "error_message",
        }
        for key, value in timestamps.items():
            if key in allowed_fields:
                setattr(execution, key, value)

        await self.db.flush()
        return execution

    async def get_enrollment_timeline(
        self,
        workspace_id: str,
        enrollment_id: str,
    ) -> list[OutreachStepExecution]:
        """Get all step executions for an enrollment, ordered by step index."""
        result = await self.db.execute(
            select(OutreachStepExecution)
            .where(
                OutreachStepExecution.enrollment_id == enrollment_id,
                OutreachStepExecution.workspace_id == workspace_id,
            )
            .order_by(OutreachStepExecution.step_index.asc(), OutreachStepExecution.created_at.asc())
        )
        return list(result.scalars().all())

    # =========================================================================
    # ANALYTICS
    # =========================================================================

    async def get_sequence_analytics(
        self,
        workspace_id: str,
        sequence_id: str,
    ) -> dict:
        """Get per-step analytics for a sequence (open/click/reply rates).

        Returns:
            dict with per_step list and overall totals.
        """
        sequence = await self.get_sequence(workspace_id, sequence_id)
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")

        # Get all step executions for this sequence via enrollments
        enrollment_ids_query = select(OutreachEnrollment.id).where(
            and_(
                OutreachEnrollment.workspace_id == workspace_id,
                OutreachEnrollment.sequence_id == sequence_id,
            )
        )

        executions = (await self.db.execute(
            select(OutreachStepExecution).where(
                OutreachStepExecution.enrollment_id.in_(enrollment_ids_query)
            )
        )).scalars().all()

        # Group by step_index
        step_stats: dict[int, dict] = {}
        for ex in executions:
            if ex.step_index not in step_stats:
                step_stats[ex.step_index] = {
                    "step_index": ex.step_index,
                    "channel": ex.channel,
                    "action": ex.action,
                    "total": 0,
                    "sent": 0,
                    "delivered": 0,
                    "opened": 0,
                    "clicked": 0,
                    "replied": 0,
                    "bounced": 0,
                    "failed": 0,
                }

            stats = step_stats[ex.step_index]
            stats["total"] += 1

            if ex.status in (
                StepExecutionStatus.SENT.value,
                StepExecutionStatus.DELIVERED.value,
                StepExecutionStatus.OPENED.value,
                StepExecutionStatus.CLICKED.value,
                StepExecutionStatus.REPLIED.value,
            ):
                stats["sent"] += 1
            if ex.delivered_at:
                stats["delivered"] += 1
            if ex.opened_at:
                stats["opened"] += 1
            if ex.clicked_at:
                stats["clicked"] += 1
            if ex.replied_at:
                stats["replied"] += 1
            if ex.status == StepExecutionStatus.BOUNCED.value:
                stats["bounced"] += 1
            if ex.status == StepExecutionStatus.FAILED.value:
                stats["failed"] += 1

        # Calculate rates
        per_step = []
        for idx in sorted(step_stats.keys()):
            s = step_stats[idx]
            sent = s["sent"] or 1  # avoid division by zero
            s["open_rate"] = round(s["opened"] / sent * 100, 1)
            s["click_rate"] = round(s["clicked"] / sent * 100, 1)
            s["reply_rate"] = round(s["replied"] / sent * 100, 1)
            s["bounce_rate"] = round(s["bounced"] / s["total"] * 100, 1) if s["total"] else 0
            per_step.append(s)

        # Overall totals
        total_sent = sum(s["sent"] for s in step_stats.values())
        total_opened = sum(s["opened"] for s in step_stats.values())
        total_clicked = sum(s["clicked"] for s in step_stats.values())
        total_replied = sum(s["replied"] for s in step_stats.values())

        overall_sent = total_sent or 1
        return {
            "sequence_id": sequence_id,
            "enrolled_count": sequence.enrolled_count,
            "active_count": sequence.active_count,
            "completed_count": sequence.completed_count,
            "replied_count": sequence.replied_count,
            "bounced_count": sequence.bounced_count,
            "overall": {
                "total_sent": total_sent,
                "total_opened": total_opened,
                "total_clicked": total_clicked,
                "total_replied": total_replied,
                "open_rate": round(total_opened / overall_sent * 100, 1),
                "click_rate": round(total_clicked / overall_sent * 100, 1),
                "reply_rate": round(total_replied / overall_sent * 100, 1),
            },
            "per_step": per_step,
        }

    async def update_sequence_stats(
        self,
        sequence_id: str,
        workspace_id: str | None = None,
    ) -> None:
        """Recount denormalized stats on the sequence from enrollment data."""
        filters = [OutreachEnrollment.sequence_id == sequence_id]
        if workspace_id:
            filters.append(OutreachEnrollment.workspace_id == workspace_id)
        result = await self.db.execute(
            select(
                OutreachEnrollment.status,
                func.count(OutreachEnrollment.id),
            )
            .where(and_(*filters))
            .group_by(OutreachEnrollment.status)
        )
        counts = {row[0]: row[1] for row in result.all()}

        total_enrolled = sum(counts.values())
        active = counts.get(EnrollmentStatus.ACTIVE.value, 0)
        completed = counts.get(EnrollmentStatus.COMPLETED.value, 0)
        replied = counts.get(EnrollmentStatus.REPLIED.value, 0)
        bounced = counts.get(EnrollmentStatus.BOUNCED.value, 0)

        await self.db.execute(
            update(OutreachSequence)
            .where(OutreachSequence.id == sequence_id)
            .values(
                enrolled_count=total_enrolled,
                active_count=active,
                completed_count=completed,
                replied_count=replied,
                bounced_count=bounced,
            )
        )
        await self.db.flush()
        logger.info(f"Updated stats for sequence {sequence_id}: {counts}")
