# Email Marketing

A full email-marketing stack: templates, campaigns, multi-provider routing, domain & IP warming, reputation monitoring, tracking, preference center, automation. The infrastructure layer is shared with transactional email — what's described here is the campaign/marketing surface that sits on top.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Email Marketing System                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐    │
│  │   Visual    │───▶│   Template   │───▶│     Campaign        │    │
│  │   Builder   │    │   Service    │    │     Service         │    │
│  └─────────────┘    └──────────────┘    └──────────┬──────────┘    │
│                                                     │               │
│  ┌─────────────────────────────────────────────────▼──────────┐    │
│  │                    Routing Service                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │    │
│  │  │  Domain  │  │ Warming  │  │ Health   │  │   ISP    │   │    │
│  │  │  Service │  │ Service  │  │ Monitor  │  │  Router  │   │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │    │
│  └────────────────────────────┬───────────────────────────────┘    │
│                               │                                     │
│  ┌────────────────────────────▼───────────────────────────────┐    │
│  │                    Provider Service                         │    │
│  │  ┌──────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐ ┌────┐ │    │
│  │  │ SES  │  │ SendGrid │  │ Mailgun │  │ Postmark │ │SMTP│ │    │
│  │  └──────┘  └──────────┘  └─────────┘  └──────────┘ └────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐    │
│  │  Tracking   │───▶│  Analytics   │───▶│    Preference       │    │
│  │  Service    │    │   Service    │    │     Center          │    │
│  └─────────────┘    └──────────────┘    └─────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Templates

`EmailTemplate` model (`models/email_marketing.py:111-194`):

| Field | Note |
|---|---|
| `name`, `slug`, `category`, `template_type` | Identity |
| `subject_template`, `body_html`, `body_text`, `preview_text` | Content |
| `variables` (JSONB) | Declared template variables |
| `visual_definition` (JSONB) | Drag-drop builder representation, when `template_type=VISUAL` |
| `is_active`, `version` | Lifecycle |

Enums (`email_marketing.py:31-44`):

- `EmailTemplateType`: `CODE` (hand-coded HTML/Jinja) or `VISUAL` (drag-drop)
- `EmailTemplateCategory`: `GENERAL`, `MARKETING`, `ONBOARDING`, `RELEASE`, `TRANSACTIONAL`, `NEWSLETTER`

Templates use Jinja2 for dynamic content:

```html
<h1>Welcome, {{ recipient_name }}!</h1>

{% if has_trial %}
  <p>Your trial ends on {{ trial_end_date }}</p>
{% endif %}

{% for feature in features %}
  <li>{{ feature.name }}: {{ feature.description }}</li>
{% endfor %}
```

## Campaigns

`EmailCampaign` (`models/email_marketing.py:200-354`):

| Field | Note |
|---|---|
| `name`, `description` | |
| `campaign_type` (`CampaignType`) | `ONE_TIME` / `RECURRING` / `TRIGGERED` |
| `status` (`CampaignStatus`) | `DRAFT` / `SCHEDULED` / `SENDING` / `SENT` / `PAUSED` / `CANCELLED` |
| `scheduled_at` | When to start |
| `list_id`, `audience_filters` (JSONB) | Targeting |
| `send_window` (JSONB) | `{start, end, timezone}` — per-day send window |
| `from_name`, `from_email`, `reply_to` | Headers |
| `template_context` (JSONB) | Per-campaign template variable overrides |
| `sending_pool_id`, `sending_identity_id` | Infrastructure |
| `routing_config` (JSONB) | `{strategy, preferred_providers, fallback_enabled}` |
| Stats | `total_recipients`, `sent_count`, `delivered_count`, `open_count`, `unique_open_count`, `click_count`, `unique_click_count`, `bounce_count`, `unsubscribe_count`, `complaint_count` |
| Lifecycle | `started_at`, `completed_at`, `created_at`, `updated_at` |

Lifecycle:

```
DRAFT → SCHEDULED → SENDING → SENT
                 ↓     ↓
               PAUSED  PAUSED → CANCELLED
```

