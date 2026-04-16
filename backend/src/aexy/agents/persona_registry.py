"""Registry mapping persona names to agent classes."""

from typing import Any

from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent


PERSONA_REGISTRY: dict[str, type[BaseAgent]] = {}


def _load_registry() -> dict[str, type[BaseAgent]]:
    """Lazy-load persona registry to avoid circular imports."""
    if PERSONA_REGISTRY:
        return PERSONA_REGISTRY

    from aexy.agents.personas.researcher import ResearcherAgent
    from aexy.agents.personas.analyst import AnalystAgent
    from aexy.agents.personas.writer import WriterAgent

    PERSONA_REGISTRY.update({
        "researcher": ResearcherAgent,
        "analyst": AnalystAgent,
        "writer": WriterAgent,
    })
    return PERSONA_REGISTRY


def get_persona_agent(
    persona: str,
    workspace_id: str,
    agent_workspace_id: str | None = None,
    db: Any = None,
    workspace_tools: list[BaseTool] | None = None,
    model: str | None = None,
    llm_provider: str = "claude",
    **kwargs,
) -> BaseAgent:
    """Create a persona agent instance.

    Args:
        persona: Persona name (researcher, analyst, writer).
        workspace_id: Aexy workspace ID.
        agent_workspace_id: Agent workspace ID for block operations.
        db: Database session.
        workspace_tools: Additional tools for workspace block manipulation.
        model: Model override.
        llm_provider: LLM provider (claude or gemini).

    Returns:
        Configured agent instance.

    Raises:
        ValueError: If persona not found.
    """
    registry = _load_registry()
    agent_class = registry.get(persona)
    if not agent_class:
        raise ValueError(
            f"Unknown persona '{persona}'. Available: {list(registry.keys())}"
        )

    return agent_class(
        workspace_id=workspace_id,
        agent_workspace_id=agent_workspace_id,
        db=db,
        workspace_tools=workspace_tools,
        model=model,
        llm_provider=llm_provider,
        **kwargs,
    )


def list_personas() -> list[dict[str, str]]:
    """List available personas with descriptions."""
    registry = _load_registry()
    return [
        {"name": name, "description": cls.description}
        for name, cls in registry.items()
    ]
