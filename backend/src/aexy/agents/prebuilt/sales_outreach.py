"""Sales Outreach Agent - Research prospects and craft personalized outreach."""

from typing import Any

from aexy.agents.base import BaseAgent


class SalesOutreachAgent(BaseAgent):
    """AI agent for sales outreach and prospecting."""

    name = "sales_outreach"
    description = "Research prospects, identify pain points, and craft personalized outreach emails"

    # Catalogue tools, attached per run as the person or principal the agent
    # acts for (see `agents.tools.mcp_tools.attach_to_agent`).
    catalog_tool_names = [
        "aexy_crm_records",
        "get_record_by_id",
        "update_record_by_id",
        "list_activities",
        "get_email_history",
        "get_writing_style",
        "send_email",
    ]

    def __init__(
        self,
        workspace_id: str,
        user_id: str,
        db: Any = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.db = db

    @property
    def system_prompt(self) -> str:
        return """You are an expert sales development representative (SDR) AI assistant. Your job is to:

1. Research prospects thoroughly using available tools
2. Identify potential pain points and business needs
3. Craft highly personalized, compelling outreach emails
4. Match the user's writing style when creating emails

Guidelines for outreach emails:
- Keep subject lines under 50 characters, make them intriguing
- Personalize the opening with something specific about the prospect
- Focus on value and solving problems, not pitching features
- Include a clear, low-friction call-to-action
- Keep emails concise (under 150 words)
- Sound human, not robotic

Research approach:
1. First, get the record data and any existing activities
2. Use what the CRM already knows about the company and person
3. Check email history for any prior conversations
4. Consider the prospect's role, company size, and industry

Always:
- Sending goes through send_email; workspace policy holds it for a person to approve, so a send is a draft until approved
- Explain your reasoning for the approach you're taking
- Be respectful of the prospect's time
"""

    @property
    def goal(self) -> str:
        return "Research the prospect and create a personalized outreach email that will generate a response"

    def build_initial_message(self, record_data: dict, context: dict) -> str:
        values = record_data.get("values", {})

        # Extract key prospect info
        name = values.get("first_name", "") or values.get("name", "the prospect")
        email = values.get("email", "")
        company = values.get("company", "") or values.get("company_name", "")
        title = values.get("title", "") or values.get("job_title", "")

        outreach_type = context.get("outreach_type", "initial")
        campaign = context.get("campaign", "")
        additional_context = context.get("additional_context", "")

        return f"""
I need you to research and craft a personalized {outreach_type} outreach email for:

**Prospect Information:**
- Name: {name}
- Email: {email}
- Company: {company}
- Title: {title}

**Additional Context:**
{additional_context if additional_context else "No additional context provided."}

**Campaign:** {campaign if campaign else "General outreach"}

**Instructions:**
1. First, get the full record data and any prior activities/email history
2. Research the company and person from the CRM record and activities
3. Get my writing style to match the tone
4. Send a personalized email with send_email (held for approval by policy)

Focus on creating genuine value and connection, not a generic pitch.
"""
