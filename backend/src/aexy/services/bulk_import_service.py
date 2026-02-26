"""Bulk import service for GTM cold outreach.

Handles CSV parsing, dedup checking, email verification, CRM record creation,
and optional sequence enrollment.
"""

import csv
import io
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import CRMRecord, CRMObject, CRMObjectType

logger = logging.getLogger(__name__)

# Standard CSV column mappings → CRM record value keys
COLUMN_MAP: dict[str, str] = {
    "email": "email",
    "e-mail": "email",
    "email_address": "email",
    "first_name": "first_name",
    "first name": "first_name",
    "firstname": "first_name",
    "last_name": "last_name",
    "last name": "last_name",
    "lastname": "last_name",
    "name": "full_name",
    "full_name": "full_name",
    "company": "company",
    "company_name": "company",
    "organization": "company",
    "title": "title",
    "job_title": "title",
    "job title": "title",
    "position": "title",
    "phone": "phone",
    "phone_number": "phone",
    "mobile": "mobile_phone",
    "linkedin": "linkedin_url",
    "linkedin_url": "linkedin_url",
    "website": "website",
    "domain": "domain",
    "city": "city",
    "state": "state",
    "country": "country",
    "industry": "industry",
}


@dataclass
class ImportRow:
    """Parsed row from CSV."""

    row_number: int
    email: str
    values: dict[str, Any]
    status: str = "pending"  # pending, created, duplicate, invalid_email, skipped, error
    record_id: str | None = None
    duplicate_of: str | None = None
    verification_result: str | None = None
    error: str | None = None


@dataclass
class ImportJob:
    """Import job state tracker."""

    job_id: str
    workspace_id: str
    total_rows: int = 0
    processed: int = 0
    created: int = 0
    duplicates: int = 0
    invalid_emails: int = 0
    skipped: int = 0
    errors: int = 0
    status: str = "pending"  # pending, processing, completed, failed
    rows: list[ImportRow] = field(default_factory=list)
    sequence_id: str | None = None
    enrolled: int = 0


