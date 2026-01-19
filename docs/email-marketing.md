# Email Marketing

Aexy's Email Marketing module provides a complete solution for creating, sending, and tracking email campaigns with enterprise-grade deliverability infrastructure.

## Overview

The Email Marketing system consists of six integrated components:

1. **Multi-Domain Infrastructure** - Route emails through multiple domains and providers
2. **Core Campaigns** - Templates, campaigns, and recipient management
3. **Tracking & Analytics** - Open/click tracking with device detection
4. **Preference Center** - GDPR-compliant subscription management
5. **Onboarding & Automation** - Event-driven campaign triggers
6. **Visual Builder** - Drag-and-drop email design

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
│  │  ┌──────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐        │    │
│  │  │ SES  │  │ SendGrid │  │ Mailgun │  │ Postmark │        │    │
│  │  └──────┘  └──────────┘  └─────────┘  └──────────┘        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐    │
│  │  Tracking   │───▶│  Analytics   │───▶│    Preference       │    │
│  │  Service    │    │   Service    │    │     Center          │    │
│  └─────────────┘    └──────────────┘    └─────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Multi-Domain Infrastructure

### Email Providers

Connect multiple email service providers for redundancy and optimal deliverability:

```python
# Supported providers
- Amazon SES
- SendGrid
- Mailgun
- Postmark
```

### Sending Domains

Each domain tracks:
- **DNS Records**: SPF, DKIM, DMARC verification
- **Health Score**: 0-100 based on deliverability metrics
- **Daily Limits**: Configurable per domain
- **Warming Status**: Not started, In progress, Completed, Paused

### IP Warming

Three built-in warming schedules:

| Schedule | Duration | Day 1 | Day 7 | Day 14 | Day 21 |
|----------|----------|-------|-------|--------|--------|
| Conservative | 21 days | 50 | 1,000 | 15,000 | 100,000 |
| Moderate | 14 days | 100 | 7,500 | 100,000 | — |
| Aggressive | 7 days | 200 | 15,000 | 100,000 | — |

**Auto-pause thresholds:**
- Bounce rate > 5%
- Complaint rate > 0.1%
- Delivery rate < 90%

### Smart Routing

The routing service selects optimal domains based on:

1. **Health Score** - Prioritize healthy domains
2. **ISP Affinity** - Route Gmail to Gmail-optimized domains
3. **Warming Status** - Respect daily limits for warming domains
4. **Failover** - Automatic switch on domain exhaustion

## Templates & Campaigns

### Email Templates

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

**Template Types:**
- `promotional` - Marketing campaigns
- `transactional` - System notifications
- `newsletter` - Regular updates
- `onboarding` - User onboarding sequences

### Campaigns

| Type | Description |
|------|-------------|
| One-time | Send once to a specific audience |
| Recurring | Scheduled repeat sends |
| Triggered | Event-based automation |

**Campaign Lifecycle:**
```
Draft → Scheduled → Sending → Sent → Completed
         ↓
       Paused → Cancelled
```

## Tracking & Analytics

### Open Tracking

- 1x1 transparent tracking pixel
- Device detection (desktop, mobile, tablet)
- Email client identification
- Unique vs total opens

### Click Tracking

- All links rewritten for tracking
- Per-link click analytics
- First click vs repeat clicks
- Geographic data (if available)

### Campaign Metrics

```python
CampaignAnalytics:
  - sent_count
  - delivered_count
  - open_count / unique_open_count
  - click_count / unique_click_count
  - bounce_count (soft, hard)
  - unsubscribe_count
  - complaint_count
  - open_rate, click_rate, click_to_open_rate
```

### Workspace Stats

Aggregate metrics across all campaigns:
- 7-day, 30-day, 90-day windows
- Best send times analysis
- Top performing campaigns
- Trend analysis

## Preference Center

### Subscription Categories

Define categories for user preferences:

```python
categories = [
    "product_updates",   # New features, releases
    "marketing",         # Promotions, offers
    "tips_and_tricks",   # Educational content
    "community",         # Events, newsletters
]
```

### Subscriber Management

