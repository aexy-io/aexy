#!/usr/bin/env python3
"""Fix workspace and subscription plan associations.

Finds active subscriptions and ensures the associated workspace plan_id is set.
This handles cases where subscriptions were created before the webhook handler
properly set workspace.plan_id.

Usage:
    python scripts/fix_subscription_plans.py          # Dry-run (show what would change)
    python scripts/fix_subscription_plans.py --apply   # Apply fixes
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from aexy.models.billing import CustomerBilling, Subscription
from aexy.models.developer import Developer
from aexy.models.plan import Plan
from aexy.models.workspace import Workspace, WorkspaceMember


async def get_db_url():
    """Get database URL from environment."""
    import os
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")

    db_url = os.getenv("DATABASE_URL", "")
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return db_url


async def fix_subscription_plans(apply: bool = False):
    """Fix workspace plan associations from existing subscriptions."""
    db_url = await get_db_url()
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Fix subscriptions with null plan_id by matching stripe_price_id
        print("=== Checking subscriptions with null plan_id ===")
        stmt = select(Subscription).where(
            Subscription.plan_id.is_(None),
            Subscription.status.in_(["active", "trialing"]),
        )
        result = await session.execute(stmt)
        subs_without_plan = result.scalars().all()

        for sub in subs_without_plan:
            if sub.stripe_price_id:
                plan_stmt = select(Plan).where(
                    or_(
                        Plan.stripe_price_id == sub.stripe_price_id,
                        Plan.stripe_yearly_price_id == sub.stripe_price_id,
                    ),
                    Plan.is_active == True,
                )
                plan_result = await session.execute(plan_stmt)
                plan = plan_result.scalar_one_or_none()

                if plan:
                    print(f"  Subscription {sub.id}: stripe_price_id={sub.stripe_price_id} -> plan '{plan.name}' ({plan.tier})")
                    if apply:
                        sub.plan_id = plan.id
                        if not sub.stripe_product_id and plan.stripe_product_id:
                            sub.stripe_product_id = plan.stripe_product_id
                else:
                    print(f"  Subscription {sub.id}: stripe_price_id={sub.stripe_price_id} -> NO MATCHING PLAN")
            else:
                print(f"  Subscription {sub.id}: no stripe_price_id, skipping")

        # 2. Fix developer plan_id from their active subscription
        print("\n=== Checking developers with outdated plan_id ===")
        stmt = select(Subscription).where(
            Subscription.plan_id.isnot(None),
            Subscription.status.in_(["active", "trialing"]),
        )
        result = await session.execute(stmt)
        active_subs = result.scalars().all()

        for sub in active_subs:
            # Get the developer for this subscription
            cb_stmt = select(CustomerBilling).where(CustomerBilling.id == sub.customer_id)
            cb_result = await session.execute(cb_stmt)
            customer = cb_result.scalar_one_or_none()
            if not customer:
                continue

            dev_stmt = select(Developer).where(Developer.id == customer.developer_id)
            dev_result = await session.execute(dev_stmt)
            developer = dev_result.scalar_one_or_none()
            if not developer:
                continue

            if developer.plan_id != sub.plan_id:
                plan_stmt = select(Plan).where(Plan.id == sub.plan_id)
                plan_result = await session.execute(plan_stmt)
                plan = plan_result.scalar_one_or_none()
                plan_name = plan.name if plan else "unknown"

                print(f"  Developer '{developer.name}' ({developer.id}): plan_id {developer.plan_id} -> {sub.plan_id} ({plan_name})")
                if apply:
                    developer.plan_id = sub.plan_id

        # 3. Fix workspace plan_id from owner's subscription
        print("\n=== Checking workspaces with missing plan_id ===")
        ws_stmt = select(Workspace).where(Workspace.is_active == True)
        ws_result = await session.execute(ws_stmt)
        workspaces = ws_result.scalars().all()

        for workspace in workspaces:
            # Get the owner's subscription plan
            owner_member_stmt = select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.role == "owner",
                WorkspaceMember.status == "active",
            )
            owner_result = await session.execute(owner_member_stmt)
            owner_member = owner_result.scalar_one_or_none()
            if not owner_member:
                continue

            # Find the owner's active subscription
            owner_sub_stmt = (
                select(Subscription)
                .join(CustomerBilling, CustomerBilling.id == Subscription.customer_id)
                .where(
                    CustomerBilling.developer_id == owner_member.developer_id,
                    Subscription.status.in_(["active", "trialing"]),
                    Subscription.plan_id.isnot(None),
                )
            )
            sub_result = await session.execute(owner_sub_stmt)
            owner_sub = sub_result.scalar_one_or_none()

            if not owner_sub:
                if not workspace.plan_id:
                    print(f"  Workspace '{workspace.name}' ({workspace.slug}): no owner subscription found, skipping")
                continue

            plan_stmt = select(Plan).where(Plan.id == owner_sub.plan_id)
            plan_result = await session.execute(plan_stmt)
            plan = plan_result.scalar_one_or_none()
            plan_name = plan.name if plan else "unknown"

            if workspace.plan_id != owner_sub.plan_id:
                current_plan_name = "none"
                if workspace.plan_id:
                    cp_stmt = select(Plan).where(Plan.id == workspace.plan_id)
                    cp_result = await session.execute(cp_stmt)
                    cp = cp_result.scalar_one_or_none()
                    current_plan_name = cp.name if cp else "unknown"

                print(f"  Workspace '{workspace.name}' ({workspace.slug}): plan '{current_plan_name}' -> '{plan_name}'")
                if apply:
                    workspace.plan_id = owner_sub.plan_id
            else:
                print(f"  Workspace '{workspace.name}' ({workspace.slug}): already on '{plan_name}' - OK")

        if apply:
            await session.commit()
            print("\n=== Changes applied successfully ===")
        else:
            print("\n=== DRY RUN - no changes made. Run with --apply to apply fixes ===")

    await engine.dispose()


def main():
    apply = "--apply" in sys.argv
    asyncio.run(fix_subscription_plans(apply=apply))


if __name__ == "__main__":
    main()
