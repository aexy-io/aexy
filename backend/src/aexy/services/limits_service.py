"""Service for checking and enforcing plan-based limits."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.developer import Developer
from aexy.models.plan import DEFAULT_PLANS, Plan, PlanTier
from aexy.models.repository import DeveloperRepository


@dataclass
class LimitCheckResult:
    """Result of a limit check for billing enforcement."""

    allowed: bool
    limit_type: str  # "llm_requests", "api_calls", "repos"
    current: int
    limit: int
    percent_used: float
    retry_after_seconds: float | None
    message: str | None

    @property
    def is_near_limit(self) -> bool:
        """Check if usage is approaching the limit (>= 80%)."""
        return self.percent_used >= 80.0

    @property
    def is_critical(self) -> bool:
        """Check if usage is critical (>= 90%)."""
        return self.percent_used >= 90.0


@dataclass
class UsageThresholds:
    """Usage thresholds for alerts."""

    llm_requests: float  # Percentage used
    repos: float  # Percentage used
    api_calls: float  # Percentage used (if tracked)


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
        self._plan_cache: dict[str, Plan] = {}

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
        """Get the effective plan for a developer.

        If the developer belongs to a workspace that has a higher-tier plan
        (e.g. the owner upgraded), all members benefit from that plan.

        Results are cached per developer_id for the lifetime of this service
        instance (typically one request).
        """
        if developer_id in self._plan_cache:
            return self._plan_cache[developer_id]

        from aexy.models.workspace import Workspace, WorkspaceMember

        dev_plan = await self.ensure_developer_has_plan(developer_id)

        # Check if any workspace the developer belongs to has a better plan
        tier_order = {"free": 0, "pro": 1, "enterprise": 2}
        dev_tier = tier_order.get(dev_plan.tier, 0)

        stmt = (
            select(Plan)
            .join(Workspace, Workspace.plan_id == Plan.id)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(
                WorkspaceMember.developer_id == developer_id,
                WorkspaceMember.status == "active",
                Workspace.is_active == True,
                Plan.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        workspace_plans = result.scalars().all()

        best_plan = dev_plan
        for ws_plan in workspace_plans:
            ws_tier = tier_order.get(ws_plan.tier, 0)
            if ws_tier > dev_tier:
                best_plan = ws_plan
                dev_tier = ws_tier

        self._plan_cache[developer_id] = best_plan
        return best_plan

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

        plan = await self.get_plan(developer_id)

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

        plan = await self.get_plan(developer_id)

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

        plan = await self.get_plan(developer_id)

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

    async def check_llm_limit_for_billing(
        self, developer_id: str, provider: str | None = None
    ) -> LimitCheckResult:
        """Check LLM limits for billing enforcement with detailed result.

        Returns a LimitCheckResult with full details for billing and alerts.
        """
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return LimitCheckResult(
                allowed=False,
                limit_type="llm_requests",
                current=0,
                limit=0,
                percent_used=0.0,
                retry_after_seconds=None,
                message="Developer not found",
            )

        plan = await self.get_plan(developer_id)

        # Check provider access
        if provider and provider not in (plan.llm_provider_access or []):
            return LimitCheckResult(
                allowed=False,
                limit_type="llm_requests",
                current=developer.llm_requests_today,
                limit=plan.llm_requests_per_day,
                percent_used=0.0,
                retry_after_seconds=None,
                message=f"Provider '{provider}' not available on {plan.name} plan. Upgrade to access this provider.",
            )

        # Unlimited plan
        if plan.llm_requests_per_day == -1:
            return LimitCheckResult(
                allowed=True,
                limit_type="llm_requests",
                current=developer.llm_requests_today,
                limit=-1,
                percent_used=0.0,
                retry_after_seconds=None,
                message=None,
            )

        # Check if reset needed
        await self._maybe_reset_llm_usage(developer)

        current = developer.llm_requests_today
        limit = plan.llm_requests_per_day
        percent_used = (current / limit * 100) if limit > 0 else 0.0

        # Calculate retry_after_seconds if at limit
        retry_after_seconds = None
        if current >= limit and developer.llm_requests_reset_at:
            now = datetime.now(timezone.utc)
            remaining = (developer.llm_requests_reset_at - now).total_seconds()
            retry_after_seconds = max(0, remaining)

        if current >= limit:
            return LimitCheckResult(
                allowed=False,
                limit_type="llm_requests",
                current=current,
                limit=limit,
                percent_used=100.0,
                retry_after_seconds=retry_after_seconds,
                message=f"Daily LLM request limit reached ({limit} requests for {plan.name} plan). Upgrade your plan for more requests.",
            )

        return LimitCheckResult(
            allowed=True,
            limit_type="llm_requests",
            current=current,
            limit=limit,
            percent_used=percent_used,
            retry_after_seconds=None,
            message=None,
        )

    async def get_usage_thresholds(self, developer_id: str) -> UsageThresholds:
        """Get current usage percentages for all tracked limits."""
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return UsageThresholds(
                llm_requests=0.0,
                repos=0.0,
                api_calls=0.0,
            )

        plan = await self.get_plan(developer_id)
        await self._maybe_reset_llm_usage(developer)

        # LLM requests percentage
        llm_percent = 0.0
        if plan.llm_requests_per_day > 0:
            llm_percent = (developer.llm_requests_today / plan.llm_requests_per_day) * 100

        # Repos percentage
        repos_count = await self.get_enabled_repos_count(developer_id)
        repos_percent = 0.0
        if plan.max_repos > 0:
            repos_percent = (repos_count / plan.max_repos) * 100

        return UsageThresholds(
            llm_requests=llm_percent,
            repos=repos_percent,
            api_calls=0.0,  # TODO: Implement API call tracking
        )

    async def increment_llm_usage(self, developer_id: str) -> None:
        """Increment the LLM usage counter for a developer.

        Also checks usage thresholds and sends alerts if needed.
        """
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return

        await self._maybe_reset_llm_usage(developer)
        developer.llm_requests_today += 1
        await self.db.flush()

        # Check and send usage alerts (non-blocking)
        try:
            from aexy.services.usage_alerts_service import UsageAlertsService
            alerts_service = UsageAlertsService(self.db)
            await alerts_service.check_and_send_alerts(developer_id)
        except Exception as e:
            # Don't fail the increment if alerts fail
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to check usage alerts: {e}")

    async def _maybe_reset_llm_usage(self, developer: Developer) -> None:
        """Reset LLM usage if it's a new day."""
        now = datetime.now(timezone.utc)

        if developer.llm_requests_reset_at is None:
            developer.llm_requests_today = 0
            developer.llm_requests_reset_at = now + timedelta(days=1)
        elif now >= developer.llm_requests_reset_at:
            developer.llm_requests_today = 0
            developer.llm_requests_reset_at = now + timedelta(days=1)

    async def _maybe_reset_monthly_tokens(self, developer: Developer) -> None:
        """Reset monthly token usage if it's a new billing month."""
        now = datetime.now(timezone.utc)

        # Initialize if not set
        if not hasattr(developer, 'llm_tokens_reset_at') or developer.llm_tokens_reset_at is None:
            # Set reset to first of next month
            next_month = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
            developer.llm_tokens_used_this_month = 0
            developer.llm_input_tokens_this_month = 0
            developer.llm_output_tokens_this_month = 0
            developer.llm_overage_cost_cents = 0
            developer.llm_tokens_reset_at = next_month
        elif now >= developer.llm_tokens_reset_at:
            # Reset and set next reset date
            next_month = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
            developer.llm_tokens_used_this_month = 0
            developer.llm_input_tokens_this_month = 0
            developer.llm_output_tokens_this_month = 0
            developer.llm_overage_cost_cents = 0
            developer.llm_tokens_reset_at = next_month

    async def record_token_usage(
        self,
        developer_id: str,
        input_tokens: int,
        output_tokens: int,
    ) -> dict[str, Any]:
        """Record token usage and calculate any overage costs.

        Returns a dict with usage info and overage details.
        """
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return {"error": "Developer not found"}

        plan = await self.get_plan(developer_id)
        await self._maybe_reset_monthly_tokens(developer)

        total_tokens = input_tokens + output_tokens
        free_tokens = getattr(plan, "free_llm_tokens_per_month", 100000)
        enable_overage = getattr(plan, "enable_overage_billing", True)

        # Track tokens
        old_total = developer.llm_tokens_used_this_month or 0
        developer.llm_tokens_used_this_month = old_total + total_tokens
        developer.llm_input_tokens_this_month = (
            (developer.llm_input_tokens_this_month or 0) + input_tokens
        )
        developer.llm_output_tokens_this_month = (
            (developer.llm_output_tokens_this_month or 0) + output_tokens
        )

        # Calculate overage if applicable
        overage_cost = 0
        is_overage = False

        if free_tokens > 0:  # Not unlimited
            new_total = developer.llm_tokens_used_this_month

            if new_total > free_tokens:
                is_overage = True

                if enable_overage:
                    # Calculate overage tokens for this request
                    if old_total >= free_tokens:
                        # Already in overage, all new tokens are overage
                        overage_input = input_tokens
                        overage_output = output_tokens
                    else:
                        # Partially in overage
                        tokens_into_overage = new_total - free_tokens
                        # Proportional split (simplified)
                        ratio = tokens_into_overage / total_tokens if total_tokens > 0 else 0
                        overage_input = int(input_tokens * ratio)
                        overage_output = int(output_tokens * ratio)

                    # Calculate cost
                    input_cost_per_1k = getattr(plan, "llm_input_cost_per_1k_cents", 30)
                    output_cost_per_1k = getattr(plan, "llm_output_cost_per_1k_cents", 60)

                    overage_cost = (
                        (overage_input * input_cost_per_1k // 1000) +
                        (overage_output * output_cost_per_1k // 1000)
                    )

                    developer.llm_overage_cost_cents = (
                        (developer.llm_overage_cost_cents or 0) + overage_cost
                    )

        await self.db.flush()

        return {
            "tokens_used": total_tokens,
            "total_this_month": developer.llm_tokens_used_this_month,
            "free_tokens": free_tokens,
            "is_overage": is_overage,
            "overage_cost_cents": overage_cost,
            "total_overage_cost_cents": developer.llm_overage_cost_cents or 0,
        }

    async def check_token_limit(
        self,
        developer_id: str,
        estimated_tokens: int = 0,
    ) -> dict[str, Any]:
        """Check if the developer can use more tokens.

        Returns dict with allowed status and details.
        """
        developer = await self.get_developer_with_plan(developer_id)
        if not developer:
            return {"allowed": False, "reason": "Developer not found"}

        plan = await self.get_plan(developer_id)
        await self._maybe_reset_monthly_tokens(developer)

        free_tokens = getattr(plan, "free_llm_tokens_per_month", 100000)
        enable_overage = getattr(plan, "enable_overage_billing", True)

        # Unlimited plan
        if free_tokens == -1:
            return {"allowed": True, "reason": None, "unlimited": True}

        tokens_used = developer.llm_tokens_used_this_month or 0
        tokens_remaining = max(0, free_tokens - tokens_used)

        # If overage is enabled, always allow
        if enable_overage:
            return {
                "allowed": True,
                "reason": None,
                "tokens_remaining_free": tokens_remaining,
                "will_incur_overage": tokens_used + estimated_tokens > free_tokens,
            }

        # If overage not enabled, check limit
        if tokens_used >= free_tokens:
            return {
                "allowed": False,
                "reason": f"Monthly token limit reached ({free_tokens:,} tokens). Upgrade your plan to continue.",
                "tokens_remaining_free": 0,
            }

        return {
            "allowed": True,
            "reason": None,
            "tokens_remaining_free": tokens_remaining,
        }

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

        plan = await self.get_plan(developer_id)
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