`CampaignRecipient` (`email_marketing.py:356-400+`):

| Field | Note |
|---|---|
| `campaign_id`, `record_id`, `subscriber_id` | Refs |
| `email`, `recipient_name` | |
| `context` (JSONB) | Per-recipient personalization context |
| `status` (`RecipientStatus`) | `PENDING` / `SENT` / `DELIVERED` / `OPENED` / `CLICKED` / `BOUNCED` / `UNSUBSCRIBED` / `FAILED` |

## Multi-domain infrastructure

`models/email_infrastructure.py` introduces the infrastructure objects used by every send.

### `EmailProvider` (line 94-191)

| Field | Note |
|---|---|
| `name`, `provider_type` | `SES` / `SENDGRID` / `MAILGUN` / `POSTMARK` / `SMTP` |
| `credentials` (JSONB, encrypted) | Provider-specific |
| `settings` (JSONB) | `webhook_signing_key`, `sandbox_mode`, `tracking_enabled` |
| `max_sends_per_second`, `max_sends_per_day`, `current_daily_sends`, `daily_sends_reset_at` | Rate limits |
| `priority`, `is_default` | Routing prefs |
| `last_check_at`, `last_check_status`, `last_error` | Health |

### `SendingDomain` (line 197-337)

| Field | Note |
|---|---|
| `domain`, `subdomain` | |
| `status` | `PENDING` / `VERIFYING` / `VERIFIED` / `FAILED` / `PAUSED` / `WARMING` / `ACTIVE` |
| `dns_records` (JSONB) | `{spf, dkim, dmarc, return_path}` |
| `warming_status`, `warming_schedule_id`, `warming_started_at`, `warming_day` | Warming state |
| `daily_limit`, `daily_sent`, `daily_reset_at` | Per-day caps |
| `default_from_name`, `default_reply_to` | Headers |
| `health_score` (0-100), `health_status` | `EXCELLENT` / `GOOD` / `FAIR` / `POOR` / `CRITICAL` |
| `is_default` | |

### `SendingIdentity` (line 343-402)

A specific `(domain, email, display_name)` combination. A workspace can have multiple identities on one domain (e.g. `marketing@`, `support@`, `noreply@`).

### `DedicatedIP` (line 408-501)

For workspaces on dedicated infrastructure. Same warming state shape as `SendingDomain` plus `ip_address`, `hostname` (PTR), and `blacklist_status` (JSONB array of RBL checks).

### Sending pools

A pool groups domains + IPs into a logical lane. Campaigns route through a pool; the routing service inside the pool picks the best domain/identity for each send based on health and warming status.

## Domain & IP warming

Three built-in schedules (`email_infrastructure.py:508-547`):

| Schedule | Duration | Day 1 | Day 7 | Day 14 | Day 21 |
|---|---|---|---|---|---|
| **CONSERVATIVE** | 21 days | 50 | 1,000 | 15,000 | 100,000 |
| **MODERATE** | 14 days | 100 | 7,500 | 100,000 | — |
| **AGGRESSIVE** | 7 days | 200 | 15,000 | 100,000 | — |

Each schedule is a list of `{day: int, volume: int}` entries defining the per-day cap.

**Auto-pause thresholds** (`warming_service.py:34-37`):

- Bounce rate > 5% (`DEFAULT_MAX_BOUNCE_RATE = 0.05`)
- Complaint rate > 0.1% (`DEFAULT_MAX_COMPLAINT_RATE = 0.001`)
- Delivery rate < 90% (`DEFAULT_MIN_DELIVERY_RATE = 0.90`)

When the hourly `check_warming_thresholds` activity (`temporal/activities/warming.py:55-69`) detects a breach, the domain/IP is paused, an alert fires, and an operator must manually resume.

**Daily progression**: `process_warming_day` runs daily, advances `warming_day`, recomputes `daily_limit` from the schedule. `reset_daily_volumes` zeroes the `daily_sent` counter at midnight workspace-local.

**Health scoring** (`reputation_service.py:102-112`):

