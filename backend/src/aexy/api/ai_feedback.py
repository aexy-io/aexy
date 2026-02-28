"""AI Feedback API endpoints — user-facing feedback on AI outputs."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.ai_feedback import AIFeedbackCreate, AIFeedbackResponse
from aexy.services.ai_feedback_service import AIFeedbackService
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/ai-feedback")


async def _check_workspace(db: AsyncSession, workspace_id: str, developer_id: str):
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, developer_id, "member"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.post("/", response_model=AIFeedbackResponse, status_code=201)
async def submit_feedback(
    workspace_id: str,
    data: AIFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Submit or update feedback on an AI entity (upsert)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AIFeedbackService(db)
    feedback = await service.submit_feedback(
        workspace_id, str(current_developer.id), data
    )
    await db.commit()
    return feedback


@router.get("/{entity_type}/{entity_id}", response_model=AIFeedbackResponse | None)
async def get_feedback(
    workspace_id: str,
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get the current user's feedback on a specific entity."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AIFeedbackService(db)
    feedback = await service.get_feedback(
        entity_type, entity_id, str(current_developer.id)
    )
    return feedback


@router.delete("/{feedback_id}", status_code=204)
async def delete_feedback(
    workspace_id: str,
    feedback_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete feedback by ID (only the owner can delete)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AIFeedbackService(db)
    deleted = await service.delete_feedback(feedback_id, str(current_developer.id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Feedback not found")
    await db.commit()
