"""Service for checking and enforcing plan-based limits."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.developer import Developer
from devograph.models.plan import DEFAULT_PLANS, Plan, PlanTier
from devograph.models.repository import DeveloperRepository


@dataclass
class SyncLimits:
    """Sync limits for a developer based on their plan."""

    max_repos: int
    max_commits_per_repo: int
    max_prs_per_repo: int
    sync_history_days: int
    enable_real_time_sync: bool
    enable_webhooks: bool

    def is_unlimited(self, field: str) -> bool:
        """Check if a field has unlimited value (-1)."""
        value = getattr(self, field, None)
        return value == -1 if value is not None else False

    def get_since_date(self) -> datetime | None:
        """Get the earliest date to sync from based on history days limit."""
        if self.sync_history_days == -1:
            return None  # No limit
        return datetime.now(timezone.utc) - timedelta(days=self.sync_history_days)


@dataclass
class LLMLimits:
    """LLM limits for a developer based on their plan."""

    requests_per_day: int
    requests_used_today: int
    provider_access: list[str]
    enable_advanced_analytics: bool

    @property
    def remaining_requests(self) -> int:
        if self.requests_per_day == -1:
            return -1  # Unlimited
        return max(0, self.requests_per_day - self.requests_used_today)

    def is_unlimited(self) -> bool:
        return self.requests_per_day == -1


class LimitsService:
    """Service for checking and enforcing plan-based limits."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_developer_with_plan(self, developer_id: str) -> Developer | None:
        """Get a developer with their plan loaded."""
        stmt = (
            select(Developer)
            .where(Developer.id == developer_id)
            .options(selectinload(Developer.plan))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_free_plan(self) -> Plan:
        """Get the free plan, creating it if it doesn't exist."""
        stmt = select(Plan).where(Plan.tier == PlanTier.FREE.value)
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()

        if not plan:
            # Create free plan from defaults
            free_defaults = next(
                (p for p in DEFAULT_PLANS if p["tier"] == PlanTier.FREE.value),
                DEFAULT_PLANS[0],
            )
            plan = Plan(**free_defaults)
            self.db.add(plan)
            await self.db.flush()

        return plan

    async def ensure_developer_has_plan(self, developer_id: str) -> Plan:
        """Ensure a developer has a plan, assigning free plan if not."""
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        if developer.plan:
            return developer.plan

        # Assign free plan
        free_plan = await self.get_or_create_free_plan()
        developer.plan_id = free_plan.id
        await self.db.flush()
        return free_plan

    async def get_plan(self, developer_id: str) -> Plan:
        """Get the plan for a developer."""
        return await self.ensure_developer_has_plan(developer_id)

    async def get_sync_limits(self, developer_id: str) -> SyncLimits:
        """Get sync limits for a developer based on their plan."""
        plan = await self.get_plan(developer_id)
        return SyncLimits(
            max_repos=plan.max_repos,
            max_commits_per_repo=plan.max_commits_per_repo,
            max_prs_per_repo=plan.max_prs_per_repo,
            sync_history_days=plan.sync_history_days,
            enable_real_time_sync=plan.enable_real_time_sync,
            enable_webhooks=plan.enable_webhooks,
        )

    async def get_llm_limits(self, developer_id: str) -> LLMLimits:
        """Get LLM limits for a developer based on their plan."""
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        plan = developer.plan or await self.get_or_create_free_plan()

        return LLMLimits(
            requests_per_day=plan.llm_requests_per_day,
            requests_used_today=developer.llm_requests_today,
            provider_access=plan.llm_provider_access or ["ollama"],
            enable_advanced_analytics=plan.enable_advanced_analytics,
        )

    async def can_sync_repo(self, developer_id: str) -> tuple[bool, str | None]:
        """Check if a developer can sync another repository.

        Returns (can_sync, error_message).
        """
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return False, "Developer not found"

        plan = developer.plan or await self.get_or_create_free_plan()

        # Unlimited repos
        if plan.max_repos == -1:
            return True, None

        # Count enabled repos
        stmt = (
            select(func.count(DeveloperRepository.id))
            .where(DeveloperRepository.developer_id == developer_id)
            .where(DeveloperRepository.is_enabled == True)
        )
        result = await self.db.execute(stmt)
        count = result.scalar() or 0

        if count >= plan.max_repos:
            return False, f"Repository limit reached ({plan.max_repos} repos for {plan.name} plan)"

        return True, None

    async def can_use_llm(
        self, developer_id: str, provider: str | None = None
    ) -> tuple[bool, str | None]:
        """Check if a developer can make an LLM request.

        Returns (can_use, error_message).
        """
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return False, "Developer not found"

        plan = developer.plan or await self.get_or_create_free_plan()

        # Check provider access
        if provider and provider not in (plan.llm_provider_access or []):
            return False, f"Provider '{provider}' not available on {plan.name} plan"

        # Check daily limit
        if plan.llm_requests_per_day == -1:
            return True, None  # Unlimited

        # Check if reset needed
        await self._maybe_reset_llm_usage(developer)

        if developer.llm_requests_today >= plan.llm_requests_per_day:
            return False, f"Daily LLM request limit reached ({plan.llm_requests_per_day} requests for {plan.name} plan)"

        return True, None

    async def increment_llm_usage(self, developer_id: str) -> None:
        """Increment the LLM usage counter for a developer."""
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return

        await self._maybe_reset_llm_usage(developer)
        developer.llm_requests_today += 1
        await self.db.flush()

    async def _maybe_reset_llm_usage(self, developer: Developer) -> None:
        """Reset LLM usage if it's a new day."""
        now = datetime.now(timezone.utc)

        if developer.llm_requests_reset_at is None:
            developer.llm_requests_today = 0
            developer.llm_requests_reset_at = now + timedelta(days=1)
        elif now >= developer.llm_requests_reset_at:
            developer.llm_requests_today = 0
            developer.llm_requests_reset_at = now + timedelta(days=1)

    async def get_enabled_repos_count(self, developer_id: str) -> int:
        """Get the count of enabled repositories for a developer."""
        stmt = (
            select(func.count(DeveloperRepository.id))
            .where(DeveloperRepository.developer_id == developer_id)
            .where(DeveloperRepository.is_enabled == True)
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get_usage_summary(self, developer_id: str) -> dict[str, Any]:
        """Get a usage summary for a developer."""
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        plan = developer.plan or await self.get_or_create_free_plan()
        repos_count = await self.get_enabled_repos_count(developer_id)

        return {
            "plan": {
                "id": plan.id,
                "name": plan.name,
                "tier": plan.tier,
            },
            "repos": {
                "used": repos_count,
                "limit": plan.max_repos,
                "unlimited": plan.max_repos == -1,
            },
            "llm": {
                "used_today": developer.llm_requests_today,
                "limit_per_day": plan.llm_requests_per_day,
                "unlimited": plan.llm_requests_per_day == -1,
                "providers": plan.llm_provider_access or [],
                "reset_at": developer.llm_requests_reset_at.isoformat() if developer.llm_requests_reset_at else None,
            },
            "features": {
                "real_time_sync": plan.enable_real_time_sync,
                "webhooks": plan.enable_webhooks,
                "advanced_analytics": plan.enable_advanced_analytics,
                "exports": plan.enable_exports,
                "team_features": plan.enable_team_features,
            },
        }

    async def seed_default_plans(self) -> list[Plan]:
        """Seed the default plans into the database."""
        plans = []
        for plan_data in DEFAULT_PLANS:
            # Check if plan exists
            stmt = select(Plan).where(Plan.name == plan_data["name"])
            result = await self.db.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                # Update existing plan
                for key, value in plan_data.items():
                    setattr(existing, key, value)
                plans.append(existing)
            else:
                # Create new plan
                plan = Plan(**plan_data)
                self.db.add(plan)
                plans.append(plan)

        await self.db.flush()
        return plans
