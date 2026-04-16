"""Model selector for picking the best LLM per task type."""

import logging

logger = logging.getLogger(__name__)

MODEL_PREFERENCES: dict[str, list[str]] = {
    "research": ["claude-opus-4-6", "gemini-1.5-pro"],
    "analysis": ["claude-sonnet-4-6", "gemini-1.5-pro"],
    "writing": ["claude-opus-4-6"],
    "code": ["claude-sonnet-4-6"],
    "summarization": ["claude-haiku-4-5-20251001"],
    "planning": ["claude-opus-4-6"],
}

# Maps persona to task type
PERSONA_TASK_MAP: dict[str, str] = {
    "researcher": "research",
    "analyst": "analysis",
    "writer": "writing",
    "orchestrator": "planning",
}


def select_model(
    persona: str | None = None,
    task_type: str | None = None,
    preferred_model: str | None = None,
    config: dict | None = None,
) -> tuple[str, str]:
    """Select model and provider for a task.

    Returns:
        (model_name, provider) tuple.
    """
    # User override
    if preferred_model:
        provider = "gemini" if preferred_model.startswith("gemini") else "claude"
        return preferred_model, provider

    # Config override
    if config and config.get("model"):
        model = config["model"]
        provider = "gemini" if model.startswith("gemini") else "claude"
        return model, provider

    # Determine task type from persona
    effective_task = task_type or PERSONA_TASK_MAP.get(persona or "", "analysis")

    candidates = MODEL_PREFERENCES.get(effective_task, MODEL_PREFERENCES["analysis"])
    model = candidates[0]
    provider = "gemini" if model.startswith("gemini") else "claude"

    return model, provider