- Weighted: bounce (35%) + complaint (35%) + delivery (15%) + engagement (15%)
- Tiers: EXCELLENT ≥90, GOOD 70-89, FAIR 50-69, POOR 30-49, CRITICAL <30

## Smart routing

The routing service selects domain + identity + provider per recipient based on:

1. **Health score** — prefer high-health domains
2. **ISP affinity** — route Gmail-bound mail to Gmail-optimized domains, etc.
3. **Warming caps** — respect `daily_limit` while ramping
4. **Failover** — switch providers if the primary errors out
5. **Pool routing strategy** — round-robin / weighted / priority — from `routing_config.strategy`

`ISPMetrics` (referenced in `reputation_service.py:14`) tracks inbox placement metrics per major ISP and feeds the affinity decision.

## Tracking

### Open tracking

`api/email_tracking.py` (prefix `/t`, line 14):

- `GET /t/p/{pixel_id}.gif` (line 56) — returns a 1×1 transparent GIF and records an open event in a background task
- `pixel_id` is a signed identifier mapping to a `CampaignRecipient` — no raw IDs in URLs

### Click tracking

Outbound links are rewritten through `GET /t/c/{click_token}`:

- The token is signed and maps to `(campaign_id, recipient_id, original_url)`
- Records click event + redirects (302) to the original URL

Both pixel and click handlers go through the SUS pixel-tracking flow without exposing PII — recipients can't enumerate IDs by guessing.

### Inbound webhooks

`api/email_webhooks.py` (prefix `/webhooks/email`, line 31):

- `POST /ses` — AWS SES via SNS
- `POST /sendgrid` — SendGrid events
- `POST /mailgun` — Mailgun events
- `POST /postmark` — Postmark events

Each handler processes provider events into a normalized `EventType` set (`email_infrastructure.py:76-87`):

```
SEND, DELIVERY, BOUNCE, COMPLAINT, REJECT,
OPEN, CLICK, UNSUBSCRIBE,
RENDERING_FAILURE, DELIVERY_DELAY
```

Events cascade to:

- `ProviderEventLog` — raw audit
- `CampaignRecipient.status` — DELIVERED, OPENED, CLICKED, BOUNCED, UNSUBSCRIBED
- `WarmingProgress` — feeds warming metrics
- `ReputationService` — domain health scoring + auto-pause

See [webhooks.md](./guides/webhooks.md) for inbound webhook signing patterns. Each provider's `webhook_signing_key` is stored in `EmailProvider.settings` and used to verify HMAC on inbound POSTs.

## Preference center

Public, unauthenticated, token-based.

### Subscriber model

| Field | Note |
|---|---|
| `email`, `name` | |
| `status` (`SubscriberStatus`) | `ACTIVE` / `UNSUBSCRIBED` / `BOUNCED` / `COMPLAINED` |
| `preference_token` | Signed identifier — drives `/preferences/{token}` URL |
| Per-category preferences | Subscribed yes/no per category + frequency |

### Categories

Workspace-defined. Example:

```python
categories = [
    "product_updates",   # New features, releases
    "marketing",         # Promotions, offers
    "tips_and_tricks",   # Educational content
    "community",         # Events, newsletters
]
```

### Frequency options

`SubscriptionFrequency`: `IMMEDIATE` / `DAILY` / `WEEKLY` / `MONTHLY` (`email_marketing.py:99-104`).

### Unsubscribe sources

`UnsubscribeSource` (`email_marketing.py:90-96`): `LINK`, `PREFERENCE_CENTER`, `API`, `COMPLAINT`, `BOUNCE` — useful for retention analytics.

### Endpoints

```
GET   /preferences/{token}                fetch
POST  /preferences/{token}                update
POST  /preferences/{token}/unsubscribe    unsubscribe from all
```

All three are unauthenticated; the token is the capability.

## Suppression enforcement

At send time, the campaign service skips any recipient whose:

- `EmailSubscriber.status` ∈ {`UNSUBSCRIBED`, `BOUNCED`, `COMPLAINED`}
- Subscriber is opted out of the campaign's category
- Email matches a workspace suppression list (manual blocklist)
- Email matches a known bounce/complaint from another campaign (cross-campaign suppression)