Each subscriber has:
- Unique preference token (for unsubscribe links)
- Global status (active, unsubscribed, bounced, complained)
- Per-category preferences with frequency options

### Frequency Options

```python
SubscriptionFrequency:
  - IMMEDIATE    # Real-time
  - DAILY        # Daily digest
  - WEEKLY       # Weekly digest
  - MONTHLY      # Monthly digest
  - NEVER        # Unsubscribed from category
```

### Compliance

- One-click unsubscribe support
- Unsubscribe event logging
- Bounce/complaint auto-handling
- GDPR-compliant data handling

## Onboarding & Automation

### Onboarding Flows

Create step-based onboarding sequences:

```python
OnboardingFlow:
  - name: "New User Welcome"
  - steps: [
      { type: "email", delay: 0, template: "welcome" },
      { type: "wait", delay: 86400 },  # 1 day
      { type: "email", delay: 0, template: "getting_started" },
      { type: "milestone", slug: "first_project" },
      { type: "email", delay: 0, template: "project_tips" },
    ]
```

### CRM Triggers

Automation triggers integrated with CRM:

| Trigger | Description |
|---------|-------------|
| `user.first_login` | User's first authentication |
| `user.profile_completed` | Profile setup finished |
| `user.integration_connected` | Connected GitHub, Slack, etc. |
| `user.milestone_reached` | Hit a usage milestone |
| `release.published` | New release announcement |

### Workflow Actions

```python
# Send a specific campaign
{ action: "send_campaign", campaign_id: "..." }

# Start an onboarding flow
{ action: "trigger_onboarding", flow_slug: "new_user" }

# Complete an onboarding step
{ action: "complete_onboarding_step", step_id: "..." }
```

## Visual Email Builder

### Block Types

**Layout Blocks:**
- `container` - Wrapper for other blocks
- `section` - Padded content section
- `column` - Column within a row
- `divider` - Horizontal line
- `spacer` - Vertical spacing

**Content Blocks:**
- `header` - H1-H6 headings
- `text` - Paragraph text
- `image` - Images with optional links
- `button` - Call-to-action buttons
- `link` - Text hyperlinks

**Rich Blocks:**
- `hero` - Hero banner with title, subtitle, CTA
- `footer` - Email footer with unsubscribe
- `social` - Social media icons

**Dynamic Blocks:**
- `variable` - `{{ variable_name }}`
- `conditional` - `{% if condition %}`
- `loop` - `{% for item in items %}`

### Design JSON Structure

```json
{
  "version": 1,
  "settings": {
    "backgroundColor": "#f8f9fa",
    "width": 600,
    "fontFamily": "Arial, sans-serif"
  },
  "blocks": [
    {
      "type": "hero",
      "props": {
        "title": "Welcome!",
        "subtitle": "Get started with Aexy",
        "buttonText": "Learn More",
        "buttonHref": "https://aexy.io/docs"
      }
    },
    {
      "type": "text",
      "props": {
        "text": "Hello {{ recipient_name }}!",
        "color": "#333333"
      }
    }
  ]
}
```

### Converting Designs

```python
# Design → Template
template = await visual_builder_service.design_to_template(
    design_id="...",
    template_name="My Email Template"
)

# Template → Design (for editing)
design = await visual_builder_service.template_to_design(
    template_id="...",
    design_name="Edit: My Template"
)
```

