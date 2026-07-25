"""CRM Automation service for managing and executing automation workflows."""

import asyncio
import httpx
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.crm import (
    CRMAttributeType,
    CRMAutomation,
    CRMAutomationRun,
    CRMAutomationEmailOutbox,
    CRMAutomationTriggerType,
    CRMObject,
    CRMRecord,
    CRMRecordRelation,
    CRMSequence,
    CRMSequenceStep,
    CRMSequenceEnrollment,
    CRMWebhook,
    CRMWebhookDelivery,
    CRMActivity,
    CRMList,
    CRMSequenceEnrollmentStatus,
)
from aexy.services.crm_service import CRMRecordService, CRMActivityService
from aexy.services.slack_integration import SlackIntegrationService
from aexy.schemas.integrations import SlackMessage, SlackNotificationType
from aexy.models.developer import Developer
from aexy.models.workspace import WorkspaceMember


# =============================================================================
# TRIGGER NARROWING
# =============================================================================
#
# A trigger's config may narrow when it fires (only this field, only that list).
# Leave it unset and the trigger fires for every event of its type; set it and
# only matching events fire.
#
# The builder, the API and older automations have each written these settings
# under different names, so every alias is accepted on read. New writes use the
# first (canonical) name in each tuple.

_CONFIG_ALIASES: dict[str, tuple[str, ...]] = {
    "fields": ("fields", "field", "field_slug", "attribute_slug", "attributeSlug"),
    "list_id": ("list_id", "listId"),
    "form_id": ("form_id", "formId"),
    "from_stage": ("from_stage", "fromStage"),
    "to_stage": ("to_stage", "toStage"),
}

# trigger type -> [(config setting, matching key in the event payload)]
_TRIGGER_NARROWING: dict[str, tuple[tuple[str, str], ...]] = {
    CRMAutomationTriggerType.FIELD_CHANGED.value: (("fields", "changed_field"),),
    CRMAutomationTriggerType.LIST_ENTRY_ADDED.value: (("list_id", "list_id"),),
    CRMAutomationTriggerType.LIST_ENTRY_REMOVED.value: (("list_id", "list_id"),),
    CRMAutomationTriggerType.STAGE_CHANGED.value: (
        ("from_stage", "old_stage"),
        ("to_stage", "new_stage"),
    ),
    CRMAutomationTriggerType.FORM_SUBMITTED.value: (("form_id", "form_id"),),
}


def selected_values(trigger_config: dict, setting: str) -> list[str]:
    """The values chosen for one narrowing setting, always as a list.

    Empty means "not configured" — i.e. fire for everything. Accepts a single
    value or a list, so one field or several read the same way.
    """
    for alias in _CONFIG_ALIASES.get(setting, (setting,)):
        if alias not in trigger_config:
            continue
        raw = trigger_config[alias]
        if raw is None or raw == "":
            return []
        values = raw if isinstance(raw, (list, tuple, set)) else [raw]
        return [str(v) for v in values if v not in (None, "")]
    return []


