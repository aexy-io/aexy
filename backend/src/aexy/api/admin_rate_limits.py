"""Admin API endpoints for managing workspace rate limit overrides."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.llm.gateway import get_llm_gateway
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.rate_limits import (
    EffectiveRateLimitsResponse,
    RateLimitStatusResponse,
    SetWorkspaceRateLimitOverridesRequest,
    WorkspaceRateLimitOverrides,
)
from aexy.services.llm_rate_limiter import get_llm_rate_limiter
from aexy.services.rate_limit_config_service import RateLimitConfigService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/workspaces", tags=["admin-rate-limits"])


async def _check_workspace_admin(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
) -> Workspace:
    """Check if user has admin access to workspace.

    Args:
        workspace_id: The workspace ID.
        current_user: The current authenticated developer.
        db: Database session.

    Returns:
        The workspace if access is granted.

    Raises:
        HTTPException: If workspace not found or user lacks permission.
    """
    # Get workspace
    stmt = select(Workspace).where(Workspace.id == workspace_id)
    result = await db.execute(stmt)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Check if user is owner
    if workspace.owner_id == current_user.id:
        return workspace

    # Check if user is admin member
    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.developer_id == current_user.id,
        WorkspaceMember.status == "active",
    )
    result = await db.execute(stmt)
    member = result.scalar_one_or_none()

    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required to manage rate limits",
        )

    return workspace


@router.get("/{workspace_id}/rate-limits", response_model=RateLimitStatusResponse)
async def get_workspace_rate_limits(
    workspace_id: str,
    provider: str = "gemini",
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> RateLimitStatusResponse:
    """Get current rate limit status for a workspace.

    Returns effective limits after applying plan and workspace overrides,
    along with current usage.

    Args:
        workspace_id: The workspace ID.
        provider: LLM provider name (default: gemini).
        current_user: The authenticated developer.
        db: Database session.

    Returns:
        Rate limit status including effective limits, usage, and overrides.
    """
    workspace = await _check_workspace_admin(workspace_id, current_user, db)

    config_service = RateLimitConfigService(db)
    rate_limiter = get_llm_rate_limiter()

    # Get effective limits
    effective_limits = await config_service.get_effective_limits(
        provider=provider,
        workspace_id=workspace_id,
    )

    # Get current usage
    usage = await rate_limiter.get_workspace_usage(provider, workspace_id)

    # Calculate remaining
    remaining_day = (
        effective_limits.requests_per_day - usage["usage_day"]
        if effective_limits.requests_per_day > 0
        else -1
    )
    remaining_minute = (
        effective_limits.requests_per_minute - usage["usage_minute"]
        if effective_limits.requests_per_minute > 0
        else -1
    )

    # Get overrides
    overrides = await config_service.get_workspace_overrides(workspace_id)

    # Get plan info
    plan_name = None
    plan_tier = None
    if workspace.plan:
        plan_name = workspace.plan.name
        plan_tier = workspace.plan.tier

    return RateLimitStatusResponse(
        workspace_id=workspace_id,
        workspace_name=workspace.name,
        plan_name=plan_name,
        plan_tier=plan_tier,
        has_overrides=overrides is not None,
        effective_limits=EffectiveRateLimitsResponse(
            requests_per_minute=effective_limits.requests_per_minute,
            requests_per_day=effective_limits.requests_per_day,
            tokens_per_minute=effective_limits.tokens_per_minute,
            provider=effective_limits.provider,
            source=effective_limits.source,
            usage_today=usage["usage_day"],
            remaining_today=max(0, remaining_day) if remaining_day >= 0 else -1,
            usage_this_minute=usage["usage_minute"],
            remaining_this_minute=max(0, remaining_minute) if remaining_minute >= 0 else -1,
        ),
        overrides=overrides,
    )


@router.put("/{workspace_id}/rate-limits", response_model=RateLimitStatusResponse)
async def set_workspace_rate_limits(
    workspace_id: str,
    data: SetWorkspaceRateLimitOverridesRequest,
    provider: str = "gemini",
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> RateLimitStatusResponse:
    """Set rate limit overrides for a workspace.

    Workspace overrides can increase limits from plan defaults but cannot
    exceed global provider limits (API constraints).

    Args:
        workspace_id: The workspace ID.
        data: The rate limit overrides to set.
        provider: LLM provider name for response (default: gemini).
        current_user: The authenticated developer.
        db: Database session.

    Returns:
        Updated rate limit status.
    """
    workspace = await _check_workspace_admin(workspace_id, current_user, db)

    config_service = RateLimitConfigService(db)

    # Convert request to overrides model
    overrides = WorkspaceRateLimitOverrides(
        llm_requests_per_day=data.llm_requests_per_day,
        llm_requests_per_minute=data.llm_requests_per_minute,
        llm_tokens_per_minute=data.llm_tokens_per_minute,
        provider_overrides=data.provider_overrides,
    )

    # Set overrides
    await config_service.set_workspace_overrides(workspace_id, overrides)

    logger.info(
        f"Set rate limit overrides for workspace {workspace_id} by user {current_user.id}"
    )

    # Return updated status
    return await get_workspace_rate_limits(
        workspace_id=workspace_id,
        provider=provider,
        current_user=current_user,
        db=db,
    )


@router.delete("/{workspace_id}/rate-limits")
async def clear_workspace_rate_limits(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Clear all rate limit overrides for a workspace.

    After clearing, the workspace will use plan-based limits only.

    Args:
        workspace_id: The workspace ID.
        current_user: The authenticated developer.
        db: Database session.

    Returns:
        Confirmation message.
    """
    await _check_workspace_admin(workspace_id, current_user, db)

    config_service = RateLimitConfigService(db)
    await config_service.clear_workspace_overrides(workspace_id)

    logger.info(
        f"Cleared rate limit overrides for workspace {workspace_id} by user {current_user.id}"
    )

    return {
        "status": "success",
        "message": f"Rate limit overrides cleared for workspace {workspace_id}",
    }


