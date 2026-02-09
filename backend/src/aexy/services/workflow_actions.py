"""Workflow action handlers for executing different action types."""

import httpx
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

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
            # CRM actions
            "update_record": self._update_record,
            "create_record": self._create_record,
            "delete_record": self._delete_record,
            "add_to_list": self._add_to_list,
            "remove_from_list": self._remove_from_list,
            "enroll_sequence": self._enroll_sequence,
            "unenroll_sequence": self._unenroll_sequence,
            "assign_owner": self._assign_owner,
            # Communication actions
            "send_email": self._send_email,
            "send_tracked_email": self._send_tracked_email,
            "send_slack": self._send_slack,
            "send_sms": self._send_sms,
            "webhook_call": self._webhook_call,
            "api_request": self._webhook_call,
            "notify_user": self._notify_user,
            "notify_team": self._notify_team,
            # Task / Sprint actions
            "create_task": self._create_task,
            "update_task": self._update_task,
            "assign_task": self._assign_task,
            "move_task": self._move_task,
            "create_subtask": self._create_subtask,
            "add_comment": self._add_comment,
            # Ticket actions
            "update_ticket": self._update_ticket,
            "assign_ticket": self._assign_ticket,
            "add_response": self._add_response,
            "escalate": self._escalate,
            "change_priority": self._change_priority,
            "add_tag": self._add_tag,
            "remove_tag": self._remove_tag,
            # Hiring actions
            "update_candidate": self._update_candidate,
            "move_stage": self._move_stage,
            "schedule_interview": self._schedule_interview,
            "send_rejection": self._send_rejection,
            "create_offer": self._create_offer,
            "add_note": self._add_note,
            "assign_recruiter": self._assign_recruiter,
            # Uptime actions
            "pause_monitor": self._pause_monitor,
            "resume_monitor": self._resume_monitor,
            "create_incident": self._create_incident,
            "resolve_incident": self._resolve_incident,
            # Booking actions
            "confirm_booking": self._confirm_booking,
            "cancel_booking": self._cancel_booking,
            "reschedule_booking": self._reschedule_booking,
            "send_reminder": self._send_reminder,
            # Email marketing actions
            "send_campaign": self._send_campaign,
            "update_contact": self._update_contact,
            # Form actions
            "send_response": self._send_response,
            # Onboarding actions
            "trigger_onboarding": self._trigger_onboarding,
            "complete_onboarding_step": self._complete_onboarding_step,
            # AI Agent actions
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
        """Create a sprint task."""
        from aexy.models.sprint import SprintTask
        from aexy.models.project import ProjectTeam

        title = data.get("task_title") or data.get("title", "New Task")
        description = data.get("task_description") or data.get("description", "")
        title = self._render_template(title, context)
        description = self._render_template(description, context)

        priority = data.get("task_priority") or data.get("priority", "medium")
        assignee_id = data.get("assignee_id")
        project_id = data.get("project_id")
        sprint_id = data.get("sprint_id")
        labels = data.get("labels", [])

        workspace_id = context.workspace_id or context.trigger_data.get("workspace_id")
        if not workspace_id:
            return NodeExecutionResult(
                node_id="", status="failed", error="No workspace_id in context",
            )

        # Look up team from project
        team_id = None
        if project_id:
            try:
                result = await self.db.execute(
                    select(ProjectTeam).where(ProjectTeam.project_id == project_id).limit(1)
                )
                project_team = result.scalar_one_or_none()
                if project_team:
                    team_id = project_team.team_id
            except Exception as e:
                logger.error(f"[CREATE_TASK] Failed to look up team for project: {e}")

        try:
            task = SprintTask(
                id=str(uuid4()),
                workspace_id=workspace_id,
                team_id=team_id,
                sprint_id=sprint_id,
                source_type="automation",
                source_id=str(uuid4()),
                title=title,
                description=description,
                priority=priority,
                assignee_id=assignee_id,
                labels=labels if isinstance(labels, list) else [],
                status="todo",
            )
            self.db.add(task)
            await self.db.flush()

            logger.info(f"[CREATE_TASK] Task created: id={task.id}, title='{task.title}'")

            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "task_id": task.id,
                    "title": task.title,
                    "project_id": project_id,
                    "team_id": team_id,
                    "created": True,
                },
            )
        except Exception as e:
            logger.error(f"[CREATE_TASK] Failed: {e}", exc_info=True)
            return NodeExecutionResult(
                node_id="", status="failed", error=f"Failed to create task: {str(e)}",
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

    # =========================================================================
    # UPTIME MODULE ACTIONS
    # =========================================================================

    async def _pause_monitor(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Pause an uptime monitor."""
        from aexy.services.uptime_service import UptimeService, MonitorNotFoundError

        monitor_id = data.get("monitor_id") or context.trigger_data.get("monitor_id")
        if not monitor_id:
            return NodeExecutionResult(node_id="", status="failed", error="No monitor_id specified")

        try:
            uptime_service = UptimeService(self.db)
            monitor = await uptime_service.pause_monitor(monitor_id)
            return NodeExecutionResult(
                node_id="", status="success",
                output={"monitor_id": monitor.id, "monitor_name": monitor.name, "paused": True},
            )
        except MonitorNotFoundError:
            return NodeExecutionResult(node_id="", status="failed", error=f"Monitor {monitor_id} not found")
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _resume_monitor(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Resume a paused uptime monitor."""
        from aexy.services.uptime_service import UptimeService, MonitorNotFoundError

        monitor_id = data.get("monitor_id") or context.trigger_data.get("monitor_id")
        if not monitor_id:
            return NodeExecutionResult(node_id="", status="failed", error="No monitor_id specified")

        try:
            uptime_service = UptimeService(self.db)
            monitor = await uptime_service.resume_monitor(monitor_id)
            return NodeExecutionResult(
                node_id="", status="success",
                output={"monitor_id": monitor.id, "monitor_name": monitor.name, "resumed": True},
            )
        except MonitorNotFoundError:
            return NodeExecutionResult(node_id="", status="failed", error=f"Monitor {monitor_id} not found")
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _create_incident(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create an uptime incident."""
        from aexy.models.uptime import UptimeIncident, UptimeIncidentStatus
        from aexy.services.uptime_service import UptimeService

        monitor_id = data.get("monitor_id") or context.trigger_data.get("monitor_id")
        if not monitor_id:
            return NodeExecutionResult(node_id="", status="failed", error="No monitor_id specified")

        error_message = data.get("error_message", "Incident created by automation")
        error_type = data.get("error_type", "manual")

        try:
            uptime_service = UptimeService(self.db)
            monitor = await uptime_service.get_monitor(monitor_id)
            if not monitor:
                return NodeExecutionResult(node_id="", status="failed", error=f"Monitor {monitor_id} not found")

            existing = await uptime_service.get_ongoing_incident(monitor_id)
            if existing:
                return NodeExecutionResult(
                    node_id="", status="success",
                    output={"incident_id": existing.id, "already_exists": True},
                )

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

            return NodeExecutionResult(
                node_id="", status="success",
                output={"incident_id": incident.id, "monitor_id": monitor_id, "created": True},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _resolve_incident(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Resolve an uptime incident."""
        from aexy.services.uptime_service import UptimeService, IncidentNotFoundError
        from aexy.schemas.uptime import UptimeIncidentResolve

        incident_id = data.get("incident_id") or context.trigger_data.get("incident_id")
        monitor_id = data.get("monitor_id") or context.trigger_data.get("monitor_id")

        uptime_service = UptimeService(self.db)

        if not incident_id and monitor_id:
            ongoing = await uptime_service.get_ongoing_incident(monitor_id)
            if ongoing:
                incident_id = ongoing.id

        if not incident_id:
            return NodeExecutionResult(node_id="", status="failed", error="No incident_id or monitor_id with ongoing incident")

        try:
            resolve_data = UptimeIncidentResolve(
                resolution_notes=data.get("resolution_notes", "Resolved by automation"),
                root_cause=data.get("root_cause"),
            )
            incident = await uptime_service.resolve_incident(incident_id, resolve_data)
            return NodeExecutionResult(
                node_id="", status="success",
                output={"incident_id": incident.id, "status": incident.status, "resolved": True},
            )
        except IncidentNotFoundError:
            return NodeExecutionResult(node_id="", status="failed", error=f"Incident {incident_id} not found")
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    # =========================================================================
    # SPRINT MODULE ACTIONS
    # =========================================================================

    async def _update_task(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Update a sprint task."""
        from aexy.services.sprint_task_service import SprintTaskService

        task_id = data.get("task_id") or context.trigger_data.get("task_id")
        if not task_id:
            return NodeExecutionResult(node_id="", status="failed", error="No task_id specified")

        try:
            task_service = SprintTaskService(self.db)
            task = await task_service.update_task(
                task_id=task_id,
                title=data.get("title"),
                description=data.get("description"),
                priority=data.get("priority"),
                status=data.get("status"),
                story_points=data.get("story_points"),
                labels=data.get("labels"),
            )
            if not task:
                return NodeExecutionResult(node_id="", status="failed", error=f"Task {task_id} not found")
            return NodeExecutionResult(
                node_id="", status="success",
                output={"task_id": task.id, "title": task.title, "status": task.status},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _assign_task(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Assign a sprint task to a developer."""
        from aexy.services.sprint_task_service import SprintTaskService

        task_id = data.get("task_id") or context.trigger_data.get("task_id")
        developer_id = data.get("developer_id") or data.get("assignee_id") or context.trigger_data.get("assignee_id")

        if not task_id:
            return NodeExecutionResult(node_id="", status="failed", error="No task_id specified")
        if not developer_id:
            return NodeExecutionResult(node_id="", status="failed", error="No assignee_id specified")

        try:
            task_service = SprintTaskService(self.db)
            task = await task_service.assign_task(
                task_id=task_id,
                developer_id=developer_id,
                reason=data.get("reason", "Assigned by automation"),
            )
            if not task:
                return NodeExecutionResult(node_id="", status="failed", error=f"Task {task_id} not found")
            return NodeExecutionResult(
                node_id="", status="success",
                output={"task_id": task.id, "assignee_id": task.assignee_id},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _move_task(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Move a sprint task to a different status or sprint."""
        from aexy.services.sprint_task_service import SprintTaskService

        task_id = data.get("task_id") or context.trigger_data.get("task_id")
        new_status = data.get("status")
        new_sprint_id = data.get("sprint_id")

        if not task_id:
            return NodeExecutionResult(node_id="", status="failed", error="No task_id specified")
        if not new_status and not new_sprint_id:
            return NodeExecutionResult(node_id="", status="failed", error="No status or sprint_id specified")

        try:
            task_service = SprintTaskService(self.db)

            if new_status:
                task = await task_service.update_task_status(task_id, new_status)
            else:
                task = await task_service.get_task(task_id)

            if not task:
                return NodeExecutionResult(node_id="", status="failed", error=f"Task {task_id} not found")

            if new_sprint_id:
                tasks = await task_service.bulk_move_to_sprint([task_id], new_sprint_id)
                if tasks:
                    task = tasks[0]

            return NodeExecutionResult(
                node_id="", status="success",
                output={"task_id": task.id, "status": task.status, "sprint_id": task.sprint_id},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _create_subtask(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create a subtask under a parent task."""
        from aexy.services.sprint_task_service import SprintTaskService

        parent_task_id = data.get("parent_task_id") or context.trigger_data.get("task_id")
        title = data.get("title", "Subtask")

        if not parent_task_id:
            return NodeExecutionResult(node_id="", status="failed", error="No parent_task_id specified")

        try:
            task_service = SprintTaskService(self.db)
            parent = await task_service.get_task(parent_task_id)
            if not parent:
                return NodeExecutionResult(node_id="", status="failed", error=f"Parent task {parent_task_id} not found")

            subtask = await task_service.add_task(
                sprint_id=parent.sprint_id,
                title=self._render_template(title, context),
                description=data.get("description"),
                priority=data.get("priority", "medium"),
                assignee_id=data.get("assignee_id"),
                parent_task_id=parent_task_id,
                status="todo",
            )
            return NodeExecutionResult(
                node_id="", status="success",
                output={"subtask_id": subtask.id, "parent_task_id": parent_task_id, "title": subtask.title},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _add_comment(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Add a comment to a sprint task."""
        from aexy.models.sprint import SprintTask

        task_id = data.get("task_id") or context.trigger_data.get("task_id")
        comment_text = data.get("comment", data.get("message", ""))

        if not task_id:
            return NodeExecutionResult(node_id="", status="failed", error="No task_id specified")
        if not comment_text:
            return NodeExecutionResult(node_id="", status="failed", error="No comment text specified")

        comment_text = self._render_template(comment_text, context)

        try:
            stmt = select(SprintTask).where(SprintTask.id == task_id)
            result = await self.db.execute(stmt)
            task = result.scalar_one_or_none()
            if not task:
                return NodeExecutionResult(node_id="", status="failed", error=f"Task {task_id} not found")

            # Store comment in custom_fields
            custom_fields = dict(task.custom_fields) if task.custom_fields else {}
            comments = custom_fields.get("automation_comments", [])
            comments.append({
                "text": comment_text,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "automation",
            })
            custom_fields["automation_comments"] = comments
            task.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"task_id": task_id, "comment_added": True},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    # =========================================================================
    # TICKET MODULE ACTIONS
    # =========================================================================

    async def _update_ticket(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Update a ticket."""
        from aexy.services.ticket_service import TicketService
        from aexy.schemas.ticketing import TicketUpdate

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")

        try:
            ticket_service = TicketService(self.db)
            update_data = TicketUpdate(
                status=data.get("status"),
                priority=data.get("priority"),
                severity=data.get("severity"),
            )
            ticket = await ticket_service.update_ticket(ticket_id, update_data)
            if not ticket:
                return NodeExecutionResult(node_id="", status="failed", error=f"Ticket {ticket_id} not found")
            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket.id, "ticket_number": ticket.ticket_number, "status": ticket.status},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _assign_ticket(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Assign a ticket to a developer or team."""
        from aexy.services.ticket_service import TicketService

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")

        try:
            ticket_service = TicketService(self.db)
            ticket = await ticket_service.assign_ticket(
                ticket_id=ticket_id,
                assignee_id=data.get("assignee_id"),
                team_id=data.get("team_id"),
            )
            if not ticket:
                return NodeExecutionResult(node_id="", status="failed", error=f"Ticket {ticket_id} not found")
            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket.id, "assignee_id": ticket.assignee_id},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _add_response(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Add a response/reply to a ticket."""
        from aexy.services.ticket_service import TicketService

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        message = data.get("message", data.get("response", ""))

        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")
        if not message:
            return NodeExecutionResult(node_id="", status="failed", error="No message specified")

        message = self._render_template(message, context)

        try:
            ticket_service = TicketService(self.db)
            reply = await ticket_service.add_reply(
                ticket_id=ticket_id,
                content=message,
                is_internal=data.get("is_internal", False),
            )
            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket_id, "reply_id": reply.id if reply else None, "response_added": True},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _escalate(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Escalate a ticket."""
        from aexy.services.ticket_service import TicketService

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        level = data.get("level", "level_1")

        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")

        try:
            ticket_service = TicketService(self.db)
            ticket = await ticket_service.get_ticket(ticket_id)
            if not ticket:
                return NodeExecutionResult(node_id="", status="failed", error=f"Ticket {ticket_id} not found")

            escalation = await ticket_service.trigger_escalation(ticket, level)
            if not escalation:
                return NodeExecutionResult(
                    node_id="", status="success",
                    output={"ticket_id": ticket_id, "message": "No matching escalation matrix found"},
                )
            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket_id, "escalation_id": escalation.id, "level": escalation.level},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _change_priority(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Change a ticket's priority."""
        from aexy.services.ticket_service import TicketService
        from aexy.schemas.ticketing import TicketUpdate

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        priority = data.get("priority")

        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")
        if not priority:
            return NodeExecutionResult(node_id="", status="failed", error="No priority specified")

        try:
            ticket_service = TicketService(self.db)
            update_data = TicketUpdate(priority=priority)
            ticket = await ticket_service.update_ticket(ticket_id, update_data)
            if not ticket:
                return NodeExecutionResult(node_id="", status="failed", error=f"Ticket {ticket_id} not found")
            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket.id, "priority": ticket.priority},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _add_tag(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Add a tag to a ticket."""
        from aexy.services.ticket_service import TicketService

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        tag = data.get("tag", data.get("tag_name", ""))

        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")
        if not tag:
            return NodeExecutionResult(node_id="", status="failed", error="No tag specified")

        try:
            ticket_service = TicketService(self.db)
            ticket = await ticket_service.get_ticket(ticket_id)
            if not ticket:
                return NodeExecutionResult(node_id="", status="failed", error=f"Ticket {ticket_id} not found")

            tags = list(ticket.tags) if ticket.tags else []
            if tag not in tags:
                tags.append(tag)
                ticket.tags = tags
                await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket_id, "tag": tag, "tags": tags},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _remove_tag(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Remove a tag from a ticket."""
        from aexy.services.ticket_service import TicketService

        ticket_id = data.get("ticket_id") or context.trigger_data.get("ticket_id")
        tag = data.get("tag", data.get("tag_name", ""))

        if not ticket_id:
            return NodeExecutionResult(node_id="", status="failed", error="No ticket_id specified")
        if not tag:
            return NodeExecutionResult(node_id="", status="failed", error="No tag specified")

        try:
            ticket_service = TicketService(self.db)
            ticket = await ticket_service.get_ticket(ticket_id)
            if not ticket:
                return NodeExecutionResult(node_id="", status="failed", error=f"Ticket {ticket_id} not found")

            tags = list(ticket.tags) if ticket.tags else []
            if tag in tags:
                tags.remove(tag)
                ticket.tags = tags
                await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"ticket_id": ticket_id, "tag_removed": tag, "tags": tags},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    # =========================================================================
    # HIRING MODULE ACTIONS
    # =========================================================================

    async def _update_candidate(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Update a hiring candidate's custom fields."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            if data.get("status"):
                custom_fields["hiring_status"] = data["status"]
            if data.get("notes"):
                existing = custom_fields.get("notes", "")
                custom_fields["notes"] = f"{existing}\n\n---\n{data['notes']}" if existing else data["notes"]
            if data.get("rating"):
                custom_fields["rating"] = data["rating"]
            if data.get("custom_data"):
                custom_fields.update(data["custom_data"])

            candidate.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"candidate_id": candidate.id, "updated": True},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _move_stage(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Move a candidate to a different hiring stage."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        new_stage = data.get("stage")

        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")
        if not new_stage:
            return NodeExecutionResult(node_id="", status="failed", error="No stage specified")

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            old_stage = custom_fields.get("hiring_status", "applied")
            custom_fields["hiring_status"] = new_stage
            custom_fields["stage_changed_at"] = datetime.now(timezone.utc).isoformat()
            candidate.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"candidate_id": candidate.id, "old_stage": old_stage, "new_stage": new_stage},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _schedule_interview(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Schedule an interview for a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}

            current_status = custom_fields.get("hiring_status", "applied")
            if current_status not in ("interviewing", "offer", "hired"):
                custom_fields["hiring_status"] = "interviewing"

            interview_data = {
                "interviewer_id": data.get("interviewer_id"),
                "interview_type": data.get("interview_type", "video"),
                "scheduled_at": data.get("scheduled_at"),
                "duration_minutes": data.get("duration_minutes", 60),
                "notes": data.get("notes", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            interviews = custom_fields.get("scheduled_interviews", [])
            if not isinstance(interviews, list):
                interviews = []
            interviews.append(interview_data)
            custom_fields["scheduled_interviews"] = interviews
            candidate.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"candidate_id": candidate.id, "interview_scheduled": True, "interview_type": interview_data["interview_type"]},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _send_rejection(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send a rejection email/notification for a candidate."""
        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")

        # Update candidate stage to rejected
        from aexy.models.assessment import Candidate
        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            custom_fields["hiring_status"] = "rejected"
            custom_fields["rejected_at"] = datetime.now(timezone.utc).isoformat()
            custom_fields["rejection_reason"] = data.get("reason", "")
            candidate.custom_fields = custom_fields
            await self.db.flush()

            # Send rejection email if email configured
            email_to = data.get("email") or candidate.email if hasattr(candidate, "email") else None
            if email_to:
                subject = data.get("email_subject", "Application Update")
                body = data.get("email_body", data.get("message", "Thank you for your application. Unfortunately, we have decided to move forward with other candidates."))
                body = self._render_template(body, context)

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
                node_id="", status="success",
                output={"candidate_id": candidate.id, "rejected": True, "email_sent": email_to is not None},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _create_offer(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create an offer for a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            custom_fields["hiring_status"] = "offer"
            custom_fields["offer_details"] = {
                "position": data.get("position", ""),
                "salary": data.get("salary", ""),
                "start_date": data.get("start_date", ""),
                "notes": data.get("notes", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            candidate.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"candidate_id": candidate.id, "offer_created": True},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _add_note(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Add a note to a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        note_text = data.get("note", data.get("message", ""))

        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")
        if not note_text:
            return NodeExecutionResult(node_id="", status="failed", error="No note text specified")

        note_text = self._render_template(note_text, context)

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            existing_notes = custom_fields.get("notes", "")
            if existing_notes:
                custom_fields["notes"] = f"{existing_notes}\n\n---\n{note_text}"
            else:
                custom_fields["notes"] = note_text
            candidate.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"candidate_id": candidate.id, "note_added": True},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _assign_recruiter(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Assign a recruiter to a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.trigger_data.get("candidate_id")
        recruiter_id = data.get("recruiter_id") or data.get("assignee_id")

        if not candidate_id:
            return NodeExecutionResult(node_id="", status="failed", error="No candidate_id specified")
        if not recruiter_id:
            return NodeExecutionResult(node_id="", status="failed", error="No recruiter_id specified")

        try:
            stmt = select(Candidate).where(Candidate.id == candidate_id)
            result = await self.db.execute(stmt)
            candidate = result.scalar_one_or_none()
            if not candidate:
                return NodeExecutionResult(node_id="", status="failed", error=f"Candidate {candidate_id} not found")

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            custom_fields["recruiter_id"] = recruiter_id
            custom_fields["recruiter_assigned_at"] = datetime.now(timezone.utc).isoformat()
            candidate.custom_fields = custom_fields
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"candidate_id": candidate.id, "recruiter_id": recruiter_id},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    # =========================================================================
    # BOOKING MODULE ACTIONS
    # =========================================================================

    async def _confirm_booking(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Confirm a booking."""
        from aexy.models.booking.booking import Booking

        booking_id = data.get("booking_id") or context.trigger_data.get("booking_id")
        if not booking_id:
            return NodeExecutionResult(node_id="", status="failed", error="No booking_id specified")

        try:
            stmt = select(Booking).where(Booking.id == booking_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()
            if not booking:
                return NodeExecutionResult(node_id="", status="failed", error=f"Booking {booking_id} not found")

            booking.status = "confirmed"
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"booking_id": booking.id, "status": "confirmed"},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _cancel_booking(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Cancel a booking."""
        from aexy.models.booking.booking import Booking

        booking_id = data.get("booking_id") or context.trigger_data.get("booking_id")
        if not booking_id:
            return NodeExecutionResult(node_id="", status="failed", error="No booking_id specified")

        try:
            stmt = select(Booking).where(Booking.id == booking_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()
            if not booking:
                return NodeExecutionResult(node_id="", status="failed", error=f"Booking {booking_id} not found")

            booking.status = "cancelled"
            booking.cancelled_at = datetime.now(timezone.utc)
            booking.cancellation_reason = data.get("reason", "Cancelled by automation")
            booking.cancelled_by = "system"
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"booking_id": booking.id, "status": "cancelled"},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _reschedule_booking(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Reschedule a booking."""
        from aexy.models.booking.booking import Booking

        booking_id = data.get("booking_id") or context.trigger_data.get("booking_id")
        new_start_time = data.get("new_start_time")

        if not booking_id:
            return NodeExecutionResult(node_id="", status="failed", error="No booking_id specified")
        if not new_start_time:
            return NodeExecutionResult(node_id="", status="failed", error="No new_start_time specified")

        try:
            stmt = select(Booking).where(Booking.id == booking_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()
            if not booking:
                return NodeExecutionResult(node_id="", status="failed", error=f"Booking {booking_id} not found")

            old_start = booking.start_time

            from dateutil.parser import parse as parse_datetime
            booking.start_time = parse_datetime(new_start_time)
            if data.get("new_end_time"):
                booking.end_time = parse_datetime(data["new_end_time"])

            # Store reschedule info in answers
            answers = dict(booking.answers) if booking.answers else {}
            history = answers.get("reschedule_history", [])
            history.append({
                "old_start": old_start.isoformat() if old_start else None,
                "new_start": new_start_time,
                "reason": data.get("reason", "Rescheduled by automation"),
                "rescheduled_at": datetime.now(timezone.utc).isoformat(),
            })
            answers["reschedule_history"] = history
            booking.answers = answers
            booking.status = "confirmed"
            await self.db.flush()

            return NodeExecutionResult(
                node_id="", status="success",
                output={"booking_id": booking.id, "rescheduled": True, "new_start": new_start_time},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _send_reminder(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send a booking reminder via email or Slack."""
        booking_id = data.get("booking_id") or context.trigger_data.get("booking_id")
        message = data.get("message", data.get("message_template", "Reminder: You have an upcoming booking."))
        message = self._render_template(message, context)
        channel = data.get("channel", "email")

        if channel == "slack":
            return await self._send_slack(
                {"message_template": message, "channel_id": data.get("channel_id"), "user_email": data.get("user_email")},
                context,
            )
        else:
            email_to = data.get("to") or data.get("email")
            if not email_to:
                email_to = context.record_data.get("values", {}).get("email")
            if not email_to:
                return NodeExecutionResult(node_id="", status="failed", error="No email address for reminder")
            return await self._send_email(
                {"to": email_to, "email_subject": data.get("subject", "Booking Reminder"), "email_body": message},
                context,
            )

    # =========================================================================
    # NOTIFICATION ACTIONS
    # =========================================================================

    async def _notify_user(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send notification to a specific user."""
        from aexy.models.developer import Developer

        user_id = data.get("user_id")
        user_email = data.get("user_email")
        message = data.get("message", data.get("message_template", ""))
        channel = data.get("channel", "slack")

        message = self._render_template(message, context)

        if not user_id and not user_email:
            return NodeExecutionResult(node_id="", status="failed", error="No user_id or user_email specified")

        try:
            developer = None
            if user_id:
                result = await self.db.execute(select(Developer).where(Developer.id == user_id))
                developer = result.scalar_one_or_none()
            elif user_email:
                result = await self.db.execute(select(Developer).where(Developer.email == user_email))
                developer = result.scalar_one_or_none()

            if not developer:
                return NodeExecutionResult(node_id="", status="failed", error=f"User not found: {user_id or user_email}")

            channels_notified = []

            if channel in ("slack", "both"):
                slack_result = await self._send_slack(
                    {"user_email": developer.email, "message_template": message},
                    context,
                )
                if slack_result.status == "success":
                    channels_notified.append("slack")

            if channel in ("email", "both"):
                email_result = await self._send_email(
                    {"to": developer.email, "email_subject": data.get("email_subject", "Notification"), "email_body": message},
                    context,
                )
                if email_result.status == "success":
                    channels_notified.append("email")

            return NodeExecutionResult(
                node_id="", status="success",
                output={"user_id": developer.id, "channels_notified": channels_notified},
            )
        except Exception as e:
            return NodeExecutionResult(node_id="", status="failed", error=str(e))

    async def _notify_team(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send notification to an entire team."""
        from aexy.models.team import Team

        team_id = data.get("team_id")
        channel_id = data.get("channel_id")
        message = data.get("message", data.get("message_template", ""))
        message = self._render_template(message, context)

        if not team_id and not channel_id:
            return NodeExecutionResult(node_id="", status="failed", error="No team_id or channel_id specified")

        if team_id and not channel_id:
            try:
                result = await self.db.execute(select(Team).where(Team.id == team_id))
                team = result.scalar_one_or_none()
                if team:
                    channel_id = getattr(team, "slack_channel_id", None)
            except Exception:
                pass

        if not channel_id:
            return NodeExecutionResult(node_id="", status="failed", error="No channel available for team notification")

        return await self._send_slack(
            {"channel_id": channel_id, "message_template": message},
            context,
        )

    # =========================================================================
    # EMAIL MARKETING ACTIONS
    # =========================================================================

    async def _update_contact(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Update an email marketing contact (CRM record update)."""
        # Delegates to update_record with the contact data
        return await self._update_record(data, context)

    # =========================================================================
    # FORM ACTIONS
    # =========================================================================

    async def _send_response(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send a response/confirmation after form submission."""
        email_to = data.get("to") or data.get("email")
        if not email_to:
            email_to = context.record_data.get("values", {}).get("email")
        if not email_to:
            email_to = context.trigger_data.get("email")

        if not email_to:
            return NodeExecutionResult(node_id="", status="failed", error="No email address for response")

        subject = data.get("email_subject", data.get("subject", "Thank you for your submission"))
        body = data.get("email_body", data.get("message", "We have received your submission."))

        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

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
            node_id="", status="success",
            output={"to": email_to, "subject": subject, "queued": True},
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
    """Synchronous action handler (legacy, used for backward compat only).

    Note: Temporal's execute_workflow_action activity uses the async
    WorkflowActionHandler instead. This sync handler is retained for
    any remaining sync call-sites but dispatches to Temporal rather
    than Celery.
    """

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _dispatch_temporal(activity_name: str, activity_input, task_queue: str = "operations"):
        """Fire-and-forget dispatch to Temporal from synchronous code."""
        import asyncio
        from aexy.temporal.dispatch import dispatch as temporal_dispatch
        try:
            asyncio.run(temporal_dispatch(activity_name, activity_input, task_queue))
        except Exception as e:
            logger.warning(f"Failed to dispatch {activity_name} to Temporal: {e}")

    def execute_action(
        self,
        action_type: str,
        data: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute an action based on type."""
        handlers = {
            # CRM actions
            "update_record": self._update_record,
            "create_record": self._create_record,
            "delete_record": self._delete_record,
            "add_to_list": self._add_to_list,
            "remove_from_list": self._remove_from_list,
            "enroll_sequence": self._enroll_sequence,
            "unenroll_sequence": self._unenroll_sequence,
            "assign_owner": self._assign_owner,
            # Communication actions
            "send_email": self._send_email,
            "send_slack": self._send_slack,
            "send_sms": self._send_sms,
            "webhook_call": self._webhook_call,
            "api_request": self._webhook_call,
            "notify_user": self._notify_user,
            "notify_team": self._notify_team,
            # Task / Sprint actions
            "create_task": self._create_task,
            "update_task": self._update_task,
            "assign_task": self._assign_task,
            "move_task": self._move_task,
            "create_subtask": self._create_subtask,
            "add_comment": self._add_comment,
            # Ticket actions
            "update_ticket": self._update_ticket,
            "assign_ticket": self._assign_ticket,
            "add_response": self._add_response,
            "escalate": self._escalate,
            "change_priority": self._change_priority,
            "add_tag": self._add_tag,
            "remove_tag": self._remove_tag,
            # Hiring actions
            "update_candidate": self._update_candidate,
            "move_stage": self._move_stage,
            "schedule_interview": self._schedule_interview,
            "send_rejection": self._send_rejection,
            "create_offer": self._create_offer,
            "add_note": self._add_note,
            "assign_recruiter": self._assign_recruiter,
            # Uptime actions
            "pause_monitor": self._pause_monitor,
            "resume_monitor": self._resume_monitor,
            "create_incident": self._create_incident,
            "resolve_incident": self._resolve_incident,
            # Booking actions
            "confirm_booking": self._confirm_booking,
            "cancel_booking": self._cancel_booking,
            "reschedule_booking": self._reschedule_booking,
            "send_reminder": self._send_reminder,
            # Email marketing actions
            "send_campaign": self._send_campaign,
            "update_contact": self._update_contact,
            # Form actions
            "send_response": self._send_response,
            # Onboarding actions
            "trigger_onboarding": self._trigger_onboarding,
            "complete_onboarding_step": self._complete_onboarding_step,
            # AI Agent actions
            "run_agent": self._execute_agent,
        }

        handler = handlers.get(action_type)
        if not handler:
            return {"status": "failed", "error": f"Unknown action type: {action_type}"}

        return handler(data, context, execution)

    def _execute_agent(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Execute an AI agent synchronously."""
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
        """Create a sprint task."""
        from aexy.models.sprint import SprintTask
        from aexy.models.project import ProjectTeam

        title = data.get("task_title") or data.get("title", "New Task")
        description = data.get("task_description") or data.get("description", "")
        title = self._render_template(title, context)
        description = self._render_template(description, context)

        priority = data.get("task_priority") or data.get("priority", "medium")
        assignee_id = data.get("assignee_id")
        project_id = data.get("project_id")
        sprint_id = data.get("sprint_id")
        labels = data.get("labels", [])

        workspace_id = execution.workspace_id
        if not workspace_id:
            return {"status": "failed", "error": "No workspace_id in context"}

        # Look up team from project
        team_id = None
        if project_id:
            try:
                project_team = self.db.execute(
                    select(ProjectTeam).where(ProjectTeam.project_id == project_id).limit(1)
                ).scalar_one_or_none()
                if project_team:
                    team_id = project_team.team_id
            except Exception as e:
                logger.error(f"[CREATE_TASK] Failed to look up team for project: {e}")

        try:
            task = SprintTask(
                id=str(uuid4()),
                workspace_id=workspace_id,
                team_id=team_id,
                sprint_id=sprint_id,
                source_type="automation",
                source_id=str(uuid4()),
                title=title,
                description=description,
                priority=priority,
                assignee_id=assignee_id,
                labels=labels if isinstance(labels, list) else [],
                status="todo",
            )
            self.db.add(task)
            self.db.commit()

            logger.info(f"[CREATE_TASK] Task created: id={task.id}, title='{task.title}'")

            return {
                "status": "success",
                "output": {
                    "task_id": task.id,
                    "title": task.title,
                    "project_id": project_id,
                    "team_id": team_id,
                    "created": True,
                },
            }
        except Exception as e:
            logger.error(f"[CREATE_TASK] Failed: {e}", exc_info=True)
            return {"status": "failed", "error": f"Failed to create task: {str(e)}"}

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

    # =========================================================================
    # UPTIME MODULE ACTIONS (sync)
    # =========================================================================

    def _pause_monitor(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Pause an uptime monitor."""
        from aexy.models.uptime import UptimeMonitor

        monitor_id = data.get("monitor_id") or context.get("trigger_data", {}).get("monitor_id")
        if not monitor_id:
            return {"status": "failed", "error": "No monitor_id specified"}

        try:
            monitor = self.db.execute(
                select(UptimeMonitor).where(UptimeMonitor.id == monitor_id)
            ).scalar_one_or_none()
            if monitor:
                monitor.is_paused = True
                self.db.commit()
            else:
                return {"status": "failed", "error": f"Monitor {monitor_id} not found"}
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"monitor_id": monitor_id, "paused": True}}

    def _resume_monitor(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Resume a paused uptime monitor."""
        from aexy.models.uptime import UptimeMonitor

        monitor_id = data.get("monitor_id") or context.get("trigger_data", {}).get("monitor_id")
        if not monitor_id:
            return {"status": "failed", "error": "No monitor_id specified"}

        try:
            monitor = self.db.execute(
                select(UptimeMonitor).where(UptimeMonitor.id == monitor_id)
            ).scalar_one_or_none()
            if monitor:
                monitor.is_paused = False
                self.db.commit()
            else:
                return {"status": "failed", "error": f"Monitor {monitor_id} not found"}
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"monitor_id": monitor_id, "resumed": True}}

    def _create_incident(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create an uptime incident."""
        from aexy.models.uptime import UptimeIncident, UptimeIncidentStatus

        monitor_id = data.get("monitor_id") or context.get("trigger_data", {}).get("monitor_id")
        if not monitor_id:
            return {"status": "failed", "error": "No monitor_id specified"}

        try:
            incident = UptimeIncident(
                id=str(uuid4()),
                monitor_id=monitor_id,
                workspace_id=execution.workspace_id,
                status=UptimeIncidentStatus.ONGOING.value,
                first_error_message=data.get("error_message", "Incident created by automation"),
                first_error_type=data.get("error_type", "manual"),
                last_error_message=data.get("error_message", "Incident created by automation"),
                last_error_type=data.get("error_type", "manual"),
                total_checks=0,
                failed_checks=0,
            )
            self.db.add(incident)
            self.db.commit()
            return {"status": "success", "output": {"incident_id": incident.id, "monitor_id": monitor_id, "created": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _resolve_incident(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Resolve an uptime incident."""
        from aexy.models.uptime import UptimeIncident, UptimeIncidentStatus

        incident_id = data.get("incident_id") or context.get("trigger_data", {}).get("incident_id")
        monitor_id = data.get("monitor_id") or context.get("trigger_data", {}).get("monitor_id")

        if not incident_id and not monitor_id:
            return {"status": "failed", "error": "No incident_id or monitor_id specified"}

        try:
            if incident_id:
                incident = self.db.execute(
                    select(UptimeIncident).where(UptimeIncident.id == incident_id)
                ).scalar_one_or_none()
            elif monitor_id:
                incident = self.db.execute(
                    select(UptimeIncident).where(
                        UptimeIncident.monitor_id == monitor_id,
                        UptimeIncident.status == UptimeIncidentStatus.ONGOING.value,
                    )
                ).scalar_one_or_none()
            else:
                incident = None

            if incident:
                incident.status = UptimeIncidentStatus.RESOLVED.value
                incident.resolution_notes = data.get("resolution_notes", "Resolved by automation")
                incident.root_cause = data.get("root_cause")
                incident.resolved_at = datetime.now(timezone.utc)
                self.db.commit()
                return {"status": "success", "output": {"incident_id": incident.id, "resolved": True}}
            return {"status": "failed", "error": "Incident not found"}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # SPRINT MODULE ACTIONS (sync)
    # =========================================================================

    def _update_task(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Update a sprint task."""
        from aexy.models.sprint import SprintTask

        task_id = data.get("task_id") or context.get("trigger_data", {}).get("task_id")
        if not task_id:
            return {"status": "failed", "error": "No task_id specified"}

        try:
            task = self.db.execute(
                select(SprintTask).where(SprintTask.id == task_id)
            ).scalar_one_or_none()
            if not task:
                return {"status": "failed", "error": f"Task {task_id} not found"}
            for field in ("title", "description", "priority", "status", "story_points", "labels"):
                val = data.get(field)
                if val is not None:
                    setattr(task, field, val)
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"task_id": task_id, "updated": True}}

    def _assign_task(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Assign a sprint task."""
        from aexy.models.sprint import SprintTask

        task_id = data.get("task_id") or context.get("trigger_data", {}).get("task_id")
        developer_id = data.get("developer_id") or data.get("assignee_id")

        if not task_id:
            return {"status": "failed", "error": "No task_id specified"}
        if not developer_id:
            return {"status": "failed", "error": "No assignee_id specified"}

        try:
            task = self.db.execute(
                select(SprintTask).where(SprintTask.id == task_id)
            ).scalar_one_or_none()
            if not task:
                return {"status": "failed", "error": f"Task {task_id} not found"}
            task.assignee_id = developer_id
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"task_id": task_id, "assignee_id": developer_id, "assigned": True}}

    def _move_task(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Move a sprint task."""
        from aexy.models.sprint import SprintTask

        task_id = data.get("task_id") or context.get("trigger_data", {}).get("task_id")
        if not task_id:
            return {"status": "failed", "error": "No task_id specified"}

        try:
            task = self.db.execute(
                select(SprintTask).where(SprintTask.id == task_id)
            ).scalar_one_or_none()
            if not task:
                return {"status": "failed", "error": f"Task {task_id} not found"}
            if data.get("status"):
                task.status = data["status"]
            if data.get("sprint_id"):
                task.sprint_id = data["sprint_id"]
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"task_id": task_id, "moved": True}}

    def _create_subtask(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create a subtask."""
        from aexy.models.sprint import SprintTask

        parent_task_id = data.get("parent_task_id") or context.get("trigger_data", {}).get("task_id")
        if not parent_task_id:
            return {"status": "failed", "error": "No parent_task_id specified"}

        title = data.get("title", "Subtask")
        title = self._render_template(title, context)

        try:
            parent = self.db.execute(
                select(SprintTask).where(SprintTask.id == parent_task_id)
            ).scalar_one_or_none()
            if not parent:
                return {"status": "failed", "error": f"Parent task {parent_task_id} not found"}
            subtask = SprintTask(
                id=str(uuid4()),
                title=title,
                description=data.get("description"),
                priority=data.get("priority", "medium"),
                assignee_id=data.get("assignee_id"),
                parent_task_id=parent_task_id,
                workspace_id=parent.workspace_id,
                project_id=parent.project_id,
                sprint_id=parent.sprint_id,
                task_type="subtask",
            )
            self.db.add(subtask)
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"parent_task_id": parent_task_id, "created": True}}

    def _add_comment(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Add a comment to a sprint task."""
        from aexy.models.sprint import SprintTask

        task_id = data.get("task_id") or context.get("trigger_data", {}).get("task_id")
        comment_text = data.get("comment", data.get("message", ""))

        if not task_id:
            return {"status": "failed", "error": "No task_id specified"}
        if not comment_text:
            return {"status": "failed", "error": "No comment text specified"}

        comment_text = self._render_template(comment_text, context)

        try:
            task = self.db.execute(
                select(SprintTask).where(SprintTask.id == task_id)
            ).scalar_one_or_none()
            if not task:
                return {"status": "failed", "error": f"Task {task_id} not found"}

            custom_fields = dict(task.custom_fields) if task.custom_fields else {}
            comments = custom_fields.get("automation_comments", [])
            comments.append({
                "text": comment_text,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "automation",
            })
            custom_fields["automation_comments"] = comments
            task.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"task_id": task_id, "comment_added": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # TICKET MODULE ACTIONS (sync)
    # =========================================================================

    def _update_ticket(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Update a ticket."""
        from aexy.models.ticketing import Ticket

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}

        try:
            ticket = self.db.execute(
                select(Ticket).where(Ticket.id == ticket_id)
            ).scalar_one_or_none()
            if not ticket:
                return {"status": "failed", "error": f"Ticket {ticket_id} not found"}
            for field in ("status", "priority", "severity"):
                val = data.get(field)
                if val is not None:
                    setattr(ticket, field, val)
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"ticket_id": ticket_id, "updated": True}}

    def _assign_ticket(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Assign a ticket."""
        from aexy.models.ticketing import Ticket

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}

        try:
            ticket = self.db.execute(
                select(Ticket).where(Ticket.id == ticket_id)
            ).scalar_one_or_none()
            if not ticket:
                return {"status": "failed", "error": f"Ticket {ticket_id} not found"}
            if data.get("assignee_id"):
                ticket.assignee_id = data["assignee_id"]
            if data.get("team_id"):
                ticket.team_id = data["team_id"]
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"ticket_id": ticket_id, "assigned": True}}

    def _add_response(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Add a response to a ticket."""
        from aexy.models.ticketing import Ticket, TicketResponse

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        message = data.get("message", data.get("response", ""))

        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}
        if not message:
            return {"status": "failed", "error": "No message specified"}

        message = self._render_template(message, context)

        try:
            response = TicketResponse(
                id=str(uuid4()),
                ticket_id=ticket_id,
                content=message,
                is_internal=data.get("is_internal", False),
                source="automation",
            )
            self.db.add(response)
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"ticket_id": ticket_id, "response_added": True}}

    def _escalate(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Escalate a ticket."""
        from aexy.models.ticketing import Ticket

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        level = data.get("level", "level_1")

        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}

        try:
            ticket = self.db.execute(
                select(Ticket).where(Ticket.id == ticket_id)
            ).scalar_one_or_none()
            if not ticket:
                return {"status": "failed", "error": f"Ticket {ticket_id} not found"}
            ticket.escalation_level = level
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"ticket_id": ticket_id, "level": level, "escalated": True}}

    def _change_priority(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Change a ticket's priority."""
        from aexy.models.ticketing import Ticket

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        priority = data.get("priority")

        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}
        if not priority:
            return {"status": "failed", "error": "No priority specified"}

        try:
            ticket = self.db.execute(
                select(Ticket).where(Ticket.id == ticket_id)
            ).scalar_one_or_none()
            if not ticket:
                return {"status": "failed", "error": f"Ticket {ticket_id} not found"}
            ticket.priority = priority
            self.db.commit()
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        return {"status": "success", "output": {"ticket_id": ticket_id, "priority": priority, "updated": True}}

    def _add_tag(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Add a tag to a ticket."""
        from aexy.models.ticketing import Ticket

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        tag = data.get("tag", data.get("tag_name", ""))

        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}
        if not tag:
            return {"status": "failed", "error": "No tag specified"}

        try:
            ticket = self.db.execute(
                select(Ticket).where(Ticket.id == ticket_id)
            ).scalar_one_or_none()
            if not ticket:
                return {"status": "failed", "error": f"Ticket {ticket_id} not found"}

            tags = list(ticket.tags) if ticket.tags else []
            if tag not in tags:
                tags.append(tag)
                ticket.tags = tags
                self.db.commit()

            return {"status": "success", "output": {"ticket_id": ticket_id, "tag": tag, "tags": tags}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _remove_tag(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Remove a tag from a ticket."""
        from aexy.models.ticketing import Ticket

        ticket_id = data.get("ticket_id") or context.get("trigger_data", {}).get("ticket_id")
        tag = data.get("tag", data.get("tag_name", ""))

        if not ticket_id:
            return {"status": "failed", "error": "No ticket_id specified"}
        if not tag:
            return {"status": "failed", "error": "No tag specified"}

        try:
            ticket = self.db.execute(
                select(Ticket).where(Ticket.id == ticket_id)
            ).scalar_one_or_none()
            if not ticket:
                return {"status": "failed", "error": f"Ticket {ticket_id} not found"}

            tags = list(ticket.tags) if ticket.tags else []
            if tag in tags:
                tags.remove(tag)
                ticket.tags = tags
                self.db.commit()

            return {"status": "success", "output": {"ticket_id": ticket_id, "tag_removed": tag, "tags": tags}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # HIRING MODULE ACTIONS (sync)
    # =========================================================================

    def _update_candidate(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Update a hiring candidate's custom fields."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            if data.get("status"):
                custom_fields["hiring_status"] = data["status"]
            if data.get("notes"):
                existing = custom_fields.get("notes", "")
                custom_fields["notes"] = f"{existing}\n\n---\n{data['notes']}" if existing else data["notes"]
            if data.get("rating"):
                custom_fields["rating"] = data["rating"]
            if data.get("custom_data"):
                custom_fields.update(data["custom_data"])

            candidate.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"candidate_id": candidate.id, "updated": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _move_stage(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Move a candidate to a different hiring stage."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        new_stage = data.get("stage")

        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}
        if not new_stage:
            return {"status": "failed", "error": "No stage specified"}

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            old_stage = custom_fields.get("hiring_status", "applied")
            custom_fields["hiring_status"] = new_stage
            custom_fields["stage_changed_at"] = datetime.now(timezone.utc).isoformat()
            candidate.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"candidate_id": candidate.id, "old_stage": old_stage, "new_stage": new_stage}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _schedule_interview(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Schedule an interview for a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            current_status = custom_fields.get("hiring_status", "applied")
            if current_status not in ("interviewing", "offer", "hired"):
                custom_fields["hiring_status"] = "interviewing"

            interview_data = {
                "interviewer_id": data.get("interviewer_id"),
                "interview_type": data.get("interview_type", "video"),
                "scheduled_at": data.get("scheduled_at"),
                "duration_minutes": data.get("duration_minutes", 60),
                "notes": data.get("notes", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            interviews = custom_fields.get("scheduled_interviews", [])
            if not isinstance(interviews, list):
                interviews = []
            interviews.append(interview_data)
            custom_fields["scheduled_interviews"] = interviews
            candidate.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"candidate_id": candidate.id, "interview_scheduled": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _send_rejection(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send a rejection for a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            custom_fields["hiring_status"] = "rejected"
            custom_fields["rejected_at"] = datetime.now(timezone.utc).isoformat()
            custom_fields["rejection_reason"] = data.get("reason", "")
            candidate.custom_fields = custom_fields
            self.db.commit()

            # Send rejection email if configured
            email_to = data.get("email") or (candidate.email if hasattr(candidate, "email") else None)
            if email_to:
                from aexy.temporal.activities.email import SendWorkflowEmailInput
                body = data.get("email_body", data.get("message", "Thank you for your application."))
                body = self._render_template(body, context)
                self._dispatch_temporal(
                    "send_workflow_email",
                    SendWorkflowEmailInput(
                        workspace_id=execution.workspace_id,
                        to_email=email_to,
                        subject=data.get("email_subject", "Application Update"),
                        html_body=body,
                        record_id=execution.record_id,
                    ),
                    task_queue="email",
                )

            return {"status": "success", "output": {"candidate_id": candidate.id, "rejected": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _create_offer(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create an offer for a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            custom_fields["hiring_status"] = "offer"
            custom_fields["offer_details"] = {
                "position": data.get("position", ""),
                "salary": data.get("salary", ""),
                "start_date": data.get("start_date", ""),
                "notes": data.get("notes", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            candidate.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"candidate_id": candidate.id, "offer_created": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _add_note(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Add a note to a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        note_text = data.get("note", data.get("message", ""))

        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}
        if not note_text:
            return {"status": "failed", "error": "No note text specified"}

        note_text = self._render_template(note_text, context)

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            existing = custom_fields.get("notes", "")
            custom_fields["notes"] = f"{existing}\n\n---\n{note_text}" if existing else note_text
            candidate.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"candidate_id": candidate.id, "note_added": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _assign_recruiter(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Assign a recruiter to a candidate."""
        from aexy.models.assessment import Candidate

        candidate_id = data.get("candidate_id") or context.get("trigger_data", {}).get("candidate_id")
        recruiter_id = data.get("recruiter_id") or data.get("assignee_id")

        if not candidate_id:
            return {"status": "failed", "error": "No candidate_id specified"}
        if not recruiter_id:
            return {"status": "failed", "error": "No recruiter_id specified"}

        try:
            candidate = self.db.execute(
                select(Candidate).where(Candidate.id == candidate_id)
            ).scalar_one_or_none()
            if not candidate:
                return {"status": "failed", "error": f"Candidate {candidate_id} not found"}

            custom_fields = dict(candidate.custom_fields) if candidate.custom_fields else {}
            custom_fields["recruiter_id"] = recruiter_id
            custom_fields["recruiter_assigned_at"] = datetime.now(timezone.utc).isoformat()
            candidate.custom_fields = custom_fields
            self.db.commit()

            return {"status": "success", "output": {"candidate_id": candidate.id, "recruiter_id": recruiter_id}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    # =========================================================================
    # BOOKING MODULE ACTIONS (sync)
    # =========================================================================

    def _confirm_booking(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Confirm a booking."""
        from aexy.models.booking.booking import Booking

        booking_id = data.get("booking_id") or context.get("trigger_data", {}).get("booking_id")
        if not booking_id:
            return {"status": "failed", "error": "No booking_id specified"}

        try:
            booking = self.db.execute(
                select(Booking).where(Booking.id == booking_id)
            ).scalar_one_or_none()
            if not booking:
                return {"status": "failed", "error": f"Booking {booking_id} not found"}

            booking.status = "confirmed"
            self.db.commit()
            return {"status": "success", "output": {"booking_id": booking.id, "status": "confirmed"}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _cancel_booking(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Cancel a booking."""
        from aexy.models.booking.booking import Booking

        booking_id = data.get("booking_id") or context.get("trigger_data", {}).get("booking_id")
        if not booking_id:
            return {"status": "failed", "error": "No booking_id specified"}

        try:
            booking = self.db.execute(
                select(Booking).where(Booking.id == booking_id)
            ).scalar_one_or_none()
            if not booking:
                return {"status": "failed", "error": f"Booking {booking_id} not found"}

            booking.status = "cancelled"
            booking.cancelled_at = datetime.now(timezone.utc)
            booking.cancellation_reason = data.get("reason", "Cancelled by automation")
            booking.cancelled_by = "system"
            self.db.commit()
            return {"status": "success", "output": {"booking_id": booking.id, "status": "cancelled"}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _reschedule_booking(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Reschedule a booking."""
        from aexy.models.booking.booking import Booking

        booking_id = data.get("booking_id") or context.get("trigger_data", {}).get("booking_id")
        new_start_time = data.get("new_start_time")

        if not booking_id:
            return {"status": "failed", "error": "No booking_id specified"}
        if not new_start_time:
            return {"status": "failed", "error": "No new_start_time specified"}

        try:
            booking = self.db.execute(
                select(Booking).where(Booking.id == booking_id)
            ).scalar_one_or_none()
            if not booking:
                return {"status": "failed", "error": f"Booking {booking_id} not found"}

            old_start = booking.start_time
            from dateutil.parser import parse as parse_datetime
            booking.start_time = parse_datetime(new_start_time)
            if data.get("new_end_time"):
                booking.end_time = parse_datetime(data["new_end_time"])

            answers = dict(booking.answers) if booking.answers else {}
            history = answers.get("reschedule_history", [])
            history.append({
                "old_start": old_start.isoformat() if old_start else None,
                "new_start": new_start_time,
                "reason": data.get("reason", "Rescheduled by automation"),
                "rescheduled_at": datetime.now(timezone.utc).isoformat(),
            })
            answers["reschedule_history"] = history
            booking.answers = answers
            booking.status = "confirmed"
            self.db.commit()

            return {"status": "success", "output": {"booking_id": booking.id, "rescheduled": True}}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

    def _send_reminder(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send a booking reminder."""
        from aexy.temporal.activities.email import SendWorkflowEmailInput

        message = data.get("message", data.get("message_template", "Reminder: You have an upcoming booking."))
        message = self._render_template(message, context)

        email_to = data.get("to") or data.get("email")
        if not email_to:
            record_data = context.get("record_data", {})
            email_to = record_data.get("values", {}).get("email")

        if not email_to:
            return {"status": "failed", "error": "No email address for reminder"}

        self._dispatch_temporal(
            "send_workflow_email",
            SendWorkflowEmailInput(
                workspace_id=execution.workspace_id,
                to_email=email_to,
                subject=data.get("subject", "Booking Reminder"),
                html_body=message,
                record_id=execution.record_id,
            ),
            task_queue="email",
        )
        return {"status": "success", "output": {"to": email_to, "queued": True}}

    # =========================================================================
    # NOTIFICATION ACTIONS (sync)
    # =========================================================================

    def _notify_user(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send notification to a specific user."""
        from aexy.temporal.activities.integrations import SendSlackWorkflowMessageInput
        from aexy.temporal.activities.email import SendWorkflowEmailInput

        user_id = data.get("user_id")
        user_email = data.get("user_email")
        message = data.get("message", data.get("message_template", ""))
        channel = data.get("channel", "slack")
        message = self._render_template(message, context)

        if not user_id and not user_email:
            return {"status": "failed", "error": "No user_id or user_email specified"}

        if channel in ("slack", "both"):
            self._dispatch_temporal(
                "send_slack_workflow_message",
                SendSlackWorkflowMessageInput(
                    workspace_id=execution.workspace_id,
                    target_type="dm",
                    target=user_email or user_id,
                    message=message,
                    record_id=execution.record_id,
                ),
                task_queue="integrations",
            )

        if channel in ("email", "both"):
            if user_email:
                self._dispatch_temporal(
                    "send_workflow_email",
                    SendWorkflowEmailInput(
                        workspace_id=execution.workspace_id,
                        to_email=user_email,
                        subject=data.get("email_subject", "Notification"),
                        html_body=message,
                        record_id=execution.record_id,
                    ),
                    task_queue="email",
                )

        return {"status": "success", "output": {"user": user_id or user_email, "channel": channel, "queued": True}}

    def _notify_team(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send notification to an entire team."""
        from aexy.temporal.activities.integrations import SendSlackMessageInput

        channel_id = data.get("channel_id")
        message = data.get("message", data.get("message_template", ""))
        message = self._render_template(message, context)

        if not channel_id:
            return {"status": "failed", "error": "No channel_id specified"}

        self._dispatch_temporal(
            "send_slack_message",
            SendSlackMessageInput(
                workspace_id=execution.workspace_id,
                channel=channel_id,
                message=message,
            ),
            task_queue="integrations",
        )
        return {"status": "success", "output": {"channel_id": channel_id, "queued": True}}

    # =========================================================================
    # EMAIL MARKETING ACTIONS (sync)
    # =========================================================================

    def _update_contact(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Update an email marketing contact."""
        return self._update_record(data, context, execution)

    # =========================================================================
    # FORM ACTIONS (sync)
    # =========================================================================

    def _send_response(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send a response after form submission."""
        from aexy.temporal.activities.email import SendWorkflowEmailInput

        email_to = data.get("to") or data.get("email")
        if not email_to:
            record_data = context.get("record_data", {})
            email_to = record_data.get("values", {}).get("email")
        if not email_to:
            email_to = context.get("trigger_data", {}).get("email")

        if not email_to:
            return {"status": "failed", "error": "No email address for response"}

        subject = data.get("email_subject", data.get("subject", "Thank you for your submission"))
        body = data.get("email_body", data.get("message", "We have received your submission."))
        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

        self._dispatch_temporal(
            "send_workflow_email",
            SendWorkflowEmailInput(
                workspace_id=execution.workspace_id,
                to_email=email_to,
                subject=subject,
                html_body=body,
                record_id=execution.record_id,
            ),
            task_queue="email",
        )
        return {"status": "success", "output": {"to": email_to, "subject": subject, "queued": True}}

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
