"""Pre-built workflow templates for common automation patterns."""

from typing import Any

# Template categories
TEMPLATE_CATEGORIES = {
    "sales": {"label": "Sales", "icon": "TrendingUp"},
    "marketing": {"label": "Marketing", "icon": "Megaphone"},
    "onboarding": {"label": "Onboarding", "icon": "UserPlus"},
    "engagement": {"label": "Engagement", "icon": "MessageSquare"},
    "notifications": {"label": "Notifications", "icon": "Bell"},
}


def get_system_templates() -> list[dict[str, Any]]:
    """Return all system workflow templates."""
    return [
        # 1. Lead Follow-up
        {
            "name": "Lead Follow-up",
            "description": "Automatically follow up with new leads after a delay. Sends a personalized email and creates a follow-up task.",
            "category": "sales",
            "icon": "UserPlus",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "New Lead Created",
                        "trigger_type": "record_created",
                        "object_type": "lead",
                    },
                },
                {
                    "id": "wait-1",
                    "type": "wait",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Wait 1 Day",
                        "wait_type": "duration",
                        "duration_value": 1,
                        "duration_unit": "days",
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 250},
                    "data": {
                        "label": "Send Follow-up Email",
                        "action_type": "send_email",
                        "to": "{{record.values.email}}",
                        "subject": "Following up on your interest",
                        "body": "Hi {{record.values.first_name}},\n\nI wanted to follow up on your recent inquiry. Do you have any questions I can help answer?\n\nBest regards",
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 250, "y": 350},
                    "data": {
                        "label": "Create Follow-up Task",
                        "action_type": "create_task",
                        "task_title": "Follow up with {{record.values.first_name}} {{record.values.last_name}}",
                        "task_due_days": 3,
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "wait-1"},
                {"id": "e2", "source": "wait-1", "target": "action-1"},
                {"id": "e3", "source": "action-1", "target": "action-2"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        # 2. Welcome Sequence
        {
            "name": "Welcome Sequence",
            "description": "Send a series of welcome emails to new contacts over time to nurture the relationship.",
            "category": "onboarding",
            "icon": "Mail",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "Contact Created",
                        "trigger_type": "record_created",
                        "object_type": "contact",
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Send Welcome Email",
                        "action_type": "send_email",
                        "to": "{{record.values.email}}",
                        "subject": "Welcome to {{system.workspace_name}}!",
                        "body": "Hi {{record.values.first_name}},\n\nWelcome aboard! We're excited to have you.\n\nHere are some resources to get you started...",
                    },
                },
                {
                    "id": "wait-1",
                    "type": "wait",
                    "position": {"x": 250, "y": 250},
                    "data": {
                        "label": "Wait 3 Days",
                        "wait_type": "duration",
                        "duration_value": 3,
                        "duration_unit": "days",
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 250, "y": 350},
                    "data": {
                        "label": "Send Tips Email",
                        "action_type": "send_email",
                        "to": "{{record.values.email}}",
                        "subject": "Tips to get the most out of {{system.workspace_name}}",
                        "body": "Hi {{record.values.first_name}},\n\nHere are some tips to help you succeed...",
                    },
                },
                {
                    "id": "wait-2",
                    "type": "wait",
                    "position": {"x": 250, "y": 450},
                    "data": {
                        "label": "Wait 7 Days",
                        "wait_type": "duration",
                        "duration_value": 7,
                        "duration_unit": "days",
                    },
                },
                {
                    "id": "action-3",
                    "type": "action",
                    "position": {"x": 250, "y": 550},
                    "data": {
                        "label": "Send Check-in Email",
                        "action_type": "send_email",
                        "to": "{{record.values.email}}",
                        "subject": "How's it going?",
                        "body": "Hi {{record.values.first_name}},\n\nI wanted to check in and see how things are going. Let me know if you need any help!",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "action-1"},
                {"id": "e2", "source": "action-1", "target": "wait-1"},
                {"id": "e3", "source": "wait-1", "target": "action-2"},
                {"id": "e4", "source": "action-2", "target": "wait-2"},
                {"id": "e5", "source": "wait-2", "target": "action-3"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 0.8},
        },
        # 3. Deal Stage Alert
        {
            "name": "Deal Stage Alert",
            "description": "Send Slack notifications when deals move to specific stages like 'Closed Won' or 'Closed Lost'.",
            "category": "notifications",
            "icon": "Bell",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "Stage Changed",
                        "trigger_type": "stage_changed",
                        "object_type": "deal",
                    },
                },
                {
                    "id": "condition-1",
                    "type": "condition",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Is Closed Won?",
                        "conditions": [
                            {
                                "field": "{{record.values.stage}}",
                                "operator": "equals",
                                "value": "closed_won",
                            }
                        ],
                        "logic": "and",
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 100, "y": 280},
                    "data": {
                        "label": "Slack: Deal Won!",
                        "action_type": "send_slack",
                        "channel": "#sales-wins",
                        "message": ":tada: Deal Won! {{record.values.name}} - ${{record.values.amount}}\nOwner: {{record.values.owner_name}}",
                    },
                },
                {
                    "id": "condition-2",
                    "type": "condition",
                    "position": {"x": 400, "y": 280},
                    "data": {
                        "label": "Is Closed Lost?",
                        "conditions": [
                            {
                                "field": "{{record.values.stage}}",
                                "operator": "equals",
                                "value": "closed_lost",
                            }
                        ],
                        "logic": "and",
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 400, "y": 410},
                    "data": {
                        "label": "Slack: Deal Lost",
                        "action_type": "send_slack",
                        "channel": "#sales",
                        "message": ":x: Deal Lost: {{record.values.name}}\nReason: {{record.values.lost_reason}}",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "condition-1"},
                {"id": "e2", "source": "condition-1", "target": "action-1", "sourceHandle": "true"},
                {"id": "e3", "source": "condition-1", "target": "condition-2", "sourceHandle": "false"},
                {"id": "e4", "source": "condition-2", "target": "action-2", "sourceHandle": "true"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        # 4. Re-engagement Campaign
        {
            "name": "Re-engagement Campaign",
            "description": "Automatically reach out to contacts who haven't engaged in a while to re-activate them.",
            "category": "engagement",
            "icon": "RefreshCw",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "Field Changed",
                        "trigger_type": "field_changed",
                        "field_name": "last_activity_date",
                    },
                },
                {
                    "id": "condition-1",
                    "type": "condition",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Inactive 30+ Days?",
                        "conditions": [
                            {
                                "field": "{{record.values.days_since_last_activity}}",
                                "operator": "gte",
                                "value": "30",
                            }
                        ],
                        "logic": "and",
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 280},
                    "data": {
                        "label": "Send Re-engagement Email",
                        "action_type": "send_email",
                        "to": "{{record.values.email}}",
                        "subject": "We miss you, {{record.values.first_name}}!",
                        "body": "Hi {{record.values.first_name}},\n\nIt's been a while since we last connected. We have some exciting updates to share with you!\n\nClick here to see what's new...",
                    },
                },
                {
                    "id": "wait-1",
                    "type": "wait",
                    "position": {"x": 250, "y": 380},
                    "data": {
                        "label": "Wait for Email Open",
                        "wait_type": "event",
                        "event_type": "email.opened",
                        "timeout_hours": 168,
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 250, "y": 480},
                    "data": {
                        "label": "Update Engagement Status",
                        "action_type": "update_record",
                        "field_updates": [
                            {"field": "engagement_status", "value": "re-engaged"},
                        ],
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "condition-1"},
                {"id": "e2", "source": "condition-1", "target": "action-1", "sourceHandle": "true"},
                {"id": "e3", "source": "action-1", "target": "wait-1"},
                {"id": "e4", "source": "wait-1", "target": "action-2"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        # 5. Lead Scoring with AI
        {
            "name": "AI Lead Scoring",
            "description": "Automatically score new leads using AI based on their profile and engagement data.",
            "category": "sales",
            "icon": "Brain",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "New Lead",
                        "trigger_type": "record_created",
                        "object_type": "lead",
                    },
                },
                {
                    "id": "agent-1",
                    "type": "agent",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Score Lead",
                        "agent_type": "lead_scoring",
                        "agent_config": {},
                        "input_mapping": {
                            "lead_data": "{{record.values}}",
                        },
                        "output_mapping": {
                            "lead_score": "score",
                            "score_reason": "reasoning",
                        },
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 280},
                    "data": {
                        "label": "Update Lead Score",
                        "action_type": "update_record",
                        "field_updates": [
                            {"field": "lead_score", "value": "{{nodes.agent-1.lead_score}}"},
                            {"field": "score_reason", "value": "{{nodes.agent-1.score_reason}}"},
                        ],
                    },
                },
                {
                    "id": "condition-1",
                    "type": "condition",
                    "position": {"x": 250, "y": 380},
                    "data": {
                        "label": "Hot Lead?",
                        "conditions": [
                            {
                                "field": "{{nodes.agent-1.lead_score}}",
                                "operator": "gte",
                                "value": "80",
                            }
                        ],
                        "logic": "and",
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 250, "y": 510},
                    "data": {
                        "label": "Notify Sales Rep",
                        "action_type": "send_slack",
                        "channel": "#hot-leads",
                        "message": ":fire: Hot Lead Alert!\n{{record.values.first_name}} {{record.values.last_name}} (Score: {{nodes.agent-1.lead_score}})\n{{nodes.agent-1.score_reason}}",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "agent-1"},
                {"id": "e2", "source": "agent-1", "target": "action-1"},
                {"id": "e3", "source": "action-1", "target": "condition-1"},
                {"id": "e4", "source": "condition-1", "target": "action-2", "sourceHandle": "true"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        # 6. Meeting Booked Notification
        {
            "name": "Meeting Booked",
            "description": "When a meeting is booked via webhook (e.g., Calendly), create an activity and notify the team.",
            "category": "notifications",
            "icon": "Calendar",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "Webhook: Calendly",
                        "trigger_type": "webhook_received",
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Create Activity",
                        "action_type": "create_record",
                        "object_type": "activity",
                        "record_data": {
                            "type": "meeting",
                            "title": "Meeting with {{trigger.invitee_name}}",
                            "scheduled_at": "{{trigger.event_start_time}}",
                        },
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 100, "y": 280},
                    "data": {
                        "label": "Send Confirmation",
                        "action_type": "send_email",
                        "to": "{{trigger.invitee_email}}",
                        "subject": "Your meeting is confirmed!",
                        "body": "Hi {{trigger.invitee_name}},\n\nYour meeting has been scheduled for {{trigger.event_start_time}}.\n\nSee you then!",
                    },
                },
                {
                    "id": "action-3",
                    "type": "action",
                    "position": {"x": 400, "y": 280},
                    "data": {
                        "label": "Slack Notification",
                        "action_type": "send_slack",
                        "channel": "#meetings",
                        "message": ":calendar: New meeting booked!\n{{trigger.invitee_name}} scheduled for {{trigger.event_start_time}}",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "action-1"},
                {"id": "e2", "source": "action-1", "target": "action-2"},
                {"id": "e3", "source": "action-1", "target": "action-3"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        # 7. Data Enrichment
        {
            "name": "Auto Data Enrichment",
            "description": "Automatically enrich new contacts with additional data using AI.",
            "category": "sales",
            "icon": "Database",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "Contact Created",
                        "trigger_type": "record_created",
                        "object_type": "contact",
                    },
                },
                {
                    "id": "condition-1",
                    "type": "condition",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Has Company Domain?",
                        "conditions": [
                            {
                                "field": "{{record.values.email}}",
                                "operator": "is_not_empty",
                                "value": "",
                            }
                        ],
                        "logic": "and",
                    },
                },
                {
                    "id": "agent-1",
                    "type": "agent",
                    "position": {"x": 250, "y": 280},
                    "data": {
                        "label": "Enrich Contact",
                        "agent_type": "data_enrichment",
                        "input_mapping": {
                            "email": "{{record.values.email}}",
                            "first_name": "{{record.values.first_name}}",
                            "last_name": "{{record.values.last_name}}",
                        },
                        "output_mapping": {
                            "company_name": "company",
                            "job_title": "title",
                            "linkedin_url": "linkedin",
                            "company_size": "company_size",
                        },
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 410},
                    "data": {
                        "label": "Update Contact",
                        "action_type": "update_record",
                        "field_updates": [
                            {"field": "company", "value": "{{nodes.agent-1.company_name}}"},
                            {"field": "title", "value": "{{nodes.agent-1.job_title}}"},
                            {"field": "linkedin_url", "value": "{{nodes.agent-1.linkedin_url}}"},
                            {"field": "enriched_at", "value": "{{system.now}}"},
                        ],
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "condition-1"},
                {"id": "e2", "source": "condition-1", "target": "agent-1", "sourceHandle": "true"},
                {"id": "e3", "source": "agent-1", "target": "action-1"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        # 8. Sales Outreach Sequence
        {
            "name": "AI Sales Outreach",
            "description": "Use AI to draft and send personalized outreach emails to new leads.",
            "category": "sales",
            "icon": "Send",
            "nodes": [
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "label": "New Lead",
                        "trigger_type": "record_created",
                        "object_type": "lead",
                    },
                },
                {
                    "id": "agent-1",
                    "type": "agent",
                    "position": {"x": 250, "y": 150},
                    "data": {
                        "label": "Draft Outreach Email",
                        "agent_type": "email_drafter",
                        "input_mapping": {
                            "recipient_name": "{{record.values.first_name}}",
                            "recipient_company": "{{record.values.company}}",
                            "recipient_title": "{{record.values.title}}",
                            "email_purpose": "initial_outreach",
                        },
                        "output_mapping": {
                            "email_subject": "subject",
                            "email_body": "body",
                        },
                    },
                },
                {
                    "id": "action-1",
                    "type": "action",
                    "position": {"x": 250, "y": 280},
                    "data": {
                        "label": "Send Outreach Email",
                        "action_type": "send_email",
                        "to": "{{record.values.email}}",
                        "subject": "{{nodes.agent-1.email_subject}}",
                        "body": "{{nodes.agent-1.email_body}}",
                    },
                },
                {
                    "id": "wait-1",
                    "type": "wait",
                    "position": {"x": 250, "y": 380},
                    "data": {
                        "label": "Wait for Reply",
                        "wait_type": "event",
                        "event_type": "email.replied",
                        "timeout_hours": 72,
                    },
                },
                {
                    "id": "action-2",
                    "type": "action",
                    "position": {"x": 250, "y": 480},
                    "data": {
                        "label": "Create Follow-up Task",
                        "action_type": "create_task",
                        "task_title": "Review reply from {{record.values.first_name}}",
                        "task_due_days": 1,
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "agent-1"},
                {"id": "e2", "source": "agent-1", "target": "action-1"},
                {"id": "e3", "source": "action-1", "target": "wait-1"},
                {"id": "e4", "source": "wait-1", "target": "action-2"},
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
    ]
