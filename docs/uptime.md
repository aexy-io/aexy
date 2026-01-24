# Uptime Monitoring Module

Aexy's uptime monitoring module provides endpoint health checking for HTTP, TCP, and WebSocket services. Monitors run on configurable intervals and automatically create support tickets when services go down.

## Features

- **Multi-Protocol Checks**: HTTP, TCP, and WebSocket endpoint monitoring
- **Configurable Intervals**: 1, 5, 15, 30, or 60 minute check intervals
- **Automatic Incident Management**: Incidents created after consecutive failures
- **Ticket Integration**: Automatically creates and closes support tickets
- **Notifications**: Slack, email, and webhook alerts
- **SSL Monitoring**: Track SSL certificate expiration (HTTP checks)
- **Post-Mortem Notes**: Root cause and resolution documentation

---

## Check Types

### HTTP Check

Monitors HTTP/HTTPS endpoints with configurable settings.

| Setting | Description |
|---------|-------------|
| **URL** | Full URL to check (http:// or https://) |
| **HTTP Method** | GET, POST, HEAD, OPTIONS |
| **Expected Status Codes** | Array of valid status codes (default: [200, 201, 204]) |
| **Request Headers** | Custom headers (e.g., Authorization) |
| **Verify SSL** | Whether to verify SSL certificates |
| **Timeout** | Request timeout in seconds (default: 30) |

**Collected Metrics:**
- Response time (ms)
- Status code
- SSL certificate expiry (days remaining)
- Error messages

### TCP Check

Monitors TCP port availability.

| Setting | Description |
|---------|-------------|
| **Host** | Hostname or IP address |
| **Port** | TCP port number |
| **Timeout** | Connection timeout in seconds (default: 30) |

**Collected Metrics:**
- Connection time (ms)
- Connection success/failure
- Error type (timeout, connection_refused)

### WebSocket Check

Monitors WebSocket endpoints with optional message validation.

| Setting | Description |
|---------|-------------|
| **URL** | WebSocket URL (ws:// or wss://) |
| **WS Message** | Optional message to send on connect |
| **WS Expected Response** | Expected response pattern (regex) |
| **Timeout** | Connection timeout in seconds (default: 30) |

**Collected Metrics:**
- Connection time (ms)
- Handshake success
- Response validation result
- Error messages

---

## Incident Management

### How It Works

1. **Consecutive Failures**: Monitor tracks consecutive failed checks
2. **Threshold Reached**: When failures >= threshold (default: 3), incident is created
3. **Ticket Created**: Support ticket automatically created with incident details
4. **Notifications Sent**: Slack/email/webhook alerts dispatched
5. **Recovery Detected**: When check succeeds, incident is resolved
6. **Ticket Closed**: Linked ticket automatically closed with resolution notes

### Failure Flow

```
Check fails
    ↓
Increment consecutive_failures
    ↓
consecutive_failures >= threshold?
    ├─ No → Schedule next check
    └─ Yes → Create incident
                ↓
            Create support ticket
                ↓
            Send notifications
```

### Recovery Flow

```
Check succeeds
    ↓
Has ongoing incident?
    ├─ No → Reset counters
    └─ Yes → Resolve incident
                ↓
            Close linked ticket
                ↓
            Send recovery notifications (if enabled)
```

### Incident States

| Status | Description |
|--------|-------------|
| **ongoing** | Incident in progress, service still down |
| **acknowledged** | Team aware of issue, working on resolution |
| **resolved** | Service recovered, incident closed |

---

## Monitor Status

| Status | Description |
|--------|-------------|
| **up** | All checks passing |
| **down** | Threshold failures reached |
| **degraded** | Some failures but under threshold |
| **paused** | Monitoring temporarily disabled |

---

## Notifications

### Supported Channels

| Channel | Configuration |
|---------|---------------|
| **Slack** | Set `slack_channel_id` on monitor |
| **Email** | Uses team notification preferences |
| **Webhook** | Custom `webhook_url` for external integrations |

### Notification Events

- **Incident Created**: When threshold failures reached
- **Incident Acknowledged**: When team acknowledges incident
- **Incident Resolved**: When service recovers (if `notify_on_recovery` enabled)

### Webhook Payload

```json
{
  "event": "incident.created",
  "monitor": {
    "id": "uuid",
    "name": "API Server",
    "check_type": "http",
    "url": "https://api.example.com/health"
  },
  "incident": {
    "id": "uuid",
    "status": "ongoing",
    "started_at": "2024-01-15T10:30:00Z",
    "error_message": "Connection timeout after 30s"
  },
  "workspace_id": "uuid"
}
```

---

## Ticket Integration

### Automatic Ticket Creation

When an incident is created, a support ticket is automatically generated:

- **Title**: `[UPTIME] {monitor_name} is down`
- **Severity**: `high`
- **Priority**: `urgent`
- **Description**: Monitor details, error message, timestamp
- **Team**: Assigned to configured team (if set)

### Automatic Ticket Closure

When service recovers:

1. Resolution comment added to ticket:
   ```
   Service has recovered.

   Duration: 15 minutes
   Started: 2024-01-15 10:30:00 UTC
   Resolved: 2024-01-15 10:45:00 UTC
   Total checks during incident: 15
   Failed checks: 15
   ```
2. Ticket status set to `closed`
3. Recovery notifications sent (if enabled)

---

## API Endpoints

### Monitors

```
GET    /workspaces/{id}/uptime/monitors                    # List monitors
POST   /workspaces/{id}/uptime/monitors                    # Create monitor
GET    /workspaces/{id}/uptime/monitors/{monitor_id}       # Get monitor
PATCH  /workspaces/{id}/uptime/monitors/{monitor_id}       # Update monitor
DELETE /workspaces/{id}/uptime/monitors/{monitor_id}       # Delete monitor
POST   /workspaces/{id}/uptime/monitors/{monitor_id}/pause # Pause monitoring
POST   /workspaces/{id}/uptime/monitors/{monitor_id}/resume # Resume monitoring
POST   /workspaces/{id}/uptime/monitors/{monitor_id}/test  # Run immediate test
GET    /workspaces/{id}/uptime/monitors/{monitor_id}/checks # Get check history
GET    /workspaces/{id}/uptime/monitors/{monitor_id}/stats # Get monitor stats
```

### Incidents

```
GET    /workspaces/{id}/uptime/incidents                   # List incidents
GET    /workspaces/{id}/uptime/incidents/{incident_id}     # Get incident
PATCH  /workspaces/{id}/uptime/incidents/{incident_id}     # Update incident
POST   /workspaces/{id}/uptime/incidents/{incident_id}/acknowledge # Acknowledge
POST   /workspaces/{id}/uptime/incidents/{incident_id}/resolve     # Resolve
```

### Statistics

```
GET    /workspaces/{id}/uptime/stats                       # Workspace stats
```

---

## Database Tables

### uptime_monitors

Stores monitor configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| name | VARCHAR(255) | Display name |
| check_type | ENUM | http, tcp, websocket |
| url | VARCHAR(2048) | For HTTP/WS checks |
| host | VARCHAR(255) | For TCP checks |
| port | INTEGER | For TCP checks |
| http_method | VARCHAR(10) | GET, POST, HEAD, OPTIONS |
| expected_status_codes | JSONB | Array of valid status codes |
| request_headers | JSONB | Custom headers |
| verify_ssl | BOOLEAN | SSL verification |
| ws_message | TEXT | Message to send on WS connect |
| ws_expected_response | TEXT | Expected WS response pattern |
| check_interval_seconds | INTEGER | 60, 300, 900, 1800, 3600 |
| timeout_seconds | INTEGER | Request timeout (default 30) |
| consecutive_failures_threshold | INTEGER | Failures before alerting |
| current_status | ENUM | up, down, degraded, paused |
| last_check_at | TIMESTAMP | Last check time |
| next_check_at | TIMESTAMP | Next scheduled check |
| consecutive_failures | INTEGER | Current failure streak |
| notification_channels | JSONB | ["slack", "email", "webhook"] |
| slack_channel_id | VARCHAR | Slack channel for alerts |
| webhook_url | VARCHAR | Custom webhook URL |
| notify_on_recovery | BOOLEAN | Send recovery notification |
| team_id | UUID | FK to teams (for ticket routing) |
| is_active | BOOLEAN | Whether monitoring is active |

### uptime_checks

Stores individual check results (time-series data).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| monitor_id | UUID | FK to uptime_monitors |
| is_up | BOOLEAN | Check result |
| status_code | INTEGER | HTTP status code |
| response_time_ms | INTEGER | Response time |
| error_message | TEXT | Error details |
| error_type | VARCHAR | timeout, connection_refused, ssl_error |
| ssl_expiry_days | INTEGER | Days until SSL expiry |
| checked_at | TIMESTAMP | Check timestamp |

### uptime_incidents

Stores incident records linked to tickets.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| monitor_id | UUID | FK to uptime_monitors |
| workspace_id | UUID | FK to workspaces |
| ticket_id | UUID | FK to tickets |
| status | ENUM | ongoing, acknowledged, resolved |
| started_at | TIMESTAMP | When incident started |
| resolved_at | TIMESTAMP | When resolved |
| acknowledged_at | TIMESTAMP | When acknowledged |
| acknowledged_by_id | UUID | FK to developers |
| first_error_message | TEXT | Initial error |
| last_error_message | TEXT | Most recent error |
| total_checks | INTEGER | Checks during incident |
| failed_checks | INTEGER | Failed checks count |
| root_cause | TEXT | Post-mortem notes |
| resolution_notes | TEXT | Resolution details |

---

## Celery Tasks

### Beat Schedule

```python
"uptime-process-due-checks": {
    "task": "aexy.processing.uptime_tasks.process_due_checks",
    "schedule": 60,  # Every minute
},
"uptime-cleanup-old-checks": {
    "task": "aexy.processing.uptime_tasks.cleanup_old_checks",
    "schedule": 3600 * 24,  # Daily - keep 30 days
},
```

### Task Descriptions

| Task | Description |
|------|-------------|
| `process_due_checks` | Runs every minute, dispatches checks for monitors where `next_check_at <= now` |
| `execute_check` | Executes HTTP/TCP/WebSocket check for a single monitor |
| `send_uptime_notification` | Sends Slack/email/webhook notifications |
| `cleanup_old_checks` | Removes check records older than 30 days |

---

## Frontend Pages

| Path | Description |
|------|-------------|
| `/uptime` | Dashboard with stats and active incidents |
| `/uptime/monitors` | List all monitors with create/manage |
| `/uptime/monitors/{id}` | Monitor detail with stats and history |
| `/uptime/incidents` | List all incidents |
| `/uptime/incidents/{id}` | Incident detail with timeline |
| `/uptime/history` | Check history browser |

---

## Configuration

### Environment Variables

No additional environment variables required. Uses existing:
- `REDIS_URL` - For Celery task queue
- `DATABASE_URL` - For PostgreSQL storage

### Check Intervals

| Value | Description |
|-------|-------------|
| 60 | Every minute |
| 300 | Every 5 minutes |
| 900 | Every 15 minutes |
| 1800 | Every 30 minutes |
| 3600 | Every hour |

### Default Settings

| Setting | Default |
|---------|---------|
| `timeout_seconds` | 30 |
| `consecutive_failures_threshold` | 3 |
| `verify_ssl` | true |
| `http_method` | GET |
| `expected_status_codes` | [200, 201, 204] |
| `notify_on_recovery` | true |

---

## File Structure

```
frontend/src/
├── app/
│   ├── (app)/uptime/
│   │   ├── page.tsx                    # Dashboard
│   │   ├── monitors/
│   │   │   ├── page.tsx                # Monitors list
│   │   │   └── [monitorId]/page.tsx    # Monitor detail
│   │   ├── incidents/
│   │   │   ├── page.tsx                # Incidents list
│   │   │   └── [incidentId]/page.tsx   # Incident detail
│   │   └── history/page.tsx            # Check history
│   └── products/uptime/page.tsx        # Product landing page
└── lib/
    └── uptime-api.ts                   # Uptime API client

backend/src/aexy/
├── models/uptime.py                    # SQLAlchemy models
├── schemas/uptime.py                   # Pydantic schemas
├── services/
│   ├── uptime_service.py               # Business logic
│   └── uptime_checker.py               # Check executors
├── api/uptime.py                       # REST endpoints
└── processing/uptime_tasks.py          # Celery tasks
```

---

## Troubleshooting

### Monitor Not Running Checks

1. Verify monitor is active (`is_active = true`)
2. Check Celery beat is running:
   ```bash
   docker compose logs celery-beat
   ```
3. Check Celery worker is running:
   ```bash
   docker compose logs celery-worker
   ```

### Checks Timing Out

1. Increase `timeout_seconds` on the monitor
2. Check if endpoint is accessible from container network
3. Verify any firewall rules allow outbound connections

### Ticket Not Created

1. Verify `consecutive_failures_threshold` has been reached
2. Check ticket service is accessible
3. Review Celery worker logs for errors

### Notifications Not Sending

1. Verify notification channel is configured on monitor
2. Check Slack integration is connected (for Slack alerts)
3. Verify webhook URL is reachable
4. Review Celery worker logs

### SSL Errors

1. If certificate is valid but failing, try setting `verify_ssl = false`
2. Check certificate chain is complete
3. Verify system trust store includes required root CAs

### WebSocket Connection Failures

1. Verify WS URL uses correct protocol (ws:// or wss://)
2. Check if server requires specific subprotocols
3. Test connection manually with `wscat`:
   ```bash
   wscat -c wss://your-endpoint.com/ws
   ```

---

## Access Control

Uptime monitoring is enabled for:
- **Engineering Bundle**: Full access
- **Full Access Bundle**: Full access

Permission required: `can_view_uptime`

Configure access in **Settings > Access** for your workspace.
