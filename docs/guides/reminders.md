# Reminders & Compliance Tracking

The Reminders module helps engineering teams track recurring compliance commitments, scheduled reviews, and periodic tasks with automated owner assignment, escalation workflows, and evidence tracking.

## Overview

Reminders transform questionnaire answers and compliance requirements into actionable, tracked commitments with:

- **Recurring schedules** - Once, daily, weekly, monthly, quarterly, yearly, or custom cron
- **Smart assignment** - Fixed owner, round-robin, on-call integration, or domain-based rules
- **Escalation workflows** - Multi-level escalation with configurable delays
- **Evidence tracking** - Attach completion evidence and notes
- **Calendar view** - Visual overview of upcoming deadlines

## Getting Started

### Creating a Reminder

1. Navigate to **Compliance > Reminders** in the sidebar
2. Click **New Reminder**
3. Fill in the details:
   - **Title**: Descriptive name (e.g., "Quarterly SOC 2 Review")
   - **Category**: compliance, review, audit, security, training, maintenance, reporting, or custom
   - **Priority**: low, medium, high, or critical
   - **Frequency**: How often this reminder should occur
   - **Start Date**: When to begin generating instances

### Reminder Categories

| Category | Use Case | Example |
|----------|----------|---------|
| `compliance` | Regulatory requirements | GDPR data review, HIPAA audit |
| `review` | Periodic reviews | Code review backlog, access review |
| `audit` | Internal/external audits | Security audit, financial audit |
| `security` | Security tasks | Penetration test, vulnerability scan |
| `training` | Team training | Security awareness, onboarding |
| `maintenance` | System maintenance | Certificate renewal, backup verification |
| `reporting` | Reports and metrics | Monthly metrics, quarterly report |
| `custom` | Other reminders | Team retrospective, vendor review |

### Frequency Options

```
once        - One-time reminder
daily       - Every day
weekly      - Every week (same day)
biweekly    - Every two weeks
monthly     - Every month (same date)
quarterly   - Every 3 months
yearly      - Every year
custom      - Custom cron expression
```

For custom schedules, use standard cron syntax:
```
# Every Monday at 9am
0 9 * * 1

# First day of each month
0 9 1 * *

# Every 2 weeks on Friday
0 17 * * 5/2
```

## Assignment Strategies

### Fixed Owner
Assign to a specific person for all instances:
```json
{
  "assignment_strategy": "fixed",
  "default_owner_id": "developer-uuid"
}
```

### Round Robin
Rotate between team members:
```json
{
  "assignment_strategy": "round_robin",
  "default_team_id": "team-uuid"
}
```

### On-Call Integration
Assign to whoever is currently on-call:
```json
{
  "assignment_strategy": "on_call",
  "default_team_id": "team-uuid"
}
```

### Domain Mapping
Assign based on compliance domain (e.g., Security -> Security Team):
```json
{
  "assignment_strategy": "domain_mapping"
}
```

Configure domain mappings in **Settings > Reminders > Domain Mappings**.

## Escalation Configuration

Set up multi-level escalation for overdue reminders:

```json
{
  "escalation_config": {
    "enabled": true,
    "levels": [
      {
        "level": "l1",
        "delay_hours": 24,
        "notify": ["owner", "team_lead"]
      },
      {
        "level": "l2",
        "delay_hours": 48,
        "notify": ["manager", "slack_channel"]
      },
      {
        "level": "l3",
        "delay_hours": 72,
        "notify": ["director", "admin"]
      }
    ]
  }
}
```

## Notification Configuration

Configure how and when to send reminders:

```json
{
  "notification_config": {
    "channels": ["email", "slack", "in_app"],
    "remind_before_days": [7, 3, 1],
    "remind_on_due": true,
    "daily_digest": true,
    "slack_channel": "#compliance-reminders"
  }
}
```

## Instance Lifecycle

Each reminder generates instances based on its schedule:

```
pending -> notified -> acknowledged -> completed
                   \-> overdue -> escalated
                   \-> skipped
```

### Instance Actions

| Action | Description |
|--------|-------------|
| **Acknowledge** | Mark that you've seen and started working on it |
| **Complete** | Mark as done with optional notes and evidence |
| **Skip** | Skip this instance with a reason (vacation, not applicable) |
| **Reassign** | Transfer to another owner or team |

## API Reference

### List Reminders
```bash
GET /api/v1/workspaces/{workspace_id}/reminders
```