def trigger_matches(
    trigger_type: str, trigger_config: dict, trigger_data: dict | None
) -> bool:
    """Whether an event should run an automation, given its narrowing config."""
    for setting, event_key in _TRIGGER_NARROWING.get(trigger_type, ()):
        chosen = selected_values(trigger_config or {}, setting)
        if not chosen:
            continue  # not narrowed — fire for all
        actual = (trigger_data or {}).get(event_key)
        if actual is None or str(actual) not in chosen:
            return False
    return True


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
        """Create a new automation (always for CRM module)."""
        automation = CRMAutomation(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            object_id=object_id,
            module="crm",  # CRM service always creates CRM automations
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
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMAutomation]:
        """List automations in a workspace (CRM module only)."""
        stmt = select(CRMAutomation).where(
            CRMAutomation.workspace_id == workspace_id,
            CRMAutomation.module == "crm",  # Filter to CRM module only
        )

        if object_id:
            stmt = stmt.where(CRMAutomation.object_id == object_id)
        if is_active is not None:
            stmt = stmt.where(CRMAutomation.is_active == is_active)

        stmt = stmt.order_by(CRMAutomation.name)
        stmt = stmt.offset(skip).limit(limit)
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

    async def toggle_automation(self, automation_id: str) -> CRMAutomation | None:
        """Toggle automation active status."""
        automation = await self.get_automation(automation_id)
        if not automation:
            return None

        automation.is_active = not automation.is_active
        await self.db.flush()
        await self.db.refresh(automation)
        return automation

    async def get_automation_run(self, run_id: str) -> CRMAutomationRun | None:
        """Get an automation run by ID."""
        stmt = select(CRMAutomationRun).where(CRMAutomationRun.id == run_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_automation_runs(
        self,
        automation_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMAutomationRun]:
        """List automation runs (API-compatible version)."""
        runs, _ = await self.list_runs(automation_id, limit=limit, offset=skip)
        return runs

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
        # Find all active automations matching this trigger.
        # object_id is matched null-tolerantly: an automation bound to a specific
        # object fires only for that object, while an automation with a NULL
        # object_id fires for any object of this workspace. A strict
        # `object_id == object_id` predicate silently excludes NULL rows — and the
        # /automations builder never sets object_id — so record.created/updated/
        # deleted automations built there would never fire (0 runs).
        stmt = select(CRMAutomation).where(
            CRMAutomation.workspace_id == workspace_id,
            CRMAutomation.trigger_type == trigger_type,
            CRMAutomation.is_active == True,
            (CRMAutomation.object_id == None)  # noqa: E711
            | (CRMAutomation.object_id == object_id),
        )
        result = await self.db.execute(stmt)
        automations = list(result.scalars().all())

        runs = []
        for automation in automations:
            # Unconfigured narrowing = fire for every event of this type;
            # configured = fire only on a match. One rule for every trigger.
            if not trigger_matches(
                trigger_type, automation.trigger_config or {}, trigger_data
            ):
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
        # Only set record_id for CRM module (has foreign key constraint to crm_records)
        # For other modules, entity_id is stored in trigger_data
        module = automation.module or "crm"
        effective_record_id = record_id if module == "crm" else None

        run = CRMAutomationRun(
            id=str(uuid4()),
            automation_id=automation_id,
            module=module,
            record_id=effective_record_id,
            trigger_data=trigger_data or {},
            status="pending",
            steps_executed=[],
        )
        self.db.add(run)
        await self.db.flush()

        # A canvas with a wait (or other timing/logic node) can't run in the
        # inline executor — it has no durable timer and would just drop the
        # node. Hand those off to the Temporal workflow, which sleeps durably
        # and runs the same CRM actions. Plain action-only automations keep the
        # fast inline path untouched.
        if await self._dispatch_durably_if_needed(automation, run, record_id):
            await self._log_run_activity(automation, run, record_id)
            return run

        # Execute the automation
        await self._execute_automation(automation, run, record_id)

        # Surface the run in the CRM activity feed (E3.5) so automation
        # outcomes are observable alongside record changes.
        await self._log_run_activity(automation, run, record_id)

        return run

    # Node types the inline executor can't run; these need the durable workflow.
    _DURABLE_NODE_TYPES = {"wait"}

    async def _dispatch_durably_if_needed(
        self, automation: CRMAutomation, run: CRMAutomationRun, record_id: str | None
    ) -> bool:
        """Hand off to the Temporal workflow when the canvas needs durable timing.

        Returns True if execution was handed off (run left as "running", closed
        later by the workflow), False to fall through to the inline executor.
        """
        from aexy.services.workflow_service import WorkflowService

        workflow_def = await WorkflowService(self.db).get_workflow_by_automation(
            automation.id
        )
        if not workflow_def or not workflow_def.nodes:
            return False
        if not any(
            n.get("type") in self._DURABLE_NODE_TYPES for n in workflow_def.nodes
        ):
            return False

        record_data: dict = {}
        if record_id:
            rec = await CRMRecordService(self.db).get_record(record_id)
            if rec:
                record_data = {"id": rec.id, **(rec.values or {})}

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        run.steps_executed = [
            *(run.steps_executed or []),
            {
                "type": "handoff",
                "status": "dispatched",
                "detail": "Running durably (contains a wait); "
                "outcome recorded on completion.",
                "executed_at": datetime.now(timezone.utc).isoformat(),
            },
        ]
        await self.db.flush()
        # No explicit commit: the run row is closed by mark_crm_automation_run,
        # which fires only after the (durable) wait completes — long after the
        # request's own commit has persisted this row for the worker to see.

        from aexy.temporal.client import get_temporal_client
        from aexy.temporal.workflows.crm_workflow import (
            CRMAutomationWorkflow,
            CRMWorkflowInput,
        )

        client = await get_temporal_client()
        await client.start_workflow(
            CRMAutomationWorkflow.run,
            CRMWorkflowInput(
                execution_id=str(run.id),
                workflow_id=str(workflow_def.id),
                workspace_id=automation.workspace_id,
                trigger_data=run.trigger_data or {},
                record_id=record_id,
                record_data=record_data,
                nodes=workflow_def.nodes or [],
                edges=workflow_def.edges or [],
                crm_run_id=str(run.id),
            ),
            id=f"crm-live-{run.id}",
            task_queue="workflows",
        )
        return True

    async def _log_run_activity(
        self,
        automation: CRMAutomation,
        run: CRMAutomationRun,
        record_id: str | None,
    ) -> None:
        """Record an automation run in the CRM activity feed.

        Only for CRM-scoped runs with a record (crm_activities.record_id is a
        FK to crm_records). The automation name is the human-readable actor.
        """
        if not record_id or (automation.module or "crm") != "crm":
            return

        self.db.add(
            CRMActivity(
                id=str(uuid4()),
                workspace_id=automation.workspace_id,
                record_id=record_id,
                activity_type="automation.triggered",
                actor_type="automation",
                actor_id=None,
                actor_name=automation.name,
                title=f'Automation "{automation.name}" {run.status}',
                activity_metadata={
                    "automation_id": automation.id,
                    "run_id": run.id,
                    "status": run.status,
                },
                occurred_at=datetime.now(timezone.utc),
            )
        )
        await self.db.flush()

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
                    run.steps_executed = [
                        *(run.steps_executed or []),
                        {
                            "type": "conditions",
                            "status": "skipped",
                            "reason": "Conditions not met",
                            "executed_at": datetime.now(timezone.utc).isoformat(),
                        },
                    ]
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

                # Per-step gate: a step may declare it only runs when a field
                # on the triggering record passes a check. Not met => the step
                # is recorded skipped (never "success", never failed) and the
                # rest of the automation continues.
                if not self._run_if_allows(action_config, record):
                    step_result["status"] = "skipped"
                    step_result["reason"] = "Run-if condition not met"
                    run.steps_executed = [*(run.steps_executed or []), step_result]
                    continue

                try:
                    result = await self._execute_action(
                        action_type,
                        action_config,
                        record,
                        automation.workspace_id,
                        trigger_data=run.trigger_data,
                        run_id=str(run.id),
                        action_index=i,
                    )
                    # Every action must turn a reported error into a failed
                    # run. Treating an unsupported or invalid action as a
                    # success makes the history untrustworthy.
                    if result.get("error"):
                        raise ValueError(str(result["error"]))

                    step_result["status"] = "queued" if result.get("queued") else "success"
                    step_result["result"] = result
                except Exception as e:
                    step_result["status"] = "failed"
                    step_result["error"] = str(e)

                    if automation.error_handling == "stop":
                        run.steps_executed = [*(run.steps_executed or []), step_result]
                        raise

                run.steps_executed = [*(run.steps_executed or []), step_result]

            # Sending an email is asynchronous. A queued email is not yet a
            # successful email; the Temporal activity records its final result.
            has_queued_email = any(
                step.get("type") in {"send_email", "notify_user"}
                and step.get("status") == "queued"
                for step in run.steps_executed
            )
            # A step that failed under error_handling="continue"/"retry" never
            # reaches the outer handler, so without this the run is reported
            # completed and successful while its own step list says otherwise.
            failed_steps = [
                step for step in run.steps_executed if step.get("status") == "failed"
            ]

            if has_queued_email:
                run.status = "queued"
            else:
                run.status = "failed" if failed_steps else "completed"
                run.completed_at = datetime.now(timezone.utc)
                run.duration_ms = int(
                    (run.completed_at - run.started_at).total_seconds() * 1000
                )
                if failed_steps:
                    run.error_message = str(
                        failed_steps[0].get("error") or "A step failed"
                    )

            automation.total_runs += 1
            automation.runs_this_month += 1
            automation.last_run_at = datetime.now(timezone.utc)
            if not has_queued_email:
                if failed_steps:
                    automation.failed_runs += 1
                else:
                    automation.successful_runs += 1

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

            # Notify creator of automation failure
            if automation.created_by_id:
                try:
                    from aexy.models.notification import NotificationEventType
                    from aexy.services.notification_service import NotificationService

                    notif_service = NotificationService(self.db)
                    await notif_service.create_notification(
                        recipient_id=automation.created_by_id,
                        event_type=NotificationEventType.AUTOMATION_RUN_FAILED,
                        title=f"Automation Failed: {automation.name}",
                        body=f"Automation \"{automation.name}\" failed: {str(e)[:200]}",
                        context={
                            "workspace_id": automation.workspace_id,
                            "automation_id": automation.id,
                            "automation_name": automation.name,
                            "error": str(e)[:200],
                            "action_url": "/automations",
                        },
                    )
                except Exception:
                    pass

        await self.db.flush()

    def _run_if_allows(self, config: dict, record: CRMRecord | None) -> bool:
        """Per-step gate saved by the builder as run_if_field/operator/value.

        No field configured means no gate. No record (e.g. schedule triggers
        with no record context) runs the step — matching how automation-level
        conditions treat a missing record. The field arrives as the picker's
        {{record.values.slug}} form or a bare slug; both resolve.
        """
        raw_field = str(config.get("run_if_field") or "").strip()
        if not raw_field:
            return True
        if not record:
            return True

        match = re.fullmatch(r"(?:\{\{)?(?:record\.)?(?:values\.)?(.+?)(?:\}\})?", raw_field)
        slug = match.group(1) if match else raw_field
        record_value = (record.values or {}).get(slug)

        operator = str(config.get("run_if_operator") or "equals")
        try:
            return self._check_condition(record_value, operator, config.get("run_if_value"))
        except (TypeError, ValueError):
            # e.g. a numeric comparison against a non-numeric field value:
            # an unevaluable gate withholds the step rather than crashing the run
            return False

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
        elif operator == "starts_with":
            return str(record_value).lower().startswith(str(value).lower()) if record_value else False
        elif operator == "ends_with":
            return str(record_value).lower().endswith(str(value).lower()) if record_value else False
        elif operator == "not_contains":
            return str(value).lower() not in str(record_value).lower() if record_value else True
        elif operator == "between":
            if isinstance(value, list) and len(value) == 2:
                try:
                    return float(value[0]) <= float(record_value or 0) <= float(value[1])
                except (ValueError, TypeError):
                    return False
            return False
        return True

    async def _execute_action(
        self,
        action_type: str,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
        run_id: str | None = None,
        action_index: int | None = None,
    ) -> dict:
        """Execute a single automation action."""
        if action_type == "update_record":
            return await self._action_update_record(config, record, trigger_data)
        elif action_type == "create_record":
            return await self._action_create_record(config, record, workspace_id, trigger_data)
        elif action_type == "delete_record":
            return await self._action_delete_record(config, record)
        elif action_type == "assign_owner":
            return await self._action_assign_owner(config, record, workspace_id)
        elif action_type == "link_records":
            return await self._action_link_records(config, record, workspace_id)
        elif action_type == "add_to_list":
            return await self._action_add_to_list(config, record)
        elif action_type == "remove_from_list":
            return await self._action_remove_from_list(config, record)
        elif action_type == "enroll_in_sequence":
            return await self._action_enroll_in_sequence(config, record, workspace_id)
        elif action_type == "remove_from_sequence":
            return await self._action_remove_from_sequence(config, record, workspace_id)
        elif action_type == "webhook_call":
            return await self._action_webhook_call(config, record, trigger_data)
        elif action_type == "create_task":
            return await self._action_create_task(config, record, workspace_id, trigger_data)
        elif action_type == "send_slack":
            return await self._action_send_slack(config, record, workspace_id, trigger_data)
        elif action_type == "send_email":
            return await self._action_send_email(
                config, record, workspace_id, trigger_data, run_id, action_index
            )
        # Uptime module actions
        elif action_type == "pause_monitor":
            return await self._action_pause_monitor(config, trigger_data)
        elif action_type == "resume_monitor":
            return await self._action_resume_monitor(config, trigger_data)
        elif action_type == "create_incident":
            return await self._action_create_incident(config, trigger_data, workspace_id)
        elif action_type == "resolve_incident":
            return await self._action_resolve_incident(config, trigger_data)
        # Common actions
        elif action_type == "notify_user":
            return await self._action_notify_user(
                config,
                record,
                workspace_id,
                trigger_data,
                run_id,
                action_index,
            )
        elif action_type == "notify_team":
            return await self._action_notify_team(config, record, workspace_id, trigger_data)
        # Sprint module actions
        elif action_type == "update_task":
            return await self._action_update_task(config, trigger_data)
        elif action_type == "assign_task":
            return await self._action_assign_task(config, trigger_data)
        elif action_type == "move_task":
            return await self._action_move_task(config, trigger_data)
        elif action_type == "create_subtask":
            return await self._action_create_subtask(config, trigger_data)
        # Ticket module actions
        elif action_type == "update_ticket":
            return await self._action_update_ticket(config, trigger_data)
        elif action_type == "assign_ticket":
            return await self._action_assign_ticket(config, trigger_data)
        elif action_type == "escalate":
            return await self._action_escalate_ticket(config, trigger_data)
        elif action_type == "change_priority":
            return await self._action_change_ticket_priority(config, trigger_data)
        # Hiring module actions
        elif action_type == "update_candidate":
            return await self._action_update_candidate(config, trigger_data)
        elif action_type == "move_stage":
            return await self._action_move_candidate_stage(config, trigger_data)
        elif action_type == "schedule_interview":
            return await self._action_schedule_interview(config, trigger_data, workspace_id)
        # Booking module actions
        elif action_type == "confirm_booking":
            return await self._action_confirm_booking(config, trigger_data)
        elif action_type == "cancel_booking":
            return await self._action_cancel_booking(config, trigger_data)
        elif action_type == "reschedule_booking":
            return await self._action_reschedule_booking(config, trigger_data)
        # AI Agent actions
        elif action_type == "run_agent":
            return await self._action_run_agent(config, record, workspace_id, trigger_data, run_id)
        else:
            return {"message": f"Action type {action_type} not implemented"}

    async def _action_update_record(
        self,
        config: dict,
        record: CRMRecord | None,
        trigger_data: dict | None = None,
    ) -> dict:
        """Update record fields.

        The builder's config panel saves update_field/update_value, not the
        legacy fields dict this used to read exclusively — same mismatch
        shape as _action_create_record had. Kept the old key as a fallback
        for any automation already hand-built against it.
        """
        if not record:
            return {"error": "No record to update"}

        fields = dict(config.get("fields") or {})

        update_field = str(config.get("update_field") or "").strip()
        if update_field:
            # Same record./record.values. prefix-stripping _action_link_records
            # already does for link_field — the picker can save either a bare
            # slug or a dotted record.values.<slug> path.
            match = re.fullmatch(r"(?:record\.)?(?:values\.)?(.+)", update_field)
            slug = match.group(1) if match else update_field
            raw_value = config.get("update_value")
            value = (
                self._replace_placeholders(raw_value, record, trigger_data)
                if isinstance(raw_value, str)
                else raw_value
            )
            fields[slug] = value

        if not fields:
            return {"error": "No field specified to update"}

        record_service = CRMRecordService(self.db)
        await record_service.update_record(record.id, values=fields)
        return {"updated_fields": list(fields.keys())}

    async def _action_create_record(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
    ) -> dict:
        """Create a new record, optionally relating it back to the triggering record.

        The builder's config panel saves target_object_id/record_name/
        link_to_current (not object_id/values) — read the panel's own keys
        rather than renaming them on the frontend side.

        When link_to_current is set, this is idempotent per (source record,
        relation_type): the target can't be known before creation, so unlike
        _action_link_records the existing-relation lookup filters on source +
        type only. That's the right question to ask — "has this source already
        gotten one of these" — and it's what stops a no-filter record.updated
        trigger from spawning a fresh duplicate on every edit.
        """
        object_id = config.get("target_object_id") or config.get("object_id")
        if not object_id:
            return {"error": "No object_id specified"}

        link_to_current = bool(config.get("link_to_current")) and record is not None
        relation_type = str(config.get("relation_type") or "created").strip() or "created"

        if link_to_current:
            existing = (await self.db.execute(
                select(CRMRecordRelation).where(
                    CRMRecordRelation.source_record_id == record.id,
                    CRMRecordRelation.relation_type == relation_type,
                )
            )).scalar_one_or_none()
            if existing:
                return {"relation_id": existing.id, "already_linked": True}

        target_object = (await self.db.execute(
            select(CRMObject).where(
                CRMObject.id == object_id,
                CRMObject.workspace_id == workspace_id,
            )
        )).scalar_one_or_none()
        if not target_object:
            return {"error": "Target object type was not found in this workspace"}

        values = dict(config.get("values") or {})
        record_name = str(config.get("record_name") or "").strip()
        if record_name:
            record_name = self._replace_placeholders(record_name, record, trigger_data)

            name_slug = None
            if target_object.primary_attribute_id:
                for attr in target_object.attributes or []:
                    if attr.id == target_object.primary_attribute_id:
                        name_slug = attr.slug
                        break
            if not name_slug:
                for attr in target_object.attributes or []:
                    if attr.attribute_type == CRMAttributeType.TEXT.value:
                        name_slug = attr.slug
                        break
            if name_slug:
                values.setdefault(name_slug, record_name)

        record_service = CRMRecordService(self.db)
        new_record = await record_service.create_record(
            workspace_id=workspace_id,
            object_id=object_id,
            values=values,
        )
        result: dict = {"created_record_id": new_record.id}

        if link_to_current:
            relation = CRMRecordRelation(
                id=str(uuid4()),
                source_record_id=record.id,
                target_record_id=new_record.id,
                relation_type=relation_type,
            )
            self.db.add(relation)
            await self.db.flush()
            result["relation_id"] = relation.id

        return result

    async def _action_delete_record(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Archive the triggering record after the builder's explicit confirmation."""
        if not record:
            return {"error": "No record to delete"}
        if not config.get("confirm_delete"):
            return {"error": "Delete action requires confirmation"}

        deleted = await CRMRecordService(self.db).delete_record(
            record.id,
            permanent=False,
        )
        if not deleted:
            return {"error": "Record was not found"}
        return {"record_id": record.id, "archived": True}

    def _resolve_field_reference(
        self, record: CRMRecord, raw_path: str
    ) -> tuple[object, str | None]:
        """Resolve a field-picker placeholder to the value it actually points at.

        The builder's field picker emits paths like ``{{record.values.<slug>}}``
        (or the record-level shortcuts ``record.id`` / ``record.owner_id`` /
        ``record.object_id`` that the same field-schema endpoint advertises),
        not a bare slug — a value/list-value action reading straight from
        ``record.values`` using the picker's own field name always missed.
        Returns ``(value, error)``; error is only set when the field holds
        more than one value and the caller needs exactly one.
        """
        path = str(raw_path or "").strip()
        match = re.fullmatch(r"\{\{(?:record\.)?(.+?)\}\}", path)
        path = match.group(1) if match else path

        if path == "id":
            value = record.id
        elif path == "owner_id":
            value = record.owner_id
        elif path == "object_id":
            value = record.object_id
        elif path.startswith("values."):
            value = (record.values or {}).get(path[len("values.") :])
        else:
            value = (record.values or {}).get(path)

        if isinstance(value, list):
            if len(value) == 1:
                return value[0], None
            if not value:
                return None, None
            return None, "The selected field holds more than one value; pick a single-value field instead"

        return value, None

    async def _action_assign_owner(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
    ) -> dict:
        """Assign the triggering record to an active member of its workspace."""
        if not record:
            return {"error": "No record to assign"}

        owner_value = config.get("owner_id") or config.get("owner_email")
        if config.get("assign_type") == "field":
            owner_value, field_error = self._resolve_field_reference(
                record, str(config.get("owner_field") or "")
            )
            if field_error:
                return {"error": field_error}

        if not owner_value:
            return {"error": "No owner ID or email specified"}

        member_query = (
            select(Developer)
            .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
            )
        )
        owner_value = str(owner_value).strip()
        if "@" in owner_value:
            member_query = member_query.where(func.lower(Developer.email) == owner_value.lower())
        else:
            member_query = member_query.where(Developer.id == owner_value)

        owner = (await self.db.execute(member_query)).scalar_one_or_none()
        if not owner:
            return {"error": "Owner is not an active member of this workspace"}

        record.owner_id = owner.id
        await self.db.flush()
        return {"record_id": record.id, "owner_id": owner.id}

    async def _action_link_records(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
    ) -> dict:
        """Create one deduplicated relationship from the triggering record."""
        if not record:
            return {"error": "No record to link"}

        # Default must match what the builder panel displays for a fresh step
        # (field mode). A config saved without an explicit mode used to fall
        # back to "specific" here while the panel showed "Record from Field
        # Value" — every such automation failed with "no target specified".
        # Inferring from which key is present also keeps any hand-built
        # specific-mode config without the mode key working.
        link_type = config.get("link_type") or (
            "specific" if config.get("link_record_id") else "field"
        )
        if link_type == "field":
            target_record_id, field_error = self._resolve_field_reference(
                record, str(config.get("link_field") or "")
            )
            if field_error:
                return {"error": field_error}
        elif link_type == "specific":
            target_record_id = config.get("link_record_id")
        else:
            return {"error": "Linking a newly created record is not supported yet"}

        if not target_record_id:
            return {"error": "No target record ID specified"}
        if str(target_record_id) == record.id:
            return {"error": "A record cannot be linked to itself"}

        target = (await self.db.execute(
            select(CRMRecord).where(
                CRMRecord.id == str(target_record_id),
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.is_archived == False,
            )
        )).scalar_one_or_none()
        if not target:
            return {"error": "Target record was not found in this workspace"}

        relation_type = str(config.get("relation_type") or "related").strip() or "related"
        existing = (await self.db.execute(
            select(CRMRecordRelation).where(
                CRMRecordRelation.source_record_id == record.id,
                CRMRecordRelation.target_record_id == target.id,
                CRMRecordRelation.relation_type == relation_type,
            )
        )).scalar_one_or_none()
        if existing:
            return {"relation_id": existing.id, "already_linked": True}

        relation = CRMRecordRelation(
            id=str(uuid4()),
            source_record_id=record.id,
            target_record_id=target.id,
            relation_type=relation_type,
        )
        # Two concurrent fires can both pass the existence check above; the
        # uq_crm_record_relation constraint then rejects the loser. Without the
        # savepoint that rollback also destroys the run row, so the losing run
        # silently vanishes from history instead of reporting already_linked.
        try:
            async with self.db.begin_nested():
                self.db.add(relation)
        except IntegrityError:
            existing = (await self.db.execute(
                select(CRMRecordRelation).where(
                    CRMRecordRelation.source_record_id == record.id,
                    CRMRecordRelation.target_record_id == target.id,
                    CRMRecordRelation.relation_type == relation_type,
                )
            )).scalar_one_or_none()
            if existing:
                return {"relation_id": existing.id, "already_linked": True}
            raise
        return {"relation_id": relation.id, "target_record_id": target.id}

    async def _action_add_to_list(
        self,
        config: dict,
        record: CRMRecord | None,
    ) -> dict:
        """Add record to a list.

        Routed through CRMListService.add_entry rather than inserting
        directly, so this path gets the same membership validation, entry
        count bookkeeping, and list_entry.added trigger every other way of
        joining a list already gets.
        """
        if not record:
            return {"error": "No record to add"}

        list_id = config.get("list_id")
        if not list_id:
            return {"error": "No list_id specified"}

        from aexy.services.crm_service import CRMListService

        try:
            await CRMListService(self.db).add_entry(
                list_id=list_id,
                record_id=record.id,
            )
        except ValueError:
            return {"message": "Record already in list"}
        except LookupError as exc:
            return {"error": str(exc)}

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

        from aexy.services.crm_service import CRMListService

        removed = await CRMListService(self.db).remove_entry(list_id, record.id)
        if removed:
            return {"removed_from_list": list_id}

        return {"message": "Record not in list"}

    async def _action_enroll_in_sequence(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
    ) -> dict:
        """Enroll a CRM record in an active GTM outreach sequence."""
        if not record:
            return {"error": "No record to enroll"}

        sequence_id = config.get("sequence_id")
        if not sequence_id:
            return {"error": "No sequence_id specified"}

        email_field = config.get("email_field", "email")
        email = record.values.get(email_field) if record.values else None
        if not email:
            return {"error": f"No recipient email found in {email_field}"}

        from aexy.services.outreach_sequence_service import OutreachSequenceService

        sequence_service = OutreachSequenceService(self.db)
        try:
            enrollment = await sequence_service.enroll_contact(
                workspace_id=workspace_id,
                sequence_id=sequence_id,
                record_id=record.id,
                email=str(email),
                contact_name=record.display_name,
            )
        except ValueError as error:
            if "already enrolled" in str(error).lower() and config.get("skip_if_enrolled", True):
                return {"sequence_id": sequence_id, "already_enrolled": True}
            return {"error": str(error)}
        return {"sequence_id": sequence_id, "enrollment_id": enrollment.id}

    async def _action_remove_from_sequence(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
    ) -> dict:
        """Unenroll the triggering record from one GTM outreach sequence."""
        if not record:
            return {"error": "No record to remove from sequence"}

        sequence_id = config.get("sequence_id")
        if not sequence_id:
            return {"error": "No sequence_id specified"}

        from aexy.models.gtm_outreach import EnrollmentStatus, OutreachEnrollment
        from aexy.services.outreach_sequence_service import OutreachSequenceService

        enrollments = (await self.db.execute(
            select(OutreachEnrollment).where(
                OutreachEnrollment.workspace_id == workspace_id,
                OutreachEnrollment.sequence_id == sequence_id,
                OutreachEnrollment.record_id == record.id,
                OutreachEnrollment.status.in_([
                    EnrollmentStatus.ACTIVE.value,
                    EnrollmentStatus.PAUSED.value,
                ]),
            ).limit(1)
        )).scalars().all()
        if not enrollments:
            return {"sequence_id": sequence_id, "unenrolled": False}

        removed = await OutreachSequenceService(self.db).unenroll_contact(
            workspace_id,
            enrollments[0].id,
            exit_reason="automation",
        )
        if not removed:
            return {"error": "Active sequence enrollment was not found"}
        return {"sequence_id": sequence_id, "unenrolled": True}

    async def _action_webhook_call(
        self,
        config: dict,
        record: CRMRecord | None,
        trigger_data: dict | None = None,
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
            "trigger_data": trigger_data,
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
        trigger_data: dict | None = None,
    ) -> dict:
        """Create a sprint task.

        Config options:
        - task_title / title: Task title (supports placeholders)
        - task_description / description: Task description (supports placeholders)
        - priority: Task priority (critical, high, medium, low)
        - task_priority: Alternative key for priority
        - assignee_id: Developer ID to assign
        - project_id: Optional project ID (will look up team from project)
        - sprint_id: Optional sprint ID (if not provided, creates backlog task)
        - labels: List of labels
        """
        from aexy.models.sprint import SprintTask
        from aexy.models.project import ProjectTeam

        logger.info(f"[CREATE_TASK] Starting task creation with config: {config}")

        # Get title from various config keys
        title_template = config.get("task_title") or config.get("title") or "Automated Task"
        description_template = config.get("task_description") or config.get("description") or ""

        # Replace placeholders in title and description
        title = self._replace_placeholders(title_template, record, trigger_data)
        description = self._replace_placeholders(description_template, record, trigger_data)

        priority = config.get("task_priority") or config.get("priority", "medium")
        assignee_id = config.get("assignee_id")
        # The config panel's "Assign To" collects an email, but only an ID was
        # ever read here, so every builder-set assignee was silently dropped
        # and the task arrived unassigned. Resolve the email to an active
        # member of this workspace, mirroring how owner assignment works.
        if not assignee_id and config.get("assignee_email"):
            assignee_email = str(config["assignee_email"]).strip()
            assignee = (await self.db.execute(
                select(Developer)
                .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
                .where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                    func.lower(Developer.email) == assignee_email.lower(),
                )
            )).scalar_one_or_none()
            if not assignee:
                return {
                    "error": f"'{assignee_email}' is not an active member of this workspace"
                }
            assignee_id = assignee.id
        project_id = config.get("project_id")
        sprint_id = config.get("sprint_id")
        labels = config.get("labels", [])

        # The builder collected a due offset but nothing ever read it, so every
        # task was created with no date at all. Zero is allowed and means due
        # immediately, which is what a "do this now" automation needs.
        due_date = None
        if config.get("due_in_value") is not None:
            try:
                due_amount = int(config["due_in_value"])
            except (TypeError, ValueError):
                due_amount = None
            if due_amount is not None and due_amount >= 0:
                unit = str(config.get("due_in_unit") or "days").lower()
                per_unit = {"minutes": 1, "hours": 60, "days": 1440, "weeks": 10080}
                if unit in per_unit:
                    due_date = datetime.now(timezone.utc) + timedelta(
                        minutes=due_amount * per_unit[unit]
                    )

        # If project_id is provided, get the first team from that project
        team_id = None
        if project_id:
            logger.info(f"[CREATE_TASK] Looking up team for project: {project_id}")
            try:
                project_team_stmt = select(ProjectTeam).where(
                    ProjectTeam.project_id == project_id
                ).limit(1)
                result = await self.db.execute(project_team_stmt)
                project_team = result.scalar_one_or_none()
                if project_team:
                    team_id = project_team.team_id
                    logger.info(f"[CREATE_TASK] Found team_id: {team_id} for project: {project_id}")
                else:
                    logger.warning(f"[CREATE_TASK] No team found for project: {project_id}")
            except Exception as e:
                logger.error(f"[CREATE_TASK] Failed to look up team for project: {e}")

        logger.info(f"[CREATE_TASK] Creating task: title='{title}', project_id={project_id}, team_id={team_id}, sprint_id={sprint_id}, workspace_id={workspace_id}")

        try:
            # Create the task
            task = SprintTask(
                id=str(uuid4()),
                workspace_id=workspace_id,
                team_id=team_id,  # From project lookup, or None for workspace-level tasks
                sprint_id=sprint_id,  # Can be None for backlog tasks
                source_type="automation",
                source_id=str(uuid4()),  # Unique ID for this automated task
                title=title,
                description=description,
                priority=priority,
                assignee_id=assignee_id,
                labels=labels if isinstance(labels, list) else [],
                status="todo",
                end_date=due_date,
            )
            self.db.add(task)
            await self.db.flush()
            await self.db.refresh(task)

            logger.info(f"[CREATE_TASK] Task created successfully: id={task.id}, title='{task.title}', team_id={task.team_id}")

            return {
                "success": True,
                "task_id": task.id,
                "title": task.title,
                "status": task.status,
                "workspace_id": workspace_id,
                "team_id": team_id,
                "project_id": project_id,
                "sprint_id": sprint_id,
            }
        except Exception as e:
            logger.error(f"[CREATE_TASK] Failed to create task: {e}", exc_info=True)
            return {"error": str(e)}

    async def _action_send_slack(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
    ) -> dict:
        """Send Slack notification to a channel or DM to a user.

        Config options:
        - channel/channel_id: Slack channel ID (e.g., "C1234567890") for channel messages
        - user_email: Email address to send DM to (e.g., "john@company.com")
        - user_email_field: Record field containing email to send DM to (e.g., "owner_email")
        - message/message_template: Message template with {field_name} or {{trigger.field}} placeholders
        """
        # Support both naming conventions (workflow uses channel_id/message_template)
        channel = config.get("channel") or config.get("channel_id")
        user_email = config.get("user_email")
        user_email_field = config.get("user_email_field")
        message_template = config.get("message") or config.get("message_template", "")

        # Get Slack integration for workspace
        slack_service = SlackIntegrationService()
        integration = await slack_service.get_integration_by_workspace(
            workspace_id, self.db
        )

        if not integration:
            return {
                "error": "No Slack integration found for workspace",
                "text": message_template,
            }

        # Determine the target (channel or user DM)
        target_id = None
        target_type = None
        target_email = None

        if channel:
            target_id = channel
            target_type = "channel"
        elif user_email:
            # Direct email provided - look up Slack user
            target_email = user_email
            slack_user_id = await self._get_slack_user_by_email(
                integration.user_mappings or {}, user_email
            )
            if slack_user_id:
                target_id = slack_user_id
                target_type = "dm"
            else:
                return {
                    "error": f"No Slack user found for email '{user_email}'",
                    "email": user_email,
                }
        elif user_email_field and record:
            # Get email from record field
            target_email = record.values.get(user_email_field)
            if target_email:
                slack_user_id = await self._get_slack_user_by_email(
                    integration.user_mappings or {}, target_email
                )
                if slack_user_id:
                    target_id = slack_user_id
                    target_type = "dm"
                else:
                    return {
                        "error": f"No Slack user found for email in field '{user_email_field}'",
                        "email": target_email,
                    }
            else:
                return {
                    "error": f"Record field '{user_email_field}' is empty or not found",
                }

        if not target_id:
            return {"error": "No channel, user_email, or user_email_field specified for Slack notification"}

        # Routed through the shared placeholder helper rather than a private
        # copy, so Slack supports the same set every other action does —
        # notably {{record.name}} and {{record.values.x}}, which the previous
        # local implementation left in the message as literal text.
        message = self._replace_placeholders(message_template, record, trigger_data)

        # Send the message
        slack_message = SlackMessage(text=message)
        response = await slack_service.send_message(
            integration=integration,
            channel_id=target_id,
            message=slack_message,
            notification_type=SlackNotificationType.AUTOMATION,
            db=self.db,
        )

        return {
            "success": response.success,
            "target": target_id,
            "target_type": target_type,
            "target_email": target_email,
            "text": message,
            "message_ts": response.message_ts,
            "error": response.error,
        }

    async def _get_slack_user_by_email(
        self, user_mappings: dict, email: str
    ) -> str | None:
        """Find Slack user ID for a given email address.

        Looks up developer by email, then finds their Slack user ID from mappings.
        """
        # Find developer by email
        result = await self.db.execute(
            select(Developer).where(Developer.email == email)
        )
        developer = result.scalar_one_or_none()

        if not developer:
            return None

        # Reverse lookup: find slack_user_id for this developer_id
        for slack_user_id, dev_id in user_mappings.items():
            if dev_id == developer.id:
                return slack_user_id

        return None

    async def _action_send_email(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
        automation_run_id: str | None = None,
        automation_step_order: int | None = None,
        outbox_run_id: str | None = None,
    ) -> dict:
        """Send an email notification.

        Config options:
        - to: Direct email address or {{record.values.field}} from the record
        - email_field: Record field containing the email address
        - email_subject: Subject line with record and trigger placeholders
        - email_body: Email body with record and trigger placeholders
        """
        # The payload's run id is only set when the worker should reconcile
        # against a step; the outbox row itself always belongs to its run.
        outbox_run_id = outbox_run_id or automation_run_id
        email_to = self._replace_placeholders(
            str(config.get("to") or ""), record, trigger_data
        ).strip()

        # If no direct email, try to get from record field
        if not email_to and record:
            email_field = config.get("email_field", "email")
            email_to = record.values.get(email_field)

        if not email_to:
            return {"error": "No recipient email address specified"}

        subject = self._replace_placeholders(
            str(config.get("email_subject") or ""), record, trigger_data
        )
        body = self._replace_placeholders(
            str(config.get("email_body") or ""), record, trigger_data
        )

        # Record the intent to send in this same transaction rather than
        # starting the workflow here. Dispatching inline handed work to the
        # worker before the run (and its step list, written only after this
        # returns) was committed, so the worker found nothing and gave up,
        # stranding the run on "queued". An outbox row cannot exist unless the
        # run does, so that ordering problem cannot happen at all.
        #
        # Every automation email goes through here, including each recipient of
        # a multi-recipient notification. Those carry no run reference in the
        # payload, because the worker matches a result to one step and would
        # let the first recipient's outcome close a run the others are still
        # working through - but they are still written and committed with the
        # run, so an undone record change undoes its emails too.
        if outbox_run_id is not None:
            self.db.add(
                CRMAutomationEmailOutbox(
                    id=str(uuid4()),
                    automation_run_id=outbox_run_id,
                    step_order=automation_step_order or 0,
                    payload={
                        "workspace_id": workspace_id,
                        "to_email": email_to,
                        "subject": subject,
                        "html_body": body,
                        "record_id": record.id if record else None,
                        "automation_run_id": automation_run_id,
                        "automation_step_order": automation_step_order,
                    },
                    status="pending",
                )
            )
            # Tells the request path what to drain once it commits, so
            # delivery stays near-instant instead of waiting for the sweep.
            # Scoped to this run's emails: a user's request should not be made
            # to carry every other workspace's pending work.
            self.db.info.setdefault("automation_outbox_pending", set()).add(
                outbox_run_id
            )
        else:
            # No run at all (direct/manual send). Nothing to strand.
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.email import SendWorkflowEmailInput

            await dispatch(
                "send_workflow_email",
                SendWorkflowEmailInput(
                    workspace_id=workspace_id,
                    to_email=email_to,
                    subject=subject,
                    html_body=body,
                    record_id=record.id if record else None,
                ),
                task_queue=TaskQueue.EMAIL,
            )

        return {
            "success": True,
            "to": email_to,
            "subject": subject,
            "queued": True,
        }

    # =========================================================================
    # UPTIME MODULE ACTIONS
    # =========================================================================

    async def _action_pause_monitor(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Pause an uptime monitor.

        Config options:
        - monitor_id: Direct monitor ID (optional, falls back to trigger_data)
        """
        from aexy.services.uptime_service import UptimeService, MonitorNotFoundError

        # Get monitor_id from config or trigger_data
        monitor_id = config.get("monitor_id")
        if not monitor_id and trigger_data:
            monitor_id = trigger_data.get("monitor_id")

        if not monitor_id:
            return {"error": "No monitor_id specified"}

        try:
            uptime_service = UptimeService(self.db)
            monitor = await uptime_service.pause_monitor(monitor_id)
            return {
                "success": True,
                "monitor_id": monitor.id,
                "monitor_name": monitor.name,
                "status": monitor.current_status,
            }
        except MonitorNotFoundError:
            return {"error": f"Monitor {monitor_id} not found"}
        except Exception as e:
            return {"error": str(e)}

    async def _action_resume_monitor(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Resume a paused uptime monitor.

        Config options:
        - monitor_id: Direct monitor ID (optional, falls back to trigger_data)
        """
        from aexy.services.uptime_service import UptimeService, MonitorNotFoundError

        # Get monitor_id from config or trigger_data
        monitor_id = config.get("monitor_id")
        if not monitor_id and trigger_data:
            monitor_id = trigger_data.get("monitor_id")

        if not monitor_id:
            return {"error": "No monitor_id specified"}

        try:
            uptime_service = UptimeService(self.db)
            monitor = await uptime_service.resume_monitor(monitor_id)
            return {
                "success": True,
                "monitor_id": monitor.id,
                "monitor_name": monitor.name,
                "status": monitor.current_status,
            }
        except MonitorNotFoundError:
            return {"error": f"Monitor {monitor_id} not found"}
        except Exception as e:
            return {"error": str(e)}

    async def _action_create_incident(
        self,
        config: dict,
        trigger_data: dict | None = None,
        workspace_id: str | None = None,
    ) -> dict:
        """Create an uptime incident manually.

        Config options:
        - monitor_id: Monitor to create incident for
        - error_message: Error message for the incident
        - error_type: Type of error (e.g., 'manual', 'timeout', 'connection')
        """
        from aexy.models.uptime import UptimeIncident, UptimeIncidentStatus
        from aexy.services.uptime_service import UptimeService, MonitorNotFoundError

        # Get monitor_id from config or trigger_data
        monitor_id = config.get("monitor_id")
        if not monitor_id and trigger_data:
            monitor_id = trigger_data.get("monitor_id")

        if not monitor_id:
            return {"error": "No monitor_id specified"}

        error_message = config.get("error_message", "Manual incident created by automation")
        error_type = config.get("error_type", "manual")

        try:
            uptime_service = UptimeService(self.db)
            monitor = await uptime_service.get_monitor(monitor_id)
            if not monitor:
                return {"error": f"Monitor {monitor_id} not found"}

            # Check for existing ongoing incident
            existing = await uptime_service.get_ongoing_incident(monitor_id)
            if existing:
                return {
                    "success": False,
                    "message": "An ongoing incident already exists",
                    "incident_id": existing.id,
                }

            # Create new incident
            incident = UptimeIncident(
                id=str(uuid4()),
                monitor_id=monitor_id,
                workspace_id=monitor.workspace_id,
                status=UptimeIncidentStatus.ONGOING.value,
                first_error_message=error_message,
                first_error_type=error_type,
                last_error_message=error_message,
                last_error_type=error_type,
                total_checks=0,
                failed_checks=0,
            )
            self.db.add(incident)
            await self.db.flush()
            await self.db.refresh(incident)

            return {
                "success": True,
                "incident_id": incident.id,
                "monitor_id": monitor_id,
                "monitor_name": monitor.name,
                "status": incident.status,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_resolve_incident(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Resolve an uptime incident.

        Config options:
        - incident_id: Direct incident ID
        - monitor_id: Resolve the ongoing incident for this monitor
        - resolution_notes: Notes about the resolution
        - root_cause: Root cause analysis
        """
        from aexy.services.uptime_service import UptimeService, IncidentNotFoundError
        from aexy.schemas.uptime import UptimeIncidentResolve

        # Get incident_id from config or trigger_data
        incident_id = config.get("incident_id")
        if not incident_id and trigger_data:
            incident_id = trigger_data.get("incident_id")

        # If no incident_id, try to find ongoing incident by monitor_id
        monitor_id = config.get("monitor_id")
        if not monitor_id and trigger_data:
            monitor_id = trigger_data.get("monitor_id")

        uptime_service = UptimeService(self.db)

        if not incident_id and monitor_id:
            # Find ongoing incident for this monitor
            ongoing = await uptime_service.get_ongoing_incident(monitor_id)
            if ongoing:
                incident_id = ongoing.id

        if not incident_id:
            return {"error": "No incident_id or monitor_id with ongoing incident specified"}

        resolution_notes = config.get("resolution_notes", "Resolved by automation")
        root_cause = config.get("root_cause")

        try:
            resolve_data = UptimeIncidentResolve(
                resolution_notes=resolution_notes,
                root_cause=root_cause,
            )
            incident = await uptime_service.resolve_incident(incident_id, resolve_data)
            return {
                "success": True,
                "incident_id": incident.id,
                "status": incident.status,
                "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
            }
        except IncidentNotFoundError:
            return {"error": f"Incident {incident_id} not found"}
        except Exception as e:
            return {"error": str(e)}

    # =========================================================================
    # COMMON NOTIFICATION ACTIONS
    # =========================================================================

    async def _action_notify_user(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
        automation_run_id: str | None = None,
        automation_step_order: int | None = None,
    ) -> dict:
        """Send notification to a specific user via their preferred channel (Slack DM, email).

        Config options:
        - notify_type: 'workspace_admin' notifies every owner/admin of the
          workspace (skipping whoever triggered the change). Anything else
          falls back to the single-user resolution below.
        - user_id: Developer ID to notify
        - user_email: Direct email address to notify (fallback if user_id not provided)
        - message: Message content
        - channel: Notification channel ('slack', 'email', 'both') - defaults to 'email'
        """
        notify_type = config.get("notify_type")
        user_id = config.get("user_id")
        user_email = config.get("user_email") or config.get("notify_email")
        # The builder writes notify_message/notify_title; accept both spellings
        # or a UI-configured node sends an empty body.
        message_template = config.get("message") or config.get("notify_message", "")
        subject = config.get("email_subject") or config.get("notify_title", "Notification")
        channel = config.get("channel", "email")

        # Replace placeholders in message
        message = self._replace_placeholders(message_template, record, trigger_data)

        results = {"channels_notified": []}
        recipient_emails: list[str] = []

        if notify_type == "workspace_admin":
            from aexy.services.workspace_service import WorkspaceService

            # Don't notify the person who caused the change about their own action.
            actor_id = (trigger_data or {}).get("changed_by_id")
            members = await WorkspaceService(self.db).get_workspace_admins(workspace_id)
            admin_emails = {
                str(member.developer.id): member.developer.email
                for member in members
                if member.developer and member.developer.email
            }
            recipient_emails = [
                email
                for developer_id, email in admin_emails.items()
                if developer_id != str(actor_id)
            ]
            if not recipient_emails:
                # Nobody left only because the sole admin is the actor: the
                # intent ("don't tell someone about their own action") is
                # satisfied, so this is a no-op, not a failed run.
                if admin_emails:
                    return {
                        "success": True,
                        "skipped": True,
                        "reason": "Only workspace admin is the person who made the change",
                    }
                return {"error": "No workspace owners or admins to notify"}
        else:
            if not user_id and not user_email:
                return {"error": "No user_id or user_email specified"}

            # A configured specific email is a delivery address, not an Aexy
            # user lookup. Only a selected internal user needs resolving.
            if user_id:
                result = await self.db.execute(
                    select(Developer).where(Developer.id == user_id)
                )
                developer = result.scalar_one_or_none()
                if not developer or not developer.email:
                    return {"error": f"User not found: {user_id}"}
                recipient_emails = [developer.email]
            else:
                recipient_emails = [str(user_email)]

        for recipient_email in recipient_emails:
            # Send Slack notification
            if channel in ("slack", "both"):
                slack_result = await self._action_send_slack(
                    {"user_email": recipient_email, "message": message},
                    record,
                    workspace_id,
                    trigger_data,
                )
                if slack_result.get("success"):
                    results["channels_notified"].append("slack")
                results["slack"] = slack_result

            # Send email notification
            if channel in ("email", "both"):
                email_result = await self._action_send_email(
                    {
                        "to": recipient_email,
                        "email_subject": subject,
                        "email_body": message,
                    },
                    record,
                    workspace_id,
                    trigger_data,
                    automation_run_id if len(recipient_emails) == 1 else None,
                    automation_step_order if len(recipient_emails) == 1 else None,
                    # The row still belongs to this run even when the worker
                    # must not reconcile against it, so a rolled-back record
                    # change takes every recipient's email with it.
                    outbox_run_id=automation_run_id,
                )
                if email_result.get("success"):
                    results["channels_notified"].append("email")
                results["email"] = email_result

        results["recipients_notified"] = len(recipient_emails)
        results["success"] = len(results["channels_notified"]) > 0
        # A delivery failure is nested under results["slack"]/["email"], but the
        # executor only fails a step on a top-level "error". Surface it, or a
        # notification that delivered nothing is recorded as a success.
        if not results["channels_notified"]:
            results["error"] = "No notification could be delivered"
        if len(recipient_emails) == 1 and results.get("email", {}).get("queued"):
            results["queued"] = True
        return results

    async def _action_notify_team(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
    ) -> dict:
        """Send notification to an entire team via Slack channel.

        Config options:
        - team_id: Team ID to notify
        - channel_id: Slack channel to use (optional - falls back to workspace default)
        - message: Message content
        """
        from aexy.models.team import Team

        team_id = config.get("team_id")
        channel_id = config.get("channel_id")
        message_template = config.get("message", "")

        # Replace placeholders in message
        message = self._replace_placeholders(message_template, record, trigger_data)

        if not team_id and not channel_id:
            return {"error": "No team_id or channel_id specified"}

        # If team_id provided, try to get team's Slack channel
        if team_id and not channel_id:
            result = await self.db.execute(
                select(Team).where(Team.id == team_id)
            )
            team = result.scalar_one_or_none()
            if team:
                # Check if team has a slack_channel_id attribute
                channel_id = getattr(team, "slack_channel_id", None)

        # Fall back to sending to workspace default channel
        if not channel_id:
            slack_service = SlackIntegrationService()
            integration = await slack_service.get_integration_by_workspace(
                workspace_id, self.db
            )
            if integration:
                channel_id = integration.default_channel_id

        if not channel_id:
            return {"error": "No channel available for team notification"}

        # Send to the channel
        return await self._action_send_slack(
            {"channel_id": channel_id, "message": message},
            record,
            workspace_id,
            trigger_data,
        )

    def _replace_placeholders(
        self,
        template: str,
        record: CRMRecord | None,
        trigger_data: dict | None,
    ) -> str:
        """Replace supported record and trigger placeholders in a CRM action."""
        record_values = record.values if record else {}
        record_name = (
            getattr(record, "name", None) or getattr(record, "display_name", None)
            if record else None
        )

        def lookup(data: dict | None, path: str) -> Any:
            value: Any = data or {}
            for part in path.split("."):
                if not isinstance(value, dict):
                    return None
                value = value.get(part)
            return value

        def replace_double_braces(match: re.Match[str]) -> str:
            path = match.group(1).strip()
            value: Any = None

            if path == "record.id":
                value = record.id if record else None
            elif path in {"record.name", "record.display_name"}:
                value = record_name
            elif path.startswith("record.values."):
                value = lookup(record_values, path.removeprefix("record.values."))
            elif path.startswith("trigger."):
                value = lookup(trigger_data, path.removeprefix("trigger."))
            else:
                return match.group(0)

            return "" if value is None else str(value)

        message = re.sub(
            r"\{\{([^{}]+)\}\}",
            replace_double_braces,
            template,
        )

        if record:
            message = message.replace("{record_id}", str(record.id))
            if record_name:
                message = message.replace("{record_name}", str(record_name))

        def replace_legacy_field(match: re.Match[str]) -> str:
            field = match.group(1)
            value = (trigger_data or {}).get(field)
            if value is None:
                value = record_values.get(field)
            return match.group(0) if value is None else str(value)

        return re.sub(r"\{([a-zA-Z0-9_]+)\}", replace_legacy_field, message)

    # =========================================================================
    # SPRINT MODULE ACTIONS
    # =========================================================================

    async def _action_update_task(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Update a sprint task.

        Config options:
        - task_id: Task ID to update
        - title: New title
        - description: New description
        - priority: New priority (critical, high, medium, low)
        - status: New status (backlog, todo, in_progress, review, done)
        - story_points: New story points
        - labels: New labels list
        """
        from aexy.services.sprint_task_service import SprintTaskService

        task_id = config.get("task_id")
        if not task_id and trigger_data:
            task_id = trigger_data.get("task_id")

        if not task_id:
            return {"error": "No task_id specified"}

        task_service = SprintTaskService(self.db)

        try:
            task = await task_service.update_task(
                task_id=task_id,
                title=config.get("title"),
                description=config.get("description"),
                priority=config.get("priority"),
                status=config.get("status"),
                story_points=config.get("story_points"),
                labels=config.get("labels"),
            )
            if not task:
                return {"error": f"Task {task_id} not found"}
            return {
                "success": True,
                "task_id": task.id,
                "title": task.title,
                "status": task.status,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_assign_task(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Assign a sprint task to a developer.

        Config options:
        - task_id: Task ID to assign
        - developer_id/assignee_id: Developer ID to assign
        - reason: Assignment reason
        """
        from aexy.services.sprint_task_service import SprintTaskService

        task_id = config.get("task_id")
        if not task_id and trigger_data:
            task_id = trigger_data.get("task_id")

        developer_id = config.get("developer_id") or config.get("assignee_id")
        if not developer_id and trigger_data:
            developer_id = trigger_data.get("assignee_id")

        if not task_id:
            return {"error": "No task_id specified"}
        if not developer_id:
            return {"error": "No developer_id/assignee_id specified"}

        task_service = SprintTaskService(self.db)

        try:
            task = await task_service.assign_task(
                task_id=task_id,
                developer_id=developer_id,
                reason=config.get("reason", "Assigned by automation"),
            )
            if not task:
                return {"error": f"Task {task_id} not found"}
            return {
                "success": True,
                "task_id": task.id,
                "assignee_id": task.assignee_id,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_move_task(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Move a sprint task to a different status/column.

        Config options:
        - task_id: Task ID to move
        - status: New status (backlog, todo, in_progress, review, done)
        - sprint_id: Optional sprint ID to move to a different sprint
        """
        from aexy.services.sprint_task_service import SprintTaskService

        task_id = config.get("task_id")
        if not task_id and trigger_data:
            task_id = trigger_data.get("task_id")

        new_status = config.get("status")
        new_sprint_id = config.get("sprint_id")

        if not task_id:
            return {"error": "No task_id specified"}
        if not new_status and not new_sprint_id:
            return {"error": "No status or sprint_id specified"}

        task_service = SprintTaskService(self.db)

        try:
            if new_status:
                task = await task_service.update_task_status(task_id, new_status)
            else:
                # Just get the task first
                task = await task_service.get_task(task_id)

            if not task:
                return {"error": f"Task {task_id} not found"}

            # Move to different sprint if specified
            if new_sprint_id:
                tasks = await task_service.bulk_move_to_sprint([task_id], new_sprint_id)
                if not tasks:
                    return {"error": f"Failed to move task to sprint {new_sprint_id}"}
                task = tasks[0]

            return {
                "success": True,
                "task_id": task.id,
                "status": task.status,
                "sprint_id": task.sprint_id,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_create_subtask(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Create a subtask under a parent task.

        Config options:
        - parent_task_id: Parent task ID
        - title: Subtask title
        - description: Subtask description
        - priority: Priority level
        - assignee_id: Optional assignee
        """
        from aexy.services.sprint_task_service import SprintTaskService

        parent_task_id = config.get("parent_task_id")
        if not parent_task_id and trigger_data:
            parent_task_id = trigger_data.get("task_id")

        title = config.get("title", "Subtask")
        if not parent_task_id:
            return {"error": "No parent_task_id specified"}

        task_service = SprintTaskService(self.db)

        try:
            # Get parent task to find sprint_id
            parent = await task_service.get_task(parent_task_id)
            if not parent:
                return {"error": f"Parent task {parent_task_id} not found"}

            subtask = await task_service.add_task(
                sprint_id=parent.sprint_id,
                title=title,
                description=config.get("description"),
                priority=config.get("priority", "medium"),
                assignee_id=config.get("assignee_id"),
                parent_task_id=parent_task_id,
                status="todo",
            )
            return {
                "success": True,
                "subtask_id": subtask.id,
                "parent_task_id": parent_task_id,
                "title": subtask.title,
            }
        except Exception as e:
            return {"error": str(e)}

    # =========================================================================
    # TICKET MODULE ACTIONS
    # =========================================================================

    async def _action_update_ticket(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Update a ticket.

        Config options:
        - ticket_id: Ticket ID to update
        - status: New status
        - priority: New priority
        - severity: New severity
        """
        from aexy.services.ticket_service import TicketService
        from aexy.schemas.ticketing import TicketUpdate

        ticket_id = config.get("ticket_id")
        if not ticket_id and trigger_data:
            ticket_id = trigger_data.get("ticket_id")

        if not ticket_id:
            return {"error": "No ticket_id specified"}

        ticket_service = TicketService(self.db)

        try:
            update_data = TicketUpdate(
                status=config.get("status"),
                priority=config.get("priority"),
                severity=config.get("severity"),
            )
            ticket = await ticket_service.update_ticket(ticket_id, update_data)
            if not ticket:
                return {"error": f"Ticket {ticket_id} not found"}
            return {
                "success": True,
                "ticket_id": ticket.id,
                "ticket_number": ticket.ticket_number,
                "status": ticket.status,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_assign_ticket(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Assign a ticket to a developer or team.

        Config options:
        - ticket_id: Ticket ID to assign
        - assignee_id: Developer ID to assign
        - team_id: Team ID to assign
        """
        from aexy.services.ticket_service import TicketService

        ticket_id = config.get("ticket_id")
        if not ticket_id and trigger_data:
            ticket_id = trigger_data.get("ticket_id")

        if not ticket_id:
            return {"error": "No ticket_id specified"}

        ticket_service = TicketService(self.db)

        try:
            ticket = await ticket_service.assign_ticket(
                ticket_id=ticket_id,
                assignee_id=config.get("assignee_id"),
                team_id=config.get("team_id"),
            )
            if not ticket:
                return {"error": f"Ticket {ticket_id} not found"}
            return {
                "success": True,
                "ticket_id": ticket.id,
                "assignee_id": ticket.assignee_id,
                "team_id": ticket.team_id,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_escalate_ticket(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Escalate a ticket.

        Config options:
        - ticket_id: Ticket ID to escalate
        - level: Escalation level (level_1, level_2, level_3)
        """
        from aexy.services.ticket_service import TicketService

        ticket_id = config.get("ticket_id")
        if not ticket_id and trigger_data:
            ticket_id = trigger_data.get("ticket_id")

        level = config.get("level", "level_1")

        if not ticket_id:
            return {"error": "No ticket_id specified"}

        ticket_service = TicketService(self.db)

        try:
            ticket = await ticket_service.get_ticket(ticket_id)
            if not ticket:
                return {"error": f"Ticket {ticket_id} not found"}

            escalation = await ticket_service.trigger_escalation(ticket, level)
            if not escalation:
                return {
                    "success": False,
                    "message": "No matching escalation matrix found",
                    "ticket_id": ticket_id,
                }
            return {
                "success": True,
                "ticket_id": ticket_id,
                "escalation_id": escalation.id,
                "level": escalation.level,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_change_ticket_priority(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Change a ticket's priority.

        Config options:
        - ticket_id: Ticket ID
        - priority: New priority (urgent, high, medium, low)
        """
        from aexy.services.ticket_service import TicketService
        from aexy.schemas.ticketing import TicketUpdate

        ticket_id = config.get("ticket_id")
        if not ticket_id and trigger_data:
            ticket_id = trigger_data.get("ticket_id")

        priority = config.get("priority")
        if not ticket_id:
            return {"error": "No ticket_id specified"}
        if not priority:
            return {"error": "No priority specified"}

        ticket_service = TicketService(self.db)

        try:
            update_data = TicketUpdate(priority=priority)
            ticket = await ticket_service.update_ticket(ticket_id, update_data)
            if not ticket:
                return {"error": f"Ticket {ticket_id} not found"}
            return {
                "success": True,
                "ticket_id": ticket.id,
                "priority": ticket.priority,
            }
        except Exception as e:
            return {"error": str(e)}

    # =========================================================================
    # HIRING MODULE ACTIONS
    # =========================================================================

    async def _action_update_candidate(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Update a hiring candidate's custom fields.

        Config options:
        - candidate_id: Candidate ID to update
        - status: New status (stored in custom_fields)
        - notes: Additional notes (stored in custom_fields)
        - rating: Candidate rating (stored in custom_fields)
        - custom_data: Additional custom data to merge
        """
        from aexy.models.assessment import Candidate

        candidate_id = config.get("candidate_id")
        if not candidate_id and trigger_data:
            candidate_id = trigger_data.get("candidate_id")

        if not candidate_id:
            return {"error": "No candidate_id specified"}

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()

            if not candidate:
                return {"error": f"Candidate {candidate_id} not found"}

            # Update custom_fields with status, notes, rating
            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}

            if config.get("status"):
                custom_fields["hiring_status"] = config["status"]
            if config.get("notes"):
                existing_notes = custom_fields.get("notes", "")
                if existing_notes:
                    custom_fields["notes"] = f"{existing_notes}\n\n---\n{config['notes']}"
                else:
                    custom_fields["notes"] = config["notes"]
            if config.get("rating"):
                custom_fields["rating"] = config["rating"]
            if config.get("custom_data"):
                custom_fields.update(config["custom_data"])

            candidate.custom_fields = custom_fields

            await self.db.flush()
            await self.db.refresh(candidate)

            return {
                "success": True,
                "candidate_id": candidate.id,
                "custom_fields": candidate.custom_fields,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_move_candidate_stage(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Move a candidate to a different hiring stage.

        Config options:
        - candidate_id: Candidate ID
        - stage: New stage (applied, screening, interviewing, offer, hired, rejected)
        """
        from aexy.models.assessment import Candidate

        candidate_id = config.get("candidate_id")
        if not candidate_id and trigger_data:
            candidate_id = trigger_data.get("candidate_id")

        new_stage = config.get("stage")
        if not candidate_id:
            return {"error": "No candidate_id specified"}
        if not new_stage:
            return {"error": "No stage specified"}

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()

            if not candidate:
                return {"error": f"Candidate {candidate_id} not found"}

            # Store stage in custom_fields since Candidate doesn't have a status field
            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            old_stage = custom_fields.get("hiring_status", "applied")
            custom_fields["hiring_status"] = new_stage
            custom_fields["stage_changed_at"] = datetime.now(timezone.utc).isoformat()
            candidate.custom_fields = custom_fields

            await self.db.flush()
            await self.db.refresh(candidate)

            return {
                "success": True,
                "candidate_id": candidate.id,
                "old_stage": old_stage,
                "new_stage": new_stage,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_schedule_interview(
        self,
        config: dict,
        trigger_data: dict | None = None,
        workspace_id: str | None = None,
    ) -> dict:
        """Schedule an interview for a candidate.

        Config options:
        - candidate_id: Candidate ID
        - interviewer_id: Developer ID of the interviewer
        - interview_type: Type of interview (phone, video, onsite)
        - scheduled_at: ISO datetime for the interview
        - duration_minutes: Duration of the interview
        - notes: Additional notes for the interview
        """
        from aexy.models.assessment import Candidate

        candidate_id = config.get("candidate_id")
        if not candidate_id and trigger_data:
            candidate_id = trigger_data.get("candidate_id")

        if not candidate_id:
            return {"error": "No candidate_id specified"}

        interviewer_id = config.get("interviewer_id")
        interview_type = config.get("interview_type", "video")
        scheduled_at = config.get("scheduled_at")
        duration_minutes = config.get("duration_minutes", 60)
        notes = config.get("notes", "")

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()

            if not candidate:
                return {"error": f"Candidate {candidate_id} not found"}

            # Store interview info in custom_fields
            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}

            # Update status to interviewing
            current_status = custom_fields.get("hiring_status", "applied")
            if current_status not in ("interviewing", "offer", "hired"):
                custom_fields["hiring_status"] = "interviewing"

            interview_data = {
                "interviewer_id": interviewer_id,
                "interview_type": interview_type,
                "scheduled_at": scheduled_at,
                "duration_minutes": duration_minutes,
                "notes": notes,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            # Add to scheduled interviews list in custom_fields
            interviews = custom_fields.get("scheduled_interviews", [])
            if not isinstance(interviews, list):
                interviews = []
            interviews.append(interview_data)
            custom_fields["scheduled_interviews"] = interviews

            candidate.custom_fields = custom_fields

            await self.db.flush()
            await self.db.refresh(candidate)

            return {
                "success": True,
                "candidate_id": candidate.id,
                "interview_type": interview_type,
                "scheduled_at": scheduled_at,
                "interviewer_id": interviewer_id,
            }
        except Exception as e:
            return {"error": str(e)}

    # =========================================================================
    # BOOKING MODULE ACTIONS
    # =========================================================================

    async def _action_confirm_booking(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Confirm a booking.

        Config options:
        - booking_id: Booking ID to confirm
        """
        from aexy.models.booking.booking import Booking

        booking_id = config.get("booking_id")
        if not booking_id and trigger_data:
            booking_id = trigger_data.get("booking_id")

        if not booking_id:
            return {"error": "No booking_id specified"}

        try:
            stmt = select(Booking).where(Booking.id == booking_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                return {"error": f"Booking {booking_id} not found"}

            booking.status = "confirmed"

            await self.db.flush()
            await self.db.refresh(booking)

            return {
                "success": True,
                "booking_id": booking.id,
                "status": booking.status,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_cancel_booking(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Cancel a booking.

        Config options:
        - booking_id: Booking ID to cancel
        - reason: Cancellation reason
        """
        from aexy.models.booking.booking import Booking

        booking_id = config.get("booking_id")
        if not booking_id and trigger_data:
            booking_id = trigger_data.get("booking_id")

        if not booking_id:
            return {"error": "No booking_id specified"}

        try:
            stmt = select(Booking).where(Booking.id == booking_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                return {"error": f"Booking {booking_id} not found"}

            booking.status = "cancelled"
            booking.cancelled_at = datetime.now(timezone.utc)
            booking.cancellation_reason = config.get("reason", "Cancelled by automation")
            booking.cancelled_by = "system"

            await self.db.flush()
            await self.db.refresh(booking)

            return {
                "success": True,
                "booking_id": booking.id,
                "status": booking.status,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_reschedule_booking(
        self,
        config: dict,
        trigger_data: dict | None = None,
    ) -> dict:
        """Reschedule a booking.

        Config options:
        - booking_id: Booking ID to reschedule
        - new_start_time: New start time (ISO datetime)
        - new_end_time: New end time (ISO datetime)
        - reason: Reason for rescheduling (stored in answers)
        """
        from aexy.models.booking.booking import Booking

        booking_id = config.get("booking_id")
        if not booking_id and trigger_data:
            booking_id = trigger_data.get("booking_id")

        if not booking_id:
            return {"error": "No booking_id specified"}

        new_start_time = config.get("new_start_time")
        new_end_time = config.get("new_end_time")

        if not new_start_time:
            return {"error": "No new_start_time specified"}

        try:
            stmt = select(Booking).where(Booking.id == booking_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                return {"error": f"Booking {booking_id} not found"}

            # Store old times for reference
            old_start = booking.start_time
            old_end = booking.end_time

            # Parse and update times
            from dateutil.parser import parse as parse_datetime
            booking.start_time = parse_datetime(new_start_time)
            if new_end_time:
                booking.end_time = parse_datetime(new_end_time)

            # Store reschedule info in answers field (JSONB)
            answers = dict(booking.answers) if booking.answers else {}
            answers["reschedule_history"] = answers.get("reschedule_history", [])
            answers["reschedule_history"].append({
                "old_start": old_start.isoformat() if old_start else None,
                "old_end": old_end.isoformat() if old_end else None,
                "new_start": new_start_time,
                "new_end": new_end_time,
                "reason": config.get("reason", "Rescheduled by automation"),
                "rescheduled_at": datetime.now(timezone.utc).isoformat(),
            })
            booking.answers = answers

            # Keep status as confirmed (rescheduled is not a valid BookingStatus)
            booking.status = "confirmed"

            await self.db.flush()
            await self.db.refresh(booking)

            return {
                "success": True,
                "booking_id": booking.id,
                "old_start_time": old_start.isoformat() if old_start else None,
                "new_start_time": booking.start_time.isoformat() if booking.start_time else None,
                "status": booking.status,
            }
        except Exception as e:
            return {"error": str(e)}

    async def _action_run_agent(
        self,
        config: dict,
        record: CRMRecord | None,
        workspace_id: str,
        trigger_data: dict | None = None,
        run_id: str | None = None,
    ) -> dict:
        """Run an AI agent as an automation action."""
        from aexy.services.automation_agent_service import AutomationAgentService
        from aexy.models.automation_agent import AgentTriggerPoint

        agent_id = config.get("agent_id")
        if not agent_id:
            return {"success": False, "error": "No agent_id specified in action config"}

        input_mapping = config.get("input_mapping")
        wait_for_completion = config.get("wait_for_completion", False)
        timeout_seconds = config.get("timeout_seconds", 300)

        # Build context from available data
        context = {
            "workspace_id": workspace_id,
            "trigger_data": trigger_data or {},
        }
        if record:
            context["record_id"] = str(record.id)
            context["record"] = {
                "values": record.values,
                "display_name": record.display_name,
            }

        agent_service = AutomationAgentService(self.db)
        try:
            execution = await agent_service.spawn_agent(
                agent_id=agent_id,
                trigger_point=AgentTriggerPoint.AS_ACTION.value,
                context=context,
                automation_run_id=run_id,
                input_mapping=input_mapping,
                wait_for_completion=wait_for_completion,
                timeout_seconds=timeout_seconds,
            )
            return {
                "success": True,
                "execution_id": str(execution.id),
                "agent_id": agent_id,
                "status": execution.status,
            }
        except ValueError as e:
            return {"success": False, "error": str(e)}

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
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMSequence]:
        """List sequences in a workspace."""
        stmt = select(CRMSequence).where(CRMSequence.workspace_id == workspace_id)

        if object_id:
            stmt = stmt.where(CRMSequence.object_id == object_id)
        if is_active is not None:
            stmt = stmt.where(CRMSequence.is_active == is_active)

        stmt = stmt.options(selectinload(CRMSequence.steps))
        stmt = stmt.order_by(CRMSequence.name)
        stmt = stmt.offset(skip).limit(limit)
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

    async def toggle_sequence(self, sequence_id: str) -> CRMSequence | None:
        """Toggle sequence active status."""
        sequence = await self.get_sequence(sequence_id)
        if not sequence:
            return None

        sequence.is_active = not sequence.is_active
        await self.db.flush()
        await self.db.refresh(sequence)
        return sequence

    # =========================================================================
    # SEQUENCE STEPS
    # =========================================================================

    async def get_step(self, step_id: str) -> CRMSequenceStep | None:
        """Get a sequence step by ID."""
        stmt = select(CRMSequenceStep).where(CRMSequenceStep.id == step_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_steps(self, sequence_id: str) -> list[CRMSequenceStep]:
        """List steps in a sequence."""
        stmt = (
            select(CRMSequenceStep)
            .where(CRMSequenceStep.sequence_id == sequence_id)
            .order_by(CRMSequenceStep.position)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def add_step(
        self,
        sequence_id: str,
        step_type: str,
        config: dict,
        delay_value: int | None = None,
        delay_unit: str = "days",
        position: int | None = None,
        # API-compatible params
        delay_days: int | None = None,
        delay_hours: int | None = None,
        order: int | None = None,
    ) -> CRMSequenceStep:
        """Add a step to a sequence."""
        # Handle API-compatible parameters
        if order is not None:
            position = order
        if delay_days is not None:
            delay_value = delay_days
            delay_unit = "days"
        elif delay_hours is not None:
            delay_value = delay_hours
            delay_unit = "hours"

        # Default delay_value if not set
        if delay_value is None:
            delay_value = 0

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
        step_id_or_ids: str | list[str],
        new_order: int | None = None,
    ) -> list[CRMSequenceStep]:
        """Reorder sequence steps.

        Can be called two ways:
        1. reorder_steps(sequence_id, step_ids: list) - reorder all steps
        2. reorder_steps(sequence_id, step_id, new_order) - move single step
        """
        if isinstance(step_id_or_ids, list):
            # Reorder all steps based on list order
            for position, step_id in enumerate(step_id_or_ids):
                stmt = select(CRMSequenceStep).where(
                    CRMSequenceStep.id == step_id,
                    CRMSequenceStep.sequence_id == sequence_id,
                )
                result = await self.db.execute(stmt)
                step = result.scalar_one_or_none()
                if step:
                    step.position = position
        else:
            # Move single step to new position
            step_id = step_id_or_ids
            if new_order is None:
                new_order = 0

            # Get all steps
            steps = await self.list_steps(sequence_id)

            # Find the step to move
            step_to_move = None
            for s in steps:
                if s.id == step_id:
                    step_to_move = s
                    break

            if step_to_move:
                old_position = step_to_move.position
                # Shift other steps
                for s in steps:
                    if s.id == step_id:
                        s.position = new_order
                    elif old_position < new_order:
                        # Moving down - shift items up
                        if old_position < s.position <= new_order:
                            s.position -= 1
                    else:
                        # Moving up - shift items down
                        if new_order <= s.position < old_position:
                            s.position += 1

        await self.db.flush()

        return await self.list_steps(sequence_id)

    # =========================================================================
    # ENROLLMENT
    # =========================================================================

    async def get_enrollment(self, enrollment_id: str) -> CRMSequenceEnrollment | None:
        """Get an enrollment by ID."""
        stmt = select(CRMSequenceEnrollment).where(CRMSequenceEnrollment.id == enrollment_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

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

    async def unenroll(
        self,
        enrollment_id: str,
        exit_reason: str = "manual",
    ) -> CRMSequenceEnrollment | None:
        """Alias for unenroll_record for API compatibility."""
        return await self.unenroll_record(enrollment_id, exit_reason)

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
        skip: int | None = None,  # API-compatible alias for offset
    ) -> list[CRMSequenceEnrollment]:
        """List sequence enrollments."""
        # Handle skip as alias for offset
        if skip is not None:
            offset = skip

        stmt = select(CRMSequenceEnrollment)

        if sequence_id:
            stmt = stmt.where(CRMSequenceEnrollment.sequence_id == sequence_id)
        if record_id:
            stmt = stmt.where(CRMSequenceEnrollment.record_id == record_id)
        if status:
            stmt = stmt.where(CRMSequenceEnrollment.status == status)

        stmt = stmt.order_by(CRMSequenceEnrollment.enrolled_at.desc())
        stmt = stmt.limit(limit).offset(offset)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

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
        object_id: str | None = None,  # API-compatible (not stored - webhooks aren't object-specific)
        created_by_id: str | None = None,  # API-compatible (not stored)
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
        object_id: str | None = None,  # Not used - webhooks aren't object-specific
        is_active: bool | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMWebhook]:
        """List webhooks in a workspace."""
        stmt = select(CRMWebhook).where(CRMWebhook.workspace_id == workspace_id)

        if is_active is not None:
            stmt = stmt.where(CRMWebhook.is_active == is_active)

        stmt = stmt.order_by(CRMWebhook.name)
        stmt = stmt.offset(skip).limit(limit)
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

    async def toggle_webhook(self, webhook_id: str) -> CRMWebhook | None:
        """Toggle webhook active status."""
        webhook = await self.get_webhook(webhook_id)
        if not webhook:
            return None

        webhook.is_active = not webhook.is_active
        await self.db.flush()
        await self.db.refresh(webhook)
        return webhook

    async def rotate_secret(self, webhook_id: str) -> CRMWebhook | None:
        """Rotate the webhook signing secret."""
        import secrets

        webhook = await self.get_webhook(webhook_id)
        if not webhook:
            return None

        webhook.secret = secrets.token_hex(32)
        await self.db.flush()
        await self.db.refresh(webhook)
        return webhook

    async def get_delivery(self, delivery_id: str) -> CRMWebhookDelivery | None:
        """Get a webhook delivery by ID."""
        stmt = select(CRMWebhookDelivery).where(CRMWebhookDelivery.id == delivery_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def deliver_webhook(self, webhook_id: str, payload: dict) -> CRMWebhookDelivery | None:
        """Deliver a payload to a specific webhook by ID."""
        webhook = await self.get_webhook(webhook_id)
        if not webhook:
            return None

        event_type = payload.get("event", "custom")
        await self._deliver_to_webhook(webhook, event_type, payload)

        # Return the latest delivery
        stmt = (
            select(CRMWebhookDelivery)
            .where(CRMWebhookDelivery.webhook_id == webhook_id)
            .order_by(CRMWebhookDelivery.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def retry_delivery(self, delivery_id: str) -> CRMWebhookDelivery | None:
        """Retry a failed webhook delivery."""
        delivery = await self.get_delivery(delivery_id)
        if not delivery:
            return None

        webhook = await self.get_webhook(delivery.webhook_id)
        if not webhook:
            return None

        # Create a new delivery attempt
        new_delivery = CRMWebhookDelivery(
            id=str(uuid4()),
            webhook_id=webhook.id,
            event_type=delivery.event_type,
            payload=delivery.payload,
            status="pending",
            attempt_number=delivery.attempt_number + 1,
        )
        self.db.add(new_delivery)
        await self.db.flush()

        # Execute the delivery
        await self._deliver_to_webhook(webhook, delivery.event_type, delivery.payload)

        return new_delivery

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
        skip: int | None = None,  # API-compatible alias for offset
    ) -> list[CRMWebhookDelivery]:
        """List webhook deliveries."""
        # Handle skip as alias for offset
        if skip is not None:
            offset = skip

        stmt = (
            select(CRMWebhookDelivery)
            .where(CRMWebhookDelivery.webhook_id == webhook_id)
            .order_by(CRMWebhookDelivery.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
