#!/usr/bin/env python3
"""Script to upgrade a workspace to a premium plan.

Usage:
    python scripts/upgrade_workspace.py <workspace_slug_or_id> [plan_tier]

Examples:
    python scripts/upgrade_workspace.py my-workspace pro
    python scripts/upgrade_workspace.py my-workspace enterprise
    python scripts/upgrade_workspace.py 123e4567-e89b-12d3-a456-426614174000 pro
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from devograph.models.workspace import Workspace
from devograph.models.plan import Plan, PlanTier


async def get_db_url():
    """Get database URL from environment."""
    import os
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")

    db_url = os.getenv("DATABASE_URL", "")
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return db_url


def is_valid_uuid(val: str) -> bool:
    """Check if a string is a valid UUID."""
    import re
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(val))


async def upgrade_workspace(workspace_identifier: str, plan_tier: str = "enterprise"):
    """Upgrade a workspace to a specified plan."""
    db_url = await get_db_url()
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Find the workspace by slug or ID
        if is_valid_uuid(workspace_identifier):
            stmt = select(Workspace).where(Workspace.id == workspace_identifier)
        else:
            stmt = select(Workspace).where(Workspace.slug == workspace_identifier)
        result = await session.execute(stmt)
        workspace = result.scalar_one_or_none()

        if not workspace:
            print(f"Workspace not found: {workspace_identifier}")
            print("\nAvailable workspaces:")
            stmt = select(Workspace).where(Workspace.is_active == True)
            result = await session.execute(stmt)
            workspaces = result.scalars().all()
            for ws in workspaces:
                current_plan = "free" if not ws.plan_id else "has plan"
                print(f"  - {ws.slug} (ID: {ws.id}) [{current_plan}]")
            return False

        # Find the plan
        stmt = select(Plan).where(Plan.tier == plan_tier, Plan.is_active == True)
        result = await session.execute(stmt)
        plan = result.scalar_one_or_none()

        if not plan:
            print(f"Plan not found: {plan_tier}")
            print("\nAvailable plans:")
            stmt = select(Plan).where(Plan.is_active == True)
            result = await session.execute(stmt)
            plans = result.scalars().all()
            for p in plans:
                print(f"  - {p.tier}: {p.name} (team_features={p.enable_team_features})")
            return False

        # Update workspace
        workspace.plan_id = plan.id
        await session.commit()

        print(f"Successfully upgraded workspace '{workspace.name}' to {plan.name} plan!")
        print(f"\nPlan features:")
        print(f"  - Team features: {plan.enable_team_features}")
        print(f"  - Advanced analytics: {plan.enable_advanced_analytics}")
        print(f"  - Exports: {plan.enable_exports}")
        print(f"  - Webhooks: {plan.enable_webhooks}")
        print(f"  - Real-time sync: {plan.enable_real_time_sync}")
        print(f"  - Max repos: {plan.max_repos}")
        print(f"  - LLM requests/day: {plan.llm_requests_per_day}")
        return True

    await engine.dispose()


async def list_workspaces():
    """List all workspaces and their current plans."""
    db_url = await get_db_url()
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        stmt = select(Workspace).where(Workspace.is_active == True)
        result = await session.execute(stmt)
        workspaces = result.scalars().all()

        print("Workspaces:")
        for ws in workspaces:
            if ws.plan_id:
                plan_stmt = select(Plan).where(Plan.id == ws.plan_id)
                plan_result = await session.execute(plan_stmt)
                plan = plan_result.scalar_one_or_none()
                plan_name = plan.name if plan else "Unknown"
            else:
                plan_name = "Free (no plan)"
            print(f"  - {ws.slug}: {ws.name} [{plan_name}]")

    await engine.dispose()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nListing available workspaces...\n")
        asyncio.run(list_workspaces())
        return

    workspace_identifier = sys.argv[1]
    plan_tier = sys.argv[2] if len(sys.argv) > 2 else "enterprise"

    # Validate plan tier
    valid_tiers = [t.value for t in PlanTier]
    if plan_tier not in valid_tiers:
        print(f"Invalid plan tier: {plan_tier}")
        print(f"Valid options: {', '.join(valid_tiers)}")
        return

    asyncio.run(upgrade_workspace(workspace_identifier, plan_tier))


if __name__ == "__main__":
    main()
