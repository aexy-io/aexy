# Stripe Integration Setup

This guide explains how to set up Stripe for billing and subscriptions in Aexy.

## Prerequisites

- A Stripe account (https://dashboard.stripe.com/register)
- Backend server running with database migrations applied

## 1. Get Your API Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Secret key** (starts with `sk_test_`)
3. Copy your **Publishable key** (starts with `pk_test_`)

## 2. Configure Environment Variables

Add the following to your `backend/.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

## 3. Run the Stripe Setup Script

This script creates products and prices in Stripe, then updates your database:

```bash
cd backend
source .venv/bin/activate
python scripts/setup_stripe.py
```

The script will:
- Create **Pro** and **Enterprise** products in Stripe
- Create monthly and yearly prices for each product
- Update the `plans` table with `stripe_product_id` and `stripe_price_id`

### Expected Output

```
==================================================
Aexy Stripe Setup
==================================================

Using Stripe API key: sk_test_51...

==================================================
Setting up Pro plan...
==================================================
Created product: prod_xxxxx
Created monthly price: price_xxxxx
Created yearly price: price_xxxxx

==================================================
Setting up Enterprise plan...
==================================================
Created product: prod_yyyyy
Created monthly price: price_yyyyy
Created yearly price: price_yyyyy

==================================================
Updating database...
==================================================
Updating pro plan in database...
Updated pro plan with Stripe IDs
Updating enterprise plan in database...
Updated enterprise plan with Stripe IDs

==================================================
Setup complete!
==================================================
```

## 4. Verify Database Setup

Check that plans have Stripe IDs:

```bash
docker compose exec db psql -U aexy -d aexy -c "SELECT name, tier, stripe_price_id FROM plans;"
```

Expected output:
```
    name    |    tier    |     stripe_price_id
------------+------------+-------------------------
 Free       | free       |
 Pro        | pro        | price_xxxxxxxxxxxxx
 Enterprise | enterprise | price_yyyyyyyyyyyyy
```

## 5. Set Up Webhooks (Production)

For production, you need to configure Stripe webhooks to handle subscription events.

### Create Webhook Endpoint

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. Enter your webhook URL: `https://your-domain.com/api/v1/billing/webhook`
4. Select events to listen to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`

5. Copy the **Signing secret** and add it to your `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

### Local Testing with Stripe CLI

For local development, use the Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:8000/api/v1/billing/webhook
```

Copy the webhook signing secret from the CLI output and add it to your `.env`.

## 6. Testing the Integration

### Test Checkout Flow

1. Start your backend and frontend servers
2. Log in to the application
3. Go to the Pricing page (`/pricing`)
4. Click "Start Free Trial" on the Pro plan
5. You should be redirected to Stripe Checkout
6. Use test card: `4242 4242 4242 4242` (any future date, any CVC)

### Test Cards

| Card Number | Description |
|-------------|-------------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 3220` | 3D Secure authentication |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |

See more test cards: https://stripe.com/docs/testing#cards

## Troubleshooting

### "Failed to create checkout session"

This error usually means:

1. **Missing Stripe API key**: Check `STRIPE_SECRET_KEY` in `.env`
2. **Plan has no stripe_price_id**: Run `python scripts/setup_stripe.py`
3. **Invalid price ID**: Re-run the setup script or check Stripe Dashboard

### "Plan not found"

Ensure plans are seeded in the database:

```bash
docker compose exec db psql -U aexy -d aexy -c "SELECT * FROM plans;"
```

If empty, the plans should be auto-created on first app startup. Restart the backend.

### Webhook Signature Verification Failed

- Ensure `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe Dashboard
- For local testing, use the secret from `stripe listen` command output

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/billing/plans` | GET | List all available plans |
| `/billing/status` | GET | Get current subscription status |
| `/billing/checkout` | POST | Create Stripe Checkout session |
| `/billing/portal` | POST | Create Stripe Customer Portal session |
| `/billing/cancel` | POST | Cancel subscription |
| `/billing/webhook` | POST | Handle Stripe webhook events |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│   Stripe    │
│  (Next.js)  │     │  (FastAPI)  │     │     API     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  PostgreSQL │
                    │   (plans,   │
                    │subscriptions│
                    │  invoices)  │
                    └─────────────┘
```

### Flow

1. User clicks "Upgrade" on pricing page
2. Frontend calls `POST /billing/checkout` with plan tier
3. Backend creates Stripe Checkout Session
4. User is redirected to Stripe Checkout
5. After payment, Stripe redirects to success URL
6. Stripe sends webhook event
7. Backend updates subscription status in database
