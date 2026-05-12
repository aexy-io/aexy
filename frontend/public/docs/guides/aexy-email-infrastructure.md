# Aexy Email Infrastructure Setup

This guide covers how to configure the default `*.aexy.email` domain infrastructure for self-hosted Aexy deployments.

## Overview

Aexy provides each workspace with a default email domain in the format `{workspace-slug}.aexy.email`. This enables AI agents to have their own email addresses (e.g., `support@acme.aexy.email`) without requiring users to configure custom domains.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Aexy Email Infrastructure                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Inbound Flow:                                                           │
│  ┌──────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐  │
│  │  Email   │───▶│  MX Record  │───▶│  Mailagent │───▶│  AI Agent   │  │
│  │  Sender  │    │  (SES/etc)  │    │  Service   │    │  Processor  │  │
│  └──────────┘    └─────────────┘    └────────────┘    └─────────────┘  │
│                                                                          │
│  Outbound Flow:                                                          │
│  ┌──────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐  │
│  │ AI Agent │───▶│   Routing   │───▶│  Provider  │───▶│  Recipient  │  │
│  │ Response │    │   Service   │    │  (SES/SG)  │    │             │  │
│  └──────────┘    └─────────────┘    └────────────┘    └─────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- A domain for your Aexy deployment (e.g., `aexy.email` or `mail.yourdomain.com`)
- Access to DNS management for the domain
- An email provider account (Amazon SES recommended)
- A server to run the mailagent service

## DNS Configuration

### 1. MX Records (Inbound Email)

Configure MX records to route incoming emails to your email provider:

```dns
# For Amazon SES (US East 1)
aexy.email.    MX    10    inbound-smtp.us-east-1.amazonaws.com.

# For Amazon SES (EU West 1)
aexy.email.    MX    10    inbound-smtp.eu-west-1.amazonaws.com.

# Wildcard for workspace subdomains
*.aexy.email.  MX    10    inbound-smtp.us-east-1.amazonaws.com.
```

### 2. SPF Record (Sender Authorization)

Add SPF records to authorize your email providers:

```dns
# Single provider (SES)
aexy.email.    TXT   "v=spf1 include:amazonses.com ~all"

# Multiple providers
aexy.email.    TXT   "v=spf1 include:amazonses.com include:sendgrid.net include:mailgun.org ~all"

# Wildcard for subdomains
*.aexy.email.  TXT   "v=spf1 include:amazonses.com ~all"
```

### 3. DKIM Records (Email Signing)

DKIM records are provider-specific and generated when you verify your domain:

**Amazon SES:**
```dns
# SES generates 3 CNAME records like:
abc123._domainkey.aexy.email.  CNAME  abc123.dkim.amazonses.com.
def456._domainkey.aexy.email.  CNAME  def456.dkim.amazonses.com.
ghi789._domainkey.aexy.email.  CNAME  ghi789.dkim.amazonses.com.
```

**SendGrid:**
```dns
s1._domainkey.aexy.email.  CNAME  s1.domainkey.u12345.wl.sendgrid.net.
s2._domainkey.aexy.email.  CNAME  s2.domainkey.u12345.wl.sendgrid.net.
```

### 4. DMARC Record (Policy)

Add a DMARC record to specify how receiving servers should handle authentication failures:

```dns
_dmarc.aexy.email.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@aexy.email; pct=100"
```

**DMARC Policy Options:**
- `p=none` - Monitor only, don't reject
- `p=quarantine` - Send failures to spam
- `p=reject` - Reject authentication failures

### 5. Return-Path / Bounce Handling

For proper bounce handling, configure a custom return-path subdomain:

```dns
bounce.aexy.email.  MX    10  feedback-smtp.us-east-1.amazonses.com.
bounce.aexy.email.  TXT   "v=spf1 include:amazonses.com ~all"
```

## Email Provider Setup

### Amazon SES Configuration

1. **Verify the Domain**
   ```bash
   aws ses verify-domain-identity --domain aexy.email
   aws ses verify-domain-dkim --domain aexy.email
   ```

2. **Request Production Access**
   - New SES accounts are in sandbox mode (limited sending)
   - Request production access via AWS console

3. **Configure Inbound Email Receipt**
   ```bash
   # Create an S3 bucket for email storage (optional)
   aws s3 mb s3://aexy-email-inbound

   # Create receipt rule set
   aws ses create-receipt-rule-set --rule-set-name aexy-inbound

   # Create receipt rule to forward to mailagent
   aws ses create-receipt-rule \
     --rule-set-name aexy-inbound \
     --rule '{
       "Name": "forward-to-mailagent",
       "Enabled": true,
       "Recipients": ["aexy.email"],
       "Actions": [{
         "SNSAction": {
           "TopicArn": "arn:aws:sns:us-east-1:123456789:aexy-email-inbound",
           "Encoding": "UTF-8"
         }
       }]
     }'
   ```

4. **Set Active Receipt Rule Set**
   ```bash
   aws ses set-active-receipt-rule-set --rule-set-name aexy-inbound
   ```

### SendGrid Configuration

1. **Authenticate Domain**
   - Go to Settings > Sender Authentication
   - Add domain `aexy.email`
   - Add the provided DNS records

2. **Configure Inbound Parse**
   - Go to Settings > Inbound Parse
   - Add `aexy.email` pointing to your mailagent webhook URL

### Mailgun Configuration