## API Endpoints

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/email-marketing/templates` | List templates |
| POST | `/email-marketing/templates` | Create template |
| GET | `/email-marketing/templates/{id}` | Get template |
| PATCH | `/email-marketing/templates/{id}` | Update template |
| DELETE | `/email-marketing/templates/{id}` | Delete template |
| POST | `/email-marketing/templates/{id}/preview` | Preview with context |

### Campaigns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/email-marketing/campaigns` | List campaigns |
| POST | `/email-marketing/campaigns` | Create campaign |
| GET | `/email-marketing/campaigns/{id}` | Get campaign |
| POST | `/email-marketing/campaigns/{id}/send` | Start sending |
| POST | `/email-marketing/campaigns/{id}/pause` | Pause sending |
| POST | `/email-marketing/campaigns/{id}/test` | Send test email |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/email-marketing/campaigns/{id}/analytics` | Campaign stats |
| GET | `/email-marketing/campaigns/{id}/analytics/timeline` | Opens/clicks over time |
| GET | `/email-marketing/campaigns/{id}/analytics/links` | Link performance |
| GET | `/email-marketing/campaigns/{id}/analytics/devices` | Device breakdown |
| GET | `/email-marketing/analytics/overview` | Workspace overview |
| GET | `/email-marketing/analytics/best-send-times` | Optimal send times |

### Visual Builder

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/visual-builder/blocks` | List available blocks |
| POST | `/visual-builder/blocks` | Create custom block |
| GET | `/visual-builder/designs` | List saved designs |
| POST | `/visual-builder/designs` | Save design |
| POST | `/visual-builder/render` | Render design to HTML |
| POST | `/visual-builder/designs/{id}/convert-to-template` | Convert to template |

### Preferences (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/preferences/{token}` | Get preferences |
| POST | `/preferences/{token}` | Update preferences |
| POST | `/preferences/{token}/unsubscribe` | Unsubscribe all |

## Celery Tasks

### Campaign Tasks

```python
# Main campaign sending
send_campaign_task(campaign_id)

# Individual email send
send_campaign_email_task(campaign_id, recipient_id)

# Check scheduled campaigns (beat: every minute)
check_scheduled_campaigns_task()

# Update campaign stats
update_campaign_stats_task(campaign_id)
```

### Warming Tasks

```python
# Daily warming progression (beat: midnight)
process_warming_day()

# Check warming thresholds (beat: hourly)
check_warming_thresholds()

# Reset daily volumes (beat: midnight)
reset_daily_volumes()
```

### Analytics Tasks

```python
# Aggregate daily analytics (beat: hourly)
aggregate_daily_analytics_task()

# Aggregate workspace stats (beat: daily)
aggregate_workspace_stats_task()

# Cleanup old analytics (beat: weekly)
cleanup_old_analytics_task(retention_days=90)
```

### Onboarding Tasks

```python
# Start user onboarding
start_user_onboarding(workspace_id, user_id, flow_slug)

# Process onboarding step
process_onboarding_step(progress_id)

# Check due steps (beat: every 5 minutes)
check_due_onboarding_steps()
```

## Configuration

### Environment Variables

```bash
# Email Service (default)
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
EMAIL_FROM=noreply@aexy.io
EMAIL_FROM_NAME=Aexy

# Tracking
EMAIL_TRACKING_DOMAIN=track.aexy.io
EMAIL_IMAGE_CDN_URL=https://cdn.aexy.io/images

# Rate Limits
CAMPAIGN_SEND_RATE_PER_MINUTE=100
```

### Provider Configuration

Providers are configured per-workspace in the database:

```python
EmailProvider(
    workspace_id="...",
    name="Production SES",
    provider_type="ses",  # ses, sendgrid, mailgun, postmark
    credentials={
        "access_key": "...",
        "secret_key": "...",
        "region": "us-east-1"
    },
    is_active=True,
    rate_limit_per_second=14,
    rate_limit_per_day=50000,
)
```

## Best Practices

### Deliverability

1. **Warm new domains gradually** - Use warming schedules
2. **Monitor health scores** - Pause domains below 80
3. **Segment by engagement** - Send to engaged users first
4. **Clean your lists** - Remove bounces and complaints promptly

### Template Design

1. **Keep it simple** - Fewer images, more text
2. **Mobile-first** - 60%+ of opens are mobile
3. **Clear CTAs** - One primary action per email
4. **Test rendering** - Check across email clients

### Compliance

1. **Always include unsubscribe** - Required by law
2. **Honor preferences immediately** - Process opt-outs in real-time
3. **Log everything** - Keep audit trails
4. **Respect frequency** - Don't over-send

## Related Documentation

- [CRM Integration](./crm.md) - Contact management and automation
- [Workflow Builder](./workflows.md) - Visual automation builder
- [API Overview](./api/overview.md) - Authentication and rate limits