@router.get("/{workspace_id}/rate-limits/usage")
async def get_workspace_rate_limit_usage(
    workspace_id: str,
    provider: str = "gemini",
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get current rate limit usage for a workspace.

    Args:
        workspace_id: The workspace ID.
        provider: LLM provider name (default: gemini).
        current_user: The authenticated developer.
        db: Database session.

    Returns:
        Current usage counts.
    """
    await _check_workspace_admin(workspace_id, current_user, db)

    rate_limiter = get_llm_rate_limiter()
    usage = await rate_limiter.get_workspace_usage(provider, workspace_id)

    return {
        "workspace_id": workspace_id,
        "provider": provider,
        "usage_this_minute": usage["usage_minute"],
        "usage_today": usage["usage_day"],
        "tokens_this_minute": usage["tokens_minute"],
    }


@router.post("/{workspace_id}/rate-limits/reset")
async def reset_workspace_rate_limits(
    workspace_id: str,
    provider: str = "gemini",
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Reset rate limit counters for a workspace (for testing/support).

    This clears the usage counters but not the overrides configuration.

    Args:
        workspace_id: The workspace ID.
        provider: LLM provider name (default: gemini).
        current_user: The authenticated developer.
        db: Database session.

    Returns:
        Confirmation message.
    """
    await _check_workspace_admin(workspace_id, current_user, db)

    rate_limiter = get_llm_rate_limiter()
    await rate_limiter.clear_provider_limits(provider, workspace_id=workspace_id)

    logger.info(
        f"Reset rate limit counters for workspace {workspace_id}, "
        f"provider {provider} by user {current_user.id}"
    )

    return {
        "status": "success",
        "message": f"Rate limit counters reset for workspace {workspace_id}, provider {provider}",
    }
