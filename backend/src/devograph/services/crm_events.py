"""CRM event triggering service for automations and webhooks."""

from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import CRMAutomationTriggerType


class CRMEventService:
    """Service for triggering CRM events to automations and webhooks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def emit_record_created(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        values: dict[str, Any],
        created_by_id: str | None = None,
    ):
        """Emit event when a record is created."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "record_created",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "values": values,
            "created_by_id": created_by_id,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.RECORD_CREATED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="record.created",
            object_id=object_id,
            payload={
                "event": "record.created",
                "object_id": object_id,
                "record_id": record_id,
                "values": values,
                "created_by": created_by_id,
            },
        )

    async def emit_record_updated(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        old_values: dict[str, Any],
        new_values: dict[str, Any],
        changes: list[dict],
        updated_by_id: str | None = None,
    ):
        """Emit event when a record is updated."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "record_updated",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "old_values": old_values,
            "new_values": new_values,
            "changes": changes,
            "updated_by_id": updated_by_id,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.RECORD_UPDATED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Check for field_changed triggers
        for change in changes:
            field_name = change.get("field")
            old_val = change.get("old")
            new_val = change.get("new")

            await automation_service.process_trigger(
                workspace_id=workspace_id,
                object_id=object_id,
                trigger_type=CRMAutomationTriggerType.FIELD_CHANGED.value,
                record_id=record_id,
                trigger_data={
                    **trigger_data,
                    "changed_field": field_name,
                    "old_value": old_val,
                    "new_value": new_val,
                },
            )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="record.updated",
            object_id=object_id,
            payload={
                "event": "record.updated",
                "object_id": object_id,
                "record_id": record_id,
                "old_values": old_values,
                "new_values": new_values,
                "changes": changes,
                "updated_by": updated_by_id,
            },
        )

    async def emit_record_deleted(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        values: dict[str, Any],
        permanent: bool = False,
        deleted_by_id: str | None = None,
    ):
        """Emit event when a record is deleted."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "record_deleted",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "values": values,
            "permanent": permanent,
            "deleted_by_id": deleted_by_id,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.RECORD_DELETED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="record.deleted",
            object_id=object_id,
            payload={
                "event": "record.deleted",
                "object_id": object_id,
                "record_id": record_id,
                "values": values,
                "permanent": permanent,
                "deleted_by": deleted_by_id,
            },
        )

    async def emit_stage_changed(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        old_stage: str | None,
        new_stage: str,
        record_values: dict[str, Any],
        changed_by_id: str | None = None,
    ):
        """Emit event when a record's stage changes (e.g., deal pipeline)."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "stage_changed",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "old_stage": old_stage,
            "new_stage": new_stage,
            "changed_by_id": changed_by_id,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.STAGE_CHANGED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="stage.changed",
            object_id=object_id,
            payload={
                "event": "stage.changed",
                "object_id": object_id,
                "record_id": record_id,
                "old_stage": old_stage,
                "new_stage": new_stage,
                "record_values": record_values,
                "changed_by": changed_by_id,
            },
        )

    async def emit_note_added(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        note_id: str,
        note_content: str,
        created_by_id: str | None = None,
    ):
        """Emit event when a note is added to a record."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "note_added",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "note_id": note_id,
            "note_content": note_content,
            "created_by_id": created_by_id,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.NOTE_ADDED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="note.added",
            object_id=object_id,
            payload={
                "event": "note.added",
                "object_id": object_id,
                "record_id": record_id,
                "note_id": note_id,
                "note_content": note_content[:500],  # Truncate for webhook
                "created_by": created_by_id,
            },
        )

    async def emit_task_completed(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        task_id: str,
        task_title: str,
        completed_by_id: str | None = None,
    ):
        """Emit event when a task is completed on a record."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "task_completed",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "task_id": task_id,
            "task_title": task_title,
            "completed_by_id": completed_by_id,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.TASK_COMPLETED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="task.completed",
            object_id=object_id,
            payload={
                "event": "task.completed",
                "object_id": object_id,
                "record_id": record_id,
                "task_id": task_id,
                "task_title": task_title,
                "completed_by": completed_by_id,
            },
        )

    async def emit_email_replied(
        self,
        workspace_id: str,
        object_id: str,
        record_id: str,
        email_id: str,
        subject: str,
        from_email: str,
        replied_at: str,
    ):
        """Emit event when an email reply is received for a record."""
        from aexy.services.crm_automation_service import (
            CRMAutomationService,
            CRMWebhookService,
        )

        trigger_data = {
            "trigger_type": "email_replied",
            "workspace_id": workspace_id,
            "object_id": object_id,
            "record_id": record_id,
            "email_id": email_id,
            "subject": subject,
            "from_email": from_email,
            "replied_at": replied_at,
        }

        # Trigger matching automations
        automation_service = CRMAutomationService(self.db)
        await automation_service.process_trigger(
            workspace_id=workspace_id,
            object_id=object_id,
            trigger_type=CRMAutomationTriggerType.EMAIL_REPLIED.value,
            record_id=record_id,
            trigger_data=trigger_data,
        )

        # Deliver webhooks
        webhook_service = CRMWebhookService(self.db)
        await webhook_service.emit_event(
            workspace_id=workspace_id,
            event="email.replied",
            object_id=object_id,
            payload={
                "event": "email.replied",
                "object_id": object_id,
                "record_id": record_id,
                "email_id": email_id,
                "subject": subject,
                "from_email": from_email,
                "replied_at": replied_at,
            },
        )
