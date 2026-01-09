"""Sales Outreach Agent - Research prospects and craft personalized outreach."""

from typing import Any
from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent
from aexy.agents.tools.crm_tools import (
    SearchContactsTool,
    GetRecordTool,
    UpdateRecordTool,
    GetActivitiesTool,
)
from aexy.agents.tools.email_tools import (
    SendEmailTool,
    CreateDraftTool,
    GetEmailHistoryTool,
    GetWritingStyleTool,
)
from aexy.agents.tools.enrichment_tools import (
    EnrichCompanyTool,
    EnrichPersonTool,
    WebSearchTool,
)


class SalesOutreachAgent(BaseAgent):
    """AI agent for sales outreach and prospecting."""

    name = "sales_outreach"
    description = "Research prospects, identify pain points, and craft personalized outreach emails"

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
2. Look up the company and person for enrichment data
3. Check email history for any prior conversations
4. Consider the prospect's role, company size, and industry

Always:
- Create drafts for review unless explicitly told to send
- Explain your reasoning for the approach you're taking
- Be respectful of the prospect's time
"""

    @property
    def tools(self) -> list[BaseTool]:
        return [
            SearchContactsTool(workspace_id=self.workspace_id, db=self.db),
            GetRecordTool(db=self.db),
            UpdateRecordTool(db=self.db),
            GetActivitiesTool(db=self.db),
            CreateDraftTool(workspace_id=self.workspace_id, user_id=self.user_id),
            SendEmailTool(workspace_id=self.workspace_id, user_id=self.user_id),
            GetEmailHistoryTool(workspace_id=self.workspace_id, db=self.db),
            GetWritingStyleTool(workspace_id=self.workspace_id, user_id=self.user_id, db=self.db),
            EnrichCompanyTool(),
            EnrichPersonTool(),
            WebSearchTool(),
        ]

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
2. Research the company and person using enrichment tools
3. Get my writing style to match the tone
4. Create a personalized email draft

Focus on creating genuine value and connection, not a generic pitch.
"""