Query parameters:
- `status`: active, paused, archived
- `category`: Filter by category
- `priority`: Filter by priority
- `page`, `page_size`: Pagination

### Create Reminder
```bash
POST /api/v1/workspaces/{workspace_id}/reminders
Content-Type: application/json

{
  "title": "Monthly Security Review",
  "description": "Review access logs and security alerts",
  "category": "security",
  "priority": "high",
  "frequency": "monthly",
  "start_date": "2024-02-01",
  "assignment_strategy": "round_robin",
  "default_team_id": "team-uuid"
}
```

### Get Dashboard Stats
```bash
GET /api/v1/workspaces/{workspace_id}/reminders/dashboard/stats
```

Returns:
```json
{
  "total_reminders": 25,
  "active_reminders": 20,
  "total_pending_instances": 8,
  "total_overdue_instances": 2,
  "completed_this_week": 5,
  "completion_rate_7d": 0.85,
  "by_category": [
    {"category": "compliance", "total": 10},
    {"category": "security", "total": 5}
  ],
  "upcoming_7_days": [...]
}
```

### Get My Reminders
```bash
GET /api/v1/workspaces/{workspace_id}/reminders/my-reminders
```

Returns instances assigned to the current user.

### Calendar View
```bash
GET /api/v1/workspaces/{workspace_id}/reminders/calendar?start_date=2024-02-01&end_date=2024-02-29
```

Returns reminder instances as calendar events.

### Complete Instance
```bash
POST /api/v1/workspaces/{workspace_id}/reminders/instances/{instance_id}/complete
Content-Type: application/json

{
  "notes": "Completed quarterly review, no issues found",
  "evidence_url": "https://docs.example.com/review-2024-q1"
}
```

## Celery Background Tasks

The following tasks run automatically:

| Task | Schedule | Description |
|------|----------|-------------|
| `generate_reminder_instances` | Daily 00:00 | Creates instances for the next 90 days |
| `process_escalations` | Every 2 hours | Checks and triggers escalations |
| `send_daily_digest` | Daily 08:00 | Sends summary to owners |
| `flag_overdue_reminders` | Hourly | Marks overdue instances |
| `send_weekly_slack_summary` | Monday 09:00 | Team summary to Slack |

## Control Owners

Map compliance controls to specific owners for automatic assignment:

```bash
POST /api/v1/workspaces/{workspace_id}/reminders/control-owners
Content-Type: application/json

{
  "control_id": "SOC2-CC6.1",
  "control_name": "Logical Access Controls",
  "domain": "security",
  "primary_owner_id": "developer-uuid",
  "backup_owner_id": "backup-developer-uuid"
}
```

## Best Practices

### 1. Start with Critical Compliance
Begin by tracking your most important compliance requirements:
- SOC 2 controls
- Security reviews
- Access audits

### 2. Set Realistic Frequencies
Don't over-schedule. Monthly is often better than weekly for compliance tasks.

### 3. Use Evidence URLs
Always attach evidence when completing reminders:
- Link to documents
- Screenshots
- Audit reports

### 4. Configure Escalations
Set up escalation chains to ensure nothing falls through the cracks:
- L1: 24 hours - notify owner and team lead
- L2: 48 hours - notify manager
- L3: 72 hours - notify director

### 5. Review Dashboard Weekly
Check the compliance dashboard weekly to:
- Identify overdue items
- Track completion rates
- Plan upcoming work

## Troubleshooting

### Reminder instances not generating
1. Check that the reminder status is `active`
2. Verify the `start_date` is in the past or today
3. Check Celery beat is running: `docker logs aexy-celery-beat`

### Notifications not sending
1. Verify notification channels are configured
2. Check Slack integration settings
3. Review Celery worker logs for errors

### Escalations not triggering
1. Ensure `escalation_config.enabled` is true
2. Verify escalation levels are properly configured
3. Check the `process_escalations` task is running

## Integration with Other Modules

### Questionnaire Integration
Reminders can be auto-generated from compliance questionnaire responses:
1. Complete a compliance questionnaire
2. Review suggested reminders in the "Suggestions" section
3. Accept or customize suggestions

### On-Call Integration
When using `on_call` assignment strategy:
1. Set up on-call schedules in **Settings > Projects > On-Call**
2. Reminders will auto-assign to the current on-call person

### Ticket Integration
Connect reminders to tickets:
1. Complete a reminder instance
2. Link to the related ticket for traceability
