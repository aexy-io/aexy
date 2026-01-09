"""Agent builder for creating custom agents from configuration."""

from typing import Any
from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent
from aexy.agents.tools.crm_tools import (
    SearchContactsTool,
    GetRecordTool,
    UpdateRecordTool,
    CreateRecordTool,
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
from aexy.agents.tools.communication_tools import SendSlackTool, SendSMSTool


# Registry of available tools
TOOL_REGISTRY: dict[str, type[BaseTool]] = {
    # CRM tools
    "search_contacts": SearchContactsTool,
    "get_record": GetRecordTool,
    "update_record": UpdateRecordTool,
    "create_record": CreateRecordTool,
    "get_activities": GetActivitiesTool,
    # Email tools
    "send_email": SendEmailTool,
    "create_draft": CreateDraftTool,
    "get_email_history": GetEmailHistoryTool,
    "get_writing_style": GetWritingStyleTool,
    # Enrichment tools
    "enrich_company": EnrichCompanyTool,
    "enrich_person": EnrichPersonTool,
    "web_search": WebSearchTool,
    # Communication tools
    "send_slack": SendSlackTool,
    "send_sms": SendSMSTool,
}


class CustomAgent(BaseAgent):
    """Dynamically configured custom agent."""

    name = "custom"
    description = "Custom agent with user-defined goal and tools"

    def __init__(
        self,
        agent_name: str,
        agent_goal: str,
        agent_prompt: str,
        tool_names: list[str],
        workspace_id: str,
        user_id: str | None = None,
        db: Any = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._name = agent_name
        self._goal = agent_goal
        self._system_prompt = agent_prompt
        self._tool_names = tool_names
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.db = db

    @property
    def name(self) -> str:
        return self._name

    @property
    def goal(self) -> str:
        return self._goal

    @property
    def system_prompt(self) -> str:
        return self._system_prompt

    @property
    def tools(self) -> list[BaseTool]:
        tools = []
        for tool_name in self._tool_names:
            tool_class = TOOL_REGISTRY.get(tool_name)
            if tool_class:
                # Initialize tool with appropriate context
                tool = self._create_tool_instance(tool_class)
                if tool:
                    tools.append(tool)
        return tools

    def _create_tool_instance(self, tool_class: type[BaseTool]) -> BaseTool | None:
        """Create a tool instance with the appropriate context."""
        try:
            # Determine what kwargs the tool needs
            tool_name = tool_class.__name__

            # CRM tools need db and possibly workspace_id
            if "CRM" in tool_name or tool_name in [
                "SearchContactsTool", "GetRecordTool", "UpdateRecordTool",
                "CreateRecordTool", "GetActivitiesTool"
            ]:
                if tool_name in ["SearchContactsTool", "CreateRecordTool"]:
                    return tool_class(workspace_id=self.workspace_id, db=self.db)
                else:
                    return tool_class(db=self.db)

            # Email tools need workspace and user
            if tool_name in ["SendEmailTool", "CreateDraftTool"]:
                return tool_class(workspace_id=self.workspace_id, user_id=self.user_id or "")

            if tool_name == "GetEmailHistoryTool":
                return tool_class(workspace_id=self.workspace_id, db=self.db)

            if tool_name == "GetWritingStyleTool":
                return tool_class(
                    workspace_id=self.workspace_id,
                    user_id=self.user_id or "",
                    db=self.db
                )

            # Communication tools need workspace
            if tool_name in ["SendSlackTool", "SendSMSTool"]:
                return tool_class(workspace_id=self.workspace_id)

            # Enrichment tools don't need special context
            return tool_class()

        except Exception:
            return None


class AgentBuilder:
    """Builder for creating agent instances from database config."""

    def __init__(
        self,
        workspace_id: str,
        user_id: str | None = None,
        db: Any = None,
    ):
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.db = db

    def build_from_config(
        self,
        name: str,
        agent_type: str,
        goal: str | None = None,
        system_prompt: str | None = None,
        tools: list[str] | None = None,
        model: str | None = None,
        max_iterations: int = 10,
        timeout_seconds: int = 300,
    ) -> BaseAgent:
        """Build an agent from configuration."""
        from aexy.agents.prebuilt import (
            SalesOutreachAgent,
            LeadScoringAgent,
            EmailDrafterAgent,
            DataEnrichmentAgent,
        )

        # Use pre-built agents for standard types
        if agent_type == "sales_outreach":
            return SalesOutreachAgent(
                workspace_id=self.workspace_id,
                user_id=self.user_id or "",
                db=self.db,
                model=model,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        elif agent_type == "lead_scoring":
            return LeadScoringAgent(
                workspace_id=self.workspace_id,
                db=self.db,
                model=model,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        elif agent_type == "email_drafter":
            return EmailDrafterAgent(
                workspace_id=self.workspace_id,
                user_id=self.user_id or "",
                db=self.db,
                model=model,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        elif agent_type == "data_enrichment":
            return DataEnrichmentAgent(
                workspace_id=self.workspace_id,
                db=self.db,
                model=model,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        else:
            # Build custom agent
            return CustomAgent(
                agent_name=name,
                agent_goal=goal or f"Execute the task for {name}",
                agent_prompt=system_prompt or self._default_custom_prompt(name),
                tool_names=tools or [],
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                db=self.db,
                model=model,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )

    def _default_custom_prompt(self, name: str) -> str:
        return f"""You are a helpful AI assistant named {name}.

Your job is to help complete tasks using the available tools. Always:
1. Understand the task clearly before acting
2. Use tools efficiently to gather information and take actions
3. Provide clear summaries of what you did and the results
4. Ask clarifying questions if the task is ambiguous

Be thorough but efficient in your approach.
"""

    @staticmethod
    def get_available_tools() -> list[dict]:
        """Get list of all available tools with descriptions."""
        tools = []
        for name, tool_class in TOOL_REGISTRY.items():
            tools.append({
                "name": name,
                "description": tool_class.description if hasattr(tool_class, "description") else "",
                "category": AgentBuilder._categorize_tool(name),
            })
        return tools

    @staticmethod
    def _categorize_tool(name: str) -> str:
        """Categorize a tool by its name."""
        if name in ["search_contacts", "get_record", "update_record", "create_record", "get_activities"]:
            return "crm"
        elif name in ["send_email", "create_draft", "get_email_history", "get_writing_style"]:
            return "email"
        elif name in ["enrich_company", "enrich_person", "web_search"]:
            return "enrichment"
        elif name in ["send_slack", "send_sms"]:
            return "communication"
        return "other"
