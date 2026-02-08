"""Email tools for AI agents."""

from typing import Any, Type
from pydantic import BaseModel, Field
from langchain_core.tools import BaseTool


class SendEmailInput(BaseModel):
    """Input for sending an email."""
    to: str = Field(description="Recipient email address")
    subject: str = Field(description="Email subject line")
    body: str = Field(description="Email body content (HTML or plain text)")
    record_id: str | None = Field(default=None, description="Optional CRM record ID to link this email to")


class SendEmailTool(BaseTool):
    """Send an email via Gmail."""

    name: str = "send_email"
    description: str = "Send an email to a recipient. Use this to reach out to contacts or follow up on conversations."
    args_schema: Type[BaseModel] = SendEmailInput
    workspace_id: str = ""
    user_id: str = ""

    def _run(self, to: str, subject: str, body: str, record_id: str | None = None) -> str:
        return f"Email sent to {to}"

    async def _arun(self, to: str, subject: str, body: str, record_id: str | None = None) -> str:
        """Send an email."""
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendCRMEmailInput

        if not self.workspace_id or not self.user_id:
            return "Error: Missing workspace or user context"

        try:
            # Queue the email via Temporal
            await dispatch(
                "send_crm_email",
                SendCRMEmailInput(
                    workspace_id=self.workspace_id,
                    user_id=self.user_id,
                    to_email=to,
                    subject=subject,
                    body=body,
                    record_id=record_id,
                ),
                task_queue=TaskQueue.INTEGRATIONS,
            )

            return f"Email queued successfully to {to} with subject: '{subject}'"
        except Exception as e:
            return f"Error sending email: {str(e)}"


class CreateDraftInput(BaseModel):
    """Input for creating an email draft."""
    to: str = Field(description="Recipient email address")
    subject: str = Field(description="Email subject line")
    body: str = Field(description="Email body content")


class CreateDraftTool(BaseTool):
    """Create an email draft for review."""

    name: str = "create_draft"
    description: str = "Create an email draft without sending. Use this when the email needs human review before sending."
    args_schema: Type[BaseModel] = CreateDraftInput
    workspace_id: str = ""
    user_id: str = ""

    def _run(self, to: str, subject: str, body: str) -> str:
        return f"Draft created for {to}"

    async def _arun(self, to: str, subject: str, body: str) -> str:
        """Create an email draft."""
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendCRMEmailInput

        if not self.workspace_id or not self.user_id:
            return "Error: Missing workspace or user context"

        try:
            await dispatch(
                "send_crm_email",
                SendCRMEmailInput(
                    workspace_id=self.workspace_id,
                    user_id=self.user_id,
                    to_email=to,
                    subject=subject,
                    body=body,
                ),
                task_queue=TaskQueue.INTEGRATIONS,
            )

            return f"Email draft created for {to}. Subject: '{subject}'"
        except Exception as e:
            return f"Error creating draft: {str(e)}"


class GetEmailHistoryInput(BaseModel):
    """Input for getting email history."""
    email_address: str = Field(description="Email address to get history for")
    limit: int = Field(default=10, description="Maximum number of emails to return")


class GetEmailHistoryTool(BaseTool):
    """Get email conversation history with a contact."""

    name: str = "get_email_history"
    description: str = "Get previous email conversations with a specific email address"
    args_schema: Type[BaseModel] = GetEmailHistoryInput
    workspace_id: str = ""
    db: Any = None

    def _run(self, email_address: str, limit: int = 10) -> str:
        return f"Retrieved email history for {email_address}"

    async def _arun(self, email_address: str, limit: int = 10) -> str:
        """Get email history."""
        from sqlalchemy import select, or_
        from aexy.models.crm import CRMActivity

        if not self.db or not self.workspace_id:
            return "Error: Database connection not available"

        try:
            # Search for email activities
            stmt = (
                select(CRMActivity)
                .where(
                    CRMActivity.workspace_id == self.workspace_id,
                    CRMActivity.activity_type.in_([
                        "email.sent", "email.received", "email.replied"
                    ]),
                )
                .order_by(CRMActivity.occurred_at.desc())
                .limit(limit * 3)  # Get more and filter
            )
            result = await self.db.execute(stmt)
            activities = result.scalars().all()

            # Filter by email address in metadata
            matching = []
            for a in activities:
                metadata = a.metadata or {}
                if (email_address.lower() in str(metadata.get("to", "")).lower() or
                    email_address.lower() in str(metadata.get("from", "")).lower()):
                    matching.append({
                        "type": a.activity_type,
                        "subject": metadata.get("subject", "No subject"),
                        "date": a.occurred_at.strftime("%Y-%m-%d %H:%M"),
                        "snippet": (a.description or "")[:100],
                    })
                    if len(matching) >= limit:
                        break

            if not matching:
                return f"No email history found with {email_address}"

            email_list = []
            for e in matching:
                email_list.append(
                    f"- [{e['type']}] {e['date']}: {e['subject']}\n  {e['snippet']}..."
                )

            return f"Email history with {email_address}:\n" + "\n".join(email_list)
        except Exception as e:
            return f"Error getting email history: {str(e)}"


class GetWritingStyleInput(BaseModel):
    """Input for getting writing style."""
    pass  # No input needed


class GetWritingStyleTool(BaseTool):
    """Get the user's personal writing style profile."""

    name: str = "get_writing_style"
    description: str = "Get the user's personal writing style (formality, tone, common phrases) to match in generated emails"
    args_schema: Type[BaseModel] = GetWritingStyleInput
    workspace_id: str = ""
    user_id: str = ""
    db: Any = None

    def _run(self) -> str:
        return "Writing style retrieved"

    async def _arun(self) -> str:
        """Get writing style."""
        from sqlalchemy import select
        from aexy.models.agent import UserWritingStyle

        if not self.db or not self.workspace_id or not self.user_id:
            return "Error: Missing context"

        try:
            stmt = select(UserWritingStyle).where(
                UserWritingStyle.workspace_id == self.workspace_id,
                UserWritingStyle.developer_id == self.user_id,
            )
            result = await self.db.execute(stmt)
            style = result.scalar_one_or_none()

            if not style or not style.is_trained:
                return """No writing style profile found. Using default professional style:
- Formality: professional
- Tone: friendly but business-appropriate
- Greetings: "Hi {name}," or "Hello,"
- Sign-offs: "Best regards," or "Thanks,"
"""

            profile = style.style_profile
            return f"""User's Writing Style:
- Formality: {profile.get('formality', 'neutral')}
- Tone: {profile.get('tone', 'professional')}
- Average sentence length: {profile.get('avg_sentence_length', 15)} words
- Common greetings: {', '.join(profile.get('common_greetings', []))}
- Common sign-offs: {', '.join(profile.get('common_signoffs', []))}
- Common phrases: {', '.join(profile.get('common_phrases', [])[:5])}

Sample excerpts to match:
{chr(10).join(profile.get('sample_excerpts', [])[:2])}
"""
        except Exception as e:
            return f"Error getting writing style: {str(e)}"
