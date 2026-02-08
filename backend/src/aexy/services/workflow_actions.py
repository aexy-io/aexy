"""Workflow action handlers for executing different action types."""

import httpx
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.crm import (
    CRMRecord,
    CRMActivity,
    CRMList,
    CRMListEntry,
    CRMSequence,
    CRMSequenceEnrollment,
)
from aexy.models.workflow import WorkflowExecution
from aexy.schemas.workflow import WorkflowExecutionContext, NodeExecutionResult


class WorkflowActionHandler:
    """Handles execution of workflow action nodes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def execute_action(
        self,
        action_type: str,
        data: dict,
        context: WorkflowExecutionContext,
    ) -> NodeExecutionResult:
        """Execute an action based on type."""
        handlers = {
            "update_record": self._update_record,
            "create_record": self._create_record,
            "delete_record": self._delete_record,
            "send_email": self._send_email,
            "send_tracked_email": self._send_tracked_email,
            "send_slack": self._send_slack,
            "send_sms": self._send_sms,
            "create_task": self._create_task,
            "add_to_list": self._add_to_list,
            "remove_from_list": self._remove_from_list,
            "enroll_sequence": self._enroll_sequence,
            "unenroll_sequence": self._unenroll_sequence,
            "webhook_call": self._webhook_call,
            "assign_owner": self._assign_owner,
            "send_campaign": self._send_campaign,
            "trigger_onboarding": self._trigger_onboarding,
            "complete_onboarding_step": self._complete_onboarding_step,
            "run_agent": self._execute_agent,
        }

        handler = handlers.get(action_type)
        if not handler:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Unknown action type: {action_type}",
            )

        return await handler(data, context)

    async def _update_record(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Update a CRM record."""
        record_id = context.record_id
        if not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No record ID in context",
            )

        field_mappings = data.get("field_mappings", {})
        if not field_mappings:
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"message": "No fields to update"},
            )

        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Record not found: {record_id}",
            )

        # Resolve field values from context
        updates = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                # Template variable
                path = value_or_path.strip("{}").strip()
                updates[field] = self._get_context_value(path, context)
            else:
                updates[field] = value_or_path

        record.values = {**record.values, **updates}
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": record_id, "updated_fields": list(updates.keys())},
        )

    async def _create_record(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create a new CRM record."""
        target_object_id = data.get("target_object_id")
        if not target_object_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No target object ID specified",
            )

        field_mappings = data.get("field_mappings", {})
        values = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                path = value_or_path.strip("{}").strip()
                values[field] = self._get_context_value(path, context)
            else:
                values[field] = value_or_path

        # Get workspace_id from the original record
        workspace_id = context.trigger_data.get("workspace_id")
        if not workspace_id and context.record_id:
            stmt = select(CRMRecord.workspace_id).where(CRMRecord.id == context.record_id)
            result = await self.db.execute(stmt)
            workspace_id = result.scalar_one_or_none()

        if not workspace_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Could not determine workspace ID",
            )

        new_record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=target_object_id,
            values=values,
        )
        self.db.add(new_record)
        await self.db.flush()

        # Store new record ID in context for subsequent nodes
        context.variables["created_record_id"] = new_record.id

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": new_record.id, "object_id": target_object_id},
        )

    async def _delete_record(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Delete (archive) a CRM record."""
        record_id = data.get("record_id") or context.record_id
        if not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No record ID specified",
            )

        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Record not found: {record_id}",
            )

        record.is_archived = True
        record.archived_at = datetime.now(timezone.utc)
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": record_id, "archived": True},
        )

    async def _send_email(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send an email via the email service."""
        email_to = data.get("to")
        if not email_to:
            # Get from record
            email_field = data.get("email_field", "email")
            email_to = context.record_data.get("values", {}).get(email_field)

        # Also try to render template variables in the email address
        if email_to:
            email_to = self._render_template(email_to, context)

        if not email_to:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No recipient email address",
            )

        subject = data.get("email_subject", "")
        body = data.get("email_body", "")
        use_ai = data.get("use_ai_personalization", False)

        # Template variable replacement
        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

        if use_ai:
            # Use AI to personalize the email
            from aexy.services.writing_style_service import WritingStyleService
            # This would be implemented later
            pass

        # Queue the email via Temporal
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import SendWorkflowEmailInput

        await dispatch(
            "send_workflow_email",
            SendWorkflowEmailInput(
                workspace_id=context.workspace_id,
                to_email=email_to,
                subject=subject,
                html_body=body,
                record_id=context.record_id,
            ),
            task_queue=TaskQueue.EMAIL,
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"to": email_to, "subject": subject, "queued": True},
        )

    async def _send_tracked_email(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """
        Send a tracked email using the email marketing infrastructure.

        Supports:
        - Open tracking (pixel)
        - Link click tracking
        - Multi-domain sending (optional)

        Data options:
        - to: Recipient email (or email_field to get from record)
        - email_field: Field name containing email (default: "email")
        - email_subject: Subject line with template support
        - email_body: HTML body with template support
        - from_email: Sender email (optional, uses default)
        - from_name: Sender name (optional)
        - track_opens: Enable open tracking (default: true)
        - track_clicks: Enable click tracking (default: true)
        - sending_pool_id: Optional sending pool for multi-domain
        """
        from aexy.services.email_service import email_service
        from aexy.services.tracking_service import TrackingService

        email_to = data.get("to")
        if not email_to:
            email_field = data.get("email_field", "email")
            email_to = context.record_data.get("values", {}).get(email_field)

        if not email_to:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No recipient email address",
            )

        subject = data.get("email_subject", "")
        body = data.get("email_body", "")
        from_email = data.get("from_email")
        from_name = data.get("from_name")
        track_opens = data.get("track_opens", True)
        track_clicks = data.get("track_clicks", True)

        # Template variable replacement
        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

        # Process tracking if enabled
        pixel_id = None
        if track_opens or track_clicks:
            tracking_service = TrackingService(self.db)
            body, pixel_id = await tracking_service.process_email_body(
                html_body=body,
                workspace_id=context.workspace_id,
                record_id=context.record_id,
                inject_pixel=track_opens,
                track_links=track_clicks,
            )

        # Queue email for sending via Temporal
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import SendWorkflowEmailInput

        await dispatch(
            "send_workflow_email",
            SendWorkflowEmailInput(
                workspace_id=context.workspace_id,
                to_email=email_to,
                subject=subject,
                html_body=body,
                from_email=from_email,
                from_name=from_name,
                record_id=context.record_id,
            ),
            task_queue=TaskQueue.EMAIL,
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={
                "to": email_to,
                "subject": subject,
                "queued": True,
                "tracking_enabled": track_opens or track_clicks,
                "pixel_id": pixel_id,
            },
        )

    async def _send_campaign(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """
        Send an email campaign to a user or trigger a release campaign.

        Data options:
        - campaign_id: Existing campaign ID to send
        - template_id: Template ID to create ad-hoc campaign
        - to: Recipient email (or get from record)
        - email_field: Field name containing email (default: "email")
        - context_overrides: Additional template context
        """
        campaign_id = data.get("campaign_id")
        template_id = data.get("template_id")

        email_to = data.get("to")
        if not email_to:
            email_field = data.get("email_field", "email")
            email_to = context.record_data.get("values", {}).get(email_field)

        if not email_to:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No recipient email address",
            )

        context_overrides = data.get("context_overrides", {})

        if campaign_id:
            # Send existing campaign to this recipient
            from aexy.services.campaign_service import CampaignService

            campaign_service = CampaignService(self.db)
            campaign = await campaign_service.get_campaign(campaign_id, context.workspace_id)

            if not campaign:
                return NodeExecutionResult(
                    node_id="",
                    status="failed",
                    error=f"Campaign not found: {campaign_id}",
                )

            # Add single recipient to campaign
            from aexy.models.email_marketing import CampaignRecipient, RecipientStatus
            from uuid import uuid4

            recipient = CampaignRecipient(
                id=str(uuid4()),
                campaign_id=campaign_id,
                record_id=context.record_id,
                email=email_to,
                status=RecipientStatus.PENDING.value,
                context=context_overrides,
            )
            self.db.add(recipient)
            await self.db.flush()

            # Queue send task via Temporal
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.email import SendCampaignEmailInput

            await dispatch(
                "send_campaign_email",
                SendCampaignEmailInput(
                    campaign_id=campaign_id,
                    recipient_id=recipient.id,
                ),
                task_queue=TaskQueue.EMAIL,
            )

            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "campaign_id": campaign_id,
                    "recipient_id": recipient.id,
                    "to": email_to,
                    "queued": True,
                },
            )

        elif template_id:
            # Create ad-hoc send from template
            from aexy.services.template_service import TemplateService

            template_service = TemplateService(self.db)
            template = await template_service.get_template(template_id, context.workspace_id)

            if not template:
                return NodeExecutionResult(
                    node_id="",
                    status="failed",
                    error=f"Template not found: {template_id}",
                )

            # Merge context
            render_context = {
                **context.record_data.get("values", {}),
                **context_overrides,
            }

            subject, html_body, text_body = template_service.render_template(
                template, render_context
            )

            # Queue email via Temporal
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.email import SendWorkflowEmailInput

            await dispatch(
                "send_workflow_email",
                SendWorkflowEmailInput(
                    workspace_id=context.workspace_id,
                    to_email=email_to,
                    subject=subject,
                    html_body=html_body,
                    record_id=context.record_id,
                ),
                task_queue=TaskQueue.EMAIL,
            )

            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "template_id": template_id,
                    "to": email_to,
                    "subject": subject,
                    "queued": True,
                },
            )

        return NodeExecutionResult(
            node_id="",
            status="failed",
            error="Must specify campaign_id or template_id",
        )

    async def _trigger_onboarding(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """
        Trigger an onboarding flow for a user.

        Data options:
        - flow_id: Onboarding flow ID to trigger
        - flow_slug: Onboarding flow slug (alternative to flow_id)
        - user_id: User ID to onboard (or get from context/record)
        - user_id_field: Field name containing user ID
        """
        from aexy.services.onboarding_service import OnboardingService

        onboarding_service = OnboardingService(self.db)

        flow_id = data.get("flow_id")
        flow_slug = data.get("flow_slug")

        # Resolve flow
        if not flow_id and flow_slug:
            flow = await onboarding_service.get_flow_by_slug(
                context.workspace_id, flow_slug
            )
            if flow:
                flow_id = flow.id

        if not flow_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Must specify flow_id or flow_slug",
            )

        # Resolve user_id
        user_id = data.get("user_id")
        if not user_id:
            user_id_field = data.get("user_id_field", "developer_id")
            user_id = context.record_data.get("values", {}).get(user_id_field)

        if not user_id:
            # Try to get from context
            user_id = context.record_data.get("created_by_id")

        if not user_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No user_id found for onboarding",
            )

        # Start onboarding
        try:
            progress = await onboarding_service.start_onboarding(
                flow_id=flow_id,
                user_id=user_id,
                record_id=context.record_id,
            )

            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "flow_id": flow_id,
                    "user_id": user_id,
                    "progress_id": progress.id,
                    "started": True,
                },
            )
        except Exception as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Failed to start onboarding: {str(e)}",
            )

    async def _complete_onboarding_step(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """
        Complete an onboarding step for a user.

        Data options:
        - progress_id: Onboarding progress ID
        - flow_id: Flow ID (with user_id to find progress)
        - user_id: User ID
        - step_id: Optional specific step ID to complete
        """
        from aexy.services.onboarding_service import OnboardingService

        onboarding_service = OnboardingService(self.db)

        progress_id = data.get("progress_id")
        flow_id = data.get("flow_id")
        user_id = data.get("user_id")
        step_id = data.get("step_id")

        if not progress_id and flow_id and user_id:
            # Find progress by flow and user
            progress = await onboarding_service.get_user_progress(flow_id, user_id)
            if progress:
                progress_id = progress.id

        if not progress_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Must specify progress_id or (flow_id + user_id)",
            )

        try:
            progress = await onboarding_service.complete_step(progress_id, step_id)

            if not progress:
                return NodeExecutionResult(
                    node_id="",
                    status="failed",
                    error=f"Progress not found: {progress_id}",
                )

            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "progress_id": progress.id,
                    "current_step": progress.current_step,
                    "status": progress.status,
                    "completed": progress.status == "completed",
                },
            )
        except Exception as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Failed to complete step: {str(e)}",
            )

    async def _send_slack(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send a Slack message to channel or DM to user.

        Supports:
        - channel/channel_id: Send to a Slack channel
        - user_email: Send DM to user by email
        - user_email_field: Send DM to user from record field containing email
        """
        channel_id = data.get("channel_id") or data.get("channel")
        user_email = data.get("user_email")
        user_email_field = data.get("user_email_field")
        message = data.get("message_template", "")

        # Determine target
        target_type = "channel"
        target = channel_id

        if not channel_id:
            if user_email:
                target_type = "dm"
                target = user_email
            elif user_email_field:
                # Get email from record field
                target_type = "dm"
                target = context.record_data.get("values", {}).get(user_email_field)

        if not target or not message:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing target (channel/user_email) or message",
            )

        message = self._render_template(message, context)

        # Queue Slack message via Temporal
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendSlackWorkflowMessageInput

        await dispatch(
            "send_slack_workflow_message",
            SendSlackWorkflowMessageInput(
                workspace_id=context.workspace_id,
                target_type=target_type,
                target=target,
                message=message,
                record_id=context.record_id,
            ),
            task_queue=TaskQueue.INTEGRATIONS,
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"target_type": target_type, "target": target, "queued": True},
        )

    async def _send_sms(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send an SMS via Twilio."""
        phone_field = data.get("phone_field", "phone")
        phone_to = context.record_data.get("values", {}).get(phone_field)

        if not phone_to:
            phone_to = data.get("phone_number")

        if not phone_to:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No phone number for SMS",
            )

        message = data.get("message_template", "")
        message = self._render_template(message, context)

        # Queue SMS via Temporal
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendSMSInput

        await dispatch(
            "send_sms",
            SendSMSInput(
                workspace_id=context.workspace_id,
                to=phone_to,
                body=message,
                record_id=context.record_id,
            ),
            task_queue=TaskQueue.INTEGRATIONS,
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"to": phone_to, "queued": True},
        )

    async def _create_task(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create a task in the ticketing system."""
        title = data.get("title", "New Task")
        description = data.get("description", "")
        assignee_id = data.get("assignee_id")
        due_date = data.get("due_date")

        title = self._render_template(title, context)
        description = self._render_template(description, context)

        # Get workspace from context
        workspace_id = context.trigger_data.get("workspace_id")

        # Create task via ticketing service
        from aexy.services.ticketing_service import TicketingService

        service = TicketingService(self.db)
        # This would create the task
        # task = await service.create_ticket(...)

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"title": title, "created": True},
        )

    async def _add_to_list(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Add a record to a CRM list."""
        list_id = data.get("list_id")
        record_id = context.record_id

        if not list_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing list ID or record ID",
            )

        # Check if already in list
        stmt = select(CRMListEntry).where(
            CRMListEntry.list_id == list_id,
            CRMListEntry.record_id == record_id,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"list_id": list_id, "already_in_list": True},
            )

        entry = CRMListEntry(
            id=str(uuid4()),
            list_id=list_id,
            record_id=record_id,
            position=0,
            list_values={},
        )
        self.db.add(entry)
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"list_id": list_id, "entry_id": entry.id},
        )

    async def _remove_from_list(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Remove a record from a CRM list."""
        list_id = data.get("list_id")
        record_id = context.record_id

        if not list_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing list ID or record ID",
            )

        stmt = select(CRMListEntry).where(
            CRMListEntry.list_id == list_id,
            CRMListEntry.record_id == record_id,
        )
        result = await self.db.execute(stmt)
        entry = result.scalar_one_or_none()

        if entry:
            await self.db.delete(entry)
            await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"list_id": list_id, "removed": entry is not None},
        )

    async def _enroll_sequence(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Enroll a record in a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = context.record_id

        if not sequence_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing sequence ID or record ID",
            )

        # Check if already enrolled
        stmt = select(CRMSequenceEnrollment).where(
            CRMSequenceEnrollment.sequence_id == sequence_id,
            CRMSequenceEnrollment.record_id == record_id,
            CRMSequenceEnrollment.status == "active",
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"sequence_id": sequence_id, "already_enrolled": True},
            )

        enrollment = CRMSequenceEnrollment(
            id=str(uuid4()),
            sequence_id=sequence_id,
            record_id=record_id,
            status="active",
            enrolled_at=datetime.now(timezone.utc),
            steps_completed=[],
        )
        self.db.add(enrollment)
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"sequence_id": sequence_id, "enrollment_id": enrollment.id},
        )

    async def _unenroll_sequence(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Unenroll a record from a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = context.record_id

        if not sequence_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing sequence ID or record ID",
            )

        stmt = select(CRMSequenceEnrollment).where(
            CRMSequenceEnrollment.sequence_id == sequence_id,
            CRMSequenceEnrollment.record_id == record_id,
            CRMSequenceEnrollment.status == "active",
        )
        result = await self.db.execute(stmt)
        enrollment = result.scalar_one_or_none()

        if enrollment:
            enrollment.status = "exited"
            enrollment.exit_reason = "automation"
            enrollment.exited_at = datetime.now(timezone.utc)
            await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"sequence_id": sequence_id, "unenrolled": enrollment is not None},
        )

    async def _webhook_call(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Make an HTTP webhook call."""
        url = data.get("webhook_url")
        method = data.get("http_method", "POST").upper()
        headers = data.get("headers", {})
        body_template = data.get("body_template", "{}")

        if not url:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No webhook URL specified",
            )

        # Render body template
        body = self._render_template(body_template, context)

        try:
            import json

            async with httpx.AsyncClient(timeout=30.0) as client:
                if method in ["POST", "PUT", "PATCH"]:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        json=json.loads(body) if body else None,
                    )
                else:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                    )

            return NodeExecutionResult(
                node_id="",
                status="success" if response.is_success else "failed",
                output={
                    "status_code": response.status_code,
                    "response": response.text[:1000],  # Truncate response
                },
            )
        except Exception as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Webhook call failed: {str(e)}",
            )

    async def _assign_owner(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Assign a record owner."""
        record_id = context.record_id
        owner_id = data.get("owner_id")

        if not record_id or not owner_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing record ID or owner ID",
            )

        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Record not found: {record_id}",
            )

        record.owner_id = owner_id
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": record_id, "owner_id": owner_id},
        )

    async def _execute_agent(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute an AI agent with full context integration.

        This action allows workflows to spawn AI agents with access to:
        - Record data from the triggering context
        - Trigger data and workflow variables
        - Upstream node outputs

        Args:
            data: Node configuration with:
                - agent_id: ID of the agent to execute
                - input_mapping: Optional custom mapping of context to agent input
                - wait_for_completion: Whether to wait for agent (default: True)
                - timeout_seconds: Max wait time (default: 300)
                - output_variable: Variable name to store agent output
            context: Current workflow execution context

        Returns:
            NodeExecutionResult with agent execution details
        """
        from aexy.services.automation_agent_service import AutomationAgentService

        agent_id = data.get("agent_id")
        if not agent_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No agent_id specified",
            )

        # Build context from workflow state
        agent_context = {
            "record_id": context.record_id,
            "record_data": context.record_data,
            "trigger_data": context.trigger_data,
            "workflow_variables": context.variables,
        }

        # Apply custom input mapping if provided
        input_mapping = data.get("input_mapping", {})
        if input_mapping:
            for key, path in input_mapping.items():
                value = self._get_context_value(path, context)
                if value is not None:
                    agent_context[key] = value

        # Get execution options
        wait_for_completion = data.get("wait_for_completion", True)
        timeout_seconds = data.get("timeout_seconds", 300)

        # Get workflow execution ID from context if available
        workflow_execution_id = context.trigger_data.get("execution_id")

        try:
            agent_service = AutomationAgentService(self.db)

            execution = await agent_service.spawn_agent(
                agent_id=agent_id,
                trigger_point="as_action",
                context=agent_context,
                workflow_execution_id=workflow_execution_id,
                input_mapping=input_mapping,
                wait_for_completion=wait_for_completion,
                timeout_seconds=timeout_seconds,
            )

            # Build result
            if wait_for_completion:
                if execution.status == "completed":
                    # Store output in workflow variable if specified
                    output_variable = data.get("output_variable")
                    if output_variable and execution.output_result:
                        context.variables[output_variable] = execution.output_result

                    return NodeExecutionResult(
                        node_id="",
                        status="success",
                        output={
                            "execution_id": execution.id,
                            "agent_id": agent_id,
                            "status": execution.status,
                            "result": execution.output_result,
                            "duration_ms": execution.duration_ms,
                        },
                    )
                else:
                    return NodeExecutionResult(
                        node_id="",
                        status="failed",
                        output={
                            "execution_id": execution.id,
                            "agent_id": agent_id,
                            "status": execution.status,
                        },
                        error=execution.error_message or f"Agent execution {execution.status}",
                    )
            else:
                # Fire and forget
                return NodeExecutionResult(
                    node_id="",
                    status="success",
                    output={
                        "execution_id": execution.id,
                        "agent_id": agent_id,
                        "status": "spawned",
                    },
                )

        except ValueError as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=str(e),
            )
        except Exception as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Agent execution failed: {str(e)}",
            )

    def _get_context_value(self, path: str, context: WorkflowExecutionContext) -> Any:
        """Get a value from context using dot notation."""
        parts = path.split(".")
        current = None

        if parts[0] == "record":
            current = context.record_data
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.trigger_data
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.variables
            parts = parts[1:]
        else:
            current = context.record_data

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _render_template(self, template: str, context: WorkflowExecutionContext) -> str:
        """Render a template string with context variables."""
        import re

        def replace_var(match: re.Match) -> str:
            path = match.group(1).strip()
            value = self._get_context_value(path, context)
            return str(value) if value is not None else ""

        # Replace {{path.to.value}} with actual values
        return re.sub(r"\{\{([^}]+)\}\}", replace_var, template)


class SyncWorkflowActionHandler:
    """Synchronous action handler for Celery tasks."""

    def __init__(self, db: Session):
        self.db = db

    def execute_action(
        self,
        action_type: str,
        data: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute an action based on type."""
        handlers = {
            "update_record": self._update_record,
            "create_record": self._create_record,
            "delete_record": self._delete_record,
            "send_email": self._send_email,
            "send_slack": self._send_slack,
            "send_sms": self._send_sms,
            "create_task": self._create_task,
            "add_to_list": self._add_to_list,
            "remove_from_list": self._remove_from_list,
            "enroll_sequence": self._enroll_sequence,
            "unenroll_sequence": self._unenroll_sequence,
            "webhook_call": self._webhook_call,
            "assign_owner": self._assign_owner,
            "send_campaign": self._send_campaign,
            "trigger_onboarding": self._trigger_onboarding,
            "complete_onboarding_step": self._complete_onboarding_step,
            "run_agent": self._execute_agent,
        }

        handler = handlers.get(action_type)
        if not handler:
            return {"status": "failed", "error": f"Unknown action type: {action_type}"}

        return handler(data, context, execution)

    def _execute_agent(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Execute an AI agent synchronously (for Celery workers)."""
        from aexy.services.automation_agent_service import SyncAutomationAgentService

        agent_id = data.get("agent_id")
        if not agent_id:
            return {"status": "failed", "error": "No agent_id specified"}

        # Build context from workflow state
        agent_context = {
            "record_id": execution.record_id,
            "record_data": context.get("record_data", {}),
            "trigger_data": context.get("trigger_data", {}),
            "workflow_variables": context.get("variables", {}),
        }

        # Apply custom input mapping if provided
        input_mapping = data.get("input_mapping", {})
        if input_mapping:
            for key, path in input_mapping.items():
                value = self._get_context_value(path, context)
                if value is not None:
                    agent_context[key] = value

        try:
            agent_service = SyncAutomationAgentService(self.db)

            result = agent_service.spawn_agent_sync(
                agent_id=agent_id,
                trigger_point="as_action",
                context=agent_context,
                workflow_execution_id=execution.id,
                input_mapping=input_mapping,
            )

            if result.get("status") == "completed":
                # Store output in workflow variable if specified
                output_variable = data.get("output_variable")
                if output_variable and result.get("output"):
                    context.setdefault("variables", {})[output_variable] = result.get("output")

                return {
                    "status": "success",
                    "output": {
                        "execution_id": result.get("execution_id"),
                        "agent_id": agent_id,
                        "status": result.get("status"),
                        "result": result.get("output"),
                    },
                }
            else:
                return {
                    "status": "failed",
                    "output": {
                        "execution_id": result.get("execution_id"),
                        "agent_id": agent_id,
                        "status": result.get("status"),
                    },
                    "error": result.get("error") or f"Agent execution {result.get('status')}",
                }

        except Exception as e:
            return {"status": "failed", "error": f"Agent execution failed: {str(e)}"}

    def _update_record(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Update a CRM record."""
        record_id = execution.record_id
        if not record_id:
            return {"status": "failed", "error": "No record ID in context"}

        field_mappings = data.get("field_mappings", {})
        if not field_mappings:
            return {"status": "success", "output": {"message": "No fields to update"}}

        record = self.db.execute(
            select(CRMRecord).where(CRMRecord.id == record_id)
        ).scalar_one_or_none()

        if not record:
            return {"status": "failed", "error": f"Record not found: {record_id}"}

        updates = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                path = value_or_path.strip("{}").strip()
                updates[field] = self._get_context_value(path, context)
            else:
                updates[field] = value_or_path

        record.values = {**record.values, **updates}
        self.db.commit()

        return {
            "status": "success",
            "output": {"record_id": record_id, "updated_fields": list(updates.keys())},
        }

    def _create_record(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create a new CRM record."""
        target_object_id = data.get("target_object_id")
        if not target_object_id:
            return {"status": "failed", "error": "No target object ID specified"}

        field_mappings = data.get("field_mappings", {})
        values = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                path = value_or_path.strip("{}").strip()
                values[field] = self._get_context_value(path, context)
            else:
                values[field] = value_or_path

        workspace_id = execution.workspace_id

        new_record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=target_object_id,
            values=values,
        )
        self.db.add(new_record)
        self.db.commit()

        return {
            "status": "success",
            "output": {"record_id": new_record.id, "object_id": target_object_id},
        }

    def _delete_record(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Delete (archive) a CRM record."""
        record_id = data.get("record_id") or execution.record_id
        if not record_id:
            return {"status": "failed", "error": "No record ID specified"}

        record = self.db.execute(
            select(CRMRecord).where(CRMRecord.id == record_id)
        ).scalar_one_or_none()

        if not record:
            return {"status": "failed", "error": f"Record not found: {record_id}"}

        record.is_archived = True
        record.archived_at = datetime.now(timezone.utc)
        self.db.commit()

        return {"status": "success", "output": {"record_id": record_id, "archived": True}}

    def _send_email(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send an email via the email service."""
        email_to = data.get("to")
        if not email_to:
            record_data = context.get("record_data", {})
            email_field = data.get("email_field", "email")
            email_to = record_data.get("values", {}).get(email_field)

        # Also try to render template variables in the email address
        if email_to:
            email_to = self._render_template(email_to, context)

        if not email_to:
            return {"status": "failed", "error": "No recipient email address"}

        subject = data.get("email_subject", "")
        body = data.get("email_body", "")

        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

        # Queue the email via Temporal
        import asyncio
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import SendWorkflowEmailInput

        asyncio.get_event_loop().run_until_complete(dispatch(
            "send_workflow_email",
            SendWorkflowEmailInput(
                workspace_id=execution.workspace_id,
                to_email=email_to,
                subject=subject,
                html_body=body,
                record_id=execution.record_id,
            ),
            task_queue=TaskQueue.EMAIL,
        ))

        return {
            "status": "success",
            "output": {"to": email_to, "subject": subject, "queued": True},
        }

    def _send_slack(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send a Slack message."""
        channel_id = data.get("channel_id")
        message = data.get("message_template", "")

        if not channel_id or not message:
            return {"status": "failed", "error": "Missing channel ID or message"}

        message = self._render_template(message, context)

        import asyncio
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendSlackMessageInput

        asyncio.get_event_loop().run_until_complete(dispatch(
            "send_slack_message",
            SendSlackMessageInput(
                workspace_id=execution.workspace_id,
                channel=channel_id,
                message=message,
            ),
            task_queue=TaskQueue.INTEGRATIONS,
        ))

        return {"status": "success", "output": {"channel_id": channel_id, "queued": True}}

    def _send_sms(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send an SMS via Twilio."""
        record_data = context.get("record_data", {})
        phone_field = data.get("phone_field", "phone")
        phone_to = record_data.get("values", {}).get(phone_field)

        if not phone_to:
            phone_to = data.get("phone_number")

        if not phone_to:
            return {"status": "failed", "error": "No phone number for SMS"}

        message = data.get("message_template", "")
        message = self._render_template(message, context)

        import asyncio
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendSMSInput

        asyncio.get_event_loop().run_until_complete(dispatch(
            "send_sms",
            SendSMSInput(
                workspace_id=execution.workspace_id,
                to=phone_to,
                body=message,
            ),
            task_queue=TaskQueue.INTEGRATIONS,
        ))

        return {"status": "success", "output": {"to": phone_to, "queued": True}}

    def _create_task(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create a task."""
        title = data.get("title", "New Task")
        title = self._render_template(title, context)
        return {"status": "success", "output": {"title": title, "created": True}}

    def _add_to_list(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Add a record to a CRM list."""
        list_id = data.get("list_id")
        record_id = execution.record_id

        if not list_id or not record_id:
            return {"status": "failed", "error": "Missing list ID or record ID"}

        existing = self.db.execute(
            select(CRMListEntry).where(
                CRMListEntry.list_id == list_id,
                CRMListEntry.record_id == record_id,
            )
        ).scalar_one_or_none()

        if existing:
            return {"status": "success", "output": {"list_id": list_id, "already_in_list": True}}

        entry = CRMListEntry(
            id=str(uuid4()),
            list_id=list_id,
            record_id=record_id,
            position=0,
            list_values={},
        )
        self.db.add(entry)
        self.db.commit()

        return {"status": "success", "output": {"list_id": list_id, "entry_id": entry.id}}

    def _remove_from_list(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Remove a record from a CRM list."""
        list_id = data.get("list_id")
        record_id = execution.record_id

        if not list_id or not record_id:
            return {"status": "failed", "error": "Missing list ID or record ID"}

        entry = self.db.execute(
            select(CRMListEntry).where(
                CRMListEntry.list_id == list_id,
                CRMListEntry.record_id == record_id,
            )
        ).scalar_one_or_none()

        if entry:
            self.db.delete(entry)
            self.db.commit()

        return {"status": "success", "output": {"list_id": list_id, "removed": entry is not None}}

    def _enroll_sequence(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Enroll a record in a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = execution.record_id

        if not sequence_id or not record_id:
            return {"status": "failed", "error": "Missing sequence ID or record ID"}

        existing = self.db.execute(
            select(CRMSequenceEnrollment).where(
                CRMSequenceEnrollment.sequence_id == sequence_id,
                CRMSequenceEnrollment.record_id == record_id,
                CRMSequenceEnrollment.status == "active",
            )
        ).scalar_one_or_none()

        if existing:
            return {"status": "success", "output": {"sequence_id": sequence_id, "already_enrolled": True}}

        enrollment = CRMSequenceEnrollment(
            id=str(uuid4()),
            sequence_id=sequence_id,
            record_id=record_id,
            status="active",
            enrolled_at=datetime.now(timezone.utc),
            steps_completed=[],
        )
        self.db.add(enrollment)
        self.db.commit()

        return {"status": "success", "output": {"sequence_id": sequence_id, "enrollment_id": enrollment.id}}

    def _unenroll_sequence(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Unenroll a record from a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = execution.record_id

        if not sequence_id or not record_id:
            return {"status": "failed", "error": "Missing sequence ID or record ID"}

        enrollment = self.db.execute(
            select(CRMSequenceEnrollment).where(
                CRMSequenceEnrollment.sequence_id == sequence_id,
                CRMSequenceEnrollment.record_id == record_id,
                CRMSequenceEnrollment.status == "active",
            )
        ).scalar_one_or_none()

        if enrollment:
            enrollment.status = "exited"
            enrollment.exit_reason = "automation"
            enrollment.exited_at = datetime.now(timezone.utc)
            self.db.commit()

        return {"status": "success", "output": {"sequence_id": sequence_id, "unenrolled": enrollment is not None}}

    def _webhook_call(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Make an HTTP webhook call."""
        import json
        import requests

        url = data.get("webhook_url")
        method = data.get("http_method", "POST").upper()
        headers = data.get("headers", {})
        body_template = data.get("body_template", "{}")

        if not url:
            return {"status": "failed", "error": "No webhook URL specified"}

        body = self._render_template(body_template, context)

        try:
            if method in ["POST", "PUT", "PATCH"]:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=json.loads(body) if body else None,
                    timeout=30,
                )
            else:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=headers,
                    timeout=30,
                )

            return {
                "status": "success" if response.ok else "failed",
                "output": {
                    "status_code": response.status_code,
                    "response": response.text[:1000],
                },
            }
        except Exception as e:
            return {"status": "failed", "error": f"Webhook call failed: {str(e)}"}

    def _assign_owner(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Assign a record owner."""
        record_id = execution.record_id
        owner_id = data.get("owner_id")

        if not record_id or not owner_id:
            return {"status": "failed", "error": "Missing record ID or owner ID"}

        record = self.db.execute(
            select(CRMRecord).where(CRMRecord.id == record_id)
        ).scalar_one_or_none()

        if not record:
            return {"status": "failed", "error": f"Record not found: {record_id}"}

        record.owner_id = owner_id
        self.db.commit()

        return {"status": "success", "output": {"record_id": record_id, "owner_id": owner_id}}

    def _send_campaign(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send an email campaign to a user (sync version)."""
        campaign_id = data.get("campaign_id")
        template_id = data.get("template_id")

        email_to = data.get("to")
        if not email_to:
            record_data = context.get("record_data", {})
            email_field = data.get("email_field", "email")
            email_to = record_data.get("values", {}).get(email_field)

        if not email_to:
            return {"status": "failed", "error": "No recipient email address"}

        context_overrides = data.get("context_overrides", {})

        if campaign_id:
            from aexy.models.email_marketing import CampaignRecipient, RecipientStatus

            recipient = CampaignRecipient(
                id=str(uuid4()),
                campaign_id=campaign_id,
                record_id=execution.record_id,
                email=email_to,
                status=RecipientStatus.PENDING.value,
                context=context_overrides,
            )
            self.db.add(recipient)
            self.db.commit()

            import asyncio
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.email import SendCampaignEmailInput

            asyncio.get_event_loop().run_until_complete(dispatch(
                "send_campaign_email",
                SendCampaignEmailInput(
                    campaign_id=campaign_id,
                    recipient_id=recipient.id,
                ),
                task_queue=TaskQueue.EMAIL,
            ))

            return {
                "status": "success",
                "output": {
                    "campaign_id": campaign_id,
                    "recipient_id": recipient.id,
                    "to": email_to,
                    "queued": True,
                },
            }

        elif template_id:
            import asyncio
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.email import SendWorkflowEmailInput

            asyncio.get_event_loop().run_until_complete(dispatch(
                "send_workflow_email",
                SendWorkflowEmailInput(
                    workspace_id=execution.workspace_id,
                    to_email=email_to,
                    subject=data.get("subject", ""),
                    html_body=data.get("body", ""),
                    record_id=execution.record_id,
                ),
                task_queue=TaskQueue.EMAIL,
            ))

            return {
                "status": "success",
                "output": {"template_id": template_id, "to": email_to, "queued": True},
            }

        return {"status": "failed", "error": "Must specify campaign_id or template_id"}

    def _trigger_onboarding(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Trigger an onboarding flow for a user (sync version)."""
        flow_id = data.get("flow_id")
        flow_slug = data.get("flow_slug")

        if not flow_id and not flow_slug:
            return {"status": "failed", "error": "Must specify flow_id or flow_slug"}

        user_id = data.get("user_id")
        if not user_id:
            record_data = context.get("record_data", {})
            user_id_field = data.get("user_id_field", "developer_id")
            user_id = record_data.get("values", {}).get(user_id_field)

        if not user_id:
            user_id = context.get("record_data", {}).get("created_by_id")

        if not user_id:
            return {"status": "failed", "error": "No user_id found for onboarding"}

        # Queue onboarding start via Temporal
        import asyncio
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import StartUserOnboardingInput

        asyncio.get_event_loop().run_until_complete(dispatch(
            "start_user_onboarding",
            StartUserOnboardingInput(
                workspace_id=execution.workspace_id,
                user_id=user_id,
                flow_id=flow_id,
                flow_slug=flow_slug,
            ),
            task_queue=TaskQueue.EMAIL,
        ))

        return {
            "status": "success",
            "output": {
                "flow_id": flow_id or flow_slug,
                "user_id": user_id,
                "queued": True,
            },
        }

    def _complete_onboarding_step(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Complete an onboarding step (sync version)."""
        progress_id = data.get("progress_id")
        flow_id = data.get("flow_id")
        user_id = data.get("user_id")
        step_id = data.get("step_id")

        if not progress_id and not (flow_id and user_id):
            return {"status": "failed", "error": "Must specify progress_id or (flow_id + user_id)"}

        import asyncio
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import CompleteOnboardingStepInput

        asyncio.get_event_loop().run_until_complete(dispatch(
            "complete_onboarding_step",
            CompleteOnboardingStepInput(
                progress_id=progress_id,
                flow_id=flow_id,
                user_id=user_id,
                step_id=step_id,
            ),
            task_queue=TaskQueue.EMAIL,
        ))

        return {
            "status": "success",
            "output": {"progress_id": progress_id or "pending", "queued": True},
        }

    def _get_context_value(self, path: str, context: dict) -> Any:
        """Get a value from context using dot notation."""
        parts = path.split(".")
        current = None

        if parts[0] == "record":
            current = context.get("record_data", {})
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.get("trigger_data", {})
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.get("variables", {})
            parts = parts[1:]
        else:
            current = context.get("record_data", {})

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _render_template(self, template: str, context: dict) -> str:
        """Render a template string with context variables."""
        def replace_var(match: re.Match) -> str:
            path = match.group(1).strip()
            value = self._get_context_value(path, context)
            return str(value) if value is not None else ""

        return re.sub(r"\{\{([^}]+)\}\}", replace_var, template)
