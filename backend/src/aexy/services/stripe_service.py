"""Stripe integration service for subscription and billing management."""

import logging
from datetime import datetime
from typing import Any

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import settings
from aexy.models.billing import (
    CustomerBilling,
    Invoice,
    Subscription,
    SubscriptionStatus,
)
from aexy.models.developer import Developer
from aexy.models.plan import Plan, PlanTier

logger = logging.getLogger(__name__)


class StripeService:
    """Service for managing Stripe customers, subscriptions, and billing."""

    def __init__(self, db: AsyncSession):
        self.db = db
        stripe.api_key = settings.stripe_secret_key

    async def get_or_create_customer(
        self,
        developer_id: str,
    ) -> CustomerBilling:
        """Get existing customer or create new Stripe customer."""
        # Check for existing customer billing
        stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == developer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if customer_billing and customer_billing.stripe_customer_id:
            return customer_billing

        # Get developer info for creating customer
        stmt = select(Developer).where(Developer.id == developer_id)
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        # Create Stripe customer
        stripe_customer = stripe.Customer.create(
            email=developer.email,
            name=developer.name,
            metadata={
                "developer_id": developer_id,
            },
        )

        if customer_billing:
            # Update existing record with Stripe customer ID
            customer_billing.stripe_customer_id = stripe_customer.id
            customer_billing.billing_email = developer.email
            customer_billing.billing_name = developer.name
        else:
            # Create new customer billing record
            customer_billing = CustomerBilling(
                developer_id=developer_id,
                stripe_customer_id=stripe_customer.id,
                billing_email=developer.email,
                billing_name=developer.name,
            )
            self.db.add(customer_billing)

        await self.db.commit()
        await self.db.refresh(customer_billing)

        logger.info(
            f"Created Stripe customer {stripe_customer.id} for developer {developer_id}"
        )

        return customer_billing

    async def create_subscription(
        self,
        developer_id: str,
        plan_tier: PlanTier,
        payment_method_id: str | None = None,
    ) -> Subscription:
        """Create a new subscription for a developer."""
        # Get or create customer
        customer_billing = await self.get_or_create_customer(developer_id)

        # Get the plan
        stmt = select(Plan).where(Plan.tier == plan_tier.value, Plan.is_active == True)
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()

        if not plan:
            raise ValueError(f"Plan with tier {plan_tier.value} not found")

        # Attach payment method if provided
        if payment_method_id:
            stripe.PaymentMethod.attach(
                payment_method_id,
                customer=customer_billing.stripe_customer_id,
            )
            stripe.Customer.modify(
                customer_billing.stripe_customer_id,
                invoice_settings={"default_payment_method": payment_method_id},
            )
            customer_billing.default_payment_method_id = payment_method_id

        # Create Stripe subscription with metered billing
        # The price ID should be configured in Stripe for metered usage
        stripe_sub = stripe.Subscription.create(
            customer=customer_billing.stripe_customer_id,
            items=[
                {
                    "price": plan.stripe_price_id,
                },
            ],
            payment_behavior="default_incomplete",
            payment_settings={
                "save_default_payment_method": "on_subscription",
            },
            expand=["latest_invoice.payment_intent"],
            metadata={
                "developer_id": developer_id,
                "plan_tier": plan_tier.value,
            },
        )

        # Get subscription item ID for usage reporting
        subscription_item_id = None
        if stripe_sub.items.data:
            subscription_item_id = stripe_sub.items.data[0].id

        # Create subscription record
        subscription = Subscription(
            customer_id=customer_billing.id,
            stripe_subscription_id=stripe_sub.id,
            stripe_price_id=plan.stripe_price_id or "",
            stripe_product_id=plan.stripe_product_id,
            status=stripe_sub.status,
            plan_id=plan.id,
            current_period_start=datetime.fromtimestamp(stripe_sub.current_period_start),
            current_period_end=datetime.fromtimestamp(stripe_sub.current_period_end),
            stripe_subscription_item_id=subscription_item_id,
        )

        if stripe_sub.trial_start:
            subscription.trial_start = datetime.fromtimestamp(stripe_sub.trial_start)
        if stripe_sub.trial_end:
            subscription.trial_end = datetime.fromtimestamp(stripe_sub.trial_end)

        self.db.add(subscription)

        # Update developer's plan
        stmt = select(Developer).where(Developer.id == developer_id)
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()
        if developer:
            developer.plan_id = plan.id

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(
            f"Created subscription {stripe_sub.id} for developer {developer_id}"
        )

        return subscription

    async def cancel_subscription(
        self,
        subscription_id: str,
        cancel_immediately: bool = False,
    ) -> Subscription:
        """Cancel a subscription."""
        stmt = select(Subscription).where(Subscription.id == subscription_id)
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError(f"Subscription {subscription_id} not found")

        if cancel_immediately:
            stripe.Subscription.cancel(subscription.stripe_subscription_id)
            subscription.status = SubscriptionStatus.CANCELED.value
            subscription.canceled_at = datetime.utcnow()
        else:
            # Cancel at period end
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=True,
            )
            subscription.cancel_at = subscription.current_period_end

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(f"Cancelled subscription {subscription.stripe_subscription_id}")

        return subscription

    async def change_plan(
        self,
        subscription_id: str,
        new_plan_tier: PlanTier,
    ) -> Subscription:
        """Change subscription to a different plan."""
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id)
            .options(selectinload(Subscription.customer))
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError(f"Subscription {subscription_id} not found")

        # Get the new plan
        stmt = select(Plan).where(
            Plan.tier == new_plan_tier.value, Plan.is_active == True
        )
        result = await self.db.execute(stmt)
        new_plan = result.scalar_one_or_none()

        if not new_plan:
            raise ValueError(f"Plan with tier {new_plan_tier.value} not found")

        # Update Stripe subscription
        stripe_sub = stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            items=[
                {
                    "id": subscription.stripe_subscription_item_id,
                    "price": new_plan.stripe_price_id,
                }
            ],
            proration_behavior="create_prorations",
            metadata={
                "plan_tier": new_plan_tier.value,
            },
        )

        # Update subscription record
        subscription.stripe_price_id = new_plan.stripe_price_id or ""
        subscription.stripe_product_id = new_plan.stripe_product_id
        subscription.plan_id = new_plan.id
        subscription.status = stripe_sub.status

        # Update developer's plan
        stmt = select(Developer).where(
            Developer.id == subscription.customer.developer_id
        )
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()
        if developer:
            developer.plan_id = new_plan.id

        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(
            f"Changed subscription {subscription.stripe_subscription_id} to plan {new_plan_tier.value}"
        )

        return subscription

    async def get_active_subscription(
        self,
        developer_id: str,
    ) -> Subscription | None:
        """Get active subscription for a developer."""
        stmt = (
            select(Subscription)
            .join(CustomerBilling)
            .where(
                CustomerBilling.developer_id == developer_id,
                Subscription.status.in_([
                    SubscriptionStatus.ACTIVE.value,
                    SubscriptionStatus.TRIALING.value,
                ]),
            )
            .order_by(Subscription.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_customer_billing(
        self,
        developer_id: str,
    ) -> CustomerBilling | None:
        """Get customer billing record for a developer."""
        stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == developer_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_payment_method(
        self,
        developer_id: str,
        payment_method_id: str,
    ) -> CustomerBilling:
        """Update the default payment method for a customer."""
        customer_billing = await self.get_customer_billing(developer_id)

        if not customer_billing or not customer_billing.stripe_customer_id:
            raise ValueError(f"No Stripe customer found for developer {developer_id}")

        # Attach payment method to customer
        stripe.PaymentMethod.attach(
            payment_method_id,
            customer=customer_billing.stripe_customer_id,
        )

        # Set as default
        stripe.Customer.modify(
            customer_billing.stripe_customer_id,
            invoice_settings={"default_payment_method": payment_method_id},
        )

        # Get payment method details
        pm = stripe.PaymentMethod.retrieve(payment_method_id)
        customer_billing.default_payment_method_id = payment_method_id
        customer_billing.payment_method_type = pm.type

        if pm.type == "card":
            customer_billing.payment_method_last4 = pm.card.last4
            customer_billing.payment_method_brand = pm.card.brand

        await self.db.commit()
        await self.db.refresh(customer_billing)

        return customer_billing

    async def sync_subscription_from_stripe(
        self,
        stripe_subscription_id: str,
    ) -> Subscription | None:
        """Sync subscription status from Stripe."""
        stmt = select(Subscription).where(
            Subscription.stripe_subscription_id == stripe_subscription_id
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            return None

        # Get current status from Stripe
        stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)

        subscription.status = stripe_sub.status
        subscription.current_period_start = datetime.fromtimestamp(
            stripe_sub.current_period_start
        )
        subscription.current_period_end = datetime.fromtimestamp(
            stripe_sub.current_period_end
        )

        if stripe_sub.cancel_at:
            subscription.cancel_at = datetime.fromtimestamp(stripe_sub.cancel_at)
        if stripe_sub.canceled_at:
            subscription.canceled_at = datetime.fromtimestamp(stripe_sub.canceled_at)

        await self.db.commit()
        await self.db.refresh(subscription)

        return subscription

    async def create_invoice_record(
        self,
        stripe_invoice: dict[str, Any],
    ) -> Invoice:
        """Create invoice record from Stripe invoice data."""
        # Get customer billing
        stmt = select(CustomerBilling).where(
            CustomerBilling.stripe_customer_id == stripe_invoice["customer"]
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            raise ValueError(
                f"No customer found for Stripe customer {stripe_invoice['customer']}"
            )

        invoice = Invoice(
            customer_id=customer_billing.id,
            stripe_invoice_id=stripe_invoice["id"],
            stripe_invoice_number=stripe_invoice.get("number"),
            status=stripe_invoice["status"],
            subtotal_cents=stripe_invoice.get("subtotal", 0),
            tax_cents=stripe_invoice.get("tax", 0),
            total_cents=stripe_invoice.get("total", 0),
            amount_paid_cents=stripe_invoice.get("amount_paid", 0),
            amount_due_cents=stripe_invoice.get("amount_due", 0),
            currency=stripe_invoice.get("currency", "usd"),
            invoice_pdf=stripe_invoice.get("invoice_pdf"),
            hosted_invoice_url=stripe_invoice.get("hosted_invoice_url"),
        )

        if stripe_invoice.get("period_start"):
            invoice.period_start = datetime.fromtimestamp(stripe_invoice["period_start"])
        if stripe_invoice.get("period_end"):
            invoice.period_end = datetime.fromtimestamp(stripe_invoice["period_end"])
        if stripe_invoice.get("status_transitions", {}).get("paid_at"):
            invoice.paid_at = datetime.fromtimestamp(
                stripe_invoice["status_transitions"]["paid_at"]
            )

        self.db.add(invoice)
        await self.db.commit()
        await self.db.refresh(invoice)

        return invoice

    async def get_invoices(
        self,
        developer_id: str,
        limit: int = 10,
    ) -> list[Invoice]:
        """Get invoices for a developer."""
        stmt = (
            select(Invoice)
            .join(CustomerBilling)
            .where(CustomerBilling.developer_id == developer_id)
            .order_by(Invoice.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_checkout_session(
        self,
        developer_id: str,
        plan_tier: PlanTier,
        success_url: str,
        cancel_url: str,
        workspace_id: str | None = None,
    ) -> str:
        """Create a Stripe Checkout session for subscription."""
        customer_billing = await self.get_or_create_customer(developer_id)

        # Get the plan
        stmt = select(Plan).where(Plan.tier == plan_tier.value, Plan.is_active == True)
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()

        if not plan or not plan.stripe_price_id:
            raise ValueError(f"Plan with tier {plan_tier.value} not found or has no Stripe price")

        metadata = {
            "developer_id": developer_id,
            "plan_tier": plan_tier.value,
        }
        if workspace_id:
            metadata["workspace_id"] = workspace_id

        session = stripe.checkout.Session.create(
            customer=customer_billing.stripe_customer_id,
            mode="subscription",
            line_items=[
                {
                    "price": plan.stripe_price_id,
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
            subscription_data={
                "metadata": metadata,
            },
        )

        return session.url

    async def create_billing_portal_session(
        self,
        developer_id: str,
        return_url: str,
    ) -> str:
        """Create a Stripe Billing Portal session."""
        customer_billing = await self.get_customer_billing(developer_id)

        if not customer_billing or not customer_billing.stripe_customer_id:
            raise ValueError(f"No Stripe customer found for developer {developer_id}")

        session = stripe.billing_portal.Session.create(
            customer=customer_billing.stripe_customer_id,
            return_url=return_url,
        )

        return session.url
