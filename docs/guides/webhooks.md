# Webhooks

Aexy both **receives** webhooks from external providers (GitHub, Stripe, Slack, email, …) and **sends** webhooks out (CRM events, agent events, GTM events). Two separate codepaths.

## Inbound

### Routes

| Route | Source | Verification |
|---|---|---|
| `POST /api/v1/webhooks/github` | GitHub Apps | HMAC-SHA256 over body, header `X-Hub-Signature-256`, secret `GITHUB_WEBHOOK_SECRET` |
| `POST /api/v1/email-webhooks/...` | Email providers (SES, SendGrid, Postmark, etc.) | Provider-specific signature |
| `POST /api/v1/integrations/webhooks/...` | Third-party platforms — Stripe, Slack events, etc. (see `api/integrations.py:webhook_router`) | Provider-specific |
| `POST /api/v1/event-ingestion/...` | First-party event SDK (tracking) | Workspace API key |

The canonical implementation is `backend/src/aexy/api/webhooks.py`. Read it as a template before adding a new inbound webhook.

### Pattern

```python
@router.post("/github")
async def handle_github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(None),
    x_github_event: str | None = Header(None),
    x_github_delivery: str | None = Header(None),
) -> dict:
    body = await request.body()

    handler = WebhookHandler(webhook_secret=settings.github_webhook_secret)

    # 1. Verify signature
    if settings.github_webhook_secret and x_hub_signature_256:
        if not handler.verify_signature(body, x_hub_signature_256):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # 2. Parse JSON
    payload = await request.json()

    # 3. Parse event
    try:
        event = handler.parse_event(x_github_event, payload)
    except UnsupportedEventError:
        return {"status": "ignored"}  # 200 — GitHub disables webhooks that 4xx repeatedly

    # 4. Process / dispatch
    if not handler.should_process(event):
        return {"status": "ignored"}

    ...
```

### Rules

- **Verify the signature before parsing the body**, against the raw bytes. JSON canonicalization breaks HMAC.
- **Return 200 for events you don't handle.** GitHub disables webhooks that 4xx repeatedly. Use `{ "status": "ignored", "reason": "..." }`.
- **Don't do real work synchronously.** The webhook handler should validate, persist a minimal record, and `await dispatch(...)` to a Temporal activity. Most providers retry on 5xx, so any expensive work in the handler risks duplicate processing.
- **Idempotency**: use the provider's delivery ID (`X-GitHub-Delivery`, Stripe `event.id`, …) as part of the Temporal `workflow_id`. Replays become no-ops.
- **Secrets per provider** live in `core/config.py`. If `*_WEBHOOK_SECRET` is empty, the handler treats it as "dev mode, skip signature check" — fine for local but the deploy doc warns to set them in prod.

### Local testing

Use `ngrok` (or any tunnel) to expose `:8000` to the public internet. Point the GitHub App / Stripe webhook URL at `https://<your-tunnel>/api/v1/webhooks/github`. For replays without a real provider, `curl -X POST` against the route with `Content-Type: application/json` — signature check is skipped if the secret env var is empty.

## Outbound

### Where they're configured

Three modules send outbound webhooks:

| Module | Configured via | Model |
|---|---|---|
| CRM | `crm_automation.py` POST `/webhooks` | `CRMWebhook` (`models/crm.py:1340-1408`) |
| Agents | Agent policy → "webhook" action | shared infra |
| GTM | per-module webhook configs under `api/gtm/` | varies |

### Delivery

All outbound deliveries go through the `deliver_webhook` Temporal activity (`temporal/activities/integrations.py`), which uses `WEBHOOK_RETRY` (6 attempts, initial 1m, ×3 backoff up to 1h). See `dispatch.py:46-52`.

```python
WEBHOOK_RETRY = RetryPolicy(
    initial_interval=timedelta(minutes=1),
    backoff_coefficient=3.0,
    maximum_interval=timedelta(hours=1),
    maximum_attempts=6,
)
```

### Signing

Outbound deliveries are signed with HMAC-SHA256 using the webhook's stored `secret` (`CRMWebhook.secret`). The signature is added as a header (`X-Aexy-Signature` — confirm exact name in `CRMWebhookService.deliver_webhook`).

Consumers should verify the same way Aexy does for GitHub: HMAC over the **raw body** with the shared secret.

### Delivery log

For CRM webhooks, every attempt is persisted in `CRMWebhookDelivery`:

| Field | Note |
|---|---|
| `webhook_id` | FK |
| `event_type` | e.g. `record.created` |
| `payload` | JSONB of what was sent |
| `status` | `pending` / `success` / `failed` |
| `response_status_code`, `response_body` | What the consumer returned |
| `attempt_number`, `next_retry_at` | Retry state |
| `duration_ms` | Per-attempt latency |

Query: `GET /workspaces/{workspace_id}/crm/webhooks/{webhook_id}/deliveries`.

### Event taxonomy

CRM emits at least:

- `record.created`, `record.updated`, `record.deleted`
- `automation.run.completed`, `automation.run.failed`
- `sequence.enrolled`, `sequence.exited`

Subscribers filter by `events` (JSONB array on `CRMWebhook`).

### Rotating the secret

`CRMWebhookService.rotate_secret(webhook_id)` issues a new signing key. Coordinate with consumers — there's no overlap window (no "old + new both valid for 24h"); the next delivery will sign with the new secret.

## Adding a new inbound webhook

1. Define the route in `api/webhooks.py` (or a new file mounted in `api/__init__.py`).
2. Read the raw body via `await request.body()` **before** `await request.json()`.
3. Add the provider's secret to `core/config.py` and `.env.prod.example`.
4. Verify the signature against the raw bytes. Reject 401 on mismatch.
5. Persist a delivery record (or use the provider's delivery ID as a dedup key).
6. Dispatch real processing to Temporal:
   ```python
   await dispatch(
       "process_provider_webhook",
       ProviderWebhookInput(delivery_id=..., payload=payload),
       task_queue=TaskQueue.INTEGRATIONS,
       workflow_id=f"webhook-provider-{delivery_id}",
   )
   ```
7. Return 200 with a small JSON body. Don't 4xx for events you don't recognize.

## Adding a new outbound webhook event

1. Pick the module (CRM is the most general).
2. From the place that produces the event, call:
   ```python
   await WebhookService(db).emit(workspace_id, "record.created", payload)
   ```
3. That method finds matching `CRMWebhook` rows (active, listening for that event), creates `CRMWebhookDelivery` rows in `pending`, and dispatches `deliver_webhook` per subscriber.
4. Document the new `event_type` so consumers know to subscribe.

## Common pitfalls

- **Parsing before verifying**: `await request.json()` re-serializes — your HMAC won't match. Always work from the bytes returned by `await request.body()`.
- **Doing work in the handler**: providers retry on 5xx and you'll process the same event twice. Hand off to Temporal.
- **Ignoring delivery IDs**: without an idempotency key tied to the provider's delivery ID, retries on the provider side double-process.
- **Forgetting to set the secret in production**: the dev fallback ("skip signature check if secret empty") will silently accept forged payloads. Deploy hardens this — verify in the deployment checklist.
