"""Email Drafter Agent - Generate emails matching user's writing style."""

from typing import Any
from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent
from aexy.agents.tools.crm_tools import GetRecordTool, GetActivitiesTool
from aexy.agents.tools.email_tools import (
    CreateDraftTool,
    GetEmailHistoryTool,
    GetWritingStyleTool,
)


class EmailDrafterAgent(BaseAgent):
    """AI agent for drafting emails that match the user's personal style."""

    name = "email_drafter"
    description = "Generate personalized emails matching your unique writing style"

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
        return """You are an expert email writing assistant. Your primary goal is to draft emails that:

1. Match the user's personal writing style (formality, tone, phrases)
2. Are appropriate for the context and relationship
3. Are clear, concise, and actionable

**Process:**
1. Always get the user's writing style first
2. Review any previous email history with the recipient
3. Understand the context and purpose of the email
4. Draft an email that sounds like the user wrote it

**Writing Style Guidelines:**
- Use the greetings and sign-offs the user typically uses
- Match the formality level (casual, neutral, formal)
- Incorporate common phrases the user tends to use
- Match typical sentence length and structure
- Preserve the user's voice and personality

**Email Best Practices:**
- Subject lines should be clear and specific
- Opening should establish context or connection
- Body should have one main purpose/ask
- Closing should include a clear next step
- Keep it as short as possible while being complete

Always create a draft rather than sending directly, unless explicitly instructed otherwise.
"""

    @property
    def tools(self) -> list[BaseTool]:
        return [
            GetRecordTool(db=self.db),
            GetActivitiesTool(db=self.db),
            GetEmailHistoryTool(workspace_id=self.workspace_id, db=self.db),
            GetWritingStyleTool(workspace_id=self.workspace_id, user_id=self.user_id, db=self.db),
            CreateDraftTool(workspace_id=self.workspace_id, user_id=self.user_id),
        ]

    @property
    def goal(self) -> str:
        return "Draft an email that matches the user's writing style and achieves the stated purpose"

    def build_initial_message(self, record_data: dict, context: dict) -> str:
        values = record_data.get("values", {})

        # Recipient info
        name = values.get("first_name", "") or values.get("name", "")
        email = values.get("email", "")
        company = values.get("company", "")

        # Email context
        purpose = context.get("purpose", "")
        email_type = context.get("email_type", "general")
        key_points = context.get("key_points", [])
        tone_override = context.get("tone", None)
        additional_context = context.get("additional_context", "")

        key_points_str = "\n".join(f"- {point}" for point in key_points) if key_points else "No specific points provided"

        return f"""
Please draft an email for me:

**Recipient:**
- Name: {name}
- Email: {email}
- Company: {company}

**Email Purpose:** {purpose or 'General communication'}
**Email Type:** {email_type}

**Key Points to Include:**
{key_points_str}

**Additional Context:**
{additional_context if additional_context else 'None'}

{f'**Tone Override:** {tone_override}' if tone_override else ''}

**Instructions:**
1. First, get my writing style profile
2. Check our email history with {email if email else 'this contact'}
3. Draft an email that sounds like me and achieves the purpose
4. Create the draft in Gmail

Remember: The email should sound like I wrote it naturally, not like an AI.
"""
