#!/usr/bin/env python3
"""
Script to set up Stripe products and prices for Aexy.

This script will:
1. Create products in Stripe for each plan tier
2. Create monthly and yearly prices for each product
3. Update the database plans with the Stripe IDs

Prerequisites:
1. Set STRIPE_SECRET_KEY in your .env file
2. Run database migrations first

Usage:
    cd backend
    source .venv/bin/activate
    python scripts/setup_stripe.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import stripe
from dotenv import load_dotenv
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


# Load environment
load_dotenv(Path(__file__).parent.parent / ".env")


# Stripe API key
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

if not stripe.api_key or stripe.api_key.startswith("sk_test_your"):
    print("ERROR: Please set a valid STRIPE_SECRET_KEY in your .env file")
    print("Get your keys from: https://dashboard.stripe.com/apikeys")
    sys.exit(1)


# Plan definitions
PLANS = [
    {
        "name": "Pro",
        "tier": "pro",
        "description": "For professional developers and growing teams",
        "monthly_price_cents": 2900,  # $29/month
        "yearly_price_cents": 29000,  # $290/year (~17% discount)
        "features": [
            "Up to 20 repositories",
            "1 year sync history",
            "500 AI requests/day",
            "Real-time sync",
            "Advanced analytics",
            "Data exports",
            "Webhooks",
            "Priority support",
        ],
    },
    {
        "name": "Enterprise",
        "tier": "enterprise",
        "description": "For large teams and organizations",
        "monthly_price_cents": 9900,  # $99/month
        "yearly_price_cents": 99000,  # $990/year
        "features": [
            "Unlimited repositories",
            "Unlimited sync history",
            "Unlimited AI requests",
            "Real-time sync",
            "Advanced analytics",
            "Team features",
            "Data exports",
            "Webhooks",
            "Dedicated support",
            "Custom integrations",
        ],
    },
]


def create_stripe_products():
    """Create Stripe products and prices."""
    results = {}

    for plan in PLANS:
        print(f"\n{'='*50}")
        print(f"Setting up {plan['name']} plan...")
        print(f"{'='*50}")

        # Check if product already exists
        existing_products = stripe.Product.list(limit=100)
        product = None
        for p in existing_products.data:
            if p.metadata.get("tier") == plan["tier"]:
                product = p
                print(f"Found existing product: {product.id}")
                break

        # Create product if not exists
        if not product:
            product = stripe.Product.create(
                name=f"Aexy {plan['name']}",
                description=plan["description"],
                metadata={
                    "tier": plan["tier"],
                },
                default_price_data={
                    "currency": "usd",
                    "unit_amount": plan["monthly_price_cents"],
                    "recurring": {"interval": "month"},
                },
            )
            print(f"Created product: {product.id}")

        # Get or create monthly price
        monthly_price = None
        prices = stripe.Price.list(product=product.id, active=True)
        for price in prices.data:
            if price.recurring and price.recurring.interval == "month":
                monthly_price = price
                break

        if not monthly_price:
            monthly_price = stripe.Price.create(
                product=product.id,
                currency="usd",
                unit_amount=plan["monthly_price_cents"],
                recurring={"interval": "month"},
                metadata={"tier": plan["tier"], "billing_period": "monthly"},
            )
            print(f"Created monthly price: {monthly_price.id}")
        else:
            print(f"Found existing monthly price: {monthly_price.id}")

        # Get or create yearly price
        yearly_price = None
        for price in prices.data:
            if price.recurring and price.recurring.interval == "year":
                yearly_price = price
                break

        if not yearly_price:
            yearly_price = stripe.Price.create(
                product=product.id,
                currency="usd",
                unit_amount=plan["yearly_price_cents"],
                recurring={"interval": "year"},
                metadata={"tier": plan["tier"], "billing_period": "yearly"},
            )
            print(f"Created yearly price: {yearly_price.id}")
        else:
            print(f"Found existing yearly price: {yearly_price.id}")

        results[plan["tier"]] = {
            "product_id": product.id,
            "monthly_price_id": monthly_price.id,
            "yearly_price_id": yearly_price.id,
        }

    return results


async def update_database(stripe_data: dict):
    """Seed missing plans and update them with Stripe IDs."""
    from aexy.models.plan import DEFAULT_PLANS

    db_url = os.getenv("DATABASE_URL", "")
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url, echo=False)

    async with engine.begin() as conn:
        # Check if Stripe columns exist, add them if not
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'plans' AND column_name = 'stripe_product_id'
        """))
        if not result.fetchone():
            print("Adding Stripe columns to plans table...")
            await conn.execute(text("""
                ALTER TABLE plans
                ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS stripe_yearly_price_id VARCHAR(255)
            """))

        # Seed missing plans from DEFAULT_PLANS
        for plan_data in DEFAULT_PLANS:
            tier = plan_data["tier"]
            result = await conn.execute(
                text("SELECT id FROM plans WHERE tier = :tier"),
                {"tier": tier},
            )
            if not result.fetchone():
                from uuid import uuid4
                plan_id = str(uuid4())
                print(f"Inserting missing '{tier}' plan...")
                await conn.execute(
                    text("""
                        INSERT INTO plans (
                            id, name, tier, description,
                            max_repos, max_commits_per_repo, max_prs_per_repo, sync_history_days,
                            llm_requests_per_day, llm_requests_per_minute, llm_tokens_per_minute,
                            llm_provider_access,
                            free_llm_tokens_per_month,
                            llm_input_cost_per_1k_cents, llm_output_cost_per_1k_cents,
                            enable_overage_billing,
                            enable_real_time_sync, enable_advanced_analytics,
                            enable_exports, enable_webhooks, enable_team_features,
                            price_monthly_cents, price_yearly_cents,
                            is_active
                        ) VALUES (
                            :id, :name, :tier, :description,
                            :max_repos, :max_commits_per_repo, :max_prs_per_repo, :sync_history_days,
                            :llm_requests_per_day, :llm_requests_per_minute, :llm_tokens_per_minute,
                            :llm_provider_access,
                            :free_llm_tokens_per_month,
                            :llm_input_cost_per_1k_cents, :llm_output_cost_per_1k_cents,
                            :enable_overage_billing,
                            :enable_real_time_sync, :enable_advanced_analytics,
                            :enable_exports, :enable_webhooks, :enable_team_features,
                            :price_monthly_cents, :price_yearly_cents,
                            true
                        )
                    """),
                    {
                        "id": plan_id,
                        **plan_data,
                    },
                )
                print(f"Inserted '{plan_data['name']}' plan (id: {plan_id})")
            else:
                print(f"Plan '{tier}' already exists, skipping insert")

        # Update plans with Stripe IDs
        for tier, data in stripe_data.items():
            print(f"\nUpdating {tier} plan with Stripe IDs...")
            await conn.execute(
                text("""
                    UPDATE plans SET
                        stripe_product_id = :product_id,
                        stripe_price_id = :monthly_price_id,
                        stripe_yearly_price_id = :yearly_price_id
                    WHERE tier = :tier
                """),
                {
                    "tier": tier,
                    "product_id": data["product_id"],
                    "monthly_price_id": data["monthly_price_id"],
                    "yearly_price_id": data["yearly_price_id"],
                },
            )
            print(f"Updated {tier} plan with Stripe IDs")

        # Verify all plans
        result = await conn.execute(text(
            "SELECT name, tier, stripe_product_id, price_monthly_cents FROM plans ORDER BY price_monthly_cents"
        ))
        rows = result.fetchall()
        print(f"\nAll plans in database ({len(rows)}):")
        for row in rows:
            print(f"  - {row[0]} ({row[1]}): stripe={row[2] or 'N/A'}, price=${row[3]/100:.0f}/mo")

    await engine.dispose()


