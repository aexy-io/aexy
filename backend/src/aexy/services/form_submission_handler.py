"""Form submission handler for processing submissions to multiple destinations."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.forms import (
    Form,
    FormField,
    FormSubmission,
    FormAutomationLink,
    FormSubmissionStatus,
    TicketAssignmentMode,
    generate_verification_token,
)
from aexy.models.ticketing import Ticket, TicketStatus
from aexy.models.crm import (
    CRMRecord,
    CRMObject,
    CRMActivity,
    CRMActivityType,
    CRMAutomation,
    CRMAutomationRun,
    CRMRecordRelation,
)
from aexy.schemas.forms import PublicFormSubmission


class FormSubmissionHandler:
    """
    Central handler that routes form submissions to all configured destinations.
    Supports parallel creation of tickets, CRM records, and deals.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_submission(
        self,
        form: Form,
        submission_data: PublicFormSubmission,
        ip_address: str | None = None,
        user_agent: str | None = None,
        referrer_url: str | None = None,
    ) -> FormSubmission:
        """
        Process a form submission and route to all configured destinations.

        Args:
            form: The form being submitted.
            submission_data: The submitted form data.
            ip_address: IP address of the submitter.
            user_agent: User agent string.
            referrer_url: Referring URL.

        Returns:
            FormSubmission with links to all created resources.
        """
        # 1. Validate submission data against form field rules
        validated_data = await self._validate_submission(form, submission_data.data)

        # 2. Create FormSubmission record
        submission = FormSubmission(
            id=str(uuid4()),
            form_id=form.id,
            workspace_id=form.workspace_id,
            data=validated_data,
            email=submission_data.email,
            name=submission_data.name,
            ip_address=ip_address,
            user_agent=user_agent,
            referrer_url=referrer_url,
            utm_params=submission_data.utm_params or {},
            status=FormSubmissionStatus.PROCESSING.value,
        )

        # Handle email verification if required
        if form.auth_mode == "email_verification" and submission_data.email:
            submission.verification_token = generate_verification_token()
            submission.is_verified = False
        else:
            submission.is_verified = True

        self.db.add(submission)
        await self.db.flush()

        # 3. Process all destinations in parallel
        errors = []

        try:
            results = await asyncio.gather(
                self._handle_ticket_creation(form, submission),
                self._handle_crm_record_creation(form, submission),
                self._handle_deal_creation(form, submission),
                return_exceptions=True,
            )

            # Process results
            ticket_result, crm_result, deal_result = results

            # Handle ticket result
            if isinstance(ticket_result, Exception):
                errors.append({
                    "destination": "ticket",
                    "error": str(ticket_result),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            elif ticket_result:
                submission.ticket_id = ticket_result.id

            # Handle CRM record result
            if isinstance(crm_result, Exception):
                errors.append({
                    "destination": "crm_record",
                    "error": str(crm_result),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            elif crm_result:
                submission.crm_record_id = crm_result.id

            # Handle deal result
            if isinstance(deal_result, Exception):
                errors.append({
                    "destination": "deal",
                    "error": str(deal_result),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            elif deal_result:
                submission.deal_id = deal_result.id

            # 4. Link deal to CRM record if both exist
            if submission.crm_record_id and submission.deal_id and form.link_deal_to_record:
                await self._link_records(submission.crm_record_id, submission.deal_id)

            # 5. Trigger automations (after records are created)
            if form.trigger_automations:
                automation_results = await self._trigger_automations(form, submission)
                submission.automations_triggered = automation_results

            # 6. Handle external destinations (GitHub, Jira, Linear)
            if form.destinations:
                external_results = await self._handle_external_destinations(form, submission)
                submission.external_issues = external_results

            # 7. Log activity in CRM (if CRM record exists)
            if submission.crm_record_id:
                await self._log_crm_activity(form, submission)

        except Exception as e:
            errors.append({
                "destination": "general",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        # 8. Update submission status
        submission.processing_errors = errors
        if errors:
            if submission.ticket_id or submission.crm_record_id or submission.deal_id:
                submission.status = FormSubmissionStatus.PARTIALLY_FAILED.value
            else:
                submission.status = FormSubmissionStatus.FAILED.value
        else:
            submission.status = FormSubmissionStatus.COMPLETED.value

        submission.processed_at = datetime.now(timezone.utc)

        # 9. Increment form submission count
        form.submission_count += 1

        await self.db.flush()
        await self.db.refresh(submission)

        return submission

    async def _validate_submission(
        self,
        form: Form,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Validate submission data against form field rules."""
        validated = {}

        for field in form.fields:
            value = data.get(field.field_key)

            # Check required fields
            if field.is_required and (value is None or value == ""):
                raise ValueError(f"Field '{field.name}' is required")

            if value is not None and value != "":
                # Apply validation rules
                rules = field.validation_rules or {}

                if field.field_type in ("text", "textarea"):
                    if not isinstance(value, str):
                        raise ValueError(f"Field '{field.name}' must be a string")
                    if "min_length" in rules and len(value) < rules["min_length"]:
                        raise ValueError(f"Field '{field.name}' must be at least {rules['min_length']} characters")
                    if "max_length" in rules and len(value) > rules["max_length"]:
                        raise ValueError(f"Field '{field.name}' must be at most {rules['max_length']} characters")

                elif field.field_type == "email":
                    if not isinstance(value, str) or "@" not in value:
                        raise ValueError(f"Field '{field.name}' must be a valid email")

                elif field.field_type == "number":
                    try:
                        num_value = float(value)
                        if "min" in rules and num_value < rules["min"]:
                            raise ValueError(f"Field '{field.name}' must be at least {rules['min']}")
                        if "max" in rules and num_value > rules["max"]:
                            raise ValueError(f"Field '{field.name}' must be at most {rules['max']}")
                    except (TypeError, ValueError):
                        raise ValueError(f"Field '{field.name}' must be a number")

                elif field.field_type in ("select", "radio"):
                    valid_values = [o["value"] for o in (field.options or [])]
                    if value not in valid_values:
                        raise ValueError(f"Field '{field.name}' has an invalid value")

                elif field.field_type == "multiselect":
                    if not isinstance(value, list):
                        raise ValueError(f"Field '{field.name}' must be a list")
                    valid_values = [o["value"] for o in (field.options or [])]
                    for v in value:
                        if v not in valid_values:
                            raise ValueError(f"Field '{field.name}' has an invalid value: {v}")

                validated[field.field_key] = value

        return validated

    async def _handle_ticket_creation(
        self,
        form: Form,
        submission: FormSubmission,
    ) -> Ticket | None:
        """Create a ticket if form.auto_create_ticket is True."""
        if not form.auto_create_ticket:
            return None

        # Get next ticket number
        query = select(func.coalesce(func.max(Ticket.ticket_number), 0) + 1).where(
            Ticket.workspace_id == form.workspace_id
        )
        ticket_number = await self.db.scalar(query)

        # Map form fields to ticket fields
        mappings = form.ticket_field_mappings or {}
        ticket_config = form.ticket_config or {}

        # Get title and description from mappings or use defaults
        title = self._get_mapped_value(submission.data, mappings, "title", "Form Submission")
        description = self._get_mapped_value(submission.data, mappings, "description", "")

        # Apply templates if configured
        if "title_template" in ticket_config:
            title = self._apply_template(ticket_config["title_template"], submission.data)
        if "description_template" in ticket_config:
            description = self._apply_template(ticket_config["description_template"], submission.data)

        # Get priority/severity from mappings or use defaults
        priority = self._get_mapped_value(submission.data, mappings, "priority", form.default_priority)
        severity = self._get_mapped_value(submission.data, mappings, "severity", form.default_severity)

        ticket = Ticket(
            id=str(uuid4()),
            form_id=form.id,
            workspace_id=form.workspace_id,
            ticket_number=ticket_number,
            submitter_email=submission.email,
            submitter_name=submission.name,
            email_verified=submission.is_verified,
            field_values=submission.data,
            status=TicketStatus.NEW.value,
            priority=priority,
            severity=severity,
            team_id=form.default_team_id,
            source_ip=submission.ip_address,
            user_agent=submission.user_agent,
            referrer_url=submission.referrer_url,
        )

        # Handle assignment
        if form.ticket_assignment_mode == TicketAssignmentMode.SPECIFIC_USER.value:
            ticket.assignee_id = form.ticket_assignee_id
        elif form.ticket_assignment_mode == TicketAssignmentMode.ONCALL.value:
            # TODO: Implement on-call assignment
            pass
        elif form.ticket_assignment_mode == TicketAssignmentMode.ROUND_ROBIN.value:
            # TODO: Implement round-robin assignment
            pass

        self.db.add(ticket)
        await self.db.flush()

        return ticket

    async def _handle_crm_record_creation(
        self,
        form: Form,
        submission: FormSubmission,
    ) -> CRMRecord | None:
        """Create a CRM record if form.auto_create_record is True."""
        if not form.auto_create_record or not form.crm_object_id:
            return None

        # Map form fields to CRM attributes
        mappings = form.crm_field_mappings or {}
        record_values = {}

        for form_key, crm_slug in mappings.items():
            if form_key in submission.data:
                record_values[crm_slug] = submission.data[form_key]

        # Create display name from primary values
        display_name = self._generate_display_name(record_values, submission)

        record = CRMRecord(
            id=str(uuid4()),
            workspace_id=form.workspace_id,
            object_id=form.crm_object_id,
            values=record_values,
            display_name=display_name,
            owner_id=form.record_owner_id,
            source="form_submission",
        )

        self.db.add(record)
        await self.db.flush()

        return record

    async def _handle_deal_creation(
        self,
        form: Form,
        submission: FormSubmission,
    ) -> CRMRecord | None:
        """Create a deal if form.auto_create_deal is True."""
        if not form.auto_create_deal:
            return None

        # Get the deal object for this workspace
        query = select(CRMObject).where(
            CRMObject.workspace_id == form.workspace_id,
            CRMObject.object_type == "deal",
        )
        result = await self.db.execute(query)
        deal_object = result.scalar_one_or_none()

        if not deal_object:
            raise ValueError("Deal object not found in workspace")

        # Map form fields to deal attributes
        mappings = form.deal_field_mappings or {}
        deal_values = {}

        for form_key, deal_slug in mappings.items():
            if form_key in submission.data:
                deal_values[deal_slug] = submission.data[form_key]

        # Add pipeline and stage
        if form.deal_pipeline_id:
            deal_values["pipeline_id"] = form.deal_pipeline_id
        if form.deal_stage_id:
            deal_values["stage_id"] = form.deal_stage_id

        # Create display name
        display_name = self._generate_display_name(deal_values, submission, prefix="Deal: ")

        deal = CRMRecord(
            id=str(uuid4()),
            workspace_id=form.workspace_id,
            object_id=deal_object.id,
            values=deal_values,
            display_name=display_name,
            owner_id=form.record_owner_id,
            source="form_submission",
        )

        self.db.add(deal)
        await self.db.flush()

        return deal

    async def _link_records(self, record_id: str, deal_id: str) -> None:
        """Link a CRM record to a deal."""
        relation = CRMRecordRelation(
            id=str(uuid4()),
            source_record_id=deal_id,
            target_record_id=record_id,
            relation_type="contact",
        )
        self.db.add(relation)
        await self.db.flush()

    async def _trigger_automations(
        self,
        form: Form,
        submission: FormSubmission,
    ) -> list[dict]:
        """Trigger automations linked to the form."""
        results = []

        # Get linked automations
        query = (
            select(FormAutomationLink)
            .where(FormAutomationLink.form_id == form.id)
            .where(FormAutomationLink.is_active == True)
        )
        result = await self.db.execute(query)
        links = list(result.scalars().all())

        for link in links:
            # Check conditions if any
            if link.conditions and not self._evaluate_conditions(link.conditions, submission.data):
                continue

            # Get automation
            automation_query = select(CRMAutomation).where(CRMAutomation.id == link.automation_id)
            automation_result = await self.db.execute(automation_query)
            automation = automation_result.scalar_one_or_none()

            if not automation or not automation.is_active:
                continue

            # Create automation run
            run = CRMAutomationRun(
                id=str(uuid4()),
                automation_id=automation.id,
                record_id=submission.crm_record_id,
                trigger_data={
                    "form_id": form.id,
                    "submission_id": submission.id,
                    "submission_data": submission.data,
                },
                status="pending",
            )
            self.db.add(run)

            results.append({
                "automation_id": automation.id,
                "automation_name": automation.name,
                "run_id": run.id,
                "status": "pending",
                "triggered_at": datetime.now(timezone.utc).isoformat(),
            })

        await self.db.flush()

        # TODO: Queue automation runs for async processing

        return results

    async def _handle_external_destinations(
        self,
        form: Form,
        submission: FormSubmission,
    ) -> list[dict]:
        """Send submission to external destinations (GitHub, Jira, Linear)."""
        results = []

        for destination in form.destinations:
            if not destination.get("enabled", True):
                continue

            dest_type = destination.get("type")

            try:
                if dest_type == "github":
                    issue = await self._create_github_issue(form, submission, destination)
                    if issue:
                        results.append(issue)
                elif dest_type == "jira":
                    issue = await self._create_jira_issue(form, submission, destination)
                    if issue:
                        results.append(issue)
                elif dest_type == "linear":
                    issue = await self._create_linear_issue(form, submission, destination)
                    if issue:
                        results.append(issue)
            except Exception as e:
                results.append({
                    "platform": dest_type,
                    "error": str(e),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

        return results

    async def _create_github_issue(
        self,
        form: Form,
        submission: FormSubmission,
        config: dict,
    ) -> dict | None:
        """Create a GitHub issue from the submission."""
        # TODO: Implement GitHub integration
        return None

    async def _create_jira_issue(
        self,
        form: Form,
        submission: FormSubmission,
        config: dict,
    ) -> dict | None:
        """Create a Jira issue from the submission."""
        # TODO: Implement Jira integration
        return None

    async def _create_linear_issue(
        self,
        form: Form,
        submission: FormSubmission,
        config: dict,
    ) -> dict | None:
        """Create a Linear issue from the submission."""
        # TODO: Implement Linear integration
        return None

    async def _log_crm_activity(
        self,
        form: Form,
        submission: FormSubmission,
    ) -> None:
        """Log a form submission activity in CRM."""
        activity = CRMActivity(
            id=str(uuid4()),
            workspace_id=form.workspace_id,
            record_id=submission.crm_record_id,
            activity_type=CRMActivityType.FORM_SUBMITTED.value,
            actor_type="contact",
            actor_name=submission.name or submission.email,
            title=f"Submitted form: {form.name}",
            description=f"Form submission via {form.name}",
            activity_metadata={
                "form_id": form.id,
                "form_name": form.name,
                "submission_id": submission.id,
                "submission_data": submission.data,
            },
        )
        self.db.add(activity)
        await self.db.flush()

    def _get_mapped_value(
        self,
        data: dict,
        mappings: dict,
        target_field: str,
        default: Any = None,
    ) -> Any:
        """Get a value from data using field mappings."""
        for form_key, mapped_field in mappings.items():
            if mapped_field == target_field and form_key in data:
                return data[form_key]
        return default

    def _apply_template(self, template: str, data: dict) -> str:
        """Apply a template string with data placeholders."""
        result = template
        for key, value in data.items():
            result = result.replace(f"{{{key}}}", str(value) if value else "")
        return result

    def _generate_display_name(
        self,
        values: dict,
        submission: FormSubmission,
        prefix: str = "",
    ) -> str:
        """Generate a display name for a record."""
        # Try common name fields
        for field in ["name", "full_name", "title", "company", "email"]:
            if field in values and values[field]:
                return f"{prefix}{values[field]}"

        # Fallback to submission info
        if submission.name:
            return f"{prefix}{submission.name}"
        if submission.email:
            return f"{prefix}{submission.email}"

        return f"{prefix}Form Submission"

    def _evaluate_conditions(self, conditions: list[dict], data: dict) -> bool:
        """Evaluate conditions against submission data."""
        if not conditions:
            return True

        for condition in conditions:
            field_key = condition.get("field_key")
            operator = condition.get("operator")
            expected_value = condition.get("value")
            actual_value = data.get(field_key)

            if operator == "equals":
                if actual_value != expected_value:
                    return False
            elif operator == "not_equals":
                if actual_value == expected_value:
                    return False
            elif operator == "contains":
                if expected_value not in str(actual_value or ""):
                    return False
            elif operator == "is_empty":
                if actual_value is not None and actual_value != "":
                    return False
            elif operator == "is_not_empty":
                if actual_value is None or actual_value == "":
                    return False

        return True

    # =========================================================================
    # EMAIL VERIFICATION
    # =========================================================================

    async def verify_email(self, token: str) -> FormSubmission | None:
        """Verify a submission email using the verification token."""
        query = select(FormSubmission).where(FormSubmission.verification_token == token)
        result = await self.db.execute(query)
        submission = result.scalar_one_or_none()

        if not submission:
            return None

        submission.is_verified = True
        submission.verified_at = datetime.now(timezone.utc)
        submission.verification_token = None

        await self.db.flush()
        await self.db.refresh(submission)

        return submission

    # =========================================================================
    # SUBMISSION QUERIES
    # =========================================================================

    async def get_submission(self, submission_id: str) -> FormSubmission | None:
        """Get a submission by ID."""
        query = select(FormSubmission).where(FormSubmission.id == submission_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_submissions(
        self,
        form_id: str | None = None,
        workspace_id: str | None = None,
        email: str | None = None,
        status: list[str] | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[FormSubmission], int]:
        """List form submissions with filters."""
        query = select(FormSubmission)

        if form_id:
            query = query.where(FormSubmission.form_id == form_id)
        if workspace_id:
            query = query.where(FormSubmission.workspace_id == workspace_id)
        if email:
            query = query.where(FormSubmission.email == email)
        if status:
            query = query.where(FormSubmission.status.in_(status))

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query)

        # Get paginated results
        query = query.order_by(FormSubmission.submitted_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        submissions = list(result.scalars().all())

        return submissions, total or 0
