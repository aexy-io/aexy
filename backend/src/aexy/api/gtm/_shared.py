"""Shared utilities for GTM API sub-modules."""

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.workspace_service import WorkspaceService


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this workspace",
        )


_providers_registered = False

def _ensure_providers_registered():
    """Import all provider modules to trigger registration."""
    global _providers_registered
    if _providers_registered:
        return
    import aexy.integrations.providers.visitor_identification  # noqa: F401
    import aexy.integrations.providers.email_verification  # noqa: F401
    import aexy.integrations.providers.contact_enrichment  # noqa: F401
    import aexy.integrations.providers.linkedin_automation  # noqa: F401
    import aexy.integrations.providers.sms_provider  # noqa: F401
    import aexy.integrations.providers.generic_providers  # noqa: F401
    _providers_registered = True
