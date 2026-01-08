"""CRM Automation service for managing and executing automation workflows."""

import asyncio
import httpx
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.crm import (
    CRMAutomation,
    CRMAutomationRun,
    CRMRecord,
    CRMSequence,
    CRMSequenceStep,
    CRMSequenceEnrollment,
    CRMWebhook,
    CRMWebhookDelivery,
    CRMActivity,
    CRMList,
    CRMListEntry,
    CRMSequenceEnrollmentStatus,
)
from aexy.services.crm_service import CRMRecordService, CRMActivityService


class CRMAutomationService:
    """Service for CRM automation CRUD and execution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # AUTOMATION CRUD
    # =========================================================================

    async def create_automation(
        self,
        workspace_id: str,
        name: str,
        trigger_type: str,
        trigger_config: dict,
        actions: list[dict],
        object_id: str | None = None,
        description: str | None = None,
        conditions: list[dict] | None = None,
        error_handling: str = "stop",
        run_limit_per_month: int | None = None,
        is_active: bool = True,
        created_by_id: str | None = None,
    ) -> CRMAutomation:
        """Create a new automation."""
        automation = CRMAutomation(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            object_id=object_id,
            trigger_type=trigger_type,
            trigger_config=trigger_config,
            conditions=conditions or [],
            actions=actions,
            error_handling=error_handling,
            is_active=is_active,
            run_limit_per_month=run_limit_per_month,
            created_by_id=created_by_id,
        )
        self.db.add(automation)
        await self.db.flush()
        await self.db.refresh(automation)
        return automation

    async def get_automation(self, automation_id: str) -> CRMAutomation | None:
        """Get an automation by ID."""
        stmt = select(CRMAutomation).where(CRMAutomation.id == automation_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_automations(
        self,
        workspace_id: str,
        object_id: str | None = None,
        is_active: bool | None = None,
    ) -> list[CRMAutomation]:
        """List automations in a workspace."""
        stmt = select(CRMAutomation).where(CRMAutomation.workspace_id == workspace_id)

        if object_id:
            stmt = stmt.where(CRMAutomation.object_id == object_id)
        if is_active is not None:
            stmt = stmt.where(CRMAutomation.is_active == is_active)

        stmt = stmt.order_by(CRMAutomation.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_automation(
        self,
        automation_id: str,
        **kwargs,
    ) -> CRMAutomation | None:
        """Update an automation."""
        automation = await self.get_automation(automation_id)
        if not automation:
            return None

        for key, value in kwargs.items():
            if value is not None and hasattr(automation, key):
                setattr(automation, key, value)

        await self.db.flush()
        await self.db.refresh(automation)
        return automation

    async def delete_automation(self, automation_id: str) -> bool:
        """Delete an automation."""
        automation = await self.get_automation(automation_id)
        if not automation:
            return False

        await self.db.delete(automation)
        await self.db.flush()
        return True

    # =========================================================================
    # AUTOMATION EXECUTION
    # =========================================================================

    async def process_trigger(
        self,
        workspace_id: str,
        object_id: str,
        trigger_type: str,
        record_id: str | None = None,
        trigger_data: dict | None = None,
    ) -> list[CRMAutomationRun]:
        """Process a trigger event and run all matching automations."""
        # Find all active automations matching this trigger
        stmt = select(CRMAutomation).where(
            CRMAutomation.workspace_id == workspace_id,
            CRMAutomation.object_id == object_id,
            CRMAutomation.trigger_type == trigger_type,
            CRMAutomation.is_active == True,
        )
        result = await self.db.execute(stmt)
        automations = list(result.scalars().all())

        runs = []
        for automation in automations:
            # Check trigger config to see if this specific trigger matches
            trigger_config = automation.trigger_config or {}

            # For field_changed trigger, check if the specific field matches
            if trigger_type == "field_changed":
                watched_field = trigger_config.get("field")
                changed_field = (trigger_data or {}).get("changed_field")
                if watched_field and watched_field != changed_field:
                    continue

            # For stage_changed trigger, check if stages match
            if trigger_type == "stage_changed":
                from_stage = trigger_config.get("from_stage")
                to_stage = trigger_config.get("to_stage")
                actual_old = (trigger_data or {}).get("old_stage")
                actual_new = (trigger_data or {}).get("new_stage")

                if from_stage and from_stage != actual_old:
                    continue
                if to_stage and to_stage != actual_new:
                    continue

            try:
                run = await self.trigger_automation(
                    automation_id=automation.id,
                    record_id=record_id,
                    trigger_data=trigger_data,
                )
                runs.append(run)
            except ValueError:
                # Skip if automation can't run (limit exceeded, etc.)
                continue

        return runs

    async def trigger_automation(
        self,
        automation_id: str,
        record_id: str | None = None,
        trigger_data: dict | None = None,
    ) -> CRMAutomationRun:
        """Trigger an automation execution."""
        automation = await self.get_automation(automation_id)
        if not automation:
            raise ValueError("Automation not found")

        if not automation.is_active:
            raise ValueError("Automation is not active")

        # Check run limit
        if automation.run_limit_per_month:
            if automation.runs_this_month >= automation.run_limit_per_month:
                raise ValueError("Automation run limit exceeded for this month")

        # Create run record
        run = CRMAutomationRun(
            id=str(uuid4()),
            automation_id=automation_id,
            record_id=record_id,
            trigger_data=trigger_data or {},
            status="pending",
            steps_executed=[],
        )
        self.db.add(run)
        await self.db.flush()

        # Execute the automation
        await self._execute_automation(automation, run, record_id)

        return run

    async def _execute_automation(
        self,
        automation: CRMAutomation,
        run: CRMAutomationRun,
        record_id: str | None,
    ):
        """Execute an automation workflow."""
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        # Get record if specified
        record = None
        if record_id:
            record_service = CRMRecordService(self.db)
            record = await record_service.get_record(record_id)

        try:
            # Check conditions
            if automation.conditions:
                if not await self._evaluate_conditions(automation.conditions, record):
                    run.status = "completed"
                    run.completed_at = datetime.now(timezone.utc)
                    run.steps_executed.append({
                        "type": "conditions",
                        "status": "skipped",
                        "reason": "Conditions not met",
                        "executed_at": datetime.now(timezone.utc).isoformat(),
                    })
                    await self.db.flush()
                    return

            # Execute actions
            for i, action in enumerate(automation.actions):
                action_type = action.get("type")
                action_config = action.get("config", {})

                step_result = {
                    "type": action_type,
                    "order": i,
                    "executed_at": datetime.now(timezone.utc).isoformat(),
                }

                try:
                    result = await self._execute_action(
                        action_type,
                        action_config,
                        record,
                        automation.workspace_id,
                    )
                    step_result["status"] = "success"
                    step_result["result"] = result
                except Exception as e:
                    step_result["status"] = "failed"
                    step_result["error"] = str(e)

                    if automation.error_handling == "stop":
                        run.steps_executed.append(step_result)
                        raise

                run.steps_executed.append(step_result)

            # Update stats
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.duration_ms = int(
                (run.completed_at - run.started_at).total_seconds() * 1000
            )

            automation.total_runs += 1
            automation.successful_runs += 1
            automation.runs_this_month += 1
            automation.last_run_at = datetime.now(timezone.utc)

        except Exception as e:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.error_message = str(e)
            run.duration_ms = int(
                (run.completed_at - run.started_at).total_seconds() * 1000
            )

            automation.total_runs += 1
            automation.failed_runs += 1
            automation.runs_this_month += 1
            automation.last_run_at = datetime.now(timezone.utc)

        await self.db.flush()

    async def _evaluate_conditions(
        self,
        conditions: list[dict],
        record: CRMRecord | None,
    ) -> bool:
        """Evaluate automation conditions."""
        if not record:
            return True

        for condition in conditions:
            attr = condition.get("attribute")
            operator = condition.get("operator")
            value = condition.get("value")

            record_value = record.values.get(attr)

            if not self._check_condition(record_value, operator, value):
                return False

        return True

    def _check_condition(self, record_value: Any, operator: str, value: Any) -> bool:
        """Check a single condition."""
        if operator == "equals":
            return record_value == value
        elif operator == "not_equals":
            return record_value != value
        elif operator == "contains":
            return value in str(record_value) if record_value else False
        elif operator == "is_empty":
            return not record_value
        elif operator == "is_not_empty":
            return bool(record_value)
        elif operator == "gt":
            return float(record_value or 0) > float(value or 0)
        elif operator == "gte":
            return float(record_value or 0) >= float(value or 0)
        elif operator == "lt":
            return float(record_value or 0) < float(value or 0)
        elif operator == "lte":
            return float(record_value or 0) <= float(value or 0)
        elif operator == "in":
            return record_value in (value if isinstance(value, list) else [value])
        elif operator == "not_in":
            return record_value not in (value if isinstance(value, list) else [value])
        return True

    async def _execute_action(
        self,
        action_type: str,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
    ) -> dict:
        """Execute a single automation action."""
        if action_type == "update_record":
            return await self._action_update_record(config, record)
        elif action_type == "create_record":
            return await self._action_create_record(config, workspace_id)
        elif action_type == "add_to_list":
            return await self._action_add_to_list(config, record)
        elif action_type == "remove_from_list":
            return await self._action_remove_from_list(config, record)
        elif action_type == "enroll_in_sequence":
            return await self._action_enroll_in_sequence(config, record)
        elif action_type == "webhook_call":
            return await self._action_webhook_call(config, record)
        elif action_type == "create_task":
            return await self._action_create_task(config, record, workspace_id)
        elif action_type == "send_slack":
            return await self._action_send_slack(config, record)
        else:
            return {"message": f"Action type {action_type} not implemented"}

    async def _action_update_record(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Update record fields."""
        if not record:
            return {"error": "No record to update"}

        fields = config.get("fields", {})
        record_service = CRMRecordService(self.db)
        await record_service.update_record(record.id, values=fields)
        return {"updated_fields": list(fields.keys())}

    async def _action_create_record(
        self,
        config: dict,
        workspace_id: str,
    ) -> dict:
        """Create a new record."""
        object_id = config.get("object_id")
        values = config.get("values", {})

        if not object_id:
            return {"error": "No object_id specified"}

        record_service = CRMRecordService(self.db)
        new_record = await record_service.create_record(
            workspace_id=workspace_id,
            object_id=object_id,
            values=values,
        )
        return {"created_record_id": new_record.id}

    async def _action_add_to_list(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Add record to a list."""
        if not record:
            return {"error": "No record to add"}

        list_id = config.get("list_id")
        if not list_id:
            return {"error": "No list_id specified"}

        # Check if already in list
        existing = await self.db.execute(
            select(CRMListEntry).where(
                CRMListEntry.list_id == list_id,
                CRMListEntry.record_id == record.id,
            )
        )
        if existing.scalar_one_or_none():
            return {"message": "Record already in list"}

        entry = CRMListEntry(
            id=str(uuid4()),
            list_id=list_id,
            record_id=record.id,
            position=0,
            list_values={},
        )
        self.db.add(entry)
        return {"added_to_list": list_id}

    async def _action_remove_from_list(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Remove record from a list."""
        if not record:
            return {"error": "No record to remove"}

        list_id = config.get("list_id")
        if not list_id:
            return {"error": "No list_id specified"}

        stmt = select(CRMListEntry).where(
            CRMListEntry.list_id == list_id,
            CRMListEntry.record_id == record.id,
        )
        result = await self.db.execute(stmt)
        entry = result.scalar_one_or_none()

        if entry:
            await self.db.delete(entry)
            return {"removed_from_list": list_id}

        return {"message": "Record not in list"}

    async def _action_enroll_in_sequence(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Enroll record in a sequence."""
        if not record:
            return {"error": "No record to enroll"}

        sequence_id = config.get("sequence_id")
        if not sequence_id:
            return {"error": "No sequence_id specified"}

        sequence_service = CRMSequenceService(self.db)
        enrollment = await sequence_service.enroll_record(
            sequence_id=sequence_id,
            record_id=record.id,
        )
        return {"enrollment_id": enrollment.id}

    async def _action_webhook_call(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Make a webhook HTTP call."""
        url = config.get("url")
        method = config.get("method", "POST")
        headers = config.get("headers", {})

        if not url:
            return {"error": "No URL specified"}

        payload = {
            "event": "automation.triggered",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "record": record.values if record else None,
            "record_id": record.id if record else None,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=payload,
                )
                return {
                    "status_code": response.status_code,
                    "success": response.is_success,
                }
        except Exception as e:
            return {"error": str(e)}

    async def _action_create_task(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
    ) -> dict:
        """Create a task (placeholder - would integrate with sprint tasks)."""
        title = config.get("title", "Automated Task")
        assignee_id = config.get("assignee_id")

        # This would integrate with the sprint task system
        return {
            "message": "Task creation placeholder",
            "title": title,
            "assignee_id": assignee_id,
        }

    async def _action_send_slack(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Send Slack notification (placeholder)."""
        channel = config.get("channel")
        message = config.get("message", "")

        # Replace placeholders in message
        if record:
            for key, value in record.values.items():
                message = message.replace(f"{{{key}}}", str(value))

        # This would integrate with Slack service
        return {
            "message": "Slack notification placeholder",
            "channel": channel,
            "text": message,
        }

    # =========================================================================
    # TRIGGER MATCHING
    # =========================================================================

    async def find_matching_automations(
        self,
        workspace_id: str,
        trigger_type: str,
        record: CRMRecord | None = None,
        event_data: dict | None = None,
    ) -> list[CRMAutomation]:
        """Find automations that match a trigger event."""
        stmt = select(CRMAutomation).where(
            CRMAutomation.workspace_id == workspace_id,
            CRMAutomation.trigger_type == trigger_type,
            CRMAutomation.is_active == True,
        )

        if record:
            stmt = stmt.where(
                (CRMAutomation.object_id == None) |
                (CRMAutomation.object_id == record.object_id)
            )

        result = await self.db.execute(stmt)
        automations = list(result.scalars().all())

        # Filter by trigger config
        matching = []
        for automation in automations:
            if self._matches_trigger_config(automation.trigger_config, record, event_data):
                matching.append(automation)

        return matching

    def _matches_trigger_config(
        self,
        trigger_config: dict,
        record: CRMRecord | None,
        event_data: dict | None,
    ) -> bool:
        """Check if trigger config matches the event."""
        # Field change trigger
        if "attribute_slug" in trigger_config and event_data:
            changed_field = event_data.get("changed_field")
            if changed_field != trigger_config["attribute_slug"]:
                return False

            # Check from/to values if specified
            from_value = trigger_config.get("from_value")
            to_value = trigger_config.get("to_value")

            if from_value and event_data.get("old_value") != from_value:
                return False
            if to_value and event_data.get("new_value") != to_value:
                return False

        return True

    async def process_record_event(
        self,
        workspace_id: str,
        trigger_type: str,
        record: CRMRecord,
        event_data: dict | None = None,
    ):
        """Process a record event and trigger matching automations."""
        automations = await self.find_matching_automations(
            workspace_id=workspace_id,
            trigger_type=trigger_type,
            record=record,
            event_data=event_data,
        )

        for automation in automations:
            try:
                await self.trigger_automation(
                    automation_id=automation.id,
                    record_id=record.id,
                    trigger_data=event_data,
                )
            except Exception:
                # Log error but continue with other automations
                pass

    # =========================================================================
    # RUN HISTORY
    # =========================================================================

    async def list_runs(
        self,
        automation_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CRMAutomationRun], int]:
        """List automation runs."""
        count_result = await self.db.execute(
            select(func.count(CRMAutomationRun.id))
            .where(CRMAutomationRun.automation_id == automation_id)
        )
        total = count_result.scalar() or 0

        stmt = (
            select(CRMAutomationRun)
            .where(CRMAutomationRun.automation_id == automation_id)
            .order_by(CRMAutomationRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        runs = list(result.scalars().all())

        return runs, total


class CRMSequenceService:
    """Service for CRM sequence management and execution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # SEQUENCE CRUD
    # =========================================================================

    async def create_sequence(
        self,
        workspace_id: str,
        name: str,
        object_id: str,
        description: str | None = None,
        exit_conditions: list[dict] | None = None,
        settings: dict | None = None,
        is_active: bool = True,
        created_by_id: str | None = None,
    ) -> CRMSequence:
        """Create a new sequence."""
        sequence = CRMSequence(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            object_id=object_id,
            exit_conditions=exit_conditions or [],
            settings=settings or {},
            is_active=is_active,
            created_by_id=created_by_id,
        )
        self.db.add(sequence)
        await self.db.flush()
        await self.db.refresh(sequence)
        return sequence

    async def get_sequence(self, sequence_id: str) -> CRMSequence | None:
        """Get a sequence by ID."""
        stmt = (
            select(CRMSequence)
            .where(CRMSequence.id == sequence_id)
            .options(selectinload(CRMSequence.steps))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_sequences(
        self,
        workspace_id: str,
        object_id: str | None = None,
        is_active: bool | None = None,
    ) -> list[CRMSequence]:
        """List sequences in a workspace."""
        stmt = select(CRMSequence).where(CRMSequence.workspace_id == workspace_id)

        if object_id:
            stmt = stmt.where(CRMSequence.object_id == object_id)
        if is_active is not None:
            stmt = stmt.where(CRMSequence.is_active == is_active)

        stmt = stmt.options(selectinload(CRMSequence.steps))
        stmt = stmt.order_by(CRMSequence.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_sequence(
        self,
        sequence_id: str,
        **kwargs,
    ) -> CRMSequence | None:
        """Update a sequence."""
        sequence = await self.get_sequence(sequence_id)
        if not sequence:
            return None

        for key, value in kwargs.items():
            if value is not None and hasattr(sequence, key):
                setattr(sequence, key, value)

        await self.db.flush()
        await self.db.refresh(sequence)
        return sequence

    async def delete_sequence(self, sequence_id: str) -> bool:
        """Delete a sequence."""
        sequence = await self.get_sequence(sequence_id)
        if not sequence:
            return False

        await self.db.delete(sequence)
        await self.db.flush()
        return True

    # =========================================================================
    # SEQUENCE STEPS
    # =========================================================================

    async def add_step(
        self,
        sequence_id: str,
        step_type: str,
        config: dict,
        delay_value: int = 0,
        delay_unit: str = "days",
        position: int | None = None,
    ) -> CRMSequenceStep:
        """Add a step to a sequence."""
        if position is None:
            result = await self.db.execute(
                select(func.max(CRMSequenceStep.position))
                .where(CRMSequenceStep.sequence_id == sequence_id)
            )
            max_pos = result.scalar() or 0
            position = max_pos + 1

        step = CRMSequenceStep(
            id=str(uuid4()),
            sequence_id=sequence_id,
            step_type=step_type,
            position=position,
            config=config,
            delay_value=delay_value,
            delay_unit=delay_unit,
        )
        self.db.add(step)
        await self.db.flush()
        await self.db.refresh(step)
        return step

    async def update_step(
        self,
        step_id: str,
        **kwargs,
    ) -> CRMSequenceStep | None:
        """Update a sequence step."""
        stmt = select(CRMSequenceStep).where(CRMSequenceStep.id == step_id)
        result = await self.db.execute(stmt)
        step = result.scalar_one_or_none()

        if not step:
            return None

        for key, value in kwargs.items():
            if value is not None and hasattr(step, key):
                setattr(step, key, value)

        await self.db.flush()
        await self.db.refresh(step)
        return step

    async def delete_step(self, step_id: str) -> bool:
        """Delete a sequence step."""
        stmt = select(CRMSequenceStep).where(CRMSequenceStep.id == step_id)
        result = await self.db.execute(stmt)
        step = result.scalar_one_or_none()

        if not step:
            return False

        await self.db.delete(step)
        await self.db.flush()
        return True

    async def reorder_steps(
        self,
        sequence_id: str,
        step_ids: list[str],
    ) -> list[CRMSequenceStep]:
        """Reorder sequence steps."""
        for position, step_id in enumerate(step_ids):
            stmt = select(CRMSequenceStep).where(
                CRMSequenceStep.id == step_id,
                CRMSequenceStep.sequence_id == sequence_id,
            )
            result = await self.db.execute(stmt)
            step = result.scalar_one_or_none()
            if step:
                step.position = position

        await self.db.flush()

        stmt = (
            select(CRMSequenceStep)
            .where(CRMSequenceStep.sequence_id == sequence_id)
            .order_by(CRMSequenceStep.position)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # ENROLLMENT
    # =========================================================================

    async def enroll_record(
        self,
        sequence_id: str,
        record_id: str,
        enrolled_by_id: str | None = None,
        enrolled_by_automation_id: str | None = None,
    ) -> CRMSequenceEnrollment:
        """Enroll a record in a sequence."""
        sequence = await self.get_sequence(sequence_id)
        if not sequence:
            raise ValueError("Sequence not found")

        if not sequence.is_active:
            raise ValueError("Sequence is not active")

        # Check if already enrolled
        existing = await self.db.execute(
            select(CRMSequenceEnrollment).where(
                CRMSequenceEnrollment.sequence_id == sequence_id,
                CRMSequenceEnrollment.record_id == record_id,
                CRMSequenceEnrollment.status == CRMSequenceEnrollmentStatus.ACTIVE.value,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Record is already enrolled in this sequence")

        # Get first step
        first_step = None
        if sequence.steps:
            first_step = min(sequence.steps, key=lambda s: s.position)

        # Calculate next step time
        next_step_at = None
        if first_step:
            next_step_at = self._calculate_next_step_time(
                first_step.delay_value,
                first_step.delay_unit,
                sequence.settings,
            )

        enrollment = CRMSequenceEnrollment(
            id=str(uuid4()),
            sequence_id=sequence_id,
            record_id=record_id,
            status=CRMSequenceEnrollmentStatus.ACTIVE.value,
            current_step_id=first_step.id if first_step else None,
            next_step_scheduled_at=next_step_at,
            steps_completed=[],
            enrolled_by_id=enrolled_by_id,
            enrolled_by_automation_id=enrolled_by_automation_id,
        )
        self.db.add(enrollment)

        # Update sequence stats
        sequence.total_enrollments += 1
        sequence.active_enrollments += 1

        await self.db.flush()
        await self.db.refresh(enrollment)
        return enrollment

    async def unenroll_record(
        self,
        enrollment_id: str,
        exit_reason: str = "manual",
    ) -> CRMSequenceEnrollment | None:
        """Unenroll a record from a sequence."""
        stmt = (
            select(CRMSequenceEnrollment)
            .where(CRMSequenceEnrollment.id == enrollment_id)
        )
        result = await self.db.execute(stmt)
        enrollment = result.scalar_one_or_none()

        if not enrollment:
            return None

        enrollment.status = CRMSequenceEnrollmentStatus.EXITED.value
        enrollment.exit_reason = exit_reason
        enrollment.exited_at = datetime.now(timezone.utc)

        # Update sequence stats
        sequence = await self.get_sequence(enrollment.sequence_id)
        if sequence:
            sequence.active_enrollments = max(0, sequence.active_enrollments - 1)

        await self.db.flush()
        await self.db.refresh(enrollment)
        return enrollment

    async def pause_enrollment(
        self,
        enrollment_id: str,
    ) -> CRMSequenceEnrollment | None:
        """Pause an enrollment."""
        stmt = select(CRMSequenceEnrollment).where(
            CRMSequenceEnrollment.id == enrollment_id
        )
        result = await self.db.execute(stmt)
        enrollment = result.scalar_one_or_none()

        if not enrollment:
            return None

        enrollment.status = CRMSequenceEnrollmentStatus.PAUSED.value
        await self.db.flush()
        await self.db.refresh(enrollment)
        return enrollment

    async def resume_enrollment(
        self,
        enrollment_id: str,
    ) -> CRMSequenceEnrollment | None:
        """Resume a paused enrollment."""
        stmt = select(CRMSequenceEnrollment).where(
            CRMSequenceEnrollment.id == enrollment_id
        )
        result = await self.db.execute(stmt)
        enrollment = result.scalar_one_or_none()

        if not enrollment:
            return None

        enrollment.status = CRMSequenceEnrollmentStatus.ACTIVE.value
        await self.db.flush()
        await self.db.refresh(enrollment)
        return enrollment

    async def list_enrollments(
        self,
        sequence_id: str | None = None,
        record_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CRMSequenceEnrollment], int]:
        """List sequence enrollments."""
        stmt = select(CRMSequenceEnrollment)

        if sequence_id:
            stmt = stmt.where(CRMSequenceEnrollment.sequence_id == sequence_id)
        if record_id:
            stmt = stmt.where(CRMSequenceEnrollment.record_id == record_id)
        if status:
            stmt = stmt.where(CRMSequenceEnrollment.status == status)

        count_result = await self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        )
        total = count_result.scalar() or 0

        stmt = stmt.order_by(CRMSequenceEnrollment.enrolled_at.desc())
        stmt = stmt.limit(limit).offset(offset)

        result = await self.db.execute(stmt)
        enrollments = list(result.scalars().all())

        return enrollments, total

    def _calculate_next_step_time(
        self,
        delay_value: int,
        delay_unit: str,
        settings: dict,
    ) -> datetime:
        """Calculate when the next step should execute."""
        from datetime import timedelta

        now = datetime.now(timezone.utc)

        if delay_unit == "minutes":
            delta = timedelta(minutes=delay_value)
        elif delay_unit == "hours":
            delta = timedelta(hours=delay_value)
        else:  # days
            delta = timedelta(days=delay_value)

        return now + delta


class CRMWebhookService:
    """Service for CRM webhook management and delivery."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_webhook(
        self,
        workspace_id: str,
        name: str,
        url: str,
        events: list[str],
        description: str | None = None,
        headers: dict | None = None,
        retry_config: dict | None = None,
        is_active: bool = True,
    ) -> CRMWebhook:
        """Create a new webhook subscription."""
        import secrets

        webhook = CRMWebhook(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            url=url,
            events=events,
            secret=secrets.token_hex(32),
            headers=headers or {},
            retry_config=retry_config or {"max_attempts": 3, "backoff_multiplier": 2.0},
            is_active=is_active,
        )
        self.db.add(webhook)
        await self.db.flush()
        await self.db.refresh(webhook)
        return webhook

    async def get_webhook(self, webhook_id: str) -> CRMWebhook | None:
        """Get a webhook by ID."""
        stmt = select(CRMWebhook).where(CRMWebhook.id == webhook_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_webhooks(
        self,
        workspace_id: str,
        is_active: bool | None = None,
    ) -> list[CRMWebhook]:
        """List webhooks in a workspace."""
        stmt = select(CRMWebhook).where(CRMWebhook.workspace_id == workspace_id)

        if is_active is not None:
            stmt = stmt.where(CRMWebhook.is_active == is_active)

        stmt = stmt.order_by(CRMWebhook.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_webhook(
        self,
        webhook_id: str,
        **kwargs,
    ) -> CRMWebhook | None:
        """Update a webhook."""
        webhook = await self.get_webhook(webhook_id)
        if not webhook:
            return None

        for key, value in kwargs.items():
            if value is not None and hasattr(webhook, key):
                setattr(webhook, key, value)

        await self.db.flush()
        await self.db.refresh(webhook)
        return webhook

    async def delete_webhook(self, webhook_id: str) -> bool:
        """Delete a webhook."""
        webhook = await self.get_webhook(webhook_id)
        if not webhook:
            return False

        await self.db.delete(webhook)
        await self.db.flush()
        return True

    async def deliver_event(
        self,
        workspace_id: str,
        event_type: str,
        payload: dict,
    ):
        """Deliver an event to all subscribed webhooks."""
        webhooks = await self.list_webhooks(workspace_id, is_active=True)

        for webhook in webhooks:
            if event_type in webhook.events or "*" in webhook.events:
                await self._deliver_to_webhook(webhook, event_type, payload)

    async def emit_event(
        self,
        workspace_id: str,
        event: str,
        object_id: str | None = None,
        payload: dict | None = None,
    ):
        """Emit a CRM event to all matching webhooks.

        This method filters by object_id if the webhook is scoped to a specific object.
        """
        webhooks = await self.list_webhooks(workspace_id, is_active=True)

        for webhook in webhooks:
            # Check if webhook is subscribed to this event
            if event not in webhook.events and "*" not in webhook.events:
                continue

            # Check if webhook is scoped to specific object
            webhook_object_id = getattr(webhook, "object_id", None)
            if webhook_object_id and object_id and webhook_object_id != object_id:
                continue

            await self._deliver_to_webhook(webhook, event, payload or {})

    async def _deliver_to_webhook(
        self,
        webhook: CRMWebhook,
        event_type: str,
        payload: dict,
    ):
        """Deliver payload to a specific webhook."""
        import hashlib
        import hmac

        delivery = CRMWebhookDelivery(
            id=str(uuid4()),
            webhook_id=webhook.id,
            event_type=event_type,
            payload=payload,
            status="pending",
            attempt_number=1,
        )
        self.db.add(delivery)
        await self.db.flush()

        # Prepare request
        full_payload = {
            "id": delivery.id,
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": payload,
        }

        # Sign payload
        import json
        payload_bytes = json.dumps(full_payload).encode()
        signature = hmac.new(
            webhook.secret.encode(),
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        headers = {
            **webhook.headers,
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": event_type,
        }

        # Make request
        start_time = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    webhook.url,
                    json=full_payload,
                    headers=headers,
                )

            delivery.response_status_code = response.status_code
            delivery.response_body = response.text[:10000]  # Limit stored response
            delivery.status = "success" if response.is_success else "failed"
            delivery.delivered_at = datetime.now(timezone.utc)
            delivery.duration_ms = int(
                (delivery.delivered_at - start_time).total_seconds() * 1000
            )

            webhook.total_deliveries += 1
            if response.is_success:
                webhook.successful_deliveries += 1
            else:
                webhook.failed_deliveries += 1

        except Exception as e:
            delivery.status = "failed"
            delivery.error_message = str(e)
            delivery.duration_ms = int(
                (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            )
            webhook.total_deliveries += 1
            webhook.failed_deliveries += 1

        webhook.last_delivery_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def list_deliveries(
        self,
        webhook_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CRMWebhookDelivery], int]:
        """List webhook deliveries."""
        count_result = await self.db.execute(
            select(func.count(CRMWebhookDelivery.id))
            .where(CRMWebhookDelivery.webhook_id == webhook_id)
        )
        total = count_result.scalar() or 0

        stmt = (
            select(CRMWebhookDelivery)
            .where(CRMWebhookDelivery.webhook_id == webhook_id)
            .order_by(CRMWebhookDelivery.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        deliveries = list(result.scalars().all())

        return deliveries, total
