"""Routing service for smart email routing based on domain health and ISP reputation."""

import logging
import random
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.email_infrastructure import (
    SendingDomain,
    SendingIdentity,
    SendingPool,
    SendingPoolMember,
    EmailProvider,
    ISPMetrics,
    DomainStatus,
    WarmingStatus,
    DomainHealthStatus,
    ISP_DOMAINS,
)
from aexy.schemas.email_infrastructure import RoutingDecision

logger = logging.getLogger(__name__)


class RoutingService:
    """Service for intelligent email routing decisions."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db

    # -------------------------------------------------------------------------
    # EMAIL ROUTING
    # -------------------------------------------------------------------------

    async def route_email(
        self,
        workspace_id: str,
        recipient_email: str,
        pool_id: str | None = None,
        identity_id: str | None = None,
        prefer_warming_complete: bool = True,
        min_health_score: int = 50,
    ) -> RoutingDecision | None:
        """
        Determine the best domain/identity to send an email from.

        Considers:
        - Domain health score
        - Warming status (prefer completed)
        - Daily limit availability
        - ISP-specific reputation
        - Pool routing strategy

        Returns:
            RoutingDecision with selected domain and identity, or None if no suitable domain
        """
        # If specific identity requested, use it
        if identity_id:
            identity = await self._get_identity(identity_id, workspace_id)
            if identity and identity.is_active:
                domain = await self._get_domain(identity.domain_id, workspace_id)
                if domain and await self._can_use_domain(domain, min_health_score):
                    return RoutingDecision(
                        domain_id=domain.id,
                        domain=domain.domain,
                        provider_id=domain.provider_id,
                        identity_id=identity.id,
                        from_email=identity.email,
                        reason="Requested identity",
                        fallback_domains=[],
                    )

        # Get candidate domains
        if pool_id:
            domains = await self._get_pool_domains(pool_id, workspace_id)
            pool = await self._get_pool(pool_id, workspace_id)
            routing_strategy = pool.routing_strategy if pool else "health_based"
        else:
            domains = await self._get_active_domains(workspace_id)
            routing_strategy = "health_based"

        if not domains:
            logger.warning(f"No active domains found for workspace {workspace_id}")
            return None

        # Filter domains by availability
        available_domains = []
        for domain in domains:
            can_use = await self._can_use_domain(
                domain,
                min_health_score,
                prefer_warming_complete,
            )
            if can_use:
                available_domains.append(domain)

        if not available_domains:
            logger.warning(f"No domains with available capacity for workspace {workspace_id}")
            return None

        # Detect recipient ISP
        recipient_isp = self._detect_isp(recipient_email)

        # Select domain based on routing strategy
        if routing_strategy == "round_robin":
            selected_domain = await self._select_round_robin(available_domains, workspace_id)
        elif routing_strategy == "weighted":
            selected_domain = await self._select_weighted(available_domains, pool_id)
        elif routing_strategy == "failover":
            selected_domain = await self._select_failover(available_domains, pool_id)
        else:  # health_based (default)
            selected_domain = await self._select_health_based(
                available_domains,
                recipient_isp,
            )

        if not selected_domain:
            return None

        # Get identity for the domain
        identity = await self._get_domain_identity(selected_domain.id)

        # Prepare fallback domains
        fallback_domains = [
            d.domain for d in available_domains
            if d.id != selected_domain.id
        ][:3]  # Keep top 3 fallbacks

        from_email = identity.email if identity else f"no-reply@{selected_domain.domain}"

        return RoutingDecision(
            domain_id=selected_domain.id,
            domain=selected_domain.domain,
            provider_id=selected_domain.provider_id,
            identity_id=identity.id if identity else None,
            from_email=from_email,
            reason=f"Selected via {routing_strategy} strategy",
            fallback_domains=fallback_domains,
        )

    async def get_fallback_domain(
        self,
        workspace_id: str,
        exclude_domain_ids: list[str],
        recipient_email: str | None = None,
        min_health_score: int = 50,
    ) -> RoutingDecision | None:
        """
        Get a fallback domain when the primary domain is unavailable.

        Args:
            workspace_id: Workspace ID
            exclude_domain_ids: Domain IDs to exclude (already tried)
            recipient_email: Optional recipient for ISP-aware selection
            min_health_score: Minimum health score requirement

        Returns:
            RoutingDecision or None if no fallback available
        """
        domains = await self._get_active_domains(workspace_id)

        # Filter out excluded domains
        available_domains = [
            d for d in domains
            if d.id not in exclude_domain_ids
        ]

        # Filter by availability
        for domain in list(available_domains):
            if not await self._can_use_domain(domain, min_health_score):
                available_domains.remove(domain)

        if not available_domains:
            return None

        # Select based on health
        recipient_isp = self._detect_isp(recipient_email) if recipient_email else None
        selected_domain = await self._select_health_based(available_domains, recipient_isp)

        if not selected_domain:
            return None

        identity = await self._get_domain_identity(selected_domain.id)
        from_email = identity.email if identity else f"no-reply@{selected_domain.domain}"

        return RoutingDecision(
            domain_id=selected_domain.id,
            domain=selected_domain.domain,
            provider_id=selected_domain.provider_id,
            identity_id=identity.id if identity else None,
            from_email=from_email,
            reason="Fallback domain",
            fallback_domains=[],
        )

    # -------------------------------------------------------------------------
    # SELECTION STRATEGIES
    # -------------------------------------------------------------------------

    async def _select_health_based(
        self,
        domains: list[SendingDomain],
        recipient_isp: str | None = None,
    ) -> SendingDomain | None:
        """Select domain based on health score, considering ISP reputation."""
        if not domains:
            return None

        scored_domains = []

        for domain in domains:
            score = domain.health_score

            # Boost for warming completed
            if domain.warming_status == WarmingStatus.COMPLETED.value:
                score += 10

            # Boost for more capacity remaining
            if domain.daily_limit > 0:
                capacity_ratio = 1 - (domain.daily_sent / domain.daily_limit)
                score += int(capacity_ratio * 5)

            # ISP-specific boost
            if recipient_isp:
                isp_score = await self._get_isp_health(domain.id, recipient_isp)
                if isp_score:
                    # Weight ISP score more heavily
                    score = int(score * 0.6 + isp_score * 0.4)

            scored_domains.append((domain, score))

        # Sort by score descending
        scored_domains.sort(key=lambda x: x[1], reverse=True)

        # Add some randomness among top domains with similar scores
        top_score = scored_domains[0][1]
        top_domains = [d for d, s in scored_domains if s >= top_score - 5]

        if len(top_domains) > 1:
            # Weighted random selection among top domains
            weights = [
                1 + (d.health_score - min(dd.health_score for dd in top_domains))
                for d in top_domains
            ]
            selected = random.choices(top_domains, weights=weights, k=1)[0]
            return selected

        return scored_domains[0][0]

    async def _select_round_robin(
        self,
        domains: list[SendingDomain],
        workspace_id: str,
    ) -> SendingDomain | None:
        """Select domain using round-robin based on least recent use."""
        if not domains:
            return None

        # Sort by daily_sent (least sent first for even distribution)
        sorted_domains = sorted(domains, key=lambda d: d.daily_sent)
        return sorted_domains[0]

    async def _select_weighted(
        self,
        domains: list[SendingDomain],
        pool_id: str | None,
    ) -> SendingDomain | None:
        """Select domain using weighted random selection."""
        if not domains:
            return None

        if not pool_id:
            # Equal weights if no pool
            return random.choice(domains)

        # Get weights from pool members
        result = await self.db.execute(
            select(SendingPoolMember).where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                )
            )
        )
        members = {m.domain_id: m for m in result.scalars().all()}

        weighted_domains = []
        weights = []

        for domain in domains:
            member = members.get(domain.id)
            weight = member.weight if member else 100
            weighted_domains.append(domain)
            weights.append(weight)

        if not weighted_domains:
            return None

        return random.choices(weighted_domains, weights=weights, k=1)[0]

    async def _select_failover(
        self,
        domains: list[SendingDomain],
        pool_id: str | None,
    ) -> SendingDomain | None:
        """Select domain using failover strategy (primary first)."""
        if not domains:
            return None

        if not pool_id:
            # Use default domain or first available
            for domain in domains:
                if domain.is_default:
                    return domain
            return domains[0]

        # Get priorities from pool members
        result = await self.db.execute(
            select(SendingPoolMember).where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                )
            )
        )
        members = {m.domain_id: m for m in result.scalars().all()}

        # Sort by priority (lower = higher priority)
        sorted_domains = sorted(
            domains,
            key=lambda d: members.get(d.id, SendingPoolMember()).priority if d.id in members else 999,
        )

        return sorted_domains[0] if sorted_domains else None

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _detect_isp(self, email: str) -> str | None:
        """Detect the ISP from an email address."""
        if not email or "@" not in email:
            return None

        domain = email.split("@")[1].lower()

        for isp, domains in ISP_DOMAINS.items():
            if domain in domains:
                return isp

        return "other"

    async def _can_use_domain(
        self,
        domain: SendingDomain,
        min_health_score: int = 50,
        prefer_warming_complete: bool = False,
    ) -> bool:
        """Check if a domain can be used for sending."""
        # Check status
        if domain.status not in [
            DomainStatus.VERIFIED.value,
            DomainStatus.WARMING.value,
            DomainStatus.ACTIVE.value,
        ]:
            return False

        # Check health score
        if domain.health_score < min_health_score:
            return False

        # Check daily limit
        if domain.daily_sent >= domain.daily_limit:
            return False

        # Check warming preference
        if prefer_warming_complete:
            if domain.warming_status == WarmingStatus.IN_PROGRESS.value:
                # Allow but with lower priority (handled in scoring)
                pass

        return True

    async def _get_active_domains(
        self,
        workspace_id: str,
    ) -> list[SendingDomain]:
        """Get all active domains for a workspace."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.workspace_id == workspace_id,
                    SendingDomain.status.in_([
                        DomainStatus.VERIFIED.value,
                        DomainStatus.WARMING.value,
                        DomainStatus.ACTIVE.value,
                    ]),
                )
            ).order_by(SendingDomain.health_score.desc())
        )
        return list(result.scalars().all())

    async def _get_pool_domains(
        self,
        pool_id: str,
        workspace_id: str,
    ) -> list[SendingDomain]:
        """Get domains in a sending pool."""
        result = await self.db.execute(
            select(SendingDomain)
            .join(SendingPoolMember, SendingDomain.id == SendingPoolMember.domain_id)
            .where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
            .order_by(SendingPoolMember.priority.asc())
        )
        return list(result.scalars().all())

    async def _get_pool(
        self,
        pool_id: str,
        workspace_id: str,
    ) -> SendingPool | None:
        """Get a sending pool."""
        result = await self.db.execute(
            select(SendingPool).where(
                and_(
                    SendingPool.id == pool_id,
                    SendingPool.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _get_domain(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> SendingDomain | None:
        """Get a domain by ID."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _get_identity(
        self,
        identity_id: str,
        workspace_id: str,
    ) -> SendingIdentity | None:
        """Get an identity by ID."""
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.id == identity_id,
                    SendingIdentity.workspace_id == workspace_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _get_domain_identity(
        self,
        domain_id: str,
    ) -> SendingIdentity | None:
        """Get the default identity for a domain, or any active identity."""
        # Try default identity first
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.domain_id == domain_id,
                    SendingIdentity.is_default == True,
                    SendingIdentity.is_active == True,
                )
            )
        )
        identity = result.scalar_one_or_none()

        if identity:
            return identity

        # Fall back to any active identity
        result = await self.db.execute(
            select(SendingIdentity).where(
                and_(
                    SendingIdentity.domain_id == domain_id,
                    SendingIdentity.is_active == True,
                )
            ).order_by(SendingIdentity.created_at.asc())
        )
        return result.scalars().first()

    async def _get_isp_health(
        self,
        domain_id: str,
        isp: str,
    ) -> int | None:
        """Get the health score for a domain with a specific ISP."""
        # Get recent ISP metrics
        result = await self.db.execute(
            select(ISPMetrics)
            .where(
                and_(
                    ISPMetrics.domain_id == domain_id,
                    ISPMetrics.isp == isp,
                )
            )
            .order_by(ISPMetrics.date.desc())
            .limit(7)
        )
        metrics = list(result.scalars().all())

        if not metrics:
            return None

        # Average health score over last 7 days
        return int(sum(m.health_score for m in metrics) / len(metrics))

    # -------------------------------------------------------------------------
    # POOL MANAGEMENT
    # -------------------------------------------------------------------------

    async def create_pool(
        self,
        workspace_id: str,
        name: str,
        description: str | None = None,
        routing_strategy: str = "health_based",
        is_default: bool = False,
    ) -> SendingPool:
        """Create a new sending pool."""
        from uuid import uuid4

        pool = SendingPool(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            routing_strategy=routing_strategy,
            is_default=is_default,
        )

        if is_default:
            # Unset other defaults
            result = await self.db.execute(
                select(SendingPool).where(
                    and_(
                        SendingPool.workspace_id == workspace_id,
                        SendingPool.is_default == True,
                    )
                )
            )
            for existing in result.scalars().all():
                existing.is_default = False

        self.db.add(pool)
        await self.db.commit()
        await self.db.refresh(pool)

        return pool

    async def add_domain_to_pool(
        self,
        pool_id: str,
        domain_id: str,
        workspace_id: str,
        weight: int = 100,
        priority: int = 100,
    ) -> SendingPoolMember:
        """Add a domain to a sending pool."""
        from uuid import uuid4

        # Verify pool and domain belong to workspace
        pool = await self._get_pool(pool_id, workspace_id)
        if not pool:
            raise ValueError("Pool not found")

        domain = await self._get_domain(domain_id, workspace_id)
        if not domain:
            raise ValueError("Domain not found")

        member = SendingPoolMember(
            id=str(uuid4()),
            pool_id=pool_id,
            domain_id=domain_id,
            weight=weight,
            priority=priority,
        )

        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)

        return member

    async def remove_domain_from_pool(
        self,
        pool_id: str,
        domain_id: str,
        workspace_id: str,
    ) -> bool:
        """Remove a domain from a sending pool."""
        pool = await self._get_pool(pool_id, workspace_id)
        if not pool:
            return False

        result = await self.db.execute(
            select(SendingPoolMember).where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.domain_id == domain_id,
                )
            )
        )
        member = result.scalar_one_or_none()

        if member:
            await self.db.delete(member)
            await self.db.commit()
            return True

        return False

    # -------------------------------------------------------------------------
    # SYNC METHODS (for Temporal activities)
    # -------------------------------------------------------------------------

    def route_email_sync(
        self,
        pool_id: str,
        recipient_email: str,
        strategy: str = "health_based",
        min_health_score: int = 50,
    ) -> dict | None:
        """
        Sync version of email routing for Temporal activities.

        Returns a dict with routing decision info.
        """
        # Get pool
        pool_result = self.db.execute(
            select(SendingPool).where(SendingPool.id == pool_id)
        )
        pool = pool_result.scalar_one_or_none()
        if not pool:
            return None

        # Get pool domains
        result = self.db.execute(
            select(SendingDomain)
            .join(SendingPoolMember, SendingDomain.id == SendingPoolMember.domain_id)
            .where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                )
            )
            .order_by(SendingPoolMember.priority.asc())
        )
        domains = list(result.scalars().all())

        if not domains:
            return None

        # Filter available domains
        available_domains = []
        for domain in domains:
            if self._can_use_domain_sync(domain, min_health_score):
                available_domains.append(domain)

        if not available_domains:
            return None

        # Detect recipient ISP
        recipient_isp = self._detect_isp(recipient_email)

        # Select domain based on strategy
        if strategy == "round_robin":
            selected = self._select_round_robin_sync(available_domains)
        elif strategy == "weighted":
            selected = self._select_weighted_sync(available_domains, pool_id)
        elif strategy == "failover":
            selected = self._select_failover_sync(available_domains, pool_id)
        else:  # health_based
            selected = self._select_health_based_sync(available_domains, recipient_isp)

        if not selected:
            return None

        return {
            "domain_id": selected.id,
            "domain": selected.domain,
            "provider_id": selected.provider_id,
        }

    def get_fallback_domain_sync(
        self,
        pool_id: str,
        exclude_domain_id: str,
        recipient_email: str | None = None,
        min_health_score: int = 50,
    ) -> dict | None:
        """
        Sync version to get a fallback domain.
        """
        result = self.db.execute(
            select(SendingDomain)
            .join(SendingPoolMember, SendingDomain.id == SendingPoolMember.domain_id)
            .where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                    SendingDomain.id != exclude_domain_id,
                )
            )
            .order_by(SendingPoolMember.priority.asc())
        )
        domains = list(result.scalars().all())

        available_domains = [
            d for d in domains
            if self._can_use_domain_sync(d, min_health_score)
        ]

        if not available_domains:
            return None

        recipient_isp = self._detect_isp(recipient_email) if recipient_email else None
        selected = self._select_health_based_sync(available_domains, recipient_isp)

        if not selected:
            return None

        return {
            "domain_id": selected.id,
            "domain": selected.domain,
            "provider_id": selected.provider_id,
        }

    def _can_use_domain_sync(
        self,
        domain: SendingDomain,
        min_health_score: int = 50,
    ) -> bool:
        """Sync version of domain availability check."""
        if domain.status not in [
            DomainStatus.VERIFIED.value,
            DomainStatus.WARMING.value,
            DomainStatus.ACTIVE.value,
        ]:
            return False

        if domain.health_score and domain.health_score < min_health_score:
            return False

        if domain.daily_sent >= domain.daily_limit:
            return False

        return True

    def _select_health_based_sync(
        self,
        domains: list[SendingDomain],
        recipient_isp: str | None = None,
    ) -> SendingDomain | None:
        """Sync version of health-based selection."""
        if not domains:
            return None

        scored_domains = []
        for domain in domains:
            score = domain.health_score or 100

            if domain.warming_status == WarmingStatus.COMPLETED.value:
                score += 10

            if domain.daily_limit > 0:
                capacity_ratio = 1 - (domain.daily_sent / domain.daily_limit)
                score += int(capacity_ratio * 5)

            scored_domains.append((domain, score))

        scored_domains.sort(key=lambda x: x[1], reverse=True)

        top_score = scored_domains[0][1]
        top_domains = [d for d, s in scored_domains if s >= top_score - 5]

        if len(top_domains) > 1:
            return random.choice(top_domains)

        return scored_domains[0][0]

    def _select_round_robin_sync(
        self,
        domains: list[SendingDomain],
    ) -> SendingDomain | None:
        """Sync version of round-robin selection."""
        if not domains:
            return None
        sorted_domains = sorted(domains, key=lambda d: d.daily_sent)
        return sorted_domains[0]

    def _select_weighted_sync(
        self,
        domains: list[SendingDomain],
        pool_id: str,
    ) -> SendingDomain | None:
        """Sync version of weighted selection."""
        if not domains:
            return None

        result = self.db.execute(
            select(SendingPoolMember).where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                )
            )
        )
        members = {m.domain_id: m for m in result.scalars().all()}

        weighted_domains = []
        weights = []

        for domain in domains:
            member = members.get(domain.id)
            weight = member.weight if member else 100
            weighted_domains.append(domain)
            weights.append(weight)

        if not weighted_domains:
            return None

        return random.choices(weighted_domains, weights=weights, k=1)[0]

    def _select_failover_sync(
        self,
        domains: list[SendingDomain],
        pool_id: str,
    ) -> SendingDomain | None:
        """Sync version of failover selection."""
        if not domains:
            return None

        result = self.db.execute(
            select(SendingPoolMember).where(
                and_(
                    SendingPoolMember.pool_id == pool_id,
                    SendingPoolMember.is_active == True,
                )
            )
        )
        members = {m.domain_id: m for m in result.scalars().all()}

        sorted_domains = sorted(
            domains,
            key=lambda d: members[d.id].priority if d.id in members else 999,
        )

        return sorted_domains[0] if sorted_domains else None