1. **Add Domain**
   - Go to Sending > Domains > Add New Domain
   - Add `aexy.email`
   - Configure DNS records as shown

2. **Configure Routes for Inbound**
   ```
   Expression: match_recipient(".*@.*\.aexy\.email")
   Action: forward("https://your-mailagent-url/webhook/inbound")
   ```

## Mailagent Service Configuration

The mailagent service handles inbound email processing and AI-powered responses.

### Environment Variables

```bash
# Mailagent Service
MAILAGENT_PORT=8001
MAILAGENT_HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/aexy

# Aexy Backend API
AEXY_API_URL=http://localhost:8000/api/v1
AEXY_API_KEY=your-internal-api-key

# Email Provider for Outbound
DEFAULT_EMAIL_PROVIDER=ses
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Inbound Webhook Secret (for verifying provider webhooks)
INBOUND_WEBHOOK_SECRET=your-webhook-secret

# LLM Provider for AI Processing
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

### Docker Compose Configuration

```yaml
services:
  mailagent:
    build: ./mailagent
    ports:
      - "8001:8001"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - AEXY_API_URL=http://backend:8000/api/v1
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=${AWS_REGION}
    depends_on:
      - postgres
      - backend
```

### Webhook Endpoints

Configure your email provider to send inbound emails to these endpoints:

| Provider | Webhook URL |
|----------|-------------|
| Amazon SES (SNS) | `https://mailagent.yourdomain.com/webhook/ses` |
| SendGrid | `https://mailagent.yourdomain.com/webhook/sendgrid` |
| Mailgun | `https://mailagent.yourdomain.com/webhook/mailgun` |
| Postmark | `https://mailagent.yourdomain.com/webhook/postmark` |

## Backend Configuration

### Environment Variables

```bash
# Default Email Domain
DEFAULT_EMAIL_DOMAIN=aexy.email

# Mailagent Service URL
MAILAGENT_URL=http://mailagent:8001

# Email Provider (fallback for outbound)
EMAIL_PROVIDER_TYPE=ses
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Database Configuration

Run the email infrastructure migrations:

```bash
# Via Docker
docker exec aexy-backend python scripts/run_migrations.py

# Migrations include:
# - migrate_email_infrastructure.sql
# - migrate_agent_email.sql
```

## Testing the Setup

### 1. Verify DNS Records

```bash
# Check MX record
dig MX aexy.email

# Check SPF record
dig TXT aexy.email

# Check DKIM
dig TXT abc123._domainkey.aexy.email

# Check DMARC
dig TXT _dmarc.aexy.email
```

### 2. Test Outbound Email

```bash
# Send a test email via the API
curl -X POST "https://api.yourdomain.com/api/v1/email/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "body": "This is a test email from Aexy"
  }'
```

### 3. Test Inbound Email

1. Create a test agent with email enabled
2. Send an email to `agent-handle@workspace-slug.aexy.email`
3. Check the agent's inbox in the UI or via API

```bash
# Check agent inbox
curl "https://api.yourdomain.com/api/v1/workspaces/$WORKSPACE_ID/agents/$AGENT_ID/inbox" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Verify Email Authentication

Use email testing tools to verify SPF/DKIM/DMARC:

- [Mail Tester](https://www.mail-tester.com/)
- [MXToolbox](https://mxtoolbox.com/SuperTool.aspx)
- [DMARC Analyzer](https://www.dmarcanalyzer.com/)

## Production Checklist

- [ ] DNS records configured (MX, SPF, DKIM, DMARC)
- [ ] Email provider domain verified
- [ ] SES production access approved (if using SES)
- [ ] Inbound email webhook configured
- [ ] Mailagent service deployed and healthy
- [ ] SSL certificates configured for webhook endpoints
- [ ] Bounce/complaint handling configured
- [ ] Monitoring and alerting set up
- [ ] Email authentication passing (SPF, DKIM, DMARC)

## Troubleshooting

### Inbound Emails Not Received

1. **Check MX records** - Ensure they point to your provider
2. **Verify SES receipt rules** - Make sure the rule set is active
3. **Check mailagent logs** - Look for webhook errors
4. **Verify SNS subscription** - Confirm the endpoint is subscribed

```bash
# Check mailagent logs
docker logs aexy-mailagent -f --tail 100
```

### Outbound Emails Bouncing

1. **Check sender domain verification** - Domain must be verified in SES
2. **Verify SPF/DKIM** - Use mail-tester.com to check
3. **Check SES sandbox mode** - Request production access if needed
4. **Review bounce logs** - Check for hard bounces

```bash
# Check SES sending statistics
aws ses get-send-statistics
```

### DMARC Failures

1. **Alignment issues** - Ensure From domain matches SPF/DKIM domain
2. **Missing DKIM** - Verify DKIM records are published
3. **SPF failures** - Check all sending IPs are in SPF record

### Agent Not Processing Emails

1. **Check agent email is enabled** - Verify in agent settings
2. **Check routing rules** - Ensure email routes to correct agent
3. **Check mailagent health** - Verify service is running
4. **Review processing logs** - Look for AI errors

```bash
# Health check
curl https://mailagent.yourdomain.com/health
```

## Related Documentation

- [Email Marketing](../email-marketing.md) - Campaign and template management
- [AI Agents](./agents.md) - Agent configuration and tools
- [Deployment Guide](./deployment.md) - General deployment instructions
