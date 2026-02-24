"""Platform-wide Automation service.

This service wraps CRMAutomationService with module-aware functionality,
enabling automations across all Aexy modules (CRM, Tickets, Hiring, etc.).
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.crm import (
    CRMAutomation,
    CRMAutomationRun,
)
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.schemas.automation import (
    AutomationModule,
    TRIGGER_REGISTRY,
    ACTION_REGISTRY,
    get_triggers_for_module,
    get_actions_for_module,
    get_trigger_ids,
    get_action_ids,
    get_all_trigger_ids,
    get_all_action_ids,
)


# =============================================================================
# COMMON DISPATCH FUNCTION
# =============================================================================

async def dispatch_automation_event(
    db: AsyncSession,
    workspace_id: str,
    module: str,
    trigger_type: str,
    entity_id: str,
    trigger_data: dict,
) -> int:
    """Dispatch an automation event to trigger matching automations.

    This is a common utility function that all modules can use to dispatch
    events and trigger automations.

    Args:
        db: Database session.
        workspace_id: Workspace ID.
        module: Module name (e.g., 'sprints', 'tickets', 'uptime').
        trigger_type: Type of trigger (e.g., 'task.created', 'ticket.assigned').
        entity_id: ID of the entity that triggered the event.
        trigger_data: Additional data to pass to the automation (available as {{trigger.field}}).

    Returns:
        Number of automations triggered.

    Example:
        await dispatch_automation_event(
            db=db,
            workspace_id="...",
            module="sprints",
            trigger_type="task.created",
            entity_id=task.id,
            trigger_data={
                "task_id": task.id,
                "task_title": task.title,
                "assignee_email": task.assignee.email,
            },
        )
    """
    logger.info(f"[DISPATCH] Dispatching {module}.{trigger_type} for entity {entity_id}")
    try:
        automation_service = AutomationService(db)
        runs = await automation_service.process_module_trigger(
            workspace_id=workspace_id,
            module=module,
            trigger_type=trigger_type,
            entity_id=entity_id,
            trigger_data=trigger_data,
        )
        num_runs = len(runs)
        if num_runs > 0:
            logger.info(f"[DISPATCH] {module}.{trigger_type} triggered {num_runs} automation(s)")
        return num_runs
    except Exception as e:
        logger.error(f"[DISPATCH ERROR] Failed to dispatch {module}.{trigger_type}: {e}")
        return 0


class AutomationService:
    """Platform-wide automation service.

    Provides module-aware automation functionality by extending
    the CRMAutomationService with module filtering and validation.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._crm_service = CRMAutomationService(db)

    # =========================================================================
    # AUTOMATION CRUD
    # =========================================================================

    async def create_automation(
        self,
        workspace_id: str,
        name: str,
        trigger_type: str,
        actions: list[dict],
        module: str = "crm",
        module_config: dict | None = None,
        object_id: str | None = None,
        description: str | None = None,
        trigger_config: dict | None = None,
        conditions: list[dict] | None = None,
        error_handling: str = "stop",
        run_limit_per_month: int | None = None,
        is_active: bool = True,
        created_by_id: str | None = None,
    ) -> CRMAutomation:
        """Create a new automation with module context."""
        # Validate trigger type for module
        valid_triggers = get_trigger_ids(module)
        if valid_triggers and trigger_type not in valid_triggers:
            # Allow any trigger for now, just log warning
            pass

        # Create automation using base service
        automation = CRMAutomation(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            object_id=object_id,
            module=module,
            module_config=module_config or {},
            trigger_type=trigger_type,
            trigger_config=trigger_config or {},
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
        return await self._crm_service.get_automation(automation_id)

    async def list_automations(
        self,
        workspace_id: str,
        module: str | None = None,
        object_id: str | None = None,
        is_active: bool | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMAutomation]:
        """List automations in a workspace, optionally filtered by module."""
        stmt = select(CRMAutomation).where(CRMAutomation.workspace_id == workspace_id)

        if module:
            stmt = stmt.where(CRMAutomation.module == module)
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

        # Handle nested model conversion for conditions/actions
        if 'conditions' in kwargs and kwargs['conditions'] is not None:
            # Convert Pydantic models to dicts if needed
            conditions = kwargs['conditions']
            if conditions and hasattr(conditions[0], 'model_dump'):
                kwargs['conditions'] = [c.model_dump() for c in conditions]

        if 'actions' in kwargs and kwargs['actions'] is not None:
            actions = kwargs['actions']
            if actions and hasattr(actions[0], 'model_dump'):
                kwargs['actions'] = [a.model_dump() for a in actions]

        for key, value in kwargs.items():
            if value is not None and hasattr(automation, key):
                setattr(automation, key, value)

        await self.db.flush()
        await self.db.refresh(automation)
        return automation

    async def delete_automation(self, automation_id: str) -> bool:
        """Delete an automation."""
        return await self._crm_service.delete_automation(automation_id)

    async def toggle_automation(self, automation_id: str) -> CRMAutomation | None:
        """Toggle automation active status."""
        return await self._crm_service.toggle_automation(automation_id)

    # =========================================================================
    # AUTOMATION RUNS
    # =========================================================================

    async def list_automation_runs(
        self,
        automation_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMAutomationRun]:
        """List automation runs."""
        return await self._crm_service.list_automation_runs(
            automation_id=automation_id,
            skip=skip,
            limit=limit,
        )

    async def get_automation_run(self, run_id: str) -> CRMAutomationRun | None:
        """Get an automation run by ID."""
        return await self._crm_service.get_automation_run(run_id)

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

        # Set module on trigger data for tracking
        enhanced_trigger_data = trigger_data or {}
        enhanced_trigger_data["module"] = automation.module

        return await self._crm_service.trigger_automation(
            automation_id=automation_id,
            record_id=record_id,
            trigger_data=enhanced_trigger_data,
        )

    # =========================================================================
    # MODULE TRIGGER PROCESSING
    # =========================================================================

    async def process_module_trigger(
        self,
        workspace_id: str,
        module: str,
        trigger_type: str,
        entity_id: str | None = None,
        trigger_data: dict | None = None,
    ) -> list[CRMAutomationRun]:
        """Process a trigger event for a specific module.

        This is the main entry point for module-specific events
        (e.g., ticket.created, candidate.stage_changed).
        """
        logger.info(f"[TRIGGER] Processing: module={module}, trigger_type={trigger_type}, workspace={workspace_id}")

        # Find all active automations matching this module and trigger
        stmt = select(CRMAutomation).where(
            CRMAutomation.workspace_id == workspace_id,
            CRMAutomation.module == module,
            CRMAutomation.trigger_type == trigger_type,
            CRMAutomation.is_active == True,
        )
        result = await self.db.execute(stmt)
        automations = list(result.scalars().all())

        logger.info(f"[TRIGGER] Found {len(automations)} automation(s) for {module}.{trigger_type}")
        for auto in automations:
            logger.debug(f"[TRIGGER]   - {auto.id}: '{auto.name}' (actions={len(auto.actions or [])})")

        runs = []
        for automation in automations:
            try:
                # Check if automation targets a specific entity (like object_id in CRM)
                if automation.object_id and entity_id:
                    # For CRM, object_id is the CRM object (e.g., "deals")
                    # For tickets, might be ticket form ID
                    # For hiring, might be requirement ID
                    if automation.object_id != entity_id:
                        logger.debug(f"[TRIGGER] Skipping {automation.id}: object_id mismatch ({automation.object_id} != {entity_id})")
                        continue

                logger.info(f"[TRIGGER] Triggering automation: {automation.id} '{automation.name}'")
                run = await self.trigger_automation(
                    automation_id=automation.id,
                    record_id=entity_id,
                    trigger_data=trigger_data,
                )
                runs.append(run)
                logger.info(f"[TRIGGER] Successfully triggered: {automation.id}, run_id={run.id}")
            except ValueError as e:
                # Skip if automation can't run (limit exceeded, etc.)
                logger.debug(f"[TRIGGER] Skipping {automation.id}: {e}")
                continue
            except Exception as e:
                logger.error(f"[TRIGGER] Error triggering {automation.id}: {e}")
                continue

        logger.info(f"[TRIGGER] Total runs created: {len(runs)}")
        return runs

    # =========================================================================
    # REGISTRY HELPERS
    # =========================================================================

    @staticmethod
    def get_triggers_for_module(module: str) -> list[dict[str, str]]:
        """Get all supported trigger types with descriptions for a module."""
        return get_triggers_for_module(module)

    @staticmethod
    def get_trigger_ids_for_module(module: str) -> list[str]:
        """Get trigger IDs (strings only) for a module."""
        return get_trigger_ids(module)

    @staticmethod
    def get_actions_for_module(module: str) -> list[dict[str, str]]:
        """Get all supported action types with descriptions for a module."""
        return get_actions_for_module(module)

    @staticmethod
    def get_action_ids_for_module(module: str) -> list[str]:
        """Get action IDs (strings only) for a module."""
        return get_action_ids(module)

    @staticmethod
    def get_all_triggers() -> dict[str, list[dict[str, str]]]:
        """Get all triggers organized by module with descriptions."""
        return TRIGGER_REGISTRY.copy()

    @staticmethod
    def get_all_actions() -> dict[str, list[dict[str, str]]]:
        """Get all actions organized by module with descriptions."""
        return ACTION_REGISTRY.copy()
