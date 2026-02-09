"""Domain service for managing sending domains, DNS verification, and identities."""

import logging
import hashlib
import dns.resolver
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from aexy.models.email_infrastructure import (
    SendingDomain,
    SendingIdentity,
    EmailProvider,
    WarmingSchedule,
    DomainStatus,
    WarmingStatus,
    DomainHealthStatus,
    CONSERVATIVE_SCHEDULE,
    MODERATE_SCHEDULE,
    AGGRESSIVE_SCHEDULE,
)
from aexy.schemas.email_infrastructure import (
    SendingDomainCreate,
    SendingDomainUpdate,
    SendingIdentityCreate,
    SendingIdentityUpdate,
    DNSRecord,
    DNSRecordsStatus,
    WarmingScheduleType,
)

logger = logging.getLogger(__name__)


class DomainService:
    """Service for managing sending domains and DNS verification."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db

    # -------------------------------------------------------------------------
    # DOMAIN CRUD
    # -------------------------------------------------------------------------

    async def check_domain_exists(
        self,
        workspace_id: str,
        domain: str,
    ) -> bool:
        """Check if a domain already exists for this workspace."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.workspace_id == workspace_id,
                    SendingDomain.domain == domain,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def create_domain(
        self,
        workspace_id: str,
        data: SendingDomainCreate,
    ) -> SendingDomain:
        """Create a new sending domain.

        Raises:
            ValueError: If domain already exists for this workspace
        """
        # Check for duplicate domain
        if await self.check_domain_exists(workspace_id, data.domain):
            raise ValueError(f"Domain '{data.domain}' already exists in this workspace")

        # Generate verification token
        token_source = f"{workspace_id}:{data.domain}:{uuid4()}"
        verification_token = hashlib.sha256(token_source.encode()).hexdigest()[:32]

        # Get full domain name
        full_domain = data.domain
        if data.subdomain:
            full_domain = f"{data.subdomain}.{data.domain}"

        domain = SendingDomain(
            id=str(uuid4()),
            workspace_id=workspace_id,
            provider_id=data.provider_id,
            domain=data.domain,
            subdomain=data.subdomain,
            status=DomainStatus.PENDING.value,
            verification_token=verification_token,
            dns_records=self._generate_required_dns_records(full_domain, verification_token),
            default_from_name=data.default_from_name,
            default_reply_to=data.default_reply_to,
            is_default=data.is_default,
            warming_status=WarmingStatus.NOT_STARTED.value,
            health_score=100,
            health_status=DomainHealthStatus.EXCELLENT.value,
        )

        # If this is the default, unset other defaults
        if data.is_default:
            await self._unset_default_domains(workspace_id)

        self.db.add(domain)
        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Created sending domain: {domain.id} ({domain.domain})")
        return domain

    async def update_domain(
        self,
        domain_id: str,
        workspace_id: str,
        data: SendingDomainUpdate,
    ) -> SendingDomain | None:
        """Update a sending domain."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Handle default flag
        if update_data.get("is_default"):
            await self._unset_default_domains(workspace_id, exclude_id=domain_id)

        for key, value in update_data.items():
            setattr(domain, key, value)

        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Updated sending domain: {domain.id}")
        return domain

    async def delete_domain(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a sending domain."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            return False

        try:
            await self.db.delete(domain)
            await self.db.commit()
            logger.info(f"Deleted sending domain: {domain_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Failed to delete domain {domain_id}: {e}")
            raise

    async def get_domain(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> SendingDomain | None:
        """Get a sending domain by ID."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_domains(
        self,
        workspace_id: str,
        status: str | None = None,
    ) -> list[SendingDomain]:
        """List all sending domains for a workspace."""
        query = select(SendingDomain).where(SendingDomain.workspace_id == workspace_id)

        if status:
            query = query.where(SendingDomain.status == status)

        query = query.order_by(SendingDomain.created_at.asc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_default_domain(
        self,
        workspace_id: str,
    ) -> SendingDomain | None:
        """Get the default sending domain for a workspace."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.workspace_id == workspace_id,
                    SendingDomain.is_default == True,
                    SendingDomain.status.in_([
                        DomainStatus.VERIFIED.value,
                        DomainStatus.WARMING.value,
                        DomainStatus.ACTIVE.value,
                    ]),
                )
            )
        )
        return result.scalar_one_or_none()

    async def _unset_default_domains(
        self,
        workspace_id: str,
        exclude_id: str | None = None,
    ) -> None:
        """Unset default flag on all domains except the excluded one."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.workspace_id == workspace_id,
                    SendingDomain.is_default == True,
                    SendingDomain.id != exclude_id if exclude_id else True,
                )
            )
        )
        for domain in result.scalars().all():
            domain.is_default = False

    # -------------------------------------------------------------------------
    # DNS VERIFICATION
    # -------------------------------------------------------------------------

    def _generate_required_dns_records(
        self,
        domain: str,
        verification_token: str,
    ) -> dict:
        """Generate required DNS records for domain verification."""
        return {
            "verification": {
                "record_type": "TXT",
                "name": f"_aexy-verification.{domain}",
                "value": f"aexy-verify={verification_token}",
                "verified": False,
            },
            "spf": {
                "record_type": "TXT",
                "name": domain,
                "value": "v=spf1 include:amazonses.com include:sendgrid.net include:mailgun.org ~all",
                "verified": False,
                "note": "Add to existing SPF record if one exists",
            },
            "dkim": [],  # Will be populated by provider
            "dmarc": {
                "record_type": "TXT",
                "name": f"_dmarc.{domain}",
                "value": "v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}",
                "verified": False,
            },
        }

    async def verify_domain_dns(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> DNSRecordsStatus:
        """Verify DNS records for a domain."""
        domain = await self.get_domain(domain_id, workspace_id)
        if not domain:
            raise ValueError("Domain not found")

        full_domain = domain.domain
        if domain.subdomain:
            full_domain = f"{domain.subdomain}.{domain.domain}"

        dns_records = domain.dns_records or {}
        updated_records = dict(dns_records)

        # Verify verification record
        verification_verified = await self._check_txt_record(
            f"_aexy-verification.{full_domain}",
            f"aexy-verify={domain.verification_token}",
        )
        if "verification" in updated_records:
            updated_records["verification"]["verified"] = verification_verified
            updated_records["verification"]["last_checked_at"] = datetime.now(timezone.utc).isoformat()

        # Verify SPF
        spf_verified = await self._check_spf_record(full_domain)
        if "spf" in updated_records:
            updated_records["spf"]["verified"] = spf_verified
            updated_records["spf"]["last_checked_at"] = datetime.now(timezone.utc).isoformat()

        # Verify DMARC
        dmarc_verified = await self._check_dmarc_record(domain.domain)  # DMARC is on root domain
        if "dmarc" in updated_records:
            updated_records["dmarc"]["verified"] = dmarc_verified
            updated_records["dmarc"]["last_checked_at"] = datetime.now(timezone.utc).isoformat()

        # Update domain
        domain.dns_records = updated_records
        flag_modified(domain, "dns_records")  # Ensure SQLAlchemy detects JSONB change
        domain.dns_last_checked_at = datetime.now(timezone.utc)

        # Determine overall status
        all_verified = verification_verified and spf_verified
        if all_verified and domain.status == DomainStatus.PENDING.value:
            domain.status = DomainStatus.VERIFIED.value
            domain.verified_at = datetime.now(timezone.utc)
            logger.info(f"Domain {domain.domain} verified successfully")

        await self.db.commit()
        await self.db.refresh(domain)

        # Build response
        return DNSRecordsStatus(
            spf=DNSRecord(
                record_type="TXT",
                name=full_domain,
                value=dns_records.get("spf", {}).get("value", ""),
                verified=spf_verified,
                last_checked_at=datetime.now(timezone.utc),
            ) if "spf" in dns_records else None,
            dkim=[],  # TODO: Add DKIM verification per provider
            dmarc=DNSRecord(
                record_type="TXT",
                name=f"_dmarc.{domain.domain}",
                value=dns_records.get("dmarc", {}).get("value", ""),
                verified=dmarc_verified,
                last_checked_at=datetime.now(timezone.utc),
            ) if "dmarc" in dns_records else None,
            all_verified=all_verified,
        )

    async def _check_txt_record(self, domain: str, expected_value: str) -> bool:
        """Check if a TXT record exists with the expected value."""
        try:
            resolver = dns.resolver.Resolver()
            resolver.timeout = 5
            resolver.lifetime = 10

            answers = resolver.resolve(domain, "TXT")
            for rdata in answers:
                for txt_string in rdata.strings:
                    if txt_string.decode("utf-8") == expected_value:
                        return True
            return False
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.Timeout) as e:
            logger.debug(f"DNS lookup failed for {domain}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error checking TXT record for {domain}: {e}")
            return False

    async def _check_spf_record(self, domain: str) -> bool:
        """Check if SPF record exists."""
        try:
            resolver = dns.resolver.Resolver()
            resolver.timeout = 5
            resolver.lifetime = 10

            answers = resolver.resolve(domain, "TXT")
            for rdata in answers:
                for txt_string in rdata.strings:
                    txt_value = txt_string.decode("utf-8")
                    if txt_value.startswith("v=spf1"):
                        return True
            return False
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.Timeout):
            return False
        except Exception as e:
            logger.error(f"Error checking SPF record for {domain}: {e}")
            return False

    async def _check_dmarc_record(self, domain: str) -> bool:
        """Check if DMARC record exists."""
        try:
            resolver = dns.resolver.Resolver()
            resolver.timeout = 5
            resolver.lifetime = 10

            answers = resolver.resolve(f"_dmarc.{domain}", "TXT")
            for rdata in answers:
                for txt_string in rdata.strings:
                    txt_value = txt_string.decode("utf-8")
                    if txt_value.startswith("v=DMARC1"):
                        return True
            return False
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.Timeout):
            return False
        except Exception as e:
            logger.error(f"Error checking DMARC record for {domain}: {e}")
            return False

    # -------------------------------------------------------------------------
    # DOMAIN OPERATIONS
    # -------------------------------------------------------------------------

    async def pause_domain(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> SendingDomain | None:
        """Pause a sending domain."""
        domain = await self.get_domain(domain_id, workspace_id)
        if not domain:
            return None

        domain.status = DomainStatus.PAUSED.value
        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Paused sending domain: {domain.id}")
        return domain

    async def resume_domain(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> SendingDomain | None:
        """Resume a paused sending domain."""
        domain = await self.get_domain(domain_id, workspace_id)
        if not domain:
            return None

        # Determine the appropriate status
        if domain.warming_status == WarmingStatus.IN_PROGRESS.value:
            domain.status = DomainStatus.WARMING.value
        elif domain.warming_status == WarmingStatus.COMPLETED.value:
            domain.status = DomainStatus.ACTIVE.value
        elif domain.verified_at:
            domain.status = DomainStatus.VERIFIED.value
        else:
            domain.status = DomainStatus.PENDING.value

        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Resumed sending domain: {domain.id}")
        return domain

    async def can_send(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> tuple[bool, str]:
        """
        Check if a domain can be used for sending.

        Returns:
            Tuple of (can_send, reason)
        """
        domain = await self.get_domain(domain_id, workspace_id)
        if not domain:
            return False, "Domain not found"

        # Check status
        if domain.status not in [
            DomainStatus.VERIFIED.value,
            DomainStatus.WARMING.value,
            DomainStatus.ACTIVE.value,
        ]:
            return False, f"Domain status is {domain.status}"

        # Check daily limit
        if domain.daily_sent >= domain.daily_limit:
            return False, f"Daily limit reached ({domain.daily_sent}/{domain.daily_limit})"

        # Check health
        if domain.health_status == DomainHealthStatus.CRITICAL.value:
            return False, "Domain health is critical"

        return True, "OK"

    async def increment_daily_sent(
        self,
        domain_id: str,
        count: int = 1,
    ) -> None:
        """Increment the daily sent counter for a domain."""
        result = await self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if domain:
            domain.daily_sent += count
            await self.db.commit()

    async def reset_daily_counts(
        self,
        workspace_id: str | None = None,
    ) -> int:
        """Reset daily send counts for domains."""
        query = select(SendingDomain)
        if workspace_id:
            query = query.where(SendingDomain.workspace_id == workspace_id)

        result = await self.db.execute(query)
        domains = result.scalars().all()

        count = 0
        now = datetime.now(timezone.utc)

        for domain in domains:
            domain.daily_sent = 0
            domain.daily_reset_at = now
            count += 1

        await self.db.commit()
        logger.info(f"Reset daily counts for {count} domains")
        return count

    # -------------------------------------------------------------------------
    # SENDING IDENTITY CRUD
    # -------------------------------------------------------------------------

    async def create_identity(
        self,
        workspace_id: str,
        data: SendingIdentityCreate,
    ) -> SendingIdentity:
        """Create a new sending identity."""
        # Verify domain exists and belongs to workspace
        domain = await self.get_domain(data.domain_id, workspace_id)
        if not domain:
            raise ValueError("Domain not found")

        # Verify email matches domain
        email_domain = data.email.split("@")[1]
        full_domain = domain.domain
        if domain.subdomain:
            full_domain = f"{domain.subdomain}.{domain.domain}"

        if email_domain != full_domain and email_domain != domain.domain:
            raise ValueError(f"Email domain must match {full_domain}")

        identity = SendingIdentity(
            id=str(uuid4()),
            workspace_id=workspace_id,
            domain_id=data.domain_id,
            email=data.email,
            display_name=data.display_name,
            reply_to=data.reply_to,
            is_default=data.is_default,
        )

        # If this is the default, unset other defaults for this domain
        if data.is_default:
            await self._unset_default_identities(data.domain_id)

        self.db.add(identity)
        await self.db.commit()
        await self.db.refresh(identity)

        logger.info(f"Created sending identity: {identity.id} ({identity.email})")
        return identity

    async def update_identity(
        self,
        identity_id: str,
        workspace_id: str,
        data: SendingIdentityUpdate,
    ) -> SendingIdentity | None:
        """Update a sending identity."""
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.id == identity_id,
                    SendingIdentity.workspace_id == workspace_id,
                )
            )
        )
        identity = result.scalar_one_or_none()

        if not identity:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Handle default flag
        if update_data.get("is_default"):
            await self._unset_default_identities(identity.domain_id, exclude_id=identity_id)

        for key, value in update_data.items():
            setattr(identity, key, value)

        await self.db.commit()
        await self.db.refresh(identity)

        logger.info(f"Updated sending identity: {identity.id}")
        return identity

    async def delete_identity(
        self,
        identity_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a sending identity."""
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.id == identity_id,
                    SendingIdentity.workspace_id == workspace_id,
                )
            )
        )
        identity = result.scalar_one_or_none()

        if not identity:
            return False

        await self.db.delete(identity)
        await self.db.commit()

        logger.info(f"Deleted sending identity: {identity_id}")
        return True

    async def get_identity(
        self,
        identity_id: str,
        workspace_id: str,
    ) -> SendingIdentity | None:
        """Get a sending identity by ID."""
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.id == identity_id,
                    SendingIdentity.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_identities(
        self,
        workspace_id: str,
        domain_id: str | None = None,
    ) -> list[SendingIdentity]:
        """List sending identities."""
        query = select(SendingIdentity).where(SendingIdentity.workspace_id == workspace_id)

        if domain_id:
            query = query.where(SendingIdentity.domain_id == domain_id)

        query = query.order_by(SendingIdentity.created_at.asc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_default_identity(
        self,
        domain_id: str,
    ) -> SendingIdentity | None:
        """Get the default identity for a domain."""
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.domain_id == domain_id,
                    SendingIdentity.is_default == True,
                    SendingIdentity.is_active == True,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _unset_default_identities(
        self,
        domain_id: str,
        exclude_id: str | None = None,
    ) -> None:
        """Unset default flag on all identities for a domain."""
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.domain_id == domain_id,
                    SendingIdentity.is_default == True,
                    SendingIdentity.id != exclude_id if exclude_id else True,
                )
            )
        )
        for identity in result.scalars().all():
            identity.is_default = False

    async def increment_identity_sent(
        self,
        identity_id: str,
    ) -> None:
        """Increment the total sent counter and update last used time."""
        result = await self.db.execute(
            select(SendingIdentity).where(SendingIdentity.id == identity_id)
        )
        identity = result.scalar_one_or_none()

        if identity:
            identity.total_sent += 1
            identity.last_used_at = datetime.now(timezone.utc)
            await self.db.commit()

    # -------------------------------------------------------------------------
    # SYNC METHODS (for Temporal activities)
    # -------------------------------------------------------------------------

    def can_send_sync(
        self,
        domain_id: str,
    ) -> tuple[bool, str | None]:
        """
        Sync version to check if a domain can send more emails.

        Returns:
            Tuple of (can_send, reason_if_not)
        """
        result = self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if not domain:
            return False, "Domain not found"

        # Check status
        if domain.status == DomainStatus.PAUSED.value:
            return False, "Domain is paused"

        if domain.status not in [
            DomainStatus.VERIFIED.value,
            DomainStatus.WARMING.value,
            DomainStatus.ACTIVE.value,
        ]:
            return False, f"Domain status is {domain.status}"

        # Check daily limit
        if domain.daily_sent >= domain.daily_limit:
            return False, f"Daily limit reached ({domain.daily_limit})"

        # Check health score
        if domain.health_score and domain.health_score < 30:
            return False, f"Health score too low ({domain.health_score})"

        return True, None

    def increment_send_count_sync(
        self,
        domain_id: str,
    ) -> None:
        """Sync version to increment the daily sent counter."""
        result = self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if domain:
            domain.daily_sent += 1
            self.db.commit()
