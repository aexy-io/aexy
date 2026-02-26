"""GTM Compliance service — consent management, suppression lists, pre-send checks, and GDPR erasure."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_compliance import (
    ContactConsent,
    SuppressionList,
    ComplianceAuditLog,
)
from aexy.models.crm import CRMRecord
from aexy.models.gtm import BehavioralEvent, LeadScore, VisitorSession
from aexy.models.gtm_outreach import OutreachEnrollment, OutreachStepExecution

logger = logging.getLogger(__name__)


class GTMComplianceService:
    """Compliance engine for GTM cold outreach — consent, suppression, pre-send checks, GDPR erasure."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # PRE-SEND CHECK PIPELINE
    # =========================================================================

    async def check_send_permission(
        self,
        workspace_id: str,
        email: str,
        record_id: str | None = None,
    ) -> dict:
        """Check if we're allowed to send to this contact.

        Returns {allowed: bool, reason: str, checks: [...]}
        """
        checks: list[dict] = []
        blocked = False
        block_reason = ""

        # 1. Check suppression list (email + domain)
        suppressed = await self.check_suppression(workspace_id, email)
        checks.append({
            "check": "suppression_list",
            "passed": not suppressed,
            "detail": "Email or domain is on suppression list" if suppressed else "Not suppressed",
        })
        if suppressed:
            blocked = True
            block_reason = "Email or domain is on suppression list"

        # 2. Check consent status
        if not blocked:
            consent = await self.get_consent_status(workspace_id, email)
            has_valid_consent = consent.get("has_consent", False) and consent.get("is_active", False)
            checks.append({
                "check": "consent_status",
                "passed": has_valid_consent,
                "detail": f"Consent type: {consent.get('consent_type', 'none')}" if has_valid_consent else "No active consent",
            })
            if not has_valid_consent:
                blocked = True
                block_reason = "No active consent on file"

        # 3. Check jurisdiction rules (expired consent for CASL implied)
        if not blocked:
            consent_record = await self._get_active_consent_record(workspace_id, email)
            jurisdiction_ok = True
            jurisdiction_detail = "Jurisdiction check passed"

            if consent_record and consent_record.expiry_date:
                now = datetime.now(timezone.utc)
                if consent_record.expiry_date < now:
                    jurisdiction_ok = False
                    jurisdiction_detail = f"Consent expired on {consent_record.expiry_date.isoformat()}"

            checks.append({
                "check": "jurisdiction_rules",
                "passed": jurisdiction_ok,
                "detail": jurisdiction_detail,
            })
            if not jurisdiction_ok:
                blocked = True
                block_reason = jurisdiction_detail

        # 4. Check send frequency (max 3 emails per 7 days per contact)
        if not blocked:
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            freq_q = select(func.count(ComplianceAuditLog.id)).where(
                and_(
                    ComplianceAuditLog.workspace_id == workspace_id,
                    ComplianceAuditLog.email == email,
                    ComplianceAuditLog.action == "send_approved",
                    ComplianceAuditLog.created_at >= seven_days_ago,
                )
            )
            result = await self.db.execute(freq_q)
            send_count = result.scalar() or 0
            frequency_ok = send_count < 3
            checks.append({
                "check": "send_frequency",
                "passed": frequency_ok,
                "detail": f"{send_count}/3 sends in last 7 days" if frequency_ok else f"Limit reached: {send_count}/3 sends in last 7 days",
            })
            if not frequency_ok:
                blocked = True
                block_reason = f"Send frequency limit reached ({send_count}/3 in 7 days)"

        # 5. Log the decision
        action = "send_blocked" if blocked else "send_approved"
        reason = block_reason if blocked else "All compliance checks passed"
        await self._log_audit(
            workspace_id=workspace_id,
            email=email,
            record_id=record_id,
            action=action,
            reason=reason,
        )

        return {
            "allowed": not blocked,
            "reason": reason,
            "checks": checks,
        }

    # =========================================================================
    # CONSENT MANAGEMENT
    # =========================================================================

    async def record_consent(
        self,
        workspace_id: str,
        email: str,
        consent_type: str,
        source: str,
        jurisdiction: str,
        record_id: str | None = None,
    ) -> ContactConsent:
        """Record consent for a contact."""
        now = datetime.now(timezone.utc)

        # Calculate expiry for CASL implied consent (2 years)
        expiry_date = None
        if jurisdiction == "casl" and consent_type == "implied":
            expiry_date = now + timedelta(days=730)

        consent = ContactConsent(
            id=str(uuid4()),
            workspace_id=workspace_id,
            record_id=record_id or str(uuid4()),
            email=email,
            consent_type=consent_type,
            consent_source=source,
            jurisdiction=jurisdiction,
            is_active=True,
            consent_date=now,
            expiry_date=expiry_date,
            extra_data={},
        )
        self.db.add(consent)
        await self.db.flush()

        await self._log_audit(
            workspace_id=workspace_id,
            email=email,
            record_id=record_id,
            action="consent_recorded",
            reason=f"Consent recorded: {consent_type} via {source}",
            jurisdiction=jurisdiction,
        )

        return consent

    async def revoke_consent(self, workspace_id: str, email: str) -> bool:
        """Revoke all active consent for an email."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            update(ContactConsent)
            .where(
                and_(
                    ContactConsent.workspace_id == workspace_id,
                    ContactConsent.email == email,
                    ContactConsent.is_active == True,
                )
            )
            .values(is_active=False, opted_out_at=now, updated_at=now)
        )

        if result.rowcount > 0:
            await self._log_audit(
                workspace_id=workspace_id,
                email=email,
                action="consent_revoked",
                reason="All consent revoked",
            )
            return True
        return False

    async def get_consent_status(self, workspace_id: str, email: str) -> dict:
        """Return current consent status for an email."""
        consent = await self._get_active_consent_record(workspace_id, email)
        if not consent:
            return {
                "email": email,
                "has_consent": False,
                "consent_type": None,
                "jurisdiction": None,
                "consent_date": None,
                "is_active": False,
            }

        return {
            "email": email,
            "has_consent": True,
            "consent_type": consent.consent_type,
            "jurisdiction": consent.jurisdiction,
            "consent_date": consent.consent_date.isoformat() if consent.consent_date else None,
            "is_active": consent.is_active,
        }

    async def _get_active_consent_record(
        self, workspace_id: str, email: str,
    ) -> ContactConsent | None:
        """Get the most recent active consent record."""
        result = await self.db.execute(
            select(ContactConsent)
            .where(
                and_(
                    ContactConsent.workspace_id == workspace_id,
                    ContactConsent.email == email,
                    ContactConsent.is_active == True,
                )
            )
            .order_by(ContactConsent.consent_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # SUPPRESSION LIST
    # =========================================================================

    async def add_to_suppression(
        self,
        workspace_id: str,
        email: str,
        reason: str,
        source: str,
        added_by: str | None = None,
    ) -> SuppressionList:
        """Add an email (and its domain) to the suppression list.

        If the email is already suppressed in this workspace, returns the
        existing entry (idempotent).
        """
        # Check for existing entry to respect the unique constraint
        existing = (await self.db.execute(
            select(SuppressionList).where(
                and_(
                    SuppressionList.workspace_id == workspace_id,
                    SuppressionList.email == email,
                )
            )
        )).scalar_one_or_none()

        if existing:
            return existing

        domain = email.split("@")[-1] if "@" in email else None

        entry = SuppressionList(
            id=str(uuid4()),
            workspace_id=workspace_id,
            email=email,
            domain=domain,
            reason=reason,
            source=source,
            added_by=added_by,
        )
        self.db.add(entry)
        await self.db.flush()

        await self._log_audit(
            workspace_id=workspace_id,
            email=email,
            action="suppression_added",
            reason=f"Added to suppression: {reason} via {source}",
        )

        return entry

    async def remove_from_suppression(self, workspace_id: str, email: str) -> bool:
        """Remove an email from the suppression list."""
        result = await self.db.execute(
            delete(SuppressionList).where(
                and_(
                    SuppressionList.workspace_id == workspace_id,
                    SuppressionList.email == email,
                )
            )
        )
        return result.rowcount > 0

    async def check_suppression(self, workspace_id: str, email: str) -> bool:
        """Check if an email or its domain is suppressed."""
        domain = email.split("@")[-1] if "@" in email else None

        # Check email match
        email_q = select(func.count(SuppressionList.id)).where(
            and_(
                SuppressionList.workspace_id == workspace_id,
                SuppressionList.email == email,
            )
        )
        result = await self.db.execute(email_q)
        if (result.scalar() or 0) > 0:
            return True

        # Check domain match — only match entries that were explicitly added as
        # domain-level blocks, not entries added for individual emails that happen
        # to share the same domain.
        if domain:
            domain_q = select(func.count(SuppressionList.id)).where(
                and_(
                    SuppressionList.workspace_id == workspace_id,
                    SuppressionList.domain == domain,
                    SuppressionList.reason == "domain_block",
                )
            )
            result = await self.db.execute(domain_q)
            if (result.scalar() or 0) > 0:
                return True

        return False

    async def list_suppression(
        self, workspace_id: str, page: int = 1, per_page: int = 25,
    ) -> tuple[list[SuppressionList], int]:
        """Paginated suppression list."""
        query = select(SuppressionList).where(
            SuppressionList.workspace_id == workspace_id,
        )

        # Count total
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar() or 0

        # Paginate
        query = query.order_by(SuppressionList.added_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        entries = list(result.scalars().all())

        return entries, total

    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================

    async def process_unsubscribe(self, workspace_id: str, email: str) -> dict:
        """Process an unsubscribe: add to suppression + revoke consent + log."""
        # Add to suppression list
        await self.add_to_suppression(
            workspace_id=workspace_id,
            email=email,
            reason="unsubscribe",
            source="unsubscribe_link",
        )

        # Revoke all consent
        await self.revoke_consent(workspace_id, email)

        return {"success": True, "email": email, "action": "unsubscribed"}

    async def process_erasure_request(self, workspace_id: str, email: str) -> dict:
        """GDPR right-to-erasure: delete all contact data, events, scores, consent records.

        This is a destructive operation that removes all traces of a contact.
        """
        deleted_counts: dict[str, int] = {}

        # 1. Delete consent records
        result = await self.db.execute(
            delete(ContactConsent).where(
                and_(
                    ContactConsent.workspace_id == workspace_id,
                    ContactConsent.email == email,
                )
            )
        )
        deleted_counts["consent_records"] = result.rowcount

        # 2. Find all record_ids associated with this email from multiple sources.
        #    Audit logs alone are insufficient — records from bulk imports or direct
        #    creation may never have triggered a compliance event.
        record_id_set: set[str] = set()

        # Source A: audit logs
        audit_records = await self.db.execute(
            select(ComplianceAuditLog.record_id).where(
                and_(
                    ComplianceAuditLog.workspace_id == workspace_id,
                    ComplianceAuditLog.email == email,
                    ComplianceAuditLog.record_id != None,
                )
            ).distinct()
        )
        for r in audit_records.all():
            if r[0]:
                record_id_set.add(r[0])

        # Source B: CRM records where email is stored in JSONB values
        crm_records = await self.db.execute(
            select(CRMRecord.id).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.values["email"].astext == email,
                )
            )
        )
        for r in crm_records.all():
            record_id_set.add(r[0])

        # Source C: outreach enrollments by email (may reference record_ids)
        enrollment_records = await self.db.execute(
            select(OutreachEnrollment.record_id).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.email == email,
                    OutreachEnrollment.record_id != None,
                )
            ).distinct()
        )
        for r in enrollment_records.all():
            if r[0]:
                record_id_set.add(r[0])

        record_ids = list(record_id_set)

        # Delete outreach enrollments and their step executions for this email
        enrollment_ids_result = await self.db.execute(
            select(OutreachEnrollment.id).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.email == email,
                )
            )
        )
        enrollment_ids = [r[0] for r in enrollment_ids_result.all()]

        if enrollment_ids:
            # Delete step executions for these enrollments first (child records)
            result = await self.db.execute(
                delete(OutreachStepExecution).where(
                    OutreachStepExecution.enrollment_id.in_(enrollment_ids),
                )
            )
            deleted_counts["outreach_step_executions"] = result.rowcount

            # Delete the enrollments themselves
            result = await self.db.execute(
                delete(OutreachEnrollment).where(
                    OutreachEnrollment.id.in_(enrollment_ids),
                )
            )
            deleted_counts["outreach_enrollments"] = result.rowcount
        else:
            deleted_counts["outreach_step_executions"] = 0
            deleted_counts["outreach_enrollments"] = 0

        if record_ids:
            # Delete visitor sessions for these records
            result = await self.db.execute(
                delete(VisitorSession).where(
                    and_(
                        VisitorSession.workspace_id == workspace_id,
                        VisitorSession.record_id.in_(record_ids),
                    )
                )
            )
            deleted_counts["visitor_sessions"] = result.rowcount

            # Delete behavioral events for these records
            result = await self.db.execute(
                delete(BehavioralEvent).where(
                    and_(
                        BehavioralEvent.workspace_id == workspace_id,
                        BehavioralEvent.record_id.in_(record_ids),
                    )
                )
            )
            deleted_counts["behavioral_events"] = result.rowcount

            # Delete lead scores for these records
            result = await self.db.execute(
                delete(LeadScore).where(
                    and_(
                        LeadScore.workspace_id == workspace_id,
                        LeadScore.record_id.in_(record_ids),
                    )
                )
            )
            deleted_counts["lead_scores"] = result.rowcount
        else:
            deleted_counts["visitor_sessions"] = 0
            deleted_counts["behavioral_events"] = 0
            deleted_counts["lead_scores"] = 0

        # 4. Anonymize CRM records (remove PII from values, keep record shell for referential integrity)
        if record_ids:
            for rid in record_ids:
                crm_record = (await self.db.execute(
                    select(CRMRecord).where(
                        and_(CRMRecord.id == rid, CRMRecord.workspace_id == workspace_id)
                    )
                )).scalar_one_or_none()
                if crm_record:
                    crm_record.values = {"_erased": True, "_erased_at": datetime.now(timezone.utc).isoformat()}
                    crm_record.display_name = "[erased]"
            deleted_counts["crm_records_anonymized"] = len(record_ids)
        else:
            deleted_counts["crm_records_anonymized"] = 0

        # 5. Add to suppression to prevent future contact
        await self.add_to_suppression(
            workspace_id=workspace_id,
            email=email,
            reason="legal",
            source="erasure_request",
        )

        # 5. Delete audit logs for this email (erasure means erasure)
        result = await self.db.execute(
            delete(ComplianceAuditLog).where(
                and_(
                    ComplianceAuditLog.workspace_id == workspace_id,
                    ComplianceAuditLog.email == email,
                )
            )
        )
        deleted_counts["audit_logs"] = result.rowcount

        # 6. Log the erasure itself (new entry after deletion)
        await self._log_audit(
            workspace_id=workspace_id,
            email="[erased]",
            action="erasure_completed",
            reason=f"GDPR erasure completed. Deleted: {deleted_counts}",
        )

        return {
            "success": True,
            "email": email,
            "action": "erasure_completed",
            "deleted_counts": deleted_counts,
        }

    # =========================================================================
    # AUDIT LOG
    # =========================================================================

    async def list_audit_log(
        self,
        workspace_id: str,
        email: str | None = None,
        action: str | None = None,
        page: int = 1,
        per_page: int = 25,
    ) -> tuple[list[ComplianceAuditLog], int]:
        """Paginated audit log with optional filters."""
        query = select(ComplianceAuditLog).where(
            ComplianceAuditLog.workspace_id == workspace_id,
        )

        if email:
            query = query.where(ComplianceAuditLog.email == email)
        if action:
            query = query.where(ComplianceAuditLog.action == action)

        # Count total
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar() or 0

        # Paginate
        query = query.order_by(ComplianceAuditLog.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        entries = list(result.scalars().all())

        return entries, total

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    async def _log_audit(
        self,
        workspace_id: str,
        email: str,
        action: str,
        reason: str | None = None,
        record_id: str | None = None,
        jurisdiction: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Write a compliance audit log entry."""
        entry = ComplianceAuditLog(
            id=str(uuid4()),
            workspace_id=workspace_id,
            record_id=record_id,
            email=email,
            action=action,
            reason=reason,
            jurisdiction=jurisdiction,
            extra_data=metadata or {},
        )
        self.db.add(entry)
        await self.db.flush()
