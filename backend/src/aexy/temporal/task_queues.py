"""Temporal task queue constants.

Consolidates into 6 Temporal task queues (previously 12 Celery queues):
  analysis  - LLM analysis work (replaces: analysis, batch)
  sync      - External API sync (replaces: sync, google_sync)
  workflows - CRM automations (replaces: workflows)
  email     - All email ops (replaces: email_campaigns, email_warming, email_reputation)
  integrations - Slack, SMS, webhooks (replaces: integrations, tracking)
  operations   - Booking, uptime, oncall (replaces: booking, uptime, default)
"""


class TaskQueue:
    """Task queue name constants."""

    ANALYSIS = "analysis"
    SYNC = "sync"
    WORKFLOWS = "workflows"
    EMAIL = "email"
    INTEGRATIONS = "integrations"
    OPERATIONS = "operations"

    ALL = [ANALYSIS, SYNC, WORKFLOWS, EMAIL, INTEGRATIONS, OPERATIONS]