class BulkImportService:
    """Service for bulk importing contacts from CSV into CRM + optional sequence enrollment."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CSV PARSING
    # =========================================================================

    def parse_csv(self, csv_content: str) -> list[dict[str, str]]:
        """Parse CSV content into list of dicts with normalized column names."""
        reader = csv.DictReader(io.StringIO(csv_content))
        rows: list[dict[str, str]] = []

        for raw_row in reader:
            normalized: dict[str, str] = {}
            for col, val in raw_row.items():
                if col is None or val is None:
                    continue
                col_lower = col.strip().lower()
                mapped_key = COLUMN_MAP.get(col_lower, col_lower)
                normalized[mapped_key] = val.strip()
            rows.append(normalized)

        return rows

    # =========================================================================
    # FULL IMPORT PIPELINE
    # =========================================================================

    async def run_import(
        self,
        workspace_id: str,
        csv_content: str,
        verify_emails: bool = True,
        skip_duplicates: bool = True,
        sequence_id: str | None = None,
        object_slug: str = "person",
    ) -> ImportJob:
        """Run the full import pipeline.

        Steps:
        1. Parse CSV
        2. Validate email presence
        3. Check for duplicates (by email)
        4. Optionally verify emails via MillionVerifier
        5. Create CRM records for valid rows
        6. Optionally enroll in outreach sequence

        Returns ImportJob with status of each row.
        """
        job = ImportJob(
            job_id=str(uuid4()),
            workspace_id=workspace_id,
            sequence_id=sequence_id,
        )

        # 1. Parse
        parsed_rows = self.parse_csv(csv_content)
        job.total_rows = len(parsed_rows)

        if not parsed_rows:
            job.status = "completed"
            return job

        # Build ImportRow list
        for idx, row_data in enumerate(parsed_rows, start=1):
            email = row_data.get("email", "").strip().lower()
            job.rows.append(ImportRow(
                row_number=idx,
                email=email,
                values=row_data,
            ))

        # 2. Validate email presence
        for row in job.rows:
            if not row.email or "@" not in row.email:
                row.status = "invalid_email"
                row.error = "Missing or invalid email address"
                job.invalid_emails += 1

        # 3. Dedup check
        if skip_duplicates:
            await self._check_duplicates(workspace_id, job)

        # 4. Email verification (optional)
        if verify_emails:
            await self._verify_emails(workspace_id, job)

        # 5. Create CRM records
        object_id = await self._get_or_create_object(workspace_id, object_slug)
        await self._create_records(workspace_id, object_id, job)

        # 6. Enroll in sequence (optional)
        if sequence_id:
            await self._enroll_in_sequence(workspace_id, sequence_id, job)

        await self.db.commit()

        job.status = "completed"
        job.processed = job.total_rows
        return job

    # =========================================================================
    # DEDUP
    # =========================================================================

    async def _check_duplicates(self, workspace_id: str, job: ImportJob) -> None:
        """Check for existing CRM records with matching emails."""
        pending_rows = [r for r in job.rows if r.status == "pending"]
        if not pending_rows:
            return

        emails = [r.email for r in pending_rows]

        # Build conditions for email match in JSONB values
        email_fields = ("email", "work_email", "personal_email", "contact_email")
        conditions = []
        for field_name in email_fields:
            conditions.append(
                func.lower(CRMRecord.values[field_name].astext).in_(emails)
            )

        existing = (await self.db.execute(
            select(CRMRecord.id, CRMRecord.values)
            .where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,
                    or_(*conditions),
                )
            )
        )).all()

        # Build email → record_id lookup
        existing_emails: dict[str, str] = {}
        for record_id, values in existing:
            for field_name in email_fields:
                email_val = values.get(field_name, "")
                if email_val:
                    existing_emails[email_val.strip().lower()] = record_id

        # Mark duplicates
        for row in pending_rows:
            if row.email in existing_emails:
                row.status = "duplicate"
                row.duplicate_of = existing_emails[row.email]
                job.duplicates += 1

    # =========================================================================
    # EMAIL VERIFICATION
    # =========================================================================

    async def _verify_emails(self, workspace_id: str, job: ImportJob) -> None:
        """Verify pending emails via configured provider."""
        pending_rows = [r for r in job.rows if r.status == "pending"]
        if not pending_rows:
            return

        try:
            from aexy.integrations.registry import ProviderRegistry

            provider = await ProviderRegistry.get_provider(
                self.db, workspace_id, "email_verification",
            )
            if not provider:
                logger.warning(f"No email verification provider for workspace {workspace_id}, skipping")
                return

            emails = [r.email for r in pending_rows]
            results = await provider.verify_bulk(emails)

            # Map results back to rows
            result_map = {r.email.lower(): r for r in results}
            for row in pending_rows:
                result = result_map.get(row.email)
                if result:
                    row.verification_result = result.result_code
                    if not result.is_valid:
                        row.status = "invalid_email"
                        row.error = f"Email verification failed: {result.result_code}"
                        job.invalid_emails += 1

        except Exception as e:
            logger.warning(f"Email verification error, continuing without: {e}")

    # =========================================================================
    # CRM RECORD CREATION
    # =========================================================================

    async def _get_or_create_object(self, workspace_id: str, slug: str) -> str:
        """Get or create CRM object definition (e.g., 'person')."""
        obj = (await self.db.execute(
            select(CRMObject).where(
                and_(
                    CRMObject.workspace_id == workspace_id,
                    CRMObject.slug == slug,
                )
            )
        )).scalar_one_or_none()

        if obj:
            return obj.id

        # Create the object type
        obj = CRMObject(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=slug.capitalize(),
            slug=slug,
            plural_name=f"{slug.capitalize()}s",
            object_type=CRMObjectType.PERSON.value if slug == "person" else CRMObjectType.CUSTOM.value,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj.id

    async def _create_records(self, workspace_id: str, object_id: str, job: ImportJob) -> None:
        """Create CRM records for pending rows."""
        pending_rows = [r for r in job.rows if r.status == "pending"]

        for row in pending_rows:
            try:
                # Build display name
                first = row.values.get("first_name", "")
                last = row.values.get("last_name", "")
                full = row.values.get("full_name", "")
                display_name = full or f"{first} {last}".strip() or row.email

                record = CRMRecord(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    object_id=object_id,
                    values=row.values,
                    display_name=display_name,
                )
                self.db.add(record)

                row.record_id = record.id
                row.status = "created"
                job.created += 1

            except Exception as e:
                row.status = "error"
                row.error = str(e)[:200]
                job.errors += 1

        await self.db.flush()

    # =========================================================================
    # SEQUENCE ENROLLMENT
    # =========================================================================

    async def _enroll_in_sequence(
        self, workspace_id: str, sequence_id: str, job: ImportJob,
    ) -> None:
        """Enroll created records in an outreach sequence."""
        from aexy.services.outreach_sequence_service import OutreachSequenceService

        service = OutreachSequenceService(self.db)
        created_rows = [r for r in job.rows if r.status == "created" and r.record_id]

        for row in created_rows:
            try:
                first = row.values.get("first_name", "")
                last = row.values.get("last_name", "")
                full = row.values.get("full_name", "")
                contact_name = full or f"{first} {last}".strip() or None

                await service.enroll_contact(
                    workspace_id=workspace_id,
                    sequence_id=sequence_id,
                    record_id=row.record_id,
                    email=row.email,
                    contact_name=contact_name,
                )
                job.enrolled += 1
            except Exception as e:
                logger.warning(
                    f"Failed to enroll row {row.row_number} in sequence {sequence_id}: {e}"
                )

    # =========================================================================
    # IMPORT SUMMARY
    # =========================================================================

    def get_job_summary(self, job: ImportJob) -> dict[str, Any]:
        """Build a summary dict from an import job."""
        return {
            "job_id": job.job_id,
            "status": job.status,
            "total_rows": job.total_rows,
            "processed": job.processed,
            "created": job.created,
            "duplicates": job.duplicates,
            "invalid_emails": job.invalid_emails,
            "skipped": job.skipped,
            "errors": job.errors,
            "enrolled": job.enrolled,
            "rows": [
                {
                    "row": r.row_number,
                    "email": r.email,
                    "status": r.status,
                    "record_id": r.record_id,
                    "duplicate_of": r.duplicate_of,
                    "error": r.error,
                }
                for r in job.rows
            ],
        }
