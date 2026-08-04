"""Workspace AI settings API — the org-wide kill switch and BYO provider keys.

Reading is open to any workspace member: whether AI is on, and whose provider is
serving the workspace, is something every member should be able to see (it is
about their data). The credential itself is never returned to anyone — only
``key_hint``. Writing is owner/admin and Pro/Enterprise only.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.workspace_ai_settings import (
    AIConnectionTestResult,
    AISettingsResponse,
    AISettingsUpdate,
)
from aexy.services.workspace_ai_settings_service import WorkspaceAISettingsService

router = APIRouter(prefix="/workspaces/{workspace_id}/ai-settings", tags=["AI Settings"])


@router.get("", response_model=AISettingsResponse)
async def get_ai_settings(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    return await WorkspaceAISettingsService(db).get(workspace_id, str(current.id))


@router.patch("", response_model=AISettingsResponse)
async def update_ai_settings(
    workspace_id: str,
    data: AISettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Owner/admin only, Pro/Enterprise only — enforced in the service.

    Authorization lives in the service rather than in a dependency because the
    same rules apply to the connection test, and because the 402 needs to be
    distinguishable from the 403 by the page (upgrade prompt vs. "ask an admin").
    """
    return await WorkspaceAISettingsService(db).update(workspace_id, data, str(current.id))


@router.post("/test", response_model=AIConnectionTestResult, status_code=status.HTTP_200_OK)
async def test_ai_connection(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """Probe the workspace's own provider with a one-token prompt.

    Returns 200 with ``ok: false`` on a provider-side failure rather than an
    error status: a wrong key is a normal, expected answer to this question, and
    the page needs the provider's message to tell the admin what to fix.
    """
    return await WorkspaceAISettingsService(db).test_connection(workspace_id, str(current.id))
