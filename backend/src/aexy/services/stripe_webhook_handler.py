"""Stripe webhook handler for processing billing events."""

import logging
from datetime import datetime
from typing import Any

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.models.billing import (
    CustomerBilling,
    Invoice,
    Subscription,
    SubscriptionStatus,
)
from aexy.models.developer import Developer
from aexy.models.plan import Plan

logger = logging.getLogger(__name__)


class StripeWebhookHandler:
    """Handler for Stripe webhook events."""

    def __init__(self, db: AsyncSession):
        self.db = db
        stripe.api_key = settings.stripe_secret_key

    def verify_webhook(
        self,
        payload: bytes,
        signature: str,
    ) -> dict[str, Any]:
        """Verify webhook signature and return event."""
        try:
            event = stripe.Webhook.construct_event(
                payload,
                signature,
                settings.stripe_webhook_secret,
            )
            return event
        except ValueError as e:
            logger.error(f"Invalid payload: {e}")
            raise
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid signature: {e}")
            raise

    async def handle_event(self, event: dict[str, Any]) -> dict[str, Any]:
        """Route event to appropriate handler."""
        event_type = event["type"]
        data = event["data"]["object"]

        handlers = {
            "customer.subscription.created": self._handle_subscription_created,
            "customer.subscription.updated": self._handle_subscription_updated,
            "customer.subscription.deleted": self._handle_subscription_deleted,
            "invoice.paid": self._handle_invoice_paid,
            "invoice.payment_failed": self._handle_invoice_payment_failed,
            "invoice.finalized": self._handle_invoice_finalized,
            "customer.updated": self._handle_customer_updated,
            "payment_method.attached": self._handle_payment_method_attached,
            "checkout.session.completed": self._handle_checkout_completed,
        }

        handler = handlers.get(event_type)
        if handler:
            result = await handler(data)
            logger.info(f"Handled webhook event: {event_type}")
            return {"status": "handled", "event_type": event_type, **result}
        else:
            logger.debug(f"Unhandled webhook event type: {event_type}")
            return {"status": "ignored", "event_type": event_type}

    async def _handle_subscription_created(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle new subscription creation from Stripe."""
        stripe_subscription_id = data["id"]
        stripe_customer_id = data["customer"]

        # Get customer billing
        stmt = select(CustomerBilling).where(
            CustomerBilling.stripe_customer_id == stripe_customer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            logger.warning(
                f"Customer not found for Stripe customer {stripe_customer_id}"
            )
            return {"action": "customer_not_found"}

        # Check if subscription already exists
        stmt = select(Subscription).where(
            Subscription.stripe_subscription_id == stripe_subscription_id
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            logger.debug(f"Subscription {stripe_subscription_id} already exists")
            return {"action": "already_exists"}

        # Get subscription item ID, price ID, and product ID
        subscription_item_id = None
        stripe_price_id = ""
        stripe_product_id = None
        if data.get("items", {}).get("data"):
            item = data["items"]["data"][0]
            subscription_item_id = item["id"]
            stripe_price_id = item["price"]["id"]
            stripe_product_id = item["price"].get("product")

        # Resolve plan: try metadata first, then fall back to matching stripe_price_id
        plan = None
        metadata = data.get("metadata", {})
        plan_tier = metadata.get("plan_tier")
        if plan_tier:
            stmt = select(Plan).where(Plan.tier == plan_tier, Plan.is_active == True)
            result = await self.db.execute(stmt)
            plan = result.scalar_one_or_none()

        if not plan and stripe_price_id:
            # Fallback: match plan by stripe_price_id or stripe_yearly_price_id
            from sqlalchemy import or_
            stmt = select(Plan).where(
                or_(
                    Plan.stripe_price_id == stripe_price_id,
                    Plan.stripe_yearly_price_id == stripe_price_id,
                ),
                Plan.is_active == True,
            )
            result = await self.db.execute(stmt)
            plan = result.scalar_one_or_none()

        plan_id = plan.id if plan else None

        # Create subscription record
        subscription = Subscription(
            customer_id=customer_billing.id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_price_id=stripe_price_id,
            stripe_product_id=stripe_product_id or (plan.stripe_product_id if plan else None),
            stripe_subscription_item_id=subscription_item_id,
            status=data["status"],
            plan_id=plan_id,
            current_period_start=datetime.fromtimestamp(data["current_period_start"]),
            current_period_end=datetime.fromtimestamp(data["current_period_end"]),
        )

        if data.get("trial_start"):
            subscription.trial_start = datetime.fromtimestamp(data["trial_start"])
        if data.get("trial_end"):
            subscription.trial_end = datetime.fromtimestamp(data["trial_end"])

        self.db.add(subscription)

        # Update developer's plan
        if plan_id:
            stmt = select(Developer).where(
                Developer.id == customer_billing.developer_id
            )
            result = await self.db.execute(stmt)
            developer = result.scalar_one_or_none()
            if developer:
                developer.plan_id = plan_id

        # Update workspace plan if workspace_id is in metadata (owner upgraded for the team)
        workspace_id = metadata.get("workspace_id")
        if plan_id and workspace_id:
            from aexy.models.workspace import Workspace
            stmt = select(Workspace).where(Workspace.id == workspace_id)
            result = await self.db.execute(stmt)
            workspace = result.scalar_one_or_none()
            if workspace:
                workspace.plan_id = plan_id
                logger.info(
                    f"Updated workspace {workspace_id} plan to {plan_tier or plan_id}"
                )

        await self.db.commit()

        return {"action": "created", "subscription_id": subscription.id}

    async def _handle_subscription_updated(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle subscription updates from Stripe."""
        stripe_subscription_id = data["id"]

        stmt = select(Subscription).where(
            Subscription.stripe_subscription_id == stripe_subscription_id
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            logger.warning(f"Subscription {stripe_subscription_id} not found")
            return {"action": "not_found"}

        # Update subscription fields
        subscription.status = data["status"]
        subscription.current_period_start = datetime.fromtimestamp(
            data["current_period_start"]
        )
        subscription.current_period_end = datetime.fromtimestamp(
            data["current_period_end"]
        )

        if data.get("cancel_at"):
            subscription.cancel_at = datetime.fromtimestamp(data["cancel_at"])
        else:
            subscription.cancel_at = None

        if data.get("canceled_at"):
            subscription.canceled_at = datetime.fromtimestamp(data["canceled_at"])

        # Update subscription item ID if changed
        if data.get("items", {}).get("data"):
            subscription.stripe_subscription_item_id = data["items"]["data"][0]["id"]
            subscription.stripe_price_id = data["items"]["data"][0]["price"]["id"]

        # Check for plan change via metadata or price ID
        metadata = data.get("metadata", {})
        plan_tier = metadata.get("plan_tier")
        plan = None

        if plan_tier:
            stmt = select(Plan).where(Plan.tier == plan_tier, Plan.is_active == True)
            result = await self.db.execute(stmt)
            plan = result.scalar_one_or_none()

        if not plan and subscription.stripe_price_id:
            from sqlalchemy import or_
            stmt = select(Plan).where(
                or_(
                    Plan.stripe_price_id == subscription.stripe_price_id,
                    Plan.stripe_yearly_price_id == subscription.stripe_price_id,
                ),
                Plan.is_active == True,
            )
            result = await self.db.execute(stmt)
            plan = result.scalar_one_or_none()

        if plan and subscription.plan_id != plan.id:
            subscription.plan_id = plan.id
            subscription.stripe_product_id = plan.stripe_product_id

            # Update developer's plan
            stmt = select(CustomerBilling).where(
                CustomerBilling.id == subscription.customer_id
            )
            result = await self.db.execute(stmt)
            customer_billing = result.scalar_one_or_none()
            if customer_billing:
                stmt = select(Developer).where(
                    Developer.id == customer_billing.developer_id
                )
                result = await self.db.execute(stmt)
                developer = result.scalar_one_or_none()
                if developer:
                    developer.plan_id = plan.id

                # Update workspace plan if applicable
                workspace_id = metadata.get("workspace_id")
                if workspace_id:
                    from aexy.models.workspace import Workspace
                    stmt = select(Workspace).where(Workspace.id == workspace_id)
                    result = await self.db.execute(stmt)
                    workspace = result.scalar_one_or_none()
                    if workspace:
                        workspace.plan_id = plan.id

        await self.db.commit()

        return {"action": "updated", "status": subscription.status}

    async def _handle_subscription_deleted(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle subscription cancellation from Stripe."""
        stripe_subscription_id = data["id"]

        stmt = select(Subscription).where(
            Subscription.stripe_subscription_id == stripe_subscription_id
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            logger.warning(f"Subscription {stripe_subscription_id} not found")
            return {"action": "not_found"}

        subscription.status = SubscriptionStatus.CANCELED.value
        subscription.canceled_at = datetime.utcnow()

        # Downgrade developer to free plan
        stmt = select(CustomerBilling).where(
            CustomerBilling.id == subscription.customer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if customer_billing:
            # Get free plan
            stmt = select(Plan).where(Plan.tier == "free", Plan.is_active == True)
            result = await self.db.execute(stmt)
            free_plan = result.scalar_one_or_none()

            if free_plan:
                stmt = select(Developer).where(
                    Developer.id == customer_billing.developer_id
                )
                result = await self.db.execute(stmt)
                developer = result.scalar_one_or_none()
                if developer:
                    developer.plan_id = free_plan.id

        await self.db.commit()

        return {"action": "canceled"}

    async def _handle_invoice_paid(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle successful invoice payment."""
        stripe_invoice_id = data["id"]

        # Check if invoice exists
        stmt = select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()

        if invoice:
            invoice.status = "paid"
            invoice.amount_paid_cents = data.get("amount_paid", 0)
            invoice.paid_at = datetime.utcnow()
        else:
            # Create new invoice record
            stmt = select(CustomerBilling).where(
                CustomerBilling.stripe_customer_id == data["customer"]
            )
            result = await self.db.execute(stmt)
            customer_billing = result.scalar_one_or_none()

            if customer_billing:
                invoice = Invoice(
                    customer_id=customer_billing.id,
                    stripe_invoice_id=stripe_invoice_id,
                    stripe_invoice_number=data.get("number"),
                    status="paid",
                    subtotal_cents=data.get("subtotal", 0),
                    tax_cents=data.get("tax", 0),
                    total_cents=data.get("total", 0),
                    amount_paid_cents=data.get("amount_paid", 0),
                    amount_due_cents=0,
                    currency=data.get("currency", "usd"),
                    invoice_pdf=data.get("invoice_pdf"),
                    hosted_invoice_url=data.get("hosted_invoice_url"),
                    paid_at=datetime.utcnow(),
                )

                if data.get("period_start"):
                    invoice.period_start = datetime.fromtimestamp(data["period_start"])
                if data.get("period_end"):
                    invoice.period_end = datetime.fromtimestamp(data["period_end"])

                self.db.add(invoice)

        await self.db.commit()

        return {"action": "invoice_paid", "invoice_id": stripe_invoice_id}

    async def _handle_invoice_payment_failed(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle failed invoice payment."""
        stripe_invoice_id = data["id"]

        stmt = select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()

        if invoice:
            invoice.status = "payment_failed"
            await self.db.commit()

        # TODO: Send notification to user about failed payment

        logger.warning(f"Payment failed for invoice {stripe_invoice_id}")

        return {"action": "payment_failed", "invoice_id": stripe_invoice_id}

    async def _handle_invoice_finalized(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle invoice finalization."""
        stripe_invoice_id = data["id"]

        stmt = select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()

        if not invoice:
            # Create invoice record
            stmt = select(CustomerBilling).where(
                CustomerBilling.stripe_customer_id == data["customer"]
            )
            result = await self.db.execute(stmt)
            customer_billing = result.scalar_one_or_none()

            if customer_billing:
                invoice = Invoice(
                    customer_id=customer_billing.id,
                    stripe_invoice_id=stripe_invoice_id,
                    stripe_invoice_number=data.get("number"),
                    status=data.get("status", "open"),
                    subtotal_cents=data.get("subtotal", 0),
                    tax_cents=data.get("tax", 0),
                    total_cents=data.get("total", 0),
                    amount_paid_cents=data.get("amount_paid", 0),
                    amount_due_cents=data.get("amount_due", 0),
                    currency=data.get("currency", "usd"),
                    invoice_pdf=data.get("invoice_pdf"),
                    hosted_invoice_url=data.get("hosted_invoice_url"),
                )

                if data.get("period_start"):
                    invoice.period_start = datetime.fromtimestamp(data["period_start"])
                if data.get("period_end"):
                    invoice.period_end = datetime.fromtimestamp(data["period_end"])

                self.db.add(invoice)
                await self.db.commit()

        return {"action": "invoice_finalized", "invoice_id": stripe_invoice_id}

    async def _handle_customer_updated(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle customer update events."""
        stripe_customer_id = data["id"]

        stmt = select(CustomerBilling).where(
            CustomerBilling.stripe_customer_id == stripe_customer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            return {"action": "customer_not_found"}

        # Update billing info
        if data.get("email"):
            customer_billing.billing_email = data["email"]
        if data.get("name"):
            customer_billing.billing_name = data["name"]
        if data.get("address"):
            customer_billing.billing_address = data["address"]
        if data.get("tax_exempt"):
            customer_billing.tax_exempt = data["tax_exempt"] == "exempt"

        await self.db.commit()

        return {"action": "customer_updated"}

    async def _handle_payment_method_attached(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle payment method attachment."""
        stripe_customer_id = data.get("customer")
        if not stripe_customer_id:
            return {"action": "no_customer"}

        stmt = select(CustomerBilling).where(
            CustomerBilling.stripe_customer_id == stripe_customer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            return {"action": "customer_not_found"}

        # Update payment method info
        customer_billing.default_payment_method_id = data["id"]
        customer_billing.payment_method_type = data.get("type")

        if data.get("type") == "card" and data.get("card"):
            customer_billing.payment_method_last4 = data["card"].get("last4")
            customer_billing.payment_method_brand = data["card"].get("brand")

        await self.db.commit()

        return {"action": "payment_method_attached"}

    async def _handle_checkout_completed(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Handle checkout session completion."""
        session_id = data["id"]
        stripe_subscription_id = data.get("subscription")

        if not stripe_subscription_id:
            return {"action": "no_subscription"}

        # The subscription.created event will handle the actual subscription creation
        # This handler can be used for additional actions like sending welcome emails

        developer_id = data.get("metadata", {}).get("developer_id")

        logger.info(
            f"Checkout completed for developer {developer_id}, "
            f"subscription {stripe_subscription_id}"
        )

        return {
            "action": "checkout_completed",
            "subscription_id": stripe_subscription_id,
        }
