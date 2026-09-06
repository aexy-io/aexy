"""Agent builder for creating custom agents from configuration."""

from typing import Any

from aexy.agents.base import BaseAgent


class CustomAgent(BaseAgent):
    """Dynamically configured custom agent."""

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
    def unresolved_tool_names(self) -> list[str]:
        """Every configured name is a catalogue name; there is no other registry."""
        return list(self._tool_names)

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
        llm_provider: str = "claude",
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
                llm_provider=llm_provider,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        elif agent_type == "lead_scoring":
            return LeadScoringAgent(
                workspace_id=self.workspace_id,
                db=self.db,
                model=model,
                llm_provider=llm_provider,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        elif agent_type == "email_drafter":
            return EmailDrafterAgent(
                workspace_id=self.workspace_id,
                user_id=self.user_id or "",
                db=self.db,
                model=model,
                llm_provider=llm_provider,
                max_iterations=max_iterations,
                timeout_seconds=timeout_seconds,
            )
        elif agent_type == "data_enrichment":
            return DataEnrichmentAgent(
                workspace_id=self.workspace_id,
                db=self.db,
                model=model,
                llm_provider=llm_provider,
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
                llm_provider=llm_provider,
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
        """Everything an agent may hold, from the one catalogue.

        The two generic tools, the named routines, and one entry per
        capability. Any bare action name typed into an agent's tool list also
        works; ~1,900 checkboxes is not a picker, so those are not listed.
        """
        from aexy.agents.tools.mcp_tools import catalog_tool_listing

        return catalog_tool_listing()
