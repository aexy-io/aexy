"""Service for resolving effective rate limits based on plan and workspace overrides."""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.plan import Plan
from aexy.models.workspace import Workspace
from aexy.schemas.rate_limits import (
    EffectiveRateLimits,
    ProviderRateLimitOverride,
    WorkspaceRateLimitOverrides,
)

logger = logging.getLogger(__name__)


class RateLimitConfigService:
    """Service to resolve effective rate limits using the hierarchy:

    Global Provider Limits (API constraints)
        ↓
    Plan-Based Limits (subscription tier)
        ↓
    Workspace Overrides (custom limits for specific organizations)
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._settings = get_settings()

    async def get_effective_limits(
        self,
        provider: str,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> EffectiveRateLimits:
        """Resolve effective rate limits applying the hierarchy.

        Args:
            provider: LLM provider name (claude, gemini, ollama).
            workspace_id: Optional workspace ID for workspace-level limits.
            developer_id: Optional developer ID (for future per-developer limits).

        Returns:
            EffectiveRateLimits with resolved limits and source.
        """
        # Start with global provider limits from settings
        global_limits = self._settings.llm.get_provider_rate_limits(provider)
        effective = EffectiveRateLimits(
            requests_per_minute=global_limits.requests_per_minute,
            requests_per_day=global_limits.requests_per_day,
            tokens_per_minute=global_limits.tokens_per_minute,
            provider=provider,
            source="global",
        )

        # If no workspace, return global limits
        if not workspace_id:
            return effective

        # Get workspace with plan
        workspace = await self._get_workspace_with_plan(workspace_id)
        if not workspace:
            return effective

        # Apply plan-based limits if available
        if workspace.plan:
            plan = workspace.plan
            effective = self._apply_plan_limits(effective, plan, provider)

        # Apply workspace overrides if available
        overrides = await self.get_workspace_overrides(workspace_id)
        if overrides:
            effective = self._apply_workspace_overrides(effective, overrides, provider)

        return effective

    async def _get_workspace_with_plan(self, workspace_id: str) -> Workspace | None:
        """Get workspace with its plan loaded."""
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    def _apply_plan_limits(
        self,
        current: EffectiveRateLimits,
        plan: Plan,
        provider: str,
    ) -> EffectiveRateLimits:
        """Apply plan-based limits, respecting global provider limits as ceiling.

        Plan limits cannot exceed global provider limits (API constraints).
        """
        # Get plan limits
        plan_rpm = plan.llm_requests_per_minute
        plan_rpd = plan.llm_requests_per_day
        plan_tpm = plan.llm_tokens_per_minute

        # Apply plan limits, but don't exceed global limits
        requests_per_minute = self._min_limit(current.requests_per_minute, plan_rpm)
        requests_per_day = self._min_limit(current.requests_per_day, plan_rpd)
        tokens_per_minute = self._min_limit(current.tokens_per_minute, plan_tpm)

        return EffectiveRateLimits(
            requests_per_minute=requests_per_minute,
            requests_per_day=requests_per_day,
            tokens_per_minute=tokens_per_minute,
            provider=provider,
            source="plan",
        )

    def _apply_workspace_overrides(
        self,
        current: EffectiveRateLimits,
        overrides: WorkspaceRateLimitOverrides,
        provider: str,
    ) -> EffectiveRateLimits:
        """Apply workspace overrides.

        Workspace overrides can increase limits from plan defaults but cannot
        exceed global provider limits (API constraints).
        """
        # Get global provider limits as ceiling
        global_limits = self._settings.llm.get_provider_rate_limits(provider)

        # Start with current limits
        requests_per_minute = current.requests_per_minute
        requests_per_day = current.requests_per_day
        tokens_per_minute = current.tokens_per_minute

        # Apply general workspace overrides
        if overrides.llm_requests_per_minute is not None:
            requests_per_minute = self._min_limit(
                global_limits.requests_per_minute,
                overrides.llm_requests_per_minute,
            )

        if overrides.llm_requests_per_day is not None:
            requests_per_day = self._min_limit(
                global_limits.requests_per_day,
                overrides.llm_requests_per_day,
            )

        if overrides.llm_tokens_per_minute is not None:
            tokens_per_minute = self._min_limit(
                global_limits.tokens_per_minute,
                overrides.llm_tokens_per_minute,
            )

        # Apply provider-specific overrides if present
        if overrides.provider_overrides and provider in overrides.provider_overrides:
            provider_override = overrides.provider_overrides[provider]

            if provider_override.requests_per_minute is not None:
                requests_per_minute = self._min_limit(
                    global_limits.requests_per_minute,
                    provider_override.requests_per_minute,
                )

            if provider_override.requests_per_day is not None:
                requests_per_day = self._min_limit(
                    global_limits.requests_per_day,
                    provider_override.requests_per_day,
                )

            if provider_override.tokens_per_minute is not None:
                tokens_per_minute = self._min_limit(
                    global_limits.tokens_per_minute,
                    provider_override.tokens_per_minute,
                )

        return EffectiveRateLimits(
            requests_per_minute=requests_per_minute,
            requests_per_day=requests_per_day,
            tokens_per_minute=tokens_per_minute,
            provider=provider,
            source="workspace_override",
        )

    @staticmethod
    def _min_limit(limit_a: int, limit_b: int) -> int:
        """Return the more restrictive limit, treating -1 as unlimited.

        If both are -1, returns -1.
        If one is -1, returns the other (the actual limit).
        Otherwise returns the minimum of the two.
        """
        if limit_a == -1 and limit_b == -1:
            return -1
        if limit_a == -1:
            return limit_b
        if limit_b == -1:
            return limit_a
        return min(limit_a, limit_b)

    async def get_workspace_overrides(
        self, workspace_id: str
    ) -> WorkspaceRateLimitOverrides | None:
        """Get rate limit overrides from workspace settings.

        Args:
            workspace_id: The workspace ID.

        Returns:
            WorkspaceRateLimitOverrides if overrides exist, None otherwise.
        """
        stmt = select(Workspace.settings).where(Workspace.id == workspace_id)
        result = await self.db.execute(stmt)
        settings = result.scalar_one_or_none()

        if not settings:
            return None

        overrides_data = settings.get("rate_limit_overrides")
        if not overrides_data:
            return None

        # Parse provider overrides if present
        provider_overrides = None
        if "provider_overrides" in overrides_data:
            provider_overrides = {
                k: ProviderRateLimitOverride(**v)
                for k, v in overrides_data["provider_overrides"].items()
            }

        return WorkspaceRateLimitOverrides(
            llm_requests_per_day=overrides_data.get("llm_requests_per_day"),
            llm_requests_per_minute=overrides_data.get("llm_requests_per_minute"),
            llm_tokens_per_minute=overrides_data.get("llm_tokens_per_minute"),
            provider_overrides=provider_overrides,
        )

    async def set_workspace_overrides(
        self,
        workspace_id: str,
        overrides: WorkspaceRateLimitOverrides,
    ) -> None:
        """Set rate limit overrides for a workspace.

        Stores overrides in Workspace.settings['rate_limit_overrides'].

        Args:
            workspace_id: The workspace ID.
            overrides: The rate limit overrides to set.
        """
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await self.db.execute(stmt)
        workspace = result.scalar_one_or_none()

        if not workspace:
            raise ValueError(f"Workspace {workspace_id} not found")

        # Get current settings or initialize (create a new dict to ensure change detection)
        settings = dict(workspace.settings or {})

        # Convert overrides to dict for storage
        overrides_dict: dict[str, Any] = {}

        if overrides.llm_requests_per_day is not None:
            overrides_dict["llm_requests_per_day"] = overrides.llm_requests_per_day

        if overrides.llm_requests_per_minute is not None:
            overrides_dict["llm_requests_per_minute"] = overrides.llm_requests_per_minute

        if overrides.llm_tokens_per_minute is not None:
            overrides_dict["llm_tokens_per_minute"] = overrides.llm_tokens_per_minute

        if overrides.provider_overrides:
            overrides_dict["provider_overrides"] = {
                k: v.model_dump(exclude_none=True)
                for k, v in overrides.provider_overrides.items()
            }

        # Update settings
        settings["rate_limit_overrides"] = overrides_dict
        workspace.settings = settings

        await self.db.commit()
        await self.db.refresh(workspace)
        logger.info(f"Set rate limit overrides for workspace {workspace_id}")

    async def clear_workspace_overrides(self, workspace_id: str) -> None:
        """Clear all rate limit overrides for a workspace.

        Args:
            workspace_id: The workspace ID.
        """
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await self.db.execute(stmt)
        workspace = result.scalar_one_or_none()

        if not workspace:
            raise ValueError(f"Workspace {workspace_id} not found")

        # Get current settings
        settings = dict(workspace.settings or {})

        # Remove rate limit overrides
        if "rate_limit_overrides" in settings:
            del settings["rate_limit_overrides"]
            # Create a new dict to trigger SQLAlchemy change detection
            workspace.settings = settings
            await self.db.commit()
            await self.db.refresh(workspace)
            logger.info(f"Cleared rate limit overrides for workspace {workspace_id}")

    async def get_plan_limits(self, plan_id: str | None) -> dict[str, int] | None:
        """Get rate limits from a plan.

        Args:
            plan_id: The plan ID.

        Returns:
            Dict with rate limits or None if plan not found.
        """
        if not plan_id:
            return None

        stmt = select(Plan).where(Plan.id == plan_id)
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()

        if not plan:
            return None

        return {
            "llm_requests_per_day": plan.llm_requests_per_day,
            "llm_requests_per_minute": plan.llm_requests_per_minute,
            "llm_tokens_per_minute": plan.llm_tokens_per_minute,
        }
