"""Deduplication service for CRM records.

Finds and merges duplicate CRM records based on email, domain, and phone matching.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, and_, func, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import CRMRecord
from aexy.models.gtm import BehavioralEvent, VisitorSession, LeadScore

logger = logging.getLogger(__name__)

# Email field keys commonly stored in CRM record values JSONB
EMAIL_FIELDS = ("email", "work_email", "personal_email", "contact_email")
PHONE_FIELDS = ("phone", "work_phone", "mobile_phone", "home_phone")


class DedupService:
    """Find and merge duplicate CRM records."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def find_duplicates(
        self, workspace_id: str, record_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Find potential duplicate records in the workspace.

        Strategy:
        1. Exact email match (highest confidence)
        2. Domain + name similarity (medium confidence)
        3. Phone number match (medium confidence)

        If *record_id* is given, only find duplicates for that specific record.
        Otherwise scan the whole workspace.

        Returns list of ``{record_id, duplicate_id, confidence, match_type, match_details}``.
        """
        if record_id:
            return await self._find_duplicates_for_record(workspace_id, record_id)
        return await self.bulk_find_duplicates(workspace_id)

    async def find_duplicates_for_email(
        self, workspace_id: str, email: str,
    ) -> list[dict[str, Any]]:
        """Find records matching a specific email address."""
        email_lower = email.strip().lower()
        conditions = []
        for field in EMAIL_FIELDS:
            conditions.append(
                func.lower(CRMRecord.values[field].astext) == email_lower
            )

        query = (
            select(CRMRecord)
            .where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,
                    or_(*conditions),
                )
            )
            .order_by(CRMRecord.created_at.asc())
        )
        result = await self.db.execute(query)
        records = list(result.scalars().all())

        if len(records) <= 1:
            return []

        matches: list[dict[str, Any]] = []
        primary = records[0]
        for dup in records[1:]:
            matches.append({
                "record_id": str(primary.id),
                "duplicate_id": str(dup.id),
                "confidence": 0.95,
                "match_type": "email",
                "match_details": {"email": email_lower},
            })
        return matches

    async def merge_records(
        self,
        workspace_id: str,
        primary_id: str,
        duplicate_id: str,
        merge_strategy: str = "primary_wins",
    ) -> dict[str, Any]:
        """Merge two records.

        *merge_strategy*: ``primary_wins`` | ``most_complete`` | ``newest``

        Steps:
        1. Merge JSONB values (keep primary by default, fill gaps from duplicate)
        2. Re-link behavioral_events from duplicate to primary
        3. Re-link visitor_sessions from duplicate to primary
        4. Re-link lead_scores from duplicate to primary
        5. Archive the duplicate record
        6. Return merged record summary
        """
        # Fetch both records
        primary = (await self.db.execute(
            select(CRMRecord).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.id == primary_id,
                )
            )
        )).scalar_one_or_none()

        duplicate = (await self.db.execute(
            select(CRMRecord).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.id == duplicate_id,
                )
            )
        )).scalar_one_or_none()

        if not primary or not duplicate:
            return {"error": "One or both records not found"}

        # --- 1. Merge JSONB values ---
        merged_values, fields_merged = self._merge_values(
            primary.values or {},
            duplicate.values or {},
            merge_strategy,
            primary.updated_at,
            duplicate.updated_at,
        )
        primary.values = merged_values

        # Update display_name if blank on primary
        if not primary.display_name and duplicate.display_name:
            primary.display_name = duplicate.display_name

        primary.updated_at = datetime.now(timezone.utc)

        # --- 2. Re-link behavioral_events ---
        events_result = await self.db.execute(
            update(BehavioralEvent)
            .where(
                and_(
                    BehavioralEvent.workspace_id == workspace_id,
                    BehavioralEvent.record_id == duplicate_id,
                )
            )
            .values(record_id=primary_id)
        )
        events_relinked = events_result.rowcount

        # --- 3. Re-link visitor_sessions ---
        sessions_result = await self.db.execute(
            update(VisitorSession)
            .where(
                and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.record_id == duplicate_id,
                )
            )
            .values(record_id=primary_id)
        )
        sessions_relinked = sessions_result.rowcount

        # --- 4. Re-link lead_scores ---
        await self.db.execute(
            update(LeadScore)
            .where(
                and_(
                    LeadScore.workspace_id == workspace_id,
                    LeadScore.record_id == duplicate_id,
                )
            )
            .values(record_id=primary_id)
        )

        # --- 5. Archive the duplicate ---
        duplicate.is_archived = True
        duplicate.archived_at = datetime.now(timezone.utc)
        # Store a breadcrumb so we know it was merged
        dup_values = dict(duplicate.values or {})
        dup_values["_merged_into"] = primary_id
        duplicate.values = dup_values

        await self.db.flush()

        return {
            "merged_record_id": primary_id,
            "fields_merged": fields_merged,
            "events_relinked": events_relinked,
            "sessions_relinked": sessions_relinked,
        }

    async def bulk_find_duplicates(
        self, workspace_id: str, limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Scan workspace for all potential duplicates.

        Returns grouped duplicate sets, capped at *limit* pairs.
        """
        matches: list[dict[str, Any]] = []

        # --- Strategy 1: Exact email matches ---
        email_matches = await self._find_email_duplicates(workspace_id, limit)
        matches.extend(email_matches)
        if len(matches) >= limit:
            return matches[:limit]

        # --- Strategy 2: Domain + name similarity ---
        domain_matches = await self._find_domain_name_duplicates(
            workspace_id, limit - len(matches),
        )
        matches.extend(domain_matches)
        if len(matches) >= limit:
            return matches[:limit]

        # --- Strategy 3: Phone matches ---
        phone_matches = await self._find_phone_duplicates(
            workspace_id, limit - len(matches),
        )
        matches.extend(phone_matches)

        return matches[:limit]

    async def get_dedup_stats(self, workspace_id: str) -> dict[str, Any]:
        """Return dedup statistics for the workspace."""
        # Total active records
        total_q = select(func.count(CRMRecord.id)).where(
            and_(
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.is_archived == False,
            )
        )
        total_records = (await self.db.execute(total_q)).scalar() or 0

        # Records that have been merged (archived with _merged_into)
        merged_q = select(func.count(CRMRecord.id)).where(
            and_(
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.is_archived == True,
                CRMRecord.values["_merged_into"].astext.isnot(None),
            )
        )
        merged_count = (await self.db.execute(merged_q)).scalar() or 0

        # Potential duplicates (quick email-based scan)
        potential = await self._count_email_duplicates(workspace_id)

        return {
            "total_records": total_records,
            "potential_duplicates": potential,
            "merged_count": merged_count,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _find_duplicates_for_record(
        self, workspace_id: str, record_id: str,
    ) -> list[dict[str, Any]]:
        """Find duplicates for a single record."""
        record = (await self.db.execute(
            select(CRMRecord).where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.id == record_id,
                )
            )
        )).scalar_one_or_none()

        if not record:
            return []

        matches: list[dict[str, Any]] = []
        values = record.values or {}

        # Check emails
        for field in EMAIL_FIELDS:
            email = (values.get(field) or "").strip().lower()
            if email:
                email_matches = await self.find_duplicates_for_email(workspace_id, email)
                for m in email_matches:
                    # Make sure our record is involved and avoid self-match
                    if m["record_id"] != record_id and m["duplicate_id"] != record_id:
                        continue
                    if not any(
                        em["duplicate_id"] == m["duplicate_id"]
                        and em["record_id"] == m["record_id"]
                        for em in matches
                    ):
                        matches.append(m)

        # Check domain + name
        domain = (values.get("domain") or "").strip().lower()
        name = (values.get("name") or values.get("company_name") or "").strip().lower()
        if domain and name:
            domain_matches = await self._find_domain_name_match(
                workspace_id, record_id, domain, name,
            )
            matches.extend(domain_matches)

        # Check phone
        for field in PHONE_FIELDS:
            phone = self._normalize_phone(values.get(field) or "")
            if phone:
                phone_matches = await self._find_phone_match(
                    workspace_id, record_id, phone,
                )
                matches.extend(phone_matches)

        return matches

    async def _find_email_duplicates(
        self, workspace_id: str, limit: int,
    ) -> list[dict[str, Any]]:
        """Find records sharing the same email address."""
        matches: list[dict[str, Any]] = []

        for field in EMAIL_FIELDS:
            if len(matches) >= limit:
                break

            # Find duplicate emails using a subquery
            email_expr = func.lower(CRMRecord.values[field].astext)
            subq = (
                select(email_expr.label("email"))
                .where(
                    and_(
                        CRMRecord.workspace_id == workspace_id,
                        CRMRecord.is_archived == False,
                        CRMRecord.values[field].astext.isnot(None),
                        CRMRecord.values[field].astext != "",
                    )
                )
                .group_by(email_expr)
                .having(func.count(CRMRecord.id) > 1)
                .limit(limit - len(matches))
                .subquery()
            )

            query = (
                select(CRMRecord)
                .where(
                    and_(
                        CRMRecord.workspace_id == workspace_id,
                        CRMRecord.is_archived == False,
                        email_expr.in_(select(subq.c.email)),
                    )
                )
                .order_by(email_expr, CRMRecord.created_at.asc())
            )
            result = await self.db.execute(query)
            records = list(result.scalars().all())

            # Group by email
            groups: dict[str, list[CRMRecord]] = {}
            for rec in records:
                key = (rec.values.get(field) or "").strip().lower()
                if key:
                    groups.setdefault(key, []).append(rec)

            for email_val, group in groups.items():
                if len(group) < 2:
                    continue
                primary = group[0]
                for dup in group[1:]:
                    matches.append({
                        "record_id": str(primary.id),
                        "duplicate_id": str(dup.id),
                        "confidence": 0.95,
                        "match_type": "email",
                        "match_details": {"field": field, "email": email_val},
                    })
                    if len(matches) >= limit:
                        break
                if len(matches) >= limit:
                    break

        return matches[:limit]

    async def _find_domain_name_duplicates(
        self, workspace_id: str, limit: int,
    ) -> list[dict[str, Any]]:
        """Find records sharing the same domain."""
        domain_expr = func.lower(CRMRecord.values["domain"].astext)
        subq = (
            select(domain_expr.label("domain"))
            .where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,
                    CRMRecord.values["domain"].astext.isnot(None),
                    CRMRecord.values["domain"].astext != "",
                )
            )
            .group_by(domain_expr)
            .having(func.count(CRMRecord.id) > 1)
            .limit(limit)
            .subquery()
        )

        query = (
            select(CRMRecord)
            .where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,
                    domain_expr.in_(select(subq.c.domain)),
                )
            )
            .order_by(domain_expr, CRMRecord.created_at.asc())
        )
        result = await self.db.execute(query)
        records = list(result.scalars().all())

        groups: dict[str, list[CRMRecord]] = {}
        for rec in records:
            key = (rec.values.get("domain") or "").strip().lower()
            if key:
                groups.setdefault(key, []).append(rec)

        matches: list[dict[str, Any]] = []
        for domain_val, group in groups.items():
            if len(group) < 2:
                continue
            primary = group[0]
            for dup in group[1:]:
                matches.append({
                    "record_id": str(primary.id),
                    "duplicate_id": str(dup.id),
                    "confidence": 0.70,
                    "match_type": "domain_name",
                    "match_details": {"domain": domain_val},
                })
                if len(matches) >= limit:
                    break
            if len(matches) >= limit:
                break

        return matches[:limit]

    async def _find_phone_duplicates(
        self, workspace_id: str, limit: int,
    ) -> list[dict[str, Any]]:
        """Find records sharing the same phone number."""
        matches: list[dict[str, Any]] = []

        for field in PHONE_FIELDS:
            if len(matches) >= limit:
                break

            phone_expr = CRMRecord.values[field].astext
            subq = (
                select(phone_expr.label("phone"))
                .where(
                    and_(
                        CRMRecord.workspace_id == workspace_id,
                        CRMRecord.is_archived == False,
                        phone_expr.isnot(None),
                        phone_expr != "",
                    )
                )
                .group_by(phone_expr)
                .having(func.count(CRMRecord.id) > 1)
                .limit(limit - len(matches))
                .subquery()
            )

            query = (
                select(CRMRecord)
                .where(
                    and_(
                        CRMRecord.workspace_id == workspace_id,
                        CRMRecord.is_archived == False,
                        phone_expr.in_(select(subq.c.phone)),
                    )
                )
                .order_by(phone_expr, CRMRecord.created_at.asc())
            )
            result = await self.db.execute(query)
            records = list(result.scalars().all())

            groups: dict[str, list[CRMRecord]] = {}
            for rec in records:
                key = self._normalize_phone(rec.values.get(field) or "")
                if key:
                    groups.setdefault(key, []).append(rec)

            for phone_val, group in groups.items():
                if len(group) < 2:
                    continue
                primary = group[0]
                for dup in group[1:]:
                    matches.append({
                        "record_id": str(primary.id),
                        "duplicate_id": str(dup.id),
                        "confidence": 0.80,
                        "match_type": "phone",
                        "match_details": {"field": field, "phone": phone_val},
                    })
                    if len(matches) >= limit:
                        break
                if len(matches) >= limit:
                    break

        return matches[:limit]

    async def _find_domain_name_match(
        self,
        workspace_id: str,
        record_id: str,
        domain: str,
        name: str,
    ) -> list[dict[str, Any]]:
        """Find records with same domain and similar name."""
        domain_expr = func.lower(CRMRecord.values["domain"].astext)
        query = (
            select(CRMRecord)
            .where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,
                    CRMRecord.id != record_id,
                    domain_expr == domain,
                )
            )
            .limit(20)
        )
        result = await self.db.execute(query)
        records = list(result.scalars().all())

        matches: list[dict[str, Any]] = []
        for rec in records:
            rec_name = (
                (rec.values or {}).get("name")
                or (rec.values or {}).get("company_name")
                or ""
            ).strip().lower()
            if rec_name and self._name_similarity(name, rec_name) > 0.6:
                matches.append({
                    "record_id": record_id,
                    "duplicate_id": str(rec.id),
                    "confidence": 0.70,
                    "match_type": "domain_name",
                    "match_details": {"domain": domain, "name": rec_name},
                })
        return matches

    async def _find_phone_match(
        self, workspace_id: str, record_id: str, phone: str,
    ) -> list[dict[str, Any]]:
        """Find records with matching phone number."""
        conditions = []
        for field in PHONE_FIELDS:
            conditions.append(
                CRMRecord.values[field].astext == phone
            )

        query = (
            select(CRMRecord)
            .where(
                and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,
                    CRMRecord.id != record_id,
                    or_(*conditions),
                )
            )
            .limit(20)
        )
        result = await self.db.execute(query)
        records = list(result.scalars().all())

        return [
            {
                "record_id": record_id,
                "duplicate_id": str(rec.id),
                "confidence": 0.80,
                "match_type": "phone",
                "match_details": {"phone": phone},
            }
            for rec in records
        ]

    async def _count_email_duplicates(self, workspace_id: str) -> int:
        """Quick count of how many records share an email with another record."""
        total = 0
        for field in EMAIL_FIELDS:
            email_expr = func.lower(CRMRecord.values[field].astext)
            # Count emails that appear more than once
            subq = (
                select(func.count().label("cnt"))
                .select_from(
                    select(email_expr.label("email"))
                    .where(
                        and_(
                            CRMRecord.workspace_id == workspace_id,
                            CRMRecord.is_archived == False,
                            CRMRecord.values[field].astext.isnot(None),
                            CRMRecord.values[field].astext != "",
                        )
                    )
                    .group_by(email_expr)
                    .having(func.count(CRMRecord.id) > 1)
                    .subquery()
                )
            )
            result = await self.db.execute(subq)
            total += result.scalar() or 0
        return total

    # ------------------------------------------------------------------
    # Merge helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _merge_values(
        primary_vals: dict,
        duplicate_vals: dict,
        strategy: str,
        primary_updated: datetime | None,
        duplicate_updated: datetime | None,
    ) -> tuple[dict, int]:
        """Merge two JSONB value dicts.

        Returns ``(merged_dict, number_of_fields_filled_from_duplicate)``.
        """
        merged = dict(primary_vals)
        fields_merged = 0

        if strategy == "primary_wins":
            # Fill empty fields from duplicate
            for key, value in duplicate_vals.items():
                if key.startswith("_"):
                    continue  # skip internal fields
                if not merged.get(key) and value:
                    merged[key] = value
                    fields_merged += 1

        elif strategy == "most_complete":
            # Prefer whichever value is non-empty; if both non-empty keep primary
            for key, value in duplicate_vals.items():
                if key.startswith("_"):
                    continue
                if not merged.get(key) and value:
                    merged[key] = value
                    fields_merged += 1

        elif strategy == "newest":
            # If duplicate is newer, prefer its values
            dup_is_newer = (
                duplicate_updated
                and primary_updated
                and duplicate_updated > primary_updated
            )
            if dup_is_newer:
                for key, value in duplicate_vals.items():
                    if key.startswith("_"):
                        continue
                    if value:
                        if merged.get(key) != value:
                            fields_merged += 1
                        merged[key] = value
            else:
                # Same as primary_wins
                for key, value in duplicate_vals.items():
                    if key.startswith("_"):
                        continue
                    if not merged.get(key) and value:
                        merged[key] = value
                        fields_merged += 1

        return merged, fields_merged

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Strip non-digit chars for comparison."""
        return "".join(c for c in phone if c.isdigit())

    @staticmethod
    def _name_similarity(a: str, b: str) -> float:
        """Simple token-overlap similarity (Jaccard)."""
        if not a or not b:
            return 0.0
        tokens_a = set(a.lower().split())
        tokens_b = set(b.lower().split())
        if not tokens_a or not tokens_b:
            return 0.0
        intersection = tokens_a & tokens_b
        union = tokens_a | tokens_b
        return len(intersection) / len(union)
