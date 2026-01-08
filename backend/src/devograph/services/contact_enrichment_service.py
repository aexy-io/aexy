"""Contact Enrichment Service for AI-powered contact extraction and classification."""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.llm.gateway import get_llm_gateway
from aexy.models.crm import (
    CRMObject,
    CRMObjectType,
    CRMRecord,
    CRMActivity,
    CRMActivityType,
)
from aexy.models.google_integration import SyncedEmail

logger = logging.getLogger(__name__)


# Prompt templates for AI extraction
SIGNATURE_EXTRACTION_SYSTEM_PROMPT = """You are a data extraction expert. Your task is to extract contact information from email signatures.
Extract structured data including name, title, company, phone numbers, social links, and other contact details.
Always respond with valid JSON only, no markdown or explanations."""

SIGNATURE_EXTRACTION_PROMPT = """Extract contact information from this email body. Focus on the signature block at the end.

Email body:
{email_body}

Extract the following if present:
- full_name: The person's full name
- first_name: First name
- last_name: Last name
- job_title: Professional title/position
- company: Company or organization name
- department: Department within the company
- phone: Primary phone number
- mobile: Mobile phone number
- email: Email address (if different from sender)
- website: Personal or company website
- linkedin: LinkedIn profile URL
- twitter: Twitter/X handle
- address: Physical address
- timezone: Timezone if mentioned

Return JSON only:
{{
  "extracted": true,
  "confidence": 0.0-1.0,
  "contact_info": {{
    "full_name": null,
    "first_name": null,
    "last_name": null,
    "job_title": null,
    "company": null,
    "department": null,
    "phone": null,
    "mobile": null,
    "email": null,
    "website": null,
    "linkedin": null,
    "twitter": null,
    "address": null,
    "timezone": null
  }}
}}"""

CONTACT_CLASSIFICATION_SYSTEM_PROMPT = """You are a CRM expert. Your task is to classify contacts based on email patterns and content.
Analyze the email history to determine the type of relationship.
Always respond with valid JSON only."""

CONTACT_CLASSIFICATION_PROMPT = """Classify this contact based on their email history with our organization.

Email address: {email_address}
Name: {name}

Email samples (most recent first):
{email_samples}

Classify into one of these categories:
- lead: Potential customer, inquiry about products/services
- customer: Existing customer, discusses orders/support
- partner: Business partner, referral source
- vendor: Supplier or service provider
- investor: Investor or stakeholder
- employee: Internal employee
- recruiter: Recruiting/hiring related
- media: Press/media contact
- personal: Personal contact
- other: Unclassified

Return JSON only:
{{
  "classification": "lead|customer|partner|vendor|investor|employee|recruiter|media|personal|other",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "lead_score": 0-100,
  "engagement_level": "high|medium|low",
  "suggested_tags": ["tag1", "tag2"]
}}"""


class ContactEnrichmentError(Exception):
    """Contact enrichment error."""

    pass


