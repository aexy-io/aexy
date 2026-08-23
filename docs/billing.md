# Billing

Per-workspace billing with four models, plus per-workspace overrides and
offline invoicing. This lived in the repository README until it crowded out
everything a first-time reader needed; nothing about it has changed.

## Plans

| Plan | Model | Description |
|------|-------|-------------|
| Free | `free` | All modules, soft limits (10 repos, 90-day history), limited AI |
| Pro | `per_seat` | Per-user/month, full AI access, 500K tokens/month included |
| Flat + Usage | `flat_plus_usage` | Monthly flat fee + metered AI token usage |
| Postpaid | `postpaid` | Pay at the end of the billing period, per-seat + AI usage |
| Enterprise | `per_seat` | Custom pricing, SSO, dedicated support |

Self-hosting is not one of these. It is the whole codebase under AGPL-3.0 with
no plan attached and no feature gates — the plans above describe the hosted
service.

## Per-workspace overrides

Platform admins can override any plan field per workspace through
`WorkspacePlanOverride`:

- Custom pricing, limits and discounts
- Custom billing model (switch between per-seat, flat+usage, postpaid)
- Custom net terms (`days_until_due`)
- Payment-method preference (Stripe or bank transfer)

## Bank transfer / offline invoicing

For customers paying by wire or ACH:

1. An admin generates the invoice at `/settings/admin-invoices` or over the API
2. The customer receives it with the amount due
3. The customer wires payment
4. The admin marks it paid with the bank-transfer reference

```
POST   /api/v1/platform-admin/invoices                          # Create manual invoice
POST   /api/v1/platform-admin/invoices/{id}/mark-paid           # Mark as paid
POST   /api/v1/platform-admin/invoices/{id}/void                # Void invoice
GET    /api/v1/platform-admin/invoices                          # List invoices
POST   /api/v1/platform-admin/workspaces/{id}/generate-invoice  # Generate from usage
```

## Stripe

Self-serve checkout is off until Stripe is configured. The frontend reads
`NEXT_PUBLIC_STRIPE_ENABLED`; while it is unset or false, paid-tier calls to
action open a mailto for offline billing instead of a checkout session. The
backend keys are `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and
`STRIPE_WEBHOOK_SECRET`, plus the per-plan price IDs listed in
`backend/.env.example`.