Skipped recipients write `RecipientStatus = FAILED` with a reason — they aren't silently dropped, so analytics show the suppression impact.

## Onboarding & automation

### Onboarding flows

```python
OnboardingFlow:
  - name: "New User Welcome"
  - steps: [
      { type: "email", delay: 0, template: "welcome" },
      { type: "wait", delay: 86400 },          # 1 day
      { type: "email", delay: 0, template: "getting_started" },
      { type: "milestone", slug: "first_project" },
      { type: "email", delay: 0, template: "project_tips" },
    ]
```

Per-user state is `UserOnboardingProgress` (current step, completed_at, decisions). Execution runs as a Temporal workflow — see [Onboarding](./notifications-and-chat.md#onboarding).

### CRM triggers

Hook into the CRM automation engine (see [crm.md](./crm.md#automations)). Relevant triggers:

| Trigger | Description |
|---|---|
| `user.first_login` | User's first authentication |
| `user.profile_completed` | Profile setup finished |
| `user.integration_connected` | Connected GitHub/Slack/etc. |
| `user.milestone_reached` | Hit a usage milestone |
| `release.published` | New release announcement |

Workflow actions to dispatch email-marketing work from any automation:

```python
{ action: "send_campaign", campaign_id: "..." }
{ action: "trigger_onboarding", flow_slug: "new_user" }
{ action: "complete_onboarding_step", step_id: "..." }
```

## Visual email builder

Shared infrastructure with the forms visual builder (`api/visual_builder.py`).

### Block types

**Layout**: `container`, `section`, `column`, `divider`, `spacer`.
**Content**: `header`, `text`, `image`, `button`, `link`.
**Rich**: `hero`, `footer`, `social`.
**Dynamic** (Jinja): `variable` (`{{ x }}`), `conditional` (`{% if %}`), `loop` (`{% for %}`).

### Design JSON

```json
{
  "version": 1,
  "settings": { "backgroundColor": "#f8f9fa", "width": 600, "fontFamily": "Arial, sans-serif" },
  "blocks": [
    { "type": "hero", "props": { "title": "Welcome!", "subtitle": "Get started", "buttonText": "Learn More", "buttonHref": "https://aexy.io/docs" } },
    { "type": "text", "props": { "text": "Hello {{ recipient_name }}!", "color": "#333333" } }
  ]
}
```

Round-trip: `design_to_template()` compiles to HTML/Jinja; `template_to_design()` reverses for editing.

## API endpoints

### Templates (`api/email_marketing.py:64+`)

```
GET    /workspaces/{ws}/email-marketing/templates
POST   /workspaces/{ws}/email-marketing/templates
GET    /workspaces/{ws}/email-marketing/templates/{template_id}
PATCH  /workspaces/{ws}/email-marketing/templates/{template_id}
DELETE /workspaces/{ws}/email-marketing/templates/{template_id}
POST   /workspaces/{ws}/email-marketing/templates/{template_id}/preview   render with context
```

### Campaigns

```
GET    /workspaces/{ws}/email-marketing/campaigns
POST   /workspaces/{ws}/email-marketing/campaigns
GET    /workspaces/{ws}/email-marketing/campaigns/{campaign_id}
POST   /workspaces/{ws}/email-marketing/campaigns/{campaign_id}/schedule
POST   /workspaces/{ws}/email-marketing/campaigns/{campaign_id}/send       start now
POST   /workspaces/{ws}/email-marketing/campaigns/{campaign_id}/pause
POST   /workspaces/{ws}/email-marketing/campaigns/{campaign_id}/test       send a test
GET    /workspaces/{ws}/email-marketing/campaigns/{campaign_id}/recipients
```

### Analytics

```
GET /workspaces/{ws}/email-marketing/campaigns/{id}/stats
GET /workspaces/{ws}/email-marketing/campaigns/{id}/timeline
GET /workspaces/{ws}/email-marketing/campaigns/{id}/links
GET /workspaces/{ws}/email-marketing/campaigns/{id}/devices
GET /workspaces/{ws}/email-marketing/overview                       workspace summary
```

### Email infrastructure (`api/email_infrastructure.py:59+`)

```
# Providers
POST /workspaces/{ws}/email-infrastructure/providers
GET  /workspaces/{ws}/email-infrastructure/providers
GET  /workspaces/{ws}/email-infrastructure/providers/{id}
POST /workspaces/{ws}/email-infrastructure/providers/{id}/test           verify credentials

# Domains
POST /workspaces/{ws}/email-infrastructure/domains
GET  /workspaces/{ws}/email-infrastructure/domains
POST /workspaces/{ws}/email-infrastructure/domains/{id}/verify
GET  /workspaces/{ws}/email-infrastructure/domains/{id}/health
POST /workspaces/{ws}/email-infrastructure/domains/{id}/warming/start
GET  /workspaces/{ws}/email-infrastructure/domains/{id}/warming/progress

# Warming schedules
POST /workspaces/{ws}/email-infrastructure/warming-schedules
GET  /workspaces/{ws}/email-infrastructure/warming-schedules

# Pools, identities
POST /workspaces/{ws}/email-infrastructure/pools
POST /workspaces/{ws}/email-infrastructure/identities
```

### Preferences (public, unauthenticated)

```
GET  /preferences/{token}
POST /preferences/{token}
POST /preferences/{token}/unsubscribe
```

### Visual builder

```
GET  /workspaces/{ws}/visual-builder/blocks
POST /workspaces/{ws}/visual-builder/blocks                       custom block
GET  /workspaces/{ws}/visual-builder/designs
POST /workspaces/{ws}/visual-builder/designs
POST /workspaces/{ws}/visual-builder/render                       render design to HTML
POST /workspaces/{ws}/visual-builder/designs/{id}/convert-to-template
```

## Temporal activities & schedules

Activities live in `temporal/activities/email.py` and `warming.py`; periodic schedules in `temporal/schedules.py`.

### Campaign

| Activity | Trigger | Retry / Timeout |
|---|---|---|
| `send_campaign` | Dispatched on send | STANDARD, 30m |
| `send_campaign_email` | Per-recipient fan-out | STANDARD |
| `check_scheduled_campaigns` | Scheduled — picks up scheduled campaigns | STANDARD |
| `update_campaign_stats` | Post-send aggregation | STANDARD |

### Warming

| Activity | Schedule ID | Cadence |
|---|---|---|
| `process_warming_day` | `process-warming-day` | Daily |
| `check_warming_thresholds` | `check-warming-thresholds` | Hourly |
| `reset_daily_volumes` | `reset-daily-volumes-email` | Daily at workspace-local midnight |

### Analytics

| Activity | Schedule ID |
|---|---|
| `aggregate_email_analytics` | `aggregate-email-analytics` |

### Onboarding

| Activity | Trigger |
|---|---|
| `start_user_onboarding` | Dispatched when user enters a flow |
| `process_onboarding_step` | Continues a user through the flow |
| `check_due_onboarding_steps` | Scheduled — drives time-based step transitions |

Inspect schedules and run history in the Temporal UI at http://localhost:8080.

## MailAgent: the email infrastructure microservice

A separate FastAPI service at `:8001` (see `mailagent/`) owns the lowest layer:

- Domain registration / DKIM key generation / SPF & DMARC record validation
- Inbox creation, IMAP/SMTP relay setup
- Provider health probing
- DNS verification flow
- Email **delivery** via the configured provider (the backend dispatches sends; MailAgent executes them)
- Bounce/complaint feedback loop processing

The main backend models (`EmailProvider`, `SendingDomain`, `SendingIdentity`, `DedicatedIP`) mirror MailAgent's state. Reads happen against backend tables; writes go through MailAgent endpoints when DNS/provider mutations are needed.

See [aexy-email-infrastructure.md](./guides/aexy-email-infrastructure.md) for the operational guide.

## Configuration

```bash
# Default SMTP fallback
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
EMAIL_FROM=noreply@aexy.io
EMAIL_FROM_NAME=Aexy

# Tracking
EMAIL_TRACKING_DOMAIN=track.aexy.io
EMAIL_IMAGE_CDN_URL=https://cdn.aexy.io/images

# Rate limits
CAMPAIGN_SEND_RATE_PER_MINUTE=100
```

Production deployments configure providers per workspace via the `EmailProvider` table — these env vars are dev defaults.

## Frontend

`/frontend/src/app/(app)/email-marketing/`:

| Route | Purpose |
|---|---|
| `/campaigns` | Campaign list |
| `/campaigns/[id]` | Campaign editor + analytics |
| `/campaigns/new` | Creation flow |
| `/templates` | Template list |
| `/templates/[id]` | Template editor (visual builder when `template_type=VISUAL`) |
| `/templates/new` | Creation |
| `/settings` | Domains, providers, warming config |

## Best practices

### Deliverability

1. **Warm new domains gradually** — use a CONSERVATIVE schedule unless you have established reputation
2. **Monitor health scores daily** — pause domains below 80
3. **Segment by engagement** — send to recent openers first; cold lists kill reputation
4. **Clean lists aggressively** — remove BOUNCED and COMPLAINED subscribers immediately

### Template design

1. **Keep it simple** — fewer images, more text gets through filters
2. **Mobile-first** — 60%+ of opens are mobile
3. **One primary CTA** per email
4. **Test rendering** — use the preview API across email clients before sending

### Compliance

1. **Always include unsubscribe** — required by CAN-SPAM / GDPR / many jurisdictions
2. **Honor opt-outs in real time** — `UNSUBSCRIBED` status takes effect at the next send check, which runs continuously
3. **Log everything** — `ProviderEventLog` and `UnsubscribeSource` are the audit trail
4. **Respect frequency settings** — over-sending is the fastest path to complaints

## Common pitfalls

- **Template category vs campaign type confusion**: `EmailTemplateCategory` is what the template is *about* (`MARKETING`, `TRANSACTIONAL`, `NEWSLETTER`, …). `CampaignType` is how it's *sent* (`ONE_TIME`, `RECURRING`, `TRIGGERED`). A `MARKETING` template can be sent in a `TRIGGERED` campaign — they're orthogonal.
- **Warming pause is sticky**: when `check_warming_thresholds` auto-pauses a domain, it stays paused until manually resumed. There's no auto-resume after metrics recover — that's intentional, since the operator needs to investigate.
- **Provider rate limits aren't enforced by the provider**: the backend tracks `current_daily_sends` against `max_sends_per_day`. If you bypass the campaign service (e.g. raw provider call), you'll exceed the limit and the provider will start rejecting — but Aexy won't know to slow down.
- **Suppression doesn't cross workspaces**: an email opted out of workspace A can still be sent from workspace B. This is by design (each workspace's reputation is its own), but counter-intuitive.
- **`SENT` vs `COMPLETED`**: the campaign lifecycle ends at `SENT` — there's no `COMPLETED` state. Earlier docs incorrectly listed `Sent → Completed`; correct flow ends at `SENT`.
- **Visual builder JSON in `EmailTemplate.visual_definition`**: editing the template HTML directly drifts from the visual definition. Either always edit through the builder, or set `template_type=CODE` to lock the visual definition out.
- **Pixel/click tokens are signed**: re-issuing tokens (e.g. on URL regeneration) invalidates old tracking links. If a campaign already sent, don't rotate the signing key — you'll lose open/click attribution.

## Related

- [Aexy email infrastructure (operations)](./guides/aexy-email-infrastructure.md) — MailAgent ops, DNS setup
- [Webhooks](./guides/webhooks.md) — inbound webhook signing
- [CRM](./crm.md) — automations that dispatch campaigns
- [Workflows & automations](./workflows-and-automations.md) — visual automation builder
- [AI Agents](./ai-agents.md) — agents that send/draft email
- [GTM](./gtm.md) — outreach sequences (related but different system)