class ContactEnrichmentService:
    """Service for AI-powered contact enrichment."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._llm = None

    def _get_llm(self):
        """Get or create LLM gateway."""
        if self._llm is None:
            self._llm = get_llm_gateway()
        return self._llm

    async def extract_signature_info(self, email_body: str) -> dict[str, Any]:
        """Extract contact info from email signature using AI.

        Args:
            email_body: The full email body text

        Returns:
            Extracted contact information
        """
        if not email_body:
            return {"extracted": False, "confidence": 0.0, "contact_info": {}}

        # First try simple pattern matching for common formats
        simple_result = self._extract_signature_simple(email_body)
        if simple_result.get("extracted") and simple_result.get("confidence", 0) > 0.7:
            return simple_result

        # Fall back to AI extraction for complex signatures
        llm = self._get_llm()
        if not llm:
            logger.warning("LLM not available for signature extraction")
            return simple_result if simple_result.get("extracted") else {
                "extracted": False,
                "confidence": 0.0,
                "contact_info": {},
            }

        try:
            prompt = SIGNATURE_EXTRACTION_PROMPT.format(
                email_body=email_body[-3000:]  # Last 3000 chars for signature
            )

            response, _, _, _ = await llm.provider._call_api(
                SIGNATURE_EXTRACTION_SYSTEM_PROMPT,
                prompt,
            )

            result = self._parse_json_response(response)
            return result

        except Exception as e:
            logger.error(f"AI signature extraction failed: {e}")
            return simple_result if simple_result.get("extracted") else {
                "extracted": False,
                "confidence": 0.0,
                "contact_info": {},
            }

    def _extract_signature_simple(self, email_body: str) -> dict[str, Any]:
        """Simple pattern-based signature extraction."""
        contact_info: dict[str, Any] = {}
        confidence = 0.0

        # Common phone patterns
        phone_pattern = r"(?:Tel|Phone|Mobile|Cell|P|M)[:.]?\s*([+\d\s\-().]{10,})"
        phone_match = re.search(phone_pattern, email_body, re.IGNORECASE)
        if phone_match:
            contact_info["phone"] = phone_match.group(1).strip()
            confidence += 0.2

        # LinkedIn URL
        linkedin_pattern = r"linkedin\.com/in/([a-zA-Z0-9\-]+)"
        linkedin_match = re.search(linkedin_pattern, email_body, re.IGNORECASE)
        if linkedin_match:
            contact_info["linkedin"] = f"https://linkedin.com/in/{linkedin_match.group(1)}"
            confidence += 0.2

        # Twitter/X handle
        twitter_pattern = r"(?:twitter|x)\.com/([a-zA-Z0-9_]+)"
        twitter_match = re.search(twitter_pattern, email_body, re.IGNORECASE)
        if twitter_match:
            contact_info["twitter"] = f"@{twitter_match.group(1)}"
            confidence += 0.1

        # Website URL
        website_pattern = r"(?:www\.|https?://)((?!linkedin|twitter|facebook)[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s]*)"
        website_match = re.search(website_pattern, email_body, re.IGNORECASE)
        if website_match:
            contact_info["website"] = website_match.group(0)
            confidence += 0.1

        # Job title patterns (common titles)
        title_patterns = [
            r"(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[,|]\s*(?:CEO|CTO|CFO|COO|VP|Director|Manager|Engineer|Developer|Designer|Consultant)",
            r"(?:Title|Position|Role)[:.]?\s*([A-Za-z\s]+)",
        ]
        for pattern in title_patterns:
            title_match = re.search(pattern, email_body, re.MULTILINE)
            if title_match:
                contact_info["job_title"] = title_match.group(1).strip()
                confidence += 0.2
                break

        return {
            "extracted": len(contact_info) > 0,
            "confidence": min(confidence, 1.0),
            "contact_info": contact_info,
        }

    async def classify_contact(
        self,
        email_address: str,
        email_samples: list[dict[str, Any]],
        name: str | None = None,
    ) -> dict[str, Any]:
        """Classify contact as lead, customer, vendor, etc.

        Args:
            email_address: The contact's email address
            email_samples: List of email samples with subject, snippet, direction
            name: Optional name of the contact

        Returns:
            Classification result with confidence
        """
        if not email_samples:
            return {
                "classification": "other",
                "confidence": 0.3,
                "reasoning": "No email samples available",
                "lead_score": 0,
                "engagement_level": "low",
                "suggested_tags": [],
            }

        # First try domain-based classification
        domain = email_address.split("@")[-1].lower() if "@" in email_address else ""
        domain_result = self._classify_by_domain(domain)
        if domain_result.get("confidence", 0) > 0.8:
            return domain_result

        # Use AI for classification
        llm = self._get_llm()
        if not llm:
            logger.warning("LLM not available for contact classification")
            return domain_result if domain_result else {
                "classification": "other",
                "confidence": 0.3,
                "reasoning": "LLM not available",
                "lead_score": 0,
                "engagement_level": "low",
                "suggested_tags": [],
            }

        try:
            # Format email samples
            samples_text = ""
            for i, email in enumerate(email_samples[:5]):  # Limit to 5 samples
                direction = email.get("direction", "received")
                subject = email.get("subject", "No subject")
                snippet = email.get("snippet", "")[:200]
                samples_text += f"\n{i+1}. [{direction}] Subject: {subject}\n   Preview: {snippet}\n"

            prompt = CONTACT_CLASSIFICATION_PROMPT.format(
                email_address=email_address,
                name=name or "Unknown",
                email_samples=samples_text,
            )

            response, _, _, _ = await llm.provider._call_api(
                CONTACT_CLASSIFICATION_SYSTEM_PROMPT,
                prompt,
            )

            result = self._parse_json_response(response)
            return result

        except Exception as e:
            logger.error(f"AI contact classification failed: {e}")
            return domain_result if domain_result else {
                "classification": "other",
                "confidence": 0.3,
                "reasoning": f"Classification failed: {e}",
                "lead_score": 0,
                "engagement_level": "low",
                "suggested_tags": [],
            }

    def _classify_by_domain(self, domain: str) -> dict[str, Any]:
        """Classify contact based on email domain."""
        if not domain:
            return {}

        # Common free email domains -> likely personal or lead
        free_domains = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"}
        if domain in free_domains:
            return {
                "classification": "lead",
                "confidence": 0.5,
                "reasoning": "Free email domain suggests individual contact",
                "lead_score": 40,
                "engagement_level": "medium",
                "suggested_tags": ["individual"],
            }

        # Recruiting domains
        recruiting_domains = {"greenhouse.io", "lever.co", "jobvite.com", "workday.com"}
        if any(r in domain for r in recruiting_domains):
            return {
                "classification": "recruiter",
                "confidence": 0.9,
                "reasoning": "Recruiting platform domain",
                "lead_score": 0,
                "engagement_level": "medium",
                "suggested_tags": ["recruiting"],
            }

        # Media domains
        media_patterns = ["news", "press", "media", "journalist"]
        if any(p in domain for p in media_patterns):
            return {
                "classification": "media",
                "confidence": 0.7,
                "reasoning": "Media-related domain",
                "lead_score": 0,
                "engagement_level": "medium",
                "suggested_tags": ["media", "press"],
            }

        # VC/Investor patterns
        investor_patterns = ["capital", "ventures", "partners", "invest"]
        if any(p in domain for p in investor_patterns):
            return {
                "classification": "investor",
                "confidence": 0.7,
                "reasoning": "Investment-related domain",
                "lead_score": 0,
                "engagement_level": "high",
                "suggested_tags": ["investor"],
            }

        # Business domain - could be customer, partner, or vendor
        return {
            "classification": "lead",
            "confidence": 0.4,
            "reasoning": "Business domain - needs further classification",
            "lead_score": 50,
            "engagement_level": "medium",
            "suggested_tags": ["business"],
        }

    async def find_or_create_person(
        self,
        workspace_id: str,
        email: str,
        name: str | None = None,
        source: str = "email_sync",
        additional_values: dict[str, Any] | None = None,
    ) -> CRMRecord:
        """Find or create a Person record by email.

        Args:
            workspace_id: The workspace ID
            email: Email address to search for
            name: Optional name for the person
            source: Source of the contact (e.g., "email_sync", "calendar_sync")
            additional_values: Additional field values to set

        Returns:
            The found or created CRMRecord
        """
        # Get the Person object for this workspace
        person_object = await self._get_or_create_object(
            workspace_id, "person", CRMObjectType.PERSON
        )

        # Search for existing person by email
        email_lower = email.lower()
        result = await self.db.execute(
            select(CRMRecord)
            .where(
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.object_id == person_object.id,
                CRMRecord.is_archived == False,
            )
            .options(selectinload(CRMRecord.object))
        )
        existing_records = result.scalars().all()

        # Check if any record has this email
        for record in existing_records:
            record_email = record.values.get("email", "")
            if isinstance(record_email, str) and record_email.lower() == email_lower:
                return record

        # Create new person record
        values: dict[str, Any] = {"email": email}
        if name:
            values["name"] = name
            # Try to split into first/last name
            name_parts = name.strip().split(" ", 1)
            values["first_name"] = name_parts[0]
            if len(name_parts) > 1:
                values["last_name"] = name_parts[1]

        if additional_values:
            values.update(additional_values)

        # Set source tracking
        values["source"] = source
        values["created_from"] = source

        person = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=person_object.id,
            values=values,
            display_name=name or email,
        )
        self.db.add(person)

        # Update object record count
        person_object.record_count = (person_object.record_count or 0) + 1

        await self.db.flush()
        return person

    async def find_or_create_company(
        self,
        workspace_id: str,
        domain: str,
        name: str | None = None,
        additional_values: dict[str, Any] | None = None,
    ) -> CRMRecord:
        """Find or create a Company record by email domain.

        Args:
            workspace_id: The workspace ID
            domain: Email domain (e.g., "acme.com")
            name: Optional company name
            additional_values: Additional field values to set

        Returns:
            The found or created CRMRecord
        """
        # Skip common free email domains
        free_domains = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"}
        if domain.lower() in free_domains:
            raise ContactEnrichmentError(f"Cannot create company for free email domain: {domain}")

        # Get the Company object for this workspace
        company_object = await self._get_or_create_object(
            workspace_id, "company", CRMObjectType.COMPANY
        )

        # Search for existing company by domain
        domain_lower = domain.lower()
        result = await self.db.execute(
            select(CRMRecord)
            .where(
                CRMRecord.workspace_id == workspace_id,
                CRMRecord.object_id == company_object.id,
                CRMRecord.is_archived == False,
            )
            .options(selectinload(CRMRecord.object))
        )
        existing_records = result.scalars().all()

        # Check if any record has this domain
        for record in existing_records:
            record_domain = record.values.get("domain", "") or record.values.get("website", "")
            if isinstance(record_domain, str) and domain_lower in record_domain.lower():
                return record

        # Create new company record
        company_name = name or self._domain_to_company_name(domain)
        values: dict[str, Any] = {
            "name": company_name,
            "domain": domain,
            "website": f"https://{domain}",
        }

        if additional_values:
            values.update(additional_values)

        company = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=company_object.id,
            values=values,
            display_name=company_name,
        )
        self.db.add(company)

        # Update object record count
        company_object.record_count = (company_object.record_count or 0) + 1

        await self.db.flush()
        return company

    def _domain_to_company_name(self, domain: str) -> str:
        """Convert domain to company name."""
        # Remove common TLDs and format
        name = domain.split(".")[0]
        # Capitalize and clean up
        name = name.replace("-", " ").replace("_", " ")
        return name.title()

    async def enrich_contact(
        self,
        record_id: str,
        workspace_id: str,
    ) -> dict[str, Any]:
        """Enrich a CRM record with data from linked emails.

        Args:
            record_id: The CRM record ID
            workspace_id: The workspace ID

        Returns:
            Enrichment results
        """
        # Get the record
        result = await self.db.execute(
            select(CRMRecord)
            .where(CRMRecord.id == record_id)
            .options(selectinload(CRMRecord.object))
        )
        record = result.scalar_one_or_none()

        if not record:
            raise ContactEnrichmentError(f"Record not found: {record_id}")

        email = record.values.get("email")
        if not email:
            return {"enriched": False, "reason": "No email address on record"}

        # Find linked emails
        from aexy.models.google_integration import SyncedEmail, SyncedEmailRecordLink

        links_result = await self.db.execute(
            select(SyncedEmailRecordLink)
            .where(SyncedEmailRecordLink.record_id == record_id)
        )
        links = links_result.scalars().all()

        if not links:
            # Try to find emails by email address
            emails_result = await self.db.execute(
                select(SyncedEmail)
                .where(
                    SyncedEmail.workspace_id == workspace_id,
                    SyncedEmail.from_email == email,
                )
                .order_by(SyncedEmail.gmail_date.desc())
                .limit(10)
            )
            emails = emails_result.scalars().all()
        else:
            email_ids = [link.email_id for link in links]
            emails_result = await self.db.execute(
                select(SyncedEmail)
                .where(SyncedEmail.id.in_(email_ids))
                .order_by(SyncedEmail.gmail_date.desc())
            )
            emails = emails_result.scalars().all()

        if not emails:
            return {"enriched": False, "reason": "No emails found for this contact"}

        enrichments: dict[str, Any] = {}

        # Extract signature info from most recent email with body
        for synced_email in emails:
            if synced_email.body_text:
                signature_info = await self.extract_signature_info(synced_email.body_text)
                if signature_info.get("extracted"):
                    contact_info = signature_info.get("contact_info", {})
                    # Merge into enrichments (don't overwrite existing values)
                    for key, value in contact_info.items():
                        if value and key not in enrichments:
                            enrichments[key] = value
                    break

        # Classify contact
        email_samples = [
            {
                "direction": "received" if e.from_email == email else "sent",
                "subject": e.subject,
                "snippet": e.snippet,
            }
            for e in emails[:5]
        ]
        classification = await self.classify_contact(
            email,
            email_samples,
            name=record.values.get("name"),
        )
        enrichments["classification"] = classification.get("classification")
        enrichments["lead_score"] = classification.get("lead_score", 0)

        # Update record values
        if enrichments:
            updated_values = record.values.copy()
            for key, value in enrichments.items():
                if value and key not in updated_values:
                    updated_values[key] = value
            record.values = updated_values

            # Log enrichment activity
            activity = CRMActivity(
                id=str(uuid4()),
                workspace_id=workspace_id,
                record_id=record_id,
                activity_type=CRMActivityType.ENRICHMENT_COMPLETED.value,
                actor_type="system",
                title="Contact enriched from email data",
                activity_metadata={
                    "enrichments": enrichments,
                    "emails_analyzed": len(emails),
                    "classification": classification,
                },
                occurred_at=datetime.now(timezone.utc),
            )
            self.db.add(activity)
            await self.db.flush()

        return {
            "enriched": bool(enrichments),
            "enrichments": enrichments,
            "classification": classification,
            "emails_analyzed": len(emails),
        }

    async def process_new_emails(
        self,
        workspace_id: str,
        email_ids: list[str] | None = None,
        auto_create_contacts: bool = True,
        enrich_existing: bool = True,
    ) -> dict[str, Any]:
        """Process new emails to extract and enrich contacts.

        Args:
            workspace_id: The workspace ID
            email_ids: Optional list of specific email IDs to process
            auto_create_contacts: Whether to create new contacts from emails
            enrich_existing: Whether to enrich existing contacts

        Returns:
            Processing statistics
        """
        stats = {
            "emails_processed": 0,
            "contacts_created": 0,
            "contacts_enriched": 0,
            "companies_created": 0,
            "errors": 0,
        }

        # Get emails to process
        query = select(SyncedEmail).where(
            SyncedEmail.workspace_id == workspace_id
        )
        if email_ids:
            query = query.where(SyncedEmail.id.in_(email_ids))
        else:
            # Process emails without extracted_contacts
            query = query.where(SyncedEmail.extracted_contacts == None)

        query = query.order_by(SyncedEmail.gmail_date.desc()).limit(100)

        result = await self.db.execute(query)
        emails = result.scalars().all()

        for email in emails:
            try:
                stats["emails_processed"] += 1

                # Extract signature info
                signature_info = {}
                if email.body_text:
                    signature_info = await self.extract_signature_info(email.body_text)
                    email.signature_data = signature_info

                # Process sender
                if email.from_email and auto_create_contacts:
                    try:
                        # Get domain for company
                        domain = email.from_email.split("@")[-1] if "@" in email.from_email else None

                        # Create/find person
                        person = await self.find_or_create_person(
                            workspace_id,
                            email.from_email,
                            name=email.from_name,
                            source="email_sync",
                            additional_values=signature_info.get("contact_info", {}),
                        )

                        # Track if new
                        if person.created_at >= datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0):
                            stats["contacts_created"] += 1

                        # Create company if business domain
                        if domain and domain not in {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com"}:
                            try:
                                company_name = signature_info.get("contact_info", {}).get("company")
                                company = await self.find_or_create_company(
                                    workspace_id,
                                    domain,
                                    name=company_name,
                                )
                                if company.created_at >= datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0):
                                    stats["companies_created"] += 1
                            except ContactEnrichmentError:
                                pass

                    except Exception as e:
                        logger.error(f"Error creating contact from email {email.id}: {e}")
                        stats["errors"] += 1

                # Store extracted contacts
                extracted = []
                if email.from_email:
                    extracted.append({
                        "email": email.from_email,
                        "name": email.from_name,
                        "type": "from",
                    })
                for to in email.to_emails or []:
                    extracted.append({
                        "email": to.get("email"),
                        "name": to.get("name"),
                        "type": "to",
                    })
                email.extracted_contacts = extracted

            except Exception as e:
                logger.error(f"Error processing email {email.id}: {e}")
                stats["errors"] += 1

        await self.db.flush()
        return stats

    async def _get_or_create_object(
        self,
        workspace_id: str,
        slug: str,
        object_type: CRMObjectType,
    ) -> CRMObject:
        """Get or create a CRM object type."""
        result = await self.db.execute(
            select(CRMObject).where(
                CRMObject.workspace_id == workspace_id,
                CRMObject.slug == slug,
            )
        )
        obj = result.scalar_one_or_none()

        if obj:
            return obj

        # Create the object
        name = slug.replace("_", " ").title()
        obj = CRMObject(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            plural_name=f"{name}s",
            object_type=object_type.value,
            is_system=True,
            is_active=True,
            settings={
                "enableActivities": True,
                "enableNotes": True,
                "enableTasks": True,
                "enableFiles": True,
            },
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    def _parse_json_response(self, text: str) -> dict[str, Any]:
        """Parse JSON from LLM response."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            return {}
