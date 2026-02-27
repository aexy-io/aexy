"""Entity → frontend route mapping for activity feed URLs."""


# ── Entity → frontend route mapping ──

_ENTITY_ROUTES: dict[str, str] = {
    "task": "/sprints?task={id}",
    "story": "/sprints?story={id}",
    "epic": "/sprints?tab=epics&epic={id}",
    "bug": "/sprints",
    "goal": "/reviews/goals",
    "backlog": "/sprints?tab=backlog",
    "release": "/sprints",
    "roadmap": "/sprints",
    "ticket": "/tickets/{id}",
    "crm_record": "/crm",
    "document": "/docs/{id}",
    "assessment": "/hiring/assessments/{id}/edit",
    "compliance": "/compliance/documents/{id}",
    "project": "/settings/projects/{id}",
    "sprint": "/sprints?sprint={id}",
    "workflow": "/automations/{id}",
    "agent": "/agents/{id}",
    "template": "/email-marketing/templates/{id}",
    "campaign": "/email-marketing/campaigns/{id}",
    "form": "/forms/{id}",
    "leave_request": "/leave",
    "review": "/reviews/cycles/{id}",
    "role": "/settings/organization/roles",
}


def get_entity_url(entity_type: str, entity_id: str) -> str:
    """Return the frontend route for a given entity type and ID."""
    pattern = _ENTITY_ROUTES.get(entity_type)
    if not pattern:
        return "#"
    return pattern.replace("{id}", entity_id)