def print_env_vars(stripe_data: dict):
    """Print environment variables to add to .env."""
    print("\n" + "=" * 60)
    print("Add these to your .env file:")
    print("=" * 60)

    for tier, data in stripe_data.items():
        tier_upper = tier.upper()
        print(f"STRIPE_{tier_upper}_PRODUCT_ID={data['product_id']}")
        print(f"STRIPE_{tier_upper}_MONTHLY_PRICE_ID={data['monthly_price_id']}")
        print(f"STRIPE_{tier_upper}_YEARLY_PRICE_ID={data['yearly_price_id']}")
        print()


def main():
    print("=" * 60)
    print("Aexy Stripe Setup")
    print("=" * 60)
    print(f"\nUsing Stripe API key: {stripe.api_key[:12]}...")

    # Create Stripe products and prices
    stripe_data = create_stripe_products()

    # Update database
    print("\n" + "=" * 60)
    print("Updating database...")
    print("=" * 60)
    asyncio.run(update_database(stripe_data))

    # Print env vars
    print_env_vars(stripe_data)

    print("\n" + "=" * 60)
    print("Setup complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Add the environment variables above to your .env file")
    print("2. Set up a webhook endpoint in Stripe Dashboard:")
    print("   URL: https://your-domain.com/api/v1/billing/webhook")
    print("   Events: customer.subscription.*, invoice.*, payment_intent.*")
    print("3. Add the webhook secret to STRIPE_WEBHOOK_SECRET in .env")


if __name__ == "__main__":
    main()
