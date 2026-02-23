"""Identity Resolution Engine — resolves anonymous visitors to CRM records.

Resolution methods (in priority order):
1. Form submission — email match from form_submit event
2. Email click-through — tracking link clicked from known email
3. Snitcher company match — IP-to-company matched to CRM company record
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm import (
    BehavioralEvent,
    VisitorSession,
    VisitorIdentification,
    LeadScore,
)

logger = logging.getLogger(__name__)


class IdentityResolutionService:
    """Resolve anonymous_id to CRM record via multiple signals."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def resolve_by_email(
        self, workspace_id: str, anonymous_id: str, email: str,
    ) -> str | None:
        """Resolve via email (form submission or click-through).

        Looks up email in CRM records and links all events for this anonymous_id.
        Returns record_id if resolved, None otherwise.
        """
        # Find CRM record with this email
        from aexy.models.crm import CRMRecord, CRMAttribute

        # Look for email attribute values across all records
        # CRM records store values in JSONB, so we search for email matches
        record_id = await self._find_record_by_email(workspace_id, email)
        if not record_id:
            return None

        # Link all events and sessions for this anonymous_id
        await self._link_anonymous_to_record(workspace_id, anonymous_id, record_id)

        # Trigger lead rescoring
        await self._trigger_rescore(workspace_id, record_id)

        return record_id

    async def resolve_by_company_match(
        self, workspace_id: str, session_id: str, company_domain: str,
    ) -> str | None:
        """Resolve via Snitcher company identification.

        Matches identified company domain to CRM company record.
        Returns record_id if matched, None otherwise.
        """
        if not company_domain:
            return None

        # Find CRM company record with matching domain
        record_id = await self._find_company_by_domain(workspace_id, company_domain)
        if not record_id:
            return None

        # Update session
        session = (await self.db.execute(
            select(VisitorSession).where(VisitorSession.id == session_id)
        )).scalar_one_or_none()

        if session:
            session.record_id = record_id
            session.identification_status = "company_identified"

        # Update identification record
        await self.db.execute(
            update(VisitorIdentification)
            .where(VisitorIdentification.session_id == session_id)
            .values(matched_record_id=record_id)
        )

        await self.db.flush()
        return record_id

    async def retroactive_link(
        self, workspace_id: str, anonymous_id: str, record_id: str,
    ) -> int:
        """Retroactively link all behavioral events for an anonymous_id to a record.

        Returns count of events updated.
        """
        return await self._link_anonymous_to_record(workspace_id, anonymous_id, record_id)

    async def _find_record_by_email(
        self, workspace_id: str, email: str,
    ) -> str | None:
        """Find a CRM record by email across all objects."""
        from aexy.models.crm import CRMRecord

        # Search in JSONB values for email match
        # CRM records store field values in a JSONB 'values' column
        result = await self.db.execute(
            select(CRMRecord.id).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.values.op("@>")('{"email": "' + email.lower() + '"}'),
                )
            ).limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            return str(row)

        # Also check other common email field names
        for field_name in ["work_email", "personal_email", "contact_email"]:
            result = await self.db.execute(
                select(CRMRecord.id).where(
                    and_(
                        CRMRecord.workspace_id == workspace_id,
                        CRMRecord.values.op("@>")('{"' + field_name + '": "' + email.lower() + '"}'),
                    )
                ).limit(1)
            )
            row = result.scalar_one_or_none()
            if row:
                return str(row)

        return None

    async def _find_company_by_domain(
        self, workspace_id: str, domain: str,
    ) -> str | None:
        """Find a CRM company record by domain."""
        from aexy.models.crm import CRMRecord, CRMObject

        # First find the company object type
        company_obj = (await self.db.execute(
            select(CRMObject.id).where(
                and_(
                    CRMObject.workspace_id == workspace_id,
                    CRMObject.object_type == "company",
                )
            ).limit(1)
        )).scalar_one_or_none()

        if not company_obj:
            return None

        # Search for domain in company records
        result = await self.db.execute(
            select(CRMRecord.id).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.object_id == str(company_obj),
                    CRMRecord.values.op("@>")('{"domain": "' + domain.lower() + '"}'),
                )
            ).limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            return str(row)

        # Also check website field
        result = await self.db.execute(
            select(CRMRecord.id).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.object_id == str(company_obj),
                    CRMRecord.values.op("@>")('{"website": "' + domain.lower() + '"}'),
                )
            ).limit(1)
        )
        row = result.scalar_one_or_none()
        return str(row) if row else None

    async def _link_anonymous_to_record(
        self, workspace_id: str, anonymous_id: str, record_id: str,
    ) -> int:
        """Link all events and sessions for an anonymous_id to a record."""
        # Update events
        event_result = await self.db.execute(
            update(BehavioralEvent)
            .where(
                and_(
                    BehavioralEvent.workspace_id == workspace_id,
                    BehavioralEvent.anonymous_id == anonymous_id,
                )
            )
            .values(record_id=record_id)
        )

        # Update sessions
        await self.db.execute(
            update(VisitorSession)
            .where(
                and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.anonymous_id == anonymous_id,
                )
            )
            .values(
                record_id=record_id,
                identification_status="contact_identified",
            )
        )

        await self.db.flush()
        return event_result.rowcount

    async def _trigger_rescore(self, workspace_id: str, record_id: str) -> None:
        """Trigger lead rescoring after identity resolution."""
        try:
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue

            await dispatch(
                "score_lead",
                {"workspace_id": workspace_id, "record_id": record_id},
                task_queue=TaskQueue.INTEGRATIONS,
            )
        except Exception:
            logger.exception(f"Failed to trigger rescore for record {record_id}")
